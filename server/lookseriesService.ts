import {
  getLk21CacheFromDb,
  getTrendingStatsMapFromDb,
  setLk21CacheInDb,
  upsertMoviesBatchInDb,
  type LiveDramaBadgeStat,
  type MovieUpsertInput,
} from './db.ts';
import type {
  Lk21DetailPayload,
  Lk21EpisodePayloadItem,
  Lk21EpisodesPayload,
  Lk21ListPayload,
  Lk21MovieCard,
  Lk21StreamPayload,
} from './lk21Service.ts';

const LOOKSERIES_UPSTREAM_BASE = 'https://api.molatv.id/api/lookseries';

const LIST_TTL_MS = 20 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const DETAIL_TTL_MS = 45 * 60 * 1000;
const EPISODES_TTL_MS = 30 * 60 * 1000;
const STREAM_TTL_MS = 15 * 60 * 1000;

export type LookSeriesFeedSection = 'foryou' | 'film' | 'series' | 'kartun';

export const LOOKSERIES_TOPIC_CATEGORIES: ReadonlyArray<{
  topicId: string;
  label: string;
}> = [
  { topicId: 'netflix', label: 'Netflix' },
  { topicId: 'prime', label: 'Prime Video' },
  { topicId: 'hotstar', label: 'Hotstar' },
  { topicId: 'viu', label: 'Viu' },
  { topicId: 'vidio', label: 'Vidio' },
  { topicId: 'anime', label: 'Anime' },
];

export interface LookSeriesCard extends Omit<Lk21MovieCard, 'app'> {
  app: 'lookseries';
  bookId: string;
  chapterCount: number;
  director?: string;
  actors?: string[];
  year?: string;
}

export interface LookSeriesListPayload extends Omit<Lk21ListPayload, 'items'> {
  app: 'lookseries';
  section?: string;
  topicId?: string;
  items: LookSeriesCard[];
}

export interface LookSeriesDetailPayload
  extends Omit<Lk21DetailPayload, 'app' | 'recommendations'> {
  app: 'lookseries';
  bookId: string;
  chapterCount: number;
  recommendations: LookSeriesCard[];
}

export interface LookSeriesEpisodePayloadItem extends Lk21EpisodePayloadItem {
  chapterId?: string;
  chapterIndex?: number;
  chapterIndex0?: number;
}

export interface LookSeriesEpisodesPayload
  extends Omit<Lk21EpisodesPayload, 'app' | 'episodes'> {
  app: 'lookseries';
  bookId: string;
  episodes: LookSeriesEpisodePayloadItem[];
}

const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const memoryCache = new Map<
  string,
  { payload: unknown; updatedAt: number; expiresAt: number }
>();
const inFlight = new Map<string, Promise<unknown>>();
const streamHeaderStore = new Map<
  string,
  { headers: Record<string, string>; expiresAt: number }
>();

function cleanStr(val: unknown, fallback = ''): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
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

function toMovieUpsertFromLookSeries(
  card: LookSeriesCard,
  popularityScore = 1000
): MovieUpsertInput {
  const ratingNum = parseFloat(card.rating || '0');
  const score = Math.max(
    popularityScore,
    Number.isFinite(ratingNum) ? Math.round(ratingNum * 1000) : 1000
  );
  return {
    slug: card.slug,
    movieId: card.bookId || card.id || card.slug,
    title: card.title,
    cover: card.cover,
    coverHz: card.coverHz || card.cover,
    poster: card.coverVt || card.cover,
    synopsis: card.description,
    year: card.year || '',
    director: card.director || '',
    actors: card.actors || [],
    genres: card.genre || [],
    rating: card.rating,
    quality: card.quality,
    badge: card.badge,
    movieType: card.type || 'series',
    updateInfo: card.updateInfo,
    movieJson: card as unknown as Record<string, unknown>,
    popularityScore: score,
  };
}

async function persistLookSeriesMovies(
  cards: LookSeriesCard[],
  detail?: LookSeriesDetailPayload
): Promise<void> {
  const dedup = new Map<string, MovieUpsertInput>();
  if (detail && detail.slug && detail.title) {
    const ratingNum = parseFloat(detail.rating || '0');
    dedup.set(detail.slug, {
      slug: detail.slug,
      movieId: detail.bookId || detail.id || detail.slug,
      title: detail.title,
      cover: detail.cover,
      coverHz: detail.coverHz || detail.cover,
      poster: detail.poster || detail.cover,
      synopsis: detail.synopsis || detail.description || '',
      year: detail.year || '',
      area: detail.area || '',
      director: detail.director || '',
      actors: detail.actors || [],
      genres: detail.genres || [],
      rating: detail.rating || '',
      quality: detail.quality || 'HD',
      badge: detail.type === 'series' ? 'Series' : 'Movie',
      movieType: detail.type || 'series',
      updateInfo: detail.updateInfo || '',
      providers: detail.providers || [],
      recommendations: (detail.recommendations || []) as unknown as Array<Record<string, unknown>>,
      movieJson: detail as unknown as Record<string, unknown>,
      popularityScore: Number.isFinite(ratingNum) && ratingNum > 0 ? Math.round(ratingNum * 1000) : 2500,
    });
  }
  cards.forEach((c, idx) => {
    if (!c?.slug || !c?.title || dedup.has(c.slug)) return;
    dedup.set(c.slug, toMovieUpsertFromLookSeries(c, Math.max(500, 4500 - idx * 25)));
  });
  if (dedup.size > 0) {
    await upsertMoviesBatchInDb(Array.from(dedup.values()));
  }
}

function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return s || 'title';
}

export function buildLookSeriesSlug(bookId: string, title?: string): string {
  const cleanId = cleanStr(bookId);
  if (!cleanId) return '';
  if (/^ls-/i.test(cleanId)) return cleanId.toLowerCase();
  const titleSlug = title ? slugifyTitle(title) : '';
  return titleSlug ? `ls-${cleanId}-${titleSlug}` : `ls-${cleanId}`;
}

export function extractLookSeriesBookId(input: string): string {
  const raw = cleanStr(input);
  if (!raw) return '';
  const match = raw.match(/^ls-([^-/]+)(?:-|$)/i);
  if (match && match[1]) return match[1].trim();
  return raw;
}

function stripTokensFromString(input: string): string {
  if (!input) return input;
  return input
    .replace(/([?&])token=[^&]*/gi, '$1')
    .replace(/[?&]$/, '')
    .replace(/\?&/, '?');
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

function parseActorsField(rawActor: unknown, rawActors: unknown): string[] {
  if (Array.isArray(rawActors)) {
    return rawActors.map((a) => cleanStr(a)).filter(Boolean);
  }
  if (Array.isArray(rawActor)) {
    return rawActor.map((a) => cleanStr(a)).filter(Boolean);
  }
  const str = cleanStr(rawActor ?? rawActors);
  if (!str) return [];
  return str
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseGenreTags(raw: Record<string, unknown>, year: string, isCartoon = false): string[] {
  const candidate = raw.genres ?? raw.genre ?? raw.tags ?? raw.category;
  const list = Array.isArray(candidate)
    ? candidate.map((g) => cleanStr(g)).filter(Boolean)
    : typeof candidate === 'string'
    ? candidate
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (isCartoon && !list.some((t) => /anim|kartun/i.test(t))) {
    list.unshift('Animation');
  }
  if (list.length === 0 && year) {
    list.push(year);
  }
  return Array.from(new Set(list)).slice(0, 8);
}

function extractRecordsArray(raw: Record<string, unknown>): Record<string, unknown>[] {
  const data = raw.data;
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.records)) return d.records as Record<string, unknown>[];
    if (Array.isArray(d.items)) return d.items as Record<string, unknown>[];
    if (Array.isArray(d.list)) return d.list as Record<string, unknown>[];
    if (Array.isArray(d.data)) return d.data as Record<string, unknown>[];
  }
  if (Array.isArray(raw.records)) return raw.records as Record<string, unknown>[];
  if (Array.isArray(raw.items)) return raw.items as Record<string, unknown>[];
  if (Array.isArray(raw.list)) return raw.list as Record<string, unknown>[];
  return [];
}

