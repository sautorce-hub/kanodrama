import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, Layers } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import {
  getOfficialProviderLogoUrl,
  getProxiedLogoUrl,
} from '../constants/providerLogos';
import type { ProviderId, ProviderName } from '../types/drama';

interface ProviderHubModalProps {
  open: boolean;
  selectedProvider: ProviderId;
  counts: { all: number } & Partial<Record<ProviderName, number>>;
  onSelectProvider: (provider: ProviderId) => void;
  onOpenProvidersDirectory?: () => void;
  onClose: () => void;
}

interface ProviderBrandSpec {
  domain: string;
  secondaryDomain?: string;
  accentHex: string;
  bgHex: string;
  surfaceTint?: 'light' | 'dark';
  mono: string;
  textHex?: string;
}

interface ProviderCardSpec {
  id: ProviderId;
  name: string;
  tagline: string;
  available: boolean;
  count: number;
  logo: React.ReactNode;
}

const PROVIDER_BRAND_META: Record<Exclude<ProviderId, 'All'>, ProviderBrandSpec> = {
  DramaBox: {
    domain: 'dramaboxdb.com',
    secondaryDomain: 'dramaboxapp.com',
    accentHex: '#EF4444',
    bgHex: '#121216',
    surfaceTint: 'light',
    mono: 'DB',
  },
  NetShort: {
    domain: 'netshort.com',
    accentHex: '#E50914',
    bgHex: '#140B0D',
    surfaceTint: 'light',
    mono: 'NS',
  },
  AnyReel: {
    domain: 'anyreel.tv',
    accentHex: '#10B981',
    bgHex: '#071B14',
    surfaceTint: 'dark',
    mono: 'AR',
    textHex: '#ECFDF5',
  },
  Melolo: {
    domain: 'melolo.com',
    accentHex: '#F59E0B',
    bgHex: '#1E1505',
    surfaceTint: 'light',
    mono: 'ML',
    textHex: '#09090B',
  },
  WeTV: {
    domain: 'wetv.vip',
    accentHex: '#FF6A00',
    bgHex: '#FF6A00',
    surfaceTint: 'light',
    mono: 'WT',
  },
  ReelShort: {
    domain: 'reelshort.com',
    accentHex: '#E11D48',
    bgHex: '#1F0810',
    surfaceTint: 'light',
    mono: 'RS',
  },
  ReelShortV2: {
    domain: 'reelshort.com',
    accentHex: '#BE123C',
    bgHex: '#1A070D',
    surfaceTint: 'light',
    mono: 'R2',
  },
  ShortMax: {
    domain: 'shortmax.app',
    secondaryDomain: 'shorttv.live',
    accentHex: '#EF4444',
    bgHex: '#190A0A',
    surfaceTint: 'light',
    mono: 'SM',
  },
  ShortMaxV2: {
    domain: 'shortmax.app',
    secondaryDomain: 'shorttv.live',
    accentHex: '#DC2626',
    bgHex: '#160909',
    surfaceTint: 'light',
    mono: 'S2',
  },
  GoodShort: {
    domain: 'goodshort.com',
    accentHex: '#F59E0B',
    bgHex: '#1A1306',
    surfaceTint: 'light',
    mono: 'GS',
    textHex: '#09090B',
  },
  FreeReels: {
    domain: 'freereels.io',
    secondaryDomain: 'freereels.app',
    accentHex: '#10B981',
    bgHex: '#071913',
    surfaceTint: 'light',
    mono: 'FR',
    textHex: '#09090B',
  },
  DramaWave: {
    domain: 'mydramawave.com',
    secondaryDomain: 'dramawave.com',
    accentHex: '#14B8A6',
    bgHex: '#061918',
    surfaceTint: 'light',
    mono: 'DW',
    textHex: '#09090B',
  },
  FlickReels: {
    domain: 'flickreels.net',
    secondaryDomain: 'flickreels.com',
    accentHex: '#F43F5E',
    bgHex: '#1C0910',
    surfaceTint: 'light',
    mono: 'FL',
  },
  Vigloo: {
    domain: 'vigloo.com',
    accentHex: '#7C3AED',
    bgHex: '#130B24',
    surfaceTint: 'dark',
    mono: 'VG',
  },
  FlexTV: {
    domain: 'flextv.cc',
    accentHex: '#2563EB',
    bgHex: '#091229',
    surfaceTint: 'light',
    mono: 'FX',
  },
  DramaDash: {
    domain: 'dramadash.app',
    accentHex: '#F87171',
    bgHex: '#1B0C0C',
    surfaceTint: 'dark',
    mono: 'DD',
    textHex: '#09090B',
  },
  FlareFlow: {
    domain: 'flareflow.tv',
    accentHex: '#FB923C',
    bgHex: '#1E1107',
    surfaceTint: 'dark',
    mono: 'FF',
    textHex: '#09090B',
  },
  StoryReel: {
    domain: 'storyreel.tv',
    accentHex: '#6366F1',
    bgHex: '#0E1024',
    surfaceTint: 'dark',
    mono: 'SR',
  },
  StoryReelV2: {
    domain: 'storyreel.tv',
    accentHex: '#4F46E5',
    bgHex: '#0C0D20',
    surfaceTint: 'dark',
    mono: 'S2',
  },
  VibeShort: {
    domain: 'vibeshort.com',
    accentHex: '#D946EF',
    bgHex: '#1D0921',
    surfaceTint: 'dark',
    mono: 'VS',
  },
  VibeShortV2: {
    domain: 'vibeshort.com',
    accentHex: '#C026D3',
    bgHex: '#18071B',
    surfaceTint: 'dark',
    mono: 'V2',
  },
  CubeTV: {
    domain: 'cubetv.sg',
    accentHex: '#06B6D4',
    bgHex: '#07191E',
    surfaceTint: 'dark',
    mono: 'CT',
    textHex: '#09090B',
  },
  MicroDrama: {
    domain: 'microdrama.tv',
    accentHex: '#38BDF8',
    bgHex: '#071722',
    surfaceTint: 'dark',
    mono: 'MD',
    textHex: '#09090B',
  },
  FunDrama: {
    domain: 'fundrama.tv',
    accentHex: '#FACC15',
    bgHex: '#1C1906',
    surfaceTint: 'dark',
    mono: 'FD',
    textHex: '#09090B',
  },
  FreeShort: {
    domain: 'freeshort.tv',
    accentHex: '#22C55E',
    bgHex: '#071B0E',
    surfaceTint: 'dark',
    mono: 'FS',
    textHex: '#09090B',
  },
  ToonShort: {
    domain: 'toonshort.com',
    accentHex: '#A855F7',
    bgHex: '#160A24',
    surfaceTint: 'dark',
    mono: 'TS',
  },
  HappyShort: {
    domain: 'happyshort.tv',
    accentHex: '#EAB308',
    bgHex: '#1A1606',
    surfaceTint: 'dark',
    mono: 'HS',
    textHex: '#09090B',
  },
  PineDrama: {
    domain: 'pinedrama.com',
    accentHex: '#16A34A',
    bgHex: '#07190E',
    surfaceTint: 'dark',
    mono: 'PN',
  },
  DotDrama: {
    domain: 'dotdrama.tv',
    accentHex: '#EC4899',
    bgHex: '#1D0914',
    surfaceTint: 'dark',
    mono: 'DT',
  },
  iDrama: {
    domain: 'idrama.tv',
    accentHex: '#0284C7',
    bgHex: '#061522',
    surfaceTint: 'dark',
    mono: 'ID',
  },
  iDramaV2: {
    domain: 'idrama.tv',
    accentHex: '#0369A1',
    bgHex: '#05121D',
    surfaceTint: 'dark',
    mono: 'I2',
  },
  DramaOra: {
    domain: 'dramaora.com',
    accentHex: '#EC4899',
    bgHex: '#1C0915',
    surfaceTint: 'dark',
    mono: 'DO',
  },
  MeloShort: {
    domain: 'meloshort.com',
    accentHex: '#8B5CF6',
    bgHex: '#130D24',
    surfaceTint: 'dark',
    mono: 'MS',
  },
  PetaDrama: {
    domain: 'petadrama.com',
    accentHex: '#06B6D4',
    bgHex: '#06181D',
    surfaceTint: 'dark',
    mono: 'PD',
    textHex: '#09090B',
  },
  RadReels: {
    domain: 'radreels.com',
    accentHex: '#F97316',
    bgHex: '#1F1006',
    surfaceTint: 'dark',
    mono: 'RR',
    textHex: '#09090B',
  },
  DramaVerse: {
    domain: 'dramaverse.tv',
    accentHex: '#6366F1',
    bgHex: '#0C0F24',
    surfaceTint: 'dark',
    mono: 'DV',
  },
  KalosTV: {
    domain: 'kalostv.com',
    accentHex: '#14B8A6',
    bgHex: '#061A18',
    surfaceTint: 'light',
    mono: 'KT',
    textHex: '#09090B',
  },
  StardustTV: {
    domain: 'stardusttv.net',
    accentHex: '#EAB308',
    bgHex: '#1B1606',
    surfaceTint: 'light',
    mono: 'SD',
    textHex: '#09090B',
  },
  StarShort: {
    domain: 'starshort.tv',
    accentHex: '#3B82F6',
    bgHex: '#081326',
    surfaceTint: 'light',
    mono: 'SS',
  },
  DramaBite: {
    domain: 'dramabite.tv',
    accentHex: '#FB7185',
    bgHex: '#1D0A10',
    surfaceTint: 'dark',
    mono: 'DB',
    textHex: '#09090B',
  },
  LoveShots: {
    domain: 'loveshots.app',
    accentHex: '#F43F5E',
    bgHex: '#1F080E',
    surfaceTint: 'light',
    mono: 'LS',
  },
  MyDrama: {
    domain: 'mydrama.app',
    accentHex: '#A855F7',
    bgHex: '#160B24',
    surfaceTint: 'light',
    mono: 'MY',
  },
  ShotShort: {
    domain: 'shotshort.com',
    accentHex: '#84CC16',
    bgHex: '#121B07',
    surfaceTint: 'dark',
    mono: 'SH',
    textHex: '#09090B',
  },
  MoboReels: {
    domain: 'moboreels.com',
    accentHex: '#0EA5E9',
    bgHex: '#071723',
    surfaceTint: 'light',
    mono: 'MR',
  },
  BlinkDrama: {
    domain: 'blinkdrama.com',
    accentHex: '#D946EF',
    bgHex: '#1B0920',
    surfaceTint: 'dark',
    mono: 'BD',
  },
  JoyReels: {
    domain: 'joyreels.com',
    accentHex: '#F43F5E',
    bgHex: '#1F0810',
    surfaceTint: 'light',
    mono: 'JR',
  },
  SodaReels: {
    domain: 'sodareels.com',
    accentHex: '#06B6D4',
    bgHex: '#071A1F',
    surfaceTint: 'light',
    mono: 'SO',
    textHex: '#09090B',
  },
  BonusTV: {
    domain: 'bonustv.app',
    accentHex: '#F59E0B',
    bgHex: '#1C1406',
    surfaceTint: 'dark',
    mono: 'BT',
    textHex: '#09090B',
  },
  iQIYI: {
    domain: 'iq.com',
    secondaryDomain: 'iqiyi.com',
    accentHex: '#00BE06',
    bgHex: '#041A06',
    surfaceTint: 'light',
    mono: 'IQ',
    textHex: '#FFFFFF',
  },
};

