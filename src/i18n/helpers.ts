import { TRANSLATIONS, type Translations } from './translations.ts';
import type {
  DramaItem,
  LanguageCode,
  LanguagePreference,
  NavTab,
} from '../types/drama.ts';

export const DEFAULT_SITE_ORIGIN = 'https://kano-drama.xyz';
export const LANG_COOKIE_NAME = 'kd_lang';
export const LANG_PREF_COOKIE_NAME = 'kd_lang_pref';

export interface LanguageOptionMeta {
  code: LanguageCode;
  htmlLang: string;
  ogLocale: string;
  flag: string;
  label: string;
  shortLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOptionMeta[] = [
  {
    code: 'id',
    htmlLang: 'id',
    ogLocale: 'id_ID',
    flag: '🇮🇩',
    label: 'Bahasa Indonesia',
    shortLabel: 'ID',
  },
  {
    code: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    flag: '🇺🇸',
    label: 'English',
    shortLabel: 'EN',
  },
  {
    code: 'cn',
    htmlLang: 'zh-CN',
    ogLocale: 'zh_CN',
    flag: '🇨🇳',
    label: '简体中文',
    shortLabel: 'CN',
  },
  {
    code: 'vi',
    htmlLang: 'vi',
    ogLocale: 'vi_VN',
    flag: '🇻🇳',
    label: 'Tiếng Việt',
    shortLabel: 'VI',
  },
  {
    code: 'es',
    htmlLang: 'es',
    ogLocale: 'es_ES',
    flag: '🇪🇸',
    label: 'Español',
    shortLabel: 'ES',
  },
  {
    code: 'ko',
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    flag: '🇰🇷',
    label: '한국어',
    shortLabel: 'KR',
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    flag: '🇯🇵',
    label: '日本語',
    shortLabel: 'JP',
  },
  {
    code: 'th',
    htmlLang: 'th',
    ogLocale: 'th_TH',
    flag: '🇹🇭',
    label: 'ภาษาไทย',
    shortLabel: 'TH',
  },
  {
    code: 'ms',
    htmlLang: 'ms',
    ogLocale: 'ms_MY',
    flag: '🇲🇾',
    label: 'Bahasa Melayu',
    shortLabel: 'MY',
  },
  {
    code: 'tl',
    htmlLang: 'tl',
    ogLocale: 'tl_PH',
    flag: '🇵🇭',
    label: 'Tagalog',
    shortLabel: 'PH',
  },
];

export function normalizeLanguageCode(
  raw?: string | null
): LanguageCode | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  if (
    clean === 'id' ||
    clean === 'in' ||
    clean.startsWith('id-') ||
    clean.startsWith('id_')
  ) {
    return 'id';
  }
  if (
    clean === 'cn' ||
    clean === 'zh' ||
    clean.startsWith('zh-') ||
    clean.startsWith('zh_')
  ) {
    return 'cn';
  }
  if (
    clean === 'vi' ||
    clean === 'vn' ||
    clean.startsWith('vi-') ||
    clean.startsWith('vi_')
  ) {
    return 'vi';
  }
  if (
    clean === 'es' ||
    clean === 'spa' ||
    clean.startsWith('es-') ||
    clean.startsWith('es_')
  ) {
    return 'es';
  }
  if (
    clean === 'ko' ||
    clean === 'kr' ||
    clean === 'kor' ||
    clean.startsWith('ko-') ||
    clean.startsWith('ko_')
  ) {
    return 'ko';
  }
  if (
    clean === 'ja' ||
    clean === 'jp' ||
    clean === 'jpn' ||
    clean.startsWith('ja-') ||
    clean.startsWith('ja_')
  ) {
    return 'ja';
  }
  if (
    clean === 'th' ||
    clean === 'tha' ||
    clean.startsWith('th-') ||
    clean.startsWith('th_')
  ) {
    return 'th';
  }
  if (
    clean === 'ms' ||
    clean === 'my' ||
    clean === 'may' ||
    clean === 'msa' ||
    clean.startsWith('ms-') ||
    clean.startsWith('ms_')
  ) {
    return 'ms';
  }
  if (
    clean === 'tl' ||
    clean === 'fil' ||
    clean === 'ph' ||
    clean === 'tgl' ||
    clean.startsWith('tl-') ||
    clean.startsWith('tl_') ||
    clean.startsWith('fil-') ||
    clean.startsWith('fil_')
  ) {
    return 'tl';
  }
  if (
    clean === 'en' ||
    clean.startsWith('en-') ||
    clean.startsWith('en_')
  ) {
    return 'en';
  }
  return null;
}

export function normalizeLanguagePreference(
  raw?: string | null
): LanguagePreference | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  if (clean === 'auto') return 'auto';
  return normalizeLanguageCode(clean);
}

export function getLanguageMeta(lang: LanguageCode): LanguageOptionMeta {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[1]
  );
}

export function getHtmlLangTag(lang: LanguageCode): string {
  return getLanguageMeta(lang).htmlLang;
}

export function getOgLocaleTag(lang: LanguageCode): string {
  return getLanguageMeta(lang).ogLocale;
}

/**
 * Helper to fetch the active translation dictionary for any supported language.
 */
export function getDictionary(lang: LanguageCode = 'en'): Translations {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}

/**
 * Simple path-based translator helper (e.g. translate('id', 'hero.playNow')).
 */
export function translate(lang: LanguageCode, keyPath: string): string {
  const dict = getDictionary(lang) as unknown as Record<string, unknown>;
  const parts = keyPath.split('.');
  let curr: unknown = dict;
  for (const part of parts) {
    if (curr && typeof curr === 'object' && part in (curr as Record<string, unknown>)) {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return keyPath;
    }
  }
  return typeof curr === 'string' ? curr : keyPath;
}

const INDONESIAN_STRONG_PHRASE_RE =
  /\b(sub\s?indo|sub\s?indonesia|subtitle\s+indonesia|dub\s?indo|sulih\s?suara|bahasa\s+indonesia|indo\s?sub|balas\s+dendam|nonton\s+gratis|mohon\s+kembali|dituduh\s+matre)\b/i;

const INDONESIAN_HINT_RE =
  /\b(nonton|gratis|episode|sinopsis|bagikan|sub\s?indo|sub\s?indonesia|sulih\s?suara|dub\s?indo|balas\s?dendam|nikah|pernikahan|menikah|menikahi|dinikahi|cerai|bercerai|miliarder|konglomerat|presdir|bos|direktur|istri|suami|keluarga|cinta|mencintai|dicintai|takdir|jodoh|rahasia|terlarang|tersembunyi|kerajaan|yang|dan|untuk|dengan|tidak|bukan|jangan|adalah|dari|dalam|kisah|seorang|menjadi|kembali|terbaru|tamat|dia|aku|kamu|kami|mereka|karena|demi|setelah|saat|ketika|sudah|telah|akan|masih|lagi|hanya|bisa|harus|mau|ingin|ternyata|akhirnya|dituduh|matre|dikhianati|dibuang|terbuang|diusir|diremehkan|dihina|terhina|tersakiti|terjebak|dipaksa|terpaksa|menyesal|mengemis|berbalik|mohon|maaf|ampun|pengawal|pelayan|tunangan|pengantin|janda|duda|palsu|sejati|kejam|cantik|tampan|tabib|putri|pangeran|ratu|raja|kaisar|permaisuri|selir|mahkota|istana|tahta|jenderal|panglima|pendekar|sakti|naga|iblis|dewa|langit|bumi|hati|jiwa|rindu|sayang|kasih|benci|membenci|luka|janji|sumpah|malam|senja|fajar|bintang|kontrak|pewaris|mantu|mertua|sultan|kaya|miskin|selingkuh|pelakor|mantan|sahabat|karma|derita|bahagia|menyamar|pengusaha|wanita|pria|gadis|bocah|anak|ayah|ibu|kakak|adik|kakek|nenek)\b/i;

const MALAY_HINT_RE =
  /\b(tonton|episod|baharu|pengarah|pelakon|jutawan|perkahwinan|perkongsian|terkini|kerana|seorang|dalam|yang|untuk|tidak|siri|percuma|sari\s+kata)\b/i;

const TAGALOG_HINT_RE =
  /\b(panoorin|pelikula|kwento|paghihiganti|pag-ibig|bilyonaryo|kasal|pamilya|kabanata|ngayon|bagong|naman|para|sila|siya|ang|mga)\b/i;

const SPANISH_HINT_RE =
  /\b(ver|episodio|película|sinopsis|venganza|multimillonario|matrimonio|familia|amor|historia|secreto|donde|para|con|una|los|las|por|que|del)\b/i;

const ENGLISH_HINT_RE =
  /\b(the|and|for|with|from|into|her|his|she|he|they|who|when|after|before|love|revenge|billionaire|secret|wife|husband|bride|marriage|bodyguard|veteran|returns|return|episode|episodes|watch|free|story|family|king|queen|princess|prince|alpha|mafia|heir|heiress|contract|hidden|identity|doctor|divorce|pregnant|twins|ceo)\b/i;

const VIETNAMESE_CHAR_RE =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

const HANGUL_CHAR_RE = /[\uac00-\ud7af\u1100-\u11ff]/;
const JAPANESE_KANA_RE = /[\u3040-\u30ff]/;
const THAI_CHAR_RE = /[\u0e00-\u0e7f]/;
const CJK_CHAR_RE = /[\u4e00-\u9fff]/;

const GENERIC_BRAND_BOILERPLATE_RE =
  /\b(?:watch|stream|nonton|tonton)\b[^.!?]{0,140}\b(?:kano\s*drama|kanodrama)\b[.!?]?/gi;

export interface ContentLanguageSignal {
  title?: string;
  description?: string;
  tags?: string[];
  corner?: string;
  area?: string;
  provider?: string;
  lang?: string;
}