function normalizeLookSeriesCard(
  raw: Record<string, unknown>,
  sectionHint?: string
): LookSeriesCard | null {
  const bookId = cleanStr(raw.bookId ?? raw.id ?? raw.slug);
  const title = cleanStr(raw.title ?? raw.bookName ?? raw.name);
  if (!bookId || !title) return null;

  const cover = sanitizeImageUrl(
    raw.cover ?? raw.coverUrl ?? raw.poster ?? raw.coverVt ?? raw.coverHz
  );
  const coverHz = sanitizeImageUrl(
    raw.coverHz ?? raw.cover ?? raw.coverUrl ?? raw.poster
  );
  const coverVt = sanitizeImageUrl(
    raw.coverVt ?? raw.cover ?? raw.coverUrl ?? raw.poster
  );
  const chapterCount = Math.max(
    1,
    Number(raw.chapterCount ?? raw.totalEpisodes ?? raw.episodeCount) || 1
  );
  const year = cleanStr(raw.year);
  const director = cleanStr(raw.director);
  const actors = parseActorsField(raw.actor, raw.actors);
  const isSeries =
    sectionHint === 'series' ||
    chapterCount > 1 ||
    /\bseason\s*\d+/i.test(title) ||
    cleanStr(raw.type).toLowerCase() === 'series';
  const genre = parseGenreTags(raw, year, sectionHint === 'kartun');
  const slug = buildLookSeriesSlug(bookId, title);
  const description = cleanStr(
    raw.description ?? raw.synopsis ?? raw.intro,
    actors.length > 0
      ? `Watch free ${title}${year ? ` (${year})` : ''} starring ${actors.slice(0, 3).join(', ')} in HD on KanoDrama.`
      : `Watch free ${title}${year ? ` (${year})` : ''} in HD on KanoDrama Movies.`
  );

  return {
    id: bookId,
    bookId,
    slug,
    app: 'lookseries',
    title,
    cover,
    coverHz: coverHz || cover,
    coverVt: coverVt || cover,
    rating: cleanStr(raw.rating),
    quality: cleanStr(raw.quality, 'HD'),
    badge: cleanStr(raw.badge) || (isSeries ? `${chapterCount} EP` : year || 'HD'),
    subtitle: year || (isSeries ? 'Series' : 'Film'),
    description,
    genre,
    updateInfo: isSeries
      ? `${chapterCount} Episodes`
      : year
      ? `Film • ${year}`
      : 'Full Movie',
    type: isSeries ? 'series' : 'movie',
    is_movie: !isSeries,
    chapterCount,
    director: director || undefined,
    actors: actors.length > 0 ? actors : undefined,
    year: year || undefined,
  };
}

