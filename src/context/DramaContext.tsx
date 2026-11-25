import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  captureReferralCodeFromUrl,
  clearPendingReferralCode,
  fetchCurrentAuthSession,
  getClientDeviceFingerprint,
  getPendingReferralCode,
  loginWithEmail,
  preloadGoogleAuth,
  registerWithEmail,
  signInWithRealGoogle,
  signOutRealGoogle,
  type GoogleAuthResult,
  type ServerAuthenticatedUser,
} from '../config/auth';
import { setActiveAppLanguage } from '../services/dramaProviders';
import { normalizeMediaProviderName } from '../constants/providerLogos';
import { TRANSLATIONS, type Translations } from '../i18n/translations';
import {
  detectLanguageFromContent,
  getHtmlLangTag,
  normalizeLanguageCode,
  normalizeLanguagePreference,
  readLanguageFromClientCookies,
  writeLanguageCookies,
  type ContentLanguageSignal,
} from '../i18n/helpers';
import type {
  AccentThemeId,
  DailyStreakState,
  DramaItem,
  EpisodeComment,
  GoogleUser,
  LanguageCode,
  LanguagePreference,
  MediaProviderName,
  ReactionKey,
  SubtitleStyleConfig,
  ToastItem,
  WatchHistoryEntry,
  WatchlistFolder,
  WatchStatusFilter,
} from '../types/drama';

const MOVIE_WATCHLIST_STORAGE_PREFIX = 'kano_drama_movie_watchlist_v1_';
const DRAMA_WATCHLIST_STORAGE_KEY = 'kano_drama_drama_watchlist_v1';
const LIKED_DRAMAS_STORAGE_KEY = 'kano_drama_liked_v1';
const COMPLETED_DRAMAS_STORAGE_KEY = 'kano_drama_completed_v1';
const HISTORY_STORAGE_KEY = 'kano_drama_history_v2';
const WATCHED_EPS_STORAGE_KEY = 'kano_drama_watched_eps_v1';
const RECENT_SEARCH_STORAGE_KEY = 'kano_drama_recent_searches_v1';
const LANG_STORAGE_KEY = 'kano_drama_lang_v3';
const LANG_PREF_STORAGE_KEY = 'kano_drama_lang_pref_v1';
const THEME_STORAGE_KEY = 'kano_drama_theme_v1';
const SUBTITLE_STORAGE_KEY = 'kano_drama_subtitle_style_v1';
const FOLDERS_STORAGE_KEY = 'kano_drama_folders_v1';
const ITEM_FOLDER_STORAGE_KEY = 'kano_drama_item_folders_v1';
const RATINGS_STORAGE_KEY = 'kano_drama_ratings_v1';
const REACTIONS_STORAGE_KEY = 'kano_drama_reactions_v1';
const COMMENTS_STORAGE_KEY = 'kano_drama_comments_v1';
const UNLOCKED_VIP_STORAGE_KEY = 'kano_drama_unlocked_eps_v1';
const WATCHED_COUNT_STORAGE_KEY = 'kano_drama_watched_count_v1';

export const DEFAULT_WATCHLIST_FOLDERS: WatchlistFolder[] = [
  { id: 'all', name: 'All Saved', isDefault: true },
  { id: 'ceo', name: 'CEO & Romance', isDefault: true },
  { id: 'wuxia', name: 'Historical / Wuxia', isDefault: true },
  { id: 'later', name: 'Watch Later', isDefault: true },
];

const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  fontSize: 'medium',
  textColor: 'white',
  bgOpacity: 50,
};

const EMPTY_STREAK: DailyStreakState = {
  count: 0,
  lastVisitDate: '',
  isVipCoffeeLover: false,
};

const AVATAR_COLORS = ['#EF4444', '#D4AF37', '#10B981', '#E11D48', '#3B82F6'];

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapServerUser(srvUser: ServerAuthenticatedUser): GoogleUser {
  const email = (srvUser.email || '').trim();
  const displayName =
    (srvUser.displayName || '').trim() ||
    email.split('@')[0] ||
    'Kano Viewer';
  const color =
    AVATAR_COLORS[
      Math.abs(
        (email || srvUser.uid)
          .split('')
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      ) % AVATAR_COLORS.length
    ];
  return {
    uid: srvUser.uid,
    displayName,
    email,
    photoURL: srvUser.photoURL || null,
    avatarInitials: buildInitials(displayName),
    avatarColor: color,
    signedInAt: Date.now(),
    bio: srvUser.bio,
    preferredLanguage: srvUser.preferredLanguage,
  };
}

interface DramaContextValue {
  language: LanguageCode;
  languagePreference: LanguagePreference;
  t: Translations;
  setLanguageState: (lang: LanguageCode) => void;
  setLanguagePreference: (pref: LanguagePreference) => LanguageCode;
  syncLanguageFromContent: (
    input: Partial<DramaItem> | ContentLanguageSignal | string | null | undefined,
    apiLang?: string | null
  ) => LanguageCode;
  user: GoogleUser | null;
  authLoading: boolean;
  authError: string | null;
  authModalOpen: boolean;
  authPromptReason: string | null;
  openAuthModal: (reason?: string, onSuccess?: (u: GoogleUser) => void) => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<GoogleUser | null>;
  signInWithEmail: (email: string, password: string) => Promise<GoogleUser | null>;
  registerAccountWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<GoogleUser | null>;
  completeGoogleSignIn: (result: GoogleAuthResult) => GoogleUser;
  signOut: () => Promise<void>;
  requireAuth: (reason: string, action: (u: GoogleUser) => void) => Promise<void>;
  gmailLoginCount: number;
  refreshGmailLoginCount: () => Promise<number>;
  pointsBalance: number | null;
  pointsDbConnected: boolean | null;
  pointsDbError: string | null;
  todayWatchSeconds: number;
  todayWatchPointsEarned: number;
  dailyMissionMaxWatchSeconds: number;
  watchMinutePoints: number;
  dailyMissionMilestones: Array<{ minutes: number; bonusPoints: number }>;
  dailyMissionStatuses: Array<{
    minutes: number;
    bonusPoints: number;
    reached: boolean;
    claimed: boolean;
  }>;
  accountLevelInfo: {
    level: number;
    tierId: 'bronze' | 'silver' | 'gold' | 'platinum';
    tierName: string;
    multiplier: number;
    bonusPercent: number;
    watchMinutePoints: number;
    dailyCheckinPoints: number;
    dailyCheckinDay7Points?: number;
    dailyMissionMilestones: Array<{ minutes: number; bonusPoints: number }>;
    progressPercent: number;
  } | null;
  pointsPerUsd: number;
  refreshPointsBalance: () => Promise<number | null>;
  getAuthHeaders: (extra?: Record<string, string>) => Record<string, string>;
  visitorId: string;
  updateUserProfile: (patch: {
    displayName?: string;
    bio?: string;
    preferredLanguage?: LanguageCode;
    accentTheme?: AccentThemeId;
    highContrast?: boolean;
    subtitleStyle?: SubtitleStyleConfig;
  }) => Promise<boolean>;
  loadUserCommentHistory: () => Promise<
    Array<
      EpisodeComment & {
        dramaId: string;
        provider: MediaProviderName;
        episodeNumber: number;
      }
    >
  >;
  streak: DailyStreakState;
  helpModalOpen: boolean;
  setHelpModalOpen: (open: boolean) => void;
  accentTheme: AccentThemeId;
  setAccentTheme: (theme: AccentThemeId) => void;
  highContrast: boolean;
  setHighContrast: (enabled: boolean) => void;
  subtitleStyle: SubtitleStyleConfig;
  setSubtitleStyle: (style: SubtitleStyleConfig) => void;
  myListItems: DramaItem[];
  dramaWatchlistItems: DramaItem[];
  movieWatchlistItems: DramaItem[];
  myListIds: string[];
  toggleMyList: (drama: DramaItem, folderId?: string) => void;
  isDramaSaved: (bookId: string, provider?: MediaProviderName) => boolean;
  likedDramaIds: string[];
  isDramaLiked: (bookId: string, provider?: MediaProviderName) => boolean;
  getDramaLikesCount: (bookId: string, provider?: MediaProviderName) => number;
  refreshDramaStats: (bookId: string, provider?: MediaProviderName) => Promise<void>;
  toggleLikeDrama: (drama: DramaItem) => void;
  completedDramaIds: string[];
  toggleDramaCompleted: (bookId: string, provider: MediaProviderName) => void;
  getDramaWatchStatus: (
    drama: DramaItem
  ) => Exclude<WatchStatusFilter, 'all'>;
  watchlistFolders: WatchlistFolder[];
  itemFolderMap: Record<string, string>;
  createWatchlistFolder: (name: string) => WatchlistFolder | null;
  deleteWatchlistFolder: (folderId: string) => void;
  assignDramaToFolder: (
    bookId: string,
    provider: MediaProviderName,
    folderId: string
  ) => void;
  getDramaFolderId: (bookId: string, provider: MediaProviderName) => string;
  watchHistory: WatchHistoryEntry[];
  recordWatchProgress: (
    drama: DramaItem,
    episode: number,
    currentTime?: number,
    duration?: number,
    immediate?: boolean,
    playbackState?: {
      isPlaying?: boolean;
      isBuffering?: boolean;
      playbackRate?: number;
    }
  ) => void;
  removeHistoryItem: (bookId: string, provider?: MediaProviderName) => void;
  getResumePoint: (
    bookId: string,
    provider?: MediaProviderName
  ) => { episode: number; currentTime: number; progress: number } | null;
  getWatchedEpisodes: (bookId: string, provider: MediaProviderName) => number[];
  getDramaRating: (bookId: string, provider: MediaProviderName) => number;
  setDramaRating: (
    bookId: string,
    provider: MediaProviderName,
    stars: number
  ) => void;
  getEpisodeReactions: (
    bookId: string,
    provider: MediaProviderName,
    episode: number
  ) => Record<ReactionKey, number>;
  addEpisodeReaction: (
    bookId: string,
    provider: MediaProviderName,
    episode: number,
    key: ReactionKey
  ) => void;
  syncEpisodeComments: (
    bookId: string,
    provider: MediaProviderName,
    episode: number
  ) => Promise<void>;
  getEpisodeComments: (
    bookId: string,
    provider: MediaProviderName,
    episode: number
  ) => EpisodeComment[];
  addEpisodeComment: (
    bookId: string,
    provider: MediaProviderName,
    episode: number,
    text: string,
    videoTimestampSec?: number
  ) => Promise<boolean>;
  isEpisodeUnlocked: (
    bookId: string,
    provider: MediaProviderName,
    episode: number
  ) => boolean;
  unlockVipEpisode: (
    bookId: string,
    provider: MediaProviderName,
    episode: number
  ) => void;
  recentSearches: string[];
  addRecentSearch: (keyword: string) => void;
  removeRecentSearch: (keyword: string) => void;
  clearRecentSearches: () => void;
  episodesWatchedCount: number;
  toasts: ToastItem[];
  pushToast: (message: string, tone?: ToastItem['tone']) => void;
  dismissToast: (id: string) => void;
  getDramaLiveStats: (
    bookId: string,
    provider?: MediaProviderName
  ) => {
    dailyViews: number;
    totalViews: number;
    likesCount?: number;
    commentsCount?: number;
    trendBadge?: 'HOT' | 'TRENDING';
  } | null;
}

const DramaContext = createContext<DramaContextValue | null>(null);

function makeItemKey(bookId: string, provider: MediaProviderName = 'DramaBoxV2') {
  return `${normalizeMediaProviderName(provider, 'DramaBoxV2')}:${bookId}`;
}

function makeEpisodeKey(
  bookId: string,
  provider: MediaProviderName,
  episode: number
) {
  const safeId = bookId.replace(/[^a-zA-Z0-9_\-:]/g, '_');
  return `${provider}:${safeId}:ep${episode}`.slice(0, 128);
}

