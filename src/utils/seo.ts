import type {
  DramaItem,
  EpisodeItem,
  LanguageCode,
  MediaProviderName,
  NavTab,
  ProviderName,
} from '../types/drama.ts';
import { getProviderRouteSlug } from '../constants/providerLogos.ts';
import type { ProgrammaticLandingConfig } from './programmaticSeo.ts';
import {
  buildOgImageEndpointUrl,
  DEFAULT_SITE_ORIGIN,
  detectLanguageFromContent,
  formatProviderDisplayName,
  generateMetadata,
  getHtmlLangTag,
  getOgLocaleTag,
  mapNavTabToMetadataPage,
  stripLeadingWatchPrefix,
  type GeneratedSeoMetadata,
} from '../i18n/helpers.ts';

export { generateMetadata, type GeneratedSeoMetadata };

export function getSeoOrigin(): string {
  return DEFAULT_SITE_ORIGIN;
}

function formatMovieDisplayTitle(title: string, year?: string): string {
  const cleanBase = stripLeadingWatchPrefix(title || '') || title || 'HD Movie';
  const cleanYear = (year || '').trim();
  if (!cleanYear) return cleanBase;
  const escapedYear = cleanYear.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\(${escapedYear}\\)`).test(cleanBase)) {
    return cleanBase;
  }
  return `${cleanBase} (${cleanYear})`;
}

export const DEFAULT_OG_IMAGE_PATH = '/og-image.jpg';
export const BRAND_LOGO_ICON_PATH =
  '/assets/aistudio/file_000000005860821188dbaf696e0dbfa6_1a485403.png';

export function slugifyDramaTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'series';
}

export function getDramaPath(
  bookId: string,
  title?: string,
  provider: MediaProviderName = 'DramaBoxV2',
  slug?: string
): string {
  const cleanSlug = (
    (slug || '').trim() ||
    (title ? slugifyDramaTitle(title) : encodeURIComponent(bookId))
  ).toLowerCase();
  const providerSlug = getProviderRouteSlug(provider);
  return `/${providerSlug}/detail/${encodeURIComponent(cleanSlug)}`;
}

export function getWatchPath(
  bookId: string,
  title?: string,
  provider: MediaProviderName = 'DramaBoxV2',
  slug?: string,
  episodeNumber = 1
): string {
  const cleanSlug = (
    (slug || '').trim() ||
    (title ? slugifyDramaTitle(title) : encodeURIComponent(bookId))
  ).toLowerCase();
  const providerSlug = getProviderRouteSlug(provider);
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const basePath = `/${providerSlug}/watch/${encodeURIComponent(cleanSlug)}`;
  return safeEp > 1 ? `${basePath}?ep=${safeEp}` : basePath;
}

const DRAMA_LOOKUP_CACHE_KEY = 'kanodrama_lookup_cache_v1';
const MAX_LOOKUP_CACHE_ENTRIES = 120;

export function saveDramaLookupCache(drama: DramaItem | null | undefined): void {
  if (typeof window === 'undefined' || !drama?.bookId || !drama?.title) return;
  try {
    const slug = (drama.slug || slugifyDramaTitle(drama.title)).toLowerCase();
    const raw = window.localStorage.getItem(DRAMA_LOOKUP_CACHE_KEY);
    const list: DramaItem[] = raw ? (JSON.parse(raw) as DramaItem[]) : [];
    const safeList = Array.isArray(list) ? list : [];
    const filtered = safeList.filter(
      (item) =>
        !(
          item?.bookId === drama.bookId &&
          item?.provider === drama.provider
        )
    );
    const next = [{ ...drama, slug }, ...filtered].slice(
      0,
      MAX_LOOKUP_CACHE_ENTRIES
    );
    window.localStorage.setItem(DRAMA_LOOKUP_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function findDramaInLookupCache(
  slugOrId: string,
  providerHint?: MediaProviderName
): DramaItem | null {
  if (typeof window === 'undefined') return null;
  const clean = decodeURIComponent(slugOrId || '').trim().toLowerCase();
  if (!clean) return null;
  try {
    const raw = window.localStorage.getItem(DRAMA_LOOKUP_CACHE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as DramaItem[];
    if (!Array.isArray(list)) return null;

    const matchesTarget = (d: DramaItem) => {
      const dSlug = (d.slug || (d.title ? slugifyDramaTitle(d.title) : '')).toLowerCase();
      const dId = String(d.bookId || '').toLowerCase();
      return dSlug === clean || dId === clean;
    };

    if (providerHint) {
      const provMatch = list.find(
        (d) => d && d.provider === providerHint && matchesTarget(d)
      );
      if (provMatch) return provMatch;
    }

    return list.find((d) => d && matchesTarget(d)) ?? null;
  } catch {
    return null;
  }
}

export function toAbsoluteOgImage(
  rawImage: string | undefined,
  originUrl: string
): string {
  const cleanOrigin = originUrl.replace(/\/$/, '');
  const trimmed = (rawImage || '').trim();
  if (!trimmed) return `${cleanOrigin}${DEFAULT_OG_IMAGE_PATH}`;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) return `${cleanOrigin}${trimmed}`;
  return `${cleanOrigin}/${trimmed}`;
}

export function formatPlaybackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const INVALID_SEO_TEXT_VALUES = new Set([
  '<nil>',
  'nil',
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  '-',
]);

const GENERIC_FALLBACK_DESC_RE =
  /^(?:(?:Watch|Stream)(?:\s+free)?\s+.+\s+(?:in\s+(?:Full\s+)?HD\s+)?on\s+KanoDrama\.?|Nonton\s+streaming\s+.+\s+di\s+MolaTV\.?)$/i;

export function cleanSeoDescription(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw
    .replace(/\$(?:provider|title|genre|tag|episode)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  if (INVALID_SEO_TEXT_VALUES.has(collapsed.toLowerCase())) return '';
  if (GENERIC_FALLBACK_DESC_RE.test(collapsed)) return '';
  return collapsed;
}

function isGenericEpisodeLabel(rawTitle: string, episodeNumber: number): boolean {
  const cleaned = cleanSeoDescription(rawTitle).toLowerCase();
  if (!cleaned) return true;
  if (cleaned === String(episodeNumber)) return true;
  return /^(?:ep|eps|episode|episodio|tập|ตอนที่|第)?\s*\d+(?:\s*[话集화])?$/i.test(
    cleaned
  );
}

export interface DramaSeoFallbackInput {
  title: string;
  providerName?: string;
  episodeNumber?: number;
  episodeCount?: number;
  episodeTitle?: string;
  isMovie?: boolean;
  lang?: LanguageCode;
  tags?: string[];
}

export function buildDramaFallbackDescription(
  input: DramaSeoFallbackInput
): string {
  const rawTitle = cleanSeoDescription(input.title) || 'Short Drama';
  const title = stripLeadingWatchPrefix(rawTitle) || rawTitle;
  const providerLabel = formatProviderDisplayName(input.providerName);
  const providerPhraseId = providerLabel ? ` di ${providerLabel}` : '';
  const providerPhraseEn = providerLabel ? ` on ${providerLabel}` : '';
  const epCount = Math.max(1, Math.floor(Number(input.episodeCount) || 1));
  const hasSpecificEpisode =
    typeof input.episodeNumber === 'number' &&
    Number.isFinite(input.episodeNumber) &&
    input.episodeNumber >= 1;
  const epNum = hasSpecificEpisode
    ? Math.max(1, Math.floor(input.episodeNumber!))
    : 1;
  const epTitle = cleanSeoDescription(input.episodeTitle);
  const epTitlePart =
    epTitle &&
    !isGenericEpisodeLabel(epTitle, epNum) &&
    epTitle.toLowerCase() !== title.toLowerCase()
      ? ` — ${epTitle}`
      : '';
  const cleanTags = (input.tags || [])
    .map((tg) => cleanSeoDescription(tg))
    .filter(Boolean)
    .slice(0, 2);
  const lang: LanguageCode = input.lang ?? 'en';
  const tagsSuffix =
    cleanTags.length > 0
      ? lang === 'cn'
        ? ` 类型：${cleanTags.join('、')}。`
        : ` Genre: ${cleanTags.join(', ')}.`
      : '';

  if (input.isMovie && epCount <= 1 && (!hasSpecificEpisode || epNum <= 1)) {
    const movieTemplates: Record<LanguageCode, string> = {
      id: `Nonton film ${title} sub Indo Full HD gratis tanpa iklan di KanoDrama${providerPhraseId ? ` (${providerLabel})` : ''}.${tagsSuffix}`,
      en: `Watch ${title} full movie ad-free in Full HD with subtitles on KanoDrama.${tagsSuffix}`,
      cn: `在 KanoDrama 免费无广告高清在线观看电影《${title}》。${tagsSuffix}`,
      vi: `Xem miễn phí phim ${title} Full HD không quảng cáo với phụ đề tại KanoDrama.${tagsSuffix}`,
      es: `Ver gratis la película ${title} en Full HD sin anuncios en KanoDrama.${tagsSuffix}`,
      ko: `KanoDrama에서 영화 ${title}을(를) 광고 없이 Full HD로 무료 감상하세요.${tagsSuffix}`,
      ja: `KanoDramaで映画『${title}』を広告なしFull HD字幕付きで無料視聴。${tagsSuffix}`,
      th: `ดูฟรีภาพยนตร์ ${title} ความคมชัด Full HD ไม่มีโฆษณาที่ KanoDrama${tagsSuffix}`,
      ms: `Tonton percuma filem ${title} dalam kualiti Full HD tanpa iklan di KanoDrama.${tagsSuffix}`,
      tl: `Panoorin nang libre at walang ads ang ${title} sa Full HD sa KanoDrama.${tagsSuffix}`,
    };
    return (movieTemplates[lang] || movieTemplates.en).trim();
  }

  if (hasSpecificEpisode) {
    const epTemplates: Record<LanguageCode, string> = {
      id: `Streaming ${title} Episode ${epNum}${epTitlePart} (${epCount} ep) sub Indo HD${providerPhraseId} gratis tanpa iklan di KanoDrama.${tagsSuffix}`,
      en: `Stream ${title} Episode ${epNum}${epTitlePart} (${epCount} eps) ad-free in crisp HD${providerPhraseEn} with subtitles on KanoDrama.${tagsSuffix}`,
      cn: `在 KanoDrama 免费无广告高清观看 ${title} 第${epNum}集${epTitlePart}（全${epCount}集）。${tagsSuffix}`,
      vi: `Xem miễn phí ${title} Tập ${epNum}${epTitlePart} (${epCount} tập) chất lượng HD tại KanoDrama.${tagsSuffix}`,
      es: `Ver gratis ${title} Episodio ${epNum}${epTitlePart} (${epCount} episodios) sin anuncios en HD en KanoDrama.${tagsSuffix}`,
      ko: `KanoDrama에서 ${title} ${epNum}화${epTitlePart} (총 ${epCount}부작)을 선명한 HD 화질로 무료 감상하세요.${tagsSuffix}`,
      ja: `KanoDramaで${title} 第${epNum}話${epTitlePart}（全${epCount}話）を高画質HDで無料視聴。${tagsSuffix}`,
      th: `ดูฟรี ${title} ตอนที่ ${epNum}${epTitlePart} (ทั้งหมด ${epCount} ตอน) คมชัดระดับ HD ได้ที่ KanoDrama${tagsSuffix}`,
      ms: `Tonton percuma ${title} Episod ${epNum}${epTitlePart} (${epCount} episod) dalam kualiti HD di KanoDrama.${tagsSuffix}`,
      tl: `Panoorin nang libre ang ${title} Episode ${epNum}${epTitlePart} (${epCount} episodes) sa malinaw na HD sa KanoDrama.${tagsSuffix}`,
    };
    return (epTemplates[lang] || epTemplates.en).trim();
  }

  const seriesTemplates: Record<LanguageCode, string> = {
    id: `Sinopsis & nonton ${title} full ${epCount} episode sub Indo HD${providerPhraseId} gratis tanpa iklan di KanoDrama.${tagsSuffix}`,
    en: `Read synopsis & watch ${title} (${epCount} episodes) ad-free in crisp HD${providerPhraseEn} with subtitles on KanoDrama.${tagsSuffix}`,
    cn: `在 KanoDrama 免费无广告高清观看 ${title} 全集（共${epCount}集）。${tagsSuffix}`,
    vi: `Xem miễn phí trọn bộ ${title} (${epCount} tập) chất lượng HD tại KanoDrama.${tagsSuffix}`,
    es: `Ver gratis todos los episodios de ${title} (${epCount} episodios) en calidad HD en KanoDrama.${tagsSuffix}`,
    ko: `KanoDrama에서 ${title} 전편 (${epCount}부작)을 선명한 HD로 무료 시청하세요.${tagsSuffix}`,
    ja: `KanoDramaで${title} 全話（全${epCount}話）を高画質HDで無料視聴。${tagsSuffix}`,
    th: `ดูฟรีซีรีส์ ${title} ครบทุกตอน (${epCount} ตอน) คมชัดระดับ HD ที่ KanoDrama${tagsSuffix}`,
    ms: `Tonton percuma ${title} episod penuh (${epCount} episod) dalam kualiti HD di KanoDrama.${tagsSuffix}`,
    tl: `Panoorin nang libre ang ${title} buong episode (${epCount} episodes) sa HD sa KanoDrama.${tagsSuffix}`,
  };
  return (seriesTemplates[lang] || seriesTemplates.en).trim();
}

export function resolveDramaSeoDescriptionFields(input: {
  title: string;
  providerName?: string;
  rawDescription?: string | null;
  episodeNumber?: number;
  episodeCount?: number;
  episodeTitle?: string;
  isMovie?: boolean;
  lang?: LanguageCode;
  tags?: string[];
}): {
  seriesDescription: string;
  episodeLabel: string;
  episodeDescription: string;
} {
  const cleanTitle = cleanSeoDescription(input.title) || 'Short Drama';
  const epCount = Math.max(1, Math.floor(Number(input.episodeCount) || 1));
  const safeEp = Math.max(1, Math.floor(Number(input.episodeNumber) || 1));
  const isSingleMovie = Boolean(input.isMovie) && epCount <= 1 && safeEp <= 1;
  const cleanRawDesc = cleanSeoDescription(input.rawDescription);
  const cleanEpTitle = cleanSeoDescription(input.episodeTitle);
  const hasDistinctEpTitle =
    Boolean(cleanEpTitle) &&
    !isGenericEpisodeLabel(cleanEpTitle, safeEp) &&
    cleanEpTitle.toLowerCase() !== cleanTitle.toLowerCase();

  const episodeLabel = isSingleMovie
    ? cleanTitle
    : hasDistinctEpTitle
    ? `${cleanTitle} - Episode ${safeEp}: ${cleanEpTitle}`
    : `${cleanTitle} - Episode ${safeEp}`;

  const seriesFallback = buildDramaFallbackDescription({
    title: cleanTitle,
    providerName: input.providerName,
    episodeCount: epCount,
    isMovie: isSingleMovie,
    lang: input.lang,
    tags: input.tags,
  });
  const seriesDescription = cleanRawDesc || seriesFallback;

  let episodeDescription = '';
  if (cleanRawDesc) {
    if (isSingleMovie) {
      episodeDescription = cleanRawDesc;
    } else {
      const epRegex = new RegExp(
        `(?:episode|episod|episodio|ep|tập|ตอนที่)\\s*0?${safeEp}\\b|第\\s*0?${safeEp}\\s*[话集]|\\b0?${safeEp}화`,
        'i'
      );
      if (epRegex.test(cleanRawDesc)) {
        episodeDescription = cleanRawDesc;
      } else {
        const epPrefix = hasDistinctEpTitle
          ? `${cleanTitle} Episode ${safeEp} (${cleanEpTitle})`
          : `${cleanTitle} Episode ${safeEp}`;
        episodeDescription = `${epPrefix} — ${cleanRawDesc}`;
      }
    }
  } else {
    episodeDescription = buildDramaFallbackDescription({
      title: cleanTitle,
      providerName: input.providerName,
      episodeNumber: safeEp,
      episodeCount: epCount,
      episodeTitle: cleanEpTitle,
      isMovie: isSingleMovie,
      lang: input.lang,
      tags: input.tags,
    });
  }

  return {
    seriesDescription:
      seriesDescription || `Watch ${cleanTitle} ad-free in HD on KanoDrama.`,
    episodeLabel,
    episodeDescription:
      episodeDescription ||
      `Watch ${episodeLabel} ad-free in HD on KanoDrama.`,
  };
}

export function buildDramaSeoMetadata(
  drama: DramaItem,
  originUrl: string,
  lang?: LanguageCode
) {
  const cleanOrigin = originUrl.replace(/\/$/, '');
  const path = getDramaPath(drama.bookId, drama.title, drama.provider, drama.slug);
  const epCount = Math.max(1, drama.chapterCount || 1);
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const effectiveLang = lang ?? detectLanguageFromContent(drama, 'en');
  const rawDesc =
    cleanSeoDescription(drama.description) ||
    buildDramaFallbackDescription({
      title: drama.title,
      providerName: drama.provider,
      episodeCount: epCount,
      isMovie,
      lang: effectiveLang,
      tags: drama.tags,
    });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: effectiveLang,
    origin: cleanOrigin,
    pathname: path,
    title: displayTitle,
    description: rawDesc,
    providerName: drama.provider,
    episodeCount: epCount,
    tags: drama.tags,
    image: toAbsoluteOgImage(drama.cover, cleanOrigin),
    keywords: [
      drama.title,
      effectiveLang === 'id' ? `Nonton ${drama.title} Sub Indo` : `Watch ${drama.title} HD online`,
      'KanoDrama',
      formatProviderDisplayName(drama.provider),
      ...drama.tags,
      ...(drama.year ? [String(drama.year)] : []),
      ...(drama.area ? [drama.area] : []),
      ...(drama.director ? [drama.director] : []),
      ...(drama.protagonist
        ? drama.protagonist.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2)
        : []),
    ],
  });

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    canonicalUrl: meta.canonicalUrl,
    image: meta.image,
  };
}

export function buildDramaJsonLd(
  drama: DramaItem,
  episodes: EpisodeItem[],
  _originUrl: string,
  episodeNumber = 1,
  lang: LanguageCode = 'en'
) {
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const safeEpisodeNumber = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const detailPath = getDramaPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug
  );
  const watchPath = getWatchPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug,
    safeEpisodeNumber
  );
  const dramaUrl = `${brandOrigin}${detailPath}`;
  const epWatchUrl = `${brandOrigin}${watchPath}`;
  const episodeCount = Math.max(1, episodes.length || drama.chapterCount || 1);
  const coverImage = buildOgImageEndpointUrl(drama.cover, brandOrigin, drama.title);

  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const isSingleMovie = isMovie && episodeCount <= 1 && safeEpisodeNumber <= 1;

  const activeEpisode = episodes.find(
    (ep) => Number(ep.episodeNumber) === safeEpisodeNumber
  );
  const { seriesDescription } = resolveDramaSeoDescriptionFields({
    title: drama.title,
    rawDescription: drama.description,
    episodeNumber: safeEpisodeNumber,
    episodeCount,
    episodeTitle: activeEpisode?.title,
    isMovie,
    lang,
    tags: drama.tags,
  });

  const actorList = drama.protagonist
    ? drama.protagonist
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({
          '@type': 'Person',
          name,
        }))
    : [];

  const provSlug = getProviderRouteSlug(drama.provider);
  const breadcrumbItems: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${brandOrigin}/` },
    {
      '@type': 'ListItem',
      position: 2,
      name: isMovie ? 'Movies' : drama.provider,
      item: `${brandOrigin}/${isMovie ? 'movies' : `provider/${provSlug}`}`,
    },
    { '@type': 'ListItem', position: 3, name: drama.title, item: dramaUrl },
  ];

  if (!isSingleMovie && safeEpisodeNumber > 1) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 4,
      name: `Episode ${safeEpisodeNumber}`,
      item: epWatchUrl,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': isSingleMovie ? 'Movie' : 'TVSeries',
        '@id': `${dramaUrl}#${isSingleMovie ? 'movie' : 'tvseries'}`,
        name: drama.title,
        description: seriesDescription,
        image: coverImage,
        url: dramaUrl,
        inLanguage: getHtmlLangTag(lang),
        ...(isSingleMovie ? {} : { numberOfEpisodes: episodeCount }),
        genre:
          drama.tags.length > 0
            ? drama.tags
            : isMovie
            ? ['Feature Film']
            : ['Drama', 'Short Series'],
        ...(drama.director
          ? { director: { '@type': 'Person', name: drama.director } }
          : {}),
        ...(isSingleMovie && drama.area
          ? { countryOfOrigin: { '@type': 'Country', name: drama.area } }
          : {}),
        ...(actorList.length > 0 ? { actor: actorList } : {}),
        ...(drama.year
          ? isSingleMovie
            ? { dateCreated: String(drama.year) }
            : { datePublished: `${drama.year}-01-01` }
          : {}),
        ...(isSingleMovie
          ? {}
          : {
              containsSeason: {
                '@type': 'TVSeason',
                seasonNumber: 1,
                numberOfEpisodes: episodeCount,
              },
            }),
        potentialAction: {
          '@type': 'WatchAction',
          target: epWatchUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
      },
    ],
  };
}

