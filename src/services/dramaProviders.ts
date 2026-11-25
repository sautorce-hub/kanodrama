import type {
  BadgeStyle,
  DramaItem,
  DramaProviderAdapter,
  EpisodeItem,
  LanguageCode,
  PaginatedResult,
  ProviderId,
  ProviderName,
  StreamSource,
  StreamQualityOption,
  StreamServerOption,
  SubtitleTrackItem,
} from '../types/drama';

const MOLATV_BASE = '/api/mola';
const DRAMABOX_V2_BASE = `${MOLATV_BASE}/dramaboxv2`;
const NETSHORT_BASE = `${MOLATV_BASE}/netshort`;
const ANYREEL_BASE = `${MOLATV_BASE}/anyreel`;
const MELOLO_V2_BASE = `${MOLATV_BASE}/melolov2`;
const DRAMAORA_BASE = `${MOLATV_BASE}/dramaora`;
const MELOSHORT_BASE = `${MOLATV_BASE}/meloshort`;
const PETADRAMA_BASE = `${MOLATV_BASE}/petadrama`;
const RADREELS_BASE = `${MOLATV_BASE}/radreels`;
const DRAMAVERSE_BASE = `${MOLATV_BASE}/dramaverse`;
const KALOSTV_BASE = `${MOLATV_BASE}/kalostv`;
const STARDUST_BASE = `${MOLATV_BASE}/stardust`;
const STARSHORT_BASE = `${MOLATV_BASE}/starshort`;
const DRAMABITE_BASE = `${MOLATV_BASE}/dramabite`;
const LOVESHOTS_BASE = `${MOLATV_BASE}/loveshots`;
const MYDRAMA_BASE = `${MOLATV_BASE}/mydrama`;
const SHOTSHORT_BASE = `${MOLATV_BASE}/shotshort`;
const MOBOREELS_BASE = `${MOLATV_BASE}/moboreels`;
const BLINKDRAMA_BASE = `${MOLATV_BASE}/blinkdrama`;
const WETV_BASE = `${MOLATV_BASE}/wetv`;
const CUBETV_BASE = `${MOLATV_BASE}/cubetv`;
const MICRODRAMA_BASE = `${MOLATV_BASE}/microdrama`;
const FLAREFLOW_BASE = `${MOLATV_BASE}/flareflow`;
const FUNDRAMA_BASE = `${MOLATV_BASE}/fundrama`;
const FREESHORT_BASE = `${MOLATV_BASE}/freeshort`;
const TOONSHORT_BASE = `${MOLATV_BASE}/toonshort`;
const HAPPYSHORT_BASE = `${MOLATV_BASE}/happyshort`;
const DRAMADASH_BASE = `${MOLATV_BASE}/dramadash`;
const STORYREEL_V2_BASE = `${MOLATV_BASE}/storyreel_v2`;
const VIBESHORT_V2_BASE = `${MOLATV_BASE}/vibeshort_v2`;
const FLICKREELS_BASE = `${MOLATV_BASE}/flickreels`;
const DRAMAWAVE_BASE = `${MOLATV_BASE}/dramawave`;
const FREEREELS_BASE = `${MOLATV_BASE}/freereels`;
const PINEDRAMA_BASE = `${MOLATV_BASE}/pinedrama`;
const SHORTMAX_V2_BASE = `${MOLATV_BASE}/shortmax_v2`;
const FLEXTV_BASE = `${MOLATV_BASE}/flextv`;
const VIGLOO_BASE = `${MOLATV_BASE}/vigloo`;
const DOTDRAMA_BASE = `${MOLATV_BASE}/dotdrama`;
const IDRAMA_V2_BASE = `${MOLATV_BASE}/idrama_v2`;
const GOODSHORT_BASE = `${MOLATV_BASE}/goodshort`;
const REELSHORT_V2_BASE = `${MOLATV_BASE}/reelshort_v2`;
const JOYREELS_BASE = `${MOLATV_BASE}/joyreels`;
const SODAREELS_BASE = `${MOLATV_BASE}/sodareels`;
const BONUSTV_BASE = `${MOLATV_BASE}/bonustv`;
const IQIYI_BASE = `${MOLATV_BASE}/iqiyi`;
const AUDIOTOON_BASE = `${MOLATV_BASE}/audiotoon`;
const PLAYLET_BASE = `${MOLATV_BASE}/playlet`;
const MOMESHORT_BASE = `${MOLATV_BASE}/momeshort`;
const STOREEL_BASE = `${MOLATV_BASE}/storeel`;
const MYMUSE_BASE = `${MOLATV_BASE}/mymuse`;
const HUANGDOU_BASE = `${MOLATV_BASE}/huangdou`;
const MORESHORT_BASE = `${MOLATV_BASE}/moreshort`;
const DRAMARUSH_BASE = `${MOLATV_BASE}/dramarush`;
const SHORTSWAVE_BASE = `${MOLATV_BASE}/shortswave`;
const RELALA_BASE = `${MOLATV_BASE}/relala`;
const SIXTHSHORT_BASE = `${MOLATV_BASE}/sixthshort`;
const SNACKSHORT_BASE = `${MOLATV_BASE}/snackshort`;
const SOREEL_BASE = `${MOLATV_BASE}/soreel`;
const STARREEL_BASE = `${MOLATV_BASE}/stareel`;
const STORYGO_BASE = `${MOLATV_BASE}/storygo`;
const MINISHORT_BASE = `${MOLATV_BASE}/minishort`;
const SHORTEN_BASE = `${MOLATV_BASE}/shorten`;
const VELOLO_BASE = `${MOLATV_BASE}/velolo`;
const REELPINE_BASE = `${MOLATV_BASE}/reelpine`;
const DYNASTYSHORTS_BASE = `${MOLATV_BASE}/dynastyshorts`;
const DRAMASHORTS_BASE = `${MOLATV_BASE}/dramashorts`;
const TALLFLIX_BASE = `${MOLATV_BASE}/tallflix`;
const QLAX_BASE = `${MOLATV_BASE}/qlax`;
const SHORTICAL_BASE = `${MOLATV_BASE}/shortical`;
const LUZICINE_BASE = `${MOLATV_BASE}/luzicine`;
const ZEBRASHORT_BASE = `${MOLATV_BASE}/zebrashort`;
const DRAKORID_BASE = `${MOLATV_BASE}/drakorid`;
const DRACHINREBORN_BASE = `${MOLATV_BASE}/drachinreborn`;
const DRAMAQUEEN_BASE = `${MOLATV_BASE}/dramaqueen`;
const ANSFLIX_BASE = `${MOLATV_BASE}/ansflix`;
const LUPACINE_BASE = `${MOLATV_BASE}/lupacine`;
const REELLIFE_BASE = `${MOLATV_BASE}/reellife`;
const BSTATION_BASE = `${MOLATV_BASE}/bstation`;
const ANICHIN_BASE = `${MOLATV_BASE}/anichin`;
const DONGHUAQUEEN_BASE = `${MOLATV_BASE}/donghuaqueen`;
const SAMEHADAKU_BASE = `${MOLATV_BASE}/samehadaku`;
const ANIMEX_BASE = `${MOLATV_BASE}/animex`;
const WINKNOVEL_BASE = `${MOLATV_BASE}/winknovel`;

const MEDIA_PROXY_PREFIX = '/api/proxy?url=';

let currentAppLang: LanguageCode = 'en';

export function getActiveAppLanguage(): LanguageCode {
  return currentAppLang;
}

export function setActiveAppLanguage(lang: LanguageCode): void {
  currentAppLang = lang;
}

// --- Client-Side Rate-Limit Pacer (Keeps bursts safely under 17 req/sec) ---
const MIN_REQUEST_GAP_MS = 85;
let lastDispatchTs = 0;
let pacingTail: Promise<void> = Promise.resolve();

function schedulePacedRequest(): Promise<void> {
  const next = pacingTail.then(
    () =>
      new Promise<void>((resolve) => {
        const now = Date.now();
        const waitMs = Math.max(0, lastDispatchTs + MIN_REQUEST_GAP_MS - now);
        lastDispatchTs = now + waitMs;
        if (waitMs > 0) {
          setTimeout(resolve, waitMs);
        } else {
          resolve();
        }
      })
  );
  pacingTail = next.catch(() => {});
  return next;
}

function mapDramaBoxLang(lang: LanguageCode): string {
  if (lang === 'id') return 'id';
  if (lang === 'cn') return 'zh';
  if (lang === 'vi') return 'vi';
  return 'en';
}

function mapNetShortLang(lang: LanguageCode): string {
  if (lang === 'id') return 'id_ID';
  if (lang === 'cn') return 'zh_CN';
  if (lang === 'vi') return 'vi_VN';
  return 'en_US';
}

function mapDramaOraLang(lang: LanguageCode): string {
  return lang === 'id' ? 'id-id' : 'en-us';
}

function mapInEnLang(lang: LanguageCode): string {
  return lang === 'id' ? 'in' : 'en';
}

function mapIdEnLang(lang: LanguageCode): string {
  return lang === 'id' ? 'id' : 'en';
}

function mapRadReelsLang(lang: LanguageCode): string {
  return lang === 'id' ? '4' : '3';
}

function mapStardustLang(lang: LanguageCode): string {
  return lang === 'id' ? 'id_ID' : 'en_US';
}

function mapStarShortLang(lang: LanguageCode): string {
  return lang === 'id' ? '4' : '1';
}

function mapCubeTvLang(lang: LanguageCode): string {
  return lang === 'id' ? '9' : '1';
}

function mapFlickReelsLang(lang: LanguageCode): string {
  return lang === 'id' ? '6' : '1';
}

function mapDramaWaveLang(lang: LanguageCode): string {
  return lang === 'id' ? 'id-ID' : 'en-US';
}

export function mapProviderLang(
  provider: ProviderName,
  lang: LanguageCode
): string | undefined {
  switch (provider) {
    case 'DramaBoxV2':
      return mapDramaBoxLang(lang);
    case 'NetShort':
      return mapNetShortLang(lang);
    case 'MeloLoV2':
    case 'MeloShort':
    case 'DramaVerse':
    case 'MoboReels':
    case 'MicroDrama':
    case 'FunDrama':
    case 'Vigloo':
    case 'DotDrama':
    case 'GoodShort':
    case 'SodaReels':
      return mapInEnLang(lang);
    case 'DramaOra':
      return mapDramaOraLang(lang);
    case 'PetaDrama':
      return undefined;
    case 'RadReels':
      return mapRadReelsLang(lang);
    case 'StardustTV':
      return mapStardustLang(lang);
    case 'StarShort':
      return mapStarShortLang(lang);
    case 'CubeTV':
      return mapCubeTvLang(lang);
    case 'FlickReels':
      return mapFlickReelsLang(lang);
    case 'DramaWave':
    case 'FreeReels':
      return mapDramaWaveLang(lang);
    default:
      return mapIdEnLang(lang);
  }
}

export function ensureMeloloDecryptedUrl(
  rawUrl: string,
  baseUrl: string = MELOLO_V2_BASE
): string {
  const clean = cleanText(rawUrl);
  if (!clean) return '';
  if (clean.includes('/api/mola/melolov2/decrypt')) {
    return clean;
  }
  if (clean.includes('/api/mola/melolo/decrypt')) {
    return clean.replace('/api/mola/melolo/decrypt', '/api/mola/melolov2/decrypt');
  }
  if (clean.includes('/api/melolov2/decrypt') || clean.includes('/api/melolo/decrypt')) {
    try {
      const parsed = new URL(clean, 'http://localhost');
      parsed.searchParams.delete('token');
      return `${baseUrl}/decrypt${parsed.search}`;
    } catch {
      return clean;
    }
  }
  return `${baseUrl}/decrypt?url=${encodeURIComponent(clean)}`;
}

export function ensureHttpsSafeStreamUrl(rawUrl: string): string {
  const clean = cleanText(rawUrl);
  if (!clean) return '';
  if (
    clean.startsWith('http://') &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:'
  ) {
    return `${MEDIA_PROXY_PREFIX}${encodeURIComponent(clean)}`;
  }
  return clean;
}

export function getMoboReelsSubtitleUrl(
  bookId: string,
  episode: number,
  format: 'vtt' | 'srt' = 'vtt'
): string {
  return `${MOBOREELS_BASE}/subtitle?book_id=${encodeURIComponent(
    bookId
  )}&episode=${episode}&format=${format}`;
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

function toNonNegativeInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null;
}

class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

export function isFatalProviderError(err: unknown): boolean {
  if (err instanceof ApiHttpError) {
    return err.status === 401 || err.status === 403 || err.status === 503;
  }
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    /API HTTP (401|403|503)\b/i.test(msg) ||
    /MOLA_API_TOKEN/i.test(msg)
  );
}

function isSyntheticEpisodeId(rawId: string): boolean {
  const s = rawId.trim();
  if (!s) return true;
  return /^ep-\d+$/i.test(s) || /^[^-]+-ep-\d+$/i.test(s) || /^movie-\d+$/i.test(s);
}

async function requestProviderJson<T = unknown>(
  baseUrl: string,
  path: string,
  params: Record<string, string | number> = {},
  langValue?: string
): Promise<T> {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    searchParams.set(k, String(v));
  }
  if (langValue && !searchParams.has('lang')) {
    searchParams.set('lang', langValue);
  }

  const qs = searchParams.toString();
  const relativeUrl = `${baseUrl}${path}${qs ? `?${qs}` : ''}`;

  const gatewayUrl =
    typeof window === 'undefined'
      ? new URL(
          relativeUrl,
          (typeof process !== 'undefined'
            ? process.env?.CATALOG_SYNC_ORIGIN
            : undefined) || 'http://127.0.0.1:3000'
        ).toString()
      : relativeUrl;

  const fetchOnce = async (url: string, attempt = 0): Promise<T> => {
    await schedulePacedRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1050 + attempt * 500));
        return fetchOnce(url, attempt + 1);
      }
      if (!res.ok) {
        throw new ApiHttpError(
          res.status,
          `API HTTP ${res.status} (${res.statusText || 'Request failed'})`
        );
      }
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON payload received from drama provider');
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (obj.code === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1050 + attempt * 500));
          return fetchOnce(url, attempt + 1);
        }
        if (
          obj.success === false &&
          !obj.data &&
          !obj.episodes &&
          !obj.books &&
          !obj.items &&
          !obj.records
        ) {
          const msg = cleanText(
            obj.message ?? obj.error ?? obj.msg,
            'Drama provider returned an unsuccessful response'
          );
          throw new Error(msg);
        }
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  };

  return fetchOnce(gatewayUrl);
}

function extractBookArray(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    const first = payload[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.books)) {
      return payload.flatMap((entry) =>
        Array.isArray((entry as Record<string, unknown>).books)
          ? ((entry as Record<string, unknown>).books as Record<
              string,
              unknown
            >[])
          : []
      );
    }
    return payload as Record<string, unknown>[];
  }

  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.books)) {
      return obj.books as Record<string, unknown>[];
    }
    if (Array.isArray(obj.items)) {
      return obj.items as Record<string, unknown>[];
    }
    if (Array.isArray(obj.list)) {
      return obj.list as Record<string, unknown>[];
    }
    if (Array.isArray(obj.records)) {
      return obj.records as Record<string, unknown>[];
    }
    if (Array.isArray(obj.results)) {
      return obj.results as Record<string, unknown>[];
    }
    if (Array.isArray(obj.dramas)) {
      return obj.dramas as Record<string, unknown>[];
    }
    if (obj.data !== undefined && obj.data !== null) {
      return extractBookArray(obj.data);
    }
  }
  return [];
}

function normalizeDrama(
  raw: Record<string, unknown>,
  provider: ProviderName,
  index?: number,
  forceVip = false,
  fallbackBookId?: string
): DramaItem | null {
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
    fallbackBookId,
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

  const description = cleanText(
    raw.description ??
      raw.introduction ??
      raw.synopsis ??
      raw.intro ??
      raw.summary,
    `Watch ${title} in vertical HD theater mode on KanoDrama.`
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

  const slugVal = cleanText(raw.slug);

  return {
    bookId,
    title,
    ...(slugVal ? { slug: slugVal } : {}),
    cover,
    description,
    chapterCount,
    tags,
    playCount: cleanText(raw.playCount ?? raw.hotCode ?? raw.views) || undefined,
    corner: cornerText || undefined,
    protagonist: cleanText(raw.protagonist) || undefined,
    author: cleanText(raw.author) || undefined,
    isVip,
    provider,
    mediaType: 'drama',
    rank: typeof index === 'number' ? index + 1 : undefined,
  };
}

export function normalizeEpisodeList(payload: unknown): EpisodeItem[] {
  let rawEpisodes: Record<string, unknown>[] = [];

  if (Array.isArray(payload)) {
    rawEpisodes = payload as Record<string, unknown>[];
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.episodes)) {
      rawEpisodes = obj.episodes as Record<string, unknown>[];
    } else if (Array.isArray(obj.chapterList)) {
      rawEpisodes = obj.chapterList as Record<string, unknown>[];
    } else if (Array.isArray(obj.list)) {
      rawEpisodes = obj.list as Record<string, unknown>[];
    } else if (obj.data && typeof obj.data === 'object') {
      const dataObj = obj.data as Record<string, unknown>;
      if (Array.isArray(dataObj.episodes)) {
        rawEpisodes = dataObj.episodes as Record<string, unknown>[];
      } else if (Array.isArray(dataObj.chapterList)) {
        rawEpisodes = dataObj.chapterList as Record<string, unknown>[];
      } else if (Array.isArray(dataObj.list)) {
        rawEpisodes = dataObj.list as Record<string, unknown>[];
      } else if (Array.isArray(dataObj.data)) {
        rawEpisodes = dataObj.data as Record<string, unknown>[];
      } else if (Array.isArray(obj.data)) {
        rawEpisodes = obj.data as Record<string, unknown>[];
      }
    }
  }

  const rawIndices = rawEpisodes.map((ep) =>
    toNonNegativeInt(
      ep.chapterIndex ??
        ep.episodeIndex ??
        ep.episode ??
        ep.episodeNo ??
        ep.episodeNumber ??
        ep.sort
    )
  );
  const validIndices = rawIndices.filter((n): n is number => n !== null);
  const hasZeroBasedIndex =
    validIndices.length > 0 && Math.min(...validIndices) === 0;
  const usedNumbers = new Set<number>();

  return rawEpisodes
    .map((ep, idx): EpisodeItem => {
      const rawIdx = rawIndices[idx];
      let epNum =
        rawIdx !== null
          ? hasZeroBasedIndex
            ? rawIdx + 1
            : rawIdx > 0
            ? rawIdx
            : idx + 1
          : idx + 1;
      while (usedNumbers.has(epNum)) {
        epNum += 1;
      }
      usedNumbers.add(epNum);

      const explicitIdx0 = toNonNegativeInt(ep.chapterIndex0);
      const chapterIndex0 =
        explicitIdx0 !== null
          ? explicitIdx0
          : hasZeroBasedIndex && rawIdx !== null
          ? rawIdx
          : Math.max(0, epNum - 1);

      const rawEid = cleanText(
        String(
          ep.chapterId ??
            ep.episodeId ??
            ep.episode_id ??
            ep.chapter_id ??
            ep.eid ??
            ep.id ??
            ''
        )
      );
      const chapterId = rawEid || `ep-${epNum}`;
      const rawTitle = cleanText(ep.chapterName ?? ep.title ?? ep.name);
      const title =
        rawTitle && !/^\d+$/.test(rawTitle) ? rawTitle : `EP ${epNum}`;
      const providerLocked =
        Number(ep.isCharge ?? 0) === 1 ||
        Number(ep.isPay ?? 0) === 1 ||
        Boolean(ep.isVip) ||
        Boolean(ep.isLocked);
      const isVipLocked = epNum > 10 && (providerLocked || epNum === 11);

      return {
        chapterId,
        episodeNumber: epNum,
        chapterIndex0,
        title,
        isVipLocked,
        eid: rawEid && !isSyntheticEpisodeId(rawEid) ? rawEid : undefined,
      };
    })
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

