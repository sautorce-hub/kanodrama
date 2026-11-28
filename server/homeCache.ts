import fs from 'node:fs';
import path from 'node:path';
import {
  type CatalogUpsertItem,
  type LiveDramaBadgeStat,
  bumpSitemapCatalogVersion,
  dbQuery,
  ensureDatabaseReady,
  getMostWatchedVideosFromDb,
  getTrendingStatsMapFromDb,
  isDatabaseEnabled,
  listCatalogForSitemapFromDb,
  upsertDramaCatalogBatchInDb,
} from './db.ts';
import { notifyCatalogAdditionsToGoogle } from './googleIndexing.ts';
import {
  buildLookSeriesSlug,
  getLookSeriesFeed,
  type LookSeriesCard,
} from './lookseriesService.ts';
import { normalizeMediaProviderName } from '../src/constants/providerLogos.ts';
import {
  extractLegacySlugLookupCandidates,
  isLikelyIdSuffixTail,
  resolveCanonicalDramaSlug,
} from '../src/utils/seo.ts';

export type HomeLangCode = 'en' | 'id' | 'cn' | 'vi';

export interface CachedDramaItem {
  id?: string;
  bookId: string;
  title: string;
  slug?: string;
  cover: string;
  description: string;
  chapterCount: number;
  episodes?: number;
  tags: string[];
  playCount?: string;
  corner?: string;
  protagonist?: string;
  author?: string;
  isVip: boolean;
  provider: string;
  rank?: number;
  status?: 'Ongoing' | 'Completed';
  rating?: number;
  dailyViews?: number;
  totalViews?: number;
  trendBadge?: 'HOT' | 'TRENDING';
  updatedAt?: number | string;
}

export interface HomeCatalogPayload {
  lang: HomeLangCode;
  provider: string;
  heroSpotlights: CachedDramaItem[];
  trendingTop: CachedDramaItem[];
  hotReleases: CachedDramaItem[];
  catalogGrid: CachedDramaItem[];
  providerCounts: Record<string, number>;
  updatedAt: number;
  expiresAt: number;
  cached: boolean;
  stale: boolean;
  source: 'database-cache' | 'live-refresh' | 'empty-fallback';
  storage: 'postgresql' | 'memory';
}

const MOLATV_API_BASE = 'https://api.molatv.id/api';
export const HOME_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes fresh TTL (+ stale-while-revalidate)
export const API_FEED_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes fresh TTL (+ stale-while-revalidate)
const HOME_DISK_CACHE_PATH = path.resolve(process.cwd(), '.cache', 'home-cache.json');
let diskHomeCacheLoaded = false;

function isTestRuntime(): boolean {
  return (
    process.env.KD_DISABLE_AUTO_LISTEN === '1' ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.some((arg) => arg.includes('.test.'))
  );
}

type StoredHomePayload = Omit<HomeCatalogPayload, 'cached' | 'stale' | 'source' | 'storage'>;

const memoryHomeCache = new Map<
  string,
  { payload: StoredHomePayload; updatedAt: number; expiresAt: number }
>();

const memoryApiCache = new Map<
  string,
  { statusCode: number; payloadJson: string; updatedAt: number; expiresAt: number }
>();

const inFlightHomeBuilds = new Map<string, Promise<HomeCatalogPayload>>();
const inFlightApiRevalidations = new Set<string>();
const recentIndexedBySlug = new Map<string, CachedDramaItem>();

function rememberIndexedDramas(items: CachedDramaItem[]): void {
  let changed = false;
  for (const item of items) {
    if (!item?.bookId || !item?.title) continue;
    const isMovie =
      item.provider === 'LK21' || item.provider === 'LookSeries';
    const slug = isMovie
      ? slugifyTitle(item.slug || item.title)
      : resolveCanonicalDramaSlug({
          title: item.title,
          slug: item.slug,
          bookId: item.bookId,
          provider: item.provider,
        });
    if (!slug) continue;
    const prev = recentIndexedBySlug.get(slug);
    if (
      !prev ||
      prev.bookId !== item.bookId ||
      Number(item.chapterCount || 0) > Number(prev.chapterCount || 0) ||
      (!prev.cover && Boolean(item.cover)) ||
      (!prev.description && Boolean(item.description))
    ) {
      changed = true;
    }
    if (!prev && recentIndexedBySlug.size >= 10000) {
      const oldest = recentIndexedBySlug.keys().next().value;
      if (oldest) recentIndexedBySlug.delete(oldest);
    }
    recentIndexedBySlug.set(slug, { ...item, slug });
  }
  if (changed) {
    bumpSitemapCatalogVersion();
  }
}

function getStorageMode(): 'postgresql' | 'memory' {
  return isDatabaseEnabled() ? 'postgresql' : 'memory';
}

function normalizeLang(raw?: string): HomeLangCode {
  if (raw === 'id' || raw === 'cn' || raw === 'vi' || raw === 'en') return raw;
  return 'en';
}

function normalizeProviderFilter(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return 'All';
  return normalizeMediaProviderName(trimmed);
}

function makeHomeCacheKey(lang: HomeLangCode, provider: string): string {
  return `home:${lang}:${provider}`;
}

