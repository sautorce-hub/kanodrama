import React, { useEffect, useState } from 'react';
import { Play, Plus, Check, Film, Crown, X, Heart, Flame, TrendingUp } from 'lucide-react';
import { ProviderBadge } from './ProviderBadge';
import { useDramaContext } from '../context/DramaContext';
import { getDramaPath, getWatchPath } from '../utils/seo';
import type { BadgeStyle, DramaItem } from '../types/drama';

interface DramaCardProps {
  drama: DramaItem;
  rank?: number;
  badgeStyle?: BadgeStyle;
  continueEpisode?: number;
  continueCurrentTime?: number;
  continueProgress?: number;
  subBadgeText?: string;
  isSaved: boolean;
  fluid?: boolean;
  responsiveGrid?: boolean;
  onSelect: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  onToggleMyList: (drama: DramaItem) => void;
  onRemoveHistory?: (drama: DramaItem) => void;
}

function formatShortClock(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 1) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const DramaCard: React.FC<DramaCardProps> = ({
  drama,
  rank,
  badgeStyle = 'none',
  continueEpisode,
  continueCurrentTime,
  continueProgress,
  subBadgeText,
  isSaved,
  fluid = false,
  responsiveGrid = false,
  onSelect,
  onQuickPlay,
  onToggleMyList,
  onRemoveHistory,
}) => {
  const { t, isDramaLiked, toggleLikeDrama, getDramaLiveStats } = useDramaContext();
  const [imgFailed, setImgFailed] = useState(false);
  const isLiked = isDramaLiked(drama.bookId, drama.provider);

  useEffect(() => {
    setImgFailed(false);
  }, [drama.cover]);

  const showRank = typeof rank === 'number';
  const isContinue = typeof continueEpisode === 'number';
  const episodeCount = Math.max(1, drama.chapterCount || 1);
  const isMovieItem =
    drama.mediaType === 'movie' ||
    drama.provider === 'LK21' ||
    drama.provider === 'LookSeries';
  const isSingleMovie = isMovieItem && episodeCount <= 1;
  const detailHref = getDramaPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug
  );
  const watchHref = getWatchPath(
    drama.bookId,
    drama.title,
    drama.provider,
    drama.slug,
    continueEpisode ?? 1
  );

  const liveStats = getDramaLiveStats(drama.bookId, drama.provider);
  const effectiveDailyViews = liveStats?.dailyViews ?? drama.dailyViews ?? 0;
  const effectiveTotalViews = liveStats?.totalViews ?? drama.totalViews ?? 0;
  const effectiveTrendBadge: 'HOT' | 'TRENDING' | undefined =
    liveStats?.trendBadge ??
    drama.trendBadge ??
    (effectiveDailyViews > 0
      ? 'HOT'
      : showRank && rank <= 5
        ? 'TRENDING'
        : undefined);

  const formatViewsShort = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div
      className={`group relative flex items-start ${
        responsiveGrid
          ? 'flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink'
          : fluid
            ? 'w-full'
            : 'flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 sm:flex-none sm:w-[30%] sm:min-w-[30%] md:w-[calc(25%-15px)] md:min-w-[calc(25%-15px)] lg:w-[calc(20%-16px)] lg:min-w-[calc(20%-16px)] snap-start'
      }`}
    >
      <article
        className={`relative z-10 flex flex-col w-full rounded-xl ${
          showRank && !fluid ? 'pl-4 sm:pl-6' : ''
        }`}
      >
        <a
          href={detailHref}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onSelect(drama);
          }}
          aria-label={`Open ${drama.title}`}
          className={`absolute inset-y-0 right-0 ${
            showRank && !fluid ? 'left-4 sm:left-6' : 'left-0'
          } z-10 rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)]`}
        />

        {/* Vertical Portrait Poster Container (Strict 2:3 Ratio, Crisp object-cover) */}
        <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#121216] border border-[var(--cd-border)] transition-all duration-200 ease-out md:group-hover:scale-[1.02] group-hover:border-[var(--cd-accent)] group-hover:shadow-xl pointer-events-none">
          {drama.cover && !imgFailed ? (
            <img
              src={drama.cover}
              alt={drama.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1F1417] via-[#141418] to-[#09090B] flex flex-col items-center justify-center p-4 text-center">
              <Film className="w-7 h-7 cd-accent-text opacity-65 mb-2" />
              <span className="text-xs font-semibold text-white line-clamp-3">
                {drama.title}
              </span>
            </div>
          )}

          {/* Subtle Bottom & Top Edge Scrims for Badge & Progress Legibility */}
          <div
            className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none"
            aria-hidden="true"
          />

          {/* Top-Left: Provider + Status Badge */}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 max-w-[76%]">
            <ProviderBadge provider={drama.provider} size="xs" />

            {!isContinue && (
              <>
                {effectiveTrendBadge === 'HOT' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-[#EF4444] to-[#F59E0B] text-white text-[10px] font-bold whitespace-nowrap shadow-md">
                    <Flame className="w-2.5 h-2.5 fill-current" />
                    Hot Today
                  </span>
                ) : effectiveTrendBadge === 'TRENDING' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EF4444]/90 border border-white/20 text-white text-[10px] font-bold whitespace-nowrap shadow-md">
                    <TrendingUp className="w-2.5 h-2.5" />
                    Trending
                  </span>
                ) : badgeStyle === 'VIP' ||
                  (badgeStyle === 'none' && drama.isVip) ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D4AF37] text-[#09090B] text-[10px] font-bold whitespace-nowrap">
                    <Crown className="w-2.5 h-2.5" />
                    VIP
                  </span>
                ) : badgeStyle === 'NEW' ? (
                  <span className="px-2 py-0.5 rounded cd-accent-bg text-white text-[10px] font-semibold whitespace-nowrap">
                    NEW
                  </span>
                ) : badgeStyle === 'ANIME' ? (
                  <span className="px-2 py-0.5 rounded cd-accent-bg text-white text-[10px] font-semibold whitespace-nowrap">
                    Anime
                  </span>
                ) : badgeStyle === 'DUB' ? (
                  <span className="px-2 py-0.5 rounded bg-black/80 border border-[var(--cd-accent)] text-[var(--cd-accent-text)] text-[10px] font-semibold whitespace-nowrap">
                    Dubbed
                  </span>
                ) : subBadgeText ? (
                  <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-medium text-[#E4E4E7] whitespace-nowrap">
                    {subBadgeText}
                  </span>
                ) : null}
              </>
            )}

            {showRank && fluid && (
              <span className="px-2 py-0.5 rounded cd-accent-bg text-white text-[10px] font-extrabold tabular-nums shadow">
                TOP {rank}
              </span>
            )}
          </div>

          {/* Top-Right: Remove History OR Like + Watchlist Quick Toggles */}
          {isContinue && onRemoveHistory ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveHistory(drama);
              }}
              aria-label={t.sections.removeHistory}
              className="absolute top-2 right-2 z-20 pointer-events-auto p-1.5 rounded-full bg-black/75 border border-white/15 text-white hover:bg-[var(--cd-accent)] hover:border-[var(--cd-accent)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="absolute top-2 right-2 z-20 pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLikeDrama(drama);
                }}
                aria-label={
                  isLiked
                    ? `Unlike ${drama.title}`
                    : `Like ${drama.title}`
                }
                className={`p-1.5 rounded-lg border backdrop-blur-md transition-all ${
                  isLiked
                    ? 'bg-red-500 border-red-400 text-white opacity-100'
                    : 'bg-black/65 border-white/15 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:border-red-400'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMyList(drama);
                }}
                aria-label={
                  drama.provider === 'LK21' || drama.mediaType === 'movie'
                    ? isSaved
                      ? `Remove ${drama.title} from Movie Watchlist`
                      : `Save ${drama.title} to Movie Watchlist`
                    : isSaved
                    ? `Remove ${drama.title} from Drama Watchlist`
                    : `Save ${drama.title} to Drama Watchlist`
                }
                className={`p-1.5 rounded-lg border backdrop-blur-md transition-all ${
                  isSaved
                    ? 'cd-accent-bg border-[var(--cd-accent)] text-white opacity-100'
                    : 'bg-black/65 border-white/15 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:border-[var(--cd-accent)]'
                }`}
              >
                {isSaved ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}

          {/* Hover Play Center Button */}
          <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <a
              href={watchHref}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  e.stopPropagation();
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                onQuickPlay(drama);
              }}
              aria-label={`Play ${drama.title}`}
              className="pointer-events-auto w-11 h-11 rounded-full cd-accent-bg text-white flex items-center justify-center shadow-xl shadow-black/70 hover:scale-110 transition-transform"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </a>
          </div>

          {/* Ranked Large Numeral Anchored on Poster Bottom-Left */}
          {showRank && !fluid && (
            <span
              aria-hidden="true"
              className="rank-numeral absolute -left-3 bottom-1 z-20 text-[58px] sm:text-[74px] font-extrabold leading-[0.78] select-none pointer-events-none transition-all duration-200 tabular-nums"
            >
              {rank}
            </span>
          )}

          {/* Bottom-Edge Continue Watching Progress Bar */}
          {isContinue && (
            <div className="absolute inset-x-0 bottom-0 p-2">
              <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-[#D4AF37] rounded-full"
                  style={{ width: `${continueProgress ?? 30}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Below-Poster Title & Clean Unboxed Metadata */}
        <div className="mt-2 px-0.5 space-y-1 pointer-events-none">
          <h3 className="text-[13px] sm:text-sm font-semibold text-white leading-[1.35] line-clamp-2 min-h-[2.7em] group-hover:text-[var(--cd-accent-text)] transition-colors">
            {drama.title}
          </h3>

          {isContinue ? (
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium tabular-nums truncate">
              <span className="text-[#D4AF37] truncate">
                {isSingleMovie
                  ? formatShortClock(continueCurrentTime) || `${Math.round(continueProgress ?? 0)}%`
                  : `${t.sections.resumeEp} ${continueEpisode}${
                      formatShortClock(continueCurrentTime)
                        ? ` · ${formatShortClock(continueCurrentTime)}`
                        : ''
                    }`}
              </span>
              <span className="text-[#A1A1AA] shrink-0">
                {isSingleMovie ? drama.quality || 'HD' : `Ep: ${episodeCount}`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[#A1A1AA] tabular-nums truncate">
              <span>
                {isSingleMovie ? drama.quality || 'HD' : `Ep: ${episodeCount}`}
              </span>
              {Math.max(effectiveTotalViews, effectiveDailyViews) > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#D4AF37] font-medium truncate">
                    {formatViewsShort(
                      Math.max(effectiveTotalViews, effectiveDailyViews)
                    )}{' '}
                    views
                  </span>
                </>
              ) : showRank ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#A1A1AA] font-medium truncate">
                    0 views
                  </span>
                </>
              ) : drama.tags[0] ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{drama.tags[0]}</span>
                </>
              ) : drama.playCount ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{drama.playCount}</span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </article>
    </div>
  );
};
