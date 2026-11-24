import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import {
  ANTI_CHEAT_DEFAULTS,
  type DailyMissionMilestoneConfig,
  getDatabaseUrl,
  getRewardsRuntimeValues,
  isPgSslRequired,
} from './config.ts';

let pool: Pool | null = null;
let schemaReadyPromise: Promise<boolean> | null = null;
let dbAvailable = false;

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns the current YYYY-MM-DD date key in Asia/Jakarta (WIB / UTC+7)
 * so daily metrics reset precisely at 24:00 / 00:00 WIB.
 */
export function getJakartaDateKey(date: Date = new Date()): string {
  const parts = jakartaDateFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  return jakartaDateFormatter.format(date);
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

export function getPool(): Pool | null {
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
      '[PostgreSQL] Pool creation failed, using in-memory fallback:',
      err instanceof Error ? err.message : String(err)
    );
    pool = null;
    return null;
  }
}

export function isDatabaseEnabled(): boolean {
  return Boolean(getDatabaseUrl()) && dbAvailable;
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
    reference_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
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
    method TEXT NOT NULL CHECK (method IN ('paypal', 'usdt_polygon', 'usdt_trc20', 'wise', 'dana', 'ovo', 'gopay', 'bank_transfer')),
    destination_account TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS risk_flag TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS suspicious_reason TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_user_created ON payout_requests (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_status_created ON payout_requests (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payout_requests_dest_lower ON payout_requests (LOWER(destination_account))`,

  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)`,

  `CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_uid TEXT NOT NULL,
    referee_uid TEXT UNIQUE NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_watch' CHECK (status IN ('pending_watch', 'qualified', 'rejected_fraud')),
    bonus_points INTEGER NOT NULL DEFAULT 500,
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
        '[PostgreSQL] Initialization failed, falling back to in-memory store:',
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

export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; engine: 'postgresql' | 'memory' }> {
  const start = Date.now();
  const activePool = getPool();
  if (!activePool) {
    return { ok: true, latencyMs: 0, engine: 'memory' };
  }
  try {
    await ensureDatabaseReady();
    if (!dbAvailable) {
      return { ok: false, latencyMs: Date.now() - start, engine: 'memory' };
    }
    await activePool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start, engine: 'postgresql' };
  } catch {
    dbAvailable = false;
    return { ok: false, latencyMs: Date.now() - start, engine: 'memory' };
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

  // Also ensure referral code mapping exists in points fallback store
  const ptsStore = loadPointsFallbackStore();
  const refCode = buildReferralCodeForUser(input.uid);
  if (!ptsStore.referralCodeToUid[refCode]) {
    ptsStore.referralCodeToUid[refCode] = input.uid;
    ptsStore.userNames[input.uid] = record.displayName;
    persistPointsFallbackStore(ptsStore);
  }

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

  const today = (input.visitDate || getDateKeyUtc()).slice(0, 10);
  const yesterday = getDateKeyUtc(-1);

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
  const mediaType = input.provider === 'LK21' ? 'movie' : 'drama';
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

// --- Points Ledger & Payout Requests (USD & IDR) with Anti-Fraud & Fallback ---

export type PayoutMethod =
  | 'paypal'
  | 'usdt_polygon'
  | 'usdt_trc20'
  | 'wise'
  | 'dana'
  | 'ovo'
  | 'gopay'
  | 'bank_transfer';

export type PayoutCurrency = 'USD' | 'IDR';
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type PointsLedgerType = 'earn' | 'redeem';

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
  methods: PayoutMethodDescriptor[];
}

export interface PointsLedgerRecord {
  id: string;
  userId: string;
  type: PointsLedgerType;
  points: number;
  description: string;
  referenceId: string;
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
  destinationAccount: string;
  accountHolderName: string;
  status: PayoutStatus;
  adminNote: string;
  riskFlag?: string;
  suspiciousReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPointsSummary {
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  todayEarned: number;
  maxDailyEarnPoints: number;
  todayWatchSeconds: number;
  todayWatchPointsEarned: number;
  dailyMissionMaxWatchSeconds: number;
  estimatedUsd: number;
  estimatedIdr: number;
  lastClaimAt: string | null;
  cooldownSecondsRemaining: number;
  dailyCheckinClaimedToday: boolean;
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
  status: 'approved' | 'paid';
  createdAt: string;
  isReal: boolean;
}

export const ALLOWED_PAYOUT_METHODS: ReadonlySet<PayoutMethod> = new Set([
  'paypal',
  'usdt_polygon',
  'usdt_trc20',
  'wise',
  'dana',
  'ovo',
  'gopay',
  'bank_transfer',
]);

const USD_PAYOUT_METHODS: ReadonlySet<PayoutMethod> = new Set([
  'paypal',
  'usdt_polygon',
  'usdt_trc20',
  'wise',
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
      countryCode: 'PH',
      minPoints: minPayoutPointsUsd,
      category: 'crypto_usd',
    },
    {
      id: 'wise',
      label: 'Wise',
      currency: 'USD',
      countryCode: 'MY',
      minPoints: minPayoutPointsUsd,
      category: 'global_usd',
    },
  ];

  return {
    ...runtime,
    methods,
  };
}

export function getCurrencyForMethod(method: PayoutMethod): PayoutCurrency {
  return USD_PAYOUT_METHODS.has(method) ? 'USD' : 'IDR';
}

export function getMethodMetadata(method: PayoutMethod): {
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
    case 'bank_transfer':
      return { label: 'Transfer Bank', countryCode: 'ID', currency: 'IDR' };
    case 'paypal':
      return { label: 'PayPal', countryCode: 'US', currency: 'USD' };
    case 'usdt_polygon':
      return { label: 'USDT Polygon', countryCode: 'SG', currency: 'USD' };
    case 'usdt_trc20':
      return { label: 'USDT TRC20', countryCode: 'PH', currency: 'USD' };
    case 'wise':
      return { label: 'Wise', countryCode: 'MY', currency: 'USD' };
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
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  maxDailyVerifiedWatchSeconds: number;
  riskFlag: string;
  stats: {
    totalInvited: number;
    pendingCount: number;
    qualifiedCount: number;
    rejectedCount: number;
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

interface PointsFallbackStore {
  ledger: PointsLedgerRecord[];
  payouts: PayoutRequestRecord[];
  userNames: Record<string, string>;
  referralCodeToUid: Record<string, string>;
  referrals: ReferralRecord[];
  watchTelemetry: Record<string, WatchTelemetryRecord>;
  securitySignals: Record<string, UserSecuritySignalRecord>;
}

const POINTS_FALLBACK_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'points-payouts.json'
);
let pointsFallbackStore: PointsFallbackStore | null = null;
let pointsFallbackQueue: Promise<unknown> = Promise.resolve();

function withPointsFallbackLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = pointsFallbackQueue.then(fn, fn);
  pointsFallbackQueue = next.catch(() => {});
  return next;
}

function loadPointsFallbackStore(): PointsFallbackStore {
  if (pointsFallbackStore) return pointsFallbackStore;
  try {
    if (fs.existsSync(POINTS_FALLBACK_CACHE_PATH)) {
      const parsed = JSON.parse(
        fs.readFileSync(POINTS_FALLBACK_CACHE_PATH, 'utf-8')
      ) as Partial<PointsFallbackStore>;
      pointsFallbackStore = {
        ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
        payouts: Array.isArray(parsed.payouts) ? parsed.payouts : [],
        userNames:
          parsed.userNames && typeof parsed.userNames === 'object'
            ? parsed.userNames
            : {},
        referralCodeToUid:
          parsed.referralCodeToUid && typeof parsed.referralCodeToUid === 'object'
            ? parsed.referralCodeToUid
            : {},
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [],
        watchTelemetry:
          parsed.watchTelemetry && typeof parsed.watchTelemetry === 'object'
            ? parsed.watchTelemetry
            : {},
        securitySignals:
          parsed.securitySignals && typeof parsed.securitySignals === 'object'
            ? parsed.securitySignals
            : {},
      };
      return pointsFallbackStore;
    }
  } catch {
    // Ignore corrupt snapshot and initialize clean store
  }
  pointsFallbackStore = {
    ledger: [],
    payouts: [],
    userNames: {},
    referralCodeToUid: {},
    referrals: [],
    watchTelemetry: {},
    securitySignals: {},
  };
  return pointsFallbackStore;
}

function persistPointsFallbackStore(store: PointsFallbackStore): void {
  try {
    const dir = path.dirname(POINTS_FALLBACK_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${POINTS_FALLBACK_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, POINTS_FALLBACK_CACHE_PATH);
  } catch (err) {
    console.warn(
      '[PointsFallback] Disk snapshot write failed:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

function summarizeUserFallback(
  store: PointsFallbackStore,
  userId: string,
  cfg: PayoutRuntimeConfig
): UserPointsSummary {
  const todayKey = getJakartaDateKey();
  const userLedger = store.ledger
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  let totalEarned = 0;
  let totalRedeemed = 0;
  let todayEarned = 0;
  let todayWatchPointsEarned = 0;
  let lastManualClaimTimeMs = 0;
  let dailyCheckinClaimedToday = false;
  const checkinRef = `checkin:${userId}:${todayKey}`;

  for (const row of userLedger) {
    if (row.type === 'earn') {
      totalEarned += row.points;
      if (row.referenceId === checkinRef) {
        dailyCheckinClaimedToday = true;
      }
      if (!row.referenceId.startsWith('refund:payout:')) {
        const createdDateKey = getJakartaDateKey(new Date(row.createdAt));
        if (createdDateKey === todayKey) {
          todayEarned += row.points;
          if (
            row.referenceId.startsWith('watch_min:') ||
            row.referenceId.startsWith('mission_')
          ) {
            todayWatchPointsEarned += row.points;
          }
        }
        const isManualClaim =
          row.referenceId.startsWith('checkin:') ||
          row.referenceId.startsWith('watch:');
        if (isManualClaim) {
          const ts = Date.parse(row.createdAt);
          if (Number.isFinite(ts) && ts > lastManualClaimTimeMs) {
            lastManualClaimTimeMs = ts;
          }
        }
      }
    } else if (row.type === 'redeem') {
      totalRedeemed += row.points;
    }
  }

  const tel = store.watchTelemetry[userId];
  const todayWatchSeconds =
    tel && tel.todayDateKey === todayKey
      ? Math.max(0, Number(tel.todayWatchSeconds) || 0)
      : 0;

  const balance = Math.max(0, totalEarned - totalRedeemed);
  const { usdAmount, idrAmount } = computePointsConversion(balance, cfg);
  const elapsedSec =
    lastManualClaimTimeMs > 0
      ? Math.floor((Date.now() - lastManualClaimTimeMs) / 1000)
      : 999999;
  const cooldownSecondsRemaining =
    lastManualClaimTimeMs > 0 && elapsedSec < cfg.claimCooldownSeconds
      ? Math.max(1, cfg.claimCooldownSeconds - elapsedSec)
      : 0;

  const userPayouts = store.payouts
    .filter((p) => p.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);

  return {
    balance,
    totalEarned,
    totalRedeemed,
    todayEarned,
    maxDailyEarnPoints: cfg.maxDailyEarnPoints,
    todayWatchSeconds,
    todayWatchPointsEarned,
    dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
    estimatedUsd: usdAmount,
    estimatedIdr: idrAmount,
    lastClaimAt:
      lastManualClaimTimeMs > 0
        ? new Date(lastManualClaimTimeMs).toISOString()
        : null,
    cooldownSecondsRemaining,
    dailyCheckinClaimedToday,
    ledger: userLedger.slice(0, 40),
    payouts: userPayouts,
  };
}

function mapLedgerRow(r: {
  id: string;
  user_id: string;
  type: string;
  points: number | string;
  description: string;
  reference_id: string;
  created_at: Date | string;
}): PointsLedgerRecord {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type === 'redeem' ? 'redeem' : 'earn',
    points: Math.max(0, Number(r.points) || 0),
    description: r.description || '',
    referenceId: r.reference_id,
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at || new Date().toISOString()),
  };
}

function mapPayoutRow(r: {
  id: string;
  user_id: string;
  points_spent: number | string;
  usd_amount: number | string;
  idr_amount: number | string;
  fx_rate_used: number | string;
  currency: string;
  method: string;
  destination_account: string;
  account_holder_name: string;
  status: string;
  admin_note: string;
  risk_flag?: string;
  suspicious_reason?: string;
  created_at: Date | string;
  updated_at: Date | string;
}): PayoutRequestRecord {
  return {
    id: r.id,
    userId: r.user_id,
    pointsSpent: Math.max(0, Number(r.points_spent) || 0),
    usdAmount: Number(Number(r.usd_amount || 0).toFixed(2)),
    idrAmount: Math.max(0, Math.round(Number(r.idr_amount) || 0)),
    fxRateUsed: Number(Number(r.fx_rate_used || 16000).toFixed(2)),
    currency: r.currency === 'USD' ? 'USD' : 'IDR',
    method: r.method as PayoutMethod,
    destinationAccount: r.destination_account,
    accountHolderName: r.account_holder_name,
    status: (['pending', 'approved', 'paid', 'rejected'].includes(r.status)
      ? r.status
      : 'pending') as PayoutStatus,
    adminNote: r.admin_note || '',
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

async function queryUserPointsSummaryOnClient(
  client: PoolClient,
  userId: string,
  cfg: PayoutRuntimeConfig
): Promise<UserPointsSummary> {
  const todayKey = getJakartaDateKey();
  const checkinRef = `checkin:${userId}:${todayKey}`;

  const aggRes = await client.query<{
    total_earned: string;
    total_redeemed: string;
    today_earned: string;
    today_watch_points: string;
    last_claim_at: Date | null;
    checkin_today: boolean;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0)::text AS total_earned,
       COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)::text AS total_redeemed,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND reference_id NOT LIKE 'refund:payout:%'
            AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_earned,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND (reference_id LIKE 'watch_min:%' OR reference_id LIKE 'mission_%')
            AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_watch_points,
       MAX(
         CASE
           WHEN type = 'earn'
            AND (reference_id LIKE 'checkin:%' OR reference_id LIKE 'watch:%')
           THEN created_at
           ELSE NULL
         END
       ) AS last_claim_at,
       BOOL_OR(reference_id = $3) AS checkin_today
     FROM points_ledger
     WHERE user_id = $1`,
    [userId, todayKey, checkinRef]
  );

  const telRes = await client.query<{
    today_watch_seconds: number;
    today_date_key: string;
  }>(
    `SELECT today_watch_seconds, today_date_key
     FROM watch_telemetry
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const agg = aggRes.rows[0];
  const totalEarned = Math.max(0, Number(agg?.total_earned) || 0);
  const totalRedeemed = Math.max(0, Number(agg?.total_redeemed) || 0);
  const todayEarned = Math.max(0, Number(agg?.today_earned) || 0);
  const todayWatchPointsEarned = Math.max(0, Number(agg?.today_watch_points) || 0);
  const telRow = telRes.rows[0];
  const todayWatchSeconds =
    telRow && telRow.today_date_key === todayKey
      ? Math.max(0, Number(telRow.today_watch_seconds) || 0)
      : 0;
  const balance = Math.max(0, totalEarned - totalRedeemed);
  const lastClaimDate = agg?.last_claim_at instanceof Date ? agg.last_claim_at : null;
  const elapsedSec = lastClaimDate
    ? Math.floor((Date.now() - lastClaimDate.getTime()) / 1000)
    : 999999;
  const cooldownSecondsRemaining =
    lastClaimDate && elapsedSec < cfg.claimCooldownSeconds
      ? Math.max(1, cfg.claimCooldownSeconds - elapsedSec)
      : 0;

  const ledgerRes = await client.query<{
    id: string;
    user_id: string;
    type: string;
    points: number;
    description: string;
    reference_id: string;
    created_at: Date;
  }>(
    `SELECT id, user_id, type, points, description, reference_id, created_at
     FROM points_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 40`,
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
    destination_account: string;
    account_holder_name: string;
    status: string;
    admin_note: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
            currency, method, destination_account, account_holder_name,
            status, admin_note, created_at, updated_at
     FROM payout_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId]
  );

  const { usdAmount, idrAmount } = computePointsConversion(balance, cfg);
  return {
    balance,
    totalEarned,
    totalRedeemed,
    todayEarned,
    maxDailyEarnPoints: cfg.maxDailyEarnPoints,
    todayWatchSeconds,
    todayWatchPointsEarned,
    dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
    estimatedUsd: usdAmount,
    estimatedIdr: idrAmount,
    lastClaimAt: lastClaimDate ? lastClaimDate.toISOString() : null,
    cooldownSecondsRemaining,
    dailyCheckinClaimedToday: Boolean(agg?.checkin_today),
    ledger: ledgerRes.rows.map(mapLedgerRow),
    payouts: payoutRes.rows.map(mapPayoutRow),
  };
}

export async function getUserPointsSummaryFromDb(
  userId: string
): Promise<UserPointsSummary> {
  const cfg = getPayoutRuntimeConfig();
  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      return await queryUserPointsSummaryOnClient(client, userId, cfg);
    } catch (err) {
      console.warn(
        '[PostgreSQL] getUserPointsSummaryFromDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    return summarizeUserFallback(store, userId, cfg);
  });
}

export async function claimPointsInDb(input: {
  userId: string;
  amount: number;
  description: string;
  referenceId: string;
  displayName?: string;
}): Promise<{
  ok: boolean;
  reason?: 'duplicate_claim' | 'cooldown_active' | 'daily_cap_reached' | 'invalid_amount';
  cooldownSecondsRemaining?: number;
  entry?: PointsLedgerRecord;
  summary: UserPointsSummary;
}> {
  const cfg = getPayoutRuntimeConfig();
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const summary = await getUserPointsSummaryFromDb(input.userId);
    return { ok: false, reason: 'invalid_amount', summary };
  }

  const todayKey = getJakartaDateKey();
  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `points:${input.userId}`,
      ]);

      const dupRes = await client.query<{ id: string }>(
        `SELECT id FROM points_ledger WHERE reference_id = $1 LIMIT 1`,
        [input.referenceId]
      );
      if (dupRes.rows.length > 0) {
        const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
        await client.query('COMMIT');
        return { ok: false, reason: 'duplicate_claim', summary };
      }

      const capRes = await client.query<{
        today_earned: string;
        last_claim_at: Date | null;
      }>(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN type = 'earn'
                AND reference_id NOT LIKE 'refund:payout:%'
                AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
               THEN points
               ELSE 0
             END
           ), 0)::text AS today_earned,
           MAX(
             CASE
               WHEN type = 'earn'
                AND (reference_id LIKE 'checkin:%' OR reference_id LIKE 'watch:%')
               THEN created_at
               ELSE NULL
             END
           ) AS last_claim_at
         FROM points_ledger
         WHERE user_id = $1`,
        [input.userId, todayKey]
      );

      const todayEarned = Math.max(0, Number(capRes.rows[0]?.today_earned) || 0);
      const lastClaimAt =
        capRes.rows[0]?.last_claim_at instanceof Date
          ? capRes.rows[0].last_claim_at
          : null;

      if (lastClaimAt) {
        const elapsedSec = Math.floor((Date.now() - lastClaimAt.getTime()) / 1000);
        if (elapsedSec < cfg.claimCooldownSeconds) {
          const remaining = Math.max(1, cfg.claimCooldownSeconds - elapsedSec);
          const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
          await client.query('COMMIT');
          return {
            ok: false,
            reason: 'cooldown_active',
            cooldownSecondsRemaining: remaining,
            summary,
          };
        }
      }

      if (todayEarned + amount > cfg.maxDailyEarnPoints) {
        const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
        await client.query('COMMIT');
        return { ok: false, reason: 'daily_cap_reached', summary };
      }

      const id = crypto.randomUUID();
      const inserted = await client.query<{
        id: string;
        user_id: string;
        type: string;
        points: number;
        description: string;
        reference_id: string;
        created_at: Date;
      }>(
        `INSERT INTO points_ledger (id, user_id, type, points, description, reference_id, created_at)
         VALUES ($1, $2, 'earn', $3, $4, $5, NOW())
         RETURNING id, user_id, type, points, description, reference_id, created_at`,
        [
          id,
          input.userId,
          amount,
          input.description.trim().slice(0, 240),
          input.referenceId.trim().slice(0, 200),
        ]
      );

      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
      await client.query('COMMIT');
      return {
        ok: true,
        entry: inserted.rows[0] ? mapLedgerRow(inserted.rows[0]) : undefined,
        summary,
      };
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      console.warn(
        '[PostgreSQL] claimPointsInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    if (input.displayName) {
      store.userNames[input.userId] = input.displayName;
    }

    if (store.ledger.some((r) => r.referenceId === input.referenceId)) {
      return {
        ok: false as const,
        reason: 'duplicate_claim' as const,
        summary: summarizeUserFallback(store, input.userId, cfg),
      };
    }

    const preSummary = summarizeUserFallback(store, input.userId, cfg);
    if (preSummary.cooldownSecondsRemaining > 0) {
      return {
        ok: false as const,
        reason: 'cooldown_active' as const,
        cooldownSecondsRemaining: preSummary.cooldownSecondsRemaining,
        summary: preSummary,
      };
    }
    if (preSummary.todayEarned + amount > cfg.maxDailyEarnPoints) {
      return {
        ok: false as const,
        reason: 'daily_cap_reached' as const,
        summary: preSummary,
      };
    }

    const entry: PointsLedgerRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      type: 'earn',
      points: amount,
      description: input.description.trim().slice(0, 240),
      referenceId: input.referenceId.trim().slice(0, 200),
      createdAt: new Date().toISOString(),
    };
    store.ledger.push(entry);
    persistPointsFallbackStore(store);

    return {
      ok: true as const,
      entry,
      summary: summarizeUserFallback(store, input.userId, cfg),
    };
  });
}

