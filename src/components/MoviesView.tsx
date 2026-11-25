import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clapperboard,
  Film,
  Flame,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import {
  LOOKSERIES_TOPIC_CATEGORIES,
  fetchLk21Category,
  fetchLk21Home,
  fetchLk21Latest,
  fetchLk21Menu,
  fetchLookSeriesCategory,
  fetchLookSeriesFeed,
  movieToDramaItem,
  searchLk21Movies,
  searchLookSeriesMovies,
  type LookSeriesFeedSection,
} from '../services/movieService';
import { useDramaContext } from '../context/DramaContext';
import { HeroSpotlight } from './HeroSpotlight';
import { CarouselRow } from './CarouselRow';
import { DramaCard } from './DramaCard';
import { CarouselSkeleton, SkeletonCard } from './SkeletonCard';
import type {
  DramaItem,
  Lk21HomeResponse,
  Lk21MenuResponse,
  MovieItem,
} from '../types/drama';

type MovieProviderFilter = 'all' | 'lk21' | 'lookseries';

interface MoviesViewProps {
  myListIds: string[];
  onSelectMovie: (movie: DramaItem) => void;
  onQuickPlayMovie: (movie: DramaItem) => void;
  onToggleMyList: (movie: DramaItem) => void;
  onSelectTag?: (tag: string) => void;
  onMoviesPoolChange?: (items: DramaItem[]) => void;
}

