import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Film,
  Flame,
  HelpCircle,
  Loader2,
  Sparkles,
  Tag,
} from 'lucide-react';
import { DramaCard } from './DramaCard';
import { SkeletonCard } from './SkeletonCard';
import { useDramaContext } from '../context/DramaContext';
import { DEFAULT_SITE_ORIGIN } from '../i18n/helpers';
import { searchAllProviders } from '../services/dramaProviders';
import {
  CURATED_PROGRAMMATIC_PAGES,
  resolveProgrammaticLanding,
} from '../utils/programmaticSeo';
import { syncProgrammaticLandingSeo } from '../utils/seo';
import type { DramaItem } from '../types/drama';

interface SeoLandingPageProps {
  basePath: 'genre' | 'tag' | 'category';
  slug: string;
  modifier?: string;
  localPool: DramaItem[];
  myListIds: string[];
  onBackHome: () => void;
  onNavigateLanding: (path: string) => void;
  onSelectDrama: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  onToggleMyList: (drama: DramaItem) => void;
}

export const SeoLandingPage: React.FC<SeoLandingPageProps> = ({
  basePath,
  slug,
  modifier,
  localPool,
  myListIds,
  onBackHome,
  onNavigateLanding,
  onSelectDrama,
  onQuickPlay,
  onToggleMyList,
}) => {
  const { language, t } = useDramaContext();
  const landing = useMemo(
    () => resolveProgrammaticLanding(slug, basePath, modifier, language),
    [slug, basePath, modifier, language]
  );

  const [statusFilter, setStatusFilter] = useState<'all' | 'Completed' | 'Ongoing'>(
    landing.filter.status || 'all'
  );
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'newest'>(
    landing.filter.sort || 'popular'
  );
  const [dbItems, setDbItems] = useState<DramaItem[]>([]);
  const [liveFallbackItems, setLiveFallbackItems] = useState<DramaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  useEffect(() => {
    setStatusFilter(landing.filter.status || 'all');
    setSortBy(landing.filter.sort || 'popular');
  }, [landing]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLiveFallbackItems([]);

    const qs = new URLSearchParams({
      slug,
      basePath,
      status: statusFilter,
      sort: sortBy,
      limit: '36',
    });
    if (modifier) qs.set('modifier', modifier);

    fetch(`/api/seo/landing?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; items?: DramaItem[] } | null) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.items) ? data.items : [];
        setDbItems(rows);

        if (rows.length < 8) {
          void searchAllProviders(landing.searchFallbackQuery, 1, 'All')
            .then((res) => {
              if (!cancelled) setLiveFallbackItems(res.items);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (cancelled) return;
        void searchAllProviders(landing.searchFallbackQuery, 1, 'All')
          .then((res) => {
            if (!cancelled) setLiveFallbackItems(res.items);
          })
          .catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, modifier, basePath, statusFilter, sortBy, landing.searchFallbackQuery]);

  const combinedItems = useMemo(() => {
    const queryLower = (landing.filter.genre || landing.searchFallbackQuery).toLowerCase();
    const localMatches = localPool.filter((d) => {
      if (statusFilter !== 'all' && d.status && d.status !== statusFilter) {
        return false;
      }
      const hay = `${d.title} ${d.description} ${d.tags.join(' ')}`.toLowerCase();
      return hay.includes(queryLower);
    });

    const merged: DramaItem[] = [];
    const seen = new Set<string>();
    for (const list of [dbItems, liveFallbackItems, localMatches]) {
      for (const item of list) {
        if (!item?.bookId) continue;
        const key = `${item.provider}:${item.bookId}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
    }
    return merged;
  }, [dbItems, liveFallbackItems, localPool, landing, statusFilter]);

  useEffect(() => {
    syncProgrammaticLandingSeo(landing, combinedItems, language);
  }, [landing, combinedItems, language]);

  return (
    <main className="flex-1 pb-24 md:pb-14">
      <section className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 space-y-6">
        {/* Crawl-Friendly Breadcrumb Bar */}
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs text-[#A1A1AA]"
        >
          <a
            href={`${DEFAULT_SITE_ORIGIN}/`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onBackHome();
            }}
            className="hover:text-white transition-colors"
          >
            Home
          </a>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          <a
            href={`${DEFAULT_SITE_ORIGIN}/explore`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              window.dispatchEvent(
                new CustomEvent('kd:navigate-path', {
                  detail: { path: '/explore' },
                })
              );
            }}
            className="text-[#D4AF37] font-medium hover:underline"
          >
            {landing.routeKindLabel}
          </a>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          <span className="text-white font-semibold truncate">{landing.h1}</span>
        </nav>

        {/* Programmatic Editorial Header */}
        <header className="rounded-2xl bg-gradient-to-br from-[#161210] via-[#111014] to-[#0B0A0C] border border-white/10 p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                <Tag className="w-3.5 h-3.5" />
                <span>{landing.routeKindLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums text-[#A1A1AA]">
                  {combinedItems.length} Series Available
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
                {landing.h1}
              </h1>
              <p className="text-xs sm:text-sm text-[#D4D4D8] leading-relaxed">
                {landing.intro}
              </p>
            </div>

            <button
              type="button"
              onClick={onBackHome}
              className="px-4 py-2 min-h-[40px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
            >
              {t.sections.backToHome}
            </button>
          </div>

          {/* Interactive Status & Sort Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: 'all', label: 'All Releases' },
                  { id: 'Completed', label: 'Completed Seasons' },
                  { id: 'Ongoing', label: 'Ongoing Updates' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    statusFilter === st.id
                      ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                      : 'bg-[#18181D] border-white/10 text-[#D4D4D8] hover:border-white/25'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: 'popular', label: 'Most Popular', icon: Flame },
                  { id: 'rating', label: 'Highest Rated', icon: Sparkles },
                  { id: 'newest', label: 'Newest First', icon: Compass },
                ] as const
              ).map((s) => {
                const Icon = s.icon;
                const active = sortBy === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortBy(s.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                      active
                        ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#FDE68A]'
                        : 'bg-[#18181D] border-white/10 text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Cross-Linked Programmatic SEO Collections (Single-Line Scrollable Strip) */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA]">
            {basePath === 'tag'
              ? 'Explore Related Topics & Tag Playlists'
              : 'Explore Related Genre Directories'}
          </p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            {CURATED_PROGRAMMATIC_PAGES.map((preset) => {
              const targetPath = `/${basePath}/${preset.slug}`;
              const isCurrent = landing.canonicalPath === targetPath;
              return (
                <a
                  key={preset.slug}
                  href={`${DEFAULT_SITE_ORIGIN}${targetPath}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onNavigateLanding(targetPath);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    isCurrent
                      ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                      : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#E4E4E7] hover:border-[var(--cd-accent)]'
                  }`}
                >
                  {basePath === 'tag' ? `#${preset.label}` : preset.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* Catalog Grid (2.5-Card Slider on Mobile / 5-Column Grid on Desktop) */}
        {loading && combinedItems.length === 0 ? (
          <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
            {Array.from({ length: 10 }).map((_, idx) => (
              <SkeletonCard key={idx} responsiveGrid />
            ))}
          </div>
        ) : combinedItems.length === 0 ? (
          <div className="my-10 p-10 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center max-w-lg mx-auto space-y-3">
            <Film className="w-8 h-8 cd-accent-text mx-auto opacity-75" />
            <h2 className="text-lg font-bold text-white">{t.search.noResults}</h2>
            <p className="text-sm text-[#A1A1AA]">{t.search.tryAnother}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {(statusFilter !== 'all' || sortBy !== 'popular') && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSortBy('popular');
                  }}
                  className="px-4 py-2 min-h-[40px] rounded-full cd-accent-bg text-xs font-semibold text-white transition-colors"
                >
                  {t.exploreFilters.resetFilters}
                </button>
              )}
              <a
                href={`${DEFAULT_SITE_ORIGIN}/explore`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent('kd:navigate-path', {
                      detail: { path: '/explore' },
                    })
                  );
                }}
                className="px-4 py-2 min-h-[40px] rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white inline-flex items-center"
              >
                {t.nav.explore}
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5 sm:overflow-visible">
            {combinedItems.map((drama) => (
              <DramaCard
                key={`${drama.provider}:${drama.bookId}`}
                drama={drama}
                isSaved={myListIds.includes(`${drama.provider}:${drama.bookId}`)}
                responsiveGrid
                onSelect={onSelectDrama}
                onQuickPlay={onQuickPlay}
                onToggleMyList={onToggleMyList}
              />
            ))}
          </div>
        )}

        {/* SEO FAQ Section (Aligned 1:1 with JSON-LD FAQPage Schema) */}
        <section
          aria-label="Frequently Asked Questions"
          className="rounded-2xl bg-[#111014] border border-white/10 p-5 sm:p-6 space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <HelpCircle className="w-4 h-4 text-[#D4AF37]" />
            <h2>Frequently Asked Questions</h2>
          </div>
          <div className="divide-y divide-white/10">
            {landing.faqs.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={faq.q} className="py-3 first:pt-1 last:pb-0">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-3 text-left text-xs sm:text-sm font-semibold text-white hover:text-[#D4AF37] transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isOpen ? 'rotate-90 text-[#D4AF37]' : 'text-[#71717A]'
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
};
