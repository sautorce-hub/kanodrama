import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import express, { type Request, type Response } from 'express';
import compression from 'compression';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import {
  ACTIVE_VISITOR_TTL_SECONDS,
  buildGmailAccountKey,
  createCommentInDb,
  deleteWatchHistoryInDb,
  ensureDatabaseReady,
  filterCatalogFromDb,
  getDramaStatsFromDb,
  getJakartaDateKey,
  getSiteVisitorStatsFromDb,
  getTopDailyStatsFromDb,
  getTrendingStatsMapFromDb,
  getUniqueGmailLoginCountFromDb,
  getUserFromDb,
  isDatabaseEnabled,
  listCatalogForSitemapFromDb,
  listCommentsFromDb,
  listFavoritesFromDb,
  listLikesFromDb,
  listMoviesForSitemapFromDb,
  listUserCommentsFromDb,
  listWatchHistoryFromDb,
  pingDb,
  recordGmailLoginInDb,
  recordVideoViewInDb,
  recordVisitorHeartbeatInDb,
  removeActiveVisitorSessionInDb,
  resolveDramaBySlugFromDb,
  syncUserInDb,
  toggleFavoriteInDb,
  toggleLikeInDb,
  updateCatalogEpisodeCountIfHigherInDb,
  updateFavoriteFolderInDb,
  updateUserProfileInDb,
  upsertWatchHistoryInDb,
} from './server/db.ts';
import {
  attachLiveBadgesToItems,
  type CachedDramaItem,
  findDramaBySlugInHomeCache,
  findDramaBySlugInApiCache,
  getCachedDramasForSitemap,
  getCachedHomeData,
  getCachedMolaApiResponse,
  getHomeCacheStatus,
  indexMolaPayloadToCatalog,
  isCacheableMolaListPath,
  markApiRevalidating,
  searchUpstreamDramaBySlug,
  seedCatalogFromExistingCacheIfEmpty,
  setCachedMolaApiResponse,
  startHomeCacheWorker,
  triggerAsyncHomeRevalidate,
} from './server/homeCache.ts';
import {
  getGoogleIndexingStatus,
  notifyCatalogAdditionsToGoogle,
  notifyGoogleIndexingUrls,
} from './server/googleIndexing.ts';
import {
  getLk21Detail,
  getLk21Episodes,
  getLk21Home,
  getLk21Stream,
  startLk21Prewarm,
  type Lk21DetailPayload,
  type Lk21EpisodePayloadItem,
} from './server/lk21Service.ts';
import { createLk21Router } from './server/lk21Router.ts';
import {
  extractLookSeriesBookId,
  getLookSeriesDetail,
  getLookSeriesEpisodes,
  getLookSeriesStream,
  type LookSeriesDetailPayload,
} from './server/lookseriesService.ts';
import { createLookSeriesRouter } from './server/lookseriesRouter.ts';
import {
  CURATED_PROGRAMMATIC_PAGES,
  type ProgrammaticLandingConfig,
  resolveProgrammaticLanding,
} from './src/utils/programmaticSeo.ts';
import {
  MOLA_PLATFORM_ORIGIN,
  PROVIDER_LOGO_PATHS,
  PROVIDER_SLUG_MAP,
  getProviderRouteSlug,
  isKnownProviderRouteSlug,
  parseProviderFromRouteSlug,
} from './src/constants/providerLogos.ts';
import {
  buildOgImageEndpointUrl,
  detectLanguageFromContent,
  generateMetadata,
  getHtmlLangTag,
  getOgLocaleTag,
  normalizeLanguageCode,
  parseCookieHeaderLanguage,
  stripLeadingWatchPrefix,
} from './src/i18n/helpers.ts';
import {
  cleanSeoDescription,
  resolveDramaSeoDescriptionFields,
} from './src/utils/seo.ts';
import type { LanguageCode, LanguagePreference } from './src/types/drama.ts';

function resolvePort(): number {
  const portFlagIndex = process.argv.indexOf('--port');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const cliPort = Number(process.argv[portFlagIndex + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolvePort();
const IS_PROD = process.env.NODE_ENV === 'production';
const MOLATV_API_BASE = 'https://api.molatv.id/api';
const DRAMABOX_BASE_URL = `${MOLATV_API_BASE}/dramaboxv2`;
const NETSHORT_BASE_URL = `${MOLATV_API_BASE}/netshort`;
const ANYREEL_BASE_URL = `${MOLATV_API_BASE}/anyreel`;
const MELOLO_BASE_URL = `${MOLATV_API_BASE}/melolo`;
const DEFAULT_OG_IMAGE_PATH =
  '/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png';

function getMolaToken(): string {
  return (process.env.MOLA_API_TOKEN || '').trim();
}

type SsrProviderName =
  | 'DramaBox'
  | 'NetShort'
  | 'AnyReel'
  | 'Melolo'
  | 'DramaOra'
  | 'MeloShort'
  | 'PetaDrama'
  | 'RadReels'
  | 'DramaVerse'
  | 'KalosTV'
  | 'StardustTV'
  | 'StarShort'
  | 'DramaBite'
  | 'LoveShots'
  | 'MyDrama'
  | 'ShotShort'
  | 'MoboReels'
  | 'BlinkDrama'
  | 'WeTV'
  | 'CubeTV'
  | 'MicroDrama'
  | 'FlareFlow'
  | 'FunDrama'
  | 'FreeShort'
  | 'ToonShort'
  | 'HappyShort'
  | 'DramaDash'
  | 'StoryReel'
  | 'StoryReelV2'
  | 'VibeShort'
  | 'VibeShortV2'
  | 'FlickReels'
  | 'DramaWave'
  | 'FreeReels'
  | 'PineDrama'
  | 'ShortMax'
  | 'ShortMaxV2'
  | 'FlexTV'
  | 'Vigloo'
  | 'DotDrama'
  | 'iDrama'
  | 'iDramaV2'
  | 'GoodShort'
  | 'ReelShort'
  | 'ReelShortV2'
  | 'JoyReels'
  | 'SodaReels'
  | 'BonusTV'
  | 'iQIYI';

interface SsrDrama {
  bookId: string;
  title: string;
  slug?: string;
  cover: string;
  description: string;
  chapterCount: number;
  tags: string[];
  playCount?: string;
  protagonist?: string;
  isVip: boolean;
  provider: SsrProviderName;
  updatedAt?: number | string;
}

interface SsrEpisode {
  chapterId: string;
  episodeNumber: number;
  title: string;
  isVipLocked: boolean;
}

const ssrCache = new Map<
  string,
  { expiresAt: number; drama: SsrDrama | null; episodes: SsrEpisode[] }
>();

// In-memory fallback with local disk snapshot when PostgreSQL is unavailable (starts strictly from 0)
const ACTIVE_SESSION_TTL_MS = ACTIVE_VISITOR_TTL_SECONDS * 1000;
const VISITOR_VIEW_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_MEMORY_VISITOR_SET_SIZE = 50_000;
const VISITOR_FALLBACK_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'visitor-stats.json'
);

const activeSessions = new Map<string, { visitorId: string; lastSeen: number }>();
let currentDayKey = getJakartaDateKey();
let todayUniqueVisitors = 0;
let cumulativeVisitors = 0;
let cumulativeViews = 0;
const countedTodayVisitors = new Set<string>();
const countedAllTimeVisitors = new Set<string>();
const countedSessionViews = new Set<string>();
const visitorLastViewAt = new Map<string, number>();
const GMAIL_FALLBACK_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'gmail-logins.json'
);
const memoryGmailAccountCounts = new Map<string, number>();
let memoryGmailTotalLogins = 0;

function loadFallbackGmailLoginsFromDisk(): void {
  try {
    if (!fs.existsSync(GMAIL_FALLBACK_CACHE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(GMAIL_FALLBACK_CACHE_PATH, 'utf-8')) as {
      totalLogins?: number;
      accountCounts?: Record<string, number>;
    };
    let accountSum = 0;
    if (raw.accountCounts && typeof raw.accountCounts === 'object') {
      for (const [k, v] of Object.entries(raw.accountCounts)) {
        const cleanKey = String(k || '').trim();
        const safeVal = toSafeVisitorInt(v);
        if (cleanKey && safeVal > 0) {
          memoryGmailAccountCounts.set(cleanKey, safeVal);
          accountSum += safeVal;
        }
      }
    }
    memoryGmailTotalLogins = Math.max(toSafeVisitorInt(raw.totalLogins), accountSum);
  } catch {
    // Start cleanly if fallback cache file is absent or malformed
  }
}

function saveFallbackGmailLoginsToDisk(): void {
  try {
    const dir = path.dirname(GMAIL_FALLBACK_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const accountCounts: Record<string, number> = {};
    for (const [k, v] of memoryGmailAccountCounts.entries()) {
      accountCounts[k] = v;
    }
    const tmpPath = `${GMAIL_FALLBACK_CACHE_PATH}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        totalLogins: memoryGmailTotalLogins,
        accountCounts,
        updatedAt: Date.now(),
      }),
      'utf-8'
    );
    fs.renameSync(tmpPath, GMAIL_FALLBACK_CACHE_PATH);
  } catch {
    // Non-fatal fallback persistence error
  }
}

loadFallbackGmailLoginsFromDisk();

function toSafeVisitorInt(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

function addBoundedSetItem(set: Set<string>, value: string): void {
  if (set.size >= MAX_MEMORY_VISITOR_SET_SIZE) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(value);
}

function loadFallbackVisitorStatsFromDisk(): void {
  try {
    if (!fs.existsSync(VISITOR_FALLBACK_CACHE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(VISITOR_FALLBACK_CACHE_PATH, 'utf-8')) as {
      dayKey?: string;
      todayUniqueVisitors?: number;
      cumulativeVisitors?: number;
      cumulativeViews?: number;
      todayIds?: string[];
      allTimeIds?: string[];
    };
    const wibToday = getJakartaDateKey();
    cumulativeVisitors = toSafeVisitorInt(raw.cumulativeVisitors);
    cumulativeViews = toSafeVisitorInt(raw.cumulativeViews);
    if (Array.isArray(raw.allTimeIds)) {
      for (const id of raw.allTimeIds.slice(-MAX_MEMORY_VISITOR_SET_SIZE)) {
        if (typeof id === 'string' && id) countedAllTimeVisitors.add(id);
      }
    }
    if (raw.dayKey === wibToday) {
      currentDayKey = wibToday;
      todayUniqueVisitors = toSafeVisitorInt(raw.todayUniqueVisitors);
      if (Array.isArray(raw.todayIds)) {
        for (const id of raw.todayIds.slice(-MAX_MEMORY_VISITOR_SET_SIZE)) {
          if (typeof id === 'string' && id) countedTodayVisitors.add(id);
        }
      }
    } else {
      currentDayKey = wibToday;
      todayUniqueVisitors = 0;
      countedTodayVisitors.clear();
    }
  } catch {
    // Start cleanly if fallback cache file is absent or malformed
  }
}

let visitorDiskSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFallbackVisitorStatsSave(): void {
  if (visitorDiskSaveTimer) return;
  visitorDiskSaveTimer = setTimeout(() => {
    visitorDiskSaveTimer = null;
    try {
      const dir = path.dirname(VISITOR_FALLBACK_CACHE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const payload = {
        dayKey: currentDayKey,
        todayUniqueVisitors,
        cumulativeVisitors,
        cumulativeViews,
        todayIds: Array.from(countedTodayVisitors).slice(-10_000),
        allTimeIds: Array.from(countedAllTimeVisitors).slice(-20_000),
        updatedAt: Date.now(),
      };
      const tmpPath = `${VISITOR_FALLBACK_CACHE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf-8');
      fs.renameSync(tmpPath, VISITOR_FALLBACK_CACHE_PATH);
    } catch {
      // Non-fatal fallback persistence error
    }
  }, 1500);
  visitorDiskSaveTimer.unref?.();
}

loadFallbackVisitorStatsFromDisk();

const BOT_USER_AGENT_REGEX =
  /bot\b|crawler|spider|slurp|mediapartners|adsbot|bingpreview|googlebot|bingbot|yandex|baiduspider|duckduckbot|sogou|exabot|facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|applebot|pinterest|vkshare|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|oai-searchbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|ccbot|headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|curl\/|wget\/|python-requests|python-urllib|httpx|aiohttp|axios\/|node-fetch|undici|go-http-client|java\/|okhttp|postman|insomnia|uptimerobot|pingdom|statuscake|datadog|newrelic|healthcheck|kube-probe/i;

function isBotOrAutomatedRequest(req: Request): boolean {
  const ua = (req.get('user-agent') || '').trim();
  if (!ua || ua.length < 12) return true;
  if (BOT_USER_AGENT_REGEX.test(ua)) return true;
  const purpose = (
    (req.headers['purpose'] as string | undefined) ||
    (req.headers['sec-purpose'] as string | undefined) ||
    (req.headers['x-purpose'] as string | undefined) ||
    ''
  ).toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('preview')) return true;
  return false;
}

function normalizeVisitorStatsResponse(input: {
  onlineNow: unknown;
  todayVisitors: unknown;
  totalVisitors: unknown;
  totalViews: unknown;
  dayKey?: string;
  botFiltered?: boolean;
}) {
  const onlineNow = toSafeVisitorInt(input.onlineNow);
  const todayVisitors = toSafeVisitorInt(input.todayVisitors);
  const totalVisitors = toSafeVisitorInt(input.totalVisitors);
  const totalViews = toSafeVisitorInt(input.totalViews);
  return {
    online: onlineNow,
    daily: todayVisitors,
    total: totalVisitors,
    onlineNow,
    todayVisitors,
    totalVisitors,
    totalViews,
    dayKey: input.dayKey || currentDayKey,
    timezone: 'Asia/Jakarta',
    ...(input.botFiltered ? { botFiltered: true } : {}),
  };
}

function resolveAllowedFirebaseProjectIds(): Set<string> {
  const ids = new Set<string>();
  const addId = (val: unknown) => {
    if (typeof val !== 'string') return;
    for (const part of val.split(',')) {
      const cleaned = part.trim();
      if (cleaned) ids.add(cleaned);
    }
  };

  addId(process.env.FIREBASE_PROJECT_ID);
  addId(process.env.VITE_FIREBASE_PROJECT_ID);

  const viteCfgRaw = (process.env.VITE_FIREBASE_CONFIG || '').trim();
  if (viteCfgRaw.startsWith('{')) {
    try {
      const parsed = JSON.parse(viteCfgRaw) as { projectId?: string };
      addId(parsed.projectId);
    } catch {
      // Ignore malformed VITE_FIREBASE_CONFIG
    }
  }

  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as {
        projectId?: string;
      };
      addId(parsed.projectId);
    }
  } catch {
    // Fallback below
  }

  return ids;
}

const ALLOWED_FIREBASE_PROJECT_IDS = resolveAllowedFirebaseProjectIds();
let firebaseCertsCache: {
  certs: Record<string, string>;
  expiresAt: number;
} | null = null;

async function getFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string> | null> {
  const now = Date.now();
  if (!forceRefresh && firebaseCertsCache && now < firebaseCertsCache.expiresAt) {
    return firebaseCertsCache.certs;
  }
  try {
    const res = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const certs = (await res.json()) as Record<string, string>;
    const cc = res.headers.get('cache-control') || '';
    const maxAgeMatch = cc.match(/max-age=(\d+)/i);
    const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;
    firebaseCertsCache = {
      certs,
      expiresAt: now + Math.max(60_000, maxAgeMs),
    };
    return certs;
  } catch {
    return null;
  }
}

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<{
  status: 'verified' | 'invalid' | 'certs_unavailable';
  uid?: string;
  email?: string;
  emailVerified?: boolean;
}> {
  if (ALLOWED_FIREBASE_PROJECT_IDS.size === 0) {
    return { status: 'certs_unavailable' };
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    return { status: 'invalid' };
  }
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
    firebase?: { sign_in_provider?: string };
  };
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return { status: 'invalid' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { status: 'invalid' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    typeof payload.aud !== 'string' ||
    !ALLOWED_FIREBASE_PROJECT_IDS.has(payload.aud) ||
    payload.iss !== `https://securetoken.google.com/${payload.aud}` ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp + 60 <= nowSec
  ) {
    return { status: 'invalid' };
  }

  let certs = await getFirebasePublicCerts();
  if (!certs) {
    return { status: 'certs_unavailable' };
  }
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getFirebasePublicCerts(true);
    if (!certs) return { status: 'certs_unavailable' };
    certPem = certs[header.kid];
  }
  if (!certPem) {
    return { status: 'invalid' };
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const sigBuf = Buffer.from(parts[2], 'base64url');
  if (!verifier.verify(certPem, sigBuf)) {
    return { status: 'invalid' };
  }

  return {
    status: 'verified',
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
    emailVerified: payload.email_verified !== false,
  };
}

function syncJakartaDayRollover(now = Date.now()): string {
  const wibDay = getJakartaDateKey(new Date(now));
  if (wibDay !== currentDayKey) {
    currentDayKey = wibDay;
    todayUniqueVisitors = 0;
    countedTodayVisitors.clear();
    scheduleFallbackVisitorStatsSave();
  }
  for (const [key, entry] of activeSessions.entries()) {
    if (now - entry.lastSeen > ACTIVE_SESSION_TTL_MS) {
      activeSessions.delete(key);
    }
  }
  for (const [vid, ts] of visitorLastViewAt.entries()) {
    if (now - ts > VISITOR_VIEW_COOLDOWN_MS) {
      visitorLastViewAt.delete(vid);
    }
  }
  return wibDay;
}

function cleanText(val: unknown, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed === '<nil>' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return fallback;
  }
  return trimmed;
}

function pipeWebStreamToExpress(
  body: unknown,
  req: Request,
  res: Response,
  fallbackError = 'Upstream stream error'
): void {
  const nodeStream = Readable.fromWeb(
    body as unknown as import('node:stream/web').ReadableStream
  );
  const cleanup = () => {
    if (!nodeStream.destroyed) {
      nodeStream.destroy();
    }
  };
  nodeStream.on('error', () => {
    cleanup();
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: fallbackError });
    } else {
      res.end();
    }
  });
  req.on('close', cleanup);
  res.on('error', cleanup);
  nodeStream.pipe(res);
}

function escapeHtmlAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripIllegalXmlChars(val: string): string {
  // Remove XML 1.0 invalid control characters and lone UTF-16 surrogates
  return String(val || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '');
}

function escapeXml(val: string): string {
  return stripIllegalXmlChars(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'series';
}

function resolveOrigin(req: Request): string {
  const forwardedHost = (
    req.headers['x-forwarded-host'] as string | undefined
  )
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || req.get('host') || `localhost:${PORT}`;
  if (/^(www\.)?kano-drama\.xyz$/i.test(host)) {
    return 'https://kano-drama.xyz';
  }
  const configured =
    process.env.SITE_URL || process.env.VITE_SITE_URL || process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL') {
    const clean = configured.trim().replace(/\/+$/, '');
    if (/^https?:\/\/(www\.)?kano-drama\.xyz$/i.test(clean)) {
      return 'https://kano-drama.xyz';
    }
    const isLocalConfigured = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(
      clean
    );
    return isLocalConfigured ? clean : clean.replace(/^http:\/\//i, 'https://');
  }
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);
  const forwardedProto = (
    req.headers['x-forwarded-proto'] as string | undefined
  )
    ?.split(',')[0]
    ?.trim();
  const proto = isLocalHost
    ? forwardedProto || req.protocol || 'http'
    : 'https';
  return `${proto}://${host}`;
}

function toAbsoluteImageUrl(rawUrl: string, origin: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return `${origin}${DEFAULT_OG_IMAGE_PATH}`;
  if (clean.startsWith('//')) return `https:${clean}`;
  if (clean.startsWith('https://') || clean.startsWith('http://')) return clean;
  if (clean.startsWith('/')) return `${origin}${clean}`;
  return `${origin}/${clean}`;
}

function isSafePublicHttpUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return false;
  }
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return false;
  }
  return true;
}

const heicCache = new Map<string, { buf: Buffer; expiresAt: number }>();
const ogImageCache = new Map<
  string,
  { buf: Buffer; contentType: string; expiresAt: number }
>();
let cachedDefaultOgResult: { buf: Buffer; contentType: string } | null = null;

function detectImageMimeType(
  buf: Buffer
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  const head = buf.subarray(0, 6).toString('ascii');
  if (head === 'GIF87a' || head === 'GIF89a') {
    return 'image/gif';
  }
  return null;
}

function isSupportedImageOrHeicBuffer(buf: Buffer): boolean {
  if (detectImageMimeType(buf)) return true;
  if (buf.length >= 16 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'].includes(
      brand
    );
  }
  return false;
}

function convertHeicToWebp(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('convert', ['heic:-', '-quality', '84', 'webp:-']);
    const chunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('HEIC conversion timeout'));
      }
    }, 8000);

    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`convert exited with code ${code}`));
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

function runConvertCommand(input: Buffer, args: string[], timeoutMs = 4500): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('convert', args);
    const chunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('OG JPEG conversion timeout'));
      }
    }, timeoutMs);

    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0 && chunks.length > 0) {
        const out = Buffer.concat(chunks);
        if (detectImageMimeType(out) === 'image/jpeg') {
          resolve(out);
          return;
        }
      }
      reject(new Error(`OG convert exited with code ${code}`));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

async function convertImageBufferToOgJpeg(input: Buffer): Promise<Buffer> {
  try {
    // Render crisp 1200x630 JPEG canvas (dark blurred poster backdrop + centered full poster)
    return await runConvertCommand(input, [
      '-[0]',
      '-auto-orient',
      '(',
      '-clone',
      '0',
      '-resize',
      '1200x630^',
      '-gravity',
      'center',
      '-extent',
      '1200x630',
      '-blur',
      '0x18',
      '-modulate',
      '45,110,100',
      ')',
      '(',
      '-clone',
      '0',
      '-resize',
      '1160x600',
      ')',
      '-delete',
      '0',
      '-gravity',
      'center',
      '-composite',
      '-background',
      '#090706',
      '-flatten',
      '-strip',
      '-quality',
      '86',
      'jpeg:-',
    ]);
  } catch {
    // Simpler single-pass resize fallback
    return runConvertCommand(input, [
      '-[0]',
      '-auto-orient',
      '-resize',
      '1200x630^',
      '-gravity',
      'center',
      '-extent',
      '1200x630',
      '-background',
      '#090706',
      '-flatten',
      '-strip',
      '-quality',
      '84',
      'jpeg:-',
    ]);
  }
}

