export const EPISODE_REDIRECT_AD_URLS = [
  'https://uplcm.com/4/12359849',
  'https://uplcm.com/4/12056282',
  'https://uplcm.com/4/12095271',
  'https://uplcm.com/4/12095259',
] as const;

export const POPUNDER_COOLDOWN_MS = 45 * 1000; // 45 seconds strict cooldown

const POPUNDER_SCRIPT_HOST_PATH =
  '//crookedagreement.com/ccD/9.6FbX2h5-lsS/WzQs9/NtzSYy2JM/TjY/2AMTS-0G3SN/jOYpx-NhjgYj1U';
const POPUNDER_FALLBACK_ENDPOINT = '/api/client/runtime-boot';
const POPUNDER_LAST_FIRED_STORAGE_KEY = 'kd_popunder_last_fired_at_v1';

const ROUND_ROBIN_STORAGE_KEY = 'kd_episode_redirect_rr_v1';
const DEDUPE_WINDOW_MS = 3000;

let inMemoryLastPopunderAt = 0;
let nativeWindowOpenRef: typeof window.open | null = null;
let inMemoryRoundRobinIdx = 0;
const recentEpisodeAdTriggers = new Map<string, number>();
const lastAdEpisodeByDrama = new Map<string, number>();

export function getLastPopunderFiredAt(): number {
  let stored = inMemoryLastPopunderAt;
  try {
    if (typeof window !== 'undefined') {
      const fromLocal = window.localStorage?.getItem(POPUNDER_LAST_FIRED_STORAGE_KEY);
      const fromSession = window.sessionStorage?.getItem(POPUNDER_LAST_FIRED_STORAGE_KEY);
      const raw = fromLocal ?? fromSession;
      if (raw !== null) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > stored) {
          stored = parsed;
        }
      }
    }
  } catch {
    // Ignore restricted storage in Incognito/iframe
  }
  return stored;
}

export function setLastPopunderFiredAt(timestamp: number = Date.now()): void {
  const safeTs = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : Date.now();
  inMemoryLastPopunderAt = Math.max(inMemoryLastPopunderAt, safeTs);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(POPUNDER_LAST_FIRED_STORAGE_KEY, String(inMemoryLastPopunderAt));
      window.sessionStorage?.setItem(POPUNDER_LAST_FIRED_STORAGE_KEY, String(inMemoryLastPopunderAt));
    }
  } catch {
    // Ignore storage write errors
  }
}

export function canFirePopunderNow(now: number = Date.now()): boolean {
  const lastFired = getLastPopunderFiredAt();
  if (!lastFired) return true;
  return now - lastFired >= POPUNDER_COOLDOWN_MS;
}

function isTrustedAppPopupUrl(rawUrl?: string | URL | null): boolean {
  if (!rawUrl || typeof window === 'undefined') return false;
  try {
    const parsed = new URL(String(rawUrl), window.location.origin);
    if (parsed.origin === window.location.origin) return true;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'uplcm.com' ||
      host.endsWith('.uplcm.com') ||
      host === 'accounts.google.com' ||
      host === 't.me' ||
      host === 'wa.me' ||
      host === 'api.whatsapp.com' ||
      host === 'facebook.com' ||
      host === 'www.facebook.com' ||
      host === 'twitter.com' ||
      host === 'x.com'
    );
  } catch {
    return false;
  }
}

export function installPopunderCooldownGuard(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const win = window as Window & { __kdPopunderGuardInstalled?: boolean };
  if (win.__kdPopunderGuardInstalled) return;
  win.__kdPopunderGuardInstalled = true;

  if (!nativeWindowOpenRef) {
    nativeWindowOpenRef = window.open.bind(window);
  }
  const origOpen = nativeWindowOpenRef;

  window.open = function guardedWindowOpen(
    url?: string | URL,
    target?: string,
    features?: string
  ): WindowProxy | null {
    if (isTrustedAppPopupUrl(url)) {
      return origOpen(url, target, features);
    }
    const now = Date.now();
    if (!canFirePopunderNow(now)) {
      return null;
    }
    setLastPopunderFiredAt(now);
    return origOpen(url, target, features);
  };

  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      const targetEl = event.target as Element | null;
      const anchor = targetEl?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const rootEl = document.getElementById('root');
      const insideAppUi = Boolean(rootEl && rootEl.contains(anchor));
      if (insideAppUi && event.isTrusted) {
        return;
      }

      if (isTrustedAppPopupUrl(anchor.href)) {
        return;
      }

      const now = Date.now();
      if (!canFirePopunderNow(now)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      setLastPopunderFiredAt(now);
    },
    true
  );
}

