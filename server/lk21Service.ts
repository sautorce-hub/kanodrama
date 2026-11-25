import {
  findMovieEpisodeByVidOrSlugFromDb,
  getLk21CacheFromDb,
  getMovieBySlugFromDb,
  getMovieEpisodesFromDb,
  getMovieSourcesFromDb,
  getTrendingStatsMapFromDb,
  listMoviesFallbackFromDb,
  setLk21CacheInDb,
  upsertMovieEpisodesInDb,
  upsertMovieSourcesInDb,
  upsertMoviesBatchInDb,
  type LiveDramaBadgeStat,
  type MovieUpsertInput,
} from './db.ts';
import { notifyMovieAdditionsToGoogle } from './googleIndexing.ts';

const LK21_UPSTREAM_BASE = 'https://api.molatv.id/api/lk21';

const HOME_TTL_MS = 45 * 60 * 1000;
const MENU_TTL_MS = 4 * 60 * 60 * 1000;
const LIST_TTL_MS = 30 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const DETAIL_TTL_MS = 60 * 60 * 1000;
const EPISODES_TTL_MS = 45 * 60 * 1000;
const STREAM_TTL_MS = 20 * 60 * 1000;

export interface Lk21MovieCard {
  id: string;
  slug: string;
  app: 'lk21';
  title: string;
  cover: string;
  coverHz: string;
  coverVt: string;
  rating: string;
  quality: string;
  badge: string;
  subtitle: string;
  description: string;
  genre: string[];
  updateInfo: string;
  type: 'movie' | 'series';
  is_movie: boolean;
  dailyViews?: number;
  totalViews?: number;
  trendBadge?: 'HOT' | 'TRENDING';
}

export interface Lk21HomePayload {
  ok: boolean;
  totalMovies: number;
  updated: number;
  rows: Array<{
    key: string;
    label: string;
    items: Lk21MovieCard[];
  }>;
  cached?: boolean;
  stale?: boolean;
  source?: string;
}

export interface Lk21MenuPayload {
  ok: boolean;
  types: Array<{ key: string; label: string }>;
  genres: Array<{ slug: string; name: string }>;
  countries: Array<{ slug: string; name: string }>;
  years: Array<{ slug: string; name: string }>;
}

export interface Lk21ListPayload {
  ok: boolean;
  label?: string;
  key?: string;
  q?: string;
  page: number;
  count: number;
  hasMore: boolean;
  items: Lk21MovieCard[];
}

export interface Lk21DetailPayload {
  ok: boolean;
  id: string;
  slug: string;
  app: 'lk21';
  title: string;
  cover: string;
  coverHz: string;
  poster: string;
  synopsis: string;
  description: string;
  actors: string[];
  director: string;
  year: string;
  area: string;
  genres: string[];
  rating: string;
  quality: string;
  type: 'movie' | 'series';
  updateInfo: string;
  providers: Array<{ name: string; url: string }>;
  recommendations: Lk21MovieCard[];
}

export interface Lk21EpisodePayloadItem {
  id: string;
  vid: string;
  title: string;
  episode: string;
  manEpisode: string;
  order: number;
}

export interface Lk21EpisodesPayload {
  ok: boolean;
  app: 'lk21';
  id: string;
  slug: string;
  title: string;
  count: number;
  episodes: Lk21EpisodePayloadItem[];
}

export interface Lk21StreamServerItem {
  id: string;
  name: string;
  url: string;
  type: 'hls' | 'mp4' | 'embed';
  quality?: string;
}

export interface Lk21StreamPayload {
  ok: boolean;
  type: 'hls' | 'mp4';
  sourceType?: 'hls' | 'mp4' | 'embed';
  url: string;
  streamUrl: string;
  embedUrl?: string;
  isHls: boolean;
  title: string;
  poster: string;
  subtitles: Array<{
    id: string;
    label: string;
    lang: string;
    url?: string;
    source: 'api';
  }>;
  qualities?: Array<{ quality: string; url: string }>;
  servers?: Lk21StreamServerItem[];
  episodeNumber: number;
  slug: string;
  vid: string;
}

const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const memoryLk21Cache = new Map<
  string,
  { payload: unknown; updatedAt: number; expiresAt: number }
>();
const inFlightLk21 = new Map<string, Promise<unknown>>();

function cleanStr(val: unknown, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed === '<nil>' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return fallback;
  }
  return trimmed;
}

function stripTokensFromString(input: string): string {
  if (!input) return input;
  return input
    .replace(/([?&])token=[^&]*/gi, '$1')
    .replace(/[?&]$/, '')
    .replace(/\?&/, '?');
}

function isSafeHttpUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  if (rawUrl.startsWith('/api/')) return true;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return !isPrivateOrLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function sanitizeImageUrl(raw: unknown): string {
  const url = cleanStr(raw);
  if (!url) return '';
  if (url.startsWith('/api/proxy')) return url;
  if (url.startsWith('http://')) {
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function normalizeLk21Card(raw: Record<string, unknown>): Lk21MovieCard | null {
  const slug = cleanStr(raw.slug ?? raw.id).toLowerCase();
  const title = cleanStr(raw.title ?? raw.name);
  if (!slug || !title) return null;

  const cover = sanitizeImageUrl(raw.cover ?? raw.coverVt ?? raw.poster);
  const coverHz = sanitizeImageUrl(raw.coverHz ?? raw.cover ?? raw.poster);
  const coverVt = sanitizeImageUrl(raw.coverVt ?? raw.cover ?? raw.poster);

  const genreRaw = Array.isArray(raw.genre)
    ? raw.genre
    : Array.isArray(raw.genres)
    ? raw.genres
    : [];
  const genre = genreRaw.map((g) => cleanStr(g)).filter(Boolean);

  const rawType = cleanStr(raw.type, 'movie').toLowerCase();
  const isMovie =
    raw.is_movie !== undefined
      ? Boolean(raw.is_movie)
      : rawType !== 'series';

  return {
    id: cleanStr(raw.id, slug),
    slug,
    app: 'lk21',
    title,
    cover,
    coverHz: coverHz || cover,
    coverVt: coverVt || cover,
    rating: cleanStr(raw.rating),
    quality: cleanStr(raw.quality, 'HD'),
    badge: cleanStr(raw.badge),
    subtitle: cleanStr(raw.subtitle),
    description: cleanStr(
      raw.description ?? raw.synopsis,
      `Watch free ${title} in Full HD on KanoDrama Movies.`
    ),
    genre,
    updateInfo: cleanStr(raw.updateInfo),
    type: isMovie ? 'movie' : 'series',
    is_movie: isMovie,
  };
}

function toMovieUpsert(card: Lk21MovieCard, popularityScore = 1000): MovieUpsertInput {
  const ratingNum = parseFloat(card.rating || '0');
  const score = Math.max(
    popularityScore,
    Number.isFinite(ratingNum) ? Math.round(ratingNum * 1000) : 1000
  );
  return {
    slug: card.slug,
    movieId: card.id || card.slug,
    title: card.title,
    cover: card.cover,
    coverHz: card.coverHz,
    poster: card.coverVt || card.cover,
    synopsis: card.description,
    genres: card.genre,
    rating: card.rating,
    quality: card.quality,
    badge: card.badge,
    movieType: card.type,
    updateInfo: card.updateInfo,
    movieJson: card as unknown as Record<string, unknown>,
    popularityScore: score,
  };
}

async function readCache<T>(cacheKey: string): Promise<{
  payload: T;
  updatedAt: number;
  expiresAt: number;
  stale: boolean;
} | null> {
  const now = Date.now();
  const mem = memoryLk21Cache.get(cacheKey);
  if (mem) {
    return {
      payload: mem.payload as T,
      updatedAt: mem.updatedAt,
      expiresAt: mem.expiresAt,
      stale: now > mem.expiresAt,
    };
  }
  const db = await getLk21CacheFromDb(cacheKey);
  if (db) {
    memoryLk21Cache.set(cacheKey, {
      payload: db.payload,
      updatedAt: db.updatedAt,
      expiresAt: db.expiresAt,
    });
    return {
      payload: db.payload as T,
      updatedAt: db.updatedAt,
      expiresAt: db.expiresAt,
      stale: now > db.expiresAt,
    };
  }
  return null;
}

async function writeCache(
  cacheKey: string,
  endpoint: string,
  payload: unknown,
  ttlMs: number
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  if (memoryLk21Cache.size > 350) {
    const first = memoryLk21Cache.keys().next().value;
    if (first) memoryLk21Cache.delete(first);
  }
  memoryLk21Cache.set(cacheKey, { payload, updatedAt: now, expiresAt });
  await setLk21CacheInDb(cacheKey, endpoint, payload, ttlMs);
}

async function persistDiscoveredMovies(
  cards: Lk21MovieCard[],
  fallbackOrigin?: string
): Promise<void> {
  if (!cards || cards.length === 0) return;
  const dedup = new Map<string, MovieUpsertInput>();
  cards.forEach((c, idx) => {
    if (!c.slug || dedup.has(c.slug)) return;
    dedup.set(c.slug, toMovieUpsert(c, Math.max(500, 5000 - idx * 25)));
  });
  const inserted = await upsertMoviesBatchInDb(Array.from(dedup.values()));
  if (inserted.length > 0) {
    void notifyMovieAdditionsToGoogle(inserted, fallbackOrigin).catch(() => {});
  }
}

function attachStatsToMovies(
  items: Lk21MovieCard[],
  statsMap: Record<string, LiveDramaBadgeStat>
): Lk21MovieCard[] {
  return items.map((item) => {
    const stat = statsMap[`LK21:${item.slug}`] || statsMap[`LK21:${item.id}`];
    if (!stat) return item;
    return {
      ...item,
      dailyViews: stat.dailyViews,
      totalViews: stat.totalViews,
      trendBadge: stat.trendBadge,
    };
  });
}

function dbFallbackRowToLk21Card(
  row: Awaited<ReturnType<typeof listMoviesFallbackFromDb>>[number]
): Lk21MovieCard {
  const isMovie = row.movieType !== 'series';
  return {
    id: row.id || row.slug,
    slug: row.slug,
    app: 'lk21',
    title: row.title,
    cover: row.cover,
    coverHz: row.coverHz || row.cover,
    coverVt: row.coverVt || row.cover,
    rating: row.rating,
    quality: row.quality || 'HD',
    badge: row.badge || '',
    subtitle: '',
    description:
      row.description || `Watch free ${row.title} in Full HD on KanoDrama Movies.`,
    genre: row.genres || [],
    updateInfo: row.updateInfo || '',
    type: isMovie ? 'movie' : 'series',
    is_movie: isMovie,
  };
}

async function fetchUpstreamLk21Json(
  token: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const url = new URL(`${LK21_UPSTREAM_BASE}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v) !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`LK21 upstream error HTTP ${res.status}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`LK21 upstream returned invalid JSON for ${endpoint}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LK21 fetch failed (${endpoint}): ${msg}`);
  }
}

function runDeduplicated<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightLk21.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inFlightLk21.delete(key);
  });
  inFlightLk21.set(key, p);
  return p;
}