function upsertMetaTag(
  selectorAttr: 'name' | 'property',
  attrValue: string,
  content: string
) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${selectorAttr}="${attrValue}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(selectorAttr, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string) {
  const existing = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
  );
  let el = existing[0] ?? null;
  if (existing.length > 1) {
    existing.slice(1).forEach((dup) => dup.remove());
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertHreflangLinks(_href: string) {
  document.head
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((el) => el.remove());
}

function upsertJsonLdScript(data: Record<string, unknown>) {
  let script = document.head.querySelector<HTMLScriptElement>(
    'script#kano-drama-jsonld[type="application/ld+json"]'
  );
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'kano-drama-jsonld';
    document.head.appendChild(script);
  }
  script.id = 'kano-drama-jsonld';
  script.textContent = JSON.stringify(data);
}

function applyMetadataToDocument(
  meta: GeneratedSeoMetadata,
  noIndex = false
) {
  if (typeof document === 'undefined') return;
  const primaryImg = meta.openGraph.images[0];
  document.documentElement.lang = meta.htmlLang;
  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
  upsertMetaTag('name', 'keywords', meta.keywords);
  upsertMetaTag(
    'name',
    'robots',
    noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'
  );
  upsertMetaTag('property', 'og:site_name', meta.openGraph.siteName);
  upsertMetaTag('property', 'og:locale', meta.openGraph.locale);
  upsertMetaTag('property', 'og:title', meta.openGraph.title);
  upsertMetaTag('property', 'og:description', meta.openGraph.description);
  upsertMetaTag('property', 'og:type', meta.openGraph.type);
  upsertMetaTag('property', 'og:url', meta.openGraph.url);
  upsertMetaTag('property', 'og:image', primaryImg?.url || meta.openGraph.image);
  if (primaryImg) {
    upsertMetaTag('property', 'og:image:secure_url', primaryImg.secureUrl);
    upsertMetaTag('property', 'og:image:type', primaryImg.type);
    upsertMetaTag('property', 'og:image:width', String(primaryImg.width));
    upsertMetaTag('property', 'og:image:height', String(primaryImg.height));
    upsertMetaTag('property', 'og:image:alt', primaryImg.alt);
  }
  upsertMetaTag('name', 'twitter:card', meta.twitter.card);
  upsertMetaTag('name', 'twitter:title', meta.twitter.title);
  upsertMetaTag('name', 'twitter:description', meta.twitter.description);
  upsertMetaTag('name', 'twitter:image', meta.twitter.image);
  upsertMetaTag('name', 'twitter:url', meta.openGraph.url);
  upsertCanonicalLink(meta.canonicalUrl);
  upsertHreflangLinks(meta.canonicalUrl);
}

