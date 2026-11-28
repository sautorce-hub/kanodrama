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
  Monitor,
  PictureInPicture2,
  Keyboard,
  Zap,
  Heart,
  ChevronDown,
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
  Flame,
  Music,
  Server,
} from 'lucide-react';
import {
  ensureMeloloDecryptedUrl,
  getProviderAdapter,
  getStreamUrl,
  isStreamCached,
  prefetchStreamUrl,
} from '../services/dramaProviders';
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
import {
  shouldTriggerEpisodeRedirect,
  triggerVideoEpisodeRedirectAd,
} from '../utils/adMonetization';
import { useDramaContext } from '../context/DramaContext';
import { formatCanonicalTime } from '../i18n/helpers';
import { getWatchPath, syncEpisodePlayerSeo } from '../utils/seo';
import { ProviderBadge } from './ProviderBadge';
import { ShareDramaModal } from './ShareDramaModal';
import { EpisodeSupportModal } from './EpisodeSupportModal';
import { VideoPointsCounter } from './VideoPointsCounter';
import type {
  DramaItem,
  EpisodeItem,
  ReactionKey,
  StreamServerOption,
  StreamSource,
  SubtitleStyleConfig,
  SubtitleTrackItem,
} from '../types/drama';

interface CinemaVideoPlayerProps {
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
  { key: 'baper', emoji: '😭', label: 'Baper' },
  { key: 'emosi', emoji: '😡', label: 'Emosi' },
  { key: 'romantis', emoji: '❤️', label: 'Romantis' },
];

const WM_CORNER_CLASSES = [
  'top-28 sm:top-28 left-3 sm:left-6',
  'top-28 sm:top-24 right-14 sm:right-6',
  'bottom-24 sm:bottom-16 right-14 sm:right-6',
  'bottom-24 sm:bottom-16 left-3 sm:left-6',
] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
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
  if (norm.startsWith('tl') || norm.startsWith('fil')) return 'Filipino';
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
  if (appLang === 'id') return norm === 'id' || norm === 'in' || norm.startsWith('id_') || norm.includes('indo');
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

