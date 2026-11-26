import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import {
  ANTI_CHEAT_DEFAULTS,
  type AccountLevelStatus,
  type AccountLevelTierSummary,
  type DailyMissionMilestoneConfig,
  getAccountLevelTiersSummary,
  getDatabaseUrl,
  getRewardsRuntimeValues,
  isPgSslRequired,
  resolveAccountLevelStatus,
} from './config.ts';

let pool: Pool | null = null;
let schemaReadyPromise: Promise<boolean> | null = null;
let dbAvailable = false;

const DEFAULT_FALLBACK_TIMEZONE = 'Asia/Jakarta';
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function normalizeIanaTimeZone(rawTz?: string | null): string | null {
  if (typeof rawTz !== 'string') return null;
  const trimmed = rawTz.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9_+/.-]+$/.test(trimmed)) return null;
  try {
    let fmt = dateFormatterCache.get(trimmed);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: trimmed,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      if (dateFormatterCache.size >= 120) {
        const firstKey = dateFormatterCache.keys().next().value;
        if (firstKey) dateFormatterCache.delete(firstKey);
      }
      dateFormatterCache.set(trimmed, fmt);
    }
    return fmt.resolvedOptions().timeZone || trimmed;
  } catch {
    return null;
  }
}

export function getDateKeyInTimeZone(
  date: Date = new Date(),
  rawTimeZone?: string | null
): string {
  const tz = normalizeIanaTimeZone(rawTimeZone) || DEFAULT_FALLBACK_TIMEZONE;
  let fmt = dateFormatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(tz, fmt);
  }
  const parts = fmt.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  return fmt.format(date);
}

export const CANONICAL_REWARDS_TIMEZONE = DEFAULT_FALLBACK_TIMEZONE;

export interface CanonicalResetPeriod {
  timeZone: string;
  periodKey: string;
  previousPeriodKey: string;
  periodStartAt: Date;
  nextResetAt: Date;
}

/**
 * Returns the single authoritative server reset cycle (00:00 WIB / 17:00 UTC every 24h)
 * regardless of client display timezone (UTC vs WIB).
 */
export function getCanonicalResetPeriod(now: Date = new Date()): CanonicalResetPeriod {
  const periodKey = getDateKeyInTimeZone(now, CANONICAL_REWARDS_TIMEZONE);
  const [y, m, d] = periodKey.split('-').map((n) => Number(n));
  const periodStartMs =
    Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
      ? Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 3600_000
      : now.getTime() - (now.getTime() % 86_400_000);
  const nextResetMs = periodStartMs + 86_400_000;
  const previousPeriodKey = getDateKeyInTimeZone(
    new Date(periodStartMs - 12 * 3600_000),
    CANONICAL_REWARDS_TIMEZONE
  );
  return {
    timeZone: CANONICAL_REWARDS_TIMEZONE,
    periodKey,
    previousPeriodKey,
    periodStartAt: new Date(periodStartMs),
    nextResetAt: new Date(nextResetMs),
  };
}

/**
 * Backward-compatible alias returning YYYY-MM-DD in Asia/Jakarta or provided timezone.
 */
export function getJakartaDateKey(date: Date = new Date()): string {
  return getDateKeyInTimeZone(date, DEFAULT_FALLBACK_TIMEZONE);
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const needsSsl = isPgSslRequired(connectionString);

  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    min: 0,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    query_timeout: 20_000,
    statement_timeout: 20_000,
    allowExitOnIdle: true,
  };
}

function isTransientPoolError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const code = String((err as { code?: unknown }).code || '').toUpperCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ENOTFOUND' ||
    code === '57P01' ||
    code === '08006' ||
    code === '08003' ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('client has encountered a connection error') ||
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('connection timeout') ||
    msg.includes('socket hang up')
  );
}

let testPoolOverride: Pool | null = null;

export class DatabaseUnavailableError extends Error {
  public readonly code: 'DATABASE_NOT_CONFIGURED' | 'DATABASE_UNAVAILABLE';
  public readonly statusCode = 503;
  public readonly requiredConfig = ['DATABASE_URL'];

  constructor(
    code: 'DATABASE_NOT_CONFIGURED' | 'DATABASE_UNAVAILABLE' = 'DATABASE_NOT_CONFIGURED',
    message?: string
  ) {
    super(
      message ||
        (code === 'DATABASE_NOT_CONFIGURED'
          ? 'Database PostgreSQL (DATABASE_URL) belum dikonfigurasi. Data poin, referral, dan penarikan membutuhkan database permanen.'
          : 'Koneksi database PostgreSQL sedang tidak tersedia. Silakan coba lagi atau periksa konfigurasi DATABASE_URL.')
    );
    this.name = 'DatabaseUnavailableError';
    this.code = code;
  }
}

export function _setDbPoolForTest(customPool: Pool | null): void {
  testPoolOverride = customPool;
  if (customPool) {
    dbAvailable = true;
    schemaReadyPromise = null;
  } else {
    dbAvailable = false;
    schemaReadyPromise = null;
  }
}

export function getPool(): Pool | null {
  if (testPoolOverride) return testPoolOverride;
  if (pool) return pool;
  const conn = getDatabaseUrl();
  if (!conn) return null;

  try {
    pool = new Pool(buildPoolConfig(conn));
    pool.on('error', (err) => {
      console.warn(
        '[PostgreSQL] Idle client pool error:',
        err instanceof Error ? err.message : String(err)
      );
    });
    return pool;
  } catch (err) {
    console.warn(
      '[PostgreSQL] Pool creation failed:',
      err instanceof Error ? err.message : String(err)
    );
    pool = null;
    return null;
  }
}

export function isDatabaseEnabled(): boolean {
  return Boolean(testPoolOverride || getDatabaseUrl()) && dbAvailable;
}