async function readCache<T>(cacheKey: string): Promise<{
  payload: T;
  updatedAt: number;
  expiresAt: number;
  stale: boolean;
} | null> {
  const now = Date.now();
  const mem = memoryCache.get(cacheKey);
  if (mem) {
    return {
      payload: mem.payload as T,
      updatedAt: mem.updatedAt,
      expiresAt: mem.expiresAt,
      stale: now > mem.expiresAt,
    };
  }
  const db = await getLk21CacheFromDb(cacheKey).catch(() => null);
  if (db) {
    memoryCache.set(cacheKey, {
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
  if (memoryCache.size > 350) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
  memoryCache.set(cacheKey, { payload, updatedAt: now, expiresAt });
  await setLk21CacheInDb(cacheKey, endpoint, payload, ttlMs);
}

function runDeduplicated<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

function attachStatsToCards(
  items: LookSeriesCard[],
  statsMap: Record<string, LiveDramaBadgeStat>
): LookSeriesCard[] {
  return items.map((item) => {
    const stat =
      statsMap[`LookSeries:${item.bookId}`] || statsMap[`LookSeries:${item.slug}`];
    if (!stat) return item;
    return {
      ...item,
      dailyViews: stat.dailyViews,
      totalViews: stat.totalViews,
      trendBadge: stat.trendBadge,
    };
  });
}

async function fetchUpstreamLookSeriesJson(
  token: string,
  endpoint: string,
  params?: Record<string, string | number>,
  timeoutMs = 12000
): Promise<Record<string, unknown>> {
  const url = new URL(`${LOOKSERIES_UPSTREAM_BASE}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v) !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  url.searchParams.set('token', token);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`LookSeries upstream HTTP ${res.status}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`LookSeries upstream invalid JSON (${endpoint})`);
  }
}

export async function getLookSeriesFeed(
  getToken: () => string,
  section: LookSeriesFeedSection,
  page = 1
): Promise<LookSeriesListPayload> {
  const safePage = Math.max(1, Math.floor(page || 1));
  const cacheKey = `lookseries:feed:${section}:${safePage}`;
  const cached = await readCache<LookSeriesListPayload>(cacheKey);

  const sectionLabels: Record<LookSeriesFeedSection, string> = {
    foryou: 'LookSeries: For You',
    film: 'LookSeries: Films',
    series: 'LookSeries: Series',
    kartun: 'LookSeries: Kartun & Anime',
  };

  const refresh = async (): Promise<LookSeriesListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLookSeriesJson(token, `/${section}`, {
      page: safePage,
    });
    const records = extractRecordsArray(raw);
    const items = records
      .map((r) => normalizeLookSeriesCard(r, section))
      .filter((it): it is LookSeriesCard => Boolean(it));

    const payload: LookSeriesListPayload = {
      ok: true,
      app: 'lookseries',
      section,
      key: `lookseries.${section}`,
      label: sectionLabels[section],
      page: safePage,
      count: items.length,
      hasMore: items.length >= 10,
      items,
    };

    if (items.length > 0) {
      await writeCache(cacheKey, `lookseries-${section}`, payload, LIST_TTL_MS);
      void persistLookSeriesMovies(items).catch(() => {});
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
      items: attachStatsToCards(cached.payload.items, statsMap),
    };
  }

  try {
    const fresh = await runDeduplicated(cacheKey, refresh);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...fresh,
      items: attachStatsToCards(fresh.items, statsMap),
    };
  } catch {
    return {
      ok: true,
      app: 'lookseries',
      section,
      key: `lookseries.${section}`,
      label: sectionLabels[section],
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
}

export async function getLookSeriesCategory(
  getToken: () => string,
  topicId = 'netflix',
  page = 1
): Promise<LookSeriesListPayload> {
  const cleanTopic = cleanStr(topicId, 'netflix').toLowerCase();
  const safePage = Math.max(1, Math.floor(page || 1));
  const cacheKey = `lookseries:category:${cleanTopic}:${safePage}`;
  const cached = await readCache<LookSeriesListPayload>(cacheKey);

  const label =
    LOOKSERIES_TOPIC_CATEGORIES.find((c) => c.topicId === cleanTopic)?.label ||
    cleanTopic.toUpperCase();

  const refresh = async (): Promise<LookSeriesListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLookSeriesJson(token, '/category', {
      topic_id: cleanTopic,
      page: safePage,
    });
    const records = extractRecordsArray(raw);
    const items = records
      .map((r) => normalizeLookSeriesCard(r, cleanTopic === 'anime' ? 'kartun' : undefined))
      .filter((it): it is LookSeriesCard => Boolean(it));

    const payload: LookSeriesListPayload = {
      ok: true,
      app: 'lookseries',
      topicId: cleanTopic,
      key: `lookseries.topic.${cleanTopic}`,
      label: `LookSeries: ${label}`,
      page: safePage,
      count: items.length,
      hasMore: items.length >= 10,
      items,
    };

    if (items.length > 0) {
      await writeCache(cacheKey, 'lookseries-category', payload, LIST_TTL_MS);
      void persistLookSeriesMovies(items).catch(() => {});
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
      items: attachStatsToCards(cached.payload.items, statsMap),
    };
  }

  try {
    const fresh = await runDeduplicated(cacheKey, refresh);
    const statsMap = await getTrendingStatsMapFromDb(250).catch(() => ({}));
    return {
      ...fresh,
      items: attachStatsToCards(fresh.items, statsMap),
    };
  } catch {
    return {
      ok: true,
      app: 'lookseries',
      topicId: cleanTopic,
      key: `lookseries.topic.${cleanTopic}`,
      label: `LookSeries: ${label}`,
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
}

export async function getLookSeriesSearch(
  getToken: () => string,
  q: string,
  page = 1
): Promise<LookSeriesListPayload> {
  const cleanQ = cleanStr(q);
  const safePage = Math.max(1, Math.floor(page || 1));
  if (!cleanQ) {
    return {
      ok: true,
      app: 'lookseries',
      q: '',
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }

  const cacheKey = `lookseries:search:${cleanQ.toLowerCase()}:${safePage}`;
  const cached = await readCache<LookSeriesListPayload>(cacheKey);

  const refresh = async (): Promise<LookSeriesListPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLookSeriesJson(token, '/search', {
      keyword: cleanQ,
      page: safePage,
    });
    const records = extractRecordsArray(raw);
    const items = records
      .map((r) => normalizeLookSeriesCard(r))
      .filter((it): it is LookSeriesCard => Boolean(it));
    const payload: LookSeriesListPayload = {
      ok: true,
      app: 'lookseries',
      q: cleanQ,
      page: safePage,
      count: items.length,
      hasMore: items.length >= 10,
      items,
    };
    await writeCache(cacheKey, 'lookseries-search', payload, SEARCH_TTL_MS);
    return payload;
  };

  if (cached && cached.payload && Array.isArray(cached.payload.items)) {
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
      app: 'lookseries',
      q: cleanQ,
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
}

export async function getLookSeriesDetail(
  getToken: () => string,
  rawBookId: string
): Promise<LookSeriesDetailPayload | null> {
  const bookId = extractLookSeriesBookId(rawBookId);
  if (!bookId) return null;

  const cacheKey = `lookseries:detail:${bookId}`;
  const cached = await readCache<LookSeriesDetailPayload>(cacheKey);

  const refresh = async (): Promise<LookSeriesDetailPayload | null> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLookSeriesJson(token, '/detail', {
      book_id: bookId,
    });
    const d =
      raw.data && typeof raw.data === 'object'
        ? (raw.data as Record<string, unknown>)
        : raw;

    const title = cleanStr(d.title ?? d.bookName ?? d.name);
    if (!title) return null;

    const cover = sanitizeImageUrl(
      d.cover ?? d.coverUrl ?? d.poster ?? d.coverVt
    );
    const poster = sanitizeImageUrl(
      d.poster ?? d.cover ?? d.coverUrl ?? d.coverVt
    );
    const coverHz = sanitizeImageUrl(
      d.coverHz ?? d.poster ?? d.cover ?? d.coverUrl
    );
    const chapterCount = Math.max(
      1,
      Number(d.chapterCount ?? d.totalEpisodes ?? d.episodeCount) || 1
    );
    const year = cleanStr(d.year);
    const director = cleanStr(d.director);
    const actors = parseActorsField(d.actor, d.actors);
    const genres = parseGenreTags(d, year);
    const slug = buildLookSeriesSlug(bookId, title);
    const isSeries =
      chapterCount > 1 ||
      /\bseason\s*\d+/i.test(title) ||
      cleanStr(d.type).toLowerCase() === 'series';

    const synopsis = cleanStr(
      d.synopsis ?? d.description ?? d.intro,
      `Watch free ${title}${year ? ` (${year})` : ''} in Full HD on KanoDrama LookSeries.`
    );

    const recsRaw = Array.isArray(d.recommendations)
      ? (d.recommendations as Record<string, unknown>[])
      : Array.isArray(raw.recommendations)
      ? (raw.recommendations as Record<string, unknown>[])
      : [];
    const recommendations = recsRaw
      .map((r) => normalizeLookSeriesCard(r))
      .filter((r): r is LookSeriesCard => Boolean(r));

    const detail: LookSeriesDetailPayload = {
      ok: true,
      id: bookId,
      bookId,
      slug,
      app: 'lookseries',
      title,
      cover,
      coverHz: coverHz || cover,
      poster: poster || cover,
      synopsis,
      description: synopsis,
      actors,
      director,
      year,
      area: cleanStr(d.area ?? d.country),
      genres,
      rating: cleanStr(d.rating),
      quality: cleanStr(d.quality, 'HD'),
      type: isSeries ? 'series' : 'movie',
      updateInfo: isSeries ? `${chapterCount} Episodes` : year || 'Full Movie',
      chapterCount,
      providers: [],
      recommendations,
    };

    await writeCache(cacheKey, 'lookseries-detail', detail, DETAIL_TTL_MS);
    void persistLookSeriesMovies(recommendations, detail).catch(() => {});
    return detail;
  };

  if (cached && cached.payload && cached.payload.title) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  try {
    return await runDeduplicated(cacheKey, refresh);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/\bHTTP 404\b/i.test(msg)) {
      return null;
    }
    throw err;
  }
}

export async function getLookSeriesEpisodes(
  getToken: () => string,
  rawBookId: string
): Promise<LookSeriesEpisodesPayload> {
  const bookId = extractLookSeriesBookId(rawBookId);
  if (!bookId) {
    return {
      ok: true,
      app: 'lookseries',
      id: '',
      bookId: '',
      slug: '',
      title: '',
      count: 0,
      episodes: [],
    };
  }

  const cacheKey = `lookseries:allepisode:${bookId}`;
  const cached = await readCache<LookSeriesEpisodesPayload>(cacheKey);

  const refresh = async (): Promise<LookSeriesEpisodesPayload> => {
    const token = getToken();
    if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');
    const raw = await fetchUpstreamLookSeriesJson(token, '/allepisode', {
      book_id: bookId,
    });

    const dataObj =
      raw.data && typeof raw.data === 'object'
        ? (raw.data as Record<string, unknown>)
        : null;
    const rawList = Array.isArray(raw.episodes)
      ? (raw.episodes as Record<string, unknown>[])
      : Array.isArray(dataObj?.episodes)
      ? (dataObj!.episodes as Record<string, unknown>[])
      : Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>[])
      : Array.isArray(raw.list)
      ? (raw.list as Record<string, unknown>[])
      : [];

    const rawNumericOrders = rawList
      .map((ep) => {
        const raw = ep.chapterIndex ?? ep.episodeNo ?? ep.episode ?? ep.order;
        if (raw === null || raw === undefined || raw === '') return -1;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
      })
      .filter((n) => n >= 0);
    const hasZeroBasedIndex =
      rawNumericOrders.length > 0 && Math.min(...rawNumericOrders) === 0;
    const seenOrders = new Set<number>();

    const episodes: LookSeriesEpisodePayloadItem[] = rawList
      .map((ep, idx) => {
        const rawOrderField =
          ep.chapterIndex ?? ep.episodeNo ?? ep.episode ?? ep.order;
        const parsedOrder =
          rawOrderField !== null &&
          rawOrderField !== undefined &&
          rawOrderField !== ''
            ? Number(rawOrderField)
            : NaN;
        let order =
          Number.isFinite(parsedOrder) && parsedOrder >= 0
            ? hasZeroBasedIndex
              ? Math.floor(parsedOrder) + 1
              : Math.max(1, Math.floor(parsedOrder))
            : idx + 1;
        while (seenOrders.has(order)) {
          order += 1;
        }
        seenOrders.add(order);

        const rawIdx0 = ep.chapterIndex0;
        const chapterIndex0 =
          typeof rawIdx0 === 'number' && Number.isFinite(rawIdx0) && rawIdx0 >= 0
            ? Math.floor(rawIdx0)
            : typeof rawIdx0 === 'string' && /^\d+$/.test(rawIdx0.trim())
            ? Number(rawIdx0.trim())
            : hasZeroBasedIndex && Number.isFinite(parsedOrder) && parsedOrder >= 0
            ? Math.floor(parsedOrder)
            : Math.max(0, order - 1);
        const chapterId = cleanStr(
          ep.chapterId ?? ep.id ?? ep.vid,
          `${bookId}-ep-${order}`
        );
        const chapterName = cleanStr(
          ep.chapterName ?? ep.name ?? ep.title,
          String(order)
        );
        const epLabel = /^\d+$/.test(chapterName)
          ? `EP ${chapterName}`
          : chapterName;
        return {
          id: chapterId,
          vid: chapterId,
          chapterId,
          chapterIndex: order,
          chapterIndex0,
          title: epLabel,
          episode: String(order),
          manEpisode: epLabel,
          order,
        };
      })
      .sort((a, b) => a.order - b.order);

    const payload: LookSeriesEpisodesPayload = {
      ok: true,
      app: 'lookseries',
      id: bookId,
      bookId,
      slug: buildLookSeriesSlug(bookId),
      title: cleanStr(raw.title ?? dataObj?.title, bookId),
      count: episodes.length,
      episodes,
    };

    if (episodes.length > 0) {
      await writeCache(cacheKey, 'lookseries-allepisode', payload, EPISODES_TTL_MS);
    }
    return payload;
  };

  if (cached && cached.payload && cached.payload.episodes.length > 0) {
    if (cached.stale) {
      void runDeduplicated(cacheKey, refresh).catch(() => {});
    }
    return cached.payload;
  }

  try {
    const res = await runDeduplicated(cacheKey, refresh);
    if (res.episodes.length > 0) return res;
  } catch {
    // Fall through to safe 1-episode fail-open fallback
  }

  return {
    ok: true,
    app: 'lookseries',
    id: bookId,
    bookId,
    slug: buildLookSeriesSlug(bookId),
    title: bookId,
    count: 1,
    episodes: [
      {
        id: `${bookId}-ep-1`,
        vid: `${bookId}-ep-1`,
        chapterIndex: 1,
        chapterIndex0: 0,
        title: 'Episode 1',
        episode: '1',
        manEpisode: 'EP 1',
        order: 1,
      },
    ],
  };
}

const streamProxyOriginStore = new Map<
  string,
  { proxyBase: string; expiresAt: number }
>();
const streamRefreshInFlight = new Map<string, Promise<Lk21StreamPayload>>();

function isLikelyLookSeriesEmbedUrl(url: string, declaredType = ''): boolean {
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
    /\/(embed|iframe|player)\//i.test(lower) ||
    /(playeriframe|hownetwork|turbovid|emturbovid|hydrax|fembed|dood|streamtape|filemoon|mixdrop|voe\.sx|vidhide|streamwish)/i.test(
      lower
    )
  );
}