export async function getLk21Home(
  getToken: () => string,
  fallbackOrigin?: string
): Promise<Lk21HomePayload> {
  const cacheKey = 'lk21:home';
  const cached = await readCache<Lk21HomePayload>(cacheKey);

  const refresh = async (): Promise<Lk21HomePayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/home');
    const rawRows = Array.isArray(raw.rows) ? (raw.rows as Record<string, unknown>[]) : [];
    const rows: Lk21HomePayload['rows'] = [];
    const allCards: Lk21MovieCard[] = [];

    for (const r of rawRows) {
      const key = cleanStr(r.key);
      const label = cleanStr(r.label, key);
      const itemsRaw = Array.isArray(r.items)
        ? (r.items as Record<string, unknown>[])
        : [];
      const items = itemsRaw
        .map((it) => normalizeLk21Card(it))
        .filter((it): it is Lk21MovieCard => Boolean(it));
      if (key && items.length > 0) {
        rows.push({ key, label, items });
        allCards.push(...items);
      }
    }

    const payload: Lk21HomePayload = {
      ok: true,
      totalMovies: Number(raw.totalMovies) || allCards.length,
      updated: Date.now(),
      rows,
      source: 'live-refresh',
    };

    if (rows.length > 0) {
      await writeCache(cacheKey, 'home', payload, HOME_TTL_MS);
      void persistDiscoveredMovies(allCards, fallbackOrigin).catch(() => {});
    }
    return payload;
  };

  if (cached && cached.payload && Array.isArray(cached.payload.rows)) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...cached.payload,
      rows: cached.payload.rows.map((r) => ({
        ...r,
        items: attachStatsToMovies(r.items, statsMap),
      })),
      cached: true,
      stale: cached.stale,
      source: 'database-cache',
    };
  }

  try {
    const fresh = await runDeduplicated(cacheKey, refresh);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...fresh,
      rows: fresh.rows.map((r) => ({
        ...r,
        items: attachStatsToMovies(r.items, statsMap),
      })),
    };
  } catch {
    const fallbackRows = await listMoviesFallbackFromDb(36).catch(() => []);
    const cards = fallbackRows.map(dbFallbackRowToLk21Card);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    const enriched = attachStatsToMovies(cards, statsMap);
    return {
      ok: true,
      totalMovies: enriched.length,
      updated: Date.now(),
      rows: enriched.length > 0
        ? [
            {
              key: 'lk21.featured',
              label: 'Featured Movies (Cached)',
              items: enriched.slice(0, 18),
            },
            ...(enriched.length > 18
              ? [
                  {
                    key: 'lk21.latest',
                    label: 'Latest Releases',
                    items: enriched.slice(18),
                  },
                ]
              : []),
          ]
        : [],
      cached: true,
      stale: true,
      source: 'database-fallback',
    };
  }
}

export async function getLk21Menu(getToken: () => string): Promise<Lk21MenuPayload> {
  const cacheKey = 'lk21:menu';
  const cached = await readCache<Lk21MenuPayload>(cacheKey);

  const refresh = async (): Promise<Lk21MenuPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/menu');
    const payload: Lk21MenuPayload = {
      ok: true,
      types: Array.isArray(raw.types)
        ? (raw.types as Array<{ key: string; label: string }>)
        : [],
      genres: Array.isArray(raw.genres)
        ? (raw.genres as Array<{ slug: string; name: string }>)
        : [],
      countries: Array.isArray(raw.countries)
        ? (raw.countries as Array<{ slug: string; name: string }>)
        : [],
      years: Array.isArray(raw.years)
        ? (raw.years as Array<{ slug: string; name: string }>)
        : [],
    };
    await writeCache(cacheKey, 'menu', payload, MENU_TTL_MS);
    return payload;
  };

  if (cached && cached.payload) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  try {
    return await runDeduplicated(cacheKey, refresh);
  } catch {
    return {
      ok: true,
      types: [
        { key: 'lk21.featured', label: 'Featured' },
        { key: 'lk21.latest', label: 'Latest' },
      ],
      genres: [],
      countries: [],
      years: [],
    };
  }
}

