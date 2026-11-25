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

function escapeTelegramHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  options?: { fetchImpl?: typeof fetch }
): Promise<{ sent: boolean; skipped?: boolean; statusCode?: number }> {
  const token = getTelegramBotToken();
  const chatId = getTelegramAdminChatId();
  if (!token || !chatId) {
    return { sent: false, skipped: true };
  }

  const fetchFn = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { sent: false, skipped: true };
  }

  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const text = formatTelegramWithdrawMessage(input);

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
      console.warn(
        `[Telegram] Withdraw notification returned HTTP ${res.status} for payout ${input.payout.id}`
      );
      return { sent: false, statusCode: res.status };
    }

    return { sent: true, statusCode: res.status };
  } catch (err) {
    console.warn(
      `[Telegram] Withdraw notification failed for payout ${input.payout.id}:`,
      err instanceof Error ? err.name : 'UnknownError'
    );
    return { sent: false };
  }
}