function normalizeHeaderMap(headersRaw: unknown): Record<string, string> {
  if (!headersRaw || typeof headersRaw !== 'object') return {};
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headersRaw as Record<string, unknown>)) {
    const strVal = cleanStr(v);
    if (
      strVal &&
      !/^(host|content-length|connection|transfer-encoding|upgrade|keep-alive)$/i.test(
        k
      )
    ) {
      normalized[k] = strVal;
    }
  }
  return normalized;
}

async function storeStreamHeaders(
  streamKey: string,
  originHost: string,
  headersRaw: unknown
): Promise<Record<string, string>> {
  const normalized = normalizeHeaderMap(headersRaw);
  if (Object.keys(normalized).length === 0) return {};

  if (streamHeaderStore.size > 400) {
    const first = streamHeaderStore.keys().next().value;
    if (first) streamHeaderStore.delete(first);
  }
  const ttlMs = 60 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  streamHeaderStore.set(streamKey, { headers: normalized, expiresAt });
  if (originHost) {
    streamHeaderStore.set(`host:${originHost}`, {
      headers: normalized,
      expiresAt,
    });
  }
  // Persist server-side only (never returned in client stream JSON) so restarts/cold cache hits keep CDN headers
  await writeCache(
    `lookseries:headers:${streamKey}`,
    'lookseries-headers',
    normalized,
    ttlMs
  ).catch(() => {});
  return normalized;
}

function storeUpstreamProxyOrigin(streamKey: string | undefined, fullUrl: string) {
  if (!streamKey || !fullUrl) return;
  try {
    const parsed = new URL(fullUrl);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !isPrivateOrLocalHostname(parsed.hostname) &&
      parsed.pathname.includes('/lookseries/proxy') &&
      parsed.hostname.toLowerCase() !== 'api.molatv.id'
    ) {
      const proxyBase = `${parsed.origin}${parsed.pathname}`;
      if (streamProxyOriginStore.size > 400) {
        const first = streamProxyOriginStore.keys().next().value;
        if (first) streamProxyOriginStore.delete(first);
      }
      streamProxyOriginStore.set(streamKey, {
        proxyBase,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
    }
  } catch {
    // Ignore malformed proxy origin
  }
}

function getStoredUpstreamProxyOrigin(streamKey?: string): string {
  if (!streamKey) return '';
  const hit = streamProxyOriginStore.get(streamKey);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.proxyBase;
  }
  return '';
}

function getStoredStreamHeadersFromMemory(
  streamKey?: string,
  targetUrl?: string
): Record<string, string> {
  const now = Date.now();
  if (streamKey) {
    const hit = streamHeaderStore.get(streamKey);
    if (hit && now < hit.expiresAt) return hit.headers;
  }
  if (targetUrl) {
    try {
      const host = new URL(targetUrl).hostname.toLowerCase();
      const hostHit = streamHeaderStore.get(`host:${host}`);
      if (hostHit && now < hostHit.expiresAt) return hostHit.headers;
    } catch {
      // Ignore malformed URL
    }
  }
  return {};
}

async function resolveStreamHeaders(
  getToken: () => string,
  streamKey?: string,
  targetUrl?: string
): Promise<Record<string, string>> {
  const memHit = getStoredStreamHeadersFromMemory(streamKey, targetUrl);
  if (Object.keys(memHit).length > 0) return memHit;

  if (streamKey) {
    const dbHit = await readCache<Record<string, string>>(
      `lookseries:headers:${streamKey}`
    ).catch(() => null);
    if (dbHit?.payload && Object.keys(dbHit.payload).length > 0) {
      let host = '';
      try {
        if (targetUrl) host = new URL(targetUrl).hostname.toLowerCase();
      } catch {
        host = '';
      }
      const expiresAt = Date.now() + 60 * 60 * 1000;
      streamHeaderStore.set(streamKey, { headers: dbHit.payload, expiresAt });
      if (host) {
        streamHeaderStore.set(`host:${host}`, { headers: dbHit.payload, expiresAt });
      }
      return dbHit.payload;
    }

    const parts = streamKey.split(':');
    const bookId = parts[0];
    const parsedEp = Number(parts[1]);
    const episode = Number.isFinite(parsedEp) && parsedEp >= 0 ? parsedEp : 1;
    const chapterId = parts[2] || undefined;
    if (bookId && getToken()) {
      try {
        await runDeduplicatedRefresh(streamKey, () =>
          getLookSeriesStream(getToken, {
            bookId,
            episode,
            chapterId,
            forceRefresh: true,
          })
        );
        return getStoredStreamHeadersFromMemory(streamKey, targetUrl);
      } catch {
        // Ignore lazy header hydration failure
      }
    }
  }
  return {};
}

function runDeduplicatedRefresh(
  streamKey: string,
  loader: () => Promise<Lk21StreamPayload>
): Promise<Lk21StreamPayload> {
  const existing = streamRefreshInFlight.get(streamKey);
  if (existing) return existing;
  const p = loader().finally(() => {
    streamRefreshInFlight.delete(streamKey);
  });
  streamRefreshInFlight.set(streamKey, p);
  return p;
}

function unwrapUpstreamProxyInnerUrl(rawUrl: string): string {
  const cleaned = stripTokensFromString(cleanStr(rawUrl));
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.pathname.includes('/lookseries/proxy')) {
      const inner = parsed.searchParams.get('url');
      if (inner && isSafeHttpUrl(inner)) {
        return inner;
      }
    }
  } catch {
    // Keep original cleaned URL
  }
  return cleaned;
}

interface ExtractedStreamCandidate {
  url: string;
  rawProxyUrl?: string;
  quality: string;
  label: string;
  typeHint: string;
  headers?: Record<string, string>;
}