function BrandFallbackEmblem({
  providerId,
  spec,
}: {
  providerId: Exclude<ProviderId, 'All'>;
  spec: ProviderBrandSpec;
}) {
  // Bespoke official-style brand marks for flagship platforms
  if (providerId === 'WeTV') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF8C00] to-[#FF5500] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.5 5.4C6.4 4.8 5 5.6 5 6.9V17.1C5 18.4 6.4 19.2 7.5 18.6L18.2 13.5C19.5 12.9 19.5 11.1 18.2 10.5L7.5 5.4Z"
            fill="#FFFFFF"
          />
          <circle cx="9.5" cy="12" r="2.1" fill="#FF6A00" />
        </svg>
      </div>
    );
  }

  if (providerId === 'iQIYI') {
    return (
      <div className="w-11 h-11 rounded-xl bg-[#00BE06] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="2.8" height="12" rx="1.4" fill="#FFFFFF" />
          <circle cx="14.5" cy="12" r="5" stroke="#FFFFFF" strokeWidth="2.5" />
          <path d="M13 9.7L17.2 12L13 14.3V9.7Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  if (providerId === 'DramaBox') {
    return (
      <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-lg border border-white/25 shrink-0">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#111115" />
          <path d="M8.5 7.2L17.2 12L8.5 16.8V7.2Z" fill="#EF4444" />
          <path d="M8.5 7.2L13.2 10L8.5 12.5V7.2Z" fill="#FCA5A5" opacity="0.55" />
        </svg>
      </div>
    );
  }

  if (providerId === 'ReelShort' || providerId === 'ReelShortV2') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F43F5E] to-[#BE123C] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="4" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M10.2 9L15.4 12L10.2 15V9Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  if (providerId === 'NetShort') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#EF4444] to-[#B91C1C] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6.5 17V7L11.5 17V7" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14.5 9L19 12L14.5 15V9Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  if (providerId === 'ShortMax' || providerId === 'ShortMaxV2') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#DC2626] to-[#7F1D1D] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M16.5 8.5C15.5 7.2 13.7 6.8 11.8 7.2C9.7 7.6 8.6 9.1 9.2 10.6C9.8 12.1 14.8 11.8 15.6 13.8C16.3 15.6 14.6 17.2 12 17.2C10.1 17.2 8.4 16.4 7.5 15.2" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (providerId === 'GoodShort') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FBBF24] to-[#D97706] flex items-center justify-center shadow-lg border border-white/25 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="#18181B" />
          <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FBBF24" />
        </svg>
      </div>
    );
  }

  if (providerId === 'Melolo') {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#EA580C] flex items-center justify-center shadow-lg border border-white/20 shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" stroke="#FFFFFF" strokeWidth="2.2" />
          <path d="M9 13.5C9.8 15 11 15.6 12 15.6C13 15.6 14.2 15 15 13.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="9.6" cy="10.2" r="1.1" fill="#FFFFFF" />
          <circle cx="14.4" cy="10.2" r="1.1" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg border border-white/20 shrink-0 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${spec.accentHex}, ${spec.bgHex})`,
      }}
    >
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <rect
          x="1.5"
          y="1.5"
          width="23"
          height="23"
          rx="6"
          fill={spec.bgHex}
          fillOpacity="0.65"
          stroke="#FFFFFF"
          strokeOpacity="0.22"
        />
        <text
          x="13"
          y="16.5"
          textAnchor="middle"
          fill={spec.textHex ?? '#FFFFFF'}
          fontSize="10"
          fontWeight="800"
          letterSpacing="-0.4"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {spec.mono}
        </text>
      </svg>
    </div>
  );
}

let syncedPlatformLogosCache: Record<string, string> | null = null;

export async function loadSyncedPlatformLogos(): Promise<Record<string, string>> {
  if (syncedPlatformLogosCache) return syncedPlatformLogosCache;
  try {
    const res = await fetch('/api/platforms', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      platforms?: Array<{ id?: string; logo?: string; icon?: string }>;
    };
    const map: Record<string, string> = {};
    if (Array.isArray(json.platforms)) {
      for (const entry of json.platforms) {
        const id = entry.id?.trim();
        const url = (entry.logo || entry.icon || '').trim();
        if (id && url) map[id] = url;
      }
    }
    syncedPlatformLogosCache = map;
    return map;
  } catch {
    return {};
  }
}

export const PROVIDER_DIRECTORY_ITEMS: Array<{
  id: ProviderName;
  name: string;
  tagline: string;
}> = [
  { id: 'DramaBox', name: 'DramaBox', tagline: 'Billionaire Romance, Revenge & VIP Exclusives' },
  { id: 'NetShort', name: 'NetShort', tagline: 'Trending Vertical Shorts & Donghua Hits' },
  { id: 'AnyReel', name: 'AnyReel', tagline: 'Asian Short Dramas, Werewolf & Contract Romance' },
  { id: 'Melolo', name: 'Melolo', tagline: 'System Awakening, Anime Shorts & Encrypted HD Streams' },
  { id: 'WeTV', name: 'WeTV', tagline: 'Premium Asian Series & Youth Campus Dramas' },
  { id: 'ReelShort', name: 'ReelShort', tagline: 'Global Billionaire, Werewolf & Romance Hits' },
  { id: 'ReelShortV2', name: 'ReelShort V2', tagline: 'Extended ReelShort Multi-Region Catalog' },
  { id: 'ShortMax', name: 'ShortMax', tagline: 'Dual AES/Plain HD Vertical Blockbusters' },
  { id: 'ShortMaxV2', name: 'ShortMax V2', tagline: 'ShortMax V2 Mirror & International Feed' },
  { id: 'GoodShort', name: 'GoodShort', tagline: 'Trending, Terbaru, Anime & Indonesian Dubbing' },
  { id: 'FreeReels', name: 'FreeReels', tagline: 'Cursor-Paginated Popular, Anime & Dubbed Reels' },
  { id: 'DramaWave', name: 'DramaWave', tagline: 'Exclusive & VIP Dubbed Fantasy Dramas' },
  { id: 'FlickReels', name: 'FlickReels', tagline: 'All-Drama Catalog & Rebirth Family Shorts' },
  { id: 'Vigloo', name: 'Vigloo', tagline: 'K-Short Originals, Ranking & Filterable Browse' },
  { id: 'FlexTV', name: 'FlexTV', tagline: 'Urban Secret Identity & Melodrama Mini-Series' },
  { id: 'DramaDash', name: 'DramaDash', tagline: 'Fast-Paced Trending Romance & Thriller Shorts' },
  { id: 'FlareFlow', name: 'FlareFlow', tagline: '1080p Dubbed & Original Vertical Dramas' },
  { id: 'StoryReel', name: 'StoryReel', tagline: 'Encrypted & Plain 1080p HLS Mini-Dramas' },
  { id: 'StoryReelV2', name: 'StoryReel V2', tagline: 'StoryReel V2 Multilingual Global Catalog' },
  { id: 'VibeShort', name: 'VibeShort', tagline: 'Dubbed Mafia, CEO & Plain-Stream Verticals' },
  { id: 'VibeShortV2', name: 'VibeShort V2', tagline: 'VibeShort V2 Fresh Drops & Multi-Audio Feed' },
  { id: 'CubeTV', name: 'CubeTV', tagline: 'Hot Wuxia, Martial Arts & New Release Shorts' },
  { id: 'MicroDrama', name: 'MicroDrama', tagline: 'Bite-Sized Micro Episodes & Revenge Arcs' },
  { id: 'FunDrama', name: 'FunDrama', tagline: 'Lighthearted Rom-Com & Trending Short Stories' },
  { id: 'FreeShort', name: 'FreeShort', tagline: 'Hot, Ranking & Dubbed Vertical Drama Library' },
  { id: 'ToonShort', name: 'ToonShort', tagline: 'Popular Motion-Comic & Contract Love Shorts' },
  { id: 'HappyShort', name: 'HappyShort', tagline: 'Trending, Popular, Terbaru & Daily Rankings' },
  { id: 'PineDrama', name: 'PineDrama', tagline: 'Vertical Legal, Suspense & Romance Mini-Series' },
  { id: 'DotDrama', name: 'DotDrama', tagline: 'Fantasy Mystery & Supernatural Short Series' },
  { id: 'iDrama', name: 'iDrama', tagline: 'H.264 High-Compatibility CEO & Romance Catalog' },
  { id: 'iDramaV2', name: 'iDrama V2', tagline: 'iDrama V2 Extended Cursor Catalog' },
  { id: 'DramaOra', name: 'DramaOra', tagline: 'Curated Category Hits, Romance & Revenge Shorts' },
  { id: 'MeloShort', name: 'MeloShort', tagline: 'Top Rankings, Fresh Picks & Multi-Genre Reels' },
  { id: 'PetaDrama', name: 'PetaDrama', tagline: 'Full Catalog Vertical Series & Category Specials' },
  { id: 'RadReels', name: 'RadReels', tagline: 'Latest Releases & High-Speed Trending Reels' },
  { id: 'DramaVerse', name: 'DramaVerse', tagline: 'Hot Releases, Modern CEO & Mystery Shorts' },
  { id: 'KalosTV', name: 'KalosTV', tagline: 'Curated Vertical Mini-Series & Global Subs' },
  { id: 'StardustTV', name: 'StardustTV', tagline: 'Hot Charts, Terbaru Drops & Exclusive Mini-Dramas' },
  { id: 'StarShort', name: 'StarShort', tagline: 'Trending VIP Shorts, Billionaire & Urban Romance' },
  { id: 'DramaBite', name: 'DramaBite', tagline: 'Bite-Sized Cliffhangers & Fast-Paced Thrillers' },
  { id: 'LoveShots', name: 'LoveShots', tagline: 'Top Rankings, Sweet Romance & Melodrama Hits' },
  { id: 'MyDrama', name: 'MyDrama', tagline: 'Daily Picks & Bite-Sized Asian Mini-Series' },
  { id: 'ShotShort', name: 'ShotShort', tagline: 'Newest Drops & Sorted All-Drama Catalog' },
  { id: 'MoboReels', name: 'MoboReels', tagline: 'Original Hits, Asia, Animasi & Dedicated VTT Subtitles' },
  { id: 'BlinkDrama', name: 'BlinkDrama', tagline: 'Dual AES/Plain HD Streams & Fresh Drama Drops' },
  { id: 'JoyReels', name: 'JoyReels', tagline: 'Weekly Top Charts, Hot Reels, Films & Asian Series' },
  { id: 'SodaReels', name: 'SodaReels', tagline: 'Multi-Quality Modern Romance & Urban Short Dramas' },
  { id: 'BonusTV', name: 'BonusTV', tagline: 'CEO Romance, Family Revenge & Vertical Mini-Dramas' },
  { id: 'iQIYI', name: 'iQIYI', tagline: 'Premium C-Drama, K-Drama, Anime, Film & VIP Picks' },
];

export const ProviderBrandLogo: React.FC<{
  providerId: Exclude<ProviderId, 'All'>;
  name: string;
  overrideLogoUrl?: string;
}> = ({ providerId, name, overrideLogoUrl }) => {
  const spec = PROVIDER_BRAND_META[providerId];
  const officialUrl = overrideLogoUrl || getOfficialProviderLogoUrl(providerId);
  const proxiedUrl = getProxiedLogoUrl(officialUrl);

  const [sourceStage, setSourceStage] = useState<0 | 1 | 2>(
    officialUrl ? 0 : 2
  );
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    setSourceStage(officialUrl ? 0 : 2);
    setImgReady(false);
  }, [officialUrl]);

  const currentSrc =
    sourceStage === 0 ? officialUrl : sourceStage === 1 ? proxiedUrl : '';

  if (sourceStage >= 2 || !currentSrc) {
    return <BrandFallbackEmblem providerId={providerId} spec={spec} />;
  }

  return (
    <div className="relative w-11 h-11 shrink-0">
      {!imgReady && (
        <div
          aria-hidden="true"
          className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 animate-pulse"
        />
      )}
      <div
        className={`w-11 h-11 rounded-xl bg-[#0D0D11] border border-white/15 p-1 flex items-center justify-center shadow-md overflow-hidden transition-opacity duration-150 ${
          imgReady
            ? 'opacity-100 relative'
            : 'opacity-0 absolute inset-0 pointer-events-none'
        }`}
      >
        <img
          src={currentSrc}
          alt={`${name} official logo`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain rounded-lg"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth === 0 && img.naturalHeight === 0) {
              setImgReady(false);
              setSourceStage((prev) => (prev === 0 && proxiedUrl ? 1 : 2));
              return;
            }
            setImgReady(true);
          }}
          onError={() => {
            setImgReady(false);
            setSourceStage((prev) => (prev === 0 && proxiedUrl ? 1 : 2));
          }}
        />
      </div>
    </div>
  );
};

export const ProviderHubModal: React.FC<ProviderHubModalProps> = ({
  open,
  selectedProvider,
  counts,
  onSelectProvider,
  onOpenProvidersDirectory,
  onClose,
}) => {
  const { t } = useDramaContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [liveLogos, setLiveLogos] = useState<Record<string, string>>(
    () => syncedPlatformLogosCache ?? {}
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 60);
    let active = true;
    void loadSyncedPlatformLogos().then((map) => {
      if (active && Object.keys(map).length > 0) {
        setLiveLogos(map);
      }
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const providers: ProviderCardSpec[] = useMemo(
    () => [
      {
        id: 'All',
        name: t.providers.all,
        tagline: 'Unified 49-platform KanoDrama live catalog',
        available: true,
        count: counts.all,
        logo: (
          <div className="w-11 h-11 rounded-xl cd-accent-bg flex items-center justify-center text-white shadow-lg shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        ),
      },
      {
        id: 'DramaBox',
        name: 'DramaBox',
        tagline: 'Billionaire Romance, Revenge & VIP Exclusives',
        available: true,
        count: counts.DramaBox ?? 0,
        logo: <ProviderBrandLogo providerId="DramaBox" name="DramaBox" overrideLogoUrl={liveLogos.DramaBox} />,
      },
      {
        id: 'NetShort',
        name: 'NetShort',
        tagline: 'Trending Vertical Shorts & Donghua Hits',
        available: true,
        count: counts.NetShort ?? 0,
        logo: <ProviderBrandLogo providerId="NetShort" name="NetShort" overrideLogoUrl={liveLogos.NetShort} />,
      },
      {
        id: 'AnyReel',
        name: 'AnyReel',
        tagline: 'Asian Short Dramas, Werewolf & Contract Romance',
        available: true,
        count: counts.AnyReel ?? 0,
        logo: <ProviderBrandLogo providerId="AnyReel" name="AnyReel" overrideLogoUrl={liveLogos.AnyReel} />,
      },
      {
        id: 'Melolo',
        name: 'Melolo',
        tagline: 'System Awakening, Anime Shorts & Encrypted HD Streams',
        available: true,
        count: counts.Melolo ?? 0,
        logo: <ProviderBrandLogo providerId="Melolo" name="Melolo" overrideLogoUrl={liveLogos.Melolo} />,
      },
      {
        id: 'WeTV',
        name: 'WeTV',
        tagline: 'Premium Asian Series & Youth Campus Dramas',
        available: true,
        count: counts.WeTV ?? 0,
        logo: <ProviderBrandLogo providerId="WeTV" name="WeTV" overrideLogoUrl={liveLogos.WeTV} />,
      },
      {
        id: 'ReelShort',
        name: 'ReelShort',
        tagline: 'Global Billionaire, Werewolf & Romance Hits',
        available: true,
        count: counts.ReelShort ?? 0,
        logo: <ProviderBrandLogo providerId="ReelShort" name="ReelShort" overrideLogoUrl={liveLogos.ReelShort} />,
      },
      {
        id: 'ReelShortV2',
        name: 'ReelShort V2',
        tagline: 'Extended ReelShort Multi-Region Catalog',
        available: true,
        count: counts.ReelShortV2 ?? 0,
        logo: <ProviderBrandLogo providerId="ReelShortV2" name="ReelShort V2" overrideLogoUrl={liveLogos.ReelShortV2} />,
      },
      {
        id: 'ShortMax',
        name: 'ShortMax',
        tagline: 'Dual AES/Plain HD Vertical Blockbusters',
        available: true,
        count: counts.ShortMax ?? 0,
        logo: <ProviderBrandLogo providerId="ShortMax" name="ShortMax" overrideLogoUrl={liveLogos.ShortMax} />,
      },
      {
        id: 'ShortMaxV2',
        name: 'ShortMax V2',
        tagline: 'ShortMax V2 Mirror & International Feed',
        available: true,
        count: counts.ShortMaxV2 ?? 0,
        logo: <ProviderBrandLogo providerId="ShortMaxV2" name="ShortMax V2" overrideLogoUrl={liveLogos.ShortMaxV2} />,
      },
      {
        id: 'GoodShort',
        name: 'GoodShort',
        tagline: 'Trending, Terbaru, Anime & Indonesian Dubbing',
        available: true,
        count: counts.GoodShort ?? 0,
        logo: <ProviderBrandLogo providerId="GoodShort" name="GoodShort" overrideLogoUrl={liveLogos.GoodShort} />,
      },
      {
        id: 'FreeReels',
        name: 'FreeReels',
        tagline: 'Cursor-Paginated Popular, Anime & Dubbed Reels',
        available: true,
        count: counts.FreeReels ?? 0,
        logo: <ProviderBrandLogo providerId="FreeReels" name="FreeReels" overrideLogoUrl={liveLogos.FreeReels} />,
      },
      {
        id: 'DramaWave',
        name: 'DramaWave',
        tagline: 'Exclusive & VIP Dubbed Fantasy Dramas',
        available: true,
        count: counts.DramaWave ?? 0,
        logo: <ProviderBrandLogo providerId="DramaWave" name="DramaWave" overrideLogoUrl={liveLogos.DramaWave} />,
      },
      {
        id: 'FlickReels',
        name: 'FlickReels',
        tagline: 'All-Drama Catalog & Rebirth Family Shorts',
        available: true,
        count: counts.FlickReels ?? 0,
        logo: <ProviderBrandLogo providerId="FlickReels" name="FlickReels" overrideLogoUrl={liveLogos.FlickReels} />,
      },
      {
        id: 'Vigloo',
        name: 'Vigloo',
        tagline: 'K-Short Originals, Ranking & Filterable Browse',
        available: true,
        count: counts.Vigloo ?? 0,
        logo: <ProviderBrandLogo providerId="Vigloo" name="Vigloo" overrideLogoUrl={liveLogos.Vigloo} />,
      },
      {
        id: 'FlexTV',
        name: 'FlexTV',
        tagline: 'Urban Secret Identity & Melodrama Mini-Series',
        available: true,
        count: counts.FlexTV ?? 0,
        logo: <ProviderBrandLogo providerId="FlexTV" name="FlexTV" overrideLogoUrl={liveLogos.FlexTV} />,
      },
      {
        id: 'DramaDash',
        name: 'DramaDash',
        tagline: 'Fast-Paced Trending Romance & Thriller Shorts',
        available: true,
        count: counts.DramaDash ?? 0,
        logo: <ProviderBrandLogo providerId="DramaDash" name="DramaDash" overrideLogoUrl={liveLogos.DramaDash} />,
      },
      {
        id: 'FlareFlow',
        name: 'FlareFlow',
        tagline: '1080p Dubbed & Original Vertical Dramas',
        available: true,
        count: counts.FlareFlow ?? 0,
        logo: <ProviderBrandLogo providerId="FlareFlow" name="FlareFlow" overrideLogoUrl={liveLogos.FlareFlow} />,
      },
      {
        id: 'StoryReel',
        name: 'StoryReel',
        tagline: 'Encrypted & Plain 1080p HLS Mini-Dramas',
        available: true,
        count: counts.StoryReel ?? 0,
        logo: <ProviderBrandLogo providerId="StoryReel" name="StoryReel" overrideLogoUrl={liveLogos.StoryReel} />,
      },
      {
        id: 'StoryReelV2',
        name: 'StoryReel V2',
        tagline: 'StoryReel V2 Multilingual Global Catalog',
        available: true,
        count: counts.StoryReelV2 ?? 0,
        logo: <ProviderBrandLogo providerId="StoryReelV2" name="StoryReel V2" overrideLogoUrl={liveLogos.StoryReelV2} />,
      },
      {
        id: 'VibeShort',
        name: 'VibeShort',
        tagline: 'Dubbed Mafia, CEO & Plain-Stream Verticals',
        available: true,
        count: counts.VibeShort ?? 0,
        logo: <ProviderBrandLogo providerId="VibeShort" name="VibeShort" overrideLogoUrl={liveLogos.VibeShort} />,
      },
      {
        id: 'VibeShortV2',
        name: 'VibeShort V2',
        tagline: 'VibeShort V2 Fresh Drops & Multi-Audio Feed',
        available: true,
        count: counts.VibeShortV2 ?? 0,
        logo: <ProviderBrandLogo providerId="VibeShortV2" name="VibeShort V2" overrideLogoUrl={liveLogos.VibeShortV2} />,
      },
      {
        id: 'CubeTV',
        name: 'CubeTV',
        tagline: 'Hot Wuxia, Martial Arts & New Release Shorts',
        available: true,
        count: counts.CubeTV ?? 0,
        logo: <ProviderBrandLogo providerId="CubeTV" name="CubeTV" overrideLogoUrl={liveLogos.CubeTV} />,
      },
      {
        id: 'MicroDrama',
        name: 'MicroDrama',
        tagline: 'Bite-Sized Micro Episodes & Revenge Arcs',
        available: true,
        count: counts.MicroDrama ?? 0,
        logo: <ProviderBrandLogo providerId="MicroDrama" name="MicroDrama" overrideLogoUrl={liveLogos.MicroDrama} />,
      },
      {
        id: 'FunDrama',
        name: 'FunDrama',
        tagline: 'Lighthearted Rom-Com & Trending Short Stories',
        available: true,
        count: counts.FunDrama ?? 0,
        logo: <ProviderBrandLogo providerId="FunDrama" name="FunDrama" overrideLogoUrl={liveLogos.FunDrama} />,
      },
      {
        id: 'FreeShort',
        name: 'FreeShort',
        tagline: 'Hot, Ranking & Dubbed Vertical Drama Library',
        available: true,
        count: counts.FreeShort ?? 0,
        logo: <ProviderBrandLogo providerId="FreeShort" name="FreeShort" overrideLogoUrl={liveLogos.FreeShort} />,
      },
      {
        id: 'ToonShort',
        name: 'ToonShort',
        tagline: 'Popular Motion-Comic & Contract Love Shorts',
        available: true,
        count: counts.ToonShort ?? 0,
        logo: <ProviderBrandLogo providerId="ToonShort" name="ToonShort" overrideLogoUrl={liveLogos.ToonShort} />,
      },
      {
        id: 'HappyShort',
        name: 'HappyShort',
        tagline: 'Trending, Popular, Terbaru & Daily Rankings',
        available: true,
        count: counts.HappyShort ?? 0,
        logo: <ProviderBrandLogo providerId="HappyShort" name="HappyShort" overrideLogoUrl={liveLogos.HappyShort} />,
      },
      {
        id: 'PineDrama',
        name: 'PineDrama',
        tagline: 'Vertical Legal, Suspense & Romance Mini-Series',
        available: true,
        count: counts.PineDrama ?? 0,
        logo: <ProviderBrandLogo providerId="PineDrama" name="PineDrama" overrideLogoUrl={liveLogos.PineDrama} />,
      },
      {
        id: 'DotDrama',
        name: 'DotDrama',
        tagline: 'Fantasy Mystery & Supernatural Short Series',
        available: true,
        count: counts.DotDrama ?? 0,
        logo: <ProviderBrandLogo providerId="DotDrama" name="DotDrama" overrideLogoUrl={liveLogos.DotDrama} />,
      },
      {
        id: 'iDrama',
        name: 'iDrama',
        tagline: 'H.264 High-Compatibility CEO & Romance Catalog',
        available: true,
        count: counts.iDrama ?? 0,
        logo: <ProviderBrandLogo providerId="iDrama" name="iDrama" overrideLogoUrl={liveLogos.iDrama} />,
      },
      {
        id: 'iDramaV2',
        name: 'iDrama V2',
        tagline: 'iDrama V2 Extended Cursor Catalog',
        available: true,
        count: counts.iDramaV2 ?? 0,
        logo: <ProviderBrandLogo providerId="iDramaV2" name="iDrama V2" overrideLogoUrl={liveLogos.iDramaV2} />,
      },
      {
        id: 'DramaOra',
        name: 'DramaOra',
        tagline: 'Curated Category Hits, Romance & Revenge Shorts',
        available: true,
        count: counts.DramaOra ?? 0,
        logo: <ProviderBrandLogo providerId="DramaOra" name="DramaOra" overrideLogoUrl={liveLogos.DramaOra} />,
      },
      {
        id: 'MeloShort',
        name: 'MeloShort',
        tagline: 'Top Rankings, Fresh Picks & Multi-Genre Reels',
        available: true,
        count: counts.MeloShort ?? 0,
        logo: <ProviderBrandLogo providerId="MeloShort" name="MeloShort" overrideLogoUrl={liveLogos.MeloShort} />,
      },
      {
        id: 'PetaDrama',
        name: 'PetaDrama',
        tagline: 'Full Catalog Vertical Series & Category Specials',
        available: true,
        count: counts.PetaDrama ?? 0,
        logo: <ProviderBrandLogo providerId="PetaDrama" name="PetaDrama" overrideLogoUrl={liveLogos.PetaDrama} />,
      },
      {
        id: 'RadReels',
        name: 'RadReels',
        tagline: 'Latest Releases & High-Speed Trending Reels',
        available: true,
        count: counts.RadReels ?? 0,
        logo: <ProviderBrandLogo providerId="RadReels" name="RadReels" overrideLogoUrl={liveLogos.RadReels} />,
      },
      {
        id: 'DramaVerse',
        name: 'DramaVerse',
        tagline: 'Hot Releases, Modern CEO & Mystery Shorts',
        available: true,
        count: counts.DramaVerse ?? 0,
        logo: <ProviderBrandLogo providerId="DramaVerse" name="DramaVerse" overrideLogoUrl={liveLogos.DramaVerse} />,
      },
      {
        id: 'KalosTV',
        name: 'KalosTV',
        tagline: 'Curated Vertical Mini-Series & Global Subs',
        available: true,
        count: counts.KalosTV ?? 0,
        logo: <ProviderBrandLogo providerId="KalosTV" name="KalosTV" overrideLogoUrl={liveLogos.KalosTV} />,
      },
      {
        id: 'StardustTV',
        name: 'StardustTV',
        tagline: 'Hot Charts, Terbaru Drops & Exclusive Mini-Dramas',
        available: true,
        count: counts.StardustTV ?? 0,
        logo: <ProviderBrandLogo providerId="StardustTV" name="StardustTV" overrideLogoUrl={liveLogos.StardustTV} />,
      },
      {
        id: 'StarShort',
        name: 'StarShort',
        tagline: 'Trending VIP Shorts, Billionaire & Urban Romance',
        available: true,
        count: counts.StarShort ?? 0,
        logo: <ProviderBrandLogo providerId="StarShort" name="StarShort" overrideLogoUrl={liveLogos.StarShort} />,
      },
      {
        id: 'DramaBite',
        name: 'DramaBite',
        tagline: 'Bite-Sized Cliffhangers & Fast-Paced Thrillers',
        available: true,
        count: counts.DramaBite ?? 0,
        logo: <ProviderBrandLogo providerId="DramaBite" name="DramaBite" overrideLogoUrl={liveLogos.DramaBite} />,
      },
      {
        id: 'LoveShots',
        name: 'LoveShots',
        tagline: 'Top Rankings, Sweet Romance & Melodrama Hits',
        available: true,
        count: counts.LoveShots ?? 0,
        logo: <ProviderBrandLogo providerId="LoveShots" name="LoveShots" overrideLogoUrl={liveLogos.LoveShots} />,
      },
      {
        id: 'MyDrama',
        name: 'MyDrama',
        tagline: 'Daily Picks & Bite-Sized Asian Mini-Series',
        available: true,
        count: counts.MyDrama ?? 0,
        logo: <ProviderBrandLogo providerId="MyDrama" name="MyDrama" overrideLogoUrl={liveLogos.MyDrama} />,
      },
      {
        id: 'ShotShort',
        name: 'ShotShort',
        tagline: 'Newest Drops & Sorted All-Drama Catalog',
        available: true,
        count: counts.ShotShort ?? 0,
        logo: <ProviderBrandLogo providerId="ShotShort" name="ShotShort" overrideLogoUrl={liveLogos.ShotShort} />,
      },
      {
        id: 'MoboReels',
        name: 'MoboReels',
        tagline: 'Original Hits, Asia, Animasi & Dedicated VTT Subtitles',
        available: true,
        count: counts.MoboReels ?? 0,
        logo: <ProviderBrandLogo providerId="MoboReels" name="MoboReels" overrideLogoUrl={liveLogos.MoboReels} />,
      },
      {
        id: 'BlinkDrama',
        name: 'BlinkDrama',
        tagline: 'Dual AES/Plain HD Streams & Fresh Drama Drops',
        available: true,
        count: counts.BlinkDrama ?? 0,
        logo: <ProviderBrandLogo providerId="BlinkDrama" name="BlinkDrama" overrideLogoUrl={liveLogos.BlinkDrama} />,
      },
      {
        id: 'JoyReels',
        name: 'JoyReels',
        tagline: 'Weekly Top Charts, Hot Reels, Films & Asian Series',
        available: true,
        count: counts.JoyReels ?? 0,
        logo: <ProviderBrandLogo providerId="JoyReels" name="JoyReels" overrideLogoUrl={liveLogos.JoyReels} />,
      },
      {
        id: 'SodaReels',
        name: 'SodaReels',
        tagline: 'Multi-Quality Modern Romance & Urban Short Dramas',
        available: true,
        count: counts.SodaReels ?? 0,
        logo: <ProviderBrandLogo providerId="SodaReels" name="SodaReels" overrideLogoUrl={liveLogos.SodaReels} />,
      },
      {
        id: 'BonusTV',
        name: 'BonusTV',
        tagline: 'CEO Romance, Family Revenge & Vertical Mini-Dramas',
        available: true,
        count: counts.BonusTV ?? 0,
        logo: <ProviderBrandLogo providerId="BonusTV" name="BonusTV" overrideLogoUrl={liveLogos.BonusTV} />,
      },
      {
        id: 'iQIYI',
        name: 'iQIYI',
        tagline: 'Premium C-Drama, K-Drama, Anime, Film & VIP Picks',
        available: true,
        count: counts.iQIYI ?? 0,
        logo: <ProviderBrandLogo providerId="iQIYI" name="iQIYI" overrideLogoUrl={liveLogos.iQIYI} />,
      },
    ],
    [t, counts, liveLogos]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q)
    );
  }, [providers, searchQuery]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.providers.hubTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[85dvh] rounded-t-3xl sm:rounded-3xl bg-[#111115]/95 backdrop-blur-xl border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-3" />

        <div className="px-5 pt-4 pb-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              {t.providers.hubTitle}
            </h2>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              {t.providers.hubSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/providers"
              onClick={(e) => {
                e.preventDefault();
                onClose();
                if (onOpenProvidersDirectory) {
                  onOpenProvidersDirectory();
                } else {
                  window.dispatchEvent(
                    new CustomEvent('hd:navigate-path', {
                      detail: { path: '/providers' },
                    })
                  );
                }
              }}
              className="px-3 py-1.5 min-h-[36px] rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] font-semibold text-[#E4E4E7] hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5 cd-accent-text" />
              <span>{t.providers.all}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Provider Hub"
              className="min-w-[44px] min-h-[44px] rounded-full bg-white/5 hover:bg-white/15 text-[#A1A1AA] hover:text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Provider Search Bar */}
        <div className="px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#18181D] border border-white/10 focus-within:border-[var(--cd-accent)]">
            <Search className="w-4 h-4 cd-accent-text shrink-0" />
            <input
              ref={inputRef}
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

        {/* Provider Cards List */}
        <div className="overflow-y-auto p-5 space-y-2.5 pb-8 sm:pb-5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#A1A1AA]">
              {t.providers.noMatches}
            </div>
          ) : (
            filtered.map((prov) => {
              const isSelected = selectedProvider === prov.id;
              return (
                <button
                  key={prov.id}
                  type="button"
                  disabled={!prov.available}
                  onClick={() => {
                    if (!prov.available) return;
                    onSelectProvider(prov.id);
                    onClose();
                  }}
                  className={`w-full px-3.5 py-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all min-h-[70px] ${
                    isSelected
                      ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)] shadow-lg'
                      : prov.available
                      ? 'bg-[#18181D] border-white/10 hover:border-white/30'
                      : 'bg-[#141418]/60 border-white/5 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {prov.logo}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate leading-snug">
                          {prov.name}
                        </span>
                        {!prov.available && (
                          <span className="text-[11px] font-medium text-[#71717A] shrink-0">
                            · {t.providers.comingSoon}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#A1A1AA] truncate mt-0.5 leading-snug">
                        {prov.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 pl-2 text-right">
                    {prov.available && (
                      <span className="text-xs font-semibold text-[#E4E4E7] tabular-nums whitespace-nowrap">
                        {prov.count} {t.providers.titlesLoaded}
                      </span>
                    )}
                    {isSelected && (
                      <span className="w-7 h-7 rounded-full cd-accent-bg text-white flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
