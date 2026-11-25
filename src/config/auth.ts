import type { AccentThemeId, LanguageCode, SubtitleStyleConfig } from '../types/drama';

export interface AuthRuntimeConfig {
  googleClientId: string;
  hasOAuthCodeFlow: boolean;
}

export interface ServerAuthenticatedUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  bio?: string;
  preferredLanguage?: LanguageCode;
  preferences?: {
    accentTheme?: AccentThemeId;
    highContrast?: boolean;
    subtitleStyle?: SubtitleStyleConfig;
  };
  streakCount?: number;
  lastVisitDate?: string;
  isVip?: boolean;
}

export interface GoogleAuthResult {
  sessionToken: string | null;
  user: ServerAuthenticatedUser;
  gmailLoginCount: number;
  firstLoginBonusAwarded?: number;
}

interface GoogleTokenClientResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleIdCredentialResponse {
  credential?: string;
}

interface GoogleAccountsGlobal {
  id?: {
    initialize: (cfg: {
      client_id: string;
      callback: (res: GoogleIdCredentialResponse) => void;
      ux_mode?: 'popup' | 'redirect';
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
    }) => void;
    renderButton: (
      parent: HTMLElement,
      options: {
        theme?: 'outline' | 'filled_blue' | 'filled_black';
        size?: 'large' | 'medium' | 'small';
        shape?: 'rectangular' | 'pill' | 'circle' | 'square';
        text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
        width?: number;
      }
    ) => void;
    disableAutoSelect?: () => void;
  };
  oauth2?: {
    initTokenClient: (cfg: {
      client_id: string;
      scope: string;
      callback: (resp: GoogleTokenClientResponse) => void;
      error_callback?: (err: { type?: string; message?: string }) => void;
    }) => {
      requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
    };
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: GoogleAccountsGlobal;
    };
  }
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const PENDING_REF_STORAGE_KEY = 'kanodrama_pending_ref';
const DEVICE_FP_STORAGE_KEY = 'kanodrama_device_fp';
export const PRODUCTION_SITE_ORIGIN = 'https://kano-drama.live';

export function getProductionReferralUrl(referralCode: string): string {
  const cleanCode = (referralCode || '').trim().toUpperCase();
  if (!cleanCode) return PRODUCTION_SITE_ORIGIN;
  return `${PRODUCTION_SITE_ORIGIN}/?ref=${encodeURIComponent(cleanCode)}`;
}

export function getClientDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(DEVICE_FP_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) {
      return existing.trim().slice(0, 64);
    }
    const nav = window.navigator;
    const scr = window.screen;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const rawSeed = [
      nav.language || '',
      nav.platform || '',
      String(nav.hardwareConcurrency || ''),
      `${scr.width || 0}x${scr.height || 0}x${scr.colorDepth || 0}`,
      tz,
    ].join('|');
    let h = 2166136261;
    for (let i = 0; i < rawSeed.length; i += 1) {
      h ^= rawSeed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const fp = `kd-${(h >>> 0).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_FP_STORAGE_KEY, fp);
    return fp;
  } catch {
    return '';
  }
}

export function captureReferralCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const refParam = (
      new URLSearchParams(window.location.search).get('ref') || ''
    )
      .trim()
      .toUpperCase();
    if (/^KD[A-F0-9]{6,12}$/.test(refParam)) {
      localStorage.setItem(PENDING_REF_STORAGE_KEY, refParam);
      return refParam;
    }
    return (localStorage.getItem(PENDING_REF_STORAGE_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function getPendingReferralCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = (localStorage.getItem(PENDING_REF_STORAGE_KEY) || '')
      .trim()
      .toUpperCase();
    return /^KD[A-F0-9]{6,12}$/.test(val) ? val : '';
  } catch {
    return '';
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_REF_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

let cachedRuntimeConfig: AuthRuntimeConfig | null = null;
let runtimeConfigPromise: Promise<AuthRuntimeConfig> | null = null;
let gsiLoadPromise: Promise<boolean> | null = null;

function getBuildTimeGoogleClientId(): string {
  return ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '').trim();
}

export function getCachedGoogleClientId(): string {
  return (cachedRuntimeConfig?.googleClientId || getBuildTimeGoogleClientId()).trim();
}

export async function fetchAuthRuntimeConfig(force = false): Promise<AuthRuntimeConfig> {
  if (!force && cachedRuntimeConfig && cachedRuntimeConfig.googleClientId) {
    return cachedRuntimeConfig;
  }
  if (!force && runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = (async () => {
    const buildClientId = getBuildTimeGoogleClientId();
    try {
      const res = await fetch('/api/auth/config', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          googleClientId?: string;
          hasOAuthCodeFlow?: boolean;
        };
        const resolved: AuthRuntimeConfig = {
          googleClientId: (data.googleClientId || buildClientId || '').trim(),
          hasOAuthCodeFlow: Boolean(data.hasOAuthCodeFlow),
        };
        cachedRuntimeConfig = resolved;
        return resolved;
      }
    } catch {
      // Fallback to build-time client ID
    }
    const fallback: AuthRuntimeConfig = {
      googleClientId: buildClientId,
      hasOAuthCodeFlow: false,
    };
    cachedRuntimeConfig = fallback;
    return fallback;
  })().finally(() => {
    runtimeConfigPromise = null;
  });

  return runtimeConfigPromise;
}

export async function loadGoogleIdentityScript(timeoutMs = 6000): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
    return true;
  }
  if (gsiLoadPromise) {
    return gsiLoadPromise;
  }

  gsiLoadPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${GSI_SCRIPT_SRC}"]`
    );
    const scriptEl = existing || document.createElement('script');

    const checkReady = () =>
      Boolean(window.google?.accounts?.oauth2 || window.google?.accounts?.id);

    const onLoad = () => {
      if (checkReady()) {
        finish(true);
        return;
      }
      window.setTimeout(() => finish(checkReady()), 150);
    };

    scriptEl.addEventListener('load', onLoad, { once: true });
    scriptEl.addEventListener('error', () => finish(false), { once: true });

    if (!existing) {
      scriptEl.src = GSI_SCRIPT_SRC;
      scriptEl.async = true;
      scriptEl.defer = true;
      document.head.appendChild(scriptEl);
    } else if (checkReady()) {
      finish(true);
      return;
    }

    window.setTimeout(() => {
      finish(checkReady());
    }, timeoutMs);
  }).finally(() => {
    if (!window.google?.accounts?.oauth2 && !window.google?.accounts?.id) {
      gsiLoadPromise = null;
    }
  });

  return gsiLoadPromise;
}