async function requirePointsDbPool(): Promise<Pool> {
  if (testPoolOverride) {
    return testPoolOverride;
  }
  const conn = getDatabaseUrl();
  if (!conn) {
    throw new DatabaseUnavailableError('DATABASE_NOT_CONFIGURED');
  }
  const activePool = getPool();
  if (!activePool || !(await ensureDatabaseReady()) || !dbAvailable) {
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  }
  return activePool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T> | null> {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await activePool.query<T>(sql, params);
    } catch (err) {
      if (attempt === 0 && isTransientPoolError(err)) {
        await new Promise((r) => setTimeout(r, 140));
        continue;
      }
      if (isTransientPoolError(err)) {
        dbAvailable = false;
      }
      console.warn(
        '[PostgreSQL] Query error:',
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }
  return null;
}

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS home_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_home_cache_updated_at ON home_cache (updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_home_cache_expires_at ON home_cache (expires_at)`,

  `CREATE TABLE IF NOT EXISTS api_response_cache (
    cache_key TEXT PRIMARY KEY,
    status_code INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON api_response_cache (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_updated_at ON api_response_cache (updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT 'Kano Viewer',
    photo_url TEXT,
    avatar_initials TEXT NOT NULL DEFAULT 'KD',
    avatar_color TEXT NOT NULL DEFAULT '#EF4444',
    streak_count INTEGER NOT NULL DEFAULT 1,
    last_visit_date TEXT NOT NULL DEFAULT '',
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    bio TEXT NOT NULL DEFAULT '',
    preferred_language TEXT NOT NULL DEFAULT 'en',
    preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    episode_number INTEGER NOT NULL DEFAULT 1,
    user_id TEXT,
    author_name TEXT NOT NULL,
    author_email TEXT,
    author_photo_url TEXT,
    author_badge TEXT,
    author_initials TEXT,
    author_color TEXT,
    content TEXT NOT NULL,
    video_timestamp_sec INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_drama_ep_created ON comments (drama_id, provider, episode_number, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL,
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, drama_id, provider)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_likes_drama ON likes (drama_id, provider, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_likes_user ON likes (user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL,
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    folder_id TEXT NOT NULL DEFAULT 'all',
    title TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    drama_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, drama_id, provider)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON favorites (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_favorites_drama ON favorites (drama_id, provider)`,

  `CREATE TABLE IF NOT EXISTS video_stats (
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    episode_number INTEGER NOT NULL DEFAULT 0,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_views BIGINT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    likes_count BIGINT NOT NULL DEFAULT 0,
    comments_count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (drama_id, provider, episode_number, stat_date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_stats_date_views ON video_stats (stat_date, daily_views DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_video_stats_drama ON video_stats (drama_id, provider)`,

  `CREATE TABLE IF NOT EXISTS daily_site_stats (
    stat_date DATE PRIMARY KEY,
    today_visitors BIGINT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS site_counter_totals (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_visitors BIGINT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `INSERT INTO site_counter_totals (id, total_visitors, total_views) VALUES (1, 0, 0) ON CONFLICT (id) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS known_visitors (
    visitor_id TEXT PRIMARY KEY,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS daily_visitors (
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    visitor_id TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (stat_date, visitor_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_visitors_date ON daily_visitors (stat_date)`,

  `CREATE TABLE IF NOT EXISTS viewed_sessions (
    session_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_viewed_sessions_created ON viewed_sessions (created_at)`,

  `CREATE TABLE IF NOT EXISTS active_sessions (
    session_id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions (last_seen)`,

  `CREATE TABLE IF NOT EXISTS watch_history (
    user_id TEXT NOT NULL,
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    episode_number INTEGER NOT NULL DEFAULT 1,
    current_time_sec INTEGER NOT NULL DEFAULT 0,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    progress_pct INTEGER NOT NULL DEFAULT 0,
    drama_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, drama_id, provider)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_watch_history_user_updated ON watch_history (user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_watch_history_drama ON watch_history (drama_id, provider)`,

  `CREATE TABLE IF NOT EXISTS drama_catalog (
    drama_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    chapter_count INTEGER NOT NULL DEFAULT 1,
    genres TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Completed',
    popularity_score BIGINT NOT NULL DEFAULT 0,
    rating NUMERIC(3,2) NOT NULL DEFAULT 4.80,
    play_count TEXT,
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    drama_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (drama_id, provider)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_drama_catalog_slug ON drama_catalog (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_drama_catalog_genres_gin ON drama_catalog USING GIN (genres)`,
  `CREATE INDEX IF NOT EXISTS idx_drama_catalog_filter ON drama_catalog (provider, status, popularity_score DESC, rating DESC, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS seo_indexing_log (
    url TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL DEFAULT 'drama',
    entity_id TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT 'URL_UPDATED',
    status TEXT NOT NULL DEFAULT 'queued',
    response_code INTEGER NOT NULL DEFAULT 0,
    response_body TEXT NOT NULL DEFAULT '',
    last_pinged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_seo_indexing_log_pinged ON seo_indexing_log (last_pinged_at DESC)`,

  // Strict media_type separation ('drama' vs 'movie') across user interaction & telemetry tables
  `ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'drama'`,
  `ALTER TABLE likes ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'drama'`,
  `ALTER TABLE favorites ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'drama'`,
  `CREATE INDEX IF NOT EXISTS idx_favorites_user_media ON favorites (user_id, media_type, created_at DESC)`,
  `ALTER TABLE video_stats ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'drama'`,
  `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'drama'`,
  `CREATE INDEX IF NOT EXISTS idx_watch_history_media_type ON watch_history (user_id, media_type, updated_at DESC)`,

  // Dedicated LK21 Movies & Series tables (100% isolated from drama_catalog & home_cache)
  `CREATE TABLE IF NOT EXISTS movies (
    slug TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL,
    title TEXT NOT NULL,
    cover TEXT NOT NULL DEFAULT '',
    cover_hz TEXT NOT NULL DEFAULT '',
    poster TEXT NOT NULL DEFAULT '',
    synopsis TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT '',
    director TEXT NOT NULL DEFAULT '',
    actors TEXT[] NOT NULL DEFAULT '{}',
    genres TEXT[] NOT NULL DEFAULT '{}',
    rating TEXT NOT NULL DEFAULT '',
    quality TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    movie_type TEXT NOT NULL DEFAULT 'movie',
    update_info TEXT NOT NULL DEFAULT '',
    providers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    movie_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    popularity_score BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies (popularity_score DESC, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_movies_genres_gin ON movies USING GIN (genres)`,
  `CREATE INDEX IF NOT EXISTS idx_movies_type ON movies (movie_type, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS movie_episodes (
    slug TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    vid TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    episode_label TEXT NOT NULL DEFAULT '',
    stream_url TEXT NOT NULL DEFAULT '',
    raw_url TEXT NOT NULL DEFAULT '',
    stream_type TEXT NOT NULL DEFAULT 'hls',
    subtitles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    episode_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (slug, episode_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_movie_episodes_vid ON movie_episodes (vid)`,

  `CREATE TABLE IF NOT EXISTS movie_sources (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    episode_number INTEGER NOT NULL DEFAULT 1,
    vid TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL DEFAULT 'LK21',
    source_type TEXT NOT NULL DEFAULT 'hls',
    quality TEXT NOT NULL DEFAULT 'HD',
    stream_url TEXT NOT NULL DEFAULT '',
    raw_url TEXT NOT NULL DEFAULT '',
    embed_url TEXT NOT NULL DEFAULT '',
    subtitles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (slug, episode_number, source_name, quality)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_movie_sources_slug ON movie_sources (slug, episode_number)`,
  `CREATE INDEX IF NOT EXISTS idx_movie_sources_vid ON movie_sources (vid)`,

  `CREATE TABLE IF NOT EXISTS lk21_cache (
    cache_key TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lk21_cache_expires ON lk21_cache (expires_at)`,

  `CREATE TABLE IF NOT EXISTS gmail_login_accounts (
    account_key TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    login_count BIGINT NOT NULL DEFAULT 1,
    first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE gmail_login_accounts ADD COLUMN IF NOT EXISTS login_count BIGINT NOT NULL DEFAULT 1`,
  `CREATE INDEX IF NOT EXISTS idx_gmail_login_accounts_last ON gmail_login_accounts (last_login_at DESC)`,
  `INSERT INTO gmail_login_accounts (account_key, uid, email, email_verified, login_count, first_login_at, last_login_at)
   SELECT
     COALESCE(NULLIF(LOWER(TRIM(email)), ''), 'uid:' || uid),
     uid,
     LOWER(TRIM(email)),
     TRUE,
     1,
     created_at,
     updated_at
   FROM users
   WHERE COALESCE(NULLIF(LOWER(TRIM(email)), ''), uid) <> ''
   ON CONFLICT (account_key) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS points_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
    points INTEGER NOT NULL CHECK (points > 0),
    description TEXT NOT NULL DEFAULT '',
    event_code TEXT NOT NULL DEFAULT '',
    event_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    reference_id TEXT UNIQUE NOT NULL,
    balance_after INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER`,
  `ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS event_code TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS event_meta JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE INDEX IF NOT EXISTS idx_points_ledger_user_created ON points_ledger (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_points_ledger_user_type_created ON points_ledger (user_id, type, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS payout_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    points_spent INTEGER NOT NULL CHECK (points_spent > 0),
    usd_amount NUMERIC(12, 2) NOT NULL CHECK (usd_amount > 0),
    idr_amount BIGINT NOT NULL CHECK (idr_amount > 0),
    fx_rate_used NUMERIC(12, 2) NOT NULL CHECK (fx_rate_used > 0),
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'IDR')),
    method TEXT NOT NULL,
    bank_code TEXT NOT NULL DEFAULT '',
    network TEXT NOT NULL DEFAULT '',
    destination_account TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT,
    risk_flag TEXT NOT NULL DEFAULT '',
    suspicious_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS risk_flag TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS suspicious_reason TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS bank_code TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
  `ALTER TABLE payout_requests DROP CONSTRAINT IF EXISTS payout_requests_method_check`,
  `ALTER TABLE payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_requests_method_check') THEN
       ALTER TABLE payout_requests ADD CONSTRAINT payout_requests_method_check
         CHECK (method IN ('paypal', 'usdt_polygon', 'usdt_trc20', 'usdt_bep20', 'usdt_erc20', 'wise', 'dana', 'ovo', 'gopay', 'shopeepay', 'linkaja', 'bank_transfer'));
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_requests_status_check') THEN
       ALTER TABLE payout_requests ADD CONSTRAINT payout_requests_status_check
         CHECK (status IN ('pending', 'processing', 'approved', 'paid', 'completed', 'rejected', 'failed'));
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_user_created ON payout_requests (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_status_created ON payout_requests (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_dest_lower ON payout_requests (LOWER(destination_account))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_requests_idempotency ON payout_requests (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`,

  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_updated_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique ON users (UPPER(referral_code)) WHERE referral_code <> ''`,

  `CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_uid TEXT NOT NULL,
    referee_uid TEXT UNIQUE NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_watch' CHECK (status IN ('pending_watch', 'qualified', 'rejected_fraud')),
    bonus_points INTEGER NOT NULL DEFAULT 5000,
    referee_ip_hash TEXT NOT NULL DEFAULT '',
    referee_subnet_hash TEXT NOT NULL DEFAULT '',
    referee_ua_hash TEXT NOT NULL DEFAULT '',
    referee_device_hash TEXT NOT NULL DEFAULT '',
    risk_flag TEXT NOT NULL DEFAULT '',
    suspicious_reason TEXT NOT NULL DEFAULT '',
    qualified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE referrals ALTER COLUMN bonus_points SET DEFAULT 5000`,
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ongoing_bonus_points INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ongoing_steps_awarded INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created ON referrals (referrer_uid, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status ON referrals (referrer_uid, status, qualified_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code)`,

  `CREATE TABLE IF NOT EXISTS watch_telemetry (
    user_id TEXT PRIMARY KEY,
    verified_watch_seconds INTEGER NOT NULL DEFAULT 0,
    today_watch_seconds INTEGER NOT NULL DEFAULT 0,
    today_date_key TEXT NOT NULL DEFAULT '',
    active_stream_session_id TEXT NOT NULL DEFAULT '',
    active_stream_media_key TEXT NOT NULL DEFAULT '',
    last_heartbeat_at TIMESTAMPTZ,
    last_video_time_sec NUMERIC(10, 2) NOT NULL DEFAULT 0,
    fast_delta_strikes INTEGER NOT NULL DEFAULT 0,
    concurrent_tab_strikes INTEGER NOT NULL DEFAULT 0,
    risk_flag TEXT NOT NULL DEFAULT '',
    suspicious_reason TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS daily_checkins (
    user_id TEXT NOT NULL,
    checkin_date DATE NOT NULL,
    streak_day INTEGER NOT NULL DEFAULT 1,
    points_awarded INTEGER NOT NULL DEFAULT 1000,
    ledger_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, checkin_date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins (user_id, checkin_date DESC)`,

  `CREATE TABLE IF NOT EXISTS rewarded_episodes (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    drama_id TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 500,
    session_token TEXT NOT NULL DEFAULT '',
    ledger_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider, drama_id, episode_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rewarded_episodes_user_created ON rewarded_episodes (user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS watch_sessions (
    session_token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_key TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'DramaBoxV2',
    drama_id TEXT NOT NULL DEFAULT '',
    episode_number INTEGER NOT NULL DEFAULT 1,
    device_hash TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ,
    last_video_time_sec NUMERIC(10, 2) NOT NULL DEFAULT -1,
    accumulated_sec INTEGER NOT NULL DEFAULT 0,
    last_seq INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_watch_sessions_user_active ON watch_sessions (user_id, is_active, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_watch_sessions_user_media ON watch_sessions (user_id, media_key, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS user_security_signals (
    user_id TEXT PRIMARY KEY,
    ip_hash TEXT NOT NULL DEFAULT '',
    subnet_hash TEXT NOT NULL DEFAULT '',
    ua_hash TEXT NOT NULL DEFAULT '',
    device_hash TEXT NOT NULL DEFAULT '',
    risk_flag TEXT NOT NULL DEFAULT '',
    suspicious_reason TEXT NOT NULL DEFAULT '',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_security_signals_ip ON user_security_signals (ip_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_security_signals_subnet ON user_security_signals (subnet_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_security_signals_device ON user_security_signals (device_hash)`,

  `CREATE TABLE IF NOT EXISTS email_credentials (
    email TEXT PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT 'Kano Viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_email_credentials_uid ON email_credentials (uid)`,
];

export async function ensureDatabaseReady(): Promise<boolean> {
  if (testPoolOverride) {
    dbAvailable = true;
    return true;
  }
  const activePool = getPool();
  if (!activePool) {
    dbAvailable = false;
    return false;
  }
  if (dbAvailable) return true;
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      await client.query('SELECT 1');
      for (const stmt of SCHEMA_STATEMENTS) {
        await client.query(stmt);
      }
      dbAvailable = true;
      console.log('[PostgreSQL] Connected and schema + indexes verified.');
      return true;
    } catch (err) {
      dbAvailable = false;
      console.warn(
        '[PostgreSQL] Initialization failed:',
        err instanceof Error ? err.message : String(err)
      );
      return false;
    } finally {
      try {
        client?.release();
      } catch {
        // Ignore release error on broken client
      }
      schemaReadyPromise = null;
    }
  })();

  return schemaReadyPromise;
}

export async function pingDb(): Promise<{
  ok: boolean;
  latencyMs: number;
  engine: 'postgresql' | 'disconnected';
}> {
  const start = Date.now();
  const activePool = getPool();
  if (!activePool) {
    return { ok: false, latencyMs: 0, engine: 'disconnected' };
  }
  try {
    await ensureDatabaseReady();
    if (!dbAvailable) {
      return { ok: false, latencyMs: Date.now() - start, engine: 'disconnected' };
    }
    await activePool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start, engine: 'postgresql' };
  } catch {
    dbAvailable = false;
    return { ok: false, latencyMs: Date.now() - start, engine: 'disconnected' };
  }
}

function getDateKeyUtc(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setUTCDate(d.getUTCDate() + offsetDays);
  }
  return d.toISOString().slice(0, 10);
}

export interface DbUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  avatarInitials: string;
  avatarColor: string;
  streakCount: number;
  lastVisitDate: string;
  isVip: boolean;
  bio: string;
  preferredLanguage: string;
  preferences: Record<string, unknown>;
}

interface EmailCredentialFallbackRecord {
  email: string;
  uid: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthFallbackStore {
  emailCredentials: Record<string, EmailCredentialFallbackRecord>;
  users: Record<string, DbUserRecord>;
}

const AUTH_FALLBACK_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'email-auth.json'
);
let authFallbackStore: AuthFallbackStore | null = null;
let authFallbackQueue: Promise<unknown> = Promise.resolve();

function withAuthFallbackLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = authFallbackQueue.then(fn, fn);
  authFallbackQueue = next.catch(() => {});
  return next;
}

function loadAuthFallbackStore(): AuthFallbackStore {
  if (authFallbackStore) return authFallbackStore;
  try {
    if (fs.existsSync(AUTH_FALLBACK_CACHE_PATH)) {
      const parsed = JSON.parse(
        fs.readFileSync(AUTH_FALLBACK_CACHE_PATH, 'utf-8')
      ) as Partial<AuthFallbackStore>;
      authFallbackStore = {
        emailCredentials:
          parsed.emailCredentials && typeof parsed.emailCredentials === 'object'
            ? parsed.emailCredentials
            : {},
        users:
          parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      };
      return authFallbackStore;
    }
  } catch {
    // Ignore corrupt snapshot and initialize clean store
  }
  authFallbackStore = { emailCredentials: {}, users: {} };
  return authFallbackStore;
}

function persistAuthFallbackStore(store: AuthFallbackStore): void {
  try {
    const dir = path.dirname(AUTH_FALLBACK_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${AUTH_FALLBACK_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, AUTH_FALLBACK_CACHE_PATH);
  } catch (err) {
    console.warn(
      '[AuthFallback] Disk snapshot write failed:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPasswordScrypt(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];
  if (!salt || !expectedHex || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  try {
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const derived = await scryptAsync(password, salt, expectedBuf.length, { N: n, r, p });
    return (
      derived.length === expectedBuf.length &&
      crypto.timingSafeEqual(derived, expectedBuf)
    );
  } catch {
    return false;
  }
}

function syncUserFallback(input: {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  avatarInitials?: string;
  avatarColor?: string;
  visitDate?: string;
}): DbUserRecord {
  const store = loadAuthFallbackStore();
  const today = (input.visitDate || getDateKeyUtc()).slice(0, 10);
  const yesterday = getDateKeyUtc(-1);
  const prev = store.users[input.uid];

  let nextStreak = 1;
  if (prev) {
    const prevCount = Number(prev.streakCount) || 1;
    if (prev.lastVisitDate === today) {
      nextStreak = Math.max(1, prevCount);
    } else if (prev.lastVisitDate === yesterday) {
      nextStreak = Math.max(2, prevCount + 1);
    } else {
      nextStreak = 1;
    }
  }

  const email = (input.email || prev?.email || '').trim().slice(0, 180);
  const incomingName = (input.displayName || '').trim().slice(0, 120);
  const displayName =
    prev?.displayName && prev.displayName !== 'Kano Viewer'
      ? prev.displayName
      : incomingName || 'Kano Viewer';
  const record: DbUserRecord = {
    uid: input.uid,
    email,
    displayName,
    photoURL:
      input.photoURL !== undefined
        ? input.photoURL
          ? input.photoURL.trim().slice(0, 500)
          : null
        : prev?.photoURL ?? null,
    avatarInitials: (input.avatarInitials || prev?.avatarInitials || 'KD').trim().slice(0, 4),
    avatarColor: (input.avatarColor || prev?.avatarColor || '#EF4444').trim().slice(0, 24),
    streakCount: nextStreak,
    lastVisitDate: today,
    isVip: nextStreak >= 3,
    bio: prev?.bio || '',
    preferredLanguage: prev?.preferredLanguage || 'en',
    preferences: prev?.preferences || {},
  };

  store.users[input.uid] = record;
  persistAuthFallbackStore(store);

  return record;
}

export async function syncUserInDb(input: {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  avatarInitials?: string;
  avatarColor?: string;
  visitDate?: string;
}): Promise<DbUserRecord | null> {
  const activePool = getPool();
  if (!activePool || !(await ensureDatabaseReady()) || !dbAvailable) {
    return withAuthFallbackLock(() => syncUserFallback(input));
  }

  const today = getJakartaDateKey();
  const yesterday = getJakartaDateKey(new Date(Date.now() - 86_400_000));

  try {
    const existingRes = await dbQuery<{
      streak_count: number;
      last_visit_date: string;
    }>('SELECT streak_count, last_visit_date FROM users WHERE uid = $1', [input.uid]);
    if (!existingRes) {
      return withAuthFallbackLock(() => syncUserFallback(input));
    }

    let nextStreak = 1;
    if (existingRes.rows.length > 0) {
      const prev = existingRes.rows[0];
      const prevCount = Number(prev.streak_count) || 1;
      if (prev.last_visit_date === today) {
        nextStreak = Math.max(1, prevCount);
      } else if (prev.last_visit_date === yesterday) {
        nextStreak = Math.max(2, prevCount + 1);
      } else {
        nextStreak = 1;
      }
    }

    const isVip = nextStreak >= 3;
    const email = (input.email || '').trim().slice(0, 180);
    const displayName = (input.displayName || 'Kano Viewer').trim().slice(0, 120);
    const photoURL = input.photoURL ? input.photoURL.trim().slice(0, 500) : null;
    const avatarInitials = (input.avatarInitials || 'KD').trim().slice(0, 4);
    const avatarColor = (input.avatarColor || '#EF4444').trim().slice(0, 24);
    const referralCode = buildReferralCodeForUser(input.uid);

    const upsertRes = await dbQuery<{
      uid: string;
      email: string;
      display_name: string;
      photo_url: string | null;
      avatar_initials: string;
      avatar_color: string;
      streak_count: number;
      last_visit_date: string;
      is_vip: boolean;
      bio: string;
      preferred_language: string;
      preferences_json: Record<string, unknown>;
    }>(
      `INSERT INTO users (
         uid, email, display_name, photo_url, avatar_initials, avatar_color,
         streak_count, last_visit_date, is_vip, referral_code, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (uid) DO UPDATE SET
         email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE users.email END,
         display_name = CASE WHEN users.display_name <> '' AND users.display_name <> 'Kano Viewer' THEN users.display_name ELSE EXCLUDED.display_name END,
         photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
         avatar_initials = EXCLUDED.avatar_initials,
         avatar_color = EXCLUDED.avatar_color,
         streak_count = EXCLUDED.streak_count,
         last_visit_date = EXCLUDED.last_visit_date,
         is_vip = EXCLUDED.is_vip,
         referral_code = CASE WHEN users.referral_code = '' THEN EXCLUDED.referral_code ELSE users.referral_code END,
         updated_at = NOW()
       RETURNING uid, email, display_name, photo_url, avatar_initials, avatar_color, streak_count, last_visit_date, is_vip, bio, preferred_language, preferences_json`,
      [
        input.uid,
        email,
        displayName,
        photoURL,
        avatarInitials,
        avatarColor,
        nextStreak,
        today,
        isVip,
        referralCode,
      ]
    );

    const row = upsertRes?.rows[0];
    if (!row) {
      return withAuthFallbackLock(() => syncUserFallback(input));
    }
    return {
      uid: row.uid,
      email: row.email,
      displayName: row.display_name,
      photoURL: row.photo_url,
      avatarInitials: row.avatar_initials,
      avatarColor: row.avatar_color,
      streakCount: Number(row.streak_count) || 1,
      lastVisitDate: row.last_visit_date,
      isVip: Boolean(row.is_vip),
      bio: row.bio || '',
      preferredLanguage: row.preferred_language || 'en',
      preferences: row.preferences_json || {},
    };
  } catch {
    return withAuthFallbackLock(() => syncUserFallback(input));
  }
}

export async function registerEmailAccountInDb(input: {
  email: string;
  password: string;
  displayName?: string;
  avatarInitials: string;
  avatarColor: string;
  visitDate?: string;
}): Promise<
  | { ok: true; user: DbUserRecord }
  | { ok: false; reason: 'email_exists' | 'invalid_input' }
> {
  const cleanEmail = input.email.trim().toLowerCase().slice(0, 180);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) ||
    input.password.length < 6 ||
    input.password.length > 128
  ) {
    return { ok: false, reason: 'invalid_input' };
  }

  const displayName = (
    (input.displayName || '').trim() ||
    cleanEmail.split('@')[0] ||
    'Kano Viewer'
  ).slice(0, 120);
  const uid = `email_${crypto
    .createHash('sha256')
    .update(cleanEmail)
    .digest('hex')
    .slice(0, 20)}`;
  const passwordHash = await hashPasswordScrypt(input.password);

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      await client.query('BEGIN');

      const existing = await client.query<{ email: string }>(
        `SELECT email FROM email_credentials WHERE email = $1 LIMIT 1`,
        [cleanEmail]
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return { ok: false, reason: 'email_exists' };
      }

      await client.query(
        `INSERT INTO email_credentials (email, uid, password_hash, display_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [cleanEmail, uid, passwordHash, displayName]
      );
      await client.query('COMMIT');
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      const pgCode = String((err as { code?: unknown })?.code || '');
      if (pgCode === '23505') {
        return { ok: false, reason: 'email_exists' };
      }
      console.warn(
        '[PostgreSQL] registerEmailAccountInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
      client = null;
    } finally {
      client?.release();
    }

    if (dbAvailable) {
      const synced = await syncUserInDb({
        uid,
        email: cleanEmail,
        displayName,
        photoURL: null,
        avatarInitials: input.avatarInitials,
        avatarColor: input.avatarColor,
        visitDate: input.visitDate,
      });
      if (synced) {
        return { ok: true, user: synced };
      }
    }
  }

  return withAuthFallbackLock(() => {
    const store = loadAuthFallbackStore();
    if (store.emailCredentials[cleanEmail]) {
      return { ok: false as const, reason: 'email_exists' as const };
    }
    const nowIso = new Date().toISOString();
    store.emailCredentials[cleanEmail] = {
      email: cleanEmail,
      uid,
      passwordHash,
      displayName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    persistAuthFallbackStore(store);
    const user = syncUserFallback({
      uid,
      email: cleanEmail,
      displayName,
      photoURL: null,
      avatarInitials: input.avatarInitials,
      avatarColor: input.avatarColor,
      visitDate: input.visitDate,
    });
    return { ok: true as const, user };
  });
}

export async function authenticateEmailAccountInDb(input: {
  email: string;
  password: string;
  avatarInitials: string;
  avatarColor: string;
  visitDate?: string;
}): Promise<
  | { ok: true; user: DbUserRecord }
  | { ok: false; reason: 'invalid_credentials' }
> {
  const cleanEmail = input.email.trim().toLowerCase().slice(0, 180);
  if (!cleanEmail || !input.password || input.password.length > 128) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    const res = await dbQuery<{
      uid: string;
      password_hash: string;
      display_name: string;
    }>(
      `SELECT uid, password_hash, display_name
       FROM email_credentials
       WHERE email = $1
       LIMIT 1`,
      [cleanEmail]
    );
    const row = res?.rows[0];
    if (res) {
      if (!row) {
        return { ok: false, reason: 'invalid_credentials' };
      }
      const matched = await verifyPasswordScrypt(input.password, row.password_hash);
      if (!matched) {
        return { ok: false, reason: 'invalid_credentials' };
      }
      const synced = await syncUserInDb({
        uid: row.uid,
        email: cleanEmail,
        displayName: row.display_name,
        photoURL: null,
        avatarInitials: input.avatarInitials,
        avatarColor: input.avatarColor,
        visitDate: input.visitDate,
      });
      if (synced) {
        return { ok: true, user: synced };
      }
    }
  }

  return withAuthFallbackLock(async () => {
    const store = loadAuthFallbackStore();
    const cred = store.emailCredentials[cleanEmail];
    if (!cred) {
      return { ok: false as const, reason: 'invalid_credentials' as const };
    }
    const matched = await verifyPasswordScrypt(input.password, cred.passwordHash);
    if (!matched) {
      return { ok: false as const, reason: 'invalid_credentials' as const };
    }
    const user = syncUserFallback({
      uid: cred.uid,
      email: cleanEmail,
      displayName: cred.displayName,
      photoURL: null,
      avatarInitials: input.avatarInitials,
      avatarColor: input.avatarColor,
      visitDate: input.visitDate,
    });
    return { ok: true as const, user };
  });
}

export function buildGmailAccountKey(uid: string, email?: string): string {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return cleanEmail.slice(0, 180);
  }
  const cleanUid = (uid || '').trim();
  return cleanUid ? `uid:${cleanUid.slice(0, 128)}` : '';
}

export async function recordGmailLoginInDb(input: {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  isLoginEvent?: boolean;
}): Promise<number | null> {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

  const accountKey = buildGmailAccountKey(input.uid, input.email);
  if (!accountKey) return null;
  const cleanEmail = (input.email || '').trim().toLowerCase().slice(0, 180);
  const verified = input.emailVerified !== false;
  const isLoginEvent = Boolean(input.isLoginEvent);

  try {
    await dbQuery(
      isLoginEvent
        ? `INSERT INTO gmail_login_accounts (
             account_key, uid, email, email_verified, login_count, first_login_at, last_login_at
           )
           VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
           ON CONFLICT (account_key) DO UPDATE SET
             uid = EXCLUDED.uid,
             email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE gmail_login_accounts.email END,
             email_verified = gmail_login_accounts.email_verified OR EXCLUDED.email_verified,
             login_count = COALESCE(gmail_login_accounts.login_count, 1) + 1,
             last_login_at = NOW()`
        : `INSERT INTO gmail_login_accounts (
             account_key, uid, email, email_verified, login_count, first_login_at, last_login_at
           )
           VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
           ON CONFLICT (account_key) DO UPDATE SET
             uid = EXCLUDED.uid,
             email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE gmail_login_accounts.email END,
             email_verified = gmail_login_accounts.email_verified OR EXCLUDED.email_verified,
             login_count = GREATEST(1, COALESCE(gmail_login_accounts.login_count, 1)),
             last_login_at = NOW()`,
      [accountKey, input.uid.trim().slice(0, 128), cleanEmail, verified]
    );
    return getUniqueGmailLoginCountFromDb();
  } catch (err) {
    console.warn(
      '[PostgreSQL] recordGmailLoginInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export async function getUniqueGmailLoginCountFromDb(): Promise<number | null> {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

  try {
    const res = await dbQuery<{ cnt: string }>(
      `SELECT COALESCE(SUM(GREATEST(1, COALESCE(login_count, 1))), 0)::text AS cnt
       FROM gmail_login_accounts`
    );
    if (!res || res.rows.length === 0) return null;
    return Math.max(0, Number(res.rows[0].cnt) || 0);
  } catch (err) {
    console.warn(
      '[PostgreSQL] getUniqueGmailLoginCountFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export async function getUserFromDb(uid: string): Promise<DbUserRecord | null> {
  const activePool = getPool();
  if (!activePool || !(await ensureDatabaseReady()) || !dbAvailable) {
    return withAuthFallbackLock(() => {
      const store = loadAuthFallbackStore();
      return store.users[uid] || null;
    });
  }
  const res = await dbQuery<{
    uid: string;
    email: string;
    display_name: string;
    photo_url: string | null;
    avatar_initials: string;
    avatar_color: string;
    streak_count: number;
    last_visit_date: string;
    is_vip: boolean;
    bio: string;
    preferred_language: string;
    preferences_json: Record<string, unknown>;
  }>(
    `SELECT uid, email, display_name, photo_url, avatar_initials, avatar_color, streak_count, last_visit_date, is_vip, bio, preferred_language, preferences_json
     FROM users WHERE uid = $1`,
    [uid]
  );
  const row = res?.rows[0];
  if (!row) {
    return withAuthFallbackLock(() => {
      const store = loadAuthFallbackStore();
      return store.users[uid] || null;
    });
  }
  return {
    uid: row.uid,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url,
    avatarInitials: row.avatar_initials,
    avatarColor: row.avatar_color,
    streakCount: Number(row.streak_count) || 1,
    lastVisitDate: row.last_visit_date,
    isVip: Boolean(row.is_vip),
    bio: row.bio || '',
    preferredLanguage: row.preferred_language || 'en',
    preferences: row.preferences_json || {},
  };
}

export async function updateUserProfileInDb(input: {
  uid: string;
  displayName?: string;
  bio?: string;
  preferredLanguage?: string;
  preferences?: Record<string, unknown>;
}): Promise<DbUserRecord | null> {
  const activePool = getPool();
  if (!activePool || !(await ensureDatabaseReady()) || !dbAvailable) {
    return withAuthFallbackLock(() => {
      const store = loadAuthFallbackStore();
      const existing = store.users[input.uid] || syncUserFallback({ uid: input.uid });
      const nextName =
        typeof input.displayName === 'string' && input.displayName.trim()
          ? input.displayName.trim().slice(0, 120)
          : existing.displayName || 'Kano Viewer';
      const nextBio =
        typeof input.bio === 'string'
          ? input.bio.trim().slice(0, 320)
          : existing.bio || '';
      const nextLang =
        typeof input.preferredLanguage === 'string' &&
        ['en', 'id', 'cn', 'vi', 'es', 'ko', 'ja', 'th', 'ms', 'tl'].includes(
          input.preferredLanguage
        )
          ? input.preferredLanguage
          : existing.preferredLanguage || 'en';
      const mergedPrefs = {
        ...(existing.preferences || {}),
        ...(input.preferences || {}),
      };
      const updated: DbUserRecord = {
        ...existing,
        displayName: nextName,
        bio: nextBio,
        preferredLanguage: nextLang,
        preferences: mergedPrefs,
      };
      store.users[input.uid] = updated;
      persistAuthFallbackStore(store);
      return updated;
    });
  }

  const existing = await getUserFromDb(input.uid);
  const nextName =
    typeof input.displayName === 'string' && input.displayName.trim()
      ? input.displayName.trim().slice(0, 120)
      : existing?.displayName || 'Kano Viewer';
  const nextBio =
    typeof input.bio === 'string'
      ? input.bio.trim().slice(0, 320)
      : existing?.bio || '';
  const nextLang =
    typeof input.preferredLanguage === 'string' &&
    ['en', 'id', 'cn', 'vi', 'es', 'ko', 'ja', 'th', 'ms', 'tl'].includes(
      input.preferredLanguage
    )
      ? input.preferredLanguage
      : existing?.preferredLanguage || 'en';
  const mergedPrefs = {
    ...(existing?.preferences || {}),
    ...(input.preferences || {}),
  };

  const res = await dbQuery<{
    uid: string;
    email: string;
    display_name: string;
    photo_url: string | null;
    avatar_initials: string;
    avatar_color: string;
    streak_count: number;
    last_visit_date: string;
    is_vip: boolean;
    bio: string;
    preferred_language: string;
    preferences_json: Record<string, unknown>;
  }>(
    `INSERT INTO users (
       uid, display_name, bio, preferred_language, preferences_json, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (uid) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       bio = EXCLUDED.bio,
       preferred_language = EXCLUDED.preferred_language,
       preferences_json = EXCLUDED.preferences_json,
       updated_at = NOW()
     RETURNING uid, email, display_name, photo_url, avatar_initials, avatar_color, streak_count, last_visit_date, is_vip, bio, preferred_language, preferences_json`,
    [input.uid, nextName, nextBio, nextLang, JSON.stringify(mergedPrefs)]
  );

  const row = res?.rows[0];
  if (!row) return null;
  return {
    uid: row.uid,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url,
    avatarInitials: row.avatar_initials,
    avatarColor: row.avatar_color,
    streakCount: Number(row.streak_count) || 1,
    lastVisitDate: row.last_visit_date,
    isVip: Boolean(row.is_vip),
    bio: row.bio || '',
    preferredLanguage: row.preferred_language || 'en',
    preferences: row.preferences_json || {},
  };
}

export interface DbCommentRecord {
  id: string;
  dramaId: string;
  provider: string;
  episodeNumber: number;
  authorUid?: string;
  author: string;
  authorEmail?: string;
  authorPhotoURL: string | null;
  authorBadge?: string;
  authorInitials?: string;
  authorColor?: string;
  text: string;
  videoTimestampSec: number;
  createdAt: number;
}

export async function listCommentsFromDb(
  dramaId: string,
  provider: string,
  episodeNumber: number,
  limitCount = 30,
  offsetCount = 0
): Promise<{ comments: DbCommentRecord[]; total: number }> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limitCount)));
  const safeOffset = Math.max(0, Math.floor(offsetCount));
  const res = await dbQuery<{
    id: string;
    drama_id: string;
    provider: string;
    episode_number: number;
    user_id: string | null;
    author_name: string;
    author_email: string | null;
    author_photo_url: string | null;
    author_badge: string | null;
    author_initials: string | null;
    author_color: string | null;
    content: string;
    video_timestamp_sec: number;
    created_at: Date;
    total_count: string;
  }>(
    `SELECT id, drama_id, provider, episode_number, user_id, author_name, author_email,
            author_photo_url, author_badge, author_initials, author_color, content,
            video_timestamp_sec, created_at,
            COUNT(*) OVER()::text AS total_count
     FROM comments
     WHERE drama_id = $1 AND provider = $2 AND episode_number = $3
     ORDER BY created_at DESC
     LIMIT $4 OFFSET $5`,
    [dramaId, provider, episodeNumber, safeLimit, safeOffset]
  );

  if (!res || res.rows.length === 0) {
    return { comments: [], total: 0 };
  }

  const total = Number(res.rows[0].total_count) || res.rows.length;
  const comments: DbCommentRecord[] = res.rows.map((r) => ({
    id: r.id,
    dramaId: r.drama_id,
    provider: r.provider,
    episodeNumber: Number(r.episode_number) || 1,
    authorUid: r.user_id ?? undefined,
    author: r.author_name,
    authorEmail: r.author_email ?? undefined,
    authorPhotoURL: r.author_photo_url,
    authorBadge: r.author_badge ?? undefined,
    authorInitials: r.author_initials ?? undefined,
    authorColor: r.author_color ?? undefined,
    text: r.content,
    videoTimestampSec: Number(r.video_timestamp_sec) || 0,
    createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Date.now(),
  }));

  return { comments, total };
}

export async function createCommentInDb(input: {
  id: string;
  dramaId: string;
  provider: string;
  episodeNumber: number;
  userId?: string;
  authorName: string;
  authorEmail?: string;
  authorPhotoURL?: string | null;
  authorBadge?: string;
  authorInitials?: string;
  authorColor?: string;
  content: string;
  videoTimestampSec?: number;
}): Promise<DbCommentRecord | null> {
  const safeTs = Math.max(0, Math.floor(Number(input.videoTimestampSec) || 0));
  const mediaType =
    input.provider === 'LK21' || input.provider === 'LookSeries'
      ? 'movie'
      : 'drama';
  const res = await dbQuery<{
    id: string;
    drama_id: string;
    provider: string;
    episode_number: number;
    user_id: string | null;
    author_name: string;
    author_email: string | null;
    author_photo_url: string | null;
    author_badge: string | null;
    author_initials: string | null;
    author_color: string | null;
    content: string;
    video_timestamp_sec: number;
    created_at: Date;
  }>(
    `INSERT INTO comments (
       id, drama_id, provider, media_type, episode_number, user_id, author_name, author_email,
       author_photo_url, author_badge, author_initials, author_color, content, video_timestamp_sec
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, drama_id, provider, episode_number, user_id, author_name, author_email,
               author_photo_url, author_badge, author_initials, author_color, content,
               video_timestamp_sec, created_at`,
    [
      input.id,
      input.dramaId,
      input.provider,
      mediaType,
      input.episodeNumber,
      input.userId || null,
      input.authorName.slice(0, 120),
      input.authorEmail ? input.authorEmail.slice(0, 180) : null,
      input.authorPhotoURL ? input.authorPhotoURL.slice(0, 500) : null,
      input.authorBadge ? input.authorBadge.slice(0, 60) : null,
      input.authorInitials ? input.authorInitials.slice(0, 4) : null,
      input.authorColor ? input.authorColor.slice(0, 24) : null,
      input.content.slice(0, 400),
      safeTs,
    ]
  );

  // Atomically update comment count in video_stats (best-effort, keyed by WIB date)
  const wibDate = getJakartaDateKey();
  void dbQuery(
    `INSERT INTO video_stats (drama_id, provider, media_type, episode_number, stat_date, comments_count, updated_at)
     VALUES ($1, $2, $3, $4, $5::date, 1, NOW())
     ON CONFLICT (drama_id, provider, episode_number, stat_date)
     DO UPDATE SET comments_count = video_stats.comments_count + 1, media_type = EXCLUDED.media_type, updated_at = NOW()`,
    [input.dramaId, input.provider, mediaType, input.episodeNumber, wibDate]
  ).catch(() => {});

  const r = res?.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    dramaId: r.drama_id,
    provider: r.provider,
    episodeNumber: Number(r.episode_number) || 1,
    authorUid: r.user_id ?? undefined,
    author: r.author_name,
    authorEmail: r.author_email ?? undefined,
    authorPhotoURL: r.author_photo_url,
    authorBadge: r.author_badge ?? undefined,
    authorInitials: r.author_initials ?? undefined,
    authorColor: r.author_color ?? undefined,
    text: r.content,
    videoTimestampSec: Number(r.video_timestamp_sec) || 0,
    createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Date.now(),
  };
}

export async function listLikesFromDb(
  userId: string,
  limitCount = 100,
  offsetCount = 0
): Promise<{ items: Array<{ dramaId: string; provider: string; createdAt: number }>; total: number }> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limitCount)));
  const safeOffset = Math.max(0, Math.floor(offsetCount));
  const res = await dbQuery<{
    drama_id: string;
    provider: string;
    created_at: Date;
    total_count: string;
  }>(
    `SELECT drama_id, provider, created_at, COUNT(*) OVER()::text AS total_count
     FROM likes
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, safeOffset]
  );

  if (!res || res.rows.length === 0) return { items: [], total: 0 };
  const total = Number(res.rows[0].total_count) || res.rows.length;
  return {
    items: res.rows.map((r) => ({
      dramaId: r.drama_id,
      provider: r.provider,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Date.now(),
    })),
    total,
  };
}

export async function toggleLikeInDb(
  userId: string,
  dramaId: string,
  provider: string
): Promise<{ liked: boolean; likesCount: number }> {
  const existing = await dbQuery(
    'SELECT 1 FROM likes WHERE user_id = $1 AND drama_id = $2 AND provider = $3',
    [userId, dramaId, provider]
  );

  const mediaType =
    provider === 'LK21' || provider === 'LookSeries' ? 'movie' : 'drama';
  let liked = false;
  if (existing && existing.rows.length > 0) {
    await dbQuery(
      'DELETE FROM likes WHERE user_id = $1 AND drama_id = $2 AND provider = $3',
      [userId, dramaId, provider]
    );
    liked = false;
  } else {
    await dbQuery(
      `INSERT INTO likes (user_id, drama_id, provider, media_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, drama_id, provider) DO NOTHING`,
      [userId, dramaId, provider, mediaType]
    );
    liked = true;
  }

  const countRes = await dbQuery<{ cnt: string }>(
    'SELECT COUNT(*)::text AS cnt FROM likes WHERE drama_id = $1 AND provider = $2',
    [dramaId, provider]
  );
  const likesCount = Number(countRes?.rows[0]?.cnt ?? (liked ? 1 : 0));

  const wibDate = getJakartaDateKey();
  void dbQuery(
    `INSERT INTO video_stats (drama_id, provider, media_type, episode_number, stat_date, likes_count, updated_at)
     VALUES ($1, $2, $3, 0, $4::date, $5, NOW())
     ON CONFLICT (drama_id, provider, episode_number, stat_date)
     DO UPDATE SET likes_count = $5, media_type = EXCLUDED.media_type, updated_at = NOW()`,
    [dramaId, provider, mediaType, wibDate, likesCount]
  ).catch(() => {});

  return { liked, likesCount };
}

export async function listFavoritesFromDb(
  userId: string,
  limitCount = 100,
  offsetCount = 0,
  mediaType?: 'movie' | 'drama'
): Promise<{
  items: Array<{
    dramaId: string;
    provider: string;
    mediaType: 'movie' | 'drama';
    folderId: string;
    drama: Record<string, unknown>;
    createdAt: number;
  }>;
  total: number;
}> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limitCount)));
  const safeOffset = Math.max(0, Math.floor(offsetCount));
  const whereClause = mediaType
    ? 'WHERE user_id = $1 AND media_type = $4'
    : 'WHERE user_id = $1';
  const params: unknown[] = mediaType
    ? [userId, safeLimit, safeOffset, mediaType]
    : [userId, safeLimit, safeOffset];

  const res = await dbQuery<{
    drama_id: string;
    provider: string;
    media_type: string;
    folder_id: string;
    drama_json: Record<string, unknown>;
    created_at: Date;
    total_count: string;
  }>(
    `SELECT drama_id, provider, media_type, folder_id, drama_json, created_at, COUNT(*) OVER()::text AS total_count
     FROM favorites
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );

  if (!res || res.rows.length === 0) return { items: [], total: 0 };
  const total = Number(res.rows[0].total_count) || res.rows.length;
  return {
    items: res.rows.map((r) => ({
      dramaId: r.drama_id,
      provider: r.provider,
      mediaType:
        r.media_type === 'movie' ||
        r.provider === 'LK21' ||
        r.provider === 'LookSeries'
          ? 'movie'
          : 'drama',
      folderId: r.folder_id || 'all',
      drama: r.drama_json || {},
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Date.now(),
    })),
    total,
  };
}

export async function toggleFavoriteInDb(input: {
  userId: string;
  dramaId: string;
  provider: string;
  mediaType?: 'movie' | 'drama';
  folderId?: string;
  title?: string;
  cover?: string;
  drama?: Record<string, unknown>;
  forceSave?: boolean;
}): Promise<{ saved: boolean; folderId: string; mediaType: 'movie' | 'drama' }> {
  const existing = await dbQuery<{ folder_id: string }>(
    'SELECT folder_id FROM favorites WHERE user_id = $1 AND drama_id = $2 AND provider = $3',
    [input.userId, input.dramaId, input.provider]
  );

  const mediaType: 'movie' | 'drama' =
    input.mediaType === 'movie' || input.mediaType === 'drama'
      ? input.mediaType
      : input.provider === 'LK21' || input.provider === 'LookSeries'
      ? 'movie'
      : 'drama';

  if (existing && existing.rows.length > 0 && !input.forceSave) {
    await dbQuery(
      'DELETE FROM favorites WHERE user_id = $1 AND drama_id = $2 AND provider = $3',
      [input.userId, input.dramaId, input.provider]
    );
    return { saved: false, folderId: 'all', mediaType };
  }

  const folderId = (input.folderId || existing?.rows[0]?.folder_id || 'all').slice(0, 64);
  const title = (input.title || '').slice(0, 240);
  const cover = (input.cover || '').slice(0, 1000);
  const dramaJson = JSON.stringify(input.drama || { bookId: input.dramaId, provider: input.provider, title, cover, mediaType });

  await dbQuery(
    `INSERT INTO favorites (user_id, drama_id, provider, media_type, folder_id, title, cover, drama_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, drama_id, provider) DO UPDATE SET
       media_type = EXCLUDED.media_type,
       folder_id = EXCLUDED.folder_id,
       title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE favorites.title END,
       cover = CASE WHEN EXCLUDED.cover <> '' THEN EXCLUDED.cover ELSE favorites.cover END,
       drama_json = EXCLUDED.drama_json,
       updated_at = NOW()`,
    [input.userId, input.dramaId, input.provider, mediaType, folderId, title, cover, dramaJson]
  );

  return { saved: true, folderId, mediaType };
}

export async function updateFavoriteFolderInDb(
  userId: string,
  dramaId: string,
  provider: string,
  folderId: string
): Promise<boolean> {
  const res = await dbQuery(
    `UPDATE favorites SET folder_id = $4, updated_at = NOW()
     WHERE user_id = $1 AND drama_id = $2 AND provider = $3`,
    [userId, dramaId, provider, folderId.slice(0, 64)]
  );
  return Boolean(res && (res.rowCount ?? 0) > 0);
}

export async function recordVideoViewInDb(
  dramaId: string,
  provider: string,
  episodeNumber = 1
): Promise<{ dailyViews: number; totalViews: number; siteTotalViews: number }> {
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const mediaType =
    provider === 'LK21' || provider === 'LookSeries' ? 'movie' : 'drama';
  const wibDate = getJakartaDateKey();

  // Update both episode-level (episode_number = safeEp) and drama-level aggregate (episode_number = 0)
  const epRes = await dbQuery<{ daily_views: string; total_views: string }>(
    `INSERT INTO video_stats (drama_id, provider, media_type, episode_number, stat_date, daily_views, total_views, updated_at)
     VALUES ($1, $2, $3, $4, $5::date, 1, 1, NOW())
     ON CONFLICT (drama_id, provider, episode_number, stat_date)
     DO UPDATE SET
       media_type = EXCLUDED.media_type,
       daily_views = video_stats.daily_views + 1,
       total_views = video_stats.total_views + 1,
       updated_at = NOW()
     RETURNING daily_views::text, total_views::text`,
    [dramaId, provider, mediaType, safeEp, wibDate]
  );

  await dbQuery(
    `INSERT INTO video_stats (drama_id, provider, media_type, episode_number, stat_date, daily_views, total_views, updated_at)
     VALUES ($1, $2, $3, 0, $4::date, 1, 1, NOW())
     ON CONFLICT (drama_id, provider, episode_number, stat_date)
     DO UPDATE SET
       media_type = EXCLUDED.media_type,
       daily_views = video_stats.daily_views + 1,
       total_views = video_stats.total_views + 1,
       updated_at = NOW()`,
    [dramaId, provider, mediaType, wibDate]
  );

  // Also bump global site total_views (cumulative all-time, starting from 0)
  const siteTotRes = await dbQuery<{ total_views: string }>(
    `INSERT INTO site_counter_totals (id, total_visitors, total_views, updated_at)
     VALUES (1, 0, 1, NOW())
     ON CONFLICT (id) DO UPDATE SET
       total_views = site_counter_totals.total_views + 1,
       updated_at = NOW()
     RETURNING total_views::text`
  );

  await dbQuery(
    `INSERT INTO daily_site_stats (stat_date, today_visitors, total_views, updated_at)
     VALUES ($1::date, 0, 1, NOW())
     ON CONFLICT (stat_date)
     DO UPDATE SET
       total_views = daily_site_stats.total_views + 1,
       updated_at = NOW()`,
    [wibDate]
  );

  const row = epRes?.rows[0];
  return {
    dailyViews: Number(row?.daily_views ?? 1),
    totalViews: Number(row?.total_views ?? 1),
    siteTotalViews: Number(siteTotRes?.rows[0]?.total_views ?? 1),
  };
}

export async function getDramaStatsFromDb(
  dramaId: string,
  provider: string,
  userId?: string
): Promise<{
  dramaId: string;
  provider: string;
  dailyViews: number;
  totalViews: number;
  likesCount: number;
  commentsCount: number;
  userLiked?: boolean;
}> {
  const wibDate = getJakartaDateKey();
  const [viewsRes, likesRes, commentsRes, userLikedRes] = await Promise.all([
    dbQuery<{ daily_views: string; total_views: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN stat_date = $3::date THEN daily_views ELSE 0 END), 0)::text AS daily_views,
         COALESCE(SUM(total_views), 0)::text AS total_views
       FROM video_stats
       WHERE drama_id = $1 AND provider = $2 AND episode_number = 0`,
      [dramaId, provider, wibDate]
    ),
    dbQuery<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM likes WHERE drama_id = $1 AND provider = $2',
      [dramaId, provider]
    ),
    dbQuery<{ cnt: string }>(
      'SELECT COUNT(*)::text AS cnt FROM comments WHERE drama_id = $1 AND provider = $2',
      [dramaId, provider]
    ),
    userId
      ? dbQuery<{ ok: number }>(
          'SELECT 1 AS ok FROM likes WHERE user_id = $1 AND drama_id = $2 AND provider = $3 LIMIT 1',
          [userId, dramaId, provider]
        )
      : Promise.resolve(null),
  ]);

  return {
    dramaId,
    provider,
    dailyViews: Number(viewsRes?.rows[0]?.daily_views ?? 0),
    totalViews: Number(viewsRes?.rows[0]?.total_views ?? 0),
    likesCount: Number(likesRes?.rows[0]?.cnt ?? 0),
    commentsCount: Number(commentsRes?.rows[0]?.cnt ?? 0),
    ...(userId ? { userLiked: Boolean(userLikedRes && userLikedRes.rows.length > 0) } : {}),
  };
}

export async function getTopDailyStatsFromDb(
  limitCount = 20,
  offsetCount = 0
): Promise<
  Array<{
    dramaId: string;
    provider: string;
    dailyViews: number;
    totalViews: number;
    likesCount: number;
    commentsCount: number;
  }>
> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limitCount)));
  const safeOffset = Math.max(0, Math.floor(offsetCount));
  const wibDate = getJakartaDateKey();
  const res = await dbQuery<{
    drama_id: string;
    provider: string;
    daily_views: string;
    total_views: string;
    likes_count: string;
    comments_count: string;
  }>(
    `SELECT drama_id, provider, daily_views::text, total_views::text, likes_count::text, comments_count::text
     FROM video_stats
     WHERE stat_date = $1::date AND episode_number = 0
     ORDER BY daily_views DESC, total_views DESC
     LIMIT $2 OFFSET $3`,
    [wibDate, safeLimit, safeOffset]
  );

  if (!res) return [];
  return res.rows.map((r) => ({
    dramaId: r.drama_id,
    provider: r.provider,
    dailyViews: Number(r.daily_views) || 0,
    totalViews: Number(r.total_views) || 0,
    likesCount: Number(r.likes_count) || 0,
    commentsCount: Number(r.comments_count) || 0,
  }));
}

export interface SiteVisitorStats {
  online: number;
  daily: number;
  total: number;
  onlineNow: number;
  todayVisitors: number;
  totalVisitors: number;
  totalViews: number;
  dayKey: string;
}

export const ACTIVE_VISITOR_TTL_SECONDS = 120;
let lastActiveSessionsPruneMs = 0;

function toSafeCount(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

export async function getSiteVisitorStatsFromDb(): Promise<SiteVisitorStats | null> {
  const wibDate = getJakartaDateKey();
  const [onlineRes, dailyRes, totalsRes] = await Promise.all([
    dbQuery<{ cnt: string }>(
      `SELECT COUNT(DISTINCT visitor_id)::text AS cnt
       FROM active_sessions
       WHERE last_seen >= NOW() - ($1 * INTERVAL '1 second')`,
      [ACTIVE_VISITOR_TTL_SECONDS]
    ),
    dbQuery<{ today_visitors: string }>(
      `SELECT COALESCE(today_visitors, 0)::text AS today_visitors
       FROM daily_site_stats
       WHERE stat_date = $1::date`,
      [wibDate]
    ),
    dbQuery<{ total_visitors: string; total_views: string }>(
      `SELECT total_visitors::text, total_views::text
       FROM site_counter_totals
       WHERE id = 1`
    ),
  ]);

  if (!onlineRes || !dailyRes || !totalsRes) return null;

  const onlineNow = toSafeCount(onlineRes.rows[0]?.cnt);
  const todayVisitors = toSafeCount(dailyRes.rows[0]?.today_visitors);
  const totalVisitors = toSafeCount(totalsRes.rows[0]?.total_visitors);
  const totalViews = toSafeCount(totalsRes.rows[0]?.total_views);

  return {
    online: onlineNow,
    daily: todayVisitors,
    total: totalVisitors,
    onlineNow,
    todayVisitors,
    totalVisitors,
    totalViews,
    dayKey: wibDate,
  };
}

export async function removeActiveVisitorSessionInDb(
  sessionId: string
): Promise<boolean> {
  const safeSession = sessionId.trim().slice(0, 128);
  if (!safeSession) return false;
  const res = await dbQuery(
    `DELETE FROM active_sessions WHERE session_id = $1`,
    [safeSession]
  );
  return Boolean(res);
}

export async function recordVisitorHeartbeatInDb(
  sessionId: string,
  visitorId: string,
  countSessionView = true
): Promise<SiteVisitorStats | null> {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

  const safeSession = sessionId.trim().slice(0, 128);
  const safeVisitor = visitorId.trim().slice(0, 128);
  if (!safeSession || !safeVisitor) return null;

  const wibDate = getJakartaDateKey();
  const nowMs = Date.now();
  const shouldPrune = nowMs - lastActiveSessionsPruneMs >= 30_000;

  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');

    // 1. Update live session heartbeat
    await client.query(
      `INSERT INTO active_sessions (session_id, visitor_id, last_seen)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         visitor_id = EXCLUDED.visitor_id,
         last_seen = NOW()`,
      [safeSession, safeVisitor]
    );

    if (shouldPrune) {
      lastActiveSessionsPruneMs = nowMs;
      await client.query(
        `DELETE FROM active_sessions WHERE last_seen < NOW() - ($1 * INTERVAL '1 second')`,
        [ACTIVE_VISITOR_TTL_SECONDS]
      );
    }

    // 2. Count unique visitor across all time (cumulative, never resets)
    const newKnownRes = await client.query(
      `INSERT INTO known_visitors (visitor_id, first_seen)
       VALUES ($1, NOW())
       ON CONFLICT (visitor_id) DO NOTHING
       RETURNING 1`,
      [safeVisitor]
    );
    const isNewAllTimeVisitor = newKnownRes.rows.length > 0 ? 1 : 0;

    // 3. Count unique daily visitor keyed by Asia/Jakarta date (resets at 00:00 WIB)
    const newDailyRes = await client.query(
      `INSERT INTO daily_visitors (stat_date, visitor_id, first_seen)
       VALUES ($1::date, $2, NOW())
       ON CONFLICT (stat_date, visitor_id) DO NOTHING
       RETURNING 1`,
      [wibDate, safeVisitor]
    );
    const isNewDailyVisitor = newDailyRes.rows.length > 0 ? 1 : 0;

    // 4. Count 1 page view per unique tab session (only when allowed by view cooldown)
    let isNewSessionView = 0;
    if (countSessionView) {
      const newSessionViewRes = await client.query(
        `INSERT INTO viewed_sessions (session_id, created_at)
         VALUES ($1, NOW())
         ON CONFLICT (session_id) DO NOTHING
         RETURNING 1`,
        [safeSession]
      );
      isNewSessionView = newSessionViewRes.rows.length > 0 ? 1 : 0;
    }

    // 5. Persist atomic updates into daily_site_stats (WIB day) and site_counter_totals (all-time)
    const dailyRes = await client.query<{ today_visitors: string }>(
      `INSERT INTO daily_site_stats (stat_date, today_visitors, total_views, updated_at)
       VALUES ($1::date, $2, $3, NOW())
       ON CONFLICT (stat_date) DO UPDATE SET
         today_visitors = GREATEST(0, daily_site_stats.today_visitors + $2),
         total_views = GREATEST(0, daily_site_stats.total_views + $3),
         updated_at = NOW()
       RETURNING today_visitors::text`,
      [wibDate, isNewDailyVisitor, isNewSessionView]
    );

    const totalsRes = await client.query<{
      total_visitors: string;
      total_views: string;
    }>(
      `INSERT INTO site_counter_totals (id, total_visitors, total_views, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         total_visitors = GREATEST(0, site_counter_totals.total_visitors + $1),
         total_views = GREATEST(0, site_counter_totals.total_views + $2),
         updated_at = NOW()
       RETURNING total_visitors::text, total_views::text`,
      [isNewAllTimeVisitor, isNewSessionView]
    );

    const onlineRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT visitor_id)::text AS cnt
       FROM active_sessions
       WHERE last_seen >= NOW() - ($1 * INTERVAL '1 second')`,
      [ACTIVE_VISITOR_TTL_SECONDS]
    );

    await client.query('COMMIT');

    const onlineNow = Math.max(1, toSafeCount(onlineRes.rows[0]?.cnt));
    const todayVisitors = toSafeCount(dailyRes.rows[0]?.today_visitors);
    const totalVisitors = toSafeCount(totalsRes.rows[0]?.total_visitors);
    const totalViews = toSafeCount(totalsRes.rows[0]?.total_views);

    return {
      online: onlineNow,
      daily: todayVisitors,
      total: totalVisitors,
      onlineNow,
      todayVisitors,
      totalVisitors,
      totalViews,
      dayKey: wibDate,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    if (isTransientPoolError(err)) {
      dbAvailable = false;
    }
    console.warn(
      '[PostgreSQL] Atomic visitor heartbeat transaction failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  } finally {
    try {
      client?.release();
    } catch {
      // Ignore release error
    }
  }
}

export async function listUserCommentsFromDb(
  userId: string,
  limitCount = 40,
  offsetCount = 0
): Promise<{ comments: DbCommentRecord[]; total: number }> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limitCount)));
  const safeOffset = Math.max(0, Math.floor(offsetCount));
  const res = await dbQuery<{
    id: string;
    drama_id: string;
    provider: string;
    episode_number: number;
    user_id: string | null;
    author_name: string;
    author_email: string | null;
    author_photo_url: string | null;
    author_badge: string | null;
    author_initials: string | null;
    author_color: string | null;
    content: string;
    video_timestamp_sec: number;
    created_at: Date;
    total_count: string;
  }>(
    `SELECT id, drama_id, provider, episode_number, user_id, author_name, author_email,
            author_photo_url, author_badge, author_initials, author_color, content,
            video_timestamp_sec, created_at,
            COUNT(*) OVER()::text AS total_count
     FROM comments
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, safeOffset]
  );

  if (!res || res.rows.length === 0) return { comments: [], total: 0 };
  const total = Number(res.rows[0].total_count) || res.rows.length;
  return {
    comments: res.rows.map((r) => ({
      id: r.id,
      dramaId: r.drama_id,
      provider: r.provider,
      episodeNumber: Number(r.episode_number) || 1,
      authorUid: r.user_id ?? undefined,
      author: r.author_name,
      authorEmail: r.author_email ?? undefined,
      authorPhotoURL: r.author_photo_url,
      authorBadge: r.author_badge ?? undefined,
      authorInitials: r.author_initials ?? undefined,
      authorColor: r.author_color ?? undefined,
      text: r.content,
      videoTimestampSec: Number(r.video_timestamp_sec) || 0,
      createdAt: r.created_at instanceof Date ? r.created_at.getTime() : Date.now(),
    })),
    total,
  };
}

// --- Watch History & Continue Watching Cloud Sync ---

export interface DbWatchHistoryRecord {
  bookId: string;
  provider: string;
  mediaType: 'drama' | 'movie';
  episode: number;
  currentTime: number;
  duration: number;
  progress: number;
  drama: Record<string, unknown>;
  updatedAt: number;
}

export async function listWatchHistoryFromDb(
  userId: string,
  limitCount = 24
): Promise<DbWatchHistoryRecord[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limitCount)));
  const res = await dbQuery<{
    drama_id: string;
    provider: string;
    media_type: string;
    episode_number: number;
    current_time_sec: number;
    duration_sec: number;
    progress_pct: number;
    drama_json: Record<string, unknown>;
    updated_at: Date;
  }>(
    `SELECT drama_id, provider, media_type, episode_number, current_time_sec, duration_sec, progress_pct, drama_json, updated_at
     FROM watch_history
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    bookId: r.drama_id,
    provider: r.provider,
    mediaType:
      r.media_type === 'movie' ||
      r.provider === 'LK21' ||
      r.provider === 'LookSeries'
        ? 'movie'
        : 'drama',
    episode: Number(r.episode_number) || 1,
    currentTime: Number(r.current_time_sec) || 0,
    duration: Number(r.duration_sec) || 0,
    progress: Number(r.progress_pct) || 0,
    drama: r.drama_json || {},
    updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
  }));
}

export async function upsertWatchHistoryInDb(input: {
  userId: string;
  dramaId: string;
  provider: string;
  mediaType?: 'drama' | 'movie';
  episodeNumber: number;
  currentTime: number;
  duration: number;
  progress: number;
  drama: Record<string, unknown>;
}): Promise<boolean> {
  const safeEp = Math.max(1, Math.floor(Number(input.episodeNumber) || 1));
  const safeTime = Math.max(0, Math.floor(Number(input.currentTime) || 0));
  const safeDuration = Math.max(0, Math.floor(Number(input.duration) || 0));
  const safeProgress = Math.min(100, Math.max(0, Math.floor(Number(input.progress) || 0)));
  const mediaType =
    input.mediaType === 'movie' ||
    input.provider === 'LK21' ||
    input.provider === 'LookSeries'
      ? 'movie'
      : 'drama';

  const res = await dbQuery(
    `INSERT INTO watch_history (
       user_id, drama_id, provider, media_type, episode_number, current_time_sec, duration_sec, progress_pct, drama_json, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
     ON CONFLICT (user_id, drama_id, provider) DO UPDATE SET
       media_type = EXCLUDED.media_type,
       episode_number = EXCLUDED.episode_number,
       current_time_sec = CASE
         WHEN EXCLUDED.current_time_sec > 0 OR EXCLUDED.episode_number <> watch_history.episode_number
         THEN EXCLUDED.current_time_sec
         ELSE watch_history.current_time_sec
       END,
       duration_sec = CASE WHEN EXCLUDED.duration_sec > 0 THEN EXCLUDED.duration_sec ELSE watch_history.duration_sec END,
       progress_pct = EXCLUDED.progress_pct,
       drama_json = CASE WHEN EXCLUDED.drama_json <> '{}'::jsonb THEN EXCLUDED.drama_json ELSE watch_history.drama_json END,
       updated_at = NOW()`,
    [
      input.userId.slice(0, 128),
      input.dramaId.slice(0, 128),
      input.provider.slice(0, 64),
      mediaType,
      safeEp,
      safeTime,
      safeDuration,
      safeProgress,
      JSON.stringify(input.drama || {}),
    ]
  );
  return Boolean(res);
}

export async function deleteWatchHistoryInDb(
  userId: string,
  dramaId: string,
  provider?: string
): Promise<boolean> {
  if (provider) {
    const res = await dbQuery(
      `DELETE FROM watch_history WHERE user_id = $1 AND drama_id = $2 AND provider = $3`,
      [userId, dramaId, provider]
    );
    return Boolean(res);
  }
  const res = await dbQuery(
    `DELETE FROM watch_history WHERE user_id = $1 AND drama_id = $2`,
    [userId, dramaId]
  );
  return Boolean(res);
}

// --- Indexed Drama Catalog & SEO Slug Resolution ---

export interface CatalogUpsertItem {
  dramaId: string;
  provider: string;
  slug: string;
  title: string;
  description: string;
  cover: string;
  chapterCount: number;
  genres: string[];
  status: 'Ongoing' | 'Completed';
  popularityScore: number;
  rating: number;
  playCount?: string;
  isVip: boolean;
  dramaJson: Record<string, unknown>;
}

export interface CatalogChangeNotification {
  dramaId: string;
  provider: string;
  slug: string;
  chapterCount: number;
  reason: 'new_drama' | 'new_episode';
}

export async function upsertDramaCatalogBatchInDb(
  items: CatalogUpsertItem[]
): Promise<CatalogChangeNotification[]> {
  const activePool = getPool();
  if (!activePool || items.length === 0) return [];
  await ensureDatabaseReady();
  if (!dbAvailable) return [];

  const notifications: CatalogChangeNotification[] = [];

  for (const item of items) {
    if (!item.dramaId || !item.title || !item.slug) continue;
    try {
      const prevRes = await activePool.query<{
        chapter_count: number;
        slug: string;
      }>(
        `SELECT chapter_count, slug FROM drama_catalog WHERE drama_id = $1 AND provider = $2 LIMIT 1`,
        [item.dramaId, item.provider]
      );
      const prevRow = prevRes.rows[0];

      // Reserve collision-free slug if same slug belongs to a different (drama_id, provider)
      let candidateSlug = (prevRow?.slug || item.slug).slice(0, 110);
      const conflictCheck = await activePool.query<{ drama_id: string; provider: string }>(
        `SELECT drama_id, provider FROM drama_catalog WHERE LOWER(slug) = $1 LIMIT 1`,
        [candidateSlug]
      );
      const existingOwner = conflictCheck.rows[0];
      if (
        existingOwner &&
        (existingOwner.drama_id !== item.dramaId || existingOwner.provider !== item.provider)
      ) {
        const suffix = `${item.provider.toLowerCase().slice(0, 4)}-${item.dramaId.slice(-4)}`.replace(/[^a-z0-9-]/g, '');
        candidateSlug = `${candidateSlug.slice(0, 90)}-${suffix}`;
      }

      const nextChapterCount = Math.max(1, item.chapterCount);
      const dramaWithSlug = {
        ...item.dramaJson,
        slug: candidateSlug,
        status: item.status,
        rating: item.rating,
      };

      const upsertRes = await activePool.query<{
        slug: string;
        chapter_count: number;
        was_inserted: boolean;
      }>(
        `INSERT INTO drama_catalog (
           drama_id, provider, slug, title, description, cover, chapter_count,
           genres, status, popularity_score, rating, play_count, is_vip, drama_json, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14::jsonb, NOW())
         ON CONFLICT (drama_id, provider) DO UPDATE SET
           slug = COALESCE(NULLIF(drama_catalog.slug, ''), EXCLUDED.slug),
           title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE drama_catalog.title END,
           description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE drama_catalog.description END,
           cover = CASE WHEN EXCLUDED.cover <> '' THEN EXCLUDED.cover ELSE drama_catalog.cover END,
           chapter_count = GREATEST(drama_catalog.chapter_count, EXCLUDED.chapter_count),
           genres = CASE WHEN cardinality(EXCLUDED.genres) > 0 THEN EXCLUDED.genres ELSE drama_catalog.genres END,
           status = EXCLUDED.status,
           popularity_score = GREATEST(drama_catalog.popularity_score, EXCLUDED.popularity_score),
           rating = EXCLUDED.rating,
           play_count = COALESCE(EXCLUDED.play_count, drama_catalog.play_count),
           is_vip = EXCLUDED.is_vip,
           drama_json = jsonb_set(
             EXCLUDED.drama_json,
             '{slug}',
             to_jsonb(COALESCE(NULLIF(drama_catalog.slug, ''), EXCLUDED.slug)),
             true
           ),
           updated_at = NOW()
         RETURNING slug, chapter_count, (xmax = 0) AS was_inserted`,
        [
          item.dramaId,
          item.provider,
          candidateSlug,
          item.title.slice(0, 240),
          item.description.slice(0, 1200),
          item.cover.slice(0, 1000),
          nextChapterCount,
          item.genres,
          item.status,
          Math.max(0, Math.floor(item.popularityScore)),
          Math.min(5, Math.max(3.5, Number(item.rating) || 4.8)),
          item.playCount ? item.playCount.slice(0, 64) : null,
          item.isVip,
          JSON.stringify(dramaWithSlug),
        ]
      );

      const savedRow = upsertRes.rows[0];
      if (savedRow) {
        if (savedRow.was_inserted || !prevRow) {
          notifications.push({
            dramaId: item.dramaId,
            provider: item.provider,
            slug: savedRow.slug,
            chapterCount: Number(savedRow.chapter_count) || nextChapterCount,
            reason: 'new_drama',
          });
        } else if (
          prevRow &&
          Number(savedRow.chapter_count) > Number(prevRow.chapter_count)
        ) {
          notifications.push({
            dramaId: item.dramaId,
            provider: item.provider,
            slug: savedRow.slug,
            chapterCount: Number(savedRow.chapter_count),
            reason: 'new_episode',
          });
        }
      }
    } catch {
      // Skip duplicate slug race cleanly
    }
  }

  return notifications;
}

export async function resolveDramaBySlugFromDb(
  slug: string,
  provider?: string
): Promise<{
  dramaId: string;
  provider: string;
  slug: string;
  drama: Record<string, unknown>;
} | null> {
  const clean = slug.trim().toLowerCase();
  const rawTrimmed = slug.trim();
  const cleanProvider = (provider || '').trim();
  if (!clean) return null;

  const isValidCatalogRow = (row: {
    drama_id: string;
    provider: string;
    slug: string;
    drama_json: Record<string, unknown>;
  } | undefined): boolean => {
    if (!row || !row.drama_id || !row.slug) return false;
    const provUpper = String(row.provider || '').toUpperCase();
    if (provUpper === 'LK21' || provUpper === 'LOOKSERIES') return false;
    const json = row.drama_json || {};
    const title = String(
      json.title ?? json.bookName ?? json.name ?? json.dramaName ?? ''
    ).trim();
    return Boolean(title);
  };

  const exactRes = await dbQuery<{
    drama_id: string;
    provider: string;
    slug: string;
    drama_json: Record<string, unknown>;
  }>(
    cleanProvider
      ? `SELECT drama_id, provider, slug, drama_json
         FROM drama_catalog
         WHERE (LOWER(slug) = $1 OR drama_id = $2)
           AND UPPER(provider) NOT IN ('LK21', 'LOOKSERIES')
           AND COALESCE(TRIM(title), '') <> ''
         ORDER BY CASE WHEN LOWER(provider) = LOWER($3) THEN 0 ELSE 1 END, popularity_score DESC
         LIMIT 1`
      : `SELECT drama_id, provider, slug, drama_json
         FROM drama_catalog
         WHERE (LOWER(slug) = $1 OR drama_id = $2)
           AND UPPER(provider) NOT IN ('LK21', 'LOOKSERIES')
           AND COALESCE(TRIM(title), '') <> ''
         ORDER BY popularity_score DESC
         LIMIT 1`,
    cleanProvider ? [clean, rawTrimmed, cleanProvider] : [clean, rawTrimmed]
  );
  const row = exactRes?.rows[0];
  if (isValidCatalogRow(row)) {
    return {
      dramaId: row!.drama_id,
      provider: row!.provider,
      slug: row!.slug,
      drama: row!.drama_json || {},
    };
  }

  // Only allow strict hyphen-boundary prefix fallback for meaningful slug lengths
  // so short slugs like "12-ipa-4" never falsely match unrelated prefixes.
  if (clean.length < 6) return null;
  const escapedClean = clean.slice(0, 48).replace(/[%_\\]/g, '\\$&');
  const prefixRes = await dbQuery<{
    drama_id: string;
    provider: string;
    slug: string;
    drama_json: Record<string, unknown>;
  }>(
    `SELECT drama_id, provider, slug, drama_json
     FROM drama_catalog
     WHERE LOWER(slug) LIKE $1 ESCAPE '\\'
       AND UPPER(provider) NOT IN ('LK21', 'LOOKSERIES')
       AND COALESCE(TRIM(title), '') <> ''
     ORDER BY popularity_score DESC
     LIMIT 1`,
    [`${escapedClean}-%`]
  );
  const pRow = prefixRes?.rows[0];
  if (!isValidCatalogRow(pRow)) return null;
  return {
    dramaId: pRow!.drama_id,
    provider: pRow!.provider,
    slug: pRow!.slug,
    drama: pRow!.drama_json || {},
  };
}

export async function filterCatalogFromDb(input: {
  genre?: string;
  status?: string;
  sort?: string;
  provider?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<Record<string, unknown>>;
  total: number;
}> {
  const conditions: string[] = [
    `UPPER(provider) NOT IN ('LK21', 'LOOKSERIES')`,
  ];
  const params: unknown[] = [];

  if (input.provider && input.provider !== 'All') {
    params.push(input.provider);
    conditions.push(`LOWER(provider) = LOWER($${params.length})`);
  }

  if (input.status && input.status !== 'all') {
    params.push(input.status);
    conditions.push(`LOWER(status) = LOWER($${params.length})`);
  }

  if (input.genre && input.genre !== 'All' && input.genre !== 'all') {
    const gPattern = `%${input.genre.trim()}%`;
    params.push(gPattern);
    const idx = params.length;
    conditions.push(
      `(EXISTS (SELECT 1 FROM unnest(genres) AS g WHERE g ILIKE $${idx}) OR title ILIKE $${idx} OR description ILIKE $${idx})`
    );
  }

  if (input.q && input.q.trim()) {
    const qPattern = `%${input.q.trim()}%`;
    params.push(qPattern);
    const idx = params.length;
    conditions.push(
      `(title ILIKE $${idx} OR description ILIKE $${idx} OR EXISTS (SELECT 1 FROM unnest(genres) AS g WHERE g ILIKE $${idx}))`
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orderBy =
    input.sort === 'rating'
      ? 'ORDER BY rating DESC, popularity_score DESC, updated_at DESC'
      : input.sort === 'newest'
      ? 'ORDER BY updated_at DESC, popularity_score DESC'
      : 'ORDER BY popularity_score DESC, rating DESC, updated_at DESC';

  const safeLimit = Math.min(60, Math.max(1, Math.floor(input.limit || 24)));
  const safeOffset = Math.max(0, Math.floor(input.offset || 0));

  params.push(safeLimit);
  const limitIdx = params.length;
  params.push(safeOffset);
  const offsetIdx = params.length;

  const res = await dbQuery<{
    drama_json: Record<string, unknown>;
    slug: string;
    status: string;
    rating: string | number;
    total_count: string;
  }>(
    `SELECT drama_json, slug, status, rating, COUNT(*) OVER()::text AS total_count
     FROM drama_catalog
     ${whereClause}
     ${orderBy}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  if (!res || res.rows.length === 0) {
    return { items: [], total: 0 };
  }

  const total = Number(res.rows[0].total_count) || res.rows.length;
  return {
    items: res.rows.map((r) => ({
      ...(r.drama_json || {}),
      slug: r.slug,
      status: r.status,
      rating: Number(r.rating) || 4.8,
    })),
    total,
  };
}

export async function listCatalogForSitemapFromDb(limit = 2000): Promise<
  Array<{
    slug: string;
    dramaId: string;
    provider: string;
    title: string;
    description: string;
    cover: string;
    chapterCount: number;
    genres: string[];
    updatedAt: number;
  }>
> {
  const safeLimit = Math.min(250000, Math.max(1, Math.floor(limit)));
  const res = await dbQuery<{
    slug: string;
    drama_id: string;
    provider: string;
    title: string;
    description: string;
    cover: string;
    chapter_count: number;
    genres: string[];
    updated_at: Date;
  }>(
    `SELECT slug, drama_id, provider, title, description, cover, chapter_count, genres, updated_at
     FROM drama_catalog
     WHERE UPPER(provider) NOT IN ('LK21', 'LOOKSERIES')
       AND COALESCE(TRIM(slug), '') <> ''
       AND COALESCE(TRIM(drama_id), '') <> ''
       AND COALESCE(TRIM(title), '') <> ''
       AND COALESCE(chapter_count, 0) >= 1
       AND (COALESCE(TRIM(cover), '') <> '' OR COALESCE(TRIM(description), '') <> '')
     ORDER BY popularity_score DESC, updated_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  if (!res) return [];
  const invalidSlugs = new Set(['watch-drama', 'series', 'drama', 'short-drama', 'unknown', 'null', 'undefined']);
  return res.rows
    .filter((r) => {
      const s = String(r.slug || '').trim().toLowerCase();
      const t = String(r.title || '').trim();
      return Boolean(s && t && !invalidSlugs.has(s));
    })
    .map((r) => ({
      slug: r.slug,
      dramaId: r.drama_id,
      provider: r.provider,
      title: r.title,
      description: r.description || '',
      cover: r.cover || '',
      chapterCount: Number(r.chapter_count) || 1,
      genres: Array.isArray(r.genres) ? r.genres : [],
      updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
    }));
}

// --- Real-Time Trending & Hot Today Badge Stats (from video_stats) ---

export interface LiveDramaBadgeStat {
  dailyViews: number;
  totalViews: number;
  likesCount: number;
  commentsCount: number;
  trendBadge?: 'HOT' | 'TRENDING';
}

export async function getTrendingStatsMapFromDb(
  limit = 200
): Promise<Record<string, LiveDramaBadgeStat>> {
  const wibDate = getJakartaDateKey();
  const res = await dbQuery<{
    drama_id: string;
    provider: string;
    daily_views: string;
    total_views: string;
    likes_count: string;
    comments_count: string;
  }>(
    `SELECT
       drama_id,
       provider,
       COALESCE(SUM(CASE WHEN stat_date = $2::date THEN daily_views ELSE 0 END), 0)::text AS daily_views,
       COALESCE(SUM(total_views), 0)::text AS total_views,
       COALESCE(MAX(likes_count), 0)::text AS likes_count,
       COALESCE(SUM(comments_count), 0)::text AS comments_count
     FROM video_stats
     WHERE episode_number = 0
     GROUP BY drama_id, provider
     HAVING COALESCE(SUM(total_views), 0) > 0
        OR COALESCE(SUM(CASE WHEN stat_date = $2::date THEN daily_views ELSE 0 END), 0) > 0
        OR COALESCE(MAX(likes_count), 0) > 0
     ORDER BY
       COALESCE(SUM(CASE WHEN stat_date = $2::date THEN daily_views ELSE 0 END), 0) DESC,
       COALESCE(SUM(total_views), 0) DESC
     LIMIT $1`,
    [Math.min(500, Math.max(10, limit)), wibDate]
  );

  const map: Record<string, LiveDramaBadgeStat> = {};
  if (!res || res.rows.length === 0) return map;

  res.rows.forEach((row, index) => {
    const dailyViews = Number(row.daily_views) || 0;
    const totalViews = Number(row.total_views) || 0;
    const likesCount = Number(row.likes_count) || 0;
    const commentsCount = Number(row.comments_count) || 0;
    const key = `${row.provider}:${row.drama_id}`;

    let trendBadge: 'HOT' | 'TRENDING' | undefined;
    if (dailyViews > 0 && index < 12) {
      trendBadge = 'HOT';
    } else if (totalViews > 0 && index < 36) {
      trendBadge = 'TRENDING';
    }

    map[key] = {
      dailyViews,
      totalViews,
      likesCount,
      commentsCount,
      trendBadge,
    };
  });

  return map;
}

export async function updateCatalogEpisodeCountIfHigherInDb(
  dramaId: string,
  provider: string,
  episodeCount: number
): Promise<{ slug: string; chapterCount: number; increased: boolean } | null> {
  const safeEp = Math.max(1, Math.floor(episodeCount));
  const prevRes = await dbQuery<{ slug: string; chapter_count: number }>(
    `SELECT slug, chapter_count FROM drama_catalog WHERE drama_id = $1 AND provider = $2 LIMIT 1`,
    [dramaId, provider]
  );
  const prev = prevRes?.rows[0];
  if (!prev) return null;
  if (safeEp <= Number(prev.chapter_count)) {
    return {
      slug: prev.slug,
      chapterCount: Number(prev.chapter_count),
      increased: false,
    };
  }
  await dbQuery(
    `UPDATE drama_catalog
     SET chapter_count = $3,
         drama_json = jsonb_set(drama_json, '{chapterCount}', to_jsonb($3::int), true),
         updated_at = NOW()
     WHERE drama_id = $1 AND provider = $2`,
    [dramaId, provider, safeEp]
  );
  return { slug: prev.slug, chapterCount: safeEp, increased: true };
}

// --- Google Indexing API Audit & Deduplication Log ---

export async function getRecentlyPingedUrlsFromDb(
  urls: string[],
  windowMs: number
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!urls || urls.length === 0) return out;
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();
  const res = await dbQuery<{ url: string; last_pinged_at: Date }>(
    `SELECT url, last_pinged_at
     FROM seo_indexing_log
     WHERE url = ANY($1::text[])
       AND status = 'submitted'
       AND last_pinged_at >= $2::timestamptz`,
    [urls, cutoffIso]
  );
  if (!res) return out;
  for (const row of res.rows) {
    out.set(
      row.url,
      row.last_pinged_at instanceof Date ? row.last_pinged_at.getTime() : Date.now()
    );
  }
  return out;
}

export async function upsertSeoIndexingLogInDb(input: {
  url: string;
  entityType: string;
  entityId: string;
  provider: string;
  action: string;
  status: string;
  responseCode: number;
  responseBody: string;
}): Promise<void> {
  await dbQuery(
    `INSERT INTO seo_indexing_log (
       url, entity_type, entity_id, provider, action, status, response_code, response_body, last_pinged_at, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (url) DO UPDATE SET
       entity_type = EXCLUDED.entity_type,
       entity_id = EXCLUDED.entity_id,
       provider = EXCLUDED.provider,
       action = EXCLUDED.action,
       status = EXCLUDED.status,
       response_code = EXCLUDED.response_code,
       response_body = EXCLUDED.response_body,
       last_pinged_at = NOW()`,
    [
      input.url.slice(0, 1000),
      input.entityType.slice(0, 32),
      input.entityId.slice(0, 128),
      input.provider.slice(0, 64),
      input.action.slice(0, 32),
      input.status.slice(0, 32),
      Math.floor(input.responseCode || 0),
      input.responseBody.slice(0, 800),
    ]
  ).catch(() => {});
}

export async function getSeoIndexingSummaryFromDb(limit = 25): Promise<{
  counts: { submitted: number; queued: number; error: number; total: number };
  recentLogs: Array<{
    url: string;
    entityType: string;
    entityId: string;
    provider: string;
    status: string;
    responseCode: number;
    responseBody: string;
    lastPingedAt: number;
  }>;
}> {
  const [countsRes, logsRes] = await Promise.all([
    dbQuery<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*)::text AS cnt FROM seo_indexing_log GROUP BY status`
    ),
    dbQuery<{
      url: string;
      entity_type: string;
      entity_id: string;
      provider: string;
      status: string;
      response_code: number;
      response_body: string;
      last_pinged_at: Date;
    }>(
      `SELECT url, entity_type, entity_id, provider, status, response_code, response_body, last_pinged_at
       FROM seo_indexing_log
       ORDER BY last_pinged_at DESC
       LIMIT $1`,
      [Math.min(100, Math.max(1, limit))]
    ),
  ]);

  let submitted = 0;
  let queued = 0;
  let error = 0;
  for (const row of countsRes?.rows ?? []) {
    const c = Number(row.cnt) || 0;
    if (row.status === 'submitted') submitted += c;
    else if (row.status === 'error') error += c;
    else queued += c;
  }

  return {
    counts: {
      submitted,
      queued,
      error,
      total: submitted + queued + error,
    },
    recentLogs: (logsRes?.rows ?? []).map((r) => ({
      url: r.url,
      entityType: r.entity_type,
      entityId: r.entity_id,
      provider: r.provider,
      status: r.status,
      responseCode: Number(r.response_code) || 0,
      responseBody: r.response_body,
      lastPingedAt:
        r.last_pinged_at instanceof Date ? r.last_pinged_at.getTime() : Date.now(),
    })),
  };
}

// --- LK21 Dedicated Movies Database Layer (PostgreSQL) ---

export interface MovieUpsertInput {
  slug: string;
  movieId: string;
  title: string;
  cover?: string;
  coverHz?: string;
  poster?: string;
  synopsis?: string;
  year?: string;
  area?: string;
  director?: string;
  actors?: string[];
  genres?: string[];
  rating?: string;
  quality?: string;
  badge?: string;
  movieType?: string;
  updateInfo?: string;
  providers?: Array<{ name: string; url: string }>;
  recommendations?: Array<Record<string, unknown>>;
  movieJson?: Record<string, unknown>;
  popularityScore?: number;
}

export interface MovieEpisodeUpsertInput {
  slug: string;
  episodeNumber: number;
  vid: string;
  title: string;
  episodeLabel: string;
  streamUrl?: string;
  rawUrl?: string;
  streamType?: string;
  subtitles?: Array<Record<string, unknown>>;
  episodeJson?: Record<string, unknown>;
}

export async function getLk21CacheFromDb(cacheKey: string): Promise<{
  payload: unknown;
  updatedAt: number;
  expiresAt: number;
} | null> {
  const res = await dbQuery<{
    payload_json: unknown;
    updated_at: string | number;
    expires_at: string | number;
  }>(
    `SELECT payload_json, updated_at, expires_at
     FROM lk21_cache
     WHERE cache_key = $1
     LIMIT 1`,
    [cacheKey]
  );
  const row = res?.rows[0];
  if (!row || row.payload_json === undefined || row.payload_json === null) {
    return null;
  }
  const payload =
    typeof row.payload_json === 'string'
      ? JSON.parse(row.payload_json)
      : row.payload_json;
  return {
    payload,
    updatedAt: Number(row.updated_at) || Date.now(),
    expiresAt: Number(row.expires_at) || 0,
  };
}

export async function setLk21CacheInDb(
  cacheKey: string,
  endpoint: string,
  payload: unknown,
  ttlMs: number
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  await dbQuery(
    `INSERT INTO lk21_cache (cache_key, endpoint, payload_json, updated_at, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (cache_key) DO UPDATE SET
       endpoint = EXCLUDED.endpoint,
       payload_json = EXCLUDED.payload_json,
       updated_at = EXCLUDED.updated_at,
       expires_at = EXCLUDED.expires_at`,
    [cacheKey.slice(0, 256), endpoint.slice(0, 64), JSON.stringify(payload), now, expiresAt]
  ).catch(() => {});
}

export async function upsertMoviesBatchInDb(
  items: MovieUpsertInput[]
): Promise<Array<{ slug: string; title: string; movieId: string }>> {
  if (!items || items.length === 0) return [];
  const activePool = getPool();
  if (!activePool) return [];
  await ensureDatabaseReady();
  if (!dbAvailable) return [];

  const newlyInserted: Array<{ slug: string; title: string; movieId: string }> = [];

  for (const item of items) {
    const cleanSlug = (item.slug || '').trim().toLowerCase().slice(0, 180);
    if (!cleanSlug || !item.title) continue;
    try {
      const existing = await activePool.query<{ slug: string }>(
        `SELECT slug FROM movies WHERE slug = $1 LIMIT 1`,
        [cleanSlug]
      );
      const isNew = existing.rows.length === 0;

      await activePool.query(
        `INSERT INTO movies (
           slug, movie_id, title, cover, cover_hz, poster, synopsis, year, area, director,
           actors, genres, rating, quality, badge, movie_type, update_info,
           providers_json, recommendations_json, movie_json, popularity_score, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11::text[], $12::text[], $13, $14, $15, $16, $17,
           $18::jsonb, $19::jsonb, $20::jsonb, $21, NOW()
         )
         ON CONFLICT (slug) DO UPDATE SET
           movie_id = COALESCE(NULLIF(EXCLUDED.movie_id, ''), movies.movie_id),
           title = COALESCE(NULLIF(EXCLUDED.title, ''), movies.title),
           cover = CASE WHEN EXCLUDED.cover <> '' THEN EXCLUDED.cover ELSE movies.cover END,
           cover_hz = CASE WHEN EXCLUDED.cover_hz <> '' THEN EXCLUDED.cover_hz ELSE movies.cover_hz END,
           poster = CASE WHEN EXCLUDED.poster <> '' THEN EXCLUDED.poster ELSE movies.poster END,
           synopsis = CASE WHEN EXCLUDED.synopsis <> '' THEN EXCLUDED.synopsis ELSE movies.synopsis END,
           year = CASE WHEN EXCLUDED.year <> '' THEN EXCLUDED.year ELSE movies.year END,
           area = CASE WHEN EXCLUDED.area <> '' THEN EXCLUDED.area ELSE movies.area END,
           director = CASE WHEN EXCLUDED.director <> '' THEN EXCLUDED.director ELSE movies.director END,
           actors = CASE WHEN array_length(EXCLUDED.actors, 1) > 0 THEN EXCLUDED.actors ELSE movies.actors END,
           genres = CASE WHEN array_length(EXCLUDED.genres, 1) > 0 THEN EXCLUDED.genres ELSE movies.genres END,
           rating = CASE WHEN EXCLUDED.rating <> '' THEN EXCLUDED.rating ELSE movies.rating END,
           quality = CASE WHEN EXCLUDED.quality <> '' THEN EXCLUDED.quality ELSE movies.quality END,
           badge = CASE WHEN EXCLUDED.badge <> '' THEN EXCLUDED.badge ELSE movies.badge END,
           movie_type = CASE WHEN EXCLUDED.movie_type <> '' THEN EXCLUDED.movie_type ELSE movies.movie_type END,
           update_info = CASE WHEN EXCLUDED.update_info <> '' THEN EXCLUDED.update_info ELSE movies.update_info END,
           providers_json = CASE WHEN EXCLUDED.providers_json <> '[]'::jsonb THEN EXCLUDED.providers_json ELSE movies.providers_json END,
           recommendations_json = CASE WHEN EXCLUDED.recommendations_json <> '[]'::jsonb THEN EXCLUDED.recommendations_json ELSE movies.recommendations_json END,
           movie_json = movies.movie_json || EXCLUDED.movie_json,
           popularity_score = GREATEST(movies.popularity_score, EXCLUDED.popularity_score),
           updated_at = NOW()`,
        [
          cleanSlug,
          (item.movieId || cleanSlug).slice(0, 180),
          item.title.slice(0, 240),
          (item.cover || '').slice(0, 1000),
          (item.coverHz || item.cover || '').slice(0, 1000),
          (item.poster || item.cover || '').slice(0, 1000),
          (item.synopsis || '').slice(0, 4000),
          (item.year || '').slice(0, 16),
          (item.area || '').slice(0, 120),
          (item.director || '').slice(0, 240),
          (item.actors || []).slice(0, 24),
          (item.genres || []).slice(0, 12),
          (item.rating || '').slice(0, 16),
          (item.quality || '').slice(0, 48),
          (item.badge || '').slice(0, 48),
          (item.movieType || 'movie').slice(0, 32),
          (item.updateInfo || '').slice(0, 160),
          JSON.stringify(item.providers || []),
          JSON.stringify(item.recommendations || []),
          JSON.stringify(item.movieJson || {}),
          Math.max(0, Math.floor(item.popularityScore || 0)),
        ]
      );

      if (isNew) {
        newlyInserted.push({
          slug: cleanSlug,
          title: item.title,
          movieId: item.movieId || cleanSlug,
        });
      }
    } catch {
      // Skip malformed row gracefully
    }
  }

  return newlyInserted;
}

export async function getMovieBySlugFromDb(slug: string): Promise<{
  slug: string;
  movieId: string;
  title: string;
  cover: string;
  coverHz: string;
  poster: string;
  synopsis: string;
  year: string;
  area: string;
  director: string;
  actors: string[];
  genres: string[];
  rating: string;
  quality: string;
  badge: string;
  movieType: string;
  updateInfo: string;
  providers: Array<{ name: string; url: string }>;
  recommendations: Array<Record<string, unknown>>;
  movieJson: Record<string, unknown>;
  updatedAt: number;
} | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  const res = await dbQuery<{
    slug: string;
    movie_id: string;
    title: string;
    cover: string;
    cover_hz: string;
    poster: string;
    synopsis: string;
    year: string;
    area: string;
    director: string;
    actors: string[];
    genres: string[];
    rating: string;
    quality: string;
    badge: string;
    movie_type: string;
    update_info: string;
    providers_json: Array<{ name: string; url: string }>;
    recommendations_json: Array<Record<string, unknown>>;
    movie_json: Record<string, unknown>;
    updated_at: Date;
  }>(
    `SELECT slug, movie_id, title, cover, cover_hz, poster, synopsis, year, area, director,
            actors, genres, rating, quality, badge, movie_type, update_info,
            providers_json, recommendations_json, movie_json, updated_at
     FROM movies
     WHERE slug = $1
     LIMIT 1`,
    [clean]
  );
  const row = res?.rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    movieId: row.movie_id,
    title: row.title,
    cover: row.cover,
    coverHz: row.cover_hz,
    poster: row.poster,
    synopsis: row.synopsis,
    year: row.year,
    area: row.area,
    director: row.director,
    actors: Array.isArray(row.actors) ? row.actors : [],
    genres: Array.isArray(row.genres) ? row.genres : [],
    rating: row.rating,
    quality: row.quality,
    badge: row.badge,
    movieType: row.movie_type,
    updateInfo: row.update_info,
    providers: Array.isArray(row.providers_json) ? row.providers_json : [],
    recommendations: Array.isArray(row.recommendations_json)
      ? row.recommendations_json
      : [],
    movieJson: row.movie_json || {},
    updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  };
}

export async function upsertMovieEpisodesInDb(
  episodes: MovieEpisodeUpsertInput[]
): Promise<void> {
  if (!episodes || episodes.length === 0) return;
  for (const ep of episodes) {
    const cleanSlug = (ep.slug || '').trim().toLowerCase().slice(0, 180);
    const epNum = Math.max(1, Math.floor(ep.episodeNumber || 1));
    if (!cleanSlug) continue;
    await dbQuery(
      `INSERT INTO movie_episodes (
         slug, episode_number, vid, title, episode_label, stream_url, raw_url, stream_type, subtitles_json, episode_json, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, NOW())
       ON CONFLICT (slug, episode_number) DO UPDATE SET
         vid = CASE WHEN EXCLUDED.vid <> '' THEN EXCLUDED.vid ELSE movie_episodes.vid END,
         title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE movie_episodes.title END,
         episode_label = CASE WHEN EXCLUDED.episode_label <> '' THEN EXCLUDED.episode_label ELSE movie_episodes.episode_label END,
         stream_url = CASE WHEN EXCLUDED.stream_url <> '' THEN EXCLUDED.stream_url ELSE movie_episodes.stream_url END,
         raw_url = CASE WHEN EXCLUDED.raw_url <> '' THEN EXCLUDED.raw_url ELSE movie_episodes.raw_url END,
         stream_type = CASE WHEN EXCLUDED.stream_type <> '' THEN EXCLUDED.stream_type ELSE movie_episodes.stream_type END,
         subtitles_json = CASE WHEN EXCLUDED.subtitles_json <> '[]'::jsonb THEN EXCLUDED.subtitles_json ELSE movie_episodes.subtitles_json END,
         episode_json = movie_episodes.episode_json || EXCLUDED.episode_json,
         updated_at = NOW()`,
      [
        cleanSlug,
        epNum,
        (ep.vid || cleanSlug).slice(0, 240),
        (ep.title || '').slice(0, 240),
        (ep.episodeLabel || `EP ${epNum}`).slice(0, 64),
        (ep.streamUrl || '').slice(0, 1500),
        (ep.rawUrl || '').slice(0, 1500),
        (ep.streamType || 'hls').slice(0, 32),
        JSON.stringify(ep.subtitles || []),
        JSON.stringify(ep.episodeJson || {}),
      ]
    ).catch(() => {});
  }
}

export async function getMovieEpisodesFromDb(slug: string): Promise<
  Array<{
    slug: string;
    episodeNumber: number;
    vid: string;
    title: string;
    episodeLabel: string;
    streamUrl: string;
    rawUrl: string;
    streamType: string;
    subtitles: Array<Record<string, unknown>>;
    updatedAt: number;
  }>
> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return [];
  const res = await dbQuery<{
    slug: string;
    episode_number: number;
    vid: string;
    title: string;
    episode_label: string;
    stream_url: string;
    raw_url: string;
    stream_type: string;
    subtitles_json: Array<Record<string, unknown>>;
    updated_at: Date;
  }>(
    `SELECT slug, episode_number, vid, title, episode_label, stream_url, raw_url, stream_type, subtitles_json, updated_at
     FROM movie_episodes
     WHERE slug = $1
     ORDER BY episode_number ASC`,
    [clean]
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    slug: r.slug,
    episodeNumber: Number(r.episode_number) || 1,
    vid: r.vid,
    title: r.title,
    episodeLabel: r.episode_label,
    streamUrl: r.stream_url,
    rawUrl: r.raw_url,
    streamType: r.stream_type || 'hls',
    subtitles: Array.isArray(r.subtitles_json) ? r.subtitles_json : [],
    updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
  }));
}

export async function findMovieEpisodeByVidOrSlugFromDb(
  vidOrSlug: string
): Promise<{
  slug: string;
  episodeNumber: number;
  vid: string;
  title: string;
  streamUrl: string;
  rawUrl: string;
  streamType: string;
  subtitles: Array<Record<string, unknown>>;
  updatedAt: number;
} | null> {
  const clean = vidOrSlug.trim().toLowerCase();
  if (!clean) return null;
  const res = await dbQuery<{
    slug: string;
    episode_number: number;
    vid: string;
    title: string;
    stream_url: string;
    raw_url: string;
    stream_type: string;
    subtitles_json: Array<Record<string, unknown>>;
    updated_at: Date;
  }>(
    `SELECT slug, episode_number, vid, title, stream_url, raw_url, stream_type, subtitles_json, updated_at
     FROM movie_episodes
     WHERE LOWER(vid) = $1 OR (slug = $1 AND episode_number = 1)
     LIMIT 1`,
    [clean]
  );
  const r = res?.rows[0];
  if (!r) return null;
  return {
    slug: r.slug,
    episodeNumber: Number(r.episode_number) || 1,
    vid: r.vid,
    title: r.title,
    streamUrl: r.stream_url,
    rawUrl: r.raw_url,
    streamType: r.stream_type || 'hls',
    subtitles: Array.isArray(r.subtitles_json) ? r.subtitles_json : [],
    updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
  };
}

export async function listMoviesForSitemapFromDb(limit = 2000): Promise<
  Array<{
    slug: string;
    title: string;
    description: string;
    cover: string;
    movieType: 'movie' | 'series';
    genres: string[];
    updatedAt: number;
  }>
> {
  const safeLimit = Math.min(250000, Math.max(1, Math.floor(limit)));
  const res = await dbQuery<{
    slug: string;
    title: string;
    synopsis: string;
    cover: string;
    cover_hz: string;
    poster: string;
    movie_type: string;
    genres: string[];
    updated_at: Date;
  }>(
    `SELECT slug, title, synopsis, cover, cover_hz, poster, movie_type, genres, updated_at
     FROM movies
     WHERE COALESCE(TRIM(slug), '') <> ''
       AND COALESCE(TRIM(title), '') <> ''
       AND (
         COALESCE(TRIM(poster), '') <> ''
         OR COALESCE(TRIM(cover), '') <> ''
         OR COALESCE(TRIM(cover_hz), '') <> ''
         OR COALESCE(TRIM(synopsis), '') <> ''
       )
     ORDER BY popularity_score DESC, updated_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  if (!res) return [];
  const invalidSlugs = new Set(['hd-movie', 'movie', 'unknown', 'null', 'undefined']);
  return res.rows
    .filter((r) => {
      const s = String(r.slug || '').trim().toLowerCase();
      const t = String(r.title || '').trim();
      return Boolean(s && t && !invalidSlugs.has(s));
    })
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.synopsis || '',
      cover: r.poster || r.cover || r.cover_hz || '',
      movieType: r.movie_type === 'series' ? 'series' : 'movie',
      genres: Array.isArray(r.genres) ? r.genres : [],
      updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
    }));
}
export interface MovieSourceUpsertInput {
  slug: string;
  episodeNumber?: number;
  vid?: string;
  sourceName: string;
  sourceType?: string;
  quality?: string;
  streamUrl?: string;
  rawUrl?: string;
  embedUrl?: string;
  subtitles?: Array<Record<string, unknown>>;
  headers?: Record<string, unknown>;
  isActive?: boolean;
}

export async function upsertMovieSourcesInDb(
  sources: MovieSourceUpsertInput[]
): Promise<void> {
  if (!sources || sources.length === 0) return;
  for (const src of sources) {
    const cleanSlug = (src.slug || '').trim().toLowerCase().slice(0, 180);
    const epNum = Math.max(1, Math.floor(src.episodeNumber || 1));
    const sourceName = (src.sourceName || 'LK21').trim().slice(0, 80) || 'LK21';
    const quality = (src.quality || 'HD').trim().slice(0, 48) || 'HD';
    if (!cleanSlug) continue;
    await dbQuery(
      `INSERT INTO movie_sources (
         slug, episode_number, vid, source_name, source_type, quality,
         stream_url, raw_url, embed_url, subtitles_json, headers_json, is_active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, NOW())
       ON CONFLICT (slug, episode_number, source_name, quality) DO UPDATE SET
         vid = CASE WHEN EXCLUDED.vid <> '' THEN EXCLUDED.vid ELSE movie_sources.vid END,
         source_type = CASE WHEN EXCLUDED.source_type <> '' THEN EXCLUDED.source_type ELSE movie_sources.source_type END,
         stream_url = CASE WHEN EXCLUDED.stream_url <> '' THEN EXCLUDED.stream_url ELSE movie_sources.stream_url END,
         raw_url = CASE WHEN EXCLUDED.raw_url <> '' THEN EXCLUDED.raw_url ELSE movie_sources.raw_url END,
         embed_url = CASE WHEN EXCLUDED.embed_url <> '' THEN EXCLUDED.embed_url ELSE movie_sources.embed_url END,
         subtitles_json = CASE WHEN EXCLUDED.subtitles_json <> '[]'::jsonb THEN EXCLUDED.subtitles_json ELSE movie_sources.subtitles_json END,
         headers_json = movie_sources.headers_json || EXCLUDED.headers_json,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        cleanSlug,
        epNum,
        (src.vid || cleanSlug).slice(0, 240),
        sourceName,
        (src.sourceType || 'hls').slice(0, 32),
        quality,
        (src.streamUrl || '').slice(0, 1500),
        (src.rawUrl || '').slice(0, 1500),
        (src.embedUrl || '').slice(0, 1500),
        JSON.stringify(src.subtitles || []),
        JSON.stringify(src.headers || {}),
        src.isActive !== false,
      ]
    ).catch(() => {});
  }
}