function parseSsrProviderName(raw: string | undefined | null): SsrProviderName {
  const norm = (raw || '').trim().toLowerCase();
  const map: Record<string, SsrProviderName> = {
    dramabox: 'DramaBox',
    netshort: 'NetShort',
    anyreel: 'AnyReel',
    melolo: 'Melolo',
    dramaora: 'DramaOra',
    meloshort: 'MeloShort',
    petadrama: 'PetaDrama',
    radreels: 'RadReels',
    dramaverse: 'DramaVerse',
    kalostv: 'KalosTV',
    stardusttv: 'StardustTV',
    stardust: 'StardustTV',
    starshort: 'StarShort',
    dramabite: 'DramaBite',
    loveshots: 'LoveShots',
    mydrama: 'MyDrama',
    shotshort: 'ShotShort',
    moboreels: 'MoboReels',
    blinkdrama: 'BlinkDrama',
    wetv: 'WeTV',
    cubetv: 'CubeTV',
    microdrama: 'MicroDrama',
    flareflow: 'FlareFlow',
    fundrama: 'FunDrama',
    freeshort: 'FreeShort',
    toonshort: 'ToonShort',
    happyshort: 'HappyShort',
    dramadash: 'DramaDash',
    storyreel: 'StoryReel',
    storyreelv2: 'StoryReelV2',
    storyreel_v2: 'StoryReelV2',
    vibeshort: 'VibeShort',
    vibeshortv2: 'VibeShortV2',
    vibeshort_v2: 'VibeShortV2',
    flickreels: 'FlickReels',
    dramawave: 'DramaWave',
    freereels: 'FreeReels',
    pinedrama: 'PineDrama',
    shortmax: 'ShortMax',
    shortmaxv2: 'ShortMaxV2',
    shortmax_v2: 'ShortMaxV2',
    flextv: 'FlexTV',
    vigloo: 'Vigloo',
    dotdrama: 'DotDrama',
    idrama: 'iDrama',
    idramav2: 'iDramaV2',
    idrama_v2: 'iDramaV2',
    goodshort: 'GoodShort',
    reelshort: 'ReelShort',
    reelshortv2: 'ReelShortV2',
    reelshort_v2: 'ReelShortV2',
    joyreels: 'JoyReels',
    sodareels: 'SodaReels',
    bonustv: 'BonusTV',
    iqiyi: 'iQIYI',
  };
  return map[norm] ?? 'DramaBox';
}

function getProviderConfigForSsr(providerHint: SsrProviderName): {
  baseUrl: string;
  langParam: string | null;
  idParam: string;
  epPath?: string;
} {
  switch (providerHint) {
    case 'NetShort':
      return { baseUrl: NETSHORT_BASE_URL, langParam: 'en_US', idParam: 'book_id' };
    case 'AnyReel':
      return { baseUrl: ANYREEL_BASE_URL, langParam: 'en', idParam: 'book_id' };
    case 'Melolo':
      return { baseUrl: MELOLO_BASE_URL, langParam: 'en', idParam: 'book_id' };
    case 'DramaOra':
      return { baseUrl: `${MOLATV_API_BASE}/dramaora`, langParam: 'en-us', idParam: 'vid' };
    case 'MeloShort':
      return { baseUrl: `${MOLATV_API_BASE}/meloshort`, langParam: 'en', idParam: 'book_id' };
    case 'PetaDrama':
      return { baseUrl: `${MOLATV_API_BASE}/petadrama`, langParam: null, idParam: 'id' };
    case 'RadReels':
      return { baseUrl: `${MOLATV_API_BASE}/radreels`, langParam: '3', idParam: 'book_id' };
    case 'DramaVerse':
      return { baseUrl: `${MOLATV_API_BASE}/dramaverse`, langParam: 'en', idParam: 'book_id' };
    case 'KalosTV':
      return { baseUrl: `${MOLATV_API_BASE}/kalostv`, langParam: 'en', idParam: 'book_id' };
    case 'StardustTV':
      return { baseUrl: `${MOLATV_API_BASE}/stardust`, langParam: 'en_US', idParam: 'book_id' };
    case 'StarShort':
      return { baseUrl: `${MOLATV_API_BASE}/starshort`, langParam: '1', idParam: 'bookId' };
    case 'DramaBite':
      return { baseUrl: `${MOLATV_API_BASE}/dramabite`, langParam: 'en', idParam: 'book_id' };
    case 'LoveShots':
      return { baseUrl: `${MOLATV_API_BASE}/loveshots`, langParam: 'en', idParam: 'drama_id' };
    case 'MyDrama':
      return { baseUrl: `${MOLATV_API_BASE}/mydrama`, langParam: 'en', idParam: 'book_id' };
    case 'ShotShort':
      return { baseUrl: `${MOLATV_API_BASE}/shotshort`, langParam: 'en', idParam: 'book_id' };
    case 'MoboReels':
      return { baseUrl: `${MOLATV_API_BASE}/moboreels`, langParam: 'en', idParam: 'book_id' };
    case 'BlinkDrama':
      return { baseUrl: `${MOLATV_API_BASE}/blinkdrama`, langParam: 'en', idParam: 'drama_id' };
    case 'WeTV':
      return { baseUrl: `${MOLATV_API_BASE}/wetv`, langParam: 'en', idParam: 'book_id' };
    case 'CubeTV':
      return { baseUrl: `${MOLATV_API_BASE}/cubetv`, langParam: '1', idParam: 'book_id' };
    case 'MicroDrama':
      return { baseUrl: `${MOLATV_API_BASE}/microdrama`, langParam: 'en', idParam: 'book_id' };
    case 'FlareFlow':
      return { baseUrl: `${MOLATV_API_BASE}/flareflow`, langParam: 'en', idParam: 'drama_id' };
    case 'FunDrama':
      return { baseUrl: `${MOLATV_API_BASE}/fundrama`, langParam: 'en', idParam: 'book_id' };
    case 'FreeShort':
      return { baseUrl: `${MOLATV_API_BASE}/freeshort`, langParam: 'en', idParam: 'book_id' };
    case 'ToonShort':
      return { baseUrl: `${MOLATV_API_BASE}/toonshort`, langParam: 'en', idParam: 'book_id' };
    case 'HappyShort':
      return { baseUrl: `${MOLATV_API_BASE}/happyshort`, langParam: 'en', idParam: 'book_id' };
    case 'DramaDash':
      return { baseUrl: `${MOLATV_API_BASE}/dramadash`, langParam: 'en', idParam: 'bookId' };
    case 'StoryReel':
      return { baseUrl: `${MOLATV_API_BASE}/storyreel`, langParam: 'en', idParam: 'book_id' };
    case 'StoryReelV2':
      return { baseUrl: `${MOLATV_API_BASE}/storyreel_v2`, langParam: 'en', idParam: 'book_id' };
    case 'VibeShort':
      return { baseUrl: `${MOLATV_API_BASE}/vibeshort`, langParam: 'en', idParam: 'book_id' };
    case 'VibeShortV2':
      return { baseUrl: `${MOLATV_API_BASE}/vibeshort_v2`, langParam: 'en', idParam: 'book_id' };
    case 'FlickReels':
      return { baseUrl: `${MOLATV_API_BASE}/flickreels`, langParam: '1', idParam: 'book_id' };
    case 'DramaWave':
      return { baseUrl: `${MOLATV_API_BASE}/dramawave`, langParam: 'en-US', idParam: 'book_id' };
    case 'FreeReels':
      return { baseUrl: `${MOLATV_API_BASE}/freereels`, langParam: 'en-US', idParam: 'book_id' };
    case 'PineDrama':
      return { baseUrl: `${MOLATV_API_BASE}/pinedrama`, langParam: 'en', idParam: 'book_id' };
    case 'ShortMax':
      return { baseUrl: `${MOLATV_API_BASE}/shortmax`, langParam: 'en', idParam: 'book_id' };
    case 'ShortMaxV2':
      return { baseUrl: `${MOLATV_API_BASE}/shortmax_v2`, langParam: 'en', idParam: 'book_id' };
    case 'FlexTV':
      return { baseUrl: `${MOLATV_API_BASE}/flextv`, langParam: 'en', idParam: 'book_id' };
    case 'Vigloo':
      return { baseUrl: `${MOLATV_API_BASE}/vigloo`, langParam: 'en', idParam: 'book_id' };
    case 'DotDrama':
      return { baseUrl: `${MOLATV_API_BASE}/dotdrama`, langParam: 'en', idParam: 'book_id' };
    case 'iDrama':
      return { baseUrl: `${MOLATV_API_BASE}/idrama`, langParam: 'en', idParam: 'book_id' };
    case 'iDramaV2':
      return { baseUrl: `${MOLATV_API_BASE}/idrama_v2`, langParam: 'en', idParam: 'book_id' };
    case 'GoodShort':
      return { baseUrl: `${MOLATV_API_BASE}/goodshort`, langParam: 'en', idParam: 'book_id' };
    case 'ReelShort':
      return { baseUrl: `${MOLATV_API_BASE}/reelshort`, langParam: 'en', idParam: 'book_id' };
    case 'ReelShortV2':
      return { baseUrl: `${MOLATV_API_BASE}/reelshort_v2`, langParam: 'en', idParam: 'book_id' };
    case 'JoyReels':
      return { baseUrl: `${MOLATV_API_BASE}/joyreels`, langParam: 'id', idParam: 'playlet_id', epPath: '/detail' };
    case 'SodaReels':
      return { baseUrl: `${MOLATV_API_BASE}/sodareels`, langParam: 'en', idParam: 'book_id' };
    case 'BonusTV':
      return { baseUrl: `${MOLATV_API_BASE}/bonustv`, langParam: 'en', idParam: 'book_id' };
    case 'iQIYI':
      return { baseUrl: `${MOLATV_API_BASE}/iqiyi`, langParam: 'en', idParam: 'album_id' };
    default:
      return { baseUrl: DRAMABOX_BASE_URL, langParam: 'en', idParam: 'book_id' };
  }
}

async function fetchDramaForSsr(
  bookId: string,
  providerHint: SsrProviderName = 'DramaBox'
): Promise<{
  drama: SsrDrama | null;
  episodes: SsrEpisode[];
}> {
  const token = getMolaToken();
  if (!token) {
    return { drama: null, episodes: [] };
  }

  const cacheKey = `${providerHint}:${bookId}`;
  const cached = ssrCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { drama: cached.drama, episodes: cached.episodes };
  }

  let drama: SsrDrama | null = null;
  let episodes: SsrEpisode[] = [];

  const { baseUrl, langParam, idParam, epPath } = getProviderConfigForSsr(providerHint);
  const langSuffix = langParam ? `&lang=${encodeURIComponent(langParam)}` : '';

  try {
    const detailUrl = `${baseUrl}${providerHint === 'iQIYI' ? '/allepisode' : '/detail'}?${idParam}=${encodeURIComponent(bookId)}${langSuffix}&token=${token}`;
    const epUrl = `${baseUrl}${epPath || '/allepisode'}?${idParam}=${encodeURIComponent(bookId)}${langSuffix}&token=${token}`;
    const [detailRes, epRes] = await Promise.allSettled([
      fetch(detailUrl, { signal: AbortSignal.timeout(7000) }),
      epUrl === detailUrl
        ? Promise.resolve(null)
        : fetch(epUrl, { signal: AbortSignal.timeout(7000) }),
    ]);

    if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
      const json = (await detailRes.value.json()) as Record<string, unknown>;
      const raw =
        json?.data && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : json;
      const title = cleanText(raw.bookName ?? raw.title ?? raw.name ?? raw.dramaName ?? raw.book_name);
      if (title) {
        const tags = Array.isArray(raw.tags)
          ? raw.tags
              .map((t) => cleanText(t))
              .filter((t): t is string => Boolean(t))
          : [];
        const rawCover = cleanText(
          raw.cover ?? raw.coverUrl ?? raw.bookCover ?? raw.book_cover ?? raw.coverWap ?? raw.poster ?? raw.image
        );
        const normalizedCover =
          rawCover &&
          (rawCover.startsWith('http://') ||
            (providerHint === 'Melolo' &&
              (rawCover.toLowerCase().includes('.heic') ||
                rawCover.toLowerCase().includes('fizzopic.org'))))
            ? `/api/proxy?url=${encodeURIComponent(rawCover)}`
            : rawCover;
        const rawUpdatedAt =
          raw.updatedAt ?? raw.updateTime ?? raw.utime ?? raw.createdAt;
        drama = {
          bookId,
          title,
          cover: normalizedCover,
          description: cleanText(
            raw.description ?? raw.introduction ?? raw.synopsis ?? raw.intro ?? raw.summary,
            `Watch free ${title} full episodes in HD on KanoDrama.`
          ),
          chapterCount:
            Number(raw.chapterCount ?? raw.totalEpisodes ?? raw.episodeCount ?? 1) || 1,
          tags,
          playCount: cleanText(raw.playCount) || undefined,
          protagonist: cleanText(raw.protagonist) || undefined,
          isVip: Boolean(raw.isVip),
          provider: providerHint,
          updatedAt:
            typeof rawUpdatedAt === 'number' || typeof rawUpdatedAt === 'string'
              ? rawUpdatedAt
              : undefined,
        };
      }
      if (epUrl === detailUrl) {
        const rawEps = Array.isArray(json.episodes)
          ? (json.episodes as Record<string, unknown>[])
          : Array.isArray(raw.episodes)
          ? (raw.episodes as Record<string, unknown>[])
          : Array.isArray(raw.chapterList)
          ? (raw.chapterList as Record<string, unknown>[])
          : [];
        episodes = rawEps.map((ep, idx) => {
          const num =
            Number(ep.chapterIndex ?? ep.episodeIndex ?? ep.episode ?? idx + 1) ||
            idx + 1;
          return {
            chapterId: cleanText(
              String(ep.chapterId ?? ep.episodeId ?? ep.episode_id ?? `ep-${num}`)
            ),
            episodeNumber: num,
            title: cleanText(ep.chapterName ?? ep.title, `EP ${num}`),
            isVipLocked: num > 10 && num === 11,
          };
        });
      }
    }

    if (epRes.status === 'fulfilled' && epRes.value && epRes.value.ok) {
      const json = (await epRes.value.json()) as Record<string, unknown>;
      const dataObj =
        json.data && !Array.isArray(json.data) && typeof json.data === 'object'
          ? (json.data as Record<string, unknown>)
          : null;
      const rawEps = Array.isArray(json.episodes)
        ? (json.episodes as Record<string, unknown>[])
        : Array.isArray(json.chapterList)
        ? (json.chapterList as Record<string, unknown>[])
        : Array.isArray(dataObj?.chapterList)
        ? (dataObj.chapterList as Record<string, unknown>[])
        : Array.isArray(dataObj?.episodes)
        ? (dataObj.episodes as Record<string, unknown>[])
        : Array.isArray(dataObj?.data)
        ? (dataObj.data as Record<string, unknown>[])
        : Array.isArray(json.data)
        ? (json.data as Record<string, unknown>[])
        : [];
      episodes = rawEps.map((ep, idx) => {
        const num =
          Number(ep.chapterIndex ?? ep.episodeIndex ?? ep.episode ?? idx + 1) ||
          idx + 1;
        const providerLocked =
          Number(ep.isCharge ?? 0) === 1 ||
          Number(ep.isPay ?? 0) === 1 ||
          Boolean(ep.isVip) ||
          Boolean(ep.isLocked);
        return {
          chapterId: cleanText(
            String(ep.chapterId ?? ep.episodeId ?? ep.episode_id ?? ep.chapter_id ?? `ep-${num}`)
          ),
          episodeNumber: num,
          title: cleanText(ep.chapterName ?? ep.title, `EP ${num}`),
          isVipLocked: num <= 10 ? false : providerLocked || num === 11,
        };
      });
    }
  } catch {
    // Graceful SSR fallback
  }

  ssrCache.set(cacheKey, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    drama,
    episodes,
  });

  return { drama, episodes };
}

function resolveRequestLanguage(req: Request): {
  lang: LanguageCode;
  pref: LanguagePreference;
  queryLang: LanguageCode | null;
} {
  const queryLang = normalizeLanguageCode(
    typeof req.query.lang === 'string' ? req.query.lang : null
  );
  if (queryLang) {
    return { lang: queryLang, pref: queryLang, queryLang };
  }

  const cookieData = parseCookieHeaderLanguage(req.headers.cookie);
  if (cookieData.lang) {
    return {
      lang: cookieData.lang,
      pref: cookieData.pref ?? cookieData.lang,
      queryLang: null,
    };
  }

  const acceptLang = req.headers['accept-language'];
  if (typeof acceptLang === 'string' && acceptLang.trim()) {
    for (const part of acceptLang.split(',')) {
      const code = part.split(';')[0]?.trim();
      const normalized = normalizeLanguageCode(code);
      if (normalized) {
        return {
          lang: normalized,
          pref: cookieData.pref ?? 'auto',
          queryLang: null,
        };
      }
    }
  }

  return { lang: 'en', pref: cookieData.pref ?? 'auto', queryLang: null };
}

function applyHtmlLangTag(html: string, lang: LanguageCode): string {
  const htmlLang = getHtmlLangTag(lang);
  if (/<html\b[^>]*\blang="[^"]*"/i.test(html)) {
    return html.replace(
      /(<html\b[^>]*\blang=")[^"]*(")/i,
      `$1${escapeHtmlAttr(htmlLang)}$2`
    );
  }
  return html.replace(/<html\b/i, `<html lang="${escapeHtmlAttr(htmlLang)}"`);
}

function buildHreflangLinksHtml(_canonicalUrl: string): string {
  return '';
}