function readJsonStorage<T>(
  key: string,
  fallback: T,
  legacyKey?: string
): T {
  try {
    const raw =
      localStorage.getItem(key) ||
      (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // Ignore storage read errors
  }
  return fallback;
}

function movieWatchlistStorageKey(uid: string): string {
  return `${MOVIE_WATCHLIST_STORAGE_PREFIX}${uid}`;
}

function isMovieMedia(drama: Pick<DramaItem, 'provider' | 'mediaType'>): boolean {
  return (
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries' ||
    drama.mediaType === 'movie'
  );
}

function getPersistentVisitorId(): string {
  try {
    const existing =
      localStorage.getItem('kd_visitor_id') ||
      localStorage.getItem('hd_visitor_id');
    if (existing && existing.trim()) {
      localStorage.setItem('kd_visitor_id', existing.trim());
      localStorage.removeItem('hd_visitor_id');
      return existing.trim();
    }
    const next = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('kd_visitor_id', next);
    return next;
  } catch {
    return 'v-anon';
  }
}

export const DramaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [visitorId] = useState<string>(() => getPersistentVisitorId());
  const [languagePreference, setLanguagePreferenceRaw] =
    useState<LanguagePreference>(() => {
      try {
        if (typeof window !== 'undefined') {
          const urlLang = normalizeLanguageCode(
            new URLSearchParams(window.location.search).get('lang')
          );
          if (urlLang) return urlLang;
        }
        const savedPref = normalizeLanguagePreference(
          localStorage.getItem(LANG_PREF_STORAGE_KEY)
        );
        if (savedPref) return savedPref;

        const cookieData = readLanguageFromClientCookies();
        if (cookieData.pref) return cookieData.pref;

        const savedLang = normalizeLanguageCode(
          localStorage.getItem(LANG_STORAGE_KEY) ||
            localStorage.getItem('coffee_drama_lang_v3')
        );
        if (savedLang) return savedLang;
      } catch {
        // Ignore storage read errors
      }
      return 'auto';
    });

  const [language, setLanguageRaw] = useState<LanguageCode>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlLang = normalizeLanguageCode(
          new URLSearchParams(window.location.search).get('lang')
        );
        if (urlLang) {
          setActiveAppLanguage(urlLang);
          return urlLang;
        }
      }
      const saved = normalizeLanguageCode(
        localStorage.getItem(LANG_STORAGE_KEY) ||
          localStorage.getItem('coffee_drama_lang_v3')
      );
      if (saved) {
        setActiveAppLanguage(saved);
        return saved;
      }
      const cookieData = readLanguageFromClientCookies();
      if (cookieData.lang) {
        setActiveAppLanguage(cookieData.lang);
        return cookieData.lang;
      }
      if (typeof navigator !== 'undefined') {
        const navLang = normalizeLanguageCode(navigator.language);
        if (navLang) {
          setActiveAppLanguage(navLang);
          return navLang;
        }
      }
    } catch {
      // Ignore
    }
    setActiveAppLanguage('en');
    return 'en';
  });

  const [user, setUser] = useState<GoogleUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<string | null>(null);
  const pendingAuthCallbackRef = useRef<((u: GoogleUser) => void) | null>(
    null
  );
  const [streak, setStreak] = useState<DailyStreakState>(EMPTY_STREAK);
  const [gmailLoginCount, setGmailLoginCount] = useState<number>(0);
  const gmailLoginCountRef = useRef<number>(0);
  useEffect(() => {
    gmailLoginCountRef.current = gmailLoginCount;
  }, [gmailLoginCount]);
  const sessionTokenRef = useRef<string | null>(null);
  const activeActorUidRef = useRef<string | null>(null);
  const languageRef = useRef<LanguageCode>(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const popupLoginInFlightRef = useRef<boolean>(false);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [pointsDbConnected, setPointsDbConnected] = useState<boolean | null>(null);
  const [pointsDbError, setPointsDbError] = useState<string | null>(null);
  const [todayWatchSeconds, setTodayWatchSeconds] = useState<number>(0);
  const [todayWatchPointsEarned, setTodayWatchPointsEarned] = useState<number>(0);
  const [dailyMissionMaxWatchSeconds, setDailyMissionMaxWatchSeconds] = useState<number>(3600);
  const [watchMinutePoints, setWatchMinutePoints] = useState<number>(20);
  const [dailyMissionMilestones, setDailyMissionMilestones] = useState<
    Array<{ minutes: number; bonusPoints: number }>
  >([
    { minutes: 15, bonusPoints: 150 },
    { minutes: 30, bonusPoints: 300 },
    { minutes: 60, bonusPoints: 600 },
  ]);
  const [dailyMissionStatuses, setDailyMissionStatuses] = useState<
    Array<{ minutes: number; bonusPoints: number; reached: boolean; claimed: boolean }>
  >([]);
  const [accountLevelInfo, setAccountLevelInfo] = useState<{
    level: number;
    tierId: 'bronze' | 'silver' | 'gold' | 'platinum';
    tierName: string;
    multiplier: number;
    bonusPercent: number;
    watchMinutePoints: number;
    dailyCheckinPoints: number;
    dailyCheckinDay7Points?: number;
    dailyMissionMilestones: Array<{ minutes: number; bonusPoints: number }>;
    progressPercent: number;
  } | null>(null);
  const [pointsPerUsd, setPointsPerUsd] = useState<number>(100000);
  const watchStreamSessionIdRef = useRef<string>(
    `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  const watchSessionTokenRef = useRef<{
    mediaKey: string;
    token: string;
    seq: number;
  } | null>(null);
  const watchSessionPromiseRef = useRef<{
    mediaKey: string;
    promise: Promise<string | null>;
  } | null>(null);
  const lastWatchHeartbeatSentAtRef = useRef<number>(0);
  const lastWatchHeartbeatMediaRef = useRef<string>('');
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const getAuthHeaders = useCallback((extra?: Record<string, string>): Record<string, string> => {
    const deviceFp = getClientDeviceFingerprint();
    const userTimezone = languageRef.current === 'id' ? 'Asia/Jakarta' : 'UTC';
    const headers: Record<string, string> = {
      'X-Requested-With': 'KanoDrama',
      'X-User-Timezone': userTimezone,
      ...(deviceFp ? { 'X-Device-Fingerprint': deviceFp } : {}),
      ...(extra || {}),
    };
    if (sessionTokenRef.current) {
      headers.Authorization = `Bearer ${sessionTokenRef.current}`;
    }
    return headers;
  }, []);

  const refreshPointsBalance = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch('/api/points/me', {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        error?: string;
        dbConnected?: boolean;
        summary?: {
          balance?: number;
          todayWatchSeconds?: number;
          todayWatchPointsEarned?: number;
          dailyMissionMaxWatchSeconds?: number;
          checkinStreak?: number;
          milestones?: Array<{
            minutes: number;
            bonusPoints: number;
            reached: boolean;
            claimed: boolean;
          }>;
          levelInfo?: {
            level: number;
            tierId: 'bronze' | 'silver' | 'gold' | 'platinum';
            tierName: string;
            multiplier: number;
            bonusPercent: number;
            watchMinutePoints: number;
            dailyCheckinPoints: number;
            dailyCheckinDay7Points?: number;
            dailyMissionMilestones: Array<{ minutes: number; bonusPoints: number }>;
            progressPercent: number;
          };
        } | null;
        config?: {
          watchMinutePoints?: number;
          dailyMissionMaxWatchSeconds?: number;
          dailyMissionMilestones?: Array<{ minutes: number; bonusPoints: number }>;
          pointsPerUsd?: number;
        } | null;
      };
      if (res.status === 503) {
        setPointsDbConnected(false);
        setPointsDbError(
          data.error || 'Database PostgreSQL belum terhubung (periksa DATABASE_URL).'
        );
        return null;
      }
      if (!res.ok) return null;
      setPointsDbConnected(true);
      setPointsDbError(null);
      if (data.config) {
        if (typeof data.config.watchMinutePoints === 'number' && data.config.watchMinutePoints > 0) {
          setWatchMinutePoints(Math.floor(data.config.watchMinutePoints));
        }
        if (
          typeof data.config.dailyMissionMaxWatchSeconds === 'number' &&
          data.config.dailyMissionMaxWatchSeconds > 0
        ) {
          setDailyMissionMaxWatchSeconds(Math.floor(data.config.dailyMissionMaxWatchSeconds));
        }
        if (
          Array.isArray(data.config.dailyMissionMilestones) &&
          data.config.dailyMissionMilestones.length > 0
        ) {
          setDailyMissionMilestones(data.config.dailyMissionMilestones);
        }
        if (typeof data.config.pointsPerUsd === 'number' && data.config.pointsPerUsd > 0) {
          setPointsPerUsd(Math.floor(data.config.pointsPerUsd));
        }
      }
      if (data.ok && data.summary) {
        if (typeof data.summary.todayWatchSeconds === 'number') {
          setTodayWatchSeconds(Math.max(0, Math.floor(data.summary.todayWatchSeconds)));
        }
        if (typeof data.summary.todayWatchPointsEarned === 'number') {
          setTodayWatchPointsEarned(
            Math.max(0, Math.floor(data.summary.todayWatchPointsEarned))
          );
        }
        if (
          typeof data.summary.dailyMissionMaxWatchSeconds === 'number' &&
          data.summary.dailyMissionMaxWatchSeconds > 0
        ) {
          setDailyMissionMaxWatchSeconds(
            Math.floor(data.summary.dailyMissionMaxWatchSeconds)
          );
        }
        if (Array.isArray(data.summary.milestones)) {
          setDailyMissionStatuses(data.summary.milestones);
        }
        if (data.summary.levelInfo) {
          const lv = data.summary.levelInfo;
          setAccountLevelInfo(lv);
          if (typeof lv.watchMinutePoints === 'number' && lv.watchMinutePoints > 0) {
            setWatchMinutePoints(Math.floor(lv.watchMinutePoints));
          }
          if (
            Array.isArray(lv.dailyMissionMilestones) &&
            lv.dailyMissionMilestones.length > 0
          ) {
            setDailyMissionMilestones(lv.dailyMissionMilestones);
          }
        }
        if (typeof data.summary.checkinStreak === 'number' && data.summary.checkinStreak > 0) {
          setStreak((prev) => ({
            ...prev,
            count: Math.max(prev.count, Math.floor(data.summary!.checkinStreak!)),
            isVipCoffeeLover: prev.isVipCoffeeLover || data.summary!.checkinStreak! >= 3,
          }));
        }
        if (typeof data.summary.balance === 'number') {
          const nextBal = Math.max(0, Math.floor(data.summary.balance));
          setPointsBalance(nextBal);
          return nextBal;
        }
      }
    } catch {
      // Ignore transient network errors
    }
    return null;
  }, [getAuthHeaders]);

  const ensureWatchSessionToken = useCallback(
    async (
      dramaId: string,
      provider: MediaProviderName,
      episodeNumber: number
    ): Promise<string | null> => {
      const mediaKey = `${provider}:${dramaId}:ep${episodeNumber}`;
      const cached = watchSessionTokenRef.current;
      if (cached && cached.mediaKey === mediaKey && cached.token) {
        return cached.token;
      }
      const inFlight = watchSessionPromiseRef.current;
      if (inFlight && inFlight.mediaKey === mediaKey) {
        return inFlight.promise;
      }

      const previousSessionToken = cached?.token;
      const promise = (async (): Promise<string | null> => {
        try {
          const res = await fetch('/api/watch/session', {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              streamSessionId: watchStreamSessionIdRef.current,
              dramaId,
              provider,
              episodeNumber,
              ...(previousSessionToken ? { previousSessionToken } : {}),
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            sessionToken?: string;
            error?: string;
          };
          if (res.status === 503) {
            setPointsDbConnected(false);
            setPointsDbError(
              data.error || 'Database PostgreSQL belum terhubung (periksa DATABASE_URL).'
            );
            return null;
          }
          if (res.ok && data.ok && data.sessionToken) {
            watchSessionTokenRef.current = {
              mediaKey,
              token: data.sessionToken,
              seq: 0,
            };
            return data.sessionToken;
          }
        } catch {
          // Ignore transient failure
        }
        return null;
      })().finally(() => {
        if (watchSessionPromiseRef.current?.mediaKey === mediaKey) {
          watchSessionPromiseRef.current = null;
        }
      });

      watchSessionPromiseRef.current = { mediaKey, promise };
      return promise;
    },
    [getAuthHeaders]
  );

  const [accentTheme, setAccentThemeState] = useState<AccentThemeId>(() => {
    const saved = readJsonStorage<{ accent?: AccentThemeId; contrast?: boolean }>(
      THEME_STORAGE_KEY,
      {},
      'coffee_drama_theme_v1'
    );
    return saved.accent &&
      ['crimson', 'gold', 'rose', 'emerald'].includes(saved.accent)
      ? saved.accent
      : 'crimson';
  });

  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    const saved = readJsonStorage<{ accent?: AccentThemeId; contrast?: boolean }>(
      THEME_STORAGE_KEY,
      {},
      'coffee_drama_theme_v1'
    );
    return Boolean(saved.contrast);
  });

  const [subtitleStyle, setSubtitleStyleState] = useState<SubtitleStyleConfig>(
    () =>
      readJsonStorage(
        SUBTITLE_STORAGE_KEY,
        DEFAULT_SUBTITLE_STYLE,
        'coffee_drama_subtitle_style_v1'
      )
  );

  const [movieListItemsRaw, setMovieListItemsRaw] = useState<DramaItem[]>([]);
  const [dramaListItems, setDramaListItems] = useState<DramaItem[]>(() =>
    readJsonStorage<DramaItem[]>(
      DRAMA_WATCHLIST_STORAGE_KEY,
      [],
      'coffee_drama_mylist_v1'
    ).filter((d) => d && d.bookId && !isMovieMedia(d))
  );

  const [likedDramaIds, setLikedDramaIds] = useState<string[]>(() =>
    readJsonStorage<string[]>(
      LIKED_DRAMAS_STORAGE_KEY,
      [],
      'coffee_drama_liked_v1'
    )
  );
  const likedDramaIdsRef = useRef<string[]>(likedDramaIds);
  useEffect(() => {
    likedDramaIdsRef.current = likedDramaIds;
  }, [likedDramaIds]);

  const [likesCountMap, setLikesCountMap] = useState<Record<string, number>>({});
  const likesCountMapRef = useRef<Record<string, number>>(likesCountMap);
  useEffect(() => {
    likesCountMapRef.current = likesCountMap;
  }, [likesCountMap]);

  const [completedDramaIds, setCompletedDramaIds] = useState<string[]>(() =>
    readJsonStorage<string[]>(
      COMPLETED_DRAMAS_STORAGE_KEY,
      [],
      'coffee_drama_completed_v1'
    )
  );

  const [watchlistFolders, setWatchlistFolders] = useState<WatchlistFolder[]>(
    () => {
      const saved = readJsonStorage<WatchlistFolder[]>(
        FOLDERS_STORAGE_KEY,
        DEFAULT_WATCHLIST_FOLDERS,
        'coffee_drama_folders_v1'
      );
      return Array.isArray(saved) && saved.length > 0
        ? saved
        : DEFAULT_WATCHLIST_FOLDERS;
    }
  );

  const [itemFolderMap, setItemFolderMap] = useState<Record<string, string>>(
    () =>
      readJsonStorage(ITEM_FOLDER_STORAGE_KEY, {}, 'coffee_drama_item_folders_v1')
  );

  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>(() => {
    try {
      const raw =
        localStorage.getItem(HISTORY_STORAGE_KEY) ||
        localStorage.getItem('coffee_drama_history_v2') ||
        localStorage.getItem('coffee_drama_history_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((e) => e && e.drama && e.drama.bookId)
            .map((entry) => {
              const prov = normalizeMediaProviderName(
                entry.provider || entry.drama?.provider,
                'DramaBoxV2'
              );
              const resolvedType =
                prov === 'LK21' ||
                prov === 'LookSeries' ||
                entry.mediaType === 'movie' ||
                entry.drama?.mediaType === 'movie'
                  ? 'movie'
                  : 'drama';
              return {
                bookId: entry.bookId || entry.drama.bookId,
                provider: prov,
                mediaType: resolvedType,
                title: entry.title || entry.drama.title,
                cover: entry.cover || entry.drama.cover || '',
                drama: {
                  ...entry.drama,
                  provider: prov,
                  mediaType: resolvedType,
                  slug:
                    entry.drama.slug ||
                    (prov === 'LK21'
                      ? entry.bookId || entry.drama.bookId
                      : prov === 'LookSeries'
                      ? `ls-${entry.bookId || entry.drama.bookId}`
                      : undefined),
                },
                episode: typeof entry.episode === 'number' ? entry.episode : 1,
                currentTime:
                  typeof entry.currentTime === 'number' ? entry.currentTime : 0,
                duration:
                  typeof entry.duration === 'number' ? entry.duration : 0,
                progress:
                  typeof entry.progress === 'number' ? entry.progress : 15,
                updatedAt:
                  typeof entry.updatedAt === 'number'
                    ? entry.updatedAt
                    : Date.now(),
              };
            });
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [watchedMap, setWatchedMap] = useState<Record<string, number[]>>(() =>
    readJsonStorage(WATCHED_EPS_STORAGE_KEY, {}, 'coffee_drama_watched_eps_v1')
  );

  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>(() =>
    readJsonStorage(RATINGS_STORAGE_KEY, {}, 'coffee_drama_ratings_v1')
  );

  const [reactionsMap, setReactionsMap] = useState<
    Record<string, Record<ReactionKey, number>>
  >(() =>
    readJsonStorage(REACTIONS_STORAGE_KEY, {}, 'coffee_drama_reactions_v1')
  );

  const [commentsMap, setCommentsMap] = useState<
    Record<string, EpisodeComment[]>
  >(() =>
    readJsonStorage(COMMENTS_STORAGE_KEY, {}, 'coffee_drama_comments_v1')
  );

  const [unlockedVipList, setUnlockedVipList] = useState<string[]>(() =>
    readJsonStorage(
      UNLOCKED_VIP_STORAGE_KEY,
      [],
      'coffee_drama_unlocked_eps_v1'
    )
  );

  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readJsonStorage(
      RECENT_SEARCH_STORAGE_KEY,
      [],
      'coffee_drama_recent_searches_v1'
    )
  );

  const [episodesWatchedCount, setEpisodesWatchedCount] = useState<number>(
    () =>
      readJsonStorage<number>(
        WATCHED_COUNT_STORAGE_KEY,
        0,
        'coffee_drama_watched_count_v1'
      )
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [liveBadgeMap, setLiveBadgeMap] = useState<
    Record<
      string,
      {
        dailyViews: number;
        totalViews: number;
        likesCount?: number;
        commentsCount?: number;
        trendBadge?: 'HOT' | 'TRENDING';
      }
    >
  >({});
  const countedEpisodesSessionRef = useRef<Set<string>>(new Set());
  const lastHistoryPostRef = useRef<Record<string, { at: number; ep: number }>>({});

  const refreshLiveBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/badges');
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok?: boolean;
        stats?: Record<
          string,
          {
            dailyViews: number;
            totalViews: number;
            likesCount?: number;
            commentsCount?: number;
            trendBadge?: 'HOT' | 'TRENDING';
          }
        >;
      };
      if (data.ok && data.stats) {
        setLiveBadgeMap(data.stats);
        setLikesCountMap((prev) => {
          const next = { ...prev };
          for (const [k, stat] of Object.entries(data.stats!)) {
            if (typeof stat.likesCount === 'number' && !(k in next)) {
              next[k] = Math.max(0, stat.likesCount);
            }
          }
          return next;
        });
      }
    } catch {
      // Keep existing map on transient error
    }
  }, []);

  useEffect(() => {
    void refreshLiveBadges();
    const timer = window.setInterval(() => {
      void refreshLiveBadges();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshLiveBadges]);

  const pushToast = useCallback(
    (message: string, tone: ToastItem['tone'] = 'gold') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3400);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshGmailLoginCount = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch('/api/auth/gmail-stats', { cache: 'no-store' });
      if (!res.ok) return gmailLoginCountRef.current;
      const data = (await res.json()) as {
        ok?: boolean;
        uniqueGmailLogins?: number;
      };
      if (typeof data.uniqueGmailLogins === 'number') {
        const nextCount = Math.max(0, Math.floor(data.uniqueGmailLogins));
        setGmailLoginCount(nextCount);
        return nextCount;
      }
    } catch {
      // Keep current fallback count if backend is unreachable
    }
    return gmailLoginCountRef.current;
  }, []);

  // Sync user's daily streak & profile with PostgreSQL (/api/users/sync)
  const syncUserStreak = useCallback(
    async (
      mappedUser: GoogleUser,
      options?: { isLoginEvent?: boolean }
    ) => {
      let resolvedStreak: DailyStreakState = EMPTY_STREAK;
      const isLoginEvent = Boolean(options?.isLoginEvent);

      try {
        const deviceFingerprint = getClientDeviceFingerprint();
        const pendingRefCode = getPendingReferralCode();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'KanoDrama',
        };
        if (deviceFingerprint) {
          headers['X-Device-Fingerprint'] = deviceFingerprint;
        }
        if (sessionTokenRef.current) {
          headers.Authorization = `Bearer ${sessionTokenRef.current}`;
        }
        const res = await fetch('/api/users/sync', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers,
          body: JSON.stringify({
            uid: mappedUser.uid,
            email: mappedUser.email,
            displayName: mappedUser.displayName,
            photoURL: mappedUser.photoURL,
            avatarInitials: mappedUser.avatarInitials,
            avatarColor: mappedUser.avatarColor,
            visitDate: getLocalDateKey(),
            isLoginEvent,
            ...(deviceFingerprint ? { deviceFingerprint } : {}),
            ...(pendingRefCode ? { referralCode: pendingRefCode } : {}),
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            gmailLoginCount?: number;
            user?: {
              displayName?: string;
              bio?: string;
              preferredLanguage?: LanguageCode;
              preferences?: {
                accentTheme?: AccentThemeId;
                highContrast?: boolean;
                subtitleStyle?: SubtitleStyleConfig;
              };
              streakCount?: number;
              lastVisitDate?: string;
              isVip?: boolean;
            } | null;
          };
          if (typeof data.gmailLoginCount === 'number') {
            setGmailLoginCount(Math.max(0, Math.floor(data.gmailLoginCount)));
          } else if (isLoginEvent) {
            void refreshGmailLoginCount();
          }
          if (data.user) {
            if (typeof data.user.streakCount === 'number') {
              const count = Math.max(1, data.user.streakCount);
              resolvedStreak = {
                count,
                lastVisitDate: data.user.lastVisitDate || getLocalDateKey(),
                isVipCoffeeLover: Boolean(data.user.isVip) || count >= 3,
              };
            }
            if (data.user.displayName || data.user.bio || data.user.preferredLanguage) {
              setUser((prev) =>
                prev && prev.uid === mappedUser.uid
                  ? {
                      ...prev,
                      displayName: data.user?.displayName || prev.displayName,
                      bio: data.user?.bio ?? prev.bio,
                      preferredLanguage: data.user?.preferredLanguage || prev.preferredLanguage,
                    }
                  : prev
              );
            }
            const prefs = data.user.preferences;
            if (prefs) {
              if (
                prefs.accentTheme &&
                ['crimson', 'gold', 'rose', 'emerald'].includes(prefs.accentTheme)
              ) {
                setAccentThemeState(prefs.accentTheme);
              }
              if (typeof prefs.highContrast === 'boolean') {
                setHighContrastState(prefs.highContrast);
              }
              if (prefs.subtitleStyle && typeof prefs.subtitleStyle === 'object') {
                setSubtitleStyleState(prefs.subtitleStyle);
              }
            }
          }
        } else {
          console.warn('[AuthSync] /api/users/sync returned HTTP', res.status);
          if (isLoginEvent) {
            void refreshGmailLoginCount();
          }
        }
      } catch (err) {
        console.warn(
          '[AuthSync] /api/users/sync failed:',
          err instanceof Error ? err.message : String(err)
        );
      }

      if (resolvedStreak.count > 0) {
        setStreak(resolvedStreak);
      }
      return resolvedStreak;
    },
    [refreshGmailLoginCount]
  );

  // Hydrate Watch History from PostgreSQL (for both signed-in users and guest visitorId)
  const hydrateWatchHistoryFromPostgres = useCallback(async (
    actorId: string,
    expectedUid?: string | null
  ) => {
    if (!actorId) return;
    try {
      const res = await fetch(
        `/api/watch-history?userId=${encodeURIComponent(actorId)}&limit=24`,
        {
          credentials: 'include',
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        items?: Array<{
          bookId: string;
          provider: MediaProviderName;
          mediaType?: 'drama' | 'movie';
          episode: number;
          currentTime: number;
          duration: number;
          progress: number;
          drama?: Partial<DramaItem>;
          updatedAt: number;
        }>;
      };
      if (!Array.isArray(json.items) || json.items.length === 0) return;
      const remoteEntries: WatchHistoryEntry[] = json.items
        .filter((e) => e && e.bookId)
        .map((e) => {
          const prov = normalizeMediaProviderName(e.provider, 'DramaBoxV2');
          const d = e.drama || {};
          const resolvedType =
            prov === 'LK21' ||
            prov === 'LookSeries' ||
            e.mediaType === 'movie' ||
            d.mediaType === 'movie'
              ? 'movie'
              : 'drama';
          const dramaObj: DramaItem = {
            bookId: e.bookId,
            title:
              d.title || (resolvedType === 'movie' ? 'Saved Movie' : 'Drama Series'),
            slug:
              d.slug ||
              (prov === 'LK21'
                ? e.bookId
                : prov === 'LookSeries'
                ? `ls-${e.bookId}`
                : undefined),
            cover: d.cover || '',
            coverHz: d.coverHz,
            description: d.description || '',
            chapterCount: Number(d.chapterCount) || 1,
            tags: Array.isArray(d.tags) ? d.tags : [],
            playCount: d.playCount,
            corner: d.corner,
            protagonist: d.protagonist,
            author: d.author,
            director: d.director,
            actors: Array.isArray(d.actors) ? d.actors : undefined,
            year: d.year,
            area: d.area,
            quality: d.quality,
            isVip: Boolean(d.isVip),
            provider: prov,
            mediaType: resolvedType,
            status: d.status,
            rating: d.rating,
          };
          return {
            bookId: e.bookId,
            provider: prov,
            mediaType: resolvedType,
            title: dramaObj.title,
            cover: dramaObj.cover,
            drama: dramaObj,
            episode: Number(e.episode) || 1,
            currentTime: Number(e.currentTime) || 0,
            duration: Number(e.duration) || 0,
            progress: Number(e.progress) || 10,
            updatedAt: Number(e.updatedAt) || Date.now(),
          };
        });

      if (expectedUid !== undefined && activeActorUidRef.current !== expectedUid) {
        return;
      }

      setWatchHistory((prev) => {
        const merged = new Map<string, WatchHistoryEntry>();
        for (const item of [...remoteEntries, ...prev]) {
          const k = makeItemKey(item.bookId, item.provider);
          const existing = merged.get(k);
          if (!existing || item.updatedAt > existing.updatedAt) {
            merged.set(k, item);
          }
        }
        return Array.from(merged.values())
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 24);
      });
    } catch {
      // Non-blocking fallback to localStorage watch history
    }
  }, [getAuthHeaders]);

  // Hydrate authenticated user's Movie & Drama Watchlist, Likes & Watch History from PostgreSQL
  const hydrateUserLibraryFromPostgres = useCallback(
    async (uid: string) => {
      try {
        const cachedUserMovies = readJsonStorage<DramaItem[]>(
          movieWatchlistStorageKey(uid),
          []
        ).filter((d) => d && d.bookId && isMovieMedia(d));

        const [favRes, likeRes] = await Promise.allSettled([
          fetch(`/api/favorites?userId=${encodeURIComponent(uid)}&limit=200`, {
            credentials: 'include',
            headers: getAuthHeaders(),
          }),
          fetch(`/api/likes?userId=${encodeURIComponent(uid)}&limit=100`, {
            credentials: 'include',
            headers: getAuthHeaders(),
          }),
          hydrateWatchHistoryFromPostgres(uid, uid),
        ]);

        if (activeActorUidRef.current !== uid) return;

        if (favRes.status === 'fulfilled' && favRes.value.ok) {
          const favJson = (await favRes.value.json()) as {
            items?: Array<{
              dramaId: string;
              provider: MediaProviderName;
              mediaType?: 'drama' | 'movie';
              folderId: string;
              drama?: Partial<DramaItem>;
            }>;
          };
          const remoteMovies: DramaItem[] = [];
          const remoteDramas: DramaItem[] = [];
          const remoteFolders: Record<string, string> = {};
          if (Array.isArray(favJson.items)) {
            for (const entry of favJson.items) {
              if (!entry.dramaId) continue;
              const prov = normalizeMediaProviderName(entry.provider, 'LK21');
              const resolvedType =
                entry.mediaType ??
                (prov === 'LK21' || prov === 'LookSeries' ? 'movie' : 'drama');
              const isMovieEntry =
                resolvedType === 'movie' ||
                prov === 'LK21' ||
                prov === 'LookSeries';
              const d = entry.drama ?? {};
              const item: DramaItem = {
                bookId: entry.dramaId,
                title: d.title || (isMovieEntry ? 'Saved Movie' : 'Saved Drama'),
                slug: d.slug,
                cover: d.cover || '',
                description: d.description || '',
                chapterCount: Number(d.chapterCount) || 1,
                tags: Array.isArray(d.tags) ? d.tags : [],
                playCount: d.playCount,
                corner: d.corner,
                protagonist: d.protagonist,
                author: d.author,
                isVip: Boolean(d.isVip),
                provider: prov,
                mediaType: isMovieEntry ? 'movie' : 'drama',
                year: d.year,
                rating: d.rating,
                quality: d.quality,
                area: d.area,
              };
              if (isMovieEntry) {
                remoteMovies.push(item);
              } else {
                remoteDramas.push(item);
              }
              if (entry.folderId && entry.folderId !== 'all') {
                remoteFolders[makeItemKey(entry.dramaId, prov)] = entry.folderId;
              }
            }
          }

          setMovieListItemsRaw((prev) => {
            const seen = new Set(
              remoteMovies.map((d) => makeItemKey(d.bookId, d.provider))
            );
            const fallbackLocal = [...prev, ...cachedUserMovies].filter(
              (d) =>
                isMovieMedia(d) && !seen.has(makeItemKey(d.bookId, d.provider))
            );
            const uniqueFallback = Array.from(
              new Map(
                fallbackLocal.map((d) => [makeItemKey(d.bookId, d.provider), d])
              ).values()
            );
            return [...remoteMovies, ...uniqueFallback];
          });

          if (remoteDramas.length > 0) {
            setDramaListItems((prev) => {
              const seen = new Set(
                remoteDramas.map((d) => makeItemKey(d.bookId, d.provider))
              );
              const keepLocal = prev.filter(
                (d) =>
                  !isMovieMedia(d) &&
                  !seen.has(makeItemKey(d.bookId, d.provider))
              );
              return [...remoteDramas, ...keepLocal];
            });
          }

          if (Object.keys(remoteFolders).length > 0) {
            setItemFolderMap((prev) => ({ ...prev, ...remoteFolders }));
          }
        } else if (cachedUserMovies.length > 0) {
          setMovieListItemsRaw(cachedUserMovies);
        }

        if (likeRes.status === 'fulfilled' && likeRes.value.ok) {
          const likeJson = (await likeRes.value.json()) as {
            items?: Array<{ dramaId: string; provider: MediaProviderName }>;
          };
          if (Array.isArray(likeJson.items)) {
            const remoteKeys = likeJson.items.map((l) =>
              makeItemKey(
                l.dramaId,
                normalizeMediaProviderName(l.provider, 'DramaBoxV2')
              )
            );
            setLikedDramaIds(remoteKeys);
          }
        }
      } catch {
        // Keep user library gracefully
      }
    },
    [getAuthHeaders, hydrateWatchHistoryFromPostgres]
  );

  // Hydrate likes from PostgreSQL for guest visitorId or signed-in actor
  const hydrateLikesFromPostgres = useCallback(async (
    actorId: string,
    expectedUid?: string | null
  ) => {
    if (!actorId) return;
    try {
      const res = await fetch(
        `/api/likes?userId=${encodeURIComponent(actorId)}&limit=100`,
        {
          credentials: 'include',
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) return;
      const likeJson = (await res.json()) as {
        ok?: boolean;
        items?: Array<{ dramaId: string; provider: MediaProviderName }>;
      };
      if (expectedUid !== undefined && activeActorUidRef.current !== expectedUid) {
        return;
      }
      if (likeJson.ok && Array.isArray(likeJson.items)) {
        const remoteKeys = likeJson.items.map((l) =>
          makeItemKey(
            l.dramaId,
            normalizeMediaProviderName(l.provider, 'DramaBoxV2')
          )
        );
        setLikedDramaIds(remoteKeys);
      }
    } catch {
      // Non-blocking fallback to localStorage likedDramaIds
    }
  }, [getAuthHeaders]);

  const bindPendingReferralIfAny = useCallback(async () => {
    const pendingRef = getPendingReferralCode();
    if (!pendingRef) return;
    try {
      const res = await fetch('/api/referrals/bind', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          referralCode: pendingRef,
          deviceFingerprint: getClientDeviceFingerprint(),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as {
        bound?: boolean;
        bindBonusAwarded?: number;
        reason?: string;
      } | null;
      if (data && (data.bound || data.reason)) {
        clearPendingReferralCode();
        if (data.bound) {
          void refreshPointsBalance();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kd:points-updated', {
                detail: {
                  referralBound: true,
                  bindBonusAwarded: Number(data.bindBonusAwarded) || 0,
                },
              })
            );
          }
        }
      }
    } catch {
      // Retry on next session check
    }
  }, [getAuthHeaders, refreshPointsBalance]);

  // Capture ?ref= query parameter once on mount
  useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);

  // Preload Google Identity Services config & hydrate Express session sequentially before guest fallback
  useEffect(() => {
    let cancelled = false;
    void preloadGoogleAuth();

    void fetchCurrentAuthSession(sessionTokenRef.current)
      .then((sessionState) => {
        if (cancelled) return;
        if (typeof sessionState.gmailLoginCount === 'number') {
          setGmailLoginCount(Math.max(0, Math.floor(sessionState.gmailLoginCount)));
        }
        if (sessionState.authenticated && sessionState.user) {
          const srvUser = sessionState.user;
          const mapped = mapServerUser(srvUser);
          activeActorUidRef.current = mapped.uid;
          setUser(mapped);
          setAuthError(null);
          const prefs = srvUser.preferences;
          if (prefs) {
            if (
              prefs.accentTheme &&
              ['crimson', 'gold', 'rose', 'emerald'].includes(prefs.accentTheme)
            ) {
              setAccentThemeState(prefs.accentTheme);
            }
            if (typeof prefs.highContrast === 'boolean') {
              setHighContrastState(prefs.highContrast);
            }
            if (prefs.subtitleStyle && typeof prefs.subtitleStyle === 'object') {
              setSubtitleStyleState(prefs.subtitleStyle);
            }
          }
          const cachedUserMovies = readJsonStorage<DramaItem[]>(
            movieWatchlistStorageKey(mapped.uid),
            []
          ).filter((d) => d && d.bookId && isMovieMedia(d));
          if (cachedUserMovies.length > 0) {
            setMovieListItemsRaw(cachedUserMovies);
          }
          if (!popupLoginInFlightRef.current) {
            void syncUserStreak(mapped, { isLoginEvent: false });
          }
          void bindPendingReferralIfAny();
          void hydrateUserLibraryFromPostgres(mapped.uid);
          void refreshPointsBalance();
        } else {
          activeActorUidRef.current = null;
          setUser(null);
          setPointsBalance(null);
          setDailyMissionStatuses([]);
          setAccountLevelInfo(null);
          setStreak(EMPTY_STREAK);
          setMovieListItemsRaw([]);
          void hydrateWatchHistoryFromPostgres(visitorId, null);
          void hydrateLikesFromPostgres(visitorId, null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          activeActorUidRef.current = null;
          setUser(null);
          setStreak(EMPTY_STREAK);
          void hydrateWatchHistoryFromPostgres(visitorId, null);
          void hydrateLikesFromPostgres(visitorId, null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visitorId, syncUserStreak, bindPendingReferralIfAny, hydrateUserLibraryFromPostgres, hydrateWatchHistoryFromPostgres, hydrateLikesFromPostgres, refreshPointsBalance]);

  useEffect(() => {
    if (user?.uid) {
      void refreshPointsBalance();
    }
  }, [language, user?.uid, refreshPointsBalance]);

  useEffect(() => {
    const root = document.documentElement;
    if (accentTheme === 'crimson') {
      root.removeAttribute('data-accent');
    } else {
      root.setAttribute('data-accent', accentTheme);
    }
    if (highContrast) {
      root.setAttribute('data-contrast', 'high');
    } else {
      root.removeAttribute('data-contrast');
    }
    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        JSON.stringify({ accent: accentTheme, contrast: highContrast })
      );
    } catch {
      // Ignore
    }
  }, [accentTheme, highContrast]);

  useEffect(() => {
    try {
      localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(subtitleStyle));
    } catch {
      // Ignore
    }
  }, [subtitleStyle]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAMA_WATCHLIST_STORAGE_KEY,
        JSON.stringify(dramaListItems)
      );
    } catch {
      // Ignore
    }
  }, [dramaListItems]);

  useEffect(() => {
    if (!user?.uid) return;
    try {
      localStorage.setItem(
        movieWatchlistStorageKey(user.uid),
        JSON.stringify(movieListItemsRaw)
      );
    } catch {
      // Ignore
    }
  }, [user?.uid, movieListItemsRaw]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LIKED_DRAMAS_STORAGE_KEY,
        JSON.stringify(likedDramaIds)
      );
    } catch {
      // Ignore
    }
  }, [likedDramaIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        COMPLETED_DRAMAS_STORAGE_KEY,
        JSON.stringify(completedDramaIds)
      );
    } catch {
      // Ignore
    }
  }, [completedDramaIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        FOLDERS_STORAGE_KEY,
        JSON.stringify(watchlistFolders)
      );
    } catch {
      // Ignore
    }
  }, [watchlistFolders]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ITEM_FOLDER_STORAGE_KEY,
        JSON.stringify(itemFolderMap)
      );
    } catch {
      // Ignore
    }
  }, [itemFolderMap]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(watchHistory));
    } catch {
      // Ignore
    }
  }, [watchHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHED_EPS_STORAGE_KEY, JSON.stringify(watchedMap));
    } catch {
      // Ignore
    }
  }, [watchedMap]);

  useEffect(() => {
    try {
      localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratingsMap));
    } catch {
      // Ignore
    }
  }, [ratingsMap]);

  useEffect(() => {
    try {
      localStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(reactionsMap));
    } catch {
      // Ignore
    }
  }, [reactionsMap]);

  useEffect(() => {
    try {
      localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(commentsMap));
    } catch {
      // Ignore
    }
  }, [commentsMap]);

  useEffect(() => {
    try {
      localStorage.setItem(
        UNLOCKED_VIP_STORAGE_KEY,
        JSON.stringify(unlockedVipList)
      );
    } catch {
      // Ignore
    }
  }, [unlockedVipList]);

  useEffect(() => {
    try {
      localStorage.setItem(
        RECENT_SEARCH_STORAGE_KEY,
        JSON.stringify(recentSearches)
      );
    } catch {
      // Ignore
    }
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem(
        WATCHED_COUNT_STORAGE_KEY,
        JSON.stringify(episodesWatchedCount)
      );
    } catch {
      // Ignore
    }
  }, [episodesWatchedCount]);

  // Sync <html lang="..."> + cookies + localStorage whenever active language or preference changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = getHtmlLangTag(language);
    }
    writeLanguageCookies(language, languagePreference);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, language);
      localStorage.setItem(LANG_PREF_STORAGE_KEY, languagePreference);
    } catch {
      // Ignore
    }
  }, [language, languagePreference]);

  const setLanguageState = useCallback((lang: LanguageCode) => {
    languageRef.current = lang;
    setActiveAppLanguage(lang);
    setLanguageRaw(lang);
    setLanguagePreferenceRaw(lang);
    writeLanguageCookies(lang, lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = getHtmlLangTag(lang);
    }
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      localStorage.setItem(LANG_PREF_STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
  }, []);

  const setLanguagePreference = useCallback(
    (pref: LanguagePreference): LanguageCode => {
      setLanguagePreferenceRaw(pref);
      if (pref !== 'auto') {
        languageRef.current = pref;
        setActiveAppLanguage(pref);
        setLanguageRaw(pref);
        writeLanguageCookies(pref, pref);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = getHtmlLangTag(pref);
        }
        try {
          localStorage.setItem(LANG_STORAGE_KEY, pref);
          localStorage.setItem(LANG_PREF_STORAGE_KEY, pref);
        } catch {
          // Ignore
        }
        return pref;
      }
      const navFallback =
        (typeof navigator !== 'undefined'
          ? normalizeLanguageCode(navigator.language)
          : null) || language;
      writeLanguageCookies(navFallback, 'auto');
      try {
        localStorage.setItem(LANG_PREF_STORAGE_KEY, 'auto');
      } catch {
        // Ignore
      }
      return navFallback;
    },
    [language]
  );

  const syncLanguageFromContent = useCallback(
    (
      input:
        | Partial<DramaItem>
        | ContentLanguageSignal
        | string
        | null
        | undefined,
      apiLang?: string | null
    ): LanguageCode => {
      if (languagePreference !== 'auto') {
        return language;
      }
      const explicitApi = normalizeLanguageCode(apiLang);
      const detected = explicitApi ?? detectLanguageFromContent(input, language);
      if (detected !== language) {
        languageRef.current = detected;
        setActiveAppLanguage(detected);
        setLanguageRaw(detected);
        writeLanguageCookies(detected, 'auto');
        if (typeof document !== 'undefined') {
          document.documentElement.lang = getHtmlLangTag(detected);
        }
      }
      return detected;
    },
    [language, languagePreference]
  );

  const openAuthModal = useCallback(
    (reason?: string, onSuccess?: (u: GoogleUser) => void) => {
      setAuthError(null);
      setAuthLoading(false);
      setAuthPromptReason(reason ?? null);
      pendingAuthCallbackRef.current = onSuccess ?? null;
      setAuthModalOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    popupLoginInFlightRef.current = false;
    setAuthLoading(false);
    setAuthModalOpen(false);
    setAuthPromptReason(null);
    setAuthError(null);
    pendingAuthCallbackRef.current = null;
  }, []);

  const completeGoogleSignIn = useCallback(
    (result: GoogleAuthResult): GoogleUser => {
      if (result.sessionToken) {
        sessionTokenRef.current = result.sessionToken;
      }
      const mapped = mapServerUser(result.user);
      activeActorUidRef.current = mapped.uid;
      setUser(mapped);
      setAuthError(null);
      setAuthModalOpen(false);
      setAuthPromptReason(null);

      if (typeof result.gmailLoginCount === 'number') {
        setGmailLoginCount(Math.max(0, Math.floor(result.gmailLoginCount)));
      } else {
        void refreshGmailLoginCount();
      }

      const prefs = result.user.preferences;
      if (prefs) {
        if (
          prefs.accentTheme &&
          ['crimson', 'gold', 'rose', 'emerald'].includes(prefs.accentTheme)
        ) {
          setAccentThemeState(prefs.accentTheme);
        }
        if (typeof prefs.highContrast === 'boolean') {
          setHighContrastState(prefs.highContrast);
        }
        if (prefs.subtitleStyle && typeof prefs.subtitleStyle === 'object') {
          setSubtitleStyleState(prefs.subtitleStyle);
        }
      }

      const resolvedStreak: DailyStreakState =
        typeof result.user.streakCount === 'number'
          ? {
              count: Math.max(1, result.user.streakCount),
              lastVisitDate: result.user.lastVisitDate || getLocalDateKey(),
              isVipCoffeeLover:
                Boolean(result.user.isVip) || result.user.streakCount >= 3,
            }
          : EMPTY_STREAK;
      setStreak(resolvedStreak);

      let autoBindBonus = 0;
      if (result.referralBindResult) {
        clearPendingReferralCode();
        if (
          result.referralBindResult.bound &&
          typeof result.referralBindResult.bindBonusAwarded === 'number' &&
          result.referralBindResult.bindBonusAwarded > 0
        ) {
          autoBindBonus = result.referralBindResult.bindBonusAwarded;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kd:points-updated', {
                detail: {
                  referralBound: true,
                  bindBonusAwarded: autoBindBonus,
                },
              })
            );
          }
        }
      } else {
        void bindPendingReferralIfAny();
      }
      void hydrateUserLibraryFromPostgres(mapped.uid);
      void refreshPointsBalance();
      const firstLoginBonus =
        typeof result.firstLoginBonusAwarded === 'number' && result.firstLoginBonusAwarded > 0
          ? result.firstLoginBonusAwarded
          : 0;
      if (firstLoginBonus > 0 && autoBindBonus > 0) {
        const locale = language === 'id' ? 'id-ID' : 'en-US';
        pushToast(
          language === 'id'
            ? `Masuk sebagai ${mapped.displayName} · Bonus login +${firstLoginBonus.toLocaleString(locale)} & bind referral +${autoBindBonus.toLocaleString(locale)} poin!`
            : `Signed in as ${mapped.displayName} · +${firstLoginBonus.toLocaleString(locale)} login & +${autoBindBonus.toLocaleString(locale)} bind referral pts!`,
          'gold'
        );
      } else if (firstLoginBonus > 0) {
        const formattedBonus = firstLoginBonus.toLocaleString(
          language === 'id' ? 'id-ID' : 'en-US'
        );
        pushToast(
          language === 'id'
            ? `Masuk sebagai ${mapped.displayName} · Bonus login pertama +${formattedBonus} poin!`
            : `Signed in as ${mapped.displayName} · First login bonus +${formattedBonus} pts!`,
          'gold'
        );
      } else if (autoBindBonus > 0) {
        const formattedBind = autoBindBonus.toLocaleString(
          language === 'id' ? 'id-ID' : 'en-US'
        );
        pushToast(
          language === 'id'
            ? `Masuk sebagai ${mapped.displayName} · Bonus bind referral +${formattedBind} poin!`
            : `Signed in as ${mapped.displayName} · Bind referral bonus +${formattedBind} pts!`,
          'gold'
        );
      } else {
        pushToast(`Signed in as ${mapped.displayName}`, 'gold');
      }

      const cb = pendingAuthCallbackRef.current;
      pendingAuthCallbackRef.current = null;
      if (cb) cb(mapped);
      return mapped;
    },
    [
      language,
      pushToast,
      refreshGmailLoginCount,
      bindPendingReferralIfAny,
      hydrateUserLibraryFromPostgres,
      refreshPointsBalance,
    ]
  );

  const signInWithGoogle = useCallback(async (): Promise<GoogleUser | null> => {
    setAuthError(null);
    setAuthLoading(true);
    popupLoginInFlightRef.current = true;
    try {
      const result = await signInWithRealGoogle();
      return completeGoogleSignIn(result);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : TRANSLATIONS[language].auth.authErrorPopupBlocked;
      setAuthError(msg);
      return null;
    } finally {
      popupLoginInFlightRef.current = false;
      setAuthLoading(false);
    }
  }, [language, completeGoogleSignIn]);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<GoogleUser | null> => {
      setAuthError(null);
      setAuthLoading(true);
      popupLoginInFlightRef.current = true;
      try {
        const result = await loginWithEmail({ email, password });
        return completeGoogleSignIn(result);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Email sign-in failed.'
        );
        return null;
      } finally {
        popupLoginInFlightRef.current = false;
        setAuthLoading(false);
      }
    },
    [completeGoogleSignIn]
  );

  const registerAccountWithEmail = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string
    ): Promise<GoogleUser | null> => {
      setAuthError(null);
      setAuthLoading(true);
      popupLoginInFlightRef.current = true;
      try {
        const result = await registerWithEmail({ email, password, displayName });
        return completeGoogleSignIn(result);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Email registration failed.'
        );
        return null;
      } finally {
        popupLoginInFlightRef.current = false;
        setAuthLoading(false);
      }
    },
    [completeGoogleSignIn]
  );

  const signOut = useCallback(async () => {
    const activeToken = sessionTokenRef.current;
    sessionTokenRef.current = null;
    activeActorUidRef.current = null;
    try {
      await signOutRealGoogle(activeToken);
    } catch {
      // Ignore
    }
    setUser(null);
    setPointsBalance(null);
    setDailyMissionStatuses([]);
    setAccountLevelInfo(null);
    setPointsDbError(null);
    setTodayWatchSeconds(0);
    setTodayWatchPointsEarned(0);
    watchSessionTokenRef.current = null;
    setMovieListItemsRaw([]);
    setStreak(EMPTY_STREAK);
    setAuthModalOpen(false);
    pushToast('Signed out', 'neutral');
  }, [pushToast]);

  const requireAuth = useCallback(
    async (reason: string, action: (u: GoogleUser) => void) => {
      if (user) {
        action(user);
        return;
      }
      openAuthModal(reason, (signedInUser) => action(signedInUser));
    },
    [user, openAuthModal]
  );

  const setAccentTheme = useCallback((theme: AccentThemeId) => {
    setAccentThemeState(theme);
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
  }, []);

  const setSubtitleStyle = useCallback((style: SubtitleStyleConfig) => {
    setSubtitleStyleState(style);
  }, []);

  const updateUserProfile = useCallback(
    async (patch: {
      displayName?: string;
      bio?: string;
      preferredLanguage?: LanguageCode;
      accentTheme?: AccentThemeId;
      highContrast?: boolean;
      subtitleStyle?: SubtitleStyleConfig;
    }): Promise<boolean> => {
      if (patch.accentTheme) setAccentThemeState(patch.accentTheme);
      if (typeof patch.highContrast === 'boolean') setHighContrastState(patch.highContrast);
      if (patch.subtitleStyle) setSubtitleStyleState(patch.subtitleStyle);
      if (patch.preferredLanguage) setLanguageState(patch.preferredLanguage);

      if (!user) {
        pushToast(TRANSLATIONS[language].dashboard.savedSuccess, 'gold');
        return true;
      }

      try {
        const profileHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'KanoDrama',
        };
        if (sessionTokenRef.current) {
          profileHeaders.Authorization = `Bearer ${sessionTokenRef.current}`;
        }
        const res = await fetch('/api/users/profile', {
          method: 'PATCH',
          credentials: 'include',
          headers: profileHeaders,
          body: JSON.stringify({
            uid: user.uid,
            displayName: patch.displayName,
            bio: patch.bio,
            preferredLanguage: patch.preferredLanguage || language,
            preferences: {
              accentTheme: patch.accentTheme || accentTheme,
              highContrast:
                typeof patch.highContrast === 'boolean'
                  ? patch.highContrast
                  : highContrast,
              subtitleStyle: patch.subtitleStyle || subtitleStyle,
            },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            user?: {
              displayName?: string;
              bio?: string;
              preferredLanguage?: LanguageCode;
            } | null;
          };
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  displayName:
                    data.user?.displayName ||
                    patch.displayName?.trim() ||
                    prev.displayName,
                  bio:
                    data.user?.bio ??
                    (typeof patch.bio === 'string' ? patch.bio : prev.bio),
                  preferredLanguage:
                    data.user?.preferredLanguage ||
                    patch.preferredLanguage ||
                    prev.preferredLanguage,
                }
              : prev
          );
        }
        pushToast(TRANSLATIONS[language].dashboard.savedSuccess, 'gold');
        return true;
      } catch {
        return false;
      }
    },
    [user, language, accentTheme, highContrast, subtitleStyle, setLanguageState, pushToast]
  );

  const loadUserCommentHistory = useCallback(async () => {
    if (!user) return [];
    try {
      const res = await fetch(
        `/api/comments?userId=${encodeURIComponent(user.uid)}&limit=50`,
        {
          credentials: 'include',
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        comments?: Array<
          EpisodeComment & {
            dramaId: string;
            provider: MediaProviderName;
            episodeNumber: number;
          }
        >;
      };
      return Array.isArray(data.comments) ? data.comments : [];
    } catch {
      return [];
    }
  }, [user, getAuthHeaders]);

  const executeToggleMovieWatchlist = useCallback(
    (activeUser: GoogleUser, drama: DramaItem, folderId = 'all') => {
      const normalizedMovie: DramaItem = {
        ...drama,
        mediaType: 'movie',
      };
      const key = makeItemKey(normalizedMovie.bookId, normalizedMovie.provider);
      setMovieListItemsRaw((prev) => {
        const exists = prev.some(
          (d) =>
            d.bookId === normalizedMovie.bookId &&
            d.provider === normalizedMovie.provider
        );
        if (exists) {
          pushToast(`Removed "${normalizedMovie.title}"`, 'neutral');
          return prev.filter(
            (d) =>
              !(
                d.bookId === normalizedMovie.bookId &&
                d.provider === normalizedMovie.provider
              )
          );
        }
        if (folderId && folderId !== 'all') {
          setItemFolderMap((m) => ({ ...m, [key]: folderId }));
        }
        pushToast(`Saved "${normalizedMovie.title}" to Movie Watchlist`, 'gold');
        return [normalizedMovie, ...prev];
      });

      void fetch('/api/favorites/toggle', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: activeUser.uid,
          dramaId: normalizedMovie.bookId,
          provider: normalizedMovie.provider,
          mediaType: 'movie',
          folderId,
          title: normalizedMovie.title,
          cover: normalizedMovie.cover,
          drama: normalizedMovie,
        }),
      }).catch(() => {});
    },
    [getAuthHeaders, pushToast]
  );

  const executeToggleDramaWatchlist = useCallback(
    (drama: DramaItem, folderId = 'all', activeUser?: GoogleUser | null) => {
      const normalizedDrama: DramaItem = {
        ...drama,
        mediaType: 'drama',
      };
      const key = makeItemKey(normalizedDrama.bookId, normalizedDrama.provider);
      setDramaListItems((prev) => {
        const exists = prev.some(
          (d) =>
            d.bookId === normalizedDrama.bookId &&
            d.provider === normalizedDrama.provider
        );
        if (exists) {
          pushToast(`Removed "${normalizedDrama.title}"`, 'neutral');
          return prev.filter(
            (d) =>
              !(
                d.bookId === normalizedDrama.bookId &&
                d.provider === normalizedDrama.provider
              )
          );
        }
        if (folderId && folderId !== 'all') {
          setItemFolderMap((m) => ({ ...m, [key]: folderId }));
        }
        pushToast(`Saved "${normalizedDrama.title}" to Drama Watchlist`, 'gold');
        return [normalizedDrama, ...prev];
      });

      if (activeUser?.uid) {
        void fetch('/api/favorites/toggle', {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userId: activeUser.uid,
            dramaId: normalizedDrama.bookId,
            provider: normalizedDrama.provider,
            mediaType: 'drama',
            folderId,
            title: normalizedDrama.title,
            cover: normalizedDrama.cover,
            drama: normalizedDrama,
          }),
        }).catch(() => {});
      }
    },
    [getAuthHeaders, pushToast]
  );

  const toggleMyList = useCallback(
    (drama: DramaItem, folderId = 'all') => {
      if (isMovieMedia(drama)) {
        if (!user) {
          openAuthModal(
            TRANSLATIONS[language].auth.gateWatchlistReason,
            (signedInUser) => {
              executeToggleMovieWatchlist(signedInUser, drama, folderId);
            }
          );
          return;
        }
        executeToggleMovieWatchlist(user, drama, folderId);
        return;
      }

      executeToggleDramaWatchlist(drama, folderId, user);
    },
    [
      user,
      language,
      openAuthModal,
      executeToggleMovieWatchlist,
      executeToggleDramaWatchlist,
    ]
  );

  const movieWatchlistItems = useMemo(
    () => (user ? movieListItemsRaw.filter((d) => isMovieMedia(d)) : []),
    [user, movieListItemsRaw]
  );

  const dramaWatchlistItems = useMemo(
    () => dramaListItems.filter((d) => !isMovieMedia(d)),
    [dramaListItems]
  );

  const myListItems = useMemo(
    () => [...movieWatchlistItems, ...dramaWatchlistItems],
    [movieWatchlistItems, dramaWatchlistItems]
  );

  const isDramaSaved = useCallback(
    (bookId: string, provider?: MediaProviderName) => {
      return myListItems.some(
        (d) => d.bookId === bookId && (!provider || d.provider === provider)
      );
    },
    [myListItems]
  );

  const isDramaLiked = useCallback(
    (bookId: string, provider: MediaProviderName = 'DramaBoxV2') =>
      likedDramaIds.includes(makeItemKey(bookId, provider)),
    [likedDramaIds]
  );

  const getDramaLikesCount = useCallback(
    (bookId: string, provider: MediaProviderName = 'DramaBoxV2') => {
      const key = makeItemKey(bookId, provider);
      if (typeof likesCountMap[key] === 'number') {
        return likesCountMap[key];
      }
      return liveBadgeMap[key]?.likesCount ?? 0;
    },
    [likesCountMap, liveBadgeMap]
  );

  const refreshDramaStats = useCallback(
    async (bookId: string, provider: MediaProviderName = 'DramaBoxV2') => {
      if (!bookId) return;
      const actorId = user?.uid || visitorId;
      const normalizedProv = normalizeMediaProviderName(provider, 'DramaBoxV2');
      const key = makeItemKey(bookId, normalizedProv);
      try {
        const res = await fetch(
          `/api/stats?dramaId=${encodeURIComponent(bookId)}&provider=${encodeURIComponent(
            normalizedProv
          )}&userId=${encodeURIComponent(actorId)}`,
          {
            credentials: 'include',
            headers: getAuthHeaders(),
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          stats?: {
            dailyViews?: number;
            totalViews?: number;
            likesCount?: number;
            commentsCount?: number;
            userLiked?: boolean;
          };
        };
        if (!data.ok || !data.stats) return;
        const count = Math.max(0, Number(data.stats.likesCount) || 0);
        setLikesCountMap((prev) => ({ ...prev, [key]: count }));
        setLiveBadgeMap((prev) => ({
          ...prev,
          [key]: {
            dailyViews:
              typeof data.stats?.dailyViews === 'number'
                ? data.stats.dailyViews
                : prev[key]?.dailyViews ?? 0,
            totalViews:
              typeof data.stats?.totalViews === 'number'
                ? data.stats.totalViews
                : prev[key]?.totalViews ?? 0,
            likesCount: count,
            commentsCount:
              typeof data.stats?.commentsCount === 'number'
                ? data.stats.commentsCount
                : prev[key]?.commentsCount ?? 0,
            trendBadge: prev[key]?.trendBadge,
          },
        }));
        if (typeof data.stats.userLiked === 'boolean') {
          const remoteLiked = data.stats.userLiked;
          setLikedDramaIds((prev) => {
            const has = prev.includes(key);
            if (remoteLiked && !has) return [key, ...prev];
            if (!remoteLiked && has) return prev.filter((k) => k !== key);
            return prev;
          });
        }
      } catch {
        // Keep existing state gracefully
      }
    },
    [user?.uid, visitorId]
  );

  const toggleLikeDrama = useCallback(
    (drama: DramaItem) => {
      const actorId = user?.uid || visitorId;
      const key = makeItemKey(drama.bookId, drama.provider);
      const wasLiked = likedDramaIdsRef.current.includes(key);
      const prevCount =
        likesCountMapRef.current[key] ?? liveBadgeMap[key]?.likesCount ?? 0;
      const optimisticLiked = !wasLiked;
      const optimisticCount = optimisticLiked
        ? prevCount + 1
        : Math.max(0, prevCount - 1);

      setLikedDramaIds((prev) =>
        optimisticLiked
          ? prev.includes(key)
            ? prev
            : [key, ...prev]
          : prev.filter((k) => k !== key)
      );
      setLikesCountMap((prev) => ({ ...prev, [key]: optimisticCount }));

      pushToast(
        optimisticLiked ? `Liked "${drama.title}"` : `Unliked "${drama.title}"`,
        optimisticLiked ? 'gold' : 'neutral'
      );

      if (optimisticLiked && user?.uid && isMovieMedia(drama)) {
        const movieItem: DramaItem = { ...drama, mediaType: 'movie' };
        setMovieListItemsRaw((listPrev) => {
          const alreadySaved = listPrev.some(
            (d) =>
              d.bookId === movieItem.bookId &&
              d.provider === movieItem.provider
          );
          return alreadySaved ? listPrev : [movieItem, ...listPrev];
        });
        void fetch('/api/favorites/toggle', {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userId: user.uid,
            dramaId: movieItem.bookId,
            provider: movieItem.provider,
            mediaType: 'movie',
            folderId: 'all',
            title: movieItem.title,
            cover: movieItem.cover,
            drama: movieItem,
            forceSave: true,
          }),
        }).catch(() => {});
      }

      void fetch('/api/likes/toggle', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: actorId,
          dramaId: drama.bookId,
          provider: drama.provider,
          mediaType: isMovieMedia(drama) ? 'movie' : 'drama',
        }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Like toggle request failed');
          const result = (await res.json()) as {
            ok?: boolean;
            liked?: boolean;
            likesCount?: number;
          };
          if (typeof result.liked === 'boolean') {
            const serverLiked = result.liked;
            setLikedDramaIds((prev) => {
              const has = prev.includes(key);
              if (serverLiked && !has) return [key, ...prev];
              if (!serverLiked && has) return prev.filter((k) => k !== key);
              return prev;
            });
          }
          if (typeof result.likesCount === 'number') {
            const serverCount = Math.max(0, result.likesCount);
            setLikesCountMap((prev) => ({ ...prev, [key]: serverCount }));
            setLiveBadgeMap((prev) =>
              prev[key]
                ? { ...prev, [key]: { ...prev[key], likesCount: serverCount } }
                : prev
            );
          }
        })
        .catch(() => {
          setLikedDramaIds((prev) => {
            const has = prev.includes(key);
            if (wasLiked && !has) return [key, ...prev];
            if (!wasLiked && has) return prev.filter((k) => k !== key);
            return prev;
          });
          setLikesCountMap((prev) => ({ ...prev, [key]: prevCount }));
          pushToast('Failed to sync like to server', 'neutral');
        });
    },
    [user?.uid, visitorId, liveBadgeMap, pushToast]
  );

  const toggleDramaCompleted = useCallback(
    (bookId: string, provider: MediaProviderName) => {
      const key = makeItemKey(bookId, provider);
      setCompletedDramaIds((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    },
    []
  );

  const getDramaWatchStatus = useCallback(
    (drama: DramaItem): Exclude<WatchStatusFilter, 'all'> => {
      const key = makeItemKey(drama.bookId, drama.provider);
      if (completedDramaIds.includes(key)) return 'completed';
      const watchedEps = watchedMap[key] ?? [];
      if (
        drama.chapterCount > 1 &&
        watchedEps.length >= drama.chapterCount
      ) {
        return 'completed';
      }
      const hasHistory = watchHistory.some(
        (h) => h.bookId === drama.bookId && h.provider === drama.provider
      );
      if (hasHistory || watchedEps.length > 0) return 'watching';
      return 'plan';
    },
    [completedDramaIds, watchedMap, watchHistory]
  );

  const createWatchlistFolder = useCallback(
    (name: string): WatchlistFolder | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const id = `folder-${Date.now().toString(36)}`;
      const folder: WatchlistFolder = { id, name: trimmed, isDefault: false };
      setWatchlistFolders((prev) => [...prev, folder]);
      pushToast(`Created folder "${trimmed}"`, 'gold');
      return folder;
    },
    [pushToast]
  );

  const deleteWatchlistFolder = useCallback((folderId: string) => {
    setWatchlistFolders((prev) =>
      prev.filter((f) => f.id !== folderId || f.isDefault)
    );
    setItemFolderMap((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === folderId) delete next[k];
      }
      return next;
    });
  }, []);

  const assignDramaToFolder = useCallback(
    (bookId: string, provider: MediaProviderName, folderId: string) => {
      const key = makeItemKey(bookId, provider);
      setItemFolderMap((prev) => {
        const next = { ...prev };
        if (folderId === 'all') {
          delete next[key];
        } else {
          next[key] = folderId;
        }
        return next;
      });
      if (user?.uid) {
        void fetch('/api/favorites/folder', {
          method: 'PATCH',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userId: user.uid,
            dramaId: bookId,
            provider,
            folderId,
          }),
        }).catch(() => {});
      }
    },
    [getAuthHeaders, user]
  );

  const getDramaFolderId = useCallback(
    (bookId: string, provider: MediaProviderName) => {
      return itemFolderMap[makeItemKey(bookId, provider)] ?? 'all';
    },
    [itemFolderMap]
  );

  const recordWatchProgress = useCallback(
    (
      drama: DramaItem,
      episode: number,
      currentTime = 0,
      duration = 0,
      immediate = false,
      playbackState?: {
        isPlaying?: boolean;
        isBuffering?: boolean;
        playbackRate?: number;
      }
    ) => {
      const pct =
        duration > 0
          ? Math.min(100, Math.max(5, Math.round((currentTime / duration) * 100)))
          : Math.min(
              92,
              Math.max(
                12,
                Math.round((episode / Math.max(1, drama.chapterCount)) * 100) +
                  10
              )
            );

      const epSessionKey = makeEpisodeKey(drama.bookId, drama.provider, episode);
      if (!countedEpisodesSessionRef.current.has(epSessionKey)) {
        countedEpisodesSessionRef.current.add(epSessionKey);
        setEpisodesWatchedCount((c) => c + 1);
        const dramaKey = makeItemKey(drama.bookId, drama.provider);
        setLiveBadgeMap((prev) => {
          const cur = prev[dramaKey];
          const nextDaily = (cur?.dailyViews ?? drama.dailyViews ?? 0) + 1;
          const nextTotal = (cur?.totalViews ?? drama.totalViews ?? 0) + 1;
          return {
            ...prev,
            [dramaKey]: {
              dailyViews: nextDaily,
              totalViews: nextTotal,
              trendBadge: cur?.trendBadge || 'HOT',
            },
          };
        });
        void fetch('/api/stats/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dramaId: drama.bookId,
            provider: drama.provider,
            episodeNumber: episode,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { siteTotalViews?: number } | null) => {
            if (
              data &&
              typeof data.siteTotalViews === 'number' &&
              typeof window !== 'undefined'
            ) {
              window.dispatchEvent(
                new CustomEvent('kd:view-recorded', {
                  detail: { siteTotalViews: data.siteTotalViews },
                })
              );
            }
            void refreshLiveBadges();
          })
          .catch(() => {});
      }

      if (user) {
        const today = getLocalDateKey();
        if (streak.lastVisitDate !== today) {
          void syncUserStreak(user);
        }
      }

      const key = makeItemKey(drama.bookId, drama.provider);
      setWatchedMap((prev) => {
        const existingList = prev[key] ?? [];
        if (existingList.includes(episode)) return prev;
        return {
          ...prev,
          [key]: [...existingList, episode],
        };
      });

      let resolvedTime = Math.max(0, Math.floor(currentTime));
      let resolvedDuration = Math.max(0, Math.floor(duration));

      setWatchHistory((prev) => {
        const existing = prev.find(
          (item) =>
            item.bookId === drama.bookId && item.provider === drama.provider
        );
        const safeTime =
          currentTime > 0
            ? Math.floor(currentTime)
            : existing && existing.episode === episode
            ? existing.currentTime
            : 0;
        const safeDuration =
          duration > 0
            ? Math.floor(duration)
            : existing && existing.episode === episode
            ? existing.duration
            : 0;

        resolvedTime = safeTime;
        resolvedDuration = safeDuration;

        const filtered = prev.filter(
          (item) =>
            !(item.bookId === drama.bookId && item.provider === drama.provider)
        );
        return [
          {
            bookId: drama.bookId,
            provider: drama.provider,
            title: drama.title,
            cover: drama.cover,
            drama,
            episode,
            currentTime: safeTime,
            duration: safeDuration,
            progress: pct,
            updatedAt: Date.now(),
          },
          ...filtered,
        ].slice(0, 24);
      });

      // Cloud sync watch_history to PostgreSQL (throttled every 4.5s or immediate on close/pause/switch)
      const nowMs = Date.now();
      const lastSync = lastHistoryPostRef.current[key];
      if (immediate || !lastSync || lastSync.ep !== episode || nowMs - lastSync.at >= 4500) {
        lastHistoryPostRef.current[key] = { at: nowMs, ep: episode };
        const actorId = user?.uid || visitorId;
        void fetch('/api/watch-history', {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userId: actorId,
            dramaId: drama.bookId,
            provider: drama.provider,
            mediaType:
              drama.mediaType ??
              (drama.provider === 'LK21' || drama.provider === 'LookSeries'
                ? 'movie'
                : 'drama'),
            episodeNumber: episode,
            currentTime: resolvedTime,
            duration: resolvedDuration,
            progress: pct,
            drama,
          }),
        }).catch(() => {});
      }

      // Server-issued Watch Session + Heartbeat (15s interval -> exact 60s minute crediting)
      if (user && typeof document !== 'undefined') {
        const tabVisible = !document.hidden;
        const videos = Array.from(document.querySelectorAll('video'));
        const activeVideo =
          videos.find((v) => !v.paused && !v.ended) || videos[0] || null;
        const isPlaying =
          typeof playbackState?.isPlaying === 'boolean'
            ? playbackState.isPlaying
            : activeVideo
            ? !activeVideo.paused && !activeVideo.ended
            : false;
        const isBuffering = Boolean(playbackState?.isBuffering);
        const playbackRate =
          typeof playbackState?.playbackRate === 'number'
            ? playbackState.playbackRate
            : activeVideo
            ? Number(activeVideo.playbackRate) || 1
            : 1;
        const isNewMedia = lastWatchHeartbeatMediaRef.current !== epSessionKey;
        const elapsedSinceHb = nowMs - lastWatchHeartbeatSentAtRef.current;
        const exactVideoTime =
          currentTime > 0
            ? Math.round(currentTime * 100) / 100
            : resolvedTime;
        const canFlushEndingSegment =
          immediate &&
          !isNewMedia &&
          watchSessionTokenRef.current?.mediaKey === epSessionKey &&
          exactVideoTime > 0 &&
          elapsedSinceHb >= 12_500;
        const shouldSendRegularHb =
          !immediate &&
          isPlaying &&
          (isNewMedia || elapsedSinceHb >= 15_000);

        if (
          tabVisible &&
          !isBuffering &&
          playbackRate >= 0.75 &&
          playbackRate <= 1.15 &&
          (shouldSendRegularHb || canFlushEndingSegment)
        ) {
          const prevHbMedia = lastWatchHeartbeatMediaRef.current;
          const prevHbSentAt = lastWatchHeartbeatSentAtRef.current;
          lastWatchHeartbeatMediaRef.current = epSessionKey;
          lastWatchHeartbeatSentAtRef.current = nowMs;

          void (async () => {
            const sessionToken = await ensureWatchSessionToken(
              drama.bookId,
              drama.provider,
              episode
            );
            if (!sessionToken || !watchSessionTokenRef.current) {
              if (lastWatchHeartbeatMediaRef.current === epSessionKey) {
                lastWatchHeartbeatMediaRef.current = prevHbMedia;
                lastWatchHeartbeatSentAtRef.current = prevHbSentAt;
              }
              return;
            }
            watchSessionTokenRef.current.seq += 1;
            const seq = watchSessionTokenRef.current.seq;

            const res = await fetch('/api/watch/heartbeat', {
              method: 'POST',
              credentials: 'include',
              headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                sessionToken,
                streamSessionId: watchStreamSessionIdRef.current,
                seq,
                dramaId: drama.bookId,
                provider: drama.provider,
                episodeNumber: episode,
                currentTimeSec: exactVideoTime,
                isPlaying: canFlushEndingSegment ? true : isPlaying,
                isBuffering,
                tabVisible,
                playbackRate,
                deviceFingerprint: getClientDeviceFingerprint(),
              }),
            });

            const hb = (await res.json().catch(() => null)) as {
              ok?: boolean;
              reason?: string;
              error?: string;
              verifiedWatchSeconds?: number;
              todayWatchSeconds?: number;
              awardedWatchPoints?: number;
              todayWatchPointsEarned?: number;
              dailyMissionMaxWatchSeconds?: number;
              pointsBalance?: number | null;
              referralQualified?: boolean;
              levelInfo?: {
                level: number;
                tierId: 'bronze' | 'silver' | 'gold' | 'platinum';
                tierName: string;
                multiplier: number;
                bonusPercent: number;
                watchMinutePoints: number;
                dailyCheckinPoints: number;
                dailyCheckinDay7Points?: number;
                dailyMissionMilestones: Array<{ minutes: number; bonusPoints: number }>;
                progressPercent: number;
              };
            } | null;

            if (res.status === 503) {
              setPointsDbConnected(false);
              setPointsDbError(
                hb?.error || 'Database PostgreSQL belum terhubung (periksa DATABASE_URL).'
              );
              return;
            }
            if (
              res.status === 401 ||
              hb?.reason === 'invalid_session' ||
              hb?.reason === 'session_expired'
            ) {
              watchSessionTokenRef.current = null;
              if (lastWatchHeartbeatMediaRef.current === epSessionKey) {
                lastWatchHeartbeatMediaRef.current = prevHbMedia;
                lastWatchHeartbeatSentAtRef.current = prevHbSentAt;
              }
              return;
            }
            if (hb) {
              setPointsDbConnected(true);
              setPointsDbError(null);
              if (hb.reason === 'session_started') {
                lastWatchHeartbeatSentAtRef.current = Math.max(
                  lastWatchHeartbeatSentAtRef.current,
                  Date.now()
                );
              }
              if (typeof hb.todayWatchSeconds === 'number') {
                setTodayWatchSeconds(Math.max(0, Math.floor(hb.todayWatchSeconds)));
              }
              if (typeof hb.todayWatchPointsEarned === 'number') {
                setTodayWatchPointsEarned(
                  Math.max(0, Math.floor(hb.todayWatchPointsEarned))
                );
              }
              if (
                typeof hb.dailyMissionMaxWatchSeconds === 'number' &&
                hb.dailyMissionMaxWatchSeconds > 0
              ) {
                setDailyMissionMaxWatchSeconds(
                  Math.floor(hb.dailyMissionMaxWatchSeconds)
                );
              }
              if (hb.levelInfo) {
                setAccountLevelInfo(hb.levelInfo);
                if (
                  typeof hb.levelInfo.watchMinutePoints === 'number' &&
                  hb.levelInfo.watchMinutePoints > 0
                ) {
                  setWatchMinutePoints(Math.floor(hb.levelInfo.watchMinutePoints));
                }
                if (
                  Array.isArray(hb.levelInfo.dailyMissionMilestones) &&
                  hb.levelInfo.dailyMissionMilestones.length > 0
                ) {
                  setDailyMissionMilestones(hb.levelInfo.dailyMissionMilestones);
                }
              }
              if (typeof hb.pointsBalance === 'number') {
                setPointsBalance(Math.max(0, Math.floor(hb.pointsBalance)));
              }
              const awardedWatch =
                typeof hb.awardedWatchPoints === 'number' && hb.awardedWatchPoints > 0
                  ? hb.awardedWatchPoints
                  : 0;
              if (awardedWatch > 0) {
                const watchedMins =
                  typeof hb.todayWatchSeconds === 'number'
                    ? Math.floor(hb.todayWatchSeconds / 60)
                    : 0;
                const autoLabel =
                  language === 'id'
                    ? `+${awardedWatch.toLocaleString()} ${TRANSLATIONS[language].rewards.pointsUnit} nonton (${watchedMins}m)`
                    : `+${awardedWatch.toLocaleString()} ${TRANSLATIONS[language].rewards.pointsUnit} (${watchedMins}m)`;
                pushToast(autoLabel, 'gold');
              }
              if (awardedWatch > 0 || hb.referralQualified) {
                void refreshPointsBalance();
              }
              if (
                typeof window !== 'undefined' &&
                typeof hb.verifiedWatchSeconds === 'number'
              ) {
                window.dispatchEvent(
                  new CustomEvent('kd:points-updated', {
                    detail: {
                      source: 'watch_heartbeat',
                      verifiedWatchSeconds: hb.verifiedWatchSeconds,
                      todayWatchSeconds: hb.todayWatchSeconds,
                      awardedWatchPoints: awardedWatch,
                      todayWatchPointsEarned: hb.todayWatchPointsEarned,
                      pointsBalance: hb.pointsBalance,
                      referralQualified: Boolean(hb.referralQualified),
                    },
                  })
                );
              }
            }
          })().catch(() => {
            if (lastWatchHeartbeatMediaRef.current === epSessionKey) {
              lastWatchHeartbeatMediaRef.current = prevHbMedia;
              lastWatchHeartbeatSentAtRef.current = prevHbSentAt;
            }
          });
        }
      }
    },
    [
      user,
      visitorId,
      streak.lastVisitDate,
      syncUserStreak,
      refreshLiveBadges,
      ensureWatchSessionToken,
      getAuthHeaders,
      refreshPointsBalance,
      pushToast,
      language,
    ]
  );

  const getDramaLiveStats = useCallback(
    (bookId: string, provider: MediaProviderName = 'DramaBoxV2') => {
      return liveBadgeMap[makeItemKey(bookId, provider)] ?? null;
    },
    [liveBadgeMap]
  );

  const removeHistoryItem = useCallback(
    (bookId: string, provider?: MediaProviderName) => {
      setWatchHistory((prev) =>
        prev.filter(
          (item) =>
            !(
              item.bookId === bookId &&
              (!provider || item.provider === provider)
            )
        )
      );
      const actorId = user?.uid || visitorId;
      const params = new URLSearchParams({
        userId: actorId,
        dramaId: bookId,
      });
      if (provider) params.set('provider', provider);
      void fetch(`/api/watch-history?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).catch(() => {});
    },
    [getAuthHeaders, user, visitorId]
  );

  const getResumePoint = useCallback(
    (bookId: string, provider?: MediaProviderName) => {
      const found = watchHistory.find(
        (h) => h.bookId === bookId && (!provider || h.provider === provider)
      );
      if (!found) return null;
      return {
        episode: found.episode,
        currentTime: found.currentTime,
        progress: found.progress,
      };
    },
    [watchHistory]
  );

  const getWatchedEpisodes = useCallback(
    (bookId: string, provider: MediaProviderName) => {
      return watchedMap[makeItemKey(bookId, provider)] ?? [];
    },
    [watchedMap]
  );

  const getDramaRating = useCallback(
    (bookId: string, provider: MediaProviderName) => {
      return ratingsMap[makeItemKey(bookId, provider)] ?? 0;
    },
    [ratingsMap]
  );

  const setDramaRating = useCallback(
    (bookId: string, provider: MediaProviderName, stars: number) => {
      const safe = Math.min(5, Math.max(1, Math.round(stars)));
      setRatingsMap((prev) => ({
        ...prev,
        [makeItemKey(bookId, provider)]: safe,
      }));
      pushToast(`Rated ${safe}/5 stars`, 'gold');
    },
    [pushToast]
  );

  const getEpisodeReactions = useCallback(
    (
      bookId: string,
      provider: MediaProviderName,
      episode: number
    ): Record<ReactionKey, number> => {
      const existing = reactionsMap[makeEpisodeKey(bookId, provider, episode)];
      return (
        existing ?? {
          plotTwist: 0,
          baper: 0,
          emosi: 0,
          romantis: 0,
        }
      );
    },
    [reactionsMap]
  );

  const addEpisodeReaction = useCallback(
    (
      bookId: string,
      provider: MediaProviderName,
      episode: number,
      key: ReactionKey
    ) => {
      const tCur = TRANSLATIONS[language];
      void requireAuth(tCur.auth.gateCommentReason, () => {
        const epKey = makeEpisodeKey(bookId, provider, episode);
        setReactionsMap((prev) => {
          const current = prev[epKey] ?? {
            plotTwist: 0,
            baper: 0,
            emosi: 0,
            romantis: 0,
          };
          return {
            ...prev,
            [epKey]: {
              ...current,
              [key]: current[key] + 1,
            },
          };
        });
      });
    },
    [language, requireAuth]
  );

  const syncEpisodeComments = useCallback(
    async (bookId: string, provider: MediaProviderName, episode: number) => {
      const epKey = makeEpisodeKey(bookId, provider, episode);
      try {
        const params = new URLSearchParams({
          dramaId: bookId,
          provider,
          episode: String(episode),
          limit: '40',
          offset: '0',
        });
        const res = await fetch(`/api/comments?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          comments?: EpisodeComment[];
        };
        const remoteComments = Array.isArray(json.comments)
          ? json.comments.map((c) => ({
              ...c,
              authorInitials: c.authorInitials || buildInitials(c.author || 'Viewer'),
              authorColor: c.authorColor || '#EF4444',
              videoTimestampSec:
                typeof c.videoTimestampSec === 'number' ? c.videoTimestampSec : 0,
            }))
          : [];
        if (remoteComments.length === 0) return;

        setCommentsMap((prev) => {
          const localOnly = (prev[epKey] ?? []).filter(
            (lc) => !remoteComments.some((rc) => rc.id === lc.id)
          );
          const merged = [...remoteComments, ...localOnly]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 40);
          return { ...prev, [epKey]: merged };
        });
      } catch {
        // Local cache remains active if API call fails
      }
    },
    []
  );

  const getEpisodeComments = useCallback(
    (bookId: string, provider: MediaProviderName, episode: number) => {
      return commentsMap[makeEpisodeKey(bookId, provider, episode)] ?? [];
    },
    [commentsMap]
  );

  const addEpisodeComment = useCallback(
    async (
      bookId: string,
      provider: MediaProviderName,
      episode: number,
      text: string,
      videoTimestampSec = 0
    ): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const tCur = TRANSLATIONS[language];
      const safeTimestamp = Math.max(0, Math.floor(Number(videoTimestampSec) || 0));

      const commitComment = async (activeUser: GoogleUser) => {
        const epKey = makeEpisodeKey(bookId, provider, episode);
        const commentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const badge = streak.isVipCoffeeLover ? 'VIP Kano Lover' : undefined;

        const comment: EpisodeComment = {
          id: commentId,
          authorUid: activeUser.uid,
          author: activeUser.displayName,
          authorEmail: activeUser.email,
          authorPhotoURL: activeUser.photoURL,
          authorBadge: badge,
          authorInitials: activeUser.avatarInitials,
          authorColor: activeUser.avatarColor,
          text: trimmed.slice(0, 240),
          videoTimestampSec: safeTimestamp,
          createdAt: Date.now(),
        };

        setCommentsMap((prev) => ({
          ...prev,
          [epKey]: [comment, ...(prev[epKey] ?? [])].slice(0, 40),
        }));

        try {
          await fetch('/api/comments', {
            method: 'POST',
            credentials: 'include',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              id: commentId,
              dramaId: bookId,
              provider,
              episodeNumber: episode,
              userId: activeUser.uid,
              authorName: activeUser.displayName.slice(0, 120),
              authorEmail: activeUser.email,
              authorPhotoURL: activeUser.photoURL,
              authorBadge: badge,
              authorInitials: activeUser.avatarInitials,
              authorColor: activeUser.avatarColor,
              text: trimmed.slice(0, 240),
              videoTimestampSec: safeTimestamp,
            }),
          });
        } catch {
          // Keep optimistic local comment cleanly
        }
      };

      if (!user) {
        let didCommit = false;
        await requireAuth(tCur.auth.gateCommentReason, (signedInUser) => {
          didCommit = true;
          void commitComment(signedInUser);
        });
        return didCommit;
      }

      await commitComment(user);
      return true;
    },
    [getAuthHeaders, language, user, streak, requireAuth]
  );

  const isEpisodeUnlocked = useCallback(
    (bookId: string, provider: MediaProviderName, episode: number) => {
      if (episode <= 10) return true;
      return unlockedVipList.includes(makeEpisodeKey(bookId, provider, episode));
    },
    [unlockedVipList]
  );

  const unlockVipEpisode = useCallback(
    (bookId: string, provider: MediaProviderName, episode: number) => {
      const epKey = makeEpisodeKey(bookId, provider, episode);
      setUnlockedVipList((prev) =>
        prev.includes(epKey) ? prev : [...prev, epKey]
      );
      pushToast(`EP ${episode} unlocked free! Enjoy watching`, 'gold');
    },
    [pushToast]
  );

  const addRecentSearch = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    setRecentSearches((prev) =>
      [
        trimmed,
        ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, 8)
    );
  }, []);

  const removeRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) =>
      prev.filter((item) => item.toLowerCase() !== keyword.toLowerCase())
    );
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  const myListIds = useMemo(
    () => myListItems.map((d) => `${d.provider}:${d.bookId}`),
    [myListItems]
  );

  const t = TRANSLATIONS[language];

  const value = useMemo(
    () => ({
      language,
      languagePreference,
      t,
      setLanguageState,
      setLanguagePreference,
      syncLanguageFromContent,
      user,
      authLoading,
      authError,
      authModalOpen,
      authPromptReason,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      registerAccountWithEmail,
      completeGoogleSignIn,
      signOut,
      requireAuth,
      gmailLoginCount,
      refreshGmailLoginCount,
      pointsBalance,
      pointsDbConnected,
      pointsDbError,
      todayWatchSeconds,
      todayWatchPointsEarned,
      dailyMissionMaxWatchSeconds,
      watchMinutePoints,
      dailyMissionMilestones,
      dailyMissionStatuses,
      accountLevelInfo,
      pointsPerUsd,
      refreshPointsBalance,
      getAuthHeaders,
      visitorId,
      updateUserProfile,
      loadUserCommentHistory,
      streak,
      helpModalOpen,
      setHelpModalOpen,
      accentTheme,
      setAccentTheme,
      highContrast,
      setHighContrast,
      subtitleStyle,
      setSubtitleStyle,
      myListItems,
      dramaWatchlistItems,
      movieWatchlistItems,
      myListIds,
      toggleMyList,
      isDramaSaved,
      likedDramaIds,
      isDramaLiked,
      getDramaLikesCount,
      refreshDramaStats,
      toggleLikeDrama,
      completedDramaIds,
      toggleDramaCompleted,
      getDramaWatchStatus,
      watchlistFolders,
      itemFolderMap,
      createWatchlistFolder,
      deleteWatchlistFolder,
      assignDramaToFolder,
      getDramaFolderId,
      watchHistory,
      recordWatchProgress,
      removeHistoryItem,
      getResumePoint,
      getWatchedEpisodes,
      getDramaRating,
      setDramaRating,
      getEpisodeReactions,
      addEpisodeReaction,
      syncEpisodeComments,
      getEpisodeComments,
      addEpisodeComment,
      isEpisodeUnlocked,
      unlockVipEpisode,
      recentSearches,
      addRecentSearch,
      removeRecentSearch,
      clearRecentSearches,
      episodesWatchedCount,
      toasts,
      pushToast,
      dismissToast,
      getDramaLiveStats,
    }),
    [
      language,
      languagePreference,
      t,
      setLanguageState,
      setLanguagePreference,
      syncLanguageFromContent,
      user,
      authLoading,
      authError,
      authModalOpen,
      authPromptReason,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      registerAccountWithEmail,
      completeGoogleSignIn,
      signOut,
      requireAuth,
      gmailLoginCount,
      refreshGmailLoginCount,
      pointsBalance,
      pointsDbConnected,
      pointsDbError,
      todayWatchSeconds,
      todayWatchPointsEarned,
      dailyMissionMaxWatchSeconds,
      watchMinutePoints,
      dailyMissionMilestones,
      dailyMissionStatuses,
      accountLevelInfo,
      pointsPerUsd,
      refreshPointsBalance,
      getAuthHeaders,
      visitorId,
      updateUserProfile,
      loadUserCommentHistory,
      streak,
      helpModalOpen,
      accentTheme,
      setAccentTheme,
      highContrast,
      setHighContrast,
      subtitleStyle,
      setSubtitleStyle,
      myListItems,
      dramaWatchlistItems,
      movieWatchlistItems,
      myListIds,
      toggleMyList,
      isDramaSaved,
      likedDramaIds,
      isDramaLiked,
      getDramaLikesCount,
      refreshDramaStats,
      toggleLikeDrama,
      completedDramaIds,
      toggleDramaCompleted,
      getDramaWatchStatus,
      watchlistFolders,
      itemFolderMap,
      createWatchlistFolder,
      deleteWatchlistFolder,
      assignDramaToFolder,
      getDramaFolderId,
      watchHistory,
      recordWatchProgress,
      removeHistoryItem,
      getResumePoint,
      getWatchedEpisodes,
      getDramaRating,
      setDramaRating,
      getEpisodeReactions,
      addEpisodeReaction,
      syncEpisodeComments,
      getEpisodeComments,
      addEpisodeComment,
      isEpisodeUnlocked,
      unlockVipEpisode,
      recentSearches,
      addRecentSearch,
      removeRecentSearch,
      clearRecentSearches,
      episodesWatchedCount,
      toasts,
      pushToast,
      dismissToast,
      getDramaLiveStats,
    ]
  );

  return (
    <DramaContext.Provider value={value}>{children}</DramaContext.Provider>
  );
};

export function useDramaContext(): DramaContextValue {
  const ctx = useContext(DramaContext);
  if (!ctx) {
    throw new Error('useDramaContext must be used inside <DramaProvider>');
  }
  return ctx;
}