export function syncHomeDocumentSeo(lang: LanguageCode = 'en') {
  const origin = getSeoOrigin();
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const meta = generateMetadata({
    page: 'home',
    lang,
    origin,
    pathname: '/',
  });
  applyMetadataToDocument(meta);
  upsertJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${brandOrigin}/#organization`,
        name: 'KanoDrama',
        alternateName: 'Kano Drama',
        url: `${brandOrigin}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${brandOrigin}${BRAND_LOGO_ICON_PATH}`,
        },
        description: meta.description,
        sameAs: ['https://t.me/kanodrama'],
      },
      {
        '@type': 'WebSite',
        '@id': `${brandOrigin}/#website`,
        name: 'KanoDrama',
        inLanguage: meta.inLanguage,
        url: `${brandOrigin}/`,
        publisher: {
          '@id': `${brandOrigin}/#organization`,
        },
        description: meta.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${brandOrigin}/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  });
}

export function syncSectionDocumentSeo(
  section: NavTab,
  lang: LanguageCode = 'en'
) {
  if (section === 'home') {
    syncHomeDocumentSeo(lang);
    return;
  }
  const origin = getSeoOrigin();
  const pageKey = mapNavTabToMetadataPage(section);
  const meta = generateMetadata({
    page: pageKey,
    lang,
    origin,
  });
  const isPrivatePage = pageKey === 'watchlist' || pageKey === 'dashboard';
  applyMetadataToDocument(meta, isPrivatePage);
  const isCollection =
    pageKey === 'movies' ||
    pageKey === 'explore' ||
    pageKey === 'providers' ||
    pageKey === 'trending' ||
    pageKey === 'latest' ||
    pageKey === 'vip' ||
    pageKey === 'anime' ||
    pageKey === 'dubbing';
  const rewardsBreadcrumbMap: Record<LanguageCode, string> = {
    id: 'Poin & Referral',
    en: 'Rewards & Referral',
    cn: '积分与邀请',
    vi: 'Điểm & Giới thiệu',
    es: 'Puntos y Referidos',
    ko: '포인트 & 초대',
    ja: 'ポイント＆紹介',
    th: 'คะแนน & แนะนำเพื่อน',
    ms: 'Mata & Rujukan',
    tl: 'Puntos at Referral',
  };
  const sectionLabelMap: Record<string, string> = {
    movies: 'Movies',
    explore: 'Explore',
    providers: 'Providers',
    trending: 'Trending',
    latest: 'Latest Releases',
    vip: 'VIP Originals',
    anime: 'Anime & Donghua',
    dubbing: 'Dubbed Series',
    rewards: rewardsBreadcrumbMap[lang] || rewardsBreadcrumbMap.en,
    watchlist: 'My Account',
    dashboard: 'My Account',
  };
  const sectionLabel = sectionLabelMap[pageKey] || 'Browse';
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': isCollection ? 'CollectionPage' : 'WebPage',
      name: meta.title,
      description: meta.description,
      url: meta.canonicalUrl,
      inLanguage: meta.inLanguage,
      isPartOf: {
        '@type': 'WebSite',
        name: 'KanoDrama',
        url: `${origin}/`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: sectionLabel, item: meta.canonicalUrl },
      ],
    },
  ];
  if (pageKey === 'rewards') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name:
            lang === 'id'
              ? 'Bagaimana cara nonton drama dapat poin di KanoDrama?'
              : 'How do I earn points watching dramas on KanoDrama?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              lang === 'id'
                ? 'Masuk ke akun KanoDrama untuk langsung mendapatkan bonus login pertama +25.000 poin (1x per akun), lalu tonton drama pendek atau film secara aktif pada kecepatan normal (1x). Anda mendapatkan +40 poin/menit otomatis hingga 60 menit/hari (dikalikan multiplier level akun hingga 1,6x), check-in harian +1.000 poin dan Hari ke-7 +2.000 poin (total 8.000 poin/minggu, reset pukul 00.00 WIB), +500 poin bonus selesai episode (maks. 3 episode/hari), serta bonus milestone 15, 30, dan 60 menit (+300 / +600 / +1.200 poin) hingga batas 5.500 poin nonton harian.'
                : 'Sign in to claim a +25,000 pts first-login bonus (once per account) and actively watch short dramas or movies at normal playback speed. You earn +40 pts/min automatically up to 60 min/day (scaled by account level multiplier up to 1.6x), daily check-in +1,000 pts and Day 7 +2,000 pts (8,000 pts/week, resets at 17:00 UTC), +500 pts per completed episode (up to 3/day), and claimable 15/30/60 minute milestone bonuses (+300 / +600 / +1,200 pts) within a 5,500 daily watch points cap.',
          },
        },
        {
          '@type': 'Question',
          name:
            lang === 'id'
              ? 'Berapa minimal penarikan poin ke saldo DANA, Bank Indonesia, PayPal, atau USDT?'
              : 'What is the points conversion rate and minimum withdrawal?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              lang === 'id'
                ? 'Nilai tukar resmi adalah 100.000 poin = 1 USDT ($1.00 USD) = Rp 18.200. Minimal penarikan lokal IDR (DANA, GoPay, OVO, ShopeePay, LinkAja, atau Transfer Bank Indonesia) adalah Rp 50.000, sedangkan metode global (PayPal, Wise, USDT) minimal $5.00 USD.'
                : '100,000 points equal 1 USDT ($1.00 USD). Global payouts (PayPal, Wise, USDT) start at 5.00 USDT ($5.00 USD).',
          },
        },
        {
          '@type': 'Question',
          name:
            lang === 'id'
              ? 'Bagaimana cara kerja sistem referral KanoDrama?'
              : 'How does the KanoDrama referral bonus work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              lang === 'id'
              ? 'KanoDrama memisahkan Bonus Bind Referral (+200 poin), Bonus Referral Utama (+5.000 poin), dan Reward Lanjutan Referral Valid (+500 poin/jam tambahan hingga +5.000 poin). Daftar lewat tautan ?ref= atau bind kode 1x untuk +200 poin. Setelah teman menyelesaikan 1 jam (3.600 detik) tontonan aktif terverifikasi, pengundang menerima +5.000 poin dan terus meraih +500 poin setiap tambahan 1 jam tontonan aktif teman. Tersedia juga tugas share media sosial harian (+1.000 poin/hari, reset 00.00 WIB).'
              : 'KanoDrama separates the Bind Referral Bonus (+200 pts), Main Referral Bonus (+5,000 pts), and Ongoing Qualified Referral Bonus (+500 pts per extra hour up to +5,000 extra pts). Sign up via a referral link or bind a code once for +200 pts. Once the invited friend completes 1 hour (3,600s) of verified active watching, the referrer earns +5,000 pts, plus +500 pts for every extra hour the qualified referral actively watches. A daily social share task (+1,000 pts/day, resets 17:00 UTC) is also available.',
          },
        },
      ],
    });
  }
  upsertJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