export const CinemaVideoPlayer: React.FC<CinemaVideoPlayerProps> = ({
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
    claimEpisodeBonus,
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
  const [hlsProgressTick, setHlsProgressTick] = useState<number>(0);
  const [selectedQuality, setSelectedQuality] = useState<string>('HD');
  const [hlsLevels, setHlsLevels] = useState<
    { index: number; label: string }[]
  >([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);
  const [loadingStream, setLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const selectedUrlRef = useRef('');

  useEffect(() => {
    selectedUrlRef.current = selectedUrl;
  }, [selectedUrl]);

  // Subtitle / CC & Audio Track Detection State
  const [hlsSubtitleTracks, setHlsSubtitleTracks] = useState<
    SubtitleTrackItem[]
  >([]);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<
    { id: number; label: string; lang: string }[]
  >([]);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<number>(0);
  const [nativeTextTrackItems, setNativeTextTrackItems] = useState<
    SubtitleTrackItem[]
  >([]);
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
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [theaterAspect, setTheaterAspect] = useState<'9:16' | '16:9'>(() =>
    drama?.provider === 'LK21' || drama?.mediaType === 'movie' ? '16:9' : '9:16'
  );
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
  const [shareModalState, setShareModalState] = useState<{
    open: boolean;
    targetEpisode: number;
    unlockMode: boolean;
  }>({ open: false, targetEpisode: episodeNumber, unlockMode: false });
  const [supportModalTargetEp, setSupportModalTargetEp] = useState<number | null>(null);

  const [commentInput, setCommentInput] = useState('');
  const [floatingBursts, setFloatingBursts] = useState<
    { id: number; text: string }[]
  >([]);
  const [activeCueText, setActiveCueText] = useState<string>('');

  const [drawerBatchIdx, setDrawerBatchIdx] = useState(0);
  const [openMenu, setOpenMenu] = useState<
    'speed' | 'quality' | 'subtitles' | 'shortcuts' | 'servers' | null
  >(null);
  const [qualityAnchor, setQualityAnchor] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
    source: 'mobile-rail' | 'desktop-bar';
  } | null>(null);
  const [viewportBounds, setViewportBounds] = useState<{
    width: number;
    height: number;
  }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hudActivityTick, setHudActivityTick] = useState(0);
  const [hudInteracting, setHudInteracting] = useState(false);
  const [nextPrefetched, setNextPrefetched] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<'back' | 'forward' | null>(
    null
  );
  const [nextEpCountdown, setNextEpCountdown] = useState<number | null>(null);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [failedCommentAvatars, setFailedCommentAvatars] = useState<
    Record<string, boolean>
  >({});
  const [upNextCoverBroken, setUpNextCoverBroken] = useState(false);
  const [wmPosIdx, setWmPosIdx] = useState(0);
  const [wmClock, setWmClock] = useState(() =>
    formatCanonicalTime(Date.now(), language)
  );

  const prefetchedEpisodeRef = useRef<string | null>(null);
  const lastSavedTickRef = useRef<number>(0);
  const appliedInitialSeekRef = useRef<boolean>(false);
  const pendingQualitySeekRef = useRef<number | null>(null);
  const rawSelectedUrlRef = useRef<string>('');
  const embedWatchTimeRef = useRef<number>(0);

  // Dynamic watermark movement & timestamp refresh every 12 seconds
  useEffect(() => {
    setWmClock(formatCanonicalTime(Date.now(), language));
    if (!drama) return;
    const interval = window.setInterval(() => {
      setWmPosIdx((prev) => (prev + 1) % WM_CORNER_CLASSES.length);
      setWmClock(formatCanonicalTime(Date.now(), language));
    }, 12000);
    return () => window.clearInterval(interval);
  }, [drama?.bookId, drama?.provider, language]);

  // Touch, pointer, pinch-to-zoom & double-tap gesture refs
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimerRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
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
    if (openMenu !== 'quality') {
      setQualityAnchor(null);
    }
  }, [openMenu]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      setViewportBounds({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!drama) return;
    const movieMode = drama.provider === 'LK21' || drama.mediaType === 'movie';
    setTheaterAspect(movieMode ? '16:9' : '9:16');
    setVideoFitMode('fit');
    setBufferedPct(0);
    setScrubHover(null);
  }, [drama?.bookId, drama?.provider, drama?.mediaType]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      if (pinchFeedbackTimerRef.current) {
        window.clearTimeout(pinchFeedbackTimerRef.current);
      }
      try {
        const ori = screen?.orientation as { unlock?: () => void } | undefined;
        ori?.unlock?.();
      } catch {
        // Ignore on unsupported browsers
      }
    };
  }, []);

  const totalEpisodes =
    episodes.length > 0 ? episodes.length : drama?.chapterCount ?? 1;
  const hasPrev = episodeNumber > 1;
  const hasNext = episodeNumber < totalEpisodes;
  const pipSupported =
    typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);

  const watchedList = drama
    ? getWatchedEpisodes(drama.bookId, drama.provider)
    : [];

  const reactions = drama
    ? getEpisodeReactions(drama.bookId, drama.provider, episodeNumber)
    : { plotTwist: 0, baper: 0, emosi: 0, romantis: 0 };

  const comments = drama
    ? getEpisodeComments(drama.bookId, drama.provider, episodeNumber)
    : [];

  const episodeItems = useMemo<EpisodeItem[]>(
    () =>
      episodes.length > 0
        ? episodes
        : Array.from({ length: totalEpisodes }, (_, i) => ({
            chapterId: `ep-${i + 1}`,
            episodeNumber: i + 1,
            title: `EP ${i + 1}`,
            isVipLocked: false,
          })),
    [episodes, totalEpisodes]
  );

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

  // Listen to fullscreen state changes without forcing landscape orientation
  useEffect(() => {
    const syncFs = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fsActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(fsActive);
      if (fsActive) {
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

  // Scroll-triggered Floating Mini-Player (Picture-in-Picture on Scroll)
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
    scrollContainer.addEventListener('scroll', updateFloatingState, {
      passive: true,
    });
    updateFloatingState();

    return () => {
      observer?.disconnect();
      scrollContainer.removeEventListener('scroll', updateFloatingState);
    };
  }, [drama?.bookId, drama?.provider, episodeNumber, isFullscreen]);

  // Related "Up Next" drama matching current genres/tags
  const upNextDrama = useMemo(() => {
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

  // Dynamic Deep-Link URL, Auto Content Language Sync & Episode SEO Sync
  useEffect(() => {
    if (!drama || typeof window === 'undefined') return;
    const effectiveLang = syncLanguageFromContent(drama) || language;
    syncEpisodePlayerSeo(drama, episodeNumber, episodeItems, effectiveLang);
    const watchPath = getWatchPath(
      drama.bookId,
      drama.title,
      drama.provider,
      drama.slug,
      episodeNumber
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
  }, [drama, episodeNumber, episodeItems, language, syncLanguageFromContent]);

  // Fetch PostgreSQL comments for active episode
  useEffect(() => {
    if (!drama) return;
    setNextEpCountdown(null);
    setUpNextCountdown(null);
    setSupportModalTargetEp(null);
    setUpNextCoverBroken(false);
    setIsOfflineReady(
      isEpisodeCachedOffline(drama.bookId, drama.provider, episodeNumber)
    );
    void syncEpisodeComments(drama.bookId, drama.provider, episodeNumber);
  }, [drama?.bookId, drama?.provider, episodeNumber, syncEpisodeComments]);

  // 3-Second Auto-Next Episode Countdown Timer
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

  // Up Next 3-Second Countdown Timer
  useEffect(() => {
    if (upNextCountdown === null || !upNextDrama || !onSwitchDrama) return;
    if (upNextCountdown <= 0) {
      const target = upNextDrama;
      setUpNextCountdown(null);
      onSwitchDrama(target, 1);
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, upNextDrama, onSwitchDrama]);

  // Fetch episodes list from matching provider if missing
  useEffect(() => {
    if (!drama || episodes.length > 0) return;
    let cancelled = false;
    const loader =
      drama.provider === 'LookSeries'
        ? fetchLookSeriesEpisodesAsEpisodeItems(drama.bookId)
        : drama.provider === 'LK21' || drama.mediaType === 'movie'
        ? fetchLk21EpisodesAsEpisodeItems(drama.bookId)
        : getProviderAdapter(drama.provider).fetchAllEpisodes(drama.bookId);
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

  const triedStreamUrlsRef = useRef<Set<string>>(new Set());

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
        const data = (await resp.json()) as {
          ok?: boolean;
          signedUrl?: string;
        };
        if (data?.ok && data.signedUrl) {
          return data.signedUrl;
        }
      }
    } catch {
      // Fall back to direct URL seamlessly
    }
    return rawUrl;
  };

  const availableServers = useMemo<StreamServerOption[]>(() => {
    if (!streamData) return [];
    if (Array.isArray(streamData.servers) && streamData.servers.length > 0) {
      return streamData.servers;
    }
    const list: StreamServerOption[] = [];
    if (streamData.streamUrl && streamData.sourceType !== 'embed') {
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

  const isAudioOnly = useMemo(() => {
    const checkUrl = rawSelectedUrlRef.current || selectedUrl;
    return Boolean(
      !embedUrl &&
        checkUrl &&
        (drama?.provider === 'AudioToon' ||
          /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(checkUrl))
    );
  }, [drama?.provider, embedUrl, selectedUrl]);

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

    if (
      drama.provider === 'MeloLoV2' &&
      failedUrl &&
      !failedUrl.includes('/decrypt')
    ) {
      const decrypted = ensureMeloloDecryptedUrl(failedUrl, '/api/mola/melolo');
      if (decrypted && !triedStreamUrlsRef.current.has(decrypted)) {
        triedStreamUrlsRef.current.add(decrypted);
        setStreamError(null);
        setVideoReady(false);
        setSelectedUrl(decrypted);
        return true;
      }
    }

    if (failedUrl && failedUrl.includes('/decrypt?')) {
      try {
        const parsedDecrypt = new URL(failedUrl, 'http://localhost');
        const unwrappedUrl = parsedDecrypt.searchParams.get('url');
        if (unwrappedUrl && /^https?:\/\//i.test(unwrappedUrl)) {
          const proxiedUnwrapped = `/api/proxy?url=${encodeURIComponent(unwrappedUrl)}`;
          if (!triedStreamUrlsRef.current.has(proxiedUnwrapped)) {
            triedStreamUrlsRef.current.add(proxiedUnwrapped);
            setStreamError(null);
            setVideoReady(false);
            setSelectedUrl(proxiedUnwrapped);
            return true;
          }
          if (!triedStreamUrlsRef.current.has(unwrappedUrl)) {
            triedStreamUrlsRef.current.add(unwrappedUrl);
            setStreamError(null);
            setVideoReady(false);
            setSelectedUrl(unwrappedUrl);
            return true;
          }
        }
      } catch {
        // Ignore malformed decrypt URL
      }
    }

    if (failedUrl.startsWith('http') && !failedUrl.includes('/api/proxy?url=')) {
      const proxied = `/api/proxy?url=${encodeURIComponent(failedUrl)}`;
      if (!triedStreamUrlsRef.current.has(proxied)) {
        triedStreamUrlsRef.current.add(proxied);
        setStreamError(null);
        setVideoReady(false);
        setSelectedUrl(proxied);
        return true;
      }
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

    const candidates = [
      ...(streamData?.qualities ?? []).filter((q) =>
        q.quality.includes('H.264')
      ),
      ...(streamData?.qualities ?? []),
    ];
    const decryptBaseForProvider = '/api/mola/melolo';
    const isMeloloVariant = drama.provider === 'MeloLoV2';
    const fallback = candidates.find((q) => {
      const candidateUrl = isMeloloVariant
        ? ensureMeloloDecryptedUrl(q.url, decryptBaseForProvider)
        : q.url;
      return Boolean(candidateUrl) && !triedStreamUrlsRef.current.has(candidateUrl);
    });
    if (fallback) {
      const fallbackUrl = isMeloloVariant
        ? ensureMeloloDecryptedUrl(fallback.url, decryptBaseForProvider)
        : fallback.url;
      rawSelectedUrlRef.current = fallbackUrl;
      triedStreamUrlsRef.current.add(fallbackUrl);
      setStreamError(null);
      setVideoReady(false);
      setSelectedUrl(fallbackUrl);
      setSelectedQuality(fallback.quality);
      return true;
    }

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

    return false;
  };

  const streamReqIdRef = useRef(0);
  const retriedWithEpisodesRef = useRef('');
  const retriedForceRefreshRef = useRef('');

  const loadStream = async (
    bookId: string,
    ep: number,
    provider: DramaItem['provider'],
    forceRefresh = false
  ) => {
    const reqId = ++streamReqIdRef.current;
    embedWatchTimeRef.current = initialTime > 0 ? initialTime : 0;
    const cachedAlready =
      !forceRefresh &&
      provider !== 'LK21' &&
      provider !== 'LookSeries' &&
      isStreamCached(bookId, ep, provider);
    if (!cachedAlready) {
      setLoadingStream(true);
    }
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
      const data =
        provider === 'LookSeries'
          ? await fetchLookSeriesStream(bookId, ep, forceRefresh, {
              chapterId: epMeta?.chapterId || epMeta?.eid,
              chapterIndex0: epMeta?.chapterIndex0,
            })
          : provider === 'LK21'
          ? await fetchLk21Stream(bookId, ep, epMeta?.eid, forceRefresh)
          : await getStreamUrl(bookId, ep, provider, {
              eid: epMeta?.eid,
              chapterId: epMeta?.chapterId,
              chapterIndex0: epMeta?.chapterIndex0,
            });
      if (reqId !== streamReqIdRef.current) return;
      setStreamData(data);

      const serverList = data.servers ?? [];
      const firstDirect = serverList.find((s) => s.type !== 'embed');
      const firstEmbed = serverList.find((s) => s.type === 'embed');

      if (data.sourceType === 'embed' && (data.embedUrl || firstEmbed?.url)) {
        const chosenEmbed = firstEmbed?.url || data.embedUrl || data.streamUrl;
        if (!chosenEmbed || !isSafeEmbedHref(chosenEmbed)) {
          throw new Error(t.player.streamUnavailable);
        }
        triedStreamUrlsRef.current.add(chosenEmbed);
        rawSelectedUrlRef.current = chosenEmbed;
        setActiveServerId(firstEmbed?.id || 'srv-embed');
        setActiveServerType('embed');
        setEmbedUrl(chosenEmbed);
        setIframeLoading(true);
      } else {
        void cacheEpisodeForOffline({
          bookId,
          provider,
          episodeNumber: ep,
          title: drama?.title,
          streamSource: data,
          episodes: episodeItems,
        }).then((saved) => {
          if (saved) setIsOfflineReady(true);
        });
        const preferred =
          data.qualities.find((q) => q.quality.includes('H.264') && q.quality.includes('720')) ??
          data.qualities.find((q) => q.quality.includes('1080')) ??
          data.qualities.find((q) => q.quality.includes('720')) ??
          data.qualities[0];
        const isMeloloProv = provider === 'MeloLoV2';
        const decryptBase = '/api/mola/melolo';
        const rawChosenUrl = isMeloloProv
          ? ensureMeloloDecryptedUrl(data.streamUrl || preferred?.url || '', decryptBase)
          : (preferred?.url ?? firstDirect?.url ?? data.streamUrl);
        rawSelectedUrlRef.current = rawChosenUrl;
        const resolvedDirectType: 'hls' | 'mp4' =
          firstDirect?.type === 'mp4' && !data.isHls
            ? 'mp4'
            : data.isHls || rawChosenUrl.toLowerCase().includes('.m3u8')
            ? 'hls'
            : 'mp4';
        const securedUrl = await signPlaybackUrl(rawChosenUrl);
        if (reqId !== streamReqIdRef.current) return;
        if (rawChosenUrl) triedStreamUrlsRef.current.add(rawChosenUrl);
        if (securedUrl) triedStreamUrlsRef.current.add(securedUrl);
        setActiveServerId(firstDirect?.id || 'srv-0');
        setActiveServerType(resolvedDirectType);
        setSelectedUrl(securedUrl);
        setSelectedQuality(
          isMeloloProv && data.streamUrl === rawChosenUrl
            ? 'HD'
            : (preferred?.quality ?? firstDirect?.quality ?? 'HD')
        );
      }
    } catch (err) {
      if (reqId !== streamReqIdRef.current) return;
      if (
        !forceRefresh &&
        (provider === 'LookSeries' || provider === 'LK21')
      ) {
        const forceKey = `${bookId}:${provider}:${ep}`;
        if (retriedForceRefreshRef.current !== forceKey) {
          retriedForceRefreshRef.current = forceKey;
          void loadStream(bookId, ep, provider, true);
          return;
        }
      }
      const offlineCached = await readOfflineCachedEpisode(bookId, provider, ep);
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
    loadStream(drama.bookId, episodeNumber, drama.provider);
    void refreshDramaStats(drama.bookId, drama.provider);
  }, [drama?.bookId, drama?.provider, episodeNumber, refreshDramaStats]);

  useEffect(() => {
    if (!drama || episodes.length === 0 || !streamError || loadingStream) return;
    const retryKey = `${drama.bookId}:${drama.provider}:${episodeNumber}`;
    if (retriedWithEpisodesRef.current === retryKey) return;
    const epMeta = episodes.find((item) => item.episodeNumber === episodeNumber);
    if (
      epMeta?.eid ||
      epMeta?.chapterId ||
      typeof epMeta?.chapterIndex0 === 'number'
    ) {
      retriedWithEpisodesRef.current = retryKey;
      void loadStream(drama.bookId, episodeNumber, drama.provider);
    }
  }, [drama?.bookId, drama?.provider, episodeNumber, episodes, streamError, loadingStream]);

  // Safety timeout: never leave player stuck if direct video/HLS stream stalls indefinitely
  useEffect(() => {
    if (
      !drama ||
      loadingStream ||
      streamError ||
      Boolean(embedUrl) ||
      !selectedUrl ||
      videoReady ||
      isAudioOnly
    ) {
      return;
    }
    const isProxiedOrHls =
      activeServerType === 'hls' ||
      selectedUrl.includes('/proxy') ||
      selectedUrl.toLowerCase().includes('.m3u8');
    const stallMs = isProxiedOrHls ? 24000 : 16000;
    const stallTimer = window.setTimeout(() => {
      if (!tryNextStreamFallback(selectedUrl)) {
        setStreamError(t.player.streamUnavailable);
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
    isAudioOnly,
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
      const effectiveDur = duration > elapsed ? duration : Math.max(180, elapsed + 60);
      onProgressUpdate?.(episodeNumber, elapsed, effectiveDur, false, {
        isPlaying: true,
        isBuffering: false,
        playbackRate: 1,
      });
    }, tickSec * 1000);
    return () => window.clearInterval(timer);
  }, [drama, embedUrl, iframeLoading, streamError, isPlaying, episodeNumber, duration, onProgressUpdate]);

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

    const isM3u8 =
      activeServerType === 'hls' ||
      selectedUrl.toLowerCase().includes('.m3u8');

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
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        syncHlsSubtitles(hls);
      });
      hls.on(Hls.Events.SUBTITLE_TRACK_LOADED, () => {
        syncHlsSubtitles(hls);
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        syncHlsAudioTracks(hls);
      });
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
                setStreamError(t.player.streamUnavailable);
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
          setStreamError(t.player.streamUnavailable);
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

  // Auto-select subtitle track matching active app language when tracks arrive (unless user manually toggled)
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
      if (matched) {
        setSelectedSubtitleId(matched.id);
      } else {
        setSelectedSubtitleId('off');
      }
    }
  }, [availableSubtitleTracks, language]);

  // Sync active HLS / native TextTrack / external VTT-SRT track whenever selectedSubtitleId changes
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
          if (!r.ok) throw new Error('Proxied subtitle fetch failed');
          return r.text();
        })
        .then((raw) => {
          if (cancelled) return;
          setExternalCues(parseVttOrSrtCues(raw));
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

  // Update activeCueText from external VTT/SRT cues as currentTime progresses
  useEffect(() => {
    if (externalCues.length === 0 || selectedSubtitleId === 'off') return;
    const match = externalCues.find(
      (c) => currentTime >= c.start && currentTime <= c.end
    );
    setActiveCueText(match?.text ?? '');
  }, [externalCues, currentTime, selectedSubtitleId]);

  // Track native textTracks cues & discovery if embedded in HLS/MP4
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

  // Zero-latency 80% Next Episode Prefetching
  useEffect(() => {
    if (!drama || !hasNext || duration <= 0) return;
    const ratio = currentTime / duration;
    const key = `${drama.provider}:${drama.bookId}:${episodeNumber + 1}`;
    if (ratio >= 0.8 && prefetchedEpisodeRef.current !== key) {
      prefetchedEpisodeRef.current = key;
      const nextEpMeta = episodeItems.find(
        (item) => item.episodeNumber === episodeNumber + 1
      );
      if (drama.provider === 'LookSeries') {
        void fetchLookSeriesStream(drama.bookId, episodeNumber + 1, false, {
          chapterId: nextEpMeta?.chapterId || nextEpMeta?.eid,
          chapterIndex0: nextEpMeta?.chapterIndex0,
        }).catch(() => {});
      } else if (drama.provider === 'LK21') {
        void fetchLk21Stream(drama.bookId, episodeNumber + 1, nextEpMeta?.eid).catch(
          () => {}
        );
      } else {
        prefetchStreamUrl(drama.bookId, episodeNumber + 1, drama.provider, {
          eid: nextEpMeta?.eid,
          chapterId: nextEpMeta?.chapterId,
          chapterIndex0: nextEpMeta?.chapterIndex0,
        });
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

  const commitEpisodeChange = (targetEp: number) => {
    if (!drama) return;
    flushProgress(undefined, true);
    onChangeEpisode(targetEp);
  };

  const attemptEpisodeChange = (
    targetEp: number,
    _options?: { fromAutoNext?: boolean }
  ) => {
    if (!drama || targetEp < 1 || targetEp > totalEpisodes) return;
    if (
      targetEp !== episodeNumber &&
      shouldTriggerEpisodeRedirect(episodeNumber, targetEp)
    ) {
      const v = videoRef.current;
      if (v && !v.paused) {
        v.pause();
        setIsPlaying(false);
      }
      setOpenMenu(null);
      setSupportModalTargetEp(targetEp);
      return;
    }
    commitEpisodeChange(targetEp);
  };

  const confirmSupportEpisodeChange = () => {
    if (!drama || supportModalTargetEp === null) return;
    const targetEp = supportModalTargetEp;
    setSupportModalTargetEp(null);
    setShowEpisodeDrawer(false);
    triggerVideoEpisodeRedirectAd(
      episodeNumber,
      targetEp,
      `${drama.provider}:${drama.bookId}`
    );
    commitEpisodeChange(targetEp);
  };

  const unlockOrientation = () => {
    try {
      const ori = screen?.orientation as { unlock?: () => void } | undefined;
      ori?.unlock?.();
    } catch {
      // Orientation unlock unsupported
    }
  };

  const showPinchToast = (message: string) => {
    if (pinchFeedbackTimerRef.current) {
      window.clearTimeout(pinchFeedbackTimerRef.current);
    }
    setPinchFeedback(message);
    pinchFeedbackTimerRef.current = window.setTimeout(() => {
      setPinchFeedback(null);
      pinchFeedbackTimerRef.current = null;
    }, 1200);
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
      // Ignore
    }
  };

  const enterFullscreenMode = async () => {
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
    } catch {
      if (video?.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
          setIsFullscreen(true);
            } catch {
          setIsFullscreen(true);
        }
      } else {
        setIsFullscreen(true);
      }
    }
  };

  const exitFullscreenMode = async () => {
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
      await enterFullscreenMode();
    } else {
      await exitFullscreenMode();
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
    setSeekFeedback(delta < 0 ? 'back' : 'forward');
    bumpHudActivity();
    window.setTimeout(() => setSeekFeedback(null), 650);
  };

  // Single Tap reveals controls if hidden (with 10s timer) or hides if already open; Double Tap seeks ±10s or toggles Play/Pause
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

    if (Date.now() - lastHudActionAtRef.current < 200) {
      return;
    }

    if (pinchActiveRef.current || Date.now() - lastPinchEndedAtRef.current < 450) {
      return;
    }

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

    // When controls are hidden, tapping the video ONLY opens controls and starts the 10s auto-hide timer
    if (!controlsVisibleRef.current) {
      bumpHudActivity();
      return;
    }

    // If a popover menu is open, tapping empty video dismisses the menu and resets the 10s timer
    if (openMenuRef.current !== null) {
      setOpenMenu(null);
      bumpHudActivity();
      return;
    }

    // Prevent immediate toggle-back if controls were just opened within the same interaction window
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

  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      pinchActiveRef.current = true;
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchTriggeredRef.current = null;
      touchStartYRef.current = null;
      return;
    }
    if (e.touches.length === 1 && !pinchActiveRef.current) {
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchStartDistRef.current) return;
    pinchActiveRef.current = true;
    const currentDist = getTouchDistance(e.touches);
    const startDist = Math.max(1, pinchStartDistRef.current);
    const ratio = currentDist / startDist;
    const delta = currentDist - startDist;

    if ((ratio >= 1.22 || delta >= 34) && pinchTriggeredRef.current !== 'out') {
      pinchTriggeredRef.current = 'out';
      setVideoFitMode('fill');
      showPinchToast(`${t.player.fullscreen} · ${t.player.zoomFill}`);
      bumpHudActivity();
      void enterFullscreenMode();
    } else if (
      (ratio <= 0.8 || delta <= -34) &&
      pinchTriggeredRef.current !== 'in'
    ) {
      pinchTriggeredRef.current = 'in';
      setVideoFitMode('fit');
      showPinchToast(t.player.zoomFit);
      bumpHudActivity();
      void exitFullscreenMode();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchEndAtRef.current = Date.now();
    if (pinchActiveRef.current) {
      lastPinchEndedAtRef.current = Date.now();
      touchStartYRef.current = null;
      if (e.touches.length === 0) {
        pinchActiveRef.current = false;
        pinchStartDistRef.current = null;
        pinchTriggeredRef.current = null;
      }
      return;
    }
    if (touchStartYRef.current === null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
    const deltaY = endY - touchStartYRef.current;
    touchStartYRef.current = null;

    if (deltaY < -65 && hasNext) {
      attemptEpisodeChange(episodeNumber + 1);
    } else if (deltaY > 65 && hasPrev) {
      attemptEpisodeChange(episodeNumber - 1);
    }
  };

  // Keyboard Shortcuts
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

      if (supportModalTargetEp !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSupportModalTargetEp(null);
        }
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
        handleFullscreen();
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
    supportModalTargetEp,
    duration,
    isPlaying,
    hasNext,
    hasPrev,
    episodeNumber,
    selectedUrl,
  ]);

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

  // Auto-fade all overlay HUD elements after 10 seconds (10000ms) untouched while playing
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
      shareModalState.open ||
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
    shareModalState.open,
    nextEpCountdown,
    upNextCountdown,
  ]);

  const revealControls = () => {
    bumpHudActivity();
  };

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

  if (!drama) return null;

  const isMovie = drama.provider === 'LK21' || drama.mediaType === 'movie';
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
    currentTime <= 30;

  const cycleSpeed = () => {
    const speeds: PlaybackSpeed[] = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
  };

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
      ? 'text-base sm:text-lg'
      : 'text-sm';
  const subtitleColorClass =
    subtitleStyle.textColor === 'gold' ? 'text-[#D4AF37]' : 'text-white';
  const subtitleBgRgba =
    subtitleStyle.bgOpacity === 0
      ? 'transparent'
      : subtitleStyle.bgOpacity === 80
      ? 'rgba(0,0,0,0.8)'
      : 'rgba(0,0,0,0.5)';

  const isFloatingMiniActive = !isFullscreen && isFloatingMini && !miniDismissed;
  const hudVisible =
    !isFloatingMiniActive &&
    (controlsVisible || !isPlaying || loadingStream);

  const scrollPlayerToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setIsFloatingMini(false);
    setMiniDismissed(false);
  };

  const inlineUpNextDramas = relatedDramas
    .filter(
      (item) =>
        !(item.bookId === drama.bookId && item.provider === drama.provider)
    )
    .slice(0, 6);

  return (
    <div
      ref={containerRef}
      onPointerMove={handleContainerPointerMove}
      className={`fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-full select-none ${
        isFullscreen
          ? 'bg-black flex flex-col justify-between overflow-hidden'
          : 'bg-[#070709] overflow-y-auto overflow-x-hidden scroll-smooth'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${drama.title} Episode ${episodeNumber}`}
    >
      {/* Primary Theater Stage (Observed for Scroll-to-Mini-Player transition) */}
      <div
        id="main-video-stage"
        ref={videoStageRef}
        className={`relative w-full h-[100dvh] max-h-[100dvh] min-h-0 bg-black overflow-hidden shrink-0 ${
          isFullscreen ? 'flex-1' : ''
        }`}
      >
      {/* Top Theater HUD Stack (Overlay so video always spans full viewport height without overlap) */}
      <div className="absolute top-0 inset-x-0 z-30 flex flex-col pointer-events-none">
        <div
          onClick={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          {...hudTouchProps}
          className={`flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8 pt-[max(10px,env(safe-area-inset-top))] pb-3 sm:py-3 [@media(orientation:landscape)_and_(max-height:520px)]:py-1.5 bg-gradient-to-b from-black/85 via-black/45 to-transparent transition-opacity duration-300 ${
            hudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
        <div className="min-w-0 flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClosePlayer();
            }}
            aria-label="Close video player"
            className="min-w-[40px] min-h-[40px] p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 hover:bg-white/20 text-white transition-colors shrink-0 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#D4AF37]">
              <ProviderBadge provider={drama.provider} size="xs" />
              <span className="tabular-nums text-white/90">
                Ep {episodeNumber} / {totalEpisodes}
              </span>
              {nextPrefetched && hasNext && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)] text-[10px] text-[var(--cd-accent-text)]">
                  <Zap className="w-2.5 h-2.5" />
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

        {/* Top Right Quick Controls (Server + PiP + Theater Mode + Fullscreen on Mobile + Aspect/Actions on Desktop) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {availableServers.length > 1 && (
            <div className="relative" data-hud-control="true">
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setOpenMenu((prev) => (prev === 'servers' ? null : 'servers'));
                }}
                aria-label="Pilih Server"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                  openMenu === 'servers' || embedUrl
                    ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-lg'
                    : 'bg-[#141418]/90 border-white/15 text-[#E4E4E7] hover:border-white/35'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {availableServers.find((s) => s.id === activeServerId)?.name || 'Server'}
                </span>
              </button>

              {openMenu === 'servers' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#111116]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                    Server Pemutaran
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
                            ? 'bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)] text-white font-semibold'
                            : 'hover:bg-white/5 text-[#E4E4E7] border border-transparent'
                        }`}
                      >
                        <span className="truncate">{srv.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold uppercase text-[#D4AF37]">
                            {srv.type === 'embed' ? 'Embed' : srv.type.toUpperCase()}
                          </span>
                          {active && <Check className="w-3.5 h-3.5 cd-accent-text" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Mobile Theater Mode Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setIsTheaterMode((prev) => !prev);
            }}
            aria-label={isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
            title={isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
            className={`lg:hidden min-w-[36px] min-h-[36px] p-2 rounded-full bg-black/50 backdrop-blur-md border flex items-center justify-center transition-colors ${
              isTheaterMode
                ? 'border-[var(--cd-accent)] cd-accent-text bg-[var(--cd-accent-soft)]'
                : 'border-white/15 text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
          </button>

          {/* Mobile PiP Button */}
          {pipSupported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                void handleTogglePip();
              }}
              aria-label="Picture in Picture"
              className={`lg:hidden min-w-[36px] min-h-[36px] p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center ${
                isPipActive ? 'cd-accent-text border-[var(--cd-accent)]' : 'text-white'
              }`}
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Fullscreen Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              void handleFullscreen();
            }}
            aria-label={isFullscreen ? t.player.exitFullscreen : t.player.fullscreen}
            className="lg:hidden min-w-[36px] min-h-[36px] p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center"
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
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setIsTheaterMode((prev) => !prev);
            }}
            aria-label={isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              isTheaterMode
                ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-lg'
                : 'bg-[#141418]/90 border-white/10 text-[#E4E4E7] hover:border-white/30'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}</span>
          </button>

          <div className="hidden md:flex items-center p-1 rounded-full bg-[#141418]/90 border border-white/10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setTheaterAspect('9:16');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                theaterAspect === '9:16'
                  ? 'cd-accent-bg text-white font-semibold'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              9:16
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setTheaterAspect('16:9');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                theaterAspect === '16:9'
                  ? 'cd-accent-bg text-white font-semibold'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Cinema
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setAutoPlayNext((prev) => !prev);
            }}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              autoPlayNext
                ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                : 'bg-[#141418]/90 border-white/10 text-[#A1A1AA]'
            }`}
          >
            {t.player.autoNext}: {autoPlayNext ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              toggleMyList(drama);
            }}
            aria-label={
              isMovie
                ? isSaved
                  ? t.player.savedMovie
                  : t.player.saveMovie
                : isSaved
                ? t.player.savedDrama
                : t.player.saveDrama
            }
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              isSaved
                ? 'bg-[#E50914]/20 border-[#E50914] text-red-200'
                : 'bg-[#141418]/90 border-white/10 text-white hover:border-[#E50914]/70'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-[#E50914]' : ''}`} />
            <span className="hidden lg:inline">
              {isMovie
                ? isSaved
                  ? t.player.savedMovie
                  : t.player.saveMovie
                : isSaved
                ? t.player.savedDrama
                : t.player.saveDrama}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              toggleLikeDrama(drama);
            }}
            aria-label={isLiked ? t.player.liked : t.player.like}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              isLiked
                ? 'bg-red-500/20 border-red-500 text-red-300'
                : 'bg-[#141418]/90 border-white/10 text-white hover:border-red-400/60'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-red-400' : ''}`} />
            <span>{isLiked ? t.player.liked : t.player.like}</span>
            {likesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums">
                {likesCount.toLocaleString()}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShareModalState({
                open: true,
                targetEpisode: episodeNumber,
                unlockMode: false,
              });
            }}
            aria-label={t.engagement.generateSpoilerCard}
            title={t.engagement.generateSpoilerCard}
            className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#141418]/90 border border-white/10 hover:border-[var(--cd-accent)] text-xs font-medium text-white whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5 cd-accent-text" />
            <span>{t.engagement.generateSpoilerCard}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowCommentsDrawer((prev) => !prev);
              setShowEpisodeDrawer(false);
            }}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              showCommentsDrawer
                ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                : 'bg-[#141418]/90 border-white/10 text-white hover:border-white/30'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>{comments.length > 0 ? comments.length : 'React'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowEpisodeDrawer((prev) => !prev);
              setShowCommentsDrawer(false);
            }}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
              showEpisodeDrawer
                ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                : 'bg-[#141418]/90 border-white/10 text-white hover:border-white/30'
            }`}
          >
            <ListVideo className="w-4 h-4" />
            <span>{t.player.episodes}</span>
          </button>
        </div>
        </div>

        {/* Watch Points Counter positioned cleanly below Top HUD row on the left */}
        {!isFloatingMiniActive && (
          <div className="px-3 sm:px-6 lg:px-8 pt-0.5 flex items-start justify-start pointer-events-none">
            <VideoPointsCounter
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              playbackRate={playbackSpeed}
              isMiniPlayer={isFloatingMiniActive}
              onNavigateRewards={onClose}
              placement="inline-left"
            />
          </div>
        )}
      </div>

      {/* Main Theater Viewport (Full width & full viewport height without horizontal padding) */}
      <div
        className="relative w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden touch-none p-0 bg-black transition-colors duration-300"
        onClick={handleViewportClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Cinema Ambient Glow Backdrop (Desktop — dims out completely in Theater Mode) */}
        <div
          className={`hidden sm:block absolute inset-0 pointer-events-none transition-opacity duration-500 ${
            isTheaterMode ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden="true"
        >
          {drama.cover && (
            <img
              src={drama.cover}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-25 blur-3xl scale-125"
            />
          )}
          <div
            className="absolute inset-0 opacity-65"
            style={{
              background:
                'radial-gradient(circle at center, var(--cd-accent-glow) 0%, rgba(9,9,11,0.92) 65%)',
            }}
          />
        </div>

        {hasPrev && (
          <button
            type="button"
            data-hud-control="true"
            {...hudButtonTouchProps}
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              attemptEpisodeChange(episodeNumber - 1);
            }}
            aria-label="Previous Episode"
            className={`hidden sm:flex absolute left-6 z-20 p-3 rounded-full bg-[#141418]/85 backdrop-blur-md border border-white/15 text-white hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)] transition-all ${
              hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <SkipBack className="w-5 h-5" />
          </button>
        )}

        {/* Stage Placeholder shown when user scrolls down to read comments/episodes */}
        {isFloatingMini && !isFullscreen && (
          <div className="relative z-10 flex flex-col items-center justify-center gap-3 p-6 text-center rounded-2xl bg-[#111115]/90 border border-white/10 max-w-sm">
            {drama.cover && (
              <img
                src={drama.cover}
                alt={drama.title}
                referrerPolicy="no-referrer"
                className="w-14 h-20 rounded-lg object-cover border border-white/15 opacity-80"
              />
            )}
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                {miniDismissed
                  ? 'Video Paused Below Fold'
                  : 'Playing in Corner Mini-Player'}
              </p>
              <p className="text-xs text-[#A1A1AA]">
                {drama.title} · EP {episodeNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollPlayerToTop();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-semibold shadow-lg"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Restore Main Player</span>
            </button>
          </div>
        )}

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
              ? `fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-[60] ${
                  theaterAspect === '9:16'
                    ? 'w-[148px] sm:w-[205px] aspect-[9/16] max-h-[44dvh]'
                    : 'w-[240px] sm:w-[340px] aspect-video'
                } rounded-2xl border border-white/25 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden transition-all duration-300 group`
              : 'relative overflow-hidden bg-black touch-none transition-all duration-300 flex items-center justify-center w-full h-full max-w-full max-h-full rounded-none border-0'
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

          {isAudioOnly && !embedUrl && !loadingStream && !streamError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#161412]/90 via-[#09090B]/95 to-black pointer-events-none">
              <div className="relative mb-4">
                {drama.cover ? (
                  <img
                    src={drama.cover}
                    alt={drama.title}
                    referrerPolicy="no-referrer"
                    className={`w-40 sm:w-48 aspect-[3/4] rounded-2xl object-cover border border-white/15 shadow-2xl ${
                      isPlaying ? 'scale-[1.02]' : ''
                    } transition-transform duration-500`}
                  />
                ) : (
                  <div className="w-40 sm:w-48 aspect-[3/4] rounded-2xl bg-[#18181B] border border-white/15 flex items-center justify-center">
                    <Music className="w-12 h-12 text-[#D4AF37]" />
                  </div>
                )}
                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/85 border border-[#D4AF37]/40 text-[11px] font-bold text-[#D4AF37] whitespace-nowrap shadow-lg">
                  <Music className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
                  Audio Drama · EP {episodeNumber}
                </span>
              </div>
              <p className="text-sm font-semibold text-white line-clamp-1 max-w-xs mt-1">
                {drama.title}
              </p>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            controls={useNativeControls}
            crossOrigin="anonymous"
            preload="metadata"
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            poster={drama.cover || undefined}
            onLoadedData={() => setVideoReady(true)}
            onProgress={() => {
              const v = videoRef.current;
              if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
              if (v.buffered.length > 0) {
                const end = v.buffered.end(v.buffered.length - 1);
                setBufferedPct(Math.min(100, Math.max(0, (end / v.duration) * 100)));
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
              if (drama) {
                void claimEpisodeBonus(drama, episodeNumber);
              }
              if (autoPlayNext && hasNext) {
                setNextEpCountdown(3);
              } else if (autoPlayNext && !hasNext && upNextDrama && onSwitchDrama) {
                setUpNextCountdown(3);
              }
            }}
            onError={() => {
              if (!embedUrl && !loadingStream && selectedUrl) {
                if (!tryNextStreamFallback(selectedUrl)) {
                  setStreamError(t.player.streamUnavailable);
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

          {/* Dynamic Moving Translucent Watermark Overlay (Stream Security — hidden in compact corner mini-player) */}
          {!isFloatingMiniActive && (
            <div
              aria-hidden="true"
              className={`absolute z-10 pointer-events-none select-none opacity-25 transition-all duration-700 px-2.5 py-1 rounded bg-black/25 text-[10px] sm:text-xs font-mono tracking-wider text-white/90 whitespace-nowrap ${WM_CORNER_CLASSES[wmPosIdx]}`}
            >
              {(
                user?.displayName?.trim() ||
                user?.email?.split('@')[0] ||
                user?.uid ||
                visitorId ||
                'guest'
              ).slice(0, 30)} · KanoDrama · {wmClock}
            </div>
          )}

          {/* Compact Corner Mini-Player Overlay Controls */}
          {isFloatingMiniActive && (
            <div
              data-hud-control="true"
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-b from-black/75 via-transparent to-black/80 p-2"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="px-2 py-0.5 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold text-[#D4AF37] tabular-nums truncate">
                  EP {episodeNumber}
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
                    title="Expand back to top"
                    className="w-7 h-7 rounded-full bg-black/70 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center"
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
                    aria-label="Close mini-player"
                    title="Dismiss mini-player"
                    className="w-7 h-7 rounded-full bg-black/70 hover:bg-red-500/80 border border-white/15 text-white flex items-center justify-center"
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
                    className="w-8 h-8 rounded-full cd-accent-bg text-white flex items-center justify-center shadow-lg"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    {hasNext && (
                      <button
                        type="button"
                        {...hudButtonTouchProps}
                        onClick={(e) => {
                          e.stopPropagation();
                          attemptEpisodeChange(episodeNumber + 1);
                        }}
                        aria-label="Next Episode"
                        className="w-7 h-7 rounded-full bg-black/70 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMuted((prev) => !prev);
                      }}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                      className="w-7 h-7 rounded-full bg-black/70 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full cd-accent-bg"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Styled Subtitle Overlay (active VTT cues or live style preview while subtitle menu open) */}
          {(activeCueText || (!isFloatingMiniActive && openMenu === 'subtitles')) && (
            <div
              className={`absolute inset-x-4 flex justify-center pointer-events-none z-20 transition-all duration-300 ${
                hudVisible ? 'bottom-28 sm:bottom-24' : 'bottom-4 sm:bottom-6'
              }`}
            >
              <div
                className={`px-3 py-1.5 rounded-lg font-medium leading-snug text-center max-w-[90%] ${subtitleFontClass} ${subtitleColorClass}`}
                style={{
                  backgroundColor: subtitleBgRgba,
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                }}
              >
                {activeCueText ||
                  `${drama.title} · Episode ${episodeNumber} Subtitle Preview`}
              </div>
            </div>
          )}

          {/* Floating Reaction Burst Animations */}
          <div className="absolute right-14 bottom-28 sm:bottom-24 pointer-events-none z-20 flex flex-col items-end gap-1">
            {floatingBursts.map((b) => (
              <span
                key={b.id}
                className="animate-reaction-float px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-xs font-semibold text-white shadow-lg"
              >
                {b.text}
              </span>
            ))}
          </div>

          {/* Pinch-to-Zoom Feedback Pill */}
          {pinchFeedback && !isFloatingMiniActive && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-xl">
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
              } flex items-center justify-center bg-white/10 backdrop-blur-[1px] pointer-events-none`}
            >
              <span className="px-3 py-1.5 rounded-full bg-black/75 text-white text-xs font-bold tabular-nums">
                {seekFeedback === 'back' ? '-10s' : '+10s'}
              </span>
            </div>
          )}

          {loadingStream && (
            <div
              onClick={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-[#09090B]/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
            >
              <Loader2 className="w-10 h-10 cd-accent-text animate-spin mb-3" />
              <p className="text-sm font-semibold text-white">
                {t.player.loadingEp} {episodeNumber}...
              </p>
            </div>
          )}

          {streamError && !loadingStream && (
            <div
              onClick={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-[#09090B]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
            >
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm font-semibold text-white max-w-xs">
                {t.player.streamUnavailable}
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1 max-w-xs leading-relaxed">
                {streamError}
              </p>
              <button
                type="button"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  loadStream(drama.bookId, episodeNumber, drama.provider);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.player.retry}
              </button>
            </div>
          )}

          {/* Netflix-Style Center Overlay Transport Controls: Rewind 10s, Play/Pause, Forward 10s */}
          {!isFloatingMiniActive &&
            !embedUrl &&
            !loadingStream &&
            !streamError &&
            selectedUrl &&
            hudVisible && (
            <div className="absolute inset-0 flex items-center justify-center gap-6 sm:gap-10 pointer-events-none z-20">
              <button
                type="button"
                data-hud-control="true"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerSeekDelta(-10);
                }}
                aria-label={t.player.rewind10s}
                title={t.player.rewind10s}
                className="pointer-events-auto flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:scale-105 active:scale-95 transition-all"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">10</span>
              </button>

              <button
                type="button"
                data-hud-control="true"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  togglePlay();
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="pointer-events-auto w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-black/65 backdrop-blur-md border border-white/30 text-white flex items-center justify-center shadow-2xl hover:bg-[#E50914] hover:border-[#E50914] hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
                )}
              </button>

              <button
                type="button"
                data-hud-control="true"
                {...hudButtonTouchProps}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerSeekDelta(10);
                }}
                aria-label={t.player.forward10s}
                title={t.player.forward10s}
                className="pointer-events-auto flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:scale-105 active:scale-95 transition-all"
              >
                <RotateCw className="w-5 h-5" />
                <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">10</span>
              </button>
            </div>
          )}

          {/* Skip Intro / Skip Recap Floating Pill (First 30s) */}
          {showSkipIntro && hudVisible && (
            <button
              type="button"
              data-hud-control="true"
              {...hudButtonTouchProps}
              onClick={(e) => {
                e.stopPropagation();
                const v = videoRef.current;
                if (v) {
                  v.currentTime = Math.min(
                    duration || v.duration || 9999,
                    v.currentTime + 15
                  );
                }
                revealControls();
              }}
              className="absolute bottom-28 sm:bottom-24 left-3 sm:left-4 z-30 px-4 py-2 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/25 text-xs font-bold text-white shadow-xl transition-all active:scale-95"
            >
              {t.player.skipIntro}
            </button>
          )}

          {/* 3-Second Corner Auto-Next Episode Countdown Card */}
          {nextEpCountdown !== null && hasNext && (
            <div
              data-hud-control="true"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className={`absolute right-3 sm:right-5 z-40 transition-all duration-300 ${
                hudVisible ? 'bottom-28 sm:bottom-24' : 'bottom-4 sm:bottom-6'
              } w-64 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-[#D4AF37]/40 p-3.5 shadow-2xl space-y-2.5`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">
                  {t.player.nextEpisodeIn}{' '}
                  <span className="text-white tabular-nums">{nextEpCountdown}s</span>
                </span>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setNextEpCountdown(null);
                  }}
                  aria-label={t.retention.cancel}
                  className="p-1 rounded-full hover:bg-white/10 text-[#A1A1AA] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs font-bold text-white truncate">
                EP {episodeNumber + 1} · {drama.title}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setNextEpCountdown(null);
                    attemptEpisodeChange(episodeNumber + 1);
                  }}
                  className="flex-1 min-h-[36px] px-3 py-1.5 rounded-full cd-accent-bg text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{t.retention.playNow}</span>
                </button>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setNextEpCountdown(null);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-[#D4D4D8]"
                >
                  {t.retention.cancel}
                </button>
              </div>
            </div>
          )}

          {/* Auto-Play Next Drama ("Up Next" 3-Second Countdown Overlay) */}
          {upNextCountdown !== null && upNextDrama && onSwitchDrama && (
            <div
              data-hud-control="true"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-full max-w-xs rounded-2xl bg-[#141418]/95 border border-white/15 p-4 space-y-3 shadow-2xl">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#D4AF37]">
                  {t.retention.upNextTitle}
                </p>

                <div className="flex items-center gap-3 text-left">
                  {upNextDrama.cover && !upNextCoverBroken && (
                    <img
                      src={upNextDrama.cover}
                      alt={upNextDrama.title}
                      referrerPolicy="no-referrer"
                      onError={() => setUpNextCoverBroken(true)}
                      className="w-16 aspect-[9/16] rounded-xl object-cover shrink-0 border border-white/15"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <ProviderBadge provider={upNextDrama.provider} size="xs" />
                    <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                      {upNextDrama.title}
                    </h3>
                    {upNextDrama.tags[0] && (
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {upNextDrama.tags[0]} · {upNextDrama.chapterCount} EP
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-[#E4E4E7] tabular-nums">
                  {t.retention.upNextPlayingIn}{' '}
                  <span className="font-extrabold cd-accent-text">
                    {upNextCountdown}s
                  </span>
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setUpNextCountdown(null);
                      onSwitchDrama(upNextDrama, 1);
                    }}
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-full cd-accent-bg text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{t.retention.playNow}</span>
                  </button>
                  <button
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      setUpNextCountdown(null);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                  >
                    {t.retention.cancel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clean Frosted-Glass Vertical Right Interaction Stack (Mobile) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          {...hudTouchProps}
          className={`sm:hidden absolute right-2 bottom-24 z-30 flex flex-col items-center gap-1.5 max-h-[calc(100%-10.5rem)] overflow-y-auto overscroll-contain py-2 px-1 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 transition-opacity duration-300 ${
            hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Auth-Gated Heart / Like Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              toggleLikeDrama(drama);
            }}
            aria-label={isLiked ? t.player.liked : t.player.like}
            className="flex flex-col items-center gap-0.5 min-w-[40px]"
          >
            <div
              className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                isLiked
                  ? 'bg-red-500 border-red-400 text-white'
                  : 'bg-white/10 border-white/15 text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-[9px] font-semibold text-white tabular-nums">
              {likesCount > 0 ? likesCount.toLocaleString() : isLiked ? t.player.liked : t.player.like}
            </span>
          </button>

          {/* Watchlist Button (Drama Watchlist + Login-Gated Movie Watchlist) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              toggleMyList(drama);
            }}
            aria-label={
              isMovie
                ? isSaved
                  ? t.player.savedMovie
                  : t.player.saveMovie
                : isSaved
                ? t.player.savedDrama
                : t.player.saveDrama
            }
            className="flex flex-col items-center gap-0.5 min-w-[40px]"
          >
            <div
              className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                isSaved
                  ? 'bg-[#E50914] border-[#E50914] text-white'
                  : 'bg-white/10 border-white/15 text-white'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </div>
            <span className="text-[9px] font-semibold text-white">
              {isMovie
                ? isSaved
                  ? t.player.savedMovie
                  : t.player.saveMovie
                : isSaved
                ? t.player.savedDrama
                : t.player.saveDrama}
            </span>
          </button>

          {/* Comment & Reaction Drawer */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowCommentsDrawer(true);
              setShowEpisodeDrawer(false);
            }}
            aria-label={t.player.commentsTitle}
            className="flex flex-col items-center gap-0.5 min-w-[40px]"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-semibold text-white tabular-nums">
              {comments.length}
            </span>
          </button>

          {/* Share / Spoiler Card */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShareModalState({
                open: true,
                targetEpisode: episodeNumber,
                unlockMode: false,
              });
            }}
            aria-label={t.engagement.generateSpoilerCard}
            title={t.engagement.generateSpoilerCard}
            className="flex flex-col items-center gap-0.5 min-w-[40px]"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-semibold text-white">
              {t.player.shareDrama}
            </span>
          </button>

          {/* Quality Selector */}
          {qualityChoices.length > 0 && (
            <div className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setQualityAnchor({
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left,
                    source: 'mobile-rail',
                  });
                  setOpenMenu((prev) =>
                    prev === 'quality' ? null : 'quality'
                  );
                }}
                aria-label={t.player.quality}
                aria-expanded={openMenu === 'quality'}
                aria-haspopup="menu"
                className={`w-10 h-10 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors ${
                  openMenu === 'quality'
                    ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] cd-accent-text'
                    : 'bg-white/10 border-white/15 text-white'
                }`}
              >
                {selectedQuality.replace('p', '')}
              </button>
            </div>
          )}

          {/* Speed */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              cycleSpeed();
            }}
            aria-label="Cycle speed"
            className="w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center text-[11px] font-bold tabular-nums"
          >
            {playbackSpeed}x
          </button>

          {/* Subtitle Track & Style Selector */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setOpenMenu((prev) =>
                prev === 'subtitles' ? null : 'subtitles'
              );
            }}
            aria-label={t.player.subtitles}
            className={`relative w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
              selectedSubtitleId !== 'off' || openMenu === 'subtitles'
                ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] cd-accent-text'
                : 'bg-white/10 border-white/15 text-white'
            }`}
          >
            <Captions className="w-4 h-4" />
            {availableSubtitleTracks.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#D4AF37] border border-black" />
            )}
          </button>

          {/* Episodes Drawer */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowEpisodeDrawer(true);
              setShowCommentsDrawer(false);
            }}
            aria-label="Open episodes"
            className="flex flex-col items-center gap-0.5 min-w-[40px]"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center">
              <ListVideo className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-[9px] font-semibold text-white tabular-nums">
              {episodeNumber}/{totalEpisodes}
            </span>
          </button>

          {/* Next Episode */}
          {hasNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                attemptEpisodeChange(episodeNumber + 1);
              }}
              aria-label="Next Episode"
              className="w-10 h-10 rounded-full cd-accent-bg text-white flex items-center justify-center shadow-lg"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {hasNext && (
          <button
            type="button"
            data-hud-control="true"
            {...hudButtonTouchProps}
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              attemptEpisodeChange(episodeNumber + 1);
            }}
            aria-label="Next Episode"
            className={`hidden sm:flex absolute right-6 z-20 p-3 rounded-full bg-[#141418]/85 backdrop-blur-md border border-white/15 text-white hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)] transition-all ${
              hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        )}

        {/* Episode Drawer: Bottom Sheet on Mobile, Side Drawer on Desktop */}
        {showEpisodeDrawer && (
          <div
            data-hud-control="true"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowEpisodeDrawer(false);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              lastTouchEndAtRef.current = Date.now();
            }}
            className="fixed inset-0 sm:bg-transparent bg-black/60 z-40 flex items-end sm:items-stretch sm:justify-end"
          >
            <aside
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
              }}
              {...hudTouchProps}
              className="w-full sm:w-80 max-h-[70dvh] sm:max-h-none sm:my-2 sm:mr-4 rounded-t-3xl sm:rounded-2xl bg-[#111115]/95 backdrop-blur-xl border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
                <span className="text-base font-bold text-white">
                  {t.player.episodes} ({totalEpisodes})
                </span>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setShowEpisodeDrawer(false);
                  }}
                  className="p-1.5 rounded-full bg-white/5 text-[#A1A1AA] hover:text-white"
                  aria-label="Close episode drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {batches.length > 1 && (
                <div className="px-3 py-2 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {batches.map((b, idx) => (
                    <button
                      key={b.label}
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        setDrawerBatchIdx(idx);
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap tabular-nums border ${
                        drawerBatchIdx === idx
                          ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                          : 'bg-[#18181D] border-white/10 text-[#A1A1AA]'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="overflow-y-auto flex-1 p-3 grid grid-cols-4 sm:grid-cols-3 gap-2 content-start pb-6">
                {(batches[drawerBatchIdx]?.items ?? episodeItems).map((ep) => {
                  const active = ep.episodeNumber === episodeNumber;
                  const isWatched = watchedList.includes(ep.episodeNumber);
                  return (
                    <button
                      key={ep.chapterId}
                      type="button"
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        attemptEpisodeChange(ep.episodeNumber);
                        setShowEpisodeDrawer(false);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition-colors ${
                        active
                          ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)] font-bold'
                          : isWatched
                          ? 'bg-[#181410] border-[#D4AF37]/40 text-[#D4AF37]'
                          : 'bg-[#18181D] border-white/10 text-white hover:border-[var(--cd-accent)]'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 text-xs tabular-nums">
                        <span>EP {ep.episodeNumber}</span>
                        {isWatched && !active && (
                          <Check className="w-3 h-3 text-[#D4AF37]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {/* Episode Quick Reactions & Comments Drawer */}
        {showCommentsDrawer && (
          <div
            data-hud-control="true"
            onClick={(e) => {
              e.stopPropagation();
              bumpHudActivity();
              setShowCommentsDrawer(false);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              lastTouchEndAtRef.current = Date.now();
            }}
            className="fixed inset-0 sm:bg-transparent bg-black/60 z-40 flex items-end sm:items-stretch sm:justify-end"
          >
            <aside
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
              }}
              {...hudTouchProps}
              className="w-full sm:w-96 max-h-[75dvh] sm:max-h-none sm:my-2 sm:mr-4 rounded-t-3xl sm:rounded-2xl bg-[#111115]/95 backdrop-blur-xl border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm sm:text-base font-bold text-white">
                  {t.player.commentsTitle} · EP {episodeNumber}
                </span>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setShowCommentsDrawer(false);
                  }}
                  className="p-1.5 rounded-full bg-white/5 text-[#A1A1AA] hover:text-white"
                  aria-label="Close reactions drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Reaction Pills */}
              <div className="px-4 py-3 border-b border-white/10 flex flex-wrap gap-2">
                {REACTION_BUTTONS.map((rb) => (
                  <button
                    key={rb.key}
                    type="button"
                    {...hudButtonTouchProps}
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      triggerReaction(rb.key, `${rb.emoji} ${rb.label}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-xs font-medium text-white transition-all active:scale-95"
                  >
                    <span>{rb.emoji}</span>
                    <span>{rb.label}</span>
                    <span className="text-[11px] cd-accent-text font-bold tabular-nums">
                      {reactions[rb.key]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Comments Feed */}
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
                              className="w-6 h-6 rounded-full object-cover shrink-0 border border-white/20"
                            />
                          ) : (
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{
                                backgroundColor: c.authorColor || '#EF4444',
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
                          {formatCanonicalTime(c.createdAt, language)}
                        </span>
                      </div>
                      <p className="text-xs text-[#E4E4E7] leading-relaxed pl-8">
                        {typeof c.videoTimestampSec === 'number' &&
                          c.videoTimestampSec > 0 && (
                            <button
                              type="button"
                              {...hudButtonTouchProps}
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpHudActivity();
                                const video = videoRef.current;
                                if (video) {
                                  video.currentTime = c.videoTimestampSec!;
                                  setCurrentTime(c.videoTimestampSec!);
                                }
                              }}
                              className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 text-[10px] font-bold cd-accent-text tabular-nums hover:brightness-125"
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

              {/* Comment Input */}
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
                className="p-3 border-t border-white/10 flex items-center gap-2 pb-[max(12px,env(safe-area-inset-bottom))]"
              >
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={t.player.commentPlaceholder}
                  className="flex-1 px-3.5 py-2 rounded-full bg-[#18181D] border border-white/10 focus:border-[var(--cd-accent)] text-xs text-white placeholder-[#71717A] focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.player.postComment}</span>
                </button>
              </form>
            </aside>
          </div>
        )}
      </div>

      {/* Subtitle Track & Appearance Popover (Shared Mobile & Desktop) */}
      {openMenu === 'subtitles' && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            bumpHudActivity();
          }}
          {...hudTouchProps}
          className="fixed bottom-20 right-3 sm:right-12 z-50 w-76 max-w-[calc(100vw-1.5rem)] max-h-[min(68dvh,calc(100dvh-6rem))] overflow-y-auto rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-4 space-y-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Captions className="w-4 h-4 cd-accent-text" />
              {t.player.subtitles}
              {loadingSubtitleTrack && (
                <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" />
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
              className="text-[#A1A1AA] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Detected Subtitle Language Tracks */}
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
                    ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-white font-semibold'
                    : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                }`}
              >
                <span>{t.player.subtitleOff}</span>
                {selectedSubtitleId === 'off' && (
                  <Check className="w-3.5 h-3.5 cd-accent-text" />
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
                        ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-white font-semibold'
                        : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                    }`}
                  >
                    <span className="truncate">{track.label}</span>
                    {active && (
                      <Check className="w-3.5 h-3.5 cd-accent-text shrink-0" />
                    )}
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

          {/* Multi-Audio Track Switcher (when HLS stream includes multiple audio tracks) */}
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
                        if (hlsRef.current) {
                          hlsRef.current.audioTrack = atr.id;
                        }
                        setSelectedAudioTrackId(atr.id);
                        setOpenMenu(null);
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between border transition-colors ${
                        active
                          ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-white font-semibold'
                          : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                      }`}
                    >
                      <span className="truncate">{atr.label}</span>
                      {active && (
                        <Check className="w-3.5 h-3.5 cd-accent-text shrink-0" />
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
                        ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
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
              {(['white', 'gold'] as SubtitleStyleConfig['textColor'][]).map(
                (col) => (
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
                        ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                        : 'bg-[#18181D] border-white/10 text-[#D4D4D8]'
                    }`}
                  >
                    {col}
                  </button>
                )
              )}
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
                      ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
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

      {/* Bottom Scrubber & Transport Bar (Overlay so video fills entire viewport height cleanly) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          bumpHudActivity();
        }}
        {...hudTouchProps}
        className={`absolute bottom-0 inset-x-0 z-30 px-3 sm:px-6 lg:px-8 pt-6 [@media(orientation:landscape)_and_(max-height:520px)]:pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-4 [@media(orientation:landscape)_and_(max-height:520px)]:pb-[max(8px,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${
          hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-6xl mx-auto space-y-2 [@media(orientation:landscape)_and_(max-height:520px)]:space-y-1">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="text-[11px] font-semibold text-white tabular-nums w-11 shrink-0 text-right">
              {formatTime(currentTime)}
            </span>
            <div
              ref={scrubTrackRef}
              onMouseMove={(e) => {
                if (!duration || duration <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
                setScrubHover({ pct, time: (pct / 100) * duration });
              }}
              onMouseLeave={() => setScrubHover(null)}
              className="group/scrub relative flex-1 h-5 flex items-center cursor-pointer"
            >
              {scrubHover && (
                <div
                  className="pointer-events-none absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-white/20 text-[10px] font-bold text-white tabular-nums shadow-lg whitespace-nowrap"
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
                  className="relative h-full bg-[#E50914] rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#E50914] border border-white shadow-md scale-90 group-hover/scrub:scale-110 transition-transform"
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
                    setScrubHover({ pct: Math.min(100, (val / duration) * 100), time: val });
                  }
                  bumpHudActivity();
                }}
                onPointerUp={() => setScrubHover(null)}
                aria-label="Video playback progress"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[11px] text-[#A1A1AA] tabular-nums w-11 shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          {/* Mobile Compact Bottom Controls & Pinch Hint */}
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

            <div className="flex items-center gap-1.5 min-w-0">
              {hasNext && (
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    attemptEpisodeChange(episodeNumber + 1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 text-[11px] font-semibold text-white shrink-0"
                >
                  <span>Next</span>
                  <SkipForward className="w-3 h-3 cd-accent-text" />
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
                    ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
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
                aria-label={videoFitMode === 'fill' ? t.player.zoomFit : t.player.zoomFill}
                className={`px-2.5 py-1.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors ${
                  videoFitMode === 'fill'
                    ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                    : 'bg-white/10 border-white/15 text-white'
                }`}
              >
                {videoFitMode === 'fill' ? 'Fill' : 'Fit'}
              </button>
            </div>
          </div>

          <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 [@media(orientation:landscape)_and_(max-height:520px)]:flex-nowrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  togglePlay();
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="p-2.5 [@media(orientation:landscape)_and_(max-height:520px)]:p-1.5 rounded-full bg-[#E50914] hover:bg-[#f40612] text-white shadow-lg transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>

              <button
                type="button"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    attemptEpisodeChange(episodeNumber + 1);
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 [@media(orientation:landscape)_and_(max-height:520px)]:px-2.5 [@media(orientation:landscape)_and_(max-height:520px)]:py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
                >
                  <span className="hidden md:inline">Next Ep</span>
                  <SkipForward className="w-3.5 h-3.5 cd-accent-text" />
                </button>
              )}

              <div className="flex items-center gap-2 ml-1">
                <button
                  type="button"
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
              <div className="relative">
                <button
                  type="button"
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
                            ? 'cd-accent-text font-semibold'
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

              {/* CC Subtitle Track & Appearance Customizer Button */}
              <button
                type="button"
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
                    ? 'cd-accent-text'
                    : 'text-white'
                }`}
              >
                <Captions className="w-4 h-4" />
                {availableSubtitleTracks.length > 0 && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                )}
              </button>

              {/* Dynamic Video Quality Selector (API + HLS Levels) */}
              {qualityChoices.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpHudActivity();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setQualityAnchor({
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        left: rect.left,
                        source: 'desktop-bar',
                      });
                      setOpenMenu((prev) =>
                        prev === 'quality' ? null : 'quality'
                      );
                    }}
                    aria-label={t.player.quality}
                    aria-expanded={openMenu === 'quality'}
                    aria-haspopup="menu"
                    className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium transition-colors ${
                      openMenu === 'quality'
                        ? 'bg-white/10 cd-accent-text'
                        : 'text-white'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 cd-accent-text" />
                    <span>{selectedQuality}</span>
                  </button>
                </div>
              )}

              {pipSupported && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    void handleTogglePip();
                  }}
                  aria-label="Picture in Picture"
                  className={`p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors ${
                    isPipActive ? 'cd-accent-text' : 'text-white'
                  }`}
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>
              )}

              <div className="relative hidden md:block [@media(orientation:landscape)_and_(max-height:520px)]:hidden">
                <button
                  type="button"
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
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-[#141418] border border-white/15 shadow-2xl p-3 text-xs space-y-1.5"
                  >
                    <div className="font-semibold text-white pb-1 border-b border-white/10">
                      Theater Shortcuts
                    </div>
                    {[
                      ['Space / K', 'Play / Pause'],
                      ['← / →', 'Skip ±10s'],
                      ['↑ / ↓', 'Volume'],
                      ['N / P', 'Next / Prev Ep'],
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

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setUseNativeControls((prev) => !prev);
                }}
                aria-label="Toggle native browser video controls"
                title="Toggle native browser video controls"
                className={`hidden md:inline-flex items-center px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium transition-colors ${
                  useNativeControls ? 'cd-accent-text' : 'text-white'
                }`}
              >
                <span>Native</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setVideoFitMode((prev) => (prev === 'fit' ? 'fill' : 'fit'));
                }}
                aria-label={videoFitMode === 'fill' ? t.player.zoomFit : t.player.zoomFill}
                title={videoFitMode === 'fill' ? t.player.zoomFit : t.player.zoomFill}
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium transition-colors ${
                  videoFitMode === 'fill' ? 'cd-accent-text' : 'text-white'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{videoFitMode === 'fill' ? 'Fill' : 'Fit'}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  setIsTheaterMode((prev) => !prev);
                }}
                aria-label={isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
                title={isTheaterMode ? t.player.exitTheaterMode : t.player.theaterMode}
                className={`p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors ${
                  isTheaterMode ? 'cd-accent-text' : 'text-white'
                }`}
              >
                <Tv className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  bumpHudActivity();
                  void handleFullscreen();
                }}
                aria-label={
                  isFullscreen ? t.player.exitFullscreen : t.player.fullscreen
                }
                title={isFullscreen ? t.player.exitFullscreen : t.player.fullscreen}
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
      </div>

      {/* Scrollable Theater Below-the-Fold Area: Triggers Floating Mini-Player on Scroll */}
      {!isFullscreen && (
        <section
          id="player-below-fold"
          aria-label="Episode discussion, episodes and recommendations"
          className="relative z-10 border-t border-white/10 bg-[#09090D]"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8 pb-24">
            {/* Compact Episode Bar + Quick Actions */}
            <div className="rounded-2xl bg-[#121218] border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <ProviderBadge provider={drama.provider} size="xs" />
                  <span className="font-bold text-[#D4AF37] tabular-nums">
                    Episode {episodeNumber} / {totalEpisodes}
                  </span>
                  <span className="text-[#71717A]">·</span>
                  <span className="text-[11px] text-[#A1A1AA]">
                    Mini-player stays pinned in corner as you scroll
                  </span>
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
                  <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-[#E50914]' : ''}`} />
                  <span>
                    {isMovie
                      ? isSaved
                        ? t.player.savedMovie
                        : t.player.saveMovie
                      : isSaved
                      ? t.player.savedDrama
                      : t.player.saveDrama}
                  </span>
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
                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-red-400' : ''}`} />
                  <span>{isLiked ? t.player.liked : t.player.like}</span>
                  {likesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums">
                      {likesCount.toLocaleString()}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setShareModalState({
                      open: true,
                      targetEpisode: episodeNumber,
                      unlockMode: false,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#18181F] border border-white/10 hover:border-[var(--cd-accent)] text-xs font-semibold text-white"
                >
                  <Share2 className="w-3.5 h-3.5 cd-accent-text" />
                  <span>{t.player.shareDrama}</span>
                </button>
                {hasNext && (
                  <button
                    type="button"
                    onClick={() => {
                      attemptEpisodeChange(episodeNumber + 1);
                      scrollPlayerToTop();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-bold shadow-lg"
                  >
                    <span>Next Ep {episodeNumber + 1}</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Live Comments & Reactions (Keep watching in floating PiP while chatting) */}
              <div className="lg:col-span-7 rounded-2xl bg-[#111116] border border-white/10 overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 cd-accent-text" />
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      {t.player.commentsTitle} · EP {episodeNumber}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-[11px] font-semibold text-[#A1A1AA] tabular-nums">
                      {comments.length}
                    </span>
                  </div>
                </div>

                {/* Quick Reactions */}
                <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex flex-wrap gap-2">
                  {REACTION_BUTTONS.map((rb) => (
                    <button
                      key={`inline-${rb.key}`}
                      type="button"
                      onClick={() =>
                        triggerReaction(rb.key, `${rb.emoji} ${rb.label}`)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-xs font-medium text-white transition-all active:scale-95"
                    >
                      <span>{rb.emoji}</span>
                      <span>{rb.label}</span>
                      <span className="text-[11px] cd-accent-text font-bold tabular-nums">
                        {reactions[rb.key]}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Inline Comment Form */}
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
                    placeholder={`${t.player.commentPlaceholder} (tags @ ${formatTime(currentTime)})`}
                    className="flex-1 px-3.5 py-2.5 rounded-full bg-[#18181D] border border-white/10 focus:border-[var(--cd-accent)] text-xs text-white placeholder-[#71717A] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] px-4 py-2 rounded-full cd-accent-bg text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t.player.postComment}</span>
                  </button>
                </form>

                {/* Inline Comments List */}
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
                                  backgroundColor: c.authorColor || '#EF4444',
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
                            {formatCanonicalTime(c.createdAt, language)}
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
                                className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 text-[10px] font-bold cd-accent-text tabular-nums hover:brightness-125"
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

              {/* Right Column: Inline Episode Picker + Up Next Dramas */}
              <div className="lg:col-span-5 space-y-6">
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
                              ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
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
                              ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)] font-bold'
                              : isWatched
                              ? 'bg-[#181410] border-[#D4AF37]/40 text-[#D4AF37]'
                              : 'bg-[#18181D] border-white/10 text-white hover:border-[var(--cd-accent)]'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1 text-[11px] tabular-nums">
                            <span>{ep.episodeNumber}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {inlineUpNextDramas.length > 0 && onSwitchDrama && (
                  <div className="rounded-2xl bg-[#111116] border border-white/10 p-4 space-y-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-[#EF4444]" />
                      <span>Up Next Series</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                      {inlineUpNextDramas.map((rec) => (
                        <button
                          key={`rec-${rec.provider}:${rec.bookId}`}
                          type="button"
                          onClick={() => {
                            scrollPlayerToTop();
                            onSwitchDrama(rec, 1);
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-xl bg-[#18181F] border border-white/10 hover:border-[var(--cd-accent)] text-left transition-colors group"
                        >
                          {rec.cover && (
                            <img
                              src={rec.cover}
                              alt={rec.title}
                              referrerPolicy="no-referrer"
                              className="w-12 aspect-[2/3] rounded-lg object-cover shrink-0 border border-white/10"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <ProviderBadge provider={rec.provider} size="xs" />
                            <p className="text-xs font-bold text-white truncate group-hover:text-[var(--cd-accent-text)]">
                              {rec.title}
                            </p>
                            <p className="text-[10px] text-[#A1A1AA] truncate">
                              {rec.chapterCount > 0 ? `${rec.chapterCount} EP · ` : ''}
                              {rec.tags.slice(0, 2).join(', ')}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Unclipped Viewport-Safe Video Resolution / Quality Popover (Shared Mobile & Desktop) */}
      {openMenu === 'quality' && qualityChoices.length > 0 && (() => {
        const vw = Math.max(320, viewportBounds.width);
        const vh = Math.max(320, viewportBounds.height);
        const isMobileRail = qualityAnchor?.source === 'mobile-rail';
        const rawRight = qualityAnchor
          ? isMobileRail
            ? vw - qualityAnchor.left + 10
            : vw - qualityAnchor.right
          : vw < 640
          ? 64
          : 96;
        const safeRight = Math.min(Math.max(12, rawRight), Math.max(12, vw - 172));
        const minBottom = isMobileRail || vw < 640 ? 92 : 68;
        const rawBottom = qualityAnchor
          ? isMobileRail
            ? vh - qualityAnchor.bottom
            : vh - qualityAnchor.top + 10
          : minBottom;
        const maxBottom = Math.max(minBottom, vh - 168);
        const safeBottom = Math.min(Math.max(minBottom, rawBottom), maxBottom);
        const safeMaxHeight = Math.max(140, Math.min(340, vh - safeBottom - 16));
        const safeMaxWidth = Math.max(150, vw - safeRight - 12);

        return (
          <>
            <div
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
                setOpenMenu(null);
                setQualityAnchor(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.stopPropagation();
                lastTouchEndAtRef.current = Date.now();
              }}
              className="fixed inset-0 z-[75] bg-black/25 sm:bg-transparent"
            />
            <div
              role="menu"
              aria-label={t.player.quality}
              onClick={(e) => {
                e.stopPropagation();
                bumpHudActivity();
              }}
              {...hudTouchProps}
              style={{
                right: `${safeRight}px`,
                bottom: `${safeBottom}px`,
                maxHeight: `${safeMaxHeight}px`,
                maxWidth: `${safeMaxWidth}px`,
              }}
              className="fixed z-[80] w-44 rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 shrink-0">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5 truncate">
                  <Settings className="w-3.5 h-3.5 cd-accent-text shrink-0" />
                  <span className="truncate">{t.player.quality}</span>
                </span>
                <button
                  type="button"
                  {...hudButtonTouchProps}
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpHudActivity();
                    setOpenMenu(null);
                    setQualityAnchor(null);
                  }}
                  aria-label="Close quality menu"
                  className="p-0.5 rounded-md text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-1.5 space-y-1 overflow-y-auto overscroll-contain">
                {qualityChoices.map((choice) => {
                  const active =
                    choice.type === 'hls'
                      ? selectedHlsLevel === choice.hlsLevelIndex
                      : selectedQuality === choice.label;
                  return (
                    <button
                      key={choice.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      {...hudButtonTouchProps}
                      onClick={(e) => {
                        e.stopPropagation();
                        bumpHudActivity();
                        handleSelectQuality(choice);
                      }}
                      className={`w-full min-h-[38px] px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 border transition-colors ${
                        active
                          ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-white font-semibold'
                          : 'bg-transparent border-transparent text-[#E4E4E7] hover:bg-white/10 active:bg-white/15'
                      }`}
                    >
                      <span className="truncate">{choice.label}</span>
                      {active && (
                        <Check className="w-3.5 h-3.5 cd-accent-text shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* Share & Share-to-Unlock Modal inside Player */}
      <ShareDramaModal
        open={shareModalState.open}
        drama={drama}
        episodeNumber={shareModalState.targetEpisode}
        unlockVipMode={shareModalState.unlockMode}
        onUnlockSuccess={() => {
          commitEpisodeChange(shareModalState.targetEpisode);
          setShowEpisodeDrawer(false);
        }}
        onClose={() =>
          setShareModalState((prev) => ({ ...prev, open: false }))
        }
      />

      {/* KanoDrama Support Modal on Redirect Episode Transition */}
      <EpisodeSupportModal
        open={supportModalTargetEp !== null}
        drama={drama}
        targetEpisode={supportModalTargetEp ?? episodeNumber + 1}
        totalEpisodes={totalEpisodes}
        onConfirmContinue={confirmSupportEpisodeChange}
        onCancel={() => setSupportModalTargetEp(null)}
      />
    </div>
  );
};
