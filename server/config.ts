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
  pointsPerUsd: 20_000, // 100.000 poin = $5.00 USD
  minPayoutIdr: 50_000,
  minPayoutUsd: 5.0,
  maxDailyEarnPoints: 5_000,
  claimCooldownSeconds: 45,
  dailyCheckinPoints: 100,
  watchEpisodePoints: 50,
  watchMinutePoints: 5, // +5 poin / menit nonton aktif (maks 60 menit/hari = 300 poin)
  dailyMissionMaxWatchSeconds: 3_600, // Maksimal 1 jam (60 menit) misi nonton harian
  dailyMission15mPoints: 25,
  dailyMission30mPoints: 50,
  dailyMission60mPoints: 100,
  referralQualifySeconds: 3_600, // 1 hour active verified watch
  referralBonusPoints: 1_000,
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

export interface RewardsRuntimeValues {
  usdToIdrRate: number;
  pointsPerUsd: number;
  minPayoutIdr: number;
  minPayoutUsd: number;
  minPayoutPointsIdr: number;
  minPayoutPointsUsd: number;
  maxDailyEarnPoints: number;
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
    1_000_000
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
    50_000
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
    50_000
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
    claimCooldownSeconds,
    dailyCheckinPoints: REWARDS_DEFAULTS.dailyCheckinPoints,
    watchEpisodePoints: REWARDS_DEFAULTS.watchEpisodePoints,
    watchMinutePoints: REWARDS_DEFAULTS.watchMinutePoints,
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
