import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  Clock,
  Loader2,
  Play,
  Trash2,
  Film,
  Flame,
  Hash,
  SlidersHorizontal,
  Tv,
  Sparkles,
  RotateCcw,
  Zap,
  ChevronDown,
} from 'lucide-react';
import {
  ACTIVE_PROVIDER_NAMES,
  PRIORITY_SEARCH_PROVIDERS,
  fetchSearchCategoryFeed,
  searchProvidersFast,
  type SearchCategoryFilter,
} from '../services/dramaProviders';
import {
  fetchLk21Latest,
  fetchLookSeriesFeed,
  movieToDramaItem,
  searchLk21Movies,
  searchLookSeriesMovies,
} from '../services/movieService';
import { useDramaContext } from '../context/DramaContext';
import { ProviderBadge } from './ProviderBadge';
import { getDramaPath, getWatchPath } from '../utils/seo';
import type { DramaItem, ProviderId, ProviderName } from '../types/drama';

type SearchProviderOption = ProviderId | 'LK21' | 'LookSeries';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDrama: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  trendingDramas?: DramaItem[];
}

interface SearchCacheEntry {
  items: DramaItem[];
  expiresAt: number;
}

const DEBOUNCE_DELAY_MS = 350;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;

// Cache ringan di memori dengan batas kapasitas (LRU) dan TTL 5 menit
const searchResultCache = new Map<string, SearchCacheEntry>();

function getCachedSearch(key: string): DramaItem[] | null {
  const hit = searchResultCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    searchResultCache.delete(key);
    return null;
  }
  // Refresh posisi LRU
  searchResultCache.delete(key);
  searchResultCache.set(key, hit);
  return hit.items;
}

