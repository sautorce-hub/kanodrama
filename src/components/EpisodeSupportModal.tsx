import React, { useEffect, useState } from 'react';
import { Clapperboard, Heart, Play, X } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import type { DramaItem, LanguageCode } from '../types/drama';

interface EpisodeSupportModalProps {
  open: boolean;
  drama: DramaItem | null;
  targetEpisode: number;
  totalEpisodes?: number;
  onConfirmContinue: () => void;
  onCancel: () => void;
}

interface SupportModalCopy {
  brandTag: string;
  headingPrefix: string;
  episodeLabel: string;
  ofEpisodes: (total: number) => string;
  message: string;
  subNote: string;
  continueBtn: (ep: number) => string;
  cancelBtn: string;
  closeLabel: string;
}

const SUPPORT_COPY: Record<LanguageCode, SupportModalCopy> = {
  id: {
    brandTag: 'Dukungan KanoDrama',
    headingPrefix: 'Lanjutkan ke Episode',
    episodeLabel: 'Episode',
    ofEpisodes: (total) => `${total} Eps`,
    message:
      'Dukung KanoDrama agar tetap gratis & lancar dengan melewati halaman sponsor sebelum melanjutkan episode berikutnya.',
    subNote:
      'Halaman sponsor akan terbuka di tab baru, dan episode pilihan Anda langsung diputar di sini.',
    continueBtn: (ep) => `Lanjut Nonton · Ep ${ep}`,
    cancelBtn: 'Batal',
    closeLabel: 'Tutup',
  },
  en: {
    brandTag: 'Support KanoDrama',
    headingPrefix: 'Continue to Episode',
    episodeLabel: 'Episode',
    ofEpisodes: (total) => `${total} Eps`,
    message:
      'Support KanoDrama to stay free and smooth by passing a brief sponsor page before continuing to the next episode.',
    subNote:
      'The sponsor page opens in a new tab while your selected episode starts playing right here.',
    continueBtn: (ep) => `Continue Watching · Ep ${ep}`,
    cancelBtn: 'Cancel',
    closeLabel: 'Close',
  },
  ms: {
    brandTag: 'Sokong KanoDrama',
    headingPrefix: 'Teruskan ke Episod',
    episodeLabel: 'Episod',
    ofEpisodes: (total) => `${total} Eps`,
    message:
      'Sokong KanoDrama agar kekal percuma & lancar dengan melalui halaman penaja sebelum meneruskan ke episod seterusnya.',
    subNote:
      'Halaman penaja akan dibuka pada tab baharu dan episod anda akan terus dimainkan di sini.',
    continueBtn: (ep) => `Terus Menonton · Ep ${ep}`,
    cancelBtn: 'Batal',
    closeLabel: 'Tutup',
  },
  cn: {
    brandTag: '支持 KanoDrama',
    headingPrefix: '继续观看第',
    episodeLabel: '第',
    ofEpisodes: (total) => `共 ${total} 集`,
    message:
      '在继续观看下一集前浏览简短的赞助页面，支持 KanoDrama 保持免费与流畅播放。',
    subNote: '赞助页面将在新标签页打开，当前剧集将立即在此播放。',
    continueBtn: (ep) => `继续观看 · 第 ${ep} 集`,
    cancelBtn: '取消',
    closeLabel: '关闭',
  },
  vi: {
    brandTag: 'Ủng hộ KanoDrama',
    headingPrefix: 'Tiếp tục tới Tập',
    episodeLabel: 'Tập',
    ofEpisodes: (total) => `${total} Tập`,
    message:
      'Ủng hộ KanoDrama luôn miễn phí và mượt mà bằng cách đi qua trang tài trợ ngắn trước khi xem tập tiếp theo.',
    subNote:
      'Trang tài trợ sẽ mở ở tab mới và tập bạn chọn sẽ phát ngay tại đây.',
    continueBtn: (ep) => `Tiếp tục xem · Tập ${ep}`,
    cancelBtn: 'Hủy',
    closeLabel: 'Đóng',
  },
  es: {
    brandTag: 'Apoya a KanoDrama',
    headingPrefix: 'Continuar al Episodio',
    episodeLabel: 'Episodio',
    ofEpisodes: (total) => `${total} Eps`,
    message:
      'Apoya a KanoDrama para mantener el streaming gratuito y fluido pasando por una breve página patrocinada antes del siguiente episodio.',
    subNote:
      'La página patrocinada se abrirá en una nueva pestaña y tu episodio comenzará aquí mismo.',
    continueBtn: (ep) => `Seguir viendo · Ep ${ep}`,
    cancelBtn: 'Cancelar',
    closeLabel: 'Cerrar',
  },
  ko: {
    brandTag: 'KanoDrama 응원하기',
    headingPrefix: '다음 회차로 이동:',
    episodeLabel: '에피소드',
    ofEpisodes: (total) => `총 ${total}화`,
    message:
      '다음 에피소드를 이어서 보기 전에 간단한 스폰서 페이지를 거쳐 KanoDrama가 무료로 원활하게 운영되도록 응원해 주세요.',
    subNote:
      '스폰서 페이지는 새 탭에서 열리며 선택한 에피소드가 바로 재생됩니다.',
    continueBtn: (ep) => `계속 시청하기 · ${ep}화`,
    cancelBtn: '취소',
    closeLabel: '닫기',
  },
  ja: {
    brandTag: 'KanoDrama を応援',
    headingPrefix: '次のエピソードへ:',
    episodeLabel: 'エピソード',
    ofEpisodes: (total) => `全${total}話`,
    message:
      '次のエピソードを再生する前に短いスポンサーページを経由して、KanoDrama の無料・快適配信をご支援ください。',
    subNote:
      'スポンサーページは新しいタブで開き、選択したエピソードがすぐ再生されます。',
    continueBtn: (ep) => `視聴を続ける · 第${ep}話`,
    cancelBtn: 'キャンセル',
    closeLabel: '閉じる',
  },
  th: {
    brandTag: 'สนับสนุน KanoDrama',
    headingPrefix: 'ดูต่อตอนที่',
    episodeLabel: 'ตอนที่',
    ofEpisodes: (total) => `${total} ตอน`,
    message:
      'สนับสนุน KanoDrama ให้รับชมฟรีและลื่นไหลต่อไปโดยผ่านหน้าผู้สนับสนุนสั้นๆ ก่อนรับชมตอนถัดไป',
    subNote:
      'หน้าผู้สนับสนุนจะเปิดในแท็บใหม่ และตอนที่คุณเลือกจะเริ่มเล่นที่นี่ทันที',
    continueBtn: (ep) => `ดูต่อ · ตอนที่ ${ep}`,
    cancelBtn: 'ยกเลิก',
    closeLabel: 'ปิด',
  },
  tl: {
    brandTag: 'Suportahan ang KanoDrama',
    headingPrefix: 'Magpatuloy sa Episode',
    episodeLabel: 'Episode',
    ofEpisodes: (total) => `${total} Eps`,
    message:
      'Suportahan ang KanoDrama upang manatiling libre at maayos ang panonood sa pamamagitan ng pagdaan sa pahina ng sponsor bago ang susunod na episode.',
    subNote:
      'Magbubukas ang sponsor page sa bagong tab habang agad na tutugtog ang episode dito.',
    continueBtn: (ep) => `Magpatuloy Manood · Ep ${ep}`,
    cancelBtn: 'Kanselahin',
    closeLabel: 'Isara',
  },
};