function stripStaticSeoHeadTags(html: string): string {
  return html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(
      /<meta\b[^>]*\bname=["'](?:robots|description|keywords|twitter:[^"']+)["'][^>]*>/gi,
      ''
    )
    .replace(/<meta\b[^>]*\bproperty=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(
      /<link\b[^>]*\brel=["']alternate["'][^>]*\bhreflang=["'][^"']+["'][^>]*>/gi,
      ''
    )
    .replace(
      /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
}

const INVALID_SSR_PLACEHOLDER_SLUGS = new Set([
  'watch-drama',
  'series',
  'drama',
  'short-drama',
  'hd-movie',
  'movie',
  'unknown',
  'null',
  'undefined',
]);

function isValidSitemapSlug(slug: string | undefined | null): boolean {
  const clean = String(slug || '').trim().toLowerCase();
  return Boolean(clean && !INVALID_SSR_PLACEHOLDER_SLUGS.has(clean));
}

function isValidSsrDrama(
  drama: SsrDrama | null | undefined,
  episodes: SsrEpisode[] = []
): drama is SsrDrama {
  if (!drama) return false;
  const title = cleanText(drama.title);
  const bookId = cleanText(drama.bookId);
  if (!title || title.length < 2 || !bookId) return false;
  const resolvedSlug = cleanText(drama.slug) || slugifyTitle(title);
  if (!isValidSitemapSlug(resolvedSlug)) return false;
  const hasEpisodes =
    episodes.length > 0 || (Number(drama.chapterCount) || 0) >= 1;
  const hasCoverOrDesc = Boolean(
    cleanText(drama.cover) || cleanText(drama.description)
  );
  return hasEpisodes && hasCoverOrDesc;
}

function isValidSsrMovie(
  movie: Lk21DetailPayload | LookSeriesDetailPayload | null | undefined
): movie is Lk21DetailPayload | LookSeriesDetailPayload {
  if (!movie) return false;
  const title = cleanText(movie.title);
  const slug = cleanText(movie.slug);
  if (!title || title.length < 2 || !isValidSitemapSlug(slug)) return false;
  const hasImage = Boolean(
    cleanText(movie.poster || movie.cover || movie.coverHz)
  );
  if (hasImage) return true;
  const syn = cleanText(movie.synopsis || movie.description);
  if (!syn || /^Nonton streaming .+ di MolaTV\.?$/i.test(syn)) return false;
  return Array.isArray(movie.providers) && movie.providers.length > 0;
}

function injectRootSsrMarkup(html: string, innerHtml: string): string {
  if (!innerHtml) return html;
  return html.replace(
    /<div\s+id=["']root["']\s*><\/div>/i,
    `<div id="root">${innerHtml}</div>`
  );
}

interface SsrRelatedLink {
  title: string;
  slug: string;
  provider: string;
}

function injectDramaSeoIntoHtml(
  html: string,
  origin: string,
  bookId: string,
  drama: SsrDrama,
  episodes: SsrEpisode[],
  _ssrLang: LanguageCode = 'en',
  _pref: LanguagePreference = 'auto',
  episodeNumber = 1,
  explicitQueryLang: LanguageCode | null = null,
  isWatchRoute = false,
  relatedItems: SsrRelatedLink[] = []
): string {
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const slug = (cleanText(drama.slug) || slugifyTitle(drama.title))
    .trim()
    .toLowerCase();
  const encodedSlug = encodeURIComponent(slug);
  const provSlug = getProviderRouteSlug(drama.provider);
  const canonicalPath = `/${provSlug}/detail/${encodedSlug}`;
  const canonicalUrl = `${origin}${canonicalPath}`;
  const watchPath = `/${provSlug}/watch/${encodedSlug}${safeEp > 1 ? `?ep=${safeEp}` : ''}`;
  const epWatchUrl =
    isWatchRoute || safeEp > 1 ? `${origin}${watchPath}` : canonicalUrl;
  const epCount = Math.max(1, episodes.length || drama.chapterCount || 1);
  const effectiveLang =
    explicitQueryLang ??
    detectLanguageFromContent(
      {
        title: drama.title,
        description: drama.description,
        tags: drama.tags,
        provider: drama.provider,
      },
      'en'
    );
  const activeEpisode = episodes.find((ep) => Number(ep.episodeNumber) === safeEp);
  const { seriesDescription, episodeDescription } =
    resolveDramaSeoDescriptionFields({
      title: drama.title,
      rawDescription: drama.description,
      episodeNumber: safeEp,
      episodeCount: epCount,
      episodeTitle: activeEpisode?.title,
      isMovie: false,
      lang: effectiveLang,
      tags: drama.tags,
    });
  const normalizedDrama: SsrDrama = {
    ...drama,
    slug,
    description: seriesDescription,
  };
  const ogImage = toAbsoluteImageUrl(drama.cover || DEFAULT_OG_IMAGE_PATH, origin);
  const keywordsList = [
    drama.title,
    `Watch Free ${drama.title} online`,
    'KanoDrama',
    'Kano Drama',
    'Vertical Short Drama',
    'Asian Mini Series',
    drama.provider,
    ...drama.tags,
  ].filter(Boolean);

  const meta = generateMetadata({
    page: 'drama',
    lang: effectiveLang,
    origin,
    pathname: canonicalPath,
    title: drama.title,
    description:
      isWatchRoute || safeEp > 1 ? episodeDescription : seriesDescription,
    episodeCount: epCount,
    episodeNumber: isWatchRoute || safeEp > 1 ? safeEp : undefined,
    keywords: keywordsList,
    image: ogImage,
  });

  const pageTitle = meta.title;
  const desc = meta.description;
  const keywords = meta.keywords;

  const dramaActors = drama.protagonist
    ? drama.protagonist
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({
          '@type': 'Person',
          name,
        }))
    : [];

  const dramaBreadcrumbs: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
    { '@type': 'ListItem', position: 2, name: 'Explore', item: `${origin}/explore` },
    { '@type': 'ListItem', position: 3, name: drama.title, item: canonicalUrl },
  ];
  if (isWatchRoute || safeEp > 1) {
    dramaBreadcrumbs.push({
      '@type': 'ListItem',
      position: 4,
      name: `Episode ${safeEp}`,
      item: epWatchUrl,
    });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TVSeries',
        '@id': `${canonicalUrl}#tvseries`,
        name: drama.title,
        description: seriesDescription,
        image: meta.openGraph.image,
        url: canonicalUrl,
        inLanguage: meta.inLanguage,
        numberOfEpisodes: epCount,
        genre: drama.tags.length > 0 ? drama.tags : ['Drama', 'Short Series'],
        ...(dramaActors.length > 0 ? { actor: dramaActors } : {}),
        containsSeason: {
          '@type': 'TVSeason',
          seasonNumber: 1,
          numberOfEpisodes: epCount,
        },
        potentialAction: {
          '@type': 'WatchAction',
          target: epWatchUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: dramaBreadcrumbs,
      },
    ],
  };

  const primaryImg = meta.openGraph.images[0];
  const ogImageUrl = primaryImg?.url || meta.openGraph.image;
  const ogSecureUrl = primaryImg?.secureUrl || ogImageUrl.replace(/^http:\/\//i, 'https://');
  const ogImgAlt = primaryImg?.alt || pageTitle;

  const seoHeadBlock = `
    <title>${escapeHtmlAttr(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(desc)}" />
    <meta name="keywords" content="${escapeHtmlAttr(keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
${buildHreflangLinksHtml(canonicalUrl)}
    <meta property="og:site_name" content="KanoDrama" />
    <meta property="og:locale" content="${escapeHtmlAttr(meta.ogLocale)}" />
    <meta property="og:type" content="${isWatchRoute || safeEp > 1 ? 'video.episode' : 'video.tv_show'}" />
    <meta property="og:title" content="${escapeHtmlAttr(pageTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(desc)}" />
    <meta property="og:url" content="${escapeHtmlAttr(epWatchUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(ogImageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="${primaryImg?.type ?? 'image/jpeg'}" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(desc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(meta.twitter.image)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
    <script>window.__INITIAL_DRAMA__=${JSON.stringify({
      bookId,
      drama: normalizedDrama,
      episodes,
    }).replace(/<\/script>/gi, '<\\/script>')};</script>
  `;

  const ssrTagLinks = drama.tags
    .slice(0, 8)
    .map((tg) => {
      const tSlug = slugifyTitle(tg);
      if (!tSlug) return '';
      return `<a href="/tag/${encodeURIComponent(tSlug)}">${escapeHtmlAttr(tg)}</a>`;
    })
    .filter(Boolean)
    .join(' · ');
  const ssrEpisodeNumbers =
    episodes.length > 0
      ? episodes.slice(0, 24).map((ep) => ({
          num: Number(ep.episodeNumber) || 1,
          label: ep.title || `Episode ${Number(ep.episodeNumber) || 1}`,
        }))
      : Array.from({ length: Math.min(12, epCount) }, (_, idx) => ({
          num: idx + 1,
          label: `Episode ${idx + 1}`,
        }));
  const ssrEpisodeLinks = ssrEpisodeNumbers
    .map(
      (ep) =>
        `<li><a href="/${provSlug}/watch/${encodedSlug}?ep=${ep.num}">${escapeHtmlAttr(ep.label)}</a></li>`
    )
    .join('');
  const ssrRelatedLinksHtml =
    relatedItems.length > 0
      ? `<section aria-label="Related Dramas"><h2>Related Dramas</h2><ul>${relatedItems
          .map((item) => {
            const rProvSlug = getProviderRouteSlug(item.provider);
            const rSlug = encodeURIComponent(item.slug);
            return `<li><a href="/${rProvSlug}/detail/${rSlug}">${escapeHtmlAttr(item.title)}</a></li>`;
          })
          .join('')}</ul></section>`
      : '';

  const ssrDramaRootHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/explore">Explore</a> / <span>${escapeHtmlAttr(drama.title)}</span></nav>
    <article itemscope itemtype="https://schema.org/TVSeries">
      <img itemprop="image" src="${escapeHtmlAttr(ogImageUrl)}" alt="${escapeHtmlAttr(drama.title)}" width="360" height="540" />
      <h1 itemprop="name">${escapeHtmlAttr(drama.title)}</h1>
      <p>${escapeHtmlAttr(drama.provider)} · ${epCount} Episodes</p>
      ${drama.protagonist ? `<p>Cast: ${escapeHtmlAttr(drama.protagonist)}</p>` : ''}
      ${ssrTagLinks ? `<p>Genres: ${ssrTagLinks}</p>` : ''}
      <p itemprop="description">${escapeHtmlAttr(seriesDescription)}</p>
      <p><a href="${escapeHtmlAttr(watchPath)}">Watch Free Episode ${safeEp}</a></p>
      <section aria-label="Episodes">
        <h2>Episodes (${epCount})</h2>
        <ul>${ssrEpisodeLinks}</ul>
      </section>
      ${ssrRelatedLinksHtml}
    </article>
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), effectiveLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, ssrDramaRootHtml);
}

function injectNotFoundSeoIntoHtml(
  html: string,
  _origin: string,
  pathname: string,
  kind: 'drama' | 'movie' | 'provider' = 'drama',
  ssrLang: LanguageCode = 'en'
): string {
  const isIndonesian = ssrLang === 'id';
  const heading =
    kind === 'movie'
      ? isIndonesian
        ? 'Film atau Serial Tidak Ditemukan'
        : 'Movie or Series Not Found'
      : kind === 'provider'
      ? isIndonesian
        ? 'Provider Tidak Ditemukan'
        : 'Provider Not Found'
      : isIndonesian
      ? 'Drama Tidak Ditemukan'
      : 'Drama Not Found';
  const message =
    kind === 'provider'
      ? isIndonesian
        ? 'Maaf, halaman provider yang Anda cari tidak tersedia di katalog KanoDrama.'
        : 'Sorry, the requested provider page could not be found in the KanoDrama directory.'
      : isIndonesian
      ? 'Maaf, judul yang Anda cari tidak tersedia atau datanya kosong di katalog KanoDrama.'
      : 'Sorry, the requested title could not be found or is no longer available in the KanoDrama catalog.';
  const pageTitle = `404 — ${heading} | KanoDrama`;
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  const seoHeadBlock = `
    <title>${escapeHtmlAttr(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(message)}" />
    <meta name="robots" content="noindex, nofollow" />
    <script>window.__INITIAL_NOT_FOUND__=${JSON.stringify({
      pathname: cleanPath,
      kind,
    }).replace(/<\/script>/gi, '<\\/script>')};</script>
  `;

  const notFoundBodyHtml = `<main class="max-w-3xl mx-auto px-4 py-16 text-center text-[#FAFAFA]">
    <h1>404 — ${escapeHtmlAttr(heading)}</h1>
    <p>${escapeHtmlAttr(message)}</p>
    <nav aria-label="404 Navigation">
      <a href="/">${isIndonesian ? 'Beranda' : 'Home'}</a> ·
      <a href="/explore">${isIndonesian ? 'Jelajahi Drama' : 'Explore Dramas'}</a> ·
      <a href="/providers">${isIndonesian ? 'Daftar Provider' : 'All Providers'}</a> ·
      <a href="/movies">${isIndonesian ? 'Daftar Film' : 'Browse Movies'}</a>
    </nav>
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, notFoundBodyHtml);
}

function injectMovieSeoIntoHtml(
  html: string,
  origin: string,
  movie: Lk21DetailPayload | LookSeriesDetailPayload,
  episodes: Lk21EpisodePayloadItem[],
  _ssrLang: LanguageCode = 'en',
  _pref: LanguagePreference = 'auto',
  episodeNumber = 1,
  explicitQueryLang: LanguageCode | null = null,
  isWatchRoute = false,
  relatedItems: SsrRelatedLink[] = []
): string {
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const movieSlug = (cleanText(movie.slug) || slugifyTitle(movie.title))
    .trim()
    .toLowerCase();
  const encodedMovieSlug = encodeURIComponent(movieSlug);
  const canonicalPath = `/movie/detail/${encodedMovieSlug}`;
  const canonicalUrl = `${origin}${canonicalPath}`;
  const isSeries = movie.type === 'series' && episodes.length > 1;
  const watchPath = `/movie/watch/${encodedMovieSlug}${isSeries && safeEp > 1 ? `?ep=${safeEp}` : ''}`;
  const epWatchUrl =
    isWatchRoute || (isSeries && safeEp > 1)
      ? `${origin}${watchPath}`
      : canonicalUrl;
  const yearTag = movie.year ? ` (${movie.year})` : '';
  const rawDesc = cleanSeoDescription(movie.synopsis || movie.description || '');
  const effectiveLang =
    explicitQueryLang ??
    detectLanguageFromContent(
      {
        title: movie.title,
        description: rawDesc,
        tags: movie.genres,
        area: movie.area,
        provider: movie.app === 'lookseries' ? 'LookSeries' : 'LK21',
      },
      'en'
    );
  const cleanMovieBaseTitle =
    stripLeadingWatchPrefix(movie.title || '') || movie.title || 'HD Movie';
  const hasYearInTitle = Boolean(
    movie.year &&
      new RegExp(
        `\\(${String(movie.year).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`
      ).test(cleanMovieBaseTitle)
  );
  const displayMovieTitle =
    yearTag && !hasYearInTitle
      ? `${cleanMovieBaseTitle}${yearTag}`
      : cleanMovieBaseTitle;
  const activeMovieEp = episodes.find(
    (ep) => Number(ep.order) === safeEp || Number(ep.episode) === safeEp
  );
  const { seriesDescription, episodeDescription } =
    resolveDramaSeoDescriptionFields({
      title: movie.title,
      rawDescription: rawDesc,
      episodeNumber: safeEp,
      episodeCount: Math.max(1, episodes.length),
      episodeTitle: activeMovieEp?.title,
      isMovie: true,
      lang: effectiveLang,
      tags: movie.genres,
    });
  const ogImage = toAbsoluteImageUrl(
    movie.poster || movie.cover || DEFAULT_OG_IMAGE_PATH,
    origin
  );
  const keywordsList = [
    `Watch Free ${cleanMovieBaseTitle} online`,
    `${cleanMovieBaseTitle} full movie HD`,
    'KanoDrama',
    'Kano Drama',
    ...movie.genres,
    movie.area,
    movie.year,
    movie.director,
    'watch free movies HD',
  ].filter(Boolean);

  const meta = generateMetadata({
    page: 'movie',
    lang: effectiveLang,
    origin,
    pathname: canonicalPath,
    title: displayMovieTitle,
    description:
      isWatchRoute || (isSeries && safeEp > 1)
        ? episodeDescription
        : seriesDescription,
    episodeCount: Math.max(1, episodes.length),
    episodeNumber: isSeries && safeEp > 1 ? safeEp : undefined,
    keywords: keywordsList,
    image: ogImage,
  });

  const pageTitle = meta.title;
  const desc = meta.description;
  const keywords = meta.keywords;

  const movieActors = (movie.actors || [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => ({ '@type': 'Person', name }));

  const movieSchema =
    isSeries
      ? {
          '@type': 'TVSeries',
          '@id': `${canonicalUrl}#tvseries`,
          name: movie.title,
          description: seriesDescription,
          image: meta.openGraph.image,
          url: canonicalUrl,
          inLanguage: meta.inLanguage,
          numberOfEpisodes: episodes.length,
          datePublished: movie.year ? `${movie.year}-01-01` : undefined,
          genre: movie.genres.length > 0 ? movie.genres : ['Drama', 'Series'],
          director: movie.director
            ? { '@type': 'Person', name: movie.director }
            : undefined,
          ...(movieActors.length > 0 ? { actor: movieActors } : {}),
          containsSeason: {
            '@type': 'TVSeason',
            seasonNumber: 1,
            numberOfEpisodes: episodes.length,
          },
          potentialAction: { '@type': 'WatchAction', target: epWatchUrl },
        }
      : {
          '@type': 'Movie',
          '@id': `${canonicalUrl}#movie`,
          name: movie.title,
          description: seriesDescription,
          image: meta.openGraph.image,
          url: canonicalUrl,
          inLanguage: meta.inLanguage,
          dateCreated: movie.year || undefined,
          countryOfOrigin: movie.area
            ? { '@type': 'Country', name: movie.area }
            : undefined,
          genre: movie.genres.length > 0 ? movie.genres : ['Feature Film'],
          director: movie.director
            ? { '@type': 'Person', name: movie.director }
            : undefined,
          ...(movieActors.length > 0 ? { actor: movieActors } : {}),
          potentialAction: { '@type': 'WatchAction', target: epWatchUrl },
        };

  const movieBreadcrumbs: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
    { '@type': 'ListItem', position: 2, name: 'Movies', item: `${origin}/movies` },
    { '@type': 'ListItem', position: 3, name: movie.title, item: canonicalUrl },
  ];
  if (isSeries && (isWatchRoute || safeEp > 1)) {
    movieBreadcrumbs.push({
      '@type': 'ListItem',
      position: 4,
      name: `Episode ${safeEp}`,
      item: epWatchUrl,
    });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      movieSchema,
      {
        '@type': 'BreadcrumbList',
        itemListElement: movieBreadcrumbs,
      },
    ],
  };

  const primaryImg = meta.openGraph.images[0];
  const ogSecureUrl = primaryImg?.secureUrl || meta.openGraph.image.replace(/^http:\/\//i, 'https://');
  const ogImgAlt = primaryImg?.alt || pageTitle;

  const seoHeadBlock = `
    <title>${escapeHtmlAttr(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(desc)}" />
    <meta name="keywords" content="${escapeHtmlAttr(keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
${buildHreflangLinksHtml(canonicalUrl)}
    <meta property="og:site_name" content="KanoDrama" />
    <meta property="og:locale" content="${escapeHtmlAttr(meta.ogLocale)}" />
    <meta property="og:type" content="${isSeries && (isWatchRoute || safeEp > 1) ? 'video.episode' : 'video.movie'}" />
    <meta property="og:title" content="${escapeHtmlAttr(pageTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(desc)}" />
    <meta property="og:url" content="${escapeHtmlAttr(epWatchUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(meta.openGraph.image)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(desc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(meta.twitter.image)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
    <script>window.__INITIAL_MOVIE__=${JSON.stringify({
      movie: { ...movie, slug: movieSlug },
      episodes,
    }).replace(/<\/script>/gi, '<\\/script>')};</script>
  `;

  const movieEpLinks =
    isSeries && episodes.length > 0
      ? `<ul>${episodes
          .slice(0, 24)
          .map((ep, idx) => {
            const epNum = Number(ep.order) || Number(ep.episode) || idx + 1;
            const epTitle = ep.title || `Episode ${epNum}`;
            return `<li><a href="/movie/watch/${encodedMovieSlug}?ep=${epNum}">${escapeHtmlAttr(epTitle)}</a></li>`;
          })
          .join('')}</ul>`
      : '';
  const ssrRelatedMovieHtml =
    relatedItems.length > 0
      ? `<section aria-label="Related Movies"><h2>Related Titles</h2><ul>${relatedItems
          .map(
            (item) =>
              `<li><a href="/${getProviderRouteSlug(item.provider)}/detail/${encodeURIComponent(item.slug)}">${escapeHtmlAttr(item.title)}</a></li>`
          )
          .join('')}</ul></section>`
      : '';
  const ssrMovieRootHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/movies">Movies</a> / <span>${escapeHtmlAttr(displayMovieTitle)}</span></nav>
    <article itemscope itemtype="${isSeries ? 'https://schema.org/TVSeries' : 'https://schema.org/Movie'}">
      <img itemprop="image" src="${escapeHtmlAttr(meta.openGraph.image)}" alt="${escapeHtmlAttr(displayMovieTitle)}" width="360" height="540" />
      <h1 itemprop="name">${escapeHtmlAttr(displayMovieTitle)}</h1>
      <p>${[movie.quality || 'HD', movie.year, movie.area, movie.genres.join(', ')].filter(Boolean).map(escapeHtmlAttr).join(' · ')}</p>
      ${movie.director ? `<p>Director: ${escapeHtmlAttr(movie.director)}</p>` : ''}
      ${movie.actors?.length ? `<p>Cast: ${escapeHtmlAttr(movie.actors.slice(0, 8).join(', '))}</p>` : ''}
      <p itemprop="description">${escapeHtmlAttr(seriesDescription)}</p>
      <p><a href="${escapeHtmlAttr(watchPath)}">Watch Free Now</a></p>
      ${movieEpLinks}
      ${ssrRelatedMovieHtml}
    </article>
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), effectiveLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, ssrMovieRootHtml);
}

function injectProgrammaticSeoIntoHtml(
  html: string,
  origin: string,
  landing: ProgrammaticLandingConfig,
  items: Array<Record<string, unknown>>,
  ssrLang: LanguageCode = 'en'
): string {
  const canonicalUrl = `${origin}${landing.canonicalPath}`;
  const ogImage = buildOgImageEndpointUrl(DEFAULT_OG_IMAGE_PATH, origin, landing.title);
  const ogSecureUrl = ogImage.replace(/^http:\/\//i, 'https://');
  const htmlLang = getHtmlLangTag(ssrLang);
  const ogLocale = getOgLocaleTag(ssrLang);

  const itemListElements = items.slice(0, 12).map((item, idx) => {
    const title = cleanText(item.title, 'Short Drama');
    const slug = cleanText(item.slug) || slugifyTitle(title);
    const provSlug = getProviderRouteSlug(cleanText(item.provider, 'DramaBox'));
    return {
      '@type': 'ListItem',
      position: idx + 1,
      name: title,
      url: `${origin}/${provSlug}/detail/${encodeURIComponent(slug)}`,
    };
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: landing.title,
        description: landing.description,
        url: canonicalUrl,
        inLanguage: htmlLang,
        isPartOf: {
          '@type': 'WebSite',
          name: 'KanoDrama',
          url: `${origin}/`,
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: itemListElements.length,
          itemListElement: itemListElements,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: landing.basePath === 'tag' ? 'Tags' : 'Genres',
            item: `${origin}/explore`,
          },
          { '@type': 'ListItem', position: 3, name: landing.h1, item: canonicalUrl },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: landing.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a,
          },
        })),
      },
    ],
  };

  const seoHeadBlock = `
    <title>${escapeHtmlAttr(landing.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(landing.description)}" />
    <meta name="keywords" content="${escapeHtmlAttr(landing.keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
${buildHreflangLinksHtml(canonicalUrl)}
    <meta property="og:site_name" content="KanoDrama" />
    <meta property="og:locale" content="${escapeHtmlAttr(ogLocale)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtmlAttr(landing.title)}" />
    <meta property="og:description" content="${escapeHtmlAttr(landing.description)}" />
    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(landing.title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(landing.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(landing.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
  `;

  return applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
}

function injectPageMetadataIntoHtml(
  html: string,
  origin: string,
  page:
    | 'home'
    | 'movies'
    | 'explore'
    | 'providers'
    | 'trending'
    | 'latest'
    | 'vip'
    | 'watchlist'
    | 'dashboard',
  pathname: string,
  ssrLang: LanguageCode
): string {
  const ogImage = `${origin}${DEFAULT_OG_IMAGE_PATH}`;
  const meta = generateMetadata({
    page,
    lang: ssrLang,
    origin,
    pathname,
    image: ogImage,
  });

  const sectionLabelMap: Record<string, string> = {
    movies: 'Movies',
    explore: 'Explore',
    providers: 'Providers',
    trending: 'Trending',
    latest: 'Latest Releases',
    vip: 'VIP Originals',
    watchlist: 'My Account',
    dashboard: 'My Account',
  };
  const isCollectionPage =
    page === 'movies' ||
    page === 'explore' ||
    page === 'providers' ||
    page === 'trending' ||
    page === 'latest' ||
    page === 'vip';

  const jsonLd =
    page === 'home'
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'KanoDrama',
          inLanguage: meta.inLanguage,
          url: `${origin}/`,
          description: meta.description,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${origin}/?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }
      : {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': isCollectionPage ? 'CollectionPage' : 'WebPage',
              name: meta.title,
              description: meta.description,
              url: meta.canonicalUrl,
              inLanguage: meta.inLanguage,
              isPartOf: {
                '@type': 'WebSite',
                name: 'KanoDrama',
                url: `${origin}/`,
              },
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: sectionLabelMap[page] || 'Browse',
                  item: meta.canonicalUrl,
                },
              ],
            },
          ],
        };

  const primaryImg = meta.openGraph.images[0];
  const ogSecureUrl = primaryImg?.secureUrl || meta.openGraph.image.replace(/^http:\/\//i, 'https://');
  const ogImgAlt = primaryImg?.alt || meta.openGraph.title;

  const isPrivatePage = page === 'watchlist' || page === 'dashboard';
  const seoHeadBlock = `
    <title>${escapeHtmlAttr(meta.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(meta.description)}" />
    <meta name="keywords" content="${escapeHtmlAttr(meta.keywords)}" />
    <meta name="robots" content="${isPrivatePage ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}" />
    <link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />
${buildHreflangLinksHtml(meta.canonicalUrl)}
    <meta property="og:site_name" content="KanoDrama" />
    <meta property="og:locale" content="${escapeHtmlAttr(meta.ogLocale)}" />
    <meta property="og:type" content="${meta.openGraph.type}" />
    <meta property="og:title" content="${escapeHtmlAttr(meta.openGraph.title)}" />
    <meta property="og:description" content="${escapeHtmlAttr(meta.openGraph.description)}" />
    <meta property="og:url" content="${escapeHtmlAttr(meta.openGraph.url)}" />
    <meta property="og:image" content="${escapeHtmlAttr(meta.openGraph.image)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(meta.twitter.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(meta.twitter.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(meta.twitter.image)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
  `;

  return applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
}

