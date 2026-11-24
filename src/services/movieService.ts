import type {
  DramaItem,
  EpisodeItem,
  Lk21HomeResponse,
  Lk21ListResponse,
  Lk21MenuResponse,
  MovieDetail,
  MovieEpisodeItem,
  MovieItem,
  StreamSource,
} from '../types/drama';

interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

const memCache = new Map<string, CacheEntry<unknown>>();
const HOME_TTL = 10 * 60 * 1000;
const MENU_TTL = 60 * 60 * 1000;
const LIST_TTL = 10 * 60 * 1000;
const DETAIL_TTL = 20 * 60 * 1000;
const STREAM_TTL = 12 * 60 * 1000;

function fetchCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = memCache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) {
    return hit.promise;
  }
  const promise = loader().catch((err) => {
    memCache.delete(key);
    throw err;
  });
  memCache.set(key, { expiresAt: Date.now() + ttlMs, promise });
  return promise;
}

async function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const rawText = await res.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      const errObj =
        parsed && typeof parsed === 'object'
          ? (parsed as { error?: string; message?: string })
          : null;
      throw new Error(
        errObj?.error || errObj?.message || `Movie service error (${res.status})`
      );
    }
    if (parsed === null) {
      throw new Error('Invalid JSON response from movie service');
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Movie service request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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

export function extractLookSeriesBookId(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const match = raw.match(/^ls-([^-/]+)(?:-|$)/i);
  if (match && match[1]) return match[1].trim();
  return raw;
}

function normalizeMovieItemSafe(
  raw: Partial<MovieItem> | null | undefined,
  forcedApp?: 'lk21' | 'lookseries'
): MovieItem {
  const app: 'lk21' | 'lookseries' =
    forcedApp ?? (raw?.app === 'lookseries' ? 'lookseries' : 'lk21');
  const slug = String(raw?.slug || raw?.id || raw?.bookId || '').trim();
  const id = String(raw?.id || raw?.bookId || slug).trim();
  const bookId = raw?.bookId ? String(raw.bookId).trim() : id;
  const title = String(raw?.title || 'Untitled Movie').trim();
  const cover = String(raw?.cover || raw?.coverVt || raw?.coverHz || '').trim();
  return {
    id,
    bookId: app === 'lookseries' ? bookId : raw?.bookId,
    slug:
      slug ||
      (app === 'lookseries' && bookId ? `ls-${bookId}` : slug),
    app,
    title,
    cover,
    coverHz: String(raw?.coverHz || cover).trim(),
    coverVt: String(raw?.coverVt || cover).trim(),
    rating: String(raw?.rating || '').trim(),
    quality: String(raw?.quality || 'HD').trim(),
    badge: String(raw?.badge || raw?.quality || '').trim(),
    subtitle: String(raw?.subtitle || '').trim(),
    description: String(raw?.description || '').trim(),
    genre: Array.isArray(raw?.genre) ? raw.genre.filter(Boolean) : [],
    updateInfo: String(raw?.updateInfo || '').trim(),
    type: raw?.type === 'series' ? 'series' : 'movie',
    is_movie: raw?.type === 'series' ? false : true,
    chapterCount:
      typeof raw?.chapterCount === 'number' && raw.chapterCount > 0
        ? raw.chapterCount
        : undefined,
    director: raw?.director ? String(raw.director).trim() : undefined,
    actors: Array.isArray(raw?.actors) ? raw.actors.filter(Boolean) : undefined,
    year: raw?.year ? String(raw.year).trim() : undefined,
    dailyViews: typeof raw?.dailyViews === 'number' ? raw.dailyViews : undefined,
    totalViews: typeof raw?.totalViews === 'number' ? raw.totalViews : undefined,
    trendBadge: raw?.trendBadge,
  };
}

export function fetchLk21Home(): Promise<Lk21HomeResponse> {
  return fetchCached('lk21:home', HOME_TTL, async () => {
    const data = await getJson<Lk21HomeResponse>('/api/lk21/home');
    return {
      ...data,
      ok: Boolean(data?.ok ?? true),
      totalMovies: Number(data?.totalMovies) || 0,
      updated: Number(data?.updated) || Date.now(),
      rows: Array.isArray(data?.rows)
        ? data.rows.map((row) => ({
            key: String(row?.key || 'movies'),
            label: String(row?.label || 'Movies'),
            items: Array.isArray(row?.items)
              ? row.items.filter(Boolean).map((m) => normalizeMovieItemSafe(m, 'lk21'))
              : [],
          }))
        : [],
    };
  });
}

export function fetchLk21Menu(): Promise<Lk21MenuResponse> {
  return fetchCached('lk21:menu', MENU_TTL, async () => {
    const data = await getJson<Lk21MenuResponse>('/api/lk21/menu');
    return {
      ok: Boolean(data?.ok ?? true),
      types: Array.isArray(data?.types) ? data.types : [],
      genres: Array.isArray(data?.genres) ? data.genres : [],
      countries: Array.isArray(data?.countries) ? data.countries : [],
      years: Array.isArray(data?.years) ? data.years : [],
    };
  });
}

export function fetchLk21Latest(page = 1): Promise<Lk21ListResponse> {
  return fetchCached(`lk21:latest:${page}`, LIST_TTL, async () => {
    const data = await getJson<Lk21ListResponse>(
      `/api/lk21/latest?page=${encodeURIComponent(String(page))}`
    );
    const items = Array.isArray(data?.items)
      ? data.items.filter(Boolean).map((m) => normalizeMovieItemSafe(m, 'lk21'))
      : [];
    return {
      ok: Boolean(data?.ok ?? true),
      label: data?.label,
      key: data?.key,
      page: Number(data?.page) || page,
      count: Number(data?.count) || items.length,
      hasMore: Boolean(data?.hasMore),
      items,
    };
  });
}

export function fetchLk21Category(
  key: string,
  page = 1
): Promise<Lk21ListResponse> {
  return fetchCached(`lk21:category:${key}:${page}`, LIST_TTL, async () => {
    const data = await getJson<Lk21ListResponse>(
      `/api/lk21/category?key=${encodeURIComponent(key)}&page=${encodeURIComponent(String(page))}`
    );
    const items = Array.isArray(data?.items)
      ? data.items.filter(Boolean).map((m) => normalizeMovieItemSafe(m, 'lk21'))
      : [];
    return {
      ok: Boolean(data?.ok ?? true),
      label: data?.label,
      key: data?.key ?? key,
      page: Number(data?.page) || page,
      count: Number(data?.count) || items.length,
      hasMore: Boolean(data?.hasMore),
      items,
    };
  });
}

export async function searchLk21Movies(
  q: string,
  page = 1
): Promise<Lk21ListResponse> {
  const trimmed = q.trim();
  if (!trimmed) {
    return {
      ok: true,
      q: '',
      page,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
  const data = await getJson<Lk21ListResponse>(
    `/api/lk21/search?q=${encodeURIComponent(trimmed)}&page=${encodeURIComponent(String(page))}`
  );
  const items = Array.isArray(data?.items)
    ? data.items.filter(Boolean).map((m) => normalizeMovieItemSafe(m, 'lk21'))
    : [];
  return {
    ok: Boolean(data?.ok ?? true),
    q: data?.q ?? trimmed,
    page: Number(data?.page) || page,
    count: Number(data?.count) || items.length,
    hasMore: Boolean(data?.hasMore),
    items,
  };
}

export function fetchLk21Detail(slug: string): Promise<MovieDetail> {
  const clean = slug.trim().toLowerCase();
  return fetchCached(`lk21:detail:${clean}`, DETAIL_TTL, async () => {
    const data = await getJson<MovieDetail>(
      `/api/lk21/detail?slug=${encodeURIComponent(clean)}`
    );
    const cover = String(data?.cover || data?.poster || data?.coverHz || '').trim();
    return {
      ...data,
      ok: Boolean(data?.ok ?? true),
      id: String(data?.id || data?.slug || clean).trim(),
      slug: String(data?.slug || clean).trim(),
      app: 'lk21',
      title: String(data?.title || 'Untitled Movie').trim(),
      cover,
      coverHz: String(data?.coverHz || cover).trim(),
      poster: String(data?.poster || cover).trim(),
      synopsis: String(data?.synopsis || data?.description || '').trim(),
      description: String(data?.description || data?.synopsis || '').trim(),
      actors: Array.isArray(data?.actors) ? data.actors.filter(Boolean) : [],
      director: String(data?.director || '').trim(),
      year: String(data?.year || '').trim(),
      area: String(data?.area || '').trim(),
      genres: Array.isArray(data?.genres) ? data.genres.filter(Boolean) : [],
      rating: String(data?.rating || '').trim(),
      quality: String(data?.quality || 'HD').trim(),
      type: data?.type === 'series' ? 'series' : 'movie',
      updateInfo: String(data?.updateInfo || '').trim(),
      providers: Array.isArray(data?.providers) ? data.providers : [],
      recommendations: Array.isArray(data?.recommendations)
        ? data.recommendations.filter(Boolean).map((m) => normalizeMovieItemSafe(m, 'lk21'))
        : [],
    };
  });
}

export function fetchLk21Episodes(slug: string): Promise<{
  ok: boolean;
  slug: string;
  title: string;
  count: number;
  episodes: MovieEpisodeItem[];
}> {
  const clean = slug.trim().toLowerCase();
  return fetchCached(`lk21:episodes:${clean}`, DETAIL_TTL, async () => {
    const data = await getJson<{
      ok?: boolean;
      slug?: string;
      title?: string;
      count?: number;
      episodes?: MovieEpisodeItem[];
    }>(`/api/lk21/episodes?slug=${encodeURIComponent(clean)}`);
    const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
    return {
      ok: Boolean(data?.ok ?? true),
      slug: String(data?.slug || clean),
      title: String(data?.title || clean),
      count: Number(data?.count) || episodes.length,
      episodes,
    };
  });
}

function isSafeClientMediaUrl(rawUrl: string): boolean {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function fetchLk21Stream(
  slug: string,
  episode = 1,
  vid?: string,
  forceRefresh = false
): Promise<StreamSource> {
  const clean = slug.trim().toLowerCase();
  const key = `lk21:stream:v2:${clean}:${vid || episode}`;
  if (forceRefresh) {
    memCache.delete(key);
  }
  return fetchCached(key, STREAM_TTL, async () => {
    const params = new URLSearchParams({
      slug: clean,
      episode: String(Math.max(1, episode)),
    });
    if (vid) params.set('vid', vid);
    if (forceRefresh) params.set('refresh', '1');

    const [streamResult, detailResult] = await Promise.allSettled([
      getJson<{
        ok: boolean;
        type: string;
        sourceType?: 'hls' | 'mp4' | 'embed';
        url: string;
        streamUrl: string;
        embedUrl?: string;
        isHls: boolean;
        title: string;
        poster: string;
        subtitles?: Array<{
          id: string;
          label: string;
          lang: string;
          url?: string;
          source: 'api';
        }>;
        qualities?: Array<{ quality: string; url: string }>;
        servers?: Array<{
          id: string;
          name: string;
          url: string;
          type: 'hls' | 'mp4' | 'embed';
          quality?: string;
        }>;
        episodeNumber?: number;
        vid?: string;
      }>(`/api/lk21/stream?${params.toString()}`),
      fetchLk21Detail(clean).catch(() => null),
    ]);

    const detail =
      detailResult.status === 'fulfilled' ? detailResult.value : null;
    const data = streamResult.status === 'fulfilled' ? streamResult.value : null;

    const mergedServers: NonNullable<StreamSource['servers']> = [];
    const seenServerKeys = new Set<string>();
    const pushServer = (srv: {
      id: string;
      name: string;
      url: string;
      type: 'hls' | 'mp4' | 'embed';
      quality?: string;
    }) => {
      if (!srv.url || !isSafeClientMediaUrl(srv.url)) return;
      const dedupe = `${srv.type}:${srv.url}`;
      if (seenServerKeys.has(dedupe)) return;
      seenServerKeys.add(dedupe);
      mergedServers.push(srv);
    };

    if (data && Array.isArray(data.servers)) {
      data.servers.forEach(pushServer);
    }

    const directUrl = data?.streamUrl || (data?.sourceType !== 'embed' ? data?.url : '') || '';
    const directIsHls =
      Boolean(data?.isHls) ||
      directUrl.includes('/proxy/m3u8') ||
      directUrl.toLowerCase().includes('.m3u8');

    if (directUrl && isSafeClientMediaUrl(directUrl)) {
      pushServer({
        id: 'lk21-primary-direct',
        name: 'Server Utama (HD)',
        url: directUrl,
        type: directIsHls ? 'hls' : 'mp4',
        quality: 'HD',
      });
    }

    if (data?.embedUrl && isSafeClientMediaUrl(data.embedUrl)) {
      pushServer({
        id: 'lk21-primary-embed',
        name: 'Server Embed',
        url: data.embedUrl,
        type: 'embed',
        quality: 'HD',
      });
    }

    if (detail?.providers) {
      detail.providers.forEach((p, idx) => {
        if (p?.url && isSafeClientMediaUrl(p.url)) {
          pushServer({
            id: `lk21-provider-${idx}`,
            name: p.name || `Embed ${idx + 1}`,
            url: p.url,
            type: 'embed',
            quality: detail.quality || 'HD',
          });
        }
      });
    }

    const primaryDirect = mergedServers.find((s) => s.type !== 'embed');
    const primaryEmbed = mergedServers.find((s) => s.type === 'embed');

    if (!primaryDirect && !primaryEmbed) {
      if (streamResult.status === 'rejected') {
        throw streamResult.reason instanceof Error
          ? streamResult.reason
          : new Error('Movie stream URL unavailable for this title.');
      }
      throw new Error('Movie stream URL unavailable for this title.');
    }

    const activeSourceType = primaryDirect ? primaryDirect.type : 'embed';
    const rawQualities =
      Array.isArray(data?.qualities) && data.qualities.length > 0
        ? data.qualities.filter((q) => isSafeClientMediaUrl(q.url))
        : primaryDirect
        ? [{ quality: primaryDirect.quality || 'HD', url: primaryDirect.url }]
        : [];

    return {
      bookId: clean,
      provider: 'LK21',
      episodeNumber: data?.episodeNumber || episode,
      chapterId: data?.vid || vid || clean,
      streamUrl: primaryDirect ? primaryDirect.url : '',
      embedUrl: primaryEmbed?.url,
      sourceType: activeSourceType,
      isHls: primaryDirect ? primaryDirect.type === 'hls' : false,
      qualities: rawQualities,
      subtitles: Array.isArray(data?.subtitles) ? data.subtitles : [],
      servers: mergedServers,
    };
  });
}

export function mapLk21EpisodesToEpisodeItems(
  slug: string,
  rawEpisodes: MovieEpisodeItem[] | undefined | null,
  fallbackTitle?: string
): EpisodeItem[] {
  const clean = slug.trim().toLowerCase();
  if (!rawEpisodes || rawEpisodes.length === 0) {
    return [
      {
        chapterId: clean,
        episodeNumber: 1,
        chapterIndex0: 0,
        title: fallbackTitle || 'Full Movie',
        isVipLocked: false,
        eid: clean,
      },
    ];
  }
  return rawEpisodes.map((ep, idx) => {
    const order = ep.order || idx + 1;
    const realChapterId = ep.chapterId || ep.id || ep.vid || `${clean}-ep-${idx + 1}`;
    return {
      chapterId: realChapterId,
      episodeNumber: order,
      chapterIndex0:
        typeof ep.chapterIndex0 === 'number' && ep.chapterIndex0 >= 0
          ? ep.chapterIndex0
          : Math.max(0, order - 1),
      title: ep.manEpisode || ep.episode || ep.title || `EP ${idx + 1}`,
      isVipLocked: false,
      eid: ep.vid || ep.id || realChapterId,
    };
  });
}

export async function fetchLk21EpisodesAsEpisodeItems(
  slug: string
): Promise<EpisodeItem[]> {
  const res = await fetchLk21Episodes(slug);
  return mapLk21EpisodesToEpisodeItems(slug, res?.episodes, res?.title);
}

// --- LookSeries Movies & Series Endpoints (/api/lookseries/*) ---

export function fetchLookSeriesFeed(
  section: LookSeriesFeedSection,
  page = 1
): Promise<Lk21ListResponse> {
  const safePage = Math.max(1, Math.floor(page || 1));
  return fetchCached(`lookseries:${section}:${safePage}`, LIST_TTL, async () => {
    try {
      const data = await getJson<Lk21ListResponse>(
        `/api/lookseries/${encodeURIComponent(section)}?page=${encodeURIComponent(
          String(safePage)
        )}`
      );
      const items = Array.isArray(data?.items)
        ? data.items
            .filter(Boolean)
            .map((m) => normalizeMovieItemSafe(m, 'lookseries'))
        : [];
      return {
        ok: Boolean(data?.ok ?? true),
        label: data?.label,
        key: data?.key ?? `lookseries.${section}`,
        page: Number(data?.page) || safePage,
        count: Number(data?.count) || items.length,
        hasMore: Boolean(data?.hasMore),
        items,
      };
    } catch {
      return {
        ok: true,
        key: `lookseries.${section}`,
        page: safePage,
        count: 0,
        hasMore: false,
        items: [],
      };
    }
  });
}

export function fetchLookSeriesCategory(
  topicId = 'netflix',
  page = 1
): Promise<Lk21ListResponse> {
  const cleanTopic = topicId.trim().toLowerCase() || 'netflix';
  const safePage = Math.max(1, Math.floor(page || 1));
  return fetchCached(
    `lookseries:category:${cleanTopic}:${safePage}`,
    LIST_TTL,
    async () => {
      try {
        const data = await getJson<Lk21ListResponse>(
          `/api/lookseries/category?topic_id=${encodeURIComponent(
            cleanTopic
          )}&page=${encodeURIComponent(String(safePage))}`
        );
        const items = Array.isArray(data?.items)
          ? data.items
              .filter(Boolean)
              .map((m) => normalizeMovieItemSafe(m, 'lookseries'))
          : [];
        return {
          ok: Boolean(data?.ok ?? true),
          label: data?.label,
          key: data?.key ?? `lookseries.topic.${cleanTopic}`,
          page: Number(data?.page) || safePage,
          count: Number(data?.count) || items.length,
          hasMore: Boolean(data?.hasMore),
          items,
        };
      } catch {
        return {
          ok: true,
          key: `lookseries.topic.${cleanTopic}`,
          page: safePage,
          count: 0,
          hasMore: false,
          items: [],
        };
      }
    }
  );
}

export async function searchLookSeriesMovies(
  q: string,
  page = 1
): Promise<Lk21ListResponse> {
  const trimmed = q.trim();
  const safePage = Math.max(1, Math.floor(page || 1));
  if (!trimmed) {
    return {
      ok: true,
      q: '',
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
  try {
    const data = await getJson<Lk21ListResponse>(
      `/api/lookseries/search?q=${encodeURIComponent(
        trimmed
      )}&page=${encodeURIComponent(String(safePage))}`
    );
    const items = Array.isArray(data?.items)
      ? data.items
          .filter(Boolean)
          .map((m) => normalizeMovieItemSafe(m, 'lookseries'))
      : [];
    return {
      ok: Boolean(data?.ok ?? true),
      q: data?.q ?? trimmed,
      page: Number(data?.page) || safePage,
      count: Number(data?.count) || items.length,
      hasMore: Boolean(data?.hasMore),
      items,
    };
  } catch {
    return {
      ok: true,
      q: trimmed,
      page: safePage,
      count: 0,
      hasMore: false,
      items: [],
    };
  }
}

export function fetchLookSeriesDetail(idOrSlug: string): Promise<MovieDetail> {
  const bookId = extractLookSeriesBookId(idOrSlug);
  return fetchCached(`lookseries:detail:${bookId}`, DETAIL_TTL, async () => {
    const data = await getJson<MovieDetail>(
      `/api/lookseries/detail?book_id=${encodeURIComponent(bookId)}`
    );
    const cover = String(
      data?.cover || data?.poster || data?.coverHz || ''
    ).trim();
    const resolvedBookId = String(
      data?.bookId || data?.id || bookId
    ).trim();
    return {
      ...data,
      ok: Boolean(data?.ok ?? true),
      id: resolvedBookId,
      bookId: resolvedBookId,
      slug: String(data?.slug || `ls-${resolvedBookId}`).trim(),
      app: 'lookseries',
      title: String(data?.title || 'Untitled Movie').trim(),
      cover,
      coverHz: String(data?.coverHz || cover).trim(),
      poster: String(data?.poster || cover).trim(),
      synopsis: String(data?.synopsis || data?.description || '').trim(),
      description: String(data?.description || data?.synopsis || '').trim(),
      actors: Array.isArray(data?.actors) ? data.actors.filter(Boolean) : [],
      director: String(data?.director || '').trim(),
      year: String(data?.year || '').trim(),
      area: String(data?.area || '').trim(),
      genres: Array.isArray(data?.genres) ? data.genres.filter(Boolean) : [],
      rating: String(data?.rating || '').trim(),
      quality: String(data?.quality || 'HD').trim(),
      type: data?.type === 'series' ? 'series' : 'movie',
      updateInfo: String(data?.updateInfo || '').trim(),
      chapterCount:
        typeof data?.chapterCount === 'number' ? data.chapterCount : undefined,
      providers: Array.isArray(data?.providers) ? data.providers : [],
      recommendations: Array.isArray(data?.recommendations)
        ? data.recommendations
            .filter(Boolean)
            .map((m) => normalizeMovieItemSafe(m, 'lookseries'))
        : [],
    };
  });
}

export function fetchLookSeriesEpisodes(idOrSlug: string): Promise<{
  ok: boolean;
  slug: string;
  title: string;
  count: number;
  episodes: MovieEpisodeItem[];
}> {
  const bookId = extractLookSeriesBookId(idOrSlug);
  return fetchCached(`lookseries:episodes:${bookId}`, DETAIL_TTL, async () => {
    try {
      const data = await getJson<{
        ok?: boolean;
        slug?: string;
        title?: string;
        count?: number;
        episodes?: MovieEpisodeItem[];
      }>(`/api/lookseries/allepisode?book_id=${encodeURIComponent(bookId)}`);
      const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
      return {
        ok: Boolean(data?.ok ?? true),
        slug: String(data?.slug || `ls-${bookId}`),
        title: String(data?.title || bookId),
        count: Number(data?.count) || episodes.length,
        episodes,
      };
    } catch {
      return {
        ok: true,
        slug: `ls-${bookId}`,
        title: bookId,
        count: 1,
        episodes: [
          {
            id: `${bookId}-ep-1`,
            vid: `${bookId}-ep-1`,
            chapterIndex0: 0,
            title: 'Episode 1',
            episode: '1',
            manEpisode: 'EP 1',
            order: 1,
          },
        ],
      };
    }
  });
}

export async function fetchLookSeriesEpisodesAsEpisodeItems(
  idOrSlug: string
): Promise<EpisodeItem[]> {
  const res = await fetchLookSeriesEpisodes(idOrSlug);
  const bookId = extractLookSeriesBookId(idOrSlug);
  return mapLk21EpisodesToEpisodeItems(
    res?.slug || `ls-${bookId}`,
    res?.episodes,
    res?.title
  );
}

function isSyntheticLookSeriesChapterId(
  chapterId: string | undefined,
  bookId: string
): boolean {
  const c = String(chapterId || '').trim();
  if (!c || c === bookId || c === `ls-${bookId}`) return true;
  return new RegExp(
    `^(?:ls-)?${bookId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-ep-\\d+$`,
    'i'
  ).test(c);
}

interface LookSeriesStreamApiResponse {
  ok?: boolean;
  success?: boolean;
  type?: string;
  format?: string;
  sourceType?: 'hls' | 'mp4' | 'embed';
  url?: string;
  streamUrl?: string;
  playUrl?: string;
  playUrlRaw?: string;
  embedUrl?: string;
  isHls?: boolean;
  title?: string;
  subtitles?: Array<{
    id: string;
    label: string;
    lang: string;
    url?: string;
    source: 'api';
  }>;
  qualities?: Array<{ quality: string; url: string }>;
  servers?: Array<{
    id: string;
    name: string;
    url: string;
    type: 'hls' | 'mp4' | 'embed';
    quality?: string;
  }>;
  episodeNumber?: number;
  vid?: string;
  error?: string;
}

export async function fetchLookSeriesStream(
  idOrSlug: string,
  episode = 1,
  forceRefresh = false,
  extra?: { chapterId?: string; chapterIndex0?: number }
): Promise<StreamSource> {
  const bookId = extractLookSeriesBookId(idOrSlug);
  const safeEp =
    typeof episode === 'number' && Number.isFinite(episode) && episode >= 0
      ? Math.floor(episode)
      : 1;
  const rawProvidedCid = String(extra?.chapterId || '').trim();
  let resolvedChapterId = isSyntheticLookSeriesChapterId(rawProvidedCid, bookId)
    ? ''
    : rawProvidedCid;
  let resolvedIndex0 =
    typeof extra?.chapterIndex0 === 'number' &&
    Number.isFinite(extra.chapterIndex0) &&
    extra.chapterIndex0 >= 0
      ? Math.floor(extra.chapterIndex0)
      : undefined;

  const key = `lookseries:stream:v3:${bookId}:${safeEp}:${resolvedChapterId || 'auto'}`;
  if (forceRefresh) {
    memCache.delete(key);
  }
  return fetchCached(key, STREAM_TTL, async () => {
    // Resolve real chapterId & chapterIndex0 from allepisode (cached) when missing
    if (!resolvedChapterId || resolvedIndex0 === undefined) {
      const epsRes = await fetchLookSeriesEpisodes(bookId).catch(() => null);
      const eps = epsRes?.episodes ?? [];
      if (eps.length > 0) {
        const matched =
          (resolvedChapterId
            ? eps.find(
                (ep) =>
                  ep.chapterId === resolvedChapterId ||
                  ep.id === resolvedChapterId ||
                  ep.vid === resolvedChapterId
              )
            : undefined) ||
          (safeEp === 0
            ? eps.find((ep) => ep.chapterIndex0 === 0) || eps[0]
            : eps.find((ep) => ep.order === safeEp)) ||
          (safeEp <= 1 ? eps[0] : undefined);
        if (matched) {
          const cid = String(
            matched.chapterId || matched.id || matched.vid || ''
          ).trim();
          if (!isSyntheticLookSeriesChapterId(cid, bookId) && !resolvedChapterId) {
            resolvedChapterId = cid;
          }
          if (
            resolvedIndex0 === undefined &&
            typeof matched.chapterIndex0 === 'number' &&
            matched.chapterIndex0 >= 0
          ) {
            resolvedIndex0 = matched.chapterIndex0;
          }
        }
      }
    }

    const requestStream = async (opts: {
      epValue: number;
      cid?: string;
      idx0?: number;
      refresh?: boolean;
    }) => {
      const params = new URLSearchParams({
        book_id: bookId,
        episode: String(opts.epValue),
      });
      if (opts.cid) params.set('chapter_id', opts.cid);
      if (typeof opts.idx0 === 'number' && opts.idx0 >= 0) {
        params.set('chapter_index0', String(opts.idx0));
      }
      if (opts.refresh) {
        params.set('refresh', '1');
        params.set('_t', String(Date.now()));
      }
      return getJson<LookSeriesStreamApiResponse>(
        `/api/lookseries/stream?${params.toString()}`,
        18000
      );
    };

    let data: LookSeriesStreamApiResponse | null = null;
    let firstErr: unknown = null;
    try {
      data = await requestStream({
        epValue: safeEp,
        cid: resolvedChapterId || undefined,
        idx0: resolvedIndex0,
        refresh: forceRefresh,
      });
    } catch (err) {
      firstErr = err;
    }

    // Client-side fail-safe fallback with episode=0 (or chapterIndex0) if initial request failed or returned empty
    const hasInitialUrl = Boolean(
      data?.streamUrl ||
        data?.playUrl ||
        data?.playUrlRaw ||
        data?.url ||
        data?.embedUrl ||
        (Array.isArray(data?.servers) && data.servers.length > 0)
    );
    if (!data || data.success === false || !hasInitialUrl) {
      const fallbackEp =
        resolvedIndex0 !== undefined && resolvedIndex0 !== safeEp
          ? resolvedIndex0
          : 0;
      if (fallbackEp !== safeEp || resolvedChapterId) {
        try {
          const alt = await requestStream({
            epValue: fallbackEp,
            cid: resolvedChapterId || undefined,
            idx0: fallbackEp,
            refresh: true,
          });
          if (
            alt &&
            alt.success !== false &&
            (alt.streamUrl ||
              alt.playUrl ||
              alt.playUrlRaw ||
              alt.url ||
              alt.embedUrl ||
              (Array.isArray(alt.servers) && alt.servers.length > 0))
          ) {
            data = alt;
          }
        } catch {
          // Preserve firstErr if fallback also fails
        }
      }
    }

    if (!data) {
      throw firstErr instanceof Error
        ? firstErr
        : new Error('Gagal memuat stream LookSeries. Silakan coba lagi.');
    }

    const servers: NonNullable<StreamSource['servers']> = [];
    const seenServerKeys = new Set<string>();
    const pushServer = (srv: {
      id: string;
      name: string;
      url: string;
      type: 'hls' | 'mp4' | 'embed';
      quality?: string;
    }) => {
      if (!srv.url || !isSafeClientMediaUrl(srv.url)) return;
      const dedupe = `${srv.type}:${srv.url}`;
      if (seenServerKeys.has(dedupe)) return;
      seenServerKeys.add(dedupe);
      servers.push(srv);
    };

    if (Array.isArray(data?.servers)) {
      data.servers.forEach(pushServer);
    }

    const streamKey = resolvedChapterId
      ? `${bookId}:${safeEp === 0 ? 1 : safeEp}:${resolvedChapterId}`
      : `${bookId}:${safeEp === 0 ? 1 : safeEp}`;
    const normalizeRawCandidate = (raw: string): string => {
      if (!raw || !isSafeClientMediaUrl(raw)) return '';
      if (raw.startsWith('/api/')) return raw;
      const lower = raw.toLowerCase();
      const fmt = String(data?.format || '').toLowerCase();
      if (
        fmt === 'hls' ||
        lower.includes('.m3u8') ||
        lower.includes('/lookseries/proxy')
      ) {
        return `/api/lookseries/proxy/m3u8?url=${encodeURIComponent(
          raw
        )}&key=${encodeURIComponent(streamKey)}`;
      }
      if (fmt === 'mp4' || /\.(mp4|webm|m4v)(\?|$)/i.test(lower)) {
        return `/api/lookseries/proxy/segment?url=${encodeURIComponent(
          raw
        )}&key=${encodeURIComponent(streamKey)}`;
      }
      return raw;
    };

    const rawDirectUrl =
      data?.streamUrl ||
      (data?.sourceType !== 'embed' ? data?.url : '') ||
      normalizeRawCandidate(String(data?.playUrlRaw || data?.playUrl || '')) ||
      '';
    const inferredHls =
      Boolean(data?.isHls) ||
      String(data?.format || '').toLowerCase() === 'hls' ||
      rawDirectUrl.includes('/proxy/m3u8') ||
      rawDirectUrl.toLowerCase().includes('.m3u8');

    if (rawDirectUrl && isSafeClientMediaUrl(rawDirectUrl)) {
      pushServer({
        id: 'lookseries-primary',
        name: 'LookSeries HD',
        url: rawDirectUrl,
        type: inferredHls ? 'hls' : 'mp4',
        quality: 'HD',
      });
    }

    if (data?.embedUrl && isSafeClientMediaUrl(data.embedUrl)) {
      pushServer({
        id: 'lookseries-embed',
        name: 'LookSeries Embed',
        url: data.embedUrl,
        type: 'embed',
        quality: 'HD',
      });
    }

    const primaryDirect = servers.find((s) => s.type !== 'embed');
    const primaryEmbed = servers.find((s) => s.type === 'embed');

    if (!primaryDirect && !primaryEmbed) {
      throw new Error(
        data?.error ||
          'URL stream LookSeries kosong atau belum tersedia untuk episode ini.'
      );
    }

    const activeSourceType = primaryDirect ? primaryDirect.type : 'embed';
    const isHls = primaryDirect ? primaryDirect.type === 'hls' : false;
    const qualities =
      Array.isArray(data?.qualities) && data.qualities.length > 0
        ? data.qualities.filter((q) => q?.url && isSafeClientMediaUrl(q.url))
        : primaryDirect
        ? [{ quality: primaryDirect.quality || 'HD', url: primaryDirect.url }]
        : [];

    return {
      bookId,
      provider: 'LookSeries',
      episodeNumber: data?.episodeNumber || (safeEp === 0 ? 1 : safeEp),
      chapterId: resolvedChapterId || data?.vid || `${bookId}-ep-${safeEp}`,
      streamUrl: primaryDirect ? primaryDirect.url : '',
      embedUrl: primaryEmbed?.url,
      sourceType: activeSourceType,
      isHls,
      qualities,
      subtitles: Array.isArray(data?.subtitles) ? data.subtitles : [],
      servers,
    };
  });
}

export function movieToDramaItem(
  m: MovieItem | MovieDetail,
  episodeCount = 1
): DramaItem {
  const isDetail = 'synopsis' in m;
  const isLookSeries = m.app === 'lookseries';
  const ratingNum = parseFloat(m.rating || '0');
  const normalizedRating =
    Number.isFinite(ratingNum) && ratingNum > 0
      ? Number(Math.min(5, ratingNum > 5 ? ratingNum / 2 : ratingNum).toFixed(1))
      : undefined;
  const safeBookId = String(m.bookId || m.id || m.slug || '').trim();
  const safeSlug = String(
    m.slug || (isLookSeries && safeBookId ? `ls-${safeBookId}` : safeBookId)
  ).trim();
  const safeTitle = String(m.title || 'Untitled Movie').trim();
  const safeCover = String(
    (isDetail ? m.poster || m.cover : m.coverVt || m.cover) || m.coverHz || ''
  ).trim();
  const safeActors = Array.isArray(m.actors) ? m.actors : [];
  const safeGenres = isDetail
    ? Array.isArray(m.genres)
      ? m.genres
      : []
    : Array.isArray(m.genre)
    ? m.genre
    : [];
  const resolvedChapters = Math.max(
    1,
    episodeCount > 1 ? episodeCount : m.chapterCount ?? episodeCount
  );

  return {
    bookId: isLookSeries ? safeBookId || safeSlug : safeSlug,
    slug: safeSlug,
    title: safeTitle,
    cover: safeCover,
    coverHz: String(m.coverHz || m.cover || safeCover).trim(),
    description:
      (isDetail ? m.synopsis : m.description) ||
      `Watch ${safeTitle} in Full HD on KanoDrama Movies.`,
    chapterCount: resolvedChapters,
    tags: safeGenres,
    corner: m.quality || (!isDetail ? m.badge : '') || 'HD',
    protagonist:
      safeActors.length > 0 ? safeActors.slice(0, 4).join(', ') : undefined,
    director: m.director || undefined,
    actors: safeActors.length > 0 ? safeActors : undefined,
    year: m.year || undefined,
    area: isDetail ? m.area : undefined,
    quality: m.quality || 'HD',
    isVip: false,
    provider: isLookSeries ? 'LookSeries' : 'LK21',
    mediaType: 'movie',
    status: m.type === 'series' ? 'Ongoing' : 'Completed',
    rating: normalizedRating,
    dailyViews: !isDetail ? m.dailyViews : undefined,
    totalViews: !isDetail ? m.totalViews : undefined,
    trendBadge: !isDetail ? m.trendBadge : undefined,
  };
}