export async function getLk21Latest(
  getToken: () => string,
  page = 1,
  fallbackOrigin?: string
): Promise<Lk21ListPayload> {
  const safePage = Math.max(1, Math.floor(page || 1));
  const cacheKey = `lk21:latest:${safePage}`;
  const cached = await readCache<Lk21ListPayload>(cacheKey);

  const refresh = async (): Promise<Lk21ListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/latest', { page: safePage });
    const itemsRaw = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[])
      : [];
    const items = itemsRaw
      .map((it) => normalizeLk21Card(it))
      .filter((it): it is Lk21MovieCard => Boolean(it));
    const payload: Lk21ListPayload = {
      ok: true,
      label: cleanStr(raw.label, 'Latest Movies & Series'),
      page: safePage,
      count: items.length,
      hasMore: items.length >= 12,
      items,
    };
    if (items.length > 0) {
      await writeCache(cacheKey, 'latest', payload, LIST_TTL_MS);
      void persistDiscoveredMovies(items, fallbackOrigin).catch(() => {});
    }
    return payload;
  };

  if (cached && cached.payload && Array.isArray(cached.payload.items)) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...cached.payload,
      items: attachStatsToMovies(cached.payload.items, statsMap),
    };
  }

  try {
    const fresh = await runDeduplicated(cacheKey, refresh);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...fresh,
      items: attachStatsToMovies(fresh.items, statsMap),
    };
  } catch {
    const fallbackRows = safePage === 1 ? await listMoviesFallbackFromDb(24).catch(() => []) : [];
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    const items = attachStatsToMovies(fallbackRows.map(dbFallbackRowToLk21Card), statsMap);
    return {
      ok: true,
      label: 'Latest Movies & Series',
      page: safePage,
      count: items.length,
      hasMore: false,
      items,
    };
  }
}

export async function getLk21Category(
  getToken: () => string,
  key: string,
  page = 1,
  fallbackOrigin?: string
): Promise<Lk21ListPayload> {
  const cleanKey = cleanStr(key, 'lk21.featured');
  const safePage = Math.max(1, Math.floor(page || 1));
  const cacheKey = `lk21:category:${cleanKey}:${safePage}`;
  const cached = await readCache<Lk21ListPayload>(cacheKey);

  const refresh = async (): Promise<Lk21ListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/category', {
      key: cleanKey,
      page: safePage,
    });
    const itemsRaw = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[])
      : [];
    const items = itemsRaw
      .map((it) => normalizeLk21Card(it))
      .filter((it): it is Lk21MovieCard => Boolean(it));
    const payload: Lk21ListPayload = {
      ok: true,
      label: cleanStr(raw.label, cleanKey),
      key: cleanKey,
      page: safePage,
      count: items.length,
      hasMore: items.length >= 12,
      items,
    };
    if (items.length > 0) {
      await writeCache(cacheKey, 'category', payload, LIST_TTL_MS);
      void persistDiscoveredMovies(items, fallbackOrigin).catch(() => {});
    }
    return payload;
  };

  if (cached && cached.payload && Array.isArray(cached.payload.items)) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...cached.payload,
      items: attachStatsToMovies(cached.payload.items, statsMap),
    };
  }

  try {
    const fresh = await runDeduplicated(cacheKey, refresh);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...fresh,
      items: attachStatsToMovies(fresh.items, statsMap),
    };
  } catch {
    const fallbackRows = safePage === 1 ? await listMoviesFallbackFromDb(24).catch(() => []) : [];
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    const items = attachStatsToMovies(fallbackRows.map(dbFallbackRowToLk21Card), statsMap);
    return {
      ok: true,
      label: cleanKey,
      key: cleanKey,
      page: safePage,
      count: items.length,
      hasMore: false,
      items,
    };
  }
}

export async function getLk21Search(
  getToken: () => string,
  q: string,
  page = 1,
  fallbackOrigin?: string
): Promise<Lk21ListPayload> {
  const cleanQ = cleanStr(q);
  const safePage = Math.max(1, Math.floor(page || 1));
  if (!cleanQ) {
    return { ok: true, q: '', page: safePage, count: 0, hasMore: false, items: [] };
  }

  const cacheKey = `lk21:search:${cleanQ.toLowerCase()}:${safePage}`;
  const cached = await readCache<Lk21ListPayload>(cacheKey);

  const refresh = async (): Promise<Lk21ListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/search', {
      q: cleanQ,
      page: safePage,
    });
    const itemsRaw = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[])
      : [];
    const items = itemsRaw
      .map((it) => normalizeLk21Card(it))
      .filter((it): it is Lk21MovieCard => Boolean(it));
    const payload: Lk21ListPayload = {
      ok: true,
      q: cleanQ,
      page: safePage,
      count: items.length,
      hasMore: items.length >= 12,
      items,
    };
    await writeCache(cacheKey, 'search', payload, SEARCH_TTL_MS);
    if (items.length > 0) {
      void persistDiscoveredMovies(items, fallbackOrigin).catch(() => {});
    }
    return payload;
  };

  if (cached && cached.payload) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  try {
    return await runDeduplicated(cacheKey, refresh);
  } catch {
    const dbMatches = await listMoviesFallbackFromDb(24, cleanQ).catch(() => []);
    const items = dbMatches.map(dbFallbackRowToLk21Card);
    return {
      ok: true,
      q: cleanQ,
      page: safePage,
      count: items.length,
      hasMore: false,
      items,
    };
  }
}

function isPlaceholderLk21Detail(detail: {
  cover?: string;
  poster?: string;
  coverHz?: string;
  synopsis?: string;
  description?: string;
  director?: string;
  actors?: string[];
  providers?: Array<{ name: string; url: string }>;
}): boolean {
  const hasImage = Boolean(
    cleanStr(detail.cover) ||
      cleanStr(detail.poster) ||
      cleanStr(detail.coverHz)
  );
  if (hasImage) return false;
  const syn = cleanStr(detail.synopsis ?? detail.description);
  const dir = cleanStr(detail.director).toLowerCase();
  const actors = Array.isArray(detail.actors) ? detail.actors : [];
  const provCount = Array.isArray(detail.providers) ? detail.providers.length : 0;
  return (
    provCount === 0 ||
    /^Nonton streaming .+ di MolaTV\.?$/i.test(syn) ||
    (dir === 'sutradara' &&
      actors.length <= 1 &&
      (!actors[0] || cleanStr(actors[0]).toLowerCase() === 'pemeran film'))
  );
}

