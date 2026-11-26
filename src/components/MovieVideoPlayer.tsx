import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ListVideo,
  Settings,
  Check,
  Loader2,
  AlertCircle,
  RotateCcw,
  RotateCw,
  Bookmark,
  Smartphone,
  PictureInPicture2,
  Keyboard,
  Heart,
  MessageCircle,
  Captions,
  Share2,
  Send,
  Crown,
  Tv,
  Volume,
  CheckCircle2,
  ArrowUp,
  Maximize2,
  Film,
  Sparkles,
  Server,
} from 'lucide-react';
import {
  fetchLk21EpisodesAsEpisodeItems,
  fetchLk21Stream,
  fetchLookSeriesEpisodesAsEpisodeItems,
  fetchLookSeriesStream,
} from '../services/movieService';
import {
  cacheEpisodeForOffline,
  isEpisodeCachedOffline,
  readOfflineCachedEpisode,
} from '../utils/offlineCache';
import { useDramaContext } from '../context/DramaContext';
import { getWatchPath, syncEpisodePlayerSeo } from '../utils/seo';
import { ProviderBadge } from './ProviderBadge';
import { ShareDramaModal } from './ShareDramaModal';
import { VideoPointsCounter } from './VideoPointsCounter';
import { resolveEpisodeTransitionWithAd } from '../utils/adRedirect';
import type {
  DramaItem,
  EpisodeItem,
  ReactionKey,
  StreamServerOption,
  StreamSource,
  SubtitleStyleConfig,
  SubtitleTrackItem,
} from '../types/drama';

export interface MovieVideoPlayerProps {
  drama: DramaItem | null;
  episodeNumber: number;
  initialTime?: number;
  episodes: EpisodeItem[];
  relatedDramas?: DramaItem[];
  onSwitchDrama?: (drama: DramaItem, episodeNumber?: number) => void;
  onClose: () => void;
  onChangeEpisode: (episodeNumber: number) => void;
  onEpisodesLoaded: (episodes: EpisodeItem[]) => void;
  onProgressUpdate?: (
    episodeNumber: number,
    currentTime: number,
    duration: number,
    immediate?: boolean,
    playbackState?: {
      isPlaying?: boolean;
      isBuffering?: boolean;
      playbackRate?: number;
    }
  ) => void;
}

type PlaybackSpeed = 1 | 1.25 | 1.5 | 2;
const BATCH_SIZE = 30;

interface UnifiedQualityChoice {
  key: string;
  label: string;
  type: 'url' | 'hls';
  url?: string;
  hlsLevelIndex?: number;
}

interface ParsedCue {
  start: number;
  end: number;
  text: string;
}

const REACTION_BUTTONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: 'plotTwist', emoji: '🔥', label: 'Plot Twist!' },
  { key: 'baper', emoji: '😭', label: 'Emotional' },
  { key: 'emosi', emoji: '😱', label: 'Intense' },
  { key: 'romantis', emoji: '❤️', label: 'Love It' },
];

const WM_CORNER_CLASSES = [
  'top-28 sm:top-28 left-3 sm:left-5',
  'top-16 sm:top-5 right-3 sm:right-5',
  'bottom-24 sm:bottom-16 right-3 sm:right-5',
  'bottom-24 sm:bottom-16 left-3 sm:left-5',
] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSubtitleLangLabel(code?: string, rawName?: string): string {
  const nameClean = (rawName || '').trim();
  if (nameClean && nameClean.length > 2) return nameClean;
  const norm = (code || '').toLowerCase().replace('-', '_').trim();
  if (norm === 'id' || norm === 'in' || norm === 'id_id' || norm === 'ind') {
    return 'Indonesia';
  }
  if (norm.startsWith('en')) return 'English';
  if (norm.startsWith('es') || norm === 'spa') return 'Español (Spanish)';
  if (norm.startsWith('pt') || norm === 'por') return 'Português';
  if (norm.startsWith('fr') || norm === 'fra' || norm === 'fre') return 'Français';
  if (norm.startsWith('zh') || norm === 'cn' || norm === 'chi') {
    return '中文 (Mandarin)';
  }
  if (norm.startsWith('vi') || norm === 'vie') return 'Tiếng Việt';
  if (norm.startsWith('ms') || norm === 'may') return 'Bahasa Melayu';
  if (norm.startsWith('th')) return 'ไทย (Thai)';
  if (norm.startsWith('ko')) return '한국어 (Korean)';
  if (norm.startsWith('ja')) return '日本語 (Japanese)';
  if (norm.startsWith('ar')) return 'العربية (Arabic)';
  if (norm.startsWith('tr')) return 'Türkçe';
  if (norm.startsWith('tl') || norm === 'fil') return 'Filipino';
  if (nameClean) return nameClean;
  return norm ? norm.toUpperCase() : 'Subtitle';
}

function parseSubtitleTimestamp(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function parseVttOrSrtCues(rawText: string): ParsedCue[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: ParsedCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) continue;

    const [startRaw, endRest] = lines[timingIdx].split('-->');
    const endRaw = (endRest || '').trim().split(/\s+/)[0] || '';
    const start = parseSubtitleTimestamp(startRaw);
    const end = parseSubtitleTimestamp(endRaw);
    const cueText = lines
      .slice(timingIdx + 1)
      .join('\n')
      .replace(/\{\\[^}]+\}/g, '')
      .replace(/\[font-size=[^\]]+\]/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (cueText && end > start) {
      cues.push({ start, end, text: cueText });
    }
  }
  return cues;
}

function matchesAppLanguage(trackLang: string, appLang: string): boolean {
  const norm = trackLang.toLowerCase().replace('-', '_');
  if (appLang === 'id') {
    return norm === 'id' || norm === 'in' || norm.startsWith('id_') || norm.includes('indo');
  }
  if (appLang === 'en') return norm.startsWith('en');
  if (appLang === 'cn') return norm.startsWith('zh') || norm === 'cn' || norm.includes('chin');
  if (appLang === 'vi') return norm.startsWith('vi') || norm.includes('viet');
  if (appLang === 'es') return norm.startsWith('es') || norm === 'spa' || norm.includes('span');
  if (appLang === 'ko') return norm.startsWith('ko') || norm === 'kr' || norm.includes('kor');
  if (appLang === 'ja') return norm.startsWith('ja') || norm === 'jp' || norm.includes('jap');
  if (appLang === 'th') return norm.startsWith('th') || norm.includes('thai');
  if (appLang === 'ms') return norm.startsWith('ms') || norm === 'may' || norm === 'msa' || norm.includes('malay');
  if (appLang === 'tl') return norm.startsWith('tl') || norm.startsWith('fil') || norm.includes('tagalog') || norm.includes('filipino');
  return false;
}