function cleanText(val: unknown, fallback = ''): string {
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

function toPositiveNumber(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function slugifyTitle(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 96) || 'watch-drama';
}

const CANONICAL_GENRES: Array<{ label: string; keywords: RegExp }> = [
  { label: 'CEO', keywords: /\b(ceo|boss|president|tycoon|director|direktur|presdir|bos)\b/i },
  { label: 'Revenge', keywords: /\b(revenge|vengeance|betray|betrayal|balas dendam|dendam|divorce|cheating|rebirth|reborn)\b/i },
  { label: 'Romance', keywords: /\b(romance|love|wife|husband|marriage|marry|bride|wedding|crush|sweet|suami|istri|cinta|nikah|secret marriage|flash marriage)\b/i },
  { label: 'Billionaire', keywords: /\b(billionaire|rich|wealthy|heir|heiress|secretly rich|konglomerat|miliarder|hidden identity|undercover)\b/i },
  { label: 'Fantasy', keywords: /\b(fantasy|magic|immortal|cultivat|dragon|system|god|system|time travel|system|mystic|werewolf|vampire)\b/i },
  { label: 'Historical', keywords: /\b(historical|palace|emperor|empress|king|queen|princess|prince|dynasty|kerajaan|ancient|royal|general)\b/i },
  { label: 'Action', keywords: /\b(action|martial|warrior|fighter|assassin|agent|special force|bodyguard|war|battle|master)\b/i },
  { label: 'Dubbed', keywords: /\b(dubbed|dubbing|sulih suara|indo dub|english dub)\b/i },
];

function inferGenresForCatalog(item: CachedDramaItem): string[] {
  const out = new Set<string>();
  for (const tag of item.tags || []) {
    const clean = cleanText(tag);
    if (clean && clean.length <= 32) {
      out.add(clean);
    }
  }
  const haystack = `${item.title} ${item.description} ${(item.tags || []).join(' ')} ${item.corner || ''}`;
  for (const rule of CANONICAL_GENRES) {
    if (rule.keywords.test(haystack)) {
      out.add(rule.label);
    }
  }
  if (out.size === 0) {
    out.add('Romance');
  }
  return Array.from(out).slice(0, 10);
}

function parsePlayCountToNumber(raw?: string, rank?: number): number {
  const s = (raw || '').trim().toUpperCase();
  let score = 0;
  const match = s.match(/([\d.]+)\s*([KMB])?/);
  if (match) {
    const base = parseFloat(match[1]) || 0;
    const suffix = match[2];
    if (suffix === 'B') score = Math.round(base * 1_000_000_000);
    else if (suffix === 'M') score = Math.round(base * 1_000_000);
    else if (suffix === 'K') score = Math.round(base * 1_000);
    else score = Math.round(base);
  }
  if (score <= 0 && typeof rank === 'number' && rank > 0) {
    score = Math.max(10_000, 1_500_000 - rank * 25_000);
  }
  return score || 50_000;
}

function deriveStatus(item: CachedDramaItem): 'Ongoing' | 'Completed' {
  if (item.status === 'Ongoing' || item.status === 'Completed') return item.status;
  const hay = `${item.corner || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  if (hay.includes('ongoing') || hay.includes('updating') || hay.includes('new')) {
    return item.chapterCount >= 40 ? 'Completed' : 'Ongoing';
  }
  return item.chapterCount >= 20 ? 'Completed' : 'Ongoing';
}

function deriveRating(item: CachedDramaItem): number {
  if (typeof item.rating === 'number' && item.rating >= 3.5 && item.rating <= 5) {
    return Number(item.rating.toFixed(1));
  }
  // Deterministic high-signal rating between 4.2 and 4.9 derived from rank/title hash
  let hash = 0;
  for (let i = 0; i < item.bookId.length; i++) {
    hash = (hash * 31 + item.bookId.charCodeAt(i)) % 100;
  }
  const rankBonus = typeof item.rank === 'number' && item.rank <= 10 ? 0.2 : 0;
  const raw = 4.2 + (hash % 7) * 0.1 + rankBonus;
  return Number(Math.min(4.9, Math.max(4.1, raw)).toFixed(1));
}

function toCatalogUpsertItem(item: CachedDramaItem): CatalogUpsertItem {
  const slug = resolveCanonicalDramaSlug({
    title: item.title,
    slug: item.slug,
    bookId: item.bookId,
    provider: item.provider,
  });
  const genres = inferGenresForCatalog(item);
  const status = deriveStatus(item);
  const rating = deriveRating(item);
  const popularityScore = parsePlayCountToNumber(item.playCount, item.rank);
  const enrichedItem: CachedDramaItem = {
    ...item,
    slug,
    status,
    rating,
    tags: item.tags.length > 0 ? item.tags : genres.slice(0, 4),
  };
  return {
    dramaId: item.bookId,
    provider: item.provider,
    slug,
    title: item.title,
    description: item.description,
    cover: item.cover,
    chapterCount: item.chapterCount,
    genres,
    status,
    popularityScore,
    rating,
    playCount: item.playCount,
    isVip: item.isVip,
    dramaJson: enrichedItem as unknown as Record<string, unknown>,
  };
}

export async function syncDramasToCatalogDb(
  items: CachedDramaItem[]
): Promise<void> {
  if (!items || items.length === 0) return;
  rememberIndexedDramas(items);
  const dedup = new Map<string, CatalogUpsertItem>();
  for (const item of items) {
    if (!item?.bookId || !item?.title) continue;
    const key = `${item.provider}:${item.bookId}`;
    if (!dedup.has(key)) {
      dedup.set(key, toCatalogUpsertItem(item));
    }
  }
  if (dedup.size === 0) return;
  const changes = await upsertDramaCatalogBatchInDb(Array.from(dedup.values()));
  if (changes.length > 0) {
    void notifyCatalogAdditionsToGoogle(changes).catch(() => {});
  }
}

export function attachLiveBadgesToItems(
  items: CachedDramaItem[],
  statsMap: Record<string, LiveDramaBadgeStat>,
  options?: { isTrendingSection?: boolean; isHotSection?: boolean }
): CachedDramaItem[] {
  return items.map((item, idx) => {
    const key = `${item.provider}:${item.bookId}`;
    const stat = statsMap[key];
    let trendBadge = stat?.trendBadge ?? item.trendBadge;
    if (!trendBadge) {
      if (options?.isHotSection && idx < 4) {
        trendBadge = 'HOT';
      } else if (options?.isTrendingSection && idx < 6) {
        trendBadge = idx < 2 ? 'HOT' : 'TRENDING';
      }
    }
    return {
      ...item,
      dailyViews: stat ? stat.dailyViews : item.dailyViews,
      totalViews: stat ? stat.totalViews : item.totalViews,
      trendBadge,
    };
  });
}

function hydrateWatchedRecordToCachedItem(
  row: {
    dramaId: string;
    provider: string;
    mediaType: 'drama' | 'movie';
    dailyViews: number;
    totalViews: number;
    item: Record<string, unknown> | null;
  },
  fallbackByKey: Map<string, CachedDramaItem>,
  idx: number
): CachedDramaItem | null {
  const key = `${row.provider}:${row.dramaId}`;
  const fallback = fallbackByKey.get(key);
  const raw = row.item || {};
  const title = cleanText(raw.title) || fallback?.title || '';
  if (!title) return null;
  const cover = cleanText(raw.cover) || fallback?.cover || '';
  const isMovie =
    row.mediaType === 'movie' ||
    row.provider === 'LK21' ||
    row.provider === 'LookSeries';
  const slug = isMovie
    ? cleanText(raw.slug) || fallback?.slug || slugifyTitle(title)
    : resolveCanonicalDramaSlug({
        title,
        slug: cleanText(raw.slug) || fallback?.slug,
        bookId: row.dramaId,
        provider: row.provider,
      });
  const chapterCount = Math.max(
    1,
    toPositiveNumber(raw.chapterCount, 0) ||
      toPositiveNumber(raw.episodes, 0) ||
      fallback?.chapterCount ||
      1
  );
  const tags = Array.isArray(raw.tags)
    ? (raw.tags as unknown[]).filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
    : fallback?.tags || [];

  return {
    id: row.dramaId,
    bookId: row.dramaId,
    title,
    slug,
    cover,
    description: cleanText(raw.description) || fallback?.description || '',
    chapterCount,
    episodes: chapterCount,
    tags,
    playCount: cleanText(raw.playCount) || fallback?.playCount,
    isVip: typeof raw.isVip === 'boolean' ? raw.isVip : Boolean(fallback?.isVip),
    provider: row.provider,
    rank: idx + 1,
    dailyViews: row.dailyViews,
    totalViews: row.totalViews,
    trendBadge: row.dailyViews > 0 && idx < 4 ? 'HOT' : 'TRENDING',
  };
}

async function enrichHomePayloadWithLiveStats(
  payload: StoredHomePayload
): Promise<StoredHomePayload> {
  try {
    const [statsMap, mostWatchedRes] = await Promise.all([
      getTrendingStatsMapFromDb(250),
      getMostWatchedVideosFromDb(24, 0, payload.provider).catch(() => ({
        items: [],
        total: 0,
      })),
    ]);

    const fallbackByKey = new Map<string, CachedDramaItem>();
    for (const list of [
      payload.trendingTop,
      payload.heroSpotlights,
      payload.hotReleases,
      payload.catalogGrid,
    ]) {
      for (const item of list) {
        if (!item?.bookId) continue;
        const k = `${item.provider}:${item.bookId}`;
        if (!fallbackByKey.has(k)) fallbackByKey.set(k, item);
      }
    }
    for (const cached of recentIndexedBySlug.values()) {
      if (!cached?.bookId) continue;
      const k = `${cached.provider}:${cached.bookId}`;
      if (!fallbackByKey.has(k)) fallbackByKey.set(k, cached);
    }

    const watchedTrending: CachedDramaItem[] = [];
    const seenTrending = new Set<string>();
    mostWatchedRes.items.forEach((row, idx) => {
      const hydrated = hydrateWatchedRecordToCachedItem(row, fallbackByKey, idx);
      if (!hydrated) return;
      const key = `${hydrated.provider}:${hydrated.bookId}`;
      if (seenTrending.has(key)) return;
      seenTrending.add(key);
      watchedTrending.push(hydrated);
    });

    watchedTrending.sort((a, b) => {
      const totDiff = (b.totalViews ?? 0) - (a.totalViews ?? 0);
      if (totDiff !== 0) return totDiff;
      return (b.dailyViews ?? 0) - (a.dailyViews ?? 0);
    });

    const baseTrending = attachLiveBadgesToItems(payload.trendingTop, statsMap, {
      isTrendingSection: true,
    });
    const combinedTrending: CachedDramaItem[] = [...watchedTrending];
    for (const item of baseTrending) {
      if (combinedTrending.length >= 12) break;
      const key = `${item.provider}:${item.bookId}`;
      if (seenTrending.has(key)) continue;
      seenTrending.add(key);
      combinedTrending.push(item);
    }
    const finalTrendingTop = combinedTrending.slice(0, 12).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));

    return {
      ...payload,
      heroSpotlights: attachLiveBadgesToItems(payload.heroSpotlights, statsMap),
      trendingTop: finalTrendingTop,
      hotReleases: attachLiveBadgesToItems(payload.hotReleases, statsMap, {
        isHotSection: true,
      }),
      catalogGrid: attachLiveBadgesToItems(payload.catalogGrid, statsMap),
    };
  } catch {
    return payload;
  }
}

function extractBookArray(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    const first = payload[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.books)) {
      return payload.flatMap((entry) =>
        Array.isArray((entry as Record<string, unknown>).books)
          ? ((entry as Record<string, unknown>).books as Record<string, unknown>[])
          : []
      );
    }
    return payload as Record<string, unknown>[];
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.books)) return obj.books as Record<string, unknown>[];
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    if (Array.isArray(obj.list)) return obj.list as Record<string, unknown>[];
    if (Array.isArray(obj.records)) return obj.records as Record<string, unknown>[];
    if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
    if (Array.isArray(obj.dramas)) return obj.dramas as Record<string, unknown>[];
    if (obj.data !== undefined && obj.data !== null) {
      return extractBookArray(obj.data);
    }
  }
  return [];
}

function normalizeDrama(
  raw: Record<string, unknown>,
  rawProvider: string,
  index?: number,
  forceVip = false,
  lang: HomeLangCode = 'en'
): CachedDramaItem | null {
  const provider = normalizeMediaProviderName(rawProvider);
  const idCandidates = [
    raw.bookId,
    raw.book_id,
    raw.playlet_id,
    raw.playletId,
    raw.album_id,
    raw.albumId,
    raw.dramaId,
    raw.drama_id,
    raw.id,
    raw.vid,
  ];
  let bookId = '';
  for (const cand of idCandidates) {
    if (cand !== undefined && cand !== null) {
      const cleaned = cleanText(String(cand));
      if (cleaned) {
        bookId = cleaned;
        break;
      }
    }
  }

  const title = cleanText(
    raw.bookName ??
      raw.title ??
      raw.book_name ??
      raw.name ??
      raw.dramaName ??
      raw.dramaTitle
  );
  if (!bookId || !title) return null;

  const rawCover = cleanText(
    raw.cover ??
      raw.coverUrl ??
      raw.bookCover ??
      raw.book_cover ??
      raw.coverWap ??
      raw.vertical_poster_url ??
      raw.poster ??
      raw.image ??
      raw.cover_url ??
      raw.coverImg ??
      raw.cover_image ??
      raw.thumb
  );

  const needsProxy =
    Boolean(rawCover) &&
    !rawCover.startsWith('/api/proxy') &&
    (rawCover.startsWith('http://') ||
      (provider === 'MeloLoV2' &&
        (rawCover.toLowerCase().includes('.heic') ||
          rawCover.toLowerCase().includes('fizzopic.org'))));

  const cover = needsProxy
    ? `/api/proxy?url=${encodeURIComponent(rawCover)}`
    : rawCover;

  const defaultDesc =
    lang === 'id'
      ? `Tonton gratis ${title} dalam mode teater HD vertikal di KanoDrama.`
      : lang === 'cn'
      ? `在 KanoDrama 免费观看《${title}》竖屏高清剧场版。`
      : lang === 'vi'
      ? `Xem miễn phí ${title} chất lượng HD màn hình dọc trên KanoDrama.`
      : `Watch free ${title} in vertical HD theater mode on KanoDrama.`;

  const description = cleanText(
    raw.description ??
      raw.introduction ??
      raw.synopsis ??
      raw.intro ??
      raw.summary,
    defaultDesc
  );

  let chapterCount = toPositiveNumber(
    raw.chapterCount ??
      raw.totalEpisodes ??
      raw.episodeCount ??
      raw.episode_count ??
      raw.total_episode ??
      raw.total_episodes ??
      raw.num_videos ??
      raw.totalChapter,
    0
  );
  if (chapterCount <= 0) {
    const epHint = title.match(/(\d+)\s*Episode/i);
    chapterCount = epHint ? Math.max(1, Number(epHint[1])) : 1;
  }

  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags
      .map((t) =>
        typeof t === 'object' && t !== null
          ? cleanText(
              (t as Record<string, unknown>).name ??
                (t as Record<string, unknown>).tagName
            )
          : cleanText(t)
      )
      .filter((t): t is string => Boolean(t));
  } else if (Array.isArray(raw.labels)) {
    tags = raw.labels
      .map((t) => cleanText(t))
      .filter((t): t is string => Boolean(t));
  } else if (Array.isArray(raw.tagV3s)) {
    tags = raw.tagV3s
      .map((t) =>
        typeof t === 'object' && t !== null
          ? cleanText((t as Record<string, unknown>).tagName)
          : cleanText(t)
      )
      .filter((t): t is string => Boolean(t));
  }

  const cornerText =
    typeof raw.corner === 'object' && raw.corner !== null
      ? cleanText((raw.corner as Record<string, unknown>).name)
      : cleanText(raw.corner);

  const isVip =
    forceVip ||
    Boolean(raw.isVip) ||
    cornerText.toLowerCase().includes('vip');

  const status: 'Ongoing' | 'Completed' =
    chapterCount >= 20 ? 'Completed' : 'Ongoing';

  return {
    id: bookId,
    bookId,
    title,
    slug: resolveCanonicalDramaSlug({
      title,
      slug: cleanText(raw.slug),
      bookId,
      provider,
    }),
    cover,
    description,
    chapterCount,
    episodes: chapterCount,
    tags,
    playCount: cleanText(raw.playCount ?? raw.hotCode ?? raw.views) || undefined,
    corner: cornerText || undefined,
    protagonist: cleanText(raw.protagonist) || undefined,
    author: cleanText(raw.author) || undefined,
    isVip,
    provider,
    rank: typeof index === 'number' ? index + 1 : undefined,
    status,
  };
}

function interleaveUnique(...lists: CachedDramaItem[][]): CachedDramaItem[] {
  const merged: CachedDramaItem[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const candidate = list[i];
      if (candidate) {
        const key = `${candidate.provider}:${candidate.bookId}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(candidate);
        }
      }
    }
  }
  return merged;
}

function mapLangForProvider(provider: string, lang: HomeLangCode): string | null {
  switch (provider) {
    case 'DramaBoxV2':
      return lang === 'cn' ? 'zh' : lang;
    case 'NetShort':
      if (lang === 'id') return 'id_ID';
      if (lang === 'cn') return 'zh_CN';
      if (lang === 'vi') return 'vi_VN';
      return 'en_US';
    case 'DramaOra':
      return lang === 'id' ? 'id-id' : 'en-us';
    case 'PetaDrama':
      return null;
    case 'RadReels':
      return lang === 'id' ? '4' : '3';
    case 'StardustTV':
      return lang === 'id' ? 'id_ID' : 'en_US';
    case 'StarShort':
      return lang === 'id' ? '4' : '1';
    case 'CubeTV':
      return lang === 'id' ? '9' : '1';
    case 'FlickReels':
      return lang === 'id' ? '6' : '1';
    case 'DramaWave':
    case 'FreeReels':
      return lang === 'id' ? 'id-ID' : 'en-US';
    case 'MeloLoV2':
    case 'ReelShortV2':
    case 'MeloShort':
    case 'DramaVerse':
    case 'MoboReels':
    case 'MicroDrama':
    case 'FunDrama':
    case 'Vigloo':
    case 'DotDrama':
    case 'GoodShort':
    case 'SodaReels':
      return lang === 'id' ? 'in' : 'en';
    default:
      return lang === 'id' ? 'id' : 'en';
  }
}