function setCachedSearch(key: string, items: DramaItem[]): void {
  if (searchResultCache.has(key)) {
    searchResultCache.delete(key);
  } else if (searchResultCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchResultCache.keys().next().value;
    if (oldestKey) searchResultCache.delete(oldestKey);
  }
  searchResultCache.set(key, {
    items,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

const CATEGORY_OPTIONS: {
  id: SearchCategoryFilter;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'all', label: 'Semua Kategori', shortLabel: 'Semua' },
  { id: 'popular', label: 'Populer (For You)', shortLabel: 'Populer' },
  { id: 'ranking', label: 'Ranking / Trending', shortLabel: 'Ranking' },
  { id: 'new_release', label: 'New Release', shortLabel: 'New Release' },
  { id: 'all_drama', label: 'All Drama (Mola TV)', shortLabel: 'All Drama' },
  { id: 'vip', label: 'VIP Eksklusif', shortLabel: 'VIP' },
  { id: 'anime', label: 'Anime & Donghua', shortLabel: 'Anime' },
];

const OTHER_PROVIDERS: ProviderName[] = ACTIVE_PROVIDER_NAMES.filter(
  (p) => !PRIORITY_SEARCH_PROVIDERS.includes(p)
);

function applyCategoryFilterAndSort(
  items: DramaItem[],
  category: SearchCategoryFilter
): DramaItem[] {
  if (category === 'all' || category === 'all_drama') {
    return items;
  }

  if (category === 'vip') {
    return items.filter(
      (item) => item.isVip || /vip/i.test(item.corner || '')
    );
  }

  if (category === 'anime') {
    return items.filter((item) => {
      const text = [item.title, item.corner || '', ...item.tags].join(' ');
      return /anime|donghua|animasi|3d/i.test(text);
    });
  }

  if (category === 'ranking') {
    return [...items].sort((a, b) => {
      const aRank = a.rank ?? 9999;
      const bRank = b.rank ?? 9999;
      if (aRank !== bRank) return aRank - bRank;
      const aScore =
        (a.trendBadge === 'TRENDING' ? 2000 : a.trendBadge === 'HOT' ? 1000 : 0) +
        (a.dailyViews ?? 0) +
        (a.rating ?? 0) * 10;
      const bScore =
        (b.trendBadge === 'TRENDING' ? 2000 : b.trendBadge === 'HOT' ? 1000 : 0) +
        (b.dailyViews ?? 0) +
        (b.rating ?? 0) * 10;
      return bScore - aScore;
    });
  }

  if (category === 'new_release') {
    return [...items].sort((a, b) => {
      const aNew =
        /new|baru/i.test(a.corner || '') || a.status === 'Ongoing' ? 1 : 0;
      const bNew =
        /new|baru/i.test(b.corner || '') || b.status === 'Ongoing' ? 1 : 0;
      return bNew - aNew;
    });
  }

  // 'popular'
  return [...items].sort((a, b) => {
    const aPop = (a.totalViews ?? 0) + (a.dailyViews ?? 0) * 5 + (a.rating ?? 0) * 100;
    const bPop = (b.totalViews ?? 0) + (b.dailyViews ?? 0) * 5 + (b.rating ?? 0) * 100;
    return bPop - aPop;
  });
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onClose,
  onSelectDrama,
  onQuickPlay,
  trendingDramas = [],
}) => {
  const {
    language,
    t,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  } = useDramaContext();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [providerFilter, setProviderFilter] =
    useState<SearchProviderOption>('All');
  const [categoryFilter, setCategoryFilter] =
    useState<SearchCategoryFilter>('all');
  const [deepSearch, setDeepSearch] = useState(false);

  const [results, setResults] = useState<DramaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeqRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Debounce input teks (350ms) agar tidak mengirim request setiap ketukan huruf
  useEffect(() => {
    if (!open) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      return;
    }

    debounceTimerRef.current = window.setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, open]);

  // Reset deepSearch saat user mengganti kata kunci atau provider
  useEffect(() => {
    setDeepSearch(false);
  }, [debouncedQuery, providerFilter]);

  const isFilterActive = providerFilter !== 'All' || categoryFilter !== 'all';
  const isWaitingDebounce = query.trim() !== debouncedQuery;

  // Eksekusi pencarian + caching + guard race-condition
  useEffect(() => {
    if (!open) return;

    const cleanQuery = debouncedQuery.trim();
    const shouldBrowseCategory = !cleanQuery && isFilterActive;

    if (!cleanQuery && !shouldBrowseCategory) {
      requestSeqRef.current += 1;
      setResults([]);
      setLoading(false);
      setIsRefreshing(false);
      setCacheHit(false);
      setSearchedOnce(false);
      return;
    }

    const cacheKey = `${language}::${providerFilter}::${categoryFilter}::${
      deepSearch ? 'deep' : 'fast'
    }::${cleanQuery.toLowerCase()}`;

    const cached = getCachedSearch(cacheKey);
    if (cached) {
      requestSeqRef.current += 1;
      setResults(cached);
      setLoading(false);
      setIsRefreshing(false);
      setCacheHit(true);
      setSearchedOnce(true);
      return;
    }

    const seq = ++requestSeqRef.current;
    setCacheHit(false);
    setIsRefreshing(true);
    setLoading((prev) => prev || results.length === 0);

    const run = async () => {
      try {
        let finalItems: DramaItem[] = [];

        if (shouldBrowseCategory) {
          if (providerFilter === 'LK21') {
            const lkRes = await fetchLk21Latest(1);
            finalItems = lkRes.items.map((m) => movieToDramaItem(m));
          } else if (providerFilter === 'LookSeries') {
            const lsRes = await fetchLookSeriesFeed(
              categoryFilter === 'anime' ? 'kartun' : 'foryou',
              1
            );
            finalItems = lsRes.items.map((m) => movieToDramaItem(m));
          } else {
            const catRes = await fetchSearchCategoryFeed(
              categoryFilter,
              providerFilter,
              1
            );
            finalItems = catRes.items;
          }
        } else if (providerFilter === 'LK21') {
          const lkRes = await searchLk21Movies(cleanQuery, 1);
          finalItems = applyCategoryFilterAndSort(
            lkRes.items.map((m) => movieToDramaItem(m)),
            categoryFilter
          );
        } else if (providerFilter === 'LookSeries') {
          const lsRes = await searchLookSeriesMovies(cleanQuery, 1);
          finalItems = applyCategoryFilterAndSort(
            lsRes.items.map((m) => movieToDramaItem(m)),
            categoryFilter
          );
        } else if (providerFilter === 'All') {
          const includeMovies =
            categoryFilter === 'all' ||
            categoryFilter === 'popular' ||
            categoryFilter === 'new_release';
          const [dramaRes, lkRes, lsRes] = await Promise.all([
            searchProvidersFast(cleanQuery, 1, 'All', deepSearch),
            includeMovies
              ? searchLk21Movies(cleanQuery, 1).catch(() => null)
              : Promise.resolve(null),
            includeMovies
              ? searchLookSeriesMovies(cleanQuery, 1).catch(() => null)
              : Promise.resolve(null),
          ]);
          const lkItems = lkRes?.items?.length
            ? lkRes.items.slice(0, 5).map((m) => movieToDramaItem(m))
            : [];
          const lsItems = lsRes?.items?.length
            ? lsRes.items.slice(0, 5).map((m) => movieToDramaItem(m))
            : [];
          const combined = [...dramaRes.items, ...lsItems, ...lkItems];
          finalItems = applyCategoryFilterAndSort(combined, categoryFilter);
        } else {
          const dramaRes = await searchProvidersFast(
            cleanQuery,
            1,
            providerFilter,
            false
          );
          finalItems = applyCategoryFilterAndSort(dramaRes.items, categoryFilter);
        }

        if (requestSeqRef.current !== seq) return;
        setCachedSearch(cacheKey, finalItems);
        setResults(finalItems);
        setSearchedOnce(true);
      } catch {
        if (requestSeqRef.current !== seq) return;
        setResults([]);
        setSearchedOnce(true);
      } finally {
        if (requestSeqRef.current === seq) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    debouncedQuery,
    providerFilter,
    categoryFilter,
    deepSearch,
    language,
    isFilterActive,
  ]);

  const flushSearchNow = useCallback(
    (rawKeyword?: string) => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      const clean = (rawKeyword ?? query).trim();
      setDebouncedQuery(clean);
      if (clean) addRecentSearch(clean);
    },
    [query, addRecentSearch]
  );

  const handleResetFilters = () => {
    setProviderFilter('All');
    setCategoryFilter('all');
    setDeepSearch(false);
  };

  const handleSelect = (item: DramaItem) => {
    if (query.trim()) {
      addRecentSearch(query.trim());
    } else if (item.title.trim()) {
      addRecentSearch(item.title.trim());
    }
    onClose();
    onSelectDrama(item);
  };

  const handleApplyKeyword = (keyword: string) => {
    const clean = keyword.trim();
    if (!clean) return;
    setQuery(clean);
    flushSearchNow(clean);
  };

  const filteredTrending = useMemo(() => {
    let list = trendingDramas;
    if (providerFilter !== 'All') {
      list = list.filter((item) => item.provider === providerFilter);
    }
    return applyCategoryFilterAndSort(list, categoryFilter).slice(0, 8);
  }, [trendingDramas, providerFilter, categoryFilter]);

  if (!open) return null;

  const genreSuggestions = t.seoTags.genres.slice(0, 6);
  const showInitialEmptyState = !query.trim() && !isFilterActive;
  const activeCategoryLabel =
    CATEGORY_OPTIONS.find((c) => c.id === categoryFilter)?.shortLabel ?? 'Semua';
  const showBusySpinner = loading || isRefreshing || isWaitingDebounce;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#09090B]/95 backdrop-blur-xl flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t.search.title}
    >
      {/* Search Bar Header dengan Filter Kategori & Provider */}
      <div className="border-b border-white/10 px-4 sm:px-8 py-3.5 sm:py-4">
        <div className="max-w-5xl mx-auto space-y-2.5">
          <div className="flex items-start sm:items-center gap-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                flushSearchNow();
              }}
              className="flex-1 flex flex-col md:flex-row md:items-center gap-2 rounded-2xl md:rounded-full bg-[#141418] border border-[var(--cd-accent)]/60 p-1.5 md:pl-4 md:pr-2 shadow-lg transition-colors focus-within:border-[var(--cd-accent)]"
            >
              {/* Kolom Input Pencarian */}
              <div className="flex-1 flex items-center gap-2.5 px-2.5 py-1.5 md:px-0 md:py-1 min-w-0">
                <Search className="w-4 h-4 cd-accent-text shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.search.placeholder}
                  className="w-full bg-transparent text-sm text-white placeholder-[#A1A1AA] focus:outline-none"
                />
                {showBusySpinner ? (
                  <Loader2
                    className="w-4 h-4 cd-accent-text animate-spin shrink-0"
                    aria-label="Memuat hasil pencarian"
                  />
                ) : null}
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setDebouncedQuery('');
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="p-1 text-[#A1A1AA] hover:text-white shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              {/* Filter Dropdown Kategori & Provider di Sebelah Kolom Input */}
              <div className="flex items-center gap-1.5 border-t md:border-t-0 md:border-l border-white/10 pt-1.5 md:pt-0 md:pl-2 shrink-0">
                {/* Dropdown Kategori Mola TV */}
                <label className="relative flex items-center flex-1 md:flex-initial">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37] absolute left-2.5 pointer-events-none" />
                  <select
                    aria-label="Filter Kategori"
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as SearchCategoryFilter)
                    }
                    className="w-full md:w-auto pl-8 pr-7 py-1.5 rounded-xl md:rounded-full bg-[#1C1C22] hover:bg-[#23232B] border border-white/10 text-xs font-medium text-white focus:outline-none focus:border-[var(--cd-accent)] cursor-pointer appearance-none"
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option
                        key={cat.id}
                        value={cat.id}
                        className="bg-[#141418] text-white"
                      >
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA] absolute right-2.5 pointer-events-none" />
                </label>

                {/* Dropdown Provider */}
                <label className="relative flex items-center flex-1 md:flex-initial">
                  <Tv className="w-3.5 h-3.5 cd-accent-text absolute left-2.5 pointer-events-none" />
                  <select
                    aria-label="Filter Provider"
                    value={providerFilter}
                    onChange={(e) =>
                      setProviderFilter(e.target.value as SearchProviderOption)
                    }
                    className="w-full md:w-auto pl-8 pr-7 py-1.5 rounded-xl md:rounded-full bg-[#1C1C22] hover:bg-[#23232B] border border-white/10 text-xs font-medium text-white focus:outline-none focus:border-[var(--cd-accent)] cursor-pointer appearance-none max-w-[175px]"
                  >
                    <option value="All" className="bg-[#141418] text-white">
                      Semua Provider
                    </option>
                    <optgroup
                      label="Provider Utama (Cepat)"
                      className="bg-[#141418] text-[#D4AF37]"
                    >
                      {PRIORITY_SEARCH_PROVIDERS.map((prov) => (
                        <option
                          key={prov}
                          value={prov}
                          className="bg-[#141418] text-white"
                        >
                          {prov}
                        </option>
                      ))}
                      <option value="LK21" className="bg-[#141418] text-white">
                        LK21 (Movies)
                      </option>
                      <option value="LookSeries" className="bg-[#141418] text-white">
                        LookSeries (Movies)
                      </option>
                    </optgroup>
                    <optgroup
                      label="Provider Lainnya"
                      className="bg-[#141418] text-[#A1A1AA]"
                    >
                      {OTHER_PROVIDERS.map((prov) => (
                        <option
                          key={prov}
                          value={prov}
                          className="bg-[#141418] text-white"
                        >
                          {prov}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA] absolute right-2.5 pointer-events-none" />
                </label>
              </div>
            </form>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close search modal"
              className="p-2.5 rounded-full bg-[#141418] border border-white/10 text-white hover:border-white/30 shrink-0 mt-0.5 sm:mt-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Category Pills untuk Akses Cepat Endpoint Mola TV */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                      active
                        ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-sm'
                        : 'bg-[#141418] border-white/10 text-[#A1A1AA] hover:text-white hover:border-white/25'
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                );
              })}
            </div>

            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-[#E4E4E7] whitespace-nowrap shrink-0 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results, Recent Searches & Live Trending Searches Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {showInitialEmptyState && (
            <div className="space-y-6">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 cd-accent-text" />
                      {t.search.recentSearches}
                    </h2>
                    <button
                      type="button"
                      onClick={clearRecentSearches}
                      className="inline-flex items-center gap-1 text-xs text-[#A1A1AA] hover:text-[var(--cd-accent)] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t.search.clearRecent}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((kw) => (
                      <div
                        key={kw}
                        className="inline-flex items-center rounded-full bg-[#141418] border border-white/10 hover:border-[var(--cd-accent)]/60 transition-colors overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => handleApplyKeyword(kw)}
                          className="pl-3.5 pr-2 py-1.5 text-xs font-medium text-white hover:cd-accent-text transition-colors"
                        >
                          {kw}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRecentSearch(kw)}
                          aria-label={`${t.search.removeRecent}: ${kw}`}
                          className="pr-2.5 pl-1 py-1.5 text-[#71717A] hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Searches */}
              {(filteredTrending.length > 0 || genreSuggestions.length > 0) && (
                <div className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-[#D4AF37]" />
                    {t.search.trendingSearches}
                  </h2>

                  {filteredTrending.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredTrending.map((item, idx) => {
                        const detailHref = getDramaPath(
                          item.bookId,
                          item.title,
                          item.provider,
                          item.slug
                        );
                        const watchHref = getWatchPath(
                          item.bookId,
                          item.title,
                          item.provider,
                          item.slug,
                          1
                        );
                        const isSingleMovie =
                          (item.mediaType === 'movie' ||
                            item.provider === 'LK21' ||
                            item.provider === 'LookSeries') &&
                          Math.max(1, item.chapterCount || 1) <= 1;
                        return (
                          <div
                            key={`trending-${item.provider}:${item.bookId}`}
                            className="group flex items-center gap-3 p-2.5 rounded-xl bg-[#141418] border border-white/10 hover:border-[var(--cd-accent)]/60 transition-colors"
                          >
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold tabular-nums shrink-0 ${
                                idx < 3
                                  ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40'
                                  : 'bg-white/5 text-[#A1A1AA]'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <a
                              href={detailHref}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                e.preventDefault();
                                handleSelect(item);
                              }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="text-xs font-semibold text-white group-hover:text-[var(--cd-accent)] truncate transition-colors">
                                {item.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#A1A1AA]">
                                <span>{item.provider}</span>
                                <span>·</span>
                                <span className="tabular-nums">
                                  {isSingleMovie ? item.quality || 'HD' : `${item.chapterCount} Eps`}
                                </span>
                              </div>
                            </a>
                            <a
                              href={watchHref}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                e.preventDefault();
                                addRecentSearch(item.title);
                                onClose();
                                onQuickPlay(item);
                              }}
                              aria-label={`Play ${item.title}`}
                              className="w-8 h-8 rounded-full bg-white/5 hover:cd-accent-bg text-white flex items-center justify-center shrink-0 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {genreSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {genreSuggestions.map((genre) => (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => handleApplyKeyword(genre)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#181518] border border-white/10 hover:border-[#D4AF37]/60 text-[11px] font-medium text-[#E4E4E7] hover:text-white transition-colors"
                        >
                          <Hash className="w-3 h-3 text-[#D4AF37]" />
                          <span>{genre}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recentSearches.length === 0 && filteredTrending.length === 0 && (
                <div className="p-6 rounded-2xl bg-[#141418] border border-white/10 text-center">
                  <Search className="w-8 h-8 cd-accent-text mx-auto mb-2.5 opacity-80" />
                  <p className="text-sm font-semibold text-white">
                    {t.search.title}
                  </p>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    {t.search.placeholder}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Cold Loading Skeleton State */}
          {!showInitialEmptyState && loading && results.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                <Loader2 className="w-3.5 h-3.5 cd-accent-text animate-spin" />
                <span>
                  {providerFilter === 'All'
                    ? `Memuat ${activeCategoryLabel.toLowerCase()} dari provider utama...`
                    : `Mencari di ${providerFilter} (${activeCategoryLabel})...`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                    <div className="px-0.5 space-y-1.5">
                      <div className="h-3.5 w-[88%] rounded skeleton-espresso" />
                      <div className="h-3 w-[55%] rounded skeleton-espresso" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty Results State */}
          {!showInitialEmptyState &&
            !loading &&
            !isRefreshing &&
            searchedOnce &&
            results.length === 0 && (
              <div className="p-10 rounded-2xl bg-[#141418] border border-white/10 text-center space-y-3">
                <Film className="w-8 h-8 cd-accent-text mx-auto opacity-70" />
                <div>
                  <p className="text-base font-bold text-white">
                    {t.search.noResults}
                  </p>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    {t.search.tryAnother}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {isFilterActive && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Filter</span>
                    </button>
                  )}
                  {providerFilter === 'All' && debouncedQuery && !deepSearch && (
                    <button
                      type="button"
                      onClick={() => setDeepSearch(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full cd-accent-bg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Cari di semua 49 provider</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          {/* Results Grid */}
          {!showInitialEmptyState && results.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#A1A1AA] tabular-nums">
                  <span className="font-semibold text-white">
                    {results.length}
                  </span>
                  <span>
                    {providerFilter === 'All'
                      ? t.search.resultsCount
                      : `hasil dari ${providerFilter}`}
                  </span>
                  {categoryFilter !== 'all' && (
                    <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-semibold">
                      {activeCategoryLabel}
                    </span>
                  )}
                  {cacheHit && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                      <Zap className="w-2.5 h-2.5" />
                      Instan (Cache)
                    </span>
                  )}
                  {(isRefreshing || isWaitingDebounce) && (
                    <span className="inline-flex items-center gap-1 text-[11px] cd-accent-text">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Memperbarui...
                    </span>
                  )}
                </div>

                {providerFilter === 'All' && debouncedQuery && !deepSearch && (
                  <button
                    type="button"
                    onClick={() => setDeepSearch(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141418] border border-white/15 hover:border-[var(--cd-accent)] text-[11px] font-medium text-[#E4E4E7] hover:text-white transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                    <span>Perluas ke 49 provider</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 sm:gap-4">
                {results.map((item) => {
                  const key = `${item.provider}:${item.bookId}`;
                  const showCover = Boolean(item.cover) && !failedCovers[key];
                  const episodeCount = Math.max(1, item.chapterCount || 1);
                  const detailHref = getDramaPath(
                    item.bookId,
                    item.title,
                    item.provider,
                    item.slug
                  );
                  const watchHref = getWatchPath(
                    item.bookId,
                    item.title,
                    item.provider,
                    item.slug,
                    1
                  );
                  const isSingleMovie =
                    (item.mediaType === 'movie' ||
                      item.provider === 'LK21' ||
                      item.provider === 'LookSeries') &&
                    episodeCount <= 1;
                  return (
                    <article
                      key={key}
                      className="group relative flex flex-col rounded-xl"
                    >
                      <a
                        href={detailHref}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          handleSelect(item);
                        }}
                        aria-label={`Open ${item.title}`}
                        className="absolute inset-0 z-10 rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)]"
                      />
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#141418] border border-white/10 group-hover:border-[var(--cd-accent)]/75 transition-all pointer-events-none">
                        {showCover ? (
                          <img
                            src={item.cover}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedCovers((prev) => ({
                                ...prev,
                                [key]: true,
                              }))
                            }
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-3 text-center bg-gradient-to-br from-[#231915] to-[#0D0A09]">
                            <span className="text-xs text-white font-semibold line-clamp-3">
                              {item.title}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                        <div className="absolute top-2 left-2">
                          <ProviderBadge provider={item.provider} size="xs" />
                        </div>
                        <a
                          href={watchHref}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                              e.stopPropagation();
                              return;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                            if (query.trim()) addRecentSearch(query.trim());
                            onClose();
                            onQuickPlay(item);
                          }}
                          aria-label={`Play ${item.title}`}
                          className="absolute top-2 right-2 z-20 pointer-events-auto w-8 h-8 rounded-full cd-accent-bg text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </a>
                      </div>
                      <div className="mt-2 px-0.5 space-y-1 pointer-events-none">
                        <h3 className="text-[13px] sm:text-sm font-semibold text-white line-clamp-2 leading-[1.35] min-h-[2.7em] group-hover:text-[var(--cd-accent-text)] transition-colors">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA] tabular-nums truncate">
                          <span>
                            {isSingleMovie ? item.quality || 'HD' : `Ep: ${episodeCount}`}
                          </span>
                          {item.tags[0] && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span className="truncate">{item.tags[0]}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