export async function getLk21Detail(
  getToken: () => string,
  slug: string,
  fallbackOrigin?: string
): Promise<Lk21DetailPayload | null> {
  const cleanSlug = cleanStr(slug).toLowerCase();
  if (!cleanSlug) return null;

  const cacheKey = `lk21:detail:${cleanSlug}`;
  const cached = await readCache<Lk21DetailPayload>(cacheKey);

  const refresh = async (): Promise<Lk21DetailPayload | null> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/detail', { slug: cleanSlug });
    const title = cleanStr(raw.title);
    if (!title) return null;

    const genresRaw = Array.isArray(raw.genres)
      ? raw.genres
      : Array.isArray(raw.genre)
      ? raw.genre
      : [];
    const genres = genresRaw.map((g) => cleanStr(g)).filter(Boolean);

    const actors = Array.isArray(raw.actors)
      ? raw.actors.map((a) => cleanStr(a)).filter(Boolean)
      : [];

    const recsRaw = Array.isArray(raw.recommendations)
      ? (raw.recommendations as Record<string, unknown>[])
      : [];
    const recommendations = recsRaw
      .map((r) => normalizeLk21Card(r))
      .filter((r): r is Lk21MovieCard => Boolean(r));

    const providers = Array.isArray(raw.providers)
      ? (raw.providers as Array<Record<string, unknown>>)
          .map((p) => {
            const cleanedUrl = stripTokensFromString(cleanStr(p.url));
            return {
              name: cleanStr(p.name),
              url: cleanedUrl && isSafeHttpUrl(cleanedUrl) ? cleanedUrl : '',
            };
          })
          .filter((p) => Boolean(p.name))
      : [];

    const cover = sanitizeImageUrl(raw.cover ?? raw.poster);
    const poster = sanitizeImageUrl(raw.poster ?? raw.cover);
    const coverHz = sanitizeImageUrl(raw.coverHz ?? raw.poster ?? raw.cover);
    const rawType = cleanStr(raw.type, 'movie').toLowerCase();
    const detail: Lk21DetailPayload = {
      ok: true,
      id: cleanStr(raw.id, cleanSlug),
      slug: cleanStr(raw.slug, cleanSlug).toLowerCase(),
      app: 'lk21',
      title,
      cover,
      coverHz: coverHz || cover,
      poster: poster || cover,
      synopsis: cleanStr(
        raw.synopsis ?? raw.description,
        `Watch free ${title} in Full HD on KanoDrama Movies.`
      ),
      description: cleanStr(
        raw.description ?? raw.synopsis,
        `Watch free ${title} in Full HD on KanoDrama Movies.`
      ),
      actors,
      director: cleanStr(raw.director),
      year: cleanStr(raw.year),
      area: cleanStr(raw.area),
      genres,
      rating: cleanStr(raw.rating),
      quality: cleanStr(raw.quality, 'HD'),
      type: rawType === 'series' ? 'series' : 'movie',
      updateInfo: cleanStr(raw.updateInfo),
      providers,
      recommendations,
    };

    if (isPlaceholderLk21Detail(detail)) {
      return null;
    }

    await writeCache(cacheKey, 'detail', detail, DETAIL_TTL_MS);

    const inserted = await upsertMoviesBatchInDb([
      {
        slug: detail.slug,
        movieId: detail.id,
        title: detail.title,
        cover: detail.cover,
        coverHz: detail.coverHz,
        poster: detail.poster,
        synopsis: detail.synopsis,
        year: detail.year,
        area: detail.area,
        director: detail.director,
        actors: detail.actors,
        genres: detail.genres,
        rating: detail.rating,
        quality: detail.quality,
        movieType: detail.type,
        updateInfo: detail.updateInfo,
        providers: detail.providers,
        recommendations: detail.recommendations as unknown as Array<
          Record<string, unknown>
        >,
        movieJson: detail as unknown as Record<string, unknown>,
        popularityScore: 5500,
      },
      ...detail.recommendations.map((r, i) => toMovieUpsert(r, 2000 - i * 20)),
    ]);

    if (detail.providers.length > 0) {
      await upsertMovieSourcesInDb(
        detail.providers.map((p) => ({
          slug: detail.slug,
          episodeNumber: 1,
          vid: detail.slug,
          sourceName: p.name || 'LK21',
          sourceType: 'embed',
          quality: detail.quality || 'HD',
          embedUrl: p.url || '',
        }))
      );
    }

    if (inserted.length > 0) {
      void notifyMovieAdditionsToGoogle(inserted, fallbackOrigin).catch(() => {});
    }

    return detail;
  };

  if (
    cached &&
    cached.payload &&
    cached.payload.title &&
    !isPlaceholderLk21Detail(cached.payload)
  ) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  // Fallback check on rich `movies` row before hitting upstream
  const dbMovie = await getMovieBySlugFromDb(cleanSlug);
  if (
    dbMovie &&
    dbMovie.synopsis &&
    (dbMovie.actors.length > 0 || dbMovie.director) &&
    !isPlaceholderLk21Detail(dbMovie)
  ) {
    const isFresh = Date.now() - dbMovie.updatedAt < DETAIL_TTL_MS;
    if (!isFresh) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    const recs = (dbMovie.recommendations || [])
      .map((r) => normalizeLk21Card(r))
      .filter((r): r is Lk21MovieCard => Boolean(r));
    return {
      ok: true,
      id: dbMovie.movieId,
      slug: dbMovie.slug,
      app: 'lk21',
      title: dbMovie.title,
      cover: dbMovie.cover,
      coverHz: dbMovie.coverHz || dbMovie.cover,
      poster: dbMovie.poster || dbMovie.cover,
      synopsis: dbMovie.synopsis,
      description: dbMovie.synopsis,
      actors: dbMovie.actors,
      director: dbMovie.director,
      year: dbMovie.year,
      area: dbMovie.area,
      genres: dbMovie.genres,
      rating: dbMovie.rating,
      quality: dbMovie.quality || 'HD',
      type: dbMovie.movieType === 'series' ? 'series' : 'movie',
      updateInfo: dbMovie.updateInfo,
      providers: dbMovie.providers,
      recommendations: recs,
    };
  }

  try {
    return await runDeduplicated(cacheKey, refresh);
  } catch (err) {
    if (dbMovie && dbMovie.title && !isPlaceholderLk21Detail(dbMovie)) {
      const recs = (dbMovie.recommendations || [])
        .map((r) => normalizeLk21Card(r))
        .filter((r): r is Lk21MovieCard => Boolean(r));
      return {
        ok: true,
        id: dbMovie.movieId || cleanSlug,
        slug: dbMovie.slug || cleanSlug,
        app: 'lk21',
        title: dbMovie.title,
        cover: dbMovie.cover,
        coverHz: dbMovie.coverHz || dbMovie.cover,
        poster: dbMovie.poster || dbMovie.cover,
        synopsis:
          dbMovie.synopsis ||
          `Watch free ${dbMovie.title} in Full HD on KanoDrama Movies.`,
        description:
          dbMovie.synopsis ||
          `Watch free ${dbMovie.title} in Full HD on KanoDrama Movies.`,
        actors: dbMovie.actors,
        director: dbMovie.director,
        year: dbMovie.year,
        area: dbMovie.area,
        genres: dbMovie.genres,
        rating: dbMovie.rating,
        quality: dbMovie.quality || 'HD',
        type: dbMovie.movieType === 'series' ? 'series' : 'movie',
        updateInfo: dbMovie.updateInfo,
        providers: dbMovie.providers,
        recommendations: recs,
      };
    }
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/\bHTTP 404\b/i.test(msg)) {
      return null;
    }
    throw err;
  }
}

export async function getLk21Episodes(
  getToken: () => string,
  slug: string
): Promise<Lk21EpisodesPayload> {
  const cleanSlug = cleanStr(slug).toLowerCase();
  if (!cleanSlug) {
    return { ok: true, app: 'lk21', id: '', slug: '', title: '', count: 0, episodes: [] };
  }

  const cacheKey = `lk21:episodes:${cleanSlug}`;
  const cached = await readCache<Lk21EpisodesPayload>(cacheKey);

  const refresh = async (): Promise<Lk21EpisodesPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLk21Json(token, '/episodes', { slug: cleanSlug });
    const epsRaw = Array.isArray(raw.episodes)
      ? (raw.episodes as Record<string, unknown>[])
      : [];
    const episodes: Lk21EpisodePayloadItem[] = epsRaw.map((ep, idx) => {
      const order = Number(ep.order) || idx + 1;
      const vid = cleanStr(ep.vid ?? ep.id, cleanSlug);
      return {
        id: cleanStr(ep.id, vid),
        vid,
        title: cleanStr(ep.title, cleanStr(raw.title, cleanSlug)),
        episode: cleanStr(ep.episode, `EP ${order}`),
        manEpisode: cleanStr(ep.manEpisode, cleanStr(ep.episode, `EP ${order}`)),
        order,
      };
    });

    const payload: Lk21EpisodesPayload = {
      ok: true,
      app: 'lk21',
      id: cleanStr(raw.id, cleanSlug),
      slug: cleanStr(raw.slug, cleanSlug).toLowerCase(),
      title: cleanStr(raw.title, cleanSlug),
      count: episodes.length,
      episodes,
    };

    if (episodes.length > 0) {
      await writeCache(cacheKey, 'episodes', payload, EPISODES_TTL_MS);
      await upsertMovieEpisodesInDb(
        episodes.map((ep) => ({
          slug: cleanSlug,
          episodeNumber: ep.order,
          vid: ep.vid,
          title: ep.title,
          episodeLabel: ep.manEpisode || ep.episode,
          episodeJson: ep as unknown as Record<string, unknown>,
        }))
      );
    }

    return payload;
  };

  if (cached && cached.payload && cached.payload.episodes.length > 0) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  const dbEps = await getMovieEpisodesFromDb(cleanSlug);
  if (dbEps.length > 0) {
    const isStale = Date.now() - dbEps[0].updatedAt > EPISODES_TTL_MS;
    if (isStale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return {
      ok: true,
      app: 'lk21',
      id: cleanSlug,
      slug: cleanSlug,
      title: dbEps[0].title || cleanSlug,
      count: dbEps.length,
      episodes: dbEps.map((e) => ({
        id: e.vid || cleanSlug,
        vid: e.vid || cleanSlug,
        title: e.title,
        episode: e.episodeLabel || `EP ${e.episodeNumber}`,
        manEpisode: e.episodeLabel || `EP ${e.episodeNumber}`,
        order: e.episodeNumber,
      })),
    };
  }

  try {
    return await runDeduplicated(cacheKey, refresh);
  } catch {
    return {
      ok: true,
      app: 'lk21',
      id: cleanSlug,
      slug: cleanSlug,
      title: cleanSlug,
      count: 1,
      episodes: [
        {
          id: cleanSlug,
          vid: cleanSlug,
          title: cleanSlug,
          episode: 'Full Movie',
          manEpisode: 'Full Movie',
          order: 1,
        },
      ],
    };
  }
}