export function syncProviderDocumentSeo(
  provider: ProviderName,
  lang: LanguageCode = 'en'
) {
  const origin = getSeoOrigin();
  const provSlug = getProviderRouteSlug(provider);
  const meta = generateMetadata({
    page: 'provider',
    lang,
    origin,
    pathname: `/provider/${provSlug}`,
    providerName: provider,
    keywords: [
      provider,
      `${provider} Short Drama`,
      'KanoDrama',
      'Kano Drama',
      'Watch Vertical Drama Online',
    ],
  });
  applyMetadataToDocument(meta, false);
  upsertJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: meta.title,
        description: meta.description,
        url: meta.canonicalUrl,
        inLanguage: meta.inLanguage,
        isPartOf: {
          '@type': 'WebSite',
          name: 'KanoDrama',
          url: `${origin}/`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${origin}/providers` },
          { '@type': 'ListItem', position: 3, name: provider, item: meta.canonicalUrl },
        ],
      },
    ],
  });
}

export function syncTagDocumentSeo(tag: string, lang: LanguageCode = 'en') {
  const origin = getSeoOrigin();
  const slug = slugifyDramaTitle(tag);
  const meta = generateMetadata({
    page: 'tag',
    lang,
    origin,
    pathname: `/tag/${slug}`,
    tag,
  });
  applyMetadataToDocument(meta);
  upsertJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: meta.title,
        description: meta.description,
        url: meta.canonicalUrl,
        inLanguage: meta.inLanguage,
        isPartOf: {
          '@type': 'WebSite',
          name: 'KanoDrama',
          url: `${origin}/`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Explore', item: `${origin}/explore` },
          { '@type': 'ListItem', position: 3, name: tag, item: meta.canonicalUrl },
        ],
      },
    ],
  });
}

export function syncProgrammaticLandingSeo(
  landing: ProgrammaticLandingConfig,
  items: DramaItem[] = [],
  lang: LanguageCode = 'en'
) {
  const origin = getSeoOrigin();
  const ogImage = buildOgImageEndpointUrl(DEFAULT_OG_IMAGE_PATH, origin, landing.title);
  const ogSecureUrl = ogImage.replace(/^http:\/\//i, 'https://');
  const canonicalUrl = `${origin}${landing.canonicalPath}`;
  document.documentElement.lang = getHtmlLangTag(lang);
  document.title = landing.title;
  upsertMetaTag('name', 'description', landing.description);
  upsertMetaTag('name', 'keywords', landing.keywords);
  upsertMetaTag('name', 'robots', 'index, follow, max-image-preview:large');
  upsertMetaTag('property', 'og:site_name', 'KanoDrama');
  upsertMetaTag('property', 'og:locale', getOgLocaleTag(lang));
  upsertMetaTag('property', 'og:title', landing.title);
  upsertMetaTag('property', 'og:description', landing.description);
  upsertMetaTag('property', 'og:type', 'website');
  upsertMetaTag('property', 'og:url', canonicalUrl);
  upsertMetaTag('property', 'og:image', ogImage);
  upsertMetaTag('property', 'og:image:secure_url', ogSecureUrl);
  upsertMetaTag('property', 'og:image:type', 'image/jpeg');
  upsertMetaTag('property', 'og:image:width', '1200');
  upsertMetaTag('property', 'og:image:height', '630');
  upsertMetaTag('property', 'og:image:alt', landing.title);
  upsertMetaTag('name', 'twitter:title', landing.title);
  upsertMetaTag('name', 'twitter:description', landing.description);
  upsertMetaTag('name', 'twitter:image', ogImage);
  upsertCanonicalLink(canonicalUrl);
  upsertHreflangLinks(canonicalUrl);
  upsertJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: landing.title,
        description: landing.description,
        url: canonicalUrl,
        inLanguage: getHtmlLangTag(lang),
        isPartOf: {
          '@type': 'WebSite',
          name: 'KanoDrama',
          url: `${origin}/`,
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: Math.min(12, items.length),
          itemListElement: items.slice(0, 12).map((d, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: d.title,
            url: `${origin}${getDramaPath(d.bookId, d.title, d.provider, d.slug)}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: landing.basePath === 'tag' ? 'Tags' : 'Genres',
            item: `${origin}/explore`,
          },
          { '@type': 'ListItem', position: 3, name: landing.h1, item: canonicalUrl },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: landing.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a,
          },
        })),
      },
    ],
  });
}

