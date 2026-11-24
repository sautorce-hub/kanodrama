import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { ProviderBadge } from './ProviderBadge';
import { HeroSkeleton } from './SkeletonCard';
import { getDramaPath, getWatchPath, slugifyDramaTitle } from '../utils/seo';
import type { DramaItem } from '../types/drama';

interface HeroSpotlightProps {
  spotlights: DramaItem[];
  loading: boolean;
  onPlayFirstEpisode: (drama: DramaItem) => void;
  onOpenDetails: (drama: DramaItem) => void;
  onSelectTag?: (tag: string) => void;
}

export const HeroSpotlight: React.FC<HeroSpotlightProps> = ({
  spotlights,
  loading,
  onPlayFirstEpisode,
  onOpenDetails,
  onSelectTag,
}) => {
  const { t, isDramaSaved, toggleMyList } = useDramaContext();
  const slides = spotlights.slice(0, 8);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});
  const trackRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);

  const scrollToSlide = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const el = trackRef.current;
      if (!el || slides.length === 0) return;
      const clamped = ((index % slides.length) + slides.length) % slides.length;
      setActiveIndex(clamped);
      isProgrammaticScrollRef.current = true;
      el.scrollTo({
        left: clamped * el.clientWidth,
        behavior,
      });
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 450);
    },
    [slides.length]
  );

  useEffect(() => {
    setActiveIndex(0);
    if (trackRef.current) {
      trackRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, [spotlights]);

  // Core Web Vitals (LCP): preload the primary hero poster immediately
  useEffect(() => {
    const primaryCover = slides[0]?.cover;
    if (!primaryCover || typeof document === 'undefined') return;
    let link = document.head.querySelector<HTMLLinkElement>(
      'link[rel="preload"][data-hero-preload="true"]'
    );
    if (!link) {
      link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.setAttribute('data-hero-preload', 'true');
      link.setAttribute('fetchpriority', 'high');
      link.href = primaryCover;
      document.head.appendChild(link);
    } else {
      link.href = primaryCover;
    }
  }, [slides[0]?.cover]);

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      const next = (activeIndex + 1) % slides.length;
      scrollToSlide(next, 'smooth');
    }, 7000);
    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, activeIndex, scrollToSlide]);

  const handleTrackScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    const el = trackRef.current;
    if (!el || el.clientWidth <= 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx >= 0 && idx < slides.length && idx !== activeIndex) {
      setActiveIndex(idx);
    }
  };

  if (loading && spotlights.length === 0) {
    return <HeroSkeleton />;
  }

  if (slides.length === 0) return null;

  return (
    <section
      className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-2 pb-3"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label={t.hero.featured}
    >
      <div className="relative group/hero rounded-2xl sm:rounded-3xl overflow-hidden bg-[#111115] border border-white/10 shadow-2xl">
        {/* Smooth Horizontal Swipe / Scroll-Snap Hero Track */}
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-none overscroll-x-contain"
        >
          {slides.map((item, idx) => {
            const coverKey = `${item.provider}:${item.bookId}`;
            const showCover = Boolean(item.cover) && !failedCovers[coverKey];
            const isSaved = isDramaSaved(item.bookId, item.provider);
            const episodeCount = Math.max(1, item.chapterCount || 1);
            const displayTags = item.tags.filter(Boolean).slice(0, 3);

            return (
              <article
                key={coverKey}
                className="relative w-full shrink-0 snap-start snap-always aspect-[3/4] max-h-[540px] sm:aspect-auto sm:h-[460px] md:h-[500px] lg:h-[540px] overflow-hidden bg-[#09090B]"
              >
                {/* Crisp Full-Height Cinema Artwork Layer */}
                {showCover ? (
                  <>
                    {/* Subtle Ambient Color Atmosphere Behind Left Scrim on Desktop */}
                    <img
                      src={item.cover}
                      alt=""
                      aria-hidden="true"
                      loading={idx === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedCovers((prev) => ({
                          ...prev,
                          [coverKey]: true,
                        }))
                      }
                      className="hidden sm:block absolute inset-0 w-full h-full object-cover object-center scale-110 blur-2xl opacity-30 saturate-125 pointer-events-none"
                    />

                    {/* Mobile: Full Sharp Portrait Poster */}
                    <img
                      src={item.cover}
                      alt={item.title}
                      loading={idx === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      fetchPriority={idx === 0 ? 'high' : 'auto'}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedCovers((prev) => ({
                          ...prev,
                          [coverKey]: true,
                        }))
                      }
                      className="sm:hidden absolute inset-0 w-full h-full object-cover object-top"
                    />

                    {/* Desktop: Full-Height Sharp Right-Anchored Artwork Seamlessly Feathered Into Scrim */}
                    <div className="hidden sm:block absolute inset-y-0 right-0 w-[64%] md:w-[58%] lg:w-[54%] overflow-hidden pointer-events-none">
                      <img
                        src={item.cover}
                        alt={item.title}
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        fetchPriority={idx === 0 ? 'high' : 'auto'}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedCovers((prev) => ({
                            ...prev,
                            [coverKey]: true,
                          }))
                        }
                        className="w-full h-full object-cover object-[center_18%]"
                      />
                      {/* Left-Edge Feather Gradient to Eliminate Any Seam */}
                      <div
                        className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-[#09090B] via-[#09090B]/70 to-transparent"
                        aria-hidden="true"
                      />
                      {/* Subtle Right & Top Vignette */}
                      <div
                        className="absolute inset-0 bg-gradient-to-l from-[#09090B]/40 via-transparent to-transparent"
                        aria-hidden="true"
                      />
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#2B1416] via-[#120D0C] to-[#090706]" />
                )}

                {/* High-Contrast Dark Gradient Overlays */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/75 via-38% to-transparent"
                  aria-hidden="true"
                />
                <div
                  className="hidden sm:block absolute inset-0 bg-gradient-to-r from-[#09090B] via-[#09090B]/92 via-[42%] to-transparent"
                  aria-hidden="true"
                />
                <div
                  className="hidden sm:block absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 to-transparent"
                  aria-hidden="true"
                />

                {/* Bottom-Left Overlay Content */}
                <div className="relative z-10 h-full p-5 sm:p-10 lg:p-14 flex flex-col justify-end sm:justify-center sm:pt-16 max-w-xl lg:max-w-2xl">
                  {/* Provider + Episode Count + Clean Unboxed Genres */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2.5">
                    <ProviderBadge provider={item.provider} size="xs" />
                    <span className="text-xs font-semibold text-[#D4AF37] tabular-nums">
                      {t.detail.episodeShort}: {episodeCount}
                    </span>
                    {displayTags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#D4D4D8]">
                        <span aria-hidden="true" className="text-white/40">
                          •
                        </span>
                        {displayTags.map((tag, tagIdx) => (
                          <React.Fragment key={tag}>
                            {tagIdx > 0 && (
                              <span
                                aria-hidden="true"
                                className="text-white/40"
                              >
                                •
                              </span>
                            )}
                            <a
                              href={`/tag/${encodeURIComponent(slugifyDramaTitle(tag))}`}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                e.preventDefault();
                                onSelectTag?.(tag);
                              }}
                              className="hover:text-white hover:underline underline-offset-2 transition-colors whitespace-nowrap"
                            >
                              {tag}
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Featured Drama Title */}
                  <h1
                    className="font-bold text-white leading-[1.12] tracking-tight mb-2.5 text-2xl sm:text-4xl lg:text-[44px] line-clamp-2 drop-shadow-sm"
                    style={{ textWrap: 'balance' }}
                  >
                    {item.title}
                  </h1>

                  {/* 2-Line Synopsis with Clean Ellipsis */}
                  <p className="text-xs sm:text-sm lg:text-[15px] text-[#E4E4E7]/90 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis max-w-lg lg:max-w-xl mb-5 sm:mb-6">
                    {item.description}
                  </p>

                  {/* Primary Pill-Shaped CTA & Secondary Controls */}
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <a
                      href={getWatchPath(
                        item.bookId,
                        item.title,
                        item.provider,
                        item.slug,
                        1
                      )}
                      data-primary-action="true"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        onPlayFirstEpisode(item);
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg hover:brightness-110 text-white font-bold text-xs sm:text-sm shadow-lg shadow-black/50 transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{t.hero.playNow}</span>
                    </a>

                    <a
                      href={getDramaPath(
                        item.bookId,
                        item.title,
                        item.provider,
                        item.slug
                      )}
                      data-primary-action="true"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        onOpenDetails(item);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white font-semibold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0"
                    >
                      {t.hero.viewDetails}
                    </a>

                    <button
                      type="button"
                      data-primary-action="true"
                      onClick={() => toggleMyList(item)}
                      aria-label={isSaved ? t.hero.inList : t.hero.addToList}
                      className={`min-w-[44px] min-h-[44px] p-2.5 rounded-full border backdrop-blur-md transition-colors shrink-0 flex items-center justify-center ${
                        isSaved
                          ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] cd-accent-text'
                          : 'bg-white/10 border-white/15 text-white hover:border-white/40'
                      }`}
                    >
                      {isSaved ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop Previous / Next Slide Buttons */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              aria-label="Previous featured drama"
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover/hero:opacity-100 hover:border-[var(--cd-accent)] transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              aria-label="Next featured drama"
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover/hero:opacity-100 hover:border-[var(--cd-accent)] transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Dynamic Carousel Indicator Dots */}
      {slides.length > 1 && (
        <div
          className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 mt-1"
          aria-label="Hero slide indicators"
        >
          {slides.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={`${item.provider}:${item.bookId}`}
                type="button"
                onClick={() => scrollToSlide(idx)}
                aria-label={`Slide ${idx + 1}: ${item.title}`}
                aria-current={active ? 'true' : undefined}
                className="min-w-[38px] min-[400px]:min-w-[44px] min-h-[44px] px-1.5 py-2 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)] rounded-full"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    active
                      ? 'w-7 cd-accent-bg'
                      : 'w-1.5 bg-white/30 hover:bg-white/60'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