export async function preloadGoogleAuth(): Promise<AuthRuntimeConfig> {
  const [cfg] = await Promise.all([
    fetchAuthRuntimeConfig(),
    loadGoogleIdentityScript().catch(() => false),
  ]);
  return cfg;
}

export function isAuthConfigured(): boolean {
  return Boolean(getCachedGoogleClientId());
}

export async function exchangeGoogleCredentialWithBackend(payload: {
  credential?: string;
  accessToken?: string;
}): Promise<GoogleAuthResult> {
  const deviceFingerprint = getClientDeviceFingerprint();
  const referralCode = getPendingReferralCode();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'KanoDrama',
  };
  if (deviceFingerprint) {
    headers['X-Device-Fingerprint'] = deviceFingerprint;
  }

  const res = await fetch('/api/auth/google', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      ...payload,
      ...(deviceFingerprint ? { deviceFingerprint } : {}),
      ...(referralCode ? { referralCode } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    user?: ServerAuthenticatedUser;
    gmailLoginCount?: number;
    firstLoginBonusAwarded?: number;
  };

  if (!res.ok || !data.ok || !data.user) {
    throw new Error(data.error || 'Google authentication verification failed.');
  }

  return {
    sessionToken: data.sessionToken || null,
    user: data.user,
    gmailLoginCount:
      typeof data.gmailLoginCount === 'number' ? data.gmailLoginCount : 0,
    firstLoginBonusAwarded:
      typeof data.firstLoginBonusAwarded === 'number' ? data.firstLoginBonusAwarded : 0,
  };
}

export async function fetchCurrentAuthSession(bearerToken?: string | null): Promise<{
  authenticated: boolean;
  user: ServerAuthenticatedUser | null;
  gmailLoginCount?: number;
}> {
  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const res = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers,
  });
  if (!res.ok) {
    return { authenticated: false, user: null };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    authenticated?: boolean;
    user?: ServerAuthenticatedUser | null;
    gmailLoginCount?: number;
  };
  return {
    authenticated: Boolean(data.authenticated && data.user),
    user: data.user || null,
    gmailLoginCount:
      typeof data.gmailLoginCount === 'number' ? data.gmailLoginCount : undefined,
  };
}

export async function loginWithEmail(payload: {
  email: string;
  password: string;
}): Promise<GoogleAuthResult> {
  const deviceFingerprint = getClientDeviceFingerprint();
  const referralCode = getPendingReferralCode();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'KanoDrama',
  };
  if (deviceFingerprint) {
    headers['X-Device-Fingerprint'] = deviceFingerprint;
  }

  const res = await fetch('/api/auth/email/login', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      ...(deviceFingerprint ? { deviceFingerprint } : {}),
      ...(referralCode ? { referralCode } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    user?: ServerAuthenticatedUser;
    gmailLoginCount?: number;
    firstLoginBonusAwarded?: number;
  };

  if (!res.ok || !data.ok || !data.user) {
    throw new Error(data.error || 'Email sign-in failed.');
  }

  return {
    sessionToken: data.sessionToken || null,
    user: data.user,
    gmailLoginCount:
      typeof data.gmailLoginCount === 'number' ? data.gmailLoginCount : 0,
    firstLoginBonusAwarded:
      typeof data.firstLoginBonusAwarded === 'number' ? data.firstLoginBonusAwarded : 0,
  };
}

