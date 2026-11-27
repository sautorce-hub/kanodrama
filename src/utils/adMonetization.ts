export const VIDEO_PLAYER_REDIRECT_URLS = [
  'https://uplcm.com/4/12359849',
  'https://uplcm.com/4/12095269',
  'https://uplcm.com/4/12095268',
  'https://uplcm.com/4/12095249',
  'https://uplcm.com/4/12056282',
] as const;

const REDIRECT_INDEX_STORAGE_KEY = 'kd_video_redirect_idx';
const TRIGGER_DEDUPE_WINDOW_MS = 800;

let memoryRedirectIdx = 0;
let lastRedirectAt = 0;
let lastRedirectSignature = '';

declare global {
  interface Window {
    __kdAllowAppPopup?: boolean;
  }
}

/**
 * Redirect rule inside the video player:
 * Starts at Episode 2 -> 3, then skips every 2 episodes:
 * 1 -> 2: false
 * 2 -> 3: true
 * 3 -> 4: false
 * 4 -> 5: true
 * 5 -> 6: false
 * 6 -> 7: true
 * ...
 */
export function shouldTriggerEpisodeRedirect(
  fromEpisode: number,
  toEpisode: number
): boolean {
  if (!Number.isFinite(fromEpisode) || !Number.isFinite(toEpisode)) {
    return false;
  }
  const fromEp = Math.floor(fromEpisode);
  const toEp = Math.floor(toEpisode);
  if (toEp <= fromEp || toEp < 3) {
    return false;
  }
  return toEp % 2 === 1;
}

export function getNextVideoRedirectUrl(): string {
  let currentIdx = memoryRedirectIdx;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(REDIRECT_INDEX_STORAGE_KEY);
      const parsed = raw !== null ? Number(raw) : NaN;
      if (Number.isInteger(parsed) && parsed >= 0) {
        currentIdx = parsed;
      }
    } catch {
      // Fallback to in-memory counter when storage is restricted
    }
  }

  const normalizedIdx =
    ((currentIdx % VIDEO_PLAYER_REDIRECT_URLS.length) +
      VIDEO_PLAYER_REDIRECT_URLS.length) %
    VIDEO_PLAYER_REDIRECT_URLS.length;
  const selectedUrl = VIDEO_PLAYER_REDIRECT_URLS[normalizedIdx];
  const nextIdx = (normalizedIdx + 1) % VIDEO_PLAYER_REDIRECT_URLS.length;
  memoryRedirectIdx = nextIdx;

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(REDIRECT_INDEX_STORAGE_KEY, String(nextIdx));
    } catch {
      // Ignore restricted storage errors
    }
  }

  return selectedUrl;
}

export function _resetAdMonetizationStateForTest(): void {
  memoryRedirectIdx = 0;
  lastRedirectAt = 0;
  lastRedirectSignature = '';
}

/**
 * Triggers at most ONE redirect ad URL per qualifying episode transition.
 */
export function triggerVideoEpisodeRedirectAd(
  fromEpisode: number,
  toEpisode: number,
  mediaKey = ''
): boolean {
  if (!shouldTriggerEpisodeRedirect(fromEpisode, toEpisode)) {
    return false;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const now = Date.now();
  const signature = `${mediaKey}:${Math.floor(fromEpisode)}->${Math.floor(toEpisode)}`;
  if (
    now - lastRedirectAt < TRIGGER_DEDUPE_WINDOW_MS ||
    (signature === lastRedirectSignature && now - lastRedirectAt < 2500)
  ) {
    return false;
  }

  lastRedirectAt = now;
  lastRedirectSignature = signature;

  const targetUrl = getNextVideoRedirectUrl();
  const prevAllowFlag = window.__kdAllowAppPopup;
  window.__kdAllowAppPopup = true;

  try {
    const opened = window.open(targetUrl, '_blank', 'noopener');
    if (opened) {
      return true;
    }
  } catch {
    // Fallback below if window.open throws
  } finally {
    window.__kdAllowAppPopup = prevAllowFlag;
  }

  return false;
}
