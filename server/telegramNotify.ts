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
  referrerUid?: string;
  verifiedWatchSeconds: number;
  bonusPoints?: number;
  qualifiedAt?: string;
}

export type TelegramPointsEarnedEventType =
  | 'welcome_login'
  | 'daily_checkin'
  | 'watch_minute'
  | 'watch_milestone'
  | 'daily_social_share'
  | 'watch_episode'
  | 'referral_bind'
  | 'referral_ongoing';

export interface TelegramPointsEarnedInput {
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  eventType: TelegramPointsEarnedEventType;
  points: number;
  balanceAfter?: number | null;
  levelInfo?: TelegramWithdrawLevelInfo | null;
  streakDay?: number;
  milestoneMinutes?: number;
  channel?: string;
  provider?: string;
  dramaId?: string;
  dramaTitle?: string;
  episodeNumber?: number;
  todayWatchSeconds?: number;
  verifiedWatchSeconds?: number;
  referralCode?: string;
  refereeUid?: string;
  refereeDisplayName?: string;
  ongoingStep?: number;
  occurredAt?: string;
  maskEmail?: boolean;
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
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
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
const DEFAULT_MIN_SEND_INTERVAL_MS = 1_100;
const TELEGRAM_FETCH_TIMEOUT_MS = 10_000;
const MAX_QUEUE_SIZE = 120;
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_RETRY_BASE_MS = 650;
const MISSING_ENV_WARN_COOLDOWN_MS = 10 * 60_000;

interface QueuedTelegramTask {
  contextTag: string;
  minIntervalMs: number;
  run: () => Promise<TelegramSendResult>;
  resolve: (result: TelegramSendResult) => void;
}

const telegramCooldownMap = new Map<string, number>();
const telegramSendQueue: QueuedTelegramTask[] = [];
let telegramQueueRunning = false;
let lastTelegramSendFinishedAt = 0;
let nextAllowedSendAt = 0;
let lastMissingEnvWarnAt = 0;

export function clearTelegramThrottleCacheForTests(): void {
  telegramCooldownMap.clear();
  telegramSendQueue.length = 0;
  telegramQueueRunning = false;
  lastTelegramSendFinishedAt = 0;
  nextAllowedSendAt = 0;
  lastMissingEnvWarnAt = 0;
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (text.length > 420) {
    text = `${text.slice(0, 417)}...`;
  }
  return text;
}

function formatTelegramNetworkErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) {
    return sanitizeTelegramErrorText(err);
  }
  const errWithProps = err as Error & { code?: unknown; cause?: unknown };
  const parts: string[] = [`${err.name}: ${err.message}`];
  if (errWithProps.code) {
    parts.push(`code=${String(errWithProps.code)}`);
  }
  if (errWithProps.cause !== undefined && errWithProps.cause !== null) {
    const cause = errWithProps.cause;
    if (cause instanceof Error) {
      const causeWithProps = cause as Error & {
        code?: unknown;
        errno?: unknown;
        syscall?: unknown;
        address?: unknown;
        port?: unknown;
      };
      const causeBits = [
        `${cause.name}: ${cause.message}`,
        causeWithProps.code ? `code=${String(causeWithProps.code)}` : '',
        causeWithProps.syscall ? `syscall=${String(causeWithProps.syscall)}` : '',
        causeWithProps.address ? `addr=${String(causeWithProps.address)}` : '',
        causeWithProps.port ? `port=${String(causeWithProps.port)}` : '',
      ].filter(Boolean);
      parts.push(`cause=(${causeBits.join(' ')})`);
    } else if (typeof cause === 'object') {
      try {
        parts.push(`cause=${JSON.stringify(cause)}`);
      } catch {
        parts.push(`cause=${String(cause)}`);
      }
    } else {
      parts.push(`cause=${String(cause)}`);
    }
  }
  return sanitizeTelegramErrorText(parts.join(' | '));
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

  return false;
}

async function drainTelegramQueue(): Promise<void> {
  if (telegramQueueRunning) return;
  telegramQueueRunning = true;
  try {
    while (telegramSendQueue.length > 0) {
      const task = telegramSendQueue.shift();
      if (!task) continue;

      const now = Date.now();
      const targetAt = Math.max(
        lastTelegramSendFinishedAt > 0 ? lastTelegramSendFinishedAt + task.minIntervalMs : 0,
        nextAllowedSendAt
      );
      if (targetAt > now) {
        await sleepMs(targetAt - now);
      }

      let result: TelegramSendResult;
      try {
        result = await task.run();
      } catch (err) {
        console.error(
          `[Telegram] Unexpected queue error on ${task.contextTag}:`,
          sanitizeTelegramErrorText(err instanceof Error ? `${err.name}: ${err.message}` : err)
        );
        result = { sent: false };
      } finally {
        lastTelegramSendFinishedAt = Date.now();
      }

      task.resolve(result);
    }
  } finally {
    telegramQueueRunning = false;
    if (telegramSendQueue.length > 0) {
      void drainTelegramQueue();
    }
  }
}

