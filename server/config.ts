import crypto from 'node:crypto';

/**
 * Centralized backend runtime configuration & business-rule defaults for KanoDrama.
 * Consolidates environment variable resolution with safe fallbacks so small rules
 * (points, anti-cheat, cooldowns, daily/weekly caps, FX rate, payout thresholds)
 * do not require cluttering `.env` with redundant micro-variables.
 */

function parseBoundedIntEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function parseBoundedFloatEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(num * 100) / 100));
}

export const REWARDS_DEFAULTS = {
  usdToIdrRate: 18_200,
  pointsPerUsd: 100_000, // 100.000 poin = 1 USDT ($1.00 USD)
  minPayoutIdr: 50_000,
  minPayoutUsd: 5.0,
  maxDailyEarnPoints: 25_000,
  maxDailyWatchPoints: 3_500, // Batas poin nonton harian (per-menit + milestone)
  claimCooldownSeconds: 45,
  dailyCheckinPoints: 500,
  watchEpisodePoints: 200,
  watchMinutePoints: 20, // WATCH_POINTS_PER_MINUTE default +20 poin / menit nonton aktif
  dailyMissionMaxWatchSeconds: 3_600, // Maksimal 1 jam (60 menit) misi nonton harian
  dailyMission15mPoints: 100,
  dailyMission30mPoints: 200,
  dailyMission60mPoints: 400,
  referralQualifySeconds: 3_600, // 1 hour active verified watch
  referralBonusPoints: 5_000,
  maxDailyReferrals: 5,
  maxWeeklyReferrals: 15,
  maxDailyVerifiedWatchSeconds: 28_800, // 8 hours/day telemetry cap
} as const;

export const ANTI_CHEAT_DEFAULTS = {
  minHeartbeatIntervalSec: 12,
  concurrentSessionWindowSec: 25,
  maxConcurrentStrikes: 3,
  maxFastDeltaStrikes: 4,
  minPlaybackRate: 0.75,
  maxPlaybackRate: 1.15,
  minVideoAdvanceSec: 0.5,
  maxHeartbeatStepSec: 65,
  maxSeekRatio: 1.45,
  watchSessionTtlSec: 4 * 3600,
  minEpisodeWatchSecForBonus: 15,
  newAccountMaxLedgerEntries: 2,
  newAccountMaxWatchSeconds: 600,
} as const;

export const CATALOG_DEFAULTS = {
  syncMaxPages: 100,
} as const;

