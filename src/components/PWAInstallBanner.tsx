import React, { useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useDramaContext } from '../context/DramaContext';
import type { LanguageCode } from '../types/drama';

interface PWAInstallButtonProps {
  variant?: 'header' | 'footer' | 'menu';
  onAction?: () => void;
}

interface PWAInstallBannerProps {
  hidden?: boolean;
}

const PROMPT_NOT_READY_MESSAGES: Record<LanguageCode, string> = {
  id: 'Dialog instalasi belum siap di sesi ini. Coba tunggu sebentar atau muat ulang halaman.',
  en: 'Install prompt is not ready in this session yet. Try again in a moment.',
  cn: '当前会话尚无法弹出安装提示，请稍后再试或刷新页面。',
  vi: 'Hộp thoại cài đặt chưa sẵn sàng trong phiên này. Vui lòng thử lại sau.',
  es: 'El aviso de instalación aún no está listo en esta sesión. Inténtalo de nuevo en un momento.',
  ko: '이 세션에서는 설치 안내가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
  ja: 'このセッションではインストール確認がまだ準備できていません。少し待ってから再度お試しください。',
  th: 'หน้าต่างติดตั้งยังไม่พร้อมในเซสชันนี้ กรุณาลองใหม่อีกครั้ง',
  ms: 'Dialog pemasangan belum sedia dalam sesi ini. Sila cuba sebentar lagi.',
  tl: 'Hindi pa handa ang install prompt sa sesyong ito. Subukang muli maya-maya.',
};

function useTriggerPwaInstall(onAction?: () => void) {
  const { t, language, pushToast } = useDramaContext();
  const pwa = usePWAInstall();

  const triggerInstall = useCallback(async () => {
    const outcome = await pwa.install();
    if (outcome === 'accepted') {
      pushToast(t.pwa.installTitle, 'gold');
      onAction?.();
      return;
    }

    if (outcome === 'dismissed') {
      onAction?.();
      return;
    }

    // Re-check window.__deferredPwaPrompt once in case it arrived just before click
    if (pwa.checkPromptAvailable()) {
      const retryOutcome = await pwa.install();
      if (retryOutcome === 'accepted') {
        pushToast(t.pwa.installTitle, 'gold');
      }
      onAction?.();
      return;
    }

    // Non-blocking toast only — never show backdrop blur, modal overlay, or tutorial box
    pushToast(
      PROMPT_NOT_READY_MESSAGES[language] ?? PROMPT_NOT_READY_MESSAGES.en,
      'neutral'
    );
    onAction?.();
  }, [language, onAction, pushToast, pwa, t.pwa.installTitle]);

  return { ...pwa, t, triggerInstall };
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  hidden = false,
}) => {
  const { isInstalled, bannerDismissed, dismissBanner, t, triggerInstall } =
    useTriggerPwaInstall();

  if (hidden || isInstalled || bannerDismissed) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-5 md:pl-[72px] lg:pl-[216px] z-40 px-3 sm:px-6 pointer-events-none flex justify-center"
    >
      <aside
        role="region"
        aria-label={t.pwa.installTitle}
        className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#141418] border border-white/15 shadow-2xl shadow-black/80 px-3 py-2.5 flex items-center gap-2.5"
      >
        <img
          src="/pwa-192x192.png"
          alt="KanoDrama"
          width={36}
          height={36}
          className="w-9 h-9 rounded-xl object-cover shrink-0 border border-white/10 bg-[#090706]"
        />

        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-white truncate">
            KanoDrama
          </p>
          <p className="text-[11px] text-[#A1A1AA] truncate">
            {t.pwa.installDesc}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void triggerInstall()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090706] text-xs font-bold whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{t.pwa.installBtn}</span>
          </button>

          <button
            type="button"
            onClick={dismissBanner}
            aria-label={t.pwa.close}
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </div>
  );
};

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onAction,
}) => {
  const { isInstallable, isInstalled, t, triggerInstall } =
    useTriggerPwaInstall(onAction);

  // Never show anything if already running as an installed standalone PWA
  if (isInstalled) return null;

  // Keep top header uncluttered: only show header button when native browser install prompt is ready
  if (variant === 'header' && !isInstallable) {
    return null;
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={() => void triggerInstall()}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 hover:bg-[#D4AF37]/25 text-[#FDE68A] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
        <span>{t.pwa.installBtn}</span>
      </button>
    );
  }

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={() => void triggerInstall()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/35 hover:bg-[#D4AF37]/25 text-[#FDE68A] text-xs font-semibold transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
        <span>{t.pwa.installBtn}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void triggerInstall()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 hover:border-[#D4AF37]/45 text-xs font-medium text-[#D4D4D8] hover:text-white whitespace-nowrap transition-colors"
    >
      <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
      <span>{t.pwa.installBtn}</span>
    </button>
  );
};