function detectLanguageFromText(text: string): LanguageCode | null {
  if (!text) return null;
  if (HANGUL_CHAR_RE.test(text)) return 'ko';
  if (JAPANESE_KANA_RE.test(text)) return 'ja';
  if (THAI_CHAR_RE.test(text)) return 'th';
  if (CJK_CHAR_RE.test(text)) return 'cn';
  if (VIETNAMESE_CHAR_RE.test(text)) return 'vi';

  if (INDONESIAN_STRONG_PHRASE_RE.test(text)) return 'id';

  const idMatches = text.match(new RegExp(INDONESIAN_HINT_RE.source, 'gi'));
  if (idMatches && idMatches.length >= 2) return 'id';

  const msMatches = text.match(new RegExp(MALAY_HINT_RE.source, 'gi'));
  if (msMatches && msMatches.length >= 3) return 'ms';

  const tlMatches = text.match(new RegExp(TAGALOG_HINT_RE.source, 'gi'));
  if (tlMatches && tlMatches.length >= 2) return 'tl';

  const esMatches = text.match(new RegExp(SPANISH_HINT_RE.source, 'gi'));
  if (/[ñ¿¡]/i.test(text) || (esMatches && esMatches.length >= 3)) return 'es';

  const enMatches = text.match(new RegExp(ENGLISH_HINT_RE.source, 'gi'));
  if (enMatches && enMatches.length >= 2) return 'en';
  if (idMatches && idMatches.length === 1 && (!enMatches || enMatches.length === 0)) {
    return 'id';
  }

  return null;
}

/**
 * Detects language from an active API drama/movie payload or text snippet
 * (supporting ID, EN, CN, VI, ES, KO, JA, TH, MS, and TL).
 */
export function detectLanguageFromContent(
  input: Partial<DramaItem> | ContentLanguageSignal | string | null | undefined,
  fallback: LanguageCode = 'en'
): LanguageCode {
  if (!input) return fallback;

  if (typeof input === 'string') {
    const text = input.trim();
    return detectLanguageFromText(text) ?? fallback;
  }

  const explicitApiLang = normalizeLanguageCode(
    'lang' in input ? input.lang : undefined
  );
  if (explicitApiLang) return explicitApiLang;

  const cornerStr = 'corner' in input && input.corner ? input.corner : '';
  const areaStr = 'area' in input && input.area ? input.area : '';
  const tagsStr = Array.isArray(input.tags) ? input.tags.join(' ') : '';

  if (
    INDONESIAN_STRONG_PHRASE_RE.test(cornerStr) ||
    INDONESIAN_STRONG_PHRASE_RE.test(tagsStr)
  ) {
    return 'id';
  }

  const cleanDesc = (input.description || '')
    .replace(GENERIC_BRAND_BOILERPLATE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const primaryText = [input.title || '', cleanDesc, cornerStr, areaStr]
    .join(' ')
    .trim();

  const primaryDetected = detectLanguageFromText(primaryText);
  if (primaryDetected) return primaryDetected;

  const combinedText = [primaryText, tagsStr].join(' ').trim();
  const detected = detectLanguageFromText(combinedText);
  if (detected) return detected;

  if (input.provider === 'LK21' || input.provider === 'LookSeries') {
    return 'id';
  }

  return fallback;
}

export function parseCookieHeaderLanguage(
  cookieHeader: string | undefined
): { lang: LanguageCode | null; pref: LanguagePreference | null } {
  if (!cookieHeader) return { lang: null, pref: null };
  let lang: LanguageCode | null = null;
  let pref: LanguagePreference | null = null;

  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = decodeURIComponent(part.slice(eq + 1).trim());
    if (key === LANG_COOKIE_NAME || key === 'hd_lang') {
      lang = normalizeLanguageCode(val);
    } else if (key === LANG_PREF_COOKIE_NAME || key === 'hd_lang_pref') {
      pref = normalizeLanguagePreference(val);
    }
  }
  return { lang, pref };
}

export function readLanguageFromClientCookies(): {
  lang: LanguageCode | null;
  pref: LanguagePreference | null;
} {
  if (typeof document === 'undefined') return { lang: null, pref: null };
  return parseCookieHeaderLanguage(document.cookie);
}

