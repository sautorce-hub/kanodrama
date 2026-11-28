import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Plus,
  Check,
  Crown,
  AlertCircle,
  RotateCcw,
  Loader2,
  Share2,
  Eye,
  Clock,
  Star,
  FolderOpen,
  Heart,
  ChevronRight,
  Clapperboard,
} from 'lucide-react';
import { getProviderAdapter } from '../services/dramaProviders';
import {
  fetchLk21Detail,
  fetchLk21EpisodesAsEpisodeItems,
  fetchLookSeriesDetail,
  fetchLookSeriesEpisodesAsEpisodeItems,
  movieToDramaItem,
} from '../services/movieService';
import { useDramaContext } from '../context/DramaContext';
import { ProviderBadge } from './ProviderBadge';
import { ShareDramaModal } from './ShareDramaModal';
import { DetailPageSkeleton } from './SkeletonCard';
import { getProviderRouteSlug, normalizeMediaProviderName } from '../constants/providerLogos';
import { buildOgImageEndpointUrl, DEFAULT_SITE_ORIGIN } from '../i18n/helpers';
import {
  buildDramaFallbackDescription,
  cleanSeoDescription,
  formatPlaybackClock,
  getDramaPath,
  getSeoOrigin,
  getWatchPath,
  saveDramaLookupCache,
  slugifyDramaTitle,
  syncDramaDocumentSeo,
} from '../utils/seo';
import type { DramaItem, EpisodeItem, MediaProviderName } from '../types/drama';

interface DramaDetailPageProps {
  bookId: string;
  providerHint?: MediaProviderName;
  initialDrama?: DramaItem | null;
  initialEpisodes?: EpisodeItem[];
  initialNotFound?: boolean;
  relatedDramas?: DramaItem[];
  onBackHome: () => void;
  onSelectTag?: (tag: string) => void;
  onSelectDrama?: (drama: DramaItem) => void;
  onPlayEpisode: (
    drama: DramaItem,
    episodeNumber: number,
    episodesList: EpisodeItem[],
    startAtSeconds?: number
  ) => void;
}

const BATCH_SIZE = 30;