export async function createPayoutRequestInDb(input: {
  userId: string;
  pointsSpent: number;
  method: PayoutMethod;
  destinationAccount: string;
  accountHolderName: string;
  displayName?: string;
}): Promise<{
  ok: boolean;
  reason?: 'below_minimum' | 'insufficient_balance' | 'invalid_amount';
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

  const methodMeta = getMethodMetadata(input.method);
  const cleanDest = input.destinationAccount.trim().slice(0, 160);

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `points:${input.userId}`,
      ]);

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
        // Flag self-referral if referrer used the exact same destination account
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

      const payoutRes = await client.query<{
        id: string;
        user_id: string;
        points_spent: number;
        usd_amount: string;
        idr_amount: string;
        fx_rate_used: string;
        currency: string;
        method: string;
        destination_account: string;
        account_holder_name: string;
        status: string;
        admin_note: string;
        risk_flag: string;
        suspicious_reason: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO payout_requests (
           id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
           currency, method, destination_account, account_holder_name,
           status, admin_note, risk_flag, suspicious_reason, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', '', $11, $12, NOW(), NOW())
         RETURNING id, user_id, points_spent, usd_amount, idr_amount, fx_rate_used,
                   currency, method, destination_account, account_holder_name,
                   status, admin_note, risk_flag, suspicious_reason, created_at, updated_at`,
        [
          payoutId,
          input.userId,
          pointsSpent,
          usdAmount,
          idrAmount,
          fxRateUsed,
          currency,
          input.method,
          cleanDest,
          input.accountHolderName.trim().slice(0, 100),
          riskFlag,
          suspiciousReason,
        ]
      );

      await client.query(
        `INSERT INTO points_ledger (id, user_id, type, points, description, reference_id, created_at)
         VALUES ($1, $2, 'redeem', $3, $4, $5, NOW())`,
        [
          ledgerId,
          input.userId,
          pointsSpent,
          `Payout request via ${methodMeta.label} (${currency})`,
          refId,
        ]
      );

      const summary = await queryUserPointsSummaryOnClient(client, input.userId, cfg);
      await client.query('COMMIT');
      return {
        ok: true,
        payout: payoutRes.rows[0] ? mapPayoutRow(payoutRes.rows[0]) : undefined,
        summary,
      };
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      console.warn(
        '[PostgreSQL] createPayoutRequestInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    if (input.displayName) {
      store.userNames[input.userId] = input.displayName;
    }

    const preSummary = summarizeUserFallback(store, input.userId, cfg);
    if (preSummary.balance < pointsSpent) {
      return {
        ok: false as const,
        reason: 'insufficient_balance' as const,
        summary: preSummary,
      };
    }

    const flags: string[] = [];
    const reasons: string[] = [];
    const sig = store.securitySignals[input.userId];
    const tel = store.watchTelemetry[input.userId];
    if (sig?.riskFlag) flags.push(sig.riskFlag);
    if (sig?.suspiciousReason) reasons.push(sig.suspiciousReason);
    if (tel?.riskFlag && !flags.includes(tel.riskFlag)) flags.push(tel.riskFlag);
    if (tel?.suspiciousReason && !reasons.includes(tel.suspiciousReason)) {
      reasons.push(tel.suspiciousReason);
    }

    const sharedUsers = Array.from(
      new Set(
        store.payouts
          .filter(
            (p) =>
              p.userId !== input.userId &&
              p.destinationAccount.toLowerCase() === cleanDest.toLowerCase()
          )
          .map((p) => p.userId)
      )
    );
    if (sharedUsers.length > 0) {
      flags.push('shared_destination_account');
      reasons.push(`Destination account shared with ${sharedUsers.length} other account(s)`);
      store.securitySignals[input.userId] = {
        ...(sig || {
          userId: input.userId,
          ipHash: '',
          subnetHash: '',
          uaHash: '',
          deviceHash: '',
          riskFlag: '',
          suspiciousReason: '',
          lastSeenAt: new Date().toISOString(),
        }),
        riskFlag: 'shared_destination_account',
        suspiciousReason: 'Destination account previously used by another user',
        lastSeenAt: new Date().toISOString(),
      };
      for (const r of store.referrals) {
        if (
          (r.refereeUid === input.userId && sharedUsers.includes(r.referrerUid)) ||
          (r.referrerUid === input.userId && sharedUsers.includes(r.refereeUid))
        ) {
          r.status = 'rejected_fraud';
          r.riskFlag = 'shared_payout_destination';
          r.suspiciousReason = 'Referee and referrer share identical payout destination account';
          r.updatedAt = new Date().toISOString();
        }
      }
    }

    const nowIso = new Date().toISOString();
    const payoutId = crypto.randomUUID();
    const payout: PayoutRequestRecord = {
      id: payoutId,
      userId: input.userId,
      pointsSpent,
      usdAmount,
      idrAmount,
      fxRateUsed,
      currency,
      method: input.method,
      destinationAccount: cleanDest,
      accountHolderName: input.accountHolderName.trim().slice(0, 100),
      status: 'pending',
      adminNote: '',
      riskFlag: Array.from(new Set(flags)).join(',').slice(0, 120),
      suspiciousReason: Array.from(new Set(reasons)).join('; ').slice(0, 300),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const ledgerEntry: PointsLedgerRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      type: 'redeem',
      points: pointsSpent,
      description: `Payout request via ${methodMeta.label} (${currency})`,
      referenceId: `payout:${payoutId}`,
      createdAt: nowIso,
    };
    store.payouts.push(payout);
    store.ledger.push(ledgerEntry);
    persistPointsFallbackStore(store);

    return {
      ok: true as const,
      payout,
      summary: summarizeUserFallback(store, input.userId, cfg),
    };
  });
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
  const hasFilter = ['pending', 'approved', 'paid', 'rejected'].includes(safeStatus);
  const safeLimit = Math.min(200, Math.max(1, Number(options?.limit) || 50));
  const safeOffset = Math.max(0, Number(options?.offset) || 0);

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    try {
      const countRes = await dbQuery<{ cnt: string }>(
        hasFilter
          ? `SELECT COUNT(*)::text AS cnt FROM payout_requests WHERE status = $1`
          : `SELECT COUNT(*)::text AS cnt FROM payout_requests`,
        hasFilter ? [safeStatus] : []
      );
      const listRes = await dbQuery<{
        id: string;
        user_id: string;
        points_spent: number;
        usd_amount: string;
        idr_amount: string;
        fx_rate_used: string;
        currency: string;
        method: string;
        destination_account: string;
        account_holder_name: string;
        status: string;
        admin_note: string;
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

      if (listRes) {
        return {
          total: Number(countRes?.rows[0]?.cnt) || listRes.rows.length,
          items: listRes.rows.map((r) => ({
            ...mapPayoutRow(r),
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
      }
    } catch (err) {
      console.warn(
        '[PostgreSQL] listAdminPayoutRequestsFromDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    const filtered = store.payouts
      .filter((p) => (!hasFilter ? true : p.status === safeStatus))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return {
      total: filtered.length,
      items: filtered.slice(safeOffset, safeOffset + safeLimit).map((p) => {
        const tel = store.watchTelemetry[p.userId];
        const sig = store.securitySignals[p.userId];
        return {
          ...p,
          userName: store.userNames[p.userId] || undefined,
          verifiedWatchSeconds: tel?.verifiedWatchSeconds || 0,
          fastDeltaStrikes: tel?.fastDeltaStrikes || 0,
          concurrentTabStrikes: tel?.concurrentTabStrikes || 0,
          signalRiskFlag: p.riskFlag || sig?.riskFlag || tel?.riskFlag || '',
          signalSuspiciousReason:
            p.suspiciousReason || sig?.suspiciousReason || tel?.suspiciousReason || '',
        };
      }),
    };
  });
}

export async function updateAdminPayoutStatusInDb(input: {
  payoutId: string;
  status: 'approved' | 'paid' | 'rejected';
  adminNote?: string;
}): Promise<{
  ok: boolean;
  reason?: 'not_found' | 'already_finalized' | 'invalid_transition';
  payout?: PayoutRequestRecord;
  refunded?: boolean;
}> {
  const cleanNote = String(input.adminNote || '').trim().slice(0, 300);
  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
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
        destination_account: string;
        account_holder_name: string;
        status: string;
        admin_note: string;
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

      if (row.status === 'paid' || row.status === 'rejected') {
        await client.query('COMMIT');
        return {
          ok: false,
          reason: 'already_finalized',
          payout: mapPayoutRow(row),
        };
      }
      if (row.status === 'approved' && input.status === 'approved') {
        await client.query('COMMIT');
        return {
          ok: true,
          payout: mapPayoutRow(row),
          refunded: false,
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
        destination_account: string;
        account_holder_name: string;
        status: string;
        admin_note: string;
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
      if (input.status === 'rejected') {
        const refundRef = `refund:payout:${row.id}`;
        const refundInsert = await client.query(
          `INSERT INTO points_ledger (id, user_id, type, points, description, reference_id, created_at)
           VALUES ($1, $2, 'earn', $3, $4, $5, NOW())
           ON CONFLICT (reference_id) DO NOTHING`,
          [
            crypto.randomUUID(),
            row.user_id,
            Math.max(1, Number(row.points_spent) || 1),
            `Refund rejected payout #${row.id.slice(0, 8)}`,
            refundRef,
          ]
        );
        refunded = (refundInsert.rowCount ?? 0) > 0;
      }

      await client.query('COMMIT');
      return {
        ok: true,
        payout: updatedRes.rows[0] ? mapPayoutRow(updatedRes.rows[0]) : undefined,
        refunded,
      };
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      console.warn(
        '[PostgreSQL] updateAdminPayoutStatusInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    const target = store.payouts.find((p) => p.id === input.payoutId);
    if (!target) {
      return { ok: false as const, reason: 'not_found' as const };
    }
    if (target.status === 'paid' || target.status === 'rejected') {
      return {
        ok: false as const,
        reason: 'already_finalized' as const,
        payout: target,
      };
    }
    target.status = input.status;
    if (cleanNote) {
      target.adminNote = cleanNote;
    }
    target.updatedAt = new Date().toISOString();

    let refunded = false;
    if (input.status === 'rejected') {
      const refundRef = `refund:payout:${target.id}`;
      if (!store.ledger.some((l) => l.referenceId === refundRef)) {
        store.ledger.push({
          id: crypto.randomUUID(),
          userId: target.userId,
          type: 'earn',
          points: target.pointsSpent,
          description: `Refund rejected payout #${target.id.slice(0, 8)}`,
          referenceId: refundRef,
          createdAt: new Date().toISOString(),
        });
        refunded = true;
      }
    }
    persistPointsFallbackStore(store);
    return { ok: true as const, payout: target, refunded };
  });
}

