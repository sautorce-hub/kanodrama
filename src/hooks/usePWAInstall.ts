import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

declare global {
  interface Window {
    __deferredPwaPrompt?: BeforeInstallPromptEvent | null;
    __pwaListenersRegistered?: boolean;
  }
}

export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const BANNER_DISMISSED_KEY = 'kd_pwa_banner_dismissed';
const LEGACY_BANNER_DISMISSED_KEY = 'hd_pwa_banner_dismissed';

let deferredPrompt: BeforeInstallPromptEvent | null =
  typeof window !== 'undefined' ? window.__deferredPwaPrompt ?? null : null;

function readBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1' ||
      window.localStorage.getItem(LEGACY_BANNER_DISMISSED_KEY) === '1'
    );
  } catch {
    return false;
  }
}

let bannerDismissedState = readBannerDismissed();

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setBannerDismissedPersist(dismissed: boolean) {
  bannerDismissedState = dismissed;
  if (typeof window !== 'undefined') {
    try {
      if (dismissed) {
        window.localStorage.setItem(BANNER_DISMISSED_KEY, '1');
      } else {
        window.localStorage.removeItem(BANNER_DISMISSED_KEY);
      }
      window.localStorage.removeItem(LEGACY_BANNER_DISMISSED_KEY);
    } catch {
      // Ignore storage quota/privacy mode errors
    }
  }
  notifyListeners();
}

function getActivePrompt(): BeforeInstallPromptEvent | null {
  if (typeof window !== 'undefined' && window.__deferredPwaPrompt) {
    deferredPrompt = window.__deferredPwaPrompt;
  }
  return deferredPrompt;
}

function setActivePrompt(prompt: BeforeInstallPromptEvent | null) {
  deferredPrompt = prompt;
  if (typeof window !== 'undefined') {
    window.__deferredPwaPrompt = prompt;
  }
  notifyListeners();
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  setActivePrompt(event as BeforeInstallPromptEvent);
}

function handlePromptAvailable() {
  if (typeof window !== 'undefined' && window.__deferredPwaPrompt) {
    deferredPrompt = window.__deferredPwaPrompt;
    notifyListeners();
  }
}

function handleAppInstalled() {
  setActivePrompt(null);
  setBannerDismissedPersist(true);
}

if (typeof window !== 'undefined') {
  if (!window.__pwaListenersRegistered) {
    window.__pwaListenersRegistered = true;
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
  }
  window.addEventListener('pwa-prompt-available', handlePromptAvailable);
  window.addEventListener('pwa-app-installed', handleAppInstalled);
}

export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(
    () => getActivePrompt() !== null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => bannerDismissedState
  );

  const checkPromptAvailable = useCallback((): boolean => {
    const available = getActivePrompt() !== null;
    setIsInstallable(available);
    return available;
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissedPersist(true);
  }, []);

  useEffect(() => {
    const update = () => {
      setIsInstallable(getActivePrompt() !== null);
      setBannerDismissed(bannerDismissedState);
    };

    listeners.add(update);
    update();

    const checkStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(checkStandalone());
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const installed = () => {
      setActivePrompt(null);
      setBannerDismissedPersist(true);
      setIsInstalled(true);
    };
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setBannerDismissedPersist(true);
      }
    };

    const mql = window.matchMedia('(display-mode: standalone)');
    window.addEventListener('appinstalled', installed);
    window.addEventListener('pwa-app-installed', installed);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    mql.addEventListener?.('change', onDisplayModeChange);

    return () => {
      listeners.delete(update);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('pwa-app-installed', installed);
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      mql.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const install = useCallback(async (): Promise<PwaInstallOutcome> => {
    const prompt = getActivePrompt();
    if (!prompt) {
      return 'unavailable';
    }

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      setActivePrompt(null);
      setBannerDismissedPersist(true);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      setActivePrompt(null);
      return 'unavailable';
    }
  }, []);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    bannerDismissed,
    dismissBanner,
    install,
    checkPromptAvailable,
  };
}