export async function listMoviesFallbackFromDb(
  limit = 24,
  searchQuery?: string
): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    cover: string;
    coverHz: string;
    coverVt: string;
    rating: string;
    quality: string;
    badge: string;
    description: string;
    genres: string[];
    updateInfo: string;
    movieType: string;
  }>
> {
  const safeLimit = Math.min(60, Math.max(1, Math.floor(limit || 24)));
  const cleanQ = (searchQuery || '').trim();
  const res = cleanQ
    ? await dbQuery<{
        movie_id: string;
        slug: string;
        title: string;
        cover: string;
        cover_hz: string;
        poster: string;
        rating: string;
        quality: string;
        badge: string;
        synopsis: string;
        genres: string[];
        update_info: string;
        movie_type: string;
      }>(
        `SELECT movie_id, slug, title, cover, cover_hz, poster, rating, quality, badge, synopsis, genres, update_info, movie_type
         FROM movies
         WHERE title ILIKE $1 OR synopsis ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(genres) AS g WHERE g ILIKE $1)
         ORDER BY popularity_score DESC, updated_at DESC
         LIMIT $2`,
        [`%${cleanQ}%`, safeLimit]
      )
    : await dbQuery<{
        movie_id: string;
        slug: string;
        title: string;
        cover: string;
        cover_hz: string;
        poster: string;
        rating: string;
        quality: string;
        badge: string;
        synopsis: string;
        genres: string[];
        update_info: string;
        movie_type: string;
      }>(
        `SELECT movie_id, slug, title, cover, cover_hz, poster, rating, quality, badge, synopsis, genres, update_info, movie_type
         FROM movies
         ORDER BY popularity_score DESC, updated_at DESC
         LIMIT $1`,
        [safeLimit]
      );

  if (!res) return [];
  return res.rows.map((r) => ({
    id: r.movie_id || r.slug,
    slug: r.slug,
    title: r.title,
    cover: r.cover || r.poster,
    coverHz: r.cover_hz || r.cover,
    coverVt: r.poster || r.cover,
    rating: r.rating || '',
    quality: r.quality || 'HD',
    badge: r.badge || '',
    description: r.synopsis || '',
    genres: Array.isArray(r.genres) ? r.genres : [],
    updateInfo: r.update_info || '',
    movieType: r.movie_type || 'movie',
  }));
}

