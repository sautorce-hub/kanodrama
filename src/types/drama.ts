export type LegacyV1ProviderName =
  | 'DramaBox'
  | 'Melolo'
  | 'StoryReel'
  | 'VibeShort'
  | 'ShortMax'
  | 'iDrama'
  | 'ReelShort';

export type ProviderName =
  | 'DramaBoxV2'
  | 'NetShort'
  | 'AnyReel'
  | 'MeloLoV2'
  | 'DramaOra'
  | 'MeloShort'
  | 'PetaDrama'
  | 'RadReels'
  | 'DramaVerse'
  | 'KalosTV'
  | 'StardustTV'
  | 'StarShort'
  | 'DramaBite'
  | 'LoveShots'
  | 'MyDrama'
  | 'ShotShort'
  | 'MoboReels'
  | 'BlinkDrama'
  | 'WeTV'
  | 'CubeTV'
  | 'MicroDrama'
  | 'FlareFlow'
  | 'FunDrama'
  | 'FreeShort'
  | 'ToonShort'
  | 'HappyShort'
  | 'DramaDash'
  | 'StoryReelV2'
  | 'VibeShortV2'
  | 'FlickReels'
  | 'DramaWave'
  | 'FreeReels'
  | 'PineDrama'
  | 'ShortMaxV2'
  | 'FlexTV'
  | 'Vigloo'
  | 'DotDrama'
  | 'iDramaV2'
  | 'GoodShort'
  | 'ReelShortV2'
  | 'JoyReels'
  | 'SodaReels'
  | 'BonusTV'
  | 'iQIYI'
  | 'AudioToon'
  | 'Playlet'
  | 'MomeShort'
  | 'StoReel'
  | 'MyMuse'
  | 'HuangDou'
  | 'MoreShort'
  | 'DramaRush'
  | 'Shortswave'
  | 'Relala'
  | 'SixthShort'
  | 'SnackShort'
  | 'Soreel'
  | 'StarReel'
  | 'StoryGo'
  | 'MiniShort'
  | 'Shorten'
  | 'Velolo'
  | 'ReelPine'
  | 'DynastyShorts'
  | 'DramaShorts'
  | 'TallFlix'
  | 'Qlax'
  | 'Shortical'
  | 'LuziCine'
  | 'ZebraShort'
  | 'DrakorID'
  | 'DrachinReborn'
  | 'DramaQueen'
  | 'Ansflix'
  | 'LupaCine'
  | 'ReelLife'
  | 'Bstation'
  | 'Anichin'
  | 'DonghuaQueen'
  | 'Samehadaku'
  | 'AnimeX'
  | 'WinkNovel';

export type ProviderId = 'All' | ProviderName;

export type MovieProviderName = 'LK21' | 'LookSeries';
export type MediaProviderName = ProviderName | MovieProviderName;
export type MediaType = 'drama' | 'movie';

export type LanguageCode =
  | 'en'
  | 'id'
  | 'cn'
  | 'vi'
  | 'es'
  | 'ko'
  | 'ja'
  | 'th'
  | 'ms'
  | 'tl';
export type LanguagePreference = 'auto' | LanguageCode;

export type AccentThemeId = 'crimson' | 'gold' | 'rose' | 'emerald';

export type NavTab =
  | 'home'
  | 'movies'
  | 'explore'
  | 'providers'
  | 'ranking'
  | 'terbaru'
  | 'vip'
  | 'anime'
  | 'dubbing'
  | 'mylist'
  | 'dashboard'
  | 'rewards';

export interface HomeCatalogResponse {
  lang: LanguageCode;
  provider: string;
  heroSpotlights: DramaItem[];
  trendingTop: DramaItem[];
  hotReleases: DramaItem[];
  catalogGrid: DramaItem[];
  providerCounts: Record<string, number>;
  updatedAt: number;
  expiresAt: number;
  cached: boolean;
  stale: boolean;
  source: string;
}

export type WatchStatusFilter = 'all' | 'watching' | 'plan' | 'completed';

export type BadgeStyle = 'none' | 'NEW' | 'VIP' | 'DUB' | 'ANIME';

export interface GoogleUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  avatarInitials: string;
  avatarColor: string;
  signedInAt: number;
  bio?: string;
  preferredLanguage?: LanguageCode;
}

export interface DailyStreakState {
  count: number;
  lastVisitDate: string;
  isVipCoffeeLover: boolean;
}

export interface DramaItem {
  bookId: string;
  title: string;
  slug?: string;
  cover: string;
  coverHz?: string;
  description: string;
  chapterCount: number;
  tags: string[];
  playCount?: string;
  corner?: string;
  protagonist?: string;
  author?: string;
  director?: string;
  actors?: string[];
  year?: string;
  area?: string;
  quality?: string;
  duration?: string;
  isVip: boolean;
  provider: MediaProviderName;
  mediaType?: MediaType;
  rank?: number;
  status?: 'Ongoing' | 'Completed';
  rating?: number;
  dailyViews?: number;
  totalViews?: number;
  trendBadge?: 'HOT' | 'TRENDING';
  updatedAt?: number | string;
  previewStreamUrl?: string;
}