function normalizeUpstreamProxyUrl(rawUrl: string): string {
  const cleaned = stripTokensFromString(cleanStr(rawUrl));
  if (!cleaned) return '';
  if (cleaned.startsWith('/api/lk21/proxy/')) {
    return cleaned;
  }
  try {
    const parsed = new URL(cleaned);
    if (
      parsed.hostname.toLowerCase() === 'api.molatv.id' &&
      parsed.pathname.startsWith('/api/lk21/proxy/')
    ) {
      parsed.searchParams.delete('token');
      const qs = parsed.searchParams.toString();
      return `${parsed.pathname}${qs ? `?${qs}` : ''}`;
    }
  } catch {
    // Not a full URL
  }
  return cleaned;
}

function isLikelyEmbedUrl(url: string, declaredType = ''): boolean {
  const t = declaredType.toLowerCase();
  if (t.includes('embed') || t.includes('iframe') || t === 'html') {
    return true;
  }
  const lower = url.toLowerCase();
  if (
    lower.includes('.m3u8') ||
    lower.includes('/proxy/m3u8') ||
    lower.includes('/proxy/segment') ||
    /\.(mp4|webm|mkv|mov|m4v|ts)(\?|$)/i.test(lower)
  ) {
    return false;
  }
  return (
    /\/(embed|e|v|player)\//i.test(lower) ||
    /(playeriframe|hownetwork|turbovid|emturbovid|hydrax|fembed|dood|streamtape|filemoon|mixdrop|voe\.sx|vidhide|streamwish)/i.test(
      lower
    )
  );
}

function wrapDirectVideoUrl(
  rawCandidate: string,
  declaredType = ''
): { url: string; sourceType: 'hls' | 'mp4' | 'embed' } | null {
  const normalized = normalizeUpstreamProxyUrl(rawCandidate);
  if (!normalized || !isSafeHttpUrl(normalized)) return null;

  if (normalized.startsWith('/api/lk21/proxy/m3u8')) {
    return { url: normalized, sourceType: 'hls' };
  }
  if (normalized.startsWith('/api/lk21/proxy/segment')) {
    return { url: normalized, sourceType: 'mp4' };
  }
  if (normalized.startsWith('/api/proxy?url=')) {
    try {
      const inner = new URL(normalized, 'http://localhost').searchParams.get('url') || '';
      if (inner) {
        return wrapDirectVideoUrl(inner, declaredType);
      }
    } catch {
      // Fallback below
    }
  }
  if (normalized.startsWith('/api/')) {
    const isHlsApi =
      normalized.toLowerCase().includes('.m3u8') || declaredType.toLowerCase() === 'hls';
    return { url: normalized, sourceType: isHlsApi ? 'hls' : 'mp4' };
  }

  if (isLikelyEmbedUrl(normalized, declaredType)) {
    return { url: normalized, sourceType: 'embed' };
  }

  const lower = normalized.toLowerCase();
  const isHls =
    declaredType.toLowerCase() === 'hls' ||
    lower.includes('.m3u8') ||
    lower.includes('m3u8');

  if (isHls) {
    return {
      url: `/api/lk21/proxy/m3u8?url=${encodeURIComponent(normalized)}`,
      sourceType: 'hls',
    };
  }

  return {
    url: `/api/lk21/proxy/segment?url=${encodeURIComponent(normalized)}`,
    sourceType: 'mp4',
  };
}

function normalizeServerList(
  items: Array<Lk21StreamServerItem | null | undefined>
): Lk21StreamServerItem[] {
  const out: Lk21StreamServerItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of items) {
    if (!item || !item.url || !isSafeHttpUrl(item.url)) continue;
    const dedupeKey = `${item.type}:${item.url}`;
    if (seenUrls.has(dedupeKey)) continue;
    seenUrls.add(dedupeKey);
    out.push(item);
  }
  return out;
}