export async function getMovieSourcesFromDb(
  slug: string,
  episodeNumber?: number
): Promise<
  Array<{
    id: number;
    slug: string;
    episodeNumber: number;
    vid: string;
    sourceName: string;
    sourceType: string;
    quality: string;
    streamUrl: string;
    rawUrl: string;
    embedUrl: string;
    subtitles: Array<Record<string, unknown>>;
    headers: Record<string, unknown>;
    isActive: boolean;
    updatedAt: number;
  }>
> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return [];
  const hasEp = typeof episodeNumber === 'number' && episodeNumber > 0;
  const res = await dbQuery<{
    id: number;
    slug: string;
    episode_number: number;
    vid: string;
    source_name: string;
    source_type: string;
    quality: string;
    stream_url: string;
    raw_url: string;
    embed_url: string;
    subtitles_json: Array<Record<string, unknown>>;
    headers_json: Record<string, unknown>;
    is_active: boolean;
    updated_at: Date;
  }>(
    hasEp
      ? `SELECT id, slug, episode_number, vid, source_name, source_type, quality,
                stream_url, raw_url, embed_url, subtitles_json, headers_json, is_active, updated_at
         FROM movie_sources
         WHERE slug = $1 AND episode_number = $2 AND is_active = TRUE
         ORDER BY updated_at DESC`
      : `SELECT id, slug, episode_number, vid, source_name, source_type, quality,
                stream_url, raw_url, embed_url, subtitles_json, headers_json, is_active, updated_at
         FROM movie_sources
         WHERE slug = $1 AND is_active = TRUE
         ORDER BY episode_number ASC, updated_at DESC`,
    hasEp ? [clean, Math.floor(episodeNumber!)] : [clean]
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    id: Number(r.id) || 0,
    slug: r.slug,
    episodeNumber: Number(r.episode_number) || 1,
    vid: r.vid,
    sourceName: r.source_name,
    sourceType: r.source_type || 'hls',
    quality: r.quality || 'HD',
    streamUrl: r.stream_url,
    rawUrl: r.raw_url,
    embedUrl: r.embed_url,
    subtitles: Array.isArray(r.subtitles_json) ? r.subtitles_json : [],
    headers:
      r.headers_json && typeof r.headers_json === 'object'
        ? r.headers_json
        : {},
    isActive: Boolean(r.is_active),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.getTime() : Date.now(),
  }));
}

// --- Points Ledger, Check-In Streaks, Watch Missions, Referrals & Payout Requests (PostgreSQL Single Source of Truth) ---

export type PayoutMethod =
  | 'dana'
  | 'gopay'
  | 'ovo'
  | 'shopeepay'
  | 'linkaja'
  | 'bank_transfer'
  | 'paypal'
  | 'wise'
  | 'usdt_polygon'
  | 'usdt_trc20'
  | 'usdt_bep20'
  | 'usdt_erc20';

export type PayoutCurrency = 'USD' | 'IDR';
export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'paid'
  | 'completed'
  | 'rejected'
  | 'failed';
export type PointsLedgerType = 'earn' | 'redeem';

export interface IndonesianBankOption {
  code: string;
  label: string;
  shortName: string;
  minDigits: number;
  maxDigits: number;
}

export const INDONESIAN_BANK_OPTIONS: IndonesianBankOption[] = [
  { code: 'BCA', label: 'Bank Central Asia (BCA)', shortName: 'BCA', minDigits: 10, maxDigits: 10 },
  { code: 'BRI', label: 'Bank Rakyat Indonesia (BRI)', shortName: 'BRI', minDigits: 15, maxDigits: 15 },
  { code: 'BNI', label: 'Bank Negara Indonesia (BNI)', shortName: 'BNI', minDigits: 10, maxDigits: 10 },
  { code: 'MANDIRI', label: 'Bank Mandiri', shortName: 'Mandiri', minDigits: 13, maxDigits: 13 },
  { code: 'BSI', label: 'Bank Syariah Indonesia (BSI)', shortName: 'BSI', minDigits: 10, maxDigits: 10 },
  { code: 'CIMB', label: 'CIMB Niaga', shortName: 'CIMB Niaga', minDigits: 12, maxDigits: 13 },
  { code: 'JAGO', label: 'Bank Jago', shortName: 'Bank Jago', minDigits: 10, maxDigits: 12 },
  { code: 'SEABANK', label: 'SeaBank Indonesia', shortName: 'SeaBank', minDigits: 12, maxDigits: 12 },
  { code: 'PERMATA', label: 'PermataBank', shortName: 'Permata', minDigits: 10, maxDigits: 10 },
  { code: 'BTN', label: 'Bank Tabungan Negara (BTN)', shortName: 'BTN', minDigits: 16, maxDigits: 16 },
];

export interface UsdtNetworkOption {
  network: 'Polygon' | 'TRC20' | 'BEP20' | 'ERC20';
  method: PayoutMethod;
  label: string;
  addressHint: string;
}

export const USDT_NETWORK_OPTIONS: UsdtNetworkOption[] = [
  { network: 'Polygon', method: 'usdt_polygon', label: 'USDT (Polygon)', addressHint: '0x...' },
  { network: 'TRC20', method: 'usdt_trc20', label: 'USDT (TRC20)', addressHint: 'T...' },
  { network: 'BEP20', method: 'usdt_bep20', label: 'USDT (BEP20)', addressHint: '0x...' },
  { network: 'ERC20', method: 'usdt_erc20', label: 'USDT (ERC20)', addressHint: '0x...' },
];

export interface PayoutMethodDescriptor {
  id: PayoutMethod;
  label: string;
  currency: PayoutCurrency;
  countryCode: string;
  minPoints: number;
  category: 'ewallet_idr' | 'bank_idr' | 'global_usd' | 'crypto_usd';
}

export interface PayoutRuntimeConfig {
  usdToIdrRate: number;
  pointsPerUsd: number;
  minPayoutIdr: number;
  minPayoutUsd: number;
  minPayoutPointsIdr: number;
  minPayoutPointsUsd: number;
  maxDailyEarnPoints: number;
  maxDailyWatchPoints: number;
  claimCooldownSeconds: number;
  firstLoginBonusPoints: number;
  bindReferralBonusPoints: number;
  dailyCheckinPoints: number;
  dailyCheckinDay7Points: number;
  watchMinutePoints: number;
  dailyMissionMaxWatchSeconds: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  dailySocialSharePoints: number;
  episodeBonusPoints: number;
  episodeBonusMinWatchSeconds: number;
  maxDailyEpisodeBonusCount: number;
  referralQualifySeconds: number;
  referralBonusPoints: number;
  referralOngoingStepSeconds: number;
  referralOngoingBonusPoints: number;
  referralOngoingMaxSteps: number;
  maxDailyReferrals: number;
  maxWeeklyReferrals: number;
  maxDailyVerifiedWatchSeconds: number;
  levelTiers: AccountLevelTierSummary[];
  methods: PayoutMethodDescriptor[];
  banks: IndonesianBankOption[];
  usdtNetworks: UsdtNetworkOption[];
}

export type PointsLedgerEventCode =
  | 'welcome_login'
  | 'daily_checkin'
  | 'daily_social_share'
  | 'watch_minute'
  | 'watch_milestone'
  | 'watch_episode'
  | 'referral_bind'
  | 'referral_qualify'
  | 'referral_ongoing'
  | 'payout_request'
  | 'payout_refund'
  | 'legacy';

export interface PointsLedgerEventMeta {
  streakDay?: number;
  shareChannel?: string;
  minute?: number;
  maxMinutes?: number;
  milestoneMinutes?: number;
  provider?: string;
  dramaId?: string;
  title?: string;
  episodeNumber?: number;
  tierName?: string;
  multiplier?: number;
  level?: number;
  referralCode?: string;
  ongoingStep?: number;
  stepMinutes?: number;
  totalStepsMax?: number;
  methodLabel?: string;
  currency?: PayoutCurrency;
  payoutId?: string;
  payoutStatus?: 'rejected' | 'failed';
}

export interface PointsLedgerRecord {
  id: string;
  userId: string;
  type: PointsLedgerType;
  points: number;
  description: string;
  eventCode: PointsLedgerEventCode;
  eventMeta: PointsLedgerEventMeta;
  referenceId: string;
  balanceAfter?: number | null;
  createdAt: string;
}

export interface PayoutRequestRecord {
  id: string;
  userId: string;
  pointsSpent: number;
  usdAmount: number;
  idrAmount: number;
  fxRateUsed: number;
  currency: PayoutCurrency;
  method: PayoutMethod;
  bankCode?: string;
  network?: string;
  destinationAccount: string;
  destinationMasked?: string;
  accountHolderName: string;
  status: PayoutStatus;
  adminNote: string;
  idempotencyKey?: string;
  riskFlag?: string;
  suspiciousReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyMissionMilestoneStatus {
  minutes: number;
  bonusPoints: number;
  reached: boolean;
  claimed: boolean;
  claimedAt: string | null;
}

export interface UserPointsSummary {
  timeZone?: string;
  resetPeriodKey?: string;
  nextResetAt?: string;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  totalHeld: number;
  totalWithdrawn: number;
  todayEarned: number;
  maxDailyEarnPoints: number;
  todayWatchSeconds: number;
  todayWatchPointsEarned: number;
  dailyMissionMaxWatchSeconds: number;
  verifiedWatchSeconds?: number;
  levelInfo?: AccountLevelStatus;
  estimatedUsd: number;
  estimatedIdr: number;
  lastClaimAt: string | null;
  cooldownSecondsRemaining: number;
  dailyCheckinClaimedToday: boolean;
  dailySocialShareClaimedToday: boolean;
  dailySocialShareClaimedAt: string | null;
  dailySocialShareChannel: string | null;
  todayEpisodeBonusCount?: number;
  maxDailyEpisodeBonusCount?: number;
  episodeBonusPoints?: number;
  checkinStreak: number;
  recentCheckins: string[];
  milestones: DailyMissionMilestoneStatus[];
  ledgerTotal: number;
  payoutsTotal: number;
  ledger: PointsLedgerRecord[];
  payouts: PayoutRequestRecord[];
}

export interface LivePayoutFeedItem {
  id: string;
  maskedUser: string;
  countryCode: string;
  method: PayoutMethod;
  methodLabel: string;
  currency: PayoutCurrency;
  usdAmount: number;
  idrAmount: number;
  status: 'approved' | 'paid' | 'completed';
  createdAt: string;
  isReal: boolean;
}

export const ALLOWED_PAYOUT_METHODS: ReadonlySet<PayoutMethod> = new Set([
  'dana',
  'gopay',
  'ovo',
  'shopeepay',
  'linkaja',
  'bank_transfer',
  'paypal',
  'wise',
  'usdt_polygon',
  'usdt_trc20',
  'usdt_bep20',
  'usdt_erc20',
]);

const USD_PAYOUT_METHODS: ReadonlySet<PayoutMethod> = new Set([
  'paypal',
  'wise',
  'usdt_polygon',
  'usdt_trc20',
  'usdt_bep20',
  'usdt_erc20',
]);

export function getPayoutRuntimeConfig(): PayoutRuntimeConfig {
  const runtime = getRewardsRuntimeValues();
  const { minPayoutPointsIdr, minPayoutPointsUsd } = runtime;

  const methods: PayoutMethodDescriptor[] = [
    {
      id: 'dana',
      label: 'DANA',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'ewallet_idr',
    },
    {
      id: 'gopay',
      label: 'GoPay',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'ewallet_idr',
    },
    {
      id: 'ovo',
      label: 'OVO',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'ewallet_idr',
    },
    {
      id: 'shopeepay',
      label: 'ShopeePay',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'ewallet_idr',
    },
    {
      id: 'linkaja',
      label: 'LinkAja',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'ewallet_idr',
    },
    {
      id: 'bank_transfer',
      label: 'Transfer Bank (IDR)',
      currency: 'IDR',
      countryCode: 'ID',
      minPoints: minPayoutPointsIdr,
      category: 'bank_idr',
    },
    {
      id: 'paypal',
      label: 'PayPal',
      currency: 'USD',
      countryCode: 'US',
      minPoints: minPayoutPointsUsd,
      category: 'global_usd',
    },
    {
      id: 'wise',
      label: 'Wise',
      currency: 'USD',
      countryCode: 'GB',
      minPoints: minPayoutPointsUsd,
      category: 'global_usd',
    },
    {
      id: 'usdt_polygon',
      label: 'USDT (Polygon)',
      currency: 'USD',
      countryCode: 'SG',
      minPoints: minPayoutPointsUsd,
      category: 'crypto_usd',
    },
    {
      id: 'usdt_trc20',
      label: 'USDT (TRC20)',
      currency: 'USD',
      countryCode: 'SG',
      minPoints: minPayoutPointsUsd,
      category: 'crypto_usd',
    },
    {
      id: 'usdt_bep20',
      label: 'USDT (BEP20)',
      currency: 'USD',
      countryCode: 'SG',
      minPoints: minPayoutPointsUsd,
      category: 'crypto_usd',
    },
    {
      id: 'usdt_erc20',
      label: 'USDT (ERC20)',
      currency: 'USD',
      countryCode: 'SG',
      minPoints: minPayoutPointsUsd,
      category: 'crypto_usd',
    },
  ];

  return {
    ...runtime,
    levelTiers: getAccountLevelTiersSummary(runtime),
    methods,
    banks: INDONESIAN_BANK_OPTIONS,
    usdtNetworks: USDT_NETWORK_OPTIONS,
  };
}

export function getCurrencyForMethod(method: PayoutMethod): PayoutCurrency {
  return USD_PAYOUT_METHODS.has(method) ? 'USD' : 'IDR';
}

export function getMethodMetadata(
  method: PayoutMethod,
  bankCode?: string
): {
  label: string;
  countryCode: string;
  currency: PayoutCurrency;
} {
  switch (method) {
    case 'dana':
      return { label: 'DANA', countryCode: 'ID', currency: 'IDR' };
    case 'ovo':
      return { label: 'OVO', countryCode: 'ID', currency: 'IDR' };
    case 'gopay':
      return { label: 'GoPay', countryCode: 'ID', currency: 'IDR' };
    case 'shopeepay':
      return { label: 'ShopeePay', countryCode: 'ID', currency: 'IDR' };
    case 'linkaja':
      return { label: 'LinkAja', countryCode: 'ID', currency: 'IDR' };
    case 'bank_transfer': {
      const bank = INDONESIAN_BANK_OPTIONS.find(
        (b) => b.code === String(bankCode || '').toUpperCase()
      );
      return {
        label: bank ? `Bank ${bank.shortName}` : 'Transfer Bank',
        countryCode: 'ID',
        currency: 'IDR',
      };
    }
    case 'paypal':
      return { label: 'PayPal', countryCode: 'US', currency: 'USD' };
    case 'wise':
      return { label: 'Wise', countryCode: 'GB', currency: 'USD' };
    case 'usdt_polygon':
      return { label: 'USDT Polygon', countryCode: 'SG', currency: 'USD' };
    case 'usdt_trc20':
      return { label: 'USDT TRC20', countryCode: 'SG', currency: 'USD' };
    case 'usdt_bep20':
      return { label: 'USDT BEP20', countryCode: 'SG', currency: 'USD' };
    case 'usdt_erc20':
      return { label: 'USDT ERC20', countryCode: 'SG', currency: 'USD' };
  }
}

export function computePointsConversion(
  points: number,
  cfg: PayoutRuntimeConfig = getPayoutRuntimeConfig()
): { usdAmount: number; idrAmount: number; fxRateUsed: number } {
  const safePts = Math.max(0, Math.floor(points));
  const usdRaw = safePts / cfg.pointsPerUsd;
  const usdAmount = Math.round(usdRaw * 100) / 100;
  const idrAmount = Math.round(usdRaw * cfg.usdToIdrRate);
  return {
    usdAmount,
    idrAmount,
    fxRateUsed: cfg.usdToIdrRate,
  };
}

export function maskDisplayNameForFeed(rawName?: string | null): string {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return 'K***r';
  const token = cleaned.split(' ')[0] || cleaned;
  const chars = Array.from(token);
  if (chars.length <= 1) return `${chars[0].toUpperCase()}***r`;
  if (chars.length === 2) return `${chars[0].toUpperCase()}***${chars[1].toLowerCase()}`;
  return `${chars[0].toUpperCase()}***${chars[chars.length - 1].toLowerCase()}`;
}

export function maskDestinationAccount(rawAccount: string, method?: PayoutMethod): string {
  const clean = String(rawAccount || '').trim();
  if (!clean) return '****';
  if (clean.includes('@')) {
    const [localPart, domain] = clean.split('@');
    const visibleLocal =
      localPart.length <= 2 ? `${localPart[0] || '*'}*` : `${localPart.slice(0, 2)}***`;
    return `${visibleLocal}@${domain || '***'}`;
  }
  if (clean.length <= 6) {
    return `${clean.slice(0, 2)}***${clean.slice(-1)}`;
  }
  if (method?.startsWith('usdt_') || clean.startsWith('0x') || clean.startsWith('T')) {
    return `${clean.slice(0, 6)}****${clean.slice(-4)}`;
  }
  return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
}

export type ReferralStatus = 'pending_watch' | 'qualified' | 'rejected_fraud';

export interface ReferralRecord {
  id: string;
  referrerUid: string;
  refereeUid: string;
  referralCode: string;
  status: ReferralStatus;
  bonusPoints: number;
  refereeIpHash: string;
  refereeSubnetHash: string;
  refereeUaHash: string;
  refereeDeviceHash: string;
  riskFlag: string;
  suspiciousReason: string;
  qualifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchTelemetryRecord {
  userId: string;
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  todayDateKey: string;
  activeStreamSessionId: string;
  activeStreamMediaKey: string;
  lastHeartbeatAt: string | null;
  lastVideoTimeSec: number;
  fastDeltaStrikes: number;
  concurrentTabStrikes: number;
  riskFlag: string;
  suspiciousReason: string;
  updatedAt: string;
}

export interface UserSecuritySignalRecord {
  userId: string;
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
  riskFlag: string;
  suspiciousReason: string;
  lastSeenAt: string;
}

export interface UserReferralItemView {
  id: string;
  maskedReferee: string;
  status: ReferralStatus;
  bonusPoints: number;
  ongoingBonusEarned: number;
  ongoingStepsAwarded: number;
  ongoingMaxSteps: number;
  nextOngoingTargetSeconds: number | null;
  verifiedWatchSeconds: number;
  requiredWatchSeconds: number;
  riskFlag?: string;
  qualifiedAt: string | null;
  createdAt: string;
}

export interface UserReferralSummary {
  referralCode: string;
  referralQualifySeconds: number;
  referralBonusPoints: number;
  bindReferralBonusPoints: number;
  referralOngoingStepSeconds: number;
  referralOngoingBonusPoints: number;
  referralOngoingMaxSteps: number;
  hasReferrer: boolean;
  referredBy: {
    status: ReferralStatus;
    referralCode: string;
    bindBonusAwarded: boolean;
    createdAt: string;
  } | null;
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  maxDailyVerifiedWatchSeconds: number;
  riskFlag: string;
  stats: {
    totalInvited: number;
    pendingCount: number;
    qualifiedCount: number;
    rejectedCount: number;
    mainBonusEarned: number;
    ongoingBonusEarned: number;
    totalBonusEarned: number;
  };
  referrals: UserReferralItemView[];
}

export function buildReferralCodeForUser(userId: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`kd-ref:${userId.trim()}`)
    .digest('hex')
    .toUpperCase();
  return `KD${digest.slice(0, 8)}`;
}

const VALID_LEDGER_EVENT_CODES: ReadonlySet<PointsLedgerEventCode> = new Set([
  'welcome_login',
  'daily_checkin',
  'daily_social_share',
  'watch_minute',
  'watch_milestone',
  'watch_episode',
  'referral_bind',
  'referral_qualify',
  'referral_ongoing',
  'payout_request',
  'payout_refund',
  'legacy',
]);

function parseEventMeta(raw: unknown): PointsLedgerEventMeta {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as PointsLedgerEventMeta) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') {
    return raw as PointsLedgerEventMeta;
  }
  return {};
}