const RUNTIME_SESSION_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export function resolveServerPort(): number {
  const portFlagIndex = process.argv.indexOf('--port');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const cliPort = Number(process.argv[portFlagIndex + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

export function getDatabaseUrl(): string {
  return (process.env.DATABASE_URL || '').trim();
}

export function isPgSslRequired(connectionString: string): boolean {
  return (
    connectionString.includes('sslmode=require') ||
    connectionString.includes('neon.tech') ||
    process.env.PGSSLMODE === 'require'
  );
}

export function getMolaApiToken(): string {
  return (process.env.MOLA_API_TOKEN || '').trim();
}

export function getConfiguredSiteUrl(): string {
  const candidates = [
    process.env.SITE_URL,
    process.env.APP_URL,
    process.env.VITE_SITE_URL,
  ];
  for (const cand of candidates) {
    const clean = (cand || '').trim().replace(/\/+$/, '');
    if (clean && clean !== 'MY_APP_URL' && /^https?:\/\//i.test(clean)) {
      return clean;
    }
  }
  return '';
}

export function getAllowedGoogleClientIds(): Set<string> {
  const ids = new Set<string>();
  const addId = (val: string | undefined) => {
    if (typeof val !== 'string') return;
    for (const part of val.split(',')) {
      const cleaned = part.trim();
      if (cleaned) ids.add(cleaned);
    }
  };
  addId(process.env.GOOGLE_CLIENT_ID);
  addId(process.env.VITE_GOOGLE_CLIENT_ID);
  return ids;
}

export function getPrimaryGoogleClientId(): string {
  const allowed = getAllowedGoogleClientIds();
  return allowed.values().next().value || '';
}

export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

export function getAdminPayoutSecret(): string {
  return (process.env.ADMIN_PAYOUT_SECRET || '').trim();
}

export function getStreamSigningSecret(): string {
  const explicit = (process.env.STREAM_SIGNING_SECRET || '').trim();
  if (explicit) return explicit;
  const sessionSecret = (process.env.SESSION_SECRET || '').trim();
  if (sessionSecret) return sessionSecret;
  return crypto
    .createHash('sha256')
    .update(`${getMolaApiToken() || 'kanodrama-dev'}|stream-guard-v1`)
    .digest('hex');
}

export function getAuthSessionSecret(): string {
  return (
    process.env.STREAM_SIGNING_SECRET ||
    process.env.SESSION_SECRET ||
    RUNTIME_SESSION_FALLBACK_SECRET
  ).trim();
}

export function getGoogleIndexingServiceAccount(): {
  clientEmail: string;
  privateKey: string;
} | null {
  const rawJson = (process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      const jsonStr = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email.trim(),
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch (err) {
      console.warn(
        '[GoogleIndexing] Invalid GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const email = (process.env.GOOGLE_INDEXING_CLIENT_EMAIL || '').trim();
  const key = (process.env.GOOGLE_INDEXING_PRIVATE_KEY || '').trim();
  if (email && key) {
    return {
      clientEmail: email,
      privateKey: key.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

export interface DailyMissionMilestoneConfig {
  minutes: number;
  bonusPoints: number;
}

export type AccountLevelTierId = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AccountLevelTierConfig {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  minTotalEarned: number;
  minVerifiedWatchSeconds: number;
  multiplier: number;
  bonusPercent: number;
}

export interface AccountLevelTierSummary extends AccountLevelTierConfig {
  watchMinutePoints: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
}

export interface AccountLevelNextTierInfo {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  multiplier: number;
  bonusPercent: number;
  minTotalEarned: number;
  minVerifiedWatchSeconds: number;
  remainingPoints: number;
  remainingWatchSeconds: number;
}

export interface AccountLevelStatus {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  multiplier: number;
  bonusPercent: number;
  watchMinutePoints: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  totalEarned: number;
  verifiedWatchSeconds: number;
  nextTier: AccountLevelNextTierInfo | null;
  progressPct: number;
}

export const ACCOUNT_LEVEL_TIERS: readonly AccountLevelTierConfig[] = [
  {
    level: 1,
    tierId: 'bronze',
    tierName: 'Bronze',
    minTotalEarned: 0,
    minVerifiedWatchSeconds: 0,
    multiplier: 1.0,
    bonusPercent: 0,
  },
  {
    level: 2,
    tierId: 'silver',
    tierName: 'Silver',
    minTotalEarned: 20_000,
    minVerifiedWatchSeconds: 7_200, // 2 hours verified active watch
    multiplier: 1.2,
    bonusPercent: 20,
  },
  {
    level: 3,
    tierId: 'gold',
    tierName: 'Gold',
    minTotalEarned: 100_000,
    minVerifiedWatchSeconds: 36_000, // 10 hours verified active watch
    multiplier: 1.4,
    bonusPercent: 40,
  },
  {
    level: 4,
    tierId: 'platinum',
    tierName: 'Platinum',
    minTotalEarned: 300_000,
    minVerifiedWatchSeconds: 108_000, // 30 hours verified active watch
    multiplier: 1.6,
    bonusPercent: 60,
  },
] as const;

export interface RewardsRuntimeValues {
  usdToIdrRate: number;
  pointsPerUsd: number;
  minPayoutIdr: number;
  minPayoutUsd: number;
  minPayoutPointsIdr: number;
  minPayoutPointsUsd: number;
  maxDailyEarnPoints: number;
  maxDailyWatchPoints: number;
  claimCooldownSeconds: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  watchMinutePoints: number;
  dailyMissionMaxWatchSeconds: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  referralQualifySeconds: number;
  referralBonusPoints: number;
  maxDailyReferrals: number;
  maxWeeklyReferrals: number;
  maxDailyVerifiedWatchSeconds: number;
}

export function getRewardsRuntimeValues(): RewardsRuntimeValues {
  const usdToIdrRate = parseBoundedIntEnv(
    process.env.USD_TO_IDR_RATE,
    REWARDS_DEFAULTS.usdToIdrRate,
    1_000,
    100_000
  );
  const pointsPerUsd = parseBoundedIntEnv(
    process.env.POINTS_PER_USD,
    REWARDS_DEFAULTS.pointsPerUsd,
    100,
    10_000_000
  );
  const minPayoutIdr = parseBoundedIntEnv(
    process.env.MIN_PAYOUT_IDR,
    REWARDS_DEFAULTS.minPayoutIdr,
    REWARDS_DEFAULTS.minPayoutIdr,
    50_000_000
  );
  const minPayoutUsd = parseBoundedFloatEnv(
    process.env.MIN_PAYOUT_USD,
    REWARDS_DEFAULTS.minPayoutUsd,
    REWARDS_DEFAULTS.minPayoutUsd,
    10_000
  );

  const minPayoutPointsIdr = Math.ceil((minPayoutIdr / usdToIdrRate) * pointsPerUsd);
  const minPayoutPointsUsd = Math.ceil(minPayoutUsd * pointsPerUsd);

  const maxDailyEarnPoints = parseBoundedIntEnv(
    process.env.MAX_DAILY_EARN_POINTS,
    REWARDS_DEFAULTS.maxDailyEarnPoints,
    50,
    500_000
  );
  const maxDailyWatchPoints = parseBoundedIntEnv(
    process.env.MAX_DAILY_WATCH_POINTS,
    REWARDS_DEFAULTS.maxDailyWatchPoints,
    20,
    200_000
  );
  const watchMinutePoints = parseBoundedIntEnv(
    process.env.WATCH_POINTS_PER_MINUTE,
    REWARDS_DEFAULTS.watchMinutePoints,
    1,
    5_000
  );
  const claimCooldownSeconds = parseBoundedIntEnv(
    process.env.CLAIM_COOLDOWN_SECONDS,
    REWARDS_DEFAULTS.claimCooldownSeconds,
    5,
    3_600
  );
  const referralQualifySeconds = parseBoundedIntEnv(
    process.env.REFERRAL_QUALIFY_SECONDS,
    REWARDS_DEFAULTS.referralQualifySeconds,
    REWARDS_DEFAULTS.referralQualifySeconds,
    86_400
  );
  const referralBonusPoints = parseBoundedIntEnv(
    process.env.REFERRAL_BONUS_POINTS,
    REWARDS_DEFAULTS.referralBonusPoints,
    50,
    500_000
  );
  const maxDailyReferrals = parseBoundedIntEnv(
    process.env.MAX_DAILY_REFERRALS,
    REWARDS_DEFAULTS.maxDailyReferrals,
    1,
    50
  );
  const maxWeeklyReferrals = parseBoundedIntEnv(
    process.env.MAX_WEEKLY_REFERRALS,
    REWARDS_DEFAULTS.maxWeeklyReferrals,
    1,
    200
  );
  const maxDailyVerifiedWatchSeconds = parseBoundedIntEnv(
    process.env.MAX_DAILY_VERIFIED_WATCH_SECONDS,
    REWARDS_DEFAULTS.maxDailyVerifiedWatchSeconds,
    3_600,
    43_200
  );

  return {
    usdToIdrRate,
    pointsPerUsd,
    minPayoutIdr,
    minPayoutUsd,
    minPayoutPointsIdr,
    minPayoutPointsUsd,
    maxDailyEarnPoints,
    maxDailyWatchPoints,
    claimCooldownSeconds,
    dailyCheckinPoints: REWARDS_DEFAULTS.dailyCheckinPoints,
    watchEpisodePoints: REWARDS_DEFAULTS.watchEpisodePoints,
    watchMinutePoints,
    dailyMissionMaxWatchSeconds: REWARDS_DEFAULTS.dailyMissionMaxWatchSeconds,
    dailyMissionMilestones: [
      { minutes: 15, bonusPoints: REWARDS_DEFAULTS.dailyMission15mPoints },
      { minutes: 30, bonusPoints: REWARDS_DEFAULTS.dailyMission30mPoints },
      { minutes: 60, bonusPoints: REWARDS_DEFAULTS.dailyMission60mPoints },
    ],
    referralQualifySeconds,
    referralBonusPoints,
    maxDailyReferrals,
    maxWeeklyReferrals,
    maxDailyVerifiedWatchSeconds,
  };
}

function scaleLevelPoints(basePoints: number, multiplier: number): number {
  return Math.max(1, Math.round(basePoints * multiplier));
}

export function getAccountLevelTiersSummary(
  baseCfg: Pick<
    RewardsRuntimeValues,
    | 'watchMinutePoints'
    | 'dailyCheckinPoints'
    | 'watchEpisodePoints'
    | 'dailyMissionMilestones'
  >
): AccountLevelTierSummary[] {
  return ACCOUNT_LEVEL_TIERS.map((tier) => ({
    ...tier,
    watchMinutePoints: scaleLevelPoints(baseCfg.watchMinutePoints, tier.multiplier),
    dailyCheckinPoints: scaleLevelPoints(baseCfg.dailyCheckinPoints, tier.multiplier),
    watchEpisodePoints: scaleLevelPoints(baseCfg.watchEpisodePoints, tier.multiplier),
    dailyMissionMilestones: baseCfg.dailyMissionMilestones.map((ms) => ({
      minutes: ms.minutes,
      bonusPoints: scaleLevelPoints(ms.bonusPoints, tier.multiplier),
    })),
  }));
}

export function resolveAccountLevelStatus(
  totalEarnedRaw: number,
  verifiedWatchSecondsRaw: number,
  baseCfg: Pick<
    RewardsRuntimeValues,
    | 'watchMinutePoints'
    | 'dailyCheckinPoints'
    | 'watchEpisodePoints'
    | 'dailyMissionMilestones'
  >
): AccountLevelStatus {
  const totalEarned = Math.max(0, Math.floor(Number(totalEarnedRaw) || 0));
  const verifiedWatchSeconds = Math.max(0, Math.floor(Number(verifiedWatchSecondsRaw) || 0));

  let activeIdx = 0;
  for (let i = 0; i < ACCOUNT_LEVEL_TIERS.length; i += 1) {
    const tier = ACCOUNT_LEVEL_TIERS[i];
    if (
      totalEarned >= tier.minTotalEarned ||
      verifiedWatchSeconds >= tier.minVerifiedWatchSeconds
    ) {
      activeIdx = i;
    }
  }

  const activeTier = ACCOUNT_LEVEL_TIERS[activeIdx];
  const nextTierCfg =
    activeIdx + 1 < ACCOUNT_LEVEL_TIERS.length
      ? ACCOUNT_LEVEL_TIERS[activeIdx + 1]
      : null;

  let progressPct = 100;
  let nextTier: AccountLevelNextTierInfo | null = null;
  if (nextTierCfg) {
    const ptsSpan = Math.max(1, nextTierCfg.minTotalEarned - activeTier.minTotalEarned);
    const ptsDone = Math.max(0, totalEarned - activeTier.minTotalEarned);
    const ptsPct = Math.min(100, Math.round((ptsDone / ptsSpan) * 100));

    const secSpan = Math.max(
      1,
      nextTierCfg.minVerifiedWatchSeconds - activeTier.minVerifiedWatchSeconds
    );
    const secDone = Math.max(0, verifiedWatchSeconds - activeTier.minVerifiedWatchSeconds);
    const secPct = Math.min(100, Math.round((secDone / secSpan) * 100));

    progressPct = Math.max(ptsPct, secPct);
    nextTier = {
      level: nextTierCfg.level,
      tierId: nextTierCfg.tierId,
      tierName: nextTierCfg.tierName,
      multiplier: nextTierCfg.multiplier,
      bonusPercent: nextTierCfg.bonusPercent,
      minTotalEarned: nextTierCfg.minTotalEarned,
      minVerifiedWatchSeconds: nextTierCfg.minVerifiedWatchSeconds,
      remainingPoints: Math.max(0, nextTierCfg.minTotalEarned - totalEarned),
      remainingWatchSeconds: Math.max(
        0,
        nextTierCfg.minVerifiedWatchSeconds - verifiedWatchSeconds
      ),
    };
  }

  return {
    level: activeTier.level,
    tierId: activeTier.tierId,
    tierName: activeTier.tierName,
    multiplier: activeTier.multiplier,
    bonusPercent: activeTier.bonusPercent,
    watchMinutePoints: scaleLevelPoints(baseCfg.watchMinutePoints, activeTier.multiplier),
    dailyCheckinPoints: scaleLevelPoints(baseCfg.dailyCheckinPoints, activeTier.multiplier),
    watchEpisodePoints: scaleLevelPoints(baseCfg.watchEpisodePoints, activeTier.multiplier),
    dailyMissionMilestones: baseCfg.dailyMissionMilestones.map((ms) => ({
      minutes: ms.minutes,
      bonusPoints: scaleLevelPoints(ms.bonusPoints, activeTier.multiplier),
    })),
    totalEarned,
    verifiedWatchSeconds,
    nextTier,
    progressPct,
  };
}