export async function getLk21Stream(
  getToken: () => string,
  opts: { slug: string; vid?: string; episode?: number; forceRefresh?: boolean }
): Promise<Lk21StreamPayload> {
  const cleanSlug = cleanStr(opts.slug).toLowerCase();
  const requestedEp = opts.episode ? Math.max(1, Math.floor(opts.episode)) : 1;
  const forceRefresh = Boolean(opts.forceRefresh);
  let targetVid = cleanStr(opts.vid).toLowerCase();
  let resolvedEpNumber = requestedEp;

  // If no explicit vid provided, resolve episode's vid from DB or episodes API (including EP 1 of multi-episode series)
  if (!targetVid && cleanSlug) {
    const dbEps = await getMovieEpisodesFromDb(cleanSlug);
    if (dbEps.length > 0) {
      const match =
        dbEps.find((e) => e.episodeNumber === requestedEp) || dbEps[0];
      if (match) {
        targetVid = (match.vid || cleanSlug).toLowerCase();
        resolvedEpNumber = match.episodeNumber;
      }
    } else {
      const dbMoviePre = await getMovieBySlugFromDb(cleanSlug);
      const isSeriesHint =
        requestedEp > 1 ||
        dbMoviePre?.movieType === 'series' ||
        Number(dbMoviePre?.movieJson?.chapterCount ?? 0) > 1;
      if (isSeriesHint) {
        const fetchedEps = await getLk21Episodes(getToken, cleanSlug).catch(() => null);
        const match =
          fetchedEps?.episodes.find((e) => e.order === requestedEp) ||
          (requestedEp <= 1 ? fetchedEps?.episodes[0] : undefined);
        if (match) {
          targetVid = (match.vid || match.id || cleanSlug).toLowerCase();
          resolvedEpNumber = match.order;
        }
      }
    }
  }

  const upstreamSlug = targetVid || cleanSlug;
  const cacheKey = targetVid
    ? `lk21:stream:v2:${targetVid}`
    : `lk21:stream:v2:${cleanSlug}:ep${resolvedEpNumber}`;
  const cached = await readCache<Lk21StreamPayload>(cacheKey);
  if (
    !forceRefresh &&
    cached &&
    !cached.stale &&
    (cached.payload?.streamUrl || cached.payload?.embedUrl)
  ) {
    return {
      ...cached.payload,
      episodeNumber: resolvedEpNumber,
      slug: cleanSlug || upstreamSlug,
      vid: upstreamSlug,
    };
  }

  const [dbSources, dbEp, dbMovie] = await Promise.all([
    getMovieSourcesFromDb(cleanSlug || upstreamSlug, resolvedEpNumber),
    findMovieEpisodeByVidOrSlugFromDb(upstreamSlug),
    cleanSlug ? getMovieBySlugFromDb(cleanSlug) : Promise.resolve(null),
  ]);

  const buildFallbackServersFromDb = (): Lk21StreamServerItem[] => {
    const list: Lk21StreamServerItem[] = [];
    for (const s of dbSources) {
      if (s.streamUrl) {
        const wrapped = wrapDirectVideoUrl(s.rawUrl || s.streamUrl, s.sourceType);
        if (wrapped) {
          list.push({
            id: `db-src-${s.id || list.length}`,
            name: s.sourceName || `Server ${list.length + 1}`,
            url: wrapped.url,
            type: wrapped.sourceType,
            quality: s.quality || 'HD',
          });
        }
      }
      if (s.embedUrl && isSafeHttpUrl(s.embedUrl)) {
        list.push({
          id: `db-embed-${s.id || list.length}`,
          name: s.sourceName || `Server Embed ${list.length + 1}`,
          url: stripTokensFromString(s.embedUrl),
          type: 'embed',
          quality: s.quality || 'HD',
        });
      }
    }
    if (dbMovie?.providers) {
      dbMovie.providers.forEach((p, idx) => {
        const url = stripTokensFromString(cleanStr(p?.url));
        if (url && isSafeHttpUrl(url)) {
          list.push({
            id: `detail-provider-${idx}`,
            name: cleanStr(p?.name, `Embed ${idx + 1}`),
            url,
            type: 'embed',
            quality: dbMovie.quality || 'HD',
          });
        }
      });
    }
    return normalizeServerList(list);
  };

  // Check DB movie_sources and movie_episodes cached direct stream URL if fresh
  const freshSource = dbSources.find(
    (s) =>
      s.streamUrl &&
      s.sourceType !== 'embed' &&
      Date.now() - s.updatedAt < STREAM_TTL_MS &&
      (!targetVid || s.vid === targetVid)
  );
  if (!forceRefresh && freshSource) {
    const wrapped = wrapDirectVideoUrl(
      freshSource.rawUrl || freshSource.streamUrl,
      freshSource.sourceType
    );
    if (wrapped && wrapped.sourceType !== 'embed') {
      const servers = normalizeServerList([
        {
          id: 'primary-db',
          name: freshSource.sourceName || 'Server Utama (HD)',
          url: wrapped.url,
          type: wrapped.sourceType,
          quality: freshSource.quality || 'HD',
        },
        ...buildFallbackServersFromDb(),
      ]);
      const isHls = wrapped.sourceType === 'hls';
      return {
        ok: true,
        type: isHls ? 'hls' : 'mp4',
        sourceType: wrapped.sourceType,
        url: wrapped.url,
        streamUrl: wrapped.url,
        isHls,
        title: dbMovie?.title || cleanSlug,
        poster: dbMovie?.poster || dbMovie?.cover || '',
        subtitles: freshSource.subtitles as Lk21StreamPayload['subtitles'],
        qualities: [{ quality: freshSource.quality || 'HD', url: wrapped.url }],
        servers,
        episodeNumber: freshSource.episodeNumber || resolvedEpNumber,
        slug: freshSource.slug || cleanSlug,
        vid: freshSource.vid || upstreamSlug,
      };
    }
  }

  if (
    !forceRefresh &&
    dbEp &&
    dbEp.streamUrl &&
    Date.now() - dbEp.updatedAt < STREAM_TTL_MS
  ) {
    const wrapped = wrapDirectVideoUrl(
      dbEp.rawUrl || dbEp.streamUrl,
      dbEp.streamType
    );
    if (wrapped && wrapped.sourceType !== 'embed') {
      const servers = normalizeServerList([
        {
          id: 'primary-ep-db',
          name: 'Server Utama (HD)',
          url: wrapped.url,
          type: wrapped.sourceType,
          quality: 'HD',
        },
        ...buildFallbackServersFromDb(),
      ]);
      const isHls = wrapped.sourceType === 'hls';
      return {
        ok: true,
        type: isHls ? 'hls' : 'mp4',
        sourceType: wrapped.sourceType,
        url: wrapped.url,
        streamUrl: wrapped.url,
        isHls,
        title: dbEp.title || dbMovie?.title || cleanSlug,
        poster: dbMovie?.poster || dbMovie?.cover || '',
        subtitles: (dbEp.subtitles as Lk21StreamPayload['subtitles']) || [],
        qualities: [{ quality: 'HD', url: wrapped.url }],
        servers,
        episodeNumber: dbEp.episodeNumber || resolvedEpNumber,
        slug: dbEp.slug || cleanSlug,
        vid: upstreamSlug,
      };
    }
  }

  try {
    return await runDeduplicated(cacheKey, async () => {
      const token = getToken();
      if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');

      let raw: Record<string, unknown> = {};
      let upstreamStreamErr: unknown = null;
      try {
        raw = await fetchUpstreamLk21Json(token, '/stream', {
          slug: upstreamSlug,
        });
      } catch (err) {
        upstreamStreamErr = err;
      }

      const declaredType = cleanStr(raw.type, 'hls').toLowerCase();
      const rawUrlCandidate = cleanStr(raw.rawUrl);
      const upstreamStreamCandidate = cleanStr(
        raw.streamUrl ?? raw.url ?? raw.hls ?? raw.videoUrl
      );
      const explicitEmbedCandidate = cleanStr(
        raw.embedUrl ?? raw.iframeUrl ?? raw.iframe
      );

      const candidateUrls: Array<{
        raw: string;
        typeHint: string;
        label: string;
        quality: string;
      }> = [];

      if (rawUrlCandidate) {
        candidateUrls.push({
          raw: rawUrlCandidate,
          typeHint: declaredType,
          label: 'Server Utama (HD)',
          quality: cleanStr(raw.quality, 'HD'),
        });
      }
      if (upstreamStreamCandidate) {
        candidateUrls.push({
          raw: upstreamStreamCandidate,
          typeHint: declaredType,
          label: rawUrlCandidate ? 'Server Cadangan' : 'Server Utama (HD)',
          quality: cleanStr(raw.quality, 'HD'),
        });
      }

      const rawSourcesList = Array.isArray(raw.sources)
        ? (raw.sources as Array<Record<string, unknown>>)
        : Array.isArray(raw.qualities)
        ? (raw.qualities as Array<Record<string, unknown>>)
        : [];
      rawSourcesList.forEach((src, idx) => {
        const u = cleanStr(src.url ?? src.streamUrl ?? src.src ?? src.file);
        if (u) {
          candidateUrls.push({
            raw: u,
            typeHint: cleanStr(src.type, declaredType),
            label: cleanStr(src.label ?? src.name, `Server ${idx + 2}`),
            quality: cleanStr(src.quality ?? src.label, 'HD'),
          });
        }
      });

      const resolvedDirectItems: Lk21StreamServerItem[] = [];
      const resolvedEmbedItems: Lk21StreamServerItem[] = [];

      candidateUrls.forEach((cand, idx) => {
        const wrapped = wrapDirectVideoUrl(cand.raw, cand.typeHint);
        if (!wrapped) return;
        const item: Lk21StreamServerItem = {
          id: `stream-cand-${idx}`,
          name: cand.label,
          url: wrapped.url,
          type: wrapped.sourceType,
          quality: cand.quality,
        };
        if (wrapped.sourceType === 'embed') {
          resolvedEmbedItems.push(item);
        } else {
          resolvedDirectItems.push(item);
        }
      });

      if (explicitEmbedCandidate && isSafeHttpUrl(explicitEmbedCandidate)) {
        resolvedEmbedItems.push({
          id: 'explicit-embed',
          name: 'Server Embed',
          url: stripTokensFromString(explicitEmbedCandidate),
          type: 'embed',
          quality: 'HD',
        });
      }

      const rawProviders = Array.isArray(raw.providers)
        ? (raw.providers as Array<Record<string, unknown>>)
        : [];
      rawProviders.forEach((p, idx) => {
        const u = stripTokensFromString(cleanStr(p?.url));
        if (u && isSafeHttpUrl(u)) {
          resolvedEmbedItems.push({
            id: `raw-prov-${idx}`,
            name: cleanStr(p?.name, `Embed ${idx + 1}`),
            url: u,
            type: 'embed',
            quality: 'HD',
          });
        }
      });

      // Ensure we also include embed servers from detail/DB when available
      let detailProviders = dbMovie?.providers ?? [];
      if (detailProviders.length === 0 && resolvedDirectItems.length === 0 && cleanSlug) {
        const fetchedDetail = await getLk21Detail(getToken, cleanSlug).catch(() => null);
        if (fetchedDetail?.providers) {
          detailProviders = fetchedDetail.providers;
        }
      }
      detailProviders.forEach((p, idx) => {
        const u = stripTokensFromString(cleanStr(p?.url));
        if (u && isSafeHttpUrl(u)) {
          resolvedEmbedItems.push({
            id: `detail-prov-${idx}`,
            name: cleanStr(p?.name, `Embed ${idx + 1}`),
            url: u,
            type: 'embed',
            quality: dbMovie?.quality || 'HD',
          });
        }
      });

      const allServers = normalizeServerList([
        ...resolvedDirectItems,
        ...resolvedEmbedItems,
        ...buildFallbackServersFromDb(),
      ]);

      const primaryDirect = allServers.find((s) => s.type !== 'embed');
      const primaryEmbed = allServers.find((s) => s.type === 'embed');

      if (!primaryDirect && !primaryEmbed) {
        if (upstreamStreamErr instanceof Error) {
          throw upstreamStreamErr;
        }
        throw new Error('LK21 stream URL unavailable for this title');
      }

      const subtitlesRaw = Array.isArray(raw.subtitles)
        ? (raw.subtitles as Array<Record<string, unknown>>)
        : [];
      const subtitles = subtitlesRaw
        .map((s, idx) => {
          const subUrl = cleanStr(s.url ?? s.src);
          if (!subUrl || !isSafeHttpUrl(subUrl)) return null;
          return {
            id: cleanStr(s.id, `lk21-sub-${idx}`),
            label: cleanStr(s.label ?? s.lang, `Subtitle ${idx + 1}`),
            lang: cleanStr(s.lang, 'en'),
            url: subUrl.startsWith('http')
              ? `/api/lk21/proxy/subtitle?url=${encodeURIComponent(subUrl)}`
              : subUrl,
            source: 'api' as const,
          };
        })
        .filter((s): s is NonNullable<typeof s> => Boolean(s));

      const chosen = primaryDirect ?? primaryEmbed!;
      const isHls = chosen.type === 'hls';
      const qualities = allServers
        .filter((s) => s.type !== 'embed')
        .map((s) => ({ quality: s.quality || 'HD', url: s.url }));

      const payload: Lk21StreamPayload = {
        ok: true,
        type: isHls ? 'hls' : 'mp4',
        sourceType: chosen.type,
        url: chosen.url,
        streamUrl: primaryDirect ? primaryDirect.url : '',
        embedUrl: primaryEmbed ? primaryEmbed.url : undefined,
        isHls,
        title: cleanStr(raw.title, dbMovie?.title || cleanSlug),
        poster: sanitizeImageUrl(raw.poster) || dbMovie?.poster || dbMovie?.cover || '',
        subtitles,
        qualities: qualities.length > 0 ? qualities : primaryDirect ? [{ quality: 'HD', url: primaryDirect.url }] : [],
        servers: allServers,
        episodeNumber: resolvedEpNumber,
        slug: cleanSlug || upstreamSlug,
        vid: upstreamSlug,
      };

      await writeCache(cacheKey, 'stream', payload, STREAM_TTL_MS);
      const resolvedSlug = cleanSlug || dbEp?.slug || upstreamSlug;
      if (primaryDirect) {
        await Promise.all([
          upsertMovieEpisodesInDb([
            {
              slug: resolvedSlug,
              episodeNumber: resolvedEpNumber,
              vid: upstreamSlug,
              title: payload.title,
              episodeLabel: `EP ${resolvedEpNumber}`,
              streamUrl: primaryDirect.url,
              rawUrl: rawUrlCandidate || upstreamStreamCandidate,
              streamType: isHls ? 'hls' : 'mp4',
              subtitles: subtitles as unknown as Array<Record<string, unknown>>,
            },
          ]),
          upsertMovieSourcesInDb([
            {
              slug: resolvedSlug,
              episodeNumber: resolvedEpNumber,
              vid: upstreamSlug,
              sourceName: 'LK21 Primary',
              sourceType: isHls ? 'hls' : 'mp4',
              quality: primaryDirect.quality || 'HD',
              streamUrl: primaryDirect.url,
              rawUrl: rawUrlCandidate || upstreamStreamCandidate,
              subtitles: subtitles as unknown as Array<Record<string, unknown>>,
            },
          ]),
        ]);
      }

      return payload;
    });
  } catch (upstreamErr) {
    if (cached?.payload && (cached.payload.streamUrl || cached.payload.embedUrl)) {
      return {
        ...cached.payload,
        episodeNumber: resolvedEpNumber,
        slug: cleanSlug || upstreamSlug,
        vid: upstreamSlug,
      };
    }
    const staleServers = buildFallbackServersFromDb();
    const staleDirect = staleServers.find((s) => s.type !== 'embed');
    const staleEmbed = staleServers.find((s) => s.type === 'embed');
    if (staleDirect || staleEmbed) {
      const chosen = staleDirect ?? staleEmbed!;
      const staleDbSource = dbSources.find((s) => Boolean(s.streamUrl));
      return {
        ok: true,
        type: chosen.type === 'hls' ? 'hls' : 'mp4',
        sourceType: chosen.type,
        url: chosen.url,
        streamUrl: staleDirect ? staleDirect.url : '',
        embedUrl: staleEmbed ? staleEmbed.url : undefined,
        isHls: chosen.type === 'hls',
        title: dbMovie?.title || cleanSlug,
        poster: dbMovie?.poster || dbMovie?.cover || '',
        subtitles: (staleDbSource?.subtitles || []) as Lk21StreamPayload['subtitles'],
        qualities: staleDirect ? [{ quality: staleDirect.quality || 'HD', url: staleDirect.url }] : [],
        servers: staleServers,
        episodeNumber: resolvedEpNumber,
        slug: cleanSlug || upstreamSlug,
        vid: upstreamSlug,
      };
    }
    if (dbEp?.streamUrl) {
      const wrapped = wrapDirectVideoUrl(dbEp.rawUrl || dbEp.streamUrl, dbEp.streamType);
      if (wrapped) {
        return {
          ok: true,
          type: wrapped.sourceType === 'hls' ? 'hls' : 'mp4',
          sourceType: wrapped.sourceType,
          url: wrapped.url,
          streamUrl: wrapped.url,
          isHls: wrapped.sourceType === 'hls',
          title: dbEp.title || cleanSlug,
          poster: '',
          subtitles: [],
          qualities: [{ quality: 'HD', url: wrapped.url }],
          servers: [
            {
              id: 'stale-ep-db',
              name: 'Server Utama (HD)',
              url: wrapped.url,
              type: wrapped.sourceType,
              quality: 'HD',
            },
          ],
          episodeNumber: dbEp.episodeNumber || resolvedEpNumber,
          slug: dbEp.slug || cleanSlug,
          vid: upstreamSlug,
        };
      }
    }
    throw upstreamErr;
  }
}