function extractTierSuffixMeta(description: string): Pick<PointsLedgerEventMeta, 'tierName' | 'multiplier'> {
  const tierMatch = /(?:·|-)?\s*(Silver|Gold|Platinum)\s+([0-9]+(?:\.[0-9]+)?)x/i.exec(description);
  if (!tierMatch) return {};
  const tierRaw = tierMatch[1];
  const tierName = tierRaw.charAt(0).toUpperCase() + tierRaw.slice(1).toLowerCase();
  const multiplier = Number(tierMatch[2]);
  return Number.isFinite(multiplier) && multiplier > 1 ? { tierName, multiplier } : { tierName };
}

function inferLedgerEventFromLegacyRow(r: {
  reference_id: string;
  description: string;
  type: string;
  event_code?: string | null;
  event_meta?: unknown;
}): { eventCode: PointsLedgerEventCode; eventMeta: PointsLedgerEventMeta } {
  const parsedMeta = parseEventMeta(r.event_meta);
  const rawCode = String(r.event_code || '').trim() as PointsLedgerEventCode;
  if (rawCode && rawCode !== 'legacy' && VALID_LEDGER_EVENT_CODES.has(rawCode)) {
    return { eventCode: rawCode, eventMeta: parsedMeta };
  }

  const ref = String(r.reference_id || '').trim();
  const desc = String(r.description || '').trim();
  const tierMeta = extractTierSuffixMeta(desc);

  if (ref.startsWith('welcome_login:') || /Bonus Login Pertama/i.test(desc)) {
    return { eventCode: 'welcome_login', eventMeta: { ...parsedMeta } };
  }

  if (ref.startsWith('checkin:') || /Check-in Harian/i.test(desc)) {
    const dayMatch = /Hari ke-(\d+)/i.exec(desc);
    return {
      eventCode: 'daily_checkin',
      eventMeta: {
        ...tierMeta,
        streakDay: parsedMeta.streakDay ?? (dayMatch ? Number(dayMatch[1]) : undefined),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('social_share:') || /Share Media Sosial/i.test(desc)) {
    const chMatch = /\(([^)]+)\)\s*$/.exec(desc);
    return {
      eventCode: 'daily_social_share',
      eventMeta: {
        shareChannel: parsedMeta.shareChannel ?? chMatch?.[1]?.trim(),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('watch_min:') || /Misi Nonton Aktif/i.test(desc)) {
    const refMinMatch = /:m(\d+)$/.exec(ref);
    const descMinMatch = /Menit\s+(\d+)\/(\d+)/i.exec(desc);
    return {
      eventCode: 'watch_minute',
      eventMeta: {
        ...tierMeta,
        minute: parsedMeta.minute ?? (refMinMatch ? Number(refMinMatch[1]) : descMinMatch ? Number(descMinMatch[1]) : undefined),
        maxMinutes: parsedMeta.maxMinutes ?? (descMinMatch ? Number(descMinMatch[2]) : 60),
        ...parsedMeta,
      },
    };
  }

  const missionRefMatch = /^mission_(\d+)m:/.exec(ref);
  if (missionRefMatch || /Bonus Milestone Nonton/i.test(desc)) {
    const descMsMatch = /(\d+)\s*Menit/i.exec(desc);
    return {
      eventCode: 'watch_milestone',
      eventMeta: {
        ...tierMeta,
        milestoneMinutes:
          parsedMeta.milestoneMinutes ??
          (missionRefMatch ? Number(missionRefMatch[1]) : descMsMatch ? Number(descMsMatch[1]) : undefined),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('watch:') || /Bonus Episode Baru/i.test(desc)) {
    const epRefMatch = /^watch:[^:]+:([^:]+):([^:]+):(\d+)$/.exec(ref);
    const titleMatch = /Bonus Episode Baru:\s*(.+?)\s+Ep\s+(\d+)/i.exec(desc);
    const epFallbackMatch = /\(([^)]+?)\s+Ep\s+(\d+)\)/i.exec(desc);
    return {
      eventCode: 'watch_episode',
      eventMeta: {
        ...tierMeta,
        provider: parsedMeta.provider ?? (epRefMatch?.[1] || epFallbackMatch?.[1]),
        dramaId: parsedMeta.dramaId ?? epRefMatch?.[2],
        episodeNumber:
          parsedMeta.episodeNumber ??
          (epRefMatch ? Number(epRefMatch[3]) : titleMatch ? Number(titleMatch[2]) : epFallbackMatch ? Number(epFallbackMatch[2]) : undefined),
        title: parsedMeta.title ?? (titleMatch?.[1]?.trim() || undefined),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('referral:bind:') || /Bonus Bind Referral/i.test(desc)) {
    return { eventCode: 'referral_bind', eventMeta: { ...parsedMeta } };
  }

  if (ref.startsWith('referral:qualify:') || /Bonus Referral Valid/i.test(desc)) {
    return { eventCode: 'referral_qualify', eventMeta: { ...parsedMeta } };
  }

  if (ref.startsWith('referral:ongoing:') || /Bonus Lanjutan Referral/i.test(desc)) {
    const stepMatch = /:s(\d+)$/.exec(ref);
    return {
      eventCode: 'referral_ongoing',
      eventMeta: {
        ongoingStep: parsedMeta.ongoingStep ?? (stepMatch ? Number(stepMatch[1]) : undefined),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('refund:payout:') || /Pengembalian Poin/i.test(desc)) {
    const idMatch = /#([A-Za-z0-9]+)/.exec(desc);
    return {
      eventCode: 'payout_refund',
      eventMeta: {
        payoutStatus: /Gagal/i.test(desc) ? 'failed' : 'rejected',
        payoutId: idMatch?.[1] || ref.replace('refund:payout:', '').slice(0, 8),
        ...parsedMeta,
      },
    };
  }

  if (ref.startsWith('payout:') || /Penarikan\s+/i.test(desc) || r.type === 'redeem') {
    const withdrawMatch = /Penarikan\s+(.+?)\s*\((USD|IDR)\)/i.exec(desc);
    return {
      eventCode: 'payout_request',
      eventMeta: {
        methodLabel: parsedMeta.methodLabel ?? withdrawMatch?.[1]?.trim(),
        currency: parsedMeta.currency ?? (withdrawMatch?.[2]?.toUpperCase() === 'USD' ? 'USD' : withdrawMatch?.[2] ? 'IDR' : undefined),
        ...parsedMeta,
      },
    };
  }

  return { eventCode: 'legacy', eventMeta: parsedMeta };
}

function mapLedgerRow(r: {
  id: string;
  user_id: string;
  type: string;
  points: number | string;
  description: string;
  event_code?: string | null;
  event_meta?: unknown;
  reference_id: string;
  balance_after?: number | string | null;
  created_at: Date | string;
}): PointsLedgerRecord {
  const { eventCode, eventMeta } = inferLedgerEventFromLegacyRow(r);
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type === 'redeem' ? 'redeem' : 'earn',
    points: Math.max(0, Number(r.points) || 0),
    description: r.description || '',
    eventCode,
    eventMeta,
    referenceId: r.reference_id,
    balanceAfter:
      r.balance_after === null || r.balance_after === undefined
        ? null
        : Math.max(0, Number(r.balance_after) || 0),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at || new Date().toISOString()),
  };
}

const VALID_PAYOUT_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'processing',
  'approved',
  'paid',
  'completed',
  'rejected',
  'failed',
]);

function mapPayoutRow(
  r: {
    id: string;
    user_id: string;
    points_spent: number | string;
    usd_amount: number | string;
    idr_amount: number | string;
    fx_rate_used: number | string;
    currency: string;
    method: string;
    bank_code?: string | null;
    network?: string | null;
    destination_account: string;
    account_holder_name: string;
    status: string;
    admin_note: string;
    idempotency_key?: string | null;
    risk_flag?: string;
    suspicious_reason?: string;
    created_at: Date | string;
    updated_at: Date | string;
  },
  maskSensitive = true
): PayoutRequestRecord {
  const method = (ALLOWED_PAYOUT_METHODS.has(r.method as PayoutMethod)
    ? r.method
    : 'dana') as PayoutMethod;
  const masked = maskDestinationAccount(r.destination_account, method);
  return {
    id: r.id,
    userId: r.user_id,
    pointsSpent: Math.max(0, Number(r.points_spent) || 0),
    usdAmount: Number(Number(r.usd_amount || 0).toFixed(2)),
    idrAmount: Math.max(0, Math.round(Number(r.idr_amount) || 0)),
    fxRateUsed: Number(Number(r.fx_rate_used || 18200).toFixed(2)),
    currency: r.currency === 'USD' ? 'USD' : 'IDR',
    method,
    bankCode: r.bank_code || '',
    network: r.network || '',
    destinationAccount: maskSensitive ? masked : r.destination_account,
    destinationMasked: masked,
    accountHolderName: r.account_holder_name,
    status: (VALID_PAYOUT_STATUSES.has(r.status) ? r.status : 'pending') as PayoutStatus,
    adminNote: r.admin_note || '',
    idempotencyKey: r.idempotency_key || '',
    riskFlag: r.risk_flag || '',
    suspiciousReason: r.suspicious_reason || '',
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at || new Date().toISOString()),
    updatedAt:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : String(r.updated_at || new Date().toISOString()),
  };
}

function normalizeDateKeyString(
  val: Date | string | null | undefined,
  timeZone: string = DEFAULT_FALLBACK_TIMEZONE
): string {
  if (!val) return '';
  if (val instanceof Date) {
    return getDateKeyInTimeZone(val, timeZone);
  }
  const s = String(val).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return match ? match[1] : s;
}

const CHECKIN_MIN_GAP_MS = 20 * 60 * 60 * 1000;

async function resolveUserTimeZonePg(
  _client: PoolClient,
  _userId: string,
  _requestedTz?: string | null,
  _allowWrite = true
): Promise<{
  timeZone: string;
  todayKey: string;
  yesterdayKey: string;
  periodStartAt: Date;
  nextResetAt: Date;
}> {
  const canonical = getCanonicalResetPeriod();
  return {
    timeZone: canonical.timeZone,
    todayKey: canonical.periodKey,
    yesterdayKey: canonical.previousPeriodKey,
    periodStartAt: canonical.periodStartAt,
    nextResetAt: canonical.nextResetAt,
  };
}

async function queryUserPointsSummaryOnClient(
  client: PoolClient,
  userId: string,
  cfg: PayoutRuntimeConfig,
  requestedTz?: string | null
): Promise<UserPointsSummary> {
  const { timeZone, todayKey, yesterdayKey, periodStartAt, nextResetAt } =
    await resolveUserTimeZonePg(client, userId, requestedTz, true);
  const checkinRef = `checkin:${userId}:${todayKey}`;
  const checkinPrefix = `checkin:${userId}:%`;

  const aggRes = await client.query<{
    total_earned: string;
    lifetime_earned_for_level: string;
    total_redeemed: string;
    today_earned: string;
    today_watch_points: string;
    last_claim_at: Date | null;
    checkin_today: boolean;
    ledger_total: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0)::text AS total_earned,
       COALESCE(SUM(CASE WHEN type = 'earn' AND reference_id NOT LIKE 'refund:payout:%' THEN points ELSE 0 END), 0)::text AS lifetime_earned_for_level,
       COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)::text AS total_redeemed,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND reference_id NOT LIKE 'refund:payout:%'
            AND reference_id NOT LIKE 'welcome_login:%'
            AND created_at >= $4
            AND created_at < $5
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_earned,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND (reference_id LIKE 'watch_min:%' OR reference_id LIKE 'mission_%')
            AND created_at >= $4
            AND created_at < $5
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_watch_points,
       MAX(
         CASE
           WHEN type = 'earn'
            AND reference_id LIKE 'checkin:%'
           THEN created_at
           ELSE NULL
         END
       ) AS last_claim_at,
       COALESCE(
         BOOL_OR(
           reference_id = $2
           OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
         ),
         FALSE
       ) AS checkin_today,
       COUNT(*)::text AS ledger_total
     FROM points_ledger
     WHERE user_id = $1`,
    [userId, checkinRef, checkinPrefix, periodStartAt, nextResetAt]
  );

  const payoutAggRes = await client.query<{
    total_held: string;
    total_withdrawn: string;
    payouts_total: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('pending', 'processing', 'approved') THEN points_spent ELSE 0 END), 0)::text AS total_held,
       COALESCE(SUM(CASE WHEN status IN ('paid', 'completed') THEN points_spent ELSE 0 END), 0)::text AS total_withdrawn,
       COUNT(*)::text AS payouts_total
     FROM payout_requests
     WHERE user_id = $1`,
    [userId]
  );

  const telRes = await client.query<{
    verified_watch_seconds: number;
    today_watch_seconds: number;
    today_date_key: string;
    risk_flag: string;
  }>(
    `SELECT verified_watch_seconds, today_watch_seconds, today_date_key, risk_flag
     FROM watch_telemetry
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const checkinsRes = await client.query<{
    checkin_date: Date | string;
    streak_day: number;
    created_at?: Date | string;
  }>(
    `SELECT checkin_date, streak_day, created_at
     FROM daily_checkins
     WHERE user_id = $1
     ORDER BY checkin_date DESC
     LIMIT 14`,
    [userId]
  );

  const milestoneRefIds = cfg.dailyMissionMilestones.map(
    (m) => `mission_${m.minutes}m:${userId}:${todayKey}`
  );
  const milestonePrefix = `mission_%:${userId}:%`;
  const milestoneLedgerRes =
    milestoneRefIds.length > 0
      ? await client.query<{ reference_id: string; created_at: Date }>(
          `SELECT reference_id, created_at
           FROM points_ledger
           WHERE user_id = $1
             AND (
               reference_id = ANY($2::text[])
               OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
             )`,
          [userId, milestoneRefIds, milestonePrefix, periodStartAt, nextResetAt]
        )
      : { rows: [] };

  const milestoneMap = new Map<string, string>();
  const periodMsStart = periodStartAt.getTime();
  const periodMsEnd = nextResetAt.getTime();
  for (const row of milestoneLedgerRes.rows) {
    const iso =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    milestoneMap.set(row.reference_id, iso);
    const createdMs =
      row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(String(row.created_at));
    if (Number.isFinite(createdMs) && createdMs >= periodMsStart && createdMs < periodMsEnd) {
      for (const ms of cfg.dailyMissionMilestones) {
        if (row.reference_id.startsWith(`mission_${ms.minutes}m:${userId}:`)) {
          milestoneMap.set(`mission_${ms.minutes}m:${userId}:${todayKey}`, iso);
        }
      }
    }
  }

  const socialShareRef = `social_share:${userId}:${todayKey}`;
  const socialSharePrefix = `social_share:${userId}:%`;
  const socialShareLedgerRes = await client.query<{
    reference_id: string;
    event_meta?: unknown;
    created_at: Date;
  }>(
    `SELECT reference_id, event_meta, created_at
     FROM points_ledger
     WHERE user_id = $1
       AND (
         reference_id = ANY($2::text[])
         OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, [socialShareRef], socialSharePrefix, periodStartAt, nextResetAt]
  );
  const socialShareRow = socialShareLedgerRes.rows[0] || null;
  const socialShareMeta = socialShareRow ? parseEventMeta(socialShareRow.event_meta) : {};
  const dailySocialShareClaimedToday = Boolean(socialShareRow);
  const dailySocialShareClaimedAt = socialShareRow
    ? socialShareRow.created_at instanceof Date
      ? socialShareRow.created_at.toISOString()
      : String(socialShareRow.created_at)
    : null;
  const dailySocialShareChannel =
    typeof socialShareMeta.shareChannel === 'string' && socialShareMeta.shareChannel
      ? socialShareMeta.shareChannel
      : null;

  const agg = aggRes.rows[0];
  const payoutAgg = payoutAggRes.rows[0];
  const totalEarned = Math.max(0, Number(agg?.total_earned) || 0);
  const lifetimeEarnedForLevel = Math.max(
    0,
    Number(agg?.lifetime_earned_for_level ?? agg?.total_earned) || 0
  );
  const totalRedeemed = Math.max(0, Number(agg?.total_redeemed) || 0);
  const totalHeld = Math.max(0, Number(payoutAgg?.total_held) || 0);
  const totalWithdrawn = Math.max(0, Number(payoutAgg?.total_withdrawn) || 0);
  const todayEarned = Math.max(0, Number(agg?.today_earned) || 0);
  const todayWatchPointsEarned = Math.max(0, Number(agg?.today_watch_points) || 0);
  const telRow = telRes.rows[0];
  const verifiedWatchSeconds = Math.max(0, Number(telRow?.verified_watch_seconds) || 0);
  const todayWatchSeconds =
    telRow && telRow.today_date_key === todayKey
      ? Math.max(0, Number(telRow.today_watch_seconds) || 0)
      : 0;
  const levelInfo = resolveAccountLevelStatus(
    lifetimeEarnedForLevel,
    verifiedWatchSeconds,
    cfg
  );

  const balance = Math.max(0, totalEarned - totalRedeemed);
  const lastClaimDate = agg?.last_claim_at instanceof Date ? agg.last_claim_at : null;
  const elapsedSec = lastClaimDate
    ? Math.floor((Date.now() - lastClaimDate.getTime()) / 1000)
    : 999999;
  const cooldownSecondsRemaining =
    lastClaimDate && elapsedSec < cfg.claimCooldownSeconds
      ? Math.max(1, cfg.claimCooldownSeconds - elapsedSec)
      : 0;

  const checkinRows = checkinsRes.rows.map((r) => {
    const createdMs =
      r.created_at instanceof Date
        ? r.created_at.getTime()
        : r.created_at
        ? Date.parse(String(r.created_at))
        : NaN;
    return {
      dateKey: normalizeDateKeyString(r.checkin_date, timeZone),
      streakDay: Math.max(1, Number(r.streak_day) || 1),
      inCurrentPeriod:
        Number.isFinite(createdMs) && createdMs >= periodMsStart && createdMs < periodMsEnd,
    };
  });
  const recentCheckins = checkinRows.map((r) => r.dateKey).filter(Boolean).slice(0, 7);
  const todayCheckinRow = checkinRows.find((r) => r.dateKey === todayKey || r.inCurrentPeriod);
  const yesterdayCheckinRow = checkinRows.find(
    (r) => r.dateKey === yesterdayKey && !r.inCurrentPeriod
  );
  const dailyCheckinClaimedToday = Boolean(agg?.checkin_today) || Boolean(todayCheckinRow);
  const checkinStreak = todayCheckinRow
    ? todayCheckinRow.streakDay
    : yesterdayCheckinRow
    ? yesterdayCheckinRow.streakDay
    : 0;

  const milestones: DailyMissionMilestoneStatus[] = levelInfo.dailyMissionMilestones.map((ms) => {
    const refId = `mission_${ms.minutes}m:${userId}:${todayKey}`;
    const claimedAt = milestoneMap.get(refId) || null;
    return {
      minutes: ms.minutes,
      bonusPoints: ms.bonusPoints,
      reached: todayWatchSeconds >= ms.minutes * 60,
      claimed: Boolean(claimedAt),
      claimedAt,
    };
  });

  const ledgerRes = await client.query<{
    id: string;
    user_id: string;
    type: string;
    points: number;
    description: string;
    event_code: string | null;
    event_meta: unknown;
    reference_id: string;
    balance_after: number | null;
    created_at: Date;
  }>(
    `SELECT id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at
     FROM points_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  const payoutRes = await client.query<{
    id: string;
    user_id: string;
    points_spent: number;
    usd_amount: string;
    idr_amount: string;
    fx_rate_used: string;
    currency: string;
    method: string;
    bank_code: string;
    network: string;
    destination_account: string;
    account_holder_name: string;
    status: string;
    admin_note: string;
    idempotency_key: string | null;
    risk_flag: string;
    suspicious_reason: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
            currency, method, bank_code, network, destination_account, account_holder_name,
            status, admin_note, idempotency_key, risk_flag, suspicious_reason, created_at, updated_at
     FROM payout_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 15`,
    [userId]
  );

  const epDailyRes = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM rewarded_episodes
     WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
    [userId, periodStartAt, nextResetAt]
  );
  const todayEpisodeBonusCount = Math.max(0, Number(epDailyRes.rows[0]?.cnt) || 0);

  const { usdAmount, idrAmount } = computePointsConversion(balance, cfg);
  return {
    timeZone,
    resetPeriodKey: todayKey,
    nextResetAt: nextResetAt.toISOString(),
    balance,
    totalEarned,
    totalRedeemed,
    totalHeld,
    totalWithdrawn,
    todayEarned,
    maxDailyEarnPoints: cfg.maxDailyEarnPoints,
    todayWatchSeconds,
    todayWatchPointsEarned,
    dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
    verifiedWatchSeconds,
    levelInfo,
    estimatedUsd: usdAmount,
    estimatedIdr: idrAmount,
    lastClaimAt: lastClaimDate ? lastClaimDate.toISOString() : null,
    cooldownSecondsRemaining,
    dailyCheckinClaimedToday,
    dailySocialShareClaimedToday,
    dailySocialShareClaimedAt,
    dailySocialShareChannel,
    todayEpisodeBonusCount,
    maxDailyEpisodeBonusCount: cfg.maxDailyEpisodeBonusCount,
    episodeBonusPoints: cfg.episodeBonusPoints,
    checkinStreak,
    recentCheckins,
    milestones,
    ledgerTotal: Math.max(0, Number(agg?.ledger_total) || ledgerRes.rows.length),
    payoutsTotal: Math.max(0, Number(payoutAgg?.payouts_total) || payoutRes.rows.length),
    ledger: ledgerRes.rows.map(mapLedgerRow),
    payouts: payoutRes.rows.map((row) => mapPayoutRow(row, true)),
  };
}

export async function getUserPointsSummaryFromDb(
  userId: string,
  timeZone?: string | null
): Promise<UserPointsSummary> {
  const cfg = getPayoutRuntimeConfig();
  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    return await queryUserPointsSummaryOnClient(client, userId, cfg, timeZone);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] getUserPointsSummaryFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function listUserLedgerFromDb(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ items: PointsLedgerRecord[]; total: number; limit: number; offset: number }> {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    const countRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM points_ledger WHERE user_id = $1`,
      [userId]
    );
    const listRes = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string | null;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `SELECT id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at
       FROM points_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset]
    );
    return {
      items: listRes.rows.map(mapLedgerRow),
      total: Math.max(0, Number(countRes.rows[0]?.cnt) || listRes.rows.length),
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] listUserLedgerFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function listUserPayoutsFromDb(
  userId: string,
  limit = 15,
  offset = 0
): Promise<{ items: PayoutRequestRecord[]; total: number; limit: number; offset: number }> {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    const countRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM payout_requests WHERE user_id = $1`,
      [userId]
    );
    const listRes = await client.query<{
      id: string;
      user_id: string;
      points_spent: number;
      usd_amount: string;
      idr_amount: string;
      fx_rate_used: string;
      currency: string;
      method: string;
      bank_code: string;
      network: string;
      destination_account: string;
      account_holder_name: string;
      status: string;
      admin_note: string;
      idempotency_key: string | null;
      risk_flag: string;
      suspicious_reason: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
              currency, method, bank_code, network, destination_account, account_holder_name,
              status, admin_note, idempotency_key, risk_flag, suspicious_reason, created_at, updated_at
       FROM payout_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset]
    );
    return {
      items: listRes.rows.map((r) => mapPayoutRow(r, true)),
      total: Math.max(0, Number(countRes.rows[0]?.cnt) || listRes.rows.length),
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] listUserPayoutsFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function claimDailyCheckinInDb(input: {
  userId: string;
  displayName?: string;
  timeZone?: string | null;
}): Promise<{
  ok: boolean;
  reason?: 'duplicate_claim' | 'cooldown_active' | 'daily_cap_reached';
  cooldownSecondsRemaining?: number;
  streakDay?: number;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${input.userId}`,
    ]);

    const { timeZone, todayKey, yesterdayKey, periodStartAt, nextResetAt } =
      await resolveUserTimeZonePg(client, input.userId, input.timeZone, true);
    const referenceId = `checkin:${input.userId}:${todayKey}`;
    const checkinPrefix = `checkin:${input.userId}:%`;

    const dupCheckin = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM daily_checkins
       WHERE user_id = $1
         AND (checkin_date = $2::date OR (created_at >= $3 AND created_at < $4))
       LIMIT 1`,
      [input.userId, todayKey, periodStartAt, nextResetAt]
    );
    const dupLedger = await client.query<{ id: string }>(
      `SELECT id
       FROM points_ledger
       WHERE user_id = $1
         AND (
           reference_id = $2
           OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
         )
       LIMIT 1`,
      [input.userId, referenceId, checkinPrefix, periodStartAt, nextResetAt]
    );
    const recentGapCheck = await client.query<{ last_at: Date | null }>(
      `SELECT MAX(created_at) AS last_at FROM daily_checkins WHERE user_id = $1`,
      [input.userId]
    );
    const lastCheckinAt =
      recentGapCheck.rows[0]?.last_at instanceof Date ? recentGapCheck.rows[0].last_at : null;
    const violatedMinGap =
      lastCheckinAt !== null && Date.now() - lastCheckinAt.getTime() < CHECKIN_MIN_GAP_MS;

    if (dupCheckin.rows.length > 0 || dupLedger.rows.length > 0 || violatedMinGap) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', summary };
    }

    const statsRes = await client.query<{
      balance: string;
      lifetime_earned_for_level: string;
      today_earned: string;
      last_claim_at: Date | null;
    }>(
      `SELECT
         (COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0))::text AS balance,
         COALESCE(SUM(CASE WHEN type = 'earn' AND reference_id NOT LIKE 'refund:payout:%' THEN points ELSE 0 END), 0)::text AS lifetime_earned_for_level,
         COALESCE(SUM(
           CASE
             WHEN type = 'earn'
              AND reference_id NOT LIKE 'refund:payout:%'
              AND reference_id NOT LIKE 'welcome_login:%'
              AND created_at >= $2
              AND created_at < $3
             THEN points
             ELSE 0
           END
         ), 0)::text AS today_earned,
         MAX(
           CASE
             WHEN type = 'earn'
              AND reference_id LIKE 'checkin:%'
             THEN created_at
             ELSE NULL
           END
         ) AS last_claim_at
       FROM points_ledger
       WHERE user_id = $1`,
      [input.userId, periodStartAt, nextResetAt]
    );

    const telLevelRes = await client.query<{
      verified_watch_seconds: number;
      today_watch_seconds: number;
      today_date_key: string;
      risk_flag: string;
    }>(
      `SELECT verified_watch_seconds, today_watch_seconds, today_date_key, risk_flag
       FROM watch_telemetry
       WHERE user_id = $1
       LIMIT 1`,
      [input.userId]
    );

    const currentBalance = Math.max(0, Number(statsRes.rows[0]?.balance) || 0);
    const lifetimeEarnedForLevel = Math.max(
      0,
      Number(statsRes.rows[0]?.lifetime_earned_for_level) || 0
    );
    const verifiedWatchSec = Math.max(
      0,
      Number(telLevelRes.rows[0]?.verified_watch_seconds) || 0
    );
    const levelInfo = resolveAccountLevelStatus(
      lifetimeEarnedForLevel,
      verifiedWatchSec,
      cfg
    );
    const yestRes = await client.query<{ streak_day: number }>(
      `SELECT streak_day FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date LIMIT 1`,
      [input.userId, yesterdayKey]
    );
    const streakDay =
      yestRes.rows[0] && Number(yestRes.rows[0].streak_day) > 0
        ? Number(yestRes.rows[0].streak_day) + 1
        : 1;
    const cycleDay = ((streakDay - 1) % 7) + 1;
    const checkinAmount =
      cycleDay === 7 ? levelInfo.dailyCheckinDay7Points : levelInfo.dailyCheckinPoints;
    const todayEarned = Math.max(0, Number(statsRes.rows[0]?.today_earned) || 0);
    const lastClaimAt =
      statsRes.rows[0]?.last_claim_at instanceof Date ? statsRes.rows[0].last_claim_at : null;

    if (lastClaimAt) {
      const elapsedSec = Math.floor((Date.now() - lastClaimAt.getTime()) / 1000);
      if (elapsedSec < cfg.claimCooldownSeconds) {
        const remaining = Math.max(1, cfg.claimCooldownSeconds - elapsedSec);
        const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
        await client.query('COMMIT');
        return {
          ok: false,
          reason: 'cooldown_active',
          cooldownSecondsRemaining: remaining,
          summary,
        };
      }
    }

    if (todayEarned + checkinAmount > cfg.maxDailyEarnPoints) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_cap_reached', summary };
    }

    const ledgerId = crypto.randomUUID();
    const balanceAfter = currentBalance + checkinAmount;
    const checkinDesc =
      levelInfo.level > 1
        ? `Check-in Harian (Hari ke-${streakDay} · ${levelInfo.tierName} ${levelInfo.multiplier}x)`
        : `Check-in Harian (Hari ke-${streakDay})`;
    const checkinMeta: PointsLedgerEventMeta = {
      streakDay,
      level: levelInfo.level,
      tierName: levelInfo.tierName,
      multiplier: levelInfo.multiplier,
    };
    const inserted = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'daily_checkin', $5::jsonb, $6, $7, NOW())
       RETURNING id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at`,
      [
        ledgerId,
        input.userId,
        checkinAmount,
        checkinDesc,
        JSON.stringify(checkinMeta),
        referenceId,
        balanceAfter,
      ]
    );

    await client.query(
      `INSERT INTO daily_checkins (user_id, checkin_date, streak_day, points_awarded, ledger_id, created_at)
       VALUES ($1, $2::date, $3, $4, $5, NOW())
       ON CONFLICT (user_id, checkin_date) DO NOTHING`,
      [input.userId, todayKey, streakDay, checkinAmount, ledgerId]
    );

    await client.query(
      `UPDATE users
       SET streak_count = $2,
           last_visit_date = $3,
           is_vip = CASE WHEN $2 >= 3 THEN TRUE ELSE is_vip END,
           updated_at = NOW()
       WHERE uid = $1`,
      [input.userId, streakDay, todayKey]
    );

    const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
    await client.query('COMMIT');
    return {
      ok: true,
      streakDay,
      entry: inserted.rows[0] ? mapLedgerRow(inserted.rows[0]) : undefined,
      summary,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] claimDailyCheckinInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export const ALLOWED_SOCIAL_SHARE_CHANNELS = new Set([
  'whatsapp',
  'telegram',
  'x',
  'facebook',
  'copy_link',
  'native_share',
] as const);