export function mountPopunderScript(settings: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installPopunderCooldownGuard();

  const win = window as Window & { __kdPopunderMounted?: boolean };
  if (win.__kdPopunderMounted) return;
  win.__kdPopunderMounted = true;

  const injectScript = () => {
    const d = document;
    const protocol = window.location.protocol === 'http:' ? 'http:' : 'https:';
    const scriptEl = d.createElement('script') as HTMLScriptElement & {
      settings?: Record<string, unknown>;
    };
    let loadedFallback = false;

    scriptEl.settings = settings || {};
    scriptEl.src = `${protocol}${POPUNDER_SCRIPT_HOST_PATH}`;
    scriptEl.async = true;
    scriptEl.referrerPolicy = 'no-referrer-when-downgrade';
    scriptEl.onerror = () => {
      if (loadedFallback) return;
      loadedFallback = true;
      const fb = d.createElement('script') as HTMLScriptElement & {
        settings?: Record<string, unknown>;
      };
      fb.settings = settings || {};
      fb.src = POPUNDER_FALLBACK_ENDPOINT;
      fb.async = true;
      fb.referrerPolicy = 'no-referrer-when-downgrade';
      (d.body || d.head || d.documentElement)?.appendChild(fb);
    };

    const anchor = d.currentScript || d.scripts[d.scripts.length - 1] || null;
    const parent =
      anchor && anchor.parentNode
        ? anchor.parentNode
        : d.body || d.head || d.documentElement;
    if (parent) {
      parent.insertBefore(
        scriptEl,
        anchor && anchor.parentNode === parent ? anchor : null
      );
    }
  };

  const elapsed = Date.now() - getLastPopunderFiredAt();
  if (getLastPopunderFiredAt() > 0 && elapsed < POPUNDER_COOLDOWN_MS) {
    const remainingMs = Math.max(250, POPUNDER_COOLDOWN_MS - elapsed);
    window.setTimeout(injectScript, remainingMs);
    return;
  }

  injectScript();
}

function makeDramaAdKey(dramaId: string, provider?: string): string {
  return `${(provider || 'DramaBoxV2').trim()}:${dramaId.trim()}`;
}

export function shouldTriggerEpisodeRedirectAd(
  currentEpisode: number,
  targetEpisode: number,
  dramaKey?: string
): boolean {
  if (!Number.isFinite(currentEpisode) || !Number.isFinite(targetEpisode)) {
    return false;
  }
  const cur = Math.floor(currentEpisode);
  const next = Math.floor(targetEpisode);
  if (next < 4 || next <= cur) return false;

  if (dramaKey) {
    if (cur <= 2) {
      lastAdEpisodeByDrama.delete(dramaKey);
    } else {
      const lastAdEp = lastAdEpisodeByDrama.get(dramaKey);
      if (typeof lastAdEp === 'number') {
        // Strictly 1 ad per 2 episodes (skip at least 1 full episode after each triggered ad)
        return next - lastAdEp >= 2;
      }
    }
  }

  // Starts on episode 3 -> 4, then 1 ad per 2 episodes (Ep 4, 6, 8, 10, ...)
  return next % 2 === 0;
}

export function confirmEpisodeRedirectAdTriggered(
  dramaId: string,
  provider: string | undefined,
  targetEpisode: number
): void {
  const dramaKey = makeDramaAdKey(dramaId, provider);
  lastAdEpisodeByDrama.set(dramaKey, Math.floor(targetEpisode));
}

export function resetEpisodeRedirectHistory(dramaId?: string, provider?: string): void {
  if (!dramaId) {
    lastAdEpisodeByDrama.clear();
    return;
  }
  lastAdEpisodeByDrama.delete(makeDramaAdKey(dramaId, provider));
}

export function getNextEpisodeRedirectUrl(): string {
  const urls = EPISODE_REDIRECT_AD_URLS;
  let idx = inMemoryRoundRobinIdx;

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem(ROUND_ROBIN_STORAGE_KEY);
      if (saved !== null) {
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          idx = parsed;
        }
      }
      const chosen = urls[idx % urls.length];
      const nextIdx = (idx + 1) % urls.length;
      inMemoryRoundRobinIdx = nextIdx;
      window.sessionStorage.setItem(ROUND_ROBIN_STORAGE_KEY, String(nextIdx));
      return chosen;
    }
  } catch {
    // Fallback to module counter when sessionStorage is unavailable
  }

  const chosen = urls[idx % urls.length];
  inMemoryRoundRobinIdx = (idx + 1) % urls.length;
  return chosen;
}

export function openEpisodeRedirectUrl(adUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const opener = nativeWindowOpenRef || window.open.bind(window);
    // Omit 'noreferrer' so no-referrer-when-downgrade origin referrer is preserved; 'noopener' protects window.opener.
    const opened = opener(adUrl, '_blank', 'noopener');
    return Boolean(opened);
  } catch {
    return false;
  }
}

export function resolveEpisodeTransitionWithAd(opts: {
  dramaId: string;
  provider?: string;
  currentEpisode: number;
  targetEpisode: number;
  fromAutoNext?: boolean;
}): { action: 'proceed' | 'prompt'; adUrl?: string } {
  const { dramaId, provider, currentEpisode, targetEpisode, fromAutoNext } = opts;
  const dramaKey = makeDramaAdKey(dramaId, provider);
  if (!shouldTriggerEpisodeRedirectAd(currentEpisode, targetEpisode, dramaKey)) {
    return { action: 'proceed' };
  }

  const dedupeKey = `${dramaKey}:${Math.floor(targetEpisode)}`;
  const now = Date.now();
  const prevAt = recentEpisodeAdTriggers.get(dedupeKey);
  if (typeof prevAt === 'number' && now - prevAt < DEDUPE_WINDOW_MS) {
    return { action: 'proceed' };
  }
  recentEpisodeAdTriggers.set(dedupeKey, now);
  if (recentEpisodeAdTriggers.size > 200) {
    for (const [k, ts] of recentEpisodeAdTriggers.entries()) {
      if (now - ts >= DEDUPE_WINDOW_MS) {
        recentEpisodeAdTriggers.delete(k);
      }
    }
  }

  const adUrl = getNextEpisodeRedirectUrl();
  if (!fromAutoNext && openEpisodeRedirectUrl(adUrl)) {
    confirmEpisodeRedirectAdTriggered(dramaId, provider, targetEpisode);
    return { action: 'proceed', adUrl };
  }

  return { action: 'prompt', adUrl };
}