const LIVE_MASKED_USERS = [
  'R***a',
  'D***n',
  'A***l',
  'M***i',
  'K***o',
  'S***a',
  'F***r',
  'N***y',
  'T***s',
  'Y***i',
  'B***i',
  'W***y',
  'E***n',
  'H***a',
  'L***a',
  'Z***r',
  'P***i',
  'C***a',
] as const;

const LIVE_IDR_METHODS: PayoutMethod[] = ['dana', 'gopay', 'ovo', 'bank_transfer'];
const LIVE_USD_METHODS: PayoutMethod[] = ['paypal', 'usdt_polygon', 'usdt_trc20', 'wise'];
const LIVE_IDR_AMOUNTS = [50_000, 55_000, 62_000, 75_000, 91_000, 105_000, 125_000, 150_000, 182_000];
const LIVE_USD_AMOUNTS = [5.0, 5.5, 6.25, 7.5, 8.0, 10.0, 12.5, 15.0];
const LIVE_ROLL_STEP_MS = 12_000;

function buildRollingLivePayouts(
  nowMs: number,
  cfg: PayoutRuntimeConfig,
  count: number
): LivePayoutFeedItem[] {
  const currentSlot = Math.floor(nowMs / LIVE_ROLL_STEP_MS);
  const items: LivePayoutFeedItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const slot = currentSlot - i;
    const h = Math.abs((slot * 2654435761) | 0);
    const maskedUser = LIVE_MASKED_USERS[h % LIVE_MASKED_USERS.length];
    const isUsd = (h >> 3) % 5 >= 3; // ~60% IDR, ~40% USD

    let method: PayoutMethod;
    let usdAmount: number;
    let idrAmount: number;
    if (isUsd) {
      method = LIVE_USD_METHODS[(h >> 6) % LIVE_USD_METHODS.length];
      const baseUsd = LIVE_USD_AMOUNTS[(h >> 9) % LIVE_USD_AMOUNTS.length];
      usdAmount = Math.max(cfg.minPayoutUsd, baseUsd);
      idrAmount = Math.round(usdAmount * cfg.usdToIdrRate);
    } else {
      method = LIVE_IDR_METHODS[(h >> 6) % LIVE_IDR_METHODS.length];
      const baseIdr = LIVE_IDR_AMOUNTS[(h >> 9) % LIVE_IDR_AMOUNTS.length];
      idrAmount = Math.max(cfg.minPayoutIdr, baseIdr);
      usdAmount = Math.round((idrAmount / cfg.usdToIdrRate) * 100) / 100;
    }

    const meta = getMethodMetadata(method);
    const ageOffsetMs = (h % 7) * 1_000 + 2_000;
    const createdAtMs = Math.max(0, slot * LIVE_ROLL_STEP_MS - ageOffsetMs);
    items.push({
      id: `live-roll-${slot}`,
      maskedUser,
      countryCode: meta.countryCode,
      method,
      methodLabel: meta.label,
      currency: meta.currency,
      usdAmount,
      idrAmount,
      status: i === 0 && h % 4 === 0 ? 'approved' : 'paid',
      createdAt: new Date(createdAtMs).toISOString(),
      isReal: false,
    });
  }

  return items;
}

