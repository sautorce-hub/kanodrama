import { getTelegramAdminChatId, getTelegramBotToken } from './config.ts';
import { getMethodMetadata, type PayoutRequestRecord } from './db.ts';

export interface TelegramWithdrawLevelInfo {
  level?: number;
  tierName?: string;
  multiplier?: number;
}

export interface TelegramWithdrawNotificationInput {
  payout: PayoutRequestRecord;
  destinationAccountRaw?: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  levelInfo?: TelegramWithdrawLevelInfo | null;
}

export interface TelegramNewUserNotificationInput {
  userId: string;
  email?: string;
  displayName?: string;
  authMethod: 'Google' | 'Email';
  referralCodeApplied?: string;
  referralBound?: boolean;
  referralBindReason?: string;
  bindBonusAwarded?: number;
  firstLoginBonusAwarded?: number;
  createdAt?: string;
  maskEmail?: boolean;
}

export interface TelegramReferralQualifiedInput {
  refereeUid: string;
  refereeDisplayName?: string;
  verifiedWatchSeconds: number;
  bonusPoints?: number;
  qualifiedAt?: string;
}

export interface TelegramCriticalErrorInput {
  scope: string;
  message: string;
  statusCode?: number;
  path?: string;
  occurredAt?: string;
}

export interface TelegramSendOptions {
  fetchImpl?: typeof fetch;
  throttleKey?: string;
  throttleMs?: number;
  bypassThrottle?: boolean;
}

export interface TelegramSendResult {
  sent: boolean;
  skipped?: boolean;
  throttled?: boolean;
  statusCode?: number;
}

const DEFAULT_ERROR_THROTTLE_MS = 5 * 60_000;
const DEFAULT_EVENT_DEDUP_MS = 24 * 60 * 60_000;
const DEFAULT_WITHDRAW_DEDUP_MS = 60_000;
const GLOBAL_BURST_WINDOW_MS = 60_000;
const GLOBAL_BURST_MAX_MESSAGES = 25;

const telegramCooldownMap = new Map<string, number>();
let globalRecentSends: number[] = [];

export function clearTelegramThrottleCacheForTests(): void {
  telegramCooldownMap.clear();
  globalRecentSends = [];
}

function escapeTelegramHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function maskTelegramEmail(rawEmail?: string): string {
  const email = (rawEmail || '').trim();
  if (!email) return '-';
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    if (email.length <= 2) return `${email[0] || '*'}***`;
    return `${email.slice(0, 2)}***`;
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!domain) return `${local.slice(0, 1)}***`;
  const visiblePrefix = local.length >= 3 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visiblePrefix}***@${domain}`;
}

function sanitizeTelegramErrorText(raw: unknown): string {
  let text = String(raw ?? '')
    .replace(/bot\d+:[A-Za-z0-9_-]{10,}/gi, 'bot[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) text = 'Unknown server error';
  if (text.length > 260) {
    text = `${text.slice(0, 257)}...`;
  }
  return text;
}

function formatWibDateTime(isoOrDate?: string): string {
  const parsed = isoOrDate ? new Date(isoOrDate) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  try {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
    return `${formatted} WIB (${date.toISOString()})`;
  } catch {
    return date.toISOString();
  }
}

function shouldThrottleTelegramEvent(
  throttleKey?: string,
  throttleMs = 0,
  bypassThrottle = false
): boolean {
  if (bypassThrottle) return false;
  const now = Date.now();

  if (throttleKey && throttleMs > 0) {
    const expiresAt = telegramCooldownMap.get(throttleKey) ?? 0;
    if (expiresAt > now) {
      return true;
    }
    telegramCooldownMap.set(throttleKey, now + throttleMs);
    if (telegramCooldownMap.size > 1000) {
      for (const [k, exp] of telegramCooldownMap.entries()) {
        if (exp <= now) telegramCooldownMap.delete(k);
      }
      if (telegramCooldownMap.size > 1000) {
        const firstKey = telegramCooldownMap.keys().next().value;
        if (firstKey) telegramCooldownMap.delete(firstKey);
      }
    }
  }

  const cutoff = now - GLOBAL_BURST_WINDOW_MS;
  globalRecentSends = globalRecentSends.filter((ts) => ts > cutoff);
  if (globalRecentSends.length >= GLOBAL_BURST_MAX_MESSAGES) {
    return true;
  }
  globalRecentSends.push(now);
  return false;
}

async function sendTelegramGroupMessage(
  text: string,
  contextTag: string,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const token = getTelegramBotToken();
  const chatId = getTelegramAdminChatId();
  if (!token || !chatId) {
    return { sent: false, skipped: true };
  }

  const fetchFn = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { sent: false, skipped: true };
  }

  if (
    shouldThrottleTelegramEvent(
      options?.throttleKey,
      options?.throttleMs,
      options?.bypassThrottle
    )
  ) {
    return { sent: false, skipped: true, throttled: true };
  }

  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;

  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[Telegram] ${contextTag} returned HTTP ${res.status}`);
      return { sent: false, statusCode: res.status };
    }

    return { sent: true, statusCode: res.status };
  } catch (err) {
    console.warn(
      `[Telegram] ${contextTag} failed:`,
      err instanceof Error ? err.name : 'UnknownError'
    );
    return { sent: false };
  }
}

