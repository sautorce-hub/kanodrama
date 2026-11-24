import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  signInWithRealGoogle,
  signOutRealGoogle,
} from '../config/auth';
import { setActiveAppLanguage } from '../services/dramaProviders';
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
  if (parts.length === 0) return 'HD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterdayDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateKey(d);
}

function mapFirebaseUser(fbUser: FirebaseUser): GoogleUser {
  const email =
    fbUser.email?.trim() ||
    fbUser.providerData?.find((p) => Boolean(p?.email))?.email?.trim() ||
    '';
  const displayName =
    fbUser.displayName?.trim() ||
    email.split('@')[0] ||
    'Kano Viewer';
  const color =
    AVATAR_COLORS[
      Math.abs(
        (email || fbUser.uid)
          .split('')
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      ) % AVATAR_COLORS.length
    ];
  return {
    uid: fbUser.uid,
    displayName,
    email,
    photoURL: fbUser.photoURL || null,
    avatarInitials: buildInitials(displayName),
    avatarColor: color,
    signedInAt: Date.now(),
  };
}

function computeNextStreak(prev: DailyStreakState): DailyStreakState {
  const today = getLocalDateKey();
  const yesterday = getYesterdayDateKey();
  if (prev.lastVisitDate === today && prev.count >= 1) {
    return {
      count: prev.count,
      lastVisitDate: today,
      isVipCoffeeLover: prev.count >= 3,
    };
  }
  const nextCount =
    prev.lastVisitDate === yesterday ? Math.max(2, prev.count + 1) : 1;
  return {
    count: nextCount,
    lastVisitDate: today,
    isVipCoffeeLover: nextCount >= 3,
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
  signOut: () => Promise<void>;
  requireAuth: (reason: string, action: (u: GoogleUser) => void) => Promise<void>;
  gmailLoginCount: number;
  refreshGmailLoginCount: () => Promise<number>;
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
    immediate?: boolean
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

function makeItemKey(bookId: string, provider: MediaProviderName = 'DramaBox') {
  return `${provider}:${bookId}`;
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

function streakStorageKey(uid: string): string {
  return `kano_drama_streak_v1_${uid}`;
}

function legacyStreakStorageKey(uid: string): string {
  return `coffee_drama_streak_v1_${uid}`;
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
    const existing = localStorage.getItem('hd_visitor_id');
    if (existing && existing.trim()) return existing.trim();
    const next = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('hd_visitor_id', next);
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
  const popupLoginInFlightRef = useRef<boolean>(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

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
              const prov: MediaProviderName =
                entry.provider || entry.drama?.provider || 'DramaBox';
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

  // Sync user's daily streak & profile to PostgreSQL (/api/users/sync) with localStorage fallback
  const syncUserStreak = useCallback(
    async (
      mappedUser: GoogleUser,
      options?: { isLoginEvent?: boolean }
    ) => {
      const localKey = streakStorageKey(mappedUser.uid);
      const baseStreak = readJsonStorage<DailyStreakState>(
        localKey,
        EMPTY_STREAK,
        legacyStreakStorageKey(mappedUser.uid)
      );

      let resolvedStreak = computeNextStreak(baseStreak);
      const isLoginEvent = Boolean(options?.isLoginEvent);

      try {
        const sendSyncRequest = async (forceRefreshToken: boolean) => {
          const idToken =
            auth.currentUser && auth.currentUser.uid === mappedUser.uid
              ? await auth.currentUser.getIdToken(forceRefreshToken).catch(() => null)
              : null;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (idToken) {
            headers.Authorization = `Bearer ${idToken}`;
          }
          return fetch('/api/users/sync', {
            method: 'POST',
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
            }),
          });
        };

        let res = await sendSyncRequest(false);
        if (res.status === 401 && auth.currentUser && auth.currentUser.uid === mappedUser.uid) {
          res = await sendSyncRequest(true);
        }

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
        // Resilient fallback to computed local streak
      }

      setStreak(resolvedStreak);
      try {
        localStorage.setItem(localKey, JSON.stringify(resolvedStreak));
      } catch {
        // Ignore
      }

      return resolvedStreak;
    },
    [refreshGmailLoginCount]
  );

  // Hydrate Watch History from PostgreSQL (for both signed-in users and guest visitorId)
  const hydrateWatchHistoryFromPostgres = useCallback(async (actorId: string) => {
    if (!actorId) return;
    try {
      const res = await fetch(
        `/api/watch-history?userId=${encodeURIComponent(actorId)}&limit=24`
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
          const prov = (e.provider || 'DramaBox') as MediaProviderName;
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
  }, []);

  // Hydrate authenticated user's Movie & Drama Watchlist, Likes & Watch History from PostgreSQL
  const hydrateUserLibraryFromPostgres = useCallback(
    async (uid: string) => {
      try {
        const cachedUserMovies = readJsonStorage<DramaItem[]>(
          movieWatchlistStorageKey(uid),
          []
        ).filter((d) => d && d.bookId && isMovieMedia(d));

        const [favRes, likeRes] = await Promise.allSettled([
          fetch(`/api/favorites?userId=${encodeURIComponent(uid)}&limit=200`),
          fetch(`/api/likes?userId=${encodeURIComponent(uid)}&limit=100`),
          hydrateWatchHistoryFromPostgres(uid),
        ]);

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
              const prov = (entry.provider || 'LK21') as MediaProviderName;
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
              makeItemKey(l.dramaId, (l.provider || 'DramaBox') as MediaProviderName)
            );
            setLikedDramaIds(remoteKeys);
          }
        }
      } catch {
        // Keep user library gracefully
      }
    },
    [hydrateWatchHistoryFromPostgres]
  );

  // Hydrate likes from PostgreSQL for guest visitorId or signed-in actor
  const hydrateLikesFromPostgres = useCallback(async (actorId: string) => {
    if (!actorId) return;
    try {
      const res = await fetch(
        `/api/likes?userId=${encodeURIComponent(actorId)}&limit=100`
      );
      if (!res.ok) return;
      const likeJson = (await res.json()) as {
        ok?: boolean;
        items?: Array<{ dramaId: string; provider: MediaProviderName }>;
      };
      if (likeJson.ok && Array.isArray(likeJson.items)) {
        const remoteKeys = likeJson.items.map((l) =>
          makeItemKey(l.dramaId, (l.provider || 'DramaBox') as MediaProviderName)
        );
        setLikedDramaIds(remoteKeys);
      }
    } catch {
      // Non-blocking fallback to localStorage likedDramaIds
    }
  }, []);

  // Hydrate guest watch history, global likes & Gmail login count once on mount
  useEffect(() => {
    void hydrateWatchHistoryFromPostgres(visitorId);
    void hydrateLikesFromPostgres(visitorId);
    void refreshGmailLoginCount();
  }, [visitorId, hydrateWatchHistoryFromPostgres, hydrateLikesFromPostgres, refreshGmailLoginCount]);

  // Real Firebase Auth State Listener synced to PostgreSQL
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const mapped = mapFirebaseUser(fbUser);
        setUser(mapped);
        setAuthError(null);
        const cachedUserMovies = readJsonStorage<DramaItem[]>(
          movieWatchlistStorageKey(mapped.uid),
          []
        ).filter((d) => d && d.bookId && isMovieMedia(d));
        if (cachedUserMovies.length > 0) {
          setMovieListItemsRaw(cachedUserMovies);
        }

        if (!popupLoginInFlightRef.current) {
          const fbSignInTime = fbUser.metadata?.lastSignInTime || '';
          const lastSignInStorageKey = `hd_last_gmail_signin_v1:${fbUser.uid}`;
          let isFreshLoginEvent = false;
          try {
            const prevRecorded = localStorage.getItem(lastSignInStorageKey) || '';
            if (fbSignInTime && prevRecorded !== fbSignInTime) {
              isFreshLoginEvent = true;
              localStorage.setItem(lastSignInStorageKey, fbSignInTime);
            }
          } catch {
            // Ignore storage errors
          }
          void syncUserStreak(mapped, { isLoginEvent: isFreshLoginEvent });
        }
        void hydrateUserLibraryFromPostgres(mapped.uid);
      } else {
        setUser(null);
        setStreak(EMPTY_STREAK);
        setMovieListItemsRaw([]);
        void hydrateLikesFromPostgres(visitorId);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [visitorId, syncUserStreak, hydrateUserLibraryFromPostgres, hydrateLikesFromPostgres]);

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
      setAuthPromptReason(reason ?? null);
      pendingAuthCallbackRef.current = onSuccess ?? null;
      setAuthModalOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthPromptReason(null);
    setAuthError(null);
    pendingAuthCallbackRef.current = null;
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<GoogleUser | null> => {
    setAuthError(null);
    setAuthLoading(true);
    popupLoginInFlightRef.current = true;
    try {
      const fbUser = await signInWithRealGoogle();
      const mapped = mapFirebaseUser(fbUser);
      try {
        if (fbUser.metadata?.lastSignInTime) {
          localStorage.setItem(
            `hd_last_gmail_signin_v1:${fbUser.uid}`,
            fbUser.metadata.lastSignInTime
          );
        }
      } catch {
        // Ignore storage errors
      }
      setUser(mapped);
      setAuthModalOpen(false);
      setAuthPromptReason(null);
      await syncUserStreak(mapped, { isLoginEvent: true });
      void hydrateUserLibraryFromPostgres(mapped.uid);
      pushToast(`Signed in as ${mapped.displayName}`, 'gold');
      const cb = pendingAuthCallbackRef.current;
      pendingAuthCallbackRef.current = null;
      if (cb) cb(mapped);
      return mapped;
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
  }, [language, pushToast, syncUserStreak, hydrateUserLibraryFromPostgres]);

  const signOut = useCallback(async () => {
    try {
      await signOutRealGoogle();
    } catch {
      // Ignore
    }
    setUser(null);
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
      // Immediately trigger real Google Sign-In popup; fall back cleanly to modal if blocked
      setAuthError(null);
      setAuthLoading(true);
      popupLoginInFlightRef.current = true;
      try {
        const fbUser = await signInWithRealGoogle();
        const mapped = mapFirebaseUser(fbUser);
        try {
          if (fbUser.metadata?.lastSignInTime) {
            localStorage.setItem(
              `hd_last_gmail_signin_v1:${fbUser.uid}`,
              fbUser.metadata.lastSignInTime
            );
          }
        } catch {
          // Ignore storage errors
        }
        setUser(mapped);
        await syncUserStreak(mapped, { isLoginEvent: true });
        void hydrateUserLibraryFromPostgres(mapped.uid);
        pushToast(`Signed in as ${mapped.displayName}`, 'gold');
        action(mapped);
      } catch {
        setAuthLoading(false);
        openAuthModal(reason, (signedInUser) => action(signedInUser));
        setAuthError(TRANSLATIONS[language].auth.authErrorPopupBlocked);
      } finally {
        popupLoginInFlightRef.current = false;
        setAuthLoading(false);
      }
    },
    [user, language, openAuthModal, pushToast, syncUserStreak, hydrateUserLibraryFromPostgres]
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
        const res = await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
        `/api/comments?userId=${encodeURIComponent(user.uid)}&limit=50`
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
  }, [user]);

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
        headers: { 'Content-Type': 'application/json' },
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
    [pushToast]
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
          headers: { 'Content-Type': 'application/json' },
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
    [pushToast]
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
    (bookId: string, provider: MediaProviderName = 'DramaBox') =>
      likedDramaIds.includes(makeItemKey(bookId, provider)),
    [likedDramaIds]
  );

  const getDramaLikesCount = useCallback(
    (bookId: string, provider: MediaProviderName = 'DramaBox') => {
      const key = makeItemKey(bookId, provider);
      if (typeof likesCountMap[key] === 'number') {
        return likesCountMap[key];
      }
      return liveBadgeMap[key]?.likesCount ?? 0;
    },
    [likesCountMap, liveBadgeMap]
  );

  const refreshDramaStats = useCallback(
    async (bookId: string, provider: MediaProviderName = 'DramaBox') => {
      if (!bookId) return;
      const actorId = user?.uid || visitorId;
      const key = makeItemKey(bookId, provider);
      try {
        const res = await fetch(
          `/api/stats?dramaId=${encodeURIComponent(bookId)}&provider=${encodeURIComponent(
            provider
          )}&userId=${encodeURIComponent(actorId)}`
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
          headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            dramaId: bookId,
            provider,
            folderId,
          }),
        }).catch(() => {});
      }
    },
    [user]
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
      immediate = false
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
                new CustomEvent('hd:view-recorded', {
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
          headers: { 'Content-Type': 'application/json' },
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
    },
    [user, visitorId, streak.lastVisitDate, syncUserStreak, refreshLiveBadges]
  );

  const getDramaLiveStats = useCallback(
    (bookId: string, provider: MediaProviderName = 'DramaBox') => {
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
      }).catch(() => {});
    },
    [user, visitorId]
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
        const localStreak = readJsonStorage<DailyStreakState>(
          streakStorageKey(activeUser.uid),
          streak,
          legacyStreakStorageKey(activeUser.uid)
        );
        const badge =
          streak.isVipCoffeeLover || localStreak.isVipCoffeeLover
            ? 'VIP Kano Lover'
            : undefined;

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
            headers: { 'Content-Type': 'application/json' },
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
        await requireAuth(tCur.auth.gateCommentReason, (signedInUser) => {
          void commitComment(signedInUser);
        });
        return Boolean(auth.currentUser);
      }

      await commitComment(user);
      return true;
    },
    [language, user, streak, requireAuth]
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
      signOut,
      requireAuth,
      gmailLoginCount,
      refreshGmailLoginCount,
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
      signOut,
      requireAuth,
      gmailLoginCount,
      refreshGmailLoginCount,
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