export function normalizeStream(
  payload: unknown,
  bookId: string,
  episodeNumber: number,
  provider: ProviderName
): StreamSource {
  const root = (payload && typeof payload === 'object'
    ? payload
    : {}) as Record<string, unknown>;
  const data = ((root.data && typeof root.data === 'object'
    ? root.data
    : root) ?? {}) as Record<string, unknown>;

  const qualities: StreamQualityOption[] = [];
  const seenUrls = new Set<string>();

  const transformUrl = (url: string): string => {
    if (provider === 'MeloLoV2') return ensureMeloloDecryptedUrl(url, MELOLO_V2_BASE);
    return ensureHttpsSafeStreamUrl(url);
  };

  const pushQuality = (labelRaw: unknown, urlRaw: unknown) => {
    const rawUrl = cleanText(urlRaw);
    if (!rawUrl) return;
    const qUrl = transformUrl(rawUrl);
    if (!qUrl || seenUrls.has(qUrl)) return;
    seenUrls.add(qUrl);
    const labelText = cleanText(labelRaw, 'HD');
    const normalizedLabel = /^\d{3,4}$/.test(labelText)
      ? `${labelText}p`
      : labelText;
    qualities.push({ quality: normalizedLabel, url: qUrl });
  };

  const arrayCandidates = [
    data.qualities,
    data.streamList,
    data.streams,
    data.definitionList,
    data.clarityList,
    data.videos,
    data.videoList,
    data.cdnList,
    root.qualities,
    root.streamList,
    root.videoList,
  ];

  for (const list of arrayCandidates) {
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      if (q && typeof q === 'object') {
        const qObj = q as Record<string, unknown>;
        const codecSuffix =
          typeof qObj.codecType === 'string' &&
          qObj.codecType.toLowerCase() === 'h264'
            ? ' (H.264)'
            : '';
        const baseLabel = cleanText(
          qObj.quality ?? qObj.label ?? qObj.definition ?? qObj.clarity ?? qObj.name,
          'HD'
        );
        const formattedBase = /^\d{3,4}$/.test(baseLabel)
          ? `${baseLabel}p`
          : baseLabel;
        pushQuality(
          `${formattedBase}${codecSuffix}`,
          qObj.videoUrl ??
            qObj.video_url ??
            qObj.hlsUrl ??
            qObj.hls_url ??
            qObj.m3u8Url ??
            qObj.m3u8_url ??
            qObj.mp4Url ??
            qObj.mp4_url ??
            qObj.url ??
            qObj.src ??
            qObj.playUrl ??
            qObj.play_url ??
            qObj.directUrl ??
            qObj.streamUrl ??
            qObj.stream_url ??
            qObj.audioUrl ??
            qObj.audio_url ??
            qObj.mp3 ??
            qObj.fileUrl ??
            qObj.videoPath ??
            qObj.proxyUrl ??
            qObj.raw_url ??
            qObj.direct_url ??
            qObj.backup_url
        );
        if (qObj.raw_url && qObj.raw_url !== qObj.url) {
          pushQuality(`${formattedBase} Alt`, qObj.raw_url);
        }
      }
    }
  }

  const resolutionKeys: [string, unknown][] = [
    ['1080p', data['1080p'] ?? data.url1080 ?? data.video1080 ?? data.fhdUrl],
    ['720p', data['720p'] ?? data.url720 ?? data.video720 ?? data.hdUrl],
    ['540p', data['540p'] ?? data.url540 ?? data.video540 ?? data.sdUrl],
    ['480p', data['480p'] ?? data.url480 ?? data.video480],
    ['360p', data['360p'] ?? data.url360 ?? data.video360],
    ['H.264', data.h264Url ?? data.h264_url],
  ];
  for (const [label, urlVal] of resolutionKeys) {
    pushQuality(label, urlVal);
  }

  const rawEmbedServers: StreamServerOption[] = [];
  const serverArrayCandidates = [
    data.servers,
    data.serverList,
    data.mirrors,
    root.servers,
    root.serverList,
  ];
  for (const srvList of serverArrayCandidates) {
    if (!Array.isArray(srvList)) continue;
    for (const entry of srvList) {
      if (!entry || typeof entry !== 'object') continue;
      const srv = entry as Record<string, unknown>;
      const srvName = cleanText(srv.name ?? srv.label ?? srv.server ?? srv.title, `Server ${rawEmbedServers.length + 1}`);
      const directCandidate = cleanText(
        srv.streamUrl ??
          srv.stream_url ??
          srv.hlsUrl ??
          srv.hls_url ??
          srv.m3u8Url ??
          srv.m3u8_url ??
          srv.mp4Url ??
          srv.mp4_url ??
          srv.videoUrl ??
          srv.video_url ??
          srv.url
      );
      const embedCandidate = cleanText(
        srv.embedUrl ?? srv.embed_url ?? srv.iframeUrl ?? srv.iframe_url
      );
      if (directCandidate) {
        pushQuality(srvName, directCandidate);
      }
      if (embedCandidate) {
        const safeEmbed = ensureHttpsSafeStreamUrl(embedCandidate);
        if (safeEmbed && !seenUrls.has(safeEmbed)) {
          rawEmbedServers.push({
            id: `srv-ext-embed-${rawEmbedServers.length}`,
            name: srvName,
            url: safeEmbed,
            type: 'embed',
            quality: cleanText(srv.quality, 'HD'),
          });
        }
      }
    }
  }

  const rawDirectUrl =
    cleanText(
      data.videoUrl ??
        data.video_url ??
        data.hlsUrl ??
        data.hls_url ??
        data.m3u8Url ??
        data.m3u8_url ??
        data.mp4Url ??
        data.mp4_url ??
        data.url ??
        data.src ??
        data.source ??
        (typeof data.video === 'string' && data.video ? data.video : undefined) ??
        (typeof data.stream === 'string' && data.stream ? data.stream : undefined) ??
        data.playUrl ??
        data.play_url ??
        data.hdUrl ??
        data.directUrl ??
        data.h264Url ??
        data.h264_url ??
        data.m3u8 ??
        data.streamUrl ??
        data.stream_url ??
        data.audioUrl ??
        data.audio_url ??
        data.mp3Url ??
        data.mp3 ??
        (typeof data.audio === 'string' && data.audio ? data.audio : undefined) ??
        data.proxyUrl ??
        data.raw_url ??
        data.direct_url ??
        data.backup_url ??
        root.video_url ??
        root.hls_url ??
        root.mp4_url ??
        root.play_url ??
        root.stream_url ??
        root.audio_url ??
        root.url ??
        qualities[0]?.url
    ) || '';

  const rawEmbedUrl =
    cleanText(
      data.embedUrl ??
        data.embed_url ??
        data.iframeUrl ??
        data.iframe_url ??
        root.embedUrl ??
        root.embed_url ??
        root.iframeUrl ??
        root.iframe_url ??
        rawEmbedServers[0]?.url
    ) || '';

  const rawPrimaryUrl = rawDirectUrl || rawEmbedUrl;
  const primaryUrl = rawPrimaryUrl ? transformUrl(rawPrimaryUrl) : '';

  if (!primaryUrl) {
    const upstreamMsg = cleanText(
      root.message ?? root.error ?? data.message ?? data.error
    );
    throw new Error(
      upstreamMsg ||
        `No playable stream returned by ${provider} for EP ${episodeNumber}.`
    );
  }

  if (qualities.length === 0) {
    qualities.push({ quality: 'HD', url: primaryUrl });
  } else if (!seenUrls.has(primaryUrl)) {
    qualities.unshift({ quality: 'Auto', url: primaryUrl });
  }

  const isHls =
    primaryUrl.toLowerCase().includes('.m3u8') ||
    qualities.some((q) => q.url.toLowerCase().includes('.m3u8'));

  const subtitles: SubtitleTrackItem[] = [];
  const seenSubUrls = new Set<string>();
  const subCandidates = [
    data.subtitles,
    data.subtitleList,
    data.captionList,
    data.captions,
    data.tracks,
    root.subtitles,
    root.captionList,
  ];

  const formatSubLangName = (rawLang: string, rawLabel: string): string => {
    if (rawLabel) return rawLabel;
    const norm = rawLang.toLowerCase().replace('-', '_');
    if (norm === 'id' || norm === 'in' || norm === 'id_id') return 'Indonesia';
    if (norm.startsWith('en')) return 'English';
    if (norm.startsWith('zh') || norm === 'cn') return '中文 (Mandarin)';
    if (norm.startsWith('vi')) return 'Tiếng Việt';
    if (norm.startsWith('ms')) return 'Bahasa Melayu';
    if (norm.startsWith('th')) return 'ไทย';
    if (norm.startsWith('ko')) return '한국어';
    if (norm.startsWith('ja')) return '日本語';
    return rawLang ? rawLang.toUpperCase() : 'Subtitle';
  };

  for (const list of subCandidates) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const subObj = entry as Record<string, unknown>;
      const subUrl = cleanText(
        subObj.url ??
          subObj.src ??
          subObj.file ??
          subObj.vtt ??
          subObj.srt ??
          subObj.subtitleUrl ??
          subObj.captionUrl
      );
      if (!subUrl || seenSubUrls.has(subUrl)) continue;
      seenSubUrls.add(subUrl);
      const langCode = cleanText(
        subObj.lang ?? subObj.language ?? subObj.srclang ?? subObj.code,
        'und'
      );
      const rawLabel = cleanText(
        subObj.label ?? subObj.name ?? subObj.languageName ?? subObj.title
      );
      subtitles.push({
        id: `api-${subtitles.length}-${langCode}`,
        lang: langCode,
        label: formatSubLangName(langCode, rawLabel),
        url: subUrl,
        source: 'api',
      });
    }
  }

  // Inject MoboReels dedicated WebVTT subtitle endpoint automatically
  if (provider === 'MoboReels') {
    const vttUrl = getMoboReelsSubtitleUrl(bookId, episodeNumber, 'vtt');
    if (!seenSubUrls.has(vttUrl)) {
      const activeCode = currentAppLang === 'id' ? 'id' : 'en';
      subtitles.push({
        id: `moboreels-vtt-${episodeNumber}`,
        lang: activeCode,
        label: activeCode === 'id' ? 'Indonesia (VTT)' : 'Subtitle (VTT)',
        url: vttUrl,
        source: 'api',
      });
    }
  }

  const isEmbedOnly = !rawDirectUrl && Boolean(rawEmbedUrl);
  const safeEmbedUrl = rawEmbedUrl ? ensureHttpsSafeStreamUrl(rawEmbedUrl) : '';
  const servers: StreamServerOption[] = [];
  const seenServerUrls = new Set<string>();
  if (rawDirectUrl) {
    qualities.forEach((q, idx) => {
      if (seenServerUrls.has(q.url)) return;
      seenServerUrls.add(q.url);
      servers.push({
        id: `srv-${idx}`,
        name: qualities.length > 1 ? `Server ${q.quality}` : 'Server Utama (HD)',
        url: q.url,
        type: q.url.toLowerCase().includes('.m3u8') ? 'hls' : 'mp4',
        quality: q.quality,
      });
    });
  }
  for (const extEmbed of rawEmbedServers) {
    if (seenServerUrls.has(extEmbed.url)) continue;
    seenServerUrls.add(extEmbed.url);
    servers.push(extEmbed);
  }
  if (safeEmbedUrl && !seenServerUrls.has(safeEmbedUrl)) {
    seenServerUrls.add(safeEmbedUrl);
    servers.push({
      id: 'srv-embed',
      name: 'Server Embed',
      url: safeEmbedUrl,
      type: 'embed',
      quality: 'HD',
    });
  }

  return {
    bookId,
    provider,
    episodeNumber,
    chapterId:
      cleanText(String(data.chapterId ?? data.episodeId ?? '')) || undefined,
    streamUrl: primaryUrl,
    ...(safeEmbedUrl ? { embedUrl: safeEmbedUrl } : {}),
    sourceType: isEmbedOnly ? 'embed' : isHls ? 'hls' : 'mp4',
    isHls,
    qualities,
    subtitles: subtitles.length > 0 ? subtitles : undefined,
    ...(servers.length > 0 ? { servers } : {}),
  };
}

async function fetchProviderFeed(
  baseUrl: string,
  endpoint: string,
  provider: ProviderName,
  page: number,
  langValue?: string,
  options: {
    withRank?: boolean;
    forceVip?: boolean;
    extraParams?: Record<string, string | number>;
    omitPage?: boolean;
  } = {}
): Promise<PaginatedResult> {
  const params: Record<string, string | number> = {
    ...(options.omitPage ? {} : { page }),
    ...(options.extraParams ?? {}),
  };
  const json = await requestProviderJson(
    baseUrl,
    endpoint,
    params,
    langValue
  );
  const rawList = extractBookArray(json);

  const items: DramaItem[] = [];
  const seen = new Set<string>();

  rawList.forEach((raw, idx) => {
    const item = normalizeDrama(
      raw,
      provider,
      options.withRank ? (page - 1) * 20 + idx : undefined,
      options.forceVip
    );
    if (item && !seen.has(item.bookId)) {
      seen.add(item.bookId);
      items.push(item);
    }
  });

  return {
    items,
    hasMore: options.omitPage ? false : rawList.length >= 6,
    page,
  };
}

// --- Episode Cache for Providers Needing Extra Stream Keys (DramaOra eid / ShotShort chapter_id) ---
const episodeCache = new Map<
  string,
  { expiresAt: number; episodes: EpisodeItem[] }
>();

function cacheEpisodes(
  provider: ProviderName,
  bookId: string,
  list: EpisodeItem[]
): void {
  if (list.length === 0) return;
  episodeCache.set(`${provider}:${currentAppLang}:${bookId}`, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    episodes: list,
  });
}

function getCachedEpisodeMeta(
  provider: ProviderName,
  bookId: string,
  episode: number
): EpisodeItem | undefined {
  const entry = episodeCache.get(`${provider}:${currentAppLang}:${bookId}`);
  if (!entry || Date.now() > entry.expiresAt) return undefined;
  return entry.episodes.find((e) => e.episodeNumber === episode);
}

interface StreamFallbackRequestOptions {
  baseUrl: string;
  bookId: string;
  episode: number;
  provider: ProviderName;
  langVal?: string;
  idParam: string;
  epParam: string;
  extra?: { eid?: string; chapterId?: string; chapterIndex0?: number };
  extraParams?: Record<string, string | number>;
  usePlainFallback?: boolean;
}

async function requestStreamWithFallback(
  opts: StreamFallbackRequestOptions
): Promise<StreamSource> {
  const {
    baseUrl,
    bookId,
    episode,
    provider,
    langVal,
    idParam,
    epParam,
    extra,
    extraParams = {},
    usePlainFallback = false,
  } = opts;

  const meta = getCachedEpisodeMeta(provider, bookId, episode);
  const rawChId = cleanText(extra?.chapterId ?? meta?.chapterId);
  const validChId = rawChId && !isSyntheticEpisodeId(rawChId) ? rawChId : '';
  const rawEid = cleanText(extra?.eid ?? meta?.eid);
  const validEid = rawEid && !isSyntheticEpisodeId(rawEid) ? rawEid : '';
  const epIdx0 =
    typeof extra?.chapterIndex0 === 'number'
      ? extra.chapterIndex0
      : meta?.chapterIndex0;

  const idExtras: Record<string, string | number> = {
    ...(validChId ? { chapter_id: validChId } : {}),
    ...(validEid ? { eid: validEid } : {}),
  };

  if (usePlainFallback) {
    try {
      return await fetchStreamWithPlainFallback(
        baseUrl,
        bookId,
        episode,
        provider,
        langVal,
        idParam,
        epParam,
        { ...idExtras, ...extraParams }
      );
    } catch (err) {
      if (isFatalProviderError(err)) throw err;
    }
  }

  let lastError: unknown = null;
  const attemptVariants: Array<{
    path: '/stream' | '/stream_plain';
    params: Record<string, string | number>;
  }> = [
    {
      path: '/stream',
      params: { [idParam]: bookId, [epParam]: episode, ...idExtras, ...extraParams },
    },
  ];

  if (typeof epIdx0 === 'number' && epIdx0 !== episode) {
    attemptVariants.push({
      path: '/stream',
      params: { [idParam]: bookId, [epParam]: epIdx0, ...idExtras, ...extraParams },
    });
  }

  for (const altEpParam of ['episode', 'episode_index', 'episodeIndex', 'ep']) {
    if (altEpParam === epParam) continue;
    attemptVariants.push({
      path: '/stream',
      params: { [idParam]: bookId, [altEpParam]: episode, ...idExtras, ...extraParams },
    });
  }

  if (!usePlainFallback) {
    attemptVariants.push({
      path: '/stream_plain',
      params: { [idParam]: bookId, [epParam]: episode, ...idExtras, ...extraParams },
    });
  }

  for (const attempt of attemptVariants) {
    try {
      const json = await requestProviderJson(
        baseUrl,
        attempt.path,
        attempt.params,
        langVal
      );
      return normalizeStream(json, bookId, episode, provider);
    } catch (err) {
      if (isFatalProviderError(err)) throw err;
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`No playable stream returned by ${provider} for EP ${episode}.`);
}

// --- Stream Cache (Zero-Latency 80% Prefetching) ---
const STREAM_CACHE_TTL_MS = 15 * 60 * 1000;
const streamCache = new Map<
  string,
  { expiresAt: number; promise: Promise<StreamSource> }
>();

function streamKey(
  provider: ProviderName,
  bookId: string,
  episode: number
): string {
  return `${provider}:${currentAppLang}:${bookId}:${episode}`;
}

export function isStreamCached(
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2'
): boolean {
  const entry = streamCache.get(streamKey(provider, bookId, episode));
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    streamCache.delete(streamKey(provider, bookId, episode));
    return false;
  }
  return true;
}