function formatFallbackTitleFromIdOrSlug(rawId: string, defaultLabel: string): string {
  const cleaned = rawId.trim();
  if (!cleaned) return defaultLabel;
  if (cleaned.includes('-') && !/^\d+$/.test(cleaned)) {
    return cleaned
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return defaultLabel;
}

export const DramaDetailPage: React.FC<DramaDetailPageProps> = ({
  bookId,
  providerHint,
  initialDrama = null,
  initialEpisodes = [],
  initialNotFound = false,
  relatedDramas = [],
  onBackHome,
  onSelectTag,
  onSelectDrama,
  onPlayEpisode,
}) => {
  const {
    language,
    t,
    syncLanguageFromContent,
    isDramaSaved,
    toggleMyList,
    isDramaLiked,
    getDramaLikesCount,
    refreshDramaStats,
    toggleLikeDrama,
    watchlistFolders,
    getDramaFolderId,
    assignDramaToFolder,
    getResumePoint,
    getWatchedEpisodes,
    getDramaRating,
    setDramaRating,
  } = useDramaContext();

  const resolvedProvider: MediaProviderName = normalizeMediaProviderName(
    initialDrama?.provider ?? providerHint ?? 'DramaBoxV2'
  );

  const [detail, setDetail] = useState<DramaItem | null>(initialDrama);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>(initialEpisodes);
  const [loading, setLoading] = useState<boolean>(!initialDrama && !initialNotFound);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState(0);
  const [posterStage, setPosterStage] = useState<'primary' | 'proxy' | 'og' | 'failed'>(() =>
    initialDrama?.cover?.trim() ? 'primary' : 'og'
  );
  const [hoverStar, setHoverStar] = useState<number>(0);
  const [failedRecCovers, setFailedRecCovers] = useState<Record<string, number>>({});
  const [fallbackRelated, setFallbackRelated] = useState<DramaItem[]>([]);

  const [shareModalState, setShareModalState] = useState<{
    open: boolean;
    episode: number;
    unlockMode: boolean;
  }>({ open: false, episode: 1, unlockMode: false });

  const activeReqIdRef = useRef(0);
  const loadedItemKeyRef = useRef<string>('');
  const detailRef = useRef<DramaItem | null>(detail);
  detailRef.current = detail;

  const loadDetailAndEpisodes = async (
    id: string,
    provider: MediaProviderName,
    baseDrama: DramaItem | null,
    silentRefresh = false
  ) => {
    const reqId = ++activeReqIdRef.current;
    if (!silentRefresh) {
      setLoading(true);
    }
    setError(null);
    const watchdogTimer = window.setTimeout(() => {
      if (reqId === activeReqIdRef.current) {
        setLoading(false);
      }
    }, 16000);

    try {
      const isLookSeries =
        provider === 'LookSeries' || /^ls-([^-/]+)/i.test(id);
      if (
        provider === 'LK21' ||
        isLookSeries ||
        baseDrama?.mediaType === 'movie'
      ) {
        const [movieRes, epsRes] = isLookSeries
          ? await Promise.allSettled([
              fetchLookSeriesDetail(id),
              fetchLookSeriesEpisodesAsEpisodeItems(id),
            ])
          : await Promise.allSettled([
              fetchLk21Detail(id),
              fetchLk21EpisodesAsEpisodeItems(id),
            ]);
        if (reqId !== activeReqIdRef.current) return;

        const eps = epsRes.status === 'fulfilled' ? epsRes.value : [];
        let mergedMovie = baseDrama;
        if (movieRes.status === 'fulfilled' && movieRes.value) {
          const converted = movieToDramaItem(movieRes.value, eps.length || 1);
          mergedMovie = baseDrama
            ? {
                ...baseDrama,
                ...converted,
                slug: converted.slug || baseDrama.slug,
                previewStreamUrl:
                  converted.previewStreamUrl || baseDrama.previewStreamUrl,
                tags:
                  converted.tags.length > 0 ? converted.tags : baseDrama.tags,
              }
            : converted;
          setDetail(mergedMovie);
          saveDramaLookupCache(mergedMovie);
        } else if (!mergedMovie && eps.length > 0) {
          const fallbackTitle = formatFallbackTitleFromIdOrSlug(id, 'Featured Movie');
          const resolvedMovieProvider = isLookSeries ? 'LookSeries' : 'LK21';
          mergedMovie = {
            bookId: id,
            slug: id,
            title: fallbackTitle,
            cover: '',
            description: buildDramaFallbackDescription({
              title: fallbackTitle,
              providerName: resolvedMovieProvider,
              episodeCount: eps.length,
              isMovie: true,
              lang: language,
            }),
            chapterCount: eps.length,
            tags: [],
            isVip: false,
            provider: resolvedMovieProvider,
            mediaType: 'movie',
          };
          setDetail(mergedMovie);
        }

        if (epsRes.status === 'fulfilled') {
          setEpisodes(eps);
          if (mergedMovie && !/^\/[a-z0-9_]+\/watch\//i.test(window.location.pathname)) {
            const effectiveLang = syncLanguageFromContent(
              mergedMovie,
              isLookSeries || mergedMovie.provider === 'LK21' ? 'id' : undefined
            );
            syncDramaDocumentSeo(mergedMovie, eps, effectiveLang);
          } else if (!mergedMovie && movieRes.status === 'rejected') {
            setError(
              movieRes.reason instanceof Error
                ? movieRes.reason.message
                : t.ui.detailFailed
            );
          }
        } else {
          setError(
            epsRes.reason instanceof Error
              ? epsRes.reason.message
              : t.ui.episodesFailed
          );
        }
        return;
      }

      const adapter = getProviderAdapter(provider);
      const [detailRes, episodesRes] = await Promise.allSettled([
        adapter.fetchDetail(id),
        adapter.fetchAllEpisodes(id),
      ]);
      if (reqId !== activeReqIdRef.current) return;

      const resolvedEps =
        episodesRes.status === 'fulfilled' ? episodesRes.value : [];
      let mergedDrama = baseDrama;
      if (detailRes.status === 'fulfilled' && detailRes.value) {
        mergedDrama = baseDrama
          ? {
              ...baseDrama,
              ...detailRes.value,
              slug: detailRes.value.slug || baseDrama.slug,
              previewStreamUrl:
                detailRes.value.previewStreamUrl || baseDrama.previewStreamUrl,
              tags:
                detailRes.value.tags.length > 0
                  ? detailRes.value.tags
                  : baseDrama.tags,
            }
          : detailRes.value;
        setDetail(mergedDrama);
        saveDramaLookupCache(mergedDrama);
      } else if (!mergedDrama && resolvedEps.length > 0) {
        const fallbackTitle = formatFallbackTitleFromIdOrSlug(
          id,
          `${provider} Series`
        );
        mergedDrama = {
          bookId: id,
          title: fallbackTitle,
          cover: '',
          description: buildDramaFallbackDescription({
            title: fallbackTitle,
            providerName: provider,
            episodeCount: resolvedEps.length,
            isMovie: false,
            lang: language,
          }),
          chapterCount: resolvedEps.length,
          tags: [],
          isVip: false,
          provider,
        };
        setDetail(mergedDrama);
      }

      if (episodesRes.status === 'fulfilled') {
        setEpisodes(resolvedEps);
        if (mergedDrama && !/^\/[a-z0-9_]+\/watch\//i.test(window.location.pathname)) {
          const effectiveLang = syncLanguageFromContent(mergedDrama);
          syncDramaDocumentSeo(mergedDrama, resolvedEps, effectiveLang);
        } else if (!mergedDrama && detailRes.status === 'rejected') {
          setError(
            detailRes.reason instanceof Error
              ? detailRes.reason.message
              : t.ui.detailFailed
          );
        }
      } else {
        setError(
          episodesRes.reason instanceof Error
            ? episodesRes.reason.message
            : t.ui.episodesFailed
        );
      }
    } catch (err) {
      if (reqId !== activeReqIdRef.current) return;
      setError(
        err instanceof Error ? err.message : t.ui.detailFailed
      );
    } finally {
      window.clearTimeout(watchdogTimer);
      if (reqId === activeReqIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const itemKey = `${resolvedProvider}:${bookId}`;
    const isSameItem = loadedItemKeyRef.current === itemKey;
    loadedItemKeyRef.current = itemKey;

    if (!isSameItem) {
      setDetail(initialDrama);
      setEpisodes(initialEpisodes);
      setSelectedBatch(0);
      setPosterStage(initialDrama?.cover?.trim() ? 'primary' : 'og');
      setError(null);
    }

    const activeDrama = isSameItem ? detailRef.current ?? initialDrama : initialDrama;
    if (activeDrama) {
      saveDramaLookupCache(activeDrama);
      const effectiveLang = syncLanguageFromContent(
        activeDrama,
        activeDrama.provider === 'LK21' || activeDrama.provider === 'LookSeries'
          ? 'id'
          : undefined
      );
      if (!/^\/[a-z0-9_]+\/watch\//i.test(window.location.pathname)) {
        syncDramaDocumentSeo(
          activeDrama,
          isSameItem ? episodes : initialEpisodes,
          effectiveLang
        );
      }
    }
    if (initialNotFound && !activeDrama) {
      setLoading(false);
      return;
    }
    const silentRefresh = Boolean(
      (isSameItem && detailRef.current) ||
        (activeDrama && initialEpisodes.length > 0)
    );
    void loadDetailAndEpisodes(
      bookId,
      resolvedProvider,
      activeDrama,
      silentRefresh
    );
    if (!isSameItem) {
      void refreshDramaStats(bookId, resolvedProvider);
    }
  }, [
    bookId,
    resolvedProvider,
    initialDrama?.bookId,
    initialDrama?.provider,
    initialNotFound,
    refreshDramaStats,
  ]);

  useEffect(() => {
    const rawCover = (detail?.cover || '').trim();
    if (!rawCover) {
      setPosterStage('og');
      return;
    }
    setPosterStage('primary');
  }, [detail?.bookId, detail?.cover]);

  useEffect(() => {
    if (detail) {
      saveDramaLookupCache(detail);
      const effectiveLang = syncLanguageFromContent(
        detail,
        detail.provider === 'LK21' || detail.provider === 'LookSeries'
          ? 'id'
          : undefined
      );
      const isWatchPathname = /^\/[a-z0-9_]+\/watch\//i.test(
        window.location.pathname
      );
      if (!isWatchPathname) {
        syncDramaDocumentSeo(detail, episodes, effectiveLang);
      }
      const canonicalPath = getDramaPath(
        detail.bookId,
        detail.title,
        detail.provider,
        detail.slug
      );
      if (isWatchPathname) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.delete('drama');
      params.delete('book_id');
      params.delete('bookId');
      params.delete('id');
      params.delete('provider');
      const nextSearch = params.toString() ? `?${params.toString()}` : '';
      const nextUrl = `${canonicalPath}${nextSearch}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const prevState =
        window.history.state && typeof window.history.state === 'object'
          ? (window.history.state as Record<string, unknown>)
          : {};
      const resolvedSlug = detail.slug || slugifyDramaTitle(detail.title);
      if (
        currentUrl !== nextUrl ||
        prevState.bookId !== detail.bookId ||
        prevState.provider !== detail.provider
      ) {
        window.history.replaceState(
          {
            ...prevState,
            bookId: detail.bookId,
            provider: detail.provider,
            slug: resolvedSlug,
          },
          '',
          nextUrl
        );
      }
    }
  }, [detail, episodes, language]);

  const batches = useMemo(() => {
    const groups: { label: string; items: EpisodeItem[] }[] = [];
    for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
      const slice = episodes.slice(i, i + BATCH_SIZE);
      groups.push({
        label: `${slice[0]?.episodeNumber ?? i + 1}–${
          slice[slice.length - 1]?.episodeNumber ?? i + slice.length
        }`,
        items: slice,
      });
    }
    return groups;
  }, [episodes]);

  const activeBatchItems = batches[selectedBatch]?.items ?? [];

  useEffect(() => {
    if (!detail || relatedDramas.length >= 6) return;
    let active = true;
    const isMovie =
      detail.mediaType === 'movie' ||
      detail.provider === 'LK21' ||
      detail.provider === 'LookSeries';
    const genreParam = detail.tags?.[0]
      ? `&genre=${encodeURIComponent(detail.tags[0])}`
      : '';
    const endpoint = isMovie
      ? '/api/lk21/home'
      : `/api/catalog/filter?limit=12${genreParam}`;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        const collected: DramaItem[] = [];
        if (isMovie && Array.isArray(json.rows)) {
          for (const row of json.rows as Array<{ items?: Array<Record<string, unknown>> }>) {
            for (const m of row.items || []) {
              const slug = String(m.slug || '').trim();
              const title = String(m.title || '').trim();
              if (!slug || !title) continue;
              collected.push({
                bookId: slug,
                slug,
                title,
                cover: String(m.poster || m.cover || m.coverHz || ''),
                description: String(m.synopsis || m.description || ''),
                chapterCount: Number(m.chapterCount) || 1,
                tags: Array.isArray(m.genres) ? (m.genres as string[]) : [],
                isVip: false,
                provider: /^ls-/i.test(slug) ? 'LookSeries' : 'LK21',
                mediaType: 'movie',
                year: m.year ? String(m.year) : undefined,
                quality: m.quality ? String(m.quality) : 'HD',
              });
              if (collected.length >= 12) break;
            }
            if (collected.length >= 12) break;
          }
        } else if (Array.isArray(json.items)) {
          for (const item of json.items as Array<Record<string, unknown>>) {
            const id = String(item.bookId || item.dramaId || '').trim();
            const title = String(item.title || item.bookName || '').trim();
            if (!id || !title) continue;
            collected.push({
              bookId: id,
              slug: item.slug ? String(item.slug) : undefined,
              title,
              cover: String(item.cover || ''),
              description: String(item.description || ''),
              chapterCount: Number(item.chapterCount) || 1,
              tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
              isVip: Boolean(item.isVip),
              provider: normalizeMediaProviderName(String(item.provider || 'DramaBoxV2')),
            });
          }
        }
        if (collected.length > 0) {
          setFallbackRelated(collected);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [detail?.bookId, detail?.provider, relatedDramas.length]);

  const recommendedDramas = useMemo(() => {
    const pool = [...relatedDramas, ...fallbackRelated];
    if (!detail || pool.length === 0) {
      return [];
    }
    const detailTags = new Set(
      (detail.tags ?? []).map((tg) => tg.trim().toLowerCase()).filter(Boolean)
    );
    const seen = new Set<string>();
    const scored: { item: DramaItem; score: number }[] = [];
    for (const candidate of pool) {
      if (!candidate?.bookId || !candidate?.title) continue;
      if (
        candidate.bookId === detail.bookId &&
        candidate.provider === detail.provider
      ) {
        continue;
      }
      const key = `${candidate.provider}:${candidate.bookId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let score = 0;
      if (candidate.provider === detail.provider) score += 2;
      if (detailTags.size > 0 && Array.isArray(candidate.tags)) {
        for (const tg of candidate.tags) {
          if (detailTags.has(tg.trim().toLowerCase())) {
            score += 3;
          }
        }
      }
      scored.push({ item: candidate, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map((s) => s.item);
  }, [detail, relatedDramas, fallbackRelated]);
  const resumePoint = detail
    ? getResumePoint(detail.bookId, detail.provider)
    : null;
  const watchedList = detail
    ? getWatchedEpisodes(detail.bookId, detail.provider)
    : [];
  const isSaved = detail
    ? isDramaSaved(detail.bookId, detail.provider)
    : false;
  const isLiked = detail
    ? isDramaLiked(detail.bookId, detail.provider)
    : false;
  const likesCount = detail
    ? getDramaLikesCount(detail.bookId, detail.provider)
    : 0;
  const userRating = detail
    ? getDramaRating(detail.bookId, detail.provider)
    : 0;
  const currentFolderId = detail
    ? getDramaFolderId(detail.bookId, detail.provider)
    : 'all';

  if (loading && !detail) {
    return <DetailPageSkeleton />;
  }

  if (!detail) {
    return (
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16">
        <div className="max-w-lg mx-auto p-8 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">{t.detail.notFoundTitle}</h1>
          <p className="text-sm text-[#A1A1AA] mt-2">
            {error || t.detail.notFoundDesc}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                void loadDetailAndEpisodes(
                  bookId,
                  resolvedProvider,
                  initialDrama
                )
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold"
            >
              <RotateCcw className="w-4 h-4" />
              {t.player.retry}
            </button>
            <a
              href={`${DEFAULT_SITE_ORIGIN}/`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                e.preventDefault();
                onBackHome();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-white text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.sections.backToHome}
            </a>
          </div>
        </div>
      </section>
    );
  }

  const totalEpisodeCount =
    episodes.length > 0 ? episodes.length : detail.chapterCount;
  const isMovieItem =
    detail.mediaType === 'movie' ||
    detail.provider === 'LK21' ||
    detail.provider === 'LookSeries';
  const isSingleMovie = isMovieItem && totalEpisodeCount <= 1;
  const siteOrigin = getSeoOrigin();
  const rawCoverUrl = (detail.cover || '').trim();
  const fallbackOgPoster = buildOgImageEndpointUrl(
    detail.cover,
    siteOrigin,
    detail.title
  );
  const proxyCoverUrl =
    rawCoverUrl.startsWith('http://') || rawCoverUrl.startsWith('https://')
      ? `/api/proxy?url=${encodeURIComponent(rawCoverUrl)}`
      : '';
  const activePosterUrl =
    posterStage === 'primary' && rawCoverUrl
      ? rawCoverUrl
      : posterStage === 'proxy' && proxyCoverUrl
      ? proxyCoverUrl
      : posterStage !== 'failed' && fallbackOgPoster
      ? fallbackOgPoster
      : '';
  const handlePosterError = () => {
    setPosterStage((prev) => {
      if (prev === 'primary') {
        return proxyCoverUrl ? 'proxy' : fallbackOgPoster ? 'og' : 'failed';
      }
      if (prev === 'proxy') {
        return fallbackOgPoster ? 'og' : 'failed';
      }
      return 'failed';
    });
  };
  const backHref = isMovieItem ? '/movies' : '/';
  const provRouteSlug = getProviderRouteSlug(detail.provider);
  const sectionCrumbHref = isMovieItem ? '/movies' : `/provider/${provRouteSlug}`;
  const sectionCrumbLabel = isMovieItem ? t.nav.movies : detail.provider;
  const durationLabelText =
    detail.duration || (!isSingleMovie ? t.detail.shortEpDuration : '');
  const watchEp = isSingleMovie ? 1 : resumePoint?.episode ?? 1;
  const watchHref = getWatchPath(
    detail.bookId,
    detail.title,
    detail.provider,
    detail.slug,
    watchEp
  );
  const ep1WatchHref = getWatchPath(
    detail.bookId,
    detail.title,
    detail.provider,
    detail.slug,
    1
  );

  return (
    <article
      className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-4 pb-24"
      itemScope
      itemType={
        isSingleMovie
          ? 'https://schema.org/Movie'
          : 'https://schema.org/TVSeries'
      }
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2.5 mb-3">
        <a
          href={`${DEFAULT_SITE_ORIGIN}${backHref}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            onBackHome();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs sm:text-sm font-medium text-white transition-colors shrink-0 whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4 cd-accent-text shrink-0" />
          <span>{t.sections.backToBrowse}</span>
        </a>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleMyList(detail)}
            aria-label={isSaved ? t.hero.inList : t.hero.addToList}
            className={`sm:hidden inline-flex items-center justify-center w-11 h-11 rounded-full border transition-colors ${
              isSaved
                ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                : 'bg-[var(--cd-surface)] border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-white'
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() =>
              setShareModalState({
                open: true,
                episode: resumePoint?.episode ?? 1,
                unlockMode: false,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[38px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white transition-colors shrink-0 whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5 cd-accent-text shrink-0" />
            <span>{t.engagement.generateSpoilerCard}</span>
          </button>
        </div>
      </div>

      {/* Subtle Single-Line Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-[#A1A1AA] min-w-0 overflow-hidden mb-4 px-1"
      >
        <a
          href={`${DEFAULT_SITE_ORIGIN}/`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            onBackHome();
          }}
          className="hover:text-white transition-colors shrink-0 whitespace-nowrap"
        >
          {t.nav.home}
        </a>
        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
        <a
          href={`${DEFAULT_SITE_ORIGIN}${sectionCrumbHref}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('kd:navigate-path', {
                detail: { path: sectionCrumbHref },
              })
            );
          }}
          className="text-[#D4AF37] hover:underline whitespace-nowrap shrink-0"
        >
          {sectionCrumbLabel}
        </a>
        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
        <span className="text-white/90 font-medium truncate">
          {detail.title}
        </span>
      </nav>

      {/* Hero Detail Card with Centered Poster & Dynamic Poster Blur Backdrop */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-[#0B0B0F] border border-white/12 shadow-[0_24px_70px_rgba(0,0,0,0.78)] mb-6 sm:mb-8">
        {/* Ambient Blurred Backdrop Sourced Directly from the Drama Poster */}
        {activePosterUrl ? (
          <img
            src={activePosterUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={handlePosterError}
            className="absolute inset-0 w-full h-full object-cover object-center scale-[1.65] blur-[54px] opacity-65 saturate-[1.5] pointer-events-none select-none transition-opacity duration-500"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(225,29,72,0.22),transparent_60%)] pointer-events-none"
          />
        )}
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(11,11,15,0.08)_0%,rgba(11,11,15,0.68)_58%,rgba(11,11,15,0.97)_100%)] pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0B0B0F]/60 to-[#0B0B0F] pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 px-4 pt-7 pb-6 sm:px-8 sm:pt-10 sm:pb-9 lg:px-12">
          <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
            {/* Centered Poster / Artwork with Ambient Glow Halo */}
            <div className="relative mb-5 sm:mb-6 flex items-center justify-center">
              {activePosterUrl && (
                <img
                  src={activePosterUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] object-cover rounded-[28px] blur-2xl opacity-65 saturate-150 pointer-events-none select-none"
                />
              )}
              <a
                href={`${DEFAULT_SITE_ORIGIN}${watchHref}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onPlayEpisode(
                    detail,
                    watchEp,
                    episodes,
                    resumePoint?.currentTime ?? 0
                  );
                }}
                aria-label={detail.title}
                className="group relative block w-44 sm:w-52 md:w-56 aspect-[2/3] rounded-2xl overflow-hidden bg-[#18181D] ring-1 ring-white/25 shadow-[0_22px_56px_rgba(0,0,0,0.9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)]"
              >
                {activePosterUrl ? (
                  <img
                    src={activePosterUrl}
                    alt={detail.title}
                    width={224}
                    height={336}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    itemProp="image"
                    referrerPolicy="no-referrer"
                    onError={handlePosterError}
                    className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105 bg-[#18181D]"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2.5 p-4 bg-gradient-to-br from-[#23161B] via-[#17171D] to-[#101014] text-center">
                    <Clapperboard className="w-9 h-9 text-[var(--cd-accent-text)] opacity-85" />
                    <span className="text-xs font-semibold text-white/90 line-clamp-3">
                      {detail.title}
                    </span>
                  </div>
                )}
                <span className="absolute inset-0 bg-black/20 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                  <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-md border border-white/30 group-hover:bg-[var(--cd-accent)] group-hover:border-[var(--cd-accent)] text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-all duration-200">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </span>
              </a>
            </div>

            {/* Provider Badge + VIP + Views */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold mb-3">
              <ProviderBadge provider={detail.provider} size="sm" />
              {detail.isVip && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#09090B] text-[10px] font-bold shadow-sm">
                  <Crown className="w-2.5 h-2.5" />
                  VIP
                </span>
              )}
              {detail.playCount && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[#E4E4E7] tabular-nums">
                  <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                  {detail.playCount}
                </span>
              )}
            </div>

            {/* Drama Title */}
            <h1
              itemProp="name"
              className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight mb-3 drop-shadow-sm max-w-2xl"
              style={{ textWrap: 'balance' }}
            >
              {detail.title}
            </h1>

            {/* Episode Count & Genre Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              <span
                itemProp={isSingleMovie ? undefined : 'numberOfEpisodes'}
                className="inline-flex items-center px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/25 text-xs font-semibold text-white tabular-nums"
              >
                {isSingleMovie
                  ? detail.quality || t.detail.hdMovie
                  : `${totalEpisodeCount} ${t.detail.episodeUnit}`}
              </span>
              {detail.tags.slice(0, 5).map((tag) => (
                <a
                  key={tag}
                  href={`${DEFAULT_SITE_ORIGIN}/tag/${encodeURIComponent(slugifyDramaTitle(tag))}`}
                  itemProp="genre"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onSelectTag?.(tag);
                  }}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/20 hover:border-[var(--cd-accent)] hover:bg-white/15 text-xs font-medium text-[#F4F4F5] hover:text-white transition-colors"
                >
                  {tag}
                </a>
              ))}
            </div>

            {/* Clean Typographic Metadata Line */}
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-[#D4D4D8] mb-6">
              {durationLabelText && (
                <>
                  <span>{durationLabelText}</span>
                  <span aria-hidden="true" className="text-[#71717A]">
                    ·
                  </span>
                </>
              )}
              <span>{t.detail.subIndoLabel}</span>
              <span aria-hidden="true" className="text-[#71717A]">
                ·
              </span>
              <a
                href={`${DEFAULT_SITE_ORIGIN}${sectionCrumbHref}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent('kd:navigate-path', {
                      detail: { path: sectionCrumbHref },
                    })
                  );
                }}
                className="text-[#D4AF37] hover:underline font-medium"
              >
                {detail.provider}
              </a>
              {detail.year && (
                <>
                  <span aria-hidden="true" className="text-[#71717A]">
                    ·
                  </span>
                  <span className="tabular-nums">{detail.year}</span>
                </>
              )}
              {detail.area && (
                <>
                  <span aria-hidden="true" className="text-[#71717A]">
                    ·
                  </span>
                  <span>{detail.area}</span>
                </>
              )}
            </div>

            {/* Primary CTA Buttons: Mobile-first thumb-friendly stack -> inline centered on sm+ */}
            <div className="w-full flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-6">
              {resumePoint ? (
                <a
                  href={`${DEFAULT_SITE_ORIGIN}${watchHref}`}
                  data-episode-switch="true"
                  data-primary-action="true"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onPlayEpisode(
                      detail,
                      watchEp,
                      episodes,
                      resumePoint.currentTime
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 min-h-[48px] rounded-full cd-accent-bg text-white font-semibold text-sm shadow-[0_10px_28px_rgba(225,29,72,0.38)] hover:brightness-110 transition-all whitespace-nowrap"
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    {isSingleMovie ? t.hero.playNow : `${t.sections.resumeEp} ${resumePoint.episode}`}
                    {resumePoint.currentTime > 2
                      ? ` · ${formatPlaybackClock(resumePoint.currentTime)}`
                      : ''}
                  </span>
                </a>
              ) : (
                <a
                  href={`${DEFAULT_SITE_ORIGIN}${ep1WatchHref}`}
                  data-episode-switch="true"
                  data-primary-action="true"
                  aria-disabled={loading && episodes.length === 0 ? true : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    if (loading && episodes.length === 0) return;
                    onPlayEpisode(detail, 1, episodes, 0);
                  }}
                  className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 min-h-[48px] rounded-full cd-accent-bg text-white font-semibold text-sm shadow-[0_10px_28px_rgba(225,29,72,0.38)] hover:brightness-110 transition-all whitespace-nowrap ${
                    loading && episodes.length === 0 ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>{t.hero.playNow}</span>
                </a>
              )}

              <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-center">
                <button
                  type="button"
                  data-primary-action="true"
                  onClick={() => toggleMyList(detail)}
                  className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 min-h-[46px] rounded-full border text-sm font-semibold transition-all whitespace-nowrap shrink-0 backdrop-blur-md ${
                    isSaved
                      ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] text-[var(--cd-accent-text)]'
                      : 'bg-black/40 border-white/25 hover:bg-white/15 text-white'
                  }`}
                >
                  {isSaved ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{t.hero.inList}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>{t.hero.addToList}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-primary-action="true"
                  onClick={() => toggleLikeDrama(detail)}
                  className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-3 min-h-[46px] rounded-full border text-sm font-medium transition-colors whitespace-nowrap shrink-0 backdrop-blur-md ${
                    isLiked
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-black/40 border-white/20 hover:bg-white/15 text-white'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 shrink-0 ${isLiked ? 'fill-current text-red-400' : ''}`}
                  />
                  <span>{isLiked ? t.player.liked : t.player.like}</span>
                  {likesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[11px] font-bold tabular-nums">
                      {likesCount.toLocaleString()}
                    </span>
                  )}
                </button>

                {/* Watchlist Folder Selector */}
                {isSaved && (
                  <label className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-full bg-[#18181D]/90 backdrop-blur-md border border-white/15 text-xs text-white">
                    <FolderOpen className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                    <select
                      value={currentFolderId}
                      onChange={(e) =>
                        assignDramaToFolder(
                          detail.bookId,
                          detail.provider,
                          e.target.value
                        )
                      }
                      aria-label={t.engagement.saveToFolder}
                      className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
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
                  </label>
                )}
              </div>
            </div>

            {/* Sinopsis, Credits & Interactive Rating Panel */}
            <div className="w-full text-left rounded-2xl bg-black/50 backdrop-blur-md border border-white/12 p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                  {t.detail.synopsis}
                </h2>

                {/* 1–5 Star Rating Widget */}
                <div className="flex flex-wrap items-center gap-2 py-1 px-2.5 rounded-full bg-white/5 border border-white/10">
                  <span className="text-[11px] font-semibold text-white/90">
                    {t.engagement.rateTitle}:
                  </span>
                  <div
                    className="flex items-center gap-0.5"
                    onMouseLeave={() => setHoverStar(0)}
                  >
                    {[1, 2, 3, 4, 5].map((star) => {
                      const filled = star <= (hoverStar || userRating);
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverStar(star)}
                          onClick={() =>
                            setDramaRating(detail.bookId, detail.provider, star)
                          }
                          aria-label={`Rate ${star} stars`}
                          className="p-1 transition-transform hover:scale-110"
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              filled
                                ? 'text-[#D4AF37] fill-[#D4AF37]'
                                : 'text-[#71717A]'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                    {userRating > 0
                      ? `${userRating}/5 (${t.engagement.yourRating})`
                      : t.engagement.tapToRate}
                  </span>
                </div>
              </div>

              <p
                itemProp="description"
                className="text-sm sm:text-base text-[#E4E4E7] leading-relaxed"
              >
                {cleanSeoDescription(detail.description) ||
                  buildDramaFallbackDescription({
                    title: detail.title,
                    providerName: detail.provider,
                    episodeCount: totalEpisodeCount,
                    isMovie:
                      detail.mediaType === 'movie' ||
                      detail.provider === 'LK21' ||
                      detail.provider === 'LookSeries',
                    lang: language,
                    tags: detail.tags,
                  })}
              </p>

              {(detail.director || detail.protagonist) && (
                <div className="pt-2 border-t border-white/10 space-y-1.5 text-xs sm:text-sm text-[#A1A1AA]">
                  {detail.director && (
                    <p>
                      <span className="text-white font-medium">{t.detail.director}: </span>
                      {detail.director}
                    </p>
                  )}
                  {detail.protagonist && (
                    <p>
                      <span className="text-white font-medium">{t.detail.cast}: </span>
                      {detail.protagonist}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Single Movie Stream Card or Episode Grid */}
      <section className="rounded-2xl sm:rounded-3xl bg-[#111115] border border-[var(--cd-border)] p-4 sm:p-8">
        {isSingleMovie && !loading && (!error || episodes.length > 0) && episodes.length <= 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                {detail.quality || t.detail.hdMovie}
              </h2>
              {detail.year && (
                <span className="text-xs font-semibold text-[#A1A1AA] tabular-nums">
                  {detail.year}
                </span>
              )}
            </div>
            <a
              href={`${DEFAULT_SITE_ORIGIN}${watchHref}`}
              data-episode-switch="true"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                e.preventDefault();
                onPlayEpisode(
                  detail,
                  1,
                  episodes,
                  resumePoint?.currentTime ?? 0
                );
              }}
              className="group flex items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-white/10 bg-[#18181D] hover:border-[var(--cd-accent)] hover:bg-[#22181A] transition-all"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm sm:text-base font-bold text-white group-hover:text-[var(--cd-accent)] transition-colors truncate">
                  {detail.title}
                </p>
                <p className="text-xs text-[#A1A1AA] flex flex-wrap items-center gap-2">
                  <span>{detail.quality || t.detail.hdMovie}</span>
                  {detail.year && <span>· {detail.year}</span>}
                  {detail.area && <span>· {detail.area}</span>}
                  {resumePoint && resumePoint.currentTime > 2 && (
                    <span className="cd-accent-text font-semibold tabular-nums">
                      · {formatPlaybackClock(resumePoint.currentTime)}
                    </span>
                  )}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full cd-accent-bg text-white text-xs sm:text-sm font-semibold shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <Play className="w-4 h-4 fill-current" />
                {t.hero.playNow}
              </span>
            </a>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                  {t.player.episodes} ({totalEpisodeCount})
                  {loading && (
                    <Loader2 className="w-4 h-4 cd-accent-text animate-spin" />
                  )}
                </h2>
              </div>

              {batches.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {batches.map((batch, idx) => (
                    <button
                      key={batch.label}
                      type="button"
                      onClick={() => setSelectedBatch(idx)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium tabular-nums whitespace-nowrap transition-colors border ${
                        selectedBatch === idx
                          ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                          : 'bg-[#18181D] border-white/10 text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {batch.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading && episodes.length === 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {Array.from({ length: 16 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-[54px] rounded-xl skeleton-espresso border border-white/5"
                  />
                ))}
              </div>
            ) : error && episodes.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#18181D] border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {t.player.streamUnavailable}
                    </p>
                    <p className="text-xs text-[#A1A1AA] mt-0.5">{error}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    loadDetailAndEpisodes(detail.bookId, detail.provider, detail)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-xs font-semibold text-white shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.player.retry}
                </button>
              </div>
            ) : episodes.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#18181D] border border-white/10 text-center space-y-3">
                <p className="text-sm text-[#A1A1AA]">{t.detail.tapToStartEp1}</p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <a
                    href={`${DEFAULT_SITE_ORIGIN}${ep1WatchHref}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                        return;
                      }
                      e.preventDefault();
                      onPlayEpisode(detail, 1, episodes, 0);
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-full cd-accent-bg text-xs font-semibold text-white"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{t.hero.playNow}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      loadDetailAndEpisodes(detail.bookId, detail.provider, detail)
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.player.retry}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {activeBatchItems.map((ep) => {
                  const isCurrentResume =
                    resumePoint && resumePoint.episode === ep.episodeNumber;
                  const isWatched = watchedList.includes(ep.episodeNumber);
                  const epWatchHref = getWatchPath(
                    detail.bookId,
                    detail.title,
                    detail.provider,
                    detail.slug,
                    ep.episodeNumber
                  );
                  const cardClasses = `group block p-3 rounded-xl border text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)] ${
                    isCurrentResume
                      ? 'border-[var(--cd-accent)] bg-[#221417]'
                      : isWatched
                      ? 'border-[#D4AF37]/40 bg-[#171410]'
                      : 'border-white/10 bg-[#18181D] hover:border-[var(--cd-accent)] hover:bg-[#22181A]'
                  }`;
                  const cardInner = (
                    <>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            isCurrentResume
                              ? 'cd-accent-text'
                              : isWatched
                              ? 'text-[#D4AF37]'
                              : 'text-white group-hover:text-[var(--cd-accent)]'
                          }`}
                        >
                          {t.detail.episodeShort} {ep.episodeNumber}
                        </span>
                        <span className="flex items-center gap-1">
                          {isWatched && (
                            <Check
                              className="w-3 h-3 text-[#D4AF37]"
                              aria-label={t.player.watched}
                            />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {isCurrentResume && resumePoint.currentTime > 2
                          ? formatPlaybackClock(resumePoint.currentTime)
                          : isWatched
                          ? t.player.watched
                          : ep.title}
                      </p>
                    </>
                  );

                  return (
                    <a
                      key={ep.chapterId}
                      href={`${DEFAULT_SITE_ORIGIN}${epWatchHref}`}
                      data-episode-switch="true"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                          return;
                        }
                        e.preventDefault();
                        onPlayEpisode(
                          detail,
                          ep.episodeNumber,
                          episodes,
                          isCurrentResume ? resumePoint.currentTime : 0
                        );
                      }}
                      className={cardClasses}
                    >
                      {cardInner}
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {recommendedDramas.length > 0 && (
        <section
          aria-label={t.detail.relatedDramasTitle}
          className="mt-6 sm:mt-8 rounded-2xl sm:rounded-3xl bg-[#111115] border border-[var(--cd-border)] p-4 sm:p-8"
        >
          <h2 className="text-lg sm:text-2xl font-bold text-white mb-4">
            {t.detail.relatedDramasTitle}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
            {recommendedDramas.map((rec) => {
              const recKey = `${rec.provider}:${rec.bookId}`;
              const recHref = getDramaPath(
                rec.bookId,
                rec.title,
                rec.provider,
                rec.slug
              );
              const failStage = failedRecCovers[recKey] ?? 0;
              const recSrc =
                failStage === 0 && rec.cover
                  ? rec.cover
                  : failStage <= 1
                  ? buildOgImageEndpointUrl(rec.cover, siteOrigin, rec.title)
                  : '';
              return (
                <a
                  key={recKey}
                  href={`${DEFAULT_SITE_ORIGIN}${recHref}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    if (onSelectDrama) {
                      onSelectDrama(rec);
                    } else {
                      onPlayEpisode(rec, 1, [], 0);
                    }
                  }}
                  className="group block rounded-xl overflow-hidden bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] transition-all"
                >
                  <div className="aspect-[2/3] w-full overflow-hidden bg-[#101014] relative flex items-center justify-center">
                    {recSrc ? (
                      <img
                        src={recSrc}
                        alt={rec.title}
                        width={200}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedRecCovers((prev) => ({
                            ...prev,
                            [recKey]: Math.min(2, (prev[recKey] ?? 0) + 1),
                          }))
                        }
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-[#71717A] px-2 text-center line-clamp-3">
                        {rec.title}
                      </span>
                    )}
                    <div className="absolute top-2 left-2">
                      <ProviderBadge provider={rec.provider} size="xs" />
                    </div>
                  </div>
                  <div className="p-2.5 space-y-1">
                    <h3 className="text-xs font-semibold text-white line-clamp-2 group-hover:text-[var(--cd-accent)] transition-colors">
                      {rec.title}
                    </h3>
                    <p className="text-[10px] text-[#A1A1AA] tabular-nums">
                      {rec.chapterCount > 1
                        ? `${rec.chapterCount} ${t.detail.episodeUnit}`
                        : rec.quality || 'HD'}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Crawlable Internal Linking Strip to Active Provider, Genres & Hubs */}
      <nav
        aria-label="Explore Related Hubs"
        className="mt-6 rounded-2xl bg-[#111115] border border-[var(--cd-border)] p-4 sm:p-5 flex flex-wrap items-center gap-2 text-xs"
      >
        <a
          href={`${DEFAULT_SITE_ORIGIN}/provider/${provRouteSlug}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('kd:navigate-path', {
                detail: { path: `/provider/${provRouteSlug}` },
              })
            );
          }}
          className="px-3 py-1.5 rounded-full bg-[#18181D] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#FDE68A] font-semibold transition-colors"
        >
          {detail.provider}
        </a>
        {detail.tags.slice(0, 4).map((tag) => {
          const tSlug = slugifyDramaTitle(tag);
          if (!tSlug) return null;
          return (
            <a
              key={tag}
              href={`${DEFAULT_SITE_ORIGIN}/tag/${encodeURIComponent(tSlug)}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onSelectTag?.(tag);
              }}
              className="px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-[#D4D4D8] hover:text-white transition-colors"
            >
              #{tag}
            </a>
          );
        })}
        <a
          href={`${DEFAULT_SITE_ORIGIN}/explore`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('kd:navigate-path', { detail: { path: '/explore' } })
            );
          }}
          className="px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-[#A1A1AA] hover:text-white transition-colors"
        >
          {t.nav.explore}
        </a>
        <a
          href={`${DEFAULT_SITE_ORIGIN}/providers`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('kd:navigate-path', { detail: { path: '/providers' } })
            );
          }}
          className="px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-[#A1A1AA] hover:text-white transition-colors"
        >
          {t.nav.providers}
        </a>
        <a
          href={`${DEFAULT_SITE_ORIGIN}/movies`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent('kd:navigate-path', { detail: { path: '/movies' } })
            );
          }}
          className="px-3 py-1.5 rounded-full bg-[#18181D] border border-white/10 hover:border-[var(--cd-accent)] text-[#A1A1AA] hover:text-white transition-colors"
        >
          {t.nav.movies}
        </a>
      </nav>

      <ShareDramaModal
        open={shareModalState.open}
        drama={detail}
        episodeNumber={shareModalState.episode}
        unlockVipMode={shareModalState.unlockMode}
        onUnlockSuccess={() => {
          onPlayEpisode(detail, shareModalState.episode, episodes, 0);
        }}
        onClose={() =>
          setShareModalState((prev) => ({ ...prev, open: false }))
        }
      />
    </article>
  );
};