export function syncDramaDocumentSeo(
  drama: DramaItem,
  episodes: EpisodeItem[],
  lang?: LanguageCode
) {
  const origin = getSeoOrigin();
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const effectiveLang = lang ?? detectLanguageFromContent(drama, 'en');
  const path = getDramaPath(drama.bookId, drama.title, drama.provider, drama.slug);
  const epCount = Math.max(1, episodes.length || drama.chapterCount || 1);
  const urlEpRaw = Number(new URLSearchParams(window.location.search).get('ep'));
  const activeEp =
    Number.isFinite(urlEpRaw) && urlEpRaw >= 1 ? Math.floor(urlEpRaw) : 1;
  const activeEpTitle = episodes.find((e) => Number(e.episodeNumber) === activeEp)?.title;
  const { seriesDescription, episodeDescription } =
    resolveDramaSeoDescriptionFields({
      title: drama.title,
      providerName: drama.provider,
      rawDescription: drama.description,
      episodeNumber: activeEp,
      episodeCount: epCount,
      episodeTitle: activeEpTitle,
      isMovie,
      lang: effectiveLang,
      tags: drama.tags,
    });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: effectiveLang,
    origin,
    pathname: path,
    title: displayTitle,
    description: activeEp > 1 ? episodeDescription : seriesDescription,
    providerName: drama.provider,
    episodeCount: epCount,
    episodeNumber: activeEp > 1 ? activeEp : undefined,
    episodeTitle: activeEp > 1 ? activeEpTitle : undefined,
    tags: drama.tags,
    image: toAbsoluteOgImage(drama.cover, origin),
    keywords: [
      drama.title,
      effectiveLang === 'id' ? `Nonton ${drama.title} Sub Indo` : `Watch ${drama.title} HD online`,
      'KanoDrama',
      formatProviderDisplayName(drama.provider),
      ...drama.tags,
      ...(drama.year ? [String(drama.year)] : []),
      ...(drama.area ? [drama.area] : []),
      ...(drama.director ? [drama.director] : []),
      ...(drama.protagonist
        ? drama.protagonist.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2)
        : []),
    ],
  });
  applyMetadataToDocument(meta);
  upsertJsonLdScript(
    buildDramaJsonLd(drama, episodes, origin, activeEp, effectiveLang)
  );
}

