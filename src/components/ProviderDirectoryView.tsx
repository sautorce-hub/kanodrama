import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Clapperboard,
  Layers,
  Search,
  X,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { getProviderRouteSlug } from '../constants/providerLogos';
import {
  PROVIDER_DIRECTORY_ITEMS,
  ProviderBrandLogo,
  loadSyncedPlatformLogos,
} from './ProviderHubModal';
import type { ProviderName } from '../types/drama';

interface ProviderDirectoryViewProps {
  counts: { all: number } & Partial<Record<ProviderName, number>>;
  onSelectProvider: (provider: ProviderName) => void;
  onNavigateMovies: () => void;
  onBackHome: () => void;
}

export const ProviderDirectoryView: React.FC<ProviderDirectoryViewProps> = ({
  counts,
  onSelectProvider,
  onNavigateMovies,
  onBackHome,
}) => {
  const { t } = useDramaContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [liveLogos, setLiveLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void loadSyncedPlatformLogos().then((map) => {
      if (active && Object.keys(map).length > 0) {
        setLiveLogos(map);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return PROVIDER_DIRECTORY_ITEMS;
    return PROVIDER_DIRECTORY_ITEMS.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <section
      className="max-w-[1440px] mx-auto px-4 md:px-8 pt-6 pb-14 space-y-6"
      aria-label={t.providers.hubTitle}
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-[#A1A1AA]"
      >
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onBackHome();
          }}
          className="hover:text-white transition-colors"
        >
          {t.nav.home}
        </a>
        <span>/</span>
        <span className="text-white font-semibold">{t.nav.providers}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D4AF37] mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>{t.nav.providers}</span>
          </span>
          <h1 className="text-xl sm:text-3xl font-bold text-white">
            {t.providers.hubTitle}
          </h1>
          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1 max-w-2xl">
            {t.providers.hubSubtitle} · {PROVIDER_DIRECTORY_ITEMS.length} Platforms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/movies"
            onClick={(e) => {
              e.preventDefault();
              onNavigateMovies();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white transition-colors"
          >
            <Clapperboard className="w-3.5 h-3.5 cd-accent-text" />
            <span>{t.nav.movies}</span>
          </a>
          <button
            type="button"
            onClick={onBackHome}
            className="px-4 py-2 min-h-[40px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-white/30 text-xs font-medium text-white transition-colors"
          >
            {t.sections.backToHome}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="max-w-md">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--cd-surface)] border border-white/10 focus-within:border-[var(--cd-accent)]">
          <Search className="w-4 h-4 cd-accent-text shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.providers.searchPlaceholder}
            className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear provider search"
              className="text-[#A1A1AA] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Providers Grid */}
      {filtered.length === 0 ? (
        <div className="py-12 px-6 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center text-sm text-[#A1A1AA]">
          {t.providers.noMatches}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((prov) => {
            const provSlug = getProviderRouteSlug(prov.id);
            const href = `/provider/${provSlug}`;
            const count = counts[prov.id] ?? 0;
            return (
              <a
                key={prov.id}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectProvider(prov.id);
                }}
                className="group p-4 rounded-2xl bg-[var(--cd-surface)] border border-white/10 hover:border-[var(--cd-accent)]/70 flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <ProviderBrandLogo
                    providerId={prov.id}
                    name={prov.name}
                    overrideLogoUrl={liveLogos[prov.id]}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-white truncate group-hover:cd-accent-text transition-colors">
                      {prov.name}
                    </h2>
                    <p className="text-xs text-[#A1A1AA] truncate mt-0.5">
                      {prov.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pl-2">
                  {count > 0 && (
                    <span className="text-[11px] font-semibold text-[#D4AF37] tabular-nums whitespace-nowrap">
                      {count} {t.providers.titlesLoaded}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#71717A] group-hover:text-white transition-colors" />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ProviderDirectoryView;