function extractStreamCandidatesFromNode(
  node: unknown,
  defaultLabel = 'LookSeries HD'
): ExtractedStreamCandidate[] {
  const results: ExtractedStreamCandidate[] = [];
  if (!node || typeof node !== 'object') return results;
  const obj = node as Record<string, unknown>;
  const nodeHeaders = normalizeHeaderMap(obj.headers);
  const nodeFormat = cleanStr(obj.format ?? obj.type ?? obj.mimeType).toLowerCase();
  const nodeQuality = cleanStr(obj.quality ?? obj.resolution ?? obj.res, 'HD');

  const directRawUrl = cleanStr(
    obj.playUrlRaw ??
      obj.streamUrl ??
      obj.videoUrl ??
      obj.m3u8Url ??
      obj.mp4Url ??
      obj.hlsUrl ??
      obj.hls ??
      obj.file ??
      obj.src ??
      obj.url
  );
  const directProxyUrl = cleanStr(obj.playUrl);
  const unwrapped =
    unwrapUpstreamProxyInnerUrl(directRawUrl) ||
    unwrapUpstreamProxyInnerUrl(directProxyUrl);

  if (unwrapped && isSafeHttpUrl(unwrapped)) {
    results.push({
      url: unwrapped,
      rawProxyUrl: directProxyUrl && isSafeHttpUrl(directProxyUrl) ? directProxyUrl : undefined,
      quality: nodeQuality,
      label: cleanStr(obj.label ?? obj.name ?? obj.server, defaultLabel),
      typeHint: nodeFormat,
      headers: Object.keys(nodeHeaders).length > 0 ? nodeHeaders : undefined,
    });
  }

  const arrayKeys = ['streams', 'qualities', 'sources', 'servers', 'urls', 'links', 'list'];
  for (const k of arrayKeys) {
    const arr = obj[k];
    if (!Array.isArray(arr)) continue;
    arr.forEach((item, idx) => {
      if (typeof item === 'string') {
        const inner = unwrapUpstreamProxyInnerUrl(item);
        if (inner && isSafeHttpUrl(inner)) {
          results.push({
            url: inner,
            quality: nodeQuality,
            label: `${defaultLabel} ${idx + 1}`,
            typeHint: nodeFormat,
            headers: Object.keys(nodeHeaders).length > 0 ? nodeHeaders : undefined,
          });
        }
        return;
      }
      if (item && typeof item === 'object') {
        const sub = item as Record<string, unknown>;
        const subRaw = cleanStr(
          sub.playUrlRaw ??
            sub.streamUrl ??
            sub.videoUrl ??
            sub.m3u8Url ??
            sub.mp4Url ??
            sub.hlsUrl ??
            sub.src ??
            sub.file ??
            sub.url ??
            sub.playUrl
        );
        const subProxy = cleanStr(sub.playUrl);
        const subUnwrapped =
          unwrapUpstreamProxyInnerUrl(subRaw) ||
          unwrapUpstreamProxyInnerUrl(subProxy);
        if (subUnwrapped && isSafeHttpUrl(subUnwrapped)) {
          const subHeaders = normalizeHeaderMap(sub.headers ?? obj.headers);
          const q = cleanStr(sub.quality ?? sub.resolution ?? sub.label, nodeQuality);
          results.push({
            url: subUnwrapped,
            rawProxyUrl: subProxy && isSafeHttpUrl(subProxy) ? subProxy : undefined,
            quality: q,
            label: cleanStr(
              sub.name ?? sub.server ?? sub.label,
              q !== 'HD' ? `LookSeries ${q}` : `LookSeries Server ${idx + 1}`
            ),
            typeHint: cleanStr(sub.format ?? sub.type, nodeFormat).toLowerCase(),
            headers: Object.keys(subHeaders).length > 0 ? subHeaders : undefined,
          });
        }
      }
    });
  }

  return results;
}

function extractSubtitlesFromNode(node: unknown) {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  const rawSubs = Array.isArray(obj.subtitles)
    ? obj.subtitles
    : Array.isArray(obj.subs)
    ? obj.subs
    : Array.isArray(obj.tracks)
    ? obj.tracks
    : Array.isArray(obj.captions)
    ? obj.captions
    : [];

  return (rawSubs as Array<Record<string, unknown>>)
    .map((s, idx) => {
      if (!s || typeof s !== 'object') return null;
      const subUrl = stripTokensFromString(cleanStr(s.url ?? s.src ?? s.file));
      if (!subUrl || !isSafeHttpUrl(subUrl)) return null;
      return {
        id: cleanStr(s.id, `ls-sub-${idx}`),
        label: cleanStr(
          s.label ?? s.name ?? s.language ?? s.lang,
          `Subtitle ${idx + 1}`
        ),
        lang: cleanStr(s.lang ?? s.language, 'id'),
        url: subUrl.startsWith('http')
          ? `/api/lk21/proxy/subtitle?url=${encodeURIComponent(subUrl)}`
          : subUrl,
        source: 'api' as const,
      };
    })
    .filter(
      (
        s
      ): s is {
        id: string;
        label: string;
        lang: string;
        url: string;
        source: 'api';
      } => Boolean(s)
    );
}

async function fetchWithHeaderTimeout(
  url: string,
  init: RequestInit,
  connectTimeoutMs = 20000
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), connectTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isSyntheticChapterId(chapterId: string | undefined, bookId: string): boolean {
  const c = cleanStr(chapterId);
  if (!c) return true;
  if (c === bookId) return true;
  return new RegExp(`^${bookId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-ep-\\d+$`, 'i').test(c);
}