export function formatTelegramWithdrawMessage(
  input: TelegramWithdrawNotificationInput
): string {
  const { payout } = input;
  const methodMeta = getMethodMetadata(payout.method, payout.bankCode);
  const methodParts = [methodMeta.label];
  if (payout.method === 'bank_transfer' && payout.bankCode) {
    methodParts.push(payout.bankCode);
  } else if (payout.network) {
    methodParts.push(payout.network);
  }
  const methodDisplay = methodParts.join(' · ');

  const displayName = (input.userDisplayName || payout.accountHolderName || 'Kano Viewer').trim();
  const userEmail = (input.userEmail || '').trim() || '-';
  const level = Math.max(1, Number(input.levelInfo?.level) || 1);
  const tierName = (input.levelInfo?.tierName || 'Bronze').trim();
  const multiplier = Number(input.levelInfo?.multiplier) || 1;
  const levelLabel = `Lv.${level} ${tierName} (${multiplier}x)`;

  const pointsText = `${Math.max(0, Number(payout.pointsSpent) || 0).toLocaleString('id-ID')} poin`;
  const idrText = `Rp ${Math.max(0, Math.round(Number(payout.idrAmount) || 0)).toLocaleString('id-ID')}`;
  const usdText = `$${Number(payout.usdAmount || 0).toFixed(2)} USD`;
  const nominalDisplay =
    payout.currency === 'USD'
      ? `${usdText} (est. ${idrText})`
      : `${idrText} (est. ${usdText})`;

  const destinationDisplay = (
    input.destinationAccountRaw ||
    payout.destinationAccount ||
    payout.destinationMasked ||
    '-'
  ).trim();

  const lines = [
    '<b>KanoDrama — Pengajuan Withdraw Baru</b>',
    '',
    `• <b>ID Payout:</b> <code>${escapeTelegramHtml(payout.id)}</code>`,
    `• <b>Status:</b> <code>${escapeTelegramHtml(payout.status || 'pending')}</code>`,
    `• <b>User ID:</b> <code>${escapeTelegramHtml(input.userId || payout.userId)}</code>`,
    `• <b>Nama Pengguna:</b> ${escapeTelegramHtml(displayName)}`,
    `• <b>Email:</b> ${escapeTelegramHtml(userEmail)}`,
    `• <b>Level Akun:</b> ${escapeTelegramHtml(levelLabel)}`,
    '',
    `• <b>Poin Terpotong:</b> ${escapeTelegramHtml(pointsText)}`,
    `• <b>Nominal Penarikan:</b> <b>${escapeTelegramHtml(nominalDisplay)}</b>`,
    `• <b>Metode:</b> ${escapeTelegramHtml(methodDisplay)}`,
    `• <b>Tujuan:</b> <code>${escapeTelegramHtml(destinationDisplay)}</code>`,
    `• <b>Nama Penerima:</b> ${escapeTelegramHtml(payout.accountHolderName || displayName)}`,
    `• <b>Waktu Pengajuan:</b> ${escapeTelegramHtml(formatWibDateTime(payout.createdAt))}`,
  ];

  if (payout.riskFlag) {
    lines.push(
      '',
      `⚠️ <b>Risk Flag:</b> <code>${escapeTelegramHtml(payout.riskFlag)}</code>`
    );
    if (payout.suspiciousReason) {
      lines.push(
        `• <b>Catatan Sistem:</b> ${escapeTelegramHtml(payout.suspiciousReason)}`
      );
    }
  }

  return lines.join('\n');
}