export function writeLanguageCookies(
  lang: LanguageCode,
  pref: LanguagePreference
): void {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LANG_COOKIE_NAME}=${encodeURIComponent(lang)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `${LANG_PREF_COOKIE_NAME}=${encodeURIComponent(pref)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export interface LocalizedMetadataInput {
  page:
    | 'home'
    | 'movies'
    | 'explore'
    | 'providers'
    | 'provider'
    | 'trending'
    | 'latest'
    | 'vip'
    | 'watchlist'
    | 'dashboard'
    | 'account'
    | 'anime'
    | 'dubbing'
    | 'drama'
    | 'movie'
    | 'tag';
  lang?: LanguageCode;
  origin?: string;
  pathname?: string;
  title?: string;
  description?: string;
  providerName?: string;
  episodeCount?: number;
  episodeNumber?: number;
  tag?: string;
  keywords?: string[];
  image?: string;
}

export interface OpenGraphImageMeta {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  type: 'image/jpeg';
  alt: string;
}

export function buildOgImageEndpointUrl(
  rawImage: string | undefined,
  origin: string,
  _title?: string
): string {
  const rawCleanOrigin = (origin || DEFAULT_SITE_ORIGIN).trim().replace(/\/+$/, '');
  const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(
    rawCleanOrigin
  );
  const cleanOrigin = !isLocalOrigin
    ? rawCleanOrigin.replace(/^http:\/\//i, 'https://')
    : rawCleanOrigin;

  const unwrapTarget = (inputUrl: string): string => {
    let current = (inputUrl || '').trim();
    for (let depth = 0; depth < 3; depth += 1) {
      if (!current) return '';
      if (current.startsWith('//')) {
        current = `https:${current}`;
        continue;
      }
      if (current.startsWith('/api/proxy?') || current.startsWith('/api/og?')) {
        try {
          const parsed = new URL(current, cleanOrigin);
          const inner = parsed.searchParams.get('url');
          if (inner) {
            current = inner.trim();
            continue;
          }
        } catch {
          return current;
        }
      }
      if (current.startsWith('http://') || current.startsWith('https://')) {
        try {
          const parsed = new URL(current);
          if (
            (parsed.pathname === '/api/proxy' || parsed.pathname === '/api/og') &&
            parsed.searchParams.get('url')
          ) {
            current = parsed.searchParams.get('url')!.trim();
            continue;
          }
          if (
            (parsed.origin === cleanOrigin ||
              parsed.origin === rawCleanOrigin ||
              parsed.hostname === 'kano-drama.xyz' ||
              parsed.hostname === 'www.kano-drama.xyz') &&
            (parsed.pathname.startsWith('/assets/') ||
              parsed.pathname.startsWith('/pwa-') ||
              parsed.pathname === '/apple-touch-icon.png')
          ) {
            return parsed.pathname;
          }
        } catch {
          return current;
        }
      }
      break;
    }
    return current;
  };

  const trimmed = (rawImage || '').trim();
  if (
    trimmed === `${cleanOrigin}/api/og` ||
    trimmed === `${rawCleanOrigin}/api/og` ||
    trimmed === '/api/og'
  ) {
    return `${cleanOrigin}/api/og`;
  }

  let resolvedTarget = unwrapTarget(trimmed);
  if (
    resolvedTarget &&
    !resolvedTarget.startsWith('http://') &&
    !resolvedTarget.startsWith('https://')
  ) {
    resolvedTarget = resolvedTarget.startsWith('/')
      ? resolvedTarget
      : `/${resolvedTarget}`;
  }

  if (
    !resolvedTarget ||
    resolvedTarget ===
      '/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png' ||
    resolvedTarget === '/assets/aistudio/kano-drama-og.png' ||
    resolvedTarget === '/assets/aistudio/gambar_OG_39d1f12c.png'
  ) {
    return `${cleanOrigin}/api/og`;
  }

  const params = new URLSearchParams();
  params.set('url', resolvedTarget);
  return `${cleanOrigin}/api/og?${params.toString()}`;
}

export interface GeneratedSeoMetadata {
  title: string;
  description: string;
  keywords: string;
  htmlLang: string;
  ogLocale: string;
  inLanguage: string;
  canonicalUrl: string;
  image: string;
  alternates: Record<string, string>;
  openGraph: {
    siteName: string;
    locale: string;
    type: 'website' | 'video.tv_show' | 'video.movie' | 'video.episode';
    title: string;
    description: string;
    url: string;
    image: string;
    images: OpenGraphImageMeta[];
  };
  twitter: {
    card: 'summary_large_image';
    title: string;
    description: string;
    image: string;
  };
}

const SECTION_SEO_COPY: Record<
  LanguageCode,
  Record<
    'home' | 'movies' | 'explore' | 'providers' | 'trending' | 'latest' | 'vip' | 'watchlist' | 'dashboard' | 'anime' | 'dubbing',
    { path: string; title: string; description: string }
  >
> = {
  en: {
    home: {
      path: '/',
      title: 'KanoDrama — Watch Free Short Dramas, Asian Series & Movies HD',
      description:
        'KanoDrama (kano-drama.xyz) is a free streaming platform for short dramas, Asian series, Chinese & Korean dramas, and movies with Indonesian & multi-lang subs.',
    },
    movies: {
      path: '/movies',
      title: 'Watch Free HD Movies Online — Box Office, Asian Cinema & Series | KanoDrama',
      description:
        'Watch free thousands of full HD feature films, Asian cinema, Korean movies, Hollywood hits, and latest releases online at KanoDrama Movies.',
    },
    explore: {
      path: '/explore',
      title: 'Watch Free Vertical Short Dramas by Genre & Filter | KanoDrama',
      description:
        'Explore and watch free 49+ short drama platforms by CEO, Romance, Revenge, Fantasy, completion status, and rating on KanoDrama.',
    },
    providers: {
      path: '/providers',
      title: 'All Short Drama Providers — Watch Free HD Across 49+ Platforms | KanoDrama',
      description:
        'Browse 49+ vertical short drama providers and watch free HD series from DramaBox, Melolo, NetShort, ReelShort, GoodShort, and FreeReels on KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Watch Free Trending Short Dramas Right Now — Top Ranked | KanoDrama',
      description:
        'Watch free today’s #1 viral short dramas and top-ranked mini-series streamed globally in crisp HD on KanoDrama.',
    },
    latest: {
      path: '/latest',
      title: 'Watch Free Latest Short Dramas — Fresh Daily Releases | KanoDrama',
      description:
        'Watch free newly released episodes and premiering short drama series updated daily across 49+ platforms on KanoDrama.',
    },
    vip: {
      path: '/vip',
      title: 'Watch Free VIP Exclusive Vertical Short Dramas | KanoDrama',
      description:
        'Watch free VIP-exclusive billionaire romance, revenge sagas, and cinematic mini-series in full HD on KanoDrama.',
    },
    anime: {
      path: '/explore',
      title: 'Watch Free Anime & Donghua Short Series | KanoDrama',
      description:
        'Watch free top animated short series and donghua episodes in HD on KanoDrama.',
    },
    dubbing: {
      path: '/explore',
      title: 'Watch Free Dubbed Short Drama Series | KanoDrama',
      description:
        'Watch free multi-language dubbed vertical short dramas in crisp HD on KanoDrama.',
    },
    watchlist: {
      path: '/account',
      title: 'My Watchlist & Saved Series | KanoDrama',
      description:
        'Manage your saved feature films, drama folders, watching status, and completed series on KanoDrama.',
    },
    dashboard: {
      path: '/account',
      title: 'My Account, History & Watchlist | KanoDrama',
      description:
        'Manage your profile, cloud-synced watch history, personal watchlist, and comments on KanoDrama.',
    },
  },
  id: {
    home: {
      path: '/',
      title: 'KanoDrama — Nonton Gratis Drama Pendek, Serial Asia & Film Sub Indo HD',
      description:
        'KanoDrama (kano-drama.xyz) adalah platform streaming drama pendek, serial Asia, drama China/Korea & film gratis dengan subtitle Bahasa Indonesia & lainnya.',
    },
    movies: {
      path: '/movies',
      title: 'Nonton Gratis Film HD — Box Office, Sinema Asia & Serial | KanoDrama',
      description:
        'Nonton gratis ribuan film layar lebar Full HD, film Korea, Asia, Hollywood, dan rilis terbaru dengan subtitle di KanoDrama Movies.',
    },
    explore: {
      path: '/explore',
      title: 'Nonton Gratis Drama Pendek berdasarkan Genre & Filter | KanoDrama',
      description:
        'Saring katalog dari 49+ platform dan nonton gratis berdasarkan CEO, Romansa, Balas Dendam, Fantasi, status tamat, dan rating di KanoDrama.',
    },
    providers: {
      path: '/providers',
      title: 'Daftar Lengkap Provider Drama Pendek — Nonton Gratis 49+ Platform | KanoDrama',
      description:
        'Jelajahi 49+ platform penyedia drama pendek vertikal dan nonton gratis DramaBox, Melolo, NetShort, ReelShort, GoodShort, serta FreeReels di KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Nonton Gratis Drama Pendek Trending Hari Ini — Top Ranking | KanoDrama',
      description:
        'Nonton gratis drama pendek viral #1 hari ini dan serial mini terpopuler dalam kualitas HD jernih di KanoDrama.',
    },
    latest: {
      path: '/latest',
      title: 'Nonton Gratis Rilis Terbaru — Drama Pendek Update Harian | KanoDrama',
      description:
        'Nonton gratis episode terbaru dan serial drama pendek perdana yang diperbarui setiap hari dari 49+ platform di KanoDrama.',
    },
    vip: {
      path: '/vip',
      title: 'Nonton Gratis Koleksi Drama Pendek Eksklusif VIP | KanoDrama',
      description:
        'Nonton gratis romansa miliarder eksklusif VIP, drama balas dendam, dan serial mini sinematik Full HD di KanoDrama.',
    },
    anime: {
      path: '/explore',
      title: 'Nonton Gratis Serial Pendek Anime & Donghua HD | KanoDrama',
      description:
        'Nonton gratis serial animasi pendek dan episode donghua populer dalam kualitas HD di KanoDrama.',
    },
    dubbing: {
      path: '/explore',
      title: 'Nonton Gratis Drama Pendek Sulih Suara Indonesia | KanoDrama',
      description:
        'Nonton gratis drama pendek vertikal dengan sulih suara multi-bahasa dalam kualitas HD jernih di KanoDrama.',
    },
    watchlist: {
      path: '/account',
      title: 'Daftar Tontonan & Film Tersimpan Saya | KanoDrama',
      description:
        'Kelola koleksi film dan drama tersimpan, folder tontonan, serta status serial yang sudah tamat.',
    },
    dashboard: {
      path: '/account',
      title: 'Akun Saya, Riwayat Tontonan & Watchlist | KanoDrama',
      description:
        'Kelola profil, riwayat tontonan lintas perangkat, daftar favorit, dan komentar Anda di KanoDrama.',
    },
  },
  cn: {
    home: {
      path: '/',
      title: 'KanoDrama — 在线高清观看热门竖屏短剧与亚洲剧集',
      description:
        '在 KanoDrama 免费畅看来自 49+ 平台的超清竖屏短剧、霸总甜宠、豪门复仇与亚洲热门剧集。',
    },
    movies: {
      path: '/movies',
      title: '免费高清电影在线观看 — 院线大片与亚洲影院 | KanoDrama',
      description:
        '在 KanoDrama 影院免费在线观看数千部高清电影、华语佳片、韩国电影与热门剧集。',
    },
    explore: {
      path: '/explore',
      title: '按题材与评分探索全部短剧 | KanoDrama',
      description:
        '在 49+ 短剧片源中按霸总、言情、复仇、玄幻、完结状态与评分快速筛选。',
    },
    providers: {
      path: '/providers',
      title: '短剧片源平台大全 — 49+ 热门平台 | KanoDrama',
      description:
        '浏览 KanoDrama 收录的 DramaBox、Melolo、NetShort、ReelShort 等 49+ 竖屏短剧片源中心。',
    },
    trending: {
      path: '/trending',
      title: '今日热播短剧排行榜 | KanoDrama',
      description:
        '观看今日最火的病毒式短剧与全网人气榜首迷你剧，超清流畅播放。',
    },
    latest: {
      path: '/latest',
      title: '最新上线 — 每日更新热门短剧 | KanoDrama',
      description:
        '每日同步更新来自 49+ 平台的全新短剧集数与首播剧目。',
    },
    vip: {
      path: '/vip',
      title: 'VIP 尊享竖屏短剧专区 | KanoDrama',
      description:
        '尊享高清霸总爱恋、重生复仇大戏与精选微短剧全集。',
    },
    anime: {
      path: '/explore',
      title: '动漫与国漫短剧专区 | KanoDrama',
      description: '在 KanoDrama 高清畅看热门动漫短片与国漫剧集。',
    },
    dubbing: {
      path: '/explore',
      title: '多语种配音短剧专区 | KanoDrama',
      description: '高清观看支持多语言配音的精选竖屏短剧。',
    },
    watchlist: {
      path: '/account',
      title: '我的追剧片单与收藏 | KanoDrama',
      description: '管理您收藏的电影、剧集分组、观看进度与已看完列表。',
    },
    dashboard: {
      path: '/account',
      title: '个人中心、观看记录与片单 | KanoDrama',
      description: '管理个人资料、云端观看历史、追剧清单与剧集评论。',
    },
  },
  vi: {
    home: {
      path: '/',
      title: 'KanoDrama — Xem Phim Ngắn Dọc HD & Phim Bộ Châu Á Trực Tuyến',
      description:
        'Xem miễn phí phim ngắn dọc HD, ngôn tình tổng tài, báo thù và series châu Á từ hơn 49 nền tảng trên KanoDrama.',
    },
    movies: {
      path: '/movies',
      title: 'Xem Phim Lẻ HD Miễn Phí — Chiếu Rạp & Điện Ảnh Châu Á | KanoDrama',
      description:
        'Thưởng thức hàng nghìn phim chiếu rạp Full HD, phim Hàn Quốc, châu Á và bom tấn mới nhất miễn phí tại KanoDrama.',
    },
    explore: {
      path: '/explore',
      title: 'Khám Phá Phim Ngắn Theo Thể Loại & Bộ Lọc | KanoDrama',
      description:
        'Lọc phim từ 49+ nền tảng theo Tổng tài, Ngôn tình, Báo thù, Huyền huyễn, trạng thái và đánh giá.',
    },
    providers: {
      path: '/providers',
      title: 'Danh Bạ Nhà Cung Cấp Phim Ngắn — 49+ Nền Tảng | KanoDrama',
      description:
        'Khám phá 49+ nền tảng phim ngắn như DramaBox, Melolo, NetShort, ReelShort, GoodShort trên KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Phim Ngắn Thịnh Hành Hôm Nay — Bảng Xếp Hạng | KanoDrama',
      description:
        'Xem ngay những bộ phim ngắn hot nhất và xếp hạng cao nhất toàn cầu với chất lượng HD.',
    },
    latest: {
      path: '/latest',
      title: 'Phim Mới Phát Hành — Cập Nhật Hàng Ngày | KanoDrama',
      description:
        'Đón xem các tập mới nhất và series mới ra mắt được cập nhật mỗi ngày từ 49+ nguồn phim.',
    },
    vip: {
      path: '/vip',
      title: 'Phim Ngắn Độc Quyền VIP HD | KanoDrama',
      description:
        'Khám phá kho phim VIP ngôn tình tổng tài, báo thù kịch tính chất lượng Full HD.',
    },
    anime: {
      path: '/explore',
      title: 'Hoạt Hình & Donghua Ngắn HD | KanoDrama',
      description: 'Xem loạt phim hoạt hình ngắn và donghua nổi bật chuẩn HD.',
    },
    dubbing: {
      path: '/explore',
      title: 'Phim Ngắn Lồng Tiếng Đa Ngôn Ngữ | KanoDrama',
      description: 'Xem phim ngắn dọc lồng tiếng sắc nét chuẩn HD trên KanoDrama.',
    },
    watchlist: {
      path: '/account',
      title: 'Danh Sách Xem & Phim Đã Lưu | KanoDrama',
      description: 'Quản lý phim đã lưu, thư mục và tiến độ xem của bạn.',
    },
    dashboard: {
      path: '/account',
      title: 'Tài Khoản, Lịch Sử Xem & Danh Sách | KanoDrama',
      description: 'Quản lý hồ sơ, lịch sử xem đồng bộ và bình luận trên KanoDrama.',
    },
  },
  es: {
    home: {
      path: '/',
      title: 'KanoDrama — Ver Dramas Cortos Verticales HD y Series Asiáticas Online',
      description:
        'Disfruta gratis de dramas cortos verticales HD, romance de CEO, historias de venganza y series asiáticas de 49+ plataformas en KanoDrama.',
    },
    movies: {
      path: '/movies',
      title: 'Ver Películas HD Gratis Online — Cine Asiático y Estrenos | KanoDrama',
      description:
        'Disfruta miles de películas completas en Full HD, cine asiático, estrenos coreanos y éxitos de taquilla gratis en KanoDrama.',
    },
    explore: {
      path: '/explore',
      title: 'Explorar Dramas Cortos por Género y Filtro | KanoDrama',
      description:
        'Filtra más de 49 plataformas de dramas cortos por CEO, Romance, Venganza, Fantasía, estado y valoración.',
    },
    providers: {
      path: '/providers',
      title: 'Directorio de Proveedores de Dramas Cortos — 49+ Plataformas | KanoDrama',
      description:
        'Explora más de 49 plataformas de dramas cortos verticales como DramaBox, Melolo, NetShort y ReelShort en KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Dramas Cortos en Tendencia Hoy — Top Ranking | KanoDrama',
      description: 'Mira los dramas cortos virales #1 de hoy en HD nítido en KanoDrama.',
    },
    latest: {
      path: '/latest',
      title: 'Últimos Estrenos — Nuevos Dramas Cortos Diarios | KanoDrama',
      description: 'Descubre episodios recién estrenados y series actualizadas todos los días.',
    },
    vip: {
      path: '/vip',
      title: 'Dramas Cortos Exclusivos VIP HD | KanoDrama',
      description: 'Accede a dramas cortos exclusivos VIP de romance millonario y venganza en Full HD.',
    },
    anime: {
      path: '/explore',
      title: 'Anime y Donghua en HD | KanoDrama',
      description: 'Disfruta series cortas de anime y donghua en calidad HD.',
    },
    dubbing: {
      path: '/explore',
      title: 'Dramas Cortos Doblados | KanoDrama',
      description: 'Mira dramas cortos verticales doblados en múltiples idiomas en HD.',
    },
    watchlist: {
      path: '/account',
      title: 'Mi Lista y Series Guardadas | KanoDrama',
      description: 'Administra tus películas guardadas, carpetas y series completadas.',
    },
    dashboard: {
      path: '/account',
      title: 'Mi Cuenta, Historial y Lista Personal | KanoDrama',
      description: 'Administra tu perfil, historial sincronizado y comentarios en KanoDrama.',
    },
  },
  ko: {
    home: {
      path: '/',
      title: 'KanoDrama — HD 세로형 숏드라마 & 아시아 시리즈 무료 감상',
      description: '49개 이상 플랫폼의 인기 세로형 숏드라마, 재벌 로맨스, 복수극을 HD로 무료 시청하세요.',
    },
    movies: {
      path: '/movies',
      title: '무료 HD 영화 다시보기 — 박스오피스 & 아시아 영화 | KanoDrama',
      description: '수천 편의 Full HD 영화, 한국·아시아 시네마, 최신 개봉작을 KanoDrama에서 무료로 감상하세요.',
    },
    explore: {
      path: '/explore',
      title: '장르별 숏드라마 탐색 및 필터 | KanoDrama',
      description: 'CEO, 로맨스, 복수, 판타지, 완결 여부 및 평점으로 숏드라마를 빠르게 찾아보세요.',
    },
    providers: {
      path: '/providers',
      title: '전체 숏드라마 플랫폼 디렉터리 — 49+ 제공사 | KanoDrama',
      description: 'DramaBox, Melolo, NetShort, ReelShort 등 49개 이상의 숏드라마 플랫폼을 한곳에서 탐색하세요.',
    },
    trending: {
      path: '/trending',
      title: '실시간 인기 숏드라마 TOP 랭킹 | KanoDrama',
      description: '오늘 가장 인기 있는 화제의 숏드라마를 선명한 HD 화질로 감상하세요.',
    },
    latest: {
      path: '/latest',
      title: '최신 공개 숏드라마 — 매일 업데이트 | KanoDrama',
      description: '49개 이상 플랫폼에서 매일 업데이트되는 최신 에피소드와 신작을 만나보세요.',
    },
    vip: {
      path: '/vip',
      title: 'VIP 독점 숏드라마 컬렉션 | KanoDrama',
      description: 'VIP 전용 재벌 로맨스와 짜릿한 복수 숏드라마를 Full HD로 감상하세요.',
    },
    anime: {
      path: '/explore',
      title: '애니메이션 & 동화 숏시리즈 | KanoDrama',
      description: '인기 애니메이션과 동화 숏시리즈를 HD 화질로 스트리밍하세요.',
    },
    dubbing: {
      path: '/explore',
      title: '더빙 숏드라마 시리즈 | KanoDrama',
      description: '다국어 더빙 세로형 숏드라마를 선명한 HD로 시청하세요.',
    },
    watchlist: {
      path: '/account',
      title: '내 찜 목록 & 저장한 작품 | KanoDrama',
      description: '저장한 영화, 드라마 폴더 및 시청 상태를 손쉽게 관리하세요.',
    },
    dashboard: {
      path: '/account',
      title: '내 계정, 시청 기록 & 찜 목록 | KanoDrama',
      description: '프로필, 클라우드 시청 기록, 찜 목록 및 댓글을 한눈에 관리하세요.',
    },
  },
  ja: {
    home: {
      path: '/',
      title: 'KanoDrama — 高画質HD 縦型ショートドラマ＆アジア作品オンライン視聴',
      description: '49以上の配信プラットフォームからCEOロマンス、復讐劇、アジアショートドラマをHD画質で無料視聴。',
    },
    movies: {
      path: '/movies',
      title: '無料HD映画オンライン視聴 — 話題作・アジア映画 | KanoDrama',
      description: 'Full HD映画、アジア名作、韓国映画、最新作品をKanoDramaで無料ストリーミング。',
    },
    explore: {
      path: '/explore',
      title: 'ジャンル＆条件でショートドラマを探す | KanoDrama',
      description: 'CEO、恋愛、復讐、ファンタジー、完結状況、評価で49以上の配信元から検索。',
    },
    providers: {
      path: '/providers',
      title: 'ショートドラマ配信プラットフォーム一覧 — 49+ 対応 | KanoDrama',
      description: 'DramaBox、Melolo、NetShort、ReelShort など49以上の縦型ショートドラマ配信元を KanoDrama でまとめて探索。',
    },
    trending: {
      path: '/trending',
      title: '人気急上昇ショートドラマランキング | KanoDrama',
      description: '今話題の縦型ショートドラマTOPランキングを高画質HDで視聴できます。',
    },
    latest: {
      path: '/latest',
      title: '新着ショートドラマ — 毎日更新 | KanoDrama',
      description: '毎日更新される最新エピソードと新着ショートドラマをいち早くチェック。',
    },
    vip: {
      path: '/vip',
      title: 'VIP限定縦型ショートドラマ | KanoDrama',
      description: 'VIP限定の大富豪ロマンスや痛快復讐劇をFull HDでお届けします。',
    },
    anime: {
      path: '/explore',
      title: 'アニメ＆中国アニメショート作品 | KanoDrama',
      description: '人気のショートアニメや中国アニメを高画質HDで楽しめます。',
    },
    dubbing: {
      path: '/explore',
      title: '吹替版ショートドラマ特集 | KanoDrama',
      description: '多言語吹替対応の縦型ショートドラマをHD画質で視聴。',
    },
    watchlist: {
      path: '/account',
      title: 'マイリスト＆保存済み作品 | KanoDrama',
      description: 'お気に入りの映画やドラマ、視聴ステータスを整理できます。',
    },
    dashboard: {
      path: '/account',
      title: 'マイアカウント・視聴履歴・マイリスト | KanoDrama',
      description: 'プロフィールやクラウド視聴履歴、コメントを管理できます。',
    },
  },
  th: {
    home: {
      path: '/',
      title: 'KanoDrama — ดูมินิซีรีส์แนวตั้ง HD และซีรีส์เอเชียออนไลน์ฟรี',
      description: 'รับชมมินิซีรีส์แนวตั้ง HD ซีรีส์ท่านประธาน ล้างแค้น และซีรีส์เอเชียฟรีกว่า 49 แพลตฟอร์มบน KanoDrama',
    },
    movies: {
      path: '/movies',
      title: 'ดูหนัง HD ออนไลน์ฟรี — หนังดัง หนังเอเชีย และซีรีส์ | KanoDrama',
      description: 'สตรีมภาพยนตร์ Full HD หนังเอเชีย หนังเกาหลี และเรื่องใหม่ล่าสุดฟรีที่ KanoDrama',
    },
    explore: {
      path: '/explore',
      title: 'สำรวจมินิซีรีส์ตามแนวเรื่องและตัวกรอง | KanoDrama',
      description: 'คัดกรองกว่า 49 แพลตฟอร์มตามแนวท่านประธาน โรแมนติก แก้แค้น แฟนตาซี และคะแนนรีวิว',
    },
    providers: {
      path: '/providers',
      title: 'รวมผู้ให้บริการมินิซีรีส์ทั้งหมด — 49+ แพลตฟอร์ม | KanoDrama',
      description: 'สำรวจกว่า 49 แพลตฟอร์มมินิซีรีส์แนวตั้ง เช่น DramaBox, Melolo, NetShort และ ReelShort บน KanoDrama',
    },
    trending: {
      path: '/trending',
      title: 'มินิซีรีส์มาแรงวันนี้ — อันดับยอดนิยม | KanoDrama',
      description: 'รับชมมินิซีรีส์ไวรัลอันดับ 1 ประจำวันในความคมชัดระดับ HD',
    },
    latest: {
      path: '/latest',
      title: 'อัปเดตใหม่ล่าสุด — มินิซีรีส์รายวัน | KanoDrama',
      description: 'ติดตามตอนใหม่ล่าสุดและซีรีส์เปิดตัวใหม่อัปเดตทุกวัน',
    },
    vip: {
      path: '/vip',
      title: 'มินิซีรีส์เอ็กซ์คลูซีฟ VIP HD | KanoDrama',
      description: 'เพลิดเพลินกับมินิซีรีส์ VIP มหาเศรษฐีและดราม่าแก้แค้นคมชัด Full HD',
    },
    anime: {
      path: '/explore',
      title: 'อนิเมะและตงฮวาสั้น HD | KanoDrama',
      description: 'รับชมอนิเมะและตงฮวาตอนสั้นยอดนิยมระดับ HD',
    },
    dubbing: {
      path: '/explore',
      title: 'มินิซีรีส์พากย์เสียงหลายภาษา | KanoDrama',
      description: 'ดูมินิซีรีส์แนวตั้งพากย์เสียงคมชัดระดับ HD ที่ KanoDrama',
    },
    watchlist: {
      path: '/account',
      title: 'รายการโปรดและเรื่องที่บันทึกไว้ | KanoDrama',
      description: 'จัดการหนังและซีรีส์ที่บันทึกไว้ โฟลเดอร์ และสถานะการรับชม',
    },
    dashboard: {
      path: '/account',
      title: 'บัญชีของฉัน ประวัติการรับชม และรายการโปรด | KanoDrama',
      description: 'จัดการโปรไฟล์ ประวัติการดูที่ซิงค์ข้ามอุปกรณ์ และความคิดเห็นของคุณ',
    },
  },
  ms: {
    home: {
      path: '/',
      title: 'KanoDrama — Tonton Drama Pendek Menegak HD & Siri Asia Dalam Talian',
      description: 'Strim drama pendek menegak HD, romantik CEO, balas dendam dan siri Asia percuma daripada 49+ platform di KanoDrama.',
    },
    movies: {
      path: '/movies',
      title: 'Tonton Filem HD Percuma — Pawagam Asia & Terkini | KanoDrama',
      description: 'Tonton ribuan filem Full HD, filem Korea, Asia dan keluaran baharu percuma dengan sari kata di KanoDrama.',
    },
    explore: {
      path: '/explore',
      title: 'Teroka Semua Drama Pendek Mengikut Genre & Penapis | KanoDrama',
      description: 'Tapis 49+ platform drama pendek mengikut CEO, Romantik, Balas Dendam, Fantasi, status tamat dan rating.',
    },
    providers: {
      path: '/providers',
      title: 'Direktori Penyedia Drama Pendek — 49+ Platform | KanoDrama',
      description: 'Teroka 49+ platform drama pendek menegak seperti DramaBox, Melolo, NetShort dan ReelShort di KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Drama Pendek Trending Hari Ini — Carta Teratas | KanoDrama',
      description: 'Tonton drama pendek viral #1 hari ini dalam kualiti HD jernih di KanoDrama.',
    },
    latest: {
      path: '/latest',
      title: 'Keluaran Terkini — Drama Pendek Dikemas Kini Setiap Hari | KanoDrama',
      description: 'Ikuti episod baharu dan siri drama pendek terkini yang dikemas kini setiap hari.',
    },
    vip: {
      path: '/vip',
      title: 'Koleksi Drama Pendek Eksklusif VIP | KanoDrama',
      description: 'Temui romantik jutawan eksklusif VIP, kisah balas dendam dan siri mini Full HD.',
    },
    anime: {
      path: '/explore',
      title: 'Siri Pendek Anime & Donghua HD | KanoDrama',
      description: 'Tonton siri animasi pendek dan donghua popular dalam kualiti HD.',
    },
    dubbing: {
      path: '/explore',
      title: 'Siri Drama Pendek Alih Suara | KanoDrama',
      description: 'Nikmati drama pendek menegak dengan alih suara pelbagai bahasa dalam HD.',
    },
    watchlist: {
      path: '/account',
      title: 'Senarai Tontonan & Filem Disimpan Saya | KanoDrama',
      description: 'Urus filem dan drama yang disimpan, folder koleksi serta status tamat.',
    },
    dashboard: {
      path: '/account',
      title: 'Akaun Saya, Sejarah & Senarai Tontonan | KanoDrama',
      description: 'Urus profil, sejarah tontonan merentas peranti, senarai kegemaran dan komen anda.',
    },
  },
  tl: {
    home: {
      path: '/',
      title: 'KanoDrama — Manood ng HD Vertical Short Dramas at Asian Series Online',
      description: 'Mag-stream ng trending HD vertical short dramas, CEO romance, paghihiganti at Asian mini-series nang libre mula 49+ platform sa KanoDrama.',
    },
    movies: {
      path: '/movies',
      title: 'Manood ng Libreng HD Movies Online — Asian Cinema at Bagong Labas | KanoDrama',
      description: 'Panoorin ang libu-libong Full HD na pelikula, Korean movies, at bagong palabas nang libre sa KanoDrama.',
    },
    explore: {
      path: '/explore',
      title: 'Mag-explore ng Short Dramas ayon sa Genre at Filter | KanoDrama',
      description: 'I-filter ang 49+ short drama platforms ayon sa CEO, Romance, Revenge, Fantasy, status at rating.',
    },
    providers: {
      path: '/providers',
      title: 'Direktoryo ng Mga Short Drama Provider — 49+ Platforms | KanoDrama',
      description: 'Tuklasin ang 49+ vertical short drama platforms tulad ng DramaBox, Melolo, NetShort at ReelShort sa KanoDrama.',
    },
    trending: {
      path: '/trending',
      title: 'Trending Short Dramas Ngayon — Nangungunang Serye | KanoDrama',
      description: 'Panoorin ang #1 viral short dramas ngayong araw sa malinaw na HD sa KanoDrama.',
    },
    latest: {
      path: '/latest',
      title: 'Pinakabagong Labas — Araw-araw na Update sa Short Drama | KanoDrama',
      description: 'Abangan ang mga bagong episode at bagong serye na ina-update araw-araw.',
    },
    vip: {
      path: '/vip',
      title: 'Eksklusibong VIP Vertical Short Dramas | KanoDrama',
      description: 'Tuklasin ang mga VIP billionaire romance at revenge mini-series sa Full HD.',
    },
    anime: {
      path: '/explore',
      title: 'Anime at Donghua Short Series HD | KanoDrama',
      description: 'Mag-stream ng mga sikat na maikling anime at donghua sa HD.',
    },
    dubbing: {
      path: '/explore',
      title: 'Mga Dubbed Short Drama Series | KanoDrama',
      description: 'Manood ng mga vertical short dramas na may dubbing sa malinaw na HD.',
    },
    watchlist: {
      path: '/account',
      title: 'Aking Watchlist at Mga Na-save na Palabas | KanoDrama',
      description: 'Pamahalaan ang iyong mga na-save na pelikula, folder ng drama, at tapos nang serye.',
    },
    dashboard: {
      path: '/account',
      title: 'Aking Account, History at Watchlist | KanoDrama',
      description: 'Pamahalaan ang iyong profile, synced watch history, watchlist at mga komento.',
    },
  },
};

export function mapNavTabToMetadataPage(
  tab: NavTab
): keyof (typeof SECTION_SEO_COPY)['en'] {
  switch (tab) {
    case 'movies':
      return 'movies';
    case 'explore':
      return 'explore';
    case 'providers':
      return 'providers';
    case 'ranking':
      return 'trending';
    case 'terbaru':
      return 'latest';
    case 'vip':
      return 'vip';
    case 'anime':
      return 'anime';
    case 'dubbing':
      return 'dubbing';
    case 'mylist':
      return 'watchlist';
    case 'dashboard':
      return 'dashboard';
    default:
      return 'home';
  }
}

function sanitizeMetaText(raw?: string | null): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\$(?:provider|title|genre|tag|episode)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripLeadingWatchPrefix(rawTitle: string): string {
  let clean = sanitizeMetaText(rawTitle);
  const prefixPatterns = [
    /^(?:watch\s+free|free\s+watch|watch\s+online|nonton\s+gratis|gratis\s+nonton|nonton\s+film|streaming\s+gratis|tonton\s+percuma)\b[\s:—–-]*/i,
    /^(?:watch|nonton|stream|streaming|tonton)\b[\s:—–-]+/i,
  ];
  let changed = true;
  let guard = 0;
  while (changed && guard < 4) {
    changed = false;
    guard += 1;
    for (const pattern of prefixPatterns) {
      const next = clean.replace(pattern, '').trim();
      if (next && next !== clean) {
        clean = next;
        changed = true;
      }
    }
  }
  return clean;
}

function hasSubOrDubIndoLabel(text: string): boolean {
  return /\b(?:sub\s?indo|sub\s?indonesia|subtitle\s+indonesia|dub\s?indo|sulih\s?suara|indo\s?sub)\b/i.test(
    text
  );
}

function truncateMetaDescription(raw: string, maxLen = 158): string {
  const clean = sanitizeMetaText(raw);
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen - 3);
  const lastSpace = slice.lastIndexOf(' ');
  const boundary = lastSpace >= Math.floor((maxLen - 3) * 0.65) ? slice.slice(0, lastSpace) : slice;
  return `${boundary.replace(/[,:;.\-–—\s]+$/, '').trim()}...`;
}

function composeRichMetaDescription(
  rawDesc: string | undefined,
  fallbackDesc: string,
  watchSuffix: string
): string {
  const cleanRaw = sanitizeMetaText(rawDesc);
  if (!cleanRaw) {
    return truncateMetaDescription(fallbackDesc);
  }
  const hasBrandOrWatchHint = /kano\s?drama|nonton|stream|watch|full hd|episode/i.test(cleanRaw);
  if (!hasBrandOrWatchHint && cleanRaw.length <= 112 && watchSuffix) {
    const punctuated = /[.!?]$/.test(cleanRaw) ? cleanRaw : `${cleanRaw}.`;
    const combined = `${punctuated} ${watchSuffix}`.trim();
    if (combined.length <= 158) {
      return combined;
    }
  }
  return truncateMetaDescription(cleanRaw);
}

/**
 * Unified multi-language metadata generator (`generateMetadata`) for client SEO sync and SSR.
 */
export function generateMetadata(
  input: LocalizedMetadataInput
): GeneratedSeoMetadata {
  const lang: LanguageCode = input.lang ?? 'en';
  const meta = getLanguageMeta(lang);
  const origin = (input.origin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  const defaultOgImage = `${origin}/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png`;
  const image = input.image || defaultOgImage;

  let title = '';
  let description = '';
  let path = input.pathname || '/';
  let ogType: GeneratedSeoMetadata['openGraph']['type'] = 'website';

  const watchSuffixMap: Record<LanguageCode, string> = {
    id: 'Nonton gratis HD di KanoDrama.',
    en: 'Watch free in HD on KanoDrama.',
    cn: '在 KanoDrama 高清免费观看。',
    vi: 'Xem miễn phí HD tại KanoDrama.',
    es: 'Ver gratis en HD en KanoDrama.',
    ko: 'KanoDrama에서 무료 HD 감상.',
    ja: 'KanoDramaで無料HD視聴。',
    th: 'ดูฟรีระดับ HD ที่ KanoDrama',
    ms: 'Tonton percuma HD di KanoDrama.',
    tl: 'Panoorin nang libre sa HD sa KanoDrama.',
  };

  if (input.page === 'drama') {
    const dramaTitle =
      stripLeadingWatchPrefix(input.title || '') || 'Short Drama';
    const epCount = Math.max(1, input.episodeCount || 1);
    const epsTag = epCount > 1 ? ` (${epCount} Eps)` : '';
    const hasSubIndo = hasSubOrDubIndoLabel(dramaTitle);
    const subIndoTag = hasSubIndo ? '' : ' Sub Indo';
    ogType = input.episodeNumber ? 'video.episode' : 'video.tv_show';

    if (input.episodeNumber && input.episodeNumber > 0) {
      const epNum = input.episodeNumber;
      const showTotalCount = epCount > 1 && epCount >= epNum;
      const epCountLabel = showTotalCount ? ` (${epCount} Eps)` : '';
      const epTitleMap: Record<LanguageCode, string> = {
        id: `Nonton Gratis ${dramaTitle} Episode ${epNum}${subIndoTag} HD${epCountLabel} | KanoDrama`,
        en: `Watch Free ${dramaTitle} Episode ${epNum} Online HD${epCountLabel} | KanoDrama`,
        cn: `免费观看 ${dramaTitle} 第${epNum}集 高清${epCountLabel} | KanoDrama`,
        vi: `Xem Miễn Phí ${dramaTitle} Tập ${epNum} Vietsub HD${epCountLabel} | KanoDrama`,
        es: `Ver Gratis ${dramaTitle} Episodio ${epNum} Online HD${epCountLabel} | KanoDrama`,
        ko: `무료 감상 ${dramaTitle} ${epNum}화 HD${epCountLabel} | KanoDrama`,
        ja: `無料視聴 ${dramaTitle} 第${epNum}話 HD${epCountLabel} | KanoDrama`,
        th: `ดูฟรี ${dramaTitle} ตอนที่ ${epNum} ซับไทย HD${epCountLabel} | KanoDrama`,
        ms: `Tonton Percuma ${dramaTitle} Episod ${epNum} Sari Kata Melayu HD${epCountLabel} | KanoDrama`,
        tl: `Panoorin Nang Libre ${dramaTitle} Episode ${epNum} Online HD${epCountLabel} | KanoDrama`,
      };
      const epDescMap: Record<LanguageCode, string> = {
        id: showTotalCount
          ? `Nonton gratis ${dramaTitle} Episode ${epNum} dari ${epCount} episode subtitle Indonesia kualitas HD jernih di KanoDrama.`
          : `Nonton gratis ${dramaTitle} Episode ${epNum} subtitle Indonesia kualitas HD jernih di KanoDrama.`,
        en: showTotalCount
          ? `Watch free ${dramaTitle} Episode ${epNum} of ${epCount} in crisp HD vertical theater mode on KanoDrama.`
          : `Watch free ${dramaTitle} Episode ${epNum} in crisp HD vertical theater mode on KanoDrama.`,
        cn: showTotalCount
          ? `在 KanoDrama 免费高清观看《${dramaTitle}》第${epNum}集（共${epCount}集）。`
          : `在 KanoDrama 免费高清观看《${dramaTitle}》第${epNum}集。`,
        vi: showTotalCount
          ? `Xem miễn phí ${dramaTitle} Tập ${epNum}/${epCount} chuẩn HD Vietsub mượt mà tại KanoDrama.`
          : `Xem miễn phí ${dramaTitle} Tập ${epNum} chuẩn HD Vietsub mượt mà tại KanoDrama.`,
        es: showTotalCount
          ? `Ver gratis ${dramaTitle} Episodio ${epNum} de ${epCount} en calidad HD en KanoDrama.`
          : `Ver gratis ${dramaTitle} Episodio ${epNum} en calidad HD en KanoDrama.`,
        ko: showTotalCount
          ? `KanoDrama에서 ${dramaTitle} ${epNum}화(총 ${epCount}부작)를 선명한 HD 화질로 무료 감상하세요.`
          : `KanoDrama에서 ${dramaTitle} ${epNum}화를 선명한 HD 화질로 무료 감상하세요.`,
        ja: showTotalCount
          ? `KanoDramaで『${dramaTitle}』第${epNum}話（全${epCount}話）を高画質HDで無料視聴。`
          : `KanoDramaで『${dramaTitle}』第${epNum}話を高画質HDで無料視聴。`,
        th: showTotalCount
          ? `ดูฟรี ${dramaTitle} ตอนที่ ${epNum} จาก ${epCount} ตอน คมชัดระดับ HD ได้ที่ KanoDrama`
          : `ดูฟรี ${dramaTitle} ตอนที่ ${epNum} คมชัดระดับ HD ได้ที่ KanoDrama`,
        ms: showTotalCount
          ? `Tonton percuma ${dramaTitle} Episod ${epNum} daripada ${epCount} dalam kualiti HD jernih di KanoDrama.`
          : `Tonton percuma ${dramaTitle} Episod ${epNum} dalam kualiti HD jernih di KanoDrama.`,
        tl: showTotalCount
          ? `Panoorin nang libre ang ${dramaTitle} Episode ${epNum} ng ${epCount} sa malinaw na HD sa KanoDrama.`
          : `Panoorin nang libre ang ${dramaTitle} Episode ${epNum} sa malinaw na HD sa KanoDrama.`,
      };
      title = epTitleMap[lang];
      description = composeRichMetaDescription(
        input.description,
        epDescMap[lang],
        watchSuffixMap[lang]
      );
    } else {
      const fullTitleMap: Record<LanguageCode, string> = {
        id: `Nonton Gratis ${dramaTitle}${subIndoTag} Full Episode${epsTag} | KanoDrama`,
        en: `Watch Free ${dramaTitle} Full Episodes Online HD${epsTag} | KanoDrama`,
        cn: `免费观看 ${dramaTitle} 高清全集${epsTag} | KanoDrama`,
        vi: `Xem Miễn Phí ${dramaTitle} Trọn Bộ HD${epsTag} | KanoDrama`,
        es: `Ver Gratis ${dramaTitle} Capítulos Completos HD${epsTag} | KanoDrama`,
        ko: `무료 감상 ${dramaTitle} 전편 HD${epsTag} | KanoDrama`,
        ja: `無料視聴 ${dramaTitle} 全話HD${epsTag} | KanoDrama`,
        th: `ดูฟรี ${dramaTitle} ครบทุกตอน HD${epsTag} | KanoDrama`,
        ms: `Tonton Percuma ${dramaTitle} Episod Penuh HD${epsTag} | KanoDrama`,
        tl: `Panoorin Nang Libre ${dramaTitle} Full Episodes HD${epsTag} | KanoDrama`,
      };
      const fullDescMap: Record<LanguageCode, string> = {
        id: `Nonton gratis ${dramaTitle}${subIndoTag} full${epCount > 1 ? ` ${epCount}` : ''} episode kualitas HD dan baca sinopsis lengkapnya di KanoDrama.`,
        en: `Watch free ${dramaTitle}${epCount > 1 ? ` (${epCount} episodes)` : ''} full episodes online in crisp HD vertical cinema mode on KanoDrama.`,
        cn: `在 KanoDrama 免费高清观看《${dramaTitle}》剧情简介与全集${epCount > 1 ? `（共${epCount}集）` : ''}。`,
        vi: `Xem miễn phí trọn bộ ${dramaTitle}${epCount > 1 ? ` (${epCount} tập)` : ''} chất lượng HD trên KanoDrama.`,
        es: `Ver gratis episodios completos de ${dramaTitle}${epCount > 1 ? ` (${epCount} episodios)` : ''} en calidad HD en KanoDrama.`,
        ko: `KanoDrama에서 ${dramaTitle} 줄거리와 전편${epCount > 1 ? `(${epCount}부작)` : ''}을 선명한 HD로 무료 시청하세요.`,
        ja: `KanoDramaで『${dramaTitle}』のあらすじ＆全話${epCount > 1 ? `（全${epCount}話）` : ''}を高画質HDで無料視聴。`,
        th: `ดูฟรีซีรีส์ ${dramaTitle} ครบทุกตอน${epCount > 1 ? ` (${epCount} ตอน)` : ''} คมชัดระดับ HD บน KanoDrama`,
        ms: `Tonton percuma ${dramaTitle}${epCount > 1 ? ` (${epCount} episod)` : ''} dalam kualiti HD di KanoDrama.`,
        tl: `Panoorin nang libre ang ${dramaTitle}${epCount > 1 ? ` (${epCount} episodes)` : ''} sa malinaw na HD sa KanoDrama.`,
      };
      title = fullTitleMap[lang];
      description = composeRichMetaDescription(
        input.description,
        fullDescMap[lang],
        watchSuffixMap[lang]
      );
    }
  } else if (input.page === 'movie') {
    const movieTitle =
      stripLeadingWatchPrefix(input.title || '') || 'HD Movie';
    const epCount = Math.max(1, input.episodeCount || 1);
    const epsTag = epCount > 1 ? ` (${epCount} Eps)` : '';
    const epNum = input.episodeNumber && input.episodeNumber > 1 ? input.episodeNumber : 0;
    const hasSubIndo = hasSubOrDubIndoLabel(movieTitle);
    const subIndoTag = hasSubIndo ? '' : ' Sub Indo';
    ogType = epNum > 1 ? 'video.episode' : 'video.movie';

    if (epNum > 1) {
      const showTotalCount = epCount > 1 && epCount >= epNum;
      const epCountLabel = showTotalCount ? ` (${epCount} Eps)` : '';
      const movieEpTitleMap: Record<LanguageCode, string> = {
        id: `Nonton Gratis ${movieTitle} Episode ${epNum}${subIndoTag} HD${epCountLabel} | KanoDrama`,
        en: `Watch Free ${movieTitle} Episode ${epNum} Online HD${epCountLabel} | KanoDrama`,
        cn: `免费观看 ${movieTitle} 第${epNum}集 高清${epCountLabel} | KanoDrama`,
        vi: `Xem Miễn Phí ${movieTitle} Tập ${epNum} HD Vietsub${epCountLabel} | KanoDrama`,
        es: `Ver Gratis ${movieTitle} Episodio ${epNum} Online HD${epCountLabel} | KanoDrama`,
        ko: `무료 감상 ${movieTitle} ${epNum}화 HD${epCountLabel} | KanoDrama`,
        ja: `無料視聴 ${movieTitle} 第${epNum}話 HD${epCountLabel} | KanoDrama`,
        th: `ดูฟรี ${movieTitle} ตอนที่ ${epNum} ซับไทย HD${epCountLabel} | KanoDrama`,
        ms: `Tonton Percuma ${movieTitle} Episod ${epNum} HD${epCountLabel} | KanoDrama`,
        tl: `Panoorin Nang Libre ${movieTitle} Episode ${epNum} HD${epCountLabel} | KanoDrama`,
      };
      const movieEpDescMap: Record<LanguageCode, string> = {
        id: `Nonton gratis ${movieTitle} Episode ${epNum}${subIndoTag} kualitas Full HD di KanoDrama.`,
        en: `Watch free ${movieTitle} Episode ${epNum} online in Full HD with subtitles on KanoDrama.`,
        cn: `在 KanoDrama 免费高清在线观看《${movieTitle}》第${epNum}集。`,
        vi: `Xem miễn phí ${movieTitle} Tập ${epNum} chất lượng Full HD trên KanoDrama.`,
        es: `Ver gratis ${movieTitle} Episodio ${epNum} en Full HD con subtítulos en KanoDrama.`,
        ko: `KanoDrama에서 ${movieTitle} ${epNum}화를 Full HD 자막과 함께 무료 감상하세요.`,
        ja: `KanoDramaで『${movieTitle}』第${epNum}話をFull HD字幕付きで無料視聴。`,
        th: `ดูฟรี ${movieTitle} ตอนที่ ${epNum} ความคมชัด Full HD ที่ KanoDrama`,
        ms: `Tonton percuma ${movieTitle} Episod ${epNum} dalam kualiti Full HD di KanoDrama.`,
        tl: `Panoorin nang libre ang ${movieTitle} Episode ${epNum} sa Full HD sa KanoDrama.`,
      };
      title = movieEpTitleMap[lang];
      description = composeRichMetaDescription(
        input.description,
        movieEpDescMap[lang],
        watchSuffixMap[lang]
      );
    } else if (epCount > 1) {
      const movieSeriesTitleMap: Record<LanguageCode, string> = {
        id: `Nonton Gratis ${movieTitle}${subIndoTag} Full Episode${epsTag} | KanoDrama`,
        en: `Watch Free ${movieTitle} Full Episodes Online HD${epsTag} | KanoDrama`,
        cn: `免费观看 ${movieTitle} 高清全集${epsTag} | KanoDrama`,
        vi: `Xem Miễn Phí ${movieTitle} Trọn Bộ HD${epsTag} | KanoDrama`,
        es: `Ver Gratis ${movieTitle} Capítulos Completos HD${epsTag} | KanoDrama`,
        ko: `무료 감상 ${movieTitle} 전편 HD${epsTag} | KanoDrama`,
        ja: `無料視聴 ${movieTitle} 全話HD${epsTag} | KanoDrama`,
        th: `ดูฟรี ${movieTitle} ครบทุกตอน HD${epsTag} | KanoDrama`,
        ms: `Tonton Percuma ${movieTitle} Episod Penuh HD${epsTag} | KanoDrama`,
        tl: `Panoorin Nang Libre ${movieTitle} Full Episodes HD${epsTag} | KanoDrama`,
      };
      const movieSeriesDescMap: Record<LanguageCode, string> = {
        id: `Nonton gratis ${movieTitle}${subIndoTag} full ${epCount} episode kualitas Full HD di KanoDrama.`,
        en: `Watch free ${movieTitle} (${epCount} episodes) online in Full HD with subtitles on KanoDrama.`,
        cn: `在 KanoDrama 免费高清观看《${movieTitle}》全${epCount}集。`,
        vi: `Xem miễn phí trọn bộ ${movieTitle} (${epCount} tập) Full HD trên KanoDrama.`,
        es: `Ver gratis ${movieTitle} (${epCount} episodios) en Full HD en KanoDrama.`,
        ko: `KanoDrama에서 ${movieTitle} 전편(${epCount}부작)을 Full HD로 무료 감상하세요.`,
        ja: `KanoDramaで『${movieTitle}』全${epCount}話をFull HDで無料視聴。`,
        th: `ดูฟรี ${movieTitle} ครบทุกตอน (${epCount} ตอน) Full HD ที่ KanoDrama`,
        ms: `Tonton percuma ${movieTitle} (${epCount} episod) dalam kualiti Full HD di KanoDrama.`,
        tl: `Panoorin nang libre ang ${movieTitle} (${epCount} episodes) sa Full HD sa KanoDrama.`,
      };
      title = movieSeriesTitleMap[lang];
      description = composeRichMetaDescription(
        input.description,
        movieSeriesDescMap[lang],
        watchSuffixMap[lang]
      );
    } else {
      const movieTitleMap: Record<LanguageCode, string> = {
        id: `Nonton Gratis ${movieTitle}${subIndoTag} Full Movie HD | KanoDrama`,
        en: `Watch Free ${movieTitle} Full Movie Online HD | KanoDrama`,
        cn: `免费观看电影 ${movieTitle} 高清完整版 | KanoDrama`,
        vi: `Xem Miễn Phí Phim ${movieTitle} Full HD Vietsub | KanoDrama`,
        es: `Ver Gratis Película ${movieTitle} Completa HD | KanoDrama`,
        ko: `무료 감상 영화 ${movieTitle} Full HD | KanoDrama`,
        ja: `無料視聴 映画 ${movieTitle} Full HD | KanoDrama`,
        th: `ดูฟรีหนัง ${movieTitle} เต็มเรื่อง HD | KanoDrama`,
        ms: `Tonton Percuma Filem ${movieTitle} Penuh HD | KanoDrama`,
        tl: `Panoorin Nang Libre ${movieTitle} Full Movie HD | KanoDrama`,
      };
      const movieDescMap: Record<LanguageCode, string> = {
        id: `Nonton gratis film ${movieTitle}${subIndoTag} kualitas Full HD dan baca sinopsis lengkapnya di KanoDrama.`,
        en: `Watch free ${movieTitle} full movie in HD online with subtitles on KanoDrama.`,
        cn: `在 KanoDrama 免费高清在线观看电影《${movieTitle}》剧情简介与正片。`,
        vi: `Xem miễn phí phim ${movieTitle} chất lượng Full HD trên KanoDrama.`,
        es: `Ver gratis la película completa ${movieTitle} en Full HD con subtítulos en KanoDrama.`,
        ko: `KanoDrama에서 영화 ${movieTitle} Full HD 자막 영상을 무료 감상하세요.`,
        ja: `KanoDramaで映画『${movieTitle}』Full HD字幕付き本編を無料視聴。`,
        th: `ดูฟรีภาพยนตร์ ${movieTitle} ความคมชัด Full HD พร้อมซับไตเติ้ลที่ KanoDrama`,
        ms: `Tonton percuma filem ${movieTitle} dalam kualiti Full HD di KanoDrama.`,
        tl: `Panoorin nang libre ang pelikulang ${movieTitle} sa Full HD sa KanoDrama.`,
      };
      title = movieTitleMap[lang];
      description = composeRichMetaDescription(
        input.description,
        movieDescMap[lang],
        watchSuffixMap[lang]
      );
    }
  } else if (input.page === 'tag') {
    const tag = sanitizeMetaText(input.tag) || 'Drama';
    const tagTitleMap: Record<LanguageCode, string> = {
      id: `Nonton Gratis Drama Pendek ${tag} — Daftar Judul HD | KanoDrama`,
      en: `Watch Free ${tag} Vertical Short Dramas Online HD | KanoDrama`,
      cn: `${tag} 热门短剧合集 — 免费高清在线观看 | KanoDrama`,
      vi: `Xem Miễn Phí Phim Ngắn ${tag} — Danh Sách HD | KanoDrama`,
      es: `Ver Gratis Dramas Cortos de ${tag} Online HD | KanoDrama`,
      ko: `무료 감상 ${tag} 인기 숏드라마 — HD 모아보기 | KanoDrama`,
      ja: `無料視聴 ${tag} ショートドラマ特集 — HD | KanoDrama`,
      th: `ดูฟรีมินิซีรีส์แนว ${tag} — ออนไลน์ HD | KanoDrama`,
      ms: `Tonton Percuma Drama Pendek ${tag} Dalam Talian HD | KanoDrama`,
      tl: `Panoorin Nang Libre ${tag} Vertical Short Dramas sa HD | KanoDrama`,
    };
    const tagDescMap: Record<LanguageCode, string> = {
      id: `Nonton gratis drama pendek ${tag} terpopuler dari 49+ platform dalam kualitas HD di KanoDrama.`,
      en: `Watch free trending ${tag} vertical short dramas and binge-worthy mini-series across 49+ platforms in HD on KanoDrama.`,
      cn: `在 KanoDrama 免费高清观看热门 ${tag} 竖屏短剧合集。`,
      vi: `Xem miễn phí tuyển tập phim ngắn ${tag} thịnh hành từ 49+ nền tảng chuẩn HD.`,
      es: `Ver gratis los mejores dramas cortos verticales de ${tag} de 49+ plataformas en HD.`,
      ko: `49개+ 플랫폼의 인기 ${tag} 세로형 숏드라마를 HD로 무료 감상하세요.`,
      ja: `49以上の配信元から厳選された${tag}ショートドラマをHD画質で無料視聴。`,
      th: `ดูฟรีมินิซีรีส์แนว ${tag} ยอดนิยมจากกว่า 49 แพลตฟอร์มในระดับ HD`,
      ms: `Tonton percuma drama pendek ${tag} paling popular daripada 49+ platform dalam HD.`,
      tl: `Panoorin nang libre ang sikat na ${tag} vertical short dramas mula 49+ platforms sa HD.`,
    };
    title = tagTitleMap[lang];
    description = composeRichMetaDescription(
      input.description,
      tagDescMap[lang],
      watchSuffixMap[lang]
    );
  } else if (input.page === 'provider') {
    const providerLabel = sanitizeMetaText(input.providerName || input.title) || 'Drama Provider';
    const providerTitleMap: Record<LanguageCode, string> = {
      id: `Nonton Gratis Drama Pendek ${providerLabel} Sub Indo Full Episode HD | KanoDrama`,
      en: `Watch Free ${providerLabel} Vertical Short Dramas Online HD | KanoDrama`,
      cn: `免费观看 ${providerLabel} 热门短剧在线高清 | KanoDrama`,
      vi: `Xem Miễn Phí Phim Ngắn ${providerLabel} HD | KanoDrama`,
      es: `Ver Gratis Dramas Cortos de ${providerLabel} HD | KanoDrama`,
      ko: `무료 감상 ${providerLabel} 숏드라마 HD 다시보기 | KanoDrama`,
      ja: `無料視聴 ${providerLabel} ショートドラマ高画質HD | KanoDrama`,
      th: `ดูฟรีมินิซีรีส์ ${providerLabel} ออนไลน์ HD | KanoDrama`,
      ms: `Tonton Percuma Drama Pendek ${providerLabel} HD | KanoDrama`,
      tl: `Panoorin Nang Libre ${providerLabel} Short Dramas sa HD | KanoDrama`,
    };
    const providerDescMap: Record<LanguageCode, string> = {
      id: `Nonton gratis koleksi drama pendek vertikal terbaik dari ${providerLabel} dengan kualitas HD dan subtitle lengkap di KanoDrama.`,
      en: `Watch free trending vertical short dramas, rankings, and new releases from ${providerLabel} in crisp HD on KanoDrama.`,
      cn: `在 KanoDrama 免费高清观看来自 ${providerLabel} 的最新热门竖屏短剧与人气榜单剧集。`,
      vi: `Xem miễn phí bộ sưu tập phim ngắn dọc nổi bật, bảng xếp hạng và tập mới từ ${providerLabel} chuẩn HD tại KanoDrama.`,
      es: `Ver gratis dramas cortos verticales, rankings y estrenos de ${providerLabel} en HD en KanoDrama.`,
      ko: `KanoDrama에서 ${providerLabel}의 최신 인기 세로형 숏드라마와 랭킹 작품을 무료 HD로 감상하세요.`,
      ja: `KanoDramaで ${providerLabel} の人気ショートドラマ、ランキング、最新作を無料HDで楽しめます。`,
      th: `ดูฟรีคอลเลกชันมินิซีรีส์แนวตั้งยอดนิยมและตอนใหม่จาก ${providerLabel} ระดับ HD ที่ KanoDrama`,
      ms: `Tonton percuma koleksi drama pendek menegak terbaik, carta dan keluaran baharu daripada ${providerLabel} dalam HD di KanoDrama.`,
      tl: `Panoorin nang libre ang mga sikat na vertical short dramas, rankings, at bagong labas mula ${providerLabel} sa malinaw na HD sa KanoDrama.`,
    };
    title = sanitizeMetaText(input.title) || providerTitleMap[lang];
    description = composeRichMetaDescription(
      input.description,
      providerDescMap[lang],
      watchSuffixMap[lang]
    );
  } else {
    const sectionKey = input.page === 'account' ? 'dashboard' : input.page;
    const sectionCopy = SECTION_SEO_COPY[lang][sectionKey] ?? SECTION_SEO_COPY.en.home;
    title = sanitizeMetaText(input.title) || sectionCopy.title;
    description = truncateMetaDescription(
      sanitizeMetaText(input.description) || sectionCopy.description
    );
    if (!input.pathname) {
      path = sectionCopy.path;
    }
  }

  const trimmedDesc = truncateMetaDescription(description, 158);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const canonicalUrl = `${origin}${normalizedPath}`;

  const alternates: Record<string, string> = {
    en: canonicalUrl,
    id: canonicalUrl,
    'zh-CN': canonicalUrl,
    vi: canonicalUrl,
    es: canonicalUrl,
    ko: canonicalUrl,
    ja: canonicalUrl,
    th: canonicalUrl,
    ms: canonicalUrl,
    tl: canonicalUrl,
    'x-default': canonicalUrl,
  };

  const keywords = (
    input.keywords && input.keywords.length > 0
      ? input.keywords
      : [
          'KanoDrama',
          'kano-drama.xyz',
          'Short Drama',
          'Drama Pendek',
          'Asian Series',
          'Chinese Drama',
          'Korean Drama',
          'DramaBox',
          'NetShort',
          lang === 'id' ? 'Nonton Gratis Drama Sub Indo' : 'Watch Free Mini Series & Movies Online',
        ]
  )
    .filter(Boolean)
    .join(', ');

  const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(
    origin
  );
  const effectiveOrigin = !isLocalOrigin
    ? origin.replace(/^http:\/\//i, 'https://')
    : origin;
  const ogOrigin = isLocalOrigin ? DEFAULT_SITE_ORIGIN : effectiveOrigin;
  const ogImageUrl = buildOgImageEndpointUrl(
    input.image ||
      '/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png',
    effectiveOrigin,
    title
  );
  const ogSecureUrl = ogImageUrl.startsWith('https://')
    ? ogImageUrl
    : ogImageUrl.startsWith(`${origin}/`) && !ogOrigin.startsWith('http://')
    ? `${ogOrigin}${ogImageUrl.slice(origin.length)}`
    : ogImageUrl.replace(/^http:\/\//i, 'https://');

  const ogImageMeta: OpenGraphImageMeta = {
    url: ogImageUrl,
    secureUrl: ogSecureUrl,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: title,
  };

  return {
    title,
    description: trimmedDesc,
    keywords,
    htmlLang: meta.htmlLang,
    ogLocale: meta.ogLocale,
    inLanguage: meta.htmlLang,
    canonicalUrl,
    image: ogImageUrl,
    alternates,
    openGraph: {
      siteName: 'KanoDrama',
      locale: meta.ogLocale,
      type: ogType,
      title,
      description: trimmedDesc,
      url: canonicalUrl,
      image: ogImageUrl,
      images: [ogImageMeta],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: trimmedDesc,
      image: ogImageUrl,
    },
  };
}
