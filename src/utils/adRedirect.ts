export const EPISODE_REDIRECT_AD_URLS = [
  'https://uplcm.com/4/12359849',
  'https://uplcm.com/4/12056282',
  'https://uplcm.com/4/12095271',
  'https://uplcm.com/4/12095259',
] as const;

const POPUNDER_SCRIPT_HOST_PATH =
  '//crookedagreement.com/ccD/9.6FbX2h5-lsS/WzQs9/NtzSYy2JM/TjY/2AMTS-0G3SN/jOYpx-NhjgYj1U';
const POPUNDER_FALLBACK_ENDPOINT = '/api/client/runtime-boot';

export function mountPopunderScript(settings: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const win = window as Window & { __kdPopunderMounted?: boolean };
  if (win.__kdPopunderMounted) return;
  win.__kdPopunderMounted = true;

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
}

const ROUND_ROBIN_STORAGE_KEY = 'kd_episode_redirect_rr_v1';
const DEDUPE_WINDOW_MS = 3000;

let inMemoryRoundRobinIdx = 0;
const recentEpisodeAdTriggers = new Map<string, number>();

export function shouldTriggerEpisodeRedirectAd(
  currentEpisode: number,
  targetEpisode: number
): boolean {
  if (!Number.isFinite(currentEpisode) || !Number.isFinite(targetEpisode)) {
    return false;
  }
  const cur = Math.floor(currentEpisode);
  const next = Math.floor(targetEpisode);
  // Starts on episode 3 -> 4, skips every odd episode (4->5 skipped, 5->6 triggers, 6->7 skipped, ...)
  return next >= 4 && next > cur && next % 2 === 0;
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
    // Omit 'noreferrer' so no-referrer-when-downgrade origin referrer is preserved; 'noopener' protects window.opener.
    const opened = window.open(adUrl, '_blank', 'noopener');
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
  if (!shouldTriggerEpisodeRedirectAd(currentEpisode, targetEpisode)) {
    return { action: 'proceed' };
  }

  const key = `${provider || 'DramaBoxV2'}:${dramaId}:${Math.floor(targetEpisode)}`;
  const now = Date.now();
  const prevAt = recentEpisodeAdTriggers.get(key);
  if (typeof prevAt === 'number' && now - prevAt < DEDUPE_WINDOW_MS) {
    return { action: 'proceed' };
  }
  recentEpisodeAdTriggers.set(key, now);
  if (recentEpisodeAdTriggers.size > 200) {
    for (const [k, ts] of recentEpisodeAdTriggers.entries()) {
      if (now - ts >= DEDUPE_WINDOW_MS) {
        recentEpisodeAdTriggers.delete(k);
      }
    }
  }

  const adUrl = getNextEpisodeRedirectUrl();
  if (!fromAutoNext && openEpisodeRedirectUrl(adUrl)) {
    return { action: 'proceed', adUrl };
  }

  return { action: 'prompt', adUrl };
}