export const EpisodeSupportModal: React.FC<EpisodeSupportModalProps> = ({
  open,
  drama,
  targetEpisode,
  totalEpisodes = 0,
  onConfirmContinue,
  onCancel,
}) => {
  const { language } = useDramaContext();
  const [thumbBroken, setThumbBroken] = useState(false);

  useEffect(() => {
    setThumbBroken(false);
  }, [drama?.bookId, drama?.cover]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [open, onCancel]);

  if (!open || !drama) return null;

  const copy = SUPPORT_COPY[language] || SUPPORT_COPY.en;
  const effectiveTotal = totalEpisodes > 0 ? totalEpisodes : drama.chapterCount;
  const headingText =
    language === 'cn'
      ? `${copy.headingPrefix} ${targetEpisode} 集`
      : `${copy.headingPrefix} ${targetEpisode}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kd-episode-support-title"
      aria-describedby="kd-episode-support-desc"
      data-hud-control="true"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div
        data-hud-control="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#111116] border-t sm:border border-white/15 shadow-[0_24px_70px_rgba(0,0,0,0.88)] overflow-hidden"
      >
        {/* Subtle KanoDrama top accent hairline & warm radial glow */}
        <div
          aria-hidden="true"
          className="h-px w-full bg-gradient-to-r from-transparent via-[var(--cd-accent)] to-transparent opacity-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,var(--cd-accent-soft)_0%,transparent_72%)] opacity-85"
        />

        {/* Mobile bottom-sheet drag handle */}
        <div
          aria-hidden="true"
          className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-3"
        />

        <div className="relative z-10 p-5 sm:p-6 space-y-5">
          {/* Header Row: Poster + Title + Unboxed Metadata + Close */}
          <div className="flex items-start gap-3.5">
            <div className="w-14 aspect-[2/3] rounded-xl overflow-hidden bg-[#18181D] ring-1 ring-white/15 shadow-lg shrink-0">
              {drama.cover && !thumbBroken ? (
                <img
                  src={drama.cover}
                  alt={drama.title}
                  referrerPolicy="no-referrer"
                  onError={() => setThumbBroken(true)}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#23161B] to-[#121218]">
                  <Clapperboard className="w-5 h-5 text-[var(--cd-accent-text)] opacity-80" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cd-accent-text)]">
                <Heart className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">{copy.brandTag}</span>
              </div>

              <p className="text-sm sm:text-base font-bold text-white line-clamp-2 leading-snug">
                {drama.title}
              </p>

              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#A1A1AA] tabular-nums">
                <span className="text-[#E4E4E7] font-medium">
                  {language === 'cn'
                    ? `${copy.episodeLabel} ${targetEpisode} 集`
                    : `${copy.episodeLabel} ${targetEpisode}`}
                </span>
                {effectiveTotal > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{copy.ofEpisodes(effectiveTotal)}</span>
                  </>
                )}
                {drama.provider && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{drama.provider}</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              aria-label={copy.closeLabel}
              className="inline-flex items-center justify-center w-11 h-11 -mt-1.5 -mr-1.5 rounded-full text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Friendly Support Copy */}
          <div className="space-y-2 border-t border-white/10 pt-4">
            <h2
              id="kd-episode-support-title"
              className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug tabular-nums"
              style={{ textWrap: 'balance' }}
            >
              {headingText}
            </h2>
            <p
              id="kd-episode-support-desc"
              className="text-sm text-[#D4D4D8] leading-relaxed"
            >
              {copy.message}
            </p>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              {copy.subNote}
            </p>
          </div>

          {/* Primary CTA & Cancel Action */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              data-support-continue="true"
              onClick={onConfirmContinue}
              className="w-full min-h-[48px] px-6 py-3 rounded-full cd-accent-bg text-white font-semibold text-sm shadow-[0_10px_28px_var(--cd-accent-glow)] hover:brightness-110 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>{copy.continueBtn(targetEpisode)}</span>
            </button>

            <button
              type="button"
              data-support-cancel="true"
              onClick={onCancel}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs sm:text-sm font-medium text-[#E4E4E7] transition-colors duration-150 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)]"
            >
              {copy.cancelBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
