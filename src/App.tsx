import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  Bookmark,
  Flame,
  Clock,
  Loader2,
  AlertCircle,
  RotateCcw,
  Home,
  Search,
  Crown,
  Film,
  Sparkles,
  Layers,
  FolderPlus,
  Trash2,
  User,
  CheckCircle2,
  Tag,
  X,
  Compass,
  ChevronRight,
  Clapperboard,
  Lock,
} from 'lucide-react';
import {
  ACTIVE_PROVIDER_NAMES,
  ALL_PROVIDER_ADAPTERS,
  anyReelProvider,
  blinkDramaProvider,
  cubeTvProvider,
  dramaBoxV2Provider,
  dramaOraProvider,
  dramaWaveProvider,
  flareFlowProvider,
  flickReelsProvider,
  freeReelsProvider,
  freeShortProvider,
  goodShortProvider,
  happyShortProvider,
  iqiyiProvider,
  joyReelsProvider,
  loveShotsProvider,
  meloShortProvider,
  meloLoV2Provider,
  moboReelsProvider,
  netShortProvider,
  petaDramaProvider,
  PROVIDER_FILTERS,
  shotShortProvider,
  syncAllProvidersLanguage,
  toonShortProvider,
  viglooProvider,
} from './services/dramaProviders';
import {
  clearClientHomeCache,
  fetchHomeCatalog,
  getPeekCachedHomeCatalog,
  getPeekCachedHomeEntry,
  hasHomeItems,
  peekSsrHomeBootstrap,
} from './services/homeService';
import {
  fetchLk21Detail,
  fetchLk21EpisodesAsEpisodeItems,
  fetchLookSeriesDetail,
  fetchLookSeriesEpisodesAsEpisodeItems,
  mapLk21EpisodesToEpisodeItems,
  movieToDramaItem,
} from './services/movieService';
import { useDramaContext } from './context/DramaContext';
import {
  DEFAULT_SITE_ORIGIN,
  getDictionary,
  getLanguageMeta,
} from './i18n/helpers';
import {
  getProviderRouteSlug,
  isKnownProviderRouteSlug,
  parseProviderFromRouteSlug,
} from './constants/providerLogos';
import {
  findDramaInLookupCache,
  getDramaPath,
  getWatchPath,
  saveDramaLookupCache,
  slugifyDramaTitle,
  syncDramaDocumentSeo,
  syncHomeDocumentSeo,
  syncProviderDocumentSeo,
  syncSectionDocumentSeo,
} from './utils/seo';
import { buildPickedForYouRecommendations } from './utils/recommendations';
import type {
  DramaItem,
  EpisodeItem,
  HomeCatalogResponse,
  LanguageCode,
  LanguagePreference,
  MediaProviderName,
  MovieDetail,
  MovieEpisodeItem,
  NavTab,
  ProviderId,
  ProviderName,
  WatchStatusFilter,
} from './types/drama';
import { Navbar, DesktopSidebar } from './components/Navbar';
import { HeroSpotlight } from './components/HeroSpotlight';
import { CarouselRow } from './components/CarouselRow';
import { DramaCard } from './components/DramaCard';
import { LazySection } from './components/LazySection';
import { CarouselSkeleton, DetailPageSkeleton } from './components/SkeletonCard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ToastContainer } from './components/ToastContainer';
import { SpotlightFeedbackModal } from './components/SpotlightFeedbackModal';
import { Footer } from './components/Footer';

const ExploreView = lazy(() => import('./components/ExploreView'));
const MoviesView = lazy(() =>
  import('./components/MoviesView').then((m) => ({
    default: m.MoviesView,
  }))
);
const ProviderEndpointSection = lazy(
  () => import('./components/ProviderEndpointSection')
);
const ProviderDirectoryView = lazy(() =>
  import('./components/ProviderDirectoryView').then((m) => ({
    default: m.ProviderDirectoryView,
  }))
);
const SeoLandingPage = lazy(() =>
  import('./components/SeoLandingPage').then((m) => ({
    default: m.SeoLandingPage,
  }))
);
const DramaDetailPage = lazy(() =>
  import('./components/DramaDetailPage').then((m) => ({
    default: m.DramaDetailPage,
  }))
);
const CinemaVideoPlayer = lazy(() =>
  import('./components/CinemaVideoPlayer').then((m) => ({
    default: m.CinemaVideoPlayer,
  }))
);
const MovieVideoPlayer = lazy(() =>
  import('./components/MovieVideoPlayer').then((m) => ({
    default: m.MovieVideoPlayer,
  }))
);
const SearchModal = lazy(() =>
  import('./components/SearchModal').then((m) => ({
    default: m.SearchModal,
  }))
);
const ProviderHubModal = lazy(() =>
  import('./components/ProviderHubModal').then((m) => ({
    default: m.ProviderHubModal,
  }))
);
const AuthProfileModal = lazy(() =>
  import('./components/AuthProfileModal').then((m) => ({
    default: m.AuthProfileModal,
  }))
);
const HelpCenterModal = lazy(() =>
  import('./components/HelpCenterModal').then((m) => ({
    default: m.HelpCenterModal,
  }))
);
const UserDashboard = lazy(() =>
  import('./components/UserDashboard').then((m) => ({
    default: m.UserDashboard,
  }))
);

interface FeedState {
  items: DramaItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

interface InitialSsrPayload {
  bookId?: string;
  drama?: DramaItem | null;
  episodes?: EpisodeItem[];
}

interface InitialMovieSsrPayload {
  movie?: MovieDetail | null;
  episodes?: MovieEpisodeItem[];
}

interface InitialNotFoundPayload {
  pathname?: string;
  kind?: 'drama' | 'movie' | 'provider';
}

declare global {
  interface Window {
    __INITIAL_HOME__?: HomeCatalogResponse;
    __INITIAL_DRAMA__?: InitialSsrPayload;
    __INITIAL_MOVIE__?: InitialMovieSsrPayload;
    __INITIAL_NOT_FOUND__?: InitialNotFoundPayload;
  }
}

const INITIAL_FEED: FeedState = {
  items: [],
  page: 1,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

const IDLE_FEED: FeedState = {
  items: [],
  page: 1,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
};

type ExtraProviderName = Exclude<
  ProviderName,
  'DramaBoxV2' | 'NetShort' | 'AnyReel' | 'MeloLoV2'
>;

const EXTRA_PROVIDER_NAMES: ExtraProviderName[] = [
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

interface ExtraProviderFeedBundle {
  main: FeedState;
  rank: FeedState;
  newest: FeedState;
  vip: FeedState;
  anime?: FeedState;
  dubbing?: FeedState;
  special?: FeedState;
  fullLoaded: boolean;
}

function createInitialExtraFeeds(): Record<
  ExtraProviderName,
  ExtraProviderFeedBundle
> {
  const out = {} as Record<ExtraProviderName, ExtraProviderFeedBundle>;
  for (const name of EXTRA_PROVIDER_NAMES) {
    out[name] = {
      main: { ...INITIAL_FEED },
      rank: { ...IDLE_FEED },
      newest: { ...IDLE_FEED },
      vip: { ...IDLE_FEED },
      anime:
        name === 'MoboReels' ||
        name === 'FreeReels' ||
        name === 'GoodShort' ||
        name === 'iQIYI' ||
        name === 'Bstation' ||
        name === 'Anichin' ||
        name === 'DonghuaQueen' ||
        name === 'Samehadaku' ||
        name === 'AnimeX'
          ? { ...IDLE_FEED }
          : undefined,
      dubbing:
        name === 'FreeReels' || name === 'GoodShort'
          ? { ...IDLE_FEED }
          : undefined,
      special: { ...IDLE_FEED },
      fullLoaded: false,
    };
  }
  return out;
}

function isExtraProvider(p: ProviderId): p is ExtraProviderName {
  return (EXTRA_PROVIDER_NAMES as string[]).includes(p);
}

function parseProviderName(raw: string | null | undefined): ProviderName | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toLowerCase();
  if (norm === 'stardust') return 'StardustTV';
  if (norm === 'dramabox' || norm === 'dramaboxv2' || norm === 'dramabox_v2') return 'DramaBoxV2';
  if (norm === 'melolo' || norm === 'melolov2' || norm === 'melolo_v2') return 'MeloLoV2';
  if (norm === 'stareel' || norm === 'starreel') return 'StarReel';
  if (norm === 'dynastyshorts' || norm === 'dynasty_shorts') return 'DynastyShorts';
  if (norm === 'storyreel' || norm === 'storyreelv2' || norm === 'storyreel_v2') return 'StoryReelV2';
  if (norm === 'vibeshort' || norm === 'vibeshortv2' || norm === 'vibeshort_v2') return 'VibeShortV2';
  if (norm === 'shortmax' || norm === 'shortmaxv2' || norm === 'shortmax_v2') return 'ShortMaxV2';
  if (norm === 'idrama' || norm === 'idramav2' || norm === 'idrama_v2') return 'iDramaV2';
  if (norm === 'reelshort' || norm === 'reelshortv2' || norm === 'reelshort_v2') return 'ReelShortV2';
  return ACTIVE_PROVIDER_NAMES.find((p) => p.toLowerCase() === norm);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseProviderRouteFromLocation(): {
  provider?: ProviderName;
  invalidSlug?: string;
} | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/provider\/([^/]+)\/?$/i);
  if (!match) return null;
  const rawSlug = safeDecodeURIComponent(match[1]).trim();
  if (!rawSlug) return null;
  const matched = parseProviderFromRouteSlug(rawSlug);
  if (matched && matched !== 'LK21' && matched !== 'LookSeries') {
    return { provider: matched };
  }
  return { invalidSlug: rawSlug };
}

const SELECTED_PROVIDER_STORAGE_KEY = 'kano_drama_selected_provider_v1';

function readPersistedProviderFilter(): ProviderId {
  if (typeof window === 'undefined') return 'All';
  try {
    const raw = sessionStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY);
    if (!raw || raw === 'All') return 'All';
    return parseProviderName(raw) ?? 'All';
  } catch {
    return 'All';
  }
}

function parseTabFromLocation(): NavTab {
  if (typeof window === 'undefined') return 'home';
  const p = window.location.pathname.toLowerCase();
  if (
    p === '/movies' ||
    p.startsWith('/movies/') ||
    /^(?:\/movie|\/movies|\/lk21|\/lookseries)\/(?:detail|watch)\//i.test(p) ||
    /^\/movie\/[^/]+/i.test(p)
  ) {
    return 'movies';
  }
  if (
    p === '/providers' ||
    p === '/provider' ||
    /^\/provider\/[^/]+\/?$/i.test(p)
  ) {
    return 'providers';
  }
  if (p === '/explore') return 'explore';
  if (p === '/trending') return 'ranking';
  if (p === '/latest') return 'terbaru';
  if (p === '/vip') return 'vip';
  if (
    p === '/rewards' ||
    p.startsWith('/rewards/') ||
    p === '/referral' ||
    p.startsWith('/referral/')
  ) {
    return 'rewards';
  }
  if (p === '/account' || p.startsWith('/account/')) return 'dashboard';
  if (p === '/watchlist' || p.startsWith('/watchlist/')) return 'mylist';
  if (p === '/dashboard' || p.startsWith('/dashboard/')) return 'dashboard';
  return 'home';
}

function getTabPath(tab: NavTab): string {
  switch (tab) {
    case 'movies':
      return '/movies';
    case 'providers':
      return '/providers';
    case 'explore':
    case 'anime':
    case 'dubbing':
      return '/explore';
    case 'ranking':
      return '/trending';
    case 'terbaru':
      return '/latest';
    case 'vip':
      return '/vip';
    case 'mylist':
    case 'dashboard':
      return '/account';
    case 'rewards':
      return '/rewards';
    default:
      return '/';
  }
}

function readDeepLinkBookId(params: URLSearchParams): string {
  return (
    params.get('book_id') ||
    params.get('bookId') ||
    params.get('drama') ||
    params.get('id') ||
    ''
  ).trim();
}

function isInitialSsrNotFoundForCurrentPath(): boolean {
  if (typeof window === 'undefined') return false;
  const nfPath = window.__INITIAL_NOT_FOUND__?.pathname;
  if (!nfPath) return false;
  try {
    return (
      decodeURIComponent(nfPath).toLowerCase() ===
      decodeURIComponent(window.location.pathname).toLowerCase()
    );
  } catch {
    return nfPath.toLowerCase() === window.location.pathname.toLowerCase();
  }
}

function parseDramaRouteFromLocation(): {
  bookId: string;
  slugHint?: string;
  providerHint?: MediaProviderName;
  drama: DramaItem | null;
  episodes: EpisodeItem[];
  notFound?: boolean;
  mode?: 'detail' | 'watch';
  watchEpisode?: number;
} | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawProvParam = params.get('provider');
  const pHint: MediaProviderName | undefined =
    rawProvParam?.trim().toUpperCase() === 'LK21'
      ? 'LK21'
      : rawProvParam?.trim().toUpperCase() === 'LOOKSERIES'
      ? 'LookSeries'
      : parseProviderName(rawProvParam);
  const histState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as {
          bookId?: unknown;
          provider?: unknown;
          slug?: unknown;
        })
      : null;
  const histBookId =
    typeof histState?.bookId === 'string' ? histState.bookId.trim() : '';
  const histProvRaw =
    typeof histState?.provider === 'string' ? histState.provider.trim() : '';
  const histProv: MediaProviderName | undefined =
    histProvRaw.toUpperCase() === 'LK21'
      ? 'LK21'
      : histProvRaw.toUpperCase() === 'LOOKSERIES'
      ? 'LookSeries'
      : parseProviderName(histProvRaw);
  const histSlug =
    typeof histState?.slug === 'string' ? histState.slug.trim().toLowerCase() : '';

  const queryDramaId = readDeepLinkBookId(params);

  // Primary route: /<provider>/detail/<slug> or /<provider>/watch/<slug>(/<ep>)
  const scopedRouteMatch = window.location.pathname.match(
    /^\/([a-z0-9_]+)\/(detail|watch)\/([^/]+)(?:\/(\d+))?/i
  );
  if (scopedRouteMatch && isKnownProviderRouteSlug(scopedRouteMatch[1])) {
    const routeProvSlug = scopedRouteMatch[1].toLowerCase();
    const routeMode = scopedRouteMatch[2].toLowerCase() as 'detail' | 'watch';
    const segment = safeDecodeURIComponent(scopedRouteMatch[3]);
    const normSegment = segment.toLowerCase();
    const pathEp = scopedRouteMatch[4] ? Number(scopedRouteMatch[4]) : 0;
    const queryEp = Number(params.get('ep'));
    const resolvedWatchEp =
      routeMode === 'watch'
        ? Number.isFinite(queryEp) && queryEp >= 1
          ? Math.floor(queryEp)
          : Number.isFinite(pathEp) && pathEp >= 1
          ? Math.floor(pathEp)
          : 1
        : undefined;

    const mappedProvider = parseProviderFromRouteSlug(routeProvSlug, segment);

    if (
      routeProvSlug === 'movie' ||
      routeProvSlug === 'movies' ||
      routeProvSlug === 'lk21' ||
      routeProvSlug === 'lookseries'
    ) {
      const isLookSeriesSlug =
        routeProvSlug === 'lookseries' ||
        /^ls-([^-/]+)/i.test(normSegment) ||
        pHint === 'LookSeries' ||
        histProv === 'LookSeries';
      const movieProvHint: MediaProviderName = isLookSeriesSlug
        ? 'LookSeries'
        : 'LK21';
      const ssrMovie = window.__INITIAL_MOVIE__;
      if (
        ssrMovie?.movie &&
        (ssrMovie.movie.slug?.toLowerCase() === normSegment || !ssrMovie.movie.slug)
      ) {
        const convertedEps = mapLk21EpisodesToEpisodeItems(
          normSegment,
          ssrMovie.episodes,
          ssrMovie.movie.title
        );
        const convertedMovie = movieToDramaItem(
          ssrMovie.movie,
          convertedEps.length || 1
        );
        saveDramaLookupCache(convertedMovie);
        return {
          bookId: convertedMovie.bookId || normSegment,
          providerHint: convertedMovie.provider || movieProvHint,
          drama: convertedMovie,
          episodes: convertedEps,
          mode: routeMode,
          watchEpisode: resolvedWatchEp,
        };
      }
      const ssr = window.__INITIAL_DRAMA__;
      if (
        ssr &&
        (ssr.bookId === segment ||
          ssr.drama?.slug?.toLowerCase() === normSegment ||
          ssr.drama?.provider === 'LK21' ||
          ssr.drama?.provider === 'LookSeries')
      ) {
        if (ssr.drama) saveDramaLookupCache(ssr.drama);
        return {
          bookId: ssr.bookId || ssr.drama?.bookId || normSegment,
          providerHint: ssr.drama?.provider || movieProvHint,
          drama: ssr.drama ?? null,
          episodes: Array.isArray(ssr.episodes) ? ssr.episodes : [],
          mode: routeMode,
          watchEpisode: resolvedWatchEp,
        };
      }
      const cachedMovie = findDramaInLookupCache(normSegment, movieProvHint);
      const ssrNotFound = !cachedMovie && isInitialSsrNotFoundForCurrentPath();
      return {
        bookId: cachedMovie?.bookId || normSegment,
        slugHint: cachedMovie || ssrNotFound ? undefined : normSegment,
        providerHint: cachedMovie?.provider || movieProvHint,
        drama: cachedMovie,
        episodes: [],
        notFound: ssrNotFound,
        mode: routeMode,
        watchEpisode: resolvedWatchEp,
      };
    }

    const ssr = window.__INITIAL_DRAMA__;
    if (
      ssr &&
      (ssr.bookId === segment ||
        ssr.drama?.slug?.toLowerCase() === normSegment ||
        (ssr.drama?.title && slugifyDramaTitle(ssr.drama.title) === normSegment))
    ) {
      if (ssr.drama) saveDramaLookupCache(ssr.drama);
      return {
        bookId: ssr.bookId || ssr.drama?.bookId || segment,
        providerHint: ssr.drama?.provider ?? mappedProvider ?? pHint,
        drama: ssr.drama ?? null,
        episodes: Array.isArray(ssr.episodes) ? ssr.episodes : [],
        mode: routeMode,
        watchEpisode: resolvedWatchEp,
      };
    }

    if (histBookId && (!histSlug || histSlug === normSegment)) {
      const cachedByHist = findDramaInLookupCache(
        histBookId,
        histProv ?? mappedProvider ?? pHint
      );
      return {
        bookId: histBookId,
        providerHint: cachedByHist?.provider ?? histProv ?? mappedProvider ?? pHint,
        drama: cachedByHist,
        episodes: [],
        mode: routeMode,
        watchEpisode: resolvedWatchEp,
      };
    }

    const cachedBySlug = findDramaInLookupCache(
      normSegment,
      mappedProvider ?? pHint
    );
    if (cachedBySlug) {
      return {
        bookId: cachedBySlug.bookId,
        providerHint: cachedBySlug.provider ?? mappedProvider ?? pHint,
        drama: cachedBySlug,
        episodes: [],
        mode: routeMode,
        watchEpisode: resolvedWatchEp,
      };
    }

    const ssrNotFound = isInitialSsrNotFoundForCurrentPath();
    return {
      bookId: segment,
      slugHint: ssrNotFound ? undefined : segment,
      providerHint: histProv ?? mappedProvider ?? pHint,
      drama: null,
      episodes: [],
      notFound: ssrNotFound,
      mode: routeMode,
      watchEpisode: resolvedWatchEp,
    };
  }

  // Legacy fallback: /movie/{slug}
  const movieMatch = window.location.pathname.match(/^\/movie\/([^/]+)/i);
  if (movieMatch) {
    const slug = safeDecodeURIComponent(movieMatch[1]).toLowerCase();
    const queryEp = Number(params.get('ep'));
    const hasWatchEp = Number.isFinite(queryEp) && queryEp >= 1;
    const isLookSeriesSlug =
      /^ls-([^-/]+)/i.test(slug) ||
      pHint === 'LookSeries' ||
      histProv === 'LookSeries';
    const movieProvHint: MediaProviderName = isLookSeriesSlug
      ? 'LookSeries'
      : 'LK21';
    const ssrMovie = window.__INITIAL_MOVIE__;
    if (ssrMovie?.movie && (ssrMovie.movie.slug?.toLowerCase() === slug || !ssrMovie.movie.slug)) {
      const convertedEps = mapLk21EpisodesToEpisodeItems(
        slug,
        ssrMovie.episodes,
        ssrMovie.movie.title
      );
      const convertedMovie = movieToDramaItem(
        ssrMovie.movie,
        convertedEps.length || 1
      );
      saveDramaLookupCache(convertedMovie);
      return {
        bookId: convertedMovie.bookId || slug,
        providerHint: convertedMovie.provider || movieProvHint,
        drama: convertedMovie,
        episodes: convertedEps,
        mode: hasWatchEp ? 'watch' : 'detail',
        watchEpisode: hasWatchEp ? Math.floor(queryEp) : undefined,
      };
    }

    const ssr = window.__INITIAL_DRAMA__;
    if (
      ssr &&
      (ssr.bookId === slug ||
        ssr.drama?.slug === slug ||
        ssr.drama?.provider === 'LK21' ||
        ssr.drama?.provider === 'LookSeries')
    ) {
      if (ssr.drama) saveDramaLookupCache(ssr.drama);
      return {
        bookId: ssr.bookId || ssr.drama?.bookId || slug,
        slugHint: slug,
        providerHint: ssr.drama?.provider || movieProvHint,
        drama: ssr.drama ?? null,
        episodes: Array.isArray(ssr.episodes) ? ssr.episodes : [],
        mode: hasWatchEp ? 'watch' : 'detail',
        watchEpisode: hasWatchEp ? Math.floor(queryEp) : undefined,
      };
    }

    const cachedMovie = findDramaInLookupCache(slug, movieProvHint);
    const ssrNotFound = !cachedMovie && isInitialSsrNotFoundForCurrentPath();
    return {
      bookId: cachedMovie?.bookId || slug,
      slugHint: cachedMovie || ssrNotFound ? undefined : slug,
      providerHint: cachedMovie?.provider || movieProvHint,
      drama: cachedMovie,
      episodes: [],
      notFound: ssrNotFound,
      mode: hasWatchEp ? 'watch' : 'detail',
      watchEpisode: hasWatchEp ? Math.floor(queryEp) : undefined,
    };
  }

  // Match /drama/{provider}/{bookId}/{slug} or clean /drama/{slug}
  const legacyProvMatch = window.location.pathname.match(
    /^\/drama\/([a-z0-9_]+)\/([^/]+)/i
  );
  const providerMatch =
    legacyProvMatch &&
    isKnownProviderRouteSlug(legacyProvMatch[1]) &&
    !/^(lk21|lookseries|movie|movies)$/i.test(legacyProvMatch[1])
      ? legacyProvMatch
      : null;
  if (providerMatch) {
    const prov: ProviderName =
      (parseProviderFromRouteSlug(providerMatch[1]) as ProviderName | undefined) ??
      parseProviderName(providerMatch[1]) ??
      'DramaBoxV2';
    const bookId = safeDecodeURIComponent(providerMatch[2]);
    const ssr = window.__INITIAL_DRAMA__;
    if (ssr && ssr.bookId === bookId) {
      if (ssr.drama) saveDramaLookupCache(ssr.drama);
      return {
        bookId,
        providerHint: ssr.drama?.provider ?? prov,
        drama: ssr.drama ?? null,
        episodes: Array.isArray(ssr.episodes) ? ssr.episodes : [],
      };
    }
    const cached = findDramaInLookupCache(bookId, prov);
    return {
      bookId,
      providerHint: prov,
      drama: cached,
      episodes: [],
      notFound: !cached && isInitialSsrNotFoundForCurrentPath(),
    };
  }

  const slugOrIdMatch = window.location.pathname.match(/^\/drama\/([^/]+)/);
  if (slugOrIdMatch) {
    const segment = safeDecodeURIComponent(slugOrIdMatch[1]);
    const normSegment = segment.toLowerCase();
    const ssr = window.__INITIAL_DRAMA__;
    if (
      ssr &&
      (ssr.bookId === segment ||
        ssr.drama?.slug?.toLowerCase() === normSegment ||
        (ssr.drama?.title && slugifyDramaTitle(ssr.drama.title) === normSegment))
    ) {
      if (ssr.drama) saveDramaLookupCache(ssr.drama);
      return {
        bookId: ssr.bookId || ssr.drama?.bookId || segment,
        providerHint: ssr.drama?.provider ?? pHint,
        drama: ssr.drama ?? null,
        episodes: Array.isArray(ssr.episodes) ? ssr.episodes : [],
      };
    }

    if (queryDramaId) {
      const cached = findDramaInLookupCache(queryDramaId, pHint);
      return {
        bookId: queryDramaId,
        providerHint: cached?.provider ?? pHint ?? 'DramaBoxV2',
        drama: cached,
        episodes: [],
      };
    }

    if (histBookId && (!histSlug || histSlug === normSegment)) {
      const cachedByHist = findDramaInLookupCache(
        histBookId,
        histProv ?? pHint
      );
      return {
        bookId: histBookId,
        providerHint: cachedByHist?.provider ?? histProv ?? pHint,
        drama: cachedByHist,
        episodes: [],
      };
    }

    const cachedBySlug = findDramaInLookupCache(normSegment, pHint);
    if (cachedBySlug) {
      return {
        bookId: cachedBySlug.bookId,
        providerHint: cachedBySlug.provider ?? pHint,
        drama: cachedBySlug,
        episodes: [],
      };
    }

    const ssrNotFound = isInitialSsrNotFoundForCurrentPath();
    return {
      bookId: segment,
      slugHint: ssrNotFound ? undefined : segment,
      providerHint: histProv ?? pHint,
      drama: null,
      episodes: [],
      notFound: ssrNotFound,
    };
  }

  if (queryDramaId) {
    const cached = findDramaInLookupCache(queryDramaId, pHint);
    return {
      bookId: queryDramaId,
      providerHint: cached?.provider ?? pHint ?? 'DramaBoxV2',
      drama: cached,
      episodes: [],
      notFound: !cached && isInitialSsrNotFoundForCurrentPath(),
    };
  }

  return null;
}