export async function registerWithEmail(payload: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<GoogleAuthResult> {
  const deviceFingerprint = getClientDeviceFingerprint();
  const referralCode = getPendingReferralCode();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'KanoDrama',
  };
  if (deviceFingerprint) {
    headers['X-Device-Fingerprint'] = deviceFingerprint;
  }

  const res = await fetch('/api/auth/email/register', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      ...(payload.displayName?.trim() ? { displayName: payload.displayName.trim() } : {}),
      ...(deviceFingerprint ? { deviceFingerprint } : {}),
      ...(referralCode ? { referralCode } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    user?: ServerAuthenticatedUser;
    gmailLoginCount?: number;
    firstLoginBonusAwarded?: number;
  };

  if (!res.ok || !data.ok || !data.user) {
    throw new Error(data.error || 'Email registration failed.');
  }

  return {
    sessionToken: data.sessionToken || null,
    user: data.user,
    gmailLoginCount:
      typeof data.gmailLoginCount === 'number' ? data.gmailLoginCount : 0,
    firstLoginBonusAwarded:
      typeof data.firstLoginBonusAwarded === 'number' ? data.firstLoginBonusAwarded : 0,
  };
}

export async function signInWithRealGoogle(): Promise<GoogleAuthResult> {
  // Use cached clientId synchronously when already preloaded to preserve click user gesture
  let clientId = getCachedGoogleClientId();
  if (!clientId) {
    const cfg = await fetchAuthRuntimeConfig(true);
    clientId = cfg.googleClientId;
  }

  if (!clientId) {
    throw new Error(
      'Google Sign-In is not configured yet. Please sign in with Email below or set GOOGLE_CLIENT_ID in the server .env.'
    );
  }

  let gsiReady = Boolean(window.google?.accounts?.oauth2);
  if (!gsiReady) {
    gsiReady = await loadGoogleIdentityScript();
  }

  if (!gsiReady || !window.google?.accounts?.oauth2) {
    throw new Error(
      'Google Identity Services could not load. You can use Email Login below or disable strict script blockers.'
    );
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    let done = false;
    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('Google sign-in timed out. Please try again or use Email Login.'));
    }, 45_000);

    try {
      const client = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (resp) => {
          if (done) return;
          done = true;
          window.clearTimeout(timeoutId);
          if (resp.error || !resp.access_token) {
            reject(
              new Error(
                resp.error_description ||
                  resp.error ||
                  'Google sign-in was cancelled or denied.'
              )
            );
            return;
          }
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          if (done) return;
          done = true;
          window.clearTimeout(timeoutId);
          if (err?.type === 'popup_failed_to_open') {
            reject(
              new Error(
                'Sign-in popup was blocked by your browser. Please allow popups or use Email Login.'
              )
            );
            return;
          }
          if (err?.type === 'popup_closed') {
            reject(new Error('Google sign-in popup was closed before completion.'));
            return;
          }
          reject(new Error(err?.message || 'Google sign-in could not be completed.'));
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      reject(
        err instanceof Error
          ? err
          : new Error('Unable to launch Google sign-in prompt.')
      );
    }
  });

  return exchangeGoogleCredentialWithBackend({ accessToken });
}

export async function renderGoogleCredentialButton(
  containerEl: HTMLElement,
  onSuccess: (result: GoogleAuthResult) => void,
  onError: (message: string) => void
): Promise<boolean> {
  const cfg = await fetchAuthRuntimeConfig();
  if (!cfg.googleClientId) return false;
  const loaded = await loadGoogleIdentityScript();
  if (!loaded || !window.google?.accounts?.id) return false;

  containerEl.innerHTML = '';
  window.google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async (resp) => {
      if (!resp.credential) {
        onError('Google sign-in did not return a credential.');
        return;
      }
      try {
        const result = await exchangeGoogleCredentialWithBackend({
          credential: resp.credential,
        });
        onSuccess(result);
      } catch (err) {
        onError(
          err instanceof Error
            ? err.message
            : 'Failed to verify Google credential.'
        );
      }
    },
  });

  window.google.accounts.id.renderButton(containerEl, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    width: Math.min(360, Math.max(240, containerEl.clientWidth || 320)),
  });
  return true;
}

export async function signOutRealGoogle(bearerToken?: string | null): Promise<void> {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {
    // Ignore GSI cleanup errors
  }

  const headers: Record<string, string> = {
    'X-Requested-With': 'KanoDrama',
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers,
  }).catch(() => {});
}
