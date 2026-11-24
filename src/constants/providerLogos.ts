import type { MediaProviderName } from '../types/drama';

export const MOLA_PLATFORM_ORIGIN = 'https://api.molatv.id';

export const PROVIDER_SLUG_MAP: Record<MediaProviderName, string> = {
  DramaBox: 'dramaboxv2',
  NetShort: 'netshort',
  AnyReel: 'anyreel',
  Melolo: 'melolo',
  WeTV: 'wetv',
  ReelShort: 'reelshort',
  ReelShortV2: 'reelshortv2',
  ShortMax: 'shortmax',
  ShortMaxV2: 'shortmaxv2',
  GoodShort: 'goodshort',
  FreeReels: 'freereels',
  DramaWave: 'dramawave',
  FlickReels: 'flickreels',
  Vigloo: 'vigloo',
  FlexTV: 'flextv',
  DramaDash: 'dramadash',
  FlareFlow: 'flareflow',
  StoryReel: 'storyreel',
  StoryReelV2: 'storyreelv2',
  VibeShort: 'vibeshort',
  VibeShortV2: 'vibeshortv2',
  CubeTV: 'cubetv',
  MicroDrama: 'microdrama',
  FunDrama: 'fundrama',
  FreeShort: 'freeshort',
  ToonShort: 'toonshort',
  HappyShort: 'happyshort',
  PineDrama: 'pinedrama',
  DotDrama: 'dotdrama',
  iDrama: 'idrama',
  iDramaV2: 'idramav2',
  DramaOra: 'dramaora',
  MeloShort: 'meloshort',
  PetaDrama: 'petadrama',
  RadReels: 'radreels',
  DramaVerse: 'dramaverse',
  KalosTV: 'kalostv',
  StardustTV: 'stardusttv',
  StarShort: 'starshort',
  DramaBite: 'dramabite',
  LoveShots: 'loveshots',
  MyDrama: 'mydrama',
  ShotShort: 'shotshort',
  MoboReels: 'moboreels',
  BlinkDrama: 'blinkdrama',
  JoyReels: 'joyreels',
  SodaReels: 'sodareels',
  BonusTV: 'bonustv',
  iQIYI: 'iqiyi',
  LK21: 'lk21',
  LookSeries: 'lookseries',
};

export const PROVIDER_LOGO_PATHS: Record<MediaProviderName, string> = {
  DramaBox: '/logos/dramabox.png',
  NetShort: '/logos/netshort.svg',
  AnyReel: '/logos/anyreel.png',
  Melolo: '/logos/melolo.svg',
  WeTV: '/logos/wetv.png',
  ReelShort: '/logos/reelshort.png',
  ReelShortV2: '/logos/reelshort.png',
  ShortMax: '/logos/shortmax.png',
  ShortMaxV2: '/logos/shortmax.png',
  GoodShort: '/logos/goodshort.png',
  FreeReels: '/logos/freereels.png',
  DramaWave: '/logos/dramawave.svg',
  FlickReels: '/logos/flickreels.svg',
  Vigloo: '/logos/vigloo.svg',
  FlexTV: '/logos/flextv.svg',
  DramaDash: '/logos/dramadash.png',
  FlareFlow: '/logos/flareflow.svg',
  StoryReel: '/logos/storyreel.png',
  StoryReelV2: '/logos/storyreel.png',
  VibeShort: '/logos/vibeshort.png',
  VibeShortV2: '/logos/vibeshort.png',
  CubeTV: '/logos/cubetv.png',
  MicroDrama: '/logos/microdrama.png',
  FunDrama: '/logos/fundrama.png',
  FreeShort: '/logos/freeshort.png',
  ToonShort: '/logos/toonshort.png',
  HappyShort: '/logos/happyshort.png',
  PineDrama: '/logos/pinedrama.png',
  DotDrama: '/logos/dotdrama.png',
  iDrama: '/logos/idrama.svg',
  iDramaV2: '/logos/idrama.svg',
  DramaOra: '/logos/dramaora.png',
  MeloShort: '/logos/meloshort.png',
  PetaDrama: '/logos/petadrama.png',
  RadReels: '/logos/radreels.png',
  DramaVerse: '/logos/dramaverse.png',
  KalosTV: '/logos/kalostv.png',
  StardustTV: '/logos/stardusttv.png',
  StarShort: '/logos/starshort.png',
  DramaBite: '/logos/dramabite.png',
  LoveShots: '/logos/loveshots.png',
  MyDrama: '/logos/mydrama.png',
  ShotShort: '/logos/shotshort.png',
  MoboReels: '/logos/moboreels.png',
  BlinkDrama: '/logos/blinkdrama.png',
  JoyReels: '/logos/joyreels.png',
  SodaReels: '/logos/sodareels.png',
  BonusTV: '/logos/bonustv.png',
  iQIYI: '/logos/iqiyi.png',
  LK21: '/logos/lk21-official.png?v=20261028',
  LookSeries: '/logos/lookseries.png',
};

