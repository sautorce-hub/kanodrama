import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  Send,
  MessageCircle,
  Download,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { ProviderBadge } from './ProviderBadge';
import { DEFAULT_SITE_ORIGIN } from '../i18n/helpers';
import { getDramaPath, slugifyDramaTitle } from '../utils/seo';
import type { DramaItem } from '../types/drama';

interface ShareDramaModalProps {
  open: boolean;
  drama: DramaItem | null;
  episodeNumber?: number;
  unlockVipMode?: boolean;
  onUnlockSuccess?: () => void;
  onClose: () => void;
}

export function buildDramaDeepLink(
  drama: DramaItem,
  _episodeNumber = 1
): string {
  const detailPath = getDramaPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug
  );
  return `${DEFAULT_SITE_ORIGIN}${detailPath}`;
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const attempt = (src: string, canRetryProxy: boolean) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeout = window.setTimeout(() => {
        img.src = '';
        if (canRetryProxy) {
          attempt(`/api/proxy?url=${encodeURIComponent(url)}`, false);
        } else {
          resolve(null);
        }
      }, 4500);
      img.onload = () => {
        window.clearTimeout(timeout);
        resolve(img);
      };
      img.onerror = () => {
        window.clearTimeout(timeout);
        if (canRetryProxy) {
          attempt(`/api/proxy?url=${encodeURIComponent(url)}`, false);
        } else {
          resolve(null);
        }
      };
      img.src = src;
    };
    attempt(url, !url.startsWith('data:') && !url.startsWith('/'));
  });
}

function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return startY;
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = test;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (lines.length === maxLines && current) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > 3 ? `${last.slice(0, last.length - 3)}...` : `${last}...`;
  }

  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function generateSpoilerCardPng(
  drama: DramaItem,
  episodeNumber: number
): Promise<{ dataUrl: string; blob: Blob | null }> {
  const W = 720;
  const H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: '', blob: null };
  }

  // Luxury dark crimson-obsidian background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#1B090C');
  bgGrad.addColorStop(0.5, '#090709');
  bgGrad.addColorStop(1, '#1A080C');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const [img, brandIcon] = await Promise.all([
    loadCorsImage(drama.cover),
    loadCorsImage('/assets/aistudio/file_000000005860821188dbaf696e0dbfa6_1a485403.png'),
  ]);
  if (img && img.naturalWidth > 0) {
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const dx = (W - drawW) / 2;
    const dy = (H - drawH) * 0.15;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  } else {
    const glow = ctx.createRadialGradient(W / 2, H * 0.35, 40, W / 2, H * 0.35, 420);
    glow.addColorStop(0, 'rgba(239, 68, 68, 0.32)');
    glow.addColorStop(1, 'rgba(9, 7, 9, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // Top & Bottom Dark Cinema Scrims
  const topScrim = ctx.createLinearGradient(0, 0, 0, 320);
  topScrim.addColorStop(0, 'rgba(0,0,0,0.88)');
  topScrim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 320);

  const bottomScrim = ctx.createLinearGradient(0, H * 0.42, 0, H);
  bottomScrim.addColorStop(0, 'rgba(9,7,9,0)');
  bottomScrim.addColorStop(0.45, 'rgba(9,7,9,0.86)');
  bottomScrim.addColorStop(1, 'rgba(9,7,9,0.98)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);

  // Subtle gold frame border
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 20, 20, W - 40, H - 40, 28);
  ctx.stroke();

  // Top Brand Watermark + Provider + EP Badge
  ctx.fillStyle = 'rgba(17, 17, 21, 0.9)';
  drawRoundedRect(ctx, 48, 48, 240, 46, 23);
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (brandIcon && brandIcon.naturalWidth > 0) {
    ctx.drawImage(brandIcon, 58, 55, 32, 32);
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 20px Inter, system-ui, sans-serif';
  ctx.fillText('KANODRAMA', brandIcon ? 96 : 68, 78);

  ctx.fillStyle = 'rgba(17, 17, 21, 0.85)';
  drawRoundedRect(ctx, W - 210, 48, 162, 44, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#D4AF37';
  ctx.font = '800 20px Inter, system-ui, sans-serif';
  ctx.fillText(`EP ${episodeNumber}`, W - 180, 77);

  // Provider tag
  ctx.fillStyle = '#D4AF37';
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  ctx.fillText(
    `${drama.provider.toUpperCase()} · ${drama.chapterCount} EPISODES`,
    48,
    H - 420
  );

  // Drama Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 46px Inter, system-ui, sans-serif';
  const afterTitleY = drawWrappedLines(
    ctx,
    drama.title,
    48,
    H - 355,
    W - 96,
    56,
    3
  );

  // Synopsis Quote Snippet
  const snippetSource =
    drama.description?.trim() ||
    'Watch this vertical HD drama twist unfold episode by episode exclusively on KanoDrama.';
  ctx.fillStyle = '#E4E4E7';
  ctx.font = '400 25px Inter, system-ui, sans-serif';
  drawWrappedLines(
    ctx,
    `"${snippetSource}"`,
    48,
    afterTitleY + 22,
    W - 96,
    36,
    3
  );

  // Bottom CTA Pill
  const ctaGrad = ctx.createLinearGradient(48, H - 128, W - 48, H - 128);
  ctaGrad.addColorStop(0, '#EF4444');
  ctaGrad.addColorStop(1, '#B91C1C');
  ctx.fillStyle = ctaGrad;
  drawRoundedRect(ctx, 48, H - 134, W - 96, 72, 36);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 24px Inter, system-ui, sans-serif';
  const ctaText = `▶  Watch Episode ${episodeNumber} Free · KanoDrama`;
  const ctaWidth = ctx.measureText(ctaText).width;
  ctx.fillText(ctaText, (W - ctaWidth) / 2, H - 89);

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/png')
    );
    return { dataUrl, blob };
  } catch {
    return { dataUrl: '', blob: null };
  }
}