export async function listLivePayoutFeedFromDb(
  limit = 12
): Promise<LivePayoutFeedItem[]> {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));
  const cfg = getPayoutRuntimeConfig();
  const realItems: LivePayoutFeedItem[] = [];

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    try {
      const res = await dbQuery<{
        id: string;
        method: string;
        currency: string;
        usd_amount: string;
        idr_amount: string;
        status: string;
        account_holder_name: string;
        user_name: string | null;
        updated_at: Date;
      }>(
        `SELECT p.id, p.method, p.currency, p.usd_amount, p.idr_amount, p.status,
                p.account_holder_name, u.display_name AS user_name, p.updated_at
         FROM payout_requests p
         LEFT JOIN users u ON u.uid = p.user_id
         WHERE p.status IN ('paid', 'approved')
         ORDER BY p.updated_at DESC
         LIMIT $1`,
        [safeLimit]
      );
      if (res) {
        for (const r of res.rows) {
          const method = (ALLOWED_PAYOUT_METHODS.has(r.method as PayoutMethod)
            ? r.method
            : 'dana') as PayoutMethod;
          const meta = getMethodMetadata(method);
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
            status: r.status === 'paid' ? 'paid' : 'approved',
            createdAt:
              r.updated_at instanceof Date
                ? r.updated_at.toISOString()
                : new Date().toISOString(),
            isReal: true,
          });
        }
      }
    } catch (err) {
      console.warn(
        '[PostgreSQL] listLivePayoutFeedFromDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  } else {
    await withPointsFallbackLock(() => {
      const store = loadPointsFallbackStore();
      const rows = store.payouts
        .filter((p) => p.status === 'paid' || p.status === 'approved')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, safeLimit);

      for (const r of rows) {
        if (r.currency === 'IDR' && r.idrAmount < cfg.minPayoutIdr) continue;
        if (r.currency === 'USD' && r.usdAmount < cfg.minPayoutUsd) continue;
        const meta = getMethodMetadata(r.method);
        realItems.push({
          id: r.id,
          maskedUser: maskDisplayNameForFeed(
            store.userNames[r.userId] || r.accountHolderName
          ),
          countryCode: meta.countryCode,
          method: r.method,
          methodLabel: meta.label,
          currency: r.currency,
          usdAmount: r.usdAmount,
          idrAmount: r.idrAmount,
          status: r.status === 'paid' ? 'paid' : 'approved',
          createdAt: r.updatedAt,
          isReal: true,
        });
      }
    });
  }

  if (realItems.length >= safeLimit) {
    return realItems.slice(0, safeLimit);
  }

  const remaining = safeLimit - realItems.length;
  const rollingItems = buildRollingLivePayouts(Date.now(), cfg, remaining);
  return [...realItems, ...rollingItems].slice(0, safeLimit);
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
  const activePool = getPool();

  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
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
      console.warn(
        '[PostgreSQL] recordUserSecuritySignalInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    if (input.displayName) {
      store.userNames[input.userId] = input.displayName;
    }
    store.referralCodeToUid[referralCode] = input.userId;

    const prev = store.securitySignals[input.userId];
    const nowIso = new Date().toISOString();
    const nextSignal: UserSecuritySignalRecord = {
      userId: input.userId,
      ipHash: input.ipHash || prev?.ipHash || '',
      subnetHash: input.subnetHash || prev?.subnetHash || '',
      uaHash: input.uaHash || prev?.uaHash || '',
      deviceHash: input.deviceHash || prev?.deviceHash || '',
      riskFlag: prev?.riskFlag || '',
      suspiciousReason: prev?.suspiciousReason || '',
      lastSeenAt: nowIso,
    };

    const allSignals = Object.values({
      ...store.securitySignals,
      [input.userId]: nextSignal,
    });
    if (nextSignal.deviceHash) {
      const sameDev = allSignals.filter((s) => s.deviceHash === nextSignal.deviceHash).length;
      if (sameDev >= 3 && !nextSignal.riskFlag) {
        nextSignal.riskFlag = 'multi_account_device';
        nextSignal.suspiciousReason = '3+ accounts detected sharing identical device fingerprint';
      }
    }
    if (nextSignal.subnetHash) {
      const sameNet = allSignals.filter((s) => s.subnetHash === nextSignal.subnetHash).length;
      if (sameNet >= 5 && !nextSignal.riskFlag) {
        nextSignal.riskFlag = 'multi_account_subnet';
        nextSignal.suspiciousReason = '5+ accounts detected from identical IP subnet in 24h';
      }
    }

    store.securitySignals[input.userId] = nextSignal;
    persistPointsFallbackStore(store);
    return {
      riskFlag: nextSignal.riskFlag,
      suspiciousReason: nextSignal.suspiciousReason,
      referralCode,
    };
  });
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
  reason?:
    | 'invalid_code'
    | 'self_referral'
    | 'already_referred'
    | 'account_not_new'
    | 'fraud_signal_match';
}> {
  const cleanCode = input.referralCode.trim().toUpperCase();
  if (!/^KD[A-F0-9]{6,12}$/.test(cleanCode)) {
    return { bound: false, reason: 'invalid_code' };
  }

  const cfg = getPayoutRuntimeConfig();
  const activePool = getPool();

  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
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

      const referrerRes = await client.query<{ uid: string }>(
        `SELECT uid FROM users WHERE UPPER(referral_code) = $1 LIMIT 1`,
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

      // Also check if another referral already used the same IP or device hash
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

      await client.query(
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

      await client.query('COMMIT');
      return { bound: true, status: 'pending_watch' };
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback
      }
      console.warn(
        '[PostgreSQL] bindReferralForUserInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    if (input.displayName) {
      store.userNames[input.refereeUid] = input.displayName;
    }

    const existing = store.referrals.find((r) => r.refereeUid === input.refereeUid);
    if (existing) {
      return { bound: false, reason: 'already_referred' as const, status: existing.status };
    }

    const referrerUid = store.referralCodeToUid[cleanCode];
    if (!referrerUid) {
      return { bound: false, reason: 'invalid_code' as const };
    }
    if (referrerUid === input.refereeUid) {
      return { bound: false, reason: 'self_referral' as const };
    }

    const priorWatch = store.watchTelemetry[input.refereeUid]?.verifiedWatchSeconds || 0;
    const priorLedger = store.ledger.filter((l) => l.userId === input.refereeUid).length;
    if (
      priorWatch >= ANTI_CHEAT_DEFAULTS.newAccountMaxWatchSeconds ||
      priorLedger > ANTI_CHEAT_DEFAULTS.newAccountMaxLedgerEntries
    ) {
      return { bound: false, reason: 'account_not_new' as const };
    }

    const refSig = store.securitySignals[referrerUid];
    const sameIp = Boolean(input.ipHash && refSig?.ipHash && input.ipHash === refSig.ipHash);
    const sameDevice = Boolean(
      input.deviceHash && refSig?.deviceHash && input.deviceHash === refSig.deviceHash
    );
    const sameSubnetAndUa = Boolean(
      input.subnetHash &&
        refSig?.subnetHash &&
        input.uaHash &&
        refSig?.uaHash &&
        input.subnetHash === refSig.subnetHash &&
        input.uaHash === refSig.uaHash
    );
    const dupDeviceRef = Boolean(
      input.deviceHash &&
        store.referrals.some((r) => r.refereeDeviceHash === input.deviceHash)
    );

    const nowIso = new Date().toISOString();
    if (sameIp || sameDevice || sameSubnetAndUa || dupDeviceRef) {
      const reasonText = sameDevice
        ? 'Device fingerprint matches referrer or existing referral'
        : sameIp
        ? 'IP address matches referrer'
        : sameSubnetAndUa
        ? 'IP subnet + browser UA matches referrer'
        : 'Duplicate device referral blocked';
      store.referrals.push({
        id: crypto.randomUUID(),
        referrerUid,
        refereeUid: input.refereeUid,
        referralCode: cleanCode,
        status: 'rejected_fraud',
        bonusPoints: cfg.referralBonusPoints,
        refereeIpHash: input.ipHash,
        refereeSubnetHash: input.subnetHash,
        refereeUaHash: input.uaHash,
        refereeDeviceHash: input.deviceHash,
        riskFlag: 'self_referral_signal_match',
        suspiciousReason: reasonText,
        qualifiedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      persistPointsFallbackStore(store);
      return {
        bound: false,
        reason: 'fraud_signal_match' as const,
        status: 'rejected_fraud' as const,
      };
    }

    store.referrals.push({
      id: crypto.randomUUID(),
      referrerUid,
      refereeUid: input.refereeUid,
      referralCode: cleanCode,
      status: 'pending_watch',
      bonusPoints: cfg.referralBonusPoints,
      refereeIpHash: input.ipHash,
      refereeSubnetHash: input.subnetHash,
      refereeUaHash: input.uaHash,
      refereeDeviceHash: input.deviceHash,
      riskFlag: '',
      suspiciousReason: '',
      qualifiedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    persistPointsFallbackStore(store);
    return { bound: true, status: 'pending_watch' as const };
  });
}

interface WatchMissionGrantResult {
  awardedWatchPoints: number;
  todayWatchPointsEarned: number;
  pointsBalance: number | null;
}

async function getQuickPointsStatePg(
  client: PoolClient,
  userId: string,
  todayKey: string
): Promise<{
  balance: number;
  todayEarned: number;
  todayWatchPointsEarned: number;
}> {
  const res = await client.query<{
    total_earned: string;
    total_redeemed: string;
    today_earned: string;
    today_watch_points: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0)::text AS total_earned,
       COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)::text AS total_redeemed,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND reference_id NOT LIKE 'refund:payout:%'
            AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_earned,
       COALESCE(SUM(
         CASE
           WHEN type = 'earn'
            AND (reference_id LIKE 'watch_min:%' OR reference_id LIKE 'mission_%')
            AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
           THEN points
           ELSE 0
         END
       ), 0)::text AS today_watch_points
     FROM points_ledger
     WHERE user_id = $1`,
    [userId, todayKey]
  );
  const row = res.rows[0];
  const totalEarned = Math.max(0, Number(row?.total_earned) || 0);
  const totalRedeemed = Math.max(0, Number(row?.total_redeemed) || 0);
  return {
    balance: Math.max(0, totalEarned - totalRedeemed),
    todayEarned: Math.max(0, Number(row?.today_earned) || 0),
    todayWatchPointsEarned: Math.max(0, Number(row?.today_watch_points) || 0),
  };
}

async function grantWatchMissionPointsPg(
  client: PoolClient,
  userId: string,
  todayKey: string,
  todayWatchSeconds: number,
  cfg: PayoutRuntimeConfig,
  shouldAward: boolean
): Promise<WatchMissionGrantResult> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `points:${userId}`,
  ]);

  const initial = await getQuickPointsStatePg(client, userId, todayKey);
  if (!shouldAward) {
    return {
      awardedWatchPoints: 0,
      todayWatchPointsEarned: initial.todayWatchPointsEarned,
      pointsBalance: initial.balance,
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
    };
  }

  const existingRes = await client.query<{ reference_id: string }>(
    `SELECT reference_id
     FROM points_ledger
     WHERE user_id = $1
       AND (reference_id LIKE $2 OR reference_id LIKE $3)`,
    [userId, `watch_min:${userId}:${todayKey}:%`, `mission_%:${userId}:${todayKey}`]
  );
  const existingRefs = new Set(existingRes.rows.map((r) => r.reference_id));

  let remainingDaily = Math.max(0, cfg.maxDailyEarnPoints - initial.todayEarned);
  let awardedWatchPoints = 0;

  const candidates: Array<{ refId: string; points: number; desc: string }> = [];
  const maxMinutes = Math.floor(maxMissionSec / 60);
  for (let m = 1; m <= Math.min(completedMinutes, maxMinutes); m += 1) {
    candidates.push({
      refId: `watch_min:${userId}:${todayKey}:m${m}`,
      points: cfg.watchMinutePoints,
      desc: `Misi Nonton Aktif (Menit ${m}/${maxMinutes})`,
    });
  }
  for (const ms of cfg.dailyMissionMilestones) {
    if (completedMinutes >= ms.minutes) {
      candidates.push({
        refId: `mission_${ms.minutes}m:${userId}:${todayKey}`,
        points: ms.bonusPoints,
        desc: `Bonus Misi Harian ${ms.minutes} Menit Nonton`,
      });
    }
  }

  for (const cand of candidates) {
    if (existingRefs.has(cand.refId)) continue;
    if (cand.points <= 0 || cand.points > remainingDaily) continue;
    const ins = await client.query(
      `INSERT INTO points_ledger (id, user_id, type, points, description, reference_id, created_at)
       VALUES ($1, $2, 'earn', $3, $4, $5, NOW())
       ON CONFLICT (reference_id) DO NOTHING`,
      [crypto.randomUUID(), userId, cand.points, cand.desc, cand.refId]
    );
    if ((ins.rowCount ?? 0) > 0) {
      existingRefs.add(cand.refId);
      remainingDaily -= cand.points;
      awardedWatchPoints += cand.points;
    }
  }

  return {
    awardedWatchPoints,
    todayWatchPointsEarned: initial.todayWatchPointsEarned + awardedWatchPoints,
    pointsBalance: initial.balance + awardedWatchPoints,
  };
}

function getQuickPointsStateFallback(
  store: PointsFallbackStore,
  userId: string,
  todayKey: string
): {
  balance: number;
  todayEarned: number;
  todayWatchPointsEarned: number;
} {
  let totalEarned = 0;
  let totalRedeemed = 0;
  let todayEarned = 0;
  let todayWatchPointsEarned = 0;

  for (const row of store.ledger) {
    if (row.userId !== userId) continue;
    if (row.type === 'earn') {
      totalEarned += row.points;
      if (!row.referenceId.startsWith('refund:payout:')) {
        if (getJakartaDateKey(new Date(row.createdAt)) === todayKey) {
          todayEarned += row.points;
          if (
            row.referenceId.startsWith('watch_min:') ||
            row.referenceId.startsWith('mission_')
          ) {
            todayWatchPointsEarned += row.points;
          }
        }
      }
    } else if (row.type === 'redeem') {
      totalRedeemed += row.points;
    }
  }

  return {
    balance: Math.max(0, totalEarned - totalRedeemed),
    todayEarned,
    todayWatchPointsEarned,
  };
}

function grantWatchMissionPointsFallback(
  store: PointsFallbackStore,
  userId: string,
  todayKey: string,
  todayWatchSeconds: number,
  cfg: PayoutRuntimeConfig,
  shouldAward: boolean,
  nowIso: string
): WatchMissionGrantResult {
  const initial = getQuickPointsStateFallback(store, userId, todayKey);
  if (!shouldAward) {
    return {
      awardedWatchPoints: 0,
      todayWatchPointsEarned: initial.todayWatchPointsEarned,
      pointsBalance: initial.balance,
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
    };
  }

  const existingRefs = new Set(
    store.ledger
      .filter((r) => r.userId === userId)
      .map((r) => r.referenceId)
  );
  let remainingDaily = Math.max(0, cfg.maxDailyEarnPoints - initial.todayEarned);
  let awardedWatchPoints = 0;

  const candidates: Array<{ refId: string; points: number; desc: string }> = [];
  const maxMinutes = Math.floor(maxMissionSec / 60);
  for (let m = 1; m <= Math.min(completedMinutes, maxMinutes); m += 1) {
    candidates.push({
      refId: `watch_min:${userId}:${todayKey}:m${m}`,
      points: cfg.watchMinutePoints,
      desc: `Misi Nonton Aktif (Menit ${m}/${maxMinutes})`,
    });
  }
  for (const ms of cfg.dailyMissionMilestones) {
    if (completedMinutes >= ms.minutes) {
      candidates.push({
        refId: `mission_${ms.minutes}m:${userId}:${todayKey}`,
        points: ms.bonusPoints,
        desc: `Bonus Misi Harian ${ms.minutes} Menit Nonton`,
      });
    }
  }

  for (const cand of candidates) {
    if (existingRefs.has(cand.refId)) continue;
    if (cand.points <= 0 || cand.points > remainingDaily) continue;
    store.ledger.push({
      id: crypto.randomUUID(),
      userId,
      type: 'earn',
      points: cand.points,
      description: cand.desc,
      referenceId: cand.refId,
      createdAt: nowIso,
    });
    existingRefs.add(cand.refId);
    remainingDaily -= cand.points;
    awardedWatchPoints += cand.points;
  }

  return {
    awardedWatchPoints,
    todayWatchPointsEarned: initial.todayWatchPointsEarned + awardedWatchPoints,
    pointsBalance: initial.balance + awardedWatchPoints,
  };
}

export async function recordWatchHeartbeatInDb(input: {
  userId: string;
  streamSessionId: string;
  mediaKey: string;
  currentTimeSec: number;
  isPlaying: boolean;
  tabVisible: boolean;
  playbackRate: number;
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
  displayName?: string;
}): Promise<{
  ok: boolean;
  addedSeconds: number;
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  awardedWatchPoints: number;
  todayWatchPointsEarned: number;
  dailyMissionMaxWatchSeconds: number;
  pointsBalance: number | null;
  referralQualified: boolean;
  riskFlag: string;
  reason?:
    | 'session_started'
    | 'paused_or_hidden'
    | 'invalid_playback_speed'
    | 'concurrent_stream_detected'
    | 'heartbeat_too_fast'
    | 'video_not_advancing'
    | 'daily_watch_cap_reached'
    | 'counted';
}> {
  const cfg = getPayoutRuntimeConfig();
  const todayKey = getJakartaDateKey();
  const cleanSessionId = input.streamSessionId.trim().slice(0, 80);
  const cleanMediaKey = input.mediaKey.trim().slice(0, 140);
  const safeVideoTime = Math.max(0, Number(input.currentTimeSec) || 0);
  const safeRate = Number(input.playbackRate) || 1;

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
      reason: 'session_started',
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

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    let client: PoolClient | null = null;
    try {
      client = await activePool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `watch:${input.userId}`,
      ]);

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
      const nowMs = Date.now();
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
      const wallElapsedSec = lastHbMs > 0 ? Math.floor((nowMs - lastHbMs) / 1000) : 0;
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: false,
          addedSeconds: 0,
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

      // 2. Paused or backgrounded tab -> release active lock & reset anchor without incrementing
      if (!input.isPlaying || !input.tabVisible) {
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: true,
          addedSeconds: 0,
          verifiedWatchSeconds,
          todayWatchSeconds,
          awardedWatchPoints: 0,
          todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
          dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
          pointsBalance: ptsState.balance,
          referralQualified: false,
          riskFlag,
          reason: 'paused_or_hidden',
        };
      }

      // 3. Playback speed guard (1x normal speed required) -> reset anchor
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: true,
          addedSeconds: 0,
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: true,
          addedSeconds: 0,
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
      if (wallElapsedSec < ANTI_CHEAT_DEFAULTS.minHeartbeatIntervalSec) {
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: false,
          addedSeconds: 0,
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
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: true,
          addedSeconds: 0,
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

      if (todayWatchSeconds >= cfg.maxDailyVerifiedWatchSeconds) {
        await client.query(
          `UPDATE watch_telemetry
           SET last_heartbeat_at = NOW(), last_video_time_sec = $2, updated_at = NOW()
           WHERE user_id = $1`,
          [input.userId, safeVideoTime]
        );
        const ptsState = await getQuickPointsStatePg(client, input.userId, todayKey);
        await client.query('COMMIT');
        return {
          ok: true,
          addedSeconds: 0,
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

      // 6. Grant daily watch-minute + milestone mission points (max 1h/day)
      const secCheckSelf = await client.query<{ risk_flag: string }>(
        `SELECT risk_flag FROM user_security_signals WHERE user_id = $1`,
        [input.userId]
      );
      const hasRiskFlag = Boolean(riskFlag || secCheckSelf.rows[0]?.risk_flag);
      const missionGrant = await grantWatchMissionPointsPg(
        client,
        input.userId,
        todayKey,
        todayWatchSeconds,
        cfg,
        addedSeconds > 0 && !hasRiskFlag
      );

      // 7. Auto-qualify referral if verifiedWatchSeconds >= 3600 (1 hour)
      let referralQualified = false;
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
               COUNT(*) FILTER (WHERE (qualified_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date)::text AS daily_cnt,
               COUNT(*) FILTER (WHERE qualified_at >= NOW() - INTERVAL '7 days')::text AS weekly_cnt
             FROM referrals
             WHERE referrer_uid = $1 AND status = 'qualified'`,
            [pendingRef.referrer_uid, todayKey]
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
            const bonus = Math.max(1, Number(pendingRef.bonus_points) || cfg.referralBonusPoints);
            const insertBonus = await client.query(
              `INSERT INTO points_ledger (id, user_id, type, points, description, reference_id, created_at)
               VALUES ($1, $2, 'earn', $3, $4, $5, NOW())
               ON CONFLICT (reference_id) DO NOTHING`,
              [
                crypto.randomUUID(),
                pendingRef.referrer_uid,
                bonus,
                'Valid Referral Bonus (1h+ verified watch)',
                `referral:qualify:${input.userId}`,
              ]
            );
            referralQualified = (insertBonus.rowCount ?? 0) > 0;
          }
        }
      }

      await client.query('COMMIT');
      return {
        ok: true,
        addedSeconds,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: missionGrant.awardedWatchPoints,
        todayWatchPointsEarned: missionGrant.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: missionGrant.pointsBalance,
        referralQualified,
        riskFlag,
        reason: 'counted',
      };
    } catch (err) {
      try {
        await client?.query('ROLLBACK');
      } catch {
        // Ignore rollback
      }
      console.warn(
        '[PostgreSQL] recordWatchHeartbeatInDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      client?.release();
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    const prev = store.watchTelemetry[input.userId];
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    let verifiedWatchSeconds = prev?.verifiedWatchSeconds || 0;
    let todayWatchSeconds =
      prev && prev.todayDateKey === todayKey ? prev.todayWatchSeconds : 0;
    let fastStrikes = prev?.fastDeltaStrikes || 0;
    let concurrentStrikes = prev?.concurrentTabStrikes || 0;
    let riskFlag = prev?.riskFlag || '';
    let suspiciousReason = prev?.suspiciousReason || '';

    const lastHbMs = prev?.lastHeartbeatAt ? Date.parse(prev.lastHeartbeatAt) : 0;
    const wallElapsedSec = lastHbMs > 0 ? Math.floor((nowMs - lastHbMs) / 1000) : 0;

    if (
      prev?.activeStreamSessionId &&
      prev.activeStreamSessionId !== cleanSessionId &&
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
      store.watchTelemetry[input.userId] = {
        ...(prev || {
          userId: input.userId,
          verifiedWatchSeconds,
          todayWatchSeconds,
          todayDateKey: todayKey,
          activeStreamSessionId: cleanSessionId,
          activeStreamMediaKey: cleanMediaKey,
          lastHeartbeatAt: nowIso,
          lastVideoTimeSec: safeVideoTime,
          fastDeltaStrikes: fastStrikes,
          concurrentTabStrikes: concurrentStrikes,
          riskFlag,
          suspiciousReason,
          updatedAt: nowIso,
        }),
        concurrentTabStrikes: concurrentStrikes,
        riskFlag,
        suspiciousReason,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: false,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'concurrent_stream_detected' as const,
      };
    }

    if (!input.isPlaying || !input.tabVisible) {
      store.watchTelemetry[input.userId] = {
        userId: input.userId,
        verifiedWatchSeconds,
        todayWatchSeconds,
        todayDateKey: todayKey,
        activeStreamSessionId: '',
        activeStreamMediaKey: cleanMediaKey,
        lastHeartbeatAt: nowIso,
        lastVideoTimeSec: -1,
        fastDeltaStrikes: fastStrikes,
        concurrentTabStrikes: concurrentStrikes,
        riskFlag,
        suspiciousReason,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: true,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'paused_or_hidden' as const,
      };
    }

    if (
      safeRate > ANTI_CHEAT_DEFAULTS.maxPlaybackRate ||
      safeRate < ANTI_CHEAT_DEFAULTS.minPlaybackRate
    ) {
      store.watchTelemetry[input.userId] = {
        userId: input.userId,
        verifiedWatchSeconds,
        todayWatchSeconds,
        todayDateKey: todayKey,
        activeStreamSessionId: cleanSessionId,
        activeStreamMediaKey: cleanMediaKey,
        lastHeartbeatAt: nowIso,
        lastVideoTimeSec: -1,
        fastDeltaStrikes: fastStrikes,
        concurrentTabStrikes: concurrentStrikes,
        riskFlag,
        suspiciousReason,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: true,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'invalid_playback_speed' as const,
      };
    }

    if (
      !prev ||
      prev.activeStreamSessionId !== cleanSessionId ||
      prev.activeStreamMediaKey !== cleanMediaKey ||
      lastHbMs <= 0 ||
      prev.lastVideoTimeSec < 0
    ) {
      store.watchTelemetry[input.userId] = {
        userId: input.userId,
        verifiedWatchSeconds,
        todayWatchSeconds,
        todayDateKey: todayKey,
        activeStreamSessionId: cleanSessionId,
        activeStreamMediaKey: cleanMediaKey,
        lastHeartbeatAt: nowIso,
        lastVideoTimeSec: safeVideoTime,
        fastDeltaStrikes: fastStrikes,
        concurrentTabStrikes: concurrentStrikes,
        riskFlag,
        suspiciousReason,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: true,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'session_started' as const,
      };
    }

    if (wallElapsedSec < ANTI_CHEAT_DEFAULTS.minHeartbeatIntervalSec) {
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
      store.watchTelemetry[input.userId] = {
        ...prev,
        fastDeltaStrikes: fastStrikes,
        riskFlag,
        suspiciousReason,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: false,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'heartbeat_too_fast' as const,
      };
    }

    const videoDeltaSec = safeVideoTime - prev.lastVideoTimeSec;
    if (videoDeltaSec <= ANTI_CHEAT_DEFAULTS.minVideoAdvanceSec) {
      store.watchTelemetry[input.userId] = {
        ...prev,
        lastHeartbeatAt: nowIso,
        lastVideoTimeSec: safeVideoTime,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: true,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'video_not_advancing' as const,
      };
    }

    if (todayWatchSeconds >= cfg.maxDailyVerifiedWatchSeconds) {
      store.watchTelemetry[input.userId] = {
        ...prev,
        lastHeartbeatAt: nowIso,
        lastVideoTimeSec: safeVideoTime,
        updatedAt: nowIso,
      };
      const ptsState = getQuickPointsStateFallback(store, input.userId, todayKey);
      persistPointsFallbackStore(store);
      return {
        ok: true,
        addedSeconds: 0,
        verifiedWatchSeconds,
        todayWatchSeconds,
        awardedWatchPoints: 0,
        todayWatchPointsEarned: ptsState.todayWatchPointsEarned,
        dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
        pointsBalance: ptsState.balance,
        referralQualified: false,
        riskFlag,
        reason: 'daily_watch_cap_reached' as const,
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

    store.watchTelemetry[input.userId] = {
      userId: input.userId,
      verifiedWatchSeconds,
      todayWatchSeconds,
      todayDateKey: todayKey,
      activeStreamSessionId: cleanSessionId,
      activeStreamMediaKey: cleanMediaKey,
      lastHeartbeatAt: nowIso,
      lastVideoTimeSec: safeVideoTime,
      fastDeltaStrikes: fastStrikes,
      concurrentTabStrikes: concurrentStrikes,
      riskFlag,
      suspiciousReason,
      updatedAt: nowIso,
    };

    const sigRisk = store.securitySignals[input.userId]?.riskFlag || '';
    const hasRisk = Boolean(riskFlag || sigRisk);
    const missionGrant = grantWatchMissionPointsFallback(
      store,
      input.userId,
      todayKey,
      todayWatchSeconds,
      cfg,
      addedSeconds > 0 && !hasRisk,
      nowIso
    );

    let referralQualified = false;
    if (verifiedWatchSeconds >= cfg.referralQualifySeconds) {
      const pendingRef = store.referrals.find(
        (r) => r.refereeUid === input.userId && r.status === 'pending_watch'
      );
      if (pendingRef) {
        const weekAgoMs = nowMs - 7 * 86400_000;
        const qualifiedForReferrer = store.referrals.filter(
          (r) => r.referrerUid === pendingRef.referrerUid && r.status === 'qualified'
        );
        const dailyCnt = qualifiedForReferrer.filter(
          (r) => r.qualifiedAt && getJakartaDateKey(new Date(r.qualifiedAt)) === todayKey
        ).length;
        const weeklyCnt = qualifiedForReferrer.filter(
          (r) => r.qualifiedAt && Date.parse(r.qualifiedAt) >= weekAgoMs
        ).length;

        if (hasRisk) {
          pendingRef.status = 'rejected_fraud';
          pendingRef.riskFlag = riskFlag || sigRisk || 'anti_cheat_flag';
          pendingRef.suspiciousReason =
            'Referee flagged by anti-cheat during 1-hour verification';
          pendingRef.updatedAt = nowIso;
        } else if (
          dailyCnt < cfg.maxDailyReferrals &&
          weeklyCnt < cfg.maxWeeklyReferrals
        ) {
          pendingRef.status = 'qualified';
          pendingRef.qualifiedAt = nowIso;
          pendingRef.updatedAt = nowIso;
          const qualifyRefId = `referral:qualify:${input.userId}`;
          if (!store.ledger.some((l) => l.referenceId === qualifyRefId)) {
            store.ledger.push({
              id: crypto.randomUUID(),
              userId: pendingRef.referrerUid,
              type: 'earn',
              points: pendingRef.bonusPoints || cfg.referralBonusPoints,
              description: 'Valid Referral Bonus (1h+ verified watch)',
              referenceId: qualifyRefId,
              createdAt: nowIso,
            });
            referralQualified = true;
          }
        }
      }
    }

    persistPointsFallbackStore(store);
    return {
      ok: true,
      addedSeconds,
      verifiedWatchSeconds,
      todayWatchSeconds,
      awardedWatchPoints: missionGrant.awardedWatchPoints,
      todayWatchPointsEarned: missionGrant.todayWatchPointsEarned,
      dailyMissionMaxWatchSeconds: cfg.dailyMissionMaxWatchSeconds,
      pointsBalance: missionGrant.pointsBalance,
      referralQualified,
      riskFlag,
      reason: 'counted' as const,
    };
  });
}

export async function getUserReferralSummaryFromDb(
  userId: string
): Promise<UserReferralSummary> {
  const cfg = getPayoutRuntimeConfig();
  const referralCode = buildReferralCodeForUser(userId);
  const todayKey = getJakartaDateKey();

  const activePool = getPool();
  if (activePool && (await ensureDatabaseReady()) && dbAvailable) {
    try {
      await dbQuery(
        `UPDATE users
         SET referral_code = CASE WHEN referral_code = '' THEN $2 ELSE referral_code END
         WHERE uid = $1`,
        [userId, referralCode]
      );

      const selfTel = await dbQuery<{
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

      const refsRes = await dbQuery<{
        id: string;
        referee_uid: string;
        status: string;
        bonus_points: number;
        risk_flag: string;
        qualified_at: Date | null;
        created_at: Date;
        referee_name: string | null;
        verified_watch_seconds: number | null;
      }>(
        `SELECT r.id, r.referee_uid, r.status, r.bonus_points, r.risk_flag,
                r.qualified_at, r.created_at,
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

      if (refsRes) {
        const items: UserReferralItemView[] = refsRes.rows.map((r) => ({
          id: r.id,
          maskedReferee: maskDisplayNameForFeed(r.referee_name || r.referee_uid),
          status: (['pending_watch', 'qualified', 'rejected_fraud'].includes(r.status)
            ? r.status
            : 'pending_watch') as ReferralStatus,
          bonusPoints: Math.max(0, Number(r.bonus_points) || cfg.referralBonusPoints),
          verifiedWatchSeconds: Math.max(0, Number(r.verified_watch_seconds) || 0),
          requiredWatchSeconds: cfg.referralQualifySeconds,
          riskFlag: r.risk_flag || undefined,
          qualifiedAt:
            r.qualified_at instanceof Date ? r.qualified_at.toISOString() : null,
          createdAt:
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : new Date().toISOString(),
        }));

        const tRow = selfTel?.rows[0];
        return {
          referralCode,
          referralQualifySeconds: cfg.referralQualifySeconds,
          referralBonusPoints: cfg.referralBonusPoints,
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
            qualifiedCount: items.filter((i) => i.status === 'qualified').length,
            rejectedCount: items.filter((i) => i.status === 'rejected_fraud').length,
            totalBonusEarned: items
              .filter((i) => i.status === 'qualified')
              .reduce((acc, i) => acc + i.bonusPoints, 0),
          },
          referrals: items,
        };
      }
    } catch (err) {
      console.warn(
        '[PostgreSQL] getUserReferralSummaryFromDb failed, using fallback:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return withPointsFallbackLock(() => {
    const store = loadPointsFallbackStore();
    store.referralCodeToUid[referralCode] = userId;
    const tel = store.watchTelemetry[userId];
    const sig = store.securitySignals[userId];
    const items: UserReferralItemView[] = store.referrals
      .filter((r) => r.referrerUid === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((r) => ({
        id: r.id,
        maskedReferee: maskDisplayNameForFeed(
          store.userNames[r.refereeUid] || r.refereeUid
        ),
        status: r.status,
        bonusPoints: r.bonusPoints,
        verifiedWatchSeconds:
          store.watchTelemetry[r.refereeUid]?.verifiedWatchSeconds || 0,
        requiredWatchSeconds: cfg.referralQualifySeconds,
        riskFlag: r.riskFlag || undefined,
        qualifiedAt: r.qualifiedAt,
        createdAt: r.createdAt,
      }));

    return {
      referralCode,
      referralQualifySeconds: cfg.referralQualifySeconds,
      referralBonusPoints: cfg.referralBonusPoints,
      verifiedWatchSeconds: tel?.verifiedWatchSeconds || 0,
      todayWatchSeconds:
        tel && tel.todayDateKey === todayKey ? tel.todayWatchSeconds : 0,
      maxDailyVerifiedWatchSeconds: cfg.maxDailyVerifiedWatchSeconds,
      riskFlag: sig?.riskFlag || tel?.riskFlag || '',
      stats: {
        totalInvited: items.length,
        pendingCount: items.filter((i) => i.status === 'pending_watch').length,
        qualifiedCount: items.filter((i) => i.status === 'qualified').length,
        rejectedCount: items.filter((i) => i.status === 'rejected_fraud').length,
        totalBonusEarned: items
          .filter((i) => i.status === 'qualified')
          .reduce((acc, i) => acc + i.bonusPoints, 0),
      },
      referrals: items,
    };
  });
}


