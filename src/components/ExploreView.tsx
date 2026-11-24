import React, { useCallback, useEffect, useState } from 'react';
import {
  Compass,
  Crown,
  Filter,
  Flame,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from 'lucide-react';
import { CarouselRow } from './CarouselRow';
import { DramaCard } from './DramaCard';
import { LazySection } from './LazySection';
import { CarouselSkeleton, SkeletonCard } from './SkeletonCard';
import { ProviderEndpointSection } from './ProviderEndpointSection';
import { useDramaContext } from '../context/DramaContext';
import {
  ALL_PROVIDER_ADAPTERS,
  PROVIDER_FILTERS,
} from '../services/dramaProviders';
import type {
  DramaItem,
  NavTab,
  ProviderId,
  ProviderName,
} from '../types/drama';

export interface ExploreFeedSlice {
  items: DramaItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export interface ExploreExtraBundle {
  main: ExploreFeedSlice;
  rank: ExploreFeedSlice;
  newest: ExploreFeedSlice;
  vip: ExploreFeedSlice;
  anime?: ExploreFeedSlice;
  dubbing?: ExploreFeedSlice;
  special?: ExploreFeedSlice;
  fullLoaded: boolean;
}

interface ExploreViewProps {
  selectedProvider: ProviderId;
  extraProviderNames: Exclude<
    ProviderName,
    'DramaBox' | 'NetShort' | 'AnyReel' | 'Melolo'
  >[];
  dbRankingFeed: ExploreFeedSlice;
  nsTrendingFeed: ExploreFeedSlice;
  arAsianFeed: ExploreFeedSlice;
  mlRankFeed: ExploreFeedSlice;
  dbForYouFeed: ExploreFeedSlice;
  nsForYouFeed: ExploreFeedSlice;
  arForYouFeed: ExploreFeedSlice;
  mlForYouFeed: ExploreFeedSlice;
  dbNewFeed: ExploreFeedSlice;
  nsAllFeed: ExploreFeedSlice;
  mlNewFeed: ExploreFeedSlice;
  dbVipFeed: ExploreFeedSlice;
  nsAnimeFeed: ExploreFeedSlice;
  mlAnimeFeed: ExploreFeedSlice;
  dbDubbingFeed: ExploreFeedSlice;
  recommendedItems: DramaItem[];
  newReleaseItems: DramaItem[];
  combinedAnimeItems: DramaItem[];
  combinedDubbingItems: DramaItem[];
  extraFeeds: Record<string, ExploreExtraBundle>;
  myListIds: string[];
  onSelectProvider: (prov: ProviderId) => void;
  onSelectTab: (tab: NavTab) => void;
  onOpenTag: (tag: string) => void;
  onSelectDrama: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  onToggleMyList: (drama: DramaItem) => void;
  onOpenProviderHub: () => void;
  onRetryCore: () => void;
  onRetryFeed: (
    provider: 'DramaBox' | 'NetShort' | 'AnyReel' | 'Melolo',
    kind: 'rank' | 'vip' | 'anime' | 'dubbing'
  ) => void;
  onLoadMoreRecommended: () => void;
  onRetryExtraFull: (provider: ProviderName) => void;
  onLoadExtraBatch: (providers: ProviderName[]) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  selectedProvider,
  extraProviderNames,
  dbRankingFeed,
  nsTrendingFeed,
  arAsianFeed,
  mlRankFeed,
  dbForYouFeed,
  nsForYouFeed,
  arForYouFeed,
  mlForYouFeed,
  dbNewFeed,
  nsAllFeed,
  mlNewFeed,
  dbVipFeed,
  nsAnimeFeed,
  mlAnimeFeed,
  dbDubbingFeed,
  recommendedItems,
  newReleaseItems,
  combinedAnimeItems,
  combinedDubbingItems,
  extraFeeds,
  myListIds,
  onSelectProvider,
  onSelectTab,
  onOpenTag,
  onSelectDrama,
  onQuickPlay,
  onToggleMyList,
  onOpenProviderHub,
  onRetryCore,
  onRetryFeed,
  onLoadMoreRecommended,
  onRetryExtraFull: _onRetryExtraFull,
  onLoadExtraBatch,
}) => {
  const { t, language } = useDramaContext();
  const [visibleExtraCount, setVisibleExtraCount] = useState(6);

  // Advanced Filtering & Genre Navigation State
  const [filterGenre, setFilterGenre] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Ongoing' | 'Completed'>('all');
  const [filterSort, setFilterSort] = useState<'popular' | 'rating' | 'newest'>('popular');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [filteredItems, setFilteredItems] = useState<DramaItem[]>([]);
  const [filteredTotal, setFilteredTotal] = useState<number>(0);
  const [filterLoading, setFilterLoading] = useState<boolean>(false);
  const [filterLoadingMore, setFilterLoadingMore] = useState<boolean>(false);

  const hasActiveFilters =
    filterGenre !== 'All' ||
    filterStatus !== 'all' ||
    filterSort !== 'popular' ||
    debouncedQuery.trim().length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(filterQuery.trim());
    }, 320);
    return () => window.clearTimeout(timer);
  }, [filterQuery]);

  const fetchFilteredCatalog = useCallback(
    async (offsetVal: number, append: boolean) => {
      if (append) setFilterLoadingMore(true);
      else setFilterLoading(true);
      try {
        const params = new URLSearchParams({
          sort: filterSort,
          status: filterStatus,
          provider: selectedProvider,
          limit: '24',
          offset: String(offsetVal),
        });
        if (filterGenre !== 'All') params.set('genre', filterGenre);
        if (debouncedQuery) params.set('q', debouncedQuery);
        const res = await fetch(`/api/catalog/filter?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          items?: DramaItem[];
          total?: number;
        };
        const incoming = Array.isArray(json.items) ? json.items : [];
        setFilteredTotal(Number(json.total) || incoming.length);
        setFilteredItems((prev) => (append ? [...prev, ...incoming] : incoming));
      } catch {
        if (!append) setFilteredItems([]);
      } finally {
        setFilterLoading(false);
        setFilterLoadingMore(false);
      }
    },
    [filterGenre, filterStatus, filterSort, selectedProvider, debouncedQuery]
  );

  useEffect(() => {
    if (!hasActiveFilters) return;
    void fetchFilteredCatalog(0, false);
  }, [hasActiveFilters, fetchFilteredCatalog]);

  const resetAllFilters = () => {
    setFilterGenre('All');
    setFilterStatus('all');
    setFilterSort('popular');
    setFilterQuery('');
    setDebouncedQuery('');
  };

  const FILTER_GENRES = [
    'All',
    'CEO',
    'Revenge',
    'Romance',
    'Fantasy',
    'Billionaire',
    'Historical',
    'Action',
    'Dubbed',
  ];

  const visibleExtraProviders = extraProviderNames.slice(0, visibleExtraCount);
  const hasMoreExtraProviders = visibleExtraCount < extraProviderNames.length;

  const providerLabel = (id: ProviderId): string => {
    if (id === 'All') return t.providers.all;
    if (id === 'DramaBox') return t.providers.dramaBox;
    if (id === 'NetShort') return t.providers.netShort;
    if (id === 'AnyReel') return t.providers.anyReel;
    if (id === 'Melolo') return t.providers.melolo;
    return ALL_PROVIDER_ADAPTERS[id]?.label ?? id;
  };

  return (
    <div className="pb-12">
      {/* Explore Header + Provider & Genre Discovery Controls */}
      <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D4AF37] mb-1">
              <Compass className="w-3.5 h-3.5" />
              <span>{t.nav.explore}</span>
            </span>
            <h1 className="text-xl sm:text-3xl font-bold text-white">
              {t.sections.exploreTitle}
            </h1>
            <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1 max-w-2xl">
              {t.sections.exploreSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenProviderHub}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white transition-colors"
            >
              <Layers className="w-3.5 h-3.5 cd-accent-text" />
              <span>{t.providers.hubTitle}</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('home')}
              className="px-4 py-2 min-h-[40px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-white/30 text-xs font-medium text-white transition-colors"
            >
              {t.sections.backToHome}
            </button>
          </div>
        </div>

        {/* Provider Filter Tabs (Single Horizontal Row — All 49 Providers) */}
        <div
          className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none py-1"
          role="tablist"
          aria-label="Explore provider filter"
        >
          {PROVIDER_FILTERS.map((prov) => {
            const active = selectedProvider === prov.id;
            return (
              <button
                key={prov.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!prov.available}
                onClick={() => prov.available && onSelectProvider(prov.id)}
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
        </div>

        {/* Advanced Multi-Filter Discovery Bar (PostgreSQL Indexed Catalog) */}
        <div className="rounded-2xl bg-[var(--cd-surface)]/80 border border-white/10 p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Genre Interactive Buttons */}
            <div
              className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5"
              role="group"
              aria-label="Filter by genre"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A1A1AA] pr-1.5 whitespace-nowrap shrink-0">
                <Tag className="w-3.5 h-3.5 cd-accent-text" />
                <span>Genre:</span>
              </span>
              {FILTER_GENRES.map((g) => {
                const active = filterGenre === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFilterGenre(g)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all border ${
                      active
                        ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                        : 'bg-[#141418] border-white/10 text-[#D4D4D8] hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {g === 'All' ? t.exploreFilters.allGenres : g}
                  </button>
                );
              })}
            </div>

            {/* Keyword Input + Status + Sort Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] sm:w-52 sm:flex-none">
                <Search className="w-3.5 h-3.5 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t.exploreFilters.searchPlaceholder}
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-lg bg-[#0E0D11] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-xs text-white placeholder:text-[#71717A]"
                />
              </div>

              <div className="inline-flex items-center rounded-lg bg-[#0E0D11] border border-white/10 p-0.5">
                {(['all', 'Ongoing', 'Completed'] as const).map((st) => {
                  const active = filterStatus === st;
                  const label =
                    st === 'all'
                      ? t.exploreFilters.statusAll
                      : st === 'Ongoing'
                      ? t.exploreFilters.statusOngoing
                      : t.exploreFilters.statusCompleted;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStatus(st)}
                      className={`px-2.5 py-1.5 min-h-[32px] rounded-md text-[11px] font-semibold transition-colors ${
                        active
                          ? 'cd-accent-bg text-white'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative inline-flex items-center">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37] absolute left-2.5 pointer-events-none" />
                <select
                  value={filterSort}
                  onChange={(e) =>
                    setFilterSort(e.target.value as 'popular' | 'rating' | 'newest')
                  }
                  aria-label="Sort catalog"
                  className="min-h-[38px] pl-8 pr-6 py-1.5 rounded-lg bg-[#0E0D11] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-xs font-medium text-white cursor-pointer"
                >
                  <option value="popular">{t.exploreFilters.sortPopular}</option>
                  <option value="rating">{t.exploreFilters.sortRating}</option>
                  <option value="newest">{t.exploreFilters.sortNewest}</option>
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-[#E4E4E7] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.exploreFilters.resetFilters}</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Tag Landing Strip */}
          <nav
            aria-label={t.seoTags.popularTagsTitle}
            className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pt-1 border-t border-white/5"
          >
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#71717A] whitespace-nowrap shrink-0">
              <Filter className="w-3 h-3" />
              <span>SEO Tag Pages:</span>
            </span>
            {t.seoTags.genres.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => onOpenTag(genre)}
                className="text-[11px] font-medium text-[#A1A1AA] hover:text-white underline-offset-4 hover:underline whitespace-nowrap shrink-0 transition-colors"
              >
                #{genre}
              </button>
            ))}
          </nav>
        </div>
      </section>

      {/* Filtered PostgreSQL Results OR Explore Category Sections */}
      {hasActiveFilters ? (
        <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-2 pb-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <span>{t.exploreFilters.browseFilteredTitle}</span>
              <span className="text-xs font-semibold text-[#D4AF37] tabular-nums">
                ({filteredTotal} {t.exploreFilters.matchingResults})
              </span>
            </h2>
          </div>

          {filterLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl bg-[var(--cd-surface)] border border-white/10 p-10 text-center space-y-3">
              <p className="text-sm text-[#A1A1AA]">{t.exploreFilters.noFilterMatches}</p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs font-semibold text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.exploreFilters.resetFilters}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {filteredItems.map((drama) => (
                  <DramaCard
                    key={`${drama.provider}-${drama.bookId}`}
                    drama={drama}
                    fluid
                    isSaved={myListIds.includes(`${drama.provider}:${drama.bookId}`)}
                    onSelect={onSelectDrama}
                    onQuickPlay={onQuickPlay}
                    onToggleMyList={onToggleMyList}
                  />
                ))}
              </div>

              {filteredItems.length < filteredTotal && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    disabled={filterLoadingMore}
                    onClick={() => void fetchFilteredCatalog(filteredItems.length, true)}
                    className="px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs sm:text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    {filterLoadingMore ? t.sections.loading : t.sections.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : selectedProvider !== 'All' ? (
        <ProviderEndpointSection
          provider={selectedProvider}
          language={language}
          myListIds={myListIds}
          onResetProvider={() => onSelectProvider('All')}
          onSelectDrama={onSelectDrama}
          onQuickPlay={onQuickPlay}
          onToggleMyList={onToggleMyList}
        />
      ) : (
        <div className="space-y-1">
          <CarouselRow
            title={t.sections.trendingNow}
            icon={<Flame className="w-4 h-4 cd-accent-text shrink-0" />}
            items={dbRankingFeed.items.slice(0, 12)}
            loading={dbRankingFeed.loading}
            error={dbRankingFeed.error}
            ranked
            myListIds={myListIds}
            onRetry={() => onRetryFeed('DramaBox', 'rank')}
            onSeeAll={() => onSelectTab('ranking')}
            onSelectDrama={onSelectDrama}
            onQuickPlay={onQuickPlay}
            onToggleMyList={onToggleMyList}
          />

          <CarouselRow
            title={t.sections.netShortTrending}
            icon={<Flame className="w-4 h-4 cd-accent-text shrink-0" />}
            items={nsTrendingFeed.items.slice(0, 12)}
            loading={nsTrendingFeed.loading}
            error={nsTrendingFeed.error}
            ranked
            myListIds={myListIds}
            onRetry={() => onRetryFeed('NetShort', 'rank')}
            onSeeAll={() => onSelectTab('ranking')}
            onSelectDrama={onSelectDrama}
            onQuickPlay={onQuickPlay}
            onToggleMyList={onToggleMyList}
          />

          <LazySection fallback={<CarouselSkeleton />} className="cv-auto">
            <CarouselRow
              title={t.sections.anyReelAsian}
              icon={<Flame className="w-4 h-4 text-emerald-400 shrink-0" />}
              items={arAsianFeed.items.slice(0, 12)}
              loading={arAsianFeed.loading}
              error={arAsianFeed.error}
              ranked
              myListIds={myListIds}
              onRetry={() => onRetryFeed('AnyReel', 'rank')}
              onSeeAll={() => onSelectTab('ranking')}
              onSelectDrama={onSelectDrama}
              onQuickPlay={onQuickPlay}
              onToggleMyList={onToggleMyList}
            />

            <CarouselRow
              title={t.sections.meloloTrending}
              icon={<Flame className="w-4 h-4 text-amber-400 shrink-0" />}
              items={mlRankFeed.items.slice(0, 12)}
              loading={mlRankFeed.loading}
              error={mlRankFeed.error}
              ranked
              myListIds={myListIds}
              onRetry={() => onRetryFeed('Melolo', 'rank')}
              onSeeAll={() => onSelectTab('ranking')}
              onSelectDrama={onSelectDrama}
              onQuickPlay={onQuickPlay}
              onToggleMyList={onToggleMyList}
            />
          </LazySection>

          <LazySection fallback={<CarouselSkeleton />} className="cv-auto">
            <CarouselRow
              title={t.sections.recommended}
              items={recommendedItems}
              loading={
                dbForYouFeed.loading &&
                nsForYouFeed.loading &&
                arForYouFeed.loading &&
                mlForYouFeed.loading
              }
              loadingMore={
                dbForYouFeed.loadingMore ||
                nsForYouFeed.loadingMore ||
                arForYouFeed.loadingMore ||
                mlForYouFeed.loadingMore
              }
              error={
                dbForYouFeed.error &&
                nsForYouFeed.error &&
                arForYouFeed.error &&
                mlForYouFeed.error
              }
              hasMore={
                dbForYouFeed.hasMore ||
                nsForYouFeed.hasMore ||
                arForYouFeed.hasMore ||
                mlForYouFeed.hasMore
              }
              myListIds={myListIds}
              onRetry={onRetryCore}
              onLoadMore={onLoadMoreRecommended}
              onSelectDrama={onSelectDrama}
              onQuickPlay={onQuickPlay}
              onToggleMyList={onToggleMyList}
            />

            <CarouselRow
              title={t.sections.newReleases}
              items={newReleaseItems}
              loading={
                dbNewFeed.loading &&
                nsAllFeed.loading &&
                arAsianFeed.loading &&
                mlNewFeed.loading
              }
              error={
                dbNewFeed.error &&
                nsAllFeed.error &&
                arAsianFeed.error &&
                mlNewFeed.error
              }
              badgeStyle="NEW"
              myListIds={myListIds}
              onRetry={onRetryCore}
              onSeeAll={() => onSelectTab('terbaru')}
              onSelectDrama={onSelectDrama}
              onQuickPlay={onQuickPlay}
              onToggleMyList={onToggleMyList}
            />
          </LazySection>

          <LazySection fallback={<CarouselSkeleton />} className="cv-auto">
            <CarouselRow
              title={t.sections.vipExclusives}
              icon={<Crown className="w-4 h-4 text-[#D4AF37] shrink-0" />}
              items={dbVipFeed.items}
              loading={dbVipFeed.loading}
              error={dbVipFeed.error}
              badgeStyle="VIP"
              myListIds={myListIds}
              onRetry={() => onRetryFeed('DramaBox', 'vip')}
              onSeeAll={() => onSelectTab('vip')}
              onSelectDrama={onSelectDrama}
              onQuickPlay={onQuickPlay}
              onToggleMyList={onToggleMyList}
            />

            {(combinedAnimeItems.length > 0 ||
              nsAnimeFeed.loading ||
              mlAnimeFeed.loading) && (
              <CarouselRow
                title={t.sections.animeDonghua}
                icon={<Sparkles className="w-4 h-4 cd-accent-text shrink-0" />}
                items={combinedAnimeItems}
                loading={nsAnimeFeed.loading && mlAnimeFeed.loading}
                error={nsAnimeFeed.error && mlAnimeFeed.error}
                badgeStyle="ANIME"
                myListIds={myListIds}
                onRetry={() => onRetryFeed('NetShort', 'anime')}
                onSeeAll={() => onSelectTab('anime')}
                onSelectDrama={onSelectDrama}
                onQuickPlay={onQuickPlay}
                onToggleMyList={onToggleMyList}
              />
            )}

            {(combinedDubbingItems.length > 0 || dbDubbingFeed.loading) && (
              <CarouselRow
                title={t.sections.dubbedSeries}
                items={combinedDubbingItems}
                loading={dbDubbingFeed.loading}
                error={dbDubbingFeed.error}
                badgeStyle="DUB"
                myListIds={myListIds}
                onRetry={() => onRetryFeed('DramaBox', 'dubbing')}
                onSeeAll={() => onSelectTab('dubbing')}
                onSelectDrama={onSelectDrama}
                onQuickPlay={onQuickPlay}
                onToggleMyList={onToggleMyList}
              />
            )}
          </LazySection>

          {/* Progressive Additional Provider Highlights */}
          <LazySection fallback={<CarouselSkeleton />} className="cv-auto">
            <div className="space-y-1">
                {visibleExtraProviders.map((provName) => {
                  const b = extraFeeds[provName];
                  if (!b) return null;
                  if (!b.main.loading && b.main.items.length === 0) return null;
                  const adapter = ALL_PROVIDER_ADAPTERS[provName];
                  return (
                    <CarouselRow
                      key={provName}
                      title={`${adapter.label} Highlights`}
                      items={b.main.items.slice(0, 12)}
                      loading={b.main.loading}
                      error={b.main.error}
                      myListIds={myListIds}
                      onRetry={() => onLoadExtraBatch([provName])}
                      onSeeAll={() => {
                        onSelectProvider(provName);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onSelectDrama={onSelectDrama}
                      onQuickPlay={onQuickPlay}
                      onToggleMyList={onToggleMyList}
                    />
                  );
                })}

                {hasMoreExtraProviders && (
                  <div className="max-w-[1440px] mx-auto px-4 md:px-8 pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const nextCount = Math.min(
                          extraProviderNames.length,
                          visibleExtraCount + 8
                        );
                        const nextBatch = extraProviderNames.slice(
                          visibleExtraCount,
                          nextCount
                        );
                        setVisibleExtraCount(nextCount);
                        onLoadExtraBatch(nextBatch);
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs sm:text-sm font-semibold text-white transition-colors"
                    >
                      <Layers className="w-4 h-4 cd-accent-text" />
                      <span>{t.sections.exploreMoreProviders}</span>
                    </button>
                  </div>
                )}
              </div>
            </LazySection>
        </div>
      )}
    </div>
  );
};

export default ExploreView;