export function syncEpisodePlayerSeo(
  drama: DramaItem,
  episodeNumber: number,
  episodes: EpisodeItem[] = [],
  lang?: LanguageCode
) {
  const origin = getSeoOrigin();
  const safeEpisodeNumber = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const effectiveLang = lang ?? detectLanguageFromContent(drama, 'en');
  const detailPath = getDramaPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug
  );
  const watchPath = getWatchPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug,
    safeEpisodeNumber
  );
  const watchUrl = `${origin}${watchPath}`;
  const epCount = Math.max(1, episodes.length || drama.chapterCount || 1);
  const activeEp = episodes.find(
    (ep) => Number(ep.episodeNumber) === safeEpisodeNumber
  );
  const { episodeDescription } = resolveDramaSeoDescriptionFields({
    title: drama.title,
    providerName: drama.provider,
    rawDescription: drama.description,
    episodeNumber: safeEpisodeNumber,
    episodeCount: epCount,
    episodeTitle: activeEp?.title,
    isMovie,
    lang: effectiveLang,
    tags: drama.tags,
  });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: effectiveLang,
    origin,
    pathname: detailPath,
    title: displayTitle,
    description: episodeDescription,
    providerName: drama.provider,
    episodeCount: epCount,
    episodeNumber: isMovie && epCount <= 1 && safeEpisodeNumber <= 1 ? undefined : safeEpisodeNumber,
    episodeTitle: activeEp?.title,
    tags: drama.tags,
    image: toAbsoluteOgImage(drama.cover, origin),
    keywords: [
      drama.title,
      'KanoDrama',
      formatProviderDisplayName(drama.provider),
      ...drama.tags,
      ...(drama.year ? [String(drama.year)] : []),
      ...(drama.area ? [drama.area] : []),
      ...(drama.director ? [drama.director] : []),
    ],
  });

  const primaryImg = meta.openGraph.images[0];
  document.documentElement.lang = meta.htmlLang;
  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
  upsertMetaTag('name', 'keywords', meta.keywords);
  upsertMetaTag('name', 'robots', 'index, follow, max-image-preview:large');
  upsertMetaTag('property', 'og:site_name', 'KanoDrama');
  upsertMetaTag('property', 'og:locale', meta.ogLocale);
  upsertMetaTag('property', 'og:title', meta.title);
  upsertMetaTag('property', 'og:description', meta.description);
  upsertMetaTag('property', 'og:type', 'video.episode');
  upsertMetaTag('property', 'og:url', watchUrl);
  upsertMetaTag('property', 'og:image', primaryImg?.url || meta.image);
  if (primaryImg) {
    upsertMetaTag('property', 'og:image:secure_url', primaryImg.secureUrl);
    upsertMetaTag('property', 'og:image:type', primaryImg.type);
    upsertMetaTag('property', 'og:image:width', String(primaryImg.width));
    upsertMetaTag('property', 'og:image:height', String(primaryImg.height));
    upsertMetaTag('property', 'og:image:alt', primaryImg.alt);
  }
  upsertMetaTag('name', 'twitter:image', meta.image);
  upsertMetaTag('name', 'twitter:title', meta.title);
  upsertMetaTag('name', 'twitter:description', meta.description);
  upsertCanonicalLink(meta.canonicalUrl);
  upsertHreflangLinks(meta.canonicalUrl);
  upsertJsonLdScript(
    buildDramaJsonLd(drama, episodes, origin, safeEpisodeNumber, effectiveLang)
  );
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSitemapXml(
  items: DramaItem[],
  originUrl: string
): string {
  const base = originUrl.replace(/\/$/, '');
  const seen = new Set<string>([`${base}/`]);
  const entries: { loc: string; changefreq: string; priority: string }[] = [
    { loc: `${base}/`, changefreq: 'hourly', priority: '1.0' },
  ];

  for (const item of items) {
    const loc = `${base}${getDramaPath(
      item.bookId,
      item.title,
      item.provider,
      item.slug
    )}`;
    if (!seen.has(loc)) {
      seen.add(loc);
      entries.push({ loc, changefreq: 'daily', priority: '0.8' });
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(entry.loc)}</loc><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
    )
    .join('\n')}\n</urlset>`;
}