interface ProviderFeedTarget {
  provider: string;
  apiSegment: string;
  endpoints: {
    path: string;
    role: 'rank' | 'foryou' | 'new';
    extraQuery?: Record<string, string | number>;
  }[];
}

function resolveProviderApiSegment(provider: string): string {
  const normalized = normalizeMediaProviderName(provider);
  const map: Record<string, string> = {
    DramaBoxV2: 'dramaboxv2',
    NetShort: 'netshort',
    AnyReel: 'anyreel',
    MeloLoV2: 'melolo',
    DramaOra: 'dramaora',
    MeloShort: 'meloshort',
    PetaDrama: 'petadrama',
    RadReels: 'radreels',
    DramaVerse: 'dramaverse',
    KalosTV: 'kalostv',
    StardustTV: 'stardust',
    StarShort: 'starshort',
    DramaBite: 'dramabite',
    LoveShots: 'loveshots',
    MyDrama: 'mydrama',
    ShotShort: 'shotshort',
    MoboReels: 'moboreels',
    BlinkDrama: 'blinkdrama',
    WeTV: 'wetv',
    CubeTV: 'cubetv',
    MicroDrama: 'microdrama',
    FlareFlow: 'flareflow',
    FunDrama: 'fundrama',
    FreeShort: 'freeshort',
    ToonShort: 'toonshort',
    HappyShort: 'happyshort',
    DramaDash: 'dramadash',
    StoryReelV2: 'storyreel_v2',
    VibeShortV2: 'vibeshort_v2',
    FlickReels: 'flickreels',
    DramaWave: 'dramawave',
    FreeReels: 'freereels',
    PineDrama: 'pinedrama',
    ShortMaxV2: 'shortmax_v2',
    FlexTV: 'flextv',
    Vigloo: 'vigloo',
    DotDrama: 'dotdrama',
    iDramaV2: 'idramav2',
    GoodShort: 'goodshort',
    ReelShortV2: 'reelshortv2',
    JoyReels: 'joyreels',
    SodaReels: 'sodareels',
    BonusTV: 'bonustv',
    iQIYI: 'iqiyi',
    AudioToon: 'audiotoon',
    Playlet: 'playlet',
    MomeShort: 'momeshort',
    StoReel: 'storeel',
    MyMuse: 'mymuse',
    HuangDou: 'huangdou',
    MoreShort: 'moreshort',
    DramaRush: 'dramarush',
    Shortswave: 'shortswave',
    Relala: 'relala',
    SixthShort: 'sixthshort',
    SnackShort: 'snackshort',
    Soreel: 'soreel',
    StarReel: 'stareel',
    StoryGo: 'storygo',
    MiniShort: 'minishort',
    Shorten: 'shorten',
    Velolo: 'velolo',
    ReelPine: 'reelpine',
    DynastyShorts: 'dynastyshorts',
    DramaShorts: 'dramashorts',
    TallFlix: 'tallflix',
    Qlax: 'qlax',
    Shortical: 'shortical',
    LuziCine: 'luzicine',
    ZebraShort: 'zebrashort',
    DrakorID: 'drakorid',
    DrachinReborn: 'drachinreborn',
    DramaQueen: 'dramaqueen',
    Ansflix: 'ansflix',
    LupaCine: 'lupacine',
    ReelLife: 'reellife',
    Bstation: 'bstation',
    Anichin: 'anichin',
    DonghuaQueen: 'donghuaqueen',
    Samehadaku: 'samehadaku',
    AnimeX: 'animex',
    WinkNovel: 'winknovel',
  };
  return map[normalized] ?? normalized.toLowerCase();
}

function getEndpointsForProvider(rawProvider: string): ProviderFeedTarget {
  const provider = normalizeMediaProviderName(rawProvider);
  const apiSegment = resolveProviderApiSegment(provider);
  switch (provider) {
    case 'DramaBoxV2':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/ranking', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/terbaru', role: 'new' },
        ],
      };
    case 'NetShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/trending', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/all', role: 'new' },
        ],
      };
    case 'AnyReel':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/asian', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'MeloLoV2':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/rank', role: 'rank', extraQuery: { page_size: 18 } },
          { path: '/foryou', role: 'foryou' },
          { path: '/new_release', role: 'new', extraQuery: { page_size: 10 } },
        ],
      };
    case 'DramaOra':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/category_dramas', role: 'rank', extraQuery: { category_id: 57819, page_size: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 20 } },
        ],
      };
    case 'MeloShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/ranking', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/recommend', role: 'new', extraQuery: { reset: 1 } },
        ],
      };
    case 'PetaDrama':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/category_dramas', role: 'rank', extraQuery: { category_id: 57819, page_size: 20 } },
          { path: '/alldrama', role: 'foryou', extraQuery: { pageSize: 30 } },
        ],
      };
    case 'RadReels':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/trending', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/baru', role: 'new' },
        ],
      };
    case 'DramaVerse':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/hot', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/new', role: 'new' },
        ],
      };
    case 'StardustTV':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/hot', role: 'rank', extraQuery: { page_size: 15 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 15 } },
          { path: '/terbaru', role: 'new', extraQuery: { page_size: 15 } },
        ],
      };
    case 'StarShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/trending', role: 'rank', extraQuery: { pageSize: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { pageSize: 20 } },
          { path: '/baru', role: 'new', extraQuery: { pageSize: 20 } },
        ],
      };
    case 'LoveShots':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/trending', role: 'rank', extraQuery: { page_size: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 20 } },
          { path: '/new', role: 'new', extraQuery: { page_size: 20 } },
        ],
      };
    case 'ShotShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/alldrama', role: 'rank', extraQuery: { limit: 20, sort_type: 1 } },
          { path: '/terbaru', role: 'foryou', extraQuery: { limit: 20 } },
        ],
      };
    case 'MoboReels':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/original', role: 'rank', extraQuery: { page_size: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 20 } },
          { path: '/baru', role: 'new', extraQuery: { page_size: 20 } },
        ],
      };
    case 'BlinkDrama':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/alldrama', role: 'rank', extraQuery: { page_size: 20, class_id: 0 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 20 } },
          { path: '/new', role: 'new', extraQuery: { page_size: 20 } },
        ],
      };
    case 'CubeTV':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/hot', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/newrelease', role: 'new' },
        ],
      };
    case 'FlareFlow':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/alldrama', role: 'rank', extraQuery: { page_size: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { page_size: 20 } },
        ],
      };
    case 'FreeShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/ranking', role: 'rank', extraQuery: { limit: 20 } },
          { path: '/foryou', role: 'foryou', extraQuery: { limit: 20 } },
          { path: '/new', role: 'new', extraQuery: { limit: 20 } },
        ],
      };
    case 'ToonShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/popular', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'HappyShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/ranking', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/terbaru', role: 'new' },
        ],
      };
    case 'DramaDash':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/trending', role: 'rank', extraQuery: { pageSize: 10 } },
          { path: '/foryou', role: 'foryou', extraQuery: { pageSize: 10 } },
        ],
      };
    case 'StoryReelV2':
    case 'VibeShortV2':
    case 'ShortMaxV2':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/all', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/terbaru', role: 'new' },
        ],
      };
    case 'FlickReels':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/alldrama', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'DramaWave':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/exclusive', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'FreeReels':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/popular', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/terbaru', role: 'new' },
        ],
      };
    case 'Vigloo':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/ranking', role: 'rank', extraQuery: { per_page: 20 } },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'GoodShort':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/tren', role: 'rank', extraQuery: { page_size: 20 } },
          { path: '/foryou', role: 'foryou' },
        ],
      };
    case 'JoyReels':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/hot', role: 'rank' },
          { path: '/new', role: 'new' },
        ],
      };
    case 'iQIYI':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/recomendasi', role: 'rank', extraQuery: { per_page: 20 } },
          { path: '/drama', role: 'foryou', extraQuery: { per_page: 20 } },
        ],
      };
    case 'Bstation':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/anime', role: 'foryou' },
          { path: '/popular', role: 'rank' },
          { path: '/trending', role: 'new' },
        ],
      };
    case 'Anichin':
    case 'DonghuaQueen':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/donghua', role: 'foryou' },
          { path: '/latest', role: 'new' },
          { path: '/popular', role: 'rank' },
        ],
      };
    case 'Samehadaku':
    case 'AnimeX':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/anime', role: 'foryou' },
          { path: '/latest', role: 'new' },
          { path: '/popular', role: 'rank' },
        ],
      };
    case 'iDramaV2':
      return {
        provider,
        apiSegment,
        endpoints: [{ path: '/foryou', role: 'foryou' }],
      };
    case 'ReelShortV2':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/populer', role: 'rank' },
          { path: '/foryou', role: 'foryou' },
          { path: '/terbaru', role: 'new' },
        ],
      };
    case 'Ansflix':
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/foryou', role: 'foryou', extraQuery: { pagesize: 12 } },
        ],
      };
    default:
      return {
        provider,
        apiSegment,
        endpoints: [
          { path: '/foryou', role: 'foryou' },
          { path: '/ranking', role: 'rank' },
          { path: '/terbaru', role: 'new' },
          { path: '/popular', role: 'rank' },
        ],
      };
  }
}

async function fetchUpstreamFeed(
  token: string,
  provider: string,
  apiSegment: string,
  endpointPath: string,
  lang: HomeLangCode,
  withRank: boolean,
  extraQuery?: Record<string, string | number>,
  strictCandidatesOnly = false
): Promise<CachedDramaItem[]> {
  const candidates = strictCandidatesOnly
    ? Array.from(new Set([endpointPath, '/foryou']))
    : Array.from(
        new Set([
          endpointPath,
          '/foryou',
          '/hot',
          '/popular',
          '/trending',
          '/ranking',
          '/rank',
          '/terbaru',
          '/new',
          '/latest',
          '/alldrama',
          '/all',
          '/anime',
          '/donghua',
        ])
      );

  for (const pathCandidate of candidates) {
    const url = new URL(`${MOLATV_API_BASE}/${apiSegment}${pathCandidate}`);
    url.searchParams.set('page', '1');
    const langParam = mapLangForProvider(provider, lang);
    if (langParam) url.searchParams.set('lang', langParam);
    if (extraQuery && pathCandidate === endpointPath) {
      for (const [k, v] of Object.entries(extraQuery)) {
        url.searchParams.set(k, String(v));
      }
    }
    url.searchParams.set('token', token);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7500),
      });
      if (!res.ok) {
        if (
          res.status === 401 ||
          res.status === 403 ||
          res.status === 429 ||
          res.status === 503
        ) {
          return [];
        }
        continue;
      }
      const rawText = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        continue;
      }
      const rawList = extractBookArray(json);

      const out: CachedDramaItem[] = [];
      const seen = new Set<string>();
      rawList.forEach((raw, idx) => {
        const item = normalizeDrama(
          raw,
          provider,
          withRank ? idx : undefined,
          false,
          lang
        );
        if (item && !seen.has(item.bookId)) {
          seen.add(item.bookId);
          out.push(item);
        }
      });
      if (out.length > 0) {
        return out;
      }
    } catch {
      continue;
    }
  }
  return [];
}

