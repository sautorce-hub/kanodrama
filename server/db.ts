import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

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
  const needsSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('neon.tech') ||
    process.env.PGSSLMODE === 'require';

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
  const conn = (process.env.DATABASE_URL || '').trim();
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
  return Boolean((process.env.DATABASE_URL || '').trim()) && dbAvailable;
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
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

  const today = (input.visitDate || getDateKeyUtc()).slice(0, 10);
  const yesterday = getDateKeyUtc(-1);

  try {
    const existingRes = await dbQuery<{
      streak_count: number;
      last_visit_date: string;
    }>('SELECT streak_count, last_visit_date FROM users WHERE uid = $1', [input.uid]);
    if (!existingRes) return null;

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
         streak_count, last_visit_date, is_vip, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (uid) DO UPDATE SET
         email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE users.email END,
         display_name = CASE WHEN users.display_name <> '' AND users.display_name <> 'Kano Viewer' THEN users.display_name ELSE EXCLUDED.display_name END,
         photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
         avatar_initials = EXCLUDED.avatar_initials,
         avatar_color = EXCLUDED.avatar_color,
         streak_count = EXCLUDED.streak_count,
         last_visit_date = EXCLUDED.last_visit_date,
         is_vip = EXCLUDED.is_vip,
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
      ]
    );

    const row = upsertRes?.rows[0];
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
  } catch {
    return null;
  }
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

export async function updateUserProfileInDb(input: {
  uid: string;
  displayName?: string;
  bio?: string;
  preferredLanguage?: string;
  preferences?: Record<string, unknown>;
}): Promise<DbUserRecord | null> {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureDatabaseReady();
  if (!dbAvailable) return null;

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