function enqueueTelegramSend(
  contextTag: string,
  minIntervalMs: number,
  run: () => Promise<TelegramSendResult>
): Promise<TelegramSendResult> {
  if (telegramSendQueue.length >= MAX_QUEUE_SIZE) {
    console.error(
      `[Telegram] Queue full (${MAX_QUEUE_SIZE} pending), dropping ${contextTag}`
    );
    return Promise.resolve({ sent: false, skipped: true, throttled: true });
  }
  return new Promise<TelegramSendResult>((resolve) => {
    telegramSendQueue.push({ contextTag, minIntervalMs, run, resolve });
    void drainTelegramQueue();
  });
}

async function parseRetryAfterMs(res: Response, bodyText: string, isCustomFetch: boolean): Promise<number> {
  let retryAfterSec = 0;
  try {
    const parsed = JSON.parse(bodyText) as { parameters?: { retry_after?: number } };
    const paramSec = Number(parsed?.parameters?.retry_after);
    if (Number.isFinite(paramSec) && paramSec > 0) {
      retryAfterSec = paramSec;
    }
  } catch {
    // Ignore non-JSON response body
  }
  if (retryAfterSec <= 0) {
    const headerVal = Number(res.headers.get('retry-after'));
    if (Number.isFinite(headerVal) && headerVal > 0) {
      retryAfterSec = headerVal;
    }
  }
  const boundedSec = Math.max(1, Math.min(isCustomFetch ? 2 : 15, Math.ceil(retryAfterSec || 2)));
  return boundedSec * 1000;
}