export type SocialShareChannel =
  | 'whatsapp'
  | 'telegram'
  | 'x'
  | 'facebook'
  | 'copy_link'
  | 'native_share';

const SOCIAL_SHARE_CHANNEL_LABELS: Record<SocialShareChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  x: 'X',
  facebook: 'Facebook',
  copy_link: 'Copy Link',
  native_share: 'Share',
};

export async function claimDailySocialShareInDb(input: {
  userId: string;
  channel: string;
  displayName?: string;
  timeZone?: string | null;
}): Promise<{
  ok: boolean;
  reason?:
    | 'duplicate_claim'
    | 'daily_cap_reached'
    | 'invalid_channel'
    | 'anti_cheat_blocked';
  channel?: SocialShareChannel;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();
  const rawChannel = String(input.channel || '')
    .trim()
    .toLowerCase();
  const normalizedChannel = rawChannel === 'twitter' ? 'x' : rawChannel;
  if (!ALLOWED_SOCIAL_SHARE_CHANNELS.has(normalizedChannel as SocialShareChannel)) {
    const summary = await getUserPointsSummaryFromDb(input.userId, input.timeZone);
    return { ok: false, reason: 'invalid_channel', summary };
  }
  const channel = normalizedChannel as SocialShareChannel;

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${input.userId}`,
    ]);

    const { timeZone, todayKey, periodStartAt, nextResetAt } =
      await resolveUserTimeZonePg(client, input.userId, input.timeZone, true);

    await client.query(
      `INSERT INTO users (uid, email, display_name, updated_at)
       VALUES ($1, '', $2, NOW())
       ON CONFLICT (uid) DO NOTHING`,
      [input.userId, (input.displayName || 'Kano Viewer').slice(0, 80)]
    );

    const secSigRes = await client.query<{ risk_flag: string }>(
      `SELECT risk_flag FROM user_security_signals WHERE user_id = $1`,
      [input.userId]
    );
    const telRiskRes = await client.query<{ risk_flag: string }>(
      `SELECT risk_flag FROM watch_telemetry WHERE user_id = $1 LIMIT 1`,
      [input.userId]
    );
    if (secSigRes.rows[0]?.risk_flag || telRiskRes.rows[0]?.risk_flag) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'anti_cheat_blocked', summary };
    }

    const referenceId = `social_share:${input.userId}:${todayKey}`;
    const sharePrefix = `social_share:${input.userId}:%`;
    const dupLedger = await client.query<{ id: string }>(
      `SELECT id
       FROM points_ledger
       WHERE user_id = $1
         AND (
           reference_id = $2
           OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
         )
       LIMIT 1`,
      [input.userId, referenceId, sharePrefix, periodStartAt, nextResetAt]
    );

    if (dupLedger.rows.length > 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', summary };
    }

    const statsRes = await client.query<{
      balance: string;
      today_earned: string;
    }>(
      `SELECT
         (COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0))::text AS balance,
         COALESCE(SUM(
           CASE
             WHEN type = 'earn'
              AND reference_id NOT LIKE 'refund:payout:%'
              AND reference_id NOT LIKE 'welcome_login:%'
              AND created_at >= $2
              AND created_at < $3
             THEN points
             ELSE 0
           END
         ), 0)::text AS today_earned
       FROM points_ledger
       WHERE user_id = $1`,
      [input.userId, periodStartAt, nextResetAt]
    );

    const currentBalance = Math.max(0, Number(statsRes.rows[0]?.balance) || 0);
    const todayEarned = Math.max(0, Number(statsRes.rows[0]?.today_earned) || 0);
    const sharePoints = Math.max(1, Math.floor(cfg.dailySocialSharePoints || 1_000));

    if (todayEarned + sharePoints > cfg.maxDailyEarnPoints) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_cap_reached', summary };
    }

    const channelLabel = SOCIAL_SHARE_CHANNEL_LABELS[channel];
    const shareMeta: PointsLedgerEventMeta = { shareChannel: channel };
    const inserted = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'daily_social_share', $5::jsonb, $6, $7, NOW())
       ON CONFLICT (reference_id) DO NOTHING
       RETURNING id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at`,
      [
        crypto.randomUUID(),
        input.userId,
        sharePoints,
        `Misi Share Media Sosial Harian (${channelLabel})`,
        JSON.stringify(shareMeta),
        referenceId,
        currentBalance + sharePoints,
      ]
    );

    if (inserted.rows.length === 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', summary };
    }

    const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
    await client.query('COMMIT');
    return {
      ok: true,
      channel,
      entry: inserted.rows[0] ? mapLedgerRow(inserted.rows[0]) : undefined,
      summary,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] claimDailySocialShareInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function claimWatchMilestoneInDb(input: {
  userId: string;
  milestoneMinutes: number;
  displayName?: string;
  timeZone?: string | null;
}): Promise<{
  ok: boolean;
  reason?:
    | 'invalid_milestone'
    | 'milestone_not_reached'
    | 'duplicate_claim'
    | 'daily_cap_reached'
    | 'daily_watch_cap_reached';
  milestoneMinutes?: number;
  awardedPoints?: number;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();
  const targetMin = Math.floor(Number(input.milestoneMinutes) || 0);
  const validMilestone = cfg.dailyMissionMilestones.find((m) => m.minutes === targetMin);
  if (!validMilestone) {
    const summary = await getUserPointsSummaryFromDb(input.userId, input.timeZone);
    return { ok: false, reason: 'invalid_milestone', summary };
  }

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${input.userId}`,
    ]);

    const { timeZone, todayKey, periodStartAt, nextResetAt } = await resolveUserTimeZonePg(
      client,
      input.userId,
      input.timeZone,
      true
    );
    const referenceId = `mission_${validMilestone.minutes}m:${input.userId}:${todayKey}`;
    const milestonePrefix = `mission_${validMilestone.minutes}m:${input.userId}:%`;

    const dupLedger = await client.query<{ id: string }>(
      `SELECT id
       FROM points_ledger
       WHERE user_id = $1
         AND (
           reference_id = $2
           OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
         )
       LIMIT 1`,
      [input.userId, referenceId, milestonePrefix, periodStartAt, nextResetAt]
    );
    if (dupLedger.rows.length > 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', summary };
    }

    const telRes = await client.query<{
      verified_watch_seconds: number;
      today_watch_seconds: number;
      today_date_key: string;
      risk_flag: string;
    }>(
      `SELECT verified_watch_seconds, today_watch_seconds, today_date_key, risk_flag
       FROM watch_telemetry
       WHERE user_id = $1
       LIMIT 1`,
      [input.userId]
    );
    const telRow = telRes.rows[0];
    const verifiedWatchSec = Math.max(0, Number(telRow?.verified_watch_seconds) || 0);
    const effectiveTodayWatchSec =
      telRow && telRow.today_date_key === todayKey
        ? Math.max(0, Number(telRow.today_watch_seconds) || 0)
        : 0;

    if (effectiveTodayWatchSec < validMilestone.minutes * 60) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return {
        ok: false,
        reason: 'milestone_not_reached',
        milestoneMinutes: validMilestone.minutes,
        summary,
      };
    }

    const stats = await getQuickPointsStatePg(
      client,
      input.userId,
      periodStartAt,
      nextResetAt
    );
    const levelInfo = resolveAccountLevelStatus(
      stats.lifetimeEarnedForLevel,
      verifiedWatchSec,
      cfg
    );
    const scaledMilestone = levelInfo.dailyMissionMilestones.find(
      (m) => m.minutes === validMilestone.minutes
    );
    const bonusAmount = Math.max(
      1,
      scaledMilestone?.bonusPoints ?? Math.round(validMilestone.bonusPoints * levelInfo.multiplier)
    );

    if (stats.todayEarned + bonusAmount > cfg.maxDailyEarnPoints) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_cap_reached', summary };
    }

    if (stats.todayWatchPointsEarned + bonusAmount > cfg.maxDailyWatchPoints) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_watch_cap_reached', summary };
    }

    const ledgerId = crypto.randomUUID();
    const balanceAfter = stats.balance + bonusAmount;
    const desc =
      levelInfo.level > 1
        ? `Bonus Milestone Nonton ${validMilestone.minutes} Menit · ${levelInfo.tierName} ${levelInfo.multiplier}x`
        : `Bonus Milestone Nonton ${validMilestone.minutes} Menit`;
    const milestoneMeta: PointsLedgerEventMeta = {
      milestoneMinutes: validMilestone.minutes,
      level: levelInfo.level,
      tierName: levelInfo.tierName,
      multiplier: levelInfo.multiplier,
    };

    const inserted = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'watch_milestone', $5::jsonb, $6, $7, NOW())
       ON CONFLICT (reference_id) DO NOTHING
       RETURNING id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at`,
      [
        ledgerId,
        input.userId,
        bonusAmount,
        desc.slice(0, 240),
        JSON.stringify(milestoneMeta),
        referenceId,
        balanceAfter,
      ]
    );

    if (inserted.rows.length === 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', summary };
    }

    const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
    await client.query('COMMIT');
    return {
      ok: true,
      milestoneMinutes: validMilestone.minutes,
      awardedPoints: bonusAmount,
      entry: mapLedgerRow(inserted.rows[0]),
      summary,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] claimWatchMilestoneInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function claimEpisodeBonusInDb(input: {
  userId: string;
  provider: string;
  dramaId: string;
  episodeNumber: number;
  title?: string;
  sessionToken?: string;
  displayName?: string;
  timeZone?: string | null;
}): Promise<{
  ok: boolean;
  reason?:
    | 'invalid_episode'
    | 'duplicate_claim'
    | 'daily_episode_cap_reached'
    | 'daily_cap_reached'
    | 'watch_duration_insufficient'
    | 'anti_cheat_blocked';
  episodeNumber?: number;
  awardedPoints?: number;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();
  const cleanProvider =
    String(input.provider || 'DramaBoxV2')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 48) || 'DramaBoxV2';
  const cleanDramaId = String(input.dramaId || '')
    .trim()
    .replace(/:/g, '_')
    .slice(0, 120);
  const epNum = Math.floor(Number(input.episodeNumber) || 0);
  const cleanTitle = String(input.title || '').trim().slice(0, 120);
  const cleanSessionToken = String(input.sessionToken || '').trim().slice(0, 80);

  if (!cleanDramaId || !Number.isFinite(epNum) || epNum < 1) {
    const summary = await getUserPointsSummaryFromDb(input.userId, input.timeZone);
    return { ok: false, reason: 'invalid_episode', summary };
  }

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${input.userId}`,
    ]);

    const { timeZone, periodStartAt, nextResetAt } = await resolveUserTimeZonePg(
      client,
      input.userId,
      input.timeZone,
      true
    );

    const secSigRes = await client.query<{ risk_flag: string }>(
      `SELECT risk_flag FROM user_security_signals WHERE user_id = $1`,
      [input.userId]
    );
    const telRiskRes = await client.query<{ risk_flag: string }>(
      `SELECT risk_flag FROM watch_telemetry WHERE user_id = $1 LIMIT 1`,
      [input.userId]
    );
    if (secSigRes.rows[0]?.risk_flag || telRiskRes.rows[0]?.risk_flag) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'anti_cheat_blocked', summary };
    }

    const dupEp = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM rewarded_episodes
       WHERE user_id = $1 AND LOWER(provider) = LOWER($2) AND drama_id = $3 AND episode_number = $4
       LIMIT 1`,
      [input.userId, cleanProvider, cleanDramaId, epNum]
    );
    const referenceId = `watch:${input.userId}:${cleanProvider}:${cleanDramaId}:${epNum}`;
    const dupLedger = await client.query<{ id: string }>(
      `SELECT id FROM points_ledger WHERE reference_id = $1 LIMIT 1`,
      [referenceId]
    );
    if (dupEp.rows.length > 0 || dupLedger.rows.length > 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', episodeNumber: epNum, summary };
    }

    const dailyEpRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM rewarded_episodes
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [input.userId, periodStartAt, nextResetAt]
    );
    const dailyEpCount = Math.max(0, Number(dailyEpRes.rows[0]?.cnt) || 0);
    if (dailyEpCount >= cfg.maxDailyEpisodeBonusCount) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_episode_cap_reached', episodeNumber: epNum, summary };
    }

    const mediaKey = `${cleanProvider}:${cleanDramaId}:ep${epNum}`;
    const sessMatchRes = await client.query<{
      session_token: string;
      accumulated_sec: number;
    }>(
      `SELECT session_token, accumulated_sec
       FROM watch_sessions
       WHERE user_id = $1
         AND (
           ($2 <> '' AND session_token = $2)
           OR (LOWER(provider) = LOWER($3) AND drama_id = $4 AND episode_number = $5)
           OR LOWER(media_key) = LOWER($6)
         )
       ORDER BY accumulated_sec DESC
       LIMIT 1`,
      [input.userId, cleanSessionToken, cleanProvider, cleanDramaId, epNum, mediaKey]
    );
    const sessionRow = sessMatchRes.rows[0];
    const verifiedSessionSec = Math.max(0, Number(sessionRow?.accumulated_sec) || 0);
    if (verifiedSessionSec < cfg.episodeBonusMinWatchSeconds) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return {
        ok: false,
        reason: 'watch_duration_insufficient',
        episodeNumber: epNum,
        summary,
      };
    }

    const stats = await getQuickPointsStatePg(
      client,
      input.userId,
      periodStartAt,
      nextResetAt
    );
    const bonusAmount = Math.max(1, Math.floor(cfg.episodeBonusPoints || 500));
    if (stats.todayEarned + bonusAmount > cfg.maxDailyEarnPoints) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'daily_cap_reached', episodeNumber: epNum, summary };
    }

    const ledgerId = crypto.randomUUID();
    const balanceAfter = stats.balance + bonusAmount;
    const desc = cleanTitle
      ? `Bonus Episode Baru: ${cleanTitle} Ep ${epNum}`
      : `Bonus Episode Baru (${cleanProvider} Ep ${epNum})`;
    const epMeta: PointsLedgerEventMeta = {
      provider: cleanProvider,
      dramaId: cleanDramaId,
      episodeNumber: epNum,
      ...(cleanTitle ? { title: cleanTitle } : {}),
    };

    const inserted = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'watch_episode', $5::jsonb, $6, $7, NOW())
       ON CONFLICT (reference_id) DO NOTHING
       RETURNING id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at`,
      [
        ledgerId,
        input.userId,
        bonusAmount,
        desc.slice(0, 240),
        JSON.stringify(epMeta),
        referenceId,
        balanceAfter,
      ]
    );

    if (inserted.rows.length === 0) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
      await client.query('COMMIT');
      return { ok: false, reason: 'duplicate_claim', episodeNumber: epNum, summary };
    }

    await client.query(
      `INSERT INTO rewarded_episodes (user_id, provider, drama_id, episode_number, points_awarded, session_token, ledger_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, provider, drama_id, episode_number) DO NOTHING`,
      [
        input.userId,
        cleanProvider,
        cleanDramaId,
        epNum,
        bonusAmount,
        sessionRow?.session_token || cleanSessionToken,
        ledgerId,
      ]
    );

    const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg, timeZone);
    await client.query('COMMIT');
    return {
      ok: true,
      episodeNumber: epNum,
      awardedPoints: bonusAmount,
      entry: mapLedgerRow(inserted.rows[0]),
      summary,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] claimEpisodeBonusInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function grantFirstLoginBonusIfEligibleInDb(input: {
  userId: string;
  displayName?: string;
}): Promise<{
  granted: boolean;
  points: number;
  dbConnected: boolean;
  entry?: PointsLedgerRecord;
}> {
  const cleanUserId = String(input.userId || '').trim();
  if (!cleanUserId) {
    return { granted: false, points: 0, dbConnected: false };
  }

  const activePool = getPool();
  if (!activePool || !(await ensureDatabaseReady()) || !dbAvailable) {
    return { granted: false, points: 0, dbConnected: false };
  }

  const cfg = getPayoutRuntimeConfig();
  const bonusPoints = Math.max(0, Math.floor(cfg.firstLoginBonusPoints || 0));
  if (bonusPoints <= 0) {
    return { granted: false, points: 0, dbConnected: true };
  }

  const referenceId = `welcome_login:${cleanUserId}`;
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${cleanUserId}`,
    ]);

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM points_ledger WHERE reference_id = $1 LIMIT 1`,
      [referenceId]
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return { granted: false, points: 0, dbConnected: true };
    }

    const balRes = await client.query<{ balance: string }>(
      `SELECT (COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0))::text AS balance FROM points_ledger WHERE user_id = $1`,
      [cleanUserId]
    );
    const currentBalance = Math.max(0, Number(balRes.rows[0]?.balance) || 0);
    const balanceAfter = currentBalance + bonusPoints;
    const ledgerId = crypto.randomUUID();
    const description = `Bonus Login Pertama (+${bonusPoints.toLocaleString('id-ID')} Poin)`;
    const welcomeMeta: PointsLedgerEventMeta = {};

    const inserted = await client.query<{
      id: string;
      user_id: string;
      type: string;
      points: number;
      description: string;
      event_code: string;
      event_meta: unknown;
      reference_id: string;
      balance_after: number | null;
      created_at: Date;
    }>(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'welcome_login', $5::jsonb, $6, $7, NOW())
       ON CONFLICT (reference_id) DO NOTHING
       RETURNING id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at`,
      [
        ledgerId,
        cleanUserId,
        bonusPoints,
        description,
        JSON.stringify(welcomeMeta),
        referenceId,
        balanceAfter,
      ]
    );

    await client.query('COMMIT');
    if (inserted.rows.length === 0) {
      return { granted: false, points: 0, dbConnected: true };
    }
    return {
      granted: true,
      points: bonusPoints,
      dbConnected: true,
      entry: mapLedgerRow(inserted.rows[0]),
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    console.warn(
      '[PostgreSQL] grantFirstLoginBonusIfEligibleInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    return { granted: false, points: 0, dbConnected: false };
  } finally {
    client?.release();
  }
}

export async function claimPointsInDb(input: {
  userId: string;
  amount: number;
  description: string;
  referenceId: string;
  displayName?: string;
}): Promise<{
  ok: boolean;
  reason?:
    | 'duplicate_claim'
    | 'cooldown_active'
    | 'daily_cap_reached'
    | 'invalid_amount'
    | 'watch_duration_insufficient';
  cooldownSecondsRemaining?: number;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  if (input.referenceId.startsWith('checkin:')) {
    return claimDailyCheckinInDb({
      userId: input.userId,
      displayName: input.displayName,
    });
  }
  const summary = await getUserPointsSummaryFromDb(input.userId);
  return { ok: false, reason: 'invalid_amount', summary };
}

export async function createPayoutRequestInDb(input: {
  userId: string;
  pointsSpent: number;
  method: PayoutMethod;
  bankCode?: string;
  network?: string;
  destinationAccount: string;
  accountHolderName: string;
  idempotencyKey?: string;
  displayName?: string;
}): Promise<{
  ok: boolean;
  deduplicated?: boolean;
  reason?: 'below_minimum' | 'insufficient_balance' | 'invalid_amount' | 'invalid_method_details';
  minRequiredPoints?: number;
  payout?: PayoutRequestRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();
  const pointsSpent = Math.floor(input.pointsSpent);
  if (!Number.isFinite(pointsSpent) || pointsSpent <= 0) {
    const summary = await getUserPointsSummaryFromDb(input.userId);
    return { ok: false, reason: 'invalid_amount', summary };
  }

  const currency = getCurrencyForMethod(input.method);
  const minRequiredPoints =
    currency === 'USD' ? cfg.minPayoutPointsUsd : cfg.minPayoutPointsIdr;
  const { usdAmount, idrAmount, fxRateUsed } = computePointsConversion(
    pointsSpent,
    cfg
  );

  const belowMinimumByCurrency =
    currency === 'IDR' ? idrAmount < cfg.minPayoutIdr : usdAmount < cfg.minPayoutUsd;

  if (pointsSpent < minRequiredPoints || belowMinimumByCurrency) {
    const summary = await getUserPointsSummaryFromDb(input.userId);
    return {
      ok: false,
      reason: 'below_minimum',
      minRequiredPoints,
      summary,
    };
  }

  const cleanBankCode =
    input.method === 'bank_transfer'
      ? String(input.bankCode || '').trim().toUpperCase().slice(0, 24)
      : '';
  if (
    input.method === 'bank_transfer' &&
    !INDONESIAN_BANK_OPTIONS.some((b) => b.code === cleanBankCode)
  ) {
    const summary = await getUserPointsSummaryFromDb(input.userId);
    return { ok: false, reason: 'invalid_method_details', summary };
  }

  const cleanNetwork = input.method.startsWith('usdt_')
    ? String(
        input.network ||
          (input.method === 'usdt_trc20'
            ? 'TRC20'
            : input.method === 'usdt_bep20'
            ? 'BEP20'
            : input.method === 'usdt_erc20'
            ? 'ERC20'
            : 'Polygon')
      )
        .trim()
        .slice(0, 24)
    : '';

  const methodMeta = getMethodMetadata(input.method, cleanBankCode);
  const cleanDest = input.destinationAccount.trim().slice(0, 160);
  const cleanHolder = input.accountHolderName.trim().slice(0, 100);
  const cleanIdemKey = String(input.idempotencyKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 80);

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${input.userId}`,
    ]);

    if (cleanIdemKey) {
      const existingByIdem = await client.query<{
        id: string;
        user_id: string;
        points_spent: number;
        usd_amount: string;
        idr_amount: string;
        fx_rate_used: string;
        currency: string;
        method: string;
        bank_code: string;
        network: string;
        destination_account: string;
        account_holder_name: string;
        status: string;
        admin_note: string;
        idempotency_key: string | null;
        risk_flag: string;
        suspicious_reason: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
                currency, method, bank_code, network, destination_account, account_holder_name,
                status, admin_note, idempotency_key, risk_flag, suspicious_reason, created_at, updated_at
         FROM payout_requests
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [input.userId, cleanIdemKey]
      );
      if (existingByIdem.rows[0]) {
        const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
        await client.query('COMMIT');
        return {
          ok: true,
          deduplicated: true,
          payout: mapPayoutRow(existingByIdem.rows[0], true),
          summary,
        };
      }
    }

    const balRes = await client.query<{ balance: string }>(
      `SELECT (
         COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
       )::text AS balance
       FROM points_ledger
       WHERE user_id = $1`,
      [input.userId]
    );
    const balance = Math.max(0, Number(balRes.rows[0]?.balance) || 0);
    if (balance < pointsSpent) {
      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
      await client.query('COMMIT');
      return { ok: false, reason: 'insufficient_balance', summary };
    }

    // Multi-account destination & existing risk check
    const sharedDestRes = await client.query<{ user_id: string }>(
      `SELECT DISTINCT user_id
       FROM payout_requests
       WHERE LOWER(destination_account) = LOWER($1) AND user_id <> $2
       LIMIT 5`,
      [cleanDest, input.userId]
    );
    const signalRes = await client.query<{
      sec_risk: string | null;
      sec_reason: string | null;
      tel_risk: string | null;
      tel_reason: string | null;
    }>(
      `SELECT s.risk_flag AS sec_risk, s.suspicious_reason AS sec_reason,
              t.risk_flag AS tel_risk, t.suspicious_reason AS tel_reason
       FROM (SELECT $1::text AS uid) base
       LEFT JOIN user_security_signals s ON s.user_id = base.uid
       LEFT JOIN watch_telemetry t ON t.user_id = base.uid`,
      [input.userId]
    );

    const flags: string[] = [];
    const reasons: string[] = [];
    const sigRow = signalRes.rows[0];
    if (sigRow?.sec_risk) flags.push(sigRow.sec_risk);
    if (sigRow?.sec_reason) reasons.push(sigRow.sec_reason);
    if (sigRow?.tel_risk && !flags.includes(sigRow.tel_risk)) flags.push(sigRow.tel_risk);
    if (sigRow?.tel_reason && !reasons.includes(sigRow.tel_reason)) reasons.push(sigRow.tel_reason);

    if (sharedDestRes.rows.length > 0) {
      flags.push('shared_destination_account');
      reasons.push(
        `Destination account shared with ${sharedDestRes.rows.length} other account(s)`
      );
      await client.query(
        `INSERT INTO user_security_signals (user_id, risk_flag, suspicious_reason, last_seen_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           risk_flag = CASE WHEN user_security_signals.risk_flag = '' THEN EXCLUDED.risk_flag ELSE user_security_signals.risk_flag || ',shared_destination_account' END,
           suspicious_reason = CASE WHEN user_security_signals.suspicious_reason = '' THEN EXCLUDED.suspicious_reason ELSE user_security_signals.suspicious_reason || '; ' || EXCLUDED.suspicious_reason END,
           last_seen_at = NOW()`,
        [
          input.userId,
          'shared_destination_account',
          'Destination account previously used by another user',
        ]
      );
      const otherUids = sharedDestRes.rows.map((r) => r.user_id);
      await client.query(
        `UPDATE referrals
         SET status = 'rejected_fraud',
             risk_flag = 'shared_payout_destination',
             suspicious_reason = 'Referee and referrer share identical payout destination account',
             updated_at = NOW()
         WHERE (referee_uid = $1 AND referrer_uid = ANY($2::text[]))
            OR (referrer_uid = $1 AND referee_uid = ANY($2::text[]))`,
        [input.userId, otherUids]
      );
    }

    const riskFlag = Array.from(new Set(flags)).join(',').slice(0, 120);
    const suspiciousReason = Array.from(new Set(reasons)).join('; ').slice(0, 300);

    const payoutId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const refId = `payout:${payoutId}`;
    const balanceAfter = Math.max(0, balance - pointsSpent);

    const payoutRes = await client.query<{
      id: string;
      user_id: string;
      points_spent: number;
      usd_amount: string;
      idr_amount: string;
      fx_rate_used: string;
      currency: string;
      method: string;
      bank_code: string;
      network: string;
      destination_account: string;
      account_holder_name: string;
      status: string;
      admin_note: string;
      idempotency_key: string | null;
      risk_flag: string;
      suspicious_reason: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO payout_requests (
         id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
         currency, method, bank_code, network, destination_account, account_holder_name,
         status, admin_note, idempotency_key, risk_flag, suspicious_reason, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', '', NULLIF($13, ''), $14, $15, NOW(), NOW())
       RETURNING id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
                 currency, method, bank_code, network, destination_account, account_holder_name,
                 status, admin_note, idempotency_key, risk_flag, suspicious_reason, created_at, updated_at`,
      [
        payoutId,
        input.userId,
        pointsSpent,
        usdAmount,
        idrAmount,
        fxRateUsed,
        currency,
        input.method,
        cleanBankCode,
        cleanNetwork,
        cleanDest,
        cleanHolder,
        cleanIdemKey,
        riskFlag,
        suspiciousReason,
      ]
    );

    const payoutLedgerMeta: PointsLedgerEventMeta = {
      methodLabel: methodMeta.label,
      currency,
      payoutId: payoutId.slice(0, 8),
    };
    await client.query(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'redeem', $3, $4, 'payout_request', $5::jsonb, $6, $7, NOW())`,
      [
        ledgerId,
        input.userId,
        pointsSpent,
        `Penarikan ${methodMeta.label} (${currency})`,
        JSON.stringify(payoutLedgerMeta),
        refId,
        balanceAfter,
      ]
    );

    const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
    await client.query('COMMIT');
    return {
      ok: true,
      payout: payoutRes.rows[0] ? mapPayoutRow(payoutRes.rows[0], true) : undefined,
      summary,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] createPayoutRequestInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export interface AdminPayoutRequestView extends PayoutRequestRecord {
  userName?: string;
  userEmail?: string;
  verifiedWatchSeconds: number;
  fastDeltaStrikes: number;
  concurrentTabStrikes: number;
  signalRiskFlag?: string;
  signalSuspiciousReason?: string;
}

export async function listAdminPayoutRequestsFromDb(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AdminPayoutRequestView[]; total: number }> {
  const safeStatus = String(options?.status || 'all').trim().toLowerCase();
  const hasFilter = VALID_PAYOUT_STATUSES.has(safeStatus);
  const safeLimit = Math.min(200, Math.max(1, Number(options?.limit) || 50));
  const safeOffset = Math.max(0, Number(options?.offset) || 0);

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    const countRes = await client.query<{ cnt: string }>(
      hasFilter
        ? `SELECT COUNT(*)::text AS cnt FROM payout_requests WHERE status = $1`
        : `SELECT COUNT(*)::text AS cnt FROM payout_requests`,
      hasFilter ? [safeStatus] : []
    );
    const listRes = await client.query<{
      id: string;
      user_id: string;
      points_spent: number;
      usd_amount: string;
      idr_amount: string;
      fx_rate_used: string;
      currency: string;
      method: string;
      bank_code: string;
      network: string;
      destination_account: string;
      account_holder_name: string;
      status: string;
      admin_note: string;
      idempotency_key: string | null;
      risk_flag: string;
      suspicious_reason: string;
      created_at: Date;
      updated_at: Date;
      user_name: string | null;
      user_email: string | null;
      verified_watch_seconds: number | null;
      fast_delta_strikes: number | null;
      concurrent_tab_strikes: number | null;
      signal_risk_flag: string | null;
      signal_suspicious_reason: string | null;
    }>(
      hasFilter
        ? `SELECT p.*,
                  u.display_name AS user_name,
                  u.email AS user_email,
                  COALESCE(t.verified_watch_seconds, 0) AS verified_watch_seconds,
                  COALESCE(t.fast_delta_strikes, 0) AS fast_delta_strikes,
                  COALESCE(t.concurrent_tab_strikes, 0) AS concurrent_tab_strikes,
                  COALESCE(NULLIF(s.risk_flag, ''), t.risk_flag, '') AS signal_risk_flag,
                  COALESCE(NULLIF(s.suspicious_reason, ''), t.suspicious_reason, '') AS signal_suspicious_reason
           FROM payout_requests p
           LEFT JOIN users u ON u.uid = p.user_id
           LEFT JOIN watch_telemetry t ON t.user_id = p.user_id
           LEFT JOIN user_security_signals s ON s.user_id = p.user_id
           WHERE p.status = $1
           ORDER BY p.created_at DESC
           LIMIT $2 OFFSET $3`
        : `SELECT p.*,
                  u.display_name AS user_name,
                  u.email AS user_email,
                  COALESCE(t.verified_watch_seconds, 0) AS verified_watch_seconds,
                  COALESCE(t.fast_delta_strikes, 0) AS fast_delta_strikes,
                  COALESCE(t.concurrent_tab_strikes, 0) AS concurrent_tab_strikes,
                  COALESCE(NULLIF(s.risk_flag, ''), t.risk_flag, '') AS signal_risk_flag,
                  COALESCE(NULLIF(s.suspicious_reason, ''), t.suspicious_reason, '') AS signal_suspicious_reason
           FROM payout_requests p
           LEFT JOIN users u ON u.uid = p.user_id
           LEFT JOIN watch_telemetry t ON t.user_id = p.user_id
           LEFT JOIN user_security_signals s ON s.user_id = p.user_id
           ORDER BY p.created_at DESC
           LIMIT $1 OFFSET $2`,
      hasFilter ? [safeStatus, safeLimit, safeOffset] : [safeLimit, safeOffset]
    );

    return {
      total: Number(countRes.rows[0]?.cnt) || listRes.rows.length,
      items: listRes.rows.map((r) => ({
        ...mapPayoutRow(r, false),
        userName: r.user_name || undefined,
        userEmail: r.user_email || undefined,
        verifiedWatchSeconds: Math.max(0, Number(r.verified_watch_seconds) || 0),
        fastDeltaStrikes: Math.max(0, Number(r.fast_delta_strikes) || 0),
        concurrentTabStrikes: Math.max(0, Number(r.concurrent_tab_strikes) || 0),
        signalRiskFlag: r.signal_risk_flag || r.risk_flag || '',
        signalSuspiciousReason:
          r.signal_suspicious_reason || r.suspicious_reason || '',
      })),
    };
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] listAdminPayoutRequestsFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

const FINAL_PAYOUT_STATUSES: ReadonlySet<string> = new Set([
  'paid',
  'completed',
  'rejected',
  'failed',
]);

export async function updateAdminPayoutStatusInDb(input: {
  payoutId: string;
  status: 'processing' | 'approved' | 'paid' | 'completed' | 'rejected' | 'failed';
  adminNote?: string;
}): Promise<{
  ok: boolean;
  reason?: 'not_found' | 'already_finalized' | 'invalid_transition';
  payout?: PayoutRequestRecord;
  refunded?: boolean;
  idempotent?: boolean;
}> {
  const cleanNote = String(input.adminNote || '').trim().slice(0, 300);
  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');

    const existingRes = await client.query<{
      id: string;
      user_id: string;
      points_spent: number;
      usd_amount: string;
      idr_amount: string;
      fx_rate_used: string;
      currency: string;
      method: string;
      bank_code: string;
      network: string;
      destination_account: string;
      account_holder_name: string;
      status: string;
      admin_note: string;
      idempotency_key: string | null;
      risk_flag: string;
      suspicious_reason: string;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM payout_requests WHERE id = $1 FOR UPDATE`, [
      input.payoutId,
    ]);

    const row = existingRes.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return { ok: false, reason: 'not_found' };
    }

    if (FINAL_PAYOUT_STATUSES.has(row.status)) {
      await client.query('COMMIT');
      return {
        ok: false,
        reason: 'already_finalized',
        payout: mapPayoutRow(row, false),
      };
    }

    if (row.status === input.status) {
      await client.query('COMMIT');
      return {
        ok: true,
        payout: mapPayoutRow(row, false),
        refunded: false,
        idempotent: true,
      };
    }

    if (row.status === 'approved' && input.status === 'processing') {
      await client.query('COMMIT');
      return {
        ok: false,
        reason: 'invalid_transition',
        payout: mapPayoutRow(row, false),
      };
    }

    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `points:${row.user_id}`,
    ]);

    const updatedRes = await client.query<{
      id: string;
      user_id: string;
      points_spent: number;
      usd_amount: string;
      idr_amount: string;
      fx_rate_used: string;
      currency: string;
      method: string;
      bank_code: string;
      network: string;
      destination_account: string;
      account_holder_name: string;
      status: string;
      admin_note: string;
      idempotency_key: string | null;
      risk_flag: string;
      suspicious_reason: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE payout_requests
       SET status = $2,
           admin_note = CASE WHEN $3 <> '' THEN $3 ELSE admin_note END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.payoutId, input.status, cleanNote]
    );

    let refunded = false;
    if (input.status === 'rejected' || input.status === 'failed') {
      const balRes = await client.query<{ balance: string }>(
        `SELECT (
           COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
         )::text AS balance
         FROM points_ledger
         WHERE user_id = $1`,
        [row.user_id]
      );
      const currentBalance = Math.max(0, Number(balRes.rows[0]?.balance) || 0);
      const spendPts = Math.max(1, Number(row.points_spent) || 1);
      const refundRef = `refund:payout:${row.id}`;
      const refundStatus = input.status === 'failed' ? 'failed' : 'rejected';
      const refundMeta: PointsLedgerEventMeta = {
        payoutStatus: refundStatus,
        payoutId: row.id.slice(0, 8),
      };
      const refundInsert = await client.query(
        `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
         VALUES ($1, $2, 'earn', $3, $4, 'payout_refund', $5::jsonb, $6, $7, NOW())
         ON CONFLICT (reference_id) DO NOTHING`,
        [
          crypto.randomUUID(),
          row.user_id,
          spendPts,
          `Pengembalian Poin (${input.status === 'failed' ? 'Penarikan Gagal' : 'Ditolak'}) #${row.id.slice(0, 8)}`,
          JSON.stringify(refundMeta),
          refundRef,
          currentBalance + spendPts,
        ]
      );
      refunded = (refundInsert.rowCount ?? 0) > 0;
    }

    await client.query('COMMIT');
    return {
      ok: true,
      payout: updatedRes.rows[0] ? mapPayoutRow(updatedRes.rows[0], false) : undefined,
      refunded,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] updateAdminPayoutStatusInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