interface SeoLandingRouteState {
  basePath: 'genre' | 'tag' | 'category';
  slug: string;
  modifier?: string;
}

function parseSeoLandingFromPath(pathname: string): SeoLandingRouteState | null {
  const match = pathname.match(/^\/(genre|category|tag)\/([^/]+)(?:\/([^/]+))?/i);
  if (!match) return null;
  const basePath = match[1].toLowerCase() as 'genre' | 'tag' | 'category';
  const slug = safeDecodeURIComponent(match[2]).trim().toLowerCase();
  const modifier = match[3] ? safeDecodeURIComponent(match[3]).trim().toLowerCase() : undefined;
  if (!slug) return null;
  return { basePath, slug, modifier };
}

function parseSeoLandingFromLocation(): SeoLandingRouteState | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseSeoLandingFromPath(window.location.pathname);
  } catch {
    return null;
  }
}

function readInitialHomeBootstrap(
  lang: LanguageCode,
  provider: ProviderId
): HomeCatalogResponse | null {
  try {
    const peeked = getPeekCachedHomeCatalog(lang, provider);
    if (hasHomeItems(peeked)) {
      return peeked;
    }
    const ssrHome = peekSsrHomeBootstrap(provider);
    if (hasHomeItems(ssrHome)) {
      return ssrHome;
    }
  } catch {
    // Ignore hydration peek errors
  }
  return null;
}

function interleaveManyFeeds(...lists: DramaItem[][]): DramaItem[] {
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
  return merged;
}