export async function getLookSeriesStream(
  getToken: () => string,
  opts: {
    bookId: string;
    episode?: number;
    chapterId?: string;
    chapterIndex0?: number;
    forceRefresh?: boolean;
  }
): Promise<Lk21StreamPayload> {
  const bookId = extractLookSeriesBookId(opts.bookId);
  const rawEpisodeNum =
    typeof opts.episode === 'number' && Number.isFinite(opts.episode)
      ? Math.floor(opts.episode)
      : 1;
  const requestedEpisode = rawEpisodeNum >= 0 ? rawEpisodeNum : 1;
  const displayEpisode = requestedEpisode === 0 ? 1 : requestedEpisode;
  const rawProvidedChapterId = cleanStr(opts.chapterId);
  const providedChapterId = isSyntheticChapterId(rawProvidedChapterId, bookId)
    ? ''
    : rawProvidedChapterId;
  const providedIndex0 =
    typeof opts.chapterIndex0 === 'number' &&
    Number.isFinite(opts.chapterIndex0) &&
    opts.chapterIndex0 >= 0
      ? Math.floor(opts.chapterIndex0)
      : undefined;
  const forceRefresh = Boolean(opts.forceRefresh);
  if (!bookId) {
    throw new Error('Missing book_id for LookSeries stream');
  }

  const token = getToken();
  if (!token) throw new Error('Server MOLA_API_TOKEN is not configured');

  // Resolve real chapter_id / chapterIndex / chapterIndex0 from allepisode (cached 30 min)
  let resolvedChapterId = providedChapterId;
  let resolvedIndex1 = requestedEpisode === 0 ? 1 : requestedEpisode;
  let resolvedIndex0 =
    providedIndex0 !== undefined
      ? providedIndex0
      : requestedEpisode === 0
      ? 0
      : Math.max(0, requestedEpisode - 1);

  if (!resolvedChapterId || providedIndex0 === undefined) {
    const epsPayload = await getLookSeriesEpisodes(getToken, bookId).catch(
      () => null
    );
    const epList = epsPayload?.episodes ?? [];
    if (epList.length > 0) {
      const matched =
        (resolvedChapterId
          ? epList.find(
              (ep) =>
                ep.chapterId === resolvedChapterId ||
                ep.id === resolvedChapterId ||
                ep.vid === resolvedChapterId
            )
          : undefined) ||
        (requestedEpisode === 0
          ? epList.find((ep) => ep.chapterIndex0 === 0) || epList[0]
          : epList.find(
              (ep) =>
                ep.order === requestedEpisode ||
                ep.chapterIndex === requestedEpisode
            )) ||
        (requestedEpisode <= 1 ? epList[0] : undefined);

      if (matched) {
        const candId = cleanStr(matched.chapterId ?? matched.id ?? matched.vid);
        if (!isSyntheticChapterId(candId, bookId) && !resolvedChapterId) {
          resolvedChapterId = candId;
        }
        if (typeof matched.order === 'number' && matched.order >= 1) {
          resolvedIndex1 = matched.order;
        }
        if (typeof matched.chapterIndex0 === 'number' && matched.chapterIndex0 >= 0) {
          resolvedIndex0 = matched.chapterIndex0;
        } else {
          resolvedIndex0 = Math.max(0, resolvedIndex1 - 1);
        }
      }
    }
  }

  const streamKey = resolvedChapterId
    ? `${bookId}:${displayEpisode}:${resolvedChapterId}`
    : `${bookId}:${displayEpisode}`;
  const cacheKey = `lookseries:stream:${streamKey}`;
  if (forceRefresh) {
    memoryCache.delete(cacheKey);
    streamHeaderStore.delete(streamKey);
  }
  const cached = !forceRefresh ? await readCache<Lk21StreamPayload>(cacheKey) : null;
  if (cached && !cached.stale && cached.payload?.streamUrl) {
    return cached.payload;
  }

  // Build ordered, deduplicated parameter attempts for /api/lookseries/stream:
  // 1) chapter_id + episode (or episode=0 if requested)
  // 2) chapter_id alone (works when upstream expects chapter_id directly)
  // 3) chapterIndex0 (e.g. episode=0) + chapter_id
  // 4) episode=0 alone (proven fallback when episode=1 fails with HTTP 500 or success=false)
  // 5) plain 1-based episode without chapter_id
  const attempts: Array<Record<string, string | number>> = [];
  const seenAttemptKeys = new Set<string>();
  const pushAttempt = (params: Record<string, string | number>) => {
    const key = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    if (seenAttemptKeys.has(key)) return;
    seenAttemptKeys.add(key);
    attempts.push(params);
  };

  if (resolvedChapterId) {
    pushAttempt({
      book_id: bookId,
      chapter_id: resolvedChapterId,
      episode: requestedEpisode,
    });
    pushAttempt({
      book_id: bookId,
      chapter_id: resolvedChapterId,
    });
  } else {
    pushAttempt({
      book_id: bookId,
      episode: requestedEpisode,
    });
  }

  if (resolvedChapterId && resolvedIndex0 !== requestedEpisode) {
    pushAttempt({
      book_id: bookId,
      chapter_id: resolvedChapterId,
      episode: resolvedIndex0,
    });
  }
  if (resolvedIndex0 !== requestedEpisode) {
    pushAttempt({
      book_id: bookId,
      episode: resolvedIndex0,
    });
  }
  if (requestedEpisode !== 0 && resolvedIndex0 !== 0 && resolvedIndex1 <= 1) {
    pushAttempt({
      book_id: bookId,
      episode: 0,
    });
  }
  if (resolvedChapterId) {
    pushAttempt({
      book_id: bookId,
      episode: resolvedIndex1,
    });
  }

  let winningRaw: Record<string, unknown> = {};
  let winningData: Record<string, unknown> = {};
  let candidates: ExtractedStreamCandidate[] = [];
  let subtitles: ReturnType<typeof extractSubtitlesFromNode> = [];
  let lastUpstreamErr: Error | null = null;
  const startedAt = Date.now();
  const MAX_TOTAL_ATTEMPT_WINDOW_MS = 16000;

  for (const params of attempts) {
    if (Date.now() - startedAt > MAX_TOTAL_ATTEMPT_WINDOW_MS) {
      break;
    }
    try {
      const attemptRaw = await fetchUpstreamLookSeriesJson(
        token,
        '/stream',
        params,
        8000
      );
      if (attemptRaw.success === false) {
        const msg = cleanStr(
          attemptRaw.error ?? attemptRaw.message,
          'LookSeries stream success=false'
        );
        lastUpstreamErr = new Error(msg);
        continue;
      }
      const attemptData =
        attemptRaw.data && typeof attemptRaw.data === 'object'
          ? (attemptRaw.data as Record<string, unknown>)
          : attemptRaw;

      const foundCandidates = [
        ...extractStreamCandidatesFromNode(attemptData, 'LookSeries HD'),
        ...(attemptData !== attemptRaw
          ? extractStreamCandidatesFromNode(attemptRaw, 'LookSeries HD')
          : []),
      ];

      if (foundCandidates.length > 0) {
        winningRaw = attemptRaw;
        winningData = attemptData;
        candidates = foundCandidates;
        subtitles = extractSubtitlesFromNode(attemptData);
        if (subtitles.length === 0 && attemptData !== attemptRaw) {
          subtitles = extractSubtitlesFromNode(attemptRaw);
        }
        break;
      }
    } catch (err) {
      lastUpstreamErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Last-resort fallback check on raw /allepisode and /detail payloads if all /stream attempts failed
  if (candidates.length === 0) {
    const [epsRaw, detailRaw] = await Promise.all([
      fetchUpstreamLookSeriesJson(token, '/allepisode', { book_id: bookId }, 8000).catch(
        () => null
      ),
      fetchUpstreamLookSeriesJson(token, '/detail', { book_id: bookId }, 8000).catch(
        () => null
      ),
    ]);

    if (epsRaw) {
      const epsDataObj =
        epsRaw.data && typeof epsRaw.data === 'object'
          ? (epsRaw.data as Record<string, unknown>)
          : null;
      const epsList = Array.isArray(epsRaw.episodes)
        ? (epsRaw.episodes as Record<string, unknown>[])
        : Array.isArray(epsDataObj?.episodes)
        ? (epsDataObj!.episodes as Record<string, unknown>[])
        : Array.isArray(epsRaw.data)
        ? (epsRaw.data as Record<string, unknown>[])
        : Array.isArray(epsRaw.list)
        ? (epsRaw.list as Record<string, unknown>[])
        : [];
      const rawEpsNumericOrders = epsList
        .map((epItem) => {
          const raw =
            epItem.chapterIndex ??
            epItem.episodeNo ??
            epItem.episode ??
            epItem.order;
          if (raw === null || raw === undefined || raw === '') return -1;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
        })
        .filter((n) => n >= 0);
      const epsAreZeroBased =
        rawEpsNumericOrders.length > 0 && Math.min(...rawEpsNumericOrders) === 0;
      const matchedEp =
        (resolvedChapterId
          ? epsList.find(
              (epItem) =>
                cleanStr(epItem.chapterId ?? epItem.id ?? epItem.vid) ===
                resolvedChapterId
            )
          : undefined) ||
        epsList.find((epItem, idx) => {
          const rawOrderField =
            epItem.chapterIndex ??
            epItem.episodeNo ??
            epItem.episode ??
            epItem.order;
          const parsedOrder =
            rawOrderField !== null &&
            rawOrderField !== undefined &&
            rawOrderField !== ''
              ? Number(rawOrderField)
              : NaN;
          if (
            resolvedIndex0 !== undefined &&
            Number.isFinite(parsedOrder) &&
            Math.floor(parsedOrder) === resolvedIndex0
          ) {
            return true;
          }
          const normalizedOrder =
            Number.isFinite(parsedOrder) && parsedOrder >= 0
              ? epsAreZeroBased
                ? Math.floor(parsedOrder) + 1
                : Math.max(1, Math.floor(parsedOrder))
              : idx + 1;
          return normalizedOrder === displayEpisode;
        }) ||
        (displayEpisode <= 1 ? epsList[0] : undefined);
      if (matchedEp) {
        candidates.push(...extractStreamCandidatesFromNode(matchedEp, 'LookSeries HD'));
        if (subtitles.length === 0) {
          subtitles = extractSubtitlesFromNode(matchedEp);
        }
        winningData = matchedEp;
      }
    }

    if (candidates.length === 0 && detailRaw) {
      const dObj =
        detailRaw.data && typeof detailRaw.data === 'object'
          ? (detailRaw.data as Record<string, unknown>)
          : detailRaw;
      candidates.push(...extractStreamCandidatesFromNode(dObj, 'LookSeries HD'));
      if (subtitles.length === 0) {
        subtitles = extractSubtitlesFromNode(dObj);
      }
      if (candidates.length > 0) {
        winningData = dObj;
      }
    }
  }

  // Deduplicate candidates by target URL while preserving order
  const uniqueCandidates: ExtractedStreamCandidate[] = [];
  const seenCandidateUrls = new Set<string>();
  for (const cand of candidates) {
    if (!cand.url || seenCandidateUrls.has(cand.url)) continue;
    seenCandidateUrls.add(cand.url);
    uniqueCandidates.push(cand);
  }

  if (uniqueCandidates.length === 0) {
    if (cached?.payload?.streamUrl) {
      return cached.payload;
    }
    if (lastUpstreamErr) {
      throw new Error(
        `Server LookSeries sedang bermasalah atau lambat (${lastUpstreamErr.message}).`
      );
    }
    throw new Error(
      'URL stream LookSeries kosong atau belum tersedia untuk episode ini.'
    );
  }

  // Persist CDN request headers (Accept, Accept-Encoding, Badci, User-Agent: Mozi, etc.)
  const primaryCandidate = uniqueCandidates[0];
  let originHost = '';
  try {
    originHost = new URL(primaryCandidate.url).hostname.toLowerCase();
  } catch {
    originHost = '';
  }
  const combinedHeaders = {
    ...normalizeHeaderMap(winningData.headers),
    ...(primaryCandidate.headers || {}),
  };
  await storeStreamHeaders(streamKey, originHost, combinedHeaders);

  const servers: NonNullable<Lk21StreamPayload['servers']> = [];
  const qualities: Array<{ quality: string; url: string }> = [];
  const seenServerUrls = new Set<string>();

  const pushServer = (srv: NonNullable<Lk21StreamPayload['servers']>[number]) => {
    if (!srv.url || seenServerUrls.has(srv.url)) return;
    seenServerUrls.add(srv.url);
    servers.push(srv);
  };

  const winningFormat = cleanStr(winningData.format, '').toLowerCase();

  uniqueCandidates.forEach((cand, idx) => {
    const isEmbed = isLikelyLookSeriesEmbedUrl(cand.url, cand.typeHint || winningFormat);
    if (isEmbed) {
      pushServer({
        id: `lookseries-embed-${idx}`,
        name: idx === 0 ? 'LookSeries Embed' : cand.label,
        url: cand.url,
        type: 'embed',
        quality: cand.quality || 'HD',
      });
      return;
    }

    const effectiveHint = (cand.typeHint || winningFormat).toLowerCase();
    const isMp4 =
      effectiveHint === 'mp4' ||
      (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(cand.url) &&
        !cand.url.toLowerCase().includes('.m3u8'));

    const primaryProxied = isMp4
      ? `/api/lookseries/proxy/segment?url=${encodeURIComponent(
          cand.url
        )}&key=${encodeURIComponent(streamKey)}`
      : `/api/lookseries/proxy/m3u8?url=${encodeURIComponent(
          cand.url
        )}&key=${encodeURIComponent(streamKey)}`;

    const upstreamFallbackProxied = `${primaryProxied}&via=upstream`;

    pushServer({
      id: idx === 0 ? 'lookseries-primary' : `lookseries-alt-${idx}`,
      name:
        idx === 0
          ? 'LookSeries HD'
          : cand.label || `LookSeries ${cand.quality || idx + 1}`,
      url: primaryProxied,
      type: isMp4 ? 'mp4' : 'hls',
      quality: cand.quality || 'HD',
    });
    qualities.push({
      quality:
        idx === 0
          ? cand.quality || 'HD'
          : cand.quality && cand.quality !== 'HD'
          ? cand.quality
          : `Alt ${idx}`,
      url: primaryProxied,
    });

    if (idx === 0) {
      pushServer({
        id: 'lookseries-proxy',
        name: 'LookSeries Proxy',
        url: upstreamFallbackProxied,
        type: isMp4 ? 'mp4' : 'hls',
        quality: cand.quality || 'HD',
      });
    }
  });

  const firstDirect = servers.find((s) => s.type !== 'embed');
  const firstEmbed = servers.find((s) => s.type === 'embed');
  const chosen = firstDirect || firstEmbed!;
  const isMp4Primary = chosen.type === 'mp4';

  const payload: Lk21StreamPayload = {
    ok: true,
    type: isMp4Primary ? 'mp4' : 'hls',
    sourceType: chosen.type,
    url: chosen.url,
    streamUrl: firstDirect ? firstDirect.url : '',
    embedUrl: firstEmbed ? firstEmbed.url : undefined,
    isHls: chosen.type === 'hls',
    title: cleanStr(winningData.title ?? winningRaw.title, `Episode ${displayEpisode}`),
    poster: '',
    subtitles,
    qualities:
      qualities.length > 0
        ? qualities
        : firstDirect
        ? [{ quality: firstDirect.quality || 'HD', url: firstDirect.url }]
        : [],
    servers,
    episodeNumber:
      Number(winningData.episodeNo ?? winningRaw.episodeNo) || displayEpisode,
    slug: buildLookSeriesSlug(bookId),
    vid: resolvedChapterId || `${bookId}-ep-${displayEpisode}`,
  };

  await writeCache(cacheKey, 'lookseries-stream', payload, STREAM_TTL_MS);
  return payload;
}

function isValidM3u8Manifest(body: string): boolean {
  return body.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U');
}

function rewriteLookSeriesM3u8Lines(
  body: string,
  baseUrl: string,
  streamKey?: string,
  via?: 'upstream'
): string {
  const baseParsed = new URL(baseUrl);
  const keyParam = streamKey ? `&key=${encodeURIComponent(streamKey)}` : '';
  const viaParam = via === 'upstream' ? '&via=upstream' : '';

  const toProxiedUri = (rawLine: string, forcePlaylist = false): string => {
    const resolved = new URL(rawLine, baseParsed);
    if (
      (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') ||
      isPrivateOrLocalHostname(resolved.hostname)
    ) {
      return rawLine;
    }
    storeUpstreamProxyOrigin(streamKey, resolved.toString());
    const unwrapped = unwrapUpstreamProxyInnerUrl(resolved.toString());
    const cleanTarget = isSafeHttpUrl(unwrapped) ? unwrapped : resolved.toString();
    const isPlaylist =
      forcePlaylist || cleanTarget.toLowerCase().includes('.m3u8');
    if (isPlaylist) {
      return `/api/lookseries/proxy/m3u8?url=${encodeURIComponent(
        cleanTarget
      )}${keyParam}${viaParam}`;
    }
    return `/api/lookseries/proxy/segment?url=${encodeURIComponent(
      cleanTarget
    )}${keyParam}${viaParam}`;
  };

  const lines = body.split(/\r?\n/);
  let expectChildPlaylist = false;

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
          expectChildPlaylist = true;
        }
        return line.replace(/URI="([^"]+)"/gi, (_m, uri: string) => {
          const forceM3u8 =
            trimmed.startsWith('#EXT-X-MEDIA') ||
            uri.toLowerCase().includes('.m3u8');
          return `URI="${toProxiedUri(uri, forceM3u8)}"`;
        });
      }
      const rewritten = toProxiedUri(trimmed, expectChildPlaylist);
      expectChildPlaylist = false;
      return rewritten;
    })
    .join('\n');
}