export async function getLk21StoredSources(
  slug: string,
  episode?: number
) {
  return getMovieSourcesFromDb(slug, episode);
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '::' ||
    h.startsWith('10.') ||
    h.startsWith('127.') ||
    h.startsWith('169.254.') ||
    h.startsWith('192.168.') ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    /^(fc|fd|fe80)/i.test(h) ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

function isValidM3u8Manifest(body: string): boolean {
  const trimmed = body.replace(/^\uFEFF/, '').trimStart();
  return trimmed.startsWith('#EXTM3U');
}

export async function fetchAndRewriteLk21M3u8(
  getToken: () => string,
  targetUrl: string
): Promise<{ status: number; body: string }> {
  const parsed = new URL(targetUrl);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    isPrivateOrLocalHostname(parsed.hostname)
  ) {
    throw new Error('Disallowed m3u8 origin');
  }

  const token = getToken();
  // Always ask upstream LK21 m3u8 proxy (so relative CDN segment headers/cookies are handled properly by upstream) OR direct playcdn
  const cleanParsed = new URL(parsed.toString());
  if (cleanParsed.hostname.toLowerCase() === 'api.molatv.id') {
    cleanParsed.searchParams.delete('token');
  }
  const fetchUrl =
    cleanParsed.hostname.toLowerCase() === 'api.molatv.id'
      ? cleanParsed.toString()
      : `${LK21_UPSTREAM_BASE}/proxy/m3u8?url=${encodeURIComponent(cleanParsed.toString())}`;

  let upstream: globalThis.Response | null = null;
  let upstreamBody = '';
  try {
    upstream = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.apple.mpegurl, text/plain, */*',
        'User-Agent': DEFAULT_BROWSER_UA,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (upstream.ok) {
      upstreamBody = await upstream.text();
    }
  } catch {
    upstream = null;
    upstreamBody = '';
  }

  if (upstream && upstream.ok && isValidM3u8Manifest(upstreamBody)) {
    return {
      status: upstream.status,
      body: rewriteM3u8ManifestLines(upstreamBody, cleanParsed.toString()),
    };
  }

  // Fallback direct fetch if upstream proxy returned non-OK, HTML challenge, or non-M3U8 JSON
  if (cleanParsed.hostname.toLowerCase() !== 'api.molatv.id') {
    try {
      const direct = await fetch(cleanParsed.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.apple.mpegurl, text/plain, */*',
          'User-Agent': DEFAULT_BROWSER_UA,
          Referer: `${cleanParsed.origin}/`,
          Origin: cleanParsed.origin,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (direct.ok) {
        const directText = await direct.text();
        if (isValidM3u8Manifest(directText)) {
          return {
            status: direct.status,
            body: rewriteM3u8ManifestLines(directText, cleanParsed.toString()),
          };
        }
      }
    } catch {
      // Ignore direct fallback error and throw error below
    }
  }

  throw new Error(
    upstream && !upstream.ok
      ? `Upstream manifest error HTTP ${upstream.status}`
      : 'Upstream did not return a valid #EXTM3U playlist'
  );
}