export default function App() {
  const {
    language,
    t,
    user,
    authLoading,
    authModalOpen,
    openAuthModal,
    closeAuthModal,
    setLanguageState,
    myListItems,
    dramaWatchlistItems,
    movieWatchlistItems,
    myListIds,
    likedDramaIds,
    completedDramaIds,
    toggleMyList,
    toggleDramaCompleted,
    getDramaWatchStatus,
    watchlistFolders,
    createWatchlistFolder,
    deleteWatchlistFolder,
    assignDramaToFolder,
    getDramaFolderId,
    watchHistory,
    recordWatchProgress,
    removeHistoryItem,
    getResumePoint,
    toasts,
    pushToast,
    dismissToast,
    liveBadgeMap,
    getDramaLiveStats,
  } = useDramaContext();

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    try {
      return parseTabFromLocation();
    } catch {
      return 'home';
    }
  });
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(() => {
    try {
      const routeProv = parseProviderRouteFromLocation()?.provider;
      if (routeProv) return routeProv;
      const initialTab = parseTabFromLocation();
      if (initialTab === 'home' || initialTab === 'explore') {
        return readPersistedProviderFilter();
      }
    } catch {
      // Ignore location/storage errors
    }
    return 'All';
  });
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'explore') return;
    try {
      if (selectedProvider === 'All') {
        sessionStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY);
      } else {
        sessionStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, selectedProvider);
      }
    } catch {
      // Ignore storage write errors
    }
  }, [activeTab, selectedProvider]);
  const [invalidProviderSlug, setInvalidProviderSlug] = useState<string | null>(
    () => {
      try {
        return parseProviderRouteFromLocation()?.invalidSlug ?? null;
      } catch {
        return null;
      }
    }
  );
  const [languageLoading, setLanguageLoading] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(
    () => {
      try {
        return (
          typeof window !== 'undefined' &&
          window.location.pathname.toLowerCase() === '/search'
        );
      } catch {
        return false;
      }
    }
  );
  const [providerHubOpen, setProviderHubOpen] = useState(false);
  const [dashboardSubTab, setDashboardSubTab] = useState<
    'profile' | 'rewards' | 'watchlist' | 'history' | 'comments'
  >(() => {
    try {
      if (typeof window === 'undefined') return 'profile';
      const p = window.location.pathname.toLowerCase();
      const tabParam = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();
      if (
        p === '/rewards' ||
        p.startsWith('/rewards/') ||
        p === '/referral' ||
        p.startsWith('/referral/') ||
        tabParam === 'rewards' ||
        tabParam === 'referral'
      ) {
        return 'rewards';
      }
    } catch {
      // Ignore
    }
    return 'profile';
  });
  const [dashboardWatchlistCategory, setDashboardWatchlistCategory] = useState<
    'movie' | 'drama'
  >('movie');
  const [watchlistCategory, setWatchlistCategory] = useState<'drama' | 'movie'>(
    'drama'
  );

  // Programmatic SEO Landing Route State (/genre/*, /category/*, /tag/*)
  const [activeSeoLanding, setActiveSeoLanding] =
    useState<SeoLandingRouteState | null>(() => {
      try {
        return parseSeoLandingFromLocation();
      } catch {
        return null;
      }
    });

  // Watchlist Folder & Watch Status State
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [watchStatusFilter, setWatchStatusFilter] =
    useState<WatchStatusFilter>('all');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Semantic /<provider>/detail/{slug} and /<provider>/watch/{slug} Route State
  const [activeDramaRoute, setActiveDramaRoute] = useState<{
    bookId: string;
    slugHint?: string;
    providerHint?: MediaProviderName;
    drama: DramaItem | null;
    episodes: EpisodeItem[];
    notFound?: boolean;
    mode?: 'detail' | 'watch';
    watchEpisode?: number;
  } | null>(() => {
    try {
      return parseDramaRouteFromLocation();
    } catch {
      return null;
    }
  });
  const [moviesPool, setMoviesPool] = useState<DramaItem[]>([]);

  // Database-cached Home Catalog (Zero-latency SSR/PostgreSQL cache)
  const initialHomeBootstrapRef = useRef<HomeCatalogResponse | null | undefined>(
    undefined
  );
  if (initialHomeBootstrapRef.current === undefined) {
    initialHomeBootstrapRef.current = readInitialHomeBootstrap(
      language,
      selectedProvider
    );
  }
  const [homeCatalog, setHomeCatalog] = useState<HomeCatalogResponse | null>(
    () => initialHomeBootstrapRef.current ?? null
  );
  const homeCatalogRef = useRef<HomeCatalogResponse | null>(homeCatalog);
  useEffect(() => {
    homeCatalogRef.current = homeCatalog;
  }, [homeCatalog]);
  const [homeLoading, setHomeLoading] = useState<boolean>(() => {
    try {
      return !hasHomeItems(initialHomeBootstrapRef.current);
    } catch {
      return false;
    }
  });
  const [homeError, setHomeError] = useState<string | null>(null);
  const [serverTrendingItems, setServerTrendingItems] = useState<DramaItem[]>([]);
  const exploreHydratedKeyRef = useRef<string | null>(null);

  const loadServerTrending = useCallback(
    async (providerToLoad: ProviderId = selectedProvider) => {
      try {
        const params = new URLSearchParams({ limit: '48' });
        if (providerToLoad && providerToLoad !== 'All') {
          params.set('provider', providerToLoad);
        }
        const res = await fetch(`/api/trending?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          items?: DramaItem[];
        };
        if (data.ok && Array.isArray(data.items)) {
          setServerTrendingItems(data.items);
        }
      } catch {
        // Keep existing trending items on transient error
      }
    },
    [selectedProvider]
  );

  useEffect(() => {
    void loadServerTrending(selectedProvider);
  }, [selectedProvider, loadServerTrending]);

  useEffect(() => {
    const onViewRecorded = () => {
      void loadServerTrending(selectedProvider);
    };
    window.addEventListener('kd:view-recorded', onViewRecorded);
    return () => window.removeEventListener('kd:view-recorded', onViewRecorded);
  }, [selectedProvider, loadServerTrending]);

  // DramaBox Live Feeds (Hydrated on demand for Explore & Category Tabs)
  const [dbRankingFeed, setDbRankingFeed] = useState<FeedState>(IDLE_FEED);
  const [dbForYouFeed, setDbForYouFeed] = useState<FeedState>(IDLE_FEED);
  const [dbNewFeed, setDbNewFeed] = useState<FeedState>(IDLE_FEED);
  const [dbVipFeed, setDbVipFeed] = useState<FeedState>(IDLE_FEED);
  const [dbDubbingFeed, setDbDubbingFeed] = useState<FeedState>(IDLE_FEED);

  // NetShort Live Feeds
  const [nsTrendingFeed, setNsTrendingFeed] = useState<FeedState>(IDLE_FEED);
  const [nsForYouFeed, setNsForYouFeed] = useState<FeedState>(IDLE_FEED);
  const [nsAllFeed, setNsAllFeed] = useState<FeedState>(IDLE_FEED);
  const [nsAnimeFeed, setNsAnimeFeed] = useState<FeedState>(IDLE_FEED);

  // AnyReel Live Feeds
  const [arForYouFeed, setArForYouFeed] = useState<FeedState>(IDLE_FEED);
  const [arAsianFeed, setArAsianFeed] = useState<FeedState>(IDLE_FEED);

  // Melolo Live Feeds
  const [mlRankFeed, setMlRankFeed] = useState<FeedState>(IDLE_FEED);
  const [mlForYouFeed, setMlForYouFeed] = useState<FeedState>(IDLE_FEED);
  const [mlNewFeed, setMlNewFeed] = useState<FeedState>(IDLE_FEED);
  const [mlAnimeFeed, setMlAnimeFeed] = useState<FeedState>(IDLE_FEED);

  // Additional Providers Feeds Map
  const [extraFeeds, setExtraFeeds] = useState<
    Record<ExtraProviderName, ExtraProviderFeedBundle>
  >(() => createInitialExtraFeeds());

  const [playerState, setPlayerState] = useState<{
    drama: DramaItem;
    episode: number;
    initialTime: number;
    episodes: EpisodeItem[];
  } | null>(null);
  const pendingDeepLinkEpRef = useRef<number | null>(
    (() => {
      if (typeof window === 'undefined') return null;
      const ep = Number(new URLSearchParams(window.location.search).get('ep'));
      if (Number.isFinite(ep) && ep >= 1) return Math.floor(ep);
      const watchMatch = window.location.pathname.match(
        /^\/([a-z0-9_]+)\/watch\/[^/]+(?:\/(\d+))?/i
      );
      if (watchMatch && isKnownProviderRouteSlug(watchMatch[1])) {
        const pathEp = watchMatch[2] ? Number(watchMatch[2]) : 1;
        return Number.isFinite(pathEp) && pathEp >= 1 ? Math.floor(pathEp) : 1;
      }
      return null;
    })()
  );
  const [mobileAvatarBroken, setMobileAvatarBroken] = useState(false);

  useEffect(() => {
    setMobileAvatarBroken(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.playerOpen = playerState ? 'true' : 'false';
    return () => {
      delete document.body.dataset.playerOpen;
    };
  }, [playerState]);

  const loadSingleFeed = useCallback(
    async (
      fetcher: (page: number) => Promise<{
        items: DramaItem[];
        hasMore: boolean;
        page: number;
      }>,
      setter: React.Dispatch<React.SetStateAction<FeedState>>,
      page = 1,
      append = false
    ) => {
      setter((prev) => ({
        ...prev,
        loading: !append,
        loadingMore: append,
        error: null,
      }));
      try {
        const res = await fetcher(page);
        setter((prev) => {
          if (!append) {
            return {
              items: res.items,
              page: res.page,
              hasMore: res.hasMore,
              loading: false,
              loadingMore: false,
              error: null,
            };
          }
          const existingKeys = new Set(
            prev.items.map((d) => `${d.provider}:${d.bookId}`)
          );
          const merged = [
            ...prev.items,
            ...res.items.filter(
              (d) => !existingKeys.has(`${d.provider}:${d.bookId}`)
            ),
          ];
          return {
            items: merged,
            page: res.page,
            hasMore: res.hasMore,
            loading: false,
            loadingMore: false,
            error: null,
          };
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to connect to API.';
        setter((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: msg,
        }));
      }
    },
    []
  );

  const loadExtraFeedSlot = useCallback(
    async (
      provider: ExtraProviderName,
      slot: 'main' | 'rank' | 'newest' | 'vip' | 'anime' | 'dubbing' | 'special',
      fetcher: (page: number) => Promise<{
        items: DramaItem[];
        hasMore: boolean;
        page: number;
      }>,
      page = 1,
      append = false
    ) => {
      setExtraFeeds((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          [slot]: {
            ...(prev[provider][slot] ?? IDLE_FEED),
            loading: !append,
            loadingMore: append,
            error: null,
          },
        },
      }));
      try {
        const res = await fetcher(page);
        setExtraFeeds((prev) => {
          const cur = prev[provider][slot] ?? IDLE_FEED;
          if (!append) {
            return {
              ...prev,
              [provider]: {
                ...prev[provider],
                [slot]: {
                  items: res.items,
                  page: res.page,
                  hasMore: res.hasMore,
                  loading: false,
                  loadingMore: false,
                  error: null,
                },
              },
            };
          }
          const existingKeys = new Set(
            cur.items.map((d) => `${d.provider}:${d.bookId}`)
          );
          return {
            ...prev,
            [provider]: {
              ...prev[provider],
              [slot]: {
                items: [
                  ...cur.items,
                  ...res.items.filter(
                    (d) => !existingKeys.has(`${d.provider}:${d.bookId}`)
                  ),
                ],
                page: res.page,
                hasMore: res.hasMore,
                loading: false,
                loadingMore: false,
                error: null,
              },
            },
          };
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to connect to API.';
        setExtraFeeds((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            [slot]: {
              ...(prev[provider][slot] ?? IDLE_FEED),
              loading: false,
              loadingMore: false,
              error: msg,
            },
          },
        }));
      }
    },
    []
  );

  const ensureExtraProviderFullLoaded = useCallback(
    async (provider: ExtraProviderName, force = false) => {
      const adapter = ALL_PROVIDER_ADAPTERS[provider];
      setExtraFeeds((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          fullLoaded: true,
        },
      }));

      const tasks: Promise<void>[] = [
        loadExtraFeedSlot(provider, 'main', (p) => adapter.fetchForYou(p), 1, false),
        loadExtraFeedSlot(provider, 'rank', (p) => adapter.fetchRanking(p), 1, false),
        loadExtraFeedSlot(
          provider,
          'newest',
          (p) => adapter.fetchNewReleases(p),
          1,
          false
        ),
        loadExtraFeedSlot(provider, 'vip', (p) => adapter.fetchVip(p), 1, false),
      ];

      if (provider === 'MoboReels') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'anime',
            (p) => moboReelsProvider.fetchAnimasi(p),
            1,
            false
          )
        );
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => moboReelsProvider.fetchAsia(p),
            1,
            false
          )
        );
      } else if (provider === 'DramaOra') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => dramaOraProvider.fetchCategoryDramas(57819, p),
            1,
            false
          )
        );
      } else if (provider === 'MeloShort') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            () => meloShortProvider.fetchRecommend(1),
            1,
            false
          )
        );
      } else if (provider === 'PetaDrama') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => petaDramaProvider.fetchCategoryDramas(57819, p, 20),
            1,
            false
          )
        );
      } else if (provider === 'LoveShots') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => loveShotsProvider.fetchRankings(p),
            1,
            false
          )
        );
      } else if (provider === 'ShotShort') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => shotShortProvider.fetchAllDrama(p, 1),
            1,
            false
          )
        );
      } else if (provider === 'BlinkDrama') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => blinkDramaProvider.fetchAllDrama(p, 0),
            1,
            false
          )
        );
      } else if (provider === 'CubeTV') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => cubeTvProvider.fetchHot(p),
            1,
            false
          )
        );
      } else if (provider === 'FlareFlow') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => flareFlowProvider.fetchAllDrama(p),
            1,
            false
          )
        );
      } else if (provider === 'FreeShort') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => freeShortProvider.fetchHot(p),
            1,
            false
          )
        );
      } else if (provider === 'ToonShort') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => toonShortProvider.fetchPopular(p),
            1,
            false
          )
        );
      } else if (provider === 'HappyShort') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => happyShortProvider.fetchTrending(p),
            1,
            false
          )
        );
      } else if (provider === 'FlickReels') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => flickReelsProvider.fetchAllDrama(p),
            1,
            false
          )
        );
      } else if (provider === 'DramaWave') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => dramaWaveProvider.fetchExclusive(p),
            1,
            false
          )
        );
      } else if (provider === 'FreeReels') {
        if (freeReelsProvider.fetchAnime) {
          const fn = freeReelsProvider.fetchAnime;
          tasks.push(loadExtraFeedSlot(provider, 'anime', (p) => fn(p), 1, false));
        }
        if (freeReelsProvider.fetchDubbing) {
          const fn = freeReelsProvider.fetchDubbing;
          tasks.push(loadExtraFeedSlot(provider, 'dubbing', (p) => fn(p), 1, false));
        }
      } else if (provider === 'Vigloo') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => viglooProvider.fetchBrowse(p, 'POPULAR'),
            1,
            false
          )
        );
      } else if (provider === 'GoodShort') {
        if (goodShortProvider.fetchAnime) {
          const fn = goodShortProvider.fetchAnime;
          tasks.push(loadExtraFeedSlot(provider, 'anime', (p) => fn(p), 1, false));
        }
        if (goodShortProvider.fetchDubbing) {
          const fn = goodShortProvider.fetchDubbing;
          tasks.push(loadExtraFeedSlot(provider, 'dubbing', (p) => fn(p), 1, false));
        }
      } else if (provider === 'JoyReels') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => joyReelsProvider.fetchAsia(p),
            1,
            false
          )
        );
      } else if (provider === 'iQIYI') {
        tasks.push(
          loadExtraFeedSlot(
            provider,
            'special',
            (p) => iqiyiProvider.fetchKdrama(p),
            1,
            false
          )
        );
        if (iqiyiProvider.fetchAnime) {
          const fn = iqiyiProvider.fetchAnime;
          tasks.push(loadExtraFeedSlot(provider, 'anime', (p) => fn(p), 1, false));
        }
      } else if (
        (provider === 'Bstation' ||
          provider === 'Anichin' ||
          provider === 'DonghuaQueen' ||
          provider === 'Samehadaku' ||
          provider === 'AnimeX') &&
        adapter.fetchAnime
      ) {
        const fn = adapter.fetchAnime;
        tasks.push(loadExtraFeedSlot(provider, 'anime', (p) => fn(p), 1, false));
      }

      if (force) {
        await Promise.allSettled(tasks);
      } else {
        await Promise.allSettled(tasks);
      }
    },
    [loadExtraFeedSlot]
  );

  const homeRequestSeqRef = useRef(0);
  const homeInFlightCountRef = useRef(0);

  const loadHomeFromCache = useCallback(
    async (
      langToLoad: LanguageCode,
      providerToLoad: ProviderId,
      forceBypassClient = false
    ) => {
      const requestId = ++homeRequestSeqRef.current;
      let countedInFlight = false;

      try {
        if (forceBypassClient) {
          clearClientHomeCache(langToLoad, providerToLoad);
        } else {
          const peek = getPeekCachedHomeEntry(langToLoad, providerToLoad);
          if (peek && hasHomeItems(peek.data)) {
            setHomeCatalog(peek.data);
            setHomeLoading(false);
            setHomeError(null);

            if (peek.isStale) {
              void fetchHomeCatalog(langToLoad, providerToLoad, false)
                .then((fresh) => {
                  if (homeRequestSeqRef.current !== requestId) return;
                  if (hasHomeItems(fresh)) {
                    setHomeCatalog(fresh);
                  }
                })
                .catch(() => {
                  // Keep cached Home data intact if background revalidation fails
                })
                .finally(() => {
                  setHomeLoading(false);
                });
            }
            return;
          }
        }

        const ssrSeed = !forceBypassClient
          ? peekSsrHomeBootstrap(providerToLoad)
          : null;
        const hasVisibleCatalog =
          hasHomeItems(ssrSeed) ||
          (!forceBypassClient &&
            hasHomeItems(homeCatalogRef.current) &&
            (homeCatalogRef.current?.provider || 'All') === providerToLoad);

        if (hasHomeItems(ssrSeed) && !hasHomeItems(homeCatalogRef.current)) {
          setHomeCatalog(ssrSeed);
        }

        // Never block initial render with skeletons if SSR __INITIAL_HOME__ or existing catalog is already present
        setHomeLoading(!hasVisibleCatalog);
        setHomeError(null);

        homeInFlightCountRef.current += 1;
        countedInFlight = true;

        const res = await fetchHomeCatalog(
          langToLoad,
          providerToLoad,
          forceBypassClient
        );
        if (homeRequestSeqRef.current === requestId) {
          if (hasHomeItems(res) || !hasVisibleCatalog) {
            setHomeCatalog(res);
          }
          setHomeError(null);
        }
      } catch (err) {
        const staleFallback =
          getPeekCachedHomeEntry(langToLoad, providerToLoad)?.data ??
          peekSsrHomeBootstrap(providerToLoad);
        if (hasHomeItems(staleFallback)) {
          if (homeRequestSeqRef.current === requestId) {
            setHomeCatalog(staleFallback);
            setHomeError(null);
          }
        } else if (
          homeRequestSeqRef.current === requestId &&
          !hasHomeItems(homeCatalogRef.current)
        ) {
          setHomeError(
            err instanceof Error
              ? err.message
              : getDictionary(langToLoad).ui.unableToLoadCatalog
          );
        }
      } finally {
        if (countedInFlight) {
          homeInFlightCountRef.current = Math.max(
            0,
            homeInFlightCountRef.current - 1
          );
        }
        if (
          homeRequestSeqRef.current === requestId ||
          homeInFlightCountRef.current === 0 ||
          hasHomeItems(homeCatalogRef.current) ||
          hasHomeItems(peekSsrHomeBootstrap(providerToLoad))
        ) {
          setHomeLoading(false);
        }
      }
    },
    []
  );

  // Immediately clear homeLoading on mount if window.__INITIAL_HOME__ already holds catalog items
  useEffect(() => {
    try {
      const ssrSeed = peekSsrHomeBootstrap(selectedProvider);
      if (hasHomeItems(ssrSeed)) {
        setHomeCatalog((prev) => (hasHomeItems(prev) ? prev : ssrSeed));
        setHomeLoading(false);
        setHomeError(null);
      }
    } catch {
      setHomeLoading(false);
    }
  }, [selectedProvider]);

  // Watchdog: ensure homeLoading can never remain stuck true past fetch timeout
  useEffect(() => {
    if (!homeLoading) return;
    const watchdog = window.setTimeout(() => {
      setHomeLoading(false);
    }, 16000);
    return () => window.clearTimeout(watchdog);
  }, [homeLoading]);

  // Initial Home load uses single cached backend endpoint (/api/home) instead of 65 live calls
  useEffect(() => {
    void loadHomeFromCache(language, selectedProvider);
  }, [language, selectedProvider, loadHomeFromCache]);

  const loadExtraProvidersBatch = useCallback(
    async (providers: ProviderName[]) => {
      const extraTargets = providers.filter((p): p is ExtraProviderName =>
        isExtraProvider(p)
      );
      if (extraTargets.length === 0) return;
      await Promise.allSettled(
        extraTargets.map((name) =>
          loadExtraFeedSlot(
            name,
            'main',
            (p) => ALL_PROVIDER_ADAPTERS[name].fetchForYou(p),
            1,
            false
          )
        )
      );
    },
    [loadExtraFeedSlot]
  );

  const fetchAllFeeds = useCallback(
    async (langToApply?: LanguageCode) => {
      const targetLang = langToApply ?? language;
      exploreHydratedKeyRef.current = targetLang;
      if (langToApply) {
        await syncAllProvidersLanguage(langToApply);
      }
      setExtraFeeds(createInitialExtraFeeds());
      await Promise.all([
        loadSingleFeed(dramaBoxV2Provider.fetchRanking, setDbRankingFeed, 1, false),
        loadSingleFeed(dramaBoxV2Provider.fetchForYou, setDbForYouFeed, 1, false),
        loadSingleFeed(
          dramaBoxV2Provider.fetchNewReleases,
          setDbNewFeed,
          1,
          false
        ),
        loadSingleFeed(dramaBoxV2Provider.fetchVip, setDbVipFeed, 1, false),
        ...(dramaBoxV2Provider.fetchDubbing
          ? [
              loadSingleFeed(
                dramaBoxV2Provider.fetchDubbing,
                setDbDubbingFeed,
                1,
                false
              ),
            ]
          : []),
        loadSingleFeed(
          netShortProvider.fetchRanking,
          setNsTrendingFeed,
          1,
          false
        ),
        loadSingleFeed(netShortProvider.fetchForYou, setNsForYouFeed, 1, false),
        loadSingleFeed(
          netShortProvider.fetchNewReleases,
          setNsAllFeed,
          1,
          false
        ),
        ...(netShortProvider.fetchAnime
          ? [loadSingleFeed(netShortProvider.fetchAnime, setNsAnimeFeed, 1, false)]
          : []),
        loadSingleFeed(anyReelProvider.fetchForYou, setArForYouFeed, 1, false),
        loadSingleFeed(anyReelProvider.fetchRanking, setArAsianFeed, 1, false),
        loadSingleFeed(meloLoV2Provider.fetchRanking, setMlRankFeed, 1, false),
        loadSingleFeed(meloLoV2Provider.fetchForYou, setMlForYouFeed, 1, false),
        loadSingleFeed(meloLoV2Provider.fetchNewReleases, setMlNewFeed, 1, false),
        ...(meloLoV2Provider.fetchAnime
          ? [loadSingleFeed(meloLoV2Provider.fetchAnime, setMlAnimeFeed, 1, false)]
          : []),
      ]);

      // Progressive Explore hydration: load only the first 6 extra providers upfront
      await Promise.allSettled([
        ...EXTRA_PROVIDER_NAMES.slice(0, 6).map((name) =>
          loadExtraFeedSlot(
            name,
            'main',
            (p) => ALL_PROVIDER_ADAPTERS[name].fetchForYou(p),
            1,
            false
          )
        ),
        loadExtraFeedSlot(
          'MoboReels',
          'anime',
          (p) => moboReelsProvider.fetchAnimasi(p),
          1,
          false
        ),
        ...(iqiyiProvider.fetchAnime
          ? [
              loadExtraFeedSlot(
                'iQIYI',
                'anime',
                (p) => iqiyiProvider.fetchAnime!(p),
                1,
                false
              ),
            ]
          : []),
        ...(freeReelsProvider.fetchAnime
          ? [
              loadExtraFeedSlot(
                'FreeReels',
                'anime',
                (p) => freeReelsProvider.fetchAnime!(p),
                1,
                false
              ),
            ]
          : []),
        ...(freeReelsProvider.fetchDubbing
          ? [
              loadExtraFeedSlot(
                'FreeReels',
                'dubbing',
                (p) => freeReelsProvider.fetchDubbing!(p),
                1,
                false
              ),
            ]
          : []),
        ...(goodShortProvider.fetchAnime
          ? [
              loadExtraFeedSlot(
                'GoodShort',
                'anime',
                (p) => goodShortProvider.fetchAnime!(p),
                1,
                false
              ),
            ]
          : []),
        ...(goodShortProvider.fetchDubbing
          ? [
              loadExtraFeedSlot(
                'GoodShort',
                'dubbing',
                (p) => goodShortProvider.fetchDubbing!(p),
                1,
                false
              ),
            ]
          : []),
      ]);
    },
    [language, loadSingleFeed, loadExtraFeedSlot]
  );

  // Lazy-hydrate Explore & Category tabs only when the user actually navigates off Home
  useEffect(() => {
    const needsExploreFeeds =
      activeTab === 'explore' ||
      activeTab === 'ranking' ||
      activeTab === 'terbaru' ||
      activeTab === 'vip' ||
      activeTab === 'anime' ||
      activeTab === 'dubbing';
    if (needsExploreFeeds && exploreHydratedKeyRef.current !== language) {
      void fetchAllFeeds(language);
    }
  }, [activeTab, language, fetchAllFeeds]);

  // Auto-load full feeds when user switches into any of the additional providers inside Explore/Category
  useEffect(() => {
    if (activeTab !== 'home' && isExtraProvider(selectedProvider)) {
      const bundle = extraFeeds[selectedProvider];
      if (!bundle.fullLoaded) {
        void ensureExtraProviderFullLoaded(selectedProvider);
      }
    }
  }, [activeTab, selectedProvider, extraFeeds, ensureExtraProviderFullLoaded]);

  // Deep-link ?ep=... auto-launch playback across ?book_id=/?drama= and /drama/{slug} or /movie/{slug} refreshes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const epParam = pendingDeepLinkEpRef.current;
    if (!epParam || epParam < 1) return;

    const params = new URLSearchParams(window.location.search);
    const queryDramaId = readDeepLinkBookId(params);
    const rawProv = params.get('provider');

    const targetBookId =
      queryDramaId ||
      (activeDramaRoute && !activeDramaRoute.slugHint
        ? activeDramaRoute.bookId
        : '');
    if (!targetBookId) return;

    const resolvedProv: MediaProviderName =
      activeDramaRoute?.drama?.provider ??
      activeDramaRoute?.providerHint ??
      (rawProv?.trim().toUpperCase() === 'LK21'
        ? 'LK21'
        : rawProv?.trim().toUpperCase() === 'LOOKSERIES'
        ? 'LookSeries'
        : parseProviderName(rawProv) ?? 'DramaBoxV2');

    pendingDeepLinkEpRef.current = null;

    if (resolvedProv === 'LK21' || resolvedProv === 'LookSeries') {
      const isLs = resolvedProv === 'LookSeries';
      if (activeDramaRoute?.drama && activeDramaRoute.episodes.length > 0) {
        setPlayerState({
          drama: activeDramaRoute.drama,
          episode: epParam,
          initialTime: 0,
          episodes: activeDramaRoute.episodes,
        });
        return;
      }
      (isLs
        ? Promise.allSettled([
            fetchLookSeriesDetail(targetBookId),
            fetchLookSeriesEpisodesAsEpisodeItems(targetBookId),
          ])
        : Promise.allSettled([
            fetchLk21Detail(targetBookId),
            fetchLk21EpisodesAsEpisodeItems(targetBookId),
          ])
      ).then(([detRes, epsRes]) => {
        const eps = epsRes.status === 'fulfilled' ? epsRes.value : [];
        const fallbackTitle =
          activeDramaRoute?.drama?.title || 'Featured Movie';
        const movie: DramaItem =
          detRes.status === 'fulfilled' && detRes.value
            ? movieToDramaItem(detRes.value, eps.length || 1)
            : activeDramaRoute?.drama ?? {
                bookId: targetBookId,
                slug: isLs && !/^ls-/i.test(targetBookId) ? `ls-${targetBookId}` : targetBookId,
                title: fallbackTitle,
                cover: '',
                description: `Watch free ${fallbackTitle} Episode ${epParam} in Full HD online on KanoDrama.`,
                chapterCount: eps.length || 1,
                tags: [],
                isVip: false,
                provider: resolvedProv,
                mediaType: 'movie',
              };
        saveDramaLookupCache(movie);
        setPlayerState({
          drama: movie,
          episode: epParam,
          initialTime: 0,
          episodes: eps,
        });
      });
      return;
    }

    if (activeDramaRoute?.drama && activeDramaRoute.episodes.length > 0) {
      setPlayerState({
        drama: activeDramaRoute.drama,
        episode: epParam,
        initialTime: 0,
        episodes: activeDramaRoute.episodes,
      });
      return;
    }

    const adapter = ALL_PROVIDER_ADAPTERS[resolvedProv] ?? dramaBoxV2Provider;
    Promise.allSettled([
      adapter.fetchDetail(targetBookId),
      adapter.fetchAllEpisodes(targetBookId),
    ]).then(([detRes, epsRes]) => {
      const eps = epsRes.status === 'fulfilled' ? epsRes.value : [];
      const epCount = eps.length || 1;
      const fallbackTitle =
        activeDramaRoute?.drama?.title || 'Featured Drama';
      const drama =
        detRes.status === 'fulfilled' && detRes.value
          ? detRes.value
          : activeDramaRoute?.drama ?? {
              bookId: targetBookId,
              title: fallbackTitle,
              cover: '',
              description: `Watch free ${fallbackTitle} Episode ${epParam} (${epCount} episodes) online in HD on KanoDrama.`,
              chapterCount: epCount,
              tags: [],
              isVip: false,
              provider: resolvedProv,
            };
      saveDramaLookupCache(drama);
      setPlayerState({
        drama,
        episode: epParam,
        initialTime: 0,
        episodes: eps,
      });
    });
  }, [
    activeDramaRoute?.bookId,
    activeDramaRoute?.slugHint,
    activeDramaRoute?.providerHint,
    activeDramaRoute?.drama,
    activeDramaRoute?.episodes,
  ]);

  // Initial & Section SEO Sync + Browser Back/Forward sync
  useEffect(() => {
    if (!activeDramaRoute && !activeSeoLanding) {
      if (activeTab === 'providers') {
        if (invalidProviderSlug) {
          document.title = `404 — ${t.ui.providerNotFound} | KanoDrama`;
          let robotsMeta = document.querySelector('meta[name="robots"]');
          if (!robotsMeta) {
            robotsMeta = document.createElement('meta');
            robotsMeta.setAttribute('name', 'robots');
            document.head.appendChild(robotsMeta);
          }
          robotsMeta.setAttribute('content', 'noindex, nofollow');
        } else if (selectedProvider !== 'All') {
          syncProviderDocumentSeo(selectedProvider, language);
        } else {
          syncSectionDocumentSeo('providers', language);
        }
      } else {
        syncSectionDocumentSeo(activeTab, language);
      }
    }
  }, [
    activeDramaRoute,
    activeSeoLanding,
    activeTab,
    selectedProvider,
    invalidProviderSlug,
    language,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const isSearchPath =
        window.location.pathname.toLowerCase() === '/search';
      const parsed = parseDramaRouteFromLocation();
      const parsedLanding = parseSeoLandingFromLocation();
      const parsedTab = parseTabFromLocation();
      const parsedProv = parseProviderRouteFromLocation();
      setSearchModalOpen(isSearchPath);
      setActiveDramaRoute(parsed);
      setActiveSeoLanding(parsed ? null : parsedLanding);
      if (!parsed && !parsedLanding) {
        setActiveTab(parsedTab);
        if (parsedTab === 'providers') {
          setInvalidProviderSlug(parsedProv?.invalidSlug ?? null);
          setSelectedProvider(parsedProv?.provider ?? 'All');
        } else {
          setInvalidProviderSlug(null);
          if (!parsedProv) {
            setSelectedProvider('All');
          }
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToProvidersDirectory = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.__INITIAL_NOT_FOUND__ = undefined;
    }
    setSearchModalOpen(false);
    setProviderHubOpen(false);
    setActiveDramaRoute(null);
    setActiveSeoLanding(null);
    setInvalidProviderSlug(null);
    setSelectedProvider('All');
    setActiveTab('providers');
    if (window.location.pathname !== '/providers' || window.location.search) {
      window.history.pushState({ tab: 'providers' }, '', '/providers');
    }
    syncSectionDocumentSeo('providers', language);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [language]);

  const navigateToProviderPage = useCallback(
    (provider: ProviderName) => {
      if (typeof window !== 'undefined') {
        window.__INITIAL_NOT_FOUND__ = undefined;
      }
      const provSlug = getProviderRouteSlug(provider);
      const targetPath = `/provider/${provSlug}`;
      setSearchModalOpen(false);
      setProviderHubOpen(false);
      setActiveDramaRoute(null);
      setActiveSeoLanding(null);
      setInvalidProviderSlug(null);
      setSelectedProvider(provider);
      setActiveTab('providers');
      if (window.location.pathname !== targetPath || window.location.search) {
        window.history.pushState(
          { tab: 'providers', provider },
          '',
          targetPath
        );
      }
      syncProviderDocumentSeo(provider, language);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [language]
  );

  const handleNavigateTab = useCallback(
    (tab: NavTab) => {
      if (tab === 'providers') {
        navigateToProvidersDirectory();
        return;
      }
      setSearchModalOpen(false);
      setProviderHubOpen(false);
      setActiveDramaRoute(null);
      setActiveSeoLanding(null);
      setInvalidProviderSlug(null);
      if (activeTab === 'providers') {
        setSelectedProvider('All');
      }
      if (tab === 'rewards') {
        setDashboardSubTab('rewards');
      } else if (tab === 'dashboard' && activeTab === 'rewards') {
        setDashboardSubTab('profile');
      }
      setActiveTab(tab);
      const nextPath = getTabPath(tab);
      if (window.location.pathname !== nextPath || window.location.search) {
        window.history.pushState({ tab }, '', nextPath);
      }
      syncSectionDocumentSeo(tab, language);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeTab, language, navigateToProvidersDirectory]
  );

  const handleOpenSearch = useCallback(() => {
    setProviderHubOpen(false);
    closeAuthModal();
    setSearchModalOpen(true);
    if (window.location.pathname.toLowerCase() !== '/search') {
      window.history.pushState({ search: true }, '', '/search');
    }
  }, [closeAuthModal]);

  const handleCloseSearch = useCallback(() => {
    setSearchModalOpen(false);
    if (window.location.pathname.toLowerCase() === '/search') {
      const targetPath =
        activeTab === 'providers' && selectedProvider !== 'All'
          ? `/provider/${getProviderRouteSlug(selectedProvider)}`
          : getTabPath(activeTab);
      window.history.replaceState({ tab: activeTab }, '', targetPath);
      if (activeTab === 'providers' && selectedProvider !== 'All') {
        syncProviderDocumentSeo(selectedProvider, language);
      } else {
        syncSectionDocumentSeo(activeTab, language);
      }
    }
  }, [activeTab, selectedProvider, language]);

  const handleOpenProviderHub = useCallback(() => {
    setSearchModalOpen(false);
    closeAuthModal();
    if (window.location.pathname.toLowerCase() === '/search') {
      const targetPath =
        activeTab === 'providers' && selectedProvider !== 'All'
          ? `/provider/${getProviderRouteSlug(selectedProvider)}`
          : getTabPath(activeTab);
      window.history.replaceState({ tab: activeTab }, '', targetPath);
    }
    setProviderHubOpen(true);
  }, [activeTab, selectedProvider, closeAuthModal]);

  const handleOpenLoginMenu = useCallback(() => {
    setSearchModalOpen(false);
    setProviderHubOpen(false);
    if (window.location.pathname.toLowerCase() === '/search') {
      const targetPath =
        activeTab === 'providers' && selectedProvider !== 'All'
          ? `/provider/${getProviderRouteSlug(selectedProvider)}`
          : getTabPath(activeTab);
      window.history.replaceState({ tab: activeTab }, '', targetPath);
    }
    openAuthModal();
  }, [activeTab, selectedProvider, openAuthModal]);

  const openSeoLandingPath = useCallback((rawPath: string) => {
    const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const parsed = parseSeoLandingFromPath(normalized);
    if (!parsed) return;
    if (window.location.pathname !== normalized) {
      window.history.pushState({ seoLanding: parsed }, '', normalized);
    }
    setSearchModalOpen(false);
    setProviderHubOpen(false);
    setActiveDramaRoute(null);
    setActiveTab('home');
    setActiveSeoLanding(parsed);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onNavigateEvent = (evt: Event) => {
      const detail = (
        evt as CustomEvent<{
          tab?: NavTab;
          subTab?: 'profile' | 'rewards' | 'watchlist' | 'history' | 'comments';
          watchlistCategory?: 'movie' | 'drama';
        }>
      ).detail;
      if (detail?.tab) {
        if (detail.tab === 'rewards') {
          setDashboardSubTab('rewards');
        } else if (detail.tab === 'dashboard') {
          setDashboardSubTab(detail.subTab ?? 'profile');
          if (detail.watchlistCategory) {
            setDashboardWatchlistCategory(detail.watchlistCategory);
          }
        }
        if (detail.tab === 'mylist' && detail.watchlistCategory) {
          setWatchlistCategory(detail.watchlistCategory);
        }
        handleNavigateTab(detail.tab);
      }
    };
    const onNavigatePathEvent = (evt: Event) => {
      const detail = (evt as CustomEvent<{ path?: string }>).detail;
      const rawPath = detail?.path?.trim();
      if (!rawPath) return;
      const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      const lower = normalized.toLowerCase().replace(/\/+$/, '') || '/';
      if (lower === '/providers' || lower === '/provider') {
        navigateToProvidersDirectory();
        return;
      }
      const provMatch = normalized.match(/^\/provider\/([^/]+)\/?$/i);
      if (provMatch) {
        const rawSlug = decodeURIComponent(provMatch[1]).trim();
        const matched = parseProviderFromRouteSlug(rawSlug);
        if (matched === 'LK21' || matched === 'LookSeries') {
          handleNavigateTab('movies');
        } else if (matched) {
          navigateToProviderPage(matched);
        } else {
          setSearchModalOpen(false);
          setProviderHubOpen(false);
          setActiveDramaRoute(null);
          setActiveSeoLanding(null);
          setActiveTab('providers');
          setSelectedProvider('All');
          setInvalidProviderSlug(rawSlug);
          window.history.pushState({}, '', normalized);
        }
        return;
      }
      if (lower === '/rewards' || lower === '/referral') {
        setDashboardSubTab('rewards');
        handleNavigateTab('rewards');
        return;
      }
      if (lower === '/account' || lower === '/dashboard') {
        setDashboardSubTab('profile');
        handleNavigateTab('dashboard');
        return;
      }
      if (lower === '/watchlist') {
        handleNavigateTab('mylist');
        return;
      }
      if (lower === '/explore') {
        handleNavigateTab('explore');
        return;
      }
      if (lower === '/movies') {
        handleNavigateTab('movies');
        return;
      }
      if (lower === '/trending') {
        handleNavigateTab('ranking');
        return;
      }
      if (lower === '/latest') {
        handleNavigateTab('terbaru');
        return;
      }
      if (lower === '/vip') {
        handleNavigateTab('vip');
        return;
      }
      if (lower === '/') {
        handleNavigateTab('home');
        return;
      }
      openSeoLandingPath(normalized);
    };
    window.addEventListener('kd:navigate', onNavigateEvent);
    window.addEventListener('kd:navigate-path', onNavigatePathEvent);
    return () => {
      window.removeEventListener('kd:navigate', onNavigateEvent);
      window.removeEventListener('kd:navigate-path', onNavigatePathEvent);
    };
  }, [
    handleNavigateTab,
    navigateToProvidersDirectory,
    navigateToProviderPage,
    openSeoLandingPath,
  ]);

  const openDramaRoute = useCallback((drama: DramaItem) => {
    if (typeof window !== 'undefined') {
      window.__INITIAL_NOT_FOUND__ = undefined;
    }
    saveDramaLookupCache(drama);
    const resolvedSlug = drama.slug || slugifyDramaTitle(drama.title);
    const path = getDramaPath(
      drama.bookId,
      drama.title,
      drama.provider,
      resolvedSlug
    );
    if (window.location.pathname !== path || window.location.search) {
      window.history.pushState(
        {
          bookId: drama.bookId,
          provider: drama.provider,
          slug: resolvedSlug,
        },
        '',
        path
      );
    } else {
      window.history.replaceState(
        {
          bookId: drama.bookId,
          provider: drama.provider,
          slug: resolvedSlug,
        },
        '',
        path
      );
    }
    setActiveSeoLanding(null);
    setActiveDramaRoute({
      bookId: drama.bookId,
      providerHint: drama.provider,
      drama,
      episodes: [],
      notFound: false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closeDramaRoute = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.__INITIAL_NOT_FOUND__ = undefined;
    }
    const targetPath =
      activeTab === 'providers' && selectedProvider !== 'All'
        ? `/provider/${getProviderRouteSlug(selectedProvider)}`
        : getTabPath(activeTab);
    if (window.location.pathname !== targetPath || window.location.search) {
      window.history.pushState({}, '', targetPath);
    }
    setActiveDramaRoute(null);
    setActiveSeoLanding(null);
    if (activeTab === 'providers' && selectedProvider !== 'All') {
      syncProviderDocumentSeo(selectedProvider, language);
    } else {
      syncSectionDocumentSeo(activeTab, language);
    }
  }, [activeTab, selectedProvider, language]);

  const openTagRoute = useCallback(
    (tag: string) => {
      const clean = tag.trim();
      if (!clean) return;
      const slug = slugifyDramaTitle(clean);
      openSeoLandingPath(`/tag/${slug}`);
    },
    [openSeoLandingPath]
  );

  const closeSeoLandingRoute = useCallback(() => {
    setActiveSeoLanding(null);
    if (/^\/(genre|category|tag)\//i.test(window.location.pathname)) {
      window.history.pushState({}, '', '/');
    }
    syncHomeDocumentSeo(language);
  }, [language]);

  const handleChangeLanguage = useCallback(
    async (
      nextLang: LanguageCode,
      pref?: LanguagePreference,
      options?: { silent?: boolean }
    ) => {
      if (pref !== 'auto') {
        setLanguageState(nextLang);
      }
      setLanguageLoading(true);
      try {
        await loadHomeFromCache(nextLang, selectedProvider, false);
        if (activeTab !== 'home') {
          await fetchAllFeeds(nextLang);
        }
        if (!options?.silent) {
          const meta = getLanguageMeta(nextLang);
          const dict = getDictionary(nextLang);
          pushToast(
            `${dict.languageSwitcher.syncedNotice} ${meta.label}`,
            'gold'
          );
        }
      } catch {
        if (!options?.silent) {
          pushToast(getDictionary(nextLang).ui.languageSwitchFailed, 'error');
        }
      } finally {
        setLanguageLoading(false);
      }
    },
    [
      setLanguageState,
      loadHomeFromCache,
      selectedProvider,
      activeTab,
      fetchAllFeeds,
      pushToast,
    ]
  );

  useEffect(() => {
    const onLanguageEvent = (evt: Event) => {
      const detail = (
        evt as CustomEvent<{
          lang?: LanguageCode;
          pref?: LanguagePreference;
          silent?: boolean;
        }>
      ).detail;
      if (detail?.lang) {
        void handleChangeLanguage(detail.lang, detail.pref, {
          silent: detail.silent,
        });
      }
    };
    window.addEventListener('kd:change-language', onLanguageEvent);
    return () => {
      window.removeEventListener('kd:change-language', onLanguageEvent);
    };
  }, [handleChangeLanguage]);

  const handlePlayEpisode = useCallback(
    (
      drama: DramaItem,
      episode = 1,
      episodesList: EpisodeItem[] = [],
      startAtSeconds?: number
    ) => {
      saveDramaLookupCache(drama);
      const resume = getResumePoint(drama.bookId, drama.provider);
      const resolvedTime =
        typeof startAtSeconds === 'number'
          ? startAtSeconds
          : resume && resume.episode === episode
          ? resume.currentTime
          : 0;

      if (typeof window !== 'undefined') {
        const watchPath = getWatchPath(
          drama.bookId,
          drama.title,
          drama.provider,
          drama.slug,
          episode
        );
        const resolvedSlug = drama.slug || slugifyDramaTitle(drama.title);
        const prevState =
          window.history.state && typeof window.history.state === 'object'
            ? (window.history.state as Record<string, unknown>)
            : {};
        if (`${window.location.pathname}${window.location.search}` !== watchPath) {
          window.history.pushState(
            {
              ...prevState,
              bookId: drama.bookId,
              provider: drama.provider,
              slug: resolvedSlug,
            },
            '',
            watchPath
          );
        }
      }

      recordWatchProgress(drama, episode, resolvedTime);
      setPlayerState({
        drama,
        episode,
        initialTime: resolvedTime,
        episodes: episodesList,
      });
    },
    [getResumePoint, recordWatchProgress]
  );

  // Deduplicated catalog pool (from SQLite Home cache + any loaded Explore feeds)
  const allLoadedDramas = useMemo(() => {
    const homeItems = homeCatalog
      ? [
          ...homeCatalog.heroSpotlights,
          ...homeCatalog.trendingTop,
          ...homeCatalog.hotReleases,
          ...homeCatalog.catalogGrid,
        ]
      : [];
    const extraItems = EXTRA_PROVIDER_NAMES.flatMap((name) => {
      const b = extraFeeds[name];
      return [
        ...b.main.items,
        ...b.rank.items,
        ...b.newest.items,
        ...b.vip.items,
        ...(b.anime?.items ?? []),
        ...(b.dubbing?.items ?? []),
        ...(b.special?.items ?? []),
      ];
    });
    const combined = [
      ...homeItems,
      ...dbRankingFeed.items,
      ...nsTrendingFeed.items,
      ...arAsianFeed.items,
      ...mlRankFeed.items,
      ...dbForYouFeed.items,
      ...nsForYouFeed.items,
      ...arForYouFeed.items,
      ...mlForYouFeed.items,
      ...dbNewFeed.items,
      ...nsAllFeed.items,
      ...mlNewFeed.items,
      ...dbVipFeed.items,
      ...dbDubbingFeed.items,
      ...nsAnimeFeed.items,
      ...mlAnimeFeed.items,
      ...extraItems,
    ];
    const seen = new Set<string>();
    const out: DramaItem[] = [];
    for (const d of combined) {
      const key = `${d.provider}:${d.bookId}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(d);
      }
    }
    return out;
  }, [
    homeCatalog,
    dbRankingFeed.items,
    nsTrendingFeed.items,
    arAsianFeed.items,
    mlRankFeed.items,
    dbForYouFeed.items,
    nsForYouFeed.items,
    arForYouFeed.items,
    mlForYouFeed.items,
    dbNewFeed.items,
    nsAllFeed.items,
    mlNewFeed.items,
    dbVipFeed.items,
    dbDubbingFeed.items,
    nsAnimeFeed.items,
    mlAnimeFeed.items,
    extraFeeds,
  ]);

  // Resolve clean /drama/{slug} and /movie/{slug} client-side if not hydrated via SSR
  useEffect(() => {
    const slugHint = activeDramaRoute?.slugHint;
    if (!slugHint || activeDramaRoute?.drama) return;

    if (
      activeDramaRoute?.providerHint === 'LK21' ||
      activeDramaRoute?.providerHint === 'LookSeries'
    ) {
      const isLs = activeDramaRoute.providerHint === 'LookSeries';
      let cancelled = false;
      (isLs
        ? Promise.allSettled([
            fetchLookSeriesDetail(slugHint),
            fetchLookSeriesEpisodesAsEpisodeItems(slugHint),
          ])
        : Promise.allSettled([
            fetchLk21Detail(slugHint),
            fetchLk21EpisodesAsEpisodeItems(slugHint),
          ])
      )
        .then(([detRes, epsRes]) => {
          if (cancelled) return;
          const eps = epsRes.status === 'fulfilled' ? epsRes.value : [];
          if (detRes.status === 'fulfilled' && detRes.value) {
            const movieItem = movieToDramaItem(detRes.value, eps.length || 1);
            saveDramaLookupCache(movieItem);
            setActiveDramaRoute((prev) => ({
              bookId: movieItem.bookId || slugHint,
              providerHint: movieItem.provider,
              drama: movieItem,
              episodes: eps,
              mode: prev?.mode,
              watchEpisode: prev?.watchEpisode,
            }));
          } else {
            setActiveDramaRoute((prev) =>
              prev ? { ...prev, slugHint: undefined, episodes: eps } : null
            );
          }
        })
        .catch(() => {
          if (!cancelled) {
            setActiveDramaRoute((prev) =>
              prev ? { ...prev, slugHint: undefined } : null
            );
          }
        });
      return () => {
        cancelled = true;
      };
    }

    const cachedLocal = findDramaInLookupCache(
      slugHint,
      activeDramaRoute?.providerHint
    );
    if (cachedLocal) {
      setActiveDramaRoute((prev) => ({
        bookId: cachedLocal.bookId,
        providerHint: cachedLocal.provider,
        drama: cachedLocal,
        episodes: [],
        mode: prev?.mode,
        watchEpisode: prev?.watchEpisode,
      }));
      return;
    }

    const localMatch = allLoadedDramas.find(
      (d) =>
        (d.slug || slugifyDramaTitle(d.title)) === slugHint ||
        d.bookId === slugHint
    );
    if (localMatch) {
      saveDramaLookupCache(localMatch);
      setActiveDramaRoute((prev) => ({
        bookId: localMatch.bookId,
        providerHint: localMatch.provider,
        drama: localMatch,
        episodes: [],
        mode: prev?.mode,
        watchEpisode: prev?.watchEpisode,
      }));
      return;
    }

    let cancelled = false;
    const resolveParams = new URLSearchParams({ slug: slugHint });
    if (activeDramaRoute?.providerHint) {
      resolveParams.set('provider', activeDramaRoute.providerHint);
    }
    const urlBookId =
      typeof window !== 'undefined'
        ? readDeepLinkBookId(new URLSearchParams(window.location.search))
        : '';
    if (urlBookId) {
      resolveParams.set('bookId', urlBookId);
    }
    fetch(`/api/drama/resolve?${resolveParams.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            ok?: boolean;
            dramaId?: string;
            provider?: string;
            drama?: DramaItem;
          } | null
        ) => {
          if (cancelled) return;
          if (data?.ok && data.dramaId) {
            const resolvedProv =
              parseProviderName(data.provider) ??
              activeDramaRoute?.providerHint ??
              'DramaBoxV2';
            if (data.drama) {
              saveDramaLookupCache({
                ...data.drama,
                bookId: data.dramaId,
                provider: resolvedProv,
              });
            }
            setActiveDramaRoute((prev) => ({
              bookId: data.dramaId!,
              providerHint: resolvedProv,
              drama: data.drama
                ? { ...data.drama, bookId: data.dramaId!, provider: resolvedProv }
                : null,
              episodes: [],
              mode: prev?.mode,
              watchEpisode: prev?.watchEpisode,
            }));
          } else {
            setActiveDramaRoute((prev) =>
              prev ? { ...prev, slugHint: undefined } : null
            );
          }
        }
      )
      .catch(() => {
        if (!cancelled) {
          setActiveDramaRoute((prev) =>
            prev ? { ...prev, slugHint: undefined } : null
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeDramaRoute?.slugHint,
    activeDramaRoute?.drama,
    activeDramaRoute?.providerHint,
    allLoadedDramas,
  ]);

  const trendingOnKanoItems = useMemo(() => {
    const normalizeProv = (p?: string) => (p || 'DramaBoxV2').trim().toLowerCase();
    const selectedProvNorm =
      selectedProvider !== 'All' ? normalizeProv(selectedProvider) : null;

    const mergedMap = new Map<string, { item: DramaItem; order: number }>();
    let seq = 0;

    const pushCandidate = (item: DramaItem) => {
      if (!item || !item.bookId) return;
      if (selectedProvNorm && normalizeProv(item.provider) !== selectedProvNorm) {
        return;
      }
      const key = `${normalizeProv(item.provider)}:${item.bookId}`;
      const existing = mergedMap.get(key);
      if (!existing) {
        mergedMap.set(key, { item, order: seq++ });
        return;
      }
      const cur = existing.item;
      const curViews = Math.max(cur.totalViews ?? 0, cur.dailyViews ?? 0);
      const nextViews = Math.max(item.totalViews ?? 0, item.dailyViews ?? 0);
      mergedMap.set(key, {
        order: existing.order,
        item: {
          ...cur,
          ...item,
          title: item.title || cur.title,
          cover: item.cover || cur.cover,
          description: item.description || cur.description,
          tags: item.tags?.length ? item.tags : cur.tags,
          totalViews: Math.max(cur.totalViews ?? 0, item.totalViews ?? 0, nextViews, curViews),
          dailyViews: Math.max(cur.dailyViews ?? 0, item.dailyViews ?? 0),
        },
      });
    };

    for (const item of serverTrendingItems) pushCandidate(item);
    for (const item of homeCatalog?.trendingTop ?? []) pushCandidate(item);
    for (const item of dbRankingFeed.items) pushCandidate(item);
    for (const item of nsTrendingFeed.items) pushCandidate(item);
    for (const item of arAsianFeed.items) pushCandidate(item);
    for (const item of mlRankFeed.items) pushCandidate(item);
    for (const n of EXTRA_PROVIDER_NAMES) {
      const b = extraFeeds[n];
      for (const item of b.rank.items.length > 0 ? b.rank.items : b.main.items) {
        pushCandidate(item);
      }
    }

    const enriched = Array.from(mergedMap.values()).map(({ item, order }) => {
      const live = getDramaLiveStats(item.bookId, item.provider);
      const totalViews = Math.max(
        item.totalViews ?? 0,
        live?.totalViews ?? 0
      );
      const dailyViews = Math.max(
        item.dailyViews ?? 0,
        live?.dailyViews ?? 0
      );
      return {
        item: {
          ...item,
          totalViews,
          dailyViews,
        },
        totalViews,
        dailyViews,
        order,
      };
    });

    enriched.sort((a, b) => {
      if (b.totalViews !== a.totalViews) return b.totalViews - a.totalViews;
      if (b.dailyViews !== a.dailyViews) return b.dailyViews - a.dailyViews;
      return a.order - b.order;
    });

    return enriched.map((entry, idx) => ({
      ...entry.item,
      rank: idx + 1,
      trendBadge:
        entry.totalViews > 0 || entry.dailyViews > 0
          ? idx < 4
            ? ('HOT' as const)
            : ('TRENDING' as const)
          : entry.item.trendBadge,
    }));
  }, [
    selectedProvider,
    serverTrendingItems,
    homeCatalog?.trendingTop,
    dbRankingFeed.items,
    nsTrendingFeed.items,
    arAsianFeed.items,
    mlRankFeed.items,
    extraFeeds,
    liveBadgeMap,
    getDramaLiveStats,
  ]);

  const trendingSearchPool = useMemo(() => {
    if (trendingOnKanoItems.length > 0) {
      return trendingOnKanoItems.slice(0, 10);
    }
    if (homeCatalog && homeCatalog.trendingTop.length > 0) {
      return homeCatalog.trendingTop.slice(0, 10);
    }
    return interleaveManyFeeds(
      dbRankingFeed.items,
      nsTrendingFeed.items,
      arAsianFeed.items,
      mlRankFeed.items
    ).slice(0, 10);
  }, [
    trendingOnKanoItems,
    homeCatalog,
    dbRankingFeed.items,
    nsTrendingFeed.items,
    arAsianFeed.items,
    mlRankFeed.items,
  ]);

  // Provider Live Counts for Provider Hub Modal
  const providerCounts = useMemo(() => {
    const dbKeys = new Set(
      [
        ...dbRankingFeed.items,
        ...dbForYouFeed.items,
        ...dbNewFeed.items,
        ...dbVipFeed.items,
        ...dbDubbingFeed.items,
      ].map((d) => d.bookId)
    );
    const nsKeys = new Set(
      [
        ...nsTrendingFeed.items,
        ...nsForYouFeed.items,
        ...nsAllFeed.items,
        ...nsAnimeFeed.items,
      ].map((d) => d.bookId)
    );
    const arKeys = new Set(
      [...arForYouFeed.items, ...arAsianFeed.items].map((d) => d.bookId)
    );
    const mlKeys = new Set(
      [
        ...mlRankFeed.items,
        ...mlForYouFeed.items,
        ...mlNewFeed.items,
        ...mlAnimeFeed.items,
      ].map((d) => d.bookId)
    );

    const cachedCounts = homeCatalog?.providerCounts ?? {};

    const out = {
      all:
        dbKeys.size + nsKeys.size + arKeys.size + mlKeys.size ||
        cachedCounts.all ||
        0,
      DramaBoxV2: dbKeys.size || cachedCounts.DramaBoxV2 || 0,
      NetShort: nsKeys.size || cachedCounts.NetShort || 0,
      AnyReel: arKeys.size || cachedCounts.AnyReel || 0,
      MeloLoV2: mlKeys.size || cachedCounts.MeloLoV2 || 0,
    } as { all: number } & Record<ProviderName, number>;

    for (const name of EXTRA_PROVIDER_NAMES) {
      const b = extraFeeds[name];
      const keys = new Set(
        [
          ...b.main.items,
          ...b.rank.items,
          ...b.newest.items,
          ...b.vip.items,
          ...(b.anime?.items ?? []),
          ...(b.dubbing?.items ?? []),
          ...(b.special?.items ?? []),
        ].map((d) => d.bookId)
      );
      const count = keys.size || cachedCounts[name] || 0;
      out[name] = count;
      if (keys.size > 0) out.all += keys.size;
    }

    return out;
  }, [
    homeCatalog,
    dbRankingFeed.items,
    dbForYouFeed.items,
    dbNewFeed.items,
    dbVipFeed.items,
    dbDubbingFeed.items,
    nsTrendingFeed.items,
    nsForYouFeed.items,
    nsAllFeed.items,
    nsAnimeFeed.items,
    arForYouFeed.items,
    arAsianFeed.items,
    mlRankFeed.items,
    mlForYouFeed.items,
    mlNewFeed.items,
    mlAnimeFeed.items,
    extraFeeds,
  ]);

  // Hero Spotlight served directly from cached Home payload (with Explore fallback)
  const heroSpotlights = useMemo(() => {
    if (homeCatalog && homeCatalog.heroSpotlights.length > 0) {
      return homeCatalog.heroSpotlights;
    }
    if (selectedProvider === 'NetShort') {
      return nsForYouFeed.items.length > 0
        ? nsForYouFeed.items.slice(0, 5)
        : nsTrendingFeed.items.slice(0, 5);
    }
    if (selectedProvider === 'AnyReel') {
      return arForYouFeed.items.length > 0
        ? arForYouFeed.items.slice(0, 5)
        : arAsianFeed.items.slice(0, 5);
    }
    if (selectedProvider === 'MeloLoV2') {
      return mlRankFeed.items.length > 0
        ? mlRankFeed.items.slice(0, 5)
        : mlForYouFeed.items.slice(0, 5);
    }
    if (selectedProvider === 'DramaBoxV2') {
      return dbRankingFeed.items.length > 0
        ? dbRankingFeed.items.slice(0, 5)
        : dbForYouFeed.items.slice(0, 5);
    }
    if (isExtraProvider(selectedProvider)) {
      const b = extraFeeds[selectedProvider];
      const list = b.rank.items.length > 0 ? b.rank.items : b.main.items;
      return list.slice(0, 5);
    }
    return interleaveManyFeeds(
      dbRankingFeed.items.slice(0, 2),
      nsForYouFeed.items.slice(0, 2),
      arForYouFeed.items.slice(0, 2),
      mlRankFeed.items.slice(0, 2)
    ).slice(0, 8);
  }, [
    homeCatalog,
    selectedProvider,
    dbRankingFeed.items,
    dbForYouFeed.items,
    nsForYouFeed.items,
    nsTrendingFeed.items,
    arForYouFeed.items,
    arAsianFeed.items,
    mlRankFeed.items,
    mlForYouFeed.items,
    extraFeeds,
  ]);

  const heroLoading = homeLoading && heroSpotlights.length === 0;

  // Real Watch History for Continue Watching Row
  const continueWatchingData = useMemo(() => {
    const items = watchHistory.map((h) => h.drama);
    const map: Record<
      string,
      { episode: number; currentTime: number; progress: number }
    > = {};
    for (const h of watchHistory) {
      map[`${h.provider}:${h.bookId}`] = {
        episode: h.episode,
        currentTime: h.currentTime,
        progress: h.progress,
      };
    }
    return { items, map };
  }, [watchHistory]);

  // Personalized Behavioral Recommendations ("Picked For You")
  const pickedForYouData = useMemo(() => {
    const pool =
      homeCatalog && allLoadedDramas.length > 0
        ? allLoadedDramas
        : [
            ...(homeCatalog?.catalogGrid ?? []),
            ...(homeCatalog?.hotReleases ?? []),
            ...(homeCatalog?.trendingTop ?? []),
          ];
    return buildPickedForYouRecommendations({
      catalog: pool,
      watchHistory,
      likedDramaIds,
      myListItems,
      completedDramaIds,
      limit: 14,
    });
  }, [
    homeCatalog,
    allLoadedDramas,
    watchHistory,
    likedDramaIds,
    myListItems,
    completedDramaIds,
  ]);

  // Unified Recommended Feed respecting Provider Filter
  const recommendedItems = useMemo(() => {
    if (selectedProvider === 'DramaBoxV2') return dbForYouFeed.items;
    if (selectedProvider === 'NetShort') return nsForYouFeed.items;
    if (selectedProvider === 'AnyReel') return arForYouFeed.items;
    if (selectedProvider === 'MeloLoV2') return mlForYouFeed.items;
    if (isExtraProvider(selectedProvider)) {
      return extraFeeds[selectedProvider].main.items;
    }
    return interleaveManyFeeds(
      dbForYouFeed.items,
      nsForYouFeed.items,
      arForYouFeed.items,
      mlForYouFeed.items,
      ...EXTRA_PROVIDER_NAMES.map((n) => extraFeeds[n].main.items)
    );
  }, [
    selectedProvider,
    dbForYouFeed.items,
    nsForYouFeed.items,
    arForYouFeed.items,
    mlForYouFeed.items,
    extraFeeds,
  ]);

  // Unified New Releases respecting Provider Filter
  const newReleaseItems = useMemo(() => {
    if (selectedProvider === 'DramaBoxV2') return dbNewFeed.items;
    if (selectedProvider === 'NetShort') return nsAllFeed.items;
    if (selectedProvider === 'AnyReel') return arAsianFeed.items;
    if (selectedProvider === 'MeloLoV2') return mlNewFeed.items;
    if (isExtraProvider(selectedProvider)) {
      const b = extraFeeds[selectedProvider];
      return b.newest.items.length > 0 ? b.newest.items : b.main.items;
    }
    return interleaveManyFeeds(
      dbNewFeed.items,
      nsAllFeed.items,
      arAsianFeed.items,
      mlNewFeed.items,
      ...EXTRA_PROVIDER_NAMES.map((n) =>
        extraFeeds[n].newest.items.length > 0
          ? extraFeeds[n].newest.items
          : extraFeeds[n].main.items
      )
    );
  }, [
    selectedProvider,
    dbNewFeed.items,
    nsAllFeed.items,
    arAsianFeed.items,
    mlNewFeed.items,
    extraFeeds,
  ]);

  // Unified Anime Feed respecting Provider Filter (NetShort + MeloLoV2 + MoboReels + FreeReels + GoodShort + iQIYI + Bstation + Anichin + DonghuaQueen + Samehadaku + AnimeX)
  const combinedAnimeItems = useMemo(() => {
    const moboAnime = extraFeeds.MoboReels.anime?.items ?? [];
    const freeReelsAnime = extraFeeds.FreeReels.anime?.items ?? [];
    const goodShortAnime = extraFeeds.GoodShort.anime?.items ?? [];
    const iqiyiAnime = extraFeeds.iQIYI.anime?.items ?? [];
    const bstationAnime = extraFeeds.Bstation.anime?.items ?? [];
    const anichinAnime = extraFeeds.Anichin.anime?.items ?? [];
    const donghuaQueenAnime = extraFeeds.DonghuaQueen.anime?.items ?? [];
    const samehadakuAnime = extraFeeds.Samehadaku.anime?.items ?? [];
    const animeXAnime = extraFeeds.AnimeX.anime?.items ?? [];
    if (selectedProvider === 'MeloLoV2') return mlAnimeFeed.items;
    if (selectedProvider === 'NetShort') return nsAnimeFeed.items;
    if (selectedProvider === 'MoboReels') return moboAnime;
    if (selectedProvider === 'FreeReels') return freeReelsAnime;
    if (selectedProvider === 'GoodShort') return goodShortAnime;
    if (selectedProvider === 'iQIYI') return iqiyiAnime;
    if (selectedProvider === 'Bstation') return bstationAnime;
    if (selectedProvider === 'Anichin') return anichinAnime;
    if (selectedProvider === 'DonghuaQueen') return donghuaQueenAnime;
    if (selectedProvider === 'Samehadaku') return samehadakuAnime;
    if (selectedProvider === 'AnimeX') return animeXAnime;
    return interleaveManyFeeds(
      nsAnimeFeed.items,
      mlAnimeFeed.items,
      bstationAnime,
      anichinAnime,
      donghuaQueenAnime,
      samehadakuAnime,
      animeXAnime,
      iqiyiAnime,
      moboAnime,
      freeReelsAnime,
      goodShortAnime
    );
  }, [selectedProvider, nsAnimeFeed.items, mlAnimeFeed.items, extraFeeds]);

  // Unified Dubbed Feed respecting Provider Filter (DramaBoxV2 + FreeReels + GoodShort)
  const combinedDubbingItems = useMemo(() => {
    const freeReelsDub = extraFeeds.FreeReels.dubbing?.items ?? [];
    const goodShortDub = extraFeeds.GoodShort.dubbing?.items ?? [];
    if (selectedProvider === 'DramaBoxV2') return dbDubbingFeed.items;
    if (selectedProvider === 'FreeReels') return freeReelsDub;
    if (selectedProvider === 'GoodShort') return goodShortDub;
    return interleaveManyFeeds(dbDubbingFeed.items, freeReelsDub, goodShortDub);
  }, [selectedProvider, dbDubbingFeed.items, extraFeeds]);

  const activeCategoryWatchlistItems = useMemo(
    () => (watchlistCategory === 'movie' ? movieWatchlistItems : dramaWatchlistItems),
    [watchlistCategory, movieWatchlistItems, dramaWatchlistItems]
  );

  // Watchlist filtered by selected category, folder & watch status
  const folderScopedWatchlist = useMemo(() => {
    if (activeFolderId === 'all') return activeCategoryWatchlistItems;
    return activeCategoryWatchlistItems.filter(
      (d) => getDramaFolderId(d.bookId, d.provider) === activeFolderId
    );
  }, [activeCategoryWatchlistItems, activeFolderId, getDramaFolderId]);

  const watchStatusCounts = useMemo(() => {
    let watching = 0;
    let plan = 0;
    let completed = 0;
    for (const d of folderScopedWatchlist) {
      const st = getDramaWatchStatus(d);
      if (st === 'watching') watching++;
      else if (st === 'completed') completed++;
      else plan++;
    }
    return {
      all: folderScopedWatchlist.length,
      watching,
      plan,
      completed,
    };
  }, [folderScopedWatchlist, getDramaWatchStatus]);

  const filteredWatchlistItems = useMemo(() => {
    if (watchStatusFilter === 'all') return folderScopedWatchlist;
    return folderScopedWatchlist.filter(
      (d) => getDramaWatchStatus(d) === watchStatusFilter
    );
  }, [folderScopedWatchlist, watchStatusFilter, getDramaWatchStatus]);

  const activeGridInfo = useMemo(() => {
    const selectedExtra = isExtraProvider(selectedProvider)
      ? selectedProvider
      : null;

    switch (activeTab) {
      case 'ranking': {
        if (selectedExtra) {
          const b = extraFeeds[selectedExtra];
          const feed = b.rank.items.length > 0 ? b.rank : b.main;
          const adapter = ALL_PROVIDER_ADAPTERS[selectedExtra];
          return {
            title: `${adapter.label} · ${t.sections.trendingNow}`,
            items:
              trendingOnKanoItems.length > 0 ? trendingOnKanoItems : feed.items,
            loading:
              trendingOnKanoItems.length === 0 &&
              (b.rank.loading || b.main.loading),
            loadingMore: feed.loadingMore,
            error: trendingOnKanoItems.length > 0 ? null : feed.error,
            hasMore: feed.hasMore,
            badgeStyle: 'none' as const,
            ranked: true,
            onLoadMore: () =>
              loadExtraFeedSlot(
                selectedExtra,
                b.rank.items.length > 0 ? 'rank' : 'main',
                (p) =>
                  b.rank.items.length > 0
                    ? adapter.fetchRanking(p)
                    : adapter.fetchForYou(p),
                feed.page + 1,
                true
              ),
            onRetry: () => ensureExtraProviderFullLoaded(selectedExtra, true),
          };
        }

        return {
          title: t.sections.trendingNow,
          items:
            trendingOnKanoItems.length > 0
              ? trendingOnKanoItems
              : selectedProvider === 'NetShort'
                ? nsTrendingFeed.items
                : selectedProvider === 'AnyReel'
                  ? arAsianFeed.items
                  : selectedProvider === 'MeloLoV2'
                    ? mlRankFeed.items
                    : selectedProvider === 'DramaBoxV2'
                      ? dbRankingFeed.items
                      : interleaveManyFeeds(
                          dbRankingFeed.items,
                          nsTrendingFeed.items,
                          arAsianFeed.items,
                          mlRankFeed.items,
                          ...EXTRA_PROVIDER_NAMES.map((n) =>
                            extraFeeds[n].rank.items.length > 0
                              ? extraFeeds[n].rank.items
                              : extraFeeds[n].main.items
                          )
                        ),
          loading:
            dbRankingFeed.loading &&
            nsTrendingFeed.loading &&
            arAsianFeed.loading &&
            mlRankFeed.loading,
          loadingMore:
            dbRankingFeed.loadingMore ||
            nsTrendingFeed.loadingMore ||
            arAsianFeed.loadingMore ||
            mlRankFeed.loadingMore,
          error:
            dbRankingFeed.error &&
            nsTrendingFeed.error &&
            arAsianFeed.error &&
            mlRankFeed.error,
          hasMore:
            (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2'
              ? dbRankingFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'NetShort'
              ? nsTrendingFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'AnyReel'
              ? arAsianFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'MeloLoV2'
              ? mlRankFeed.hasMore
              : false),
          badgeStyle: 'none' as const,
          ranked: true,
          onLoadMore: () => {
            if (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2') {
              loadSingleFeed(
                dramaBoxV2Provider.fetchRanking,
                setDbRankingFeed,
                dbRankingFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'NetShort') {
              loadSingleFeed(
                netShortProvider.fetchRanking,
                setNsTrendingFeed,
                nsTrendingFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'AnyReel') {
              loadSingleFeed(
                anyReelProvider.fetchRanking,
                setArAsianFeed,
                arAsianFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'MeloLoV2') {
              loadSingleFeed(
                meloLoV2Provider.fetchRanking,
                setMlRankFeed,
                mlRankFeed.page + 1,
                true
              );
            }
          },
          onRetry: () => fetchAllFeeds(),
        };
      }
      case 'terbaru': {
        if (selectedExtra) {
          const b = extraFeeds[selectedExtra];
          const feed = b.newest.items.length > 0 ? b.newest : b.main;
          const adapter = ALL_PROVIDER_ADAPTERS[selectedExtra];
          return {
            title: `${adapter.label} · ${t.sections.newReleases}`,
            items: feed.items,
            loading: b.newest.loading || b.main.loading,
            loadingMore: feed.loadingMore,
            error: feed.error,
            hasMore: feed.hasMore,
            badgeStyle: 'NEW' as const,
            ranked: false,
            onLoadMore: () =>
              loadExtraFeedSlot(
                selectedExtra,
                b.newest.items.length > 0 ? 'newest' : 'main',
                (p) =>
                  b.newest.items.length > 0
                    ? adapter.fetchNewReleases(p)
                    : adapter.fetchForYou(p),
                feed.page + 1,
                true
              ),
            onRetry: () => ensureExtraProviderFullLoaded(selectedExtra, true),
          };
        }

        return {
          title: t.sections.newReleases,
          items: newReleaseItems,
          loading:
            dbNewFeed.loading &&
            nsAllFeed.loading &&
            arAsianFeed.loading &&
            mlNewFeed.loading,
          loadingMore:
            dbNewFeed.loadingMore ||
            nsAllFeed.loadingMore ||
            arAsianFeed.loadingMore ||
            mlNewFeed.loadingMore,
          error:
            dbNewFeed.error &&
            nsAllFeed.error &&
            arAsianFeed.error &&
            mlNewFeed.error,
          hasMore:
            (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2'
              ? dbNewFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'NetShort'
              ? nsAllFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'AnyReel'
              ? arAsianFeed.hasMore
              : false) ||
            (selectedProvider === 'All' || selectedProvider === 'MeloLoV2'
              ? mlNewFeed.hasMore
              : false),
          badgeStyle: 'NEW' as const,
          ranked: false,
          onLoadMore: () => {
            if (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2') {
              loadSingleFeed(
                dramaBoxV2Provider.fetchNewReleases,
                setDbNewFeed,
                dbNewFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'NetShort') {
              loadSingleFeed(
                netShortProvider.fetchNewReleases,
                setNsAllFeed,
                nsAllFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'AnyReel') {
              loadSingleFeed(
                anyReelProvider.fetchNewReleases,
                setArAsianFeed,
                arAsianFeed.page + 1,
                true
              );
            }
            if (selectedProvider === 'All' || selectedProvider === 'MeloLoV2') {
              loadSingleFeed(
                meloLoV2Provider.fetchNewReleases,
                setMlNewFeed,
                mlNewFeed.page + 1,
                true
              );
            }
          },
          onRetry: () => fetchAllFeeds(),
        };
      }
      case 'vip': {
        if (selectedExtra) {
          const b = extraFeeds[selectedExtra];
          const feed = b.vip.items.length > 0 ? b.vip : b.main;
          const adapter = ALL_PROVIDER_ADAPTERS[selectedExtra];
          return {
            title: `${adapter.label} · ${t.sections.vipExclusives}`,
            items: feed.items,
            loading: b.vip.loading || b.main.loading,
            loadingMore: feed.loadingMore,
            error: feed.error,
            hasMore: feed.hasMore,
            badgeStyle: 'VIP' as const,
            ranked: false,
            onLoadMore: () =>
              loadExtraFeedSlot(
                selectedExtra,
                'vip',
                (p) => adapter.fetchVip(p),
                feed.page + 1,
                true
              ),
            onRetry: () => ensureExtraProviderFullLoaded(selectedExtra, true),
          };
        }

        return {
          title: t.sections.vipExclusives,
          items:
            selectedProvider === 'NetShort'
              ? nsTrendingFeed.items
              : selectedProvider === 'AnyReel'
              ? arForYouFeed.items
              : selectedProvider === 'MeloLoV2'
              ? mlRankFeed.items
              : dbVipFeed.items,
          loading: dbVipFeed.loading,
          loadingMore: dbVipFeed.loadingMore,
          error: dbVipFeed.error,
          hasMore: dbVipFeed.hasMore,
          badgeStyle: 'VIP' as const,
          ranked: false,
          onLoadMore: () =>
            loadSingleFeed(
              dramaBoxV2Provider.fetchVip,
              setDbVipFeed,
              dbVipFeed.page + 1,
              true
            ),
          onRetry: () =>
            loadSingleFeed(dramaBoxV2Provider.fetchVip, setDbVipFeed, 1, false),
        };
      }
      case 'anime': {
        const moboAnimeFeed = extraFeeds.MoboReels.anime ?? IDLE_FEED;
        const frAnimeFeed = extraFeeds.FreeReels.anime ?? IDLE_FEED;
        const gsAnimeFeed = extraFeeds.GoodShort.anime ?? IDLE_FEED;
        const iqAnimeFeed = extraFeeds.iQIYI.anime ?? IDLE_FEED;
        const animeExtraProviders: ExtraProviderName[] = [
          'Bstation',
          'Anichin',
          'DonghuaQueen',
          'Samehadaku',
          'AnimeX',
        ];
        const extraAnimeFeeds = animeExtraProviders.map((p) => ({
          provider: p,
          feed: extraFeeds[p].anime ?? IDLE_FEED,
        }));
        return {
          title: t.sections.animeDonghua,
          items:
            combinedAnimeItems.length > 0 ? combinedAnimeItems : nsAllFeed.items,
          loading:
            nsAnimeFeed.loading &&
            mlAnimeFeed.loading &&
            moboAnimeFeed.loading &&
            frAnimeFeed.loading &&
            gsAnimeFeed.loading &&
            iqAnimeFeed.loading &&
            extraAnimeFeeds.every((x) => x.feed.loading),
          loadingMore:
            nsAnimeFeed.loadingMore ||
            mlAnimeFeed.loadingMore ||
            moboAnimeFeed.loadingMore ||
            frAnimeFeed.loadingMore ||
            gsAnimeFeed.loadingMore ||
            iqAnimeFeed.loadingMore ||
            extraAnimeFeeds.some((x) => x.feed.loadingMore),
          error:
            nsAnimeFeed.error &&
            mlAnimeFeed.error &&
            moboAnimeFeed.error &&
            frAnimeFeed.error &&
            gsAnimeFeed.error &&
            iqAnimeFeed.error &&
            extraAnimeFeeds.every((x) => x.feed.error),
          hasMore:
            nsAnimeFeed.hasMore ||
            mlAnimeFeed.hasMore ||
            moboAnimeFeed.hasMore ||
            frAnimeFeed.hasMore ||
            gsAnimeFeed.hasMore ||
            iqAnimeFeed.hasMore ||
            extraAnimeFeeds.some((x) => x.feed.hasMore),
          badgeStyle: 'ANIME' as const,
          ranked: false,
          onLoadMore: () => {
            if (
              netShortProvider.fetchAnime &&
              (selectedProvider === 'All' || selectedProvider === 'NetShort')
            ) {
              loadSingleFeed(
                netShortProvider.fetchAnime,
                setNsAnimeFeed,
                nsAnimeFeed.page + 1,
                true
              );
            }
            if (
              meloLoV2Provider.fetchAnime &&
              (selectedProvider === 'All' || selectedProvider === 'MeloLoV2')
            ) {
              loadSingleFeed(
                meloLoV2Provider.fetchAnime,
                setMlAnimeFeed,
                mlAnimeFeed.page + 1,
                true
              );
            }
            if (
              selectedProvider === 'All' ||
              selectedProvider === 'MoboReels'
            ) {
              loadExtraFeedSlot(
                'MoboReels',
                'anime',
                (p) => moboReelsProvider.fetchAnimasi(p),
                moboAnimeFeed.page + 1,
                true
              );
            }
            if (
              freeReelsProvider.fetchAnime &&
              (selectedProvider === 'All' || selectedProvider === 'FreeReels')
            ) {
              const fn = freeReelsProvider.fetchAnime;
              loadExtraFeedSlot(
                'FreeReels',
                'anime',
                (p) => fn(p),
                frAnimeFeed.page + 1,
                true
              );
            }
            if (
              goodShortProvider.fetchAnime &&
              (selectedProvider === 'All' || selectedProvider === 'GoodShort')
            ) {
              const fn = goodShortProvider.fetchAnime;
              loadExtraFeedSlot(
                'GoodShort',
                'anime',
                (p) => fn(p),
                gsAnimeFeed.page + 1,
                true
              );
            }
            if (
              iqiyiProvider.fetchAnime &&
              (selectedProvider === 'All' || selectedProvider === 'iQIYI')
            ) {
              const fn = iqiyiProvider.fetchAnime;
              loadExtraFeedSlot(
                'iQIYI',
                'anime',
                (p) => fn(p),
                iqAnimeFeed.page + 1,
                true
              );
            }
            for (const { provider, feed } of extraAnimeFeeds) {
              const fn = ALL_PROVIDER_ADAPTERS[provider].fetchAnime;
              if (
                fn &&
                (selectedProvider === 'All' || selectedProvider === provider)
              ) {
                loadExtraFeedSlot(
                  provider,
                  'anime',
                  (p) => fn(p),
                  feed.page + 1,
                  true
                );
              }
            }
          },
          onRetry: () => {
            if (netShortProvider.fetchAnime) {
              loadSingleFeed(netShortProvider.fetchAnime, setNsAnimeFeed, 1, false);
            }
            if (meloLoV2Provider.fetchAnime) {
              loadSingleFeed(meloLoV2Provider.fetchAnime, setMlAnimeFeed, 1, false);
            }
            loadExtraFeedSlot(
              'MoboReels',
              'anime',
              (p) => moboReelsProvider.fetchAnimasi(p),
              1,
              false
            );
            if (freeReelsProvider.fetchAnime) {
              const fn = freeReelsProvider.fetchAnime;
              loadExtraFeedSlot('FreeReels', 'anime', (p) => fn(p), 1, false);
            }
            if (goodShortProvider.fetchAnime) {
              const fn = goodShortProvider.fetchAnime;
              loadExtraFeedSlot('GoodShort', 'anime', (p) => fn(p), 1, false);
            }
            if (iqiyiProvider.fetchAnime) {
              const fn = iqiyiProvider.fetchAnime;
              loadExtraFeedSlot('iQIYI', 'anime', (p) => fn(p), 1, false);
            }
            for (const { provider } of extraAnimeFeeds) {
              const fn = ALL_PROVIDER_ADAPTERS[provider].fetchAnime;
              if (fn) {
                loadExtraFeedSlot(provider, 'anime', (p) => fn(p), 1, false);
              }
            }
          },
        };
      }
      case 'dubbing': {
        const frDubFeed = extraFeeds.FreeReels.dubbing ?? IDLE_FEED;
        const gsDubFeed = extraFeeds.GoodShort.dubbing ?? IDLE_FEED;
        return {
          title: t.sections.dubbedSeries,
          items: combinedDubbingItems,
          loading:
            dbDubbingFeed.loading && frDubFeed.loading && gsDubFeed.loading,
          loadingMore:
            dbDubbingFeed.loadingMore ||
            frDubFeed.loadingMore ||
            gsDubFeed.loadingMore,
          error: dbDubbingFeed.error && frDubFeed.error && gsDubFeed.error,
          hasMore:
            dbDubbingFeed.hasMore || frDubFeed.hasMore || gsDubFeed.hasMore,
          badgeStyle: 'DUB' as const,
          ranked: false,
          onLoadMore: () => {
            if (
              dramaBoxV2Provider.fetchDubbing &&
              (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2')
            ) {
              loadSingleFeed(
                dramaBoxV2Provider.fetchDubbing,
                setDbDubbingFeed,
                dbDubbingFeed.page + 1,
                true
              );
            }
            if (
              freeReelsProvider.fetchDubbing &&
              (selectedProvider === 'All' || selectedProvider === 'FreeReels')
            ) {
              const fn = freeReelsProvider.fetchDubbing;
              loadExtraFeedSlot(
                'FreeReels',
                'dubbing',
                (p) => fn(p),
                frDubFeed.page + 1,
                true
              );
            }
            if (
              goodShortProvider.fetchDubbing &&
              (selectedProvider === 'All' || selectedProvider === 'GoodShort')
            ) {
              const fn = goodShortProvider.fetchDubbing;
              loadExtraFeedSlot(
                'GoodShort',
                'dubbing',
                (p) => fn(p),
                gsDubFeed.page + 1,
                true
              );
            }
          },
          onRetry: () => {
            if (dramaBoxV2Provider.fetchDubbing) {
              loadSingleFeed(
                dramaBoxV2Provider.fetchDubbing,
                setDbDubbingFeed,
                1,
                false
              );
            }
            if (freeReelsProvider.fetchDubbing) {
              const fn = freeReelsProvider.fetchDubbing;
              loadExtraFeedSlot('FreeReels', 'dubbing', (p) => fn(p), 1, false);
            }
            if (goodShortProvider.fetchDubbing) {
              const fn = goodShortProvider.fetchDubbing;
              loadExtraFeedSlot('GoodShort', 'dubbing', (p) => fn(p), 1, false);
            }
          },
        };
      }
      case 'mylist':
        return {
          title:
            watchlistCategory === 'movie'
              ? t.moviesPage.watchlistTitle
              : t.sections.dramaWatchlistTitle,
          items:
            watchlistCategory === 'movie' && !user ? [] : filteredWatchlistItems,
          loading: false,
          loadingMore: false,
          error: null,
          hasMore: false,
          badgeStyle: 'none' as const,
          ranked: false,
          onLoadMore: undefined,
          onRetry: () => {},
        };
      default:
        return null;
    }
  }, [
    activeTab,
    watchlistCategory,
    user,
    selectedProvider,
    t,
    dbRankingFeed,
    nsTrendingFeed,
    arAsianFeed,
    arForYouFeed,
    mlRankFeed,
    newReleaseItems,
    dbNewFeed,
    nsAllFeed,
    mlNewFeed,
    dbVipFeed,
    combinedAnimeItems,
    combinedDubbingItems,
    nsAnimeFeed,
    mlAnimeFeed,
    dbDubbingFeed,
    extraFeeds,
    filteredWatchlistItems,
    loadSingleFeed,
    loadExtraFeedSlot,
    ensureExtraProviderFullLoaded,
    fetchAllFeeds,
  ]);

  const providerLabel = (id: ProviderId): string => {
    if (id === 'All') return t.providers.all;
    if (id === 'DramaBoxV2') return t.providers.dramaBox;
    if (id === 'NetShort') return t.providers.netShort;
    if (id === 'AnyReel') return t.providers.anyReel;
    if (id === 'MeloLoV2') return t.providers.melolo;
    return ALL_PROVIDER_ADAPTERS[id]?.label ?? id;
  };

  return (
    <div className="min-h-screen bg-[var(--cd-bg)] text-[#FAFAFA] flex flex-col overflow-x-hidden">
      <Navbar
        activeTab={activeTab}
        onSelectTab={handleNavigateTab}
        languageLoading={languageLoading}
        onChangeLanguage={handleChangeLanguage}
        onOpenSearchModal={handleOpenSearch}
      />

      <DesktopSidebar
        activeTab={activeTab}
        selectedProvider={selectedProvider}
        hasActiveSubRoute={Boolean(activeDramaRoute || activeSeoLanding)}
        onSelectTab={handleNavigateTab}
        onOpenProviderHub={handleOpenProviderHub}
      />

      <div className="flex-1 flex flex-col md:pl-[72px] lg:pl-[216px] min-w-0">

      {activeDramaRoute ? (
        <main className="flex-1">
          {activeDramaRoute.slugHint && !activeDramaRoute.drama ? (
            <DetailPageSkeleton />
          ) : (
            <Suspense fallback={<DetailPageSkeleton />}>
              <DramaDetailPage
                key={`${activeDramaRoute.providerHint ?? 'auto'}:${activeDramaRoute.bookId}`}
                bookId={activeDramaRoute.bookId}
                providerHint={activeDramaRoute.providerHint}
                initialDrama={activeDramaRoute.drama}
                initialEpisodes={activeDramaRoute.episodes}
                initialNotFound={Boolean(activeDramaRoute.notFound)}
                relatedDramas={
                  activeDramaRoute.providerHint === 'LK21' ||
                  activeDramaRoute.providerHint === 'LookSeries' ||
                  activeDramaRoute.drama?.mediaType === 'movie'
                    ? [...moviesPool, ...allLoadedDramas]
                    : allLoadedDramas
                }
                onBackHome={closeDramaRoute}
                onSelectTag={openTagRoute}
                onSelectDrama={openDramaRoute}
                onPlayEpisode={handlePlayEpisode}
              />
            </Suspense>
          )}
        </main>
      ) : activeSeoLanding ? (
        <main className="flex-1 pb-20 md:pb-12">
          <Suspense
            fallback={
              <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8">
                <CarouselSkeleton />
              </div>
            }
          >
            <SeoLandingPage
              basePath={activeSeoLanding.basePath}
              slug={activeSeoLanding.slug}
              modifier={activeSeoLanding.modifier}
              localPool={allLoadedDramas}
              myListIds={myListIds}
              onBackHome={closeSeoLandingRoute}
              onNavigateLanding={openSeoLandingPath}
              onSelectDrama={openDramaRoute}
              onQuickPlay={(d) => handlePlayEpisode(d, 1)}
              onToggleMyList={toggleMyList}
            />
          </Suspense>
        </main>
      ) : (
        <main className="flex-1 pb-20 md:pb-8">
          {activeTab === 'dashboard' || activeTab === 'rewards' ? (
            <Suspense
              fallback={
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-16 flex justify-center">
                  <Loader2 className="w-7 h-7 cd-accent-text animate-spin" />
                </div>
              }
            >
              <UserDashboard
                onSelectDrama={openDramaRoute}
                onPlayDrama={(d, ep = 1, resumeTimeSec) =>
                  handlePlayEpisode(d, ep, [], resumeTimeSec)
                }
                onBackToHome={() => handleNavigateTab('home')}
                initialSubTab={activeTab === 'rewards' ? 'rewards' : dashboardSubTab}
                initialWatchlistCategory={dashboardWatchlistCategory}
                standaloneRewards={activeTab === 'rewards'}
              />
            </Suspense>
          ) : activeTab === 'movies' ? (
            <Suspense
              fallback={
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-8">
                  <CarouselSkeleton />
                  <CarouselSkeleton />
                </div>
              }
            >
              <MoviesView
                myListIds={myListIds}
                onSelectMovie={openDramaRoute}
                onQuickPlayMovie={(m) => handlePlayEpisode(m, 1)}
                onToggleMyList={toggleMyList}
                onSelectTag={openTagRoute}
                onMoviesPoolChange={setMoviesPool}
              />
            </Suspense>
          ) : activeTab === 'explore' ? (
            <Suspense
              fallback={
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8 space-y-8">
                  <CarouselSkeleton />
                  <CarouselSkeleton />
                </div>
              }
            >
              <ExploreView
                selectedProvider={selectedProvider}
                extraProviderNames={EXTRA_PROVIDER_NAMES}
                dbRankingFeed={dbRankingFeed}
                nsTrendingFeed={nsTrendingFeed}
                arAsianFeed={arAsianFeed}
                mlRankFeed={mlRankFeed}
                dbForYouFeed={dbForYouFeed}
                nsForYouFeed={nsForYouFeed}
                arForYouFeed={arForYouFeed}
                mlForYouFeed={mlForYouFeed}
                dbNewFeed={dbNewFeed}
                nsAllFeed={nsAllFeed}
                mlNewFeed={mlNewFeed}
                dbVipFeed={dbVipFeed}
                nsAnimeFeed={nsAnimeFeed}
                mlAnimeFeed={mlAnimeFeed}
                dbDubbingFeed={dbDubbingFeed}
                recommendedItems={recommendedItems}
                newReleaseItems={newReleaseItems}
                trendingItems={trendingOnKanoItems.slice(0, 12)}
                combinedAnimeItems={combinedAnimeItems}
                combinedDubbingItems={combinedDubbingItems}
                extraFeeds={extraFeeds}
                myListIds={myListIds}
                onSelectProvider={(prov) => setSelectedProvider(prov)}
                onSelectTab={handleNavigateTab}
                onOpenTag={openTagRoute}
                onSelectDrama={openDramaRoute}
                onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                onToggleMyList={toggleMyList}
                onOpenProviderHub={handleOpenProviderHub}
                onRetryCore={() => void fetchAllFeeds()}
                onRetryFeed={(prov, kind) => {
                  if (prov === 'DramaBoxV2' && kind === 'rank') {
                    void loadSingleFeed(dramaBoxV2Provider.fetchRanking, setDbRankingFeed, 1, false);
                  } else if (prov === 'DramaBoxV2' && kind === 'vip') {
                    void loadSingleFeed(dramaBoxV2Provider.fetchVip, setDbVipFeed, 1, false);
                  } else if (prov === 'DramaBoxV2' && kind === 'dubbing' && dramaBoxV2Provider.fetchDubbing) {
                    void loadSingleFeed(dramaBoxV2Provider.fetchDubbing, setDbDubbingFeed, 1, false);
                  } else if (prov === 'NetShort' && kind === 'rank') {
                    void loadSingleFeed(netShortProvider.fetchRanking, setNsTrendingFeed, 1, false);
                  } else if (prov === 'NetShort' && kind === 'anime' && netShortProvider.fetchAnime) {
                    void loadSingleFeed(netShortProvider.fetchAnime, setNsAnimeFeed, 1, false);
                  } else if (prov === 'AnyReel' && kind === 'rank') {
                    void loadSingleFeed(anyReelProvider.fetchRanking, setArAsianFeed, 1, false);
                  } else if (prov === 'MeloLoV2' && kind === 'rank') {
                    void loadSingleFeed(meloLoV2Provider.fetchRanking, setMlRankFeed, 1, false);
                  }
                }}
                onLoadMoreRecommended={() => {
                  if (selectedProvider === 'All' || selectedProvider === 'DramaBoxV2') {
                    void loadSingleFeed(dramaBoxV2Provider.fetchForYou, setDbForYouFeed, dbForYouFeed.page + 1, true);
                  }
                  if (selectedProvider === 'All' || selectedProvider === 'NetShort') {
                    void loadSingleFeed(netShortProvider.fetchForYou, setNsForYouFeed, nsForYouFeed.page + 1, true);
                  }
                  if (selectedProvider === 'All' || selectedProvider === 'AnyReel') {
                    void loadSingleFeed(anyReelProvider.fetchForYou, setArForYouFeed, arForYouFeed.page + 1, true);
                  }
                  if (selectedProvider === 'All' || selectedProvider === 'MeloLoV2') {
                    void loadSingleFeed(meloLoV2Provider.fetchForYou, setMlForYouFeed, mlForYouFeed.page + 1, true);
                  }
                }}
                onRetryExtraFull={(prov) => {
                  if (isExtraProvider(prov)) {
                    void ensureExtraProviderFullLoaded(prov, true);
                  }
                }}
                onLoadExtraBatch={(providers) => {
                  void loadExtraProvidersBatch(providers);
                }}
              />
            </Suspense>
          ) : activeTab === 'providers' ? (
            invalidProviderSlug ? (
              <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-10 pb-16">
                <div className="p-8 sm:p-10 rounded-3xl bg-[var(--cd-surface)] border border-white/10 max-w-lg mx-auto text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex items-center justify-center mx-auto cd-accent-text">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                      HTTP 404
                    </p>
                    <h1 className="text-xl sm:text-2xl font-bold text-white">
                      {t.ui.providerNotFound}
                    </h1>
                    <p className="text-xs sm:text-sm text-[#A1A1AA]">
                      {t.providers.noMatches}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    <a
                      href={`${DEFAULT_SITE_ORIGIN}/providers`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        navigateToProvidersDirectory();
                      }}
                      className="px-5 py-2.5 min-h-[42px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white inline-flex items-center gap-1.5"
                    >
                      <Layers className="w-4 h-4" />
                      <span>{t.providers.all}</span>
                    </a>
                    <a
                      href={`${DEFAULT_SITE_ORIGIN}/`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        handleNavigateTab('home');
                      }}
                      className="px-5 py-2.5 min-h-[42px] rounded-full bg-[#18181D] border border-white/15 hover:border-white/30 text-xs sm:text-sm font-semibold text-white inline-flex items-center"
                    >
                      {t.sections.backToHome}
                    </a>
                  </div>
                </div>
              </section>
            ) : selectedProvider !== 'All' ? (
              <>
                <nav
                  aria-label="Breadcrumb"
                  className="max-w-[1440px] mx-auto px-4 md:px-8 pt-5 flex items-center gap-2 text-xs text-[#A1A1AA]"
                >
                  <a
                    href={`${DEFAULT_SITE_ORIGIN}/`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNavigateTab('home');
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {t.nav.home}
                  </a>
                  <span>/</span>
                  <a
                    href={`${DEFAULT_SITE_ORIGIN}/providers`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      navigateToProvidersDirectory();
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {t.nav.providers}
                  </a>
                  <span>/</span>
                  <span className="text-white font-semibold truncate">
                    {providerLabel(selectedProvider)}
                  </span>
                </nav>
                <Suspense
                  fallback={
                    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6">
                      <CarouselSkeleton />
                    </div>
                  }
                >
                  <ProviderEndpointSection
                    provider={selectedProvider}
                    language={language}
                    myListIds={myListIds}
                    isDedicatedPage
                    onResetProvider={navigateToProvidersDirectory}
                    onSelectDrama={openDramaRoute}
                    onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                    onToggleMyList={toggleMyList}
                  />
                </Suspense>
              </>
            ) : (
              <Suspense
                fallback={
                  <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-8">
                    <CarouselSkeleton />
                  </div>
                }
              >
                <ProviderDirectoryView
                  counts={providerCounts}
                  onSelectProvider={navigateToProviderPage}
                  onNavigateMovies={() => handleNavigateTab('movies')}
                  onBackHome={() => handleNavigateTab('home')}
                />
              </Suspense>
            )
          ) : !activeGridInfo ? (
            <>
              {/* 1. Hero Spotlight Banner */}
              <HeroSpotlight
                spotlights={heroSpotlights}
                loading={heroLoading}
                onPlayFirstEpisode={(d) => handlePlayEpisode(d, 1)}
                onOpenDetails={openDramaRoute}
                onSelectTag={openTagRoute}
              />

              {/* Compact Quick Provider Switcher (Single Horizontal Row — All 82 Providers) + Explore Link */}
              <section
                className="max-w-[1440px] mx-auto px-4 md:px-8 pt-2 pb-1"
                aria-label="Provider quick filter"
              >
                <div
                  className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none py-1"
                  role="tablist"
                >
                  {PROVIDER_FILTERS.map((prov) => {
                    const active = selectedProvider === prov.id;
                    return (
                      <button
                        key={prov.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setSelectedProvider(prov.id)}
                        className={`px-4 py-1.5 min-h-[38px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all border ${
                          active
                            ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-sm'
                            : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#E4E4E7] hover:border-white/30'
                        }`}
                      >
                        {providerLabel(prov.id)}
                      </button>
                    );
                  })}
                  <a
                    href={`${DEFAULT_SITE_ORIGIN}/explore`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      handleNavigateTab('explore');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 min-h-[38px] rounded-full bg-[#141418] border border-white/15 hover:border-[var(--cd-accent)] text-xs font-semibold text-[#D4AF37] whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{t.nav.explore}</span>
                  </a>
                  <a
                    href={`${DEFAULT_SITE_ORIGIN}/account`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      setWatchlistCategory('drama');
                      handleNavigateTab('mylist');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 min-h-[38px] rounded-full bg-[#141418] border border-white/15 hover:border-[var(--cd-accent)] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Bookmark className="w-3.5 h-3.5 cd-accent-text" />
                    <span>
                      {t.sections.dramaWatchlistTitle}
                      {dramaWatchlistItems.length > 0 ? ` (${dramaWatchlistItems.length})` : ''}
                    </span>
                  </a>
                </div>
              </section>

              {selectedProvider !== 'All' ? (
                <Suspense
                  fallback={
                    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6">
                      <CarouselSkeleton />
                    </div>
                  }
                >
                  <ProviderEndpointSection
                    provider={selectedProvider}
                    language={language}
                    myListIds={myListIds}
                    onResetProvider={() => setSelectedProvider('All')}
                    onSelectDrama={openDramaRoute}
                    onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                    onToggleMyList={toggleMyList}
                  />
                </Suspense>
              ) : (
                <>
                  {/* 2. Continue Watching (Only shown when user has watch history) */}
                  {continueWatchingData.items.length > 0 && (
                <CarouselRow
                  title={t.sections.continueWatching}
                  icon={<Clock className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                  items={continueWatchingData.items}
                  loading={false}
                  error={null}
                  continueEpisodesMap={continueWatchingData.map}
                  myListIds={myListIds}
                  onRetry={() => {}}
                  onSeeAll={() => {
                    setDashboardSubTab('history');
                    handleNavigateTab('dashboard');
                  }}
                  onSelectDrama={openDramaRoute}
                  onQuickPlay={(d) => {
                    const saved =
                      continueWatchingData.map[`${d.provider}:${d.bookId}`];
                    handlePlayEpisode(
                      d,
                      saved?.episode ?? 1,
                      [],
                      saved?.currentTime ?? 0
                    );
                  }}
                  onToggleMyList={toggleMyList}
                  onRemoveHistory={(d) => removeHistoryItem(d.bookId, d.provider)}
                />
              )}

              {/* 3. Top Category Carousel #1: Trending / Hot */}
              <CarouselRow
                title={t.sections.trendingNow}
                icon={<Flame className="w-4 h-4 cd-accent-text shrink-0" />}
                items={trendingOnKanoItems.slice(0, 12)}
                loading={homeLoading && trendingOnKanoItems.length === 0}
                error={trendingOnKanoItems.length > 0 ? null : homeError}
                ranked
                myListIds={myListIds}
                onRetry={() => {
                  void loadServerTrending(selectedProvider);
                  void loadHomeFromCache(language, selectedProvider, true);
                }}
                onSeeAll={() => handleNavigateTab('ranking')}
                onSelectDrama={openDramaRoute}
                onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                onToggleMyList={toggleMyList}
              />

              {/* 3b. Personalized Recommendations ("Picked For You" / "Because You Watched ...") */}
              {(pickedForYouData.items.length > 0 || homeLoading) && (
                <CarouselRow
                  title={
                    pickedForYouData.anchorTitle
                      ? `${t.sections.becauseYouWatched} ${pickedForYouData.anchorTitle}`
                      : t.sections.pickedForYou
                  }
                  icon={<Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                  items={pickedForYouData.items}
                  loading={homeLoading && pickedForYouData.items.length === 0}
                  error={null}
                  myListIds={myListIds}
                  onRetry={() =>
                    void loadHomeFromCache(language, selectedProvider, true)
                  }
                  onSeeAll={() => handleNavigateTab('explore')}
                  onSelectDrama={openDramaRoute}
                  onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                  onToggleMyList={toggleMyList}
                />
              )}

              {/* 4. Top Category Carousel #2 (Below the Fold Lazy Mounted): Hot & New Picks */}
              <LazySection fallback={<CarouselSkeleton />} className="cv-auto">
                <CarouselRow
                  title={t.sections.hotPicks}
                  icon={<Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                  items={homeCatalog?.hotReleases ?? []}
                  loading={homeLoading && !(homeCatalog?.hotReleases?.length)}
                  error={homeError}
                  badgeStyle="NEW"
                  myListIds={myListIds}
                  onRetry={() =>
                    void loadHomeFromCache(language, selectedProvider, true)
                  }
                  onSeeAll={() => handleNavigateTab('explore')}
                  onSelectDrama={openDramaRoute}
                  onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                  onToggleMyList={toggleMyList}
                />
              </LazySection>

              {/* 5. Main Featured Catalog Grid (2.5-Card Horizontal Slider on Mobile, 5-Col Grid on Desktop) */}
              <LazySection
                className="cv-auto"
                fallback={
                  <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-8">
                    <div className="h-7 w-44 rounded-lg skeleton-espresso mb-4" />
                    <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink space-y-2"
                        >
                          <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                          <div className="px-0.5 space-y-1.5">
                            <div className="h-3.5 w-[88%] rounded skeleton-espresso" />
                            <div className="h-3 w-[55%] rounded skeleton-espresso" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                }
              >
                <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-8">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Film className="w-4 h-4 cd-accent-text shrink-0" />
                      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                        {t.sections.homeCatalogGrid}
                      </h2>
                    </div>
                    <a
                      href={`${DEFAULT_SITE_ORIGIN}/explore`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        handleNavigateTab('explore');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#A1A1AA] hover:text-white transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>{t.nav.explore}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {homeLoading && !(homeCatalog?.catalogGrid.length) ? (
                    <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink space-y-2"
                        >
                          <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                          <div className="px-0.5 space-y-1.5">
                            <div className="h-3.5 w-[88%] rounded skeleton-espresso" />
                            <div className="h-3 w-[55%] rounded skeleton-espresso" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (homeCatalog?.catalogGrid.length ?? 0) > 0 ? (
                    <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
                      {homeCatalog!.catalogGrid.map((drama) => (
                        <DramaCard
                          key={`${drama.provider}:${drama.bookId}`}
                          drama={drama}
                          isSaved={myListIds.includes(
                            `${drama.provider}:${drama.bookId}`
                          )}
                          responsiveGrid
                          onSelect={openDramaRoute}
                          onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                          onToggleMyList={toggleMyList}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-8 flex justify-center">
                    <a
                      href={`${DEFAULT_SITE_ORIGIN}/explore`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        handleNavigateTab('explore');
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs sm:text-sm font-semibold text-white transition-colors"
                    >
                      <Compass className="w-4 h-4 cd-accent-text" />
                      <span>{t.sections.exploreAllCategories}</span>
                      <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
                    </a>
                  </div>
                </section>
              </LazySection>
                </>
              )}
            </>
          ) : (
            /* Dedicated View for View All / Tabs / Custom Watchlist Folders */
            <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-16">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-5 pb-4 border-b border-white/10">
                <div>
                  <h1 className="text-xl sm:text-3xl font-bold text-white">
                    {activeGridInfo.title}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1 tabular-nums">
                    {activeGridInfo.items.length} {t.ui.titlesUnit}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'mylist' && (watchlistCategory === 'drama' || user) && (
                    <button
                      type="button"
                      onClick={() => setNewFolderOpen((p) => !p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white"
                    >
                      <FolderPlus className="w-3.5 h-3.5 cd-accent-text" />
                      <span>+ {t.engagement.createFolder}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleNavigateTab('home')}
                    className="px-4 py-2 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-medium text-white"
                  >
                    {t.sections.backToHome}
                  </button>
                </div>
              </div>

              {/* Separated Drama Watchlist & Movie Watchlist Switcher */}
              {activeTab === 'mylist' && (
                <div
                  className="mb-5 inline-flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-[#111015] border border-white/10"
                  role="tablist"
                  aria-label="Watchlist categories"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={watchlistCategory === 'drama'}
                    onClick={() => {
                      setWatchlistCategory('drama');
                      setActiveFolderId('all');
                      setWatchStatusFilter('all');
                    }}
                    className={`inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      watchlistCategory === 'drama'
                        ? 'cd-accent-bg text-white shadow-md'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" />
                    <span>
                      {t.sections.dramaWatchlistTitle} ({dramaWatchlistItems.length})
                    </span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={watchlistCategory === 'movie'}
                    onClick={() => {
                      setWatchlistCategory('movie');
                      setActiveFolderId('all');
                      setWatchStatusFilter('all');
                    }}
                    className={`inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      watchlistCategory === 'movie'
                        ? 'cd-accent-bg text-white shadow-md'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <Clapperboard className="w-4 h-4" />
                    <span>
                      {t.moviesPage.watchlistTitle} ({user ? movieWatchlistItems.length : 0})
                    </span>
                    {!user && <Lock className="w-3.5 h-3.5 opacity-80" />}
                  </button>
                </div>
              )}

              {/* Login Required Gate for Movie Watchlist */}
              {activeTab === 'mylist' && watchlistCategory === 'movie' && !user ? (
                authLoading ? (
                  <div className="my-10 p-8 sm:p-10 rounded-3xl bg-[var(--cd-surface)] border border-white/10 max-w-lg mx-auto space-y-4">
                    <div className="w-12 h-12 rounded-2xl skeleton-espresso mx-auto" />
                    <div className="h-5 w-48 rounded skeleton-espresso mx-auto" />
                    <div className="h-10 w-full rounded-xl skeleton-espresso" />
                  </div>
                ) : (
                <div className="my-10 p-8 sm:p-10 rounded-3xl bg-[var(--cd-surface)] border border-white/10 text-center max-w-lg mx-auto space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex items-center justify-center mx-auto cd-accent-text">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      {t.moviesPage.watchlistLoginTitle}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                      {t.moviesPage.watchlistLoginDesc}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openAuthModal(t.auth.gateWatchlistReason)}
                      className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg"
                    >
                      {t.auth.continueBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateTab('movies')}
                      className="px-5 py-2.5 min-h-[44px] rounded-full bg-[#18181D] border border-white/15 hover:border-white/30 text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-1.5"
                    >
                      <Clapperboard className="w-4 h-4 cd-accent-text" />
                      <span>{t.moviesPage.browseMoviesBtn}</span>
                    </button>
                  </div>
                </div>
                )
              ) : (
                <>
              {/* Custom Watchlist Folders Toolbar */}
              {activeTab === 'mylist' && (watchlistCategory === 'drama' || user) && (
                <div className="mb-6 space-y-3">
                  {newFolderOpen && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const created = createWatchlistFolder(newFolderName);
                        if (created) {
                          setActiveFolderId(created.id);
                          setNewFolderName('');
                          setNewFolderOpen(false);
                        }
                      }}
                      className="flex items-center gap-2 max-w-sm"
                    >
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder={t.engagement.folderPlaceholder}
                        className="flex-1 px-3.5 py-2 rounded-xl bg-[var(--cd-surface)] border border-[var(--cd-border)] focus:border-[var(--cd-accent)] text-xs text-white placeholder-[#71717A] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl cd-accent-bg text-white text-xs font-semibold"
                      >
                        {t.ui.save}
                      </button>
                    </form>
                  )}

                  {/* Smart Watchlist Status Tabs */}
                  <div
                    className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pb-1"
                    role="tablist"
                    aria-label="Watchlist Status Filter"
                  >
                    {(
                      [
                        { id: 'all', label: t.watchlistStatus.all, count: watchStatusCounts.all },
                        {
                          id: 'watching',
                          label: t.watchlistStatus.watching,
                          count: watchStatusCounts.watching,
                        },
                        {
                          id: 'plan',
                          label: t.watchlistStatus.plan,
                          count: watchStatusCounts.plan,
                        },
                        {
                          id: 'completed',
                          label: t.watchlistStatus.completed,
                          count: watchStatusCounts.completed,
                        },
                      ] as { id: WatchStatusFilter; label: string; count: number }[]
                    ).map((st) => {
                      const active = watchStatusFilter === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setWatchStatusFilter(st.id)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors inline-flex items-center gap-1.5 ${
                            active
                              ? 'bg-white text-[#09090B] border-white'
                              : 'bg-[#141418] border-white/10 text-[#D4D4D8] hover:border-white/30'
                          }`}
                        >
                          <span>{st.label}</span>
                          <span className="opacity-75 tabular-nums">
                            ({st.count})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Watchlist Folders Strip */}
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                    {watchlistFolders.map((folder) => {
                      const active = activeFolderId === folder.id;
                      const folderCount =
                        folder.id === 'all'
                          ? activeCategoryWatchlistItems.length
                          : activeCategoryWatchlistItems.filter(
                              (d) =>
                                getDramaFolderId(d.bookId, d.provider) ===
                                folder.id
                            ).length;

                      return (
                        <div
                          key={folder.id}
                          className={`inline-flex items-center gap-1 rounded-full border transition-colors shrink-0 ${
                            active
                              ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                              : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#D4D4D8] hover:border-white/30'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveFolderId(folder.id)}
                            className="px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5"
                          >
                            <span>{folder.name}</span>
                            <span className="opacity-75 tabular-nums">
                              ({folderCount})
                            </span>
                          </button>
                          {!folder.isDefault && (
                            <button
                              type="button"
                              onClick={() => {
                                if (activeFolderId === folder.id) {
                                  setActiveFolderId('all');
                                }
                                deleteWatchlistFolder(folder.id);
                              }}
                              aria-label={`Delete folder ${folder.name}`}
                              className="pr-2.5 text-white/75 hover:text-white"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeGridInfo.loading && activeGridInfo.items.length === 0 ? (
                <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink space-y-2"
                    >
                      <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                      <div className="px-0.5 space-y-1.5">
                        <div className="h-3.5 w-[88%] rounded skeleton-espresso" />
                        <div className="h-3 w-[55%] rounded skeleton-espresso" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeGridInfo.error && activeGridInfo.items.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 max-w-lg mx-auto text-center">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                  <h2 className="text-lg font-bold text-white">
                    {t.ui.unableToLoadCatalog}
                  </h2>
                  <p className="text-xs text-[#A1A1AA] mt-1.5">
                    {activeGridInfo.error}
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={activeGridInfo.onRetry}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t.player.retry}
                    </button>
                  </div>
                </div>
              ) : activeGridInfo.items.length === 0 ? (
                <div className="my-12 p-10 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center max-w-lg mx-auto">
                  <div className="w-12 h-12 rounded-xl bg-[#1C1C22] border border-white/10 flex items-center justify-center mx-auto mb-4 cd-accent-text">
                    {activeTab === 'mylist' && watchlistCategory === 'movie' ? (
                      <Clapperboard className="w-5 h-5" />
                    ) : activeTab === 'mylist' ? (
                      <Bookmark className="w-5 h-5" />
                    ) : (
                      <Film className="w-5 h-5" />
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white">
                    {activeTab === 'mylist'
                      ? `${
                          watchlistCategory === 'movie'
                            ? t.moviesPage.watchlistTitle
                            : t.sections.dramaWatchlistTitle
                        } ${t.ui.emptyWatchlistSuffix}`
                      : t.search.noResults}
                  </h2>
                  <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
                    {activeTab === 'mylist'
                      ? watchlistCategory === 'movie'
                        ? t.moviesPage.watchlistEmpty
                        : t.sections.dramaWatchlistEmpty
                      : t.search.tryAnother}
                  </p>
                  {activeTab === 'mylist' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleNavigateTab(
                          watchlistCategory === 'movie' ? 'movies' : 'home'
                        )
                      }
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg"
                    >
                      {watchlistCategory === 'movie' ? (
                        <>
                          <Clapperboard className="w-4 h-4" />
                          <span>{t.moviesPage.browseMoviesBtn}</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-4 h-4" />
                          <span>{t.sections.exploreDramasBtn}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
                    {activeGridInfo.items.map((drama, idx) => (
                      <div
                        key={`${drama.provider}:${drama.bookId}`}
                        className="flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink flex flex-col gap-2"
                      >
                        <DramaCard
                          drama={drama}
                          rank={activeGridInfo.ranked ? idx + 1 : undefined}
                          badgeStyle={activeGridInfo.badgeStyle}
                          isSaved={myListIds.includes(
                            `${drama.provider}:${drama.bookId}`
                          )}
                          fluid
                          onSelect={openDramaRoute}
                          onQuickPlay={(d) => handlePlayEpisode(d, 1)}
                          onToggleMyList={toggleMyList}
                        />
                        {activeTab === 'mylist' && (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={getDramaFolderId(
                                drama.bookId,
                                drama.provider
                              )}
                              onChange={(e) =>
                                assignDramaToFolder(
                                  drama.bookId,
                                  drama.provider,
                                  e.target.value
                                )
                              }
                              aria-label={`Assign ${drama.title} folder`}
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] text-[11px] text-[#E4E4E7] focus:outline-none focus:border-[var(--cd-accent)]"
                            >
                              {watchlistFolders.map((f) => (
                                <option
                                  key={f.id}
                                  value={f.id}
                                  className="bg-[#141418] text-white"
                                >
                                  {f.name}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                toggleDramaCompleted(
                                  drama.bookId,
                                  drama.provider
                                )
                              }
                              title={t.watchlistStatus.markCompleted}
                              className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                                getDramaWatchStatus(drama) === 'completed'
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                  : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#A1A1AA] hover:text-white'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{t.watchlistStatus.completedBadge}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {activeGridInfo.onLoadMore && activeGridInfo.hasMore && (
                    <div className="mt-10 flex justify-center">
                      <button
                        type="button"
                        onClick={activeGridInfo.onLoadMore}
                        disabled={activeGridInfo.loadingMore}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
                      >
                        {activeGridInfo.loadingMore && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {activeGridInfo.loadingMore
                          ? t.sections.loading
                          : t.sections.loadMore}
                      </button>
                    </div>
                  )}
                </>
              )}
                </>
              )}
            </section>
          )}
        </main>
      )}

      <Footer />
      </div>

      {/* 5-Tab Sticky Mobile Bottom Navigation: Home -> Search -> Provider -> Movie -> Login */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[var(--cd-bg)]/95 backdrop-blur-xl border-t border-white/10 grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile Bottom Navigation"
      >
        {/* 1. Home (/ or /drama) */}
        <a
          href={`${DEFAULT_SITE_ORIGIN}/`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            handleNavigateTab('home');
          }}
          aria-label={t.nav.home}
          className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] text-[10px] font-medium transition-colors ${
            !activeDramaRoute &&
            !activeSeoLanding &&
            activeTab === 'home' &&
            !searchModalOpen &&
            !providerHubOpen &&
            !authModalOpen
              ? 'cd-accent-text'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="truncate max-w-[60px]">{t.nav.home}</span>
        </a>

        {/* 2. Search (/search) */}
        <button
          type="button"
          onClick={handleOpenSearch}
          aria-label={t.nav.search}
          className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] text-[10px] font-medium transition-colors ${
            searchModalOpen
              ? 'cd-accent-text'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="truncate max-w-[60px]">{t.nav.search}</span>
        </button>

        {/* 3. Provider (Opens Provider Hub modal/drawer) */}
        <a
          href={`${DEFAULT_SITE_ORIGIN}/providers`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            handleOpenProviderHub();
          }}
          aria-label={t.nav.providers}
          className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] text-[10px] font-semibold transition-colors ${
            providerHubOpen || selectedProvider !== 'All'
              ? 'cd-accent-text'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="truncate max-w-[60px]">
            {selectedProvider === 'All'
              ? t.nav.providers
              : selectedProvider.slice(0, 7)}
          </span>
        </a>

        {/* 4. Movie (/movies) */}
        <a
          href={`${DEFAULT_SITE_ORIGIN}/movies`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            handleNavigateTab('movies');
          }}
          aria-label={t.nav.movies}
          className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] text-[10px] font-semibold transition-colors ${
            !activeDramaRoute &&
            !activeSeoLanding &&
            activeTab === 'movies' &&
            !searchModalOpen &&
            !providerHubOpen &&
            !authModalOpen
              ? 'cd-accent-text'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Clapperboard className="w-4 h-4" />
          <span className="truncate max-w-[60px]">{t.nav.movies}</span>
        </a>

        {/* 5. Login (Profile / Auth & Integrated Movie Watchlist) */}
        <button
          type="button"
          onClick={handleOpenLoginMenu}
          aria-label={user ? t.nav.account : t.nav.login}
          className={`flex flex-col items-center justify-center gap-0.5 w-full h-full min-h-[44px] text-[10px] font-medium transition-colors ${
            authModalOpen ||
            (!searchModalOpen &&
              !providerHubOpen &&
              (activeTab === 'dashboard' || activeTab === 'mylist'))
              ? 'cd-accent-text'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          {user ? (
            <>
              {user.photoURL && !mobileAvatarBroken ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setMobileAvatarBroken(true)}
                  className="w-4 h-4 rounded-full object-cover border border-white/25"
                />
              ) : (
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white border border-white/25"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  {user.avatarInitials}
                </span>
              )}
              <span className="truncate max-w-[60px]">{t.nav.account}</span>
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              <span className="truncate max-w-[60px]">{t.nav.login}</span>
            </>
          )}
        </button>
      </nav>

      {/* Lazy-Loaded Heavy Modals & Video Player */}
      <Suspense fallback={null}>
        {providerHubOpen && (
          <ProviderHubModal
            open={providerHubOpen}
            selectedProvider={selectedProvider}
            counts={providerCounts}
            onOpenProvidersDirectory={navigateToProvidersDirectory}
            onSelectProvider={(prov) => {
              if (prov === 'All') {
                setSelectedProvider('All');
                if (activeTab === 'providers') {
                  navigateToProvidersDirectory();
                }
              } else {
                navigateToProviderPage(prov);
              }
            }}
            onClose={() => setProviderHubOpen(false)}
          />
        )}

        {searchModalOpen && (
          <SearchModal
            open={searchModalOpen}
            onClose={handleCloseSearch}
            onSelectDrama={openDramaRoute}
            onQuickPlay={(d) => handlePlayEpisode(d, 1)}
            trendingDramas={trendingSearchPool}
          />
        )}

        {playerState &&
          (playerState.drama.provider === 'LK21' ||
          playerState.drama.provider === 'LookSeries' ||
          playerState.drama.mediaType === 'movie' ? (
            <MovieVideoPlayer
              drama={playerState.drama}
              episodeNumber={playerState.episode ?? 1}
              initialTime={playerState.initialTime ?? 0}
              episodes={playerState.episodes ?? []}
              relatedDramas={
                moviesPool.length > 0 ? moviesPool : allLoadedDramas
              }
              onSwitchDrama={(nextDrama, ep = 1) => {
                handlePlayEpisode(nextDrama, ep, []);
              }}
              onClose={() => {
                const activeDrama = activeDramaRoute?.drama ?? playerState?.drama;
                setPlayerState(null);
                if (activeDramaRoute?.drama) {
                  const detailPath = getDramaPath(
                    activeDramaRoute.drama.bookId,
                    activeDramaRoute.drama.title,
                    activeDramaRoute.drama.provider,
                    activeDramaRoute.drama.slug
                  );
                  if (`${window.location.pathname}${window.location.search}` !== detailPath) {
                    window.history.replaceState(window.history.state, '', detailPath);
                  }
                  syncDramaDocumentSeo(
                    activeDramaRoute.drama,
                    activeDramaRoute.episodes,
                    language
                  );
                } else if (
                  activeDrama &&
                  /^\/(?:[a-z0-9_]+\/(?:detail|watch)\/|drama\/|movie\/)/i.test(
                    window.location.pathname
                  )
                ) {
                  const fallbackTarget = searchModalOpen
                    ? '/search'
                    : activeTab === 'providers' && selectedProvider !== 'All'
                    ? `/provider/${getProviderRouteSlug(selectedProvider)}`
                    : getTabPath(activeTab);
                  window.history.replaceState({ tab: activeTab }, '', fallbackTarget);
                  if (activeTab === 'providers' && selectedProvider !== 'All') {
                    syncProviderDocumentSeo(selectedProvider, language);
                  } else {
                    syncSectionDocumentSeo(activeTab, language);
                  }
                } else {
                  if (
                    window.location.search.includes('drama=') ||
                    window.location.search.includes('ep=')
                  ) {
                    window.history.replaceState(
                      window.history.state,
                      '',
                      window.location.pathname || '/'
                    );
                  }
                  if (activeTab === 'providers' && selectedProvider !== 'All') {
                    syncProviderDocumentSeo(selectedProvider, language);
                  } else {
                    syncSectionDocumentSeo(activeTab, language);
                  }
                }
              }}
              onChangeEpisode={(nextEp) => {
                setPlayerState((prev) => {
                  if (!prev) return null;
                  recordWatchProgress(prev.drama, nextEp, 0, 0, true);
                  return { ...prev, episode: nextEp, initialTime: 0 };
                });
              }}
              onEpisodesLoaded={(eps) => {
                setPlayerState((prev) =>
                  prev ? { ...prev, episodes: eps } : null
                );
                setActiveDramaRoute((prev) =>
                  prev &&
                  playerState?.drama &&
                  prev.bookId === playerState.drama.bookId &&
                  (prev.providerHint === playerState.drama.provider ||
                    prev.drama?.provider === playerState.drama.provider)
                    ? { ...prev, episodes: eps }
                    : prev
                );
              }}
              onProgressUpdate={(ep, currentTime, duration, immediate, playbackState) => {
                if (playerState?.drama) {
                  recordWatchProgress(
                    playerState.drama,
                    ep,
                    currentTime,
                    duration,
                    immediate,
                    playbackState
                  );
                }
              }}
            />
          ) : (
            <CinemaVideoPlayer
              drama={playerState.drama}
              episodeNumber={playerState.episode ?? 1}
              initialTime={playerState.initialTime ?? 0}
              episodes={playerState.episodes ?? []}
              relatedDramas={allLoadedDramas}
              onSwitchDrama={(nextDrama, ep = 1) => {
                handlePlayEpisode(nextDrama, ep, []);
              }}
              onClose={() => {
                const activeDrama = activeDramaRoute?.drama ?? playerState?.drama;
                setPlayerState(null);
                if (activeDramaRoute?.drama) {
                  const detailPath = getDramaPath(
                    activeDramaRoute.drama.bookId,
                    activeDramaRoute.drama.title,
                    activeDramaRoute.drama.provider,
                    activeDramaRoute.drama.slug
                  );
                  if (`${window.location.pathname}${window.location.search}` !== detailPath) {
                    window.history.replaceState(window.history.state, '', detailPath);
                  }
                  syncDramaDocumentSeo(
                    activeDramaRoute.drama,
                    activeDramaRoute.episodes,
                    language
                  );
                } else if (
                  activeDrama &&
                  /^\/(?:[a-z0-9_]+\/(?:detail|watch)\/|drama\/|movie\/)/i.test(
                    window.location.pathname
                  )
                ) {
                  const fallbackTarget = searchModalOpen
                    ? '/search'
                    : activeTab === 'providers' && selectedProvider !== 'All'
                    ? `/provider/${getProviderRouteSlug(selectedProvider)}`
                    : getTabPath(activeTab);
                  window.history.replaceState({ tab: activeTab }, '', fallbackTarget);
                  if (activeTab === 'providers' && selectedProvider !== 'All') {
                    syncProviderDocumentSeo(selectedProvider, language);
                  } else {
                    syncSectionDocumentSeo(activeTab, language);
                  }
                } else {
                  if (
                    window.location.search.includes('drama=') ||
                    window.location.search.includes('ep=')
                  ) {
                    window.history.replaceState(
                      window.history.state,
                      '',
                      window.location.pathname || '/'
                    );
                  }
                  if (activeTab === 'providers' && selectedProvider !== 'All') {
                    syncProviderDocumentSeo(selectedProvider, language);
                  } else {
                    syncSectionDocumentSeo(activeTab, language);
                  }
                }
              }}
              onChangeEpisode={(nextEp) => {
                setPlayerState((prev) => {
                  if (!prev) return null;
                  recordWatchProgress(prev.drama, nextEp, 0, 0, true);
                  return { ...prev, episode: nextEp, initialTime: 0 };
                });
              }}
              onEpisodesLoaded={(eps) => {
                setPlayerState((prev) =>
                  prev ? { ...prev, episodes: eps } : null
                );
                setActiveDramaRoute((prev) =>
                  prev &&
                  playerState?.drama &&
                  prev.bookId === playerState.drama.bookId &&
                  (prev.providerHint === playerState.drama.provider ||
                    prev.drama?.provider === playerState.drama.provider)
                    ? { ...prev, episodes: eps }
                    : prev
                );
              }}
              onProgressUpdate={(ep, currentTime, duration, immediate, playbackState) => {
                if (playerState?.drama) {
                  recordWatchProgress(
                    playerState.drama,
                    ep,
                    currentTime,
                    duration,
                    immediate,
                    playbackState
                  );
                }
              }}
            />
          ))}

        {authModalOpen && <AuthProfileModal />}
        <HelpCenterModal />
      </Suspense>

      <PWAInstallBanner hidden={Boolean(playerState)} />
      <OfflineIndicator />
      <SpotlightFeedbackModal />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