export async function fetchAndRewriteLookSeriesM3u8(
  getToken: () => string,
  targetUrl: string,
  streamKey?: string,
  via?: 'upstream',
  allowRefreshRetry = true
): Promise<{ status: number; body: string }> {
  const unwrapped = unwrapUpstreamProxyInnerUrl(targetUrl);
  const parsed = new URL(unwrapped);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    isPrivateOrLocalHostname(parsed.hostname)
  ) {
    throw new Error('Disallowed LookSeries m3u8 origin');
  }

  const token = getToken();
  const storedHeaders = await resolveStreamHeaders(
    getToken,
    streamKey,
    parsed.toString()
  );

  // CRITICAL: Always query the LookSeries upstream proxy FIRST for .m3u8 playlists!
  // CDN playlists (playUrlRaw) contain unsigned relative .ts URLs that 403 directly;
  // api.molatv.id/api/lookseries/proxy signs every .ts segment with fresh wsSecret & wsTime.
  let upstreamStatus = 0;
  if (token) {
    try {
      const upstreamProxyUrl = `${LOOKSERIES_UPSTREAM_BASE}/proxy?url=${encodeURIComponent(
        parsed.toString()
      )}&token=${encodeURIComponent(token)}`;
      const proxyRes = await fetchWithHeaderTimeout(
        upstreamProxyUrl,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.apple.mpegurl, text/plain, */*',
            'User-Agent': DEFAULT_BROWSER_UA,
            Authorization: `Bearer ${token}`,
          },
          redirect: 'follow',
        },
        15000
      );
      upstreamStatus = proxyRes.status;
      if (proxyRes.ok) {
        const body = await proxyRes.text();
        if (isValidM3u8Manifest(body)) {
          return {
            status: proxyRes.status,
            body: rewriteLookSeriesM3u8Lines(body, parsed.toString(), streamKey, via),
          };
        }
      }
    } catch {
      // Fallback below
    }
  }

  // If cached playUrlRaw token/signature expired on upstream proxy, refresh stream URL once cleanly
  if (allowRefreshRetry && streamKey && token) {
    const parts = streamKey.split(':');
    const bookId = parts[0];
    const parsedEp = Number(parts[1]);
    const episode = Number.isFinite(parsedEp) && parsedEp >= 0 ? parsedEp : 1;
    const chapterId = parts[2] || undefined;
    if (bookId) {
      try {
        const refreshed = await runDeduplicatedRefresh(streamKey, () =>
          getLookSeriesStream(getToken, {
            bookId,
            episode,
            chapterId,
            forceRefresh: true,
          })
        );
        const nextProxied = refreshed.streamUrl || '';
        const nextUrlParam = nextProxied.includes('url=')
          ? new URL(nextProxied, 'http://localhost').searchParams.get('url') || ''
          : '';
        if (nextUrlParam && nextUrlParam !== parsed.toString()) {
          return await fetchAndRewriteLookSeriesM3u8(
            getToken,
            nextUrlParam,
            streamKey,
            via,
            false
          );
        }
      } catch {
        // Proceed to direct fallback below
      }
    }
  }

  // Direct CDN fallback (used when upstream proxy is unreachable or for self-contained playlists)
  if (via !== 'upstream') {
    try {
      const directRes = await fetchWithHeaderTimeout(
        parsed.toString(),
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.apple.mpegurl, text/plain, */*',
            'User-Agent': DEFAULT_BROWSER_UA,
            ...storedHeaders,
          },
          redirect: 'follow',
        },
        15000
      );
      if (directRes.ok) {
        const text = await directRes.text();
        if (isValidM3u8Manifest(text)) {
          return {
            status: directRes.status,
            body: rewriteLookSeriesM3u8Lines(text, parsed.toString(), streamKey, via),
          };
        }
      }
    } catch {
      // Fall through to structured error
    }
  }

  throw new Error(
    upstreamStatus
      ? `LookSeries proxy returned HTTP ${upstreamStatus}`
      : 'LookSeries m3u8 playlist unavailable'
  );
}