function injectProviderSeoIntoHtml(
  html: string,
  origin: string,
  provider: SsrProviderName,
  pathname: string,
  ssrLang: LanguageCode,
  items: Array<Record<string, unknown>> = []
): string {
  const ogImage = `${origin}${DEFAULT_OG_IMAGE_PATH}`;
  const provSlug = getProviderRouteSlug(provider);
  const canonicalPath = `/provider/${provSlug}`;
  const meta = generateMetadata({
    page: 'provider',
    lang: ssrLang,
    origin,
    pathname: pathname || canonicalPath,
    providerName: provider,
    image: ogImage,
    keywords: [
      provider,
      `${provider} Short Drama`,
      'KanoDrama',
      'Kano Drama',
      'Watch Free Vertical Drama Online',
    ],
  });

  const itemListElements = items.slice(0, 12).map((item, idx) => {
    const title = cleanText(item.title, 'Short Drama');
    const slug = cleanText(item.slug) || slugifyTitle(title);
    const itemProvSlug = getProviderRouteSlug(cleanText(item.provider, provider));
    return {
      '@type': 'ListItem',
      position: idx + 1,
      name: title,
      url: `${origin}/${itemProvSlug}/detail/${encodeURIComponent(slug)}`,
    };
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: meta.title,
        description: meta.description,
        url: meta.canonicalUrl,
        inLanguage: meta.inLanguage,
        isPartOf: {
          '@type': 'WebSite',
          name: 'KanoDrama',
          url: `${origin}/`,
        },
        ...(itemListElements.length > 0
          ? {
              mainEntity: {
                '@type': 'ItemList',
                numberOfItems: itemListElements.length,
                itemListElement: itemListElements,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${origin}/providers` },
          { '@type': 'ListItem', position: 3, name: provider, item: meta.canonicalUrl },
        ],
      },
    ],
  };

  const primaryImg = meta.openGraph.images[0];
  const ogSecureUrl = primaryImg?.secureUrl || meta.openGraph.image.replace(/^http:\/\//i, 'https://');
  const ogImgAlt = primaryImg?.alt || meta.openGraph.title;

  const seoHeadBlock = `
    <title>${escapeHtmlAttr(meta.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(meta.description)}" />
    <meta name="keywords" content="${escapeHtmlAttr(meta.keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />
${buildHreflangLinksHtml(meta.canonicalUrl)}
    <meta property="og:site_name" content="KanoDrama" />
    <meta property="og:locale" content="${escapeHtmlAttr(meta.ogLocale)}" />
    <meta property="og:type" content="${meta.openGraph.type}" />
    <meta property="og:title" content="${escapeHtmlAttr(meta.openGraph.title)}" />
    <meta property="og:description" content="${escapeHtmlAttr(meta.openGraph.description)}" />
    <meta property="og:url" content="${escapeHtmlAttr(meta.openGraph.url)}" />
    <meta property="og:image" content="${escapeHtmlAttr(meta.openGraph.image)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(meta.twitter.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(meta.twitter.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(meta.twitter.image)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
  `;

  const ssrItemsHtml =
    itemListElements.length > 0
      ? `<ul>${itemListElements
          .map(
            (el) =>
              `<li><a href="${escapeHtmlAttr(el.url.replace(origin, ''))}">${escapeHtmlAttr(el.name)}</a></li>`
          )
          .join('')}</ul>`
      : '';

  const ssrProviderBodyHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/providers">Providers</a> / <span>${escapeHtmlAttr(provider)}</span></nav>
    <h1>${escapeHtmlAttr(provider)} Short Dramas on KanoDrama</h1>
    <p>${escapeHtmlAttr(meta.description)}</p>
    ${ssrItemsHtml}
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, ssrProviderBodyHtml);
}

async function startServer() {
  const app = express();
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression'] || req.headers.range) return false;
        return compression.filter(req, res);
      },
    })
  );
  app.use(express.json({ limit: '256kb' }));
  const rootDir = process.cwd();
  const distDir = path.resolve(rootDir, 'dist');

  app.use((req: Request, res: Response, next) => {
    if (
      req.path === '/sw.js' ||
      req.path === '/pwa-sw-v2.js' ||
      req.path === '/dev-sw.js' ||
      req.path === '/manifest.json' ||
      req.path === '/manifest.webmanifest'
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  let vite: ViteDevServer | null = null;
  if (!IS_PROD) {
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'custom',
    });
    app.get('/@vite/client', async (_req: Request, res: Response, next) => {
      try {
        const result = await vite!.transformRequest('/@vite/client');
        if (!result?.code) return next();
        const patched = result.code
          .replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR/WS disabled in middlewareMode */'
          )
          .replace(
            'else throw new SendBeforeConnectError("send was called before connect");',
            'else return;'
          )
          .replace(
            'else throw new SendBeforeConnectError("invoke was called before connect");',
            'else return undefined;'
          );
        res
          .type('application/javascript')
          .set('Cache-Control', 'no-cache')
          .send(patched);
      } catch {
        next();
      }
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
  }

  app.get('/api/health', async (_req: Request, res: Response) => {
    const db = await pingDb();
    res.json({ ok: true, service: 'kano-drama-ssr', db });
  });

  // Database-cached Home endpoint (reads cache first, stale-while-revalidate async refresh)
  app.get('/api/home', async (req: Request, res: Response) => {
    const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
    const provider =
      typeof req.query.provider === 'string' ? req.query.provider : 'All';
    try {
      const data = await getCachedHomeData(getMolaToken(), lang, provider);
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, stale-while-revalidate=3600'
      );
      res.setHeader(
        'X-Home-Cache',
        data.cached ? (data.stale ? 'STALE' : 'HIT') : 'MISS'
      );
      res.json(data);
    } catch {
      const now = Date.now();
      res.status(200).json({
        lang,
        provider,
        heroSpotlights: [],
        trendingTop: [],
        hotReleases: [],
        catalogGrid: [],
        providerCounts: {},
        updatedAt: now,
        expiresAt: now + 30_000,
        cached: false,
        stale: false,
        source: 'empty-fallback',
        storage: 'memory',
      });
    }
  });

  // Manual async revalidation trigger for Home cache
  app.post('/api/home/revalidate', (req: Request, res: Response) => {
    const lang =
      typeof req.query.lang === 'string'
        ? req.query.lang
        : typeof req.body?.lang === 'string'
        ? req.body.lang
        : 'en';
    const provider =
      typeof req.query.provider === 'string'
        ? req.query.provider
        : typeof req.body?.provider === 'string'
        ? req.body.provider
        : 'All';
    const result = triggerAsyncHomeRevalidate(getMolaToken(), lang, provider);
    res.status(result.started ? 202 : 200).json({
      ok: true,
      revalidating: result.started,
      cacheKey: result.cacheKey,
    });
  });

  app.get('/api/home/cache-status', async (_req: Request, res: Response) => {
    try {
      res.json(await getHomeCacheStatus());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to inspect cache status',
      });
    }
  });

  let cachedPlatformsPayload: {
    expiresAt: number;
    platforms: Array<{
      id: string;
      slug: string;
      name: string;
      logo: string;
      icon: string;
    }>;
  } | null = null;

  app.get('/api/platforms', async (_req: Request, res: Response) => {
    const now = Date.now();
    if (cachedPlatformsPayload && now < cachedPlatformsPayload.expiresAt) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({
        ok: true,
        source: `${MOLA_PLATFORM_ORIGIN}/#platforms`,
        cached: true,
        platforms: cachedPlatformsPayload.platforms,
      });
      return;
    }

    const liveSlugLogos = new Map<string, { name?: string; logo: string }>();
    try {
      const upstream = await fetch(`${MOLA_PLATFORM_ORIGIN}/`, {
        method: 'GET',
        headers: {
          Accept: 'text/html',
          'User-Agent': 'KanoDrama/2.0 (+https://kano-drama.xyz)',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.ok) {
        const html = await upstream.text();
        const cards = html.matchAll(/<a[^>]*class="plat-card"[^>]*>([\s\S]*?)<\/a>/gi);
        for (const match of cards) {
          const cardHtml = match[0];
          const slug = (cardHtml.match(/data-slug="([^"]+)"/i) || [])[1]?.trim().toLowerCase();
          const imgPath = (cardHtml.match(/src="([^"]+)"/i) || [])[1]?.trim();
          const label = (cardHtml.match(/class="plat-name"[^>]*>([^<]+)</i) || [])[1]?.trim();
          if (slug && imgPath) {
            const absLogo = imgPath.startsWith('http')
              ? imgPath
              : `${MOLA_PLATFORM_ORIGIN}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`;
            liveSlugLogos.set(slug, { name: label, logo: absLogo });
          }
        }
      }
    } catch {
      // Fallback safely to static verified mapping below
    }

    const platforms = Object.entries(PROVIDER_LOGO_PATHS).map(([id, fallbackPath]) => {
      const slug =
        PROVIDER_SLUG_MAP[id as keyof typeof PROVIDER_SLUG_MAP] || id.toLowerCase();
      const liveEntry = liveSlugLogos.get(slug);
      const officialLogo =
        liveEntry?.logo || `${MOLA_PLATFORM_ORIGIN}${fallbackPath}`;
      return {
        id,
        slug,
        name: liveEntry?.name || id,
        logo: officialLogo,
        icon: officialLogo,
      };
    });

    cachedPlatformsPayload = {
      expiresAt: now + 6 * 60 * 60 * 1000,
      platforms,
    };

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      ok: true,
      source: `${MOLA_PLATFORM_ORIGIN}/#platforms`,
      cached: false,
      platforms,
    });
  });

  function sanitizeMolaUrlString(str: string): string {
    if (!str.startsWith('https://api.molatv.id/api') && !str.startsWith('http://api.molatv.id/api')) {
      return str;
    }
    try {
      const parsed = new URL(str);
      parsed.searchParams.delete('token');
      const subPath = parsed.pathname.replace(/^\/api/, '');
      const qs = parsed.searchParams.toString();
      return `/api/mola${subPath}${qs ? `?${qs}` : ''}`;
    } catch {
      return str;
    }
  }

  function sanitizeMolaPayload(val: unknown): unknown {
    if (typeof val === 'string') return sanitizeMolaUrlString(val);
    if (Array.isArray(val)) return val.map(sanitizeMolaPayload);
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = sanitizeMolaPayload(v);
      }
      return out;
    }
    return val;
  }

  // --- Dedicated LK21 & LookSeries Movies API Routers ---
  // MOLA_API_TOKEN is injected strictly inside server services and never sent to the client.
  app.use(
    '/api/lk21',
    createLk21Router({
      getToken: getMolaToken,
      resolveOrigin,
    })
  );
  app.use(
    '/api/lookseries',
    createLookSeriesRouter({
      getToken: getMolaToken,
      resolveOrigin,
    })
  );

  // Mandatory server-side gateway for all https://api.molatv.id/api/* requests.
  // Injects MOLA_API_TOKEN exclusively on the server and strips embedded tokens from responses.
  app.use('/api/mola', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const token = getMolaToken();
    if (!token) {
      res.status(503).json({
        success: false,
        error: 'Server MOLA_API_TOKEN is not configured.',
      });
      return;
    }

    const rawPath = req.url || '/';
    if (rawPath.includes('..') || rawPath.includes('@') || !rawPath.startsWith('/')) {
      res.status(400).json({ success: false, error: 'Invalid API gateway path' });
      return;
    }

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(`${MOLATV_API_BASE}${rawPath}`);
      if (upstreamUrl.origin !== 'https://api.molatv.id') {
        res.status(403).json({ success: false, error: 'Forbidden upstream origin' });
        return;
      }
      upstreamUrl.searchParams.set('token', token);
    } catch {
      res.status(400).json({ success: false, error: 'Malformed upstream API URL' });
      return;
    }

    const cacheableListGet =
      req.method === 'GET' && isCacheableMolaListPath(rawPath);
    const molaCacheKey = `mola:${rawPath}`;

    if (cacheableListGet) {
      const cached = await getCachedMolaApiResponse(molaCacheKey);
      if (cached) {
        res.status(cached.statusCode);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Mola-Cache', cached.stale ? 'STALE' : 'HIT');
        res.send(cached.payloadJson);

        if (cached.stale) {
          markApiRevalidating(molaCacheKey, async () => {
            try {
              const refreshRes = await fetch(upstreamUrl.toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(12000),
              });
              if (refreshRes.ok) {
                const refreshText = await refreshRes.text();
                const parsed = JSON.parse(refreshText);
                const sanitized = JSON.stringify(sanitizeMolaPayload(parsed));
                setCachedMolaApiResponse(molaCacheKey, refreshRes.status, sanitized);
              }
            } catch {
              // Preserve existing cache on background refresh failure
            }
          });
        }
        return;
      }
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        Accept: req.get('accept') || '*/*',
      };
      const rangeHeader = req.get('range');
      if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
      }

      const upstream = await fetch(upstreamUrl.toString(), {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      const contentType =
        upstream.headers.get('content-type') || 'application/octet-stream';
      const lowerCt = contentType.toLowerCase();

      if (lowerCt.includes('application/json') || lowerCt.includes('text/json')) {
        const text = await upstream.text();
        res.status(upstream.status);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const parsed = JSON.parse(text);
          const sanitized = JSON.stringify(sanitizeMolaPayload(parsed));
          if (cacheableListGet && upstream.ok) {
            setCachedMolaApiResponse(molaCacheKey, upstream.status, sanitized);
            res.setHeader('X-Mola-Cache', 'MISS');
          } else if (
            upstream.ok &&
            /\/(search|cari|detail|list|rank|hot|new|recommend|foryou|drama)/i.test(
              upstreamUrl.pathname
            )
          ) {
            indexMolaPayloadToCatalog(rawPath, sanitized);
          }
          // Auto-detect new episodes returned on episode-list API calls & trigger Google Indexing API
          if (
            upstream.ok &&
            /(allepisode|episodes|chapter)/i.test(upstreamUrl.pathname)
          ) {
            const bookIdCand = cleanText(
              upstreamUrl.searchParams.get('bookId') ??
                upstreamUrl.searchParams.get('dramaId') ??
                upstreamUrl.searchParams.get('id')
            );
            const seg = (upstreamUrl.pathname.match(/\/api\/([^/?]+)/i)?.[1] || '').toLowerCase();
            const parsedObj = parsed as Record<string, unknown> | unknown[];
            const epList = Array.isArray(parsedObj)
              ? parsedObj
              : Array.isArray((parsedObj as Record<string, unknown>)?.data)
              ? ((parsedObj as Record<string, unknown>).data as unknown[])
              : Array.isArray((parsedObj as Record<string, unknown>)?.episodes)
              ? ((parsedObj as Record<string, unknown>).episodes as unknown[])
              : [];
            if (bookIdCand && epList.length > 0) {
              const provName = parseSsrProviderName(seg);
              void updateCatalogEpisodeCountIfHigherInDb(
                bookIdCand,
                provName,
                epList.length
              )
                .then((updated) => {
                  if (updated && updated.increased) {
                    return notifyCatalogAdditionsToGoogle(
                      [
                        {
                          dramaId: bookIdCand,
                          provider: provName,
                          slug: updated.slug,
                          chapterCount: updated.chapterCount,
                          reason: 'new_episode',
                        },
                      ],
                      resolveOrigin(req)
                    );
                  }
                  return [];
                })
                .catch(() => {});
            }
          }
          res.send(sanitized);
        } catch {
          res.send(text);
        }
        return;
      }

      if (
        lowerCt.includes('mpegurl') ||
        upstreamUrl.pathname.toLowerCase().endsWith('.m3u8')
      ) {
        const playlist = await upstream.text();
        const wrapPlaylistTarget = (target: string) => {
          try {
            const abs = new URL(target, upstreamUrl.toString()).toString();
            if (abs.startsWith(MOLATV_API_BASE)) {
              return sanitizeMolaUrlString(abs);
            }
            return `/api/proxy?url=${encodeURIComponent(abs)}`;
          } catch {
            return target;
          }
        };
        const rewritten = playlist
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
                return `URI="${wrapPlaylistTarget(uri)}"`;
              });
            }
            return wrapPlaylistTarget(trimmed);
          })
          .join('\n');
        res.status(upstream.status);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(rewritten);
        return;
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges');
      const contentLength = upstream.headers.get('content-length');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      if (upstream.body) {
        pipeWebStreamToExpress(
          upstream.body,
          req,
          res,
          'Upstream API gateway stream interrupted'
        );
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      if (cacheableListGet) {
        const staleFallback = await getCachedMolaApiResponse(molaCacheKey).catch(
          () => null
        );
        if (staleFallback && !res.headersSent) {
          res.status(staleFallback.statusCode);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('X-Mola-Cache', 'STALE-FALLBACK');
          res.send(staleFallback.payloadJson);
          return;
        }
      }
      if (!res.headersSent) {
        const message =
          err instanceof Error ? err.message : 'Upstream API gateway error';
        res.status(502).json({ success: false, error: message });
      }
    }
  });

  const ALLOWED_PROXY_HOSTS =
    /(^|\.)(molatv\.id|assetsy\.de|playcdn\.de|videonode\.de|netshort\.com|dramaboxdb\.com|dramabox\.com|hwztchapter\.com|anyreel\.app|fizzopic\.org|melolostatic\.com|vidivo\.me|shortswave\.com|meloshort\.com|petadrama\.com|wolftv\.online|ibyteimg\.com|bytedrama\.com|bytedance\.com|kalostv\.com|stardusttv\.cc|stardust-tv\.com|miniepisode\.media|aliyuncs\.com|ydstatic\.com|cloudfront\.net|my-drama\.tv|kjcdn\.com|drt768\.com|cdreader\.com|blinkdrama\.life|shorttv\.live|wetvinfo\.com|cubetv\.cc|janzhoutec\.com|flareflow\.tv|nsstorage\.space|freeshort\.xyz|toonshort\.com|tqshort\.com|dramadash\.app|cloudflarestream\.com|storyreel\.life|vibeshort\.live|farsunpteltd\.com|mydramawave\.com|tiktokcdn\.com|flextv\.cc|vigloo\.com|idrama\.video|goodshort\.com|crazymaplestudios\.com|joyreels\.com|jinchuanlingyun\.com|cloudonward\.net|iqiyipic\.com|iqiyi\.com)$/i;
  const ALLOWED_HTTP_HOSTS =
    /(^|\.)(bytedrama\.com|bytedance\.com|iqiyipic\.com|iqiyi\.com)$/i;

  app.get('/api/proxy', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing url query parameter' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'Invalid target URL' });
      return;
    }

    const isAllowedProto =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ALLOWED_HTTP_HOSTS.test(parsed.hostname));

    if (!isAllowedProto || !ALLOWED_PROXY_HOSTS.test(parsed.hostname)) {
      res.status(403).json({ error: 'Target host is not permitted' });
      return;
    }

    const cacheHit = heicCache.get(parsed.toString());
    if (cacheHit && Date.now() < cacheHit.expiresAt) {
      res.status(200);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cacheHit.buf);
      return;
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        Accept: req.get('accept') || '*/*',
      };
      const rangeHeader = req.get('range');
      if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
      }
      if (parsed.hostname.endsWith('cdreader.com')) {
        upstreamHeaders.Referer = 'https://www.moboreels.com/';
        upstreamHeaders.Origin = 'https://www.moboreels.com';
      }

      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      const contentType =
        upstream.headers.get('content-type') || 'application/octet-stream';

      const isM3u8 =
        parsed.pathname.toLowerCase().endsWith('.m3u8') ||
        contentType.toLowerCase().includes('mpegurl');

      if (upstream.ok && isM3u8) {
        const rawPlaylist = await upstream.text();
        if (rawPlaylist.length > 0) {
          const wrapProxy = (target: string) => {
            try {
              const abs = new URL(target, parsed.toString()).toString();
              return `/api/proxy?url=${encodeURIComponent(abs)}`;
            } catch {
              return target;
            }
          };
          const rewritten = rawPlaylist
            .split('\n')
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
                  return `URI="${wrapProxy(uri)}"`;
                });
              }
              return wrapProxy(trimmed);
            })
            .join('\n');
          res.status(200);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'public, max-age=60');
          res.send(rewritten);
          return;
        }
      }

      const isHeic =
        contentType.toLowerCase().includes('image/heic') ||
        contentType.toLowerCase().includes('image/heif') ||
        parsed.pathname.toLowerCase().endsWith('.heic');

      if (upstream.ok && isHeic) {
        const bodyBuffer = Buffer.from(await upstream.arrayBuffer());
        if (bodyBuffer.length > 0) {
          try {
            const webpBuffer = await convertHeicToWebp(bodyBuffer);
            if (heicCache.size >= 150) {
              const firstKey = heicCache.keys().next().value;
              if (firstKey) heicCache.delete(firstKey);
            }
            heicCache.set(parsed.toString(), {
              buf: webpBuffer,
              expiresAt: Date.now() + 30 * 60 * 1000,
            });
            res.status(200);
            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(webpBuffer);
            return;
          } catch {
            res.status(upstream.status);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(bodyBuffer);
            return;
          }
        }
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges');
      const contentLength = upstream.headers.get('content-length');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentType.startsWith('image/')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=120');
      }

      if (upstream.body) {
        pipeWebStreamToExpress(
          upstream.body,
          req,
          res,
          'Upstream proxy stream interrupted'
        );
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      if (!res.headersSent) {
        const message =
          err instanceof Error ? err.message : 'Upstream proxy request failed';
        res.status(502).json({ error: message });
      }
    }
  });

  const getDefaultOgBuffer = async (): Promise<{
    buf: Buffer;
    contentType: string;
  }> => {
    if (cachedDefaultOgResult) return cachedDefaultOgResult;
    const candidatePaths = [
      path.resolve(
        rootDir,
        'public',
        'assets',
        'aistudio',
        'file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png'
      ),
      path.resolve(rootDir, 'public', 'assets', 'aistudio', 'kano-drama-og.png'),
      path.resolve(
        rootDir,
        'public',
        'assets',
        'aistudio',
        'file_0000000027f88211b231721fd0cab2ca_7e42e8fd.png'
      ),
      path.resolve(rootDir, 'public', 'assets', 'aistudio', 'gambar_OG_39d1f12c.png'),
    ];
    for (const candidatePath of candidatePaths) {
      if (!fs.existsSync(candidatePath)) continue;
      const rawBuf = fs.readFileSync(candidatePath);
      if (rawBuf.length === 0) continue;
      try {
        const jpegBuf = await convertImageBufferToOgJpeg(rawBuf);
        cachedDefaultOgResult = { buf: jpegBuf, contentType: 'image/jpeg' };
        return cachedDefaultOgResult;
      } catch {
        const detected = detectImageMimeType(rawBuf);
        if (detected) {
          cachedDefaultOgResult = { buf: rawBuf, contentType: detected };
          return cachedDefaultOgResult;
        }
      }
    }
    return { buf: Buffer.alloc(0), contentType: 'image/jpeg' };
  };

  // Pre-warm default OG 1200x630 JPEG in background so first crawler hit is instant
  void getDefaultOgBuffer().catch(() => {});

  // Dedicated OpenGraph 1200x630 JPEG Endpoint (/api/og) for WhatsApp, Facebook & X link previews
  app.get('/api/og', async (req: Request, res: Response) => {
    const sendOgImage = (buf: Buffer, contentType: string) => {
      const actualMime = detectImageMimeType(buf) || contentType || 'image/jpeg';
      res.status(200);
      res.setHeader('Content-Type', actualMime);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        'public, max-age=86400, stale-while-revalidate=604800'
      );
      res.setHeader('Content-Length', String(buf.length));
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.send(buf);
    };

    const unwrapOgTargetUrl = (rawInput: string): string => {
      let current = (rawInput || '').trim();
      for (let depth = 0; depth < 3; depth += 1) {
        if (!current) return '';
        if (current.startsWith('//')) {
          current = `https:${current}`;
          continue;
        }
        if (current.startsWith('/api/proxy?') || current.startsWith('/api/og?')) {
          try {
            const parsed = new URL(current, 'https://kano-drama.xyz');
            const inner = parsed.searchParams.get('url');
            if (inner) {
              current = inner.trim();
              continue;
            }
          } catch {
            return current;
          }
        }
        if (current.startsWith('http://') || current.startsWith('https://')) {
          try {
            const parsed = new URL(current);
            if (
              (parsed.pathname === '/api/proxy' || parsed.pathname === '/api/og') &&
              parsed.searchParams.get('url')
            ) {
              current = parsed.searchParams.get('url')!.trim();
              continue;
            }
          } catch {
            return current;
          }
        }
        break;
      }
      return current;
    };

    const reqHost = (
      (req.headers['x-forwarded-host'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.get('host') ||
      ''
    )
      .split(':')[0]
      .toLowerCase();

    let targetUrl = unwrapOgTargetUrl(
      typeof req.query.url === 'string' ? req.query.url : ''
    );

    // If URL points to our own static public assets, resolve directly to local path (skip self-HTTP fetch)
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      try {
        const parsedSelf = new URL(targetUrl);
        const host = parsedSelf.hostname.toLowerCase();
        const isOwnHost =
          host === 'kano-drama.xyz' ||
          host === 'www.kano-drama.xyz' ||
          (reqHost && host === reqHost);
        if (isOwnHost && parsedSelf.pathname.startsWith('/')) {
          targetUrl = parsedSelf.pathname;
        }
      } catch {
        // ignore
      }
    }

    const cacheKey = targetUrl || '__default_og__';
    const cached = ogImageCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      sendOgImage(cached.buf, cached.contentType);
      return;
    }

    const readLocalPublicAsset = (relPath: string): Buffer | null => {
      const publicDir = path.resolve(rootDir, 'public');
      const normalizedRel = decodeURIComponent(relPath.split('?')[0] || '').replace(
        /^\/+/,
        ''
      );
      if (!normalizedRel) return null;
      const candidatePath = path.resolve(publicDir, normalizedRel);
      if (
        candidatePath.startsWith(publicDir + path.sep) &&
        fs.existsSync(candidatePath) &&
        fs.statSync(candidatePath).isFile()
      ) {
        return fs.readFileSync(candidatePath);
      }
      return null;
    };

    const fetchRemotePosterBuffer = async (parsed: URL): Promise<Buffer | null> => {
      const buildHeaders = (referer?: string): Record<string, string> => {
        const headers: Record<string, string> = {
          Accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        };
        if (referer) {
          headers.Referer = referer;
        }
        return headers;
      };

      const defaultReferer = parsed.hostname.endsWith('cdreader.com')
        ? 'https://www.moboreels.com/'
        : parsed.hostname.includes('iqiyi')
        ? 'https://www.iq.com/'
        : undefined;

      const attemptFetch = async (referer?: string): Promise<Buffer | null> => {
        const upstream = await fetch(parsed.toString(), {
          method: 'GET',
          headers: buildHeaders(referer),
          redirect: 'follow',
          signal: AbortSignal.timeout(4500),
        });
        if (!upstream.ok) return null;
        const ct = (upstream.headers.get('content-type') || '').toLowerCase();
        if (
          ct.includes('text/html') ||
          ct.includes('application/json') ||
          ct.includes('application/xml') ||
          ct.includes('image/svg+xml')
        ) {
          return null;
        }
        const arr = await upstream.arrayBuffer();
        if (arr.byteLength === 0 || arr.byteLength > 10 * 1024 * 1024) {
          return null;
        }
        const buf = Buffer.from(arr);
        return isSupportedImageOrHeicBuffer(buf) ? buf : null;
      };

      const first = await attemptFetch(defaultReferer).catch(() => null);
      if (first) return first;

      // Retry once with target origin referer or without referer if hotlink blocked
      const fallbackReferer = defaultReferer ? undefined : `${parsed.origin}/`;
      return attemptFetch(fallbackReferer).catch(() => null);
    };

    try {
      let sourceBuf: Buffer | null = null;

      if (targetUrl && targetUrl.startsWith('/')) {
        sourceBuf = readLocalPublicAsset(targetUrl);
      } else if (targetUrl) {
        try {
          const parsed = new URL(targetUrl);
          if (isSafePublicHttpUrl(parsed)) {
            sourceBuf = await fetchRemotePosterBuffer(parsed);
          }
        } catch {
          sourceBuf = null;
        }
      }

      if (sourceBuf && sourceBuf.length > 0) {
        let outBuf: Buffer | null = null;
        let outMime = 'image/jpeg';
        try {
          outBuf = await convertImageBufferToOgJpeg(sourceBuf);
        } catch {
          const detected = detectImageMimeType(sourceBuf);
          if (detected === 'image/jpeg' || detected === 'image/png' || detected === 'image/webp') {
            outBuf = sourceBuf;
            outMime = detected;
          }
        }

        if (outBuf && outBuf.length > 0) {
          if (ogImageCache.size >= 250) {
            const oldest = ogImageCache.keys().next().value;
            if (oldest) ogImageCache.delete(oldest);
          }
          ogImageCache.set(cacheKey, {
            buf: outBuf,
            contentType: outMime,
            expiresAt: Date.now() + 6 * 60 * 60 * 1000,
          });
          sendOgImage(outBuf, outMime);
          return;
        }
      }
    } catch {
      // Fall through cleanly to default brand OG JPEG
    }

    const fallback = await getDefaultOgBuffer();
    if (fallback.buf.length > 0) {
      sendOgImage(fallback.buf, fallback.contentType);
      return;
    }
    res.status(404).end();
  });

  // --- HMAC-SHA256 Signed Video Stream Security ---

  const streamSigningSecret =
    process.env.STREAM_SIGNING_SECRET ||
    crypto
      .createHash('sha256')
      .update(`${process.env.MOLA_API_TOKEN || 'kanodrama-dev'}|stream-guard-v1`)
      .digest('hex');

  const signStreamToken = (targetUrl: string, uid: string, ttlMs = 2 * 60 * 60 * 1000) => {
    const exp = Date.now() + ttlMs;
    const payloadJson = JSON.stringify({ u: targetUrl, e: exp, a: uid.slice(0, 64) });
    const payloadB64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', streamSigningSecret)
      .update(payloadB64)
      .digest('base64url');
    return { token: `${payloadB64}.${sig}`, exp };
  };

  const verifyStreamToken = (
    rawToken: string
  ): { url: string; exp: number; actor: string } | null => {
    const parts = rawToken.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, providedSig] = parts;
    if (!payloadB64 || !providedSig) return null;
    const expectedSig = crypto
      .createHmac('sha256', streamSigningSecret)
      .update(payloadB64)
      .digest('base64url');
    const bufA = Buffer.from(providedSig, 'utf-8');
    const bufB = Buffer.from(expectedSig, 'utf-8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return null;
    }
    try {
      const parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8')
      ) as { u?: string; e?: number; a?: string };
      if (!parsed.u || !parsed.e || Date.now() > parsed.e) {
        return null;
      }
      return { url: parsed.u, exp: parsed.e, actor: parsed.a || 'guest' };
    } catch {
      return null;
    }
  };

  app.post('/api/stream/sign', (req: Request, res: Response) => {
    const rawUrl = cleanText(req.body?.url);
    const uid = cleanText(req.body?.uid, 'guest');
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing stream url' });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid stream url' });
      return;
    }
    const isAllowedProto =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ALLOWED_HTTP_HOSTS.test(parsed.hostname));
    if (!isAllowedProto || !ALLOWED_PROXY_HOSTS.test(parsed.hostname)) {
      res.status(403).json({ ok: false, error: 'Target stream host not permitted' });
      return;
    }
    const { token, exp } = signStreamToken(parsed.toString(), uid);
    res.json({
      ok: true,
      signedUrl: `/api/stream?st=${encodeURIComponent(token)}`,
      expiresAt: exp,
    });
  });

  app.options('/api/stream', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges'
    );
    res.status(204).end();
  });

  app.get('/api/stream', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges'
    );
    const rawToken = typeof req.query.st === 'string' ? req.query.st.trim() : '';
    if (!rawToken) {
      res.status(401).json({ error: 'Missing signed stream token' });
      return;
    }
    const verified = verifyStreamToken(rawToken);
    if (!verified) {
      res.status(403).json({ error: 'Invalid or expired stream token' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(verified.url);
    } catch {
      res.status(400).json({ error: 'Malformed target stream URL' });
      return;
    }
    const isAllowedProto =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ALLOWED_HTTP_HOSTS.test(parsed.hostname));
    if (!isAllowedProto || !ALLOWED_PROXY_HOSTS.test(parsed.hostname)) {
      res.status(403).json({ error: 'Target host is not permitted' });
      return;
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        Accept: req.get('accept') || '*/*',
      };
      const rangeHeader = req.get('range');
      if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
      }
      if (parsed.hostname.endsWith('cdreader.com')) {
        upstreamHeaders.Referer = 'https://www.moboreels.com/';
        upstreamHeaders.Origin = 'https://www.moboreels.com';
      }

      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      const contentType =
        upstream.headers.get('content-type') || 'application/octet-stream';

      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Accept-Ranges'
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');

      const isM3u8 =
        parsed.pathname.toLowerCase().endsWith('.m3u8') ||
        contentType.toLowerCase().includes('mpegurl');

      if (upstream.ok && isM3u8) {
        const rawPlaylist = await upstream.text();
        if (rawPlaylist.length > 0) {
          const wrapSigned = (target: string) => {
            try {
              const abs = new URL(target, parsed.toString()).toString();
              const { token } = signStreamToken(abs, verified.actor);
              return `/api/stream?st=${encodeURIComponent(token)}`;
            } catch {
              return target;
            }
          };
          const rewritten = rawPlaylist
            .split('\n')
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
                  return `URI="${wrapSigned(uri)}"`;
                });
              }
              return wrapSigned(trimmed);
            })
            .join('\n');
          res.status(200);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.send(rewritten);
          return;
        }
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges');
      const contentLength = upstream.headers.get('content-length');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      if (upstream.body) {
        pipeWebStreamToExpress(
          upstream.body,
          req,
          res,
          'Signed stream connection interrupted'
        );
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Signed stream proxy failed',
        });
      }
    }
  });

  // --- PostgreSQL Persistent User, Community & Analytics Endpoints ---

  app.get('/api/auth/gmail-stats', async (_req: Request, res: Response) => {
    try {
      const dbCount = await getUniqueGmailLoginCountFromDb();
      const uniqueGmailLogins =
        dbCount !== null
          ? Math.max(dbCount, memoryGmailTotalLogins)
          : memoryGmailTotalLogins;
      if (dbCount !== null && dbCount > memoryGmailTotalLogins) {
        memoryGmailTotalLogins = dbCount;
        saveFallbackGmailLoginsToDisk();
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        uniqueGmailLogins,
        source: dbCount !== null ? 'postgresql' : 'memory',
      });
    } catch (err) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        uniqueGmailLogins: memoryGmailTotalLogins,
        source: 'memory',
        fallbackReason:
          err instanceof Error ? err.message : 'Database stats unavailable',
      });
    }
  });

  app.post('/api/users/sync', async (req: Request, res: Response) => {
    try {
      let uid = cleanText(req.body?.uid);
      let email = cleanText(req.body?.email).toLowerCase();
      let emailVerified = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const isLoginEvent = Boolean(req.body?.isLoginEvent);

      const authHeader = req.get('authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

      if (bearerToken) {
        const verified = await verifyFirebaseGoogleIdToken(bearerToken);
        if (verified.status === 'invalid') {
          res.status(401).json({ ok: false, error: 'Invalid Firebase ID token' });
          return;
        }
        if (verified.status === 'verified' && verified.uid) {
          uid = verified.uid;
          if (verified.email) {
            email = verified.email;
          }
          emailVerified = Boolean(verified.emailVerified || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        }
      }

      if (!uid) {
        res.status(400).json({ ok: false, error: 'Missing uid' });
        return;
      }

      const synced = await syncUserInDb({
        uid,
        email,
        displayName: cleanText(req.body?.displayName, 'Kano Viewer'),
        photoURL: cleanText(req.body?.photoURL) || null,
        avatarInitials: cleanText(req.body?.avatarInitials, 'KD'),
        avatarColor: cleanText(req.body?.avatarColor, '#EF4444'),
        visitDate: cleanText(req.body?.visitDate) || undefined,
      });

      const accountKey = buildGmailAccountKey(uid, email);
      const dbCount = await recordGmailLoginInDb({
        uid,
        email,
        emailVerified,
        isLoginEvent,
      });

      if (accountKey) {
        const prevAccountCount = memoryGmailAccountCounts.get(accountKey) || 0;
        if (isLoginEvent) {
          memoryGmailAccountCounts.set(accountKey, prevAccountCount + 1);
          memoryGmailTotalLogins =
            dbCount !== null
              ? Math.max(dbCount, memoryGmailTotalLogins + 1)
              : memoryGmailTotalLogins + 1;
        } else if (!memoryGmailAccountCounts.has(accountKey)) {
          memoryGmailAccountCounts.set(accountKey, 1);
          memoryGmailTotalLogins =
            dbCount !== null
              ? Math.max(dbCount, memoryGmailTotalLogins + 1)
              : memoryGmailTotalLogins + 1;
        } else if (dbCount !== null && dbCount > memoryGmailTotalLogins) {
          memoryGmailTotalLogins = dbCount;
        }
        saveFallbackGmailLoginsToDisk();
      } else if (dbCount !== null && dbCount > memoryGmailTotalLogins) {
        memoryGmailTotalLogins = dbCount;
        saveFallbackGmailLoginsToDisk();
      }

      const gmailLoginCount =
        dbCount !== null
          ? Math.max(dbCount, memoryGmailTotalLogins)
          : memoryGmailTotalLogins;

      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, user: synced, gmailLoginCount });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to sync user',
      });
    }
  });

  app.patch('/api/users/profile', async (req: Request, res: Response) => {
    try {
      const uid = cleanText(req.body?.uid);
      if (!uid) {
        res.status(400).json({ ok: false, error: 'Missing uid' });
        return;
      }
      const updated = await updateUserProfileInDb({
        uid,
        displayName:
          typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
        bio: typeof req.body?.bio === 'string' ? req.body.bio : undefined,
        preferredLanguage:
          typeof req.body?.preferredLanguage === 'string'
            ? req.body.preferredLanguage
            : undefined,
        preferences:
          req.body?.preferences && typeof req.body.preferences === 'object'
            ? (req.body.preferences as Record<string, unknown>)
            : undefined,
      });
      res.json({ ok: true, user: updated });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to update profile',
      });
    }
  });

  app.get('/api/users/:uid', async (req: Request, res: Response) => {
    try {
      const uid = cleanText(String(req.params.uid || ''));
      if (!uid) {
        res.status(400).json({ ok: false, error: 'Missing uid' });
        return;
      }
      const user = await getUserFromDb(uid);
      if (!user) {
        res.status(404).json({ ok: false, error: 'User not found' });
        return;
      }
      res.json({ ok: true, user });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load user',
      });
    }
  });

  // --- Watch History Cloud Sync ---

  app.get('/api/watch-history', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.query.userId);
      if (!userId) {
        res.status(400).json({ ok: false, error: 'Missing userId' });
        return;
      }
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
      const items = await listWatchHistoryFromDb(userId, limit);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load watch history',
      });
    }
  });

  app.post('/api/watch-history', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBox');
      if (!userId || !dramaId) {
        res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
        return;
      }
      const saved = await upsertWatchHistoryInDb({
        userId,
        dramaId,
        provider,
        mediaType:
          req.body?.mediaType === 'movie' ||
          provider === 'LK21' ||
          provider === 'LookSeries'
            ? 'movie'
            : 'drama',
        episodeNumber: Math.max(1, Number(req.body?.episodeNumber ?? req.body?.episode) || 1),
        currentTime: Math.max(0, Number(req.body?.currentTime) || 0),
        duration: Math.max(0, Number(req.body?.duration) || 0),
        progress: Math.min(100, Math.max(0, Number(req.body?.progress) || 0)),
        drama:
          req.body?.drama && typeof req.body.drama === 'object'
            ? (req.body.drama as Record<string, unknown>)
            : {},
      });
      res.json({ ok: true, saved });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save watch history',
      });
    }
  });

  app.delete('/api/watch-history', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.query.userId ?? req.body?.userId);
      const dramaId = cleanText(req.query.dramaId ?? req.body?.dramaId);
      const provider = cleanText(req.query.provider ?? req.body?.provider) || undefined;
      if (!userId || !dramaId) {
        res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
        return;
      }
      const deleted = await deleteWatchHistoryInDb(userId, dramaId, provider);
      res.json({ ok: true, deleted });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to delete watch history',
      });
    }
  });

  // --- Advanced Multi-Filter Catalog Discovery ---

  app.get('/api/catalog/filter', async (req: Request, res: Response) => {
    try {
      const genre = cleanText(req.query.genre);
      const status = cleanText(req.query.status, 'all');
      const sort = cleanText(req.query.sort, 'popular');
      const provider = cleanText(req.query.provider, 'All');
      const q = cleanText(req.query.q);
      const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      let result = await filterCatalogFromDb({
        genre,
        status,
        sort,
        provider,
        q,
        limit,
        offset,
      });

      if (result.total === 0 && offset === 0) {
        const seededCount = await seedCatalogFromExistingCacheIfEmpty();
        if (seededCount > 0) {
          result = await filterCatalogFromDb({
            genre,
            status,
            sort,
            provider,
            q,
            limit,
            offset,
          });
        }
      }

      const [enrichedItems, statsMap] = [
        result.items,
        await getTrendingStatsMapFromDb(250),
      ];
      const itemsWithBadges = attachLiveBadgesToItems(
        enrichedItems as unknown as CachedDramaItem[],
        statsMap
      );

      res.json({
        ok: true,
        items: itemsWithBadges,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to filter catalog',
      });
    }
  });

  // --- Programmatic SEO Landing Data Endpoint ---
  app.get('/api/seo/landing', async (req: Request, res: Response) => {
    try {
      const slug = cleanText(req.query.slug, 'romance');
      const modifier = cleanText(req.query.modifier) || undefined;
      const basePathRaw = cleanText(req.query.basePath, 'genre');
      const basePath: 'genre' | 'tag' | 'category' =
        basePathRaw === 'tag' || basePathRaw === 'category' ? basePathRaw : 'genre';
      const landing = resolveProgrammaticLanding(slug, basePath, modifier);

      const overrideStatus = cleanText(req.query.status) || landing.filter.status || 'all';
      const overrideSort = cleanText(req.query.sort) || landing.filter.sort || 'popular';
      const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));

      let result = await filterCatalogFromDb({
        genre: landing.filter.genre,
        status: overrideStatus,
        sort: overrideSort,
        q: landing.filter.q,
        limit,
        offset: 0,
      });

      if (result.items.length === 0 && (landing.filter.genre || landing.filter.q)) {
        result = await filterCatalogFromDb({
          genre: landing.filter.genre,
          status: overrideStatus,
          sort: overrideSort,
          limit,
          offset: 0,
        });
      }

      if (result.total === 0) {
        await seedCatalogFromExistingCacheIfEmpty();
        result = await filterCatalogFromDb({
          genre: landing.filter.genre,
          status: overrideStatus,
          sort: overrideSort,
          limit,
          offset: 0,
        });
      }

      const statsMap = await getTrendingStatsMapFromDb(250);
      const itemsWithBadges = attachLiveBadgesToItems(
        result.items as unknown as CachedDramaItem[],
        statsMap
      );

      res.json({
        ok: true,
        landing,
        items: itemsWithBadges,
        total: result.total,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load SEO landing catalog',
      });
    }
  });

  // --- Google Indexing API Automation Endpoints ---
  app.get('/api/seo/indexing/status', async (req: Request, res: Response) => {
    try {
      const summary = await getGoogleIndexingStatus(resolveOrigin(req));
      res.json({ ok: true, ...summary });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load Google indexing status',
      });
    }
  });

  app.post('/api/seo/indexing/ping', async (req: Request, res: Response) => {
    try {
      const origin = resolveOrigin(req);
      const force = Boolean(req.body?.force);
      const singleUrl = cleanText(req.body?.url);
      const urlList = Array.isArray(req.body?.urls)
        ? (req.body.urls as unknown[]).map((u) => cleanText(u)).filter(Boolean)
        : [];
      const batchRecent = Boolean(req.body?.batchRecent) || (!singleUrl && urlList.length === 0);
      const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 15));

      const targets: Array<{
        url: string;
        entityType: 'drama' | 'episode' | 'genre' | 'page';
        entityId: string;
        provider: string;
        action: 'URL_UPDATED' | 'URL_DELETED';
      }> = [];

      const action: 'URL_UPDATED' | 'URL_DELETED' =
        req.body?.action === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED';

      if (singleUrl) {
        const absUrl = singleUrl.startsWith('/') ? `${origin}${singleUrl}` : singleUrl;
        targets.push({
          url: absUrl,
          entityType: absUrl.includes('/watch/') || absUrl.includes('?ep=') ? 'episode' : absUrl.includes('/genre/') ? 'genre' : 'drama',
          entityId: cleanText(req.body?.dramaId),
          provider: cleanText(req.body?.provider, 'KanoDrama'),
          action,
        });
      }

      for (const rawU of urlList) {
        const absUrl = rawU.startsWith('/') ? `${origin}${rawU}` : rawU;
        targets.push({
          url: absUrl,
          entityType: absUrl.includes('/watch/') || absUrl.includes('?ep=') ? 'episode' : absUrl.includes('/genre/') ? 'genre' : 'drama',
          entityId: '',
          provider: 'KanoDrama',
          action,
        });
      }

      if (batchRecent && targets.length === 0) {
        const recentDramas = await listCatalogForSitemapFromDb(limit);
        for (const d of recentDramas) {
          targets.push({
            url: `${origin}/${getProviderRouteSlug(d.provider)}/detail/${encodeURIComponent(d.slug)}`,
            entityType: 'drama',
            entityId: d.dramaId,
            provider: d.provider,
            action,
          });
        }
      }

      const results = await notifyGoogleIndexingUrls(targets, {
        fallbackOrigin: origin,
        force,
        maxBatchSize: limit,
      });

      res.json({
        ok: true,
        submittedCount: results.filter((r) => r.status === 'submitted').length,
        queuedCount: results.filter((r) => r.status === 'queued_unconfigured').length,
        skippedCount: results.filter((r) => r.status === 'skipped_recent').length,
        results,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to ping Google Indexing API',
      });
    }
  });

  // --- Clean SEO Slug Resolver ---

  app.get('/api/drama/resolve', async (req: Request, res: Response) => {
    try {
      const slug = cleanText(req.query.slug);
      const bookIdParam = cleanText(
        req.query.bookId ?? req.query.book_id ?? req.query.id
      );
      const rawProvider = cleanText(req.query.provider);
      const providerHint = rawProvider ? parseSsrProviderName(rawProvider) : undefined;
      if (!slug && !bookIdParam) {
        res.status(400).json({ ok: false, error: 'Missing slug or bookId query parameter' });
        return;
      }

      if (slug) {
        const dbHit = await resolveDramaBySlugFromDb(slug, providerHint);
        if (dbHit) {
          res.json({
            ok: true,
            dramaId: dbHit.dramaId,
            provider: dbHit.provider,
            slug: dbHit.slug,
            drama: {
              ...dbHit.drama,
              bookId: dbHit.dramaId,
              provider: dbHit.provider,
              slug: dbHit.slug,
            },
          });
          return;
        }

        const homeHit =
          (await findDramaBySlugInHomeCache(slug)) ||
          (await findDramaBySlugInApiCache(slug));

        if (homeHit) {
          res.json({
            ok: true,
            dramaId: homeHit.bookId,
            provider: homeHit.provider,
            slug: homeHit.slug || slugifyTitle(homeHit.title),
            drama: homeHit,
          });
          return;
        }
      }

      if (bookIdParam) {
        const dbById = await resolveDramaBySlugFromDb(bookIdParam, providerHint);
        if (dbById) {
          res.json({
            ok: true,
            dramaId: dbById.dramaId,
            provider: dbById.provider,
            slug: dbById.slug,
            drama: {
              ...dbById.drama,
              bookId: dbById.dramaId,
              provider: dbById.provider,
              slug: dbById.slug,
            },
          });
          return;
        }
        const ssrById = await fetchDramaForSsr(
          bookIdParam,
          providerHint ?? 'DramaBox'
        );
        if (ssrById.drama) {
          const resolvedSlug = ssrById.drama.slug || slugifyTitle(ssrById.drama.title);
          res.json({
            ok: true,
            dramaId: bookIdParam,
            provider: ssrById.drama.provider,
            slug: resolvedSlug,
            drama: { ...ssrById.drama, slug: resolvedSlug },
          });
          return;
        }
      }

      if (slug) {
        const searchHit = await searchUpstreamDramaBySlug(
          getMolaToken(),
          slug,
          providerHint
        );
        if (searchHit) {
          res.json({
            ok: true,
            dramaId: searchHit.bookId,
            provider: searchHit.provider,
            slug: searchHit.slug || slugifyTitle(searchHit.title),
            drama: searchHit,
          });
          return;
        }
      }

      res.status(404).json({ ok: false, error: 'Drama slug not found' });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to resolve drama slug',
      });
    }
  });

  app.get('/api/comments', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.query.userId);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      if (userId) {
        const result = await listUserCommentsFromDb(userId, limit, offset);
        res.json({ ok: true, ...result, limit, offset });
        return;
      }

      const dramaId = cleanText(req.query.dramaId);
      const provider = cleanText(req.query.provider, 'DramaBox');
      const episode = Math.max(1, Number(req.query.episode) || 1);
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'Missing dramaId query parameter' });
        return;
      }
      const result = await listCommentsFromDb(dramaId, provider, episode, limit, offset);
      res.json({ ok: true, ...result, limit, offset });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to fetch comments',
      });
    }
  });

  app.post('/api/comments', async (req: Request, res: Response) => {
    try {
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBox');
      const episodeNumber = Math.max(1, Number(req.body?.episodeNumber) || 1);
      const content = cleanText(req.body?.text ?? req.body?.content);
      const authorName = cleanText(req.body?.authorName ?? req.body?.author, 'Viewer');
      if (!dramaId || !content) {
        res.status(400).json({ ok: false, error: 'dramaId and text are required' });
        return;
      }
      const id =
        cleanText(req.body?.id) ||
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const videoTimestampSec = Math.max(
        0,
        Math.floor(Number(req.body?.videoTimestampSec) || 0)
      );
      const comment = await createCommentInDb({
        id,
        dramaId,
        provider,
        episodeNumber,
        userId: cleanText(req.body?.userId ?? req.body?.authorUid) || undefined,
        authorName,
        authorEmail: cleanText(req.body?.authorEmail) || undefined,
        authorPhotoURL: cleanText(req.body?.authorPhotoURL) || null,
        authorBadge: cleanText(req.body?.authorBadge) || undefined,
        authorInitials: cleanText(req.body?.authorInitials) || undefined,
        authorColor: cleanText(req.body?.authorColor) || undefined,
        content,
        videoTimestampSec,
      });
      res.status(201).json({ ok: true, comment });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to create comment',
      });
    }
  });

  app.get('/api/likes', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.query.userId);
      if (!userId) {
        res.status(400).json({ ok: false, error: 'Missing userId' });
        return;
      }
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const result = await listLikesFromDb(userId, limit, offset);
      res.json({ ok: true, ...result, limit, offset });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load likes',
      });
    }
  });

  app.get('/api/likes/status', async (req: Request, res: Response) => {
    try {
      const dramaId = cleanText(req.query.dramaId);
      const provider = cleanText(req.query.provider, 'DramaBox');
      const userId = cleanText(req.query.userId);
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      const stats = await getDramaStatsFromDb(dramaId, provider, userId || undefined);
      res.json({
        ok: true,
        dramaId,
        provider,
        liked: Boolean(stats.userLiked),
        likesCount: stats.likesCount,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load like status',
      });
    }
  });

  app.post('/api/likes/toggle', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBox');
      if (!userId || !dramaId) {
        res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
        return;
      }
      const result = await toggleLikeInDb(userId, dramaId, provider);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to toggle like',
      });
    }
  });

  app.get('/api/favorites', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.query.userId);
      if (!userId || userId.startsWith('v-')) {
        res.status(401).json({ ok: false, error: 'Authentication required to view Movie Watchlist' });
        return;
      }
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const mediaTypeRaw = cleanText(req.query.mediaType);
      const mediaType: 'movie' | 'drama' | undefined =
        mediaTypeRaw === 'movie' || mediaTypeRaw === 'drama' ? mediaTypeRaw : undefined;
      const result = await listFavoritesFromDb(userId, limit, offset, mediaType);
      res.json({ ok: true, ...result, limit, offset });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load favorites',
      });
    }
  });

  app.post('/api/favorites/toggle', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'LK21');
      if (!userId || userId.startsWith('v-')) {
        res.status(401).json({ ok: false, error: 'Authentication required to save to Movie Watchlist' });
        return;
      }
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      const dramaObj =
        req.body?.drama && typeof req.body.drama === 'object'
          ? (req.body.drama as Record<string, unknown>)
          : undefined;
      const mediaTypeRaw = cleanText(req.body?.mediaType);
      const mediaType: 'movie' | 'drama' | undefined =
        mediaTypeRaw === 'movie' || mediaTypeRaw === 'drama' ? mediaTypeRaw : undefined;
      const result = await toggleFavoriteInDb({
        userId,
        dramaId,
        provider,
        mediaType,
        folderId: cleanText(req.body?.folderId, 'all'),
        title: cleanText(req.body?.title ?? dramaObj?.title),
        cover: cleanText(req.body?.cover ?? dramaObj?.cover),
        drama: dramaObj,
        forceSave: Boolean(req.body?.forceSave),
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to toggle favorite',
      });
    }
  });

  app.patch('/api/favorites/folder', async (req: Request, res: Response) => {
    try {
      const userId = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'LK21');
      const folderId = cleanText(req.body?.folderId, 'all');
      if (!userId || userId.startsWith('v-')) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      const updated = await updateFavoriteFolderInDb(userId, dramaId, provider, folderId);
      res.json({ ok: true, updated, folderId });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to update folder',
      });
    }
  });

  app.post('/api/stats/view', async (req: Request, res: Response) => {
    try {
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBox');
      const episodeNumber = Math.max(1, Number(req.body?.episodeNumber) || 1);
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      if (isDatabaseEnabled()) {
        const result = await recordVideoViewInDb(dramaId, provider, episodeNumber);
        cumulativeViews = Math.max(
          cumulativeViews,
          toSafeVisitorInt(result.siteTotalViews)
        );
        res.json({ ok: true, ...result });
        return;
      }
      cumulativeViews += 1;
      scheduleFallbackVisitorStatsSave();
      res.json({
        ok: true,
        dailyViews: 1,
        totalViews: 1,
        siteTotalViews: cumulativeViews,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to record view',
      });
    }
  });

  app.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const dramaId = cleanText(req.query.dramaId);
      const provider = cleanText(req.query.provider, 'DramaBox');
      const userId = cleanText(req.query.userId);
      if (dramaId) {
        const stats = await getDramaStatsFromDb(dramaId, provider, userId || undefined);
        res.json({ ok: true, stats });
        return;
      }
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const top = await getTopDailyStatsFromDb(limit, offset);
      res.json({ ok: true, items: top, limit, offset });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load stats',
      });
    }
  });

  app.get('/api/stats/badges', async (_req: Request, res: Response) => {
    try {
      const stats = await getTrendingStatsMapFromDb(250);
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json({ ok: true, stats });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load live trending badges',
      });
    }
  });

  const getCurrentReadOnlyVisitorStats = async (wibDay: string) => {
    try {
      const stats = await getSiteVisitorStatsFromDb();
      if (stats) {
        todayUniqueVisitors = Math.max(todayUniqueVisitors, stats.todayVisitors);
        cumulativeVisitors = Math.max(cumulativeVisitors, stats.totalVisitors);
        cumulativeViews = Math.max(cumulativeViews, stats.totalViews);
        return normalizeVisitorStatsResponse(stats);
      }
    } catch {
      // Fallback below
    }
    const uniqueOnline = new Set(
      Array.from(activeSessions.values()).map((v) => v.visitorId)
    ).size;
    return normalizeVisitorStatsResponse({
      onlineNow: uniqueOnline,
      todayVisitors: todayUniqueVisitors,
      totalVisitors: cumulativeVisitors,
      totalViews: cumulativeViews,
      dayKey: currentDayKey || wibDay,
    });
  };

  const sanitizeTrackingId = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    const cleaned = raw.trim().replace(/[^a-zA-Z0-9._:-]/g, '');
    if (cleaned.length < 4) return '';
    return cleaned.slice(0, 128);
  };

  app.get('/api/visitors/stats', async (_req: Request, res: Response) => {
    const wibDay = syncJakartaDayRollover();
    res.setHeader('Cache-Control', 'no-store');
    const payload = await getCurrentReadOnlyVisitorStats(wibDay);
    res.json(payload);
  });

  app.post('/api/visitors/heartbeat', async (req: Request, res: Response) => {
    const now = Date.now();
    const wibDay = syncJakartaDayRollover(now);
    res.setHeader('Cache-Control', 'no-store');

    if (isBotOrAutomatedRequest(req)) {
      const payload = await getCurrentReadOnlyVisitorStats(wibDay);
      res.json({ ...payload, botFiltered: true });
      return;
    }

    const bodyObj =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const rawSid = sanitizeTrackingId(bodyObj.sessionId);
    const rawVid = sanitizeTrackingId(bodyObj.visitorId);

    // Require valid client session/visitor identifiers or fall back to deterministic IP+UA bucket
    const uaHash = crypto
      .createHash('sha256')
      .update(`${req.ip || 'local'}|${req.get('user-agent') || ''}`)
      .digest('hex')
      .slice(0, 20);
    const vid = rawVid || `v-ip-${uaHash}`;
    const sid = rawSid || `s-ip-${uaHash}`;

    activeSessions.set(sid, { visitorId: vid, lastSeen: now });

    // Cooldown per visitorId (30m) so opening multiple tabs concurrently doesn't inflate totalViews
    const lastViewTs = visitorLastViewAt.get(vid) ?? 0;
    const allowSessionView =
      !countedSessionViews.has(sid) && now - lastViewTs >= VISITOR_VIEW_COOLDOWN_MS;
    if (allowSessionView) {
      visitorLastViewAt.set(vid, now);
    }

    try {
      const persisted = await recordVisitorHeartbeatInDb(
        sid,
        vid,
        allowSessionView
      );
      if (persisted) {
        addBoundedSetItem(countedTodayVisitors, vid);
        addBoundedSetItem(countedAllTimeVisitors, vid);
        addBoundedSetItem(countedSessionViews, sid);
        todayUniqueVisitors = persisted.todayVisitors;
        cumulativeVisitors = persisted.totalVisitors;
        cumulativeViews = persisted.totalViews;
        res.json(normalizeVisitorStatsResponse(persisted));
        return;
      }
    } catch {
      // Fallback gracefully to in-memory + disk snapshot counters
    }

    let fallbackMutated = false;
    if (!countedTodayVisitors.has(vid)) {
      addBoundedSetItem(countedTodayVisitors, vid);
      todayUniqueVisitors += 1;
      fallbackMutated = true;
    }
    if (!countedAllTimeVisitors.has(vid)) {
      addBoundedSetItem(countedAllTimeVisitors, vid);
      cumulativeVisitors += 1;
      fallbackMutated = true;
    }
    if (allowSessionView && !countedSessionViews.has(sid)) {
      addBoundedSetItem(countedSessionViews, sid);
      cumulativeViews += 1;
      fallbackMutated = true;
    }
    if (fallbackMutated) {
      scheduleFallbackVisitorStatsSave();
    }

    const uniqueOnline = new Set(
      Array.from(activeSessions.values()).map((v) => v.visitorId)
    ).size;

    res.json(
      normalizeVisitorStatsResponse({
        onlineNow: uniqueOnline,
        todayVisitors: todayUniqueVisitors,
        totalVisitors: cumulativeVisitors,
        totalViews: cumulativeViews,
        dayKey: currentDayKey || wibDay,
      })
    );
  });

  app.post(
    '/api/visitors/leave',
    express.text({ type: 'text/plain', limit: '4kb' }),
    async (req: Request, res: Response) => {
      try {
        let rawSessionId: unknown = undefined;
        if (typeof req.body === 'string' && req.body.trim()) {
          try {
            const parsed = JSON.parse(req.body) as { sessionId?: unknown };
            rawSessionId = parsed?.sessionId;
          } catch {
            rawSessionId = undefined;
          }
        } else if (req.body && typeof req.body === 'object') {
          rawSessionId = (req.body as { sessionId?: unknown }).sessionId;
        }
        const sid = sanitizeTrackingId(rawSessionId);
        if (sid) {
          activeSessions.delete(sid);
          await removeActiveVisitorSessionInDb(sid).catch(() => false);
        }
      } catch {
        // Ignore malformed leave beacon
      }
      res.status(204).end();
    }
  );

  app.get('/llms.txt', (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    const curatedLinks = CURATED_PROGRAMMATIC_PAGES.slice(0, 12).map(
      (p) => `- [${p.label}](${origin}/genre/${encodeURIComponent(p.slug)}): ${p.description}`
    );

    const markdown = [
      '# KanoDrama',
      '',
      '> Watch free trending HD vertical short dramas, billionaire romance, revenge sagas, Asian mini-series, and full-length movies online on KanoDrama.',
      '',
      '## Primary Sections',
      `- [Home](${origin}/): Watch free featured spotlights, trending vertical short dramas, and latest releases.`,
      `- [Explore Catalog](${origin}/explore): Browse and watch free from the full multi-provider vertical drama catalog.`,
      `- [Providers Directory](${origin}/providers): Full directory of 49+ short drama providers to watch free across dedicated platform catalogs.`,
      `- [Trending Series](${origin}/trending): Watch free daily most-watched and top-ranked short dramas.`,
      `- [Latest Releases](${origin}/latest): Watch free newly added episodes and recent drama premieres.`,
      `- [VIP Selection](${origin}/vip): Watch free premium vertical drama series and complete boxsets.`,
      `- [Movies](${origin}/movies): Watch free full-length Asian & international cinema online in HD.`,
      '',
      '## Providers & Curated Collections',
      `- [Multi-Provider Hub](${origin}/providers): Streaming aggregation across ${Object.keys(PROVIDER_LOGO_PATHS).length}+ short drama providers including DramaBox, NetShort, Melolo, AnyReel, ReelShort, GoodShort, DramaWave, LK21 Movies, and LookSeries Movies.`,
      ...curatedLinks,
      '',
      '## Machine-Readable Catalog & Site Info',
      `- [AI Catalog JSON](${origin}/ai-catalog.json): Structured JSON metadata, collections, providers, and featured catalog index.`,
      `- [XML Sitemap](${origin}/sitemap.xml): Standard sitemap index for dramas, movies, and curated genres.`,
      `- [Robots Policy](${origin}/robots.txt): Crawler access rules and sitemap declarations.`,
      '',
    ].join('\n');

    res
      .status(200)
      .setHeader('Content-Type', 'text/markdown; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(markdown);
  });

  app.get('/ai-catalog.json', async (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    let featuredItems: Array<{
      id: string;
      title: string;
      provider: string;
      url: string;
      cover?: string;
      chapterCount?: number;
      description?: string;
    }> = [];

    try {
      const [cached, cachedMovies] = await Promise.all([
        getCachedDramasForSitemap(18),
        listMoviesForSitemapFromDb(6).catch(() => []),
      ]);
      const dramaEntries = cached.dramas.slice(0, 18).map((item) => ({
        id: item.bookId,
        title: item.title,
        provider: item.provider,
        url: `${origin}/${getProviderRouteSlug(item.provider)}/detail/${encodeURIComponent(item.slug)}`,
        cover: item.cover
          ? buildOgImageEndpointUrl(item.cover, origin, item.title)
          : undefined,
        chapterCount: item.chapterCount,
        description: item.description,
      }));
      let movieEntries = cachedMovies.slice(0, 6).map((m) => ({
        id: m.slug,
        title: m.title,
        provider: /^ls-/i.test(m.slug) ? 'LookSeries' : 'LK21',
        url: `${origin}/movie/detail/${encodeURIComponent(m.slug)}`,
        chapterCount: 1,
      }));
      if (movieEntries.length === 0) {
        const homeMovies = await getLk21Home(getMolaToken, origin).catch(() => null);
        const flat = (homeMovies?.rows || []).flatMap((r) => r.items || []);
        const seenSlug = new Set<string>();
        for (const item of flat) {
          const slug = cleanText(item.slug).toLowerCase();
          const title = cleanText(item.title);
          if (!slug || !title || seenSlug.has(slug)) continue;
          seenSlug.add(slug);
          movieEntries.push({
            id: slug,
            title,
            provider: 'LK21',
            url: `${origin}/movie/detail/${encodeURIComponent(slug)}`,
            chapterCount: 1,
          });
          if (movieEntries.length >= 6) break;
        }
      }
      featuredItems = [...dramaEntries, ...movieEntries].slice(0, 24);
    } catch {
      featuredItems = [];
    }

    const seenProvSlugs = new Set<string>();
    const providerDirectory = Object.keys(PROVIDER_SLUG_MAP)
      .filter((name) => name !== 'LK21' && name !== 'LookSeries')
      .map((name) => ({
        name,
        slug: getProviderRouteSlug(name),
      }))
      .filter((entry) => {
        if (seenProvSlugs.has(entry.slug)) return false;
        seenProvSlugs.add(entry.slug);
        return true;
      })
      .map((entry) => ({
        ...entry,
        url: `${origin}/provider/${entry.slug}`,
      }));

    const payload = {
      schemaVersion: '1.0',
      name: 'KanoDrama',
      url: origin,
      description:
        'Watch free trending HD vertical short dramas, billionaire romance, revenge sagas, and Asian mini-series across 49+ top platforms on KanoDrama.',
      language: 'en',
      generatedAt: new Date().toISOString(),
      endpoints: {
        home: `${origin}/`,
        explore: `${origin}/explore`,
        providersHub: `${origin}/providers`,
        trending: `${origin}/trending`,
        latest: `${origin}/latest`,
        vip: `${origin}/vip`,
        movies: `${origin}/movies`,
        lookseriesForYouApi: `${origin}/api/lookseries/foryou`,
        llmsTxt: `${origin}/llms.txt`,
        homeCatalogApi: `${origin}/api/home`,
        catalogFilterApi: `${origin}/api/catalog/filter`,
        sitemap: `${origin}/sitemap.xml`,
        robotsTxt: `${origin}/robots.txt`,
      },
      providers: Object.keys(PROVIDER_LOGO_PATHS),
      providerDirectory,
      collections: CURATED_PROGRAMMATIC_PAGES.map((p) => ({
        slug: p.slug,
        title: p.label,
        description: p.description,
        url: `${origin}/genre/${encodeURIComponent(p.slug)}`,
      })),
      featuredItems,
    };

    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=1800')
      .send(JSON.stringify(payload, null, 2));
  });

  app.get('/robots.txt', (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    res
      .status(200)
      .type('text/plain; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Allow: /llms.txt',
          'Allow: /ai-catalog.json',
          'Allow: /sitemap.xml',
          'Allow: /movies',
          'Allow: /providers',
          'Allow: /provider/',
          'Allow: /*/detail/',
          'Allow: /*/watch/',
          'Allow: /genre/',
          'Allow: /category/',
          'Allow: /tag/',
          'Allow: /explore',
          'Allow: /trending',
          'Allow: /latest',
          'Allow: /vip',
          'Allow: /api/og',
          'Allow: /api/og?*',
          'Allow: /api/home',
          'Disallow: /api/media',
          'Disallow: /api/stream',
          'Disallow: /api/proxy',
          'Disallow: /api/mola',
          'Disallow: /api/lk21/proxy/',
          'Disallow: /api/lookseries/proxy/',
          'Disallow: /api/',
          'Disallow: /_serverFn/',
          'Disallow: /account',
          'Disallow: /dashboard',
          'Disallow: /watchlist',
          'Disallow: /watch/',
          'Disallow: /*.m3u8',
          'Disallow: /*.m3u8?*',
          'Disallow: /*?token=*',
          'Disallow: /*&token=*',
          'Disallow: /*?st=*',
          'Disallow: /*&st=*',
          '',
          `Sitemap: ${origin}/sitemap.xml`,
          '',
        ].join('\n')
      );
  });

  const SITEMAP_MAX_URLS_PER_FILE = 25000;
  const SITEMAP_CACHE_TTL_MS = 10 * 60 * 1000;
  const SITEMAP_COLD_CACHE_TTL_MS = 60 * 1000;

  interface SitemapUrlEntry {
    loc: string;
    changefreq: string;
    priority: string;
    lastmod?: string;
  }

  const sitemapEntriesCache = new Map<
    string,
    { expiresAt: number; entries: SitemapUrlEntry[] }
  >();
  const sitemapBuildInFlight = new Map<string, Promise<SitemapUrlEntry[]>>();

  async function collectAllSitemapEntries(origin: string): Promise<SitemapUrlEntry[]> {
    const cached = sitemapEntriesCache.get(origin);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.entries;
    }

    const existingPromise = sitemapBuildInFlight.get(origin);
    if (existingPromise) {
      return existingPromise;
    }

    const buildPromise = (async (): Promise<SitemapUrlEntry[]> => {
      const seenLocs = new Set<string>();
      const entries: SitemapUrlEntry[] = [];

      const pushEntry = (
        loc: string,
        changefreq: string,
        priority: string,
        lastmod?: string
      ) => {
        if (seenLocs.has(loc)) return;
        seenLocs.add(loc);
        entries.push({ loc, changefreq, priority, lastmod });
      };

      const todayIso = new Date().toISOString().split('T')[0];
      pushEntry(`${origin}/`, 'hourly', '1.0', todayIso);
      pushEntry(`${origin}/movies`, 'hourly', '0.95', todayIso);
      pushEntry(`${origin}/explore`, 'hourly', '0.9', todayIso);
      pushEntry(`${origin}/providers`, 'daily', '0.9', todayIso);
      pushEntry(`${origin}/trending`, 'hourly', '0.9', todayIso);
      pushEntry(`${origin}/latest`, 'hourly', '0.9', todayIso);
      pushEntry(`${origin}/vip`, 'daily', '0.8', todayIso);

      for (const provName of Object.keys(PROVIDER_SLUG_MAP)) {
        if (provName === 'LK21' || provName === 'LookSeries') continue;
        const provSlug = getProviderRouteSlug(provName);
        pushEntry(`${origin}/provider/${provSlug}`, 'daily', '0.85', todayIso);
      }

      for (const preset of CURATED_PROGRAMMATIC_PAGES) {
        pushEntry(`${origin}/genre/${preset.slug}`, 'daily', '0.9', todayIso);
      }

      const coreGenreSlugs = [
        'ceo',
        'romance',
        'billionaire',
        'revenge',
        'fantasy',
        'historical',
        'action',
        'dubbed',
      ];
      for (const slug of coreGenreSlugs) {
        pushEntry(`${origin}/tag/${slug}`, 'daily', '0.85', todayIso);
      }

      // 1) Instantaneous read from PostgreSQL / L1 memory cache (/<provider>/detail/<slug>)
      const cachedSitemap = await getCachedDramasForSitemap(100000);
      for (const tag of cachedSitemap.tags) {
        const slug = slugifyTitle(tag);
        if (slug) {
          pushEntry(`${origin}/tag/${slug}`, 'daily', '0.9');
        }
      }
      for (const item of cachedSitemap.dramas) {
        const cleanTitle = cleanText(item.title);
        const cleanSlug = (item.slug || slugifyTitle(cleanTitle)).trim().toLowerCase();
        if (
          !cleanTitle ||
          cleanTitle.length < 2 ||
          !isValidSitemapSlug(cleanSlug) ||
          (item.chapterCount ?? 0) < 1 ||
          (!cleanText(item.cover) && !cleanText(item.description))
        ) {
          continue;
        }
        const provSlug = getProviderRouteSlug(item.provider);
        const loc = `${origin}/${provSlug}/detail/${encodeURIComponent(cleanSlug)}`;
        const lastmod = item.updatedAt
          ? new Date(item.updatedAt).toISOString().split('T')[0]
          : todayIso;
        pushEntry(loc, 'daily', '0.8', lastmod);
      }

      // 1b) Dedicated Movies catalog from PostgreSQL `movies` table (/movie/detail/<slug>)
      const cachedMovies = await listMoviesForSitemapFromDb(100000);
      for (const m of cachedMovies) {
        const cleanTitle = cleanText(m.title);
        const cleanSlug = cleanText(m.slug).toLowerCase();
        if (
          !cleanTitle ||
          cleanTitle.length < 2 ||
          !isValidSitemapSlug(cleanSlug) ||
          (!cleanText(m.cover) && !cleanText(m.description))
        ) {
          continue;
        }
        const loc = `${origin}/movie/detail/${encodeURIComponent(cleanSlug)}`;
        const lastmod = m.updatedAt
          ? new Date(m.updatedAt).toISOString().split('T')[0]
          : todayIso;
        pushEntry(loc, 'daily', '0.85', lastmod);
      }

      if (cachedMovies.length === 0) {
        try {
          const lkHome = await getLk21Home(getMolaToken, origin).catch(() => null);
          const flatMovies = (lkHome?.rows || []).flatMap((r) => r.items || []);
          for (const m of flatMovies) {
            const cleanTitle = cleanText(m.title);
            const cleanSlug = cleanText(m.slug).toLowerCase();
            if (
              !cleanTitle ||
              cleanTitle.length < 2 ||
              !isValidSitemapSlug(cleanSlug) ||
              (!cleanText(m.cover || m.coverHz || m.coverVt) && !cleanText(m.description))
            ) {
              continue;
            }
            pushEntry(
              `${origin}/movie/detail/${encodeURIComponent(cleanSlug)}`,
              'daily',
              '0.85',
              todayIso
            );
          }
        } catch {
          // Ignore cold movie sitemap fallback errors
        }
      }

      // 2) Upstream fallback only if cache has zero dramas yet (e.g. cold boot)
      if (cachedSitemap.dramas.length === 0) {
        try {
          const token = getMolaToken();
          if (token) {
            const [rankRes, newRes, nsRankRes, nsAllRes, arForYouRes, mlRankRes] =
              await Promise.allSettled([
                fetch(
                  `${DRAMABOX_BASE_URL}/ranking?page=1&lang=en&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${DRAMABOX_BASE_URL}/terbaru?page=1&lang=en&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${NETSHORT_BASE_URL}/trending?page=1&lang=en_US&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${NETSHORT_BASE_URL}/all?page=1&lang=en_US&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${ANYREEL_BASE_URL}/foryou?page=1&lang=en&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${MELOLO_BASE_URL}/rank?page=1&page_size=18&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
              ]);
            const processResult = async (
              r: PromiseSettledResult<globalThis.Response>,
              provider: SsrProviderName
            ) => {
              if (r.status !== 'fulfilled' || !r.value.ok) return;
              const json = (await r.value.json()) as Record<string, unknown>;
              const list = Array.isArray(json.books)
                ? (json.books as Record<string, unknown>[])
                : Array.isArray(json.data) &&
                  Array.isArray((json.data[0] as Record<string, unknown>)?.books)
                ? ((json.data[0] as Record<string, unknown>).books as Record<
                    string,
                    unknown
                  >[])
                : Array.isArray(json.data)
                ? (json.data as Record<string, unknown>[])
                : [];
              const provSlug = getProviderRouteSlug(provider);
              for (const item of list) {
                const title = cleanText(item.bookName ?? item.title);
                const cover = cleanText(
                  item.cover ?? item.coverUrl ?? item.bookCover ?? item.coverWap ?? item.poster
                );
                const desc = cleanText(item.description ?? item.introduction ?? item.synopsis);
                const slug = slugifyTitle(title);
                if (title.length >= 2 && isValidSitemapSlug(slug) && (cover || desc)) {
                  pushEntry(
                    `${origin}/${provSlug}/detail/${encodeURIComponent(slug)}`,
                    'daily',
                    '0.8',
                    todayIso
                  );
                }
              }
            };
            await Promise.all([
              processResult(rankRes, 'DramaBox'),
              processResult(newRes, 'DramaBox'),
              processResult(nsRankRes, 'NetShort'),
              processResult(nsAllRes, 'NetShort'),
              processResult(arForYouRes, 'AnyReel'),
              processResult(mlRankRes, 'Melolo'),
            ]);
          }
        } catch {
          // Fallback to root & tag entries
        }
      }

      const ttl =
        cachedSitemap.dramas.length > 0
          ? SITEMAP_CACHE_TTL_MS
          : SITEMAP_COLD_CACHE_TTL_MS;
      sitemapEntriesCache.set(origin, {
        expiresAt: Date.now() + ttl,
        entries,
      });

      return entries;
    })().finally(() => {
      sitemapBuildInFlight.delete(origin);
    });

    sitemapBuildInFlight.set(origin, buildPromise);
    return buildPromise;
  }

  const handleSitemapIndexXml = async (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    const entries = await collectAllSitemapEntries(origin);
    const totalParts = Math.max(
      1,
      Math.ceil(entries.length / SITEMAP_MAX_URLS_PER_FILE)
    );
    const todayIso = new Date().toISOString().split('T')[0];

    const sitemapsXml: string[] = [];
    for (let part = 1; part <= totalParts; part++) {
      const start = (part - 1) * SITEMAP_MAX_URLS_PER_FILE;
      const end = start + SITEMAP_MAX_URLS_PER_FILE;
      const slice = entries.slice(start, end);
      let partLastmod = '';
      for (const item of slice) {
        if (item.lastmod && item.lastmod > partLastmod) {
          partLastmod = item.lastmod;
        }
      }
      if (!partLastmod) {
        partLastmod = todayIso;
      }
      const partLoc = `${origin}/sitemap-part-${part}.xml`;
      sitemapsXml.push(
        `  <sitemap>\n    <loc>${escapeXml(partLoc)}</loc>\n    <lastmod>${escapeXml(partLastmod)}</lastmod>\n  </sitemap>`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapsXml.join('\n')}\n</sitemapindex>`;
    res
      .type('application/xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=900')
      .send(xml);
  };

  const handleSitemapPartXml = async (req: Request, res: Response) => {
    const pageRaw = req.params[0] ?? req.params.page ?? '';
    if (!/^[1-9]\d*$/.test(pageRaw)) {
      res
        .status(404)
        .type('application/xml; charset=utf-8')
        .send('<?xml version="1.0" encoding="UTF-8"?>\n<error>Invalid sitemap page</error>');
      return;
    }

    const page = Number(pageRaw);
    const origin = resolveOrigin(req);
    const entries = await collectAllSitemapEntries(origin);
    const totalParts = Math.max(
      1,
      Math.ceil(entries.length / SITEMAP_MAX_URLS_PER_FILE)
    );

    if (page < 1 || page > totalParts) {
      res
        .status(404)
        .type('application/xml; charset=utf-8')
        .send('<?xml version="1.0" encoding="UTF-8"?>\n<error>Sitemap part not found</error>');
      return;
    }

    const start = (page - 1) * SITEMAP_MAX_URLS_PER_FILE;
    const partEntries = entries.slice(start, start + SITEMAP_MAX_URLS_PER_FILE);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${partEntries
      .map(
        (entry) =>
          `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${
            entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n` : ''
          }    <changefreq>${escapeXml(entry.changefreq)}</changefreq>\n    <priority>${escapeXml(entry.priority)}</priority>\n  </url>`
      )
      .join('\n')}\n</urlset>`;

    res
      .type('application/xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=900')
      .send(xml);
  };

  app.get('/index.xml', handleSitemapIndexXml);
  app.get('/sitemap.xml', handleSitemapIndexXml);
  app.get(
    /^\/(?:sitemap-part-|sitemaps\/pages-)([1-9]\d*)\.xml$/,
    handleSitemapPartXml
  );

  // Deprecated video sitemap & embed routes cleanly return 404 + noindex
  app.get('/video-sitemap.xml', (_req: Request, res: Response) => {
    res.status(404);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/plain; charset=utf-8').send('Not found');
  });

  app.use('/embed', (_req: Request, res: Response) => {
    res.status(404);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/plain; charset=utf-8').send('Not found');
  });

  // --- Legacy Watch URL Redirect ---
  app.get('/watch/:provider/:bookId/:episodeId', async (req: Request, res: Response) => {
    try {
      const provider = parseSsrProviderName(cleanText(req.params.provider));
      const bookId = cleanText(req.params.bookId);
      const epRaw = Number(req.params.episodeId || req.query.ep || 1);
      const epNum = Number.isFinite(epRaw) && epRaw >= 1 ? Math.floor(epRaw) : 1;

      if (!provider || !bookId) {
        res.status(404);
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.send('Drama not found');
        return;
      }

      const dbHit = await resolveDramaBySlugFromDb(bookId, provider);
      let slug = dbHit?.slug;
      let resolvedProvider = dbHit?.provider || provider;

      if (!slug) {
        const ssr = await fetchDramaForSsr(bookId, provider);
        if (ssr.drama) {
          slug = ssr.drama.slug || slugifyTitle(ssr.drama.title);
          resolvedProvider = ssr.drama.provider;
        }
      }

      if (!slug || !isValidSitemapSlug(slug)) {
        res.status(404);
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.send('Drama not found');
        return;
      }

      const provSlug = getProviderRouteSlug(resolvedProvider);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.redirect(
        301,
        `/${provSlug}/watch/${encodeURIComponent(slug)}${epNum > 1 ? `?ep=${epNum}` : ''}`
      );
    } catch (err) {
      console.error('[Legacy Watch Redirect]', err);
      res.status(500).send('Unable to resolve legacy URL');
    }
  });

  app.use(['/_serverFn', '/api'], (_req: Request, res: Response) => {
    res.status(404);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: false, error: 'Not found' });
  });

  const loadRelatedDramaLinks = async (
    tags: string[],
    excludeSlug: string
  ): Promise<SsrRelatedLink[]> => {
    try {
      const filtered = await filterCatalogFromDb({
        genre: tags[0],
        limit: 8,
        offset: 0,
      });
      const out: SsrRelatedLink[] = [];
      for (const item of filtered.items) {
        const title = cleanText(item.title ?? item.bookName);
        const slug = cleanText(item.slug) || slugifyTitle(title);
        const provider = cleanText(item.provider, 'DramaBox');
        if (!title || !slug || slug.toLowerCase() === excludeSlug.toLowerCase()) {
          continue;
        }
        out.push({ title, slug, provider });
        if (out.length >= 6) break;
      }
      return out;
    } catch {
      return [];
    }
  };

  const loadRelatedMovieLinks = async (
    excludeSlug: string,
    detailRecommendations: Array<{
      title?: string;
      slug?: string;
      app?: string;
    }> = []
  ): Promise<SsrRelatedLink[]> => {
    const out: SsrRelatedLink[] = [];
    const seen = new Set<string>([excludeSlug.toLowerCase()]);

    for (const rec of detailRecommendations) {
      const title = cleanText(rec?.title);
      const slug = cleanText(rec?.slug).toLowerCase();
      if (!title || !slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        title,
        slug,
        provider: rec?.app === 'lookseries' || /^ls-/i.test(slug) ? 'LookSeries' : 'LK21',
      });
      if (out.length >= 6) return out;
    }

    try {
      const movies = await listMoviesForSitemapFromDb(12);
      for (const m of movies) {
        const slug = cleanText(m.slug).toLowerCase();
        const title = cleanText(m.title);
        if (!slug || !title || seen.has(slug)) continue;
        seen.add(slug);
        out.push({
          title,
          slug,
          provider: /^ls-/i.test(slug) ? 'LookSeries' : 'LK21',
        });
        if (out.length >= 6) break;
      }
      return out;
    } catch {
      return out;
    }
  };

  app.use(async (req: Request, res: Response) => {
    try {
      const origin = resolveOrigin(req);
      const {
        lang: ssrLang,
        pref: ssrLangPref,
        queryLang: ssrQueryLang,
      } = resolveRequestLanguage(req);
      const htmlPath = IS_PROD
        ? path.resolve(distDir, 'index.html')
        : path.resolve(rootDir, 'index.html');
      let html = fs.readFileSync(htmlPath, 'utf-8');

      if (vite) {
        html = await vite.transformIndexHtml(req.originalUrl, html);
      }

      const cleanPath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
      const lowerCleanPath = cleanPath.toLowerCase();

      // Legacy account/provider route redirects (301 canonical)
      if (
        lowerCleanPath === '/dashboard' ||
        lowerCleanPath.startsWith('/dashboard/') ||
        lowerCleanPath === '/watchlist' ||
        lowerCleanPath.startsWith('/watchlist/')
      ) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.redirect(301, '/account');
        return;
      }

      if (lowerCleanPath === '/provider') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(301, '/providers');
        return;
      }

      const rawScopedMatch = cleanPath.match(
        /^\/([a-z0-9_]+)\/(detail|watch)\/([^/]+)(?:\/(\d+))?$/i
      );
      const scopedMatch =
        rawScopedMatch && isKnownProviderRouteSlug(rawScopedMatch[1])
          ? rawScopedMatch
          : null;

      const providerHubMatch = !scopedMatch
        ? cleanPath.match(/^\/provider\/([^/]+)$/i)
        : null;

      const legacyMovieSlugMatch = !scopedMatch && !providerHubMatch
        ? cleanPath.match(/^\/movie\/([^/]+)$/i)
        : null;

      const legacyProvMatch =
        !scopedMatch && !providerHubMatch && !legacyMovieSlugMatch
          ? cleanPath.match(
              /^\/drama\/(dramabox|netshort|anyreel|melolo|dramaora|meloshort|petadrama|radreels|dramaverse|kalostv|stardusttv|stardust|starshort|dramabite|loveshots|mydrama|shotshort|moboreels|blinkdrama|wetv|cubetv|microdrama|flareflow|fundrama|freeshort|toonshort|happyshort|dramadash|storyreel_v2|storyreelv2|storyreel|vibeshort_v2|vibeshortv2|vibeshort|flickreels|dramawave|freereels|pinedrama|shortmax_v2|shortmaxv2|shortmax|flextv|vigloo|dotdrama|idrama_v2|idramav2|idrama|goodshort|reelshort_v2|reelshortv2|reelshort|joyreels|sodareels|bonustv|iqiyi)\/([^/]+)$/i
            )
          : null;
      const legacySlugOrIdMatch =
        !scopedMatch && !providerHubMatch && !legacyMovieSlugMatch && !legacyProvMatch
          ? cleanPath.match(/^\/drama\/([^/]+)$/i)
          : null;

      const tagMatch =
        !scopedMatch &&
        !providerHubMatch &&
        !legacyMovieSlugMatch &&
        !legacyProvMatch &&
        !legacySlugOrIdMatch
          ? cleanPath.match(/^\/tag\/([^/]+)/i)
          : null;

      const genreMatch =
        !scopedMatch &&
        !providerHubMatch &&
        !legacyMovieSlugMatch &&
        !legacyProvMatch &&
        !legacySlugOrIdMatch &&
        !tagMatch
          ? cleanPath.match(/^\/(genre|category)\/([^/]+)(?:\/([^/]+))?/i)
          : null;

      const sectionPageMap: Record<
        string,
        'movies' | 'explore' | 'providers' | 'trending' | 'latest' | 'vip' | 'dashboard'
      > = {
        '/movies': 'movies',
        '/explore': 'explore',
        '/providers': 'providers',
        '/trending': 'trending',
        '/latest': 'latest',
        '/vip': 'vip',
        '/account': 'dashboard',
      };

      const sectionPage = sectionPageMap[lowerCleanPath];
      const epFromPath = scopedMatch?.[4] ? Number(scopedMatch[4]) : 0;
      const epParam = Math.max(
        1,
        Math.floor(epFromPath || Number(req.query.ep) || 1)
      );
      const queryProvRaw = cleanText(req.query.provider);
      const queryProvHint = queryProvRaw
        ? parseSsrProviderName(queryProvRaw)
        : undefined;
      const queryBookId = cleanText(
        req.query.book_id ?? req.query.bookId ?? req.query.drama ?? req.query.id
      );

      let ssrHttpStatus = 200;
      let isNotFoundResponse = false;
      let isPrivateResponse = false;

      if (scopedMatch) {
        const routeProvSlug = scopedMatch[1].toLowerCase();
        const isWatchRoute = scopedMatch[2].toLowerCase() === 'watch';
        const segment = decodeURIComponent(scopedMatch[3]);
        const isMovieProviderRoute =
          routeProvSlug === 'movie' ||
          routeProvSlug === 'movies' ||
          routeProvSlug === 'lk21' ||
          routeProvSlug === 'lookseries';

        if (isMovieProviderRoute) {
          const mSlug = segment.toLowerCase();
          const isLookSeriesSlug =
            routeProvSlug === 'lookseries' ||
            /^ls-([^-/]+)/i.test(mSlug) ||
            queryProvRaw.toUpperCase() === 'LOOKSERIES';
          const [movieDetail, movieEps] = isLookSeriesSlug
            ? await Promise.all([
                getLookSeriesDetail(getMolaToken, mSlug).catch(() => null),
                getLookSeriesEpisodes(getMolaToken, mSlug).catch(() => null),
              ])
            : await Promise.all([
                getLk21Detail(getMolaToken, mSlug, origin).catch(() => null),
                getLk21Episodes(getMolaToken, mSlug).catch(() => null),
              ]);
          if (isValidSsrMovie(movieDetail)) {
            const canonicalSlug = (cleanText(movieDetail.slug) || mSlug)
              .trim()
              .toLowerCase();
            if (routeProvSlug !== 'movie' || canonicalSlug !== mSlug) {
              const targetPath = `/movie/${isWatchRoute ? 'watch' : 'detail'}/${encodeURIComponent(canonicalSlug)}${epParam > 1 ? `?ep=${epParam}` : ''}`;
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.redirect(301, targetPath);
              return;
            }
            const related = await loadRelatedMovieLinks(
              canonicalSlug,
              movieDetail.recommendations
            );
            html = injectMovieSeoIntoHtml(
              html,
              origin,
              movieDetail,
              movieEps?.episodes ?? [],
              ssrLang,
              ssrLangPref,
              epParam,
              ssrQueryLang,
              isWatchRoute,
              related
            );
          } else {
            ssrHttpStatus = 404;
            isNotFoundResponse = true;
            html = injectNotFoundSeoIntoHtml(
              html,
              origin,
              req.path,
              'movie',
              ssrLang
            );
          }
        } else {
          const mappedProv = parseProviderFromRouteSlug(routeProvSlug, segment);
          const providerHint = mappedProv
            ? parseSsrProviderName(mappedProv)
            : queryProvHint ?? 'DramaBox';
          const dbResolved = await resolveDramaBySlugFromDb(
            queryBookId || segment,
            providerHint
          );
          let resolvedDrama: SsrDrama | null = null;
          let episodes: SsrEpisode[] = [];

          if (dbResolved) {
            const dbProv = parseSsrProviderName(dbResolved.provider);
            const live = await fetchDramaForSsr(dbResolved.dramaId, dbProv);
            episodes = live.episodes;
            const cached = dbResolved.drama;
            resolvedDrama = live.drama
              ? { ...live.drama, slug: dbResolved.slug }
              : {
                  bookId: dbResolved.dramaId,
                  title: cleanText(cached.title ?? cached.bookName ?? cached.name),
                  slug: dbResolved.slug,
                  cover: cleanText(cached.cover),
                  description: cleanText(cached.description),
                  chapterCount: Number(cached.chapterCount) || 1,
                  tags: Array.isArray(cached.tags)
                    ? cached.tags.map((t) => String(t))
                    : [],
                  playCount: cleanText(cached.playCount) || undefined,
                  protagonist: cleanText(cached.protagonist) || undefined,
                  isVip: Boolean(cached.isVip),
                  provider: dbProv,
                  updatedAt:
                    typeof cached.updatedAt === 'number' ||
                    typeof cached.updatedAt === 'string'
                      ? cached.updatedAt
                      : undefined,
                };
          } else {
            const homeItem =
              (await findDramaBySlugInHomeCache(segment)) ||
              (await findDramaBySlugInApiCache(segment)) ||
              (await searchUpstreamDramaBySlug(
                getMolaToken(),
                segment,
                providerHint
              ));
            if (homeItem) {
              const itemProv = parseSsrProviderName(homeItem.provider);
              const live = await fetchDramaForSsr(homeItem.bookId, itemProv);
              episodes = live.episodes;
              resolvedDrama = live.drama
                ? {
                    ...live.drama,
                    slug: homeItem.slug,
                    updatedAt: live.drama.updatedAt ?? homeItem.updatedAt,
                  }
                : {
                    bookId: homeItem.bookId,
                    title: homeItem.title,
                    slug: homeItem.slug,
                    cover: homeItem.cover,
                    description: homeItem.description,
                    chapterCount: homeItem.chapterCount,
                    tags: homeItem.tags,
                    playCount: homeItem.playCount,
                    protagonist: homeItem.protagonist,
                    isVip: homeItem.isVip,
                    provider: itemProv,
                    updatedAt: homeItem.updatedAt,
                  };
            } else {
              const lookupId = queryBookId || segment;
              const live = await fetchDramaForSsr(lookupId, providerHint);
              resolvedDrama = live.drama;
              episodes = live.episodes;
            }
          }

          if (isValidSsrDrama(resolvedDrama, episodes)) {
            const finalSlug = (
              cleanText(resolvedDrama.slug) || slugifyTitle(resolvedDrama.title)
            )
              .trim()
              .toLowerCase();
            const related = await loadRelatedDramaLinks(
              resolvedDrama.tags,
              finalSlug
            );
            html = injectDramaSeoIntoHtml(
              html,
              origin,
              resolvedDrama.bookId,
              resolvedDrama,
              episodes,
              ssrLang,
              ssrLangPref,
              epParam,
              ssrQueryLang,
              isWatchRoute,
              related
            );
          } else {
            ssrHttpStatus = 404;
            isNotFoundResponse = true;
            html = injectNotFoundSeoIntoHtml(
              html,
              origin,
              req.path,
              'drama',
              ssrLang
            );
          }
        }
      } else if (legacyMovieSlugMatch) {
        const mSlug = decodeURIComponent(legacyMovieSlugMatch[1]).toLowerCase();
        const isLookSeriesSlug =
          /^ls-([^-/]+)/i.test(mSlug) ||
          queryProvRaw.toUpperCase() === 'LOOKSERIES';
        const movieDetail = isLookSeriesSlug
          ? await getLookSeriesDetail(getMolaToken, mSlug).catch(() => null)
          : await getLk21Detail(getMolaToken, mSlug, origin).catch(() => null);
        if (isValidSsrMovie(movieDetail)) {
          const cleanM = (cleanText(movieDetail.slug) || mSlug).toLowerCase();
          const targetPath = `/movie/${epParam > 1 ? 'watch' : 'detail'}/${encodeURIComponent(cleanM)}${epParam > 1 ? `?ep=${epParam}` : ''}`;
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.redirect(301, targetPath);
          return;
        } else {
          ssrHttpStatus = 404;
          isNotFoundResponse = true;
          html = injectNotFoundSeoIntoHtml(
            html,
            origin,
            req.path,
            'movie',
            ssrLang
          );
        }
      } else if (legacyProvMatch) {
        const bookId = decodeURIComponent(legacyProvMatch[2]);
        const providerHint = parseSsrProviderName(legacyProvMatch[1].toLowerCase());
        const { drama, episodes } = await fetchDramaForSsr(bookId, providerHint);
        let resolvedSsrDrama: SsrDrama | null = drama;
        if (!isValidSsrDrama(resolvedSsrDrama, episodes)) {
          const dbResolved = await resolveDramaBySlugFromDb(bookId, providerHint);
          if (dbResolved) {
            const cached = dbResolved.drama;
            resolvedSsrDrama = {
              bookId: dbResolved.dramaId,
              title: cleanText(cached.title ?? cached.bookName ?? cached.name),
              slug: dbResolved.slug,
              cover: cleanText(cached.cover),
              description: cleanText(cached.description),
              chapterCount: Number(cached.chapterCount) || 1,
              tags: Array.isArray(cached.tags)
                ? cached.tags.map((t) => String(t))
                : [],
              playCount: cleanText(cached.playCount) || undefined,
              protagonist: cleanText(cached.protagonist) || undefined,
              isVip: Boolean(cached.isVip),
              provider: parseSsrProviderName(dbResolved.provider),
            };
          }
        }
        if (isValidSsrDrama(resolvedSsrDrama, episodes)) {
          const finalSlug = (
            cleanText(resolvedSsrDrama.slug) || slugifyTitle(resolvedSsrDrama.title)
          )
            .trim()
            .toLowerCase();
          const provSlug = getProviderRouteSlug(resolvedSsrDrama.provider);
          const targetPath = `/${provSlug}/${epParam > 1 ? 'watch' : 'detail'}/${encodeURIComponent(finalSlug)}${epParam > 1 ? `?ep=${epParam}` : ''}`;
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.redirect(301, targetPath);
          return;
        } else {
          ssrHttpStatus = 404;
          isNotFoundResponse = true;
          html = injectNotFoundSeoIntoHtml(
            html,
            origin,
            req.path,
            'drama',
            ssrLang
          );
        }
      } else if (legacySlugOrIdMatch) {
        const segment = decodeURIComponent(legacySlugOrIdMatch[1]);
        const dbResolved = await resolveDramaBySlugFromDb(
          queryBookId || segment,
          queryProvHint
        );

        let resolvedSsrDrama: SsrDrama | null = null;
        let episodes: SsrEpisode[] = [];

        if (dbResolved) {
          const providerHint = parseSsrProviderName(dbResolved.provider);
          const live = await fetchDramaForSsr(dbResolved.dramaId, providerHint);
          episodes = live.episodes;
          if (episodes.length > 0) {
            void updateCatalogEpisodeCountIfHigherInDb(
              dbResolved.dramaId,
              dbResolved.provider,
              episodes.length
            )
              .then((updated) => {
                if (updated && updated.increased) {
                  return notifyCatalogAdditionsToGoogle(
                    [
                      {
                        dramaId: dbResolved.dramaId,
                        provider: dbResolved.provider,
                        slug: updated.slug,
                        chapterCount: updated.chapterCount,
                        reason: 'new_episode',
                      },
                    ],
                    origin
                  );
                }
                return [];
              })
              .catch(() => {});
          }
          const cached = dbResolved.drama;
          resolvedSsrDrama = live.drama
            ? { ...live.drama, slug: dbResolved.slug }
            : {
                bookId: dbResolved.dramaId,
                title: cleanText(cached.title ?? cached.bookName ?? cached.name),
                slug: dbResolved.slug,
                cover: cleanText(cached.cover),
                description: cleanText(cached.description),
                chapterCount: Number(cached.chapterCount) || 1,
                tags: Array.isArray(cached.tags)
                  ? cached.tags.map((t) => String(t))
                  : [],
                playCount: cleanText(cached.playCount) || undefined,
                protagonist: cleanText(cached.protagonist) || undefined,
                isVip: Boolean(cached.isVip),
                provider: providerHint,
              };
        } else {
          const homeItem =
            (await findDramaBySlugInHomeCache(segment)) ||
            (await findDramaBySlugInApiCache(segment)) ||
            (await searchUpstreamDramaBySlug(
              getMolaToken(),
              segment,
              queryProvHint
            ));
          if (homeItem) {
            const providerHint = parseSsrProviderName(homeItem.provider);
            const live = await fetchDramaForSsr(homeItem.bookId, providerHint);
            episodes = live.episodes;
            resolvedSsrDrama = live.drama
              ? { ...live.drama, slug: homeItem.slug }
              : {
                  bookId: homeItem.bookId,
                  title: homeItem.title,
                  slug: homeItem.slug,
                  cover: homeItem.cover,
                  description: homeItem.description,
                  chapterCount: homeItem.chapterCount,
                  tags: homeItem.tags,
                  playCount: homeItem.playCount,
                  protagonist: homeItem.protagonist,
                  isVip: homeItem.isVip,
                  provider: providerHint,
                };
          } else {
            const lookupId = queryBookId || segment;
            const providerHint = queryProvHint ?? 'DramaBox';
            const live = await fetchDramaForSsr(lookupId, providerHint);
            resolvedSsrDrama = live.drama;
            episodes = live.episodes;
          }
        }

        if (isValidSsrDrama(resolvedSsrDrama, episodes)) {
          const finalSlug = (
            cleanText(resolvedSsrDrama.slug) || slugifyTitle(resolvedSsrDrama.title)
          )
            .trim()
            .toLowerCase();
          const provSlug = getProviderRouteSlug(resolvedSsrDrama.provider);
          const targetPath = `/${provSlug}/${epParam > 1 ? 'watch' : 'detail'}/${encodeURIComponent(finalSlug)}${epParam > 1 ? `?ep=${epParam}` : ''}`;
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.redirect(301, targetPath);
          return;
        } else {
          ssrHttpStatus = 404;
          isNotFoundResponse = true;
          html = injectNotFoundSeoIntoHtml(
            html,
            origin,
            req.path,
            'drama',
            ssrLang
          );
        }
      } else if (queryBookId) {
        if (
          queryProvRaw.toUpperCase() === 'LK21' ||
          queryProvRaw.toUpperCase() === 'LOOKSERIES'
        ) {
          const isLs = queryProvRaw.toUpperCase() === 'LOOKSERIES';
          const mSlug = queryBookId.toLowerCase();
          const [movieDetail, movieEps] = isLs
            ? await Promise.all([
                getLookSeriesDetail(getMolaToken, queryBookId).catch(() => null),
                getLookSeriesEpisodes(getMolaToken, queryBookId).catch(() => null),
              ])
            : await Promise.all([
                getLk21Detail(getMolaToken, mSlug, origin).catch(() => null),
                getLk21Episodes(getMolaToken, mSlug).catch(() => null),
              ]);
          if (isValidSsrMovie(movieDetail)) {
            const canonicalSlug = (cleanText(movieDetail.slug) || mSlug)
              .trim()
              .toLowerCase();
            const related = await loadRelatedMovieLinks(
              canonicalSlug,
              movieDetail.recommendations
            );
            html = injectMovieSeoIntoHtml(
              html,
              origin,
              movieDetail,
              movieEps?.episodes ?? [],
              ssrLang,
              ssrLangPref,
              epParam,
              ssrQueryLang,
              false,
              related
            );
          } else {
            ssrHttpStatus = 404;
            isNotFoundResponse = true;
            html = injectNotFoundSeoIntoHtml(
              html,
              origin,
              req.path,
              'movie',
              ssrLang
            );
          }
        } else {
          const dbResolved = await resolveDramaBySlugFromDb(
            queryBookId,
            queryProvHint
          );
          if (dbResolved) {
            const providerHint = parseSsrProviderName(dbResolved.provider);
            const { drama: liveDrama, episodes } = await fetchDramaForSsr(
              dbResolved.dramaId,
              providerHint
            );
            const cached = dbResolved.drama;
            const ssrDrama: SsrDrama = liveDrama
              ? { ...liveDrama, slug: dbResolved.slug }
              : {
                  bookId: dbResolved.dramaId,
                  title: cleanText(cached.title ?? cached.bookName ?? cached.name),
                  slug: dbResolved.slug,
                  cover: cleanText(cached.cover),
                  description: cleanText(cached.description),
                  chapterCount: Number(cached.chapterCount) || 1,
                  tags: Array.isArray(cached.tags)
                    ? cached.tags.map((t) => String(t))
                    : [],
                  playCount: cleanText(cached.playCount) || undefined,
                  protagonist: cleanText(cached.protagonist) || undefined,
                  isVip: Boolean(cached.isVip),
                  provider: providerHint,
                  updatedAt:
                    typeof cached.updatedAt === 'number' ||
                    typeof cached.updatedAt === 'string'
                      ? cached.updatedAt
                      : undefined,
                };
            if (isValidSsrDrama(ssrDrama, episodes)) {
              const related = await loadRelatedDramaLinks(
                ssrDrama.tags,
                dbResolved.slug
              );
              html = injectDramaSeoIntoHtml(
                html,
                origin,
                dbResolved.dramaId,
                ssrDrama,
                episodes,
                ssrLang,
                ssrLangPref,
                epParam,
                ssrQueryLang,
                false,
                related
              );
            } else {
              ssrHttpStatus = 404;
              isNotFoundResponse = true;
              html = injectNotFoundSeoIntoHtml(
                html,
                origin,
                req.path,
                'drama',
                ssrLang
              );
            }
          } else {
            const homeItem =
              (await findDramaBySlugInHomeCache(queryBookId)) ||
              (await findDramaBySlugInApiCache(queryBookId));
            const providerHint = homeItem
              ? parseSsrProviderName(homeItem.provider)
              : queryProvHint ?? 'DramaBox';
            const targetId = homeItem?.bookId || queryBookId;
            const { drama: liveDrama, episodes } = await fetchDramaForSsr(
              targetId,
              providerHint
            );
            const candidateDrama: SsrDrama | null = liveDrama
              ? {
                  ...liveDrama,
                  slug: homeItem?.slug || liveDrama.slug,
                  updatedAt: liveDrama.updatedAt ?? homeItem?.updatedAt,
                }
              : homeItem
              ? {
                  bookId: homeItem.bookId,
                  title: homeItem.title,
                  slug: homeItem.slug,
                  cover: homeItem.cover,
                  description: homeItem.description,
                  chapterCount: homeItem.chapterCount,
                  tags: homeItem.tags,
                  playCount: homeItem.playCount,
                  protagonist: homeItem.protagonist,
                  isVip: homeItem.isVip,
                  provider: providerHint,
                  updatedAt: homeItem.updatedAt,
                }
              : null;
            if (isValidSsrDrama(candidateDrama, episodes)) {
              const finalSlug = (
                cleanText(candidateDrama.slug) || slugifyTitle(candidateDrama.title)
              )
                .trim()
                .toLowerCase();
              const related = await loadRelatedDramaLinks(
                candidateDrama.tags,
                finalSlug
              );
              html = injectDramaSeoIntoHtml(
                html,
                origin,
                targetId,
                candidateDrama,
                episodes,
                ssrLang,
                ssrLangPref,
                epParam,
                ssrQueryLang,
                false,
                related
              );
            } else {
              ssrHttpStatus = 404;
              isNotFoundResponse = true;
              html = injectNotFoundSeoIntoHtml(
                html,
                origin,
                req.path,
                'drama',
                ssrLang
              );
            }
          }
        }
      } else if (tagMatch || genreMatch) {
        const baseKind: 'genre' | 'tag' | 'category' = tagMatch
          ? 'tag'
          : genreMatch?.[1].toLowerCase() === 'category'
          ? 'category'
          : 'genre';
        const slugSeg = tagMatch ? tagMatch[1] : genreMatch![2];
        const modSeg = genreMatch?.[3];
        const landing = resolveProgrammaticLanding(slugSeg, baseKind, modSeg);
        const filtered = await filterCatalogFromDb({
          genre: landing.filter.genre,
          status: landing.filter.status,
          sort: landing.filter.sort,
          q: landing.filter.q,
          limit: 12,
          offset: 0,
        });
        html = injectProgrammaticSeoIntoHtml(
          html,
          origin,
          landing,
          filtered.items,
          ssrLang
        );
      } else if (providerHubMatch) {
        const rawProvSlug = decodeURIComponent(providerHubMatch[1]).trim().toLowerCase();
        if (
          rawProvSlug === 'movie' ||
          rawProvSlug === 'movies' ||
          rawProvSlug === 'lk21' ||
          rawProvSlug === 'lookseries'
        ) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.redirect(301, '/movies');
          return;
        }
        const matchedProv = parseProviderFromRouteSlug(rawProvSlug);
        if (
          matchedProv &&
          matchedProv !== 'LK21' &&
          matchedProv !== 'LookSeries'
        ) {
          const canonicalSlug = getProviderRouteSlug(matchedProv);
          if (rawProvSlug !== canonicalSlug) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.redirect(301, `/provider/${canonicalSlug}`);
            return;
          }
          const filtered = await filterCatalogFromDb({
            provider: matchedProv,
            limit: 12,
            offset: 0,
          }).catch(() => ({ items: [] as Array<Record<string, unknown>>, total: 0 }));
          html = injectProviderSeoIntoHtml(
            html,
            origin,
            matchedProv,
            `/provider/${canonicalSlug}`,
            ssrLang,
            filtered.items
          );
        } else {
          ssrHttpStatus = 404;
          isNotFoundResponse = true;
          html = injectNotFoundSeoIntoHtml(
            html,
            origin,
            cleanPath,
            'provider',
            ssrLang
          );
        }
      } else if (sectionPage) {
        if (sectionPage === 'dashboard') {
          isPrivateResponse = true;
        }
        html = injectPageMetadataIntoHtml(
          html,
          origin,
          sectionPage,
          cleanPath,
          ssrLang
        );
      } else {
        html = injectPageMetadataIntoHtml(
          html,
          origin,
          'home',
          cleanPath === '/' ? '/' : cleanPath,
          ssrLang
        );
      }

      if (isNotFoundResponse || isPrivateResponse) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      }
      res
        .status(ssrHttpStatus)
        .set({ 'Content-Type': 'text/html; charset=utf-8' })
        .end(html);
    } catch (err) {
      if (vite && err instanceof Error) {
        vite.ssrFixStacktrace(err);
      }
      res.status(500).send('Server rendering error');
    }
  });

  await ensureDatabaseReady();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KanoDrama SSR server running on http://0.0.0.0:${PORT}`);
    setInterval(() => {
      syncJakartaDayRollover();
    }, 60_000).unref();
    startHomeCacheWorker(getMolaToken);
    startLk21Prewarm(getMolaToken);
  });
}

startServer();