export const ShareDramaModal: React.FC<ShareDramaModalProps> = ({
  open,
  drama,
  episodeNumber = 1,
  unlockVipMode: _unlockVipMode = false,
  onUnlockSuccess: _onUnlockSuccess,
  onClose,
}) => {
  const {
    t,
    user,
    language,
    getAuthHeaders,
    refreshPointsBalance,
    pushToast,
    openBlockedAccountPopup,
  } = useDramaContext();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardDataUrl, setCardDataUrl] = useState<string>('');
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !drama) return;
    let cancelled = false;
    setCardLoading(true);
    setCardDataUrl('');
    setCardBlob(null);
    generateSpoilerCardPng(drama, episodeNumber)
      .then(({ dataUrl, blob }) => {
        if (!cancelled) {
          setCardDataUrl(dataUrl);
          setCardBlob(blob);
        }
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, drama?.bookId, drama?.provider, drama?.cover, drama?.title, episodeNumber]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !drama) return null;

  const deepLink = buildDramaDeepLink(drama, episodeNumber);
  const isSingleMovieShare =
    (drama.mediaType === 'movie' ||
      drama.provider === 'LK21' ||
      drama.provider === 'LookSeries') &&
    (drama.chapterCount || 1) <= 1;
  const shareBadgeLabel = isSingleMovieShare ? 'Full HD' : `EP ${episodeNumber}`;
  const viralCaption = `🔥 Nonton gratis "${drama.title}" (${shareBadgeLabel}) di KanoDrama [${drama.provider}]!\n\nStreaming HD Sub Indo & multi-bahasa: ${deepLink}`;
  const downloadFilename = `${slugifyDramaTitle(drama.title)}-ep${episodeNumber}-spoiler-card.png`;

  const copyWithFallback = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback
    }
    try {
      if (typeof document === 'undefined') return false;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const completeShareAction = (
    channel?: 'whatsapp' | 'telegram' | 'x' | 'facebook' | 'copy_link' | 'native_share'
  ) => {
    if (!user || !channel) return;
    void fetch('/api/points/claim', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action: 'daily_social_share',
        channel,
        lang: language,
      }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reason?: string;
          error?: string;
          awardedPoints?: number;
          summary?: { balance?: number } | null;
        };
        if (res.status === 403 || data.reason === 'anti_cheat_blocked') {
          openBlockedAccountPopup({ reason: data.error, source: 'share' });
          return;
        }
        if (!res.ok) return;
        if (data.ok && typeof data.awardedPoints === 'number' && data.awardedPoints > 0) {
          pushToast(
            language === 'id'
              ? `+${data.awardedPoints.toLocaleString('id-ID')} poin tugas share harian!`
              : `+${data.awardedPoints.toLocaleString('en-US')} pts daily social share reward!`,
            'gold',
            {
              variant: 'points',
              points: data.awardedPoints,
              balance:
                typeof data.summary?.balance === 'number'
                  ? data.summary.balance
                  : null,
              title: language === 'id' ? 'Bonus Share Harian' : 'Daily Share Reward',
              category: channel,
              subtitle:
                language === 'id'
                  ? 'Tugas share media sosial selesai'
                  : 'Daily social share mission completed',
              durationMs: 4200,
            }
          );
          void refreshPointsBalance();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kd:points-updated', {
                detail: {
                  source: 'daily_social_share',
                  summary: data.summary,
                  pointsBalance: data.summary?.balance ?? null,
                },
              })
            );
          }
        }
      })
      .catch(() => {});
  };

  const handleCopyCaption = async () => {
    const ok = await copyWithFallback(viralCaption);
    if (ok) {
      setCopied(true);
      pushToast('Viral caption & KanoDrama link copied!', 'gold');
      window.setTimeout(() => setCopied(false), 2000);
      completeShareAction('copy_link');
    } else {
      pushToast('Copy failed — please copy manually', 'error');
    }
  };

  const handleCopyDirectLink = async () => {
    const ok = await copyWithFallback(deepLink);
    if (ok) {
      setLinkCopied(true);
      pushToast(t.engagement.linkCopied, 'gold');
      window.setTimeout(() => setLinkCopied(false), 2000);
      completeShareAction('copy_link');
    } else {
      pushToast('Copy failed — please copy manually', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        if (cardBlob && typeof File !== 'undefined') {
          const file = new File([cardBlob], downloadFilename, {
            type: 'image/png',
          });
          const canShareFiles =
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] });
          if (canShareFiles) {
            await navigator.share({
              files: [file],
              title: `${drama.title} · KanoDrama`,
              text: viralCaption,
              url: deepLink,
            });
            completeShareAction('native_share');
            return;
          }
        }
        await navigator.share({
          title: `${drama.title} · KanoDrama`,
          text: viralCaption,
          url: deepLink,
        });
        completeShareAction('native_share');
      } catch {
        // User dismissed share sheet
      }
    } else {
      await handleCopyCaption();
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(viralCaption)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    deepLink
  )}&text=${encodeURIComponent(`🔥 Nonton ${drama.title} (${shareBadgeLabel}) di KanoDrama`)}`;
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `🔥 Nonton gratis "${drama.title}" (${shareBadgeLabel}) di KanoDrama`
  )}&url=${encodeURIComponent(deepLink)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    deepLink
  )}`;

  return (
    <div
      data-hud-control="true"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.engagement.shareStoryTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#111115] border-t sm:border border-white/15 shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#111115]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 cd-accent-text" />
            <h2 className="text-base font-bold text-white">
              {t.engagement.shareStoryTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share modal"
            className="min-w-[40px] min-h-[40px] rounded-full bg-white/5 hover:bg-white/15 text-[#A1A1AA] hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 pb-[max(20px,env(safe-area-inset-bottom))]">

          {/* Rendered HTML5 Canvas 9:16 Spoiler Card Preview */}
          <div className="mx-auto w-52 aspect-[9/16] rounded-2xl overflow-hidden relative bg-[#18181D] border border-white/15 shadow-2xl">
            {cardDataUrl ? (
              <img
                src={cardDataUrl}
                alt={`${drama.title} 9:16 Spoiler Card`}
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                {drama.cover && (
                  <img
                    src={drama.cover}
                    alt={drama.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/25" />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <ProviderBadge provider={drama.provider} size="xs" />
                  <span className="text-[10px] font-bold text-white bg-black/70 px-2 py-0.5 rounded tabular-nums">
                    EP {episodeNumber}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3.5 space-y-1.5">
                  <p className="text-[10px] font-semibold tracking-wider text-[#D4AF37] uppercase">
                    KanoDrama
                  </p>
                  <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">
                    {drama.title}
                  </h3>
                  <p className="text-[10px] text-[#D4D4D8] truncate">
                    {drama.chapterCount} Episodes · Vertical HD
                  </p>
                </div>
              </>
            )}

            {cardLoading && (
              <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 p-3 text-center">
                <Loader2 className="w-5 h-5 cd-accent-text animate-spin" />
                <span className="text-[10px] font-medium text-white">
                  {t.engagement.generatingCard}
                </span>
              </div>
            )}
          </div>

          {/* Clean Canonical Deep Link Copy Strip */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0D0C10] border border-white/10">
            <input
              type="text"
              readOnly
              value={deepLink}
              aria-label="Shareable drama URL"
              className="flex-1 min-w-0 bg-transparent text-[11px] text-[#D4D4D8] px-2 focus:outline-none truncate"
            />
            <button
              type="button"
              onClick={handleCopyDirectLink}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {linkCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{linkCopied ? t.engagement.linkCopied : t.engagement.copyLink}</span>
            </button>
          </div>

          {/* Primary Actions: Download Canvas PNG + Copy Viral Caption */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cardDataUrl && (
              <a
                href={cardDataUrl}
                download={downloadFilename}
                onClick={() => completeShareAction()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#18181D] border border-[#D4AF37]/50 hover:bg-[#221C14] text-[#FDE68A] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{t.engagement.downloadSpoilerCard}</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleCopyCaption}
              className={`min-h-[44px] px-4 py-2.5 rounded-xl cd-accent-bg text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg ${
                !cardDataUrl ? 'sm:col-span-2' : ''
              }`}
            >
              {copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{t.engagement.copyCaptionLink}</span>
            </button>
          </div>

          {/* Direct Social Channels: WhatsApp, Telegram, X, Facebook, Native */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => completeShareAction('whatsapp')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181D] border border-white/10 hover:border-[#10B981]/60 text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#10B981]" />
              <span>{t.engagement.shareWhatsapp}</span>
            </a>

            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => completeShareAction('telegram')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181D] border border-white/10 hover:border-sky-400/60 text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.engagement.shareTelegram}</span>
            </a>

            <a
              href={xShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => completeShareAction('x')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181D] border border-white/10 hover:border-white/40 text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <span className="font-black text-xs leading-none">𝕏</span>
              <span>{t.engagement.shareX}</span>
            </a>

            <a
              href={facebookShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => completeShareAction('facebook')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#18181D] border border-white/10 hover:border-[#1877F2]/60 text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <span className="font-black text-xs text-[#3B82F6] leading-none">f</span>
              <span>{t.engagement.shareFacebook}</span>
            </a>

            <button
              type="button"
              onClick={handleNativeShare}
              className="col-span-2 sm:col-span-2 min-h-[44px] px-3 py-2 rounded-xl bg-[#18181D] border border-white/10 hover:border-white/30 text-xs font-medium text-white flex items-center justify-center gap-1.5 truncate"
            >
              <Share2 className="w-3.5 h-3.5 cd-accent-text shrink-0" />
              <span className="truncate">{t.engagement.shareNative}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