function normalizeLookSeriesSegmentContentType(
  rawCt: string | null,
  pathname: string
): string {
  const lowerPath = pathname.toLowerCase();
  const ct = (rawCt || '').toLowerCase();
  if (lowerPath.endsWith('.mp4') || lowerPath.endsWith('.m4v') || ct.includes('video/mp4')) {
    return 'video/mp4';
  }
  if (lowerPath.endsWith('.webm') || ct.includes('video/webm')) {
    return 'video/webm';
  }
  if (lowerPath.endsWith('.m4s') || lowerPath.endsWith('.m4a') || lowerPath.endsWith('.mp4a')) {
    return ct && !ct.includes('octet-stream') ? rawCt! : 'video/iso.segment';
  }
  if (lowerPath.endsWith('.key')) {
    return 'application/octet-stream';
  }
  if (
    ct.includes('octet-stream') ||
    ct.includes('image/') ||
    !ct ||
    lowerPath.endsWith('.ts')
  ) {
    return 'video/mp2t';
  }
  return rawCt || 'video/mp2t';
}

export async function fetchLookSeriesSegment(
  targetUrl: string,
  rangeHeader: string | undefined,
  getToken: () => string,
  streamKey?: string,
  via?: 'upstream'
): Promise<{
  status: number;
  contentType: string;
  contentLength?: string;
  contentRange?: string;
  acceptRanges?: string;
  upstream: globalThis.Response;
}> {
  const unwrapped = unwrapUpstreamProxyInnerUrl(targetUrl);
  const parsed = new URL(unwrapped);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    isPrivateOrLocalHostname(parsed.hostname)
  ) {
    throw new Error('Disallowed LookSeries segment origin');
  }

  const storedHeaders = await resolveStreamHeaders(
    getToken,
    streamKey,
    parsed.toString()
  );
  const reqHeaders: Record<string, string> = {
    Accept: '*/*',
    'User-Agent': DEFAULT_BROWSER_UA,
    ...storedHeaders,
  };
  if (rangeHeader) reqHeaders.Range = rangeHeader;

  const tryDirectCdn = async (): Promise<globalThis.Response | null> => {
    try {
      const directRes = await fetchWithHeaderTimeout(
        parsed.toString(),
        {
          method: 'GET',
          headers: reqHeaders,
          redirect: 'follow',
        },
        20000
      );
      if (directRes.ok || directRes.status === 206) {
        return directRes;
      }
      await directRes.body?.cancel().catch(() => {});
      return null;
    } catch {
      return null;
    }
  };

  const tryUpstreamProxy = async (): Promise<globalThis.Response | null> => {
    // 1) Try fast edge proxy origin captured from upstream m3u8 (if safe & non-molatv)
    const fastProxyBase = getStoredUpstreamProxyOrigin(streamKey);
    if (fastProxyBase) {
      try {
        const edgeUrl = `${fastProxyBase}?url=${encodeURIComponent(parsed.toString())}`;
        const edgeRes = await fetchWithHeaderTimeout(
          edgeUrl,
          {
            method: 'GET',
            headers: {
              Accept: '*/*',
              'User-Agent': DEFAULT_BROWSER_UA,
              ...(rangeHeader ? { Range: rangeHeader } : {}),
            },
            redirect: 'follow',
          },
          20000
        );
        if (edgeRes.ok || edgeRes.status === 206) {
          return edgeRes;
        }
        await edgeRes.body?.cancel().catch(() => {});
      } catch {
        // Fallback to primary molatv proxy below
      }
    }

    // 2) Fallback to primary api.molatv.id proxy with server token
    const token = getToken();
    if (token) {
      try {
        const upstreamProxyUrl = `${LOOKSERIES_UPSTREAM_BASE}/proxy?url=${encodeURIComponent(
          parsed.toString()
        )}&token=${encodeURIComponent(token)}`;
        const proxyRes = await fetchWithHeaderTimeout(
          upstreamProxyUrl,
          {
            method: 'GET',
            headers: {
              Accept: '*/*',
              'User-Agent': DEFAULT_BROWSER_UA,
              Authorization: `Bearer ${token}`,
              ...(rangeHeader ? { Range: rangeHeader } : {}),
            },
            redirect: 'follow',
          },
          22000
        );
        if (proxyRes.ok || proxyRes.status === 206) {
          return proxyRes;
        }
        await proxyRes.body?.cancel().catch(() => {});
      } catch {
        // Exhausted upstream proxies
      }
    }
    return null;
  };

  let res: globalThis.Response | null = null;
  if (via === 'upstream') {
    res = (await tryUpstreamProxy()) || (await tryDirectCdn());
  } else {
    res = (await tryDirectCdn()) || (await tryUpstreamProxy());
  }

  if (!res || (!res.ok && res.status !== 206)) {
    throw new Error(`LookSeries segment failed (${res?.status || 'network'})`);
  }

  return {
    status: res.status,
    contentType: normalizeLookSeriesSegmentContentType(
      res.headers.get('content-type'),
      parsed.pathname
    ),
    contentLength: res.headers.get('content-length') || undefined,
    contentRange: res.headers.get('content-range') || undefined,
    acceptRanges: res.headers.get('accept-ranges') || undefined,
    upstream: res,
  };
}