interface BaselineLivePayoutSeed {
  id: string;
  maskedUser: string;
  method: PayoutMethod;
  bankCode?: string;
  currency: PayoutCurrency;
  idrAmount: number;
  usdAmount: number;
  status: 'approved' | 'paid' | 'completed';
  minutesAgo: number;
}

const BASELINE_LIVE_PAYOUT_SEEDS: readonly BaselineLivePayoutSeed[] = [
  { id: 'kd-lp-01', maskedUser: 'R***a', method: 'dana', currency: 'IDR', idrAmount: 72_800, usdAmount: 4.0, status: 'completed', minutesAgo: 6 },
  { id: 'kd-lp-02', maskedUser: 'D***n', method: 'gopay', currency: 'IDR', idrAmount: 54_600, usdAmount: 3.0, status: 'paid', minutesAgo: 19 },
  { id: 'kd-lp-03', maskedUser: 'M***l', method: 'usdt_trc20', currency: 'USD', idrAmount: 109_200, usdAmount: 6.0, status: 'completed', minutesAgo: 34 },
  { id: 'kd-lp-04', maskedUser: 'S***i', method: 'ovo', currency: 'IDR', idrAmount: 91_000, usdAmount: 5.0, status: 'paid', minutesAgo: 52 },
  { id: 'kd-lp-05', maskedUser: 'A***r', method: 'bank_transfer', bankCode: 'BCA', currency: 'IDR', idrAmount: 145_600, usdAmount: 8.0, status: 'completed', minutesAgo: 78 },
  { id: 'kd-lp-06', maskedUser: 'J***n', method: 'paypal', currency: 'USD', idrAmount: 100_100, usdAmount: 5.5, status: 'paid', minutesAgo: 104 },
  { id: 'kd-lp-07', maskedUser: 'N***a', method: 'shopeepay', currency: 'IDR', idrAmount: 63_700, usdAmount: 3.5, status: 'approved', minutesAgo: 136 },
  { id: 'kd-lp-08', maskedUser: 'B***i', method: 'bank_transfer', bankCode: 'BRI', currency: 'IDR', idrAmount: 109_200, usdAmount: 6.0, status: 'completed', minutesAgo: 171 },
  { id: 'kd-lp-09', maskedUser: 'K***n', method: 'wise', currency: 'USD', idrAmount: 136_500, usdAmount: 7.5, status: 'completed', minutesAgo: 215 },
  { id: 'kd-lp-10', maskedUser: 'F***h', method: 'dana', currency: 'IDR', idrAmount: 81_900, usdAmount: 4.5, status: 'paid', minutesAgo: 268 },
  { id: 'kd-lp-11', maskedUser: 'E***a', method: 'usdt_polygon', currency: 'USD', idrAmount: 163_800, usdAmount: 9.0, status: 'completed', minutesAgo: 324 },
  { id: 'kd-lp-12', maskedUser: 'T***o', method: 'linkaja', currency: 'IDR', idrAmount: 54_600, usdAmount: 3.0, status: 'paid', minutesAgo: 389 },
];

function buildBaselineLivePayoutFeed(
  cfg: PayoutRuntimeConfig,
  limit: number
): LivePayoutFeedItem[] {
  const now = Date.now();
  const items: LivePayoutFeedItem[] = [];
  for (const seed of BASELINE_LIVE_PAYOUT_SEEDS) {
    if (seed.currency === 'IDR' && seed.idrAmount < cfg.minPayoutIdr) continue;
    if (seed.currency === 'USD' && seed.usdAmount < cfg.minPayoutUsd) continue;
    const meta = getMethodMetadata(seed.method, seed.bankCode);
    items.push({
      id: seed.id,
      maskedUser: seed.maskedUser,
      countryCode: meta.countryCode,
      method: seed.method,
      methodLabel: meta.label,
      currency: seed.currency,
      usdAmount: Number(seed.usdAmount.toFixed(2)),
      idrAmount: seed.idrAmount,
      status: seed.status,
      createdAt: new Date(now - seed.minutesAgo * 60_000).toISOString(),
      isReal: false,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function listLivePayoutFeedFromDb(
  limit = 12
): Promise<LivePayoutFeedItem[]> {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));
  const cfg = getPayoutRuntimeConfig();
  const realItems: LivePayoutFeedItem[] = [];

  let activePool: Pool | null = null;
  try {
    activePool = await requirePointsDbPool();
  } catch {
    return buildBaselineLivePayoutFeed(cfg, safeLimit);
  }

  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    const res = await client.query<{
      id: string;
      method: string;
      bank_code: string;
      currency: string;
      usd_amount: string;
      idr_amount: string;
      status: string;
      account_holder_name: string;
      user_name: string | null;
      updated_at: Date;
    }>(
      `SELECT p.id, p.method, p.bank_code, p.currency, p.usd_amount, p.idr_amount, p.status,
              p.account_holder_name, u.display_name AS user_name, p.updated_at
       FROM payout_requests p
       LEFT JOIN users u ON u.uid = p.user_id
       WHERE p.status IN ('approved', 'paid', 'completed')
       ORDER BY p.updated_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    for (const r of res.rows) {
      const method = (ALLOWED_PAYOUT_METHODS.has(r.method as PayoutMethod)
        ? r.method
        : 'dana') as PayoutMethod;
      const meta = getMethodMetadata(method, r.bank_code);
      const currency = r.currency === 'USD' ? 'USD' : 'IDR';
      const usdAmount = Number(Number(r.usd_amount || 0).toFixed(2));
      const idrAmount = Math.max(0, Math.round(Number(r.idr_amount) || 0));
      if (currency === 'IDR' && idrAmount < cfg.minPayoutIdr) continue;
      if (currency === 'USD' && usdAmount < cfg.minPayoutUsd) continue;
      realItems.push({
        id: r.id,
        maskedUser: maskDisplayNameForFeed(r.user_name || r.account_holder_name),
        countryCode: meta.countryCode,
        method,
        methodLabel: meta.label,
        currency,
        usdAmount,
        idrAmount,
        status:
          r.status === 'completed'
            ? 'completed'
            : r.status === 'paid'
            ? 'paid'
            : 'approved',
        createdAt:
          r.updated_at instanceof Date
            ? r.updated_at.toISOString()
            : new Date().toISOString(),
        isReal: true,
      });
    }
  } catch (err) {
    console.warn(
      '[PostgreSQL] listLivePayoutFeedFromDb fallback to baseline:',
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    client?.release();
  }

  if (realItems.length >= safeLimit) {
    return realItems.slice(0, safeLimit);
  }
  const baseline = buildBaselineLivePayoutFeed(cfg, safeLimit - realItems.length);
  return [...realItems, ...baseline].slice(0, safeLimit);
}

// --- Referral System (1-Hour Verified Active Watch) & Multi-Layer Anti-Cheat ---

export async function recordUserSecuritySignalInDb(input: {
  userId: string;
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
  displayName?: string;
}): Promise<{ riskFlag: string; suspiciousReason: string; referralCode: string }> {
  const referralCode = buildReferralCodeForUser(input.userId);
  const activePool = await requirePointsDbPool();

  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET referral_code = CASE WHEN referral_code = '' THEN $2 ELSE referral_code END
       WHERE uid = $1`,
      [input.userId, referralCode]
    );

    await client.query(
      `INSERT INTO user_security_signals (
         user_id, ip_hash, subnet_hash, ua_hash, device_hash, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         ip_hash = CASE WHEN EXCLUDED.ip_hash <> '' THEN EXCLUDED.ip_hash ELSE user_security_signals.ip_hash END,
         subnet_hash = CASE WHEN EXCLUDED.subnet_hash <> '' THEN EXCLUDED.subnet_hash ELSE user_security_signals.subnet_hash END,
         ua_hash = CASE WHEN EXCLUDED.ua_hash <> '' THEN EXCLUDED.ua_hash ELSE user_security_signals.ua_hash END,
         device_hash = CASE WHEN EXCLUDED.device_hash <> '' THEN EXCLUDED.device_hash ELSE user_security_signals.device_hash END,
         last_seen_at = NOW()`,
      [
        input.userId,
        input.ipHash.slice(0, 64),
        input.subnetHash.slice(0, 64),
        input.uaHash.slice(0, 64),
        input.deviceHash.slice(0, 64),
      ]
    );

    let riskFlag = '';
    let suspiciousReason = '';

    if (input.deviceHash) {
      const devCluster = await client.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS cnt
         FROM user_security_signals
         WHERE device_hash = $1 AND last_seen_at >= NOW() - INTERVAL '7 days'`,
        [input.deviceHash]
      );
      if ((Number(devCluster.rows[0]?.cnt) || 0) >= 3) {
        riskFlag = 'multi_account_device';
        suspiciousReason = '3+ accounts detected sharing identical device fingerprint';
      }
    }

    if (!riskFlag && input.subnetHash) {
      const netCluster = await client.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS cnt
         FROM user_security_signals
         WHERE subnet_hash = $1 AND last_seen_at >= NOW() - INTERVAL '24 hours'`,
        [input.subnetHash]
      );
      if ((Number(netCluster.rows[0]?.cnt) || 0) >= 5) {
        riskFlag = 'multi_account_subnet';
        suspiciousReason = '5+ accounts detected from identical IP subnet in 24h';
      }
    }

    if (riskFlag) {
      await client.query(
        `UPDATE user_security_signals
         SET risk_flag = CASE WHEN risk_flag = '' THEN $2 ELSE risk_flag END,
             suspicious_reason = CASE WHEN suspicious_reason = '' THEN $3 ELSE suspicious_reason END
         WHERE user_id = $1`,
        [input.userId, riskFlag, suspiciousReason]
      );
    }

    const finalRow = await client.query<{
      risk_flag: string;
      suspicious_reason: string;
    }>(
      `SELECT risk_flag, suspicious_reason FROM user_security_signals WHERE user_id = $1`,
      [input.userId]
    );

    await client.query('COMMIT');
    return {
      riskFlag: finalRow.rows[0]?.risk_flag || '',
      suspiciousReason: finalRow.rows[0]?.suspicious_reason || '',
      referralCode,
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] recordUserSecuritySignalInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function bindReferralForUserInDb(input: {
  refereeUid: string;
  referralCode: string;
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
  displayName?: string;
}): Promise<{
  bound: boolean;
  status?: ReferralStatus;
  bindBonusAwarded?: number;
  reason?:
    | 'invalid_code'
    | 'self_referral'
    | 'already_referred'
    | 'account_not_new'
    | 'fraud_signal_match'
    | 'daily_limit'
    | 'weekly_limit';
}> {
  const cfg = getPayoutRuntimeConfig();
  const activePool = await requirePointsDbPool();

  const cleanCode = input.referralCode.trim().toUpperCase();
  if (!/^KD[A-F0-9]{6,12}$/.test(cleanCode)) {
    return { bound: false, reason: 'invalid_code' };
  }

  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `referral:${input.refereeUid}`,
    ]);

    const existingRef = await client.query<{ status: string }>(
      `SELECT status FROM referrals WHERE referee_uid = $1 LIMIT 1`,
      [input.refereeUid]
    );
    if (existingRef.rows.length > 0) {
      await client.query('COMMIT');
      return {
        bound: false,
        reason: 'already_referred',
        status: existingRef.rows[0].status as ReferralStatus,
      };
    }

    const referrerRes = await client.query<{ uid: string; email: string }>(
      `SELECT uid, COALESCE(LOWER(TRIM(email)), '') AS email
       FROM users
       WHERE UPPER(referral_code) = $1
       LIMIT 1`,
      [cleanCode]
    );
    const referrerUid = referrerRes.rows[0]?.uid;
    if (!referrerUid) {
      await client.query('COMMIT');
      return { bound: false, reason: 'invalid_code' };
    }

    if (referrerUid === input.refereeUid) {
      await client.query('COMMIT');
      return { bound: false, reason: 'self_referral' };
    }

    const refereeUserRes = await client.query<{ email: string }>(
      `SELECT COALESCE(LOWER(TRIM(email)), '') AS email FROM users WHERE uid = $1 LIMIT 1`,
      [input.refereeUid]
    );
    const referrerEmail = referrerRes.rows[0]?.email || '';
    const refereeEmail = refereeUserRes.rows[0]?.email || '';
    if (referrerEmail && refereeEmail && referrerEmail === refereeEmail) {
      await client.query('COMMIT');
      return { bound: false, reason: 'self_referral' };
    }

    const activityCheck = await client.query<{
      ledger_cnt: string;
      watch_sec: number | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM points_ledger WHERE user_id = $1) AS ledger_cnt,
         (SELECT verified_watch_seconds FROM watch_telemetry WHERE user_id = $1) AS watch_sec`,
      [input.refereeUid]
    );
    if (
      (Number(activityCheck.rows[0]?.ledger_cnt) || 0) > ANTI_CHEAT_DEFAULTS.newAccountMaxLedgerEntries ||
      (Number(activityCheck.rows[0]?.watch_sec) || 0) >= ANTI_CHEAT_DEFAULTS.newAccountMaxWatchSeconds
    ) {
      await client.query('COMMIT');
      return { bound: false, reason: 'account_not_new' };
    }

    const refSigRes = await client.query<{
      ip_hash: string;
      subnet_hash: string;
      ua_hash: string;
      device_hash: string;
    }>(
      `SELECT ip_hash, subnet_hash, ua_hash, device_hash
       FROM user_security_signals
       WHERE user_id = $1`,
      [referrerUid]
    );
    const refSig = refSigRes.rows[0];

    const sameIp = Boolean(input.ipHash && refSig?.ip_hash && input.ipHash === refSig.ip_hash);
    const sameDevice = Boolean(
      input.deviceHash && refSig?.device_hash && input.deviceHash === refSig.device_hash
    );
    const sameSubnetAndUa = Boolean(
      input.subnetHash &&
        refSig?.subnet_hash &&
        input.uaHash &&
        refSig?.ua_hash &&
        input.subnetHash === refSig.subnet_hash &&
        input.uaHash === refSig.ua_hash
    );

    const dupDeviceRef = input.deviceHash
      ? await client.query<{ id: string }>(
          `SELECT id FROM referrals WHERE referee_device_hash = $1 LIMIT 1`,
          [input.deviceHash]
        )
      : { rows: [] };

    if (sameIp || sameDevice || sameSubnetAndUa || dupDeviceRef.rows.length > 0) {
      const reasonText = sameDevice
        ? 'Device fingerprint matches referrer or existing referral'
        : sameIp
        ? 'IP address matches referrer'
        : sameSubnetAndUa
        ? 'IP subnet + browser UA matches referrer'
        : 'Duplicate device referral blocked';

      await client.query(
        `INSERT INTO referrals (
           id, referrer_uid, referee_uid, referral_code, status, bonus_points,
           referee_ip_hash, referee_subnet_hash, referee_ua_hash, referee_device_hash,
           risk_flag, suspicious_reason, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'rejected_fraud', $5, $6, $7, $8, $9, 'self_referral_signal_match', $10, NOW(), NOW())
         ON CONFLICT (referee_uid) DO NOTHING`,
        [
          crypto.randomUUID(),
          referrerUid,
          input.refereeUid,
          cleanCode,
          cfg.referralBonusPoints,
          input.ipHash.slice(0, 64),
          input.subnetHash.slice(0, 64),
          input.uaHash.slice(0, 64),
          input.deviceHash.slice(0, 64),
          reasonText,
        ]
      );
      await client.query(
        `INSERT INTO user_security_signals (user_id, risk_flag, suspicious_reason, last_seen_at)
         VALUES ($1, 'self_referral_attempt', $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           risk_flag = CASE WHEN user_security_signals.risk_flag = '' THEN 'self_referral_attempt' ELSE user_security_signals.risk_flag END,
           suspicious_reason = CASE WHEN user_security_signals.suspicious_reason = '' THEN EXCLUDED.suspicious_reason ELSE user_security_signals.suspicious_reason END,
           last_seen_at = NOW()`,
        [input.refereeUid, reasonText]
      );
      await client.query('COMMIT');
      return {
        bound: false,
        reason: 'fraud_signal_match',
        status: 'rejected_fraud',
      };
    }

    const canonical = getCanonicalResetPeriod();
    const refQuotaRes = await client.query<{
      daily_cnt: string;
      weekly_cnt: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::text AS daily_cnt,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS weekly_cnt
       FROM referrals
       WHERE referrer_uid = $1 AND status IN ('pending_watch', 'qualified')`,
      [referrerUid, canonical.periodStartAt, canonical.nextResetAt]
    );
    const refDailyCnt = Number(refQuotaRes.rows[0]?.daily_cnt) || 0;
    const refWeeklyCnt = Number(refQuotaRes.rows[0]?.weekly_cnt) || 0;
    if (refDailyCnt >= cfg.maxDailyReferrals) {
      await client.query('COMMIT');
      return { bound: false, reason: 'daily_limit' };
    }
    if (refWeeklyCnt >= cfg.maxWeeklyReferrals) {
      await client.query('COMMIT');
      return { bound: false, reason: 'weekly_limit' };
    }

    const bindInsert = await client.query(
      `INSERT INTO referrals (
         id, referrer_uid, referee_uid, referral_code, status, bonus_points,
         referee_ip_hash, referee_subnet_hash, referee_ua_hash, referee_device_hash,
         risk_flag, suspicious_reason, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'pending_watch', $5, $6, $7, $8, $9, '', '', NOW(), NOW())
       ON CONFLICT (referee_uid) DO NOTHING`,
      [
        crypto.randomUUID(),
        referrerUid,
        input.refereeUid,
        cleanCode,
        cfg.referralBonusPoints,
        input.ipHash.slice(0, 64),
        input.subnetHash.slice(0, 64),
        input.uaHash.slice(0, 64),
        input.deviceHash.slice(0, 64),
      ]
    );

    let bindBonusAwarded = 0;
    const bindBonusPoints = Math.max(0, Math.floor(cfg.bindReferralBonusPoints || 0));
    if ((bindInsert.rowCount ?? 0) > 0 && bindBonusPoints > 0) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `points:${input.refereeUid}`,
      ]);
      const balRes = await client.query<{ balance: string }>(
        `SELECT (
           COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
         )::text AS balance
         FROM points_ledger
         WHERE user_id = $1`,
        [input.refereeUid]
      );
      const currentBalance = Math.max(0, Number(balRes.rows[0]?.balance) || 0);
      const bindMeta: PointsLedgerEventMeta = { referralCode: cleanCode };
      const bindLedgerRes = await client.query(
        `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
         VALUES ($1, $2, 'earn', $3, $4, 'referral_bind', $5::jsonb, $6, $7, NOW())
         ON CONFLICT (reference_id) DO NOTHING`,
        [
          crypto.randomUUID(),
          input.refereeUid,
          bindBonusPoints,
          `Bonus Bind Referral (${cleanCode})`,
          JSON.stringify(bindMeta),
          `referral:bind:${input.refereeUid}`,
          currentBalance + bindBonusPoints,
        ]
      );
      if ((bindLedgerRes.rowCount ?? 0) > 0) {
        bindBonusAwarded = bindBonusPoints;
      }
    }

    await client.query('COMMIT');
    return { bound: true, status: 'pending_watch', bindBonusAwarded };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] bindReferralForUserInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

interface WatchMissionGrantResult {
  awardedWatchPoints: number;
  todayWatchPointsEarned: number;
  pointsBalance: number | null;
  levelInfo?: AccountLevelStatus;
}

