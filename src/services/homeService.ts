import type { HomeCatalogResponse, LanguageCode, ProviderId } from '../types/drama';

const HOME_CLIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh client cache
const HOME_CLIENT_SWR_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes stale-while-revalidate window
const STORAGE_PREFIX = 'kano_drama_home_cache_v2_';

interface StoredClientHomeEntry {
  updatedAt: number;
  expiresAt: number;
  staleUntil: number;
  data: HomeCatalogResponse;
}

export interface PeekHomeCacheResult {
  data: HomeCatalogResponse;
  isStale: boolean;
}

const memoryHomeCache = new Map<string, StoredClientHomeEntry>();
const inFlightHomeRequests = new Map<string, Promise<HomeCatalogResponse>>();

function cacheKey(lang: LanguageCode, provider: ProviderId): string {
  return `${lang}:${provider}`;
}

export function resolveCanonicalHomeFeedLang(lang: LanguageCode): LanguageCode {
  if (lang === 'id' || lang === 'cn' || lang === 'vi') {
    return lang;
  }
  return 'en';
}

export function hasHomeItems(
  data: Partial<HomeCatalogResponse> | null | undefined
): boolean {
  if (!data || typeof data !== 'object') return false;
  return (
    (Array.isArray(data.heroSpotlights) && data.heroSpotlights.length > 0) ||
    (Array.isArray(data.trendingTop) && data.trendingTop.length > 0) ||
    (Array.isArray(data.hotReleases) && data.hotReleases.length > 0) ||
    (Array.isArray(data.catalogGrid) && data.catalogGrid.length > 0)
  );
}

function normalizeSsrHomeData(
  raw: Partial<HomeCatalogResponse>,
  fallbackLang: LanguageCode,
  provider: ProviderId
): HomeCatalogResponse {
  return {
    lang: raw.lang ?? fallbackLang,
    provider: raw.provider ?? provider,
    heroSpotlights: Array.isArray(raw.heroSpotlights) ? raw.heroSpotlights : [],
    trendingTop: Array.isArray(raw.trendingTop) ? raw.trendingTop : [],
    hotReleases: Array.isArray(raw.hotReleases) ? raw.hotReleases : [],
    catalogGrid: Array.isArray(raw.catalogGrid) ? raw.catalogGrid : [],
    providerCounts:
      raw.providerCounts && typeof raw.providerCounts === 'object'
        ? raw.providerCounts
        : {},
    updatedAt: Number(raw.updatedAt) || Date.now(),
    expiresAt: Number(raw.expiresAt) || Date.now() + HOME_CLIENT_TTL_MS,
    cached: Boolean(raw.cached),
    stale: Boolean(raw.stale),
    source: String(raw.source || 'ssr-bootstrap'),
  };
}

export function peekSsrHomeBootstrap(
  provider: ProviderId = 'All'
): HomeCatalogResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const ssrHome = (window as Window & { __INITIAL_HOME__?: HomeCatalogResponse })
      .__INITIAL_HOME__;
    if (
      ssrHome &&
      typeof ssrHome === 'object' &&
      (ssrHome.provider || 'All') === provider &&
      hasHomeItems(ssrHome)
    ) {
      return normalizeSsrHomeData(ssrHome, ssrHome.lang || 'en', provider);
    }
  } catch {
    // Ignore malformed SSR bootstrap payload
  }
  return null;
}

function persistClientEntry(key: string, entry: StoredClientHomeEntry): void {
  memoryHomeCache.set(key, entry);
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(entry);
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
    } catch {
      // Ignore storage quota / private mode errors
    }
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
    } catch {
      // Ignore storage quota / private mode errors
    }
  } catch {
    // Ignore serialization errors
  }
}

