import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { DramaCard } from './DramaCard';
import { SkeletonCard } from './SkeletonCard';
import { useDramaContext } from '../context/DramaContext';
import type { BadgeStyle, DramaItem } from '../types/drama';

interface CarouselRowProps {
  title: string;
  icon?: React.ReactNode;
  items: DramaItem[];
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  hasMore?: boolean;
  ranked?: boolean;
  badgeStyle?: BadgeStyle;
  subBadgeText?: string;
  continueEpisodesMap?: Record<
    string,
    { episode: number; currentTime?: number; progress: number }
  >;
  myListIds: string[];
  onRetry: () => void;
  onLoadMore?: () => void;
  onSeeAll?: () => void;
  onSelectDrama: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  onToggleMyList: (drama: DramaItem) => void;
  onRemoveHistory?: (drama: DramaItem) => void;
}

export const CarouselRow: React.FC<CarouselRowProps> = ({
  title,
  icon,
  items,
  loading,
  loadingMore = false,
  error,
  hasMore = false,
  ranked = false,
  badgeStyle = 'none',
  subBadgeText,
  continueEpisodesMap,
  myListIds,
  onRetry,
  onLoadMore,
  onSeeAll,
  onSelectDrama,
  onQuickPlay,
  onToggleMyList,
  onRemoveHistory,
}) => {
  const { t } = useDramaContext();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    updateButtons();
    window.addEventListener('resize', updateButtons);
    return () => window.removeEventListener('resize', updateButtons);
  }, [items.length, loading, updateButtons]);

  const scrollBy = (dir: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const delta = Math.max(300, el.clientWidth * 0.85);
    el.scrollBy({
      left: dir === 'left' ? -delta : delta,
      behavior: 'smooth',
    });
  };

  return (
    <section
      className="max-w-[1440px] mx-auto px-0 md:px-8 py-4"
      aria-label={title}
    >
      {/* Row Header */}
      <div className="flex items-center justify-between gap-3 mb-3 px-4 md:px-0">
        <h2 className="text-base sm:text-xl font-bold tracking-tight text-white flex items-center gap-2 min-w-0 truncate">
          {icon}
          <span className="truncate">{title}</span>
        </h2>

        <div className="flex items-center gap-2.5 shrink-0">
          {onLoadMore && hasMore && !loading && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-medium text-[#A1A1AA] hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
              {loadingMore ? t.sections.loading : t.sections.loadMore}
            </button>
          )}
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="text-xs font-semibold cd-accent-text hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              {t.sections.viewAll}
            </button>
          )}
        </div>
      </div>

      {error && items.length === 0 ? (
        <div className="mx-4 md:mx-0 p-5 rounded-xl bg-[var(--cd-surface)] border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">
                Failed to load {title}
              </p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg cd-accent-bg text-xs font-semibold text-white shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t.player.retry}
          </button>
        </div>
      ) : (
        /* Single Horizontal Row: Smooth swipe/scroll across Mobile and Desktop */
        <div className="relative group/row">
          {canScrollLeft && !loading && (
            <button
              type="button"
              onClick={() => scrollBy('left')}
              aria-label={`Scroll ${title} left`}
              className="hidden md:flex absolute left-2 top-[38%] -translate-y-1/2 z-30 w-9 h-12 items-center justify-center rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover/row:opacity-100 hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)] transition-all shadow-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div
            ref={trackRef}
            onScroll={updateButtons}
            className="flex flex-nowrap items-start gap-2.5 sm:gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain px-3.5 md:px-0 py-1"
          >
            {loading && items.length === 0
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonCard key={idx} ranked={ranked} />
                ))
              : items.map((drama, idx) => {
                  const itemKey = `${drama.provider}:${drama.bookId}`;
                  const cont = continueEpisodesMap?.[itemKey];
                  return (
                    <DramaCard
                      key={`${title}-${drama.provider}-${drama.bookId}`}
                      drama={drama}
                      rank={ranked ? idx + 1 : undefined}
                      badgeStyle={badgeStyle}
                      subBadgeText={subBadgeText}
                      continueEpisode={cont?.episode}
                      continueCurrentTime={cont?.currentTime}
                      continueProgress={cont?.progress}
                      isSaved={myListIds.includes(itemKey)}
                      onSelect={onSelectDrama}
                      onQuickPlay={onQuickPlay}
                      onToggleMyList={onToggleMyList}
                      onRemoveHistory={onRemoveHistory}
                    />
                  );
                })}
          </div>

          {canScrollRight && !loading && items.length > 0 && (
            <button
              type="button"
              onClick={() => scrollBy('right')}
              aria-label={`Scroll ${title} right`}
              className="hidden md:flex absolute right-2 top-[38%] -translate-y-1/2 z-30 w-9 h-12 items-center justify-center rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover/row:opacity-100 hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)] transition-all shadow-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
};
