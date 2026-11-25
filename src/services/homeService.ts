import type { HomeCatalogResponse, LanguageCode, ProviderId } from '../types/drama';

const HOME_CLIENT_TTL_MS = 10 * 60 * 1000;
const SESSION_PREFIX = 'kano_drama_home_cache_v1_';

const memoryHomeCache = new Map<
  string,
  { expiresAt: number; data: HomeCatalogResponse }
>();

function cacheKey(lang: LanguageCode, provider: ProviderId): string {
  return `${lang}:${provider}`;
}

export function getPeekCachedHomeCatalog(
  lang: LanguageCode,
  provider: ProviderId
): HomeCatalogResponse | null {
  const key = cacheKey(lang, provider);
  const mem = memoryHomeCache.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.data;
  }
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        expiresAt: number;
        data: HomeCatalogResponse;
      };
      if (parsed?.data && Date.now() < parsed.expiresAt) {
        memoryHomeCache.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  try {
    if (typeof window !== 'undefined') {
      const ssrHome = (window as Window & { __INITIAL_HOME__?: HomeCatalogResponse })
        .__INITIAL_HOME__;
      if (
        ssrHome &&
        (ssrHome.lang === lang || !ssrHome.lang) &&
        (ssrHome.provider || 'All') === provider
      ) {
        const hasItems =
          (Array.isArray(ssrHome.heroSpotlights) && ssrHome.heroSpotlights.length > 0) ||
          (Array.isArray(ssrHome.trendingTop) && ssrHome.trendingTop.length > 0) ||
          (Array.isArray(ssrHome.hotReleases) && ssrHome.hotReleases.length > 0) ||
          (Array.isArray(ssrHome.catalogGrid) && ssrHome.catalogGrid.length > 0);
        if (hasItems) {
          const entry = {
            expiresAt: Number(ssrHome.expiresAt) || Date.now() + HOME_CLIENT_TTL_MS,
            data: ssrHome,
          };
          memoryHomeCache.set(key, entry);
          return ssrHome;
        }
      }
    }
  } catch {
    // Ignore SSR bootstrap read errors
  }
  return null;
}

function readStaleCachedHomeCatalog(
  key: string
): HomeCatalogResponse | null {
  const mem = memoryHomeCache.get(key);
  if (mem?.data) return mem.data;
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { data?: HomeCatalogResponse };
      if (parsed?.data) return parsed.data;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

export async function fetchHomeCatalog(
  lang: LanguageCode,
  provider: ProviderId = 'All',
  forceBypassClientCache = false
): Promise<HomeCatalogResponse> {
  const key = cacheKey(lang, provider);
  if (!forceBypassClientCache) {
    const cached = getPeekCachedHomeCatalog(lang, provider);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    lang,
    provider,
  });

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

    const hasItems =
      data.heroSpotlights.length > 0 ||
      data.trendingTop.length > 0 ||
      data.hotReleases.length > 0 ||
      data.catalogGrid.length > 0;

    if (hasItems) {
      const entry = {
        expiresAt: Date.now() + HOME_CLIENT_TTL_MS,
        data,
      };
      memoryHomeCache.set(key, entry);
      try {
        sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
      } catch {
        // Ignore quota errors
      }
    }

    return data;
  } catch (err) {
    const stale = readStaleCachedHomeCatalog(key);
    if (stale) {
      return { ...stale, stale: true, cached: true };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