function readStoredEntry(key: string): StoredClientHomeEntry | null {
  const mem = memoryHomeCache.get(key);
  if (mem && hasHomeItems(mem.data)) {
    return mem;
  }
  if (typeof window === 'undefined') return null;

  for (const storeName of ['sessionStorage', 'localStorage'] as const) {
    try {
      const store = window[storeName];
      if (!store) continue;
      const raw = store.getItem(`${STORAGE_PREFIX}${key}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<StoredClientHomeEntry>;
      if (parsed?.data && hasHomeItems(parsed.data)) {
        const entry: StoredClientHomeEntry = {
          updatedAt:
            Number(parsed.updatedAt) || Number(parsed.data.updatedAt) || Date.now(),
          expiresAt: Number(parsed.expiresAt) || Date.now() + HOME_CLIENT_TTL_MS,
          staleUntil:
            Number(parsed.staleUntil) || Date.now() + HOME_CLIENT_SWR_MAX_AGE_MS,
          data: parsed.data,
        };
        memoryHomeCache.set(key, entry);
        return entry;
      }
    } catch {
      // Ignore corrupt storage read or restricted Incognito storage access
    }
  }
  return null;
}

function hydrateFromSsrBootstrap(
  lang: LanguageCode,
  provider: ProviderId
): StoredClientHomeEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const ssrHome = (window as Window & { __INITIAL_HOME__?: HomeCatalogResponse })
      .__INITIAL_HOME__;
    if (
      ssrHome &&
      typeof ssrHome === 'object' &&
      (ssrHome.provider || 'All') === provider &&
      hasHomeItems(ssrHome)
    ) {
      const now = Date.now();
      const expectedFeedLang = resolveCanonicalHomeFeedLang(lang);
      const langMatches =
        !ssrHome.lang ||
        resolveCanonicalHomeFeedLang(ssrHome.lang) === expectedFeedLang;
      const normalizedData = normalizeSsrHomeData(ssrHome, lang, provider);
      const serverExpires = Number(normalizedData.expiresAt) || 0;
      const isBootstrapStale = Boolean(normalizedData.stale) || !langMatches;
      const clientExpires = isBootstrapStale
        ? now - 1
        : Math.min(
            serverExpires > now ? serverExpires : now + HOME_CLIENT_TTL_MS,
            now + HOME_CLIENT_TTL_MS
          );
      const entry: StoredClientHomeEntry = {
        updatedAt: Number(normalizedData.updatedAt) || now,
        expiresAt: clientExpires,
        staleUntil: now + HOME_CLIENT_SWR_MAX_AGE_MS,
        data: isBootstrapStale
          ? { ...normalizedData, cached: true, stale: true }
          : normalizedData,
      };
      persistClientEntry(cacheKey(lang, provider), entry);
      return entry;
    }
  } catch {
    // Ignore SSR bootstrap errors
  }
  return null;
}

export function getPeekCachedHomeEntry(
  lang: LanguageCode,
  provider: ProviderId
): PeekHomeCacheResult | null {
  try {
    const key = cacheKey(lang, provider);
    const now = Date.now();
    const ssrEntry = hydrateFromSsrBootstrap(lang, provider);
    const stored = readStoredEntry(key) ?? ssrEntry;
    if (!stored || !hasHomeItems(stored.data)) {
      if (ssrEntry && hasHomeItems(ssrEntry.data)) {
        return { data: ssrEntry.data, isStale: true };
      }
      return null;
    }
    const expectedFeedLang = resolveCanonicalHomeFeedLang(lang);
    const langMismatch = Boolean(
      stored.data.lang &&
        resolveCanonicalHomeFeedLang(stored.data.lang) !== expectedFeedLang
    );
    if (now <= stored.expiresAt && !stored.data.stale && !langMismatch) {
      return { data: stored.data, isStale: false };
    }
    if (now <= stored.staleUntil) {
      return {
        data: { ...stored.data, cached: true, stale: true },
        isStale: true,
      };
    }
    if (ssrEntry && hasHomeItems(ssrEntry.data)) {
      return {
        data: { ...ssrEntry.data, cached: true, stale: true },
        isStale: true,
      };
    }
  } catch {
    // Never throw during cache peek
  }
  return null;
}

export function getPeekCachedHomeCatalog(
  lang: LanguageCode,
  provider: ProviderId
): HomeCatalogResponse | null {
  try {
    return getPeekCachedHomeEntry(lang, provider)?.data ?? null;
  } catch {
    return null;
  }
}

export function clearClientHomeCache(
  lang?: LanguageCode,
  provider?: ProviderId
): void {
  if (lang && provider) {
    const key = cacheKey(lang, provider);
    memoryHomeCache.delete(key);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // Ignore
      }
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // Ignore
      }
    }
    return;
  }

  memoryHomeCache.clear();
  if (typeof window !== 'undefined') {
    for (const storeName of ['sessionStorage', 'localStorage'] as const) {
      try {
        const store = window[storeName];
        if (!store) continue;
        const toRemove: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
        }
        for (const k of toRemove) store.removeItem(k);
      } catch {
        // Ignore
      }
    }
  }
}

export async function fetchHomeCatalog(
  lang: LanguageCode,
  provider: ProviderId = 'All',
  forceBypassClientCache = false
): Promise<HomeCatalogResponse> {
  const key = cacheKey(lang, provider);
  if (!forceBypassClientCache) {
    const peek = getPeekCachedHomeEntry(lang, provider);
    if (peek && !peek.isStale) {
      return peek.data;
    }
  }

  const existingInFlight = inFlightHomeRequests.get(key);
  if (existingInFlight) {
    return existingInFlight;
  }

  const requestPromise = (async (): Promise<HomeCatalogResponse> => {
    const params = new URLSearchParams({
      lang,
      provider,
    });
    if (forceBypassClientCache) {
      params.set('refresh', '1');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/home?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Home catalog HTTP ${res.status}`);
      }

      const rawText = await res.text();
      const raw = JSON.parse(rawText) as Partial<HomeCatalogResponse>;
      const data: HomeCatalogResponse = {
        lang: raw.lang ?? lang,
        provider: raw.provider ?? provider,
        heroSpotlights: Array.isArray(raw.heroSpotlights) ? raw.heroSpotlights : [],
        trendingTop: Array.isArray(raw.trendingTop) ? raw.trendingTop : [],
        hotReleases: Array.isArray(raw.hotReleases) ? raw.hotReleases : [],
        catalogGrid: Array.isArray(raw.catalogGrid) ? raw.catalogGrid : [],
        providerCounts:
          raw.providerCounts && typeof raw.providerCounts === 'object'
            ? raw.providerCounts
            : {},
        updatedAt: Number(raw.updatedAt) || Date.now(),
        expiresAt: Number(raw.expiresAt) || Date.now() + HOME_CLIENT_TTL_MS,
        cached: Boolean(raw.cached),
        stale: Boolean(raw.stale),
        source: String(raw.source || 'live-refresh'),
      };

      if (hasHomeItems(data)) {
        const now = Date.now();
        persistClientEntry(key, {
          updatedAt: data.updatedAt,
          expiresAt: now + HOME_CLIENT_TTL_MS,
          staleUntil: now + HOME_CLIENT_SWR_MAX_AGE_MS,
          data,
        });
        return data;
      }

      // Preserve existing stale cache or SSR bootstrap instead of overwriting Home with empty data
      const fallback =
        readStoredEntry(key) ?? hydrateFromSsrBootstrap(lang, provider);
      if (fallback && hasHomeItems(fallback.data)) {
        return { ...fallback.data, stale: true, cached: true };
      }

      return data;
    } catch (err) {
      const stale =
        readStoredEntry(key) ?? hydrateFromSsrBootstrap(lang, provider);
      if (stale && hasHomeItems(stale.data)) {
        return { ...stale.data, stale: true, cached: true };
      }
      throw err;
    } finally {
      clearTimeout(timer);
      inFlightHomeRequests.delete(key);
    }
  })();

  inFlightHomeRequests.set(key, requestPromise);
  return requestPromise;
}