function rewriteM3u8ManifestLines(playlist: string, baseUrl: string): string {
  const rewriteLineTarget = (target: string): string => {
    const trimmed = target.trim();
    if (!trimmed) return target;
    try {
      const stripped = stripTokensFromString(trimmed);
      // Upstream rewrites segments to `/api/lk21/proxy/segment?url=...` or child m3u8 to `/api/lk21/proxy/m3u8?url=...`
      if (stripped.startsWith('/api/lk21/proxy/')) {
        return stripped;
      }
      const abs = new URL(stripped, baseUrl).toString();
      const absParsed = new URL(abs);
      if (
        absParsed.hostname.toLowerCase() === 'api.molatv.id' &&
        absParsed.pathname.startsWith('/api/lk21/proxy/')
      ) {
        absParsed.searchParams.delete('token');
        const qs = absParsed.searchParams.toString();
        return `${absParsed.pathname}${qs ? `?${qs}` : ''}`;
      }
      const lower = abs.toLowerCase();
      if (lower.includes('.m3u8') || abs.includes('/proxy/m3u8')) {
        const innerUrl = absParsed.searchParams.get('url') || abs;
        return `/api/lk21/proxy/m3u8?url=${encodeURIComponent(innerUrl)}`;
      }
      const innerSeg = absParsed.searchParams.get('url') || abs;
      return `/api/lk21/proxy/segment?url=${encodeURIComponent(innerSeg)}`;
    } catch {
      return target;
    }
  };

  return playlist
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
          return `URI="${rewriteLineTarget(uri)}"`;
        });
      }
      return rewriteLineTarget(trimmed);
    })
    .join('\n');
}

function normalizeSegmentContentType(rawCt: string | null, pathname: string): string {
  const lowerPath = pathname.toLowerCase();
  const ct = (rawCt || '').toLowerCase();
  if (lowerPath.endsWith('.vtt') || ct.includes('text/vtt')) {
    return 'text/vtt; charset=utf-8';
  }
  if (lowerPath.endsWith('.srt')) {
    return 'text/plain; charset=utf-8';
  }
  if (lowerPath.endsWith('.mp4') || lowerPath.endsWith('.m4v') || ct.includes('video/mp4')) {
    return 'video/mp4';
  }
  if (lowerPath.endsWith('.webm') || ct.includes('video/webm')) {
    return 'video/webm';
  }
  if (lowerPath.endsWith('.m4s') || lowerPath.endsWith('.m4a') || lowerPath.endsWith('.mp4a')) {
    return ct && !ct.includes('octet-stream') ? rawCt! : 'video/iso.segment';
  }
  if (
    ct.includes('image/') ||
    ct.includes('octet-stream') ||
    !ct ||
    lowerPath.endsWith('.pict') ||
    lowerPath.endsWith('.ts')
  ) {
    return 'video/mp2t';
  }
  return rawCt || 'video/mp2t';
}

export async function fetchLk21Segment(
  targetUrl: string,
  rangeHeader?: string,
  getToken?: () => string
): Promise<{
  status: number;
  contentType: string;
  contentLength: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
  upstream: globalThis.Response;
}> {
  const parsed = new URL(targetUrl);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    isPrivateOrLocalHostname(parsed.hostname)
  ) {
    throw new Error('Disallowed segment origin');
  }

  const token = getToken ? getToken() : '';
  const headers: Record<string, string> = {
    Accept: '*/*',
    'User-Agent': DEFAULT_BROWSER_UA,
  };
  if (parsed.hostname.toLowerCase() === 'api.molatv.id') {
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Referer = `${parsed.origin}/`;
    headers.Origin = parsed.origin;
  }
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  let upstream = await fetch(parsed.toString(), {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });

  // Fallback via upstream LK21 segment proxy when CDN blocks direct server fetches (401/403/5xx)
  if (
    !upstream.ok &&
    (upstream.status === 401 || upstream.status === 403 || upstream.status >= 500) &&
    parsed.hostname.toLowerCase() !== 'api.molatv.id' &&
    token
  ) {
    try {
      const proxyUrl = `${LK21_UPSTREAM_BASE}/proxy/segment?url=${encodeURIComponent(
        parsed.toString()
      )}`;
      const fallbackRes = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'User-Agent': DEFAULT_BROWSER_UA,
          Authorization: `Bearer ${token}`,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (fallbackRes.ok || fallbackRes.status === 206) {
        upstream = fallbackRes;
      }
    } catch {
      // Keep original upstream response if proxy fallback fails
    }
  }

  const ct = normalizeSegmentContentType(
    upstream.headers.get('content-type'),
    parsed.pathname
  );

  return {
    status: upstream.status,
    contentType: ct,
    contentLength: upstream.headers.get('content-length'),
    contentRange: upstream.headers.get('content-range'),
    acceptRanges: upstream.headers.get('accept-ranges'),
    upstream,
  };
}

export async function fetchLk21Subtitle(
  targetUrl: string
): Promise<{ status: number; contentType: string; body: string }> {
  const parsed = new URL(targetUrl);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    isPrivateOrLocalHostname(parsed.hostname)
  ) {
    throw new Error('Disallowed subtitle origin');
  }

  const upstream = await fetch(parsed.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/vtt, text/plain, */*',
      'User-Agent': DEFAULT_BROWSER_UA,
      Referer: `${parsed.origin}/`,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });

  const body = await upstream.text();
  const lower = parsed.pathname.toLowerCase();
  const ct = lower.endsWith('.vtt')
    ? 'text/vtt; charset=utf-8'
    : 'text/plain; charset=utf-8';
  return {
    status: upstream.status,
    contentType: ct,
    body,
  };
}

export function startLk21Prewarm(getToken: () => string): void {
  const timer = setTimeout(() => {
    const token = getToken();
    if (!token) return;
    void Promise.allSettled([
      getLk21Home(getToken),
      getLk21Menu(getToken),
      getLk21Latest(getToken, 1),
    ]);
  }, 2200);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}