export interface MovieItem {
  id: string;
  bookId?: string;
  slug: string;
  app: 'lk21' | 'lookseries';
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
  chapterCount?: number;
  director?: string;
  actors?: string[];
  year?: string;
  dailyViews?: number;
  totalViews?: number;
  trendBadge?: 'HOT' | 'TRENDING';
}

export interface MovieDetail {
  ok: boolean;
  id: string;
  bookId?: string;
  slug: string;
  app: 'lk21' | 'lookseries';
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
  chapterCount?: number;
  providers: Array<{ name: string; url: string }>;
  recommendations: MovieItem[];
}

export interface MovieEpisodeItem {
  id: string;
  vid: string;
  chapterId?: string;
  chapterIndex0?: number;
  title: string;
  episode: string;
  manEpisode: string;
  order: number;
}

export interface Lk21HomeRow {
  key: string;
  label: string;
  items: MovieItem[];
}

export interface Lk21HomeResponse {
  ok: boolean;
  totalMovies: number;
  updated: number;
  rows: Lk21HomeRow[];
  cached?: boolean;
  stale?: boolean;
  source?: string;
}

export interface Lk21MenuResponse {
  ok: boolean;
  types: Array<{ key: string; label: string }>;
  genres: Array<{ slug: string; name: string }>;
  countries: Array<{ slug: string; name: string }>;
  years: Array<{ slug: string; name: string }>;
}

export interface Lk21ListResponse {
  ok: boolean;
  label?: string;
  key?: string;
  q?: string;
  page: number;
  count: number;
  hasMore: boolean;
  items: MovieItem[];
}

export interface EpisodeItem {
  chapterId: string;
  episodeNumber: number;
  chapterIndex0?: number;
  title: string;
  isVipLocked: boolean;
  eid?: string;
}

export interface StreamQualityOption {
  quality: string;
  url: string;
}

export interface SubtitleTrackItem {
  id: string;
  label: string;
  lang: string;
  url?: string;
  hlsTrackId?: number;
  source: 'hls' | 'api' | 'textTrack';
}

export interface StreamServerOption {
  id: string;
  name: string;
  url: string;
  type: 'hls' | 'mp4' | 'embed';
  quality?: string;
}

export interface StreamSource {
  bookId: string;
  provider: MediaProviderName;
  episodeNumber: number;
  chapterId?: string;
  streamUrl: string;
  embedUrl?: string;
  sourceType?: 'hls' | 'mp4' | 'embed';
  isHls: boolean;
  qualities: StreamQualityOption[];
  subtitles?: SubtitleTrackItem[];
  servers?: StreamServerOption[];
}

export type StreamData = StreamSource;

export interface PaginatedResult {
  items: DramaItem[];
  hasMore: boolean;
  page: number;
}

export interface WatchHistoryEntry {
  bookId: string;
  provider: MediaProviderName;
  mediaType?: MediaType;
  title: string;
  cover: string;
  drama: DramaItem;
  episode: number;
  currentTime: number;
  duration: number;
  progress: number;
  updatedAt: number;
}

export interface SubtitleStyleConfig {
  fontSize: 'small' | 'medium' | 'large';
  textColor: 'white' | 'gold';
  bgOpacity: 0 | 50 | 80;
}

export interface WatchlistFolder {
  id: string;
  name: string;
  isDefault?: boolean;
}

export type ReactionKey = 'plotTwist' | 'baper' | 'emosi' | 'romantis';

export interface EpisodeComment {
  id: string;
  authorUid?: string;
  author: string;
  authorEmail?: string;
  authorPhotoURL?: string | null;
  authorBadge?: string;
  authorInitials?: string;
  authorColor?: string;
  text: string;
  videoTimestampSec?: number;
  createdAt: number;
}

export interface DramaProviderAdapter {
  id: ProviderName;
  label: string;
  enabled: boolean;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  fetchForYou: (page?: number) => Promise<PaginatedResult>;
  fetchRanking: (page?: number) => Promise<PaginatedResult>;
  fetchNewReleases: (page?: number) => Promise<PaginatedResult>;
  fetchVip: (page?: number) => Promise<PaginatedResult>;
  fetchAnime?: (page?: number) => Promise<PaginatedResult>;
  fetchDubbing?: (page?: number) => Promise<PaginatedResult>;
  searchDramas: (keyword: string, page?: number) => Promise<PaginatedResult>;
  fetchDetail: (bookId: string) => Promise<DramaItem | null>;
  fetchAllEpisodes: (bookId: string) => Promise<EpisodeItem[]>;
  fetchStream: (
    bookId: string,
    episode: number,
    extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
  ) => Promise<StreamSource>;
}

export interface ToastItem {
  id: string;
  message: string;
  tone: 'gold' | 'error' | 'neutral';
}

export type LegalModalTopic =
  | 'about'
  | 'privacy'
  | 'terms'
  | 'dmca'
  | 'contact';