function getMovieKey(item: Pick<DramaItem, 'provider' | 'bookId'>): string {
  return `${item.provider}:${item.bookId}`;
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  myListIds,
  onSelectMovie,
  onQuickPlayMovie,
  onToggleMyList,
  onSelectTag,
  onMoviesPoolChange,
}) => {
  const { t } = useDramaContext();

  const [providerMode, setProviderMode] = useState<MovieProviderFilter>('all');

  const [homeData, setHomeData] = useState<Lk21HomeResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [menuData, setMenuData] = useState<Lk21MenuResponse | null>(null);

  const [latestMovies, setLatestMovies] = useState<MovieItem[]>([]);
  const [latestPage, setLatestPage] = useState(1);
  const [latestHasMore, setLatestHasMore] = useState(false);
  const [latestLoading, setLatestLoading] = useState(true);
  const [latestLoadingMore, setLatestLoadingMore] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);

  // LookSeries home rows & paginated For You grid
  const [lsRows, setLsRows] = useState<
    Array<{ key: string; label: string; items: MovieItem[] }>
  >([]);
  const [lsLoading, setLsLoading] = useState(true);
  const [lsForYouItems, setLsForYouItems] = useState<MovieItem[]>([]);
  const [lsForYouPage, setLsForYouPage] = useState(1);
  const [lsForYouHasMore, setLsForYouHasMore] = useState(false);
  const [lsForYouLoadingMore, setLsForYouLoadingMore] = useState(false);

  const [activeCategoryKey, setActiveCategoryKey] = useState<string>('all');
  const [activeCategoryLabel, setActiveCategoryLabel] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');

  const [categoryItems, setCategoryItems] = useState<MovieItem[]>([]);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryLoadingMore, setCategoryLoadingMore] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [searchItems, setSearchItems] = useState<MovieItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadHomeAndMenu = useCallback(async () => {
    setHomeLoading(true);
    setHomeError(null);
    try {
      const [homeRes, menuRes] = await Promise.allSettled([
        fetchLk21Home(),
        fetchLk21Menu(),
      ]);
      if (homeRes.status === 'fulfilled') {
        setHomeData(homeRes.value);
      } else {
        setHomeError(
          homeRes.reason instanceof Error
            ? homeRes.reason.message
            : 'Failed to load movies catalog'
        );
      }
      if (menuRes.status === 'fulfilled') {
        setMenuData(menuRes.value);
      }
    } finally {
      setHomeLoading(false);
    }
  }, []);

  const loadLookSeriesInitial = useCallback(async () => {
    setLsLoading(true);
    try {
      const [foryouRes, filmRes, seriesRes, kartunRes, netflixRes] =
        await Promise.allSettled([
          fetchLookSeriesFeed('foryou', 1),
          fetchLookSeriesFeed('film', 1),
          fetchLookSeriesFeed('series', 1),
          fetchLookSeriesFeed('kartun', 1),
          fetchLookSeriesCategory('netflix', 1),
        ]);

      const rows: Array<{ key: string; label: string; items: MovieItem[] }> = [];
      if (foryouRes.status === 'fulfilled' && foryouRes.value.items.length > 0) {
        setLsForYouItems(foryouRes.value.items);
        setLsForYouPage(foryouRes.value.page || 1);
        setLsForYouHasMore(Boolean(foryouRes.value.hasMore));
        rows.push({
          key: 'ls.foryou',
          label: 'LookSeries: For You',
          items: foryouRes.value.items,
        });
      }
      if (filmRes.status === 'fulfilled' && filmRes.value.items.length > 0) {
        rows.push({
          key: 'ls.film',
          label: 'LookSeries: Film',
          items: filmRes.value.items,
        });
      }
      if (seriesRes.status === 'fulfilled' && seriesRes.value.items.length > 0) {
        rows.push({
          key: 'ls.series',
          label: 'LookSeries: Series',
          items: seriesRes.value.items,
        });
      }
      if (kartunRes.status === 'fulfilled' && kartunRes.value.items.length > 0) {
        rows.push({
          key: 'ls.kartun',
          label: 'LookSeries: Kartun & Anime',
          items: kartunRes.value.items,
        });
      }
      if (netflixRes.status === 'fulfilled' && netflixRes.value.items.length > 0) {
        rows.push({
          key: 'ls.topic.netflix',
          label: 'LookSeries: Netflix',
          items: netflixRes.value.items,
        });
      }
      setLsRows(rows);
    } finally {
      setLsLoading(false);
    }
  }, []);

  const loadMoreLookSeriesForYou = async () => {
    if (lsForYouLoadingMore || !lsForYouHasMore) return;
    setLsForYouLoadingMore(true);
    try {
      const nextPage = lsForYouPage + 1;
      const res = await fetchLookSeriesFeed('foryou', nextPage);
      setLsForYouPage(res.page || nextPage);
      setLsForYouHasMore(Boolean(res.hasMore));
      setLsForYouItems((prev) => {
        const seen = new Set(prev.map((m) => m.slug || m.id));
        return [
          ...prev,
          ...res.items.filter((m) => !seen.has(m.slug || m.id)),
        ];
      });
    } finally {
      setLsForYouLoadingMore(false);
    }
  };

  const loadLatestPage = useCallback(async (page = 1, append = false) => {
    if (append) {
      setLatestLoadingMore(true);
    } else {
      setLatestLoading(true);
    }
    setLatestError(null);
    try {
      const res = await fetchLk21Latest(page);
      setLatestPage(res.page || page);
      setLatestHasMore(Boolean(res.hasMore));
      setLatestMovies((prev) => {
        if (!append) return res.items;
        const seen = new Set(prev.map((m) => m.slug));
        return [...prev, ...res.items.filter((m) => !seen.has(m.slug))];
      });
    } catch (err) {
      setLatestError(
        err instanceof Error ? err.message : 'Failed to load latest movies'
      );
    } finally {
      setLatestLoading(false);
      setLatestLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadHomeAndMenu();
    void loadLatestPage(1, false);
    void loadLookSeriesInitial();
  }, [loadHomeAndMenu, loadLatestPage, loadLookSeriesInitial]);

  const loadCategoryByKey = useCallback(
    async (
      key: string,
      label: string,
      page = 1,
      append = false,
      fallbackQuery?: string
    ) => {
      if (append) {
        setCategoryLoadingMore(true);
      } else {
        setCategoryLoading(true);
      }
      setCategoryError(null);
      try {
        let res;
        if (key.startsWith('ls.topic.')) {
          const topicId = key.replace(/^ls\.topic\./, '');
          res = await fetchLookSeriesCategory(topicId, page);
        } else if (key.startsWith('ls.')) {
          const section = key.replace(/^ls\./, '') as LookSeriesFeedSection;
          res = await fetchLookSeriesFeed(section, page);
        } else {
          res = await fetchLk21Category(key, page);
          if (res.items.length === 0 && !append && fallbackQuery) {
            const searchFallback = await searchLk21Movies(fallbackQuery, 1);
            if (searchFallback.items.length > 0) {
              res = searchFallback;
            }
          }
        }
        setCategoryPage(res.page || page);
        setCategoryHasMore(Boolean(res.hasMore));
        setActiveCategoryLabel(res.label || label);
        setCategoryItems((prev) => {
          if (!append) return res.items;
          const seen = new Set(prev.map((m) => `${m.app}:${m.slug || m.id}`));
          return [
            ...prev,
            ...res.items.filter((m) => !seen.has(`${m.app}:${m.slug || m.id}`)),
          ];
        });
      } catch (err) {
        setCategoryError(
          err instanceof Error ? err.message : 'Failed to load movie category'
        );
      } finally {
        setCategoryLoading(false);
        setCategoryLoadingMore(false);
      }
    },
    []
  );

  // Debounced live search when user types into the dedicated Movies search box
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setSubmittedSearch('');
      setSearchItems([]);
      setSearchHasMore(false);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        if (providerMode === 'lookseries') {
          const res = await searchLookSeriesMovies(trimmed, 1);
          if (cancelled) return;
          setSubmittedSearch(trimmed);
          setSearchItems(res.items);
          setSearchPage(res.page || 1);
          setSearchHasMore(Boolean(res.hasMore));
        } else if (providerMode === 'lk21') {
          const res = await searchLk21Movies(trimmed, 1);
          if (cancelled) return;
          setSubmittedSearch(trimmed);
          setSearchItems(res.items);
          setSearchPage(res.page || 1);
          setSearchHasMore(Boolean(res.hasMore));
        } else {
          const [lkRes, lsRes] = await Promise.allSettled([
            searchLk21Movies(trimmed, 1),
            searchLookSeriesMovies(trimmed, 1),
          ]);
          if (cancelled) return;
          const lkItems = lkRes.status === 'fulfilled' ? lkRes.value.items : [];
          const lsItems = lsRes.status === 'fulfilled' ? lsRes.value.items : [];
          const merged: MovieItem[] = [];
          const maxLen = Math.max(lkItems.length, lsItems.length);
          for (let i = 0; i < maxLen; i++) {
            if (lsItems[i]) merged.push(lsItems[i]);
            if (lkItems[i]) merged.push(lkItems[i]);
          }
          setSubmittedSearch(trimmed);
          setSearchItems(merged);
          setSearchPage(1);
          setSearchHasMore(
            Boolean(
              (lkRes.status === 'fulfilled' && lkRes.value.hasMore) ||
                (lsRes.status === 'fulfilled' && lsRes.value.hasMore)
            )
          );
        }
      } catch (err) {
        if (cancelled) return;
        setSearchError(
          err instanceof Error ? err.message : 'Failed to search movies'
        );
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 360);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput, providerMode]);

  const handleLoadMoreSearch = async () => {
    if (!submittedSearch || searchLoadingMore) return;
    setSearchLoadingMore(true);
    try {
      const nextPage = searchPage + 1;
      if (providerMode === 'lookseries') {
        const res = await searchLookSeriesMovies(submittedSearch, nextPage);
        setSearchPage(res.page || nextPage);
        setSearchHasMore(Boolean(res.hasMore));
        setSearchItems((prev) => {
          const seen = new Set(prev.map((m) => `${m.app}:${m.slug || m.id}`));
          return [
            ...prev,
            ...res.items.filter((m) => !seen.has(`${m.app}:${m.slug || m.id}`)),
          ];
        });
      } else if (providerMode === 'lk21') {
        const res = await searchLk21Movies(submittedSearch, nextPage);
        setSearchPage(res.page || nextPage);
        setSearchHasMore(Boolean(res.hasMore));
        setSearchItems((prev) => {
          const seen = new Set(prev.map((m) => `${m.app}:${m.slug || m.id}`));
          return [
            ...prev,
            ...res.items.filter((m) => !seen.has(`${m.app}:${m.slug || m.id}`)),
          ];
        });
      } else {
        const [lkRes, lsRes] = await Promise.allSettled([
          searchLk21Movies(submittedSearch, nextPage),
          searchLookSeriesMovies(submittedSearch, nextPage),
        ]);
        const lkItems = lkRes.status === 'fulfilled' ? lkRes.value.items : [];
        const lsItems = lsRes.status === 'fulfilled' ? lsRes.value.items : [];
        setSearchPage(nextPage);
        setSearchHasMore(
          Boolean(
            (lkRes.status === 'fulfilled' && lkRes.value.hasMore) ||
              (lsRes.status === 'fulfilled' && lsRes.value.hasMore)
          )
        );
        setSearchItems((prev) => {
          const seen = new Set(prev.map((m) => `${m.app}:${m.slug || m.id}`));
          const additions = [...lsItems, ...lkItems].filter(
            (m) => !seen.has(`${m.app}:${m.slug || m.id}`)
          );
          return [...prev, ...additions];
        });
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Failed to load more search results'
      );
    } finally {
      setSearchLoadingMore(false);
    }
  };

  const resetAllFilters = () => {
    setSearchInput('');
    setSubmittedSearch('');
    setActiveCategoryKey('all');
    setActiveCategoryLabel('');
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedYear('');
    setCategoryItems([]);
    setCategoryError(null);
  };

  const handleSelectProviderMode = (mode: MovieProviderFilter) => {
    setProviderMode(mode);
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedYear('');
    setActiveCategoryKey('all');
    setActiveCategoryLabel('');
    setCategoryItems([]);
    setCategoryError(null);
  };

  const handleSelectTypeOrRow = (key: string, label: string) => {
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedYear('');
    setSearchInput('');
    setSubmittedSearch('');
    if (key === 'all') {
      setActiveCategoryKey('all');
      setActiveCategoryLabel('');
      setCategoryItems([]);
      return;
    }
    setActiveCategoryKey(key);
    setActiveCategoryLabel(label);
    void loadCategoryByKey(key, label, 1, false);
  };

  const handleSelectGenre = (slug: string) => {
    setSelectedGenre(slug);
    setSelectedCountry('');
    setSelectedYear('');
    if (!slug) {
      setActiveCategoryKey('all');
      setActiveCategoryLabel('');
      return;
    }
    const gObj = menuData?.genres.find((g) => g.slug === slug);
    const label = gObj?.name || slug;
    const key = `lk21.genre.${slug}`;
    setActiveCategoryKey(key);
    setActiveCategoryLabel(`${t.moviesPage.genreFilter}: ${label}`);
    void loadCategoryByKey(key, label, 1, false, label);
  };

  const handleSelectCountry = (slug: string) => {
    setSelectedCountry(slug);
    setSelectedGenre('');
    setSelectedYear('');
    if (!slug) {
      setActiveCategoryKey('all');
      setActiveCategoryLabel('');
      return;
    }
    const cObj = menuData?.countries.find((c) => c.slug === slug);
    const label = cObj?.name || slug;
    const key = `lk21.country.${slug}`;
    setActiveCategoryKey(key);
    setActiveCategoryLabel(`${t.moviesPage.countryFilter}: ${label}`);
    void loadCategoryByKey(key, label, 1, false, label);
  };

  const handleSelectYear = (slug: string) => {
    setSelectedYear(slug);
    setSelectedGenre('');
    setSelectedCountry('');
    if (!slug) {
      setActiveCategoryKey('all');
      setActiveCategoryLabel('');
      return;
    }
    const yObj = menuData?.years.find((y) => y.slug === slug);
    const label = yObj?.name || slug;
    const key = `lk21.year.${slug}`;
    setActiveCategoryKey(key);
    setActiveCategoryLabel(`${t.moviesPage.yearFilter}: ${label}`);
    void loadCategoryByKey(key, label, 1, false, label);
  };

  // Convert LK21 & LookSeries MovieItem lists into unified DramaItem cards
  const homeRowsConverted = useMemo(() => {
    if (!homeData?.rows) return [];
    return homeData.rows.map((row) => ({
      key: row.key,
      label: row.label,
      items: row.items.map((m) => movieToDramaItem(m, 1)),
    }));
  }, [homeData]);

  const lsRowsConverted = useMemo(
    () =>
      lsRows.map((row) => ({
        key: row.key,
        label: row.label,
        items: row.items.map((m) => movieToDramaItem(m, 1)),
      })),
    [lsRows]
  );

  const lsForYouConverted = useMemo(
    () => lsForYouItems.map((m) => movieToDramaItem(m, 1)),
    [lsForYouItems]
  );

  const visibleHomeRows = useMemo(() => {
    if (providerMode === 'lk21') return homeRowsConverted;
    if (providerMode === 'lookseries') return lsRowsConverted;
    return [...homeRowsConverted, ...lsRowsConverted];
  }, [providerMode, homeRowsConverted, lsRowsConverted]);

  const heroMovies = useMemo(() => {
    const seen = new Set<string>();
    const featured: DramaItem[] = [];
    const sourceRows =
      providerMode === 'lookseries'
        ? lsRowsConverted
        : providerMode === 'lk21'
        ? homeRowsConverted
        : [...lsRowsConverted.slice(0, 1), ...homeRowsConverted];

    for (const row of sourceRows) {
      for (const item of row.items) {
        const key = getMovieKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          featured.push(item);
        }
        if (featured.length >= 6) return featured;
      }
    }
    const fallback =
      providerMode === 'lookseries' ? lsForYouItems : latestMovies;
    return fallback.slice(0, 6).map((m) => movieToDramaItem(m, 1));
  }, [
    providerMode,
    homeRowsConverted,
    lsRowsConverted,
    latestMovies,
    lsForYouItems,
  ]);

  const latestConverted = useMemo(
    () => latestMovies.map((m) => movieToDramaItem(m, 1)),
    [latestMovies]
  );

  const categoryConverted = useMemo(
    () => categoryItems.map((m) => movieToDramaItem(m, 1)),
    [categoryItems]
  );

  const searchConverted = useMemo(
    () => searchItems.map((m) => movieToDramaItem(m, 1)),
    [searchItems]
  );

  useEffect(() => {
    if (!onMoviesPoolChange) return;
    const poolMap = new Map<string, DramaItem>();
    for (const item of [
      ...heroMovies,
      ...homeRowsConverted.flatMap((r) => r.items),
      ...lsRowsConverted.flatMap((r) => r.items),
      ...lsForYouConverted,
      ...latestConverted,
      ...categoryConverted,
      ...searchConverted,
    ]) {
      poolMap.set(getMovieKey(item), item);
    }
    onMoviesPoolChange(Array.from(poolMap.values()));
  }, [
    heroMovies,
    homeRowsConverted,
    lsRowsConverted,
    lsForYouConverted,
    latestConverted,
    categoryConverted,
    searchConverted,
    onMoviesPoolChange,
  ]);

  const categoryTabs = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [
      { key: 'all', label: t.moviesPage.allMovies },
    ];
    const seen = new Set<string>(['all']);

    if (providerMode !== 'lookseries') {
      for (const tp of menuData?.types ?? []) {
        if (tp.key && !seen.has(tp.key)) {
          seen.add(tp.key);
          out.push({ key: tp.key, label: tp.label || tp.key });
        }
      }
      for (const row of homeData?.rows ?? []) {
        if (row.key && !seen.has(row.key)) {
          seen.add(row.key);
          out.push({ key: row.key, label: row.label || row.key });
        }
      }
    }

    if (providerMode !== 'lk21') {
      const lsTabs: Array<{ key: string; label: string }> = [
        { key: 'ls.foryou', label: 'LookSeries: For You' },
        { key: 'ls.film', label: 'LookSeries: Film' },
        { key: 'ls.series', label: 'LookSeries: Series' },
        { key: 'ls.kartun', label: 'LookSeries: Kartun' },
        ...LOOKSERIES_TOPIC_CATEGORIES.map((c) => ({
          key: `ls.topic.${c.topicId}`,
          label:
            providerMode === 'lookseries' ? c.label : `LookSeries: ${c.label}`,
        })),
      ];
      for (const tab of lsTabs) {
        if (!seen.has(tab.key)) {
          seen.add(tab.key);
          out.push(tab);
        }
      }
    }

    return out;
  }, [providerMode, menuData, homeData, t.moviesPage.allMovies]);

  const isSearchMode = Boolean(searchInput.trim());
  const isCategoryMode = !isSearchMode && activeCategoryKey !== 'all';

  const providerBadgeText =
    providerMode === 'lookseries'
      ? 'LookSeries Cinema'
      : providerMode === 'lk21'
      ? 'LK21 Cinema'
      : 'LK21 & LookSeries Cinema';

  const isInitialRowsLoading =
    providerMode === 'lookseries'
      ? lsLoading && lsRowsConverted.length === 0
      : homeLoading && homeRowsConverted.length === 0;

  return (
    <div className="pb-14">
      {/* Header + Provider Switcher + Movies Search & Filters */}
      <section className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-5 pb-3 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-600/15 border border-red-500/30 text-[11px] font-bold uppercase tracking-wider text-red-300">
                <Clapperboard className="w-3.5 h-3.5" />
                <span>{providerBadgeText}</span>
              </div>

              {/* Movie Provider Switcher */}
              <div
                className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)]"
                role="group"
                aria-label="Filter provider Movies"
              >
                {(
                  [
                    { id: 'all', label: 'Semua' },
                    { id: 'lk21', label: 'LK21' },
                    { id: 'lookseries', label: 'LookSeries' },
                  ] as const
                ).map((opt) => {
                  const active = providerMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectProviderMode(opt.id)}
                      aria-pressed={active}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        active
                          ? 'cd-accent-bg text-white shadow-sm'
                          : 'text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {t.moviesPage.title}
            </h1>
            <p className="text-xs sm:text-sm text-[#A1A1AA] max-w-2xl">
              {t.moviesPage.subtitle}
            </p>
          </div>

          {/* Dedicated Movies Search Bar */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="w-full lg:w-[380px] flex items-center gap-2.5 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] focus-within:border-[var(--cd-accent)] px-4 py-2.5 shadow-lg transition-colors"
          >
            <Search className="w-4 h-4 cd-accent-text shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.moviesPage.searchPlaceholder}
              aria-label={t.moviesPage.searchPlaceholder}
              className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-[#71717A] focus:outline-none"
            />
            {searchLoading ? (
              <Loader2 className="w-4 h-4 cd-accent-text animate-spin shrink-0" />
            ) : searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear movie search"
                className="p-0.5 text-[#A1A1AA] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </form>
        </div>

        {/* Category Pills + Genre / Country / Year Dropdowns */}
        <div className="space-y-2.5">
          <div
            className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none py-1"
            role="tablist"
            aria-label={t.moviesPage.categoriesTitle}
          >
            {categoryTabs.map((cat) => {
              const active =
                !isSearchMode &&
                activeCategoryKey === cat.key &&
                !selectedGenre &&
                !selectedCountry &&
                !selectedYear;
              return (
                <button
                  key={cat.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleSelectTypeOrRow(cat.key, cat.label)}
                  className={`px-4 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all border ${
                    active
                      ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-sm'
                      : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#E4E4E7] hover:border-white/30'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {providerMode !== 'lookseries' &&
            menuData &&
            (menuData.genres.length > 0 ||
              menuData.countries.length > 0 ||
              menuData.years.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {menuData.genres.length > 0 && (
                  <select
                    value={selectedGenre}
                    onChange={(e) => handleSelectGenre(e.target.value)}
                    aria-label={t.moviesPage.genreFilter}
                    className="px-3 py-1.5 rounded-xl bg-[var(--cd-surface)] border border-[var(--cd-border)] text-xs text-[#E4E4E7] focus:outline-none focus:border-[var(--cd-accent)] cursor-pointer"
                  >
                    <option value="" className="bg-[#141418]">
                      {t.moviesPage.genreFilter}: {t.moviesPage.allOption}
                    </option>
                    {menuData.genres.map((g) => (
                      <option
                        key={g.slug}
                        value={g.slug}
                        className="bg-[#141418]"
                      >
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}

                {menuData.countries.length > 0 && (
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleSelectCountry(e.target.value)}
                    aria-label={t.moviesPage.countryFilter}
                    className="px-3 py-1.5 rounded-xl bg-[var(--cd-surface)] border border-[var(--cd-border)] text-xs text-[#E4E4E7] focus:outline-none focus:border-[var(--cd-accent)] cursor-pointer"
                  >
                    <option value="" className="bg-[#141418]">
                      {t.moviesPage.countryFilter}: {t.moviesPage.allOption}
                    </option>
                    {menuData.countries.map((c) => (
                      <option
                        key={c.slug}
                        value={c.slug}
                        className="bg-[#141418]"
                      >
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                {menuData.years.length > 0 && (
                  <select
                    value={selectedYear}
                    onChange={(e) => handleSelectYear(e.target.value)}
                    aria-label={t.moviesPage.yearFilter}
                    className="px-3 py-1.5 rounded-xl bg-[var(--cd-surface)] border border-[var(--cd-border)] text-xs text-[#E4E4E7] focus:outline-none focus:border-[var(--cd-accent)] cursor-pointer"
                  >
                    <option value="" className="bg-[#141418]">
                      {t.moviesPage.yearFilter}: {t.moviesPage.allOption}
                    </option>
                    {menuData.years.map((y) => (
                      <option
                        key={y.slug}
                        value={y.slug}
                        className="bg-[#141418]"
                      >
                        {y.name}
                      </option>
                    ))}
                  </select>
                )}

                {(isCategoryMode || isSearchMode) && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 text-xs text-[#D4D4D8] hover:text-white transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t.moviesPage.clearFilters}</span>
                  </button>
                )}
              </div>
            )}

          {providerMode === 'lookseries' && (isCategoryMode || isSearchMode) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 text-xs text-[#D4D4D8] hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.moviesPage.clearFilters}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Search Mode Grid */}
      {isSearchMode ? (
        <section className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-2">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              “{searchInput.trim()}”
            </h2>
            <span className="text-xs text-[#A1A1AA] tabular-nums">
              {searchConverted.length} {t.moviesPage.titlesCount}
            </span>
          </div>

          {searchLoading && searchConverted.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} fluid />
              ))}
            </div>
          ) : searchError && searchConverted.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 text-center max-w-lg mx-auto my-8 space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm text-white font-semibold">{searchError}</p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.moviesPage.clearFilters}</span>
              </button>
            </div>
          ) : searchConverted.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center max-w-lg mx-auto my-8 space-y-3">
              <Film className="w-8 h-8 cd-accent-text mx-auto opacity-70" />
              <p className="text-sm font-semibold text-white">
                {t.moviesPage.noResults}
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-full cd-accent-bg text-xs font-semibold text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.moviesPage.clearFilters}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                {searchConverted.map((movie) => {
                  const key = getMovieKey(movie);
                  return (
                    <DramaCard
                      key={key}
                      drama={movie}
                      fluid
                      isSaved={myListIds.includes(key)}
                      onSelect={onSelectMovie}
                      onQuickPlay={onQuickPlayMovie}
                      onToggleMyList={onToggleMyList}
                    />
                  );
                })}
              </div>
              {searchHasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void handleLoadMoreSearch()}
                    disabled={searchLoadingMore}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
                  >
                    {searchLoadingMore && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    <span>
                      {searchLoadingMore
                        ? t.sections.loading
                        : t.moviesPage.loadMore}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : isCategoryMode ? (
        /* Category / Filter Grid */
        <section className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-2">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              {activeCategoryLabel}
            </h2>
            <span className="text-xs text-[#A1A1AA] tabular-nums">
              {categoryConverted.length} {t.moviesPage.titlesCount}
            </span>
          </div>

          {categoryLoading && categoryConverted.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} fluid />
              ))}
            </div>
          ) : categoryError && categoryConverted.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 text-center max-w-lg mx-auto my-8 space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm text-white font-semibold">{categoryError}</p>
              <button
                type="button"
                onClick={() =>
                  void loadCategoryByKey(
                    activeCategoryKey,
                    activeCategoryLabel,
                    1,
                    false
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-xs font-semibold text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.player.retry}</span>
              </button>
            </div>
          ) : categoryConverted.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center max-w-lg mx-auto my-8 space-y-3">
              <Film className="w-8 h-8 cd-accent-text mx-auto opacity-70" />
              <p className="text-sm font-semibold text-white">
                {t.moviesPage.noResults}
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-full cd-accent-bg text-xs font-semibold text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t.moviesPage.clearFilters}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                {categoryConverted.map((movie) => {
                  const key = getMovieKey(movie);
                  return (
                    <DramaCard
                      key={key}
                      drama={movie}
                      fluid
                      isSaved={myListIds.includes(key)}
                      onSelect={onSelectMovie}
                      onQuickPlay={onQuickPlayMovie}
                      onToggleMyList={onToggleMyList}
                    />
                  );
                })}
              </div>
              {categoryHasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      void loadCategoryByKey(
                        activeCategoryKey,
                        activeCategoryLabel,
                        categoryPage + 1,
                        true
                      )
                    }
                    disabled={categoryLoadingMore}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
                  >
                    {categoryLoadingMore && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    <span>
                      {categoryLoadingMore
                        ? t.sections.loading
                        : t.moviesPage.loadMore}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        /* Default Movies Landing: Hero Spotlight + Carousels + Paginated Grid */
        <>
          <HeroSpotlight
            spotlights={heroMovies}
            loading={isInitialRowsLoading && heroMovies.length === 0}
            onPlayFirstEpisode={onQuickPlayMovie}
            onOpenDetails={onSelectMovie}
            onSelectTag={onSelectTag}
          />

          {isInitialRowsLoading ? (
            <div className="space-y-6">
              <CarouselSkeleton />
              <CarouselSkeleton />
            </div>
          ) : homeError && visibleHomeRows.length === 0 ? (
            <section className="max-w-[1440px] mx-auto px-4 md:px-8 py-8">
              <div className="p-8 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 text-center max-w-lg mx-auto space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm text-white font-semibold">{homeError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void loadHomeAndMenu();
                    void loadLookSeriesInitial();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-xs font-semibold text-white"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.player.retry}</span>
                </button>
              </div>
            </section>
          ) : (
            visibleHomeRows.map((row, idx) => (
              <CarouselRow
                key={row.key || row.label}
                title={row.label}
                icon={
                  idx === 0 ? (
                    <Flame className="w-4 h-4 cd-accent-text shrink-0" />
                  ) : row.key.startsWith('ls.') ? (
                    <Tv className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  )
                }
                items={row.items}
                loading={false}
                error={null}
                ranked={idx === 0}
                myListIds={myListIds}
                onRetry={() => {
                  void loadHomeAndMenu();
                  void loadLookSeriesInitial();
                }}
                onSeeAll={() => handleSelectTypeOrRow(row.key, row.label)}
                onSelectDrama={onSelectMovie}
                onQuickPlay={onQuickPlayMovie}
                onToggleMyList={onToggleMyList}
              />
            ))
          )}

          {/* LookSeries Paginated Grid when LookSeries mode active */}
          {providerMode === 'lookseries' ? (
            <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-8">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Tv className="w-4 h-4 text-sky-400 shrink-0" />
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                    LookSeries: For You
                  </h2>
                </div>
                {lsForYouConverted.length > 0 && (
                  <span className="text-xs text-[#A1A1AA] tabular-nums shrink-0">
                    {lsForYouConverted.length} {t.moviesPage.titlesCount}
                  </span>
                )}
              </div>

              {lsLoading && lsForYouConverted.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                      <div className="h-3.5 w-[85%] rounded skeleton-espresso" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                    {lsForYouConverted.map((movie) => {
                      const key = getMovieKey(movie);
                      return (
                        <DramaCard
                          key={key}
                          drama={movie}
                          fluid
                          isSaved={myListIds.includes(key)}
                          onSelect={onSelectMovie}
                          onQuickPlay={onQuickPlayMovie}
                          onToggleMyList={onToggleMyList}
                        />
                      );
                    })}
                  </div>

                  {lsForYouHasMore && (
                    <div className="mt-8 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadMoreLookSeriesForYou()}
                        disabled={lsForYouLoadingMore}
                        className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
                      >
                        {lsForYouLoadingMore && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        <span>
                          {lsForYouLoadingMore
                            ? t.sections.loading
                            : t.moviesPage.loadMore}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            /* Latest LK21 Movies Grid */
            <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-8">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Film className="w-4 h-4 cd-accent-text shrink-0" />
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                    {t.moviesPage.latestMovies}
                  </h2>
                </div>
                {latestConverted.length > 0 && (
                  <span className="text-xs text-[#A1A1AA] tabular-nums shrink-0">
                    {latestConverted.length} {t.moviesPage.titlesCount}
                  </span>
                )}
              </div>

              {latestLoading && latestConverted.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
                      <div className="h-3.5 w-[85%] rounded skeleton-espresso" />
                    </div>
                  ))}
                </div>
              ) : latestError && latestConverted.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 text-center max-w-md mx-auto space-y-3">
                  <p className="text-xs text-[#E4E4E7]">{latestError}</p>
                  <button
                    type="button"
                    onClick={() => void loadLatestPage(1, false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full cd-accent-bg text-xs font-semibold text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.player.retry}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
                    {latestConverted.map((movie) => {
                      const key = getMovieKey(movie);
                      return (
                        <DramaCard
                          key={key}
                          drama={movie}
                          fluid
                          isSaved={myListIds.includes(key)}
                          onSelect={onSelectMovie}
                          onQuickPlay={onQuickPlayMovie}
                          onToggleMyList={onToggleMyList}
                        />
                      );
                    })}
                  </div>

                  {latestHasMore && (
                    <div className="mt-8 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadLatestPage(latestPage + 1, true)}
                        disabled={latestLoadingMore}
                        className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
                      >
                        {latestLoadingMore && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        <span>
                          {latestLoadingMore
                            ? t.sections.loading
                            : t.moviesPage.loadMore}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