// --- Provider 1: DramaBox V2 Adapter ---
export const dramaBoxV2Provider: DramaProviderAdapter = {
  id: 'DramaBoxV2',
  label: 'DramaBox V2',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(DRAMABOX_V2_BASE, '/set_language', {
      lang: mapDramaBoxLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      DRAMABOX_V2_BASE,
      '/foryou',
      'DramaBoxV2',
      page,
      mapDramaBoxLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      DRAMABOX_V2_BASE,
      '/ranking',
      'DramaBoxV2',
      page,
      mapDramaBoxLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return fetchProviderFeed(
      DRAMABOX_V2_BASE,
      '/terbaru',
      'DramaBoxV2',
      page,
      mapDramaBoxLang(currentAppLang)
    );
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      DRAMABOX_V2_BASE,
      '/vip',
      'DramaBoxV2',
      page,
      mapDramaBoxLang(currentAppLang),
      { forceVip: true }
    );
  },

  fetchDubbing(page = 1) {
    return fetchProviderFeed(
      DRAMABOX_V2_BASE,
      '/dubbing',
      'DramaBoxV2',
      page,
      mapDramaBoxLang(currentAppLang)
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      DRAMABOX_V2_BASE,
      '/search',
      { keyword: trimmed, page },
      mapDramaBoxLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'DramaBoxV2'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      DRAMABOX_V2_BASE,
      '/detail',
      { book_id: bookId },
      mapDramaBoxLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'DramaBoxV2', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      DRAMABOX_V2_BASE,
      '/allepisode',
      { book_id: bookId },
      mapDramaBoxLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('DramaBoxV2', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: DRAMABOX_V2_BASE,
      bookId,
      episode,
      provider: 'DramaBoxV2',
      langVal: mapDramaBoxLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 2: NetShort Adapter ---
export const netShortProvider: DramaProviderAdapter = {
  id: 'NetShort',
  label: 'NetShort',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(NETSHORT_BASE, '/set_language', {
      lang: mapNetShortLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      NETSHORT_BASE,
      '/foryou',
      'NetShort',
      page,
      mapNetShortLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      NETSHORT_BASE,
      '/trending',
      'NetShort',
      page,
      mapNetShortLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return fetchProviderFeed(
      NETSHORT_BASE,
      '/all',
      'NetShort',
      page,
      mapNetShortLang(currentAppLang)
    );
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      NETSHORT_BASE,
      '/trending',
      'NetShort',
      page,
      mapNetShortLang(currentAppLang),
      { forceVip: true }
    );
  },

  fetchAnime(page = 1) {
    return fetchProviderFeed(
      NETSHORT_BASE,
      '/anime',
      'NetShort',
      page,
      mapNetShortLang(currentAppLang)
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      NETSHORT_BASE,
      '/search',
      { keyword: trimmed, page },
      mapNetShortLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'NetShort'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      NETSHORT_BASE,
      '/detail',
      { book_id: bookId },
      mapNetShortLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'NetShort', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      NETSHORT_BASE,
      '/allepisode',
      { book_id: bookId },
      mapNetShortLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('NetShort', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: NETSHORT_BASE,
      bookId,
      episode,
      provider: 'NetShort',
      langVal: mapNetShortLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
      extraParams: { codec: 'h264' },
    });
  },
};

// --- Provider 3: AnyReel Adapter ---
export const anyReelProvider: DramaProviderAdapter = {
  id: 'AnyReel',
  label: 'AnyReel',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(ANYREEL_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      ANYREEL_BASE,
      '/foryou',
      'AnyReel',
      page,
      mapIdEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      ANYREEL_BASE,
      '/asian',
      'AnyReel',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return fetchProviderFeed(
      ANYREEL_BASE,
      '/asian',
      'AnyReel',
      page,
      mapIdEnLang(currentAppLang)
    );
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      ANYREEL_BASE,
      '/foryou',
      'AnyReel',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      ANYREEL_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'AnyReel'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      ANYREEL_BASE,
      '/detail',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'AnyReel', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      ANYREEL_BASE,
      '/allepisode',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('AnyReel', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: ANYREEL_BASE,
      bookId,
      episode,
      provider: 'AnyReel',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 5: DramaOra (7 Endpoints) ---
export const dramaOraProvider: DramaProviderAdapter & {
  fetchCategoryDramas: (
    categoryId?: string | number,
    page?: number
  ) => Promise<PaginatedResult>;
} = {
  id: 'DramaOra',
  label: 'DramaOra',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(DRAMAORA_BASE, '/set_language', {
      lang: mapDramaOraLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      DRAMAORA_BASE,
      '/foryou',
      'DramaOra',
      page,
      mapDramaOraLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchCategoryDramas(categoryId: string | number = 57819, page = 1) {
    return fetchProviderFeed(
      DRAMAORA_BASE,
      '/category_dramas',
      'DramaOra',
      page,
      mapDramaOraLang(currentAppLang),
      { withRank: true, extraParams: { category_id: categoryId, page_size: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchCategoryDramas(57819, page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchForYou(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      DRAMAORA_BASE,
      '/category_dramas',
      'DramaOra',
      page,
      mapDramaOraLang(currentAppLang),
      { forceVip: true, extraParams: { category_id: 57819, page_size: 20 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      DRAMAORA_BASE,
      '/search',
      { keyword: trimmed, page, page_size: 20 },
      mapDramaOraLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'DramaOra'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(vid: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      DRAMAORA_BASE,
      '/detail',
      { vid },
      mapDramaOraLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'DramaOra', undefined, false, vid);
  },

  async fetchAllEpisodes(vid: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      DRAMAORA_BASE,
      '/allepisode',
      { vid },
      mapDramaOraLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('DramaOra', vid, eps);
    return eps;
  },

  async fetchStream(
    vid: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ): Promise<StreamSource> {
    let eid = cleanText(extra?.eid ?? extra?.chapterId);
    let chapterIndex0 = extra?.chapterIndex0;
    if (!eid || isSyntheticEpisodeId(eid)) {
      const cachedEp = getCachedEpisodeMeta('DramaOra', vid, episode);
      eid = cleanText(cachedEp?.eid ?? cachedEp?.chapterId);
      chapterIndex0 = chapterIndex0 ?? cachedEp?.chapterIndex0;
      if (!eid || isSyntheticEpisodeId(eid)) {
        const eps = await this.fetchAllEpisodes(vid);
        const match = eps.find((e) => e.episodeNumber === episode);
        eid = cleanText(match?.eid ?? match?.chapterId);
        chapterIndex0 = chapterIndex0 ?? match?.chapterIndex0;
      }
    }
    return requestStreamWithFallback({
      baseUrl: DRAMAORA_BASE,
      bookId: vid,
      episode,
      provider: 'DramaOra',
      langVal: mapDramaOraLang(currentAppLang),
      idParam: 'vid',
      epParam: 'episode',
      extra: { eid, chapterIndex0 },
    });
  },
};

// --- Provider 6: MeloShort (8 Endpoints) ---
export const meloShortProvider: DramaProviderAdapter & {
  fetchRecommend: (reset?: number) => Promise<PaginatedResult>;
} = {
  id: 'MeloShort',
  label: 'MeloShort',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MELOSHORT_BASE, '/set_language', {
      lang: mapInEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      MELOSHORT_BASE,
      '/foryou',
      'MeloShort',
      page,
      mapInEnLang(currentAppLang)
    );
  },

  fetchRecommend(reset = 1) {
    return fetchProviderFeed(
      MELOSHORT_BASE,
      '/recommend',
      'MeloShort',
      1,
      mapInEnLang(currentAppLang),
      { omitPage: true, extraParams: { reset } }
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      MELOSHORT_BASE,
      '/ranking',
      'MeloShort',
      page,
      mapInEnLang(currentAppLang),
      { withRank: true, omitPage: true }
    );
  },

  fetchNewReleases() {
    return this.fetchRecommend(1);
  },

  fetchVip() {
    return fetchProviderFeed(
      MELOSHORT_BASE,
      '/ranking',
      'MeloShort',
      1,
      mapInEnLang(currentAppLang),
      { forceVip: true, omitPage: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      MELOSHORT_BASE,
      '/search',
      { keyword: trimmed },
      mapInEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'MeloShort'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: false, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      MELOSHORT_BASE,
      '/detail',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'MeloShort', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      MELOSHORT_BASE,
      '/allepisode',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('MeloShort', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: MELOSHORT_BASE,
      bookId,
      episode,
      provider: 'MeloShort',
      langVal: mapInEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 7: PetaDrama (6 Endpoints) ---
export const petaDramaProvider: DramaProviderAdapter & {
  fetchAllDrama: (page?: number, pageSize?: number) => Promise<PaginatedResult>;
  fetchCategoryDramas: (
    categoryId?: string | number,
    page?: number,
    pageSize?: number
  ) => Promise<PaginatedResult>;
} = {
  id: 'PetaDrama',
  label: 'PetaDrama',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
  },

  fetchAllDrama(page = 1, pageSize = 50) {
    return fetchProviderFeed(PETADRAMA_BASE, '/alldrama', 'PetaDrama', page, undefined, {
      extraParams: { pageSize },
    });
  },

  fetchCategoryDramas(categoryId: string | number = 57819, page = 1, pageSize = 20) {
    return fetchProviderFeed(
      PETADRAMA_BASE,
      '/category_dramas',
      'PetaDrama',
      page,
      undefined,
      { withRank: true, extraParams: { category_id: categoryId, page_size: pageSize } }
    );
  },

  fetchForYou(page = 1) {
    return this.fetchAllDrama(page, 50);
  },

  fetchRanking(page = 1) {
    return this.fetchCategoryDramas(57819, page, 20);
  },

  fetchNewReleases(page = 1) {
    return this.fetchAllDrama(page, 50);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(PETADRAMA_BASE, '/alldrama', 'PetaDrama', page, undefined, {
      forceVip: true,
      extraParams: { pageSize: 50 },
    });
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(PETADRAMA_BASE, '/search', {
      q: trimmed,
    });
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'PetaDrama'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: false, page };
  },

  async fetchDetail(id: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      PETADRAMA_BASE,
      '/detail',
      { id }
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'PetaDrama', undefined, false, id);
  },

  async fetchAllEpisodes(id: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(PETADRAMA_BASE, '/allepisode', { id });
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('PetaDrama', id, eps);
    return eps;
  },

  fetchStream(
    id: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: PETADRAMA_BASE,
      bookId: id,
      episode,
      provider: 'PetaDrama',
      idParam: 'id',
      epParam: 'ep',
      extra,
    });
  },
};

// --- Provider 8: RadReels (8 Endpoints) ---
export const radReelsProvider: DramaProviderAdapter & {
  fetchBaru: (page?: number) => Promise<PaginatedResult>;
  fetchTrending: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'RadReels',
  label: 'RadReels',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(RADREELS_BASE, '/set_language', {
      lang: mapRadReelsLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      RADREELS_BASE,
      '/foryou',
      'RadReels',
      page,
      mapRadReelsLang(currentAppLang)
    );
  },

  fetchBaru(page = 1) {
    return fetchProviderFeed(
      RADREELS_BASE,
      '/baru',
      'RadReels',
      page,
      mapRadReelsLang(currentAppLang)
    );
  },

  fetchTrending(page = 1) {
    return fetchProviderFeed(
      RADREELS_BASE,
      '/trending',
      'RadReels',
      page,
      mapRadReelsLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchTrending(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchBaru(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      RADREELS_BASE,
      '/trending',
      'RadReels',
      page,
      mapRadReelsLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      RADREELS_BASE,
      '/search',
      { keyword: trimmed, page },
      mapRadReelsLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'RadReels'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      RADREELS_BASE,
      '/detail',
      { book_id: bookId },
      mapRadReelsLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'RadReels', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      RADREELS_BASE,
      '/allepisode',
      { book_id: bookId },
      mapRadReelsLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('RadReels', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: RADREELS_BASE,
      bookId,
      episode,
      provider: 'RadReels',
      langVal: mapRadReelsLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 9: DramaVerse (8 Endpoints) ---
export const dramaVerseProvider: DramaProviderAdapter & {
  fetchHot: (page?: number) => Promise<PaginatedResult>;
  fetchNew: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'DramaVerse',
  label: 'DramaVerse',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(DRAMAVERSE_BASE, '/set_language', {
      lang: mapInEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      DRAMAVERSE_BASE,
      '/foryou',
      'DramaVerse',
      page,
      mapInEnLang(currentAppLang)
    );
  },

  fetchHot(page = 1) {
    return fetchProviderFeed(
      DRAMAVERSE_BASE,
      '/hot',
      'DramaVerse',
      page,
      mapInEnLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNew(page = 1) {
    return fetchProviderFeed(
      DRAMAVERSE_BASE,
      '/new',
      'DramaVerse',
      page,
      mapInEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return this.fetchHot(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchNew(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      DRAMAVERSE_BASE,
      '/hot',
      'DramaVerse',
      page,
      mapInEnLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      DRAMAVERSE_BASE,
      '/search',
      { keyword: trimmed, page },
      mapInEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'DramaVerse'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      DRAMAVERSE_BASE,
      '/detail',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'DramaVerse', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      DRAMAVERSE_BASE,
      '/allepisode',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('DramaVerse', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: DRAMAVERSE_BASE,
      bookId,
      episode,
      provider: 'DramaVerse',
      langVal: mapInEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 10: KalosTV (6 Endpoints) ---
export const kalosTvProvider: DramaProviderAdapter = {
  id: 'KalosTV',
  label: 'KalosTV',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(KALOSTV_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      KALOSTV_BASE,
      '/foryou',
      'KalosTV',
      page,
      mapIdEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      KALOSTV_BASE,
      '/foryou',
      'KalosTV',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return this.fetchForYou(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      KALOSTV_BASE,
      '/foryou',
      'KalosTV',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      KALOSTV_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'KalosTV'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      KALOSTV_BASE,
      '/detail',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'KalosTV', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      KALOSTV_BASE,
      '/allepisode',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('KalosTV', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: KALOSTV_BASE,
      bookId,
      episode,
      provider: 'KalosTV',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 11: StardustTV (9 Endpoints) ---
export const stardustTvProvider: DramaProviderAdapter & {
  fetchHot: (page?: number) => Promise<PaginatedResult>;
  fetchTerbaru: (page?: number) => Promise<PaginatedResult>;
  fetchNew: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'StardustTV',
  label: 'Stardust TV',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(STARDUST_BASE, '/set_language', {
      lang: mapStardustLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      STARDUST_BASE,
      '/foryou',
      'StardustTV',
      page,
      mapStardustLang(currentAppLang),
      { extraParams: { page_size: 15 } }
    );
  },

  fetchHot(page = 1) {
    return fetchProviderFeed(
      STARDUST_BASE,
      '/hot',
      'StardustTV',
      page,
      mapStardustLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 15 } }
    );
  },

  fetchTerbaru(page = 1) {
    return fetchProviderFeed(
      STARDUST_BASE,
      '/terbaru',
      'StardustTV',
      page,
      mapStardustLang(currentAppLang),
      { extraParams: { page_size: 15 } }
    );
  },

  fetchNew(page = 1) {
    return fetchProviderFeed(
      STARDUST_BASE,
      '/new',
      'StardustTV',
      page,
      mapStardustLang(currentAppLang),
      { extraParams: { page_size: 15 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchHot(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchTerbaru(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      STARDUST_BASE,
      '/hot',
      'StardustTV',
      page,
      mapStardustLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 15 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      STARDUST_BASE,
      '/search',
      { keyword: trimmed, page, page_size: 20 },
      mapStardustLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'StardustTV'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      STARDUST_BASE,
      '/detail',
      { book_id: bookId },
      mapStardustLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'StardustTV', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      STARDUST_BASE,
      '/allepisode',
      { book_id: bookId },
      mapStardustLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('StardustTV', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: STARDUST_BASE,
      bookId,
      episode,
      provider: 'StardustTV',
      langVal: mapStardustLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 12: StarShort (9 Endpoints) ---
export const starShortProvider: DramaProviderAdapter & {
  fetchTrending: (page?: number) => Promise<PaginatedResult>;
  fetchBaru: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'StarShort',
  label: 'StarShort',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(STARSHORT_BASE, '/set_language', {
      lang: mapStarShortLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      STARSHORT_BASE,
      '/foryou',
      'StarShort',
      page,
      mapStarShortLang(currentAppLang),
      { extraParams: { pageSize: 20 } }
    );
  },

  fetchTrending(page = 1) {
    return fetchProviderFeed(
      STARSHORT_BASE,
      '/trending',
      'StarShort',
      page,
      mapStarShortLang(currentAppLang),
      { withRank: true, extraParams: { pageSize: 20 } }
    );
  },

  fetchBaru(page = 1) {
    return fetchProviderFeed(
      STARSHORT_BASE,
      '/baru',
      'StarShort',
      page,
      mapStarShortLang(currentAppLang),
      { extraParams: { pageSize: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchTrending(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchBaru(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      STARSHORT_BASE,
      '/vip',
      'StarShort',
      page,
      mapStarShortLang(currentAppLang),
      { forceVip: true, extraParams: { pageSize: 20 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      STARSHORT_BASE,
      '/search',
      { query: trimmed, page },
      mapStarShortLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'StarShort'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      STARSHORT_BASE,
      '/detail',
      { bookId },
      mapStarShortLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'StarShort', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      STARSHORT_BASE,
      '/allepisode',
      { bookId },
      mapStarShortLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('StarShort', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: STARSHORT_BASE,
      bookId,
      episode,
      provider: 'StarShort',
      langVal: mapStarShortLang(currentAppLang),
      idParam: 'bookId',
      epParam: 'episodeIndex',
      extra,
    });
  },
};

// --- Provider 13: DramaBite (6 Endpoints) ---
export const dramaBiteProvider: DramaProviderAdapter = {
  id: 'DramaBite',
  label: 'DramaBite',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(DRAMABITE_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      DRAMABITE_BASE,
      '/foryou',
      'DramaBite',
      page,
      mapIdEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      DRAMABITE_BASE,
      '/foryou',
      'DramaBite',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return this.fetchForYou(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      DRAMABITE_BASE,
      '/foryou',
      'DramaBite',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      DRAMABITE_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'DramaBite'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      DRAMABITE_BASE,
      '/detail',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'DramaBite', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      DRAMABITE_BASE,
      '/allepisode',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('DramaBite', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: DRAMABITE_BASE,
      bookId,
      episode,
      provider: 'DramaBite',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 14: LoveShots (9 Endpoints) ---
export const loveShotsProvider: DramaProviderAdapter & {
  fetchTrending: (page?: number) => Promise<PaginatedResult>;
  fetchNew: (page?: number) => Promise<PaginatedResult>;
  fetchRankings: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'LoveShots',
  label: 'LoveShots',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(LOVESHOTS_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      LOVESHOTS_BASE,
      '/foryou',
      'LoveShots',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchTrending(page = 1) {
    return fetchProviderFeed(
      LOVESHOTS_BASE,
      '/trending',
      'LoveShots',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 20 } }
    );
  },

  fetchNew(page = 1) {
    return fetchProviderFeed(
      LOVESHOTS_BASE,
      '/new',
      'LoveShots',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchRankings(page = 1) {
    return fetchProviderFeed(
      LOVESHOTS_BASE,
      '/rankings',
      'LoveShots',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchTrending(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchNew(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      LOVESHOTS_BASE,
      '/rankings',
      'LoveShots',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 20 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      LOVESHOTS_BASE,
      '/search',
      { keyword: trimmed, page, page_size: 20 },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'LoveShots'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(dramaId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      LOVESHOTS_BASE,
      '/detail',
      { drama_id: dramaId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'LoveShots', undefined, false, dramaId);
  },

  async fetchAllEpisodes(dramaId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      LOVESHOTS_BASE,
      '/allepisode',
      { drama_id: dramaId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('LoveShots', dramaId, eps);
    return eps;
  },

  fetchStream(
    dramaId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: LOVESHOTS_BASE,
      bookId: dramaId,
      episode,
      provider: 'LoveShots',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'drama_id',
      epParam: 'episode_index',
      extra,
    });
  },
};

// --- Provider 15: MyDrama (6 Endpoints) ---
export const myDramaProvider: DramaProviderAdapter = {
  id: 'MyDrama',
  label: 'MyDrama',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MYDRAMA_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      MYDRAMA_BASE,
      '/foryou',
      'MyDrama',
      page,
      mapIdEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      MYDRAMA_BASE,
      '/foryou',
      'MyDrama',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },

  fetchNewReleases(page = 1) {
    return this.fetchForYou(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      MYDRAMA_BASE,
      '/foryou',
      'MyDrama',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      MYDRAMA_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'MyDrama'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      MYDRAMA_BASE,
      '/detail',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'MyDrama', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      MYDRAMA_BASE,
      '/allepisode',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('MyDrama', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: MYDRAMA_BASE,
      bookId,
      episode,
      provider: 'MyDrama',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 16: ShotShort (7 Endpoints) ---
export const shotShortProvider: DramaProviderAdapter & {
  fetchTerbaru: (page?: number) => Promise<PaginatedResult>;
  fetchAllDrama: (page?: number, sortType?: number) => Promise<PaginatedResult>;
} = {
  id: 'ShotShort',
  label: 'ShotShort',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(SHOTSHORT_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchTerbaru(page = 1) {
    return fetchProviderFeed(
      SHOTSHORT_BASE,
      '/terbaru',
      'ShotShort',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { limit: 20 } }
    );
  },

  fetchAllDrama(page = 1, sortType = 1) {
    return fetchProviderFeed(
      SHOTSHORT_BASE,
      '/alldrama',
      'ShotShort',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { limit: 20, sort_type: sortType } }
    );
  },

  fetchForYou(page = 1) {
    return this.fetchTerbaru(page);
  },

  fetchRanking(page = 1) {
    return this.fetchAllDrama(page, 1);
  },

  fetchNewReleases(page = 1) {
    return this.fetchTerbaru(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      SHOTSHORT_BASE,
      '/alldrama',
      'ShotShort',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true, extraParams: { limit: 20, sort_type: 1 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      SHOTSHORT_BASE,
      '/search',
      { query: trimmed, page, limit: 20 },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'ShotShort'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      SHOTSHORT_BASE,
      '/detail',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'ShotShort', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      SHOTSHORT_BASE,
      '/allepisode',
      { book_id: bookId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('ShotShort', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ): Promise<StreamSource> {
    return requestStreamWithFallback({
      baseUrl: SHOTSHORT_BASE,
      bookId,
      episode,
      provider: 'ShotShort',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 17: MoboReels (11 Endpoints) ---
export const moboReelsProvider: DramaProviderAdapter & {
  fetchBaru: (page?: number) => Promise<PaginatedResult>;
  fetchAnimasi: (page?: number) => Promise<PaginatedResult>;
  fetchAsia: (page?: number) => Promise<PaginatedResult>;
  fetchOriginal: (page?: number) => Promise<PaginatedResult>;
  fetchSubtitleText: (
    bookId: string,
    episode: number,
    format?: 'vtt' | 'srt'
  ) => Promise<string>;
} = {
  id: 'MoboReels',
  label: 'MoboReels',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MOBOREELS_BASE, '/set_language', {
      lang: mapInEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/foryou',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchBaru(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/baru',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchAnimasi(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/animasi',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchAsia(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/asia',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchOriginal(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/original',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchOriginal(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchBaru(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      MOBOREELS_BASE,
      '/asia',
      'MoboReels',
      page,
      mapInEnLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 20 } }
    );
  },

  fetchAnime(page = 1) {
    return this.fetchAnimasi(page);
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      MOBOREELS_BASE,
      '/search',
      { keyword: trimmed, page },
      mapInEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'MoboReels'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      MOBOREELS_BASE,
      '/detail',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'MoboReels', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      MOBOREELS_BASE,
      '/allepisode',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('MoboReels', bookId, eps);
    return eps;
  },

  async fetchSubtitleText(
    bookId: string,
    episode: number,
    format: 'vtt' | 'srt' = 'vtt'
  ): Promise<string> {
    const url = getMoboReelsSubtitleUrl(bookId, episode, format);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`);
    return res.text();
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: MOBOREELS_BASE,
      bookId,
      episode,
      provider: 'MoboReels',
      langVal: mapInEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 18: BlinkDrama (9 Endpoints) ---
export const blinkDramaProvider: DramaProviderAdapter & {
  fetchAllDrama: (page?: number, classId?: number) => Promise<PaginatedResult>;
  fetchNew: (page?: number) => Promise<PaginatedResult>;
  fetchStreamPlain: (dramaId: string, episode: number) => Promise<StreamSource>;
} = {
  id: 'BlinkDrama',
  label: 'BlinkDrama',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(BLINKDRAMA_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      BLINKDRAMA_BASE,
      '/foryou',
      'BlinkDrama',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchAllDrama(page = 1, classId = 0) {
    return fetchProviderFeed(
      BLINKDRAMA_BASE,
      '/alldrama',
      'BlinkDrama',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 20, class_id: classId } }
    );
  },

  fetchNew(page = 1) {
    return fetchProviderFeed(
      BLINKDRAMA_BASE,
      '/new',
      'BlinkDrama',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return this.fetchAllDrama(page, 0);
  },

  fetchNewReleases(page = 1) {
    return this.fetchNew(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      BLINKDRAMA_BASE,
      '/alldrama',
      'BlinkDrama',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 20, class_id: 0 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      BLINKDRAMA_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'BlinkDrama'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(dramaId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      BLINKDRAMA_BASE,
      '/detail',
      { drama_id: dramaId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'BlinkDrama', undefined, false, dramaId);
  },

  async fetchAllEpisodes(dramaId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      BLINKDRAMA_BASE,
      '/allepisode',
      { drama_id: dramaId },
      mapIdEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('BlinkDrama', dramaId, eps);
    return eps;
  },

  async fetchStreamPlain(dramaId: string, episode: number) {
    const json = await requestProviderJson(
      BLINKDRAMA_BASE,
      '/stream_plain',
      { drama_id: dramaId, episode_index: episode },
      mapIdEnLang(currentAppLang)
    );
    return normalizeStream(json, dramaId, episode, 'BlinkDrama');
  },

  fetchStream(
    dramaId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ): Promise<StreamSource> {
    return requestStreamWithFallback({
      baseUrl: BLINKDRAMA_BASE,
      bookId: dramaId,
      episode,
      provider: 'BlinkDrama',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'drama_id',
      epParam: 'episode_index',
      extra,
      usePlainFallback: true,
    });
  },
};

// --- Shared Helpers for Cursor Feeds & stream_plain Fallback ---
const feedCursorCache = new Map<string, string>();

function extractCursorFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  const dataObj =
    obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : null;
  return cleanText(
    obj.next ??
      obj.nextCursor ??
      obj.next_cursor ??
      obj.cursor ??
      dataObj?.next ??
      dataObj?.nextCursor ??
      dataObj?.next_cursor ??
      dataObj?.cursor
  );
}

async function fetchStreamWithPlainFallback(
  baseUrl: string,
  bookId: string,
  episode: number,
  provider: ProviderName,
  langVal?: string,
  idParam = 'book_id',
  epParam = 'episode',
  extraParams: Record<string, string | number> = {}
): Promise<StreamSource> {
  const [encRes, plainRes] = await Promise.allSettled([
    requestProviderJson(
      baseUrl,
      '/stream',
      { [idParam]: bookId, [epParam]: episode, ...extraParams },
      langVal
    ),
    requestProviderJson(
      baseUrl,
      '/stream_plain',
      { [idParam]: bookId, [epParam]: episode, ...extraParams },
      langVal
    ),
  ]);

  let primary: StreamSource | null = null;
  if (encRes.status === 'fulfilled') {
    try {
      primary = normalizeStream(encRes.value, bookId, episode, provider);
    } catch {
      primary = null;
    }
  }

  let plain: StreamSource | null = null;
  if (plainRes.status === 'fulfilled') {
    try {
      plain = normalizeStream(plainRes.value, bookId, episode, provider);
    } catch {
      plain = null;
    }
  }

  if (plain && primary) {
    const mergedQualities: StreamQualityOption[] = [...plain.qualities];
    const seen = new Set(mergedQualities.map((q) => q.url));
    for (const q of primary.qualities) {
      if (!seen.has(q.url)) {
        seen.add(q.url);
        mergedQualities.push({
          quality: `${q.quality} (AES)`,
          url: q.url,
        });
      }
    }
    return {
      ...plain,
      qualities: mergedQualities,
      subtitles: plain.subtitles ?? primary.subtitles,
    };
  }

  if (plain) return plain;
  if (primary) return primary;

  throw new Error(`No playable stream returned by ${provider} for EP ${episode}.`);
}

function createStandardProvider(config: {
  id: ProviderName;
  label?: string;
  baseUrl: string;
  langFn: (lang: LanguageCode) => string;
  forYouPath?: string;
  rankingPath?: string;
  newestPath?: string;
  vipPath?: string;
  searchKey?: 'keyword' | 'query';
  idParam?: string;
  epParam?: string;
  extraFeedParams?: Record<string, string | number>;
  rankingExtraParams?: Record<string, string | number>;
  usePlainFallback?: boolean;
}): DramaProviderAdapter {
  const {
    id,
    label = id,
    baseUrl,
    langFn,
    forYouPath = '/foryou',
    rankingPath = forYouPath,
    newestPath = forYouPath,
    vipPath = rankingPath,
    searchKey = 'keyword',
    idParam = 'book_id',
    epParam = 'episode',
    extraFeedParams = {},
    rankingExtraParams = {},
    usePlainFallback = false,
  } = config;

  return {
    id,
    label,
    enabled: true,

    async setLanguage(lang: LanguageCode): Promise<void> {
      currentAppLang = lang;
      await requestProviderJson(baseUrl, '/set_language', {
        lang: langFn(lang),
      });
    },

    fetchForYou(page = 1) {
      return fetchProviderFeed(baseUrl, forYouPath, id, page, langFn(currentAppLang), {
        extraParams: extraFeedParams,
      });
    },

    fetchRanking(page = 1) {
      return fetchProviderFeed(baseUrl, rankingPath, id, page, langFn(currentAppLang), {
        withRank: true,
        extraParams: { ...extraFeedParams, ...rankingExtraParams },
      });
    },

    fetchNewReleases(page = 1) {
      return fetchProviderFeed(baseUrl, newestPath, id, page, langFn(currentAppLang), {
        extraParams: extraFeedParams,
      });
    },

    fetchVip(page = 1) {
      return fetchProviderFeed(baseUrl, vipPath, id, page, langFn(currentAppLang), {
        forceVip: true,
        extraParams: extraFeedParams,
      });
    },

    async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
      const trimmed = keyword.trim();
      if (!trimmed) return { items: [], hasMore: false, page };
      const json = await requestProviderJson(
        baseUrl,
        '/search',
        { [searchKey]: trimmed, page, ...extraFeedParams },
        langFn(currentAppLang)
      );
      const items = extractBookArray(json)
        .map((raw) => normalizeDrama(raw, id))
        .filter((d): d is DramaItem => d !== null);
      return { items, hasMore: items.length >= 10, page };
    },

    async fetchDetail(bookId: string): Promise<DramaItem | null> {
      const json = await requestProviderJson<Record<string, unknown>>(
        baseUrl,
        '/detail',
        { [idParam]: bookId },
        langFn(currentAppLang)
      );
      const raw =
        json?.data && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : json;
      return normalizeDrama(raw, id, undefined, false, bookId);
    },

    async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
      const json = await requestProviderJson(
        baseUrl,
        '/allepisode',
        { [idParam]: bookId },
        langFn(currentAppLang)
      );
      const eps = normalizeEpisodeList(json);
      cacheEpisodes(id, bookId, eps);
      return eps;
    },

    fetchStream(
      bookId: string,
      episode: number,
      extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
    ): Promise<StreamSource> {
      return requestStreamWithFallback({
        baseUrl,
        bookId,
        episode,
        provider: id,
        langVal: langFn(currentAppLang),
        idParam,
        epParam,
        extra,
        usePlainFallback,
      });
    },
  };
}

// --- Provider 19: WeTV (6 Endpoints) ---
export const weTvProvider = createStandardProvider({
  id: 'WeTV',
  baseUrl: WETV_BASE,
  langFn: mapIdEnLang,
});

// --- Provider 20: CubeTV (8 Endpoints) ---
export const cubeTvProvider: DramaProviderAdapter & {
  fetchHot: (page?: number) => Promise<PaginatedResult>;
  fetchNewRelease: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'CubeTV',
    baseUrl: CUBETV_BASE,
    langFn: mapCubeTvLang,
    rankingPath: '/hot',
    newestPath: '/newrelease',
    vipPath: '/hot',
  }),
  fetchHot(page = 1) {
    return fetchProviderFeed(CUBETV_BASE, '/hot', 'CubeTV', page, mapCubeTvLang(currentAppLang), {
      withRank: true,
    });
  },
  fetchNewRelease(page = 1) {
    return fetchProviderFeed(CUBETV_BASE, '/newrelease', 'CubeTV', page, mapCubeTvLang(currentAppLang));
  },
};

// --- Provider 21: MicroDrama (6 Endpoints) ---
export const microDramaProvider = createStandardProvider({
  id: 'MicroDrama',
  baseUrl: MICRODRAMA_BASE,
  langFn: mapInEnLang,
});

// --- Provider 22: FlareFlow (7 Endpoints) ---
export const flareFlowProvider: DramaProviderAdapter & {
  fetchAllDrama: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'FlareFlow',
    baseUrl: FLAREFLOW_BASE,
    langFn: mapIdEnLang,
    rankingPath: '/alldrama',
    vipPath: '/alldrama',
    idParam: 'drama_id',
    epParam: 'episode_index',
    extraFeedParams: { page_size: 20 },
  }),
  fetchAllDrama(page = 1) {
    return fetchProviderFeed(
      FLAREFLOW_BASE,
      '/alldrama',
      'FlareFlow',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },
};

// --- Provider 23: FunDrama (6 Endpoints) ---
export const funDramaProvider = createStandardProvider({
  id: 'FunDrama',
  baseUrl: FUNDRAMA_BASE,
  langFn: mapInEnLang,
});

// --- Provider 24: FreeShort (9 Endpoints) ---
export const freeShortProvider: DramaProviderAdapter & {
  fetchNew: (page?: number) => Promise<PaginatedResult>;
  fetchHot: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'FreeShort',
    baseUrl: FREESHORT_BASE,
    langFn: mapIdEnLang,
    rankingPath: '/ranking',
    newestPath: '/new',
    vipPath: '/hot',
    extraFeedParams: { limit: 20 },
  }),
  fetchNew(page = 1) {
    return fetchProviderFeed(
      FREESHORT_BASE,
      '/new',
      'FreeShort',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { limit: 20 } }
    );
  },
  fetchHot(page = 1) {
    return fetchProviderFeed(
      FREESHORT_BASE,
      '/hot',
      'FreeShort',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { limit: 20 } }
    );
  },
};

// --- Provider 25: ToonShort (7 Endpoints) ---
export const toonShortProvider: DramaProviderAdapter & {
  fetchPopular: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'ToonShort',
    baseUrl: TOONSHORT_BASE,
    langFn: mapIdEnLang,
    rankingPath: '/popular',
    vipPath: '/popular',
  }),
  fetchPopular(page = 1) {
    return fetchProviderFeed(
      TOONSHORT_BASE,
      '/popular',
      'ToonShort',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },
};

// --- Provider 26: HappyShort (10 Endpoints) ---
export const happyShortProvider: DramaProviderAdapter & {
  fetchTrending: (page?: number) => Promise<PaginatedResult>;
  fetchPopular: (page?: number) => Promise<PaginatedResult>;
  fetchTerbaru: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'HappyShort',
    baseUrl: HAPPYSHORT_BASE,
    langFn: mapIdEnLang,
    rankingPath: '/ranking',
    newestPath: '/terbaru',
    vipPath: '/popular',
  }),
  fetchTrending(page = 1) {
    return fetchProviderFeed(
      HAPPYSHORT_BASE,
      '/trending',
      'HappyShort',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true }
    );
  },
  fetchPopular(page = 1) {
    return fetchProviderFeed(
      HAPPYSHORT_BASE,
      '/popular',
      'HappyShort',
      page,
      mapIdEnLang(currentAppLang)
    );
  },
  fetchTerbaru(page = 1) {
    return fetchProviderFeed(
      HAPPYSHORT_BASE,
      '/terbaru',
      'HappyShort',
      page,
      mapIdEnLang(currentAppLang)
    );
  },
};

// --- Provider 27: DramaDash (7 Endpoints) ---
export const dramaDashProvider = createStandardProvider({
  id: 'DramaDash',
  baseUrl: DRAMADASH_BASE,
  langFn: mapIdEnLang,
  rankingPath: '/trending',
  vipPath: '/trending',
  searchKey: 'query',
  idParam: 'bookId',
  epParam: 'episodeIndex',
  extraFeedParams: { pageSize: 10 },
});

// --- Providers 28-29: StoryReel V2 & VibeShort V2 (with stream_plain) ---
export const storyReelV2Provider = createStandardProvider({
  id: 'StoryReelV2',
  label: 'StoryReel V2',
  baseUrl: STORYREEL_V2_BASE,
  langFn: mapIdEnLang,
  rankingPath: '/all',
  newestPath: '/terbaru',
  vipPath: '/all',
  usePlainFallback: true,
});

export const vibeShortV2Provider = createStandardProvider({
  id: 'VibeShortV2',
  label: 'VibeShort V2',
  baseUrl: VIBESHORT_V2_BASE,
  langFn: mapIdEnLang,
  rankingPath: '/all',
  newestPath: '/terbaru',
  vipPath: '/all',
  usePlainFallback: true,
});

// --- Provider 32: FlickReels (7 Endpoints) ---
export const flickReelsProvider: DramaProviderAdapter & {
  fetchAllDrama: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'FlickReels',
    baseUrl: FLICKREELS_BASE,
    langFn: mapFlickReelsLang,
    rankingPath: '/alldrama',
    vipPath: '/alldrama',
  }),
  fetchAllDrama(page = 1) {
    return fetchProviderFeed(
      FLICKREELS_BASE,
      '/alldrama',
      'FlickReels',
      page,
      mapFlickReelsLang(currentAppLang)
    );
  },
};

// --- Provider 33: DramaWave (8 Endpoints) ---
export const dramaWaveProvider: DramaProviderAdapter & {
  fetchExclusive: (page?: number) => Promise<PaginatedResult>;
} = {
  ...createStandardProvider({
    id: 'DramaWave',
    baseUrl: DRAMAWAVE_BASE,
    langFn: mapDramaWaveLang,
    rankingPath: '/exclusive',
    newestPath: '/foryou',
    vipPath: '/vip',
  }),
  fetchExclusive(page = 1) {
    return fetchProviderFeed(
      DRAMAWAVE_BASE,
      '/exclusive',
      'DramaWave',
      page,
      mapDramaWaveLang(currentAppLang),
      { withRank: true }
    );
  },
};

// --- Provider 34: FreeReels (Root set_language + Cursor Pagination) ---
async function fetchFreeReelsCursorFeed(
  endpoint: string,
  page: number,
  options: {
    withRank?: boolean;
    forceVip?: boolean;
    extraParams?: Record<string, string | number>;
  } = {}
): Promise<PaginatedResult> {
  const langVal = mapDramaWaveLang(currentAppLang);
  const cursorKey = `FreeReels:${endpoint}:${langVal}:${options.extraParams?.keyword ?? ''}`;
  const params: Record<string, string | number> = {
    ...(options.extraParams ?? {}),
  };
  if (page > 1) {
    const storedNext = feedCursorCache.get(`${cursorKey}:p${page}`);
    if (!storedNext) {
      return { items: [], hasMore: false, page };
    }
    params.next = storedNext;
  }

  const json = await requestProviderJson<Record<string, unknown>>(
    FREEREELS_BASE,
    endpoint,
    params,
    langVal
  );
  const rawList = extractBookArray(json);
  const nextCursor = extractCursorFromPayload(json);
  if (nextCursor) {
    feedCursorCache.set(`${cursorKey}:p${page + 1}`, nextCursor);
  }
  const apiHasMore =
    typeof json?.hasMore === 'boolean' ? json.hasMore : Boolean(nextCursor);

  const items: DramaItem[] = [];
  const seen = new Set<string>();
  rawList.forEach((raw, idx) => {
    const item = normalizeDrama(
      raw,
      'FreeReels',
      options.withRank ? (page - 1) * 10 + idx : undefined,
      options.forceVip
    );
    if (item && !seen.has(item.bookId)) {
      seen.add(item.bookId);
      items.push(item);
    }
  });

  return { items, hasMore: apiHasMore && Boolean(nextCursor), page };
}

export const freeReelsProvider: DramaProviderAdapter = {
  id: 'FreeReels',
  label: 'FreeReels',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MOLATV_BASE, '/freereels_set_language', {
      lang: mapDramaWaveLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchFreeReelsCursorFeed('/foryou', page);
  },

  fetchRanking(page = 1) {
    return fetchFreeReelsCursorFeed('/popular', page, { withRank: true });
  },

  fetchNewReleases(page = 1) {
    return fetchFreeReelsCursorFeed('/terbaru', page);
  },

  fetchVip(page = 1) {
    return fetchFreeReelsCursorFeed('/popular', page, { forceVip: true });
  },

  fetchAnime(page = 1) {
    return fetchFreeReelsCursorFeed('/anime', page);
  },

  fetchDubbing(page = 1) {
    return fetchFreeReelsCursorFeed('/dubbing', page);
  },

  searchDramas(keyword: string, page = 1) {
    const trimmed = keyword.trim();
    if (!trimmed) return Promise.resolve({ items: [], hasMore: false, page });
    return fetchFreeReelsCursorFeed('/search', page, {
      extraParams: { keyword: trimmed },
    });
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      FREEREELS_BASE,
      '/detail',
      { book_id: bookId },
      mapDramaWaveLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'FreeReels', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      FREEREELS_BASE,
      '/allepisode',
      { book_id: bookId },
      mapDramaWaveLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('FreeReels', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: FREEREELS_BASE,
      bookId,
      episode,
      provider: 'FreeReels',
      langVal: mapDramaWaveLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 35: PineDrama (Root pinedrama_set_language) ---
export const pineDramaProvider: DramaProviderAdapter = {
  ...createStandardProvider({
    id: 'PineDrama',
    baseUrl: PINEDRAMA_BASE,
    langFn: mapIdEnLang,
  }),
  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MOLATV_BASE, '/pinedrama_set_language', {
      lang: mapIdEnLang(lang),
    });
  },
};

// --- Provider 36: ShortMax V2 (with stream_plain) ---
export const shortMaxV2Provider = createStandardProvider({
  id: 'ShortMaxV2',
  label: 'ShortMax V2',
  baseUrl: SHORTMAX_V2_BASE,
  langFn: mapIdEnLang,
  rankingPath: '/all',
  newestPath: '/terbaru',
  vipPath: '/all',
  usePlainFallback: true,
});

// --- Provider 38: FlexTV (6 Endpoints) ---
export const flexTvProvider = createStandardProvider({
  id: 'FlexTV',
  baseUrl: FLEXTV_BASE,
  langFn: mapIdEnLang,
});

// --- Provider 39: Vigloo (Ranking, Browse with Cursor, Browse Filters) ---
export const viglooProvider: DramaProviderAdapter & {
  fetchBrowse: (page?: number, sortType?: string) => Promise<PaginatedResult>;
  fetchBrowseFilters: () => Promise<unknown>;
} = {
  ...createStandardProvider({
    id: 'Vigloo',
    baseUrl: VIGLOO_BASE,
    langFn: mapInEnLang,
    rankingPath: '/ranking',
    rankingExtraParams: { per_page: 20 },
  }),

  async fetchBrowse(page = 1, sortType = 'POPULAR'): Promise<PaginatedResult> {
    const langVal = mapInEnLang(currentAppLang);
    const key = `Vigloo:browse:${sortType}:${langVal}`;
    const params: Record<string, string | number> = {
      sortType,
      limit: 30,
    };
    if (page > 1) {
      const nextCursor = feedCursorCache.get(`${key}:p${page}`);
      if (!nextCursor) return { items: [], hasMore: false, page };
      params.cursor = nextCursor;
    }
    const json = await requestProviderJson<Record<string, unknown>>(
      VIGLOO_BASE,
      '/browse',
      params,
      langVal
    );
    const nextCursor = extractCursorFromPayload(json);
    if (nextCursor) {
      feedCursorCache.set(`${key}:p${page + 1}`, nextCursor);
    }
    const rawList = extractBookArray(json);
    const items = rawList
      .map((raw) => normalizeDrama(raw, 'Vigloo'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: Boolean(nextCursor) || rawList.length >= 20, page };
  },

  fetchBrowseFilters() {
    return requestProviderJson(
      VIGLOO_BASE,
      '/browse_filters',
      {},
      mapInEnLang(currentAppLang)
    );
  },
};

// --- Provider 40: DotDrama (6 Endpoints) ---
export const dotDramaProvider = createStandardProvider({
  id: 'DotDrama',
  baseUrl: DOTDRAMA_BASE,
  langFn: mapInEnLang,
});

// --- Provider 41: iDrama V2 (Cursor + codec=h264) ---
function createIDramaProvider(
  id: 'iDramaV2',
  label: string,
  baseUrl: string
): DramaProviderAdapter {
  return {
    id,
    label,
    enabled: true,

    async setLanguage(lang: LanguageCode): Promise<void> {
      currentAppLang = lang;
      await requestProviderJson(baseUrl, '/set_language', {
        lang: mapIdEnLang(lang),
      });
    },

    async fetchForYou(page = 1): Promise<PaginatedResult> {
      const langVal = mapIdEnLang(currentAppLang);
      const cursorKey = `${id}:foryou:${langVal}`;
      const params: Record<string, string | number> = { page };
      if (page > 1) {
        const storedCursor = feedCursorCache.get(`${cursorKey}:p${page}`);
        if (storedCursor) {
          params.cursor = storedCursor;
        }
      }
      const json = await requestProviderJson(baseUrl, '/foryou', params, langVal);
      const nextCursor = extractCursorFromPayload(json);
      if (nextCursor) {
        feedCursorCache.set(`${cursorKey}:p${page + 1}`, nextCursor);
      }
      const rawList = extractBookArray(json);
      const items = rawList
        .map((raw) => normalizeDrama(raw, id))
        .filter((d): d is DramaItem => d !== null);
      return { items, hasMore: Boolean(nextCursor) || rawList.length >= 6, page };
    },

    fetchRanking(page = 1) {
      return this.fetchForYou(page);
    },

    fetchNewReleases(page = 1) {
      return this.fetchForYou(page);
    },

    fetchVip(page = 1) {
      return fetchProviderFeed(baseUrl, '/foryou', id, page, mapIdEnLang(currentAppLang), {
        forceVip: true,
      });
    },

    async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
      const trimmed = keyword.trim();
      if (!trimmed) return { items: [], hasMore: false, page };
      const json = await requestProviderJson(
        baseUrl,
        '/search',
        { keyword: trimmed, page, page_size: 20 },
        mapIdEnLang(currentAppLang)
      );
      const items = extractBookArray(json)
        .map((raw) => normalizeDrama(raw, id))
        .filter((d): d is DramaItem => d !== null);
      return { items, hasMore: items.length >= 10, page };
    },

    async fetchDetail(bookId: string): Promise<DramaItem | null> {
      const json = await requestProviderJson<Record<string, unknown>>(
        baseUrl,
        '/detail',
        { book_id: bookId },
        mapIdEnLang(currentAppLang)
      );
      const raw =
        json?.data && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : json;
      return normalizeDrama(raw, id, undefined, false, bookId);
    },

    async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
      const json = await requestProviderJson(
        baseUrl,
        '/allepisode',
        { book_id: bookId },
        mapIdEnLang(currentAppLang)
      );
      const eps = normalizeEpisodeList(json);
      cacheEpisodes(id, bookId, eps);
      return eps;
    },

    fetchStream(
      bookId: string,
      episode: number,
      extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
    ) {
      return requestStreamWithFallback({
        baseUrl,
        bookId,
        episode,
        provider: id,
        langVal: mapIdEnLang(currentAppLang),
        idParam: 'book_id',
        epParam: 'episode',
        extra,
        extraParams: { codec: 'h264' },
      });
    },
  };
}

export const iDramaV2Provider = createIDramaProvider(
  'iDramaV2',
  'iDrama V2',
  IDRAMA_V2_BASE
);

// --- Provider 43: GoodShort (9 Endpoints: tren, terbaru, anime, dubbing, episode_index) ---
export const goodShortProvider: DramaProviderAdapter = {
  id: 'GoodShort',
  label: 'GoodShort',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(GOODSHORT_BASE, '/set_language', {
      lang: mapInEnLang(lang),
    });
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/tren',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/tren',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 20 } }
    );
  },

  fetchNewReleases(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/terbaru',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/tren',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 20 } }
    );
  },

  fetchAnime(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/anime',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  fetchDubbing(page = 1) {
    return fetchProviderFeed(
      GOODSHORT_BASE,
      '/dubbing',
      'GoodShort',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 20 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      GOODSHORT_BASE,
      '/search',
      { keyword: trimmed, page, page_size: 20 },
      mapInEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'GoodShort'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      GOODSHORT_BASE,
      '/detail',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'GoodShort', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      GOODSHORT_BASE,
      '/allepisode',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('GoodShort', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: GOODSHORT_BASE,
      bookId,
      episode,
      provider: 'GoodShort',
      langVal: mapInEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode_index',
      extra,
    });
  },
};

// --- Provider 44: ReelShort V2 ---
export const reelShortV2Provider = createStandardProvider({
  id: 'ReelShortV2',
  label: 'ReelShort V2',
  baseUrl: REELSHORT_V2_BASE,
  langFn: mapIdEnLang,
});

// --- Provider 46: JoyReels (10 Endpoints, playlet_id, episodes from /detail) ---
export const joyReelsProvider: DramaProviderAdapter & {
  fetchHot: (page?: number) => Promise<PaginatedResult>;
  fetchNew: (page?: number) => Promise<PaginatedResult>;
  fetchRank: (page?: number, sort?: string) => Promise<PaginatedResult>;
  fetchFilm: (page?: number) => Promise<PaginatedResult>;
  fetchAsia: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'JoyReels',
  label: 'JoyReels',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(JOYREELS_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchHot(page = 1) {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/hot',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchNew(page = 1) {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/new',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchRank(page = 1, sort = 'weekly') {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/rank',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { per_page: 20, sort } }
    );
  },

  fetchFilm(page = 1) {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/film',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchAsia(page = 1) {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/asia',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchForYou(page = 1) {
    return this.fetchHot(page);
  },

  fetchRanking(page = 1) {
    return this.fetchRank(page, 'weekly');
  },

  fetchNewReleases(page = 1) {
    return this.fetchNew(page);
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      JOYREELS_BASE,
      '/film',
      'JoyReels',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true, extraParams: { per_page: 20 } }
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      JOYREELS_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'JoyReels'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(playletId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      JOYREELS_BASE,
      '/detail',
      { playlet_id: playletId },
      mapIdEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'JoyReels', undefined, false, playletId);
  },

  async fetchAllEpisodes(playletId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson<Record<string, unknown>>(
      JOYREELS_BASE,
      '/detail',
      { playlet_id: playletId },
      mapIdEnLang(currentAppLang)
    );
    const list = normalizeEpisodeList(json);
    if (list.length > 0) {
      cacheEpisodes('JoyReels', playletId, list);
      return list;
    }

    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    const total = toPositiveNumber(
      raw?.chapterCount ?? raw?.totalEpisodes ?? raw?.episodeCount ?? raw?.episode_count,
      1
    );
    const generated = Array.from({ length: total }, (_, idx) => {
      const epNum = idx + 1;
      return {
        chapterId: `ep-${epNum}`,
        episodeNumber: epNum,
        chapterIndex0: idx,
        title: `EP ${epNum}`,
        isVipLocked: epNum > 10 && epNum === 11,
      };
    });
    cacheEpisodes('JoyReels', playletId, generated);
    return generated;
  },

  fetchStream(
    playletId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: JOYREELS_BASE,
      bookId: playletId,
      episode,
      provider: 'JoyReels',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'playlet_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 47: SodaReels (6 Endpoints) ---
export const sodaReelsProvider = createStandardProvider({
  id: 'SodaReels',
  baseUrl: SODAREELS_BASE,
  langFn: mapInEnLang,
});

// --- Provider 48: BonusTV (6 Endpoints) ---
export const bonusTvProvider = createStandardProvider({
  id: 'BonusTV',
  baseUrl: BONUSTV_BASE,
  langFn: mapIdEnLang,
});

// --- Provider 49: iQIYI (11 Endpoints, album_id, metadata in /allepisode) ---
export const iqiyiProvider: DramaProviderAdapter & {
  fetchRecomendasi: (page?: number) => Promise<PaginatedResult>;
  fetchVipList: (page?: number) => Promise<PaginatedResult>;
  fetchDrama: (page?: number) => Promise<PaginatedResult>;
  fetchFilm: (page?: number) => Promise<PaginatedResult>;
  fetchKdrama: (page?: number) => Promise<PaginatedResult>;
  fetchOverdo: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'iQIYI',
  label: 'iQIYI',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(IQIYI_BASE, '/set_language', {
      lang: mapIdEnLang(lang),
    });
  },

  fetchRecomendasi(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/recomendasi',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchVipList(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/vip',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { forceVip: true, extraParams: { per_page: 20 } }
    );
  },

  fetchDrama(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/drama',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { withRank: true, extraParams: { per_page: 20 } }
    );
  },

  fetchFilm(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/film',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchKdrama(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/kdrama',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchAnime(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/anime',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchOverdo(page = 1) {
    return fetchProviderFeed(
      IQIYI_BASE,
      '/overdo',
      'iQIYI',
      page,
      mapIdEnLang(currentAppLang),
      { extraParams: { per_page: 20 } }
    );
  },

  fetchForYou(page = 1) {
    return this.fetchRecomendasi(page);
  },

  fetchRanking(page = 1) {
    return this.fetchDrama(page);
  },

  fetchNewReleases(page = 1) {
    return this.fetchFilm(page);
  },

  fetchVip(page = 1) {
    return this.fetchVipList(page);
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      IQIYI_BASE,
      '/search',
      { keyword: trimmed, page },
      mapIdEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'iQIYI'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: items.length >= 10, page };
  },

  async fetchDetail(albumId: string): Promise<DramaItem | null> {
    try {
      const json = await requestProviderJson<Record<string, unknown>>(
        IQIYI_BASE,
        '/allepisode',
        { album_id: albumId },
        mapIdEnLang(currentAppLang)
      );
      const raw =
        json?.data && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : json;
      const parsed = normalizeDrama(raw, 'iQIYI', undefined, false, albumId);
      if (parsed) return parsed;
    } catch {
      // Fallback below
    }
    try {
      const json = await requestProviderJson<Record<string, unknown>>(
        IQIYI_BASE,
        '/detail',
        { album_id: albumId },
        mapIdEnLang(currentAppLang)
      );
      const raw =
        json?.data && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : json;
      return normalizeDrama(raw, 'iQIYI', undefined, false, albumId);
    } catch {
      return null;
    }
  },

  async fetchAllEpisodes(albumId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson<Record<string, unknown>>(
      IQIYI_BASE,
      '/allepisode',
      { album_id: albumId },
      mapIdEnLang(currentAppLang)
    );
    const list = normalizeEpisodeList(json);
    if (list.length > 0) {
      cacheEpisodes('iQIYI', albumId, list);
      return list;
    }

    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    const rawTitle = cleanText(
      raw?.bookName ?? raw?.title ?? raw?.name,
      ''
    );
    const epHint = rawTitle.match(/(\d+)\s*Episode/i);
    const total = toPositiveNumber(
      raw?.chapterCount ??
        raw?.totalEpisodes ??
        raw?.episodeCount ??
        raw?.episode_count ??
        (epHint ? Number(epHint[1]) : 1),
      1
    );
    const generated = Array.from({ length: total }, (_, idx) => {
      const epNum = idx + 1;
      return {
        chapterId: `ep-${epNum}`,
        episodeNumber: epNum,
        chapterIndex0: idx,
        title: `EP ${epNum}`,
        isVipLocked: epNum > 10 && epNum === 11,
      };
    });
    cacheEpisodes('iQIYI', albumId, generated);
    return generated;
  },

  fetchStream(
    albumId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: IQIYI_BASE,
      bookId: albumId,
      episode,
      provider: 'iQIYI',
      langVal: mapIdEnLang(currentAppLang),
      idParam: 'album_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Provider 4B: MeloLo V2 Adapter ---
export const meloLoV2Provider: DramaProviderAdapter & {
  fetchAllDrama: (page?: number) => Promise<PaginatedResult>;
} = {
  id: 'MeloLoV2',
  label: 'MeloLo V2',
  enabled: true,

  async setLanguage(lang: LanguageCode): Promise<void> {
    currentAppLang = lang;
    await requestProviderJson(MELOLO_V2_BASE, '/set_language', {
      lang: mapInEnLang(lang),
    }).catch(() => {});
  },

  fetchForYou(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/foryou',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang)
    );
  },

  fetchRanking(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/rank',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang),
      { withRank: true, extraParams: { page_size: 18 } }
    );
  },

  fetchNewReleases(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/new_release',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 10 } }
    );
  },

  fetchAllDrama(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/all_drama',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang),
      { extraParams: { page_size: 10 } }
    );
  },

  fetchVip(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/rank',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang),
      { forceVip: true, extraParams: { page_size: 18 } }
    );
  },

  fetchAnime(page = 1) {
    return fetchProviderFeed(
      MELOLO_V2_BASE,
      '/anime',
      'MeloLoV2',
      page,
      mapInEnLang(currentAppLang)
    );
  },

  async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
    const trimmed = keyword.trim();
    if (!trimmed) return { items: [], hasMore: false, page };
    const json = await requestProviderJson(
      MELOLO_V2_BASE,
      '/search',
      { keyword: trimmed },
      mapInEnLang(currentAppLang)
    );
    const items = extractBookArray(json)
      .map((raw) => normalizeDrama(raw, 'MeloLoV2'))
      .filter((d): d is DramaItem => d !== null);
    return { items, hasMore: false, page };
  },

  async fetchDetail(bookId: string): Promise<DramaItem | null> {
    const json = await requestProviderJson<Record<string, unknown>>(
      MELOLO_V2_BASE,
      '/detail',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const raw =
      json?.data && typeof json.data === 'object'
        ? (json.data as Record<string, unknown>)
        : json;
    return normalizeDrama(raw, 'MeloLoV2', undefined, false, bookId);
  },

  async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
    const json = await requestProviderJson(
      MELOLO_V2_BASE,
      '/allepisode',
      { book_id: bookId },
      mapInEnLang(currentAppLang)
    );
    const eps = normalizeEpisodeList(json);
    cacheEpisodes('MeloLoV2', bookId, eps);
    return eps;
  },

  fetchStream(
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) {
    return requestStreamWithFallback({
      baseUrl: MELOLO_V2_BASE,
      bookId,
      episode,
      provider: 'MeloLoV2',
      langVal: mapInEnLang(currentAppLang),
      idParam: 'book_id',
      epParam: 'episode',
      extra,
    });
  },
};

// --- Resilient Multi-Convention Mola Provider Factory (Providers 52-89) ---
export function createResilientMolaProvider(config: {
  id: ProviderName;
  label?: string;
  baseUrl: string;
  langFn?: (lang: LanguageCode) => string;
  supportsAnime?: boolean;
  defaultPaths?: Partial<Record<'foryou' | 'ranking' | 'newest' | 'vip' | 'anime', string[]>>;
}): DramaProviderAdapter {
  const {
    id,
    label = id,
    baseUrl,
    langFn = mapIdEnLang,
    supportsAnime = false,
    defaultPaths = {},
  } = config;

  const discovered: {
    foryou?: string;
    ranking?: string;
    newest?: string;
    vip?: string;
    anime?: string;
    idParam?: string;
    epPath?: string;
    epParam?: string;
    searchKey?: string;
  } = {};

  const feedCandidates: Record<'foryou' | 'ranking' | 'newest' | 'vip' | 'anime', string[]> = {
    foryou: defaultPaths.foryou ?? ['/foryou', '/hot', '/popular', '/trending', '/alldrama', '/new', '/latest', '/home', '/all'],
    ranking: defaultPaths.ranking ?? ['/ranking', '/rank', '/trending', '/hot', '/popular', '/top', '/foryou'],
    newest: defaultPaths.newest ?? ['/terbaru', '/new', '/latest', '/new_release', '/newrelease', '/update', '/foryou'],
    vip: defaultPaths.vip ?? ['/vip', '/exclusive', '/premium', '/hot', '/foryou'],
    anime: defaultPaths.anime ?? ['/anime', '/donghua', '/foryou', '/latest', '/popular', '/all'],
  };

  async function tryFeedSlot(
    slot: 'foryou' | 'ranking' | 'newest' | 'vip' | 'anime',
    page: number,
    options: { withRank?: boolean; forceVip?: boolean } = {}
  ): Promise<PaginatedResult> {
    const langVal = langFn(currentAppLang);
    const cachedPath = discovered[slot];
    const candidates = cachedPath
      ? [cachedPath, ...feedCandidates[slot].filter((p) => p !== cachedPath)]
      : feedCandidates[slot];

    let lastError: unknown = null;
    for (const path of candidates) {
      try {
        const res = await fetchProviderFeed(baseUrl, path, id, page, langVal, options);
        if (res.items.length > 0 || path === candidates[candidates.length - 1]) {
          discovered[slot] = path;
          return res;
        }
      } catch (err) {
        if (isFatalProviderError(err)) throw err;
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { items: [], hasMore: false, page };
  }

  const idParamCandidates = ['book_id', 'drama_id', 'playlet_id', 'album_id', 'vid', 'bookId', 'id', 'slug'];
  const epParamCandidates = ['episode', 'episode_index', 'episodeIndex', 'ep'];
  const searchKeyCandidates = ['keyword', 'q', 'query'];
  const epPathCandidates = ['/allepisode', '/episodes', '/detail'];

  return {
    id,
    label,
    enabled: true,

    async setLanguage(lang: LanguageCode): Promise<void> {
      currentAppLang = lang;
      await requestProviderJson(baseUrl, '/set_language', {
        lang: langFn(lang),
      }).catch(() => {});
    },

    fetchForYou(page = 1) {
      return tryFeedSlot('foryou', page);
    },

    fetchRanking(page = 1) {
      return tryFeedSlot('ranking', page, { withRank: true });
    },

    fetchNewReleases(page = 1) {
      return tryFeedSlot('newest', page);
    },

    fetchVip(page = 1) {
      return tryFeedSlot('vip', page, { forceVip: true });
    },

    ...(supportsAnime
      ? {
          fetchAnime(page = 1) {
            return tryFeedSlot('anime', page);
          },
        }
      : {}),

    async searchDramas(keyword: string, page = 1): Promise<PaginatedResult> {
      const trimmed = keyword.trim();
      if (!trimmed) return { items: [], hasMore: false, page };
      const langVal = langFn(currentAppLang);
      const keys = discovered.searchKey
        ? [discovered.searchKey, ...searchKeyCandidates.filter((k) => k !== discovered.searchKey)]
        : searchKeyCandidates;
      for (const key of keys) {
        try {
          const json = await requestProviderJson(
            baseUrl,
            '/search',
            { [key]: trimmed, page },
            langVal
          );
          const items = extractBookArray(json)
            .map((raw) => normalizeDrama(raw, id))
            .filter((d): d is DramaItem => d !== null);
          if (items.length > 0) {
            discovered.searchKey = key;
            return { items, hasMore: items.length >= 10, page };
          }
        } catch (err) {
          if (isFatalProviderError(err)) throw err;
          // Try next search query parameter convention
        }
      }
      return { items: [], hasMore: false, page };
    },

    async fetchDetail(bookId: string): Promise<DramaItem | null> {
      const langVal = langFn(currentAppLang);
      const idParams = discovered.idParam
        ? [discovered.idParam, ...idParamCandidates.filter((k) => k !== discovered.idParam)]
        : idParamCandidates;
      for (const path of ['/detail', '/allepisode']) {
        for (const idParam of idParams) {
          try {
            const json = await requestProviderJson<Record<string, unknown>>(
              baseUrl,
              path,
              { [idParam]: bookId },
              langVal
            );
            const raw =
              json?.data && typeof json.data === 'object' && !Array.isArray(json.data)
                ? (json.data as Record<string, unknown>)
                : json;
            const parsed = normalizeDrama(raw, id, undefined, false, bookId);
            if (parsed) {
              discovered.idParam = idParam;
              return parsed;
            }
          } catch (err) {
            if (isFatalProviderError(err)) throw err;
            // Try next ID parameter convention
          }
        }
      }
      return null;
    },

    async fetchAllEpisodes(bookId: string): Promise<EpisodeItem[]> {
      const langVal = langFn(currentAppLang);
      const idParams = discovered.idParam
        ? [discovered.idParam, ...idParamCandidates.filter((k) => k !== discovered.idParam)]
        : idParamCandidates;
      const epPaths = discovered.epPath
        ? [discovered.epPath, ...epPathCandidates.filter((p) => p !== discovered.epPath)]
        : epPathCandidates;

      for (const epPath of epPaths) {
        for (const idParam of idParams) {
          try {
            const json = await requestProviderJson(
              baseUrl,
              epPath,
              { [idParam]: bookId },
              langVal
            );
            const eps = normalizeEpisodeList(json);
            if (eps.length > 0) {
              discovered.idParam = idParam;
              discovered.epPath = epPath;
              cacheEpisodes(id, bookId, eps);
              return eps;
            }
          } catch (err) {
            if (isFatalProviderError(err)) throw err;
            // Try next endpoint or parameter convention
          }
        }
      }
      return [];
    },

    async fetchStream(
      bookId: string,
      episode: number,
      extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
    ): Promise<StreamSource> {
      const langVal = langFn(currentAppLang);
      const idParams = discovered.idParam
        ? [discovered.idParam, ...idParamCandidates.filter((k) => k !== discovered.idParam)]
        : idParamCandidates;
      const epParams = discovered.epParam
        ? [discovered.epParam, ...epParamCandidates.filter((p) => p !== discovered.epParam)]
        : epParamCandidates;
      const meta = getCachedEpisodeMeta(id, bookId, episode);
      const rawChId = cleanText(extra?.chapterId ?? meta?.chapterId);
      const validChId = rawChId && !isSyntheticEpisodeId(rawChId) ? rawChId : '';
      const rawEid = cleanText(extra?.eid ?? meta?.eid);
      const validEid = rawEid && !isSyntheticEpisodeId(rawEid) ? rawEid : '';
      const epIdx0 =
        typeof extra?.chapterIndex0 === 'number'
          ? extra.chapterIndex0
          : meta?.chapterIndex0;

      let lastError: unknown = null;
      for (const idParam of idParams) {
        for (const epParam of epParams) {
          const epValues =
            typeof epIdx0 === 'number' && epIdx0 !== episode
              ? [episode, epIdx0]
              : [episode];
          for (const epVal of epValues) {
            for (const path of ['/stream', '/stream_plain'] as const) {
              try {
                const params: Record<string, string | number> = {
                  [idParam]: bookId,
                  [epParam]: epVal,
                  ...(validChId ? { chapter_id: validChId } : {}),
                  ...(validEid ? { eid: validEid } : {}),
                };
                const json = await requestProviderJson(baseUrl, path, params, langVal);
                const stream = normalizeStream(json, bookId, episode, id);
                discovered.idParam = idParam;
                discovered.epParam = epParam;
                return stream;
              } catch (err) {
                if (isFatalProviderError(err)) throw err;
                lastError = err;
              }
            }
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`No playable stream returned by ${id} for EP ${episode}.`);
    },
  };
}

export const audioToonProvider = createResilientMolaProvider({ id: 'AudioToon', baseUrl: AUDIOTOON_BASE });
export const playletProvider = createResilientMolaProvider({ id: 'Playlet', baseUrl: PLAYLET_BASE });
export const momeShortProvider = createResilientMolaProvider({ id: 'MomeShort', baseUrl: MOMESHORT_BASE });
export const stoReelProvider = createResilientMolaProvider({ id: 'StoReel', baseUrl: STOREEL_BASE });
export const myMuseProvider = createResilientMolaProvider({ id: 'MyMuse', baseUrl: MYMUSE_BASE });
export const huangDouProvider = createResilientMolaProvider({ id: 'HuangDou', baseUrl: HUANGDOU_BASE });
export const moreShortProvider = createResilientMolaProvider({ id: 'MoreShort', baseUrl: MORESHORT_BASE });
export const dramaRushProvider = createResilientMolaProvider({ id: 'DramaRush', baseUrl: DRAMARUSH_BASE });
export const shortswaveProvider = createResilientMolaProvider({ id: 'Shortswave', baseUrl: SHORTSWAVE_BASE });
export const relalaProvider = createResilientMolaProvider({ id: 'Relala', baseUrl: RELALA_BASE });
export const sixthShortProvider = createResilientMolaProvider({ id: 'SixthShort', baseUrl: SIXTHSHORT_BASE });
export const snackShortProvider = createResilientMolaProvider({ id: 'SnackShort', baseUrl: SNACKSHORT_BASE });
export const soreelProvider = createResilientMolaProvider({ id: 'Soreel', baseUrl: SOREEL_BASE });
export const starReelProvider = createResilientMolaProvider({ id: 'StarReel', baseUrl: STARREEL_BASE });
export const storyGoProvider = createResilientMolaProvider({ id: 'StoryGo', baseUrl: STORYGO_BASE });
export const miniShortProvider = createResilientMolaProvider({ id: 'MiniShort', baseUrl: MINISHORT_BASE });
export const shortenProvider = createResilientMolaProvider({ id: 'Shorten', baseUrl: SHORTEN_BASE });
export const veloloProvider = createResilientMolaProvider({ id: 'Velolo', baseUrl: VELOLO_BASE });
export const reelPineProvider = createResilientMolaProvider({ id: 'ReelPine', baseUrl: REELPINE_BASE });
export const dynastyShortsProvider = createResilientMolaProvider({
  id: 'DynastyShorts',
  label: 'Dynasty Shorts',
  baseUrl: DYNASTYSHORTS_BASE,
});
export const dramaShortsProvider = createResilientMolaProvider({ id: 'DramaShorts', baseUrl: DRAMASHORTS_BASE });
export const tallFlixProvider = createResilientMolaProvider({ id: 'TallFlix', baseUrl: TALLFLIX_BASE });
export const qlaxProvider = createResilientMolaProvider({ id: 'Qlax', baseUrl: QLAX_BASE });
export const shorticalProvider = createResilientMolaProvider({ id: 'Shortical', baseUrl: SHORTICAL_BASE });
export const luziCineProvider = createResilientMolaProvider({ id: 'LuziCine', baseUrl: LUZICINE_BASE });
export const zebraShortProvider = createResilientMolaProvider({ id: 'ZebraShort', baseUrl: ZEBRASHORT_BASE });
export const drakorIdProvider = createResilientMolaProvider({ id: 'DrakorID', baseUrl: DRAKORID_BASE });
export const drachinRebornProvider = createResilientMolaProvider({ id: 'DrachinReborn', baseUrl: DRACHINREBORN_BASE });
export const dramaQueenProvider = createResilientMolaProvider({ id: 'DramaQueen', baseUrl: DRAMAQUEEN_BASE });
export const ansflixProvider = createResilientMolaProvider({ id: 'Ansflix', baseUrl: ANSFLIX_BASE });
export const lupaCineProvider = createResilientMolaProvider({ id: 'LupaCine', baseUrl: LUPACINE_BASE });
export const reelLifeProvider = createResilientMolaProvider({ id: 'ReelLife', baseUrl: REELLIFE_BASE });
export const bstationProvider = createResilientMolaProvider({
  id: 'Bstation',
  baseUrl: BSTATION_BASE,
  supportsAnime: true,
  defaultPaths: {
    foryou: ['/anime', '/foryou', '/popular', '/latest', '/trending'],
    ranking: ['/trending', '/ranking', '/popular', '/anime'],
    newest: ['/latest', '/terbaru', '/new', '/anime'],
    anime: ['/anime', '/donghua', '/foryou', '/popular', '/latest'],
  },
});
export const anichinProvider = createResilientMolaProvider({
  id: 'Anichin',
  baseUrl: ANICHIN_BASE,
  supportsAnime: true,
  defaultPaths: {
    foryou: ['/latest', '/ongoing', '/donghua', '/foryou', '/popular', '/all'],
    ranking: ['/popular', '/trending', '/ranking', '/latest'],
    newest: ['/latest', '/ongoing', '/terbaru', '/new'],
    anime: ['/donghua', '/anime', '/latest', '/ongoing', '/popular'],
  },
});
export const donghuaQueenProvider = createResilientMolaProvider({
  id: 'DonghuaQueen',
  baseUrl: DONGHUAQUEEN_BASE,
  supportsAnime: true,
  defaultPaths: {
    foryou: ['/latest', '/ongoing', '/donghua', '/foryou', '/popular', '/all'],
    ranking: ['/popular', '/trending', '/ranking', '/latest'],
    newest: ['/latest', '/ongoing', '/terbaru', '/new'],
    anime: ['/donghua', '/anime', '/latest', '/ongoing', '/popular'],
  },
});
export const samehadakuProvider = createResilientMolaProvider({
  id: 'Samehadaku',
  baseUrl: SAMEHADAKU_BASE,
  supportsAnime: true,
  defaultPaths: {
    foryou: ['/latest', '/ongoing', '/anime', '/foryou', '/popular', '/all'],
    ranking: ['/popular', '/trending', '/ranking', '/latest'],
    newest: ['/latest', '/ongoing', '/terbaru', '/new'],
    anime: ['/anime', '/latest', '/ongoing', '/popular'],
  },
});
export const animeXProvider = createResilientMolaProvider({
  id: 'AnimeX',
  baseUrl: ANIMEX_BASE,
  supportsAnime: true,
  defaultPaths: {
    foryou: ['/latest', '/ongoing', '/anime', '/foryou', '/popular', '/all'],
    ranking: ['/popular', '/trending', '/ranking', '/latest'],
    newest: ['/latest', '/ongoing', '/terbaru', '/new'],
    anime: ['/anime', '/latest', '/ongoing', '/popular'],
  },
});
export const winkNovelProvider = createResilientMolaProvider({
  id: 'WinkNovel',
  baseUrl: WINKNOVEL_BASE,
  defaultPaths: {
    foryou: ['/foryou', '/popular', '/trending', '/hot', '/latest', '/all'],
    ranking: ['/ranking', '/popular', '/trending', '/hot'],
    newest: ['/latest', '/terbaru', '/new', '/foryou'],
  },
});

export const ALL_PROVIDER_ADAPTERS: Record<ProviderName, DramaProviderAdapter> = {
  DramaBoxV2: dramaBoxV2Provider,
  NetShort: netShortProvider,
  AnyReel: anyReelProvider,
  MeloLoV2: meloLoV2Provider,
  DramaOra: dramaOraProvider,
  MeloShort: meloShortProvider,
  PetaDrama: petaDramaProvider,
  RadReels: radReelsProvider,
  DramaVerse: dramaVerseProvider,
  KalosTV: kalosTvProvider,
  StardustTV: stardustTvProvider,
  StarShort: starShortProvider,
  DramaBite: dramaBiteProvider,
  LoveShots: loveShotsProvider,
  MyDrama: myDramaProvider,
  ShotShort: shotShortProvider,
  MoboReels: moboReelsProvider,
  BlinkDrama: blinkDramaProvider,
  WeTV: weTvProvider,
  CubeTV: cubeTvProvider,
  MicroDrama: microDramaProvider,
  FlareFlow: flareFlowProvider,
  FunDrama: funDramaProvider,
  FreeShort: freeShortProvider,
  ToonShort: toonShortProvider,
  HappyShort: happyShortProvider,
  DramaDash: dramaDashProvider,
  StoryReelV2: storyReelV2Provider,
  VibeShortV2: vibeShortV2Provider,
  FlickReels: flickReelsProvider,
  DramaWave: dramaWaveProvider,
  FreeReels: freeReelsProvider,
  PineDrama: pineDramaProvider,
  ShortMaxV2: shortMaxV2Provider,
  FlexTV: flexTvProvider,
  Vigloo: viglooProvider,
  DotDrama: dotDramaProvider,
  iDramaV2: iDramaV2Provider,
  GoodShort: goodShortProvider,
  ReelShortV2: reelShortV2Provider,
  JoyReels: joyReelsProvider,
  SodaReels: sodaReelsProvider,
  BonusTV: bonusTvProvider,
  iQIYI: iqiyiProvider,
  AudioToon: audioToonProvider,
  Playlet: playletProvider,
  MomeShort: momeShortProvider,
  StoReel: stoReelProvider,
  MyMuse: myMuseProvider,
  HuangDou: huangDouProvider,
  MoreShort: moreShortProvider,
  DramaRush: dramaRushProvider,
  Shortswave: shortswaveProvider,
  Relala: relalaProvider,
  SixthShort: sixthShortProvider,
  SnackShort: snackShortProvider,
  Soreel: soreelProvider,
  StarReel: starReelProvider,
  StoryGo: storyGoProvider,
  MiniShort: miniShortProvider,
  Shorten: shortenProvider,
  Velolo: veloloProvider,
  ReelPine: reelPineProvider,
  DynastyShorts: dynastyShortsProvider,
  DramaShorts: dramaShortsProvider,
  TallFlix: tallFlixProvider,
  Qlax: qlaxProvider,
  Shortical: shorticalProvider,
  LuziCine: luziCineProvider,
  ZebraShort: zebraShortProvider,
  DrakorID: drakorIdProvider,
  DrachinReborn: drachinRebornProvider,
  DramaQueen: dramaQueenProvider,
  Ansflix: ansflixProvider,
  LupaCine: lupaCineProvider,
  ReelLife: reelLifeProvider,
  Bstation: bstationProvider,
  Anichin: anichinProvider,
  DonghuaQueen: donghuaQueenProvider,
  Samehadaku: samehadakuProvider,
  AnimeX: animeXProvider,
  WinkNovel: winkNovelProvider,
};

export const ACTIVE_PROVIDER_NAMES: ProviderName[] = [
  'DramaBoxV2',
  'NetShort',
  'AnyReel',
  'MeloLoV2',
  'DramaOra',
  'MeloShort',
  'PetaDrama',
  'RadReels',
  'DramaVerse',
  'KalosTV',
  'StardustTV',
  'StarShort',
  'DramaBite',
  'LoveShots',
  'MyDrama',
  'ShotShort',
  'MoboReels',
  'BlinkDrama',
  'WeTV',
  'CubeTV',
  'MicroDrama',
  'FlareFlow',
  'FunDrama',
  'FreeShort',
  'ToonShort',
  'HappyShort',
  'DramaDash',
  'StoryReelV2',
  'VibeShortV2',
  'FlickReels',
  'DramaWave',
  'FreeReels',
  'PineDrama',
  'ShortMaxV2',
  'FlexTV',
  'Vigloo',
  'DotDrama',
  'iDramaV2',
  'GoodShort',
  'ReelShortV2',
  'JoyReels',
  'SodaReels',
  'BonusTV',
  'iQIYI',
  'AudioToon',
  'Playlet',
  'MomeShort',
  'StoReel',
  'MyMuse',
  'HuangDou',
  'MoreShort',
  'DramaRush',
  'Shortswave',
  'Relala',
  'SixthShort',
  'SnackShort',
  'Soreel',
  'StarReel',
  'StoryGo',
  'MiniShort',
  'Shorten',
  'Velolo',
  'ReelPine',
  'DynastyShorts',
  'DramaShorts',
  'TallFlix',
  'Qlax',
  'Shortical',
  'LuziCine',
  'ZebraShort',
  'DrakorID',
  'DrachinReborn',
  'DramaQueen',
  'Ansflix',
  'LupaCine',
  'ReelLife',
  'Bstation',
  'Anichin',
  'DonghuaQueen',
  'Samehadaku',
  'AnimeX',
  'WinkNovel',
];

export function getProviderAdapter(provider: ProviderName): DramaProviderAdapter {
  return ALL_PROVIDER_ADAPTERS[provider] ?? dramaBoxV2Provider;
}

export async function getStreamUrl(
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2',
  extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
): Promise<StreamSource> {
  const key = streamKey(provider, bookId, episode);
  const cached = streamCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.promise;
  }

  const adapter = getProviderAdapter(provider);
  const promise = adapter.fetchStream(bookId, episode, extra).catch((err) => {
    streamCache.delete(key);
    throw err;
  });

  streamCache.set(key, {
    expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

export function prefetchStreamUrl(
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2',
  extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
): void {
  if (!bookId || episode < 1) return;
  if (isStreamCached(bookId, episode, provider)) return;
  getStreamUrl(bookId, episode, provider, extra).catch(() => {
    // Silent background prefetch
  });
}

/**
 * Synchronize language across all 82 active providers cleanly via the rate-limited queue
 */
export async function syncAllProvidersLanguage(
  lang: LanguageCode
): Promise<void> {
  currentAppLang = lang;
  await Promise.allSettled(
    ACTIVE_PROVIDER_NAMES.map((name) => ALL_PROVIDER_ADAPTERS[name].setLanguage(lang))
  );
}

/**
 * Cross-provider search across single selected provider or all 82 live providers (rate-limited)
 */
export async function searchAllProviders(
  keyword: string,
  page = 1,
  providerFilter: ProviderId = 'All'
): Promise<PaginatedResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { items: [], hasMore: false, page };

  if (providerFilter !== 'All') {
    try {
      return await getProviderAdapter(providerFilter).searchDramas(trimmed, page);
    } catch {
      return { items: [], hasMore: false, page };
    }
  }

  const settled = await Promise.allSettled(
    ACTIVE_PROVIDER_NAMES.map((name) =>
      ALL_PROVIDER_ADAPTERS[name].searchDramas(trimmed, page)
    )
  );

  const lists = settled.map((res) =>
    res.status === 'fulfilled' ? res.value.items : []
  );

  const merged: DramaItem[] = [];
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

  const hasMore = settled.some(
    (res) => res.status === 'fulfilled' && res.value.hasMore
  );

  return { items: merged, hasMore, page };
}

export const PROVIDER_FILTERS: {
  id: ProviderId;
  available: boolean;
}[] = [
  { id: 'All', available: true },
  ...ACTIVE_PROVIDER_NAMES.map((id) => ({ id, available: true })),
];

export interface ProviderEndpointSpec {
  key: string;
  label: string;
  path: string;
  ranked?: boolean;
  badgeStyle?: BadgeStyle;
  fetch: (page: number) => Promise<PaginatedResult>;
}

export const PROVIDER_ENDPOINT_CATALOG: Record<
  ProviderName,
  ProviderEndpointSpec[]
> = {
  DramaBoxV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaBoxV2Provider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => dramaBoxV2Provider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => dramaBoxV2Provider.fetchNewReleases(p) },
    { key: 'vip', label: 'VIP', path: '/vip', badgeStyle: 'VIP', fetch: (p) => dramaBoxV2Provider.fetchVip(p) },
    { key: 'dubbing', label: 'Dubbing', path: '/dubbing', badgeStyle: 'DUB', fetch: (p) => dramaBoxV2Provider.fetchDubbing!(p) },
  ],
  NetShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => netShortProvider.fetchForYou(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => netShortProvider.fetchRanking(p) },
    { key: 'all', label: 'All', path: '/all', badgeStyle: 'NEW', fetch: (p) => netShortProvider.fetchNewReleases(p) },
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => netShortProvider.fetchAnime!(p) },
  ],
  AnyReel: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => anyReelProvider.fetchForYou(p) },
    { key: 'asian', label: 'Asian', path: '/asian', ranked: true, fetch: (p) => anyReelProvider.fetchRanking(p) },
  ],
  MeloLoV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => meloLoV2Provider.fetchForYou(p) },
    { key: 'rank', label: 'Rank', path: '/rank', ranked: true, fetch: (p) => meloLoV2Provider.fetchRanking(p) },
    { key: 'new_release', label: 'New Release', path: '/new_release', badgeStyle: 'NEW', fetch: (p) => meloLoV2Provider.fetchNewReleases(p) },
    { key: 'all_drama', label: 'All Drama', path: '/all_drama', fetch: (p) => meloLoV2Provider.fetchAllDrama(p) },
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => meloLoV2Provider.fetchAnime!(p) },
  ],
  DramaOra: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaOraProvider.fetchForYou(p) },
    { key: 'category_dramas', label: 'Category', path: '/category_dramas', ranked: true, fetch: (p) => dramaOraProvider.fetchCategoryDramas(57819, p) },
  ],
  MeloShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => meloShortProvider.fetchForYou(p) },
    { key: 'recommend', label: 'Recommend', path: '/recommend', fetch: () => meloShortProvider.fetchRecommend(1) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => meloShortProvider.fetchRanking(p) },
  ],
  PetaDrama: [
    { key: 'alldrama', label: 'All Drama', path: '/alldrama', fetch: (p) => petaDramaProvider.fetchAllDrama(p, 50) },
    { key: 'category_dramas', label: 'Category', path: '/category_dramas', ranked: true, fetch: (p) => petaDramaProvider.fetchCategoryDramas(57819, p, 20) },
  ],
  RadReels: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => radReelsProvider.fetchForYou(p) },
    { key: 'baru', label: 'Baru', path: '/baru', badgeStyle: 'NEW', fetch: (p) => radReelsProvider.fetchBaru(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => radReelsProvider.fetchTrending(p) },
  ],
  DramaVerse: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaVerseProvider.fetchForYou(p) },
    { key: 'hot', label: 'Hot', path: '/hot', ranked: true, fetch: (p) => dramaVerseProvider.fetchHot(p) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => dramaVerseProvider.fetchNew(p) },
  ],
  KalosTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => kalosTvProvider.fetchForYou(p) },
  ],
  StardustTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => stardustTvProvider.fetchForYou(p) },
    { key: 'hot', label: 'Hot', path: '/hot', ranked: true, fetch: (p) => stardustTvProvider.fetchHot(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => stardustTvProvider.fetchTerbaru(p) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => stardustTvProvider.fetchNew(p) },
  ],
  StarShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => starShortProvider.fetchForYou(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => starShortProvider.fetchTrending(p) },
    { key: 'baru', label: 'Baru', path: '/baru', badgeStyle: 'NEW', fetch: (p) => starShortProvider.fetchBaru(p) },
    { key: 'vip', label: 'VIP', path: '/vip', badgeStyle: 'VIP', fetch: (p) => starShortProvider.fetchVip(p) },
  ],
  DramaBite: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaBiteProvider.fetchForYou(p) },
  ],
  LoveShots: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => loveShotsProvider.fetchForYou(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => loveShotsProvider.fetchTrending(p) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => loveShotsProvider.fetchNew(p) },
    { key: 'rankings', label: 'Rankings', path: '/rankings', ranked: true, fetch: (p) => loveShotsProvider.fetchRankings(p) },
  ],
  MyDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => myDramaProvider.fetchForYou(p) },
  ],
  ShotShort: [
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => shotShortProvider.fetchTerbaru(p) },
    { key: 'alldrama', label: 'All Drama', path: '/alldrama', ranked: true, fetch: (p) => shotShortProvider.fetchAllDrama(p, 1) },
  ],
  MoboReels: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => moboReelsProvider.fetchForYou(p) },
    { key: 'baru', label: 'Baru', path: '/baru', badgeStyle: 'NEW', fetch: (p) => moboReelsProvider.fetchBaru(p) },
    { key: 'animasi', label: 'Animasi', path: '/animasi', badgeStyle: 'ANIME', fetch: (p) => moboReelsProvider.fetchAnimasi(p) },
    { key: 'asia', label: 'Asia', path: '/asia', fetch: (p) => moboReelsProvider.fetchAsia(p) },
    { key: 'original', label: 'Original', path: '/original', ranked: true, fetch: (p) => moboReelsProvider.fetchOriginal(p) },
  ],
  BlinkDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => blinkDramaProvider.fetchForYou(p) },
    { key: 'alldrama', label: 'All Drama', path: '/alldrama', ranked: true, fetch: (p) => blinkDramaProvider.fetchAllDrama(p, 0) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => blinkDramaProvider.fetchNew(p) },
  ],
  WeTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => weTvProvider.fetchForYou(p) },
  ],
  CubeTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => cubeTvProvider.fetchForYou(p) },
    { key: 'hot', label: 'Hot', path: '/hot', ranked: true, fetch: (p) => cubeTvProvider.fetchHot(p) },
    { key: 'newrelease', label: 'New Release', path: '/newrelease', badgeStyle: 'NEW', fetch: (p) => cubeTvProvider.fetchNewRelease(p) },
  ],
  MicroDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => microDramaProvider.fetchForYou(p) },
  ],
  FlareFlow: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => flareFlowProvider.fetchForYou(p) },
    { key: 'alldrama', label: 'All Drama', path: '/alldrama', ranked: true, fetch: (p) => flareFlowProvider.fetchAllDrama(p) },
  ],
  FunDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => funDramaProvider.fetchForYou(p) },
  ],
  FreeShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => freeShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => freeShortProvider.fetchRanking(p) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => freeShortProvider.fetchNew(p) },
    { key: 'hot', label: 'Hot', path: '/hot', fetch: (p) => freeShortProvider.fetchHot(p) },
  ],
  ToonShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => toonShortProvider.fetchForYou(p) },
    { key: 'popular', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => toonShortProvider.fetchPopular(p) },
  ],
  HappyShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => happyShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => happyShortProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => happyShortProvider.fetchTerbaru(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => happyShortProvider.fetchTrending(p) },
    { key: 'popular', label: 'Popular', path: '/popular', fetch: (p) => happyShortProvider.fetchPopular(p) },
  ],
  DramaDash: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaDashProvider.fetchForYou(p) },
    { key: 'trending', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => dramaDashProvider.fetchRanking(p) },
  ],
  StoryReelV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => storyReelV2Provider.fetchForYou(p) },
    { key: 'all', label: 'All', path: '/all', ranked: true, fetch: (p) => storyReelV2Provider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => storyReelV2Provider.fetchNewReleases(p) },
  ],
  VibeShortV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => vibeShortV2Provider.fetchForYou(p) },
    { key: 'all', label: 'All', path: '/all', ranked: true, fetch: (p) => vibeShortV2Provider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => vibeShortV2Provider.fetchNewReleases(p) },
  ],
  FlickReels: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => flickReelsProvider.fetchForYou(p) },
    { key: 'alldrama', label: 'All Drama', path: '/alldrama', ranked: true, fetch: (p) => flickReelsProvider.fetchAllDrama(p) },
  ],
  DramaWave: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaWaveProvider.fetchForYou(p) },
    { key: 'exclusive', label: 'Exclusive', path: '/exclusive', ranked: true, fetch: (p) => dramaWaveProvider.fetchExclusive(p) },
    { key: 'vip', label: 'VIP', path: '/vip', badgeStyle: 'VIP', fetch: (p) => dramaWaveProvider.fetchVip(p) },
  ],
  FreeReels: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => freeReelsProvider.fetchForYou(p) },
    { key: 'popular', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => freeReelsProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => freeReelsProvider.fetchNewReleases(p) },
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => freeReelsProvider.fetchAnime!(p) },
    { key: 'dubbing', label: 'Dubbing', path: '/dubbing', badgeStyle: 'DUB', fetch: (p) => freeReelsProvider.fetchDubbing!(p) },
  ],
  PineDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => pineDramaProvider.fetchForYou(p) },
  ],
  ShortMaxV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => shortMaxV2Provider.fetchForYou(p) },
    { key: 'all', label: 'All', path: '/all', ranked: true, fetch: (p) => shortMaxV2Provider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => shortMaxV2Provider.fetchNewReleases(p) },
  ],
  FlexTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => flexTvProvider.fetchForYou(p) },
  ],
  Vigloo: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => viglooProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => viglooProvider.fetchRanking(p) },
    { key: 'browse', label: 'Browse', path: '/browse', fetch: (p) => viglooProvider.fetchBrowse(p, 'POPULAR') },
  ],
  DotDrama: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dotDramaProvider.fetchForYou(p) },
  ],
  iDramaV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => iDramaV2Provider.fetchForYou(p) },
  ],
  GoodShort: [
    { key: 'tren', label: 'Tren', path: '/tren', ranked: true, fetch: (p) => goodShortProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => goodShortProvider.fetchNewReleases(p) },
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => goodShortProvider.fetchAnime!(p) },
    { key: 'dubbing', label: 'Dubbing', path: '/dubbing', badgeStyle: 'DUB', fetch: (p) => goodShortProvider.fetchDubbing!(p) },
  ],
  ReelShortV2: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => reelShortV2Provider.fetchForYou(p) },
  ],
  JoyReels: [
    { key: 'hot', label: 'Hot', path: '/hot', fetch: (p) => joyReelsProvider.fetchHot(p) },
    { key: 'new', label: 'New', path: '/new', badgeStyle: 'NEW', fetch: (p) => joyReelsProvider.fetchNew(p) },
    { key: 'rank', label: 'Rank', path: '/rank', ranked: true, fetch: (p) => joyReelsProvider.fetchRank(p, 'weekly') },
    { key: 'film', label: 'Film', path: '/film', fetch: (p) => joyReelsProvider.fetchFilm(p) },
    { key: 'asia', label: 'Asia', path: '/asia', fetch: (p) => joyReelsProvider.fetchAsia(p) },
  ],
  SodaReels: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => sodaReelsProvider.fetchForYou(p) },
  ],
  BonusTV: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => bonusTvProvider.fetchForYou(p) },
  ],
  iQIYI: [
    { key: 'recomendasi', label: 'Recomendasi', path: '/recomendasi', fetch: (p) => iqiyiProvider.fetchRecomendasi(p) },
    { key: 'drama', label: 'Drama', path: '/drama', ranked: true, fetch: (p) => iqiyiProvider.fetchDrama(p) },
    { key: 'film', label: 'Film', path: '/film', fetch: (p) => iqiyiProvider.fetchFilm(p) },
    { key: 'kdrama', label: 'K-Drama', path: '/kdrama', fetch: (p) => iqiyiProvider.fetchKdrama(p) },
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => iqiyiProvider.fetchAnime!(p) },
    { key: 'overdo', label: 'Overdo', path: '/overdo', fetch: (p) => iqiyiProvider.fetchOverdo(p) },
    { key: 'vip', label: 'VIP', path: '/vip', badgeStyle: 'VIP', fetch: (p) => iqiyiProvider.fetchVipList(p) },
  ],
  AudioToon: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => audioToonProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Popular', path: '/ranking', ranked: true, fetch: (p) => audioToonProvider.fetchRanking(p) },
  ],
  Playlet: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => playletProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => playletProvider.fetchRanking(p) },
  ],
  MomeShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => momeShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => momeShortProvider.fetchRanking(p) },
  ],
  StoReel: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => stoReelProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => stoReelProvider.fetchRanking(p) },
  ],
  MyMuse: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => myMuseProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => myMuseProvider.fetchRanking(p) },
  ],
  HuangDou: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => huangDouProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => huangDouProvider.fetchRanking(p) },
  ],
  MoreShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => moreShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => moreShortProvider.fetchRanking(p) },
  ],
  DramaRush: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaRushProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => dramaRushProvider.fetchRanking(p) },
  ],
  Shortswave: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => shortswaveProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => shortswaveProvider.fetchRanking(p) },
  ],
  Relala: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => relalaProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => relalaProvider.fetchRanking(p) },
  ],
  SixthShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => sixthShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => sixthShortProvider.fetchRanking(p) },
  ],
  SnackShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => snackShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => snackShortProvider.fetchRanking(p) },
  ],
  Soreel: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => soreelProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => soreelProvider.fetchRanking(p) },
  ],
  StarReel: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => starReelProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => starReelProvider.fetchRanking(p) },
  ],
  StoryGo: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => storyGoProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => storyGoProvider.fetchRanking(p) },
  ],
  MiniShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => miniShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => miniShortProvider.fetchRanking(p) },
  ],
  Shorten: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => shortenProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => shortenProvider.fetchRanking(p) },
  ],
  Velolo: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => veloloProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => veloloProvider.fetchRanking(p) },
  ],
  ReelPine: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => reelPineProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => reelPineProvider.fetchRanking(p) },
  ],
  DynastyShorts: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dynastyShortsProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => dynastyShortsProvider.fetchRanking(p) },
  ],
  DramaShorts: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaShortsProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => dramaShortsProvider.fetchRanking(p) },
  ],
  TallFlix: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => tallFlixProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => tallFlixProvider.fetchRanking(p) },
  ],
  Qlax: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => qlaxProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => qlaxProvider.fetchRanking(p) },
  ],
  Shortical: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => shorticalProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => shorticalProvider.fetchRanking(p) },
  ],
  LuziCine: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => luziCineProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => luziCineProvider.fetchRanking(p) },
  ],
  ZebraShort: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => zebraShortProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => zebraShortProvider.fetchRanking(p) },
  ],
  DrakorID: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => drakorIdProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Popular', path: '/ranking', ranked: true, fetch: (p) => drakorIdProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => drakorIdProvider.fetchNewReleases(p) },
  ],
  DrachinReborn: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => drachinRebornProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Popular', path: '/ranking', ranked: true, fetch: (p) => drachinRebornProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => drachinRebornProvider.fetchNewReleases(p) },
  ],
  DramaQueen: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => dramaQueenProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Popular', path: '/ranking', ranked: true, fetch: (p) => dramaQueenProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Terbaru', path: '/terbaru', badgeStyle: 'NEW', fetch: (p) => dramaQueenProvider.fetchNewReleases(p) },
  ],
  Ansflix: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => ansflixProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Trending', path: '/ranking', ranked: true, fetch: (p) => ansflixProvider.fetchRanking(p) },
  ],
  LupaCine: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => lupaCineProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Trending', path: '/ranking', ranked: true, fetch: (p) => lupaCineProvider.fetchRanking(p) },
  ],
  ReelLife: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => reelLifeProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Ranking', path: '/ranking', ranked: true, fetch: (p) => reelLifeProvider.fetchRanking(p) },
  ],
  Bstation: [
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => bstationProvider.fetchAnime!(p) },
    { key: 'ranking', label: 'Trending', path: '/trending', ranked: true, fetch: (p) => bstationProvider.fetchRanking(p) },
    { key: 'terbaru', label: 'Latest', path: '/latest', badgeStyle: 'NEW', fetch: (p) => bstationProvider.fetchNewReleases(p) },
  ],
  Anichin: [
    { key: 'anime', label: 'Donghua', path: '/donghua', badgeStyle: 'ANIME', fetch: (p) => anichinProvider.fetchAnime!(p) },
    { key: 'terbaru', label: 'Latest', path: '/latest', badgeStyle: 'NEW', fetch: (p) => anichinProvider.fetchNewReleases(p) },
    { key: 'ranking', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => anichinProvider.fetchRanking(p) },
  ],
  DonghuaQueen: [
    { key: 'anime', label: 'Donghua', path: '/donghua', badgeStyle: 'ANIME', fetch: (p) => donghuaQueenProvider.fetchAnime!(p) },
    { key: 'terbaru', label: 'Latest', path: '/latest', badgeStyle: 'NEW', fetch: (p) => donghuaQueenProvider.fetchNewReleases(p) },
    { key: 'ranking', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => donghuaQueenProvider.fetchRanking(p) },
  ],
  Samehadaku: [
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => samehadakuProvider.fetchAnime!(p) },
    { key: 'terbaru', label: 'Latest', path: '/latest', badgeStyle: 'NEW', fetch: (p) => samehadakuProvider.fetchNewReleases(p) },
    { key: 'ranking', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => samehadakuProvider.fetchRanking(p) },
  ],
  AnimeX: [
    { key: 'anime', label: 'Anime', path: '/anime', badgeStyle: 'ANIME', fetch: (p) => animeXProvider.fetchAnime!(p) },
    { key: 'terbaru', label: 'Latest', path: '/latest', badgeStyle: 'NEW', fetch: (p) => animeXProvider.fetchNewReleases(p) },
    { key: 'ranking', label: 'Popular', path: '/popular', ranked: true, fetch: (p) => animeXProvider.fetchRanking(p) },
  ],
  WinkNovel: [
    { key: 'foryou', label: 'For You', path: '/foryou', fetch: (p) => winkNovelProvider.fetchForYou(p) },
    { key: 'ranking', label: 'Popular', path: '/ranking', ranked: true, fetch: (p) => winkNovelProvider.fetchRanking(p) },
  ],
};

export function getProviderEndpoints(
  provider: ProviderName
): ProviderEndpointSpec[] {
  return PROVIDER_ENDPOINT_CATALOG[provider] ?? [];
}

export type SearchCategoryFilter =
  | 'all'
  | 'popular'
  | 'ranking'
  | 'new_release'
  | 'all_drama'
  | 'vip'
  | 'anime';

export const PRIORITY_SEARCH_PROVIDERS: ProviderName[] = [
  'MeloLoV2',
  'DramaBoxV2',
  'NetShort',
  'AnyReel',
  'FreeReels',
  'GoodShort',
  'FlickReels',
  'ShortMaxV2',
  'ReelShortV2',
  'iQIYI',
];

function interleaveDramaLists(lists: DramaItem[][]): DramaItem[] {
  const merged: DramaItem[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const candidate = list[i];
      if (!candidate) continue;
      const key = `${candidate.provider}:${candidate.bookId}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(candidate);
      }
    }
  }
  return merged;
}

/**
 * Fast search: queries a single chosen provider (1 request) or top 10 flagship
 * providers when providerFilter is 'All' (or all 82 when deepAll=true).
 */
export async function searchProvidersFast(
  keyword: string,
  page = 1,
  providerFilter: ProviderId = 'All',
  deepAll = false
): Promise<PaginatedResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { items: [], hasMore: false, page };

  if (providerFilter !== 'All') {
    try {
      return await getProviderAdapter(providerFilter).searchDramas(trimmed, page);
    } catch {
      return { items: [], hasMore: false, page };
    }
  }

  const targets = deepAll ? ACTIVE_PROVIDER_NAMES : PRIORITY_SEARCH_PROVIDERS;
  const settled = await Promise.allSettled(
    targets.map((name) => ALL_PROVIDER_ADAPTERS[name].searchDramas(trimmed, page))
  );

  const lists = settled.map((res) =>
    res.status === 'fulfilled' ? res.value.items : []
  );
  const merged = interleaveDramaLists(lists);
  const hasMore = settled.some(
    (res) => res.status === 'fulfilled' && res.value.hasMore
  );

  return { items: merged, hasMore, page };
}

async function fetchSingleProviderCategoryFeed(
  provider: ProviderName,
  category: Exclude<SearchCategoryFilter, 'all'>,
  page = 1
): Promise<PaginatedResult> {
  const adapter = getProviderAdapter(provider);
  switch (category) {
    case 'ranking':
      return adapter.fetchRanking(page);
    case 'new_release':
      return adapter.fetchNewReleases(page);
    case 'vip':
      return adapter.fetchVip(page);
    case 'anime':
      return adapter.fetchAnime ? adapter.fetchAnime(page) : adapter.fetchForYou(page);
    case 'all_drama': {
      if (provider === 'MeloLoV2') {
        return meloLoV2Provider.fetchAllDrama(page);
      }
      const specs = PROVIDER_ENDPOINT_CATALOG[provider] ?? [];
      const allSpec = specs.find((s) =>
        ['all_drama', 'alldrama', 'all'].includes(s.key)
      );
      return allSpec ? allSpec.fetch(page) : adapter.fetchForYou(page);
    }
    case 'popular':
    default:
      return adapter.fetchForYou(page);
  }
}

/**
 * Fetches Mola TV category feeds (Popular, Ranking, New Release, All Drama, VIP, Anime)
 * for either a specific provider or top flagship providers interleaved.
 */
export async function fetchSearchCategoryFeed(
  category: SearchCategoryFilter,
  providerFilter: ProviderId = 'All',
  page = 1
): Promise<PaginatedResult> {
  const effectiveCategory: Exclude<SearchCategoryFilter, 'all'> =
    category === 'all' ? 'popular' : category;

  if (providerFilter !== 'All') {
    try {
      return await fetchSingleProviderCategoryFeed(
        providerFilter,
        effectiveCategory,
        page
      );
    } catch {
      return { items: [], hasMore: false, page };
    }
  }

  const categoryProviders: ProviderName[] =
    effectiveCategory === 'all_drama'
      ? ['MeloLoV2', 'PetaDrama', 'ShotShort', 'BlinkDrama', 'FlickReels', 'DramaBoxV2']
      : effectiveCategory === 'anime'
      ? [
          'Bstation',
          'Anichin',
          'DonghuaQueen',
          'Samehadaku',
          'AnimeX',
          'MeloLoV2',
          'NetShort',
          'FreeReels',
          'GoodShort',
          'iQIYI',
        ]
      : ['MeloLoV2', 'DramaBoxV2', 'NetShort', 'AnyReel', 'FreeReels', 'iQIYI'];

  const settled = await Promise.allSettled(
    categoryProviders.map((name) =>
      fetchSingleProviderCategoryFeed(name, effectiveCategory, page)
    )
  );

  const lists = settled.map((res) =>
    res.status === 'fulfilled' ? res.value.items : []
  );
  const merged = interleaveDramaLists(lists);
  const hasMore = settled.some(
    (res) => res.status === 'fulfilled' && res.value.hasMore
  );

  return { items: merged, hasMore, page };
}

