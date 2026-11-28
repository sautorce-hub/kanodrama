import React, { useEffect, useState } from 'react';
import {
  getOfficialProviderLogoUrl,
  getProxiedLogoUrl,
  getSyncedPlatformLogosSnapshot,
  loadSyncedPlatformLogos,
  normalizeMediaProviderName,
} from '../constants/providerLogos';
import type { MediaProviderName } from '../types/drama';

interface ProviderBadgeProps {
  provider: MediaProviderName | string;
  size?: 'xs' | 'sm';
  className?: string;
}

interface BadgeTheme {
  label: string;
  mono: string;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
}

const PROVIDER_BADGE_THEMES: Record<MediaProviderName, BadgeTheme> = {
  LK21: {
    label: 'LK21',
    mono: 'MV',
    bg: '#B91C1C',
    text: '#FEF08A',
    border: 'border-red-400/55',
    badgeBg: 'bg-[#09090B]/90',
    badgeText: 'text-[#FEF08A]',
  },
  LookSeries: {
    label: 'LookSeries',
    mono: 'LS',
    bg: '#0284C7',
    text: '#FFFFFF',
    border: 'border-sky-400/55',
    badgeBg: 'bg-[#09090B]/90',
    badgeText: 'text-sky-200',
  },
  DramaBoxV2: {
    label: 'DramaBox V2',
    mono: 'DB2',
    bg: '#09090B',
    text: '#EF4444',
    border: 'border-white/20',
    badgeBg: 'bg-white/95',
    badgeText: 'text-[#09090B]',
  },
  NetShort: {
    label: 'NetShort',
    mono: 'NS',
    bg: '#EF4444',
    text: '#FFFFFF',
    border: 'border-[#EF4444]/45',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  AnyReel: {
    label: 'AnyReel',
    mono: 'AR',
    bg: '#10B981',
    text: '#09090B',
    border: 'border-emerald-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MeloLoV2: {
    label: 'MeloLo V2',
    mono: 'ML2',
    bg: '#F59E0B',
    text: '#09090B',
    border: 'border-amber-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaOra: {
    label: 'DramaOra',
    mono: 'DO',
    bg: '#EC4899',
    text: '#FFFFFF',
    border: 'border-pink-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MeloShort: {
    label: 'MeloShort',
    mono: 'MS',
    bg: '#8B5CF6',
    text: '#FFFFFF',
    border: 'border-violet-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  PetaDrama: {
    label: 'PetaDrama',
    mono: 'PD',
    bg: '#06B6D4',
    text: '#09090B',
    border: 'border-cyan-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  RadReels: {
    label: 'RadReels',
    mono: 'RR',
    bg: '#F97316',
    text: '#09090B',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaVerse: {
    label: 'DramaVerse',
    mono: 'DV',
    bg: '#6366F1',
    text: '#FFFFFF',
    border: 'border-indigo-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  KalosTV: {
    label: 'KalosTV',
    mono: 'KT',
    bg: '#14B8A6',
    text: '#09090B',
    border: 'border-teal-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StardustTV: {
    label: 'StardustTV',
    mono: 'SD',
    bg: '#EAB308',
    text: '#09090B',
    border: 'border-yellow-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StarShort: {
    label: 'StarShort',
    mono: 'SS',
    bg: '#3B82F6',
    text: '#FFFFFF',
    border: 'border-blue-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaBite: {
    label: 'DramaBite',
    mono: 'DB',
    bg: '#FB7185',
    text: '#09090B',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  LoveShots: {
    label: 'LoveShots',
    mono: 'LS',
    bg: '#F43F5E',
    text: '#FFFFFF',
    border: 'border-rose-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MyDrama: {
    label: 'MyDrama',
    mono: 'MD',
    bg: '#A855F7',
    text: '#FFFFFF',
    border: 'border-purple-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ShotShort: {
    label: 'ShotShort',
    mono: 'SH',
    bg: '#84CC16',
    text: '#09090B',
    border: 'border-lime-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MoboReels: {
    label: 'MoboReels',
    mono: 'MR',
    bg: '#0EA5E9',
    text: '#FFFFFF',
    border: 'border-sky-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  BlinkDrama: {
    label: 'BlinkDrama',
    mono: 'BD',
    bg: '#D946EF',
    text: '#FFFFFF',
    border: 'border-fuchsia-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  WeTV: {
    label: 'WeTV',
    mono: 'WT',
    bg: '#F97316',
    text: '#FFFFFF',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  CubeTV: {
    label: 'CubeTV',
    mono: 'CT',
    bg: '#22D3EE',
    text: '#09090B',
    border: 'border-cyan-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MicroDrama: {
    label: 'MicroDrama',
    mono: 'MD',
    bg: '#38BDF8',
    text: '#09090B',
    border: 'border-sky-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FlareFlow: {
    label: 'FlareFlow',
    mono: 'FF',
    bg: '#FB923C',
    text: '#09090B',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FunDrama: {
    label: 'FunDrama',
    mono: 'FD',
    bg: '#FACC15',
    text: '#09090B',
    border: 'border-yellow-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FreeShort: {
    label: 'FreeShort',
    mono: 'FS',
    bg: '#4ADE80',
    text: '#09090B',
    border: 'border-green-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ToonShort: {
    label: 'ToonShort',
    mono: 'TS',
    bg: '#C084FC',
    text: '#09090B',
    border: 'border-purple-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  HappyShort: {
    label: 'HappyShort',
    mono: 'HS',
    bg: '#FDE047',
    text: '#09090B',
    border: 'border-yellow-300/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaDash: {
    label: 'DramaDash',
    mono: 'DD',
    bg: '#F87171',
    text: '#09090B',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StoryReelV2: {
    label: 'StoryReel V2',
    mono: 'S2',
    bg: '#6366F1',
    text: '#FFFFFF',
    border: 'border-indigo-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  VibeShortV2: {
    label: 'VibeShort V2',
    mono: 'V2',
    bg: '#C026D3',
    text: '#FFFFFF',
    border: 'border-fuchsia-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FlickReels: {
    label: 'FlickReels',
    mono: 'FR',
    bg: '#F43F5E',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaWave: {
    label: 'DramaWave',
    mono: 'DW',
    bg: '#2DD4BF',
    text: '#09090B',
    border: 'border-teal-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FreeReels: {
    label: 'FreeReels',
    mono: 'FE',
    bg: '#34D399',
    text: '#09090B',
    border: 'border-emerald-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  PineDrama: {
    label: 'PineDrama',
    mono: 'PN',
    bg: '#16A34A',
    text: '#FFFFFF',
    border: 'border-green-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ShortMaxV2: {
    label: 'ShortMax V2',
    mono: 'M2',
    bg: '#DC2626',
    text: '#FFFFFF',
    border: 'border-red-600/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  FlexTV: {
    label: 'FlexTV',
    mono: 'FX',
    bg: '#2563EB',
    text: '#FFFFFF',
    border: 'border-blue-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Vigloo: {
    label: 'Vigloo',
    mono: 'VG',
    bg: '#7C3AED',
    text: '#FFFFFF',
    border: 'border-violet-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DotDrama: {
    label: 'DotDrama',
    mono: 'DT',
    bg: '#EC4899',
    text: '#FFFFFF',
    border: 'border-pink-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  iDramaV2: {
    label: 'iDrama V2',
    mono: 'I2',
    bg: '#0369A1',
    text: '#FFFFFF',
    border: 'border-sky-600/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  GoodShort: {
    label: 'GoodShort',
    mono: 'GS',
    bg: '#D97706',
    text: '#FFFFFF',
    border: 'border-amber-500/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ReelShortV2: {
    label: 'ReelShort V2',
    mono: 'R2',
    bg: '#BE123C',
    text: '#FFFFFF',
    border: 'border-rose-600/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  JoyReels: {
    label: 'JoyReels',
    mono: 'JR',
    bg: '#F43F5E',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  SodaReels: {
    label: 'SodaReels',
    mono: 'SR',
    bg: '#06B6D4',
    text: '#09090B',
    border: 'border-cyan-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  BonusTV: {
    label: 'BonusTV',
    mono: 'BT',
    bg: '#F59E0B',
    text: '#09090B',
    border: 'border-amber-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  iQIYI: {
    label: 'iQIYI',
    mono: 'IQ',
    bg: '#00BE06',
    text: '#09090B',
    border: 'border-green-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  AudioToon: {
    label: 'AudioToon',
    mono: 'AT',
    bg: '#22C55E',
    text: '#09090B',
    border: 'border-green-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Playlet: {
    label: 'Playlet',
    mono: 'PL',
    bg: '#EC4899',
    text: '#FFFFFF',
    border: 'border-pink-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MomeShort: {
    label: 'MomeShort',
    mono: 'MO',
    bg: '#E11D48',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StoReel: {
    label: 'StoReel',
    mono: 'SR',
    bg: '#10B981',
    text: '#09090B',
    border: 'border-emerald-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MyMuse: {
    label: 'MyMuse',
    mono: 'MM',
    bg: '#F43F5E',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  HuangDou: {
    label: 'HuangDou',
    mono: 'HD',
    bg: '#DC2626',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MoreShort: {
    label: 'MoreShort',
    mono: 'MR',
    bg: '#F97316',
    text: '#09090B',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaRush: {
    label: 'DramaRush',
    mono: 'DR',
    bg: '#FB7185',
    text: '#09090B',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Shortswave: {
    label: 'Shortswave',
    mono: 'SW',
    bg: '#A855F7',
    text: '#FFFFFF',
    border: 'border-purple-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Relala: {
    label: 'Relala',
    mono: 'RL',
    bg: '#14B8A6',
    text: '#09090B',
    border: 'border-teal-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  SixthShort: {
    label: 'SixthShort',
    mono: '6S',
    bg: '#EA580C',
    text: '#FFFFFF',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  SnackShort: {
    label: 'SnackShort',
    mono: 'SN',
    bg: '#8B5CF6',
    text: '#FFFFFF',
    border: 'border-violet-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Soreel: {
    label: 'Soreel',
    mono: 'SO',
    bg: '#22C55E',
    text: '#09090B',
    border: 'border-green-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StarReel: {
    label: 'StarReel',
    mono: 'SR',
    bg: '#E11D48',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  StoryGo: {
    label: 'StoryGo',
    mono: 'SG',
    bg: '#EC4899',
    text: '#FFFFFF',
    border: 'border-pink-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  MiniShort: {
    label: 'MiniShort',
    mono: 'MN',
    bg: '#F43F5E',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Shorten: {
    label: 'Shorten',
    mono: 'ST',
    bg: '#F97316',
    text: '#09090B',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Velolo: {
    label: 'Velolo',
    mono: 'VL',
    bg: '#84CC16',
    text: '#09090B',
    border: 'border-lime-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ReelPine: {
    label: 'ReelPine',
    mono: 'RP',
    bg: '#EA580C',
    text: '#FFFFFF',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DynastyShorts: {
    label: 'Dynasty Shorts',
    mono: 'DS',
    bg: '#EAB308',
    text: '#09090B',
    border: 'border-yellow-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaShorts: {
    label: 'DramaShorts',
    mono: 'DR',
    bg: '#7C3AED',
    text: '#FFFFFF',
    border: 'border-violet-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  TallFlix: {
    label: 'TallFlix',
    mono: 'TF',
    bg: '#EF4444',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Qlax: {
    label: 'Qlax',
    mono: 'QL',
    bg: '#DC2626',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Shortical: {
    label: 'Shortical',
    mono: 'SC',
    bg: '#D946EF',
    text: '#FFFFFF',
    border: 'border-fuchsia-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  LuziCine: {
    label: 'LuziCine',
    mono: 'LC',
    bg: '#6366F1',
    text: '#FFFFFF',
    border: 'border-indigo-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ZebraShort: {
    label: 'ZebraShort',
    mono: 'ZB',
    bg: '#E11D48',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DrakorID: {
    label: 'DrakorID',
    mono: 'DK',
    bg: '#1D4ED8',
    text: '#FFFFFF',
    border: 'border-blue-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DrachinReborn: {
    label: 'DrachinReborn',
    mono: 'DC',
    bg: '#16A34A',
    text: '#FFFFFF',
    border: 'border-green-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DramaQueen: {
    label: 'DramaQueen',
    mono: 'DQ',
    bg: '#BE123C',
    text: '#FFFFFF',
    border: 'border-rose-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Ansflix: {
    label: 'Ansflix',
    mono: 'AF',
    bg: '#DC2626',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  LupaCine: {
    label: 'LupaCine',
    mono: 'LP',
    bg: '#B91C1C',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  ReelLife: {
    label: 'ReelLife',
    mono: 'RL',
    bg: '#EF4444',
    text: '#FFFFFF',
    border: 'border-red-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Bstation: {
    label: 'Bstation',
    mono: 'BS',
    bg: '#00A1D6',
    text: '#FFFFFF',
    border: 'border-sky-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Anichin: {
    label: 'Anichin',
    mono: 'AC',
    bg: '#EA580C',
    text: '#FFFFFF',
    border: 'border-orange-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  DonghuaQueen: {
    label: 'DonghuaQueen',
    mono: 'DH',
    bg: '#38BDF8',
    text: '#09090B',
    border: 'border-sky-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  Samehadaku: {
    label: 'Samehadaku',
    mono: 'SH',
    bg: '#2563EB',
    text: '#FFFFFF',
    border: 'border-blue-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  AnimeX: {
    label: 'AnimeX',
    mono: 'AX',
    bg: '#FACC15',
    text: '#09090B',
    border: 'border-yellow-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
  WinkNovel: {
    label: 'WinkNovel',
    mono: 'WN',
    bg: '#0EA5E9',
    text: '#FFFFFF',
    border: 'border-sky-400/50',
    badgeBg: 'bg-[#09090B]/85',
    badgeText: 'text-white',
  },
};

const loadedLogoUrls = new Set<string>();
const failedLogoUrls = new Set<string>();

function resolveBadgeProvider(rawProvider: string): {
  providerKey: MediaProviderName | null;
  theme: BadgeTheme;
} {
  const raw = String(rawProvider || '').trim();
  if (raw && raw in PROVIDER_BADGE_THEMES) {
    const key = raw as MediaProviderName;
    return { providerKey: key, theme: PROVIDER_BADGE_THEMES[key] };
  }

  const normalized = normalizeMediaProviderName(raw);
  const rawCompact = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normCompact = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const isKnown =
    !raw ||
    rawCompact === normCompact ||
    rawCompact.startsWith('dramabox') ||
    rawCompact.startsWith('anireel') ||
    rawCompact.startsWith('anyreel') ||
    rawCompact.startsWith('melolo') ||
    rawCompact.startsWith('reelshort') ||
    rawCompact.startsWith('shortmax') ||
    rawCompact.startsWith('storyreel') ||
    rawCompact.startsWith('vibeshort') ||
    rawCompact.startsWith('idrama') ||
    rawCompact.startsWith('stardust') ||
    rawCompact.startsWith('stareel') ||
    rawCompact.startsWith('starreel') ||
    rawCompact.startsWith('dynasty') ||
    rawCompact === 'lk21' ||
    rawCompact === 'lookseries' ||
    rawCompact === 'movie' ||
    rawCompact === 'movies';

  if (isKnown && normalized in PROVIDER_BADGE_THEMES) {
    return { providerKey: normalized, theme: PROVIDER_BADGE_THEMES[normalized] };
  }

  const cleanLabel = raw || 'Drama';
  const letters = cleanLabel
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return {
    providerKey: null,
    theme: {
      label: cleanLabel,
      mono: letters || 'KD',
      bg: '#EF4444',
      text: '#FFFFFF',
      border: 'border-white/20',
      badgeBg: 'bg-[#09090B]/90',
      badgeText: 'text-white',
    },
  };
}

const ProviderSvgFallback: React.FC<{
  providerKey: MediaProviderName | null;
  theme: BadgeTheme;
  iconPx: number;
}> = ({ providerKey, theme, iconPx }) => {
  if (providerKey === 'DramaBoxV2') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#09090B" />
        <path d="M8.5 7.2L17.2 12L8.5 16.8V7.2Z" fill="#EF4444" />
      </svg>
    );
  }

  if (providerKey === 'NetShort') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#DC2626" />
        <path
          d="M6.5 17V7L11.5 17V7"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M14.5 9L19 12L14.5 15V9Z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (providerKey === 'AnyReel') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#10B981" />
        <path
          d="M7 16.5L11.8 6.5L16.6 16.5"
          stroke="#09090B"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.2 13.5H14.4" stroke="#09090B" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (providerKey === 'MeloLoV2') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#F59E0B" />
        <circle cx="12" cy="12" r="7.2" stroke="#09090B" strokeWidth="2.1" />
        <path
          d="M9 13.5C9.8 14.9 11 15.5 12 15.5C13 15.5 14.2 14.9 15 13.5"
          stroke="#09090B"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="9.6" cy="10.2" r="1.1" fill="#09090B" />
        <circle cx="14.4" cy="10.2" r="1.1" fill="#09090B" />
      </svg>
    );
  }

  if (providerKey === 'WeTV') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#FF6A00" />
        <path
          d="M7.8 6.2C6.8 5.7 5.6 6.4 5.6 7.5V16.5C5.6 17.6 6.8 18.3 7.8 17.8L17.4 13.3C18.5 12.8 18.5 11.2 17.4 10.7L7.8 6.2Z"
          fill="#FFFFFF"
        />
        <circle cx="9.6" cy="12" r="1.9" fill="#FF6A00" />
      </svg>
    );
  }

  if (providerKey === 'iQIYI') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#00BE06" />
        <rect x="4.5" y="6.5" width="2.6" height="11" rx="1.3" fill="#FFFFFF" />
        <circle cx="14.5" cy="12" r="4.8" stroke="#FFFFFF" strokeWidth="2.3" />
        <path d="M13.2 9.8L17 12L13.2 14.2V9.8Z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (providerKey === 'ReelShortV2') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#BE123C" />
        <rect x="4.5" y="5.5" width="15" height="13" rx="3.5" stroke="#FFFFFF" strokeWidth="2" />
        <path d="M10.2 9L15.2 12L10.2 15V9Z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (providerKey === 'ShortMaxV2') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#DC2626" />
        <path
          d="M16.2 8.4C15.2 7.2 13.5 6.8 11.7 7.2C9.7 7.6 8.7 9 9.2 10.5C9.8 12 14.7 11.7 15.4 13.6C16.1 15.4 14.5 17 11.9 17C10.1 17 8.5 16.2 7.6 15"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (providerKey === 'GoodShort') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill="#D97706" />
        <circle cx="12" cy="12" r="7.5" fill="#18181B" />
        <path d="M10 8.5L15.8 12L10 15.5V8.5Z" fill="#FBBF24" />
      </svg>
    );
  }

  if (providerKey === 'LK21' || providerKey === 'LookSeries') {
    return (
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full block"
      >
        <rect width="24" height="24" rx="6" fill={theme.bg} />
        <rect
          x="4.5"
          y="6"
          width="15"
          height="12"
          rx="2.5"
          stroke={theme.text}
          strokeWidth="2"
        />
        <path d="M10 9.2L15 12L10 14.8V9.2Z" fill={theme.text} />
      </svg>
    );
  }

  return (
    <svg
      width={iconPx}
      height={iconPx}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="w-full h-full block"
    >
      <rect width="24" height="24" rx="6" fill={theme.bg} />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill={theme.text}
        fontSize="10.2"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {theme.mono}
      </text>
    </svg>
  );
};

export const ProviderBadge: React.FC<ProviderBadgeProps> = ({
  provider,
  size = 'xs',
  className = '',
}) => {
  const padding = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  const iconSizeClass = size === 'sm' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const iconPx = size === 'sm' ? 16 : 14;
  const { providerKey, theme } = resolveBadgeProvider(provider);

  const [syncedLogos, setSyncedLogos] = useState<Record<string, string> | null>(
    () => getSyncedPlatformLogosSnapshot()
  );

  useEffect(() => {
    if (!providerKey || syncedLogos) return;
    let active = true;
    void loadSyncedPlatformLogos().then((map) => {
      if (active && Object.keys(map).length > 0) {
        setSyncedLogos(map);
      }
    });
    return () => {
      active = false;
    };
  }, [providerKey, syncedLogos]);

  const officialUrl = providerKey
    ? (syncedLogos?.[providerKey] || getOfficialProviderLogoUrl(providerKey))
    : '';
  const proxiedUrl = officialUrl ? getProxiedLogoUrl(officialUrl) : '';

  const getInitialStage = (): 0 | 1 | 2 => {
    if (!officialUrl) return 2;
    if (!failedLogoUrls.has(officialUrl)) return 0;
    if (proxiedUrl && !failedLogoUrls.has(proxiedUrl)) return 1;
    return 2;
  };

  const [sourceStage, setSourceStage] = useState<0 | 1 | 2>(getInitialStage);
  const currentSrc =
    sourceStage === 0 ? officialUrl : sourceStage === 1 ? proxiedUrl : '';
  const [imgLoaded, setImgLoaded] = useState<boolean>(() =>
    Boolean(currentSrc && loadedLogoUrls.has(currentSrc))
  );

  useEffect(() => {
    const nextStage = getInitialStage();
    setSourceStage(nextStage);
    const nextSrc =
      nextStage === 0 ? officialUrl : nextStage === 1 ? proxiedUrl : '';
    setImgLoaded(Boolean(nextSrc && loadedLogoUrls.has(nextSrc)));
  }, [officialUrl, proxiedUrl]);

  const handleImageFail = () => {
    if (currentSrc) {
      failedLogoUrls.add(currentSrc);
    }
    setImgLoaded(false);
    setSourceStage((prev) => {
      if (prev === 0 && proxiedUrl && !failedLogoUrls.has(proxiedUrl)) {
        return 1;
      }
      return 2;
    });
  };

  const containerStyleClass =
    providerKey === 'DramaBoxV2'
      ? `bg-white/95 backdrop-blur-md border border-white/25 text-[#09090B]`
      : `${theme.badgeBg} backdrop-blur-md border ${theme.border} ${theme.badgeText}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full min-w-0 rounded-md ${containerStyleClass} font-bold tracking-wide shadow-sm whitespace-nowrap ${padding} ${className}`}
    >
      <span
        className={`relative ${iconSizeClass} shrink-0 rounded-[4px] overflow-hidden flex items-center justify-center`}
      >
        <ProviderSvgFallback
          providerKey={providerKey}
          theme={theme}
          iconPx={iconPx}
        />
        {sourceStage < 2 && currentSrc && (
          <img
            src={currentSrc}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth === 0 && img.naturalHeight === 0) {
                handleImageFail();
                return;
              }
              loadedLogoUrls.add(currentSrc);
              setImgLoaded(true);
            }}
            onError={handleImageFail}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-150 ${
              providerKey === 'DramaBoxV2' ? 'bg-white' : 'bg-[#09090B]'
            } ${imgLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          />
        )}
      </span>
      <span className="truncate">{theme.label}</span>
    </span>
  );
};

