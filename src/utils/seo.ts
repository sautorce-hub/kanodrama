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
  generateMetadata,
  getHtmlLangTag,
  getOgLocaleTag,
  mapNavTabToMetadataPage,
  stripLeadingWatchPrefix,
  type GeneratedSeoMetadata,
} from '../i18n/helpers.ts';

export { generateMetadata, type GeneratedSeoMetadata };

export function getSeoOrigin(): string {
  if (typeof window === 'undefined') return DEFAULT_SITE_ORIGIN;
  const origin = window.location.origin;
  if (/^https?:\/\/(www\.)?kano-drama\.xyz$/i.test(origin)) {
    return DEFAULT_SITE_ORIGIN;
  }
  return origin;
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

export const DEFAULT_OG_IMAGE_PATH =
  '/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png';
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
  provider: MediaProviderName = 'DramaBox',
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
  provider: MediaProviderName = 'DramaBox',
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

export function cleanSeoDescription(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw
    .replace(/\$(?:provider|title|genre|tag|episode)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  if (INVALID_SEO_TEXT_VALUES.has(collapsed.toLowerCase())) return '';
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
      ? ` (${epTitle})`
      : '';
  const cleanTags = (input.tags || [])
    .map((tg) => cleanSeoDescription(tg))
    .filter(Boolean)
    .slice(0, 3);
  const tagsSuffix =
    cleanTags.length > 0 ? ` Genre: ${cleanTags.join(', ')}.` : '';
  const lang: LanguageCode = input.lang ?? 'en';

  if (input.isMovie && epCount <= 1 && (!hasSpecificEpisode || epNum <= 1)) {
    const movieTemplates: Record<LanguageCode, string> = {
      id: `Nonton gratis film ${title} kualitas Full HD lengkap dengan subtitle di KanoDrama.${tagsSuffix}`,
      en: `Watch free ${title} in Full HD online with subtitles on KanoDrama.${tagsSuffix}`,
      cn: `在 KanoDrama 免费高清在线观看电影《${title}》。${tagsSuffix}`,
      vi: `Xem miễn phí phim ${title} Full HD với phụ đề tại KanoDrama.${tagsSuffix}`,
      es: `Ver gratis la película ${title} en calidad Full HD con subtítulos en KanoDrama.${tagsSuffix}`,
      ko: `KanoDrama에서 영화 ${title}을(를) Full HD 자막과 함께 무료 감상하세요.${tagsSuffix}`,
      ja: `KanoDramaで映画『${title}』をFull HD字幕付きで無料視聴。${tagsSuffix}`,
      th: `ดูฟรีภาพยนตร์ ${title} ความคมชัด Full HD พร้อมซับไตเติลที่ KanoDrama${tagsSuffix}`,
      ms: `Tonton percuma filem ${title} dalam kualiti Full HD dengan sari kata di KanoDrama.${tagsSuffix}`,
      tl: `Panoorin nang libre ang pelikulang ${title} sa Full HD na may subtitle sa KanoDrama.${tagsSuffix}`,
    };
    return (movieTemplates[lang] || movieTemplates.en).trim();
  }

  if (hasSpecificEpisode) {
    const epTemplates: Record<LanguageCode, string> = {
      id: `Nonton gratis ${title} Episode ${epNum}${epTitlePart} dari ${epCount} episode sub Indo kualitas HD di KanoDrama.${tagsSuffix}`,
      en: `Watch free ${title} Episode ${epNum}${epTitlePart} (${epCount} episodes) online in crisp HD on KanoDrama.${tagsSuffix}`,
      cn: `在 KanoDrama 免费在线高清观看 ${title} 第${epNum}集${epTitlePart}（全${epCount}集）。${tagsSuffix}`,
      vi: `Xem miễn phí ${title} Tập ${epNum}${epTitlePart} (${epCount} tập) chất lượng HD tại KanoDrama.${tagsSuffix}`,
      es: `Ver gratis ${title} Episodio ${epNum}${epTitlePart} (${epCount} episodios) en calidad HD en KanoDrama.${tagsSuffix}`,
      ko: `KanoDrama에서 ${title} ${epNum}화${epTitlePart} (총 ${epCount}부작)을 선명한 HD 화질로 무료 감상하세요.${tagsSuffix}`,
      ja: `KanoDramaで${title} 第${epNum}話${epTitlePart}（全${epCount}話）を高画質HDで無料視聴。${tagsSuffix}`,
      th: `ดูฟรี ${title} ตอนที่ ${epNum}${epTitlePart} (ทั้งหมด ${epCount} ตอน) คมชัดระดับ HD ได้ที่ KanoDrama${tagsSuffix}`,
      ms: `Tonton percuma ${title} Episod ${epNum}${epTitlePart} (${epCount} episod) dalam kualiti HD di KanoDrama.${tagsSuffix}`,
      tl: `Panoorin nang libre ang ${title} Episode ${epNum}${epTitlePart} (${epCount} episodes) sa malinaw na HD sa KanoDrama.${tagsSuffix}`,
    };
    return (epTemplates[lang] || epTemplates.en).trim();
  }

  const seriesTemplates: Record<LanguageCode, string> = {
    id: `Nonton gratis ${title} full episode (${epCount} episode) subtitle Indonesia kualitas HD di KanoDrama.${tagsSuffix}`,
    en: `Watch free ${title} full episodes (${epCount} episodes) online in crisp HD vertical cinema mode on KanoDrama.${tagsSuffix}`,
    cn: `在 KanoDrama 免费高清观看 ${title} 全集（共${epCount}集）。${tagsSuffix}`,
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
      seriesDescription || `Watch free ${cleanTitle} online in HD on KanoDrama.`,
    episodeLabel,
    episodeDescription:
      episodeDescription ||
      `Watch free ${episodeLabel} online in HD on KanoDrama.`,
  };
}

export function buildDramaSeoMetadata(
  drama: DramaItem,
  originUrl: string,
  _lang: LanguageCode = 'en'
) {
  const cleanOrigin = originUrl.replace(/\/$/, '');
  const path = getDramaPath(drama.bookId, drama.title, drama.provider, drama.slug);
  const epCount = Math.max(1, drama.chapterCount || 1);
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const contentLang = detectLanguageFromContent(drama, 'en');
  const rawDesc =
    cleanSeoDescription(drama.description) ||
    buildDramaFallbackDescription({
      title: drama.title,
      episodeCount: epCount,
      isMovie,
      lang: contentLang,
      tags: drama.tags,
    });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: contentLang,
    origin: cleanOrigin,
    pathname: path,
    title: displayTitle,
    description: rawDesc,
    episodeCount: epCount,
    image: toAbsoluteOgImage(drama.cover, cleanOrigin),
    keywords: [
      drama.title,
      `Watch Free ${drama.title} online`,
      'KanoDrama',
      'Kano Drama',
      'Vertical short drama',
      'Asian mini series',
      drama.provider,
      ...drama.tags,
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
  originUrl: string,
  episodeNumber = 1,
  lang: LanguageCode = 'en'
) {
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const imgOrigin = originUrl.replace(/\/$/, '') || brandOrigin;
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
  const coverImage = buildOgImageEndpointUrl(drama.cover, imgOrigin, drama.title);

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
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
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
    'script#kano-drama-jsonld[type="application/ld+json"], script#coffee-drama-jsonld[type="application/ld+json"]'
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
  upsertMetaTag('name', 'twitter:title', meta.twitter.title);
  upsertMetaTag('name', 'twitter:description', meta.twitter.description);
  upsertMetaTag('name', 'twitter:image', meta.twitter.image);
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
  const sectionLabelMap: Record<string, string> = {
    movies: 'Movies',
    explore: 'Explore',
    providers: 'Providers',
    trending: 'Trending',
    latest: 'Latest Releases',
    vip: 'VIP Originals',
    anime: 'Anime & Donghua',
    dubbing: 'Dubbed Series',
    rewards: lang === 'id' ? 'Poin & Referral' : 'Rewards & Referral',
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
                ? 'Masuk ke akun KanoDrama lalu tonton drama pendek atau film secara aktif pada kecepatan normal (1x). Anda mendapatkan +20 poin/menit otomatis hingga 60 menit/hari (dikalikan multiplier level akun hingga 1,6x), +200 poin episode baru (minimal 15 detik), check-in harian +500 poin, serta bonus milestone 15, 30, dan 60 menit yang dapat diklaim setelah target tercapai.'
                : 'Sign in and actively watch short dramas or movies at normal playback speed. You earn +20 pts/min automatically up to 60 min/day (scaled by account level multiplier up to 1.6x), +200 pts per new episode (min 15s watch), daily check-in +500 pts, and claimable 15/30/60 minute milestone bonuses.',
          },
        },
        {
          '@type': 'Question',
          name:
            lang === 'id'
              ? 'Berapa minimal penarikan poin ke saldo DANA, Bank Indonesia, PayPal, atau USDT?'
              : 'What is the minimum withdrawal for IDR wallets, Banks, PayPal, Wise, and USDT?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              lang === 'id'
                ? 'Nilai tukar resmi adalah 100.000 poin = 1 USDT ($1.00 USD) = Rp 18.200. Minimal penarikan lokal IDR (DANA, GoPay, OVO, ShopeePay, LinkAja, atau Transfer Bank Indonesia) adalah Rp 50.000, sedangkan metode global (PayPal, Wise, USDT) minimal $5.00 USD.'
                : '100,000 points equal 1 USDT ($1.00 USD) or Rp 18,200 IDR. Indonesian local withdrawals (DANA, GoPay, OVO, ShopeePay, LinkAja, Bank Transfer) start at Rp 50,000, and global payouts (PayPal, Wise, USDT) start at $5.00 USD.',
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
                ? 'Bagikan tautan undangan resmi kano-drama.xyz Anda. Setelah teman mendaftar dan menyelesaikan total 1 jam (60 menit) durasi menonton terverifikasi, +5.000 poin otomatis masuk ke saldo Anda.'
                : 'Share your kano-drama.xyz referral link. Once your invited friend registers and completes 1 hour of verified active watch time, +5,000 bonus points are credited automatically.',
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
  _lang: LanguageCode = 'en'
) {
  const origin = getSeoOrigin();
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const contentLang = detectLanguageFromContent(drama, 'en');
  const path = getDramaPath(drama.bookId, drama.title, drama.provider, drama.slug);
  const epCount = Math.max(1, episodes.length || drama.chapterCount || 1);
  const urlEpRaw = Number(new URLSearchParams(window.location.search).get('ep'));
  const activeEp =
    Number.isFinite(urlEpRaw) && urlEpRaw >= 1 ? Math.floor(urlEpRaw) : 1;
  const { seriesDescription, episodeDescription } =
    resolveDramaSeoDescriptionFields({
      title: drama.title,
      rawDescription: drama.description,
      episodeNumber: activeEp,
      episodeCount: epCount,
      episodeTitle: episodes.find((e) => Number(e.episodeNumber) === activeEp)?.title,
      isMovie,
      lang: contentLang,
      tags: drama.tags,
    });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: contentLang,
    origin,
    pathname: path,
    title: displayTitle,
    description: activeEp > 1 ? episodeDescription : seriesDescription,
    episodeCount: epCount,
    episodeNumber: activeEp > 1 ? activeEp : undefined,
    image: toAbsoluteOgImage(drama.cover, origin),
    keywords: [
      drama.title,
      'KanoDrama',
      'Kano Drama',
      drama.provider,
      ...drama.tags,
    ],
  });
  applyMetadataToDocument(meta);
  upsertJsonLdScript(
    buildDramaJsonLd(drama, episodes, origin, activeEp, contentLang)
  );
}

export function syncEpisodePlayerSeo(
  drama: DramaItem,
  episodeNumber: number,
  episodes: EpisodeItem[] = [],
  _lang: LanguageCode = 'en'
) {
  const origin = getSeoOrigin();
  const safeEpisodeNumber = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const isMovie =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const contentLang = detectLanguageFromContent(drama, 'en');
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
    rawDescription: drama.description,
    episodeNumber: safeEpisodeNumber,
    episodeCount: epCount,
    episodeTitle: activeEp?.title,
    isMovie,
    lang: contentLang,
    tags: drama.tags,
  });
  const displayTitle = isMovie
    ? formatMovieDisplayTitle(drama.title, drama.year)
    : drama.title;
  const meta = generateMetadata({
    page: isMovie ? 'movie' : 'drama',
    lang: contentLang,
    origin,
    pathname: detailPath,
    title: displayTitle,
    description: episodeDescription,
    episodeCount: epCount,
    episodeNumber: isMovie && epCount <= 1 && safeEpisodeNumber <= 1 ? undefined : safeEpisodeNumber,
    image: toAbsoluteOgImage(drama.cover, origin),
    keywords: [drama.title, 'KanoDrama', 'Kano Drama', drama.provider, ...drama.tags],
  });

  const primaryImg = meta.openGraph.images[0];
  document.documentElement.lang = meta.htmlLang;
  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
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
    buildDramaJsonLd(drama, episodes, origin, safeEpisodeNumber, contentLang)
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
