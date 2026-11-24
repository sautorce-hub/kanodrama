import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Layers, Loader2, RotateCcw, X } from 'lucide-react';
import {
  ALL_PROVIDER_ADAPTERS,
  getProviderEndpoints,
  type ProviderEndpointSpec,
} from '../services/dramaProviders';
import {
  getOfficialProviderLogoUrl,
  getProxiedLogoUrl,
} from '../constants/providerLogos';
import { useDramaContext } from '../context/DramaContext';
import { DramaCard } from './DramaCard';
import type { DramaItem, LanguageCode, ProviderName } from '../types/drama';

interface EndpointFeedState {
  items: DramaItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loaded: boolean;
}

const INITIAL_ENDPOINT_STATE: EndpointFeedState = {
  items: [],
  page: 1,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
  loaded: false,
};

interface ProviderEndpointSectionProps {
  provider: ProviderName;
  language: LanguageCode;
  myListIds: string[];
  isDedicatedPage?: boolean;
  onResetProvider: () => void;
  onSelectDrama: (drama: DramaItem) => void;
  onQuickPlay: (drama: DramaItem) => void;
  onToggleMyList: (drama: DramaItem) => void;
}

export const ProviderEndpointSection: React.FC<ProviderEndpointSectionProps> = ({
  provider,
  language,
  myListIds,
  isDedicatedPage = false,
  onResetProvider,
  onSelectDrama,
  onQuickPlay,
  onToggleMyList,
}) => {
  const { t } = useDramaContext();
  const endpoints = useMemo(() => getProviderEndpoints(provider), [provider]);
  const adapter = ALL_PROVIDER_ADAPTERS[provider];

  const [activeKey, setActiveKey] = useState<string>(
    () => endpoints[0]?.key ?? 'foryou'
  );
  const officialLogoUrl = getOfficialProviderLogoUrl(provider);
  const proxiedLogoUrl = getProxiedLogoUrl(officialLogoUrl);
  const [logoStage, setLogoStage] = useState<0 | 1 | 2>(
    officialLogoUrl ? 0 : 2
  );
  const [feedMap, setFeedMap] = useState<Record<string, EndpointFeedState>>({});
  const feedMapRef = useRef<Record<string, EndpointFeedState>>(feedMap);
  feedMapRef.current = feedMap;
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  // Reset active endpoint tab and logo state whenever provider changes
  useEffect(() => {
    const firstKey = endpoints[0]?.key ?? 'foryou';
    setActiveKey(firstKey);
    setLogoStage(officialLogoUrl ? 0 : 2);
  }, [provider, endpoints, officialLogoUrl]);

  const activeEndpoint: ProviderEndpointSpec | undefined = useMemo(
    () => endpoints.find((ep) => ep.key === activeKey) ?? endpoints[0],
    [endpoints, activeKey]
  );

  const cacheKey = activeEndpoint
    ? `${provider}:${language}:${activeEndpoint.key}`
    : '';
  const activeState = (cacheKey && feedMap[cacheKey]) || INITIAL_ENDPOINT_STATE;

  const loadEndpointPage = useCallback(
    async (
      spec: ProviderEndpointSpec,
      pageNum: number,
      append: boolean,
      force = false
    ) => {
      const key = `${provider}:${language}:${spec.key}`;
      if (!append && !force) {
        const existing = feedMapRef.current[key];
        if (existing?.loaded && existing.items.length > 0) return;
      }
      if (inFlightKeysRef.current.has(`${key}:${pageNum}`)) return;
      inFlightKeysRef.current.add(`${key}:${pageNum}`);

      setFeedMap((prev) => {
        const current = prev[key] ?? INITIAL_ENDPOINT_STATE;
        return {
          ...prev,
          [key]: {
            ...current,
            loading: !append,
            loadingMore: append,
            error: null,
          },
        };
      });

      try {
        const res = await spec.fetch(pageNum);
        setFeedMap((prev) => {
          const current = prev[key] ?? INITIAL_ENDPOINT_STATE;
          const base = append ? current.items : [];
          const seen = new Set(base.map((d) => `${d.provider}:${d.bookId}`));
          const merged = [...base];
          for (const item of res.items) {
            const itemKey = `${item.provider}:${item.bookId}`;
            if (!seen.has(itemKey)) {
              seen.add(itemKey);
              merged.push(item);
            }
          }
          return {
            ...prev,
            [key]: {
              items: merged,
              page: pageNum,
              hasMore: res.hasMore,
              loading: false,
              loadingMore: false,
              error: null,
              loaded: true,
            },
          };
        });
      } catch (err) {
        setFeedMap((prev) => {
          const current = prev[key] ?? INITIAL_ENDPOINT_STATE;
          return {
            ...prev,
            [key]: {
              ...current,
              loading: false,
              loadingMore: false,
              error:
                err instanceof Error
                  ? err.message
                  : `Failed to load ${spec.label}`,
              loaded: true,
            },
          };
        });
      } finally {
        inFlightKeysRef.current.delete(`${key}:${pageNum}`);
      }
    },
    [provider, language]
  );

  // Automatically fetch the active endpoint when provider, language, or selected endpoint changes
  useEffect(() => {
    if (!activeEndpoint) return;
    const key = `${provider}:${language}:${activeEndpoint.key}`;
    const existing = feedMapRef.current[key];
    if (!existing || (!existing.loaded && !existing.loading)) {
      void loadEndpointPage(activeEndpoint, 1, false);
    }
  }, [provider, language, activeEndpoint, loadEndpointPage]);

  if (!activeEndpoint) return null;

  return (
    <section
      className="max-w-[1440px] mx-auto px-4 md:px-8 pt-4 pb-10"
      aria-label={`${adapter?.label ?? provider} Endpoints`}
    >
      {/* Provider Title & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoStage < 2 && officialLogoUrl ? (
            <div className="w-8 h-8 rounded-lg bg-[#0D0D11] border border-white/15 p-1 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={logoStage === 0 ? officialLogoUrl : proxiedLogoUrl}
                alt={`${adapter?.label ?? provider} official logo`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded"
                onError={() =>
                  setLogoStage((prev) => (prev === 0 && proxiedLogoUrl ? 1 : 2))
                }
              />
            </div>
          ) : (
            <Layers className="w-4 h-4 cd-accent-text shrink-0" />
          )}
          {isDedicatedPage ? (
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
              {adapter?.label ?? provider}
            </h1>
          ) : (
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {adapter?.label ?? provider}
            </h2>
          )}
          <span className="text-xs text-[#A1A1AA] tabular-nums whitespace-nowrap">
            · {endpoints.length} {endpoints.length === 1 ? 'Endpoint' : 'Endpoints'}
          </span>
        </div>

        <button
          type="button"
          onClick={onResetProvider}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-white/30 text-xs font-medium text-[#E4E4E7] hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span>{t.providers.all}</span>
        </button>
      </div>

      {/* Single Horizontal Row of ALL Unique Endpoints for this Provider (Never Wraps Vertically) */}
      <div
        className="overflow-x-auto flex flex-nowrap items-center gap-2 scrollbar-none pb-3 mb-4 border-b border-white/10"
        role="tablist"
        aria-label={`${adapter?.label ?? provider} endpoint categories`}
      >
        {endpoints.map((ep) => {
          const isActive = ep.key === activeEndpoint.key;
          return (
            <button
              key={ep.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveKey(ep.key);
                void loadEndpointPage(ep, 1, false);
              }}
              className={`px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all border ${
                isActive
                  ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-sm'
                  : 'bg-[var(--cd-surface)] border-[var(--cd-border)] text-[#E4E4E7] hover:border-white/30 hover:text-white'
              }`}
            >
              {ep.label}
            </button>
          );
        })}
      </div>

      {/* Active Endpoint Results (Vertical 2-Column Grid with Subtle Right-Edge Peek Margin on Mobile) */}
      {activeState.loading && activeState.items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3.5 pr-10 sm:pr-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="w-full space-y-2">
              <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
              <div className="px-0.5 space-y-1.5">
                <div className="h-3.5 w-[88%] rounded skeleton-espresso" />
                <div className="h-3 w-[55%] rounded skeleton-espresso" />
              </div>
            </div>
          ))}
        </div>
      ) : activeState.error && activeState.items.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[var(--cd-surface)] border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">
                {adapter?.label ?? provider} · {activeEndpoint.label}
              </p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">{activeState.error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadEndpointPage(activeEndpoint, 1, false, true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-full cd-accent-bg text-xs font-semibold text-white shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.player.retry}</span>
          </button>
        </div>
      ) : activeState.items.length === 0 ? (
        <div className="py-12 px-6 rounded-2xl bg-[var(--cd-surface)] border border-white/10 text-center">
          <p className="text-sm font-semibold text-white">{t.search.noResults}</p>
          <p className="text-xs text-[#A1A1AA] mt-1">{t.search.tryAnother}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 pr-10 sm:pr-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5">
            {activeState.items.map((drama, idx) => (
              <DramaCard
                key={`${activeEndpoint.key}-${drama.provider}-${drama.bookId}`}
                drama={drama}
                rank={activeEndpoint.ranked ? idx + 1 : undefined}
                badgeStyle={activeEndpoint.badgeStyle ?? 'none'}
                isSaved={myListIds.includes(`${drama.provider}:${drama.bookId}`)}
                fluid
                onSelect={onSelectDrama}
                onQuickPlay={onQuickPlay}
                onToggleMyList={onToggleMyList}
              />
            ))}
          </div>

          {activeState.hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                disabled={activeState.loadingMore}
                onClick={() =>
                  void loadEndpointPage(activeEndpoint, activeState.page + 1, true)
                }
                className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-full bg-[var(--cd-surface)] border border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)] text-xs sm:text-sm font-semibold cd-accent-text transition-colors disabled:opacity-50"
              >
                {activeState.loadingMore && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>
                  {activeState.loadingMore
                    ? t.sections.loading
                    : t.sections.loadMore}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default ProviderEndpointSection;