export function getOfficialProviderLogoUrl(provider: MediaProviderName): string {
  const path = PROVIDER_LOGO_PATHS[provider];
  return path ? `${MOLA_PLATFORM_ORIGIN}${path}` : '';
}

export function getProxiedLogoUrl(logoUrl: string): string {
  if (!logoUrl) return '';
  if (logoUrl.startsWith('/api/proxy')) return logoUrl;
  return `/api/proxy?url=${encodeURIComponent(logoUrl)}`;
}

const ALL_MEDIA_PROVIDERS = Object.keys(PROVIDER_SLUG_MAP) as MediaProviderName[];

const ROUTE_PROVIDER_ALIAS_MAP: Record<string, MediaProviderName> = {
  dramabox: 'DramaBox',
  dramaboxv2: 'DramaBox',
  stardust: 'StardustTV',
  stardusttv: 'StardustTV',
  storyreel_v2: 'StoryReelV2',
  storyreelv2: 'StoryReelV2',
  vibeshort_v2: 'VibeShortV2',
  vibeshortv2: 'VibeShortV2',
  shortmax_v2: 'ShortMaxV2',
  shortmaxv2: 'ShortMaxV2',
  idrama_v2: 'iDramaV2',
  idramav2: 'iDramaV2',
  reelshort_v2: 'ReelShortV2',
  reelshortv2: 'ReelShortV2',
  lk21: 'LK21',
  lookseries: 'LookSeries',
  movie: 'LK21',
  movies: 'LK21',
};

for (const prov of ALL_MEDIA_PROVIDERS) {
  const lower = prov.toLowerCase();
  if (!ROUTE_PROVIDER_ALIAS_MAP[lower]) {
    ROUTE_PROVIDER_ALIAS_MAP[lower] = prov;
  }
}

export function getProviderRouteSlug(
  provider?: MediaProviderName | string | null
): string {
  const clean = String(provider || '').trim();
  if (!clean) return 'dramabox';
  const lower = clean.toLowerCase();
  if (lower === 'lk21' || lower === 'lookseries' || lower === 'movie' || lower === 'movies') {
    return 'movie';
  }
  if (lower === 'dramabox' || lower === 'dramaboxv2') {
    return 'dramabox';
  }
  return lower.replace(/[^a-z0-9]+/g, '');
}

export function isKnownProviderRouteSlug(routeSlug?: string | null): boolean {
  const clean = String(routeSlug || '').trim().toLowerCase();
  if (!clean) return false;
  return Boolean(ROUTE_PROVIDER_ALIAS_MAP[clean]);
}

export function parseProviderFromRouteSlug(
  routeSlug?: string | null,
  itemSlug?: string | null
): MediaProviderName | undefined {
  const clean = String(routeSlug || '').trim().toLowerCase();
  if (!clean) return undefined;
  if (clean === 'movie' || clean === 'movies') {
    if (itemSlug && /^ls-/i.test(itemSlug.trim())) {
      return 'LookSeries';
    }
    return 'LK21';
  }
  return ROUTE_PROVIDER_ALIAS_MAP[clean];
}