async function getQuickPointsStatePg(
  client: PoolClient,
  userId: string,
  periodStartAt: Date,
  nextResetAt: Date
): Promise<{
  balance: number;
  lifetimeEarnedForLevel: number;
  todayEarned: number;
  todayWatchPointsEarned: number;
}> {
  const res = await client.query<{
    total_earned: string;
    lifetime_earned_for_level: string;
    total_redeemed: string;
    today_earned: string;
    today_watch_points: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0)::text AS total_earned,
       COALESCE(SUM(CASE WHEN type = 'earn' AND reference_id NOT LIKE 'refund:payout:%' THEN points ELSE 0 END), 0)::text AS lifetime_earned_for_level,
       COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)::text AS total_redeemed,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND reference_id NOT LIKE 'refund:payout:%'
            AND reference_id NOT LIKE 'welcome_login:%'
            AND created_at >= $2
            AND created_at < $3
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_earned,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND (reference_id LIKE 'watch_min:%' OR reference_id LIKE 'mission_%')
            AND created_at >= $2
            AND created_at < $3
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_watch_points
     FROM points_ledger
     WHERE user_id = $1`,
    [userId, periodStartAt, nextResetAt]
  );
  const row = res.rows[0];
  const totalEarned = Math.max(0, Number(row?.total_earned) || 0);
  const lifetimeEarnedForLevel = Math.max(
    0,
    Number(row?.lifetime_earned_for_level ?? row?.total_earned) || 0
  );
  const totalRedeemed = Math.max(0, Number(row?.total_redeemed) || 0);
  return {
    balance: Math.max(0, totalEarned - totalRedeemed),
    lifetimeEarnedForLevel,
    todayEarned: Math.max(0, Number(row?.today_earned) || 0),
    todayWatchPointsEarned: Math.max(0, Number(row?.today_watch_points) || 0),
  };
}

async function grantWatchMissionPointsPg(
  client: PoolClient,
  userId: string,
  todayKey: string,
  periodStartAt: Date,
  nextResetAt: Date,
  todayWatchSeconds: number,
  verifiedWatchSeconds: number,
  cfg: PayoutRuntimeConfig,
  shouldAward: boolean
): Promise<WatchMissionGrantResult> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `points:${userId}`,
  ]);

  const initial = await getQuickPointsStatePg(client, userId, periodStartAt, nextResetAt);
  const initialLevel = resolveAccountLevelStatus(
    initial.lifetimeEarnedForLevel,
    verifiedWatchSeconds,
    cfg
  );
  if (!shouldAward) {
    return {
      awardedWatchPoints: 0,
      todayWatchPointsEarned: initial.todayWatchPointsEarned,
      pointsBalance: initial.balance,
      levelInfo: initialLevel,
    };
  }

  const maxMissionSec = Math.max(60, cfg.dailyMissionMaxWatchSeconds);
  const cappedSeconds = Math.min(todayWatchSeconds, maxMissionSec);
  const completedMinutes = Math.floor(cappedSeconds / 60);
  if (completedMinutes <= 0) {
    return {
      awardedWatchPoints: 0,
      todayWatchPointsEarned: initial.todayWatchPointsEarned,
      pointsBalance: initial.balance,
      levelInfo: initialLevel,
    };
  }

  const existingRes = await client.query<{ reference_id: string; created_at?: Date }>(
    `SELECT reference_id, created_at
     FROM points_ledger
     WHERE user_id = $1
       AND (
         reference_id LIKE $2
         OR (reference_id LIKE $3 AND created_at >= $4 AND created_at < $5)
       )`,
    [userId, `watch_min:${userId}:${todayKey}:%`, `watch_min:${userId}:%`, periodStartAt, nextResetAt]
  );
  const existingRefs = new Set<string>();
  const periodStartMs = periodStartAt.getTime();
  const nextResetMs = nextResetAt.getTime();
  for (const r of existingRes.rows) {
    existingRefs.add(r.reference_id);
    const createdMs = r.created_at instanceof Date ? r.created_at.getTime() : NaN;
    if (Number.isFinite(createdMs) && createdMs >= periodStartMs && createdMs < nextResetMs) {
      const mMatch = /:m(\d+)$/.exec(r.reference_id);
      if (mMatch) {
        existingRefs.add(`watch_min:${userId}:${todayKey}:m${mMatch[1]}`);
      }
    }
  }

  let remainingDaily = Math.max(0, cfg.maxDailyEarnPoints - initial.todayEarned);
  let remainingDailyWatch = Math.max(
    0,
    cfg.maxDailyWatchPoints - initial.todayWatchPointsEarned
  );
  let awardedWatchPoints = 0;
  let runningBalance = initial.balance;
  let runningLifetimeEarned = initial.lifetimeEarnedForLevel;

  const maxMinutes = Math.floor(maxMissionSec / 60);
  const candidateMeta: Array<{
    refId: string;
    basePoints: number;
    desc: string;
    minute: number;
  }> = [];

  for (let m = 1; m <= Math.min(completedMinutes, maxMinutes); m += 1) {
    candidateMeta.push({
      refId: `watch_min:${userId}:${todayKey}:m${m}`,
      basePoints: cfg.watchMinutePoints,
      desc: `Misi Nonton Aktif (Menit ${m}/${maxMinutes})`,
      minute: m,
    });
  }

  for (const cand of candidateMeta) {
    if (existingRefs.has(cand.refId)) continue;
    const currentLevel = resolveAccountLevelStatus(
      runningLifetimeEarned,
      verifiedWatchSeconds,
      cfg
    );
    const pointsToAward = Math.max(1, Math.round(cand.basePoints * currentLevel.multiplier));
    if (
      pointsToAward <= 0 ||
      pointsToAward > remainingDaily ||
      pointsToAward > remainingDailyWatch
    ) {
      continue;
    }
    const nextBalance = runningBalance + pointsToAward;
    const descWithLevel =
      currentLevel.level > 1
        ? `${cand.desc} · ${currentLevel.tierName} ${currentLevel.multiplier}x`
        : cand.desc;
    const watchMinMeta: PointsLedgerEventMeta = {
      minute: cand.minute,
      maxMinutes,
      level: currentLevel.level,
      tierName: currentLevel.tierName,
      multiplier: currentLevel.multiplier,
    };
    const ins = await client.query(
      `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
       VALUES ($1, $2, 'earn', $3, $4, 'watch_minute', $5::jsonb, $6, $7, NOW())
       ON CONFLICT (reference_id) DO NOTHING`,
      [
        crypto.randomUUID(),
        userId,
        pointsToAward,
        descWithLevel,
        JSON.stringify(watchMinMeta),
        cand.refId,
        nextBalance,
      ]
    );
    if ((ins.rowCount ?? 0) > 0) {
      existingRefs.add(cand.refId);
      remainingDaily -= pointsToAward;
      remainingDailyWatch -= pointsToAward;
      awardedWatchPoints += pointsToAward;
      runningBalance = nextBalance;
      runningLifetimeEarned += pointsToAward;
    }
  }

  const finalLevel = resolveAccountLevelStatus(
    runningLifetimeEarned,
    verifiedWatchSeconds,
    cfg
  );

  return {
    awardedWatchPoints,
    todayWatchPointsEarned: initial.todayWatchPointsEarned + awardedWatchPoints,
    pointsBalance: runningBalance,
    levelInfo: finalLevel,
  };
}

export async function startWatchSessionInDb(input: {
  userId: string;
  mediaKey: string;
  provider?: string;
  dramaId?: string;
  episodeNumber?: number;
  deviceHash?: string;
  previousSessionToken?: string;
}): Promise<{
  ok: boolean;
  sessionToken: string;
  expiresAt: string;
}> {
  const cleanMediaKey = String(input.mediaKey || '').trim().slice(0, 140);
  const cleanProvider = String(input.provider || 'DramaBoxV2').trim().slice(0, 60) || 'DramaBoxV2';
  const cleanDramaId = String(input.dramaId || '').trim().slice(0, 120);
  const epNum = Math.max(1, Math.floor(Number(input.episodeNumber) || 1));
  const cleanDev = String(input.deviceHash || '').trim().slice(0, 64);
  const prevToken = String(input.previousSessionToken || '').trim().slice(0, 80);

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `watch:${input.userId}`,
    ]);

    if (prevToken) {
      await client.query(
        `UPDATE watch_sessions
         SET is_active = FALSE, updated_at = NOW()
         WHERE session_token = $1 AND user_id = $2`,
        [prevToken, input.userId]
      );
      await client.query(
        `UPDATE watch_telemetry
         SET active_stream_session_id = CASE WHEN active_stream_session_id = $2 THEN '' ELSE active_stream_session_id END,
             last_video_time_sec = -1,
             updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, prevToken]
      );
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ANTI_CHEAT_DEFAULTS.watchSessionTtlSec * 1000);
    await client.query(
      `INSERT INTO watch_sessions (
         session_token, user_id, media_key, provider, drama_id, episode_number,
         device_hash, started_at, last_heartbeat_at, last_video_time_sec,
         accumulated_sec, last_seq, is_active, expires_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, -1, 0, 0, TRUE, $8, NOW())`,
      [
        sessionToken,
        input.userId,
        cleanMediaKey || `${cleanProvider}:${cleanDramaId}:ep${epNum}`,
        cleanProvider,
        cleanDramaId,
        epNum,
        cleanDev,
        expiresAt,
      ]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] startWatchSessionInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function recordWatchHeartbeatInDb(input: {
  userId: string;
  streamSessionId: string;
  mediaKey: string;
  currentTimeSec: number;
  isPlaying: boolean;
  isBuffering?: boolean;
  tabVisible: boolean;
  playbackRate: number;
  seq?: number;
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
  displayName?: string;
  timeZone?: string | null;
}): Promise<{
  ok: boolean;
  addedSeconds: number;
  sessionWatchSeconds?: number;
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  awardedWatchPoints: number;
  todayWatchPointsEarned: number;
  dailyMissionMaxWatchSeconds: number;
  pointsBalance: number | null;
  levelInfo?: AccountLevelStatus;
  referralQualified: boolean;
  referralOngoingBonusAwarded?: number;
  riskFlag: string;
  reason?:
    | 'session_started'
    | 'paused_or_hidden'
    | 'buffering'
    | 'invalid_playback_speed'
    | 'concurrent_stream_detected'
    | 'heartbeat_too_fast'
    | 'video_not_advancing'
    | 'seek_jump_ignored'
    | 'replay_blocked'
    | 'invalid_session'
    | 'daily_watch_cap_reached'
    | 'counted';
}> {
  const cfg = getPayoutRuntimeConfig();
  const cleanSessionId = input.streamSessionId.trim().slice(0, 80);
  const cleanMediaKey = input.mediaKey.trim().slice(0, 140);
  const safeVideoTime = Math.max(0, Number(input.currentTimeSec) || 0);
  const safeRate = Number(input.playbackRate) || 1;
  const hasSeq = typeof input.seq === 'number' && Number.isFinite(input.seq);
  const incomingSeq = hasSeq ? Math.floor(input.seq as number) : 0;

  if (!cleanSessionId || !cleanMediaKey) {
    return {
      ok: false,
      addedSeconds: 0,
      verifiedWatchSeconds: 0,
      todayWatchSeconds: 0,
      awardedWatchPoints: 0,
      todayWatchPointsEarned: 0,
      dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
      pointsBalance: null,
      referralQualified: false,
      riskFlag: '',
      reason: 'invalid_session',
    };
  }

  // Ensure security signal is updated
  await recordUserSecuritySignalInDb({
    userId: input.userId,
    ipHash: input.ipHash,
    subnetHash: input.subnetHash,
    uaHash: input.uaHash,
    deviceHash: input.deviceHash,
    displayName: input.displayName,
  });

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `watch:${input.userId}`,
    ]);

    const { todayKey, periodStartAt, nextResetAt } = await resolveUserTimeZonePg(
      client,
      input.userId,
      input.timeZone,
      true
    );

    const sessRes = await client.query<{
      session_token: string;
      accumulated_sec: number;
      last_seq: number;
      is_active: boolean;
      expires_at: Date;
    }>(
      `SELECT session_token, accumulated_sec, last_seq, is_active, expires_at
       FROM watch_sessions
       WHERE session_token = $1 AND user_id = $2
       FOR UPDATE`,
      [cleanSessionId, input.userId]
    );
    const sessRow = sessRes.rows[0];
    const nowMs = Date.now();
    if (
      !sessRow ||
      !sessRow.is_active ||
      (sessRow.expires_at instanceof Date && sessRow.expires_at.getTime() <= nowMs)
    ) {
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: false,
        addedSeconds: 0,
        verifiedWatchSeconds: 0,
        todayWatchSeconds: 0,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag: '',
        reason: 'invalid_session',
      };
    }

    const sessionAccumSec = Math.max(0, Number(sessRow.accumulated_sec) || 0);
    if (hasSeq && incomingSeq <= Math.max(0, Number(sessRow.last_seq) || 0)) {
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: false,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds: 0,
        todayWatchSeconds: 0,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag: 'replay_attempt',
        reason: 'replay_blocked',
      };
    }

    if (hasSeq) {
      await client.query(
        `UPDATE watch_sessions SET last_seq = $2, updated_at = NOW() WHERE session_token = $1`,
        [cleanSessionId, incomingSeq]
      );
    }

    const telRes = await client.query<{
      verified_watch_seconds: number;
      today_watch_seconds: number;
      today_date_key: string;
      active_stream_session_id: string;
      active_stream_media_key: string;
      last_heartbeat_at: Date | null;
      last_video_time_sec: string;
      fast_delta_strikes: number;
      concurrent_tab_strikes: number;
      risk_flag: string;
      suspicious_reason: string;
    }>(`SELECT * FROM watch_telemetry WHERE user_id = $1 FOR UPDATE`, [
      input.userId,
    ]);

    const row = telRes.rows[0];
    let verifiedWatchSeconds = row ? Math.max(0, Number(row.verified_watch_seconds) || 0) : 0;
    let todayWatchSeconds =
      row && row.today_date_key === todayKey
        ? Math.max(0, Number(row.today_watch_seconds) || 0)
        : 0;
    let fastStrikes = row ? Math.max(0, Number(row.fast_delta_strikes) || 0) : 0;
    let concurrentStrikes = row ? Math.max(0, Number(row.concurrent_tab_strikes) || 0) : 0;
    let riskFlag = row?.risk_flag || '';
    let suspiciousReason = row?.suspicious_reason || '';

    const lastHbMs =
      row?.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.getTime() : 0;
    const wallElapsedMs = lastHbMs > 0 ? Math.max(0, nowMs - lastHbMs) : 0;
    const wallElapsedSec = lastHbMs > 0 ? Math.round(wallElapsedMs / 1000) : 0;
    const lastSessionId = row?.active_stream_session_id || '';
    const lastMediaKey = row?.active_stream_media_key || '';
    const lastVideoSec = row ? Number(row.last_video_time_sec) || 0 : 0;

    // 1. Concurrent stream lock across different browser tabs/sessions
    if (
      lastSessionId &&
      lastSessionId !== cleanSessionId &&
      lastHbMs > 0 &&
      wallElapsedSec < ANTI_CHEAT_DEFAULTS.concurrentSessionWindowSec
    ) {
      concurrentStrikes += 1;
      if (
        concurrentStrikes >= ANTI_CHEAT_DEFAULTS.maxConcurrentStrikes &&
        !riskFlag.includes('concurrent_streams')
      ) {
        riskFlag = riskFlag ? `${riskFlag},concurrent_streams` : 'concurrent_streams';
        suspiciousReason = suspiciousReason
          ? `${suspiciousReason}; Multiple simultaneous watch streams detected`
          : 'Multiple simultaneous watch streams detected';
      }
      await client.query(
        `UPDATE watch_telemetry
         SET concurrent_tab_strikes = $2, risk_flag = $3, suspicious_reason = $4, updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, concurrentStrikes, riskFlag.slice(0, 120), suspiciousReason.slice(0, 300)]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: false,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'concurrent_stream_detected',
      };
    }

    // 2. Buffering, paused, or backgrounded tab -> release active lock & reset anchor without incrementing
    if (input.isBuffering || !input.isPlaying || !input.tabVisible) {
      await client.query(
        `INSERT INTO watch_telemetry (
           user_id, verified_watch_seconds, today_watch_seconds, today_date_key,
           active_stream_session_id, active_stream_media_key, last_heartbeat_at,
           last_video_time_sec, fast_delta_strikes, concurrent_tab_strikes,
           risk_flag, suspicious_reason, updated_at
         )
         VALUES ($1, $2, $3, $4, '', $5, NOW(), -1, $6, $7, $8, $9, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           today_watch_seconds = EXCLUDED.today_watch_seconds,
           today_date_key = EXCLUDED.today_date_key,
           active_stream_session_id = '',
           active_stream_media_key = EXCLUDED.active_stream_media_key,
           last_heartbeat_at = NOW(),
           last_video_time_sec = -1,
           updated_at = NOW()`,
        [
          input.userId,
          verifiedWatchSeconds,
          todayWatchSeconds,
          todayKey,
          cleanMediaKey,
          fastStrikes,
          concurrentStrikes,
          riskFlag,
          suspiciousReason,
        ]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: input.isBuffering ? 'buffering' : 'paused_or_hidden',
      };
    }

    // 3. Playback speed guard (0.75x - 1.15x normal speed required) -> reset anchor
    if (
      safeRate > ANTI_CHEAT_DEFAULTS.maxPlaybackRate ||
      safeRate < ANTI_CHEAT_DEFAULTS.minPlaybackRate
    ) {
      await client.query(
        `INSERT INTO watch_telemetry (
           user_id, verified_watch_seconds, today_watch_seconds, today_date_key,
           active_stream_session_id, active_stream_media_key, last_heartbeat_at,
           last_video_time_sec, fast_delta_strikes, concurrent_tab_strikes,
           risk_flag, suspicious_reason, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), -1, $7, $8, $9, $10, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           last_heartbeat_at = NOW(),
           last_video_time_sec = -1,
           updated_at = NOW()`,
        [
          input.userId,
          verifiedWatchSeconds,
          todayWatchSeconds,
          todayKey,
          cleanSessionId,
          cleanMediaKey,
          fastStrikes,
          concurrentStrikes,
          riskFlag,
          suspiciousReason,
        ]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'invalid_playback_speed',
      };
    }

    // 4. First heartbeat for session, media switch, or post-pause resume -> establish baseline
    if (
      !row ||
      lastSessionId !== cleanSessionId ||
      lastMediaKey !== cleanMediaKey ||
      lastHbMs <= 0 ||
      lastVideoSec < 0
    ) {
      await client.query(
        `INSERT INTO watch_telemetry (
           user_id, verified_watch_seconds, today_watch_seconds, today_date_key,
           active_stream_session_id, active_stream_media_key, last_heartbeat_at,
           last_video_time_sec, fast_delta_strikes, concurrent_tab_strikes,
           risk_flag, suspicious_reason, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           today_watch_seconds = EXCLUDED.today_watch_seconds,
           today_date_key = EXCLUDED.today_date_key,
           active_stream_session_id = EXCLUDED.active_stream_session_id,
           active_stream_media_key = EXCLUDED.active_stream_media_key,
           last_heartbeat_at = NOW(),
           last_video_time_sec = EXCLUDED.last_video_time_sec,
           updated_at = NOW()`,
        [
          input.userId,
          verifiedWatchSeconds,
          todayWatchSeconds,
          todayKey,
          cleanSessionId,
          cleanMediaKey,
          safeVideoTime,
          fastStrikes,
          concurrentStrikes,
          riskFlag,
          suspiciousReason,
        ]
      );
      await client.query(
        `UPDATE watch_sessions
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE session_token = $1`,
        [cleanSessionId, safeVideoTime]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'session_started',
      };
    }

    // 5. Timestamp delta check (reject faster than real time)
    if (wallElapsedMs < ANTI_CHEAT_DEFAULTS.minHeartbeatIntervalSec * 1000 - 400) {
      fastStrikes += 1;
      if (
        fastStrikes >= ANTI_CHEAT_DEFAULTS.maxFastDeltaStrikes &&
        !riskFlag.includes('heartbeat_flood')
      ) {
        riskFlag = riskFlag ? `${riskFlag},heartbeat_flood` : 'heartbeat_flood';
        suspiciousReason = suspiciousReason
          ? `${suspiciousReason}; Rapid heartbeat flood detected`
          : 'Rapid heartbeat flood detected';
      }
      await client.query(
        `UPDATE watch_telemetry
         SET fast_delta_strikes = $2, risk_flag = $3, suspicious_reason = $4, updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, fastStrikes, riskFlag.slice(0, 120), suspiciousReason.slice(0, 300)]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: false,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'heartbeat_too_fast',
      };
    }

    const videoDeltaSec = safeVideoTime - lastVideoSec;
    if (videoDeltaSec <= ANTI_CHEAT_DEFAULTS.minVideoAdvanceSec) {
      await client.query(
        `UPDATE watch_telemetry
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, safeVideoTime]
      );
      await client.query(
        `UPDATE watch_sessions
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE session_token = $1`,
        [cleanSessionId, safeVideoTime]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'video_not_advancing',
      };
    }

    // 6. Seek / forward-skip jump guard: re-anchor without awarding skipped seconds
    const maxAllowedVideoDelta = Math.max(
      8,
      wallElapsedSec * ANTI_CHEAT_DEFAULTS.maxSeekRatio + 4
    );
    if (videoDeltaSec > maxAllowedVideoDelta) {
      await client.query(
        `UPDATE watch_telemetry
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, safeVideoTime]
      );
      await client.query(
        `UPDATE watch_sessions
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE session_token = $1`,
        [cleanSessionId, safeVideoTime]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'seek_jump_ignored',
      };
    }

    if (todayWatchSeconds >= cfg.maxDailyVerifiedWatchSeconds) {
      await client.query(
        `UPDATE watch_telemetry
         SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [input.userId, safeVideoTime]
      );
      const ptsState = await getQuickPointsStatePg(client, input.userId, periodStartAt, nextResetAt);
      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds: 0,
        sessionWatchSeconds: sessionAccumSec,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'daily_watch_cap_reached',
      };
    }

    const rawStep = Math.min(
      wallElapsedSec,
      Math.ceil(videoDeltaSec * 1.1),
      ANTI_CHEAT_DEFAULTS.maxHeartbeatStepSec
    );
    const remainingDaily = Math.max(0, cfg.maxDailyVerifiedWatchSeconds - todayWatchSeconds);
    const addedSeconds = Math.max(0, Math.min(rawStep, remainingDaily));
    verifiedWatchSeconds += addedSeconds;
    todayWatchSeconds += addedSeconds;
    const nextSessionSec = sessionAccumSec + addedSeconds;

    await client.query(
      `UPDATE watch_telemetry
       SET verified_watch_seconds = $2,
           today_watch_seconds = $3,
           today_date_key = $4,
           active_stream_session_id = $5,
           active_stream_media_key = $6,
           last_heartbeat_at = NOW(),
           last_video_time_sec = $7,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        input.userId,
        verifiedWatchSeconds,
        todayWatchSeconds,
        todayKey,
        cleanSessionId,
        cleanMediaKey,
        safeVideoTime,
      ]
    );
    await client.query(
      `UPDATE watch_sessions
       SET accumulated_sec = $2,
           last_heartbeat_at = NOW(),
           last_video_time_sec = $3,
           updated_at = NOW()
       WHERE session_token = $1`,
      [cleanSessionId, nextSessionSec, safeVideoTime]
    );

    // 7. Grant daily watch-minute + milestone mission points (max 1h/day)
    const secCheckSelf = await client.query<{ risk_flag: string }>(
      `SELECT risk_flag FROM user_security_signals WHERE user_id = $1`,
      [input.userId]
    );
    const hasRiskFlag = Boolean(riskFlag || secCheckSelf.rows[0]?.risk_flag);
    const missionGrant = await grantWatchMissionPointsPg(
      client,
      input.userId,
      todayKey,
      periodStartAt,
      nextResetAt,
      todayWatchSeconds,
      verifiedWatchSeconds,
      cfg,
      addedSeconds > 0 && !hasRiskFlag
    );

    // 8. Auto-qualify referral if verifiedWatchSeconds >= 3600 (1 hour)
    let referralQualified = false;
    let referralOngoingBonusAwarded = 0;
    if (verifiedWatchSeconds >= cfg.referralQualifySeconds) {
      const refRes = await client.query<{
        id: string;
        referrer_uid: string;
        bonus_points: number;
      }>(
        `SELECT id, referrer_uid, bonus_points
         FROM referrals
         WHERE referee_uid = $1 AND status = 'pending_watch'
         FOR UPDATE`,
        [input.userId]
      );
      const pendingRef = refRes.rows[0];
      if (pendingRef) {
        const quotaRes = await client.query<{
          daily_cnt: string;
          weekly_cnt: string;
        }>(
          `SELECT
             COUNT(*) FILTER (WHERE qualified_at >= $2 AND qualified_at < $3)::text AS daily_cnt,
             COUNT(*) FILTER (WHERE qualified_at >= NOW() - INTERVAL '7 days')::text AS weekly_cnt
           FROM referrals
           WHERE referrer_uid = $1 AND status = 'qualified'`,
          [pendingRef.referrer_uid, periodStartAt, nextResetAt]
        );
        const dailyCnt = Number(quotaRes.rows[0]?.daily_cnt) || 0;
        const weeklyCnt = Number(quotaRes.rows[0]?.weekly_cnt) || 0;

        if (hasRiskFlag) {
          await client.query(
            `UPDATE referrals
             SET status = 'rejected_fraud',
                 risk_flag = $2,
                 suspicious_reason = 'Referee flagged by anti-cheat during 1-hour verification',
                 updated_at = NOW()
             WHERE id = $1`,
            [pendingRef.id, riskFlag || secCheckSelf.rows[0]?.risk_flag || 'anti_cheat_flag']
          );
        } else if (
          dailyCnt < cfg.maxDailyReferrals &&
          weeklyCnt < cfg.maxWeeklyReferrals
        ) {
          await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
            `points:${pendingRef.referrer_uid}`,
          ]);
          await client.query(
            `UPDATE referrals
             SET status = 'qualified', qualified_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [pendingRef.id]
          );
          const refBalRes = await client.query<{ balance: string }>(
            `SELECT (
               COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
             )::text AS balance
             FROM points_ledger
             WHERE user_id = $1`,
            [pendingRef.referrer_uid]
          );
          const refBal = Math.max(0, Number(refBalRes.rows[0]?.balance) || 0);
          const bonus = Math.max(1, Number(pendingRef.bonus_points) || cfg.referralBonusPoints);
          const refQualifyMeta: PointsLedgerEventMeta = {};
          const insertBonus = await client.query(
            `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
             VALUES ($1, $2, 'earn', $3, $4, 'referral_qualify', $5::jsonb, $6, $7, NOW())
             ON CONFLICT (reference_id) DO NOTHING`,
            [
              crypto.randomUUID(),
              pendingRef.referrer_uid,
              bonus,
              'Bonus Referral Valid (Tontonan 1+ Jam Terverifikasi)',
              JSON.stringify(refQualifyMeta),
              `referral:qualify:${input.userId}`,
              refBal + bonus,
            ]
          );
          referralQualified = (insertBonus.rowCount ?? 0) > 0;
        }
      }

      // 8b. Ongoing qualified referral watch reward: +500 pts per extra 1 hour verified watch (up to 10 steps)
      const stepSeconds = Math.max(60, Math.floor(cfg.referralOngoingStepSeconds || 3_600));
      const stepBonus = Math.max(1, Math.floor(cfg.referralOngoingBonusPoints || 500));
      const maxSteps = Math.max(0, Math.floor(cfg.referralOngoingMaxSteps || 0));
      if (
        addedSeconds > 0 &&
        !hasRiskFlag &&
        maxSteps > 0 &&
        verifiedWatchSeconds >= cfg.referralQualifySeconds + stepSeconds
      ) {
        const qualRefRes = await client.query<{
          id: string;
          referrer_uid: string;
          ongoing_bonus_points: number;
          ongoing_steps_awarded: number;
        }>(
          `SELECT id, referrer_uid, ongoing_bonus_points, ongoing_steps_awarded
           FROM referrals
           WHERE referee_uid = $1 AND status = 'qualified'
           FOR UPDATE`,
          [input.userId]
        );
        const qualRef = qualRefRes.rows[0];
        if (qualRef) {
          const prevSteps = Math.max(0, Number(qualRef.ongoing_steps_awarded) || 0);
          const targetSteps = Math.min(
            maxSteps,
            Math.floor((verifiedWatchSeconds - cfg.referralQualifySeconds) / stepSeconds)
          );
          if (targetSteps > prevSteps) {
            const referrerRiskRes = await client.query<{
              sec_risk: string | null;
              tel_risk: string | null;
            }>(
              `SELECT s.risk_flag AS sec_risk, t.risk_flag AS tel_risk
               FROM (SELECT $1::text AS uid) base
               LEFT JOIN user_security_signals s ON s.user_id = base.uid
               LEFT JOIN watch_telemetry t ON t.user_id = base.uid`,
              [qualRef.referrer_uid]
            );
            const referrerRisk = Boolean(
              referrerRiskRes.rows[0]?.sec_risk || referrerRiskRes.rows[0]?.tel_risk
            );
            if (!referrerRisk) {
              await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
                `points:${qualRef.referrer_uid}`,
              ]);
              const refBalRes = await client.query<{ balance: string }>(
                `SELECT (
                   COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
                 )::text AS balance
                 FROM points_ledger
                 WHERE user_id = $1`,
                [qualRef.referrer_uid]
              );
              let refBal = Math.max(0, Number(refBalRes.rows[0]?.balance) || 0);
              let totalOngoingPts = Math.max(0, Number(qualRef.ongoing_bonus_points) || 0);
              let highestStep = prevSteps;
              const stepMinutes = Math.max(1, Math.round(stepSeconds / 60));

              for (let step = prevSteps + 1; step <= targetSteps; step += 1) {
                const ongoingMeta: PointsLedgerEventMeta = {
                  ongoingStep: step,
                  stepMinutes,
                  totalStepsMax: maxSteps,
                };
                const totalWatchMin = Math.round(
                  (cfg.referralQualifySeconds + step * stepSeconds) / 60
                );
                const insOngoing = await client.query(
                  `INSERT INTO points_ledger (id, user_id, type, points, description, event_code, event_meta, reference_id, balance_after, created_at)
                   VALUES ($1, $2, 'earn', $3, $4, 'referral_ongoing', $5::jsonb, $6, $7, NOW())
                   ON CONFLICT (reference_id) DO NOTHING`,
                  [
                    crypto.randomUUID(),
                    qualRef.referrer_uid,
                    stepBonus,
                    `Bonus Lanjutan Referral Valid (Tahap ${step}/${maxSteps} · ${totalWatchMin} Mnt)`,
                    JSON.stringify(ongoingMeta),
                    `referral:ongoing:${input.userId}:s${step}`,
                    refBal + stepBonus,
                  ]
                );
                if ((insOngoing.rowCount ?? 0) > 0) {
                  refBal += stepBonus;
                  referralOngoingBonusAwarded += stepBonus;
                  totalOngoingPts += stepBonus;
                  highestStep = step;
                }
              }

              if (highestStep > prevSteps) {
                await client.query(
                  `UPDATE referrals
                   SET ongoing_steps_awarded = $2,
                       ongoing_bonus_points = $3,
                       updated_at = NOW()
                   WHERE id = $1`,
                  [qualRef.id, highestStep, totalOngoingPts]
                );
              }
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    return {
      ok: true,
      addedSeconds,
      sessionWatchSeconds: nextSessionSec,
      verifiedWatchSeconds,
      todayWatchSeconds,
      awardedWatchPoints: missionGrant.awardedWatchPoints,
      todayWatchPointsEarned: missionGrant.todayWatchPointsEarned,
      dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
      pointsBalance: missionGrant.pointsBalance,
      levelInfo: missionGrant.levelInfo,
      referralQualified,
      referralOngoingBonusAwarded,
      riskFlag,
      reason: 'counted',
    };
  } catch (err) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Ignore rollback
    }
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] recordWatchHeartbeatInDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export async function getUserReferralSummaryFromDb(
  userId: string,
  timeZone?: string | null
): Promise<UserReferralSummary> {
  const cfg = getPayoutRuntimeConfig();
  const referralCode = buildReferralCodeForUser(userId);

  const activePool = await requirePointsDbPool();
  let client: PoolClient | null = null;
  try {
    client = await activePool.connect();
    const { todayKey } = await resolveUserTimeZonePg(client, userId, timeZone, true);
    await client.query(
      `UPDATE users
       SET referral_code = CASE WHEN referral_code = '' THEN $2 ELSE referral_code END
       WHERE uid = $1`,
      [userId, referralCode]
    );

    const selfTel = await client.query<{
      verified_watch_seconds: number;
      today_watch_seconds: number;
      today_date_key: string;
      risk_flag: string;
      sig_risk: string | null;
    }>(
      `SELECT COALESCE(t.verified_watch_seconds, 0) AS verified_watch_seconds,
              COALESCE(t.today_watch_seconds, 0) AS today_watch_seconds,
              COALESCE(t.today_date_key, '') AS today_date_key,
              COALESCE(t.risk_flag, '') AS risk_flag,
              s.risk_flag AS sig_risk
       FROM (SELECT $1::text AS uid) base
       LEFT JOIN watch_telemetry t ON t.user_id = base.uid
       LEFT JOIN user_security_signals s ON s.user_id = base.uid`,
      [userId]
    );

    const refsRes = await client.query<{
      id: string;
      referee_uid: string;
      status: string;
      bonus_points: number;
      ongoing_bonus_points: number | null;
      ongoing_steps_awarded: number | null;
      risk_flag: string;
      qualified_at: Date | null;
      created_at: Date;
      referee_name: string | null;
      verified_watch_seconds: number | null;
    }>(
      `SELECT r.id, r.referee_uid, r.status, r.bonus_points,
              COALESCE(r.ongoing_bonus_points, 0) AS ongoing_bonus_points,
              COALESCE(r.ongoing_steps_awarded, 0) AS ongoing_steps_awarded,
              r.risk_flag, r.qualified_at, r.created_at,
              u.display_name AS referee_name,
              COALESCE(t.verified_watch_seconds, 0) AS verified_watch_seconds
       FROM referrals r
       LEFT JOIN users u ON u.uid = r.referee_uid
       LEFT JOIN watch_telemetry t ON t.user_id = r.referee_uid
       WHERE r.referrer_uid = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const items: UserReferralItemView[] = refsRes.rows.map((r) => {
      const status = (['pending_watch', 'qualified', 'rejected_fraud'].includes(r.status)
        ? r.status
        : 'pending_watch') as ReferralStatus;
      const ongoingStepsAwarded = Math.max(0, Number(r.ongoing_steps_awarded) || 0);
      const ongoingBonusEarned = Math.max(0, Number(r.ongoing_bonus_points) || 0);
      const nextOngoingTargetSeconds =
        status === 'qualified' && ongoingStepsAwarded < cfg.referralOngoingMaxSteps
          ? cfg.referralQualifySeconds +
            (ongoingStepsAwarded + 1) * cfg.referralOngoingStepSeconds
          : null;
      return {
        id: r.id,
        maskedReferee: maskDisplayNameForFeed(r.referee_name || r.referee_uid),
        status,
        bonusPoints: Math.max(0, Number(r.bonus_points) || cfg.referralBonusPoints),
        ongoingBonusEarned,
        ongoingStepsAwarded,
        ongoingMaxSteps: cfg.referralOngoingMaxSteps,
        nextOngoingTargetSeconds,
        verifiedWatchSeconds: Math.max(0, Number(r.verified_watch_seconds) || 0),
        requiredWatchSeconds: cfg.referralQualifySeconds,
        riskFlag: r.risk_flag || undefined,
        qualifiedAt:
          r.qualified_at instanceof Date ? r.qualified_at.toISOString() : null,
        createdAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : new Date().toISOString(),
      };
    });

    const selfReferredRes = await client.query<{
      status: string;
      referral_code: string;
      created_at: Date | string;
    }>(
      `SELECT status, referral_code, created_at
       FROM referrals
       WHERE referee_uid = $1
       LIMIT 1`,
      [userId]
    );
    const selfRefRow = selfReferredRes.rows[0] || null;
    const bindLedgerRes = selfRefRow
      ? await client.query<{ id: string }>(
          `SELECT id FROM points_ledger WHERE reference_id = $1 LIMIT 1`,
          [`referral:bind:${userId}`]
        )
      : { rows: [] };

    const tRow = selfTel.rows[0];
    const qualifiedItems = items.filter((i) => i.status === 'qualified');
    const mainBonusEarned = qualifiedItems.reduce((acc, i) => acc + i.bonusPoints, 0);
    const ongoingBonusEarned = qualifiedItems.reduce(
      (acc, i) => acc + i.ongoingBonusEarned,
      0
    );
    return {
      referralCode,
      referralQualifySeconds: cfg.referralQualifySeconds,
      referralBonusPoints: cfg.referralBonusPoints,
      bindReferralBonusPoints: cfg.bindReferralBonusPoints,
      referralOngoingStepSeconds: cfg.referralOngoingStepSeconds,
      referralOngoingBonusPoints: cfg.referralOngoingBonusPoints,
      referralOngoingMaxSteps: cfg.referralOngoingMaxSteps,
      hasReferrer: Boolean(selfRefRow),
      referredBy: selfRefRow
        ? {
            status: (['pending_watch', 'qualified', 'rejected_fraud'].includes(selfRefRow.status)
              ? selfRefRow.status
              : 'pending_watch') as ReferralStatus,
            referralCode: String(selfRefRow.referral_code || ''),
            bindBonusAwarded: bindLedgerRes.rows.length > 0,
            createdAt:
              selfRefRow.created_at instanceof Date
                ? selfRefRow.created_at.toISOString()
                : new Date(String(selfRefRow.created_at || Date.now())).toISOString(),
          }
        : null,
      verifiedWatchSeconds: Math.max(0, Number(tRow?.verified_watch_seconds) || 0),
      todayWatchSeconds:
        tRow && tRow.today_date_key === todayKey
          ? Math.max(0, Number(tRow.today_watch_seconds) || 0)
          : 0,
      maxDailyVerifiedWatchSeconds: cfg.maxDailyVerifiedWatchSeconds,
      riskFlag: tRow?.sig_risk || tRow?.risk_flag || '',
      stats: {
        totalInvited: items.length,
        pendingCount: items.filter((i) => i.status === 'pending_watch').length,
        qualifiedCount: qualifiedItems.length,
        rejectedCount: items.filter((i) => i.status === 'rejected_fraud').length,
        mainBonusEarned,
        ongoingBonusEarned,
        totalBonusEarned: mainBonusEarned + ongoingBonusEarned,
      },
      referrals: items,
    };
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    console.warn(
      '[PostgreSQL] getUserReferralSummaryFromDb failed:',
      err instanceof Error ? err.message : String(err)
    );
    throw new DatabaseUnavailableError('DATABASE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}