function loadHomeDiskCacheOnce(): void {
  if (diskHomeCacheLoaded || isTestRuntime()) return;
  diskHomeCacheLoaded = true;
  try {
    if (!fs.existsSync(HOME_DISK_CACHE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(HOME_DISK_CACHE_PATH, 'utf-8')) as Record<
      string,
      { payload?: StoredHomePayload; updatedAt?: number; expiresAt?: number }
    >;
    if (!raw || typeof raw !== 'object') return;
    for (const [key, entry] of Object.entries(raw)) {
      if (entry?.payload && hasAnyItems(entry.payload) && !memoryHomeCache.has(key)) {
        memoryHomeCache.set(key, {
          payload: entry.payload,
          updatedAt: Number(entry.updatedAt) || Date.now(),
          expiresAt: Number(entry.expiresAt) || 0,
        });
      }
    }
  } catch {
    // Ignore corrupt disk snapshot
  }
}

function persistHomeDiskCache(): void {
  if (isTestRuntime()) return;
  try {
    const dir = path.dirname(HOME_DISK_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const snapshot: Record<
      string,
      { payload: StoredHomePayload; updatedAt: number; expiresAt: number }
    > = {};
    let count = 0;
    for (const [k, v] of memoryHomeCache.entries()) {
      if (!hasAnyItems(v.payload)) continue;
      snapshot[k] = v;
      count += 1;
      if (count >= 24) break;
    }
    const tmpPath = `${HOME_DISK_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot), 'utf-8');
    fs.renameSync(tmpPath, HOME_DISK_CACHE_PATH);
  } catch (err) {
    console.warn(
      '[HomeCache] Disk cache write failed:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function readHomeFromDb(
  cacheKey: string
): Promise<{
  payload: StoredHomePayload;
  updatedAt: number;
  expiresAt: number;
} | null> {
  loadHomeDiskCacheOnce();
  const mem = memoryHomeCache.get(cacheKey);
  if (mem) {
    return mem;
  }

  try {
    const res = await dbQuery<{
      payload_json: StoredHomePayload | string;
      updated_at: string | number;
      expires_at: string | number;
    }>(
      'SELECT payload_json, updated_at, expires_at FROM home_cache WHERE cache_key = $1',
      [cacheKey]
    );
    const row = res?.rows[0];
    if (row && row.payload_json) {
      const parsed =
        typeof row.payload_json === 'string'
          ? (JSON.parse(row.payload_json) as StoredHomePayload)
          : row.payload_json;
      const entry = {
        payload: parsed,
        updatedAt: Number(row.updated_at) || Date.now(),
        expiresAt: Number(row.expires_at) || 0,
      };
      memoryHomeCache.set(cacheKey, entry);
      persistHomeDiskCache();
      return entry;
    }
  } catch (err) {
    console.warn(
      '[HomeCache] Failed reading PostgreSQL home_cache:',
      err instanceof Error ? err.message : String(err)
    );
  }
  return null;
}

async function writeHomeToDb(
  cacheKey: string,
  payload: StoredHomePayload,
  updatedAt: number,
  expiresAt: number
): Promise<void> {
  memoryHomeCache.set(cacheKey, { payload, updatedAt, expiresAt });
  persistHomeDiskCache();
  try {
    await dbQuery(
      `INSERT INTO home_cache (cache_key, payload_json, updated_at, expires_at)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         updated_at = EXCLUDED.updated_at,
         expires_at = EXCLUDED.expires_at`,
      [cacheKey, JSON.stringify(payload), updatedAt, expiresAt]
    );
  } catch (err) {
    console.warn(
      '[HomeCache] Failed writing PostgreSQL home_cache:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function buildHomePayloadFromUpstream(
  token: string,
  lang: HomeLangCode,
  provider: string
): Promise<StoredHomePayload> {
  const now = Date.now();
  const providerCounts: Record<string, number> = {};

  if (provider === 'All') {
    const coreTargets: Array<{
      provider: string;
      apiSegment: string;
      path: string;
      role: 'rank' | 'foryou' | 'new';
      extraQuery?: Record<string, string | number>;
    }> = [
      { provider: 'DramaBoxV2', apiSegment: 'dramaboxv2', path: '/ranking', role: 'rank' },
      { provider: 'DramaBoxV2', apiSegment: 'dramaboxv2', path: '/foryou', role: 'foryou' },
      { provider: 'DramaBoxV2', apiSegment: 'dramaboxv2', path: '/terbaru', role: 'new' },
      { provider: 'NetShort', apiSegment: 'netshort', path: '/trending', role: 'rank' },
      { provider: 'NetShort', apiSegment: 'netshort', path: '/foryou', role: 'foryou' },
      { provider: 'AnyReel', apiSegment: 'anyreel', path: '/asian', role: 'rank' },
      { provider: 'AnyReel', apiSegment: 'anyreel', path: '/foryou', role: 'foryou' },
      { provider: 'MeloLoV2', apiSegment: 'melolo', path: '/rank', role: 'rank', extraQuery: { page_size: 18 } },
      { provider: 'MeloLoV2', apiSegment: 'melolo', path: '/new_release', role: 'new', extraQuery: { page_size: 10 } },
      { provider: 'iDramaV2', apiSegment: 'idramav2', path: '/foryou', role: 'foryou' },
      { provider: 'ReelShortV2', apiSegment: 'reelshortv2', path: '/foryou', role: 'foryou' },
      { provider: 'Ansflix', apiSegment: 'ansflix', path: '/foryou', role: 'foryou', extraQuery: { pagesize: 12 } },
      { provider: 'WeTV', apiSegment: 'wetv', path: '/foryou', role: 'foryou' },
      { provider: 'GoodShort', apiSegment: 'goodshort', path: '/tren', role: 'rank', extraQuery: { page_size: 15 } },
    ];

    const settled = await Promise.allSettled(
      coreTargets.map((target) =>
        fetchUpstreamFeed(
          token,
          target.provider,
          target.apiSegment,
          target.path,
          lang,
          target.role === 'rank',
          target.extraQuery,
          true
        )
      )
    );

    const rankLists: CachedDramaItem[][] = [];
    const newLists: CachedDramaItem[][] = [];
    const forYouLists: CachedDramaItem[][] = [];
    const providerKeySets: Record<string, Set<string>> = {};

    settled.forEach((result, idx) => {
      if (result.status !== 'fulfilled') return;
      const items = result.value;
      const target = coreTargets[idx];
      if (!providerKeySets[target.provider]) {
        providerKeySets[target.provider] = new Set();
      }
      for (const it of items) {
        providerKeySets[target.provider].add(it.bookId);
      }
      if (target.role === 'rank') rankLists.push(items);
      else if (target.role === 'new') newLists.push(items);
      else forYouLists.push(items);
    });

    let totalAll = 0;
    for (const [prov, set] of Object.entries(providerKeySets)) {
      providerCounts[prov] = set.size;
      totalAll += set.size;
    }
    providerCounts.all = totalAll;

    const trendingPool = interleaveUnique(...rankLists).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
    const hotPool = interleaveUnique(...newLists, ...forYouLists);
    const catalogPool = interleaveUnique(...forYouLists, ...rankLists, ...newLists);

    const heroCandidates = interleaveUnique(
      ...rankLists.map((l) => l.slice(0, 3)),
      ...forYouLists.map((l) => l.slice(0, 2))
    ).filter((d) => Boolean(d.cover));

    return {
      lang,
      provider,
      heroSpotlights: heroCandidates.slice(0, 8),
      trendingTop: trendingPool.slice(0, 12),
      hotReleases: hotPool.slice(0, 12),
      catalogGrid: catalogPool.slice(0, 20),
      providerCounts,
      updatedAt: now,
      expiresAt: now + HOME_CACHE_TTL_MS,
    };
  }

  const target = getEndpointsForProvider(provider);
  const settled = await Promise.allSettled(
    target.endpoints.map((ep) =>
      fetchUpstreamFeed(
        token,
        target.provider,
        target.apiSegment,
        ep.path,
        lang,
        ep.role === 'rank',
        ep.extraQuery
      )
    )
  );

  const rankLists: CachedDramaItem[][] = [];
  const otherLists: CachedDramaItem[][] = [];
  const seenIds = new Set<string>();

  settled.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;
    const items = result.value;
    for (const it of items) seenIds.add(it.bookId);
    if (target.endpoints[idx].role === 'rank') rankLists.push(items);
    else otherLists.push(items);
  });

  providerCounts[provider] = seenIds.size;
  providerCounts.all = seenIds.size;

  const trendingPool = interleaveUnique(...rankLists, ...otherLists).map(
    (item, idx) => ({ ...item, rank: idx + 1 })
  );
  const hotPool = interleaveUnique(...otherLists, ...rankLists);
  const catalogPool = interleaveUnique(...otherLists, ...rankLists);

  return {
    lang,
    provider,
    heroSpotlights: trendingPool.filter((d) => Boolean(d.cover)).slice(0, 6),
    trendingTop: trendingPool.slice(0, 12),
    hotReleases: hotPool.slice(0, 12),
    catalogGrid: catalogPool.slice(0, 20),
    providerCounts,
    updatedAt: now,
    expiresAt: now + HOME_CACHE_TTL_MS,
  };
}

function hasAnyItems(p: {
  heroSpotlights: CachedDramaItem[];
  trendingTop: CachedDramaItem[];
  hotReleases: CachedDramaItem[];
  catalogGrid: CachedDramaItem[];
}): boolean {
  return (
    p.heroSpotlights.length > 0 ||
    p.trendingTop.length > 0 ||
    p.hotReleases.length > 0 ||
    p.catalogGrid.length > 0
  );
}

function mapLookSeriesCardToCachedDrama(
  card: LookSeriesCard,
  index: number
): CachedDramaItem {
  const cleanId = cleanText(card.bookId || card.slug);
  const title = cleanText(card.title, 'Featured Series');
  const slug = buildLookSeriesSlug(cleanId, title) || slugifyTitle(title);
  return {
    id: cleanId,
    bookId: cleanId,
    title,
    slug,
    cover: cleanText(card.cover || card.coverHz),
    description: cleanText(
      card.description,
      `Watch ${title} in Full HD on KanoDrama.`
    ),
    chapterCount: Math.max(1, Number(card.chapterCount) || 1),
    episodes: Math.max(1, Number(card.chapterCount) || 1),
    tags: Array.isArray(card.genre) ? card.genre.slice(0, 6) : [],
    isVip: false,
    provider: 'LookSeries',
    rank: index + 1,
    status: (Number(card.chapterCount) || 1) >= 20 ? 'Completed' : 'Ongoing',
  };
}

async function buildFallbackHomePayload(
  token: string,
  lang: HomeLangCode,
  provider: string
): Promise<StoredHomePayload | null> {
  const now = Date.now();
  // 1. Try existing PostgreSQL drama_catalog first when upstream is slow/down
  try {
    const catalogRows = await listCatalogForSitemapFromDb(40);
    const matching = catalogRows.filter(
      (r) =>
        r.title &&
        r.cover &&
        (provider === 'All' || normalizeMediaProviderName(r.provider) === provider)
    );
    if (matching.length > 0) {
      const items: CachedDramaItem[] = matching.slice(0, 24).map((r, idx) => ({
        id: r.dramaId,
        bookId: r.dramaId,
        title: r.title,
        slug: r.slug,
        cover: r.cover || '',
        description: r.description || `Watch ${r.title} in HD on KanoDrama.`,
        chapterCount: Math.max(1, r.chapterCount || 1),
        episodes: Math.max(1, r.chapterCount || 1),
        tags: r.genres.slice(0, 5),
        isVip: false,
        provider: normalizeMediaProviderName(r.provider),
        rank: idx + 1,
        status: (r.chapterCount || 1) >= 20 ? 'Completed' : 'Ongoing',
      }));
      return {
        lang,
        provider,
        heroSpotlights: items.slice(0, 6),
        trendingTop: items.slice(0, 12),
        hotReleases: items.slice(4, 16).length > 0 ? items.slice(4, 16) : items.slice(0, 12),
        catalogGrid: items.slice(0, 20),
        providerCounts: { all: items.length, [provider]: items.length },
        updatedAt: now,
        expiresAt: now + 3 * 60 * 1000,
      };
    }
  } catch {
    // Ignore DB catalog fallback error
  }

  // 2. Fallback to LookSeries feed when primary drama endpoints fail or return empty
  if (token && (provider === 'All' || provider === 'LookSeries')) {
    try {
      const lsFeed = await getLookSeriesFeed(() => token, 'series', 1);
      if (lsFeed.items.length > 0) {
        const mapped = lsFeed.items
          .slice(0, 20)
          .map((card, idx) => mapLookSeriesCardToCachedDrama(card, idx));
        return {
          lang,
          provider,
          heroSpotlights: mapped.filter((d) => Boolean(d.cover)).slice(0, 6),
          trendingTop: mapped.slice(0, 12),
          hotReleases: mapped.slice(0, 12),
          catalogGrid: mapped,
          providerCounts: { all: mapped.length, LookSeries: mapped.length },
          updatedAt: now,
          expiresAt: now + 5 * 60 * 1000,
        };
      }
    } catch {
      // Ignore LookSeries fallback failure
    }
  }

  return null;
}

async function refreshAndPersistHome(
  token: string,
  lang: HomeLangCode,
  provider: string
): Promise<HomeCatalogPayload> {
  const cacheKey = makeHomeCacheKey(lang, provider);
  const existingBuild = inFlightHomeBuilds.get(cacheKey);
  if (existingBuild) return existingBuild;

  const task = (async (): Promise<HomeCatalogPayload> => {
    if (!token) {
      const existing = await readHomeFromDb(cacheKey);
      if (existing && hasAnyItems(existing.payload)) {
        const enriched = await enrichHomePayloadWithLiveStats(existing.payload);
        return {
          ...enriched,
          updatedAt: existing.updatedAt,
          expiresAt: existing.expiresAt,
          cached: true,
          stale: true,
          source: 'database-cache',
          storage: getStorageMode(),
        };
      }
      const now = Date.now();
      const emptyPayload: StoredHomePayload = {
        lang,
        provider,
        heroSpotlights: [],
        trendingTop: [],
        hotReleases: [],
        catalogGrid: [],
        providerCounts: {},
        updatedAt: now,
        expiresAt: now + 30_000,
      };
      const enrichedEmpty = await enrichHomePayloadWithLiveStats(emptyPayload);
      return {
        ...enrichedEmpty,
        cached: false,
        stale: false,
        source: enrichedEmpty.trendingTop.length > 0 ? 'database-cache' : 'empty-fallback',
        storage: getStorageMode(),
      };
    }

    try {
      const built = await buildHomePayloadFromUpstream(token, lang, provider);
      if (hasAnyItems(built)) {
        await writeHomeToDb(cacheKey, built, built.updatedAt, built.expiresAt);
        const allBuilt = [
          ...built.heroSpotlights,
          ...built.trendingTop,
          ...built.hotReleases,
          ...built.catalogGrid,
        ];
        void syncDramasToCatalogDb(allBuilt).catch(() => {});
        const enriched = await enrichHomePayloadWithLiveStats(built);
        return {
          ...enriched,
          cached: false,
          stale: false,
          source: 'live-refresh',
          storage: getStorageMode(),
        };
      }
    } catch (err) {
      console.warn(
        `[HomeCache] Upstream refresh failed for ${cacheKey}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    const previous = await readHomeFromDb(cacheKey);
    if (previous && hasAnyItems(previous.payload)) {
      const enriched = await enrichHomePayloadWithLiveStats(previous.payload);
      return {
        ...enriched,
        updatedAt: previous.updatedAt,
        expiresAt: previous.expiresAt,
        cached: true,
        stale: true,
        source: 'database-cache',
        storage: getStorageMode(),
      };
    }

    const emergencyFallback = await buildFallbackHomePayload(token, lang, provider);
    if (emergencyFallback && hasAnyItems(emergencyFallback)) {
      await writeHomeToDb(
        cacheKey,
        emergencyFallback,
        emergencyFallback.updatedAt,
        emergencyFallback.expiresAt
      );
      const enriched = await enrichHomePayloadWithLiveStats(emergencyFallback);
      return {
        ...enriched,
        cached: false,
        stale: true,
        source: 'live-refresh',
        storage: getStorageMode(),
      };
    }

    const now = Date.now();
    return {
      lang,
      provider,
      heroSpotlights: [],
      trendingTop: [],
      hotReleases: [],
      catalogGrid: [],
      providerCounts: {},
      updatedAt: now,
      expiresAt: now + 30_000,
      cached: false,
      stale: false,
      source: 'empty-fallback',
      storage: getStorageMode(),
    };
  })().finally(() => {
    inFlightHomeBuilds.delete(cacheKey);
  });

  inFlightHomeBuilds.set(cacheKey, task);
  return task;
}

export async function getCachedHomeData(
  token: string,
  rawLang?: string,
  rawProvider?: string,
  forceRefresh = false
): Promise<HomeCatalogPayload> {
  const lang = normalizeLang(rawLang);
  const provider = normalizeProviderFilter(rawProvider);
  const cacheKey = makeHomeCacheKey(lang, provider);

  const cached = await readHomeFromDb(cacheKey);
  if (!forceRefresh && cached && hasAnyItems(cached.payload)) {
    const isStale = Date.now() > cached.expiresAt;
    if (isStale && token && !inFlightHomeBuilds.has(cacheKey)) {
      void refreshAndPersistHome(token, lang, provider).catch(() => {});
    }
    const enriched = await enrichHomePayloadWithLiveStats(cached.payload);
    return {
      ...enriched,
      updatedAt: cached.updatedAt,
      expiresAt: cached.expiresAt,
      cached: true,
      stale: isStale,
      source: 'database-cache',
      storage: getStorageMode(),
    };
  }

  return refreshAndPersistHome(token, lang, provider);
}

export async function peekCachedHomeDataForSsr(
  rawLang?: string,
  rawProvider?: string
): Promise<HomeCatalogPayload | null> {
  const lang = normalizeLang(rawLang);
  const provider = normalizeProviderFilter(rawProvider);
  const cacheKey = makeHomeCacheKey(lang, provider);

  const cached = await readHomeFromDb(cacheKey);
  if (!cached || !hasAnyItems(cached.payload)) {
    return null;
  }

  return {
    ...cached.payload,
    updatedAt: cached.updatedAt,
    expiresAt: cached.expiresAt,
    cached: true,
    stale: Date.now() > cached.expiresAt,
    source: 'database-cache',
    storage: getStorageMode(),
  };
}

export async function clearHomeCatalogCache(options?: {
  lang?: string;
  provider?: string;
  includeApiFeedCache?: boolean;
}): Promise<{ clearedKeys: string[]; clearedAll: boolean }> {
  const hasSpecific = Boolean(options?.lang || options?.provider);
  const clearedKeys: string[] = [];

  if (hasSpecific) {
    const lang = normalizeLang(options?.lang);
    const provider = normalizeProviderFilter(options?.provider);
    const cacheKey = makeHomeCacheKey(lang, provider);
    if (memoryHomeCache.delete(cacheKey)) {
      clearedKeys.push(cacheKey);
    }
    try {
      await dbQuery('DELETE FROM home_cache WHERE cache_key = $1', [cacheKey]);
    } catch {
      // Ignore DB failure
    }
    persistHomeDiskCache();
    return { clearedKeys, clearedAll: false };
  }

  for (const key of memoryHomeCache.keys()) {
    clearedKeys.push(key);
  }
  memoryHomeCache.clear();
  if (options?.includeApiFeedCache) {
    memoryApiCache.clear();
  }
  try {
    await dbQuery('DELETE FROM home_cache');
    if (options?.includeApiFeedCache) {
      await dbQuery('DELETE FROM api_response_cache');
    }
  } catch {
    // Ignore DB failure
  }
  if (!isTestRuntime() && fs.existsSync(HOME_DISK_CACHE_PATH)) {
    try {
      fs.unlinkSync(HOME_DISK_CACHE_PATH);
    } catch {
      // Ignore unlink failure
    }
  }
  return { clearedKeys, clearedAll: true };
}

export function triggerAsyncHomeRevalidate(
  token: string,
  rawLang?: string,
  rawProvider?: string
): { started: boolean; cacheKey: string } {
  const lang = normalizeLang(rawLang);
  const provider = normalizeProviderFilter(rawProvider);
  const cacheKey = makeHomeCacheKey(lang, provider);
  if (!token) {
    return { started: false, cacheKey };
  }
  void refreshAndPersistHome(token, lang, provider).catch(() => {});
  return { started: true, cacheKey };
}

export async function getHomeCacheStatus(): Promise<{
  storage: 'postgresql' | 'memory';
  ttlMinutes: number;
  entries: {
    cacheKey: string;
    updatedAt: number;
    expiresAt: number;
    stale: boolean;
    heroCount: number;
    trendingCount: number;
    hotCount: number;
    catalogCount: number;
  }[];
}> {
  const now = Date.now();
  const entries: {
    cacheKey: string;
    updatedAt: number;
    expiresAt: number;
    stale: boolean;
    heroCount: number;
    trendingCount: number;
    hotCount: number;
    catalogCount: number;
  }[] = [];

  try {
    const res = await dbQuery<{
      cache_key: string;
      payload_json: Partial<HomeCatalogPayload> | string;
      updated_at: string | number;
      expires_at: string | number;
    }>(
      'SELECT cache_key, payload_json, updated_at, expires_at FROM home_cache ORDER BY updated_at DESC LIMIT 50'
    );
    if (res && res.rows.length > 0) {
      for (const row of res.rows) {
        const key = String(row.cache_key || '');
        const updatedAt = Number(row.updated_at) || 0;
        const expiresAt = Number(row.expires_at) || 0;
        let parsed: Partial<HomeCatalogPayload> = {};
        try {
          parsed =
            typeof row.payload_json === 'string'
              ? (JSON.parse(row.payload_json) as Partial<HomeCatalogPayload>)
              : (row.payload_json ?? {});
        } catch {
          // ignore
        }
        entries.push({
          cacheKey: key,
          updatedAt,
          expiresAt,
          stale: now > expiresAt,
          heroCount: parsed.heroSpotlights?.length ?? 0,
          trendingCount: parsed.trendingTop?.length ?? 0,
          hotCount: parsed.hotReleases?.length ?? 0,
          catalogCount: parsed.catalogGrid?.length ?? 0,
        });
      }
      return {
        storage: getStorageMode(),
        ttlMinutes: Math.round(HOME_CACHE_TTL_MS / 60000),
        entries,
      };
    }
  } catch {
    // Fallback to L1 memory map
  }

  for (const [key, val] of memoryHomeCache.entries()) {
    entries.push({
      cacheKey: key,
      updatedAt: val.updatedAt,
      expiresAt: val.expiresAt,
      stale: now > val.expiresAt,
      heroCount: val.payload.heroSpotlights.length,
      trendingCount: val.payload.trendingTop.length,
      hotCount: val.payload.hotReleases.length,
      catalogCount: val.payload.catalogGrid.length,
    });
  }

  return {
    storage: getStorageMode(),
    ttlMinutes: Math.round(HOME_CACHE_TTL_MS / 60000),
    entries,
  };
}

// --- Read-Only Catalog List Cache for /api/mola/* (L1 Memory + L2 PostgreSQL) ---
const CACHEABLE_MOLA_LIST_SUFFIXES = [
  '/ranking',
  '/trending',
  '/foryou',
  '/terbaru',
  '/vip',
  '/anime',
  '/dubbing',
  '/all',
  '/alldrama',
  '/category_dramas',
  '/baru',
  '/animasi',
  '/asia',
  '/original',
  '/latest',
  '/ongoing',
  '/donghua',
  '/film',
  '/kdrama',
  '/overdo',
  '/update',
  '/new_release',
  '/asian',
  '/rank',
  '/hot',
  '/popular',
  '/recommend',
  '/recomendasi',
  '/exclusive',
  '/browse',
  '/tren',
  '/new',
  '/newrelease',
  '/drama',
  '/all_drama',
];

export const API_DETAIL_CACHE_TTL_MS = 20 * 60 * 1000;

export function isCacheableMolaListPath(rawPath: string): boolean {
  const pathname = rawPath.split('?')[0].toLowerCase();
  return CACHEABLE_MOLA_LIST_SUFFIXES.some((suffix) =>
    pathname.endsWith(suffix)
  );
}

const CACHEABLE_MOLA_DETAIL_SUFFIXES = [
  '/detail',
  '/allepisode',
  '/episodes',
  '/chapter',
];

export function isCacheableMolaDetailOrEpisodePath(rawPath: string): boolean {
  const pathname = rawPath.split('?')[0].toLowerCase();
  if (/^\/(lk21|lookseries)(\/|$)/.test(pathname)) return false;
  return CACHEABLE_MOLA_DETAIL_SUFFIXES.some((suffix) =>
    pathname.endsWith(suffix)
  );
}

export async function getCachedMolaApiResponse(cacheKey: string): Promise<{
  statusCode: number;
  payloadJson: string;
  stale: boolean;
} | null> {
  const now = Date.now();
  const mem = memoryApiCache.get(cacheKey);
  if (mem) {
    return {
      statusCode: mem.statusCode,
      payloadJson: mem.payloadJson,
      stale: now > mem.expiresAt,
    };
  }

  try {
    const res = await dbQuery<{
      status_code: number;
      payload_json: string;
      updated_at: string | number;
      expires_at: string | number;
    }>(
      'SELECT status_code, payload_json, updated_at, expires_at FROM api_response_cache WHERE cache_key = $1',
      [cacheKey]
    );
    const row = res?.rows[0];
    if (row && typeof row.payload_json === 'string') {
      const statusCode = Number(row.status_code) || 200;
      const updatedAt = Number(row.updated_at) || now;
      const expiresAt = Number(row.expires_at) || 0;
      if (memoryApiCache.size > 400) {
        const firstKey = memoryApiCache.keys().next().value;
        if (firstKey) memoryApiCache.delete(firstKey);
      }
      memoryApiCache.set(cacheKey, {
        statusCode,
        payloadJson: row.payload_json,
        updatedAt,
        expiresAt,
      });
      return {
        statusCode,
        payloadJson: row.payload_json,
        stale: now > expiresAt,
      };
    }
  } catch {
    // Fallback gracefully
  }
  return null;
}

const MOLA_SEGMENT_TO_PROVIDER: Record<string, string> = {
  dramabox: 'DramaBoxV2',
  dramaboxv2: 'DramaBoxV2',
  netshort: 'NetShort',
  anyreel: 'AnyReel',
  melolo: 'MeloLoV2',
  melolov2: 'MeloLoV2',
  dramaora: 'DramaOra',
  meloshort: 'MeloShort',
  petadrama: 'PetaDrama',
  radreels: 'RadReels',
  dramaverse: 'DramaVerse',
  kalostv: 'KalosTV',
  stardust: 'StardustTV',
  starshort: 'StarShort',
  dramabite: 'DramaBite',
  loveshots: 'LoveShots',
  mydrama: 'MyDrama',
  shotshort: 'ShotShort',
  moboreels: 'MoboReels',
  blinkdrama: 'BlinkDrama',
  wetv: 'WeTV',
  cubetv: 'CubeTV',
  microdrama: 'MicroDrama',
  flareflow: 'FlareFlow',
  fundrama: 'FunDrama',
  freeshort: 'FreeShort',
  toonshort: 'ToonShort',
  happyshort: 'HappyShort',
  dramadash: 'DramaDash',
  storyreel: 'StoryReelV2',
  storyreel_v2: 'StoryReelV2',
  vibeshort: 'VibeShortV2',
  vibeshort_v2: 'VibeShortV2',
  flickreels: 'FlickReels',
  dramawave: 'DramaWave',
  freereels: 'FreeReels',
  pinedrama: 'PineDrama',
  shortmax: 'ShortMaxV2',
  shortmax_v2: 'ShortMaxV2',
  flextv: 'FlexTV',
  vigloo: 'Vigloo',
  dotdrama: 'DotDrama',
  idrama: 'iDramaV2',
  idramav2: 'iDramaV2',
  idrama_v2: 'iDramaV2',
  goodshort: 'GoodShort',
  reelshort: 'ReelShortV2',
  reelshortv2: 'ReelShortV2',
  reelshort_v2: 'ReelShortV2',
  joyreels: 'JoyReels',
  sodareels: 'SodaReels',
  bonustv: 'BonusTV',
  iqiyi: 'iQIYI',
  audiotoon: 'AudioToon',
  playlet: 'Playlet',
  momeshort: 'MomeShort',
  storeel: 'StoReel',
  mymuse: 'MyMuse',
  huangdou: 'HuangDou',
  moreshort: 'MoreShort',
  dramarush: 'DramaRush',
  shortswave: 'Shortswave',
  relala: 'Relala',
  sixthshort: 'SixthShort',
  snackshort: 'SnackShort',
  soreel: 'Soreel',
  stareel: 'StarReel',
  storygo: 'StoryGo',
  minishort: 'MiniShort',
  shorten: 'Shorten',
  velolo: 'Velolo',
  reelpine: 'ReelPine',
  dynastyshorts: 'DynastyShorts',
  dramashorts: 'DramaShorts',
  tallflix: 'TallFlix',
  qlax: 'Qlax',
  shortical: 'Shortical',
  luzicine: 'LuziCine',
  zebrashort: 'ZebraShort',
  drakorid: 'DrakorID',
  drachinreborn: 'DrachinReborn',
  dramaqueen: 'DramaQueen',
  ansflix: 'Ansflix',
  lupacine: 'LupaCine',
  reellife: 'ReelLife',
  bstation: 'Bstation',
  anichin: 'Anichin',
  donghuaqueen: 'DonghuaQueen',
  samehadaku: 'Samehadaku',
  animex: 'AnimeX',
  winknovel: 'WinkNovel',
};

export function resolveProviderFromMolaSegment(segment: string): string {
  return MOLA_SEGMENT_TO_PROVIDER[segment.toLowerCase()] || '';
}

export function indexMolaPayloadToCatalog(
  rawPathOrCacheKey: string,
  payloadJson: string
): void {
  try {
    const cleanPath = rawPathOrCacheKey.startsWith('mola:')
      ? rawPathOrCacheKey.slice(5)
      : rawPathOrCacheKey;
    const segMatch = cleanPath.match(/^\/([^/?]+)/i);
    const seg = (segMatch?.[1] || '').toLowerCase();
    if (!seg || seg === 'lk21') return;
    const provider = resolveProviderFromMolaSegment(seg);
    if (!provider) return;
    const parsed = JSON.parse(payloadJson) as unknown;
    let books = extractBookArray(parsed);
    if (
      books.length === 0 &&
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      const obj = parsed as Record<string, unknown>;
      const candidate =
        obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
          ? (obj.data as Record<string, unknown>)
          : obj;
      books = [candidate];
    }
    if (books.length > 0) {
      const normalized: CachedDramaItem[] = [];
      books.forEach((raw, idx) => {
        const item = normalizeDrama(raw, provider, idx);
        if (item) normalized.push(item);
      });
      if (normalized.length > 0) {
        rememberIndexedDramas(normalized);
        void syncDramasToCatalogDb(normalized).catch(() => {});
      }
    }
  } catch {
    // Ignore unparseable response
  }
}

export function setCachedMolaApiResponse(
  cacheKey: string,
  statusCode: number,
  payloadJson: string,
  ttlMs = API_FEED_CACHE_TTL_MS
): void {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  if (memoryApiCache.size > 400) {
    const firstKey = memoryApiCache.keys().next().value;
    if (firstKey) memoryApiCache.delete(firstKey);
  }
  memoryApiCache.set(cacheKey, { statusCode, payloadJson, updatedAt: now, expiresAt });

  void dbQuery(
    `INSERT INTO api_response_cache (cache_key, status_code, payload_json, updated_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cache_key) DO UPDATE SET
       status_code = EXCLUDED.status_code,
       payload_json = EXCLUDED.payload_json,
       updated_at = EXCLUDED.updated_at,
       expires_at = EXCLUDED.expires_at`,
    [cacheKey, statusCode, payloadJson, now, expiresAt]
  ).catch(() => {});

  // Also index extracted books asynchronously into drama_catalog for instant Explore filters & slug SEO resolution
  if (statusCode >= 200 && statusCode < 300) {
    indexMolaPayloadToCatalog(cacheKey, payloadJson);
  }
}

export function markApiRevalidating(
  cacheKey: string,
  fn: () => Promise<void>
): void {
  if (inFlightApiRevalidations.has(cacheKey)) return;
  inFlightApiRevalidations.add(cacheKey);
  void fn().finally(() => {
    inFlightApiRevalidations.delete(cacheKey);
  });
}

async function pruneExpiredApiCache(): Promise<void> {
  const now = Date.now();
  const cutoff = now - 2 * 60 * 60 * 1000;
  for (const [k, v] of memoryApiCache.entries()) {
    if (now > v.expiresAt + 2 * 60 * 60 * 1000) {
      memoryApiCache.delete(k);
    }
  }
  try {
    await dbQuery('DELETE FROM api_response_cache WHERE expires_at < $1', [cutoff]);
  } catch {
    // Ignore
  }
}

export function startHomeCacheWorker(getToken: () => string): () => void {
  loadHomeDiskCacheOnce();
  const runWarmupCycle = async () => {
    await ensureDatabaseReady();
    const token = getToken();
    if (!token) return;
    const defaultKeys: Array<[HomeLangCode, string]> = [
      ['en', 'All'],
      ['id', 'All'],
    ];
    for (const [lang, prov] of defaultKeys) {
      try {
        const cacheKey = makeHomeCacheKey(lang, prov);
        const existing = await readHomeFromDb(cacheKey);
        if (!existing || !hasAnyItems(existing.payload) || Date.now() > existing.expiresAt) {
          await refreshAndPersistHome(token, lang, prov);
        }
      } catch {
        // Non-blocking background worker
      }
    }
    await pruneExpiredApiCache();
  };

  const warmupTimer = setTimeout(() => {
    void runWarmupCycle();
  }, 300);

  const intervalTimer = setInterval(() => {
    void runWarmupCycle();
  }, HOME_CACHE_TTL_MS);

  return () => {
    clearTimeout(warmupTimer);
    clearInterval(intervalTimer);
  };
}

export interface SitemapDramaEntry {
  bookId: string;
  slug: string;
  title: string;
  provider: string;
  cover?: string;
  description?: string;
  chapterCount?: number;
  updatedAt: number;
}

export async function seedCatalogFromExistingCacheIfEmpty(): Promise<number> {
  const collected: CachedDramaItem[] = [];
  const pushList = (list?: CachedDramaItem[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (item && item.bookId && item.title) {
        collected.push(item);
      }
    }
  };

  for (const val of memoryHomeCache.values()) {
    pushList(val.payload.heroSpotlights);
    pushList(val.payload.trendingTop);
    pushList(val.payload.hotReleases);
    pushList(val.payload.catalogGrid);
  }

  try {
    const homeRes = await dbQuery<{ payload_json: Partial<HomeCatalogPayload> | string }>(
      'SELECT payload_json FROM home_cache ORDER BY updated_at DESC LIMIT 20'
    );
    if (homeRes) {
      for (const row of homeRes.rows) {
        const parsed =
          typeof row.payload_json === 'string'
            ? (JSON.parse(row.payload_json) as Partial<HomeCatalogPayload>)
            : (row.payload_json ?? {});
        pushList(parsed.heroSpotlights);
        pushList(parsed.trendingTop);
        pushList(parsed.hotReleases);
        pushList(parsed.catalogGrid);
      }
    }
  } catch {
    // Ignore
  }

  if (collected.length > 0) {
    await syncDramasToCatalogDb(collected);
  }
  return collected.length;
}

export async function findDramaBySlugInHomeCache(
  slug: string,
  providerHint?: string
): Promise<CachedDramaItem | null> {
  const rawTarget = decodeURIComponent(slug || '').trim().toLowerCase();
  const targetCandidates = extractLegacySlugLookupCandidates(
    rawTarget,
    providerHint
  );
  const target = targetCandidates[targetCandidates.length - 1] || slugifyTitle(slug);
  if (!target) return null;
  const candidateSet = new Set(targetCandidates);
  const normHint = providerHint ? normalizeMediaProviderName(providerHint) : '';

  const matchesSlug = (item: CachedDramaItem): { matched: boolean; canonicalSlug: string } => {
    const canonicalSlug = resolveCanonicalDramaSlug({
      title: item.title,
      slug: item.slug,
      bookId: item.bookId,
      provider: item.provider,
    });
    if (candidateSet.has(canonicalSlug)) {
      return { matched: true, canonicalSlug };
    }
    if (rawTarget.startsWith(`${canonicalSlug}-`)) {
      const tail = rawTarget.slice(canonicalSlug.length + 1);
      if (isLikelyIdSuffixTail(tail, item.provider, item.bookId)) {
        return { matched: true, canonicalSlug };
      }
    }
    if (canonicalSlug.startsWith(`${rawTarget}-`)) {
      const tail = canonicalSlug.slice(rawTarget.length + 1);
      if (isLikelyIdSuffixTail(tail, item.provider, item.bookId)) {
        return { matched: true, canonicalSlug };
      }
    }
    return { matched: false, canonicalSlug };
  };

  let fallbackMatch: CachedDramaItem | null = null;
  for (const cand of targetCandidates) {
    const recentHit = recentIndexedBySlug.get(cand);
    if (recentHit) {
      const canonicalSlug = resolveCanonicalDramaSlug({
        title: recentHit.title,
        slug: recentHit.slug,
        bookId: recentHit.bookId,
        provider: recentHit.provider,
      });
      const normalized = { ...recentHit, slug: canonicalSlug };
      if (!normHint || normalizeMediaProviderName(recentHit.provider) === normHint) {
        return normalized;
      }
      if (!fallbackMatch) fallbackMatch = normalized;
    }
  }
  for (const recentItem of recentIndexedBySlug.values()) {
    const check = matchesSlug(recentItem);
    if (!check.matched) continue;
    const normalized = { ...recentItem, slug: check.canonicalSlug };
    if (!normHint || normalizeMediaProviderName(recentItem.provider) === normHint) {
      return normalized;
    }
    if (!fallbackMatch) fallbackMatch = normalized;
  }

  const inspectList = (list?: CachedDramaItem[]): CachedDramaItem | null => {
    if (!Array.isArray(list)) return null;
    for (const item of list) {
      if (!item?.title) continue;
      const check = matchesSlug(item);
      if (check.matched) {
        const normalized: CachedDramaItem = {
          ...item,
          slug: check.canonicalSlug,
        };
        if (!normHint || normalizeMediaProviderName(item.provider) === normHint) {
          return normalized;
        }
        if (!fallbackMatch) fallbackMatch = normalized;
      }
    }
    return null;
  };

  for (const val of memoryHomeCache.values()) {
    const found =
      inspectList(val.payload.heroSpotlights) ||
      inspectList(val.payload.trendingTop) ||
      inspectList(val.payload.hotReleases) ||
      inspectList(val.payload.catalogGrid);
    if (found) return found;
  }

  try {
    const homeRes = await dbQuery<{ payload_json: Partial<HomeCatalogPayload> | string }>(
      'SELECT payload_json FROM home_cache ORDER BY updated_at DESC LIMIT 15'
    );
    if (homeRes) {
      for (const row of homeRes.rows) {
        const parsed =
          typeof row.payload_json === 'string'
            ? (JSON.parse(row.payload_json) as Partial<HomeCatalogPayload>)
            : (row.payload_json ?? {});
        const found =
          inspectList(parsed.heroSpotlights) ||
          inspectList(parsed.trendingTop) ||
          inspectList(parsed.hotReleases) ||
          inspectList(parsed.catalogGrid);
        if (found) return found;
      }
    }
  } catch {
    // Ignore
  }

  return fallbackMatch;
}

/**
 * Resolve a clean drama slug from cached provider API responses.
 * This is a fallback for dramas indexed in api_response_cache but not yet
 * present in drama_catalog or the homepage cache.
 */
export async function findDramaBySlugInApiCache(
  slug: string,
  providerHint?: string
): Promise<CachedDramaItem | null> {
  const rawTarget = decodeURIComponent(slug || '').trim().toLowerCase();
  const targetCandidates = extractLegacySlugLookupCandidates(
    rawTarget,
    providerHint
  );
  const candidateSet = new Set(targetCandidates);
  const target = targetCandidates[targetCandidates.length - 1] || slugifyTitle(slug);
  if (!target) return null;
  const normHint = providerHint ? normalizeMediaProviderName(providerHint) : '';
  let fallbackMatch: CachedDramaItem | null = null;

  const inspectPayload = (
    cacheKey: string,
    payloadJson: string
  ): CachedDramaItem | null => {
    const segment = cacheKey.match(/^mola:\/([^/?]+)/i)?.[1]?.toLowerCase();
    if (!segment || segment === 'lk21') return null;

    const provider = resolveProviderFromMolaSegment(segment);
    if (!provider) return null;
    try {
      const books = extractBookArray(JSON.parse(payloadJson));
      for (let index = 0; index < books.length; index += 1) {
        const item = normalizeDrama(books[index], provider, index);
        if (!item) continue;
        const itemSlug = resolveCanonicalDramaSlug({
          title: item.title,
          slug: item.slug,
          bookId: item.bookId,
          provider: item.provider,
        });
        const isDirectMatch =
          candidateSet.has(itemSlug) ||
          candidateSet.has(slugifyTitle(item.title));
        const isTailMatch =
          (rawTarget.startsWith(`${itemSlug}-`) &&
            isLikelyIdSuffixTail(
              rawTarget.slice(itemSlug.length + 1),
              item.provider,
              item.bookId
            )) ||
          (itemSlug.startsWith(`${rawTarget}-`) &&
            isLikelyIdSuffixTail(
              itemSlug.slice(rawTarget.length + 1),
              item.provider,
              item.bookId
            ));

        if (isDirectMatch || isTailMatch) {
          const normalized = { ...item, slug: itemSlug };
          if (!normHint || normalizeMediaProviderName(provider) === normHint) {
            return normalized;
          }
          if (!fallbackMatch) fallbackMatch = normalized;
        }
      }
    } catch {
      // Ignore malformed cached provider responses.
    }
    return null;
  };

  // Check the in-memory cache first.
  for (const [cacheKey, cached] of memoryApiCache.entries()) {
    if (cached.statusCode < 200 || cached.statusCode >= 300) continue;
    const found = inspectPayload(cacheKey, cached.payloadJson);
    if (found) return found;
  }

  // Then check PostgreSQL so this also works after a server restart.
  const result = await dbQuery<{
    cache_key: string;
    payload_json: string;
  }>(
    `SELECT cache_key, payload_json
     FROM api_response_cache
     WHERE status_code >= 200 AND status_code < 300
     ORDER BY updated_at DESC
     LIMIT 120`
  );

  for (const row of result?.rows ?? []) {
    const found = inspectPayload(String(row.cache_key || ''), String(row.payload_json || ''));
    if (found) return found;
  }

  return fallbackMatch;
}

export async function searchUpstreamDramaBySlug(
  token: string,
  slug: string,
  providerHint?: string
): Promise<CachedDramaItem | null> {
  const rawTarget = decodeURIComponent(slug || '').trim().toLowerCase();
  const targetCandidates = extractLegacySlugLookupCandidates(
    rawTarget,
    providerHint
  );
  const candidateSet = new Set(targetCandidates);
  const cleanSearchTarget =
    (targetCandidates.length > 1
      ? targetCandidates[1]
      : targetCandidates[0]) || slugifyTitle(slug);
  const target = cleanSearchTarget;
  if (!token || !target) return null;

  const normHint = providerHint ? normalizeMediaProviderName(providerHint) : '';
  for (const cand of targetCandidates) {
    const recentHit = recentIndexedBySlug.get(cand);
    if (
      recentHit &&
      (!normHint || normalizeMediaProviderName(recentHit.provider) === normHint)
    ) {
      return {
        ...recentHit,
        slug: resolveCanonicalDramaSlug({
          title: recentHit.title,
          slug: recentHit.slug,
          bookId: recentHit.bookId,
          provider: recentHit.provider,
        }),
      };
    }
  }

  const keyword = target
    .split('-')
    .filter((w) => w.length > 0)
    .slice(0, 6)
    .join(' ');
  if (!keyword || keyword.length < 2) return null;

  const candidateProviders = providerHint
    ? [normalizeMediaProviderName(providerHint)]
    : [
        'DramaBoxV2',
        'NetShort',
        'AnyReel',
        'MeloLoV2',
        'DramaOra',
        'FreeReels',
        'FlickReels',
        'GoodShort',
        'DramaWave',
        'ReelShortV2',
        'ShortMaxV2',
      ];

  const searchSpecs: Array<{
    provider: string;
    segment: string;
    buildUrls: (kw: string) => string[];
  }> = candidateProviders.map((prov) => {
    const segment = resolveProviderApiSegment(prov);
    const langVal = mapLangForProvider(prov, 'en');
    const langQs = langVal ? `&lang=${encodeURIComponent(langVal)}` : '';
    if (prov === 'PetaDrama') {
      return {
        provider: prov,
        segment,
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/${segment}/search?q=${encodeURIComponent(kw)}${langQs}&token=${token}`,
        ],
      };
    }
    if (prov === 'StarShort' || prov === 'ShotShort' || prov === 'DramaDash') {
      return {
        provider: prov,
        segment,
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/${segment}/search?query=${encodeURIComponent(kw)}${langQs}&token=${token}`,
          `${MOLATV_API_BASE}/${segment}/search?keyword=${encodeURIComponent(kw)}${langQs}&token=${token}`,
        ],
      };
    }
    if (prov === 'MeloLoV2') {
      return {
        provider: prov,
        segment: 'melolo',
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/melolo/search?keyword=${encodeURIComponent(kw)}${langQs}&token=${token}`,
        ],
      };
    }
    if (prov === 'ReelShortV2') {
      return {
        provider: prov,
        segment: 'reelshortv2',
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/reelshortv2/search?word=${encodeURIComponent(kw)}&page=1${langQs}&token=${token}`,
          `${MOLATV_API_BASE}/reelshortv2/search?keyword=${encodeURIComponent(kw)}&page=1${langQs}&token=${token}`,
        ],
      };
    }
    if (prov === 'iDramaV2') {
      return {
        provider: prov,
        segment: 'idramav2',
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/idramav2/search?keyword=${encodeURIComponent(kw)}&page=1&page_size=20${langQs}&token=${token}`,
        ],
      };
    }
    if (prov === 'Ansflix') {
      return {
        provider: prov,
        segment: 'ansflix',
        buildUrls: (kw) => [
          `${MOLATV_API_BASE}/ansflix/search?keyword=${encodeURIComponent(kw)}&page=1${langQs}&token=${token}`,
        ],
      };
    }
    return {
      provider: prov,
      segment,
      buildUrls: (kw) => [
        `${MOLATV_API_BASE}/${segment}/search?keyword=${encodeURIComponent(kw)}${langQs}&token=${token}`,
        `${MOLATV_API_BASE}/${segment}/search?q=${encodeURIComponent(kw)}${langQs}&token=${token}`,
      ],
    };
  });

  const settled = await Promise.allSettled(
    searchSpecs.map(async (spec) => {
      for (const searchUrl of spec.buildUrls(keyword)) {
        try {
          const res = await fetch(searchUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(2200),
          });
          if (!res.ok) continue;
          const json = (await res.json()) as unknown;
          const books = extractBookArray(json);
          if (books.length === 0) continue;
          const out: CachedDramaItem[] = [];
          books.forEach((raw, idx) => {
            const norm = normalizeDrama(raw, spec.provider, idx);
            if (norm) out.push(norm);
          });
          if (out.length > 0) return out;
        } catch {
          // Try alternate search parameter cleanly
        }
      }
      return [] as CachedDramaItem[];
    })
  );

  const allNormalized: CachedDramaItem[] = [];
  for (const entry of settled) {
    if (entry.status === 'fulfilled' && entry.value.length > 0) {
      allNormalized.push(...entry.value);
    }
  }

  if (allNormalized.length === 0) return null;

  rememberIndexedDramas(allNormalized);
  void syncDramasToCatalogDb(allNormalized).catch(() => {});

  const exact = allNormalized.find((item) => {
    const itemSlug = resolveCanonicalDramaSlug({
      title: item.title,
      slug: item.slug,
      bookId: item.bookId,
      provider: item.provider,
    });
    return (
      candidateSet.has(itemSlug) ||
      candidateSet.has(slugifyTitle(item.title))
    );
  });
  if (exact) return exact;

  // Allow strict ID-suffix or clean prefix matching when slugs are substantial
  const prefix =
    target.length >= 6
      ? allNormalized.find((item) => {
          const itemSlug = resolveCanonicalDramaSlug({
            title: item.title,
            slug: item.slug,
            bookId: item.bookId,
            provider: item.provider,
          });
          if (itemSlug.length < 6) return false;
          if (rawTarget.startsWith(`${itemSlug}-`)) {
            return isLikelyIdSuffixTail(
              rawTarget.slice(itemSlug.length + 1),
              item.provider,
              item.bookId
            );
          }
          if (itemSlug.startsWith(`${target}-`)) {
            return isLikelyIdSuffixTail(
              itemSlug.slice(target.length + 1),
              item.provider,
              item.bookId
            );
          }
          return (
            target.length >= 12 &&
            itemSlug.length >= 12 &&
            (itemSlug.startsWith(`${target}-`) || target.startsWith(`${itemSlug}-`))
          );
        })
      : undefined;
  return prefix ?? null;
}

const INVALID_SITEMAP_DRAMA_SLUGS = new Set([
  'watch-drama',
  'series',
  'drama',
  'short-drama',
  'unknown',
  'null',
  'undefined',
]);

export async function getCachedDramasForSitemap(limit = 2000): Promise<{
  dramas: SitemapDramaEntry[];
  tags: string[];
  providers: string[];
}> {
  const seenDramas = new Map<string, SitemapDramaEntry>();
  const tagSet = new Set<string>();
  const providerSet = new Set<string>();

  const pushItem = (
    item: Partial<CachedDramaItem> | undefined,
    updatedAt: number
  ) => {
    if (!item || !item.bookId || !item.title) return;
    const cleanId = cleanText(String(item.bookId));
    const cleanTitle = cleanText(String(item.title));
    if (!cleanId || cleanTitle.length < 2) return;
    const rawProvider = cleanText(item.provider, 'DramaBoxV2');
    if (
      rawProvider.toUpperCase() === 'LK21' ||
      rawProvider.toUpperCase() === 'LOOKSERIES'
    ) {
      return;
    }
    const provider = normalizeMediaProviderName(rawProvider);
    const cleanSlug = resolveCanonicalDramaSlug({
      title: cleanTitle,
      slug: cleanText(item.slug),
      bookId: cleanId,
      provider,
    });
    if (!cleanSlug || INVALID_SITEMAP_DRAMA_SLUGS.has(cleanSlug)) return;
    const chapterCount = Number(item.chapterCount) || 0;
    const cover = cleanText(item.cover);
    const description = cleanText(item.description);
    if (chapterCount < 1 || (!cover && !description)) return;

    providerSet.add(provider);
    if (Array.isArray(item.tags)) {
      for (const tg of item.tags) {
        const cleanTag = cleanText(tg);
        if (cleanTag && cleanTag.length <= 32) {
          tagSet.add(cleanTag);
        }
      }
    }
    const key = `${provider}:${cleanId}`;
    if (!seenDramas.has(key) && seenDramas.size < limit) {
      seenDramas.set(key, {
        bookId: cleanId,
        slug: cleanSlug,
        title: cleanTitle,
        provider,
        cover: cover || undefined,
        description: description || undefined,
        chapterCount,
        updatedAt,
      });
    }
  };

  try {
    // 1. Primary source: indexed drama_catalog (has collision-free canonical slugs)
    const catalogRows = await listCatalogForSitemapFromDb(limit);
    for (const row of catalogRows) {
      const normalizedProvider = normalizeMediaProviderName(row.provider);
      const cleanSlug = resolveCanonicalDramaSlug({
        title: row.title,
        slug: row.slug,
        bookId: row.dramaId,
        provider: normalizedProvider,
      });
      if (
        !row.dramaId ||
        !row.title ||
        row.title.trim().length < 2 ||
        !cleanSlug ||
        INVALID_SITEMAP_DRAMA_SLUGS.has(cleanSlug) ||
        (row.chapterCount || 0) < 1 ||
        (!row.cover && !row.description)
      ) {
        continue;
      }
      providerSet.add(normalizedProvider);
      for (const tg of row.genres) {
        if (tg && tg.length <= 32) tagSet.add(tg);
      }
      const key = `${normalizedProvider}:${row.dramaId}`;
      if (!seenDramas.has(key) && seenDramas.size < limit) {
        seenDramas.set(key, {
          bookId: row.dramaId,
          slug: cleanSlug,
          title: row.title,
          provider: normalizedProvider,
          cover: row.cover || undefined,
          description: row.description || undefined,
          chapterCount: row.chapterCount || 1,
          updatedAt: row.updatedAt,
        });
      }
    }

    const homeRes = await dbQuery<{
      payload_json: Partial<HomeCatalogPayload> | string;
      updated_at: string | number;
    }>('SELECT payload_json, updated_at FROM home_cache ORDER BY updated_at DESC LIMIT 20');

    if (homeRes) {
      for (const row of homeRes.rows) {
        const updatedAt = Number(row.updated_at) || Date.now();
        try {
          const parsed =
            typeof row.payload_json === 'string'
              ? (JSON.parse(row.payload_json) as Partial<HomeCatalogPayload>)
              : (row.payload_json ?? {});
          const allLists = [
            ...(parsed.heroSpotlights ?? []),
            ...(parsed.trendingTop ?? []),
            ...(parsed.hotReleases ?? []),
            ...(parsed.catalogGrid ?? []),
          ];
          for (const item of allLists) {
            pushItem(item, updatedAt);
          }
        } catch {
          // Ignore malformed JSON row
        }
      }
    }

    const apiRes = await dbQuery<{
      cache_key: string;
      payload_json: string;
      updated_at: string | number;
    }>('SELECT cache_key, payload_json, updated_at FROM api_response_cache ORDER BY updated_at DESC LIMIT 120');

    if (apiRes) {
      for (const row of apiRes.rows) {
        if (seenDramas.size >= limit) break;
        const cacheKey = String(row.cache_key || '');
        const updatedAt = Number(row.updated_at) || Date.now();
        const segMatch = cacheKey.match(/^mola:\/([^/?]+)/i);
        const segment = segMatch?.[1]?.toLowerCase() || '';
        if (!segment || segment === 'lk21' || segment === 'lookseries') continue;
        const providerGuess =
          (segment ? resolveProviderFromMolaSegment(segment) : null) || 'DramaBoxV2';
        try {
          const parsed = JSON.parse(String(row.payload_json));
          const books = extractBookArray(parsed);
          for (const raw of books) {
            const norm = normalizeDrama(raw, providerGuess);
            if (norm) pushItem(norm, updatedAt);
            if (seenDramas.size >= limit) break;
          }
        } catch {
          // Ignore malformed JSON row
        }
      }
    }
  } catch {
    // Fallback to L1 memory cache below
  }

  for (const val of memoryHomeCache.values()) {
    const allLists = [
      ...(val.payload.heroSpotlights ?? []),
      ...(val.payload.trendingTop ?? []),
      ...(val.payload.hotReleases ?? []),
      ...(val.payload.catalogGrid ?? []),
    ];
    for (const item of allLists) {
      pushItem(item, val.updatedAt);
    }
  }

  const nowTs = Date.now();
  for (const item of recentIndexedBySlug.values()) {
    if (seenDramas.size >= limit) break;
    const itemUpdated =
      typeof item.updatedAt === 'number'
        ? item.updatedAt
        : typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
        ? Date.parse(item.updatedAt)
        : nowTs;
    pushItem(item, itemUpdated);
  }

  for (const [cacheKey, cached] of memoryApiCache.entries()) {
    if (seenDramas.size >= limit) break;
    if (cached.statusCode < 200 || cached.statusCode >= 300) continue;
    const segment = cacheKey.match(/^mola:\/([^/?]+)/i)?.[1]?.toLowerCase();
    if (!segment || segment === 'lk21' || segment === 'lookseries') continue;
    const providerGuess = resolveProviderFromMolaSegment(segment) || 'DramaBoxV2';
    try {
      const books = extractBookArray(JSON.parse(cached.payloadJson));
      for (const raw of books) {
        const norm = normalizeDrama(raw, providerGuess);
        if (norm) pushItem(norm, cached.updatedAt || nowTs);
        if (seenDramas.size >= limit) break;
      }
    } catch {
      // Ignore malformed cached payload
    }
  }

  return {
    dramas: Array.from(seenDramas.values()),
    tags: Array.from(tagSet).slice(0, 40),
    providers: Array.from(providerSet),
  };
}