export async function notifyAdminTelegramNewWithdrawal(
  input: TelegramWithdrawNotificationInput,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const text = formatTelegramWithdrawMessage(input);
  const payoutId = String(input.payout.id || '').trim();
  return sendTelegramGroupMessage(text, `Withdraw(${payoutId || 'unknown'})`, {
    ...options,
    throttleKey: options?.throttleKey ?? (payoutId ? `withdraw:${payoutId}` : undefined),
    throttleMs: options?.throttleMs ?? DEFAULT_WITHDRAW_DEDUP_MS,
  });
}

export function formatTelegramNewUserMessage(
  input: TelegramNewUserNotificationInput
): string {
  const displayName = (input.displayName || 'Kano Viewer').trim();
  const shouldMask = input.maskEmail !== false;
  const emailDisplay = shouldMask
    ? maskTelegramEmail(input.email)
    : (input.email || '').trim() || '-';

  const cleanRefCode = (input.referralCodeApplied || '').trim();
  const bindBonus = Math.max(0, Math.round(Number(input.bindBonusAwarded) || 0));
  const firstBonus = Math.max(0, Math.round(Number(input.firstLoginBonusAwarded) || 0));

  let referralStatus = 'Tanpa referral';
  if (input.referralBound) {
    const codePart = cleanRefCode ? ` (${cleanRefCode})` : '';
    const bonusPart = bindBonus > 0 ? ` · +${bindBonus.toLocaleString('id-ID')} poin` : '';
    referralStatus = `Terikat${codePart}${bonusPart}`;
  } else if (cleanRefCode) {
    const reason = (input.referralBindReason || 'tidak memenuhi syarat').trim();
    referralStatus = `Kode ${cleanRefCode} gagal (${reason})`;
  }

  const lines = [
    '<b>KanoDrama — Pendaftaran Pengguna Baru</b>',
    '',
    `• <b>Metode Login:</b> ${escapeTelegramHtml(input.authMethod)}`,
    `• <b>User ID:</b> <code>${escapeTelegramHtml(input.userId)}</code>`,
    `• <b>Nama:</b> ${escapeTelegramHtml(displayName)}`,
    `• <b>Email:</b> <code>${escapeTelegramHtml(emailDisplay)}</code>`,
    `• <b>Status Referral:</b> ${escapeTelegramHtml(referralStatus)}`,
  ];

  if (firstBonus > 0) {
    lines.push(
      `• <b>Bonus Awal:</b> +${escapeTelegramHtml(firstBonus.toLocaleString('id-ID'))} poin`
    );
  }

  lines.push(
    `• <b>Waktu Daftar:</b> ${escapeTelegramHtml(formatWibDateTime(input.createdAt))}`
  );

  return lines.join('\n');
}

export async function notifyAdminTelegramNewUser(
  input: TelegramNewUserNotificationInput,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const uid = String(input.userId || '').trim();
  if (!uid) {
    return { sent: false, skipped: true };
  }
  const text = formatTelegramNewUserMessage(input);
  return sendTelegramGroupMessage(text, `NewUser(${uid})`, {
    ...options,
    throttleKey: options?.throttleKey ?? `new_user:${uid}`,
    throttleMs: options?.throttleMs ?? DEFAULT_EVENT_DEDUP_MS,
  });
}