export const MovieVideoPlayer: React.FC<MovieVideoPlayerProps> = ({
  drama,
  episodeNumber,
  initialTime = 0,
  episodes,
  relatedDramas = [],
  onSwitchDrama,
  onClose,
  onChangeEpisode,
  onEpisodesLoaded,
  onProgressUpdate,
}) => {
  const {
    language,
    t,
    syncLanguageFromContent,
    user,
    visitorId,
    isDramaLiked,
    getDramaLikesCount,
    refreshDramaStats,
    toggleLikeDrama,
    isDramaSaved,
    toggleMyList,
    getWatchedEpisodes,
    subtitleStyle,
    setSubtitleStyle,
    getEpisodeReactions,
    addEpisodeReaction,
    syncEpisodeComments,
    getEpisodeComments,
    addEpisodeComment,
  } = useDramaContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);

  const [streamData, setStreamData] = useState<StreamSource | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeServerType, setActiveServerType] = useState<'hls' | 'mp4' | 'embed'>('hls');
  const [videoReady, setVideoReady] = useState<boolean>(false);
  const [iframeLoading, setIframeLoading] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('HD');
  const [hlsLevels, setHlsLevels] = useState<{ index: number; label: string }[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [hlsProgressTick, setHlsProgressTick] = useState(0);
  const selectedUrlRef = useRef('');

  useEffect(() => {
    selectedUrlRef.current = selectedUrl;
  }, [selectedUrl]);

  // Subtitle / CC & Audio Track State
  const [hlsSubtitleTracks, setHlsSubtitleTracks] = useState<SubtitleTrackItem[]>([]);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<
    { id: number; label: string; lang: string }[]
  >([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<number>(0);
  const [nativeTextTrackItems, setNativeTextTrackItems] = useState<SubtitleTrackItem[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>('off');
  const [externalCues, setExternalCues] = useState<ParsedCue[]>([]);
  const [loadingSubtitleTrack, setLoadingSubtitleTrack] = useState(false);
  const userToggledSubtitleRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [scrubHover, setScrubHover] = useState<{ pct: number; time: number } | null>(null);
  const [volume, setVolume] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [autoPlayNext, setAutoPlayNext] = useState(true);

  // Netflix Movie Stage States
  const [videoFitMode, setVideoFitMode] = useState<'fit' | 'fill'>('fit');
  const [useNativeControls, setUseNativeControls] = useState(false);
  const [pinchFeedback, setPinchFeedback] = useState<string | null>(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isFloatingMini, setIsFloatingMini] = useState(false);
  const [miniDismissed, setMiniDismissed] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [showCommentsDrawer, setShowCommentsDrawer] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [pendingRedirectAd, setPendingRedirectAd] = useState<{
    targetEpisode: number;
    adUrl: string;
  } | null>(null);

  const [commentInput, setCommentInput] = useState('');
  const [floatingBursts, setFloatingBursts] = useState<{ id: number; text: string }[]>([]);
  const [activeCueText, setActiveCueText] = useState<string>('');

  const [drawerBatchIdx, setDrawerBatchIdx] = useState(0);
  const [openMenu, setOpenMenu] = useState<
    'speed' | 'quality' | 'subtitles' | 'shortcuts' | 'servers' | null
  >(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hudActivityTick, setHudActivityTick] = useState(0);
  const [hudInteracting, setHudInteracting] = useState(false);
  const [nextPrefetched, setNextPrefetched] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<'back' | 'forward' | null>(null);
  const [nextEpCountdown, setNextEpCountdown] = useState<number | null>(null);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [failedCommentAvatars, setFailedCommentAvatars] = useState<
    Record<string, boolean>
  >({});
  const [brokenCoverMap, setBrokenCoverMap] = useState<Record<string, boolean>>({});
  const [wmPosIdx, setWmPosIdx] = useState(0);
  const [wmClock, setWmClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const prefetchedEpisodeRef = useRef<string | null>(null);
  const lastSavedTickRef = useRef<number>(0);
  const appliedInitialSeekRef = useRef<boolean>(false);
  const pendingQualitySeekRef = useRef<number | null>(null);
  const rawSelectedUrlRef = useRef<string>('');
  const triedStreamUrlsRef = useRef<Set<string>>(new Set());
  const retriedForceRefreshRef = useRef<string>('');
  const embedWatchTimeRef = useRef<number>(0);

  // Touch, Pinch-to-Zoom & Double-Tap Gesture Refs
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimerRef = useRef<number | null>(null);
  const pinchActiveRef = useRef<boolean>(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchTriggeredRef = useRef<'out' | 'in' | null>(null);
  const lastPinchEndedAtRef = useRef<number>(0);
  const pinchFeedbackTimerRef = useRef<number | null>(null);
  const controlsVisibleRef = useRef<boolean>(controlsVisible);
  const openMenuRef = useRef<typeof openMenu>(openMenu);
  const lastControlsOpenedAtRef = useRef<number>(0);
  const lastHudActionAtRef = useRef<number>(0);
  const lastTouchEndAtRef = useRef<number>(0);
  const lastPointerMovePosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
  }, [controlsVisible]);

  useEffect(() => {
    openMenuRef.current = openMenu;
  }, [openMenu]);

  // Dynamic Watermark Corner Cycling
  useEffect(() => {
    if (!drama) return;
    const interval = window.setInterval(() => {
      setWmPosIdx((prev) => (prev + 1) % WM_CORNER_CLASSES.length);
      setWmClock(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }, 12000);
    return () => window.clearInterval(interval);
  }, [drama?.bookId, drama?.provider]);

  useEffect(() => {
    if (!drama) return;
    setVideoFitMode('fit');
    setBufferedPct(0);
    setScrubHover(null);
  }, [drama?.bookId, drama?.provider]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
      if (pinchFeedbackTimerRef.current) window.clearTimeout(pinchFeedbackTimerRef.current);
      unlockOrientation();
    };
  }, []);

  const episodeItems = useMemo<EpisodeItem[]>(
    () =>
      episodes.length > 0
        ? episodes
        : [
            {
              chapterId: drama?.bookId || 'movie-1',
              episodeNumber: 1,
              title: drama?.title || 'Full Movie',
              isVipLocked: false,
            },
          ],
    [episodes, drama?.bookId, drama?.title]
  );

  const totalEpisodes = episodeItems.length;
  const isSeriesMovie = totalEpisodes > 1 || drama?.status === 'Ongoing';
  const hasPrev = isSeriesMovie && episodeNumber > 1;
  const hasNext = isSeriesMovie && episodeNumber < totalEpisodes;
  const pipSupported =
    typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);

  const watchedList = drama ? getWatchedEpisodes(drama.bookId, drama.provider) : [];
  const reactions = drama
    ? getEpisodeReactions(drama.bookId, drama.provider, episodeNumber)
    : { plotTwist: 0, baper: 0, emosi: 0, romantis: 0 };
  const comments = drama
    ? getEpisodeComments(drama.bookId, drama.provider, episodeNumber)
    : [];

  const batches = useMemo(() => {
    const groups: { label: string; items: EpisodeItem[] }[] = [];
    for (let i = 0; i < episodeItems.length; i += BATCH_SIZE) {
      const slice = episodeItems.slice(i, i + BATCH_SIZE);
      groups.push({
        label: `${slice[0]?.episodeNumber ?? i + 1}-${
          slice[slice.length - 1]?.episodeNumber ?? i + slice.length
        }`,
        items: slice,
      });
    }
    return groups;
  }, [episodeItems]);

  const qualityChoices = useMemo<UnifiedQualityChoice[]>(() => {
    const list: UnifiedQualityChoice[] = [];
    if (hlsLevels.length > 0) {
      list.push({
        key: 'hls-auto',
        label: 'Auto',
        type: 'hls',
        hlsLevelIndex: -1,
      });
      for (const lvl of hlsLevels) {
        list.push({
          key: `hls-${lvl.index}`,
          label: lvl.label,
          type: 'hls',
          hlsLevelIndex: lvl.index,
        });
      }
      return list;
    }

    if (streamData?.qualities) {
      for (const q of streamData.qualities) {
        list.push({
          key: `url-${q.quality}-${q.url}`,
          label: q.quality,
          type: 'url',
          url: q.url,
        });
      }
    }
    return list;
  }, [hlsLevels, streamData]);

  useEffect(() => {
    const idx = Math.floor(Math.max(0, episodeNumber - 1) / BATCH_SIZE);
    setDrawerBatchIdx(idx);
  }, [episodeNumber, showEpisodeDrawer]);

  // Forced Landscape Orientation Helpers (Mobile/Touch devices)
  const tryLockLandscape = () => {
    try {
      const isMobileOrTouch =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024);
      if (!isMobileOrTouch) return;
      const ori = screen?.orientation as
        | { lock?: (orientation: string) => Promise<void> }
        | undefined;
      void ori?.lock?.('landscape').catch(() => {});
    } catch {
      // Orientation lock unsupported on this browser
    }
  };

  const unlockOrientation = () => {
    try {
      const ori = screen?.orientation as { unlock?: () => void } | undefined;
      ori?.unlock?.();
    } catch {
      // Orientation unlock unsupported
    }
  };

  // Sync browser Fullscreen state & lock/unlock landscape orientation automatically
  useEffect(() => {
    const syncFs = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fsActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(fsActive);
      if (fsActive) {
        tryLockLandscape();
      } else {
        unlockOrientation();
      }
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  // Scroll-triggered Floating Mini-Player on below-fold scroll
  useEffect(() => {
    if (!drama || isFullscreen) {
      setIsFloatingMini(false);
      return;
    }
    const scrollContainer = containerRef.current;
    const stageEl = videoStageRef.current;
    if (!scrollContainer || !stageEl) return;

    const updateFloatingState = () => {
      const stageRect = stageEl.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const visibleTop = Math.max(stageRect.top, containerRect.top);
      const visibleBottom = Math.min(stageRect.bottom, containerRect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibilityRatio =
        stageRect.height > 0 ? visibleHeight / stageRect.height : 1;

      if (scrollContainer.scrollTop > 180 && visibilityRatio < 0.35) {
        setIsFloatingMini(true);
      } else if (scrollContainer.scrollTop < 120 || visibilityRatio >= 0.45) {
        setIsFloatingMini(false);
        setMiniDismissed(false);
      }
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (!entry) return;
              if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
                if (scrollContainer.scrollTop > 140) {
                  setIsFloatingMini(true);
                }
              } else if (entry.intersectionRatio >= 0.45) {
                setIsFloatingMini(false);
                setMiniDismissed(false);
              }
            },
            {
              root: scrollContainer,
              threshold: [0, 0.25, 0.35, 0.45, 0.75],
            }
          )
        : null;

    observer?.observe(stageEl);
    scrollContainer.addEventListener('scroll', updateFloatingState, { passive: true });
    updateFloatingState();

    return () => {
      observer?.disconnect();
      scrollContainer.removeEventListener('scroll', updateFloatingState);
    };
  }, [drama?.bookId, drama?.provider, episodeNumber, isFullscreen]);

  // Related "Up Next" movie matching genres
  const upNextMovie = useMemo(() => {
    if (!drama || relatedDramas.length === 0) return null;
    const candidates = relatedDramas.filter(
      (item) =>
        !(item.bookId === drama.bookId && item.provider === drama.provider)
    );
    if (candidates.length === 0) return null;
    const lowerTags = new Set(drama.tags.map((tg) => tg.toLowerCase()));
    const tagMatch = candidates.find((c) =>
      c.tags.some((tg) => lowerTags.has(tg.toLowerCase()))
    );
    return tagMatch ?? candidates[0];
  }, [drama, relatedDramas]);

  // Dynamic Deep-Link, Auto Content Language Sync & SEO Sync
  useEffect(() => {
    if (!drama || typeof window === 'undefined') return;
    const effectiveLang = syncLanguageFromContent(drama) || language;
    syncEpisodePlayerSeo(drama, episodeNumber, episodeItems, effectiveLang);
    const watchPath = getWatchPath(
      drama.bookId,
      drama.title,
      drama.provider,
      drama.slug,
      isSeriesMovie ? episodeNumber : 1
    );
    const prevState =
      window.history.state && typeof window.history.state === 'object'
        ? (window.history.state as Record<string, unknown>)
        : {};
    window.history.replaceState(
      {
        ...prevState,
        bookId: drama.bookId,
        provider: drama.provider,
        slug: drama.slug,
      },
      '',
      watchPath
    );
  }, [drama, episodeNumber, episodeItems, isSeriesMovie, language, syncLanguageFromContent]);

  // Sync Comments, Global Likes/Stats & Offline Ready state
  useEffect(() => {
    if (!drama) return;
    setNextEpCountdown(null);
    setUpNextCountdown(null);
    setPendingRedirectAd(null);
    setIsOfflineReady(
      isEpisodeCachedOffline(drama.bookId, drama.provider, episodeNumber)
    );
    void syncEpisodeComments(drama.bookId, drama.provider, episodeNumber);
    void refreshDramaStats(drama.bookId, drama.provider);
  }, [drama?.bookId, drama?.provider, episodeNumber, syncEpisodeComments, refreshDramaStats]);

  // Auto-Next Episode Countdown (LK21 Series)
  useEffect(() => {
    if (nextEpCountdown === null || !hasNext) return;
    if (nextEpCountdown <= 0) {
      setNextEpCountdown(null);
      attemptEpisodeChange(episodeNumber + 1, { fromAutoNext: true });
      return;
    }
    const timer = window.setTimeout(() => {
      setNextEpCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [nextEpCountdown, hasNext, episodeNumber]);

  // Auto-Next Recommended Movie Countdown
  useEffect(() => {
    if (upNextCountdown === null || !upNextMovie || !onSwitchDrama) return;
    if (upNextCountdown <= 0) {
      const target = upNextMovie;
      setUpNextCountdown(null);
      onSwitchDrama(target, 1);
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, upNextMovie, onSwitchDrama]);

  // Fetch LK21 / LookSeries episodes list if empty (detects multi-episode series vs single feature film)
  useEffect(() => {
    if (!drama || episodes.length > 0) return;
    let cancelled = false;
    const loader =
      drama.provider === 'LookSeries'
        ? fetchLookSeriesEpisodesAsEpisodeItems(drama.bookId)
        : fetchLk21EpisodesAsEpisodeItems(drama.bookId);
    loader
      .then((list) => {
        if (!cancelled && list.length > 0) {
          onEpisodesLoaded(list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [drama?.bookId, drama?.provider, episodes.length]);

  const availableSubtitleTracks = useMemo<SubtitleTrackItem[]>(() => {
    const merged: SubtitleTrackItem[] = [];
    const seen = new Set<string>();
    const pushTrack = (item: SubtitleTrackItem) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      merged.push(item);
    };
    hlsSubtitleTracks.forEach(pushTrack);
    (streamData?.subtitles ?? []).forEach(pushTrack);
    if (hlsSubtitleTracks.length === 0) {
      nativeTextTrackItems.forEach(pushTrack);
    }
    return merged;
  }, [hlsSubtitleTracks, streamData?.subtitles, nativeTextTrackItems]);

  const signPlaybackUrl = async (rawUrl: string): Promise<string> => {
    if (
      !rawUrl ||
      rawUrl.startsWith('/api/') ||
      rawUrl.startsWith('blob:') ||
      rawUrl.startsWith('data:')
    ) {
      return rawUrl;
    }
    try {
      const resp = await fetch('/api/stream/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: rawUrl,
          uid: user?.uid || visitorId || 'guest',
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { ok?: boolean; signedUrl?: string };
        if (data?.ok && data.signedUrl) return data.signedUrl;
      }
    } catch {
      // Fallback to direct URL seamlessly
    }
    return rawUrl;
  };

  const availableServers = useMemo<StreamServerOption[]>(() => {
    if (!streamData) return [];
    if (Array.isArray(streamData.servers) && streamData.servers.length > 0) {
      return streamData.servers;
    }
    const list: StreamServerOption[] = [];
    if (streamData.streamUrl) {
      list.push({
        id: 'primary-stream',
        name: 'Server Utama (HD)',
        url: streamData.streamUrl,
        type: streamData.isHls ? 'hls' : 'mp4',
        quality: streamData.qualities?.[0]?.quality || 'HD',
      });
    }
    if (streamData.embedUrl) {
      list.push({
        id: 'primary-embed',
        name: 'Server Embed',
        url: streamData.embedUrl,
        type: 'embed',
        quality: 'HD',
      });
    }
    return list;
  }, [streamData]);

  const isSafeEmbedHref = (rawUrl: string): boolean => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('/api/')) return true;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const resetVideoElement = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // Ignore media reset errors
      }
    }
    setIsPlaying(false);
    setVideoReady(false);
  };

  const handleSelectServer = async (srv: StreamServerOption) => {
    if (!srv.url || !isSafeEmbedHref(srv.url)) return;
    setOpenMenu(null);
    setStreamError(null);
    resetVideoElement();

    if (srv.type === 'embed') {
      triedStreamUrlsRef.current.add(srv.url);
      rawSelectedUrlRef.current = srv.url;
      setActiveServerId(srv.id);
      setActiveServerType('embed');
      setSelectedUrl('');
      setEmbedUrl(srv.url);
      setIframeLoading(true);
      setHlsLevels([]);
      return;
    }

    setEmbedUrl('');
    setIframeLoading(false);
    setActiveServerId(srv.id);
    setActiveServerType(srv.type);
    rawSelectedUrlRef.current = srv.url;
    triedStreamUrlsRef.current.add(srv.url);
    const secured = await signPlaybackUrl(srv.url);
    triedStreamUrlsRef.current.add(secured);
    setSelectedQuality(srv.quality || 'HD');
    setSelectedUrl(secured);
  };

  const tryNextStreamFallback = (failedUrl: string): boolean => {
    if (!drama) return false;

    if (
      failedUrl &&
      failedUrl.includes('/api/stream?st=') &&
      rawSelectedUrlRef.current &&
      !triedStreamUrlsRef.current.has(rawSelectedUrlRef.current)
    ) {
      const directUrl = rawSelectedUrlRef.current;
      triedStreamUrlsRef.current.add(directUrl);
      setStreamError(null);
      setVideoReady(false);
      setSelectedUrl(directUrl);
      return true;
    }

    const untriedDirectServer = availableServers.find(
      (s) => s.type !== 'embed' && Boolean(s.url) && !triedStreamUrlsRef.current.has(s.url)
    );
    if (untriedDirectServer) {
      rawSelectedUrlRef.current = untriedDirectServer.url;
      triedStreamUrlsRef.current.add(untriedDirectServer.url);
      setStreamError(null);
      setActiveServerId(untriedDirectServer.id);
      setActiveServerType(untriedDirectServer.type);
      setSelectedQuality(untriedDirectServer.quality || 'HD');
      setVideoReady(false);
      setSelectedUrl(untriedDirectServer.url);
      return true;
    }

    const fallback = (streamData?.qualities ?? []).find(
      (q) => Boolean(q.url) && !triedStreamUrlsRef.current.has(q.url)
    );
    if (fallback) {
      rawSelectedUrlRef.current = fallback.url;
      triedStreamUrlsRef.current.add(fallback.url);
      setStreamError(null);
      setVideoReady(false);
      setSelectedUrl(fallback.url);
      setSelectedQuality(fallback.quality);
      return true;
    }

    // Fallback cleanly into an available embed server if direct HLS/MP4 playback failed
    const untriedEmbed = availableServers.find(
      (s) =>
        s.type === 'embed' &&
        Boolean(s.url) &&
        isSafeEmbedHref(s.url) &&
        !triedStreamUrlsRef.current.has(s.url)
    );
    if (untriedEmbed) {
      triedStreamUrlsRef.current.add(untriedEmbed.url);
      resetVideoElement();
      setActiveServerId(untriedEmbed.id);
      setActiveServerType('embed');
      setSelectedUrl('');
      setEmbedUrl(untriedEmbed.url);
      setIframeLoading(true);
      setStreamError(null);
      return true;
    }

    const forceRefreshKey = `${drama.bookId}:${drama.provider}:${episodeNumber}`;
    if (retriedForceRefreshRef.current !== forceRefreshKey) {
      retriedForceRefreshRef.current = forceRefreshKey;
      setStreamError(null);
      void loadMovieStream(drama.bookId, episodeNumber, true);
      return true;
    }

    return false;
  };

  const streamReqIdRef = useRef(0);
  const retriedWithEpisodesRef = useRef('');

  const loadMovieStream = async (
    slug: string,
    ep: number,
    forceRefresh = false
  ) => {
    const reqId = ++streamReqIdRef.current;
    embedWatchTimeRef.current = initialTime > 0 ? initialTime : 0;
    setLoadingStream(true);
    setStreamError(null);
    setStreamData(null);
    setHlsProgressTick(0);
    resetVideoElement();
    setSelectedUrl('');
    setEmbedUrl('');
    setIframeLoading(false);
    setActiveServerId('');
    setActiveServerType('hls');
    setHlsLevels([]);
    setSelectedHlsLevel(-1);
    setHlsSubtitleTracks([]);
    setHlsAudioTracks([]);
    setSelectedAudioTrackId(0);
    setNativeTextTrackItems([]);
    setExternalCues([]);
    setActiveCueText('');
    if (!userToggledSubtitleRef.current) {
      setSelectedSubtitleId('off');
    }
    setCurrentTime(0);
    setDuration(0);
    setNextPrefetched(false);
    appliedInitialSeekRef.current = false;
    pendingQualitySeekRef.current = null;
    triedStreamUrlsRef.current = new Set();

    try {
      const epMeta = episodeItems.find((item) => item.episodeNumber === ep);
      const isLookSeries = drama?.provider === 'LookSeries';
      const movieProv = isLookSeries ? 'LookSeries' : 'LK21';
      const data = isLookSeries
        ? await fetchLookSeriesStream(slug, ep, forceRefresh, {
            chapterId: epMeta?.chapterId || epMeta?.eid,
            chapterIndex0: epMeta?.chapterIndex0,
          })
        : await fetchLk21Stream(slug, ep, epMeta?.eid, forceRefresh);
      if (reqId !== streamReqIdRef.current) return;
      setStreamData(data);

      const serverList = data.servers ?? [];
      const firstDirect = serverList.find((s) => s.type !== 'embed');
      const firstEmbed = serverList.find((s) => s.type === 'embed');

      if (data.streamUrl || firstDirect) {
        void cacheEpisodeForOffline({
          bookId: slug,
          provider: movieProv,
          episodeNumber: ep,
          title: drama?.title,
          streamSource: data,
          episodes: episodeItems,
        }).then((saved) => {
          if (saved) setIsOfflineReady(true);
        });

        const preferred =
          data.qualities.find((q) => q.quality.includes('1080')) ??
          data.qualities.find((q) => q.quality.includes('720')) ??
          data.qualities[0];
        const rawChosenUrl = preferred?.url ?? firstDirect?.url ?? data.streamUrl;
        rawSelectedUrlRef.current = rawChosenUrl;
        const resolvedDirectType: 'hls' | 'mp4' =
          firstDirect?.type === 'mp4' && !data.isHls
            ? 'mp4'
            : data.isHls ||
              rawChosenUrl.includes('/proxy/m3u8') ||
              rawChosenUrl.toLowerCase().includes('.m3u8')
            ? 'hls'
            : 'mp4';

        const securedUrl = await signPlaybackUrl(rawChosenUrl);
        if (reqId !== streamReqIdRef.current) return;
        if (!securedUrl) {
          throw new Error('URL stream video kosong atau tidak valid.');
        }
        triedStreamUrlsRef.current.add(rawChosenUrl);
        triedStreamUrlsRef.current.add(securedUrl);
        setActiveServerId(firstDirect?.id || 'lk21-primary-direct');
        setActiveServerType(resolvedDirectType);
        setSelectedUrl(securedUrl);
        setSelectedQuality(preferred?.quality ?? firstDirect?.quality ?? 'HD');
      } else if (
        (data.embedUrl && isSafeEmbedHref(data.embedUrl)) ||
        (firstEmbed?.url && isSafeEmbedHref(firstEmbed.url))
      ) {
        const chosenEmbed = firstEmbed?.url || data.embedUrl || '';
        triedStreamUrlsRef.current.add(chosenEmbed);
        rawSelectedUrlRef.current = chosenEmbed;
        setActiveServerId(firstEmbed?.id || 'lk21-primary-embed');
        setActiveServerType('embed');
        setEmbedUrl(chosenEmbed);
        setIframeLoading(true);
      } else {
        throw new Error(t.player.streamUnavailable);
      }
    } catch (err) {
      if (reqId !== streamReqIdRef.current) return;
      const movieProv = drama?.provider === 'LookSeries' ? 'LookSeries' : 'LK21';
      const offlineCached = await readOfflineCachedEpisode(slug, movieProv, ep);
      if (reqId !== streamReqIdRef.current) return;
      if (offlineCached?.streamSource?.streamUrl) {
        const cachedData = offlineCached.streamSource;
        setStreamData(cachedData);
        setActiveServerType(cachedData.isHls ? 'hls' : 'mp4');
        setSelectedUrl(cachedData.streamUrl);
        setSelectedQuality(cachedData.qualities[0]?.quality ?? 'HD');
        setIsOfflineReady(true);
      } else {
        setStreamError(
          err instanceof Error ? err.message : t.player.streamUnavailable
        );
      }
    } finally {
      if (reqId === streamReqIdRef.current) {
        setLoadingStream(false);
      }
    }
  };

  useEffect(() => {
    if (!drama) return;
    lastSavedTickRef.current = 0;
    retriedWithEpisodesRef.current = '';
    retriedForceRefreshRef.current = '';
    void loadMovieStream(drama.bookId, episodeNumber);
  }, [drama?.bookId, drama?.provider, episodeNumber]);

  useEffect(() => {
    if (!drama || episodes.length === 0 || !streamError || loadingStream) return;
    const retryKey = `${drama.bookId}:${episodeNumber}`;
    if (retriedWithEpisodesRef.current === retryKey) return;
    const epMeta = episodes.find((item) => item.episodeNumber === episodeNumber);
    if (epMeta?.eid || epMeta?.chapterId) {
      retriedWithEpisodesRef.current = retryKey;
      void loadMovieStream(drama.bookId, episodeNumber);
    }
  }, [drama?.bookId, episodeNumber, episodes, streamError, loadingStream]);

  // Safety timeout: never leave player trapped in blank/black loading state if stream hangs
  useEffect(() => {
    if (
      !drama ||
      loadingStream ||
      streamError ||
      Boolean(embedUrl) ||
      !selectedUrl ||
      videoReady
    ) {
      return;
    }
    const isProxiedOrHls =
      activeServerType === 'hls' ||
      selectedUrl.includes('/proxy/') ||
      selectedUrl.toLowerCase().includes('.m3u8');
    const stallMs = isProxiedOrHls ? 24000 : 16000;
    const stallTimer = window.setTimeout(() => {
      if (!tryNextStreamFallback(selectedUrl)) {
        setStreamError(
          'Server video terlalu lama merespons atau stream diblokir browser. Klik Coba Lagi atau pilih server lain.'
        );
      }
    }, stallMs);
    return () => window.clearTimeout(stallTimer);
  }, [
    drama?.bookId,
    loadingStream,
    streamError,
    embedUrl,
    selectedUrl,
    activeServerType,
    videoReady,
    hlsProgressTick,
  ]);

  // Fallback timeout for iframe loading spinner & mark active playback
  useEffect(() => {
    if (!embedUrl || !iframeLoading) return;
    const timer = window.setTimeout(() => {
      setIframeLoading(false);
      setVideoReady(true);
      setIsPlaying(true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [embedUrl, iframeLoading]);

  // Synchronize verified active-watch heartbeat when playing an embed iframe server
  useEffect(() => {
    if (!drama || !embedUrl || iframeLoading || streamError || !isPlaying) {
      return;
    }
    const tickSec = 5;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      embedWatchTimeRef.current += tickSec;
      const elapsed = embedWatchTimeRef.current;
      setCurrentTime(elapsed);
      const effectiveDur = duration > elapsed ? duration : Math.max(3600, elapsed + 60);
      onProgressUpdate?.(episodeNumber, elapsed, effectiveDur, false, {
        isPlaying: true,
        isBuffering: false,
        playbackRate: 1,
      });
    }, tickSec * 1000);
    return () => window.clearInterval(timer);
  }, [drama, embedUrl, iframeLoading, streamError, isPlaying, episodeNumber, duration, onProgressUpdate]);

  // Attach HLS or direct MP4 source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedUrl || embedUrl) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setVideoReady(false);

    const lowerSelected = selectedUrl.toLowerCase();
    const rawLower = (rawSelectedUrlRef.current || '').toLowerCase();
    const isM3u8 =
      activeServerType === 'hls' ||
      Boolean(streamData?.isHls && !lowerSelected.includes('.mp4')) ||
      lowerSelected.includes('.m3u8') ||
      lowerSelected.includes('/api/lk21/proxy/m3u8') ||
      lowerSelected.includes('/api/lookseries/proxy/m3u8') ||
      rawLower.includes('.m3u8');

    const startPlayback = () => {
      video.playbackRate = playbackSpeed;
      if (pendingQualitySeekRef.current !== null) {
        video.currentTime = pendingQualitySeekRef.current;
        pendingQualitySeekRef.current = null;
      }
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };

    const syncHlsSubtitles = (hlsInstance: Hls) => {
      const tracks = hlsInstance.subtitleTracks || [];
      const mapped: SubtitleTrackItem[] = tracks.map((tr, idx) => ({
        id: `hls-${idx}-${tr.lang || tr.name || 'sub'}`,
        lang: tr.lang || tr.name || `track-${idx}`,
        label: formatSubtitleLangLabel(tr.lang, tr.name),
        hlsTrackId: idx,
        source: 'hls',
      }));
      setHlsSubtitleTracks(mapped);
    };

    const syncHlsAudioTracks = (hlsInstance: Hls) => {
      const tracks = hlsInstance.audioTracks || [];
      const mapped = tracks.map((tr, idx) => ({
        id: idx,
        lang: tr.lang || tr.name || `audio-${idx}`,
        label: formatSubtitleLangLabel(tr.lang, tr.name || `Audio ${idx + 1}`),
      }));
      setHlsAudioTracks(mapped);
      if (typeof hlsInstance.audioTrack === 'number' && hlsInstance.audioTrack >= 0) {
        setSelectedAudioTrackId(hlsInstance.audioTrack);
      }
    };

    let mediaRecoveryAttempted = false;
    let nonFatalNetErrors = 0;
    let attachedNativeMetaListener = false;

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 2,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 3,
      });
      hlsRef.current = hls;
      hls.loadSource(selectedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        setHlsProgressTick((tick) => tick + 1);
        if (Array.isArray(data.levels) && data.levels.length > 0) {
          const parsedLevels = data.levels
            .map((lvl, idx) => ({
              index: idx,
              height: lvl.height || 0,
              label: lvl.height
                ? `${lvl.height}p`
                : `${Math.round((lvl.bitrate || 0) / 1000)}kbps`,
            }))
            .sort((a, b) => b.height - a.height)
            .map(({ index, label }) => ({ index, label }));
          setHlsLevels(parsedLevels);
          setSelectedHlsLevel(-1);
          setSelectedQuality('Auto');
        }
        syncHlsSubtitles(hls);
        syncHlsAudioTracks(hls);
        startPlayback();
      });
      hls.on(Hls.Events.LEVEL_LOADED, () => {
        setHlsProgressTick((tick) => tick + 1);
      });
      hls.on(Hls.Events.FRAG_LOADING, () => {
        setHlsProgressTick((tick) => tick + 1);
      });
      hls.on(Hls.Events.FRAG_LOADED, () => {
        setHlsProgressTick((tick) => tick + 1);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setVideoReady(true);
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => syncHlsSubtitles(hls));
      hls.on(Hls.Events.SUBTITLE_TRACK_LOADED, () => syncHlsSubtitles(hls));
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncHlsAudioTracks(hls));
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
        if (typeof data.id === 'number') {
          setSelectedAudioTrackId(data.id);
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            nonFatalNetErrors += 1;
            if (nonFatalNetErrors >= 4) {
              hls.destroy();
              if (!tryNextStreamFallback(selectedUrl)) {
                setStreamError(
                  `Gagal memuat segmen video (${data.details || 'networkError'}).`
                );
              }
            }
          }
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecoveryAttempted) {
          mediaRecoveryAttempted = true;
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        if (!tryNextStreamFallback(selectedUrl)) {
          setStreamError(
            `Stream video gagal dimuat (${data.details || 'playbackError'}).`
          );
        }
      });
    } else if (isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = selectedUrl;
      attachedNativeMetaListener = true;
      video.addEventListener('loadedmetadata', startPlayback, { once: true });
    } else {
      video.src = selectedUrl;
      startPlayback();
    }

    return () => {
      if (attachedNativeMetaListener) {
        video.removeEventListener('loadedmetadata', startPlayback);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [selectedUrl, activeServerType, embedUrl]);

  // Auto-select subtitle matching active app language unless user toggled manually
  useEffect(() => {
    if (availableSubtitleTracks.length === 0) return;
    const stillValid = availableSubtitleTracks.some(
      (tr) => tr.id === selectedSubtitleId
    );
    if (selectedSubtitleId !== 'off' && stillValid) return;
    if (!userToggledSubtitleRef.current) {
      const matched = availableSubtitleTracks.find((tr) =>
        matchesAppLanguage(tr.lang, language)
      );
      setSelectedSubtitleId(matched ? matched.id : 'off');
    }
  }, [availableSubtitleTracks, language]);

  // Sync active subtitle track
  useEffect(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;

    if (selectedSubtitleId === 'off') {
      if (hls) {
        hls.subtitleTrack = -1;
        hls.subtitleDisplay = false;
      }
      if (video?.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'disabled';
        }
      }
      setExternalCues([]);
      setActiveCueText('');
      return;
    }

    const chosen = availableSubtitleTracks.find(
      (tr) => tr.id === selectedSubtitleId
    );
    if (!chosen) return;

    let cancelled = false;

    if (chosen.source === 'hls' && hls && typeof chosen.hlsTrackId === 'number') {
      setExternalCues([]);
      hls.subtitleTrack = chosen.hlsTrackId;
      hls.subtitleDisplay = false;
      if (video?.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = i === chosen.hlsTrackId ? 'hidden' : 'disabled';
        }
      }
    } else if (chosen.source === 'textTrack' && video?.textTracks) {
      setExternalCues([]);
      const idx = Number(chosen.id.replace('texttrack-', ''));
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === idx ? 'hidden' : 'disabled';
      }
    } else if (chosen.source === 'api' && chosen.url) {
      if (hls) {
        hls.subtitleTrack = -1;
        hls.subtitleDisplay = false;
      }
      if (video?.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'disabled';
        }
      }
      setLoadingSubtitleTrack(true);
      const targetUrl = chosen.url;
      const resolvedSubtitleUrl = targetUrl.startsWith('/api/')
        ? targetUrl
        : `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
      fetch(resolvedSubtitleUrl)
        .then((r) => {
          if (!r.ok) throw new Error('Subtitle fetch failed');
          return r.text();
        })
        .then((raw) => {
          if (!cancelled) setExternalCues(parseVttOrSrtCues(raw));
        })
        .catch(() => {
          if (!cancelled) setExternalCues([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingSubtitleTrack(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedSubtitleId, availableSubtitleTracks]);

  // Update active cue text from VTT/SRT
  useEffect(() => {
    if (externalCues.length === 0 || selectedSubtitleId === 'off') return;
    const match = externalCues.find(
      (c) => currentTime >= c.start && currentTime <= c.end
    );
    setActiveCueText(match?.text ?? '');
  }, [externalCues, currentTime, selectedSubtitleId]);

  // Native textTracks cue sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    const refreshNativeList = () => {
      const list: SubtitleTrackItem[] = [];
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          list.push({
            id: `texttrack-${i}`,
            lang: track.language || 'und',
            label: formatSubtitleLangLabel(track.language, track.label),
            source: 'textTrack',
          });
        }
      }
      setNativeTextTrackItems(list);
    };

    const syncCue = () => {
      if (externalCues.length > 0) return;
      if (selectedSubtitleId === 'off') {
        setActiveCueText('');
        return;
      }
      let text = '';
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.mode === 'showing' || track.mode === 'hidden') {
          const cue = track.activeCues?.[0] as VTTCue | undefined;
          if (cue?.text) {
            text = cue.text.replace(/<[^>]+>/g, '');
            break;
          }
        }
      }
      setActiveCueText(text);
    };

    const tracks = video.textTracks;
    refreshNativeList();
    tracks.addEventListener?.('addtrack', refreshNativeList);
    tracks.addEventListener?.('change', syncCue);
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].addEventListener?.('cuechange', syncCue);
    }
    return () => {
      tracks.removeEventListener?.('addtrack', refreshNativeList);
      tracks.removeEventListener?.('change', syncCue);
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].removeEventListener?.('cuechange', syncCue);
      }
    };
  }, [selectedUrl, selectedSubtitleId, externalCues.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackSpeed;
    video.volume = isMuted ? 0 : volume;
    video.muted = isMuted;
  }, [playbackSpeed, volume, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPip = () => setIsPipActive(true);
    const onLeavePip = () => setIsPipActive(false);
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [selectedUrl]);

  // Prefetch next episode at 80% for LK21 / LookSeries Series
  useEffect(() => {
    if (!drama || !hasNext || duration <= 0) return;
    const ratio = currentTime / duration;
    const prov = drama.provider === 'LookSeries' ? 'LookSeries' : 'LK21';
    const key = `${prov}:${drama.bookId}:${episodeNumber + 1}`;
    if (ratio >= 0.8 && prefetchedEpisodeRef.current !== key) {
      prefetchedEpisodeRef.current = key;
      const nextEpMeta = episodeItems.find(
        (item) => item.episodeNumber === episodeNumber + 1
      );
      if (prov === 'LookSeries') {
        void fetchLookSeriesStream(drama.bookId, episodeNumber + 1, false, {
          chapterId: nextEpMeta?.chapterId || nextEpMeta?.eid,
          chapterIndex0: nextEpMeta?.chapterIndex0,
        }).catch(() => {});
      } else {
        void fetchLk21Stream(drama.bookId, episodeNumber + 1, nextEpMeta?.eid).catch(
          () => {}
        );
      }
      setNextPrefetched(true);
    }
  }, [drama, episodeNumber, currentTime, duration, hasNext, episodeItems]);

  const flushProgress = (timeOverride?: number, immediate = true) => {
    if (!drama || !onProgressUpdate) return;
    const v = videoRef.current;
    const isEmbed = Boolean(embedUrl);
    const tNow = timeOverride ?? (isEmbed ? embedWatchTimeRef.current : v?.currentTime) ?? currentTime;
    const dNow =
      v?.duration && Number.isFinite(v.duration) ? v.duration : duration;
    onProgressUpdate(episodeNumber, tNow, dNow, immediate, {
      isPlaying: isEmbed ? isPlaying : Boolean(v && !v.paused && !v.ended),
      isBuffering: isEmbed ? iframeLoading : isBuffering,
      playbackRate: isEmbed ? 1 : v ? Number(v.playbackRate) || playbackSpeed : playbackSpeed,
    });
  };

  const showPinchToast = (message: string) => {
    if (pinchFeedbackTimerRef.current) {
      window.clearTimeout(pinchFeedbackTimerRef.current);
    }
    setPinchFeedback(message);
    pinchFeedbackTimerRef.current = window.setTimeout(() => {
      setPinchFeedback(null);
      pinchFeedbackTimerRef.current = null;
    }, 1250);
  };

  const handleClosePlayer = () => {
    flushProgress(undefined, true);
    const v = videoRef.current;
    if (v && !v.paused) {
      v.pause();
      setIsPlaying(false);
    }
    unlockOrientation();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    onClose();
  };

  const handleTogglePip = async () => {
    const video = videoRef.current;
    if (!video || !pipSupported) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else {
        await video.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch {
      // Ignore unsupported PiP errors
    }
  };

  const enterLandscapeFullscreen = async () => {
    setIsFloatingMini(false);
    setMiniDismissed(false);
    const el = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> })
      | null;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      setIsFullscreen(true);
      tryLockLandscape();
      return;
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
      setIsFullscreen(true);
      tryLockLandscape();
    } catch {
      if (video?.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
          setIsFullscreen(true);
          tryLockLandscape();
        } catch {
          setIsFullscreen(true);
          tryLockLandscape();
        }
      } else {
        setIsFullscreen(true);
        tryLockLandscape();
      }
    }
  };

  const exitLandscapeFullscreen = async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    unlockOrientation();
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      setIsFullscreen(false);
      return;
    }
    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    } catch {
      setIsFullscreen(false);
    }
  };

  const handleFullscreen = async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !isFullscreen) {
      await enterLandscapeFullscreen();
    } else {
      await exitLandscapeFullscreen();
    }
  };

  const handleSelectQuality = (choice: UnifiedQualityChoice) => {
    if (choice.type === 'hls' && hlsRef.current) {
      const lvlIdx = choice.hlsLevelIndex ?? -1;
      hlsRef.current.currentLevel = lvlIdx;
      setSelectedHlsLevel(lvlIdx);
      setSelectedQuality(choice.label);
    } else if (choice.type === 'url' && choice.url) {
      const targetUrl = choice.url;
      if (targetUrl !== rawSelectedUrlRef.current) {
        rawSelectedUrlRef.current = targetUrl;
        pendingQualitySeekRef.current =
          videoRef.current?.currentTime ?? currentTime;
        void signPlaybackUrl(targetUrl).then((secured) => {
          setSelectedUrl(secured);
        });
      }
      setSelectedQuality(choice.label);
    }
    setOpenMenu(null);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !selectedUrl) return;
    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
      flushProgress(video.currentTime);
    }
  };

  const triggerSeekDelta = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const maxDur = duration || v.duration || 9999;
    v.currentTime = Math.min(maxDur, Math.max(0, v.currentTime + delta));
    setCurrentTime(v.currentTime);
    setSeekFeedback(delta < 0 ? 'back' : 'forward');
    bumpHudActivity();
    window.setTimeout(() => setSeekFeedback(null), 650);
  };

  const commitEpisodeChange = (targetEp: number) => {
    if (!drama) return;
    setPendingRedirectAd(null);
    flushProgress(undefined, true);
    onChangeEpisode(targetEp);
  };

  const attemptEpisodeChange = (
    targetEp: number,
    options?: { fromAutoNext?: boolean }
  ) => {
    if (!drama || targetEp < 1 || targetEp > totalEpisodes) return;
    const transition = resolveEpisodeTransitionWithAd({
      dramaId: drama.bookId,
      provider: drama.provider,
      currentEpisode: episodeNumber,
      targetEpisode: targetEp,
      fromAutoNext: options?.fromAutoNext,
    });
    if (transition.action === 'prompt' && transition.adUrl) {
      const v = videoRef.current;
      if (v && !v.paused) {
        v.pause();
        setIsPlaying(false);
      }
      setPendingRedirectAd({ targetEpisode: targetEp, adUrl: transition.adUrl });
      return;
    }
    commitEpisodeChange(targetEp);
  };

  // HUD 10-Second Auto-Hide Engine
  const bumpHudActivity = () => {
    const now = Date.now();
    lastHudActionAtRef.current = now;
    if (!controlsVisibleRef.current) {
      lastControlsOpenedAtRef.current = now;
    }
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    setHudActivityTick((n) => n + 1);
  };

  const hideHudControls = () => {
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    controlsVisibleRef.current = false;
    setControlsVisible(false);
  };

  useEffect(() => {
    if (
      !drama ||
      !controlsVisible ||
      !isPlaying ||
      loadingStream ||
      hudInteracting ||
      openMenu !== null ||
      showEpisodeDrawer ||
      showCommentsDrawer ||
      shareModalOpen ||
      nextEpCountdown !== null ||
      upNextCountdown !== null
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      controlsVisibleRef.current = false;
      setControlsVisible(false);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [
    drama,
    controlsVisible,
    isPlaying,
    loadingStream,
    hudInteracting,
    hudActivityTick,
    openMenu,
    showEpisodeDrawer,
    showCommentsDrawer,
    shareModalOpen,
    nextEpCountdown,
    upNextCountdown,
  ]);

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    if (Date.now() - lastTouchEndAtRef.current < 600) return;
    const prev = lastPointerMovePosRef.current;
    const dx = prev ? Math.abs(e.clientX - prev.x) : 99;
    const dy = prev ? Math.abs(e.clientY - prev.y) : 99;
    lastPointerMovePosRef.current = { x: e.clientX, y: e.clientY };
    if (dx < 3 && dy < 3) return;
    bumpHudActivity();
  };

  // Strict Event Bubbling Isolation on All HUD Controls
  const hudTouchProps = {
    'data-hud-control': 'true',
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      setHudInteracting(true);
      bumpHudActivity();
    },
    onTouchMove: (e: React.TouchEvent) => {
      e.stopPropagation();
      bumpHudActivity();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchEndAtRef.current = Date.now();
      setHudInteracting(false);
      bumpHudActivity();
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchEndAtRef.current = Date.now();
      setHudInteracting(false);
      bumpHudActivity();
    },
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      setHudInteracting(true);
      bumpHudActivity();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      setHudInteracting(false);
      bumpHudActivity();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.stopPropagation();
      setHudInteracting(false);
      bumpHudActivity();
    },
  };

  const hudButtonTouchProps = {
    'data-hud-control': 'true',
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      bumpHudActivity();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchEndAtRef.current = Date.now();
      bumpHudActivity();
    },
  };

  // Single-Tap Show/Hide HUD & Double-Tap ±10s Seek / Center Play-Pause
  const handleViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl?.closest(
        'button, input, textarea, select, a, [role="button"], aside, [data-hud-control="true"]'
      )
    ) {
      bumpHudActivity();
      return;
    }

    if (Date.now() - lastHudActionAtRef.current < 200) return;
    if (pinchActiveRef.current || Date.now() - lastPinchEndedAtRef.current < 450) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const now = Date.now();
    const isDoubleTap =
      now - lastTapRef.current.time < 260 &&
      Math.abs(relX - lastTapRef.current.x) < 0.25;

    if (isDoubleTap) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = { time: 0, x: 0 };
      if (relX < 0.35) {
        triggerSeekDelta(-10);
      } else if (relX > 0.65) {
        triggerSeekDelta(10);
      } else {
        togglePlay();
        bumpHudActivity();
      }
      return;
    }

    lastTapRef.current = { time: now, x: relX };
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (!controlsVisibleRef.current) {
      bumpHudActivity();
      return;
    }

    if (openMenuRef.current !== null) {
      setOpenMenu(null);
      bumpHudActivity();
      return;
    }

    if (now - lastControlsOpenedAtRef.current < 400) {
      bumpHudActivity();
      return;
    }

    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      if (pinchActiveRef.current || Date.now() - lastPinchEndedAtRef.current < 450) {
        return;
      }
      if (openMenuRef.current !== null) {
        setOpenMenu(null);
        bumpHudActivity();
        return;
      }
      if (Date.now() - lastHudActionAtRef.current < 250) {
        return;
      }
      hideHudControls();
    }, 240);
  };

  // Pinch-to-Zoom Gesture Handlers (Movie-Only: Pinch-Out -> Landscape Fullscreen Fill, Pinch-In -> Exit & Fit)
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-hud-control="true"]')) return;

    if (e.touches.length === 2) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      pinchActiveRef.current = true;
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchTriggeredRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchStartDistRef.current) return;
    pinchActiveRef.current = true;
    const currentDist = getTouchDistance(e.touches);
    const startDist = Math.max(1, pinchStartDistRef.current);
    const ratio = currentDist / startDist;
    const delta = currentDist - startDist;

    // Pinch-Out -> Forced Landscape Fullscreen + Fill (object-cover)
    if ((ratio >= 1.22 || delta >= 34) && pinchTriggeredRef.current !== 'out') {
      pinchTriggeredRef.current = 'out';
      setVideoFitMode('fill');
      showPinchToast(`${t.player.fullscreen} · ${t.player.zoomFill}`);
      bumpHudActivity();
      void enterLandscapeFullscreen();
    } else if (
      // Pinch-In -> Exit Fullscreen + Reset Fit (object-contain)
      (ratio <= 0.8 || delta <= -34) &&
      pinchTriggeredRef.current !== 'in'
    ) {
      pinchTriggeredRef.current = 'in';
      setVideoFitMode('fit');
      showPinchToast(t.player.zoomFit);
      bumpHudActivity();
      void exitLandscapeFullscreen();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchEndAtRef.current = Date.now();
    if (pinchActiveRef.current) {
      lastPinchEndedAtRef.current = Date.now();
      if (e.touches.length === 0) {
        pinchActiveRef.current = false;
        pinchStartDistRef.current = null;
        pinchTriggeredRef.current = null;
      }
    }
  };

  // Keyboard Shortcuts (Netflix-style Theater Shortcuts)
  useEffect(() => {
    if (!drama) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (openMenu) setOpenMenu(null);
        else if (showCommentsDrawer) setShowCommentsDrawer(false);
        else if (showEpisodeDrawer) setShowEpisodeDrawer(false);
        else handleClosePlayer();
      } else if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        triggerSeekDelta(-10);
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        e.preventDefault();
        triggerSeekDelta(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume((v) => Math.min(1, Number((v + 0.1).toFixed(2))));
        setIsMuted(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => Math.max(0, Number((v - 0.1).toFixed(2))));
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((prev) => !prev);
      } else if (e.key.toLowerCase() === 'f') {
        void handleFullscreen();
      } else if (e.key.toLowerCase() === 't') {
        setIsTheaterMode((prev) => !prev);
      } else if (e.key.toLowerCase() === 'n' && hasNext) {
        attemptEpisodeChange(episodeNumber + 1);
      } else if (e.key.toLowerCase() === 'p' && hasPrev) {
        attemptEpisodeChange(episodeNumber - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    drama,
    openMenu,
    showEpisodeDrawer,
    showCommentsDrawer,
    duration,
    isPlaying,
    hasNext,
    hasPrev,
    episodeNumber,
    selectedUrl,
  ]);

  if (!drama) return null;

  const isLiked = isDramaLiked(drama.bookId, drama.provider);
  const likesCount = getDramaLikesCount(drama.bookId, drama.provider);
  const isSaved = isDramaSaved(drama.bookId, drama.provider);
  const progressPct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const showSkipIntro =
    !loadingStream &&
    !streamError &&
    Boolean(selectedUrl) &&
    currentTime >= 1 &&
    currentTime <= 45;

  const triggerReaction = (key: ReactionKey, text: string) => {
    addEpisodeReaction(drama.bookId, drama.provider, episodeNumber, key);
    const id = Date.now() + Math.random();
    setFloatingBursts((prev) => [...prev.slice(-4), { id, text }]);
    window.setTimeout(() => {
      setFloatingBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1300);
  };

  const subtitleFontClass =
    subtitleStyle.fontSize === 'small'
      ? 'text-xs'
      : subtitleStyle.fontSize === 'large'
      ? 'text-base sm:text-xl'
      : 'text-sm sm:text-base';
  const subtitleColorClass =
    subtitleStyle.textColor === 'gold' ? 'text-[#D4AF37]' : 'text-white';
  const subtitleBgRgba =
    subtitleStyle.bgOpacity === 0
      ? 'transparent'
      : subtitleStyle.bgOpacity === 80
      ? 'rgba(0,0,0,0.82)'
      : 'rgba(0,0,0,0.55)';

  const isFloatingMiniActive = !isFullscreen && isFloatingMini && !miniDismissed;
  const hudVisible =
    !isFloatingMiniActive &&
    (controlsVisible ||
      !isPlaying ||
      loadingStream ||
      Boolean(embedUrl) ||
      Boolean(streamError) ||
      !videoReady);
  const isSameOriginMedia =
    !selectedUrl ||
    selectedUrl.startsWith('/api/') ||
    selectedUrl.startsWith('blob:') ||
    selectedUrl.startsWith('data:');
  const activeServerOption = availableServers.find(
    (s) => s.id === activeServerId
  );

  const scrollPlayerToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setIsFloatingMini(false);
    setMiniDismissed(false);
  };

  const inlineUpNextMovies = relatedDramas
    .filter(
      (item) =>
        !(item.bookId === drama.bookId && item.provider === drama.provider)
    )
    .slice(0, 6);

  const posterUrl = drama.coverHz || drama.cover;

  return (
    <div
      ref={containerRef}
      onPointerMove={handleContainerPointerMove}
      className={`fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-full select-none transition-colors duration-300 ${
        isFullscreen
          ? 'bg-black flex flex-col overflow-hidden'
          : isTheaterMode
          ? 'bg-black overflow-y-auto overflow-x-hidden scroll-smooth'
          : 'bg-[#070709] overflow-y-auto overflow-x-hidden scroll-smooth'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing movie ${drama.title}`}
    >
      {/* Dimmed Backdrop Overlay when Desktop Theater Mode is Active */}
      {isTheaterMode && !isFullscreen && (
        <div
          aria-hidden="true"
          onClick={() => setIsTheaterMode(false)}
          className="fixed inset-0 z-0 bg-black/95 pointer-events-auto transition-opacity duration-300"
        />
      )}

      {/* Primary Netflix Widescreen Stage */}
      <div
        id="movie-video-stage"
        ref={videoStageRef}
        className={
          isFullscreen
            ? 'relative z-10 flex-1 min-h-0 h-[100dvh] max-h-[100dvh] w-full flex flex-col bg-black overflow-hidden'
            : isTheaterMode
            ? 'relative z-10 w-full h-auto sm:h-[90dvh] sm:max-h-[90dvh] [@media(orientation:landscape)_and_(max-height:520px)]:h-[100dvh] [@media(orientation:landscape)_and_(max-height:520px)]:max-h-[100dvh] min-h-0 flex flex-col justify-between bg-black overflow-hidden shrink-0 shadow-[0_30px_90px_rgba(0,0,0,0.95)]'
            : 'relative z-10 w-full h-auto sm:h-[84dvh] sm:max-h-[84dvh] [@media(orientation:landscape)_and_(max-height:520px)]:h-[100dvh] [@media(orientation:landscape)_and_(max-height:520px)]:max-h-[100dvh] min-h-0 flex flex-col justify-between bg-black overflow-hidden shrink-0'
        }
      >
        {/* Top Header HUD (Overlay in true fullscreen; cinema bar in normal/theater mode) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          {...hudTouchProps}
          className={`${
            isFullscreen ? 'absolute top-0 inset-x-0 pb-4' : 'relative shrink-0 pb-2'
          } z-30 flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8 pt-[max(10px,env(safe-area-inset-top))] sm:py-3 [@media(orientation:landscape)_and_(max-height:520px)]:py-1.5 bg-gradient-to-b from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${
            hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="min-w-0 flex items-center gap-2.5 sm:gap-3.5">
            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                handleClosePlayer();
              }}
              aria-label="Close movie player"
              className="min-w-[44px] min-h-[44px] p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 hover:bg-[#E50914] hover:border-[#E50914] text-white transition-colors shrink-0 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <ProviderBadge provider={drama.provider} size="xs" />
                {drama.quality && (
                  <span className="px-1.5 py-0.5 rounded bg-white/15 border border-white/20 text-[10px] font-bold text-white uppercase tracking-wider">
                    {drama.quality}
                  </span>
                )}
                {drama.year && (
                  <span className="text-[#A1A1AA] tabular-nums">{drama.year}</span>
                )}
                {isSeriesMovie && (
                  <span className="text-[#D4AF37] tabular-nums font-bold">
                    EP {episodeNumber} / {totalEpisodes}
                  </span>
                )}
                {nextPrefetched && hasNext && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E50914]/20 border border-[#E50914]/60 text-[10px] text-red-200">
                    {t.player.nextReady}
                  </span>
                )}
                {isOfflineReady && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] text-emerald-300">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {t.player.offlineCached}
                  </span>
                )}
              </div>
              <h2 className="text-sm sm:text-xl font-bold text-white truncate mt-0.5 drop-shadow">
                {drama.title}
              </h2>
            </div>
          </div>

          {/* Top Right Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Multi-Server / Embed Switcher (Mobile + Desktop) */}
            {availableServers.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setOpenMenu((prev) => (prev === 'servers' ? null : 'servers'));
                  }}
                  aria-label="Pilih Server Video"
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full border text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${
                    openMenu === 'servers' || Boolean(embedUrl)
                      ? 'bg-[#E50914]/25 border-[#E50914] text-red-100'
                      : 'bg-black/60 sm:bg-[#141418]/90 border-white/15 text-white hover:border-white/35'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                  <span className="max-w-[90px] sm:max-w-[140px] truncate">
                    {activeServerOption?.name ||
                      (embedUrl ? 'Embed' : 'Server')}
                  </span>
                </button>

                {openMenu === 'servers' && (
                  <div
                    data-hud-control="true"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-60 max-h-64 overflow-y-auto rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-2 space-y-1 z-50"
                  >
                    <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] border-b border-white/10">
                      Pilih Server Video ({availableServers.length})
                    </div>
                    {availableServers.map((srv) => {
                      const active =
                        srv.id === activeServerId ||
                        (embedUrl ? srv.url === embedUrl : srv.url === rawSelectedUrlRef.current);
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSelectServer(srv);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                            active
                              ? 'bg-[#E50914]/20 border border-[#E50914] text-white font-semibold'
                              : 'hover:bg-white/5 text-[#E4E4E7] border border-transparent'
                          }`}
                        >
                          <span className="truncate">{srv.name}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold uppercase text-[#D4AF37]">
                              {srv.type === 'embed' ? 'Embed' : srv.type.toUpperCase()}
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-[#E50914]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mobile Quick CC Toggle */}
            {!embedUrl && (
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setOpenMenu((prev) => (prev === 'subtitles' ? null : 'subtitles'));
                }}
                aria-label={t.player.subtitles}
                className={`lg:hidden min-w-[38px] min-h-[38px] p-2 rounded-full bg-black/60 backdrop-blur-md border flex items-center justify-center transition-colors ${
                  openMenu === 'subtitles' || selectedSubtitleId !== 'off'
                    ? 'border-[#E50914] text-[#E50914]'
                    : 'border-white/15 text-white'
                }`}
              >
                <Captions className="w-4 h-4" />
              </button>
            )}

            {/* Mobile PiP Button */}
            {pipSupported && (
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  void handleTogglePip();
                }}
                aria-label="Picture in Picture"
                className={`lg:hidden min-w-[38px] min-h-[38px] p-2 rounded-full bg-black/60 backdrop-blur-md border flex items-center justify-center ${
                  isPipActive
                    ? 'text-[#E50914] border-[#E50914]'
                    : 'text-white border-white/15'
                }`}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Fullscreen (Landscape Lock) Button */}
            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                void handleFullscreen();
              }}
              aria-label={
                isFullscreen ? t.player.exitFullscreen : t.player.fullscreen
              }
              className="lg:hidden min-w-[38px] min-h-[38px] p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white flex items-center justify-center"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>

            {/* Desktop Theater Mode Toggle */}
            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setIsTheaterMode((prev) => !prev);
              }}
              aria-label={
                isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode
              }
              className={`hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                isTheaterMode
                  ? 'bg-[#E50914] border-[#E50914] text-white shadow-lg shadow-red-600/30'
                  : 'bg-[#141418]/90 border-white/15 text-[#E4E4E7] hover:border-white/35'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>
                {isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
              </span>
            </button>

            {isSeriesMovie && (
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setAutoPlayNext((prev) => !prev);
                }}
                className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
                  autoPlayNext
                    ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                    : 'bg-[#141418]/90 border-white/15 text-[#A1A1AA]'
                }`}
              >
                {t.player.autoNext}: {autoPlayNext ? 'ON' : 'OFF'}
              </button>
            )}

            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                toggleMyList(drama);
              }}
              className={`hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                isSaved
                  ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                  : 'bg-[#141418]/90 border-white/15 text-white hover:border-[#E50914]/70'
              }`}
            >
              <Bookmark
                className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-[#E50914]' : ''}`}
              />
              <span className="hidden lg:inline">{isSaved ? t.player.savedMovie : t.player.saveMovie}</span>
            </button>

            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                toggleLikeDrama(drama);
              }}
              className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
                isLiked
                  ? 'bg-red-500/20 border-red-500 text-red-300'
                  : 'bg-[#141418]/90 border-white/15 text-white hover:border-red-400/60'
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-red-400' : ''}`}
              />
              <span>{isLiked ? t.player.liked : t.player.like}</span>
              {likesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums">
                  {likesCount.toLocaleString()}
                </span>
              )}
            </button>

            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setShareModalOpen(true);
              }}
              className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#141418]/90 border border-white/15 hover:border-white/35 text-xs font-medium text-white whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5 text-[#E50914]" />
              <span>{t.player.shareDrama}</span>
            </button>

            <button
              type="button"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setShowCommentsDrawer((prev) => !prev);
                setShowEpisodeDrawer(false);
              }}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
                showCommentsDrawer
                  ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                  : 'bg-[#141418]/90 border-white/15 text-white hover:border-white/30'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>{comments.length > 0 ? comments.length : 'React'}</span>
            </button>

            {isSeriesMovie && (
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setShowEpisodeDrawer((prev) => !prev);
                  setShowCommentsDrawer(false);
                }}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
                  showEpisodeDrawer
                    ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                    : 'bg-[#141418]/90 border-white/15 text-white hover:border-white/30'
                }`}
              >
                <ListVideo className="w-4 h-4" />
                <span>{t.player.episodes}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Widescreen Viewport: Full 100% viewport in fullscreen; fitted between HUD bars in normal/theater mode */}
        <div
          className={`relative flex-1 min-h-0 min-w-0 w-full flex items-center justify-center overflow-hidden touch-none transition-colors duration-300 ${
            isFullscreen
              ? 'h-full p-0 bg-black'
              : isTheaterMode
              ? 'p-0 bg-black'
              : 'p-0 sm:px-6'
          }`}
          onClick={handleViewportClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Ambient Cinema Backdrop (Automatically dimmed off in Theater/Fullscreen Mode) */}
          <div
            className={`hidden sm:block absolute inset-0 pointer-events-none transition-opacity duration-500 ${
              isTheaterMode || isFullscreen ? 'opacity-0' : 'opacity-100'
            }`}
            aria-hidden="true"
          >
            {posterUrl && !brokenCoverMap[`bg:${drama.bookId}`] && (
              <img
                src={posterUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() =>
                  setBrokenCoverMap((p) => ({ ...p, [`bg:${drama.bookId}`]: true }))
                }
                className="w-full h-full object-cover opacity-20 blur-3xl scale-125"
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(229,9,20,0.16) 0%, rgba(5,5,7,0.94) 68%)',
              }}
            />
          </div>

          {/* Stage Placeholder shown when scrolled below the fold */}
          {isFloatingMini && !isFullscreen && (
            <div className="relative z-10 flex flex-col items-center justify-center gap-3 p-6 text-center rounded-2xl bg-[#111115]/90 border border-white/10 max-w-sm">
              {drama.cover && !brokenCoverMap[`ph:${drama.bookId}`] ? (
                <img
                  src={drama.cover}
                  alt={drama.title}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setBrokenCoverMap((p) => ({
                      ...p,
                      [`ph:${drama.bookId}`]: true,
                    }))
                  }
                  className="w-24 aspect-video rounded-lg object-cover border border-white/15 opacity-85"
                />
              ) : (
                <div className="w-24 aspect-video rounded-lg bg-[#1A1A22] border border-white/10 flex items-center justify-center">
                  <Film className="w-6 h-6 text-[#E50914]" />
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-bold text-[#E50914] uppercase tracking-wider">
                  {miniDismissed
                    ? 'Movie Paused'
                    : 'Playing in Corner Mini-Player'}
                </p>
                <p className="text-xs text-[#A1A1AA] line-clamp-1">{drama.title}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollPlayerToTop();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E50914] hover:bg-[#f40612] text-white text-xs font-semibold shadow-lg"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Restore Movie Player</span>
              </button>
            </div>
          )}

          {/* Video Box (Always Widescreen 16:9 or Full Viewport in Fullscreen / Theater) */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (isFloatingMiniActive) {
                togglePlay();
                return;
              }
              handleViewportClick(e);
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={
              isFloatingMiniActive
                ? 'fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-[60] w-[240px] sm:w-[340px] aspect-video rounded-2xl border border-white/25 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden transition-all duration-300 group'
                : `relative overflow-hidden bg-black touch-none sm:shadow-2xl transition-all duration-300 flex items-center justify-center ${
                    isFullscreen
                      ? 'w-full h-full max-w-full max-h-full rounded-none border-0'
                      : isTheaterMode
                      ? 'w-full aspect-video max-h-full sm:max-w-[min(96vw,100%,calc((90dvh-10rem)*16/9))] [@media(orientation:landscape)_and_(max-height:520px)]:h-full [@media(orientation:landscape)_and_(max-height:520px)]:w-auto [@media(orientation:landscape)_and_(max-height:520px)]:max-w-full sm:rounded-lg'
                      : 'w-full aspect-video max-h-full sm:max-w-[min(64rem,100%,calc((84dvh-10rem)*16/9))] [@media(orientation:landscape)_and_(max-height:520px)]:h-full [@media(orientation:landscape)_and_(max-height:520px)]:w-auto [@media(orientation:landscape)_and_(max-height:520px)]:max-w-full sm:rounded-xl sm:border sm:border-white/15'
                  }`
            }
          >
            {embedUrl && isSafeEmbedHref(embedUrl) && (
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={drama.title}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
                allowFullScreen
                referrerPolicy="no-referrer"
                onLoad={() => {
                  setIframeLoading(false);
                  setVideoReady(true);
                  setIsPlaying(true);
                }}
                className="w-full h-full border-0 bg-black"
              />
            )}

            <video
              ref={videoRef}
              playsInline
              controls={useNativeControls}
              crossOrigin={isSameOriginMedia ? 'anonymous' : undefined}
              preload="auto"
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              poster={posterUrl || undefined}
              onLoadedData={() => setVideoReady(true)}
              onWaiting={() => setIsBuffering(true)}
              onStalled={() => setIsBuffering(true)}
              onSeeking={() => setIsBuffering(true)}
              onSeeked={() => setIsBuffering(false)}
              onCanPlay={() => {
                setIsBuffering(false);
                setVideoReady(true);
              }}
              onPlaying={() => {
                setIsBuffering(false);
                setVideoReady(true);
                setIsPlaying(true);
                const v = videoRef.current;
                const now = Date.now();
                if (v && now - lastSavedTickRef.current >= 3000) {
                  lastSavedTickRef.current = now;
                  onProgressUpdate?.(
                    episodeNumber,
                    v.currentTime,
                    Number.isFinite(v.duration) ? v.duration : 0,
                    false,
                    {
                      isPlaying: !v.paused && !v.ended,
                      isBuffering: false,
                      playbackRate: Number(v.playbackRate) || playbackSpeed,
                    }
                  );
                }
              }}
              onProgress={() => {
                const v = videoRef.current;
                if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
                if (v.buffered.length > 0) {
                  const end = v.buffered.end(v.buffered.length - 1);
                  setBufferedPct(
                    Math.min(100, Math.max(0, (end / v.duration) * 100))
                  );
                }
              }}
              onTimeUpdate={() => {
                const v = videoRef.current;
                if (!v) return;
                const stillBuffering = isBuffering && v.readyState < 3;
                if (stillBuffering !== isBuffering && !stillBuffering && !v.paused) {
                  setIsBuffering(false);
                }
                if (v.currentTime > 0 && !videoReady) {
                  setVideoReady(true);
                }
                setCurrentTime(v.currentTime);
                const now = Date.now();
                if (now - lastSavedTickRef.current >= 3000) {
                  lastSavedTickRef.current = now;
                  onProgressUpdate?.(
                    episodeNumber,
                    v.currentTime,
                    Number.isFinite(v.duration) ? v.duration : 0,
                    false,
                    {
                      isPlaying: !v.paused && !v.ended,
                      isBuffering: stillBuffering,
                      playbackRate: Number(v.playbackRate) || playbackSpeed,
                    }
                  );
                }
              }}
              onLoadedMetadata={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.videoWidth > 0) {
                  setVideoReady(true);
                }
                if (Number.isFinite(v.duration)) {
                  setDuration(v.duration);
                  if (pendingQualitySeekRef.current !== null) {
                    v.currentTime = pendingQualitySeekRef.current;
                    setCurrentTime(pendingQualitySeekRef.current);
                    pendingQualitySeekRef.current = null;
                  } else if (
                    !appliedInitialSeekRef.current &&
                    initialTime > 2 &&
                    initialTime < v.duration - 3
                  ) {
                    appliedInitialSeekRef.current = true;
                    v.currentTime = initialTime;
                    setCurrentTime(initialTime);
                  }
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }}
              onPause={() => {
                setIsPlaying(false);
                setIsBuffering(false);
                flushProgress(undefined, true);
              }}
              onEnded={() => {
                setIsPlaying(false);
                setIsBuffering(false);
                flushProgress(duration, true);
                if (autoPlayNext && hasNext) {
                  setNextEpCountdown(3);
                } else if (autoPlayNext && !hasNext && upNextMovie && onSwitchDrama) {
                  setUpNextCountdown(5);
                }
              }}
              onError={() => {
                if (!embedUrl && !loadingStream && selectedUrl) {
                  if (!tryNextStreamFallback(selectedUrl)) {
                    setStreamError(
                      'Browser tidak dapat memutar format stream video ini. Silakan coba ulang atau ganti server.'
                    );
                  }
                }
              }}
              className={
                embedUrl
                  ? 'hidden'
                  : `w-full h-full max-w-full max-h-full bg-black transition-all duration-300 ${
                      videoFitMode === 'fill' ? 'object-cover' : 'object-contain'
                    }`
              }
            />

            <VideoPointsCounter
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              playbackRate={playbackSpeed}
              isMiniPlayer={isFloatingMiniActive}
              onNavigateRewards={onClose}
              placement="top-left"
              belowTopHud={isFullscreen && hudVisible}
            />

            {/* Dynamic Moving Translucent Watermark */}
            {!isFloatingMiniActive && (
              <div
                aria-hidden="true"
                className={`absolute z-10 pointer-events-none select-none opacity-25 transition-all duration-700 px-2.5 py-1 rounded bg-black/25 text-[10px] sm:text-xs font-mono tracking-wider text-white/90 whitespace-nowrap ${WM_CORNER_CLASSES[wmPosIdx]}`}
              >
                {(user?.email || user?.uid || visitorId || 'guest').slice(0, 30)} ·
                Kano Cinema · {wmClock}
              </div>
            )}

            {/* Compact Corner Mini-Player Overlay Controls */}
            {isFloatingMiniActive && (
              <div
                data-hud-control="true"
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-b from-black/75 via-transparent to-black/80 p-2.5"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-[10px] font-bold text-white truncate max-w-[140px]">
                    {drama.title}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollPlayerToTop();
                      }}
                      aria-label="Restore main player"
                      className="w-7 h-7 rounded-full bg-black/75 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMiniDismissed(true);
                        const v = videoRef.current;
                        if (v && !v.paused) {
                          v.pause();
                          setIsPlaying(false);
                        }
                      }}
                      aria-label="Dismiss mini-player"
                      className="w-7 h-7 rounded-full bg-black/75 hover:bg-[#E50914] border border-white/15 text-white flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="w-8 h-8 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-lg"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMuted((prev) => !prev);
                      }}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                      className="w-7 h-7 rounded-full bg-black/75 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="w-full h-1 rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full bg-[#E50914]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Styled Subtitle Overlay */}
            {(activeCueText || (!isFloatingMiniActive && openMenu === 'subtitles')) && (
              <div className="absolute inset-x-4 bottom-3 sm:bottom-6 flex justify-center pointer-events-none z-20">
                <div
                  className={`px-3.5 py-1.5 rounded-lg font-medium leading-snug text-center max-w-[90%] ${subtitleFontClass} ${subtitleColorClass}`}
                  style={{
                    backgroundColor: subtitleBgRgba,
                    textShadow: '0 1px 4px rgba(0,0,0,0.92)',
                  }}
                >
                  {activeCueText || `${drama.title} · Subtitle Preview`}
                </div>
              </div>
            )}

            {/* Floating Reaction Burst Animations */}
            <div className="absolute right-8 bottom-12 pointer-events-none z-20 flex flex-col items-end gap-1">
              {floatingBursts.map((b) => (
                <span
                  key={b.id}
                  className="animate-reaction-float px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-xs font-semibold text-white shadow-lg"
                >
                  {b.text}
                </span>
              ))}
            </div>

            {/* Pinch-to-Zoom Feedback Pill */}
            {pinchFeedback && !isFloatingMiniActive && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-xl">
                  <Maximize2 className="w-3.5 h-3.5 text-[#E50914]" />
                  {pinchFeedback}
                </span>
              </div>
            )}

            {/* Double-Tap Visual Ripple Feedback */}
            {seekFeedback && (
              <div
                className={`absolute inset-y-0 ${
                  seekFeedback === 'back' ? 'left-0 w-1/3' : 'right-0 w-1/3'
                } flex items-center justify-center bg-white/10 backdrop-blur-[1px] pointer-events-none z-20`}
              >
                <span className="px-3.5 py-1.5 rounded-full bg-black/80 border border-white/15 text-white text-xs font-bold tabular-nums shadow-lg">
                  {seekFeedback === 'back' ? '-10s' : '+10s'}
                </span>
              </div>
            )}

            {/* Netflix-Style Mobile Center Transport Controls (-10s | Play/Pause | +10s) */}
            {!loadingStream &&
              !streamError &&
              !embedUrl &&
              videoReady &&
              !isFloatingMiniActive &&
              nextEpCountdown === null &&
              upNextCountdown === null && (
                <div
                  data-hud-control="true"
                  className={`sm:hidden absolute inset-0 z-20 flex items-center justify-center gap-7 pointer-events-none transition-opacity duration-250 ${
                    hudVisible ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerSeekDelta(-10);
                    }}
                    aria-label={t.player.rewind10s}
                    className={`min-w-[48px] min-h-[48px] rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center shadow-xl ${
                      hudVisible ? 'pointer-events-auto' : 'pointer-events-none'
                    }`}
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">
                      10
                    </span>
                  </button>

                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      togglePlay();
                    }}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className={`min-w-[60px] min-h-[60px] rounded-full bg-[#E50914]/95 hover:bg-[#f40612] text-white flex items-center justify-center shadow-[0_0_28px_rgba(229,9,20,0.55)] border border-white/25 ${
                      hudVisible ? 'pointer-events-auto' : 'pointer-events-none'
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 fill-current" />
                    ) : (
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerSeekDelta(10);
                    }}
                    aria-label={t.player.forward10s}
                    className={`min-w-[48px] min-h-[48px] rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center shadow-xl ${
                      hudVisible ? 'pointer-events-auto' : 'pointer-events-none'
                    }`}
                  >
                    <RotateCw className="w-5 h-5" />
                    <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">
                      10
                    </span>
                  </button>
                </div>
              )}

            {/* Loading & Buffering Poster Overlay (never shows silent black box) */}
            {!streamError &&
              (loadingStream ||
                (Boolean(embedUrl) && iframeLoading) ||
                (!embedUrl && Boolean(selectedUrl) && !videoReady) ||
                (!loadingStream && !selectedUrl && !embedUrl)) && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="absolute inset-0 z-30 bg-[#09090B]/88 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center overflow-hidden"
                >
                  {posterUrl && !brokenCoverMap[`load:${drama.bookId}`] && (
                    <img
                      src={posterUrl}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenCoverMap((p) => ({ ...p, [`load:${drama.bookId}`]: true }))
                      }
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md scale-105 pointer-events-none"
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center max-w-md">
                    <Loader2 className="w-10 h-10 text-[#E50914] animate-spin mb-3" />
                    <p className="text-sm font-semibold text-white">
                      {loadingStream
                        ? isSeriesMovie
                          ? `${t.player.loadingEp} ${episodeNumber}...`
                          : `Memuat stream ${drama.title}...`
                        : embedUrl
                        ? `Membuka player ${activeServerOption?.name || 'Embed'}...`
                        : 'Menghubungkan ke server video...'}
                    </p>
                    {!loadingStream && availableServers.length > 1 && (
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        {availableServers.slice(0, 4).map((srv) => (
                          <button
                            key={srv.id}
                            type="button"
                            {...hudButtonTouchProps}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSelectServer(srv);
                            }}
                            className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors ${
                              srv.id === activeServerId
                                ? 'bg-[#E50914] border-[#E50914] text-white'
                                : 'bg-black/75 border-white/20 text-[#E4E4E7] hover:border-[#E50914]'
                            }`}
                          >
                            {srv.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Error Overlay with Retry & Server Switcher */}
            {streamError && !loadingStream && (
              <div
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="absolute inset-0 z-30 bg-[#09090B]/92 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center overflow-hidden"
              >
                {posterUrl && !brokenCoverMap[`err:${drama.bookId}`] && (
                  <img
                    src={posterUrl}
                    alt=""
                    aria-hidden="true"
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenCoverMap((p) => ({ ...p, [`err:${drama.bookId}`]: true }))
                    }
                    className="absolute inset-0 w-full h-full object-cover opacity-15 blur-md pointer-events-none"
                  />
                )}
                <div className="relative z-10 flex flex-col items-center">
                  <AlertCircle className="w-10 h-10 text-[#E50914] mb-3" />
                  <p className="text-sm font-semibold text-white mb-1">
                    {t.player.streamUnavailable}
                  </p>
                  <p className="text-xs text-[#A1A1AA] max-w-sm mb-4">
                    {streamError}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        void loadMovieStream(drama.bookId, episodeNumber, true);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E50914] hover:bg-[#f40612] text-white text-xs font-bold shadow-lg"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t.player.retry}</span>
                    </button>
                    {availableServers
                      .filter((s) => s.url !== (embedUrl || rawSelectedUrlRef.current))
                      .slice(0, 3)
                      .map((srv) => (
                        <button
                          key={srv.id}
                          type="button"
                          {...hudButtonTouchProps}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSelectServer(srv);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold"
                        >
                          <Server className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>{srv.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Auto-Next Episode Overlay (LK21 Multi-Episode Series) */}
            {nextEpCountdown !== null && hasNext && (
              <div
                data-hud-control="true"
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37] mb-1">
                  {t.player.nextEpisodeIn}
                </p>
                <p className="text-3xl font-extrabold text-white tabular-nums mb-3">
                  {nextEpCountdown}s
                </p>
                <p className="text-sm text-[#D4D4D8] mb-5">
                  {drama.title} · EP {episodeNumber + 1}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNextEpCountdown(null);
                      attemptEpisodeChange(episodeNumber + 1);
                    }}
                    className="px-5 py-2.5 rounded-full bg-[#E50914] text-white text-xs font-bold shadow-lg"
                  >
                    {t.retention.playNow}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextEpCountdown(null)}
                    className="px-5 py-2.5 rounded-full bg-white/10 text-white text-xs font-medium"
                  >
                    {t.retention.cancel}
                  </button>
                </div>
              </div>
            )}

            {/* Up Next Related Movie Overlay */}
            {upNextCountdown !== null && upNextMovie && (
              <div
                data-hud-control="true"
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#D4AF37] mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                  {t.retention.upNextTitle}
                </span>
                {upNextMovie.cover && !brokenCoverMap[`up:${upNextMovie.bookId}`] && (
                  <img
                    src={upNextMovie.cover}
                    alt={upNextMovie.title}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenCoverMap((p) => ({
                        ...p,
                        [`up:${upNextMovie.bookId}`]: true,
                      }))
                    }
                    className="w-24 aspect-[2/3] rounded-xl object-cover border border-white/20 shadow-2xl mb-3"
                  />
                )}
                <h4 className="text-base font-bold text-white line-clamp-1 max-w-xs mb-1">
                  {upNextMovie.title}
                </h4>
                <p className="text-xs text-[#A1A1AA] mb-4 tabular-nums">
                  {t.retention.upNextPlayingIn} {upNextCountdown}s...
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const target = upNextMovie;
                      setUpNextCountdown(null);
                      onSwitchDrama?.(target, 1);
                    }}
                    className="px-5 py-2.5 rounded-full bg-[#E50914] text-white text-xs font-bold shadow-lg"
                  >
                    {t.retention.playNow}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpNextCountdown(null)}
                    className="px-5 py-2.5 rounded-full bg-white/10 text-white text-xs font-medium"
                  >
                    {t.retention.cancel}
                  </button>
                </div>
              </div>
            )}

            {/* Skip Intro Pill */}
            {showSkipIntro && !isFloatingMiniActive && (
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (v) v.currentTime = Math.min(duration || 9999, 60);
                  bumpHudActivity();
                }}
                className={`absolute ${
                  isFullscreen && hudVisible
                    ? 'bottom-24 sm:bottom-28'
                    : 'bottom-3 sm:bottom-6'
                } right-3 sm:right-4 z-20 px-4 py-2 rounded-lg bg-black/80 hover:bg-[#E50914] border border-white/30 text-xs font-bold text-white shadow-xl backdrop-blur-md transition-all`}
              >
                {t.player.skipIntro}
              </button>
            )}
          </div>
        </div>

        {/* Episode Drawer (Only Shown for Multi-Episode LK21 Series) */}
        {showEpisodeDrawer && isSeriesMovie && (
          <aside
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
            }}
            {...hudTouchProps}
            className="absolute inset-y-0 right-0 z-40 w-full max-w-sm bg-[#101015]/95 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {t.player.episodes} ({totalEpisodes})
                </h3>
                <p className="text-xs text-[#A1A1AA] line-clamp-1">{drama.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEpisodeDrawer(false)}
                aria-label="Close episode drawer"
                className="p-2 rounded-lg hover:bg-white/10 text-[#A1A1AA] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {batches.length > 1 && (
              <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {batches.map((b, idx) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => setDrawerBatchIdx(idx)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums border ${
                      drawerBatchIdx === idx
                        ? 'bg-[#E50914] border-[#E50914] text-white'
                        : 'bg-[#18181D] border-white/10 text-[#A1A1AA]'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-2 content-start">
              {(batches[drawerBatchIdx]?.items ?? episodeItems).map((ep) => {
                const active = ep.episodeNumber === episodeNumber;
                const isWatched = watchedList.includes(ep.episodeNumber);
                return (
                  <button
                    key={ep.chapterId}
                    type="button"
                    onClick={() => {
                      attemptEpisodeChange(ep.episodeNumber);
                      setShowEpisodeDrawer(false);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-colors ${
                      active
                        ? 'bg-[#E50914]/20 border-[#E50914] text-red-200 font-bold'
                        : isWatched
                        ? 'bg-[#181410] border-[#D4AF37]/40 text-[#D4AF37]'
                        : 'bg-[#18181D] border-white/10 text-white hover:border-[#E50914]'
                    }`}
                  >
                    <div className="text-xs tabular-nums">{ep.episodeNumber}</div>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* Comments & Reactions Drawer */}
        {showCommentsDrawer && (
          <aside
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
            }}
            {...hudTouchProps}
            className="absolute inset-y-0 right-0 z-40 w-full max-w-sm bg-[#101015]/95 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {t.player.commentsTitle}
                </h3>
                <p className="text-xs text-[#A1A1AA] truncate">{drama.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCommentsDrawer(false)}
                aria-label="Close comments drawer"
                className="p-2 rounded-lg hover:bg-white/10 text-[#A1A1AA] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-white/10 flex flex-wrap gap-2">
              {REACTION_BUTTONS.map((rb) => (
                <button
                  key={rb.key}
                  type="button"
                  onClick={() => triggerReaction(rb.key, `${rb.emoji} ${rb.label}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[#E50914] text-xs font-medium text-white transition-all active:scale-95"
                >
                  <span>{rb.emoji}</span>
                  <span>{rb.label}</span>
                  <span className="text-[11px] text-[#E50914] font-bold tabular-nums">
                    {reactions[rb.key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {comments.length === 0 ? (
                <p className="text-xs text-[#A1A1AA] text-center py-8">
                  {t.player.noComments}
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-[#18181D] border border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.authorPhotoURL && !failedCommentAvatars[c.id] ? (
                          <img
                            src={c.authorPhotoURL}
                            alt={c.author}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedCommentAvatars((prev) => ({
                                ...prev,
                                [c.id]: true,
                              }))
                            }
                            className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/20"
                          />
                        ) : (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: c.authorColor || '#E50914' }}
                          >
                            {c.authorInitials || c.author.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="font-semibold text-white truncate">
                          {c.author}
                        </span>
                        {c.authorBadge && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/45 text-[#FDE68A] text-[9px] font-bold shrink-0">
                            <Crown className="w-2.5 h-2.5 text-[#D4AF37]" />
                            {c.authorBadge}
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0">
                        {new Date(c.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#E4E4E7] leading-relaxed pl-7">
                      {typeof c.videoTimestampSec === 'number' &&
                        c.videoTimestampSec > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const video = videoRef.current;
                              if (video) {
                                video.currentTime = c.videoTimestampSec!;
                                setCurrentTime(c.videoTimestampSec!);
                              }
                            }}
                            className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-[#E50914]/20 border border-[#E50914]/45 text-[10px] font-bold text-red-200 tabular-nums"
                          >
                            {formatTime(c.videoTimestampSec)}
                          </button>
                        )}
                      {c.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const textToSend = commentInput;
                if (!textToSend.trim()) return;
                const playbackSec = Math.floor(
                  videoRef.current?.currentTime ?? currentTime ?? 0
                );
                void addEpisodeComment(
                  drama.bookId,
                  drama.provider,
                  episodeNumber,
                  textToSend,
                  playbackSec
                ).then((ok) => {
                  if (ok) setCommentInput('');
                });
              }}
              className="p-3 border-t border-white/10 flex items-center gap-2"
            >
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={`${t.player.commentPlaceholder} (@ ${formatTime(currentTime)})`}
                className="flex-1 px-3 py-2 rounded-full bg-[#18181D] border border-white/10 focus:border-[#E50914] text-xs text-white placeholder-[#71717A] focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[36px] px-3.5 py-2 rounded-full bg-[#E50914] text-white text-xs font-semibold flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t.player.postComment}</span>
              </button>
            </form>
          </aside>
        )}

        {/* Subtitle & Multi-Audio Popover */}
        {openMenu === 'subtitles' && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
            }}
            {...hudTouchProps}
            className="fixed sm:absolute bottom-20 sm:bottom-20 right-3 sm:right-24 left-3 sm:left-auto z-50 sm:w-72 max-h-[min(65dvh,calc(100dvh-6rem))] overflow-y-auto rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Captions className="w-4 h-4 text-[#E50914]" />
                {t.player.subtitles}
                {loadingSubtitleTrack && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E50914]" />
                )}
              </span>
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setOpenMenu(null);
                }}
                aria-label="Close subtitle menu"
                className="text-[#A1A1AA] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 pb-3 border-b border-white/10">
              <span className="text-[11px] font-semibold text-[#A1A1AA]">
                {t.player.subtitleTracks}
              </span>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    userToggledSubtitleRef.current = true;
                    setSelectedSubtitleId('off');
                    setOpenMenu(null);
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between border transition-colors ${
                    selectedSubtitleId === 'off'
                      ? 'bg-[#E50914]/20 border-[#E50914] text-white font-semibold'
                      : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                  }`}
                >
                  <span>{t.player.subtitleOff}</span>
                  {selectedSubtitleId === 'off' && (
                    <Check className="w-3.5 h-3.5 text-[#E50914]" />
                  )}
                </button>

                {availableSubtitleTracks.map((track) => {
                  const active = selectedSubtitleId === track.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        userToggledSubtitleRef.current = true;
                        setSelectedSubtitleId(track.id);
                        setOpenMenu(null);
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between border transition-colors ${
                        active
                          ? 'bg-[#E50914]/20 border-[#E50914] text-white font-semibold'
                          : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                      }`}
                    >
                      <span className="truncate">{track.label}</span>
                      {active && <Check className="w-3.5 h-3.5 text-[#E50914] shrink-0" />}
                    </button>
                  );
                })}

                {availableSubtitleTracks.length === 0 && (
                  <p className="text-[11px] text-[#71717A] px-2 py-1.5">
                    {t.player.noSubtitlesFound}
                  </p>
                )}
              </div>
            </div>

            {hlsAudioTracks.length > 1 && (
              <div className="space-y-1.5 pb-3 border-b border-white/10">
                <span className="text-[11px] font-semibold text-[#A1A1AA] flex items-center gap-1.5">
                  <Volume className="w-3.5 h-3.5 text-[#D4AF37]" />
                  {t.player.audioTrack}
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {hlsAudioTracks.map((atr) => {
                    const active = selectedAudioTrackId === atr.id;
                    return (
                      <button
                        key={`audio-${atr.id}`}
                        type="button"
                        {...hudButtonTouchProps}
                        onClick={(e) => {
                          e.stopPropagation();
                          bumpHudActivity();
                          if (hlsRef.current) hlsRef.current.audioTrack = atr.id;
                          setSelectedAudioTrackId(atr.id);
                          setOpenMenu(null);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between border transition-colors ${
                          active
                            ? 'bg-[#E50914]/20 border-[#E50914] text-white font-semibold'
                            : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                        }`}
                      >
                        <span className="truncate">{atr.label}</span>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-[11px] font-semibold text-[#A1A1AA]">
              {t.player.subtitleStyleLabel}
            </p>

            <div className="space-y-1.5">
              <span className="text-[11px] text-[#A1A1AA]">
                {t.player.subtitleSize}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['small', 'medium', 'large'] as SubtitleStyleConfig['fontSize'][]).map(
                  (sz) => (
                    <button
                      key={sz}
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        setSubtitleStyle({ ...subtitleStyle, fontSize: sz });
                      }}
                      className={`py-1.5 rounded-lg text-xs font-medium capitalize border ${
                        subtitleStyle.fontSize === sz
                          ? 'bg-[#E50914] border-[#E50914] text-white'
                          : 'bg-[#18181D] border-white/10 text-[#D4D4D8]'
                      }`}
                    >
                      {sz}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-[#A1A1AA]">
                {t.player.subtitleColor}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['white', 'gold'] as SubtitleStyleConfig['textColor'][]).map((col) => (
                  <button
                    key={col}
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setSubtitleStyle({ ...subtitleStyle, textColor: col });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium capitalize border ${
                      subtitleStyle.textColor === col
                        ? 'bg-[#E50914] border-[#E50914] text-white'
                        : 'bg-[#18181D] border-white/10 text-[#D4D4D8]'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-[#A1A1AA]">
                {t.player.subtitleBg}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {([0, 50, 80] as SubtitleStyleConfig['bgOpacity'][]).map((op) => (
                  <button
                    key={op}
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setSubtitleStyle({ ...subtitleStyle, bgOpacity: op });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium tabular-nums border ${
                      subtitleStyle.bgOpacity === op
                        ? 'bg-[#E50914] border-[#E50914] text-white'
                        : 'bg-[#18181D] border-white/10 text-[#D4D4D8]'
                    }`}
                  >
                    {op === 0 ? 'None' : `${op}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Scrubber & Transport Controls Bar (Overlay in true fullscreen; cinema bar in normal/theater mode) */}
        {!embedUrl && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          {...hudTouchProps}
          className={`${
            isFullscreen
              ? 'absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent'
              : 'relative shrink-0 bg-gradient-to-t from-black/95 via-black/80 to-black/30'
          } z-30 px-3 sm:px-6 lg:px-8 pt-2 [@media(orientation:landscape)_and_(max-height:520px)]:pt-1 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-4 [@media(orientation:landscape)_and_(max-height:520px)]:pb-[max(8px,env(safe-area-inset-bottom))] transition-opacity duration-300 ${
            hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="max-w-6xl mx-auto space-y-2 [@media(orientation:landscape)_and_(max-height:520px)]:space-y-1">
            {/* Netflix Red Progress Bar Scrubber */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="text-[11px] font-semibold text-white tabular-nums w-11 shrink-0 text-right">
                {formatTime(currentTime)}
              </span>
              <div
                ref={scrubTrackRef}
                onMouseMove={(e) => {
                  if (!duration || duration <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.min(
                    100,
                    Math.max(
                      0,
                      ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100
                    )
                  );
                  setScrubHover({ pct, time: (pct / 100) * duration });
                }}
                onMouseLeave={() => setScrubHover(null)}
                className="group/scrub relative flex-1 h-5 flex items-center cursor-pointer"
              >
                {scrubHover && (
                  <div
                    className="pointer-events-none absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/95 border border-white/20 text-[10px] font-bold text-white tabular-nums shadow-lg whitespace-nowrap"
                    style={{ left: `${scrubHover.pct}%` }}
                  >
                    {formatTime(scrubHover.time)}
                  </div>
                )}
                <div className="relative w-full h-1.5 group-hover/scrub:h-2 rounded-full bg-white/25 overflow-hidden transition-all">
                  <div
                    className="absolute inset-y-0 left-0 bg-white/35 rounded-full"
                    style={{ width: `${bufferedPct}%` }}
                  />
                  <div
                    className="relative h-full bg-[#E50914] rounded-full shadow-[0_0_12px_rgba(229,9,20,0.8)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#E50914] border-2 border-white shadow-md scale-90 group-hover/scrub:scale-110 transition-transform"
                  style={{ left: `${progressPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.25}
                  value={currentTime}
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                  }}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCurrentTime(val);
                    if (videoRef.current) videoRef.current.currentTime = val;
                    if (duration > 0) {
                      setScrubHover({
                        pct: Math.min(100, (val / duration) * 100),
                        time: val,
                      });
                    }
                    bumpHudActivity();
                  }}
                  onPointerUp={() => setScrubHover(null)}
                  aria-label="Movie playback progress"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="text-[11px] text-[#A1A1AA] tabular-nums w-11 shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            {/* Mobile Compact Transport & Fit/Fill Utility Row */}
            <div className="sm:hidden flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    togglePlay();
                  }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="min-w-[34px] min-h-[34px] p-1.5 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-md"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerSeekDelta(-10);
                  }}
                  aria-label={t.player.rewind10s}
                  className="px-2 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white tabular-nums"
                >
                  -10s
                </button>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerSeekDelta(10);
                  }}
                  aria-label={t.player.forward10s}
                  className="px-2 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white tabular-nums"
                >
                  +10s
                </button>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setIsMuted((prev) => !prev);
                  }}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="min-w-[34px] min-h-[34px] p-1.5 rounded-lg bg-white/10 text-white flex items-center justify-center"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {hasNext && (
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      attemptEpisodeChange(episodeNumber + 1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 text-[11px] font-semibold text-white"
                  >
                    <span>Next</span>
                    <SkipForward className="w-3 h-3 text-[#E50914]" />
                  </button>
                )}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setUseNativeControls((prev) => !prev);
                  }}
                  aria-label="Toggle native browser video controls"
                  className={`px-2 py-1.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors ${
                    useNativeControls
                      ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                      : 'bg-white/10 border-white/15 text-white'
                  }`}
                >
                  Native
                </button>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setVideoFitMode((prev) => (prev === 'fit' ? 'fill' : 'fit'));
                  }}
                  className={`px-2.5 py-1.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors ${
                    videoFitMode === 'fill'
                      ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                      : 'bg-white/10 border-white/15 text-white'
                  }`}
                >
                  {videoFitMode === 'fill' ? 'Fill' : 'Fit'}
                </button>
              </div>
            </div>

            {/* Desktop Netflix Transport Bar */}
            <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 [@media(orientation:landscape)_and_(max-height:520px)]:flex-nowrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    togglePlay();
                  }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="p-2.5 [@media(orientation:landscape)_and_(max-height:520px)]:p-1.5 rounded-full bg-[#E50914] hover:bg-[#f40612] text-white shadow-lg shadow-red-600/35 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerSeekDelta(-10);
                  }}
                  aria-label={t.player.rewind10s}
                  title={t.player.rewind10s}
                  className="inline-flex items-center gap-1 px-2.5 py-2 [@media(orientation:landscape)_and_(max-height:520px)]:px-1.5 [@media(orientation:landscape)_and_(max-height:520px)]:py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="tabular-nums">-10s</span>
                </button>

                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerSeekDelta(10);
                  }}
                  aria-label={t.player.forward10s}
                  title={t.player.forward10s}
                  className="inline-flex items-center gap-1 px-2.5 py-2 [@media(orientation:landscape)_and_(max-height:520px)]:px-1.5 [@media(orientation:landscape)_and_(max-height:520px)]:py-1 rounded-lg hover:bg-white/10 text-xs font-semibold text-white transition-colors"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="tabular-nums">+10s</span>
                </button>

                {hasPrev && (
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      attemptEpisodeChange(episodeNumber - 1);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 [@media(orientation:landscape)_and_(max-height:520px)]:px-2 [@media(orientation:landscape)_and_(max-height:520px)]:py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium text-white"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Prev</span>
                  </button>
                )}

                {hasNext && (
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      attemptEpisodeChange(episodeNumber + 1);
                    }}
                    className="inline-flex items-center gap-1 px-3.5 py-2 [@media(orientation:landscape)_and_(max-height:520px)]:px-2.5 [@media(orientation:landscape)_and_(max-height:520px)]:py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                  >
                    <span className="hidden md:inline">Next Ep</span>
                    <SkipForward className="w-3.5 h-3.5 text-[#E50914]" />
                  </button>
                )}

                <div className="flex items-center gap-2 ml-1">
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setIsMuted((prev) => !prev);
                    }}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    className="p-2 [@media(orientation:landscape)_and_(max-height:520px)]:p-1.5 rounded-lg text-white hover:bg-white/10"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                    }}
                    onChange={(e) => {
                      const nextVol = Number(e.target.value);
                      setVolume(nextVol);
                      if (nextVol > 0 && isMuted) setIsMuted(false);
                      bumpHudActivity();
                    }}
                    aria-label="Volume"
                    className="hidden md:block [@media(orientation:landscape)_and_(max-height:520px)]:hidden w-20 accent-[#E50914] cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Speed Menu */}
                <div className="relative">
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setOpenMenu((prev) => (prev === 'speed' ? null : 'speed'));
                    }}
                    className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-semibold text-white tabular-nums"
                  >
                    {playbackSpeed}x
                  </button>
                  {openMenu === 'speed' && (
                    <div
                      data-hud-control="true"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-full right-0 mb-2 w-28 rounded-xl bg-[#141418] border border-white/15 shadow-2xl py-1"
                    >
                      {([1, 1.25, 1.5, 2] as PlaybackSpeed[]).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            bumpHudActivity();
                            setPlaybackSpeed(spd);
                            setOpenMenu(null);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between tabular-nums ${
                            playbackSpeed === spd
                              ? 'text-[#E50914] font-semibold'
                              : 'text-white hover:bg-white/5'
                          }`}
                        >
                          <span>{spd}x</span>
                          {playbackSpeed === spd && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subtitles */}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setOpenMenu((prev) =>
                      prev === 'subtitles' ? null : 'subtitles'
                    );
                  }}
                  aria-label={t.player.subtitles}
                  className={`relative p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors ${
                    openMenu === 'subtitles' || selectedSubtitleId !== 'off'
                      ? 'text-[#E50914]'
                      : 'text-white'
                  }`}
                >
                  <Captions className="w-4 h-4" />
                  {availableSubtitleTracks.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                  )}
                </button>

                {/* Video Quality Selector */}
                {qualityChoices.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        setOpenMenu((prev) =>
                          prev === 'quality' ? null : 'quality'
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium text-white"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#E50914]" />
                      <span>{selectedQuality}</span>
                    </button>
                    {openMenu === 'quality' && (
                      <div
                        data-hud-control="true"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-full right-0 mb-2 w-36 rounded-xl bg-[#141418] border border-white/15 shadow-2xl py-1"
                      >
                        {qualityChoices.map((choice) => {
                          const active =
                            choice.type === 'hls'
                              ? selectedHlsLevel === choice.hlsLevelIndex
                              : selectedQuality === choice.label;
                          return (
                            <button
                              key={choice.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpHudActivity();
                                handleSelectQuality(choice);
                              }}
                              className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                                active
                                  ? 'text-[#E50914] font-semibold'
                                  : 'text-white hover:bg-white/5'
                              }`}
                            >
                              <span>{choice.label}</span>
                              {active && <Check className="w-3 h-3" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {pipSupported && (
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      void handleTogglePip();
                    }}
                    aria-label="Picture in Picture"
                    className={`p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors ${
                      isPipActive ? 'text-[#E50914]' : 'text-white'
                    }`}
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}

                <div className="relative hidden md:block [@media(orientation:landscape)_and_(max-height:520px)]:hidden">
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setOpenMenu((prev) =>
                        prev === 'shortcuts' ? null : 'shortcuts'
                      );
                    }}
                    aria-label="Keyboard shortcuts"
                    className="p-2 rounded-lg hover:bg-white/10 text-[#A1A1AA] hover:text-white"
                  >
                    <Keyboard className="w-4 h-4" />
                  </button>
                  {openMenu === 'shortcuts' && (
                    <div
                      data-hud-control="true"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-[#141418] border border-white/15 shadow-2xl p-3 text-xs space-y-1.5"
                    >
                      <div className="font-semibold text-white pb-1 border-b border-white/10">
                        Cinema Shortcuts
                      </div>
                      {[
                        ['Space / K', 'Play / Pause'],
                        ['← / → (J / L)', 'Seek ±10s'],
                        ['↑ / ↓', 'Volume'],
                        ['T', 'Theater Mode'],
                        ['M / F', 'Mute / Fullscreen'],
                      ].map(([key, action]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-[#A1A1AA]"
                        >
                          <span>{action}</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">
                            {key}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Native Browser Controls Toggle */}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setUseNativeControls((prev) => !prev);
                  }}
                  aria-label="Toggle native browser video controls"
                  title="Toggle native browser video controls"
                  className={`hidden md:inline-flex items-center px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium transition-colors ${
                    useNativeControls ? 'text-[#E50914]' : 'text-white'
                  }`}
                >
                  <span>Native</span>
                </button>

                {/* Fit / Fill Toggle */}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setVideoFitMode((prev) => (prev === 'fit' ? 'fill' : 'fit'));
                  }}
                  aria-label={
                    videoFitMode === 'fill' ? t.player.zoomFit : t.player.zoomFill
                  }
                  title={
                    videoFitMode === 'fill' ? t.player.zoomFit : t.player.zoomFill
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium transition-colors ${
                    videoFitMode === 'fill' ? 'text-[#E50914]' : 'text-white'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{videoFitMode === 'fill' ? 'Fill' : 'Fit'}</span>
                </button>

                {/* Desktop Theater Mode */}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setIsTheaterMode((prev) => !prev);
                  }}
                  aria-label={
                    isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode
                  }
                  title={
                    isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode
                  }
                  className={`p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors ${
                    isTheaterMode ? 'text-[#E50914]' : 'text-white'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                </button>

                {/* Landscape Fullscreen */}
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    void handleFullscreen();
                  }}
                  aria-label={
                    isFullscreen ? t.player.exitFullscreen : t.player.fullscreen
                  }
                  title={
                    isFullscreen ? t.player.exitFullscreen : t.player.fullscreen
                  }
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 text-white"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Below-the-Fold Movie Details, Comments & Recommended Movies */}
      {!isFullscreen && (
        <section
          id="movie-below-fold"
          aria-label="Movie details, reactions and recommendations"
          className={`relative z-10 border-t border-white/10 transition-colors duration-300 ${
            isTheaterMode ? 'bg-[#030305]' : 'bg-[#09090D]'
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8 pb-24">
            {/* Movie Summary Card + Quick Actions */}
            <div className="rounded-2xl bg-[#121218] border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <ProviderBadge provider={drama.provider} size="xs" />
                  {drama.quality && (
                    <span className="font-bold text-[#D4AF37] uppercase">
                      {drama.quality}
                    </span>
                  )}
                  {drama.year && (
                    <span className="text-[#A1A1AA] tabular-nums">{drama.year}</span>
                  )}
                  {drama.area && (
                    <span className="text-[#A1A1AA]">{drama.area}</span>
                  )}
                  {isSeriesMovie && (
                    <span className="font-bold text-[#E50914] tabular-nums">
                      EP {episodeNumber} / {totalEpisodes}
                    </span>
                  )}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {drama.title}
                </h3>
                {drama.description && (
                  <p className="text-xs sm:text-sm text-[#A1A1AA] line-clamp-2 max-w-3xl leading-relaxed">
                    {drama.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleMyList(drama)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-semibold transition-colors ${
                    isSaved
                      ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                      : 'bg-[#18181F] border-white/10 text-white hover:border-[#E50914]/70'
                  }`}
                >
                  <Bookmark
                    className={`w-3.5 h-3.5 ${
                      isSaved ? 'fill-current text-[#E50914]' : ''
                    }`}
                  />
                  <span>{isSaved ? t.player.savedMovie : t.player.saveMovie}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleLikeDrama(drama)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-semibold transition-colors ${
                    isLiked
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-[#18181F] border-white/10 text-white hover:border-red-400/60'
                  }`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      isLiked ? 'fill-current text-red-400' : ''
                    }`}
                  />
                  <span>{isLiked ? t.player.liked : t.player.like}</span>
                  {likesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums">
                      {likesCount.toLocaleString()}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#18181F] border border-white/10 hover:border-[#E50914] text-xs font-semibold text-white"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#E50914]" />
                  <span>{t.player.shareDrama}</span>
                </button>
                {hasNext && (
                  <button
                    type="button"
                    onClick={() => {
                      attemptEpisodeChange(episodeNumber + 1);
                      scrollPlayerToTop();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E50914] text-white text-xs font-bold shadow-lg"
                  >
                    <span>Next Ep {episodeNumber + 1}</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Comments & Reactions */}
              <div className="lg:col-span-7 rounded-2xl bg-[#111116] border border-white/10 overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-[#E50914]" />
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      {t.player.commentsTitle}
                      {isSeriesMovie ? ` · EP ${episodeNumber}` : ''}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-[11px] font-semibold text-[#A1A1AA] tabular-nums">
                      {comments.length}
                    </span>
                  </div>
                </div>

                <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex flex-wrap gap-2">
                  {REACTION_BUTTONS.map((rb) => (
                    <button
                      key={`inline-${rb.key}`}
                      type="button"
                      onClick={() =>
                        triggerReaction(rb.key, `${rb.emoji} ${rb.label}`)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[#E50914] text-xs font-medium text-white transition-all active:scale-95"
                    >
                      <span>{rb.emoji}</span>
                      <span>{rb.label}</span>
                      <span className="text-[11px] text-[#E50914] font-bold tabular-nums">
                        {reactions[rb.key]}
                      </span>
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const textToSend = commentInput;
                    if (!textToSend.trim()) return;
                    const playbackSec = Math.floor(
                      videoRef.current?.currentTime ?? currentTime ?? 0
                    );
                    void addEpisodeComment(
                      drama.bookId,
                      drama.provider,
                      episodeNumber,
                      textToSend,
                      playbackSec
                    ).then((ok) => {
                      if (ok) setCommentInput('');
                    });
                  }}
                  className="p-4 sm:px-5 border-b border-white/10 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={`${t.player.commentPlaceholder} (@ ${formatTime(currentTime)})`}
                    className="flex-1 px-3.5 py-2.5 rounded-full bg-[#18181D] border border-white/10 focus:border-[#E50914] text-xs text-white placeholder-[#71717A] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] px-4 py-2 rounded-full bg-[#E50914] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t.player.postComment}</span>
                  </button>
                </form>

                <div className="p-4 sm:px-5 space-y-2.5 max-h-[420px] overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-xs text-[#A1A1AA] text-center py-8">
                      {t.player.noComments}
                    </p>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={`inline-c-${c.id}`}
                        className="p-3 rounded-xl bg-[#18181D] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                          <div className="flex items-center gap-2 min-w-0">
                            {c.authorPhotoURL && !failedCommentAvatars[c.id] ? (
                              <img
                                src={c.authorPhotoURL}
                                alt={c.author}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedCommentAvatars((prev) => ({
                                    ...prev,
                                    [c.id]: true,
                                  }))
                                }
                                className="w-6 h-6 rounded-full object-cover shrink-0 border border-white/20"
                              />
                            ) : (
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{
                                  backgroundColor: c.authorColor || '#E50914',
                                }}
                              >
                                {c.authorInitials ||
                                  c.author.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="font-semibold text-white truncate">
                              {c.author}
                            </span>
                            {c.authorBadge && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/45 text-[#FDE68A] text-[9px] font-bold shrink-0">
                                <Crown className="w-2.5 h-2.5 text-[#D4AF37]" />
                                {c.authorBadge}
                              </span>
                            )}
                          </div>
                          <span className="tabular-nums shrink-0">
                            {new Date(c.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-[#E4E4E7] leading-relaxed pl-8">
                          {typeof c.videoTimestampSec === 'number' &&
                            c.videoTimestampSec > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const video = videoRef.current;
                                  if (video) {
                                    video.currentTime = c.videoTimestampSec!;
                                    setCurrentTime(c.videoTimestampSec!);
                                  }
                                }}
                                className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-[#E50914]/20 border border-[#E50914]/40 text-[10px] font-bold text-red-200 tabular-nums"
                              >
                                {formatTime(c.videoTimestampSec)}
                              </button>
                            )}
                          {c.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Multi-Episode Series Picker (if series) + Recommended Movies */}
              <div className="lg:col-span-5 space-y-6">
                {isSeriesMovie && (
                  <div className="rounded-2xl bg-[#111116] border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        <ListVideo className="w-4 h-4 text-[#D4AF37]" />
                        {t.player.episodes} ({totalEpisodes})
                      </span>
                    </div>

                    {batches.length > 1 && (
                      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                        {batches.map((b, idx) => (
                          <button
                            key={`inline-batch-${b.label}`}
                            type="button"
                            onClick={() => setDrawerBatchIdx(idx)}
                            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums border ${
                              drawerBatchIdx === idx
                                ? 'bg-[#E50914] border-[#E50914] text-white'
                                : 'bg-[#18181D] border-white/10 text-[#A1A1AA]'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-3 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                      {(batches[drawerBatchIdx]?.items ?? episodeItems).map((ep) => {
                        const active = ep.episodeNumber === episodeNumber;
                        const isWatched = watchedList.includes(ep.episodeNumber);
                        return (
                          <button
                            key={`inline-ep-${ep.chapterId}`}
                            type="button"
                            onClick={() => {
                              attemptEpisodeChange(ep.episodeNumber);
                              scrollPlayerToTop();
                            }}
                            className={`p-2 rounded-xl border text-center transition-colors ${
                              active
                                ? 'bg-[#E50914]/20 border-[#E50914] text-red-200 font-bold'
                                : isWatched
                                ? 'bg-[#181410] border-[#D4AF37]/40 text-[#D4AF37]'
                                : 'bg-[#18181D] border-white/10 text-white hover:border-[#E50914]'
                            }`}
                          >
                            <span className="text-[11px] tabular-nums">
                              {ep.episodeNumber}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inlineUpNextMovies.length > 0 && onSwitchDrama && (
                  <div className="rounded-2xl bg-[#111116] border border-white/10 p-4 space-y-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Film className="w-4 h-4 text-[#E50914]" />
                      <span>{t.retention.upNextTitle}</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                      {inlineUpNextMovies.map((rec) => {
                        const coverBroken = Boolean(brokenCoverMap[`rec:${rec.bookId}`]);
                        return (
                          <button
                            key={`rec-${rec.provider}:${rec.bookId}`}
                            type="button"
                            onClick={() => {
                              scrollPlayerToTop();
                              onSwitchDrama(rec, 1);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl bg-[#18181F] border border-white/10 hover:border-[#E50914] text-left transition-colors group"
                          >
                            {rec.cover && !coverBroken ? (
                              <img
                                src={rec.cover}
                                alt={rec.title}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenCoverMap((p) => ({
                                    ...p,
                                    [`rec:${rec.bookId}`]: true,
                                  }))
                                }
                                className="w-12 aspect-[2/3] rounded-lg object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-12 aspect-[2/3] rounded-lg bg-[#121218] border border-white/10 flex items-center justify-center shrink-0">
                                <Film className="w-4 h-4 text-[#71717A]" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <ProviderBadge provider={rec.provider} size="xs" />
                              <p className="text-xs font-bold text-white truncate group-hover:text-red-200">
                                {rec.title}
                              </p>
                              <p className="text-[10px] text-[#A1A1AA] truncate">
                                {rec.quality ? `${rec.quality} · ` : ''}
                                {rec.tags.slice(0, 2).join(', ')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Share Movie Modal */}
      <ShareDramaModal
        open={shareModalOpen}
        drama={drama}
        episodeNumber={episodeNumber}
        unlockVipMode={false}
        onClose={() => setShareModalOpen(false)}
      />

      {/* Popup-Safe Episode Redirect Continue Gate */}
      {pendingRedirectAd && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#141418] border border-white/15 p-5 shadow-2xl space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center">
              <Play className="w-5 h-5 text-[#E50914] fill-current ml-0.5" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-white">
                Episode {pendingRedirectAd.targetEpisode}
              </p>
              <p className="text-xs text-[#A1A1AA] truncate">
                {drama.title}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={pendingRedirectAd.adUrl}
                target="_blank"
                rel="noopener"
                referrerPolicy="no-referrer-when-downgrade"
                onClick={() => {
                  const ep = pendingRedirectAd.targetEpisode;
                  setPendingRedirectAd(null);
                  commitEpisodeChange(ep);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-[#E50914] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t.retention.playNow} · EP {pendingRedirectAd.targetEpisode}</span>
              </a>
              <button
                type="button"
                onClick={() => setPendingRedirectAd(null)}
                className="w-full min-h-[38px] px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#D4D4D8] transition-colors"
              >
                {t.retention.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