async function sendTelegramGroupMessage(
  text: string,
  contextTag: string,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const token = getTelegramBotToken();
  const chatId = getTelegramAdminChatId();
  if (!token || !chatId) {
    const now = Date.now();
    if (now - lastMissingEnvWarnAt >= MISSING_ENV_WARN_COOLDOWN_MS) {
      lastMissingEnvWarnAt = now;
      console.warn(
        `[Telegram] Notification skipped for ${contextTag}: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID/TELEGRAM_CHAT_ID is empty`
      );
    }
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

  const isCustomFetch = Boolean(options?.fetchImpl);
  const minIntervalMs = Math.max(
    0,
    Number.isFinite(Number(options?.minIntervalMs))
      ? Number(options?.minIntervalMs)
      : DEFAULT_MIN_SEND_INTERVAL_MS
  );
  const timeoutMs = Math.max(
    1_000,
    Number.isFinite(Number(options?.timeoutMs))
      ? Number(options?.timeoutMs)
      : TELEGRAM_FETCH_TIMEOUT_MS
  );
  const maxRetries = Math.max(
    0,
    Math.min(
      3,
      Number.isFinite(Number(options?.maxRetries))
        ? Math.floor(Number(options?.maxRetries))
        : MAX_TRANSIENT_RETRIES
    )
  );
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const payloadBody = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  const getTransientWaitMs = (attempt: number): number => {
    if (Number.isFinite(Number(options?.retryDelayMs))) {
      return Math.max(0, Number(options?.retryDelayMs));
    }
    const base = isCustomFetch ? 80 : TRANSIENT_RETRY_BASE_MS;
    return base * (attempt + 1);
  };

  return enqueueTelegramSend(contextTag, minIntervalMs, async () => {
    let lastStatusCode: number | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const res = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payloadBody,
          signal: AbortSignal.timeout(timeoutMs),
        });
        lastStatusCode = res.status;

        let rawBody = '';
        try {
          rawBody = await res.text();
        } catch {
          rawBody = '';
        }

        if (res.status === 429) {
          if (attempt < maxRetries) {
            const waitMs = await parseRetryAfterMs(res, rawBody, isCustomFetch);
            nextAllowedSendAt = Date.now() + waitMs;
            console.error(
              `[Telegram] Rate limited (HTTP 429) on ${contextTag} -> chat=${chatId}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await sleepMs(waitMs);
            continue;
          }
          const detail = sanitizeTelegramErrorText(rawBody || res.statusText || 'HTTP 429');
          console.error(
            `[Telegram] Failed ${contextTag} -> chat=${chatId} (HTTP 429) after ${attempt + 1} attempt(s): ${detail}`
          );
          return { sent: false, statusCode: 429 };
        }

        if (res.status >= 500 && res.status <= 599) {
          const detail = sanitizeTelegramErrorText(rawBody || res.statusText || `HTTP ${res.status}`);
          if (attempt < maxRetries) {
            const waitMs = getTransientWaitMs(attempt);
            console.error(
              `[Telegram] Transient HTTP ${res.status} on ${contextTag} -> chat=${chatId}: ${detail}; retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await sleepMs(waitMs);
            continue;
          }
          console.error(
            `[Telegram] Failed ${contextTag} -> chat=${chatId} (HTTP ${res.status}) after ${attempt + 1} attempt(s): ${detail}`
          );
          return { sent: false, statusCode: res.status };
        }

        if (!res.ok) {
          const detail = sanitizeTelegramErrorText(rawBody || res.statusText || `HTTP ${res.status}`);
          console.error(
            `[Telegram] Failed ${contextTag} -> chat=${chatId} (HTTP ${res.status}): ${detail}`
          );
          return { sent: false, statusCode: res.status };
        }

        let messageId: number | string | undefined;
        try {
          const parsed = JSON.parse(rawBody) as { ok?: boolean; result?: { message_id?: number } };
          if (parsed?.ok === false) {
            const detail = sanitizeTelegramErrorText(rawBody);
            console.error(
              `[Telegram] API rejected ${contextTag} -> chat=${chatId}: ${detail}`
            );
            return { sent: false, statusCode: res.status };
          }
          messageId = parsed?.result?.message_id;
        } catch {
          // Allow minimal 200 OK JSON or empty test responses
        }

        console.log(
          `[Telegram] Sent ${contextTag} -> chat=${chatId} (HTTP ${res.status}${messageId ? `, message_id=${messageId}` : ''})`
        );
        return { sent: true, statusCode: res.status };
      } catch (err) {
        const detail = formatTelegramNetworkErrorDetail(err);
        if (attempt < maxRetries) {
          const waitMs = getTransientWaitMs(attempt);
          console.error(
            `[Telegram] Network error on ${contextTag} -> chat=${chatId}: ${detail}; retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleepMs(waitMs);
          continue;
        }
        console.error(
          `[Telegram] Error sending ${contextTag} -> chat=${chatId} after ${attempt + 1} attempt(s): ${detail}`
        );
        return { sent: false, statusCode: lastStatusCode };
      }
    }
    return { sent: false, statusCode: lastStatusCode };
  });
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
  ];

  if (input.referrerUid) {
    lines.push(`• <b>Referrer ID:</b> <code>${escapeTelegramHtml(input.referrerUid)}</code>`);
  }

  lines.push(
    `• <b>Referee ID:</b> <code>${escapeTelegramHtml(input.refereeUid)}</code>`,
    `• <b>Nama Referee:</b> ${escapeTelegramHtml(displayName)}`,
    `• <b>Nonton Aktif:</b> ${escapeTelegramHtml(watchSeconds.toLocaleString('id-ID'))} detik (${watchMinutes} menit)`,
    `• <b>Bonus Referrer:</b> +${escapeTelegramHtml(bonusPoints.toLocaleString('id-ID'))} poin`,
    `• <b>Waktu Valid:</b> ${escapeTelegramHtml(formatWibDateTime(input.qualifiedAt))}`
  );

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

const POINTS_EARNED_TITLES: Record<TelegramPointsEarnedEventType, string> = {
  welcome_login: 'Bonus Login Pertama',
  daily_checkin: 'Check-in Harian',
  watch_minute: 'Poin Nonton Aktif',
  watch_milestone: 'Milestone Nonton Aktif',
  daily_social_share: 'Tugas Harian Share Sosmed',
  watch_episode: 'Bonus Selesai Episode',
  referral_bind: 'Bonus Bind Kode Referral',
  referral_ongoing: 'Bonus Lanjutan Referral Valid',
};

const SHARE_CHANNEL_DISPLAY: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  copy_link: 'Copy Link',
  native_share: 'Native Share',
};

export function formatTelegramPointsEarnedMessage(
  input: TelegramPointsEarnedInput
): string {
  const title = POINTS_EARNED_TITLES[input.eventType] || 'Aktivitas Earning Poin';
  const displayName = (input.userDisplayName || 'Kano Viewer').trim();
  const shouldMask = input.maskEmail !== false;
  const emailDisplay = input.userEmail
    ? shouldMask
      ? maskTelegramEmail(input.userEmail)
      : input.userEmail.trim()
    : '';
  const points = Math.max(0, Math.round(Number(input.points) || 0));

  const lines = [
    `<b>KanoDrama — ${escapeTelegramHtml(title)}</b>`,
    '',
    `• <b>User ID:</b> <code>${escapeTelegramHtml(input.userId)}</code>`,
    `• <b>Nama:</b> ${escapeTelegramHtml(displayName)}`,
  ];

  if (emailDisplay) {
    lines.push(`• <b>Email:</b> <code>${escapeTelegramHtml(emailDisplay)}</code>`);
  }

  lines.push(`• <b>Poin Masuk:</b> +${escapeTelegramHtml(points.toLocaleString('id-ID'))} poin`);

  if (typeof input.balanceAfter === 'number' && Number.isFinite(input.balanceAfter)) {
    lines.push(
      `• <b>Saldo Setelah:</b> ${escapeTelegramHtml(Math.max(0, Math.round(input.balanceAfter)).toLocaleString('id-ID'))} poin`
    );
  }

  if (input.levelInfo) {
    const level = Math.max(1, Number(input.levelInfo.level) || 1);
    const tierName = (input.levelInfo.tierName || 'Bronze').trim();
    const multiplier = Number(input.levelInfo.multiplier) || 1;
    lines.push(
      `• <b>Level Akun:</b> ${escapeTelegramHtml(`Lv.${level} ${tierName} (${multiplier}x)`)}`
    );
  }

  if (input.eventType === 'daily_checkin' && input.streakDay) {
    const cycleDay = ((Math.max(1, input.streakDay) - 1) % 7) + 1;
    lines.push(
      `• <b>Streak Check-in:</b> Hari ke-${escapeTelegramHtml(input.streakDay)} (Siklus H-${escapeTelegramHtml(cycleDay)}/7)`
    );
  } else if (input.eventType === 'watch_milestone' && input.milestoneMinutes) {
    lines.push(
      `• <b>Target Milestone:</b> ${escapeTelegramHtml(input.milestoneMinutes)} menit nonton aktif`
    );
  } else if (input.eventType === 'daily_social_share' && input.channel) {
    const channelLabel = SHARE_CHANNEL_DISPLAY[input.channel.toLowerCase()] || input.channel;
    lines.push(`• <b>Kanal Share:</b> ${escapeTelegramHtml(channelLabel)}`);
  } else if (input.eventType === 'watch_episode') {
    const mediaLabel = input.dramaTitle
      ? `${input.dramaTitle} (${input.provider || 'DramaBoxV2'} Ep ${input.episodeNumber || 1})`
      : `${input.provider || 'DramaBoxV2'} ${input.dramaId || ''} Ep ${input.episodeNumber || 1}`.trim();
    lines.push(`• <b>Episode:</b> ${escapeTelegramHtml(mediaLabel)}`);
  } else if (input.eventType === 'watch_minute') {
    if (input.provider || input.dramaId) {
      const mediaLabel = `${input.provider || 'DramaBoxV2'} ${input.dramaId || ''} Ep ${input.episodeNumber || 1}`.trim();
      lines.push(`• <b>Tayangan:</b> ${escapeTelegramHtml(mediaLabel)}`);
    }
    if (typeof input.todayWatchSeconds === 'number') {
      const mins = Math.floor(Math.max(0, input.todayWatchSeconds) / 60);
      lines.push(
        `• <b>Nonton Hari Ini:</b> ${escapeTelegramHtml(mins)} menit (${escapeTelegramHtml(Math.max(0, Math.floor(input.todayWatchSeconds)).toLocaleString('id-ID'))} detik)`
      );
    }
  } else if (input.eventType === 'referral_bind' && input.referralCode) {
    lines.push(
      `• <b>Kode Referral:</b> <code>${escapeTelegramHtml(input.referralCode.trim().toUpperCase())}</code>`
    );
  } else if (input.eventType === 'referral_ongoing') {
    if (input.refereeUid) {
      const refName = (input.refereeDisplayName || 'Kano Viewer').trim();
      lines.push(
        `• <b>Referee:</b> <code>${escapeTelegramHtml(input.refereeUid)}</code> (${escapeTelegramHtml(refName)})`
      );
    }
    if (input.ongoingStep) {
      lines.push(`• <b>Tahap Bonus:</b> Tahap ke-${escapeTelegramHtml(input.ongoingStep)}`);
    }
    if (typeof input.verifiedWatchSeconds === 'number') {
      const watchMin = Math.max(1, Math.round(input.verifiedWatchSeconds / 60));
      lines.push(
        `• <b>Total Nonton Referee:</b> ${escapeTelegramHtml(Math.floor(input.verifiedWatchSeconds).toLocaleString('id-ID'))} detik (${watchMin} menit)`
      );
    }
  }

  lines.push(`• <b>Waktu:</b> ${escapeTelegramHtml(formatWibDateTime(input.occurredAt))}`);

  return lines.join('\n');
}

export async function notifyAdminTelegramPointsEarned(
  input: TelegramPointsEarnedInput,
  options?: TelegramSendOptions
): Promise<TelegramSendResult> {
  const uid = String(input.userId || '').trim();
  const points = Math.max(0, Math.round(Number(input.points) || 0));
  if (!uid || points <= 0) {
    return { sent: false, skipped: true };
  }
  const text = formatTelegramPointsEarnedMessage(input);
  const contextTag = `PointsEarned(${input.eventType}:${uid}:+${points})`;
  return sendTelegramGroupMessage(text, contextTag, options);
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