export function formatTelegramReferralQualifiedMessage(
  input: TelegramReferralQualifiedInput
): string {
  const displayName = (input.refereeDisplayName || 'Kano Viewer').trim();
  const watchSeconds = Math.max(0, Math.floor(Number(input.verifiedWatchSeconds) || 0));
  const watchMinutes = Math.max(1, Math.round(watchSeconds / 60));
  const bonusPoints = Math.max(0, Math.round(Number(input.bonusPoints) || 5000));

  const lines = [
    '<b>KanoDrama — Referral Valid Tercapai</b>',
    '',
    `• <b>Referee ID:</b> <code>${escapeTelegramHtml(input.refereeUid)}</code>`,
    `• <b>Nama Referee:</b> ${escapeTelegramHtml(displayName)}`,
    `• <b>Nonton Aktif:</b> ${escapeTelegramHtml(watchSeconds.toLocaleString('id-ID'))} detik (${watchMinutes} menit)`,
    `• <b>Bonus Referrer:</b> +${escapeTelegramHtml(bonusPoints.toLocaleString('id-ID'))} poin`,
    `• <b>Waktu Valid:</b> ${escapeTelegramHtml(formatWibDateTime(input.qualifiedAt))}`,
  ];

  return lines.join('\n');
}

export async function notifyAdminTelegramReferralQualified(
  input: TelegramReferralQualifiedInput,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const uid = String(input.refereeUid || '').trim();
  if (!uid) {
    return { sent: false, skipped: true };
  }
  const text = formatTelegramReferralQualifiedMessage(input);
  return sendTelegramGroupMessage(text, `ReferralQualified(${uid})`, {
    ...options,
    throttleKey: options?.throttleKey ?? `referral_qualify:${uid}`,
    throttleMs: options?.throttleMs ?? DEFAULT_EVENT_DEDUP_MS,
  });
}

export function formatTelegramCriticalErrorMessage(
  input: TelegramCriticalErrorInput
): string {
  const scope = (input.scope || 'server').trim().slice(0, 64);
  const statusCode = Math.max(400, Math.min(599, Math.floor(Number(input.statusCode) || 500)));
  const cleanMsg = sanitizeTelegramErrorText(input.message);
  const cleanPath = (input.path || '').trim().slice(0, 140);

  const lines = [
    '<b>KanoDrama — Peringatan Error Kritis</b>',
    '',
    `• <b>Komponen:</b> <code>${escapeTelegramHtml(scope)}</code>`,
    `• <b>Status HTTP:</b> <code>${statusCode}</code>`,
  ];

  if (cleanPath) {
    lines.push(`• <b>Endpoint:</b> <code>${escapeTelegramHtml(cleanPath)}</code>`);
  }

  lines.push(
    `• <b>Ringkasan:</b> <code>${escapeTelegramHtml(cleanMsg)}</code>`,
    `• <b>Waktu Kejadian:</b> ${escapeTelegramHtml(formatWibDateTime(input.occurredAt))}`
  );

  return lines.join('\n');
}

export async function notifyAdminTelegramCriticalError(
  input: TelegramCriticalErrorInput,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const scope = (input.scope || 'server').trim().slice(0, 48);
  const statusCode = Math.max(400, Math.min(599, Math.floor(Number(input.statusCode) || 500)));
  const cleanMsg = sanitizeTelegramErrorText(input.message);
  const defaultKey = `critical_error:${scope}:${statusCode}:${cleanMsg.slice(0, 48)}`;

  const text = formatTelegramCriticalErrorMessage(input);
  return sendTelegramGroupMessage(text, `CriticalError(${scope}:${statusCode})`, {
    ...options,
    throttleKey: options?.throttleKey ?? defaultKey,
    throttleMs: options?.throttleMs ?? DEFAULT_ERROR_THROTTLE_MS,
  });
}

