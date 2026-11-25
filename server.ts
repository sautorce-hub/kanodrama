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
  ALLOWED_PAYOUT_METHODS,
  ACTIVE_VISITOR_TTL_SECONDS,
  DatabaseUnavailableError,
  INDONESIAN_BANK_OPTIONS,
  USDT_NETWORK_OPTIONS,
  authenticateEmailAccountInDb,
  bindReferralForUserInDb,
  buildGmailAccountKey,
  claimDailyCheckinInDb,
  claimWatchEpisodeInDb,
  claimWatchMilestoneInDb,
  createCommentInDb,
  createPayoutRequestInDb,
  deleteWatchHistoryInDb,
  ensureDatabaseReady,
  filterCatalogFromDb,
  getDramaStatsFromDb,
  getJakartaDateKey,
  getPayoutRuntimeConfig,
  getSiteVisitorStatsFromDb,
  getTopDailyStatsFromDb,
  getTrendingStatsMapFromDb,
  getUniqueGmailLoginCountFromDb,
  getUserFromDb,
  getUserPointsSummaryFromDb,
  getUserReferralSummaryFromDb,
  grantFirstLoginBonusIfEligibleInDb,
  isDatabaseEnabled,
  listAdminPayoutRequestsFromDb,
  listCatalogForSitemapFromDb,
  listCommentsFromDb,
  listFavoritesFromDb,
  listLikesFromDb,
  listLivePayoutFeedFromDb,
  listMoviesForSitemapFromDb,
  listUserCommentsFromDb,
  listUserLedgerFromDb,
  listUserPayoutsFromDb,
  listWatchHistoryFromDb,
  pingDb,
  recordGmailLoginInDb,
  recordUserSecuritySignalInDb,
  recordVideoViewInDb,
  recordVisitorHeartbeatInDb,
  recordWatchHeartbeatInDb,
  registerEmailAccountInDb,
  removeActiveVisitorSessionInDb,
  resolveDramaBySlugFromDb,
  startWatchSessionInDb,
  syncUserInDb,
  toggleFavoriteInDb,
  toggleLikeInDb,
  updateAdminPayoutStatusInDb,
  updateCatalogEpisodeCountIfHigherInDb,
  updateFavoriteFolderInDb,
  updateUserProfileInDb,
  upsertWatchHistoryInDb,
  type PayoutMethod,
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
  peekCachedHomeDataForSsr,
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
  DEFAULT_SITE_ORIGIN,
  detectLanguageFromContent,
  generateMetadata,
  getHtmlLangTag,
  getOgLocaleTag,
  normalizeLanguageCode,
  parseCookieHeaderLanguage,
  stripLeadingWatchPrefix,
} from './src/i18n/helpers.ts';
import {
  BRAND_LOGO_ICON_PATH,
  cleanSeoDescription,
  resolveDramaSeoDescriptionFields,
} from './src/utils/seo.ts';
import {
  getAdminPayoutSecret,
  getAllowedGoogleClientIds,
  getAuthSessionSecret,
  getConfiguredSiteUrl,
  getGoogleClientSecret,
  getMolaApiToken,
  getPrimaryGoogleClientId,
  getStreamSigningSecret,
  resolveServerPort,
} from './server/config.ts';
import { notifyAdminTelegramNewWithdrawal } from './server/telegramNotify.ts';
import type {
  LanguageCode,
  LanguagePreference,
  ProviderName,
} from './src/types/drama.ts';

const PORT = resolveServerPort();
const IS_PROD = process.env.NODE_ENV === 'production';
const MOLATV_API_BASE = 'https://api.molatv.id/api';
const DRAMABOX_V2_BASE_URL = `${MOLATV_API_BASE}/dramaboxv2`;
const NETSHORT_BASE_URL = `${MOLATV_API_BASE}/netshort`;
const ANYREEL_BASE_URL = `${MOLATV_API_BASE}/anyreel`;
const MELOLO_V2_BASE_URL = `${MOLATV_API_BASE}/melolo`;
const DEFAULT_OG_IMAGE_PATH =
  '/assets/aistudio/file_00000000f37c8211a740b95cbbe03886_b90a3ae0.png';

function getMolaToken(): string {
  return getMolaApiToken();
}

type SsrProviderName = ProviderName;

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

function resolveAllowedGoogleClientIds(): Set<string> {
  return getAllowedGoogleClientIds();
}

let googleCertsCache: {
  certs: Record<string, string>;
  expiresAt: number;
} | null = null;

async function getGooglePublicCerts(
  forceRefresh = false
): Promise<Record<string, string> | null> {
  const now = Date.now();
  if (!forceRefresh && googleCertsCache && now < googleCertsCache.expiresAt) {
    return googleCertsCache.certs;
  }
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/certs', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const certs = (await res.json()) as Record<string, string>;
    const cc = res.headers.get('cache-control') || '';
    const maxAgeMatch = cc.match(/max-age=(\d+)/i);
    const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;
    googleCertsCache = {
      certs,
      expiresAt: now + Math.max(60_000, maxAgeMs),
    };
    return certs;
  } catch {
    return null;
  }
}

interface VerifiedGoogleClaims {
  status: 'verified' | 'invalid' | 'unavailable';
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string | null;
}

async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleClaims> {
  const allowedClientIds = resolveAllowedGoogleClientIds();
  if (allowedClientIds.size === 0) {
    return { status: 'unavailable' };
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    return { status: 'invalid' };
  }
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    azp?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
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
  const issValid =
    payload.iss === 'https://accounts.google.com' ||
    payload.iss === 'accounts.google.com';
  if (
    !issValid ||
    typeof payload.aud !== 'string' ||
    !allowedClientIds.has(payload.aud) ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp + 60 <= nowSec
  ) {
    return { status: 'invalid' };
  }

  let certs = await getGooglePublicCerts();
  if (!certs) {
    return { status: 'unavailable' };
  }
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getGooglePublicCerts(true);
    if (!certs) return { status: 'unavailable' };
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

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload.email_verified === true;
  if (!email || !emailVerified) {
    return { status: 'invalid' };
  }

  return {
    status: 'verified',
    sub: payload.sub,
    email,
    emailVerified,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' ? payload.picture.trim() : null,
  };
}

async function verifyGoogleAccessToken(
  accessToken: string
): Promise<VerifiedGoogleClaims> {
  const allowedClientIds = resolveAllowedGoogleClientIds();
  if (allowedClientIds.size === 0) {
    return { status: 'unavailable' };
  }
  const cleanToken = accessToken.trim();
  if (!cleanToken) {
    return { status: 'invalid' };
  }

  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(cleanToken)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!tokenInfoRes.ok) {
      return { status: 'invalid' };
    }
    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      azp?: string;
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      expires_in?: string | number;
    };

    const audMatched =
      (typeof tokenInfo.aud === 'string' && allowedClientIds.has(tokenInfo.aud)) ||
      (typeof tokenInfo.azp === 'string' && allowedClientIds.has(tokenInfo.azp));
    const expiresIn = Number(tokenInfo.expires_in || 0);
    if (!audMatched || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      return { status: 'invalid' };
    }

    const userInfoRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${cleanToken}` },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!userInfoRes.ok) {
      return { status: 'invalid' };
    }
    const userInfo = (await userInfoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    const sub = cleanText(userInfo.sub || tokenInfo.sub);
    const email = cleanText(userInfo.email || tokenInfo.email).toLowerCase();
    const emailVerified =
      userInfo.email_verified === true ||
      tokenInfo.email_verified === true ||
      tokenInfo.email_verified === 'true';
    if (!sub || !email || !emailVerified) {
      return { status: 'invalid' };
    }

    return {
      status: 'verified',
      sub,
      email,
      emailVerified: true,
      name: cleanText(userInfo.name),
      picture: cleanText(userInfo.picture) || null,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

const SESSION_COOKIE_NAME = 'kd_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionTokenPayload {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  iat: number;
  exp: number;
}

export function signAuthSessionToken(claims: {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    uid: claims.uid,
    email: claims.email,
    displayName: claims.displayName,
    photoURL: claims.photoURL,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `v1.${encodedPayload}.${sig}`;
}

function verifyAuthSessionToken(token: string): SessionTokenPayload | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  const a = Buffer.from(providedSig, 'utf-8');
  const b = Buffer.from(expectedSig, 'utf-8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    ) as SessionTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      !parsed ||
      typeof parsed.uid !== 'string' ||
      !parsed.uid ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= nowSec
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookiesMap(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(rawVal);
    } catch {
      out[name] = rawVal;
    }
  }
  return out;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function setAuthSessionCookie(req: Request, res: Response, token: string): void {
  const secure = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    ...(secure ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

function clearAuthSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    ...(secure ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

function extractAuthSessionFromRequest(req: Request): {
  session: SessionTokenPayload | null;
  viaCookie: boolean;
} {
  const authHeader = req.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearerToken) {
    const verified = verifyAuthSessionToken(bearerToken);
    if (verified) return { session: verified, viaCookie: false };
  }
  const cookies = parseCookiesMap(req.get('cookie'));
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const verified = verifyAuthSessionToken(cookieToken);
    if (verified) return { session: verified, viaCookie: true };
  }
  return { session: null, viaCookie: false };
}

function isTrustedSameOriginMutation(req: Request): boolean {
  if (req.get('x-requested-with') === 'KanoDrama') {
    return true;
  }
  const hostHeader = (req.get('x-forwarded-host') || req.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const originHeader = (req.get('origin') || '').trim();
  const refererHeader = (req.get('referer') || '').trim();
  const candidate = originHeader || refererHeader;
  if (!candidate) return false;
  try {
    const parsedHost = new URL(candidate).host.toLowerCase();
    const canonicalHost = new URL(DEFAULT_SITE_ORIGIN).host.toLowerCase();
    return Boolean(
      (hostHeader && parsedHost === hostHeader) || parsedHost === canonicalHost
    );
  } catch {
    return false;
  }
}

function buildAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const SESSION_AVATAR_COLORS = ['#EF4444', '#D4AF37', '#10B981', '#E11D48', '#3B82F6'];
function pickAvatarColor(seed: string): string {
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return SESSION_AVATAR_COLORS[Math.abs(hash) % SESSION_AVATAR_COLORS.length];
}

function signOAuthStateToken(origin: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      origin,
      nonce: crypto.randomBytes(8).toString('hex'),
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(`oauth_state:${payload}`)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyOAuthStateToken(stateRaw: string): { origin: string } | null {
  const dot = stateRaw.indexOf('.');
  if (dot <= 0) return null;
  const payload = stateRaw.slice(0, dot);
  const sig = stateRaw.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', getAuthSessionSecret())
    .update(`oauth_state:${payload}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    ) as { origin?: string; exp?: number };
    if (
      !parsed ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Math.floor(Date.now() / 1000) ||
      typeof parsed.origin !== 'string'
    ) {
      return null;
    }
    return { origin: parsed.origin };
  } catch {
    return null;
  }
}

function sha256SecurityDigest(value: string): string {
  if (!value) return '';
  return crypto
    .createHash('sha256')
    .update(`kd-sec-v1:${value}`)
    .digest('hex')
    .slice(0, 64);
}

function extractClientIpNormalized(req: Request): string {
  const xff = (req.get('x-forwarded-for') || '').split(',')[0].trim();
  const realIp = (req.get('x-real-ip') || '').trim();
  const raw = xff || realIp || req.ip || req.socket.remoteAddress || '';
  return raw.replace(/^::ffff:/i, '').trim();
}

function computeIpSubnetPrefix(ip: string): string {
  if (!ip) return '';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  if (ip.includes(':')) {
    const groups = ip.split(':').filter(Boolean);
    return `${groups.slice(0, 3).join(':')}::/48`;
  }
  return ip;
}

function extractClientSecurityHashes(
  req: Request,
  explicitDeviceFp?: string
): {
  ipHash: string;
  subnetHash: string;
  uaHash: string;
  deviceHash: string;
} {
  const ip = extractClientIpNormalized(req);
  const subnet = computeIpSubnetPrefix(ip);
  const ua = (req.get('user-agent') || '').trim().slice(0, 320);
  const rawDevice = (
    explicitDeviceFp ||
    req.get('x-device-fingerprint') ||
    (typeof req.body?.deviceFingerprint === 'string'
      ? req.body.deviceFingerprint
      : '') ||
    ''
  )
    .trim()
    .slice(0, 128);

  return {
    ipHash: sha256SecurityDigest(ip),
    subnetHash: sha256SecurityDigest(subnet),
    uaHash: sha256SecurityDigest(ua),
    deviceHash: sha256SecurityDigest(rawDevice),
  };
}

function extractUserTimeZone(req: Request): string | undefined {
  const fromHeader = req.get('x-user-timezone');
  const fromBody =
    typeof req.body?.timeZone === 'string'
      ? req.body.timeZone
      : typeof req.body?.timezone === 'string'
      ? req.body.timezone
      : undefined;
  const fromQuery = typeof req.query.tz === 'string' ? req.query.tz : undefined;
  const raw = (fromHeader || fromBody || fromQuery || '').trim().slice(0, 64);
  return raw || undefined;
}

function isIndonesianRequest(req: Request): boolean {
  const explicitTz = (req.get('x-user-timezone') || '').trim().toLowerCase();
  if (explicitTz === 'utc' || explicitTz === 'etc/utc' || explicitTz === 'gmt') {
    return false;
  }
  if (
    explicitTz === 'asia/jakarta' ||
    explicitTz === 'asia/pontianak' ||
    explicitTz === 'asia/makassar' ||
    explicitTz === 'asia/jayapura'
  ) {
    return true;
  }
  const queryLang = normalizeLanguageCode(
    typeof req.query.lang === 'string' ? req.query.lang : null
  );
  if (queryLang) return queryLang === 'id';
  return resolveRequestLanguage(req).lang === 'id';
}

const endpointRateWindows = new Map<string, number[]>();
function isEndpointRateLimited(
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = (endpointRateWindows.get(bucketKey) || []).filter(
    (ts) => ts > cutoff
  );
  if (existing.length >= maxRequests) {
    endpointRateWindows.set(bucketKey, existing);
    return true;
  }
  existing.push(now);
  endpointRateWindows.set(bucketKey, existing);
  if (endpointRateWindows.size > 5000) {
    for (const [k, list] of endpointRateWindows.entries()) {
      if (list.length === 0 || list[list.length - 1] <= cutoff) {
        endpointRateWindows.delete(k);
      }
    }
  }
  return false;
}

async function recordGmailAccountAndSync(input: {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  visitDate?: string;
  isLoginEvent: boolean;
}) {
  const avatarInitials = buildAvatarInitials(input.displayName);
  const avatarColor = pickAvatarColor(input.email || input.uid);

  const synced = await syncUserInDb({
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    avatarInitials,
    avatarColor,
    visitDate: input.visitDate || getJakartaDateKey(),
  });

  const isGoogleAccount = input.uid.startsWith('google_');
  if (!isGoogleAccount) {
    const dbCount = await getUniqueGmailLoginCountFromDb().catch(() => null);
    const gmailLoginCount =
      dbCount !== null
        ? Math.max(dbCount, memoryGmailTotalLogins)
        : memoryGmailTotalLogins;
    return { synced, gmailLoginCount };
  }

  const accountKey = buildGmailAccountKey(input.uid, input.email);
  const emailVerified = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email);
  const dbCount = await recordGmailLoginInDb({
    uid: input.uid,
    email: input.email,
    emailVerified,
    isLoginEvent: input.isLoginEvent,
  });

  if (accountKey) {
    const prevAccountCount = memoryGmailAccountCounts.get(accountKey) || 0;
    if (input.isLoginEvent) {
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

  return { synced, gmailLoginCount };
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
  const host = (forwardedHost || req.get('host') || `localhost:${PORT}`).split(':')[0];
  if (/^(www\.)?(kano-drama\.live|kano-drama\.xyz|house-drama\.xyz|house-drama\.web\.id)$/i.test(host)) {
    return DEFAULT_SITE_ORIGIN;
  }
  const configured = getConfiguredSiteUrl();
  if (configured) {
    if (/^https?:\/\/(www\.)?(kano-drama\.live|kano-drama\.xyz|house-drama\.xyz|house-drama\.web\.id)$/i.test(configured)) {
      return DEFAULT_SITE_ORIGIN;
    }
    const isLocalConfigured = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(
      configured
    );
    return isLocalConfigured ? configured : configured.replace(/^http:\/\//i, 'https://');
  }
  const rawHostWithPort = forwardedHost || req.get('host') || `localhost:${PORT}`;
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawHostWithPort);
  const forwardedProto = (
    req.headers['x-forwarded-proto'] as string | undefined
  )
    ?.split(',')[0]
    ?.trim();
  const proto = isLocalHost
    ? forwardedProto || req.protocol || 'http'
    : 'https';
  return `${proto}://${rawHostWithPort}`;
}

function isLocalRequestHost(req: Request): boolean {
  const rawHost = (
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
    req.get('host') ||
    ''
  )
    .trim()
    .toLowerCase();
  if (!rawHost) return true;
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawHost);
}

function buildCanonicalRedirectUrl(req: Request, targetPath: string): string {
  const cleanTarget = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  if (isLocalRequestHost(req)) {
    return cleanTarget;
  }
  return `${DEFAULT_SITE_ORIGIN}${cleanTarget}`;
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
    dramabox: 'DramaBoxV2',
    dramaboxv2: 'DramaBoxV2',
    dramabox_v2: 'DramaBoxV2',
    netshort: 'NetShort',
    anyreel: 'AnyReel',
    melolo: 'MeloLoV2',
    melolov2: 'MeloLoV2',
    melolo_v2: 'MeloLoV2',
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
    storyreel: 'StoryReelV2',
    storyreelv2: 'StoryReelV2',
    storyreel_v2: 'StoryReelV2',
    vibeshort: 'VibeShortV2',
    vibeshortv2: 'VibeShortV2',
    vibeshort_v2: 'VibeShortV2',
    flickreels: 'FlickReels',
    dramawave: 'DramaWave',
    freereels: 'FreeReels',
    pinedrama: 'PineDrama',
    shortmax: 'ShortMaxV2',
    shortmaxv2: 'ShortMaxV2',
    shortmax_v2: 'ShortMaxV2',
    flextv: 'FlexTV',
    vigloo: 'Vigloo',
    dotdrama: 'DotDrama',
    idrama: 'iDramaV2',
    idramav2: 'iDramaV2',
    idrama_v2: 'iDramaV2',
    goodshort: 'GoodShort',
    reelshort: 'ReelShortV2',
    reelshortv2: 'ReelShortV2',
    reelshort_v2: 'ReelShortV2',
    joyreels: 'JoyReels',
    sodareels: 'SodaReels',
    bonustv: 'BonusTV',
    iqiyi: 'iQIYI',
    audiotoon: 'AudioToon',
    playlet: 'Playlet',
    momeshort: 'MomeShort',
    storeel: 'StoReel',
    mymuse: 'MyMuse',
    huangdou: 'HuangDou',
    moreshort: 'MoreShort',
    dramarush: 'DramaRush',
    shortswave: 'Shortswave',
    relala: 'Relala',
    sixthshort: 'SixthShort',
    snackshort: 'SnackShort',
    soreel: 'Soreel',
    stareel: 'StarReel',
    starreel: 'StarReel',
    storygo: 'StoryGo',
    minishort: 'MiniShort',
    shorten: 'Shorten',
    velolo: 'Velolo',
    reelpine: 'ReelPine',
    dynastyshorts: 'DynastyShorts',
    dynasty_shorts: 'DynastyShorts',
    dramashorts: 'DramaShorts',
    tallflix: 'TallFlix',
    qlax: 'Qlax',
    shortical: 'Shortical',
    luzicine: 'LuziCine',
    zebrashort: 'ZebraShort',
    drakorid: 'DrakorID',
    drachinreborn: 'DrachinReborn',
    dramaqueen: 'DramaQueen',
    ansflix: 'Ansflix',
    lupacine: 'LupaCine',
    reellife: 'ReelLife',
    bstation: 'Bstation',
    anichin: 'Anichin',
    donghuaqueen: 'DonghuaQueen',
    samehadaku: 'Samehadaku',
    animex: 'AnimeX',
    winknovel: 'WinkNovel',
  };
  return map[norm] ?? 'DramaBoxV2';
}

function getProviderConfigForSsr(providerHint: SsrProviderName): {
  baseUrl: string;
  langParam: string | null;
  idParam: string;
  epPath?: string;
} {
  const canonicalHint = parseSsrProviderName(providerHint);
  switch (canonicalHint) {
    case 'NetShort':
      return { baseUrl: NETSHORT_BASE_URL, langParam: 'en_US', idParam: 'book_id' };
    case 'AnyReel':
      return { baseUrl: ANYREEL_BASE_URL, langParam: 'en', idParam: 'book_id' };
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
    case 'StoryReelV2':
      return { baseUrl: `${MOLATV_API_BASE}/storyreel_v2`, langParam: 'en', idParam: 'book_id' };
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
    case 'ShortMaxV2':
      return { baseUrl: `${MOLATV_API_BASE}/shortmax_v2`, langParam: 'en', idParam: 'book_id' };
    case 'FlexTV':
      return { baseUrl: `${MOLATV_API_BASE}/flextv`, langParam: 'en', idParam: 'book_id' };
    case 'Vigloo':
      return { baseUrl: `${MOLATV_API_BASE}/vigloo`, langParam: 'en', idParam: 'book_id' };
    case 'DotDrama':
      return { baseUrl: `${MOLATV_API_BASE}/dotdrama`, langParam: 'en', idParam: 'book_id' };
    case 'iDramaV2':
      return { baseUrl: `${MOLATV_API_BASE}/idramav2`, langParam: 'id', idParam: 'book_id', epPath: '/detail' };
    case 'GoodShort':
      return { baseUrl: `${MOLATV_API_BASE}/goodshort`, langParam: 'en', idParam: 'book_id' };
    case 'ReelShortV2':
      return { baseUrl: `${MOLATV_API_BASE}/reelshortv2`, langParam: 'in', idParam: 'book_id' };
    case 'JoyReels':
      return { baseUrl: `${MOLATV_API_BASE}/joyreels`, langParam: 'id', idParam: 'playlet_id', epPath: '/detail' };
    case 'SodaReels':
      return { baseUrl: `${MOLATV_API_BASE}/sodareels`, langParam: 'en', idParam: 'book_id' };
    case 'BonusTV':
      return { baseUrl: `${MOLATV_API_BASE}/bonustv`, langParam: 'en', idParam: 'book_id' };
    case 'iQIYI':
      return { baseUrl: `${MOLATV_API_BASE}/iqiyi`, langParam: 'en', idParam: 'album_id' };
    case 'DramaBoxV2':
      return { baseUrl: DRAMABOX_V2_BASE_URL, langParam: 'en', idParam: 'book_id' };
    case 'MeloLoV2':
      return { baseUrl: MELOLO_V2_BASE_URL, langParam: 'in', idParam: 'book_id' };
    case 'Ansflix':
      return { baseUrl: `${MOLATV_API_BASE}/ansflix`, langParam: 'id', idParam: 'book_id' };
    case 'StarReel':
      return { baseUrl: `${MOLATV_API_BASE}/stareel`, langParam: 'en', idParam: 'book_id' };
    default:
      return {
        baseUrl: `${MOLATV_API_BASE}/${getProviderRouteSlug(canonicalHint)}`,
        langParam: 'en',
        idParam: 'book_id',
      };
  }
}

async function fetchDramaForSsr(
  bookId: string,
  providerHint: SsrProviderName = 'DramaBoxV2'
): Promise<{
  drama: SsrDrama | null;
  episodes: SsrEpisode[];
}> {
  const token = getMolaToken();
  if (!token) {
    return { drama: null, episodes: [] };
  }

  const canonicalProvider = parseSsrProviderName(providerHint);
  const cacheKey = `${canonicalProvider}:${bookId}`;
  const cached = ssrCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { drama: cached.drama, episodes: cached.episodes };
  }

  let drama: SsrDrama | null = null;
  let episodes: SsrEpisode[] = [];

  const { baseUrl, langParam, idParam, epPath } = getProviderConfigForSsr(canonicalProvider);
  const langSuffix = langParam ? `&lang=${encodeURIComponent(langParam)}` : '';

  try {
    const parseEpisodesArray = (
      jsonObj: Record<string, unknown>,
      rawObj?: Record<string, unknown>
    ): SsrEpisode[] => {
      const dataObj =
        jsonObj.data && !Array.isArray(jsonObj.data) && typeof jsonObj.data === 'object'
          ? (jsonObj.data as Record<string, unknown>)
          : null;
      const rawEps = Array.isArray(jsonObj.episodes)
        ? (jsonObj.episodes as Record<string, unknown>[])
        : Array.isArray(jsonObj.chapterList)
        ? (jsonObj.chapterList as Record<string, unknown>[])
        : Array.isArray(jsonObj.video_list)
        ? (jsonObj.video_list as Record<string, unknown>[])
        : Array.isArray(jsonObj.videos)
        ? (jsonObj.videos as Record<string, unknown>[])
        : Array.isArray(dataObj?.chapterList)
        ? (dataObj.chapterList as Record<string, unknown>[])
        : Array.isArray(dataObj?.episodes)
        ? (dataObj.episodes as Record<string, unknown>[])
        : Array.isArray(dataObj?.video_list)
        ? (dataObj.video_list as Record<string, unknown>[])
        : Array.isArray(dataObj?.videos)
        ? (dataObj.videos as Record<string, unknown>[])
        : Array.isArray(dataObj?.data)
        ? (dataObj.data as Record<string, unknown>[])
        : Array.isArray(jsonObj.data)
        ? (jsonObj.data as Record<string, unknown>[])
        : rawObj && Array.isArray(rawObj.episodes)
        ? (rawObj.episodes as Record<string, unknown>[])
        : rawObj && Array.isArray(rawObj.chapterList)
        ? (rawObj.chapterList as Record<string, unknown>[])
        : rawObj && Array.isArray(rawObj.video_list)
        ? (rawObj.video_list as Record<string, unknown>[])
        : [];
      if (rawEps.length === 0) return [];

      const rawIndices = rawEps
        .map((ep) => {
          const rawVal = ep.chapterIndex ?? ep.episodeIndex ?? ep.episode;
          if (rawVal === null || rawVal === undefined || rawVal === '') return -1;
          const n = Number(rawVal);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
        })
        .filter((n) => n >= 0);
      const hasZeroBased = rawIndices.length > 0 && Math.min(...rawIndices) === 0;
      const seenNums = new Set<number>();

      return rawEps
        .map((ep, idx) => {
          const rawVal = ep.chapterIndex ?? ep.episodeIndex ?? ep.episode;
          const parsedVal =
            rawVal !== null && rawVal !== undefined && rawVal !== ''
              ? Number(rawVal)
              : NaN;
          let num =
            Number.isFinite(parsedVal) && parsedVal >= 0
              ? hasZeroBased
                ? Math.floor(parsedVal) + 1
                : Math.max(1, Math.floor(parsedVal))
              : idx + 1;
          while (seenNums.has(num)) num += 1;
          seenNums.add(num);
          const providerLocked =
            Number(ep.isCharge ?? 0) === 1 ||
            Number(ep.isPay ?? 0) === 1 ||
            Boolean(ep.isVip) ||
            Boolean(ep.isLocked);
          return {
            chapterId: cleanText(
              String(
                ep.chapterId ??
                  ep.episodeId ??
                  ep.episode_id ??
                  ep.chapter_id ??
                  `ep-${num}`
              )
            ),
            episodeNumber: num,
            title: cleanText(ep.chapterName ?? ep.title, `EP ${num}`),
            isVipLocked: num <= 10 ? false : providerLocked || num === 11,
          };
        })
        .sort((a, b) => a.episodeNumber - b.episodeNumber);
    };

    const idCandidates = Array.from(
      new Set([idParam, 'book_id', 'drama_id', 'playlet_id', 'album_id', 'vid', 'bookId', 'id'])
    );
    const primaryDetailPath = canonicalProvider === 'iQIYI' ? '/allepisode' : '/detail';
    const primaryEpPath = epPath || '/allepisode';

    for (const candidateIdParam of idCandidates.slice(0, 3)) {
      const detailUrl = `${baseUrl}${primaryDetailPath}?${candidateIdParam}=${encodeURIComponent(bookId)}${langSuffix}&token=${token}`;
      const epUrl = `${baseUrl}${primaryEpPath}?${candidateIdParam}=${encodeURIComponent(bookId)}${langSuffix}&token=${token}`;
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
              (canonicalProvider === 'MeloLoV2' &&
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
            provider: canonicalProvider,
            updatedAt:
              typeof rawUpdatedAt === 'number' || typeof rawUpdatedAt === 'string'
                ? rawUpdatedAt
                : undefined,
          };
        }
        if (epUrl === detailUrl) {
          episodes = parseEpisodesArray(json, raw);
        }
      }

      if (epRes.status === 'fulfilled' && epRes.value && epRes.value.ok) {
        const json = (await epRes.value.json()) as Record<string, unknown>;
        const parsedEps = parseEpisodesArray(json);
        if (parsedEps.length > 0) {
          episodes = parsedEps;
        }
      }

      if (drama && episodes.length === 0) {
        for (const altEpPath of ['/episodes', '/allepisode', '/detail']) {
          if (altEpPath === primaryEpPath) continue;
          const altRes = await fetch(
            `${baseUrl}${altEpPath}?${candidateIdParam}=${encodeURIComponent(bookId)}${langSuffix}&token=${token}`,
            { signal: AbortSignal.timeout(5000) }
          ).catch(() => null);
          if (altRes && altRes.ok) {
            const altJson = (await altRes.json().catch(() => null)) as Record<string, unknown> | null;
            if (altJson) {
              const parsedEps = parseEpisodesArray(altJson);
              if (parsedEps.length > 0) {
                episodes = parsedEps;
                break;
              }
            }
          }
        }
      }

      if (drama || episodes.length > 0) break;
      const detailStatus = detailRes.status === 'fulfilled' ? detailRes.value.status : 0;
      if (detailStatus === 401 || detailStatus === 403 || detailStatus === 503) break;
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

const ROOT_CONTAINER_RE =
  /<div\s+id=["']root["']\s*>[\s\S]*?<\/div>(?=\s*(?:<script\b|<\/body>|<!--))/i;

function injectRootSsrMarkup(html: string, innerHtml: string): string {
  if (!innerHtml) return html;
  if (ROOT_CONTAINER_RE.test(html)) {
    return html.replace(ROOT_CONTAINER_RE, `<div id="root">${innerHtml}</div>`);
  }
  return html.replace(
    /<div\s+id=["']root["']\s*>\s*<\/div>/i,
    `<div id="root">${innerHtml}</div>`
  );
}

type BrowserBootVariant =
  | 'home'
  | 'grid'
  | 'detail'
  | 'rewards'
  | 'account'
  | 'notfound';

function buildBrowserBootShellHtml(variant: BrowserBootVariant): string {
  const sidebarItems = Array.from({ length: 7 })
    .map(
      () =>
        '<div class="kd-sk" style="height:38px;border-radius:12px;"></div>'
    )
    .join('');

  const cardsHtml = (count: number) =>
    `<div class="kd-boot-cards">${Array.from({ length: count })
      .map(
        () =>
          '<div><div class="kd-sk kd-boot-card-poster"></div><div class="kd-sk kd-boot-card-line"></div></div>'
      )
      .join('')}</div>`;

  let bodyInner = '';
  if (variant === 'home') {
    const chips = Array.from({ length: 7 })
      .map(() => '<div class="kd-sk kd-boot-chip"></div>')
      .join('');
    bodyInner = `
      <div class="kd-sk kd-boot-hero"></div>
      <div class="kd-boot-chips">${chips}</div>
      <div class="kd-sk kd-boot-row-head"></div>
      ${cardsHtml(5)}
      <div class="kd-sk kd-boot-row-head"></div>
      ${cardsHtml(5)}
    `;
  } else if (variant === 'detail') {
    bodyInner = `
      <div class="kd-sk kd-boot-panel" style="min-height:260px;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
        <div class="kd-sk" style="width:160px;aspect-ratio:2/3;border-radius:14px;flex:0 0 auto;"></div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:12px;">
          <div class="kd-sk" style="height:28px;width:68%;border-radius:8px;"></div>
          <div class="kd-sk" style="height:16px;width:45%;border-radius:6px;"></div>
          <div class="kd-sk" style="height:72px;width:100%;border-radius:10px;"></div>
          <div class="kd-sk" style="height:42px;width:180px;border-radius:9999px;"></div>
        </div>
      </div>
      <div class="kd-sk kd-boot-row-head"></div>
      ${cardsHtml(5)}
    `;
  } else if (variant === 'rewards' || variant === 'account') {
    bodyInner = `
      <div class="kd-sk kd-boot-panel" style="height:180px;"></div>
      <div class="kd-sk kd-boot-panel" style="height:150px;"></div>
      <div class="kd-sk kd-boot-panel" style="height:220px;"></div>
    `;
  } else if (variant === 'notfound') {
    bodyInner = `
      <div class="kd-sk kd-boot-panel" style="max-width:560px;margin:40px auto;height:220px;"></div>
    `;
  } else {
    bodyInner = `
      <div class="kd-sk kd-boot-row-head" style="width:240px;height:30px;margin-bottom:20px;"></div>
      ${cardsHtml(10)}
    `;
  }

  return `<div class="kd-boot-root" aria-hidden="true">
    <header class="kd-boot-nav">
      <div class="kd-sk" style="width:136px;height:28px;border-radius:8px;"></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="kd-sk" style="width:36px;height:36px;border-radius:9999px;"></div>
        <div class="kd-sk" style="width:88px;height:34px;border-radius:9999px;"></div>
      </div>
    </header>
    <div class="kd-boot-body">
      <aside class="kd-boot-sidebar">${sidebarItems}</aside>
      <main class="kd-boot-main">${bodyInner}</main>
    </div>
  </div>`;
}

function replaceRootWithBrowserShell(
  html: string,
  variant: BrowserBootVariant
): string {
  return injectRootSsrMarkup(html, buildBrowserBootShellHtml(variant));
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
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const slug = (cleanText(drama.slug) || slugifyTitle(drama.title))
    .trim()
    .toLowerCase();
  const encodedSlug = encodeURIComponent(slug);
  const provSlug = getProviderRouteSlug(drama.provider);
  const canonicalPath = `/${provSlug}/detail/${encodedSlug}`;
  const canonicalUrl = `${brandOrigin}${canonicalPath}`;
  const watchPath = `/${provSlug}/watch/${encodedSlug}${safeEp > 1 ? `?ep=${safeEp}` : ''}`;
  const epWatchUrl =
    isWatchRoute || safeEp > 1 ? `${brandOrigin}${watchPath}` : canonicalUrl;
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
  const isId = effectiveLang === 'id';
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
  const ogImage = toAbsoluteImageUrl(drama.cover || DEFAULT_OG_IMAGE_PATH, brandOrigin);
  const keywordsList = [
    drama.title,
    isId ? `Nonton Gratis ${drama.title} Sub Indo` : `Watch Free ${drama.title} online`,
    'KanoDrama',
    'kano-drama.live',
    'Short Drama',
    'Drama Pendek',
    drama.provider,
    ...drama.tags,
  ].filter(Boolean);

  const meta = generateMetadata({
    page: 'drama',
    lang: effectiveLang,
    origin: brandOrigin,
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
    { '@type': 'ListItem', position: 1, name: isId ? 'Beranda' : 'Home', item: `${brandOrigin}/` },
    {
      '@type': 'ListItem',
      position: 2,
      name: drama.provider,
      item: `${brandOrigin}/provider/${provSlug}`,
    },
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
        image: ogImage,
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
  const resolvedOgImg = buildOgImageEndpointUrl(drama.cover || DEFAULT_OG_IMAGE_PATH, brandOrigin, pageTitle);
  const ogImageUrl = resolvedOgImg || primaryImg?.url || meta.openGraph.image;
  const ogSecureUrl = ogImageUrl.replace(/^http:\/\//i, 'https://');
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
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImageUrl)}" />
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
      return `<a href="${brandOrigin}/tag/${encodeURIComponent(tSlug)}">${escapeHtmlAttr(tg)}</a>`;
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
        `<li><a href="${brandOrigin}/${provSlug}/watch/${encodedSlug}?ep=${ep.num}">${escapeHtmlAttr(ep.label)}</a></li>`
    )
    .join('');
  const ssrRelatedLinksHtml =
    relatedItems.length > 0
      ? `<section aria-label="${isId ? 'Rekomendasi Drama & Film Terkait' : 'Related Dramas & Movies'}"><h2>${isId ? 'Rekomendasi Drama & Film Terkait' : 'Related Dramas & Movies'}</h2><ul>${relatedItems
          .map((item) => {
            const rProvSlug = getProviderRouteSlug(item.provider);
            const rSlug = encodeURIComponent(item.slug);
            return `<li><a href="${brandOrigin}/${rProvSlug}/detail/${rSlug}">${escapeHtmlAttr(item.title)}</a></li>`;
          })
          .join('')}</ul></section>`
      : '';

  const ssrDramaRootHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">${isId ? 'Beranda' : 'Home'}</a> / <a href="${brandOrigin}/provider/${provSlug}">${escapeHtmlAttr(drama.provider)}</a> / <span>${escapeHtmlAttr(drama.title)}</span></nav>
    <article itemscope itemtype="https://schema.org/TVSeries">
      <img itemprop="image" src="${escapeHtmlAttr(ogImageUrl)}" alt="${escapeHtmlAttr(drama.title)}" width="360" height="540" />
      <h1 itemprop="name">${escapeHtmlAttr(drama.title)}</h1>
      <p><a href="${brandOrigin}/provider/${provSlug}">${escapeHtmlAttr(drama.provider)}</a> · ${epCount} ${isId ? 'Episode' : 'Episodes'} · ${isId ? '~1-2 mnt/ep' : '~1-2 min/ep'} · ${isId ? 'Subtitle Indonesia & Multi-Bahasa' : 'Indonesian & Multi-Language Subtitles'}</p>
      ${drama.protagonist ? `<p>${isId ? 'Pemeran' : 'Cast'}: ${escapeHtmlAttr(drama.protagonist)}</p>` : ''}
      ${ssrTagLinks ? `<p>${isId ? 'Genre' : 'Genres'}: ${ssrTagLinks}</p>` : ''}
      <p itemprop="description">${escapeHtmlAttr(seriesDescription)}</p>
      <p><a href="${brandOrigin}${escapeHtmlAttr(watchPath)}">${isId ? `Nonton Gratis Episode ${safeEp}` : `Watch Free Episode ${safeEp}`}</a></p>
      <section aria-label="Episodes">
        <h2>${isId ? 'Daftar Episode' : 'Episodes'} (${epCount})</h2>
        <ul>${ssrEpisodeLinks}</ul>
      </section>
      ${ssrRelatedLinksHtml}
      <nav aria-label="Catalog Navigation"><a href="${brandOrigin}/explore">${isId ? 'Jelajahi Drama' : 'Explore Dramas'}</a> · <a href="${brandOrigin}/providers">${isId ? 'Direktori Provider' : 'All Providers'}</a> · <a href="${brandOrigin}/provider/${provSlug}">${escapeHtmlAttr(drama.provider)}</a> · <a href="${brandOrigin}/movies">${isId ? 'Film HD' : 'HD Movies'}</a></nav>
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
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const safeEp = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  const movieSlug = (cleanText(movie.slug) || slugifyTitle(movie.title))
    .trim()
    .toLowerCase();
  const encodedMovieSlug = encodeURIComponent(movieSlug);
  const canonicalPath = `/movie/detail/${encodedMovieSlug}`;
  const canonicalUrl = `${brandOrigin}${canonicalPath}`;
  const isSeries = movie.type === 'series' && episodes.length > 1;
  const watchPath = `/movie/watch/${encodedMovieSlug}${isSeries && safeEp > 1 ? `?ep=${safeEp}` : ''}`;
  const epWatchUrl =
    isWatchRoute || (isSeries && safeEp > 1)
      ? `${brandOrigin}${watchPath}`
      : canonicalUrl;
  const yearTag = movie.year ? ` (${movie.year})` : '';
  const rawDesc = cleanSeoDescription(movie.synopsis || movie.description || '');
  const movieProviderLabel = movie.app === 'lookseries' ? 'LookSeries' : 'LK21';
  const effectiveLang =
    explicitQueryLang ??
    detectLanguageFromContent(
      {
        title: movie.title,
        description: rawDesc,
        tags: movie.genres,
        area: movie.area,
        provider: movieProviderLabel,
      },
      'en'
    );
  const isId = effectiveLang === 'id';
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
    brandOrigin
  );
  const keywordsList = [
    isId
      ? `Nonton Gratis ${cleanMovieBaseTitle} Sub Indo`
      : `Watch Free ${cleanMovieBaseTitle} online`,
    `${cleanMovieBaseTitle} full movie HD`,
    'KanoDrama',
    'kano-drama.live',
    movieProviderLabel,
    ...movie.genres,
    movie.area,
    movie.year,
    movie.director,
    'watch free movies HD',
  ].filter(Boolean);

  const meta = generateMetadata({
    page: 'movie',
    lang: effectiveLang,
    origin: brandOrigin,
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
          image: ogImage,
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
          image: ogImage,
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
    { '@type': 'ListItem', position: 1, name: isId ? 'Beranda' : 'Home', item: `${brandOrigin}/` },
    { '@type': 'ListItem', position: 2, name: isId ? 'Film' : 'Movies', item: `${brandOrigin}/movies` },
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
  const resolvedOgImg = buildOgImageEndpointUrl(
    movie.poster || movie.cover || DEFAULT_OG_IMAGE_PATH,
    brandOrigin,
    pageTitle
  );
  const ogImageUrl = resolvedOgImg || primaryImg?.url || meta.openGraph.image;
  const ogSecureUrl = ogImageUrl.replace(/^http:\/\//i, 'https://');
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
    <meta property="og:image" content="${escapeHtmlAttr(ogImageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(desc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImageUrl)}" />
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
            return `<li><a href="${brandOrigin}/movie/watch/${encodedMovieSlug}?ep=${epNum}">${escapeHtmlAttr(epTitle)}</a></li>`;
          })
          .join('')}</ul>`
      : '';
  const movieGenreLinks = movie.genres
    .slice(0, 6)
    .map((g) => {
      const gSlug = slugifyTitle(g);
      return gSlug
        ? `<a href="${brandOrigin}/tag/${encodeURIComponent(gSlug)}">${escapeHtmlAttr(g)}</a>`
        : escapeHtmlAttr(g);
    })
    .join(' · ');
  const ssrRelatedMovieHtml =
    relatedItems.length > 0
      ? `<section aria-label="${isId ? 'Rekomendasi Film & Drama Terkait' : 'Related Movies & Dramas'}"><h2>${isId ? 'Rekomendasi Film & Drama Terkait' : 'Related Movies & Dramas'}</h2><ul>${relatedItems
          .map(
            (item) =>
              `<li><a href="${brandOrigin}/${getProviderRouteSlug(item.provider)}/detail/${encodeURIComponent(item.slug)}">${escapeHtmlAttr(item.title)}</a></li>`
          )
          .join('')}</ul></section>`
      : '';
  const ssrMovieRootHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">${isId ? 'Beranda' : 'Home'}</a> / <a href="${brandOrigin}/movies">${isId ? 'Film' : 'Movies'}</a> / <span>${escapeHtmlAttr(displayMovieTitle)}</span></nav>
    <article itemscope itemtype="${isSeries ? 'https://schema.org/TVSeries' : 'https://schema.org/Movie'}">
      <img itemprop="image" src="${escapeHtmlAttr(ogImageUrl)}" alt="${escapeHtmlAttr(displayMovieTitle)}" width="360" height="540" />
      <h1 itemprop="name">${escapeHtmlAttr(displayMovieTitle)}</h1>
      <p>${[movieProviderLabel, movie.quality || 'HD', 'duration' in movie && typeof movie.duration === 'string' ? movie.duration : '', movie.year, movie.area, isId ? 'Subtitle Indonesia & Multi-Bahasa' : 'Indonesian & Multi-Language Subtitles'].filter((v): v is string => Boolean(v)).map((v) => escapeHtmlAttr(v)).join(' · ')}</p>
      ${movieGenreLinks ? `<p>${isId ? 'Genre' : 'Genres'}: ${movieGenreLinks}</p>` : ''}
      ${movie.director ? `<p>${isId ? 'Sutradara' : 'Director'}: ${escapeHtmlAttr(movie.director)}</p>` : ''}
      ${movie.actors?.length ? `<p>${isId ? 'Pemeran' : 'Cast'}: ${escapeHtmlAttr(movie.actors.slice(0, 8).join(', '))}</p>` : ''}
      <p itemprop="description">${escapeHtmlAttr(seriesDescription)}</p>
      <p><a href="${brandOrigin}${escapeHtmlAttr(watchPath)}">${isId ? 'Nonton Gratis Sekarang' : 'Watch Free Now'}</a></p>
      ${movieEpLinks}
      ${ssrRelatedMovieHtml}
      <nav aria-label="Catalog Navigation"><a href="${brandOrigin}/movies">${isId ? 'Semua Film HD' : 'All HD Movies'}</a> · <a href="${brandOrigin}/explore">${isId ? 'Jelajahi Drama' : 'Explore Dramas'}</a> · <a href="${brandOrigin}/providers">${isId ? 'Direktori Provider' : 'All Providers'}</a></nav>
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
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const canonicalUrl = `${brandOrigin}${landing.canonicalPath}`;
  const ogImage = buildOgImageEndpointUrl(DEFAULT_OG_IMAGE_PATH, brandOrigin, landing.title);
  const ogSecureUrl = ogImage.replace(/^http:\/\//i, 'https://');
  const htmlLang = getHtmlLangTag(ssrLang);
  const ogLocale = getOgLocaleTag(ssrLang);

  const itemListElements = items.slice(0, 12).map((item, idx) => {
    const title = cleanText(item.title, 'Short Drama');
    const slug = cleanText(item.slug) || slugifyTitle(title);
    const provSlug = getProviderRouteSlug(cleanText(item.provider, 'DramaBoxV2'));
    return {
      '@type': 'ListItem',
      position: idx + 1,
      name: title,
      url: `${brandOrigin}/${provSlug}/detail/${encodeURIComponent(slug)}`,
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
          url: `${brandOrigin}/`,
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
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${brandOrigin}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: landing.basePath === 'tag' ? 'Tags' : 'Genres',
            item: `${brandOrigin}/explore`,
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

  const ssrLinksHtml =
    itemListElements.length > 0
      ? `<ul>${itemListElements
          .map(
            (el) =>
              `<li><a href="${escapeHtmlAttr(el.url)}">${escapeHtmlAttr(el.name)}</a></li>`
          )
          .join('')}</ul>`
      : '';
  const ssrLandingHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">Home</a> / <a href="${brandOrigin}/explore">Explore</a> / <span>${escapeHtmlAttr(landing.h1)}</span></nav>
    <h1>${escapeHtmlAttr(landing.h1)}</h1>
    <p>${escapeHtmlAttr(landing.description)}</p>
    ${ssrLinksHtml}
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, ssrLandingHtml);
}

interface HomeSsrFeaturedData {
  dramas: SsrRelatedLink[];
  movies: SsrRelatedLink[];
}

function buildSsrHomeRootHtml(
  ssrLang: LanguageCode,
  description: string,
  featured?: HomeSsrFeaturedData
): string {
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const isId = ssrLang === 'id';
  const topProviders = [
    { name: 'DramaBox V2', slug: 'dramaboxv2' },
    { name: 'NetShort', slug: 'netshort' },
    { name: 'MeloLo V2', slug: 'melolov2' },
    { name: 'AnyReel', slug: 'anyreel' },
    { name: 'ReelShort V2', slug: 'reelshortv2' },
    { name: 'GoodShort', slug: 'goodshort' },
    { name: 'DramaWave', slug: 'dramawave' },
    { name: 'FreeReels', slug: 'freereels' },
  ];
  const featuredItemsHtml =
    featured && (featured.dramas.length > 0 || featured.movies.length > 0)
      ? `<section aria-label="${isId ? 'Drama Pendek & Film Populer' : 'Popular Short Dramas & Movies'}"><h2>${isId ? 'Drama Pendek &amp; Film Populer di KanoDrama' : 'Popular Short Dramas &amp; Movies on KanoDrama'}</h2><ul>${featured.dramas
          .slice(0, 12)
          .map(
            (d) =>
              `<li><a href="${brandOrigin}/${getProviderRouteSlug(d.provider)}/detail/${encodeURIComponent(d.slug)}">${escapeHtmlAttr(d.title)}</a></li>`
          )
          .join('')}${featured.movies
          .slice(0, 6)
          .map(
            (m) =>
              `<li><a href="${brandOrigin}/movie/detail/${encodeURIComponent(m.slug)}">${escapeHtmlAttr(m.title)}</a></li>`
          )
          .join('')}</ul></section>`
      : '';

  return `<main class="max-w-6xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <header>
      <h1>${isId ? 'KanoDrama — Platform Streaming Drama Pendek, Serial Asia &amp; Film Sub Indo Gratis' : 'KanoDrama — Free Short Dramas, Asian Series &amp; HD Movies Streaming'}</h1>
      <p>${escapeHtmlAttr(description)}</p>
    </header>
    <nav aria-label="Main Categories">
      <ul>
        <li><a href="${brandOrigin}/">${isId ? 'Beranda KanoDrama' : 'KanoDrama Home'}</a></li>
        <li><a href="${brandOrigin}/explore">${isId ? 'Jelajahi Semua Drama' : 'Explore All Dramas'}</a></li>
        <li><a href="${brandOrigin}/movies">${isId ? 'Film &amp; Serial HD' : 'HD Movies &amp; Cinema'}</a></li>
        <li><a href="${brandOrigin}/providers">${isId ? 'Direktori Provider' : 'Providers Directory'}</a></li>
        <li><a href="${brandOrigin}/trending">${isId ? 'Drama Trending' : 'Trending Short Dramas'}</a></li>
        <li><a href="${brandOrigin}/latest">${isId ? 'Rilis Terbaru' : 'Latest Releases'}</a></li>
        <li><a href="${brandOrigin}/vip">${isId ? 'Koleksi VIP' : 'VIP Selection'}</a></li>
      </ul>
    </nav>
    <nav aria-label="Drama Providers">
      <h2>${isId ? 'Platform &amp; Provider Populer' : 'Popular Drama Providers'}</h2>
      <ul>${topProviders
        .map(
          (p) =>
            `<li><a href="${brandOrigin}/provider/${p.slug}">${escapeHtmlAttr(p.name)}</a></li>`
        )
        .join('')}</ul>
    </nav>
    <nav aria-label="Genres">
      <h2>${isId ? 'Genre &amp; Koleksi Pilihan' : 'Curated Genres &amp; Collections'}</h2>
      <ul>${CURATED_PROGRAMMATIC_PAGES.slice(0, 8)
        .map(
          (g) =>
            `<li><a href="${brandOrigin}/genre/${encodeURIComponent(g.slug)}">${escapeHtmlAttr(g.label)}</a></li>`
        )
        .join('')}</ul>
    </nav>
    ${featuredItemsHtml}
  </main>`;
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
    | 'dashboard'
    | 'rewards',
  pathname: string,
  ssrLang: LanguageCode,
  homeFeatured?: HomeSsrFeaturedData
): string {
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const ogImage = `${brandOrigin}${DEFAULT_OG_IMAGE_PATH}`;
  const meta = generateMetadata({
    page,
    lang: ssrLang,
    origin: brandOrigin,
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
    rewards: ssrLang === 'id' ? 'Poin & Referral' : 'Rewards & Referral',
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

  const isIdSsr = ssrLang === 'id';
  const rewardsFaqGraph =
    page === 'rewards'
      ? [
          {
            '@type': 'FAQPage',
            mainEntity: isIdSsr
                ? [
                  {
                    '@type': 'Question',
                    name: 'Bagaimana cara nonton drama dapat poin di KanoDrama?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Daftar atau masuk dengan akun Anda untuk langsung memperoleh bonus login pertama +10.000 poin (1x per akun), lalu tonton drama pendek atau film secara aktif pada kecepatan 1x. Anda memperoleh +20 poin per menit otomatis hingga 60 menit per hari (dikalikan multiplier level akun hingga 1,6x), +50 poin episode baru (minimal 15 detik), check-in harian +500 poin dan Hari ke-7 +2.000 poin (total 5.000 poin/minggu), serta bonus milestone 15, 30, dan 60 menit (+150 / +300 / +600 poin) hingga batas 2.500 poin nonton harian yang reset otomatis setiap pukul 00.00 WIB.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Berapa nilai tukar poin dan minimal penarikan saldo DANA, Bank, PayPal, atau USDT?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Nilai tukar resmi adalah 100.000 poin = 1 USDT ($1.00 USD) = Rp 18.200. Penarikan lokal IDR (DANA, GoPay, OVO, ShopeePay, LinkAja, Bank Transfer BCA/BRI/BNI/Mandiri/Jago/SeaBank) minimal Rp 50.000, dan penarikan global (PayPal, Wise, USDT Polygon/TRC20/BEP20/ERC20) minimal $5.00 USD.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Bagaimana cara mendapatkan bonus referral +200 poin & +2.000 poin?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Bagikan link referral resmi kano-drama.live Anda. Teman yang mengikat kode referral Anda langsung menerima +200 poin, dan setelah menyelesaikan total 1 jam (3.600 detik) waktu tonton aktif terverifikasi, +2.000 poin otomatis masuk ke saldo Anda.',
                    },
                  },
                ]
              : [
                  {
                    '@type': 'FAQPage',
                    mainEntity: [
                      {
                        '@type': 'Question',
                        name: 'How do I earn points watching dramas on KanoDrama?',
                        acceptedAnswer: {
                          '@type': 'Answer',
                          text: 'Sign in to claim a +10,000 points first-login welcome bonus (once per account), then actively watch short dramas or movies at normal 1x speed. You earn +20 points/min automatically up to 60 minutes daily (scaled up to 1.6x by your account level), +50 points per new episode (15s minimum), +500 points daily check-in and +2,000 points on Day 7 (5,000 points/week), plus +150 / +300 / +600 milestone bonuses up to 2,500 daily watch points (all daily missions reset at 17:00 UTC).',
                        },
                      },
                      {
                        '@type': 'Question',
                        name: 'What is the points conversion rate and minimum withdrawal?',
                        acceptedAnswer: {
                          '@type': 'Answer',
                          text: 'The official rate is 100,000 points = 1 USDT ($1.00 USD). Global payouts (PayPal, Wise, USDT Polygon/TRC20/BEP20/ERC20) start from 5.00 USDT ($5.00 USD).',
                        },
                      },
                      {
                        '@type': 'Question',
                        name: 'How do the +200 bind bonus and +2,000 referral bonus work?',
                        acceptedAnswer: {
                          '@type': 'Answer',
                          text: 'Share your official kano-drama.live referral link. Friends who bind your referral code receive +200 bonus points immediately, and once they complete 1 hour (3,600 seconds) of verified active watch time, +2,000 points are automatically credited to your balance.',
                        },
                      },
                    ],
                  },
                ],
          },
        ]
      : [];

  const jsonLd =
    page === 'home'
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${brandOrigin}/#organization`,
              name: 'KanoDrama',
              alternateName: 'Kano Drama',
              url: `${brandOrigin}/`,
              logo: {
                '@type': 'ImageObject',
                url: `${brandOrigin}${BRAND_LOGO_ICON_PATH}`,
              },
              description: meta.description,
              sameAs: ['https://t.me/kanodrama'],
            },
            {
              '@type': 'WebSite',
              '@id': `${brandOrigin}/#website`,
              name: 'KanoDrama',
              inLanguage: meta.inLanguage,
              url: `${brandOrigin}/`,
              publisher: {
                '@id': `${brandOrigin}/#organization`,
              },
              description: meta.description,
              potentialAction: {
                '@type': 'SearchAction',
                target: `${brandOrigin}/?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            },
          ],
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
                url: `${brandOrigin}/`,
              },
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${brandOrigin}/` },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: sectionLabelMap[page] || 'Browse',
                  item: meta.canonicalUrl,
                },
              ],
            },
            ...rewardsFaqGraph,
          ],
        };

  const primaryImg = meta.openGraph.images[0];
  const resolvedOgImg = buildOgImageEndpointUrl(DEFAULT_OG_IMAGE_PATH, brandOrigin, meta.openGraph.title);
  const ogImgUrl = resolvedOgImg || primaryImg?.url || meta.openGraph.image;
  const ogSecureUrl = ogImgUrl.replace(/^http:\/\//i, 'https://');
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
    <meta property="og:image" content="${escapeHtmlAttr(ogImgUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(meta.twitter.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(meta.twitter.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImgUrl)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
  `;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );

  if (page === 'home') {
    return injectRootSsrMarkup(
      withHead,
      buildSsrHomeRootHtml(ssrLang, meta.description, homeFeatured)
    );
  }
  if (page === 'rewards') {
    const ssrRewardsHtml = isIdSsr
      ? `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
      <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">Home</a> / <span>${escapeHtmlAttr(sectionLabelMap.rewards)}</span></nav>
      <h1>Nonton Drama China &amp; Short Drama Dapat Poin &amp; Saldo — Reward KanoDrama</h1>
      <p>${escapeHtmlAttr(meta.description)}</p>
      <section>
        <h2>Cara Mengumpulkan Poin KanoDrama</h2>
        <ul>
          <li>Bonus login pertama akun baru: +10.000 poin otomatis saat pertama kali masuk (1x per akun).</li>
          <li>Tonton drama pendek &amp; film aktif (kecepatan normal): +20 poin per menit otomatis (maksimal 60 menit/hari) × multiplier level akun (Bronze 1.0x hingga Platinum 1.6x).</li>
          <li>Bonus episode baru: +50 poin per episode setelah minimal 15 detik menonton terverifikasi.</li>
          <li>Check-in harian &amp; streak 7 hari: +500 poin/hari (H-1 s.d. H-6) dan +2.000 poin di H-7 (total 5.000 poin/minggu, reset pukul 00.00 WIB).</li>
          <li>Bonus milestone harian (klaim manual setelah target tercapai): +150 poin (15 menit), +300 poin (30 menit), dan +600 poin (60 menit), dengan batas poin nonton harian 2.500 poin.</li>
          <li>Program Referral KanoDrama: +200 poin saat teman mengikat kode referral Anda dan +2.000 poin setelah teman menyelesaikan 1 jam waktu tonton terverifikasi.</li>
        </ul>
      </section>
      <section>
        <h2>Konversi Poin &amp; Metode Penarikan Resmi</h2>
        <p>100.000 poin = 1 USDT ($1.00 USD) = Rp 18.200 IDR. Minimal penarikan lokal Rp 50.000 ke DANA, GoPay, OVO, ShopeePay, LinkAja, serta transfer bank BCA, BRI, BNI, Mandiri, BSI, CIMB Niaga, Bank Jago, SeaBank, Permata, dan BTN. Minimal penarikan global $5.00 USD ke PayPal, Wise, dan USDT (Polygon, TRC20, BEP20, ERC20).</p>
      </section>
      <nav aria-label="Navigation"><a href="${brandOrigin}/">Home</a> · <a href="${brandOrigin}/explore">Explore Drama</a> · <a href="${brandOrigin}/movies">Movies</a> · <a href="${brandOrigin}/providers">Providers</a> · <a href="${brandOrigin}/trending">Trending</a></nav>
    </main>`
      : `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
      <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">Home</a> / <span>${escapeHtmlAttr(sectionLabelMap.rewards)}</span></nav>
      <h1>Watch Short Dramas &amp; Movies to Earn Points &amp; Cash — KanoDrama Rewards</h1>
      <p>${escapeHtmlAttr(meta.description)}</p>
      <section>
        <h2>How to Earn Points on KanoDrama</h2>
        <ul>
          <li>First-login welcome bonus: +10,000 points credited automatically on your first sign-in (once per account).</li>
          <li>Watch short dramas &amp; movies actively (normal 1x speed): +20 points per minute automatically (up to 60 minutes/day) × account level multiplier (Bronze 1.0x up to Platinum 1.6x).</li>
          <li>New episode bonus: +50 points per episode after at least 15 seconds of verified active playback.</li>
          <li>Daily check-in &amp; 7-day streak bonus: +500 points/day (Days 1–6) and +2,000 points on Day 7 (5,000 points/week total, resets at 17:00 UTC).</li>
          <li>Daily milestone bonuses (manual claim once reached): +150 points (15 min), +300 points (30 min), and +600 points (60 min), within a 2,500 daily watch points cap.</li>
          <li>KanoDrama Referral Program: +200 points on valid referral code bind and +2,000 points once your friend completes 1 hour of verified active watch time.</li>
        </ul>
      </section>
      <section>
        <h2>Points Conversion &amp; Official Payout Methods</h2>
        <p>100,000 points = 1 USDT ($1.00 USD). Minimum global withdrawal 5.00 USDT ($5.00 USD) via PayPal, Wise, and USDT (Polygon, TRC20, BEP20, ERC20).</p>
      </section>
      <nav aria-label="Navigation"><a href="${brandOrigin}/">Home</a> · <a href="${brandOrigin}/explore">Explore Drama</a> · <a href="${brandOrigin}/movies">Movies</a> · <a href="${brandOrigin}/providers">Providers</a> · <a href="${brandOrigin}/trending">Trending</a></nav>
    </main>`;
    return injectRootSsrMarkup(withHead, ssrRewardsHtml);
  }
  if (!isPrivatePage) {
    const ssrSectionRootHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
      <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">Home</a> / <span>${escapeHtmlAttr(sectionLabelMap[page] || 'Browse')}</span></nav>
      <h1>${escapeHtmlAttr(meta.title)}</h1>
      <p>${escapeHtmlAttr(meta.description)}</p>
      <nav aria-label="Navigation"><a href="${brandOrigin}/">Home</a> · <a href="${brandOrigin}/explore">Explore</a> · <a href="${brandOrigin}/movies">Movies</a> · <a href="${brandOrigin}/providers">Providers</a> · <a href="${brandOrigin}/trending">Trending</a> · <a href="${brandOrigin}/rewards">Rewards</a></nav>
    </main>`;
    return injectRootSsrMarkup(withHead, ssrSectionRootHtml);
  }
  return withHead;
}

function injectProviderSeoIntoHtml(
  html: string,
  origin: string,
  provider: SsrProviderName,
  pathname: string,
  ssrLang: LanguageCode,
  items: Array<Record<string, unknown>> = []
): string {
  const brandOrigin = DEFAULT_SITE_ORIGIN;
  const ogImage = `${brandOrigin}${DEFAULT_OG_IMAGE_PATH}`;
  const provSlug = getProviderRouteSlug(provider);
  const canonicalPath = `/provider/${provSlug}`;
  const meta = generateMetadata({
    page: 'provider',
    lang: ssrLang,
    origin: brandOrigin,
    pathname: pathname || canonicalPath,
    providerName: provider,
    image: ogImage,
    keywords: [
      provider,
      `${provider} Short Drama`,
      'KanoDrama',
      'kano-drama.live',
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
      url: `${brandOrigin}/${itemProvSlug}/detail/${encodeURIComponent(slug)}`,
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
          url: `${brandOrigin}/`,
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
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${brandOrigin}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${brandOrigin}/providers` },
          { '@type': 'ListItem', position: 3, name: provider, item: meta.canonicalUrl },
        ],
      },
    ],
  };

  const primaryImg = meta.openGraph.images[0];
  const resolvedOgImg = buildOgImageEndpointUrl(DEFAULT_OG_IMAGE_PATH, brandOrigin, meta.openGraph.title);
  const ogImgUrl = resolvedOgImg || primaryImg?.url || meta.openGraph.image;
  const ogSecureUrl = ogImgUrl.replace(/^http:\/\//i, 'https://');
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
    <meta property="og:image" content="${escapeHtmlAttr(ogImgUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogSecureUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${primaryImg?.width ?? 1200}" />
    <meta property="og:image:height" content="${primaryImg?.height ?? 630}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImgAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(meta.twitter.title)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(meta.twitter.description)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImgUrl)}" />
    <script type="application/ld+json" id="kano-drama-jsonld">${JSON.stringify(
      jsonLd
    ).replace(/<\/script>/gi, '<\\/script>')}</script>
  `;

  const ssrItemsHtml =
    itemListElements.length > 0
      ? `<ul>${itemListElements
          .map(
            (el) =>
              `<li><a href="${escapeHtmlAttr(el.url)}">${escapeHtmlAttr(el.name)}</a></li>`
          )
          .join('')}</ul>`
      : '';

  const ssrProviderBodyHtml = `<main class="max-w-5xl mx-auto px-4 py-8 text-[#FAFAFA]">
    <nav aria-label="Breadcrumb"><a href="${brandOrigin}/">Home</a> / <a href="${brandOrigin}/providers">Providers</a> / <span>${escapeHtmlAttr(provider)}</span></nav>
    <h1>${escapeHtmlAttr(provider)} Short Dramas on KanoDrama</h1>
    <p>${escapeHtmlAttr(meta.description)}</p>
    ${ssrItemsHtml}
    <nav aria-label="Provider Navigation"><a href="${brandOrigin}/providers">All Providers</a> · <a href="${brandOrigin}/explore">Explore Dramas</a> · <a href="${brandOrigin}/movies">HD Movies</a></nav>
  </main>`;

  const withHead = applyHtmlLangTag(stripStaticSeoHeadTags(html), ssrLang).replace(
    '</head>',
    `${seoHeadBlock}\n  </head>`
  );
  return injectRootSsrMarkup(withHead, ssrProviderBodyHtml);
}

export async function createServerApp(options?: { enableVite?: boolean }) {
  const enableVite = options?.enableVite ?? !IS_PROD;
  const app = express();
  app.set('trust proxy', 1);
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
  app.use(
    (
      err: unknown,
      req: Request,
      res: Response,
      next: (err?: unknown) => void
    ) => {
      if (!err) {
        next();
        return;
      }
      const errObj = err as {
        type?: string;
        status?: number;
        statusCode?: number;
        message?: string;
      };
      const isJsonSyntaxError =
        err instanceof SyntaxError &&
        (errObj.type === 'entity.parse.failed' ||
          errObj.status === 400 ||
          errObj.statusCode === 400);
      const isPayloadTooLarge =
        errObj.type === 'entity.too.large' ||
        errObj.status === 413 ||
        errObj.statusCode === 413;

      if (req.path.startsWith('/api') || isJsonSyntaxError || isPayloadTooLarge) {
        if (isPayloadTooLarge) {
          res.status(413).json({
            ok: false,
            error: 'Request payload too large (max 256kb)',
          });
          return;
        }
        if (isJsonSyntaxError) {
          res.status(400).json({
            ok: false,
            error: 'Malformed JSON request body',
          });
          return;
        }
        const status =
          typeof errObj.status === 'number' && errObj.status >= 400 && errObj.status < 600
            ? errObj.status
            : 500;
        res.status(status).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Internal API middleware error',
        });
        return;
      }
      next(err);
    }
  );
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
  if (!IS_PROD && enableVite) {
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
    try {
      const db = await pingDb();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, service: 'kano-drama-ssr', db });
    } catch (err) {
      res.status(503).json({
        ok: false,
        service: 'kano-drama-ssr',
        db: { ok: false, latencyMs: 0, engine: 'error' },
        error: err instanceof Error ? err.message : 'Health check failed',
      });
    }
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
    try {
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
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to trigger home revalidation',
      });
    }
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
    try {
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
            'User-Agent': 'KanoDrama/2.0 (+https://kano-drama.live)',
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
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load platforms',
      });
    }
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
    const rawPath = req.url || '/';
    if (rawPath === '/' || rawPath.startsWith('/?')) {
      res.status(400).json({
        ok: false,
        success: false,
        error: 'Missing Mola provider endpoint path',
      });
      return;
    }
    if (rawPath.includes('..') || rawPath.includes('@') || !rawPath.startsWith('/')) {
      res.status(400).json({ ok: false, success: false, error: 'Invalid API gateway path' });
      return;
    }
    if (
      /^\/(dramabox|storyreel|vibeshort|shortmax|idrama|reelshort)(?:\/|$|\?)/i.test(
        rawPath
      )
    ) {
      res.status(410).json({
        ok: false,
        success: false,
        error: 'Legacy v1 provider endpoint is disabled; use canonical v2.',
      });
      return;
    }

    const canonicalGatewayPath = rawPath
      .replace(/^\/melolov2(?=\/|\?|$)/i, '/melolo')
      .replace(/^\/idrama_v2(?=\/|\?|$)/i, '/idramav2')
      .replace(/^\/reelshort_v2(?=\/|\?|$)/i, '/reelshortv2');

    const token = getMolaToken();
    if (!token) {
      res.status(503).json({
        success: false,
        error: 'Server MOLA_API_TOKEN is not configured.',
      });
      return;
    }

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(`${MOLATV_API_BASE}${canonicalGatewayPath}`);
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
        try {
          const parsed = JSON.parse(text);
          const acceptHeader = (req.get('accept') || '').toLowerCase();
          if (
            upstream.ok &&
            upstreamUrl.pathname.toLowerCase().endsWith('/decrypt') &&
            !acceptHeader.includes('application/json')
          ) {
            const pObj =
              parsed && typeof parsed === 'object'
                ? (parsed as Record<string, unknown>)
                : null;
            const dObj =
              pObj?.data && typeof pObj.data === 'object'
                ? (pObj.data as Record<string, unknown>)
                : pObj;
            const resolvedMediaUrl = cleanText(
              dObj?.url ??
                dObj?.videoUrl ??
                dObj?.video_url ??
                dObj?.streamUrl ??
                dObj?.stream_url ??
                pObj?.url ??
                pObj?.videoUrl
            );
            if (resolvedMediaUrl && /^https?:\/\//i.test(resolvedMediaUrl)) {
              const targetHeaders: Record<string, string> = {
                Accept: req.get('accept') || '*/*',
              };
              if (rangeHeader) {
                targetHeaders.Range = rangeHeader;
              }
              const mediaRes = await fetch(resolvedMediaUrl, {
                method: req.method === 'HEAD' ? 'HEAD' : 'GET',
                headers: targetHeaders,
                signal: AbortSignal.timeout(15000),
              });
              const mediaCt =
                mediaRes.headers.get('content-type') || 'video/mp4';
              res.status(mediaRes.status);
              res.setHeader('Content-Type', mediaCt);
              res.setHeader('Access-Control-Allow-Origin', '*');
              const mediaRange = mediaRes.headers.get('content-range');
              const mediaAcceptRanges = mediaRes.headers.get('accept-ranges');
              const mediaLen = mediaRes.headers.get('content-length');
              if (mediaRange) res.setHeader('Content-Range', mediaRange);
              if (mediaAcceptRanges) {
                res.setHeader('Accept-Ranges', mediaAcceptRanges);
              }
              if (mediaLen) res.setHeader('Content-Length', mediaLen);
              if (mediaRes.body) {
                pipeWebStreamToExpress(
                  mediaRes.body,
                  req,
                  res,
                  'Decrypted media stream interrupted'
                );
              } else {
                res.send(Buffer.from(await mediaRes.arrayBuffer()));
              }
              return;
            }
          }

          res.status(upstream.status);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          const sanitized = JSON.stringify(sanitizeMolaPayload(parsed));
          if (cacheableListGet && upstream.ok) {
            setCachedMolaApiResponse(molaCacheKey, upstream.status, sanitized);
            res.setHeader('X-Mola-Cache', 'MISS');
          } else if (
            upstream.ok &&
            /\/(search|cari|detail|list|rank|hot|new|recommend|foryou|drama|populer|terbaru|anime|asia)/i.test(
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
              upstreamUrl.searchParams.get('book_id') ??
                upstreamUrl.searchParams.get('drama_id') ??
                upstreamUrl.searchParams.get('playlet_id') ??
                upstreamUrl.searchParams.get('album_id') ??
                upstreamUrl.searchParams.get('vid') ??
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
          res.status(upstream.status);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    /(^|\.)(molatv\.id|assetsy\.de|playcdn\.de|videonode\.de|netshort\.com|dramaboxdb\.com|dramabox\.com|hwztchapter\.com|anyreel\.app|fizzopic\.org|melolostatic\.com|vidivo\.me|shortswave\.com|meloshort\.com|petadrama\.com|wolftv\.online|ibyteimg\.com|bytedrama\.com|bytedance\.com|byteoversea\.com|ibytedtos\.com|toutiaovod\.com|snssdk\.com|kalostv\.com|stardusttv\.cc|stardust-tv\.com|miniepisode\.media|aliyuncs\.com|aliyundrive\.com|ydstatic\.com|cloudfront\.net|my-drama\.tv|kjcdn\.com|drt768\.com|cdreader\.com|blinkdrama\.life|shorttv\.live|wetvinfo\.com|cubetv\.cc|janzhoutec\.com|flareflow\.tv|nsstorage\.space|freeshort\.xyz|toonshort\.com|tqshort\.com|dramadash\.app|cloudflarestream\.com|storyreel\.life|vibeshort\.live|farsunpteltd\.com|mydramawave\.com|tiktokcdn\.com|flextv\.cc|vigloo\.com|idrama\.video|goodshort\.com|crazymaplestudios\.com|joyreels\.com|jinchuanlingyun\.com|cloudonward\.net|iqiyipic\.com|iqiyi\.com|akamaized\.net|b-cdn\.net|bunnycdn\.com|fastly\.net|vimeocdn\.com|googleapis\.com)$/i;
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
            const parsed = new URL(current, DEFAULT_SITE_ORIGIN);
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
          host === 'kano-drama.live' ||
          host === 'www.kano-drama.live' ||
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

  const streamSigningSecret = getStreamSigningSecret();

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
    try {
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
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to sign stream url',
      });
    }
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

  app.get('/api/auth/config', (_req: Request, res: Response) => {
    try {
      const googleClientId = getPrimaryGoogleClientId();
      const hasOAuthCodeFlow = Boolean(googleClientId && getGoogleClientSecret());
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        googleClientId,
        hasOAuthCodeFlow,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to read auth config',
      });
    }
  });

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const { session } = extractAuthSessionFromRequest(req);
      const dbCount = await getUniqueGmailLoginCountFromDb().catch(() => null);
      const gmailLoginCount =
        dbCount !== null
          ? Math.max(dbCount, memoryGmailTotalLogins)
          : memoryGmailTotalLogins;
      if (!session) {
        res.json({
          ok: true,
          authenticated: false,
          gmailLoginCount,
          user: null,
        });
        return;
      }

      const dbUser = await getUserFromDb(session.uid).catch(() => null);

      res.json({
        ok: true,
        authenticated: true,
        gmailLoginCount,
        user: {
          uid: session.uid,
          email: dbUser?.email || session.email,
          displayName: dbUser?.displayName || session.displayName,
          photoURL: dbUser?.photoURL ?? session.photoURL,
          bio: dbUser?.bio || '',
          preferredLanguage: dbUser?.preferredLanguage || 'en',
          preferences: dbUser?.preferences || {},
          streakCount: dbUser?.streakCount || 1,
          lastVisitDate: dbUser?.lastVisitDate || getJakartaDateKey(),
          isVip: Boolean(dbUser?.isVip),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to inspect auth session',
      });
    }
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const googleClientId = getPrimaryGoogleClientId();
      if (!googleClientId) {
        res.status(503).json({
          ok: false,
          error:
            'Google Sign-In is not configured on the server. Set GOOGLE_CLIENT_ID in .env.',
        });
        return;
      }

      const credential = cleanText(req.body?.credential);
      const accessToken = cleanText(req.body?.accessToken);
      if (!credential && !accessToken) {
        res.status(400).json({
          ok: false,
          error: 'Missing Google credential or access token.',
        });
        return;
      }

      const verified = credential
        ? await verifyGoogleIdToken(credential)
        : await verifyGoogleAccessToken(accessToken);

      if (verified.status === 'unavailable') {
        res.status(503).json({
          ok: false,
          error: 'Google verification service is temporarily unavailable.',
        });
        return;
      }
      if (verified.status !== 'verified' || !verified.sub || !verified.email) {
        res.status(401).json({
          ok: false,
          error: 'Invalid or unverified Google account credential.',
        });
        return;
      }

      const uid = `google_${verified.sub}`;
      const email = verified.email;
      const displayName =
        cleanText(verified.name) || email.split('@')[0] || 'Kano Viewer';
      const photoURL = verified.picture || null;

      const { synced, gmailLoginCount } = await recordGmailAccountAndSync({
        uid,
        email,
        displayName,
        photoURL,
        isLoginEvent: true,
      });

      const secHashes = extractClientSecurityHashes(req);
      await recordUserSecuritySignalInDb({
        userId: uid,
        ...secHashes,
        displayName: synced?.displayName || displayName,
      }).catch(() => null);

      const pendingRefCode = cleanText(req.body?.referralCode);
      if (pendingRefCode) {
        await bindReferralForUserInDb({
          refereeUid: uid,
          referralCode: pendingRefCode,
          ...secHashes,
          displayName: synced?.displayName || displayName,
        }).catch(() => null);
      }

      const firstLoginBonus = await grantFirstLoginBonusIfEligibleInDb({
        userId: uid,
        displayName: synced?.displayName || displayName,
      }).catch(() => ({ granted: false, points: 0, dbConnected: false }));

      const sessionToken = signAuthSessionToken({
        uid,
        email,
        displayName: synced?.displayName || displayName,
        photoURL: synced?.photoURL ?? photoURL,
      });
      setAuthSessionCookie(req, res, sessionToken);

      res.json({
        ok: true,
        sessionToken,
        gmailLoginCount,
        firstLoginBonusAwarded: firstLoginBonus.granted ? firstLoginBonus.points : 0,
        user: {
          uid,
          email,
          displayName: synced?.displayName || displayName,
          photoURL: synced?.photoURL ?? photoURL,
          bio: synced?.bio || '',
          preferredLanguage: synced?.preferredLanguage || 'en',
          preferences: synced?.preferences || {},
          streakCount: synced?.streakCount || 1,
          lastVisitDate: synced?.lastVisitDate || getJakartaDateKey(),
          isVip: Boolean(synced?.isVip),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Google authentication failed.',
      });
    }
  });

  app.post('/api/auth/email/register', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const secHashes = extractClientSecurityHashes(req);
      if (isEndpointRateLimited(`email-reg:${secHashes.ipHash || 'anon'}`, 10, 10 * 60_000)) {
        res.status(429).json({
          ok: false,
          error: 'Too many registration attempts. Please try again in a few minutes.',
        });
        return;
      }

      const rawEmail = cleanText(req.body?.email).toLowerCase();
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
      const rawDisplayName = cleanText(req.body?.displayName);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)) {
        res.status(400).json({
          ok: false,
          error: 'Please enter a valid email address.',
        });
        return;
      }
      if (rawPassword.length < 6 || rawPassword.length > 128) {
        res.status(400).json({
          ok: false,
          error: 'Password must be between 6 and 128 characters.',
        });
        return;
      }

      const resolvedName = rawDisplayName || rawEmail.split('@')[0] || 'Kano Viewer';
      const regResult = await registerEmailAccountInDb({
        email: rawEmail,
        password: rawPassword,
        displayName: resolvedName,
        avatarInitials: buildAvatarInitials(resolvedName),
        avatarColor: pickAvatarColor(rawEmail),
        visitDate: getJakartaDateKey(),
      });

      if (!regResult.ok) {
        if (regResult.reason === 'email_exists') {
          res.status(409).json({
            ok: false,
            error: 'This email is already registered. Please sign in instead.',
          });
          return;
        }
        res.status(400).json({
          ok: false,
          error: 'Invalid email or password format.',
        });
        return;
      }

      const dbUser = regResult.user;
      await recordUserSecuritySignalInDb({
        userId: dbUser.uid,
        ...secHashes,
        displayName: dbUser.displayName,
      }).catch(() => null);

      const pendingRefCode = cleanText(req.body?.referralCode);
      if (pendingRefCode) {
        await bindReferralForUserInDb({
          refereeUid: dbUser.uid,
          referralCode: pendingRefCode,
          ...secHashes,
          displayName: dbUser.displayName,
        }).catch(() => null);
      }

      const dbCount = await getUniqueGmailLoginCountFromDb().catch(() => null);
      const gmailLoginCount =
        dbCount !== null ? Math.max(dbCount, memoryGmailTotalLogins) : memoryGmailTotalLogins;

      const firstLoginBonus = await grantFirstLoginBonusIfEligibleInDb({
        userId: dbUser.uid,
        displayName: dbUser.displayName,
      }).catch(() => ({ granted: false, points: 0, dbConnected: false }));

      const sessionToken = signAuthSessionToken({
        uid: dbUser.uid,
        email: dbUser.email,
        displayName: dbUser.displayName,
        photoURL: dbUser.photoURL,
      });
      setAuthSessionCookie(req, res, sessionToken);

      res.status(201).json({
        ok: true,
        sessionToken,
        gmailLoginCount,
        firstLoginBonusAwarded: firstLoginBonus.granted ? firstLoginBonus.points : 0,
        user: {
          uid: dbUser.uid,
          email: dbUser.email,
          displayName: dbUser.displayName,
          photoURL: dbUser.photoURL,
          bio: dbUser.bio,
          preferredLanguage: dbUser.preferredLanguage || 'en',
          preferences: dbUser.preferences || {},
          streakCount: dbUser.streakCount || 1,
          lastVisitDate: dbUser.lastVisitDate || getJakartaDateKey(),
          isVip: Boolean(dbUser.isVip),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Email registration failed.',
      });
    }
  });

  app.post('/api/auth/email/login', async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const secHashes = extractClientSecurityHashes(req);
      if (isEndpointRateLimited(`email-login:${secHashes.ipHash || 'anon'}`, 15, 10 * 60_000)) {
        res.status(429).json({
          ok: false,
          error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
        });
        return;
      }

      const rawEmail = cleanText(req.body?.email).toLowerCase();
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) || !rawPassword) {
        res.status(400).json({
          ok: false,
          error: 'Please enter a valid email and password.',
        });
        return;
      }

      const fallbackName = rawEmail.split('@')[0] || 'Kano Viewer';
      const authResult = await authenticateEmailAccountInDb({
        email: rawEmail,
        password: rawPassword,
        avatarInitials: buildAvatarInitials(fallbackName),
        avatarColor: pickAvatarColor(rawEmail),
        visitDate: getJakartaDateKey(),
      });

      if (!authResult.ok) {
        res.status(401).json({
          ok: false,
          error: 'Incorrect email or password.',
        });
        return;
      }

      const dbUser = authResult.user;
      await recordUserSecuritySignalInDb({
        userId: dbUser.uid,
        ...secHashes,
        displayName: dbUser.displayName,
      }).catch(() => null);

      const pendingRefCode = cleanText(req.body?.referralCode);
      if (pendingRefCode) {
        await bindReferralForUserInDb({
          refereeUid: dbUser.uid,
          referralCode: pendingRefCode,
          ...secHashes,
          displayName: dbUser.displayName,
        }).catch(() => null);
      }

      const dbCount = await getUniqueGmailLoginCountFromDb().catch(() => null);
      const gmailLoginCount =
        dbCount !== null ? Math.max(dbCount, memoryGmailTotalLogins) : memoryGmailTotalLogins;

      const firstLoginBonus = await grantFirstLoginBonusIfEligibleInDb({
        userId: dbUser.uid,
        displayName: dbUser.displayName,
      }).catch(() => ({ granted: false, points: 0, dbConnected: false }));

      const sessionToken = signAuthSessionToken({
        uid: dbUser.uid,
        email: dbUser.email,
        displayName: dbUser.displayName,
        photoURL: dbUser.photoURL,
      });
      setAuthSessionCookie(req, res, sessionToken);

      res.json({
        ok: true,
        sessionToken,
        gmailLoginCount,
        firstLoginBonusAwarded: firstLoginBonus.granted ? firstLoginBonus.points : 0,
        user: {
          uid: dbUser.uid,
          email: dbUser.email,
          displayName: dbUser.displayName,
          photoURL: dbUser.photoURL,
          bio: dbUser.bio,
          preferredLanguage: dbUser.preferredLanguage || 'en',
          preferences: dbUser.preferences || {},
          streakCount: dbUser.streakCount || 1,
          lastVisitDate: dbUser.lastVisitDate || getJakartaDateKey(),
          isVip: Boolean(dbUser.isVip),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Email sign-in failed.',
      });
    }
  });

  app.get('/api/auth/google/url', (req: Request, res: Response) => {
    try {
      const clientId = getPrimaryGoogleClientId();
      const clientSecret = getGoogleClientSecret();
      if (!clientId || !clientSecret) {
        res.status(503).json({
          ok: false,
          error: 'Google OAuth code flow is not configured.',
        });
        return;
      }
      const baseOrigin = (getConfiguredSiteUrl() || resolveOrigin(req))
        .trim()
        .replace(/\/+$/, '');
      const redirectUri = `${baseOrigin}/api/auth/google/callback`;
      const state = signOAuthStateToken(baseOrigin);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        prompt: 'select_account',
        access_type: 'online',
        state,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to generate Google OAuth URL',
      });
    }
  });

  app.get(
    ['/api/auth/google/callback', '/api/auth/google/callback/'],
    async (req: Request, res: Response) => {
      const code = cleanText(req.query.code);
      const stateRaw = cleanText(req.query.state);
      const parsedState = verifyOAuthStateToken(stateRaw);
      const clientId = getPrimaryGoogleClientId();
      const clientSecret = getGoogleClientSecret();

      if (!code || !parsedState || !clientId || !clientSecret) {
        res
          .status(400)
          .type('text/html; charset=utf-8')
          .send('<p>Google sign-in request was invalid or expired.</p>');
        return;
      }

      try {
        const redirectUri = `${parsedState.origin}/api/auth/google/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!tokenRes.ok) {
          res
            .status(401)
            .type('text/html; charset=utf-8')
            .send('<p>Failed to exchange Google OAuth authorization code.</p>');
          return;
        }
        const tokenJson = (await tokenRes.json()) as {
          id_token?: string;
          access_token?: string;
        };
        const verified = tokenJson.id_token
          ? await verifyGoogleIdToken(tokenJson.id_token)
          : tokenJson.access_token
          ? await verifyGoogleAccessToken(tokenJson.access_token)
          : { status: 'invalid' as const };

        if (verified.status !== 'verified' || !verified.sub || !verified.email) {
          res
            .status(401)
            .type('text/html; charset=utf-8')
            .send('<p>Google account could not be verified.</p>');
          return;
        }

        const uid = `google_${verified.sub}`;
        const email = verified.email;
        const displayName =
          cleanText(verified.name) || email.split('@')[0] || 'Kano Viewer';
        const photoURL = verified.picture || null;

        const { synced, gmailLoginCount } = await recordGmailAccountAndSync({
          uid,
          email,
          displayName,
          photoURL,
          isLoginEvent: true,
        });

        const secHashes = extractClientSecurityHashes(req);
        await recordUserSecuritySignalInDb({
          userId: uid,
          ...secHashes,
          displayName: synced?.displayName || displayName,
        }).catch(() => null);

        const firstLoginBonus = await grantFirstLoginBonusIfEligibleInDb({
          userId: uid,
          displayName: synced?.displayName || displayName,
        }).catch(() => ({ granted: false, points: 0, dbConnected: false }));

        const sessionToken = signAuthSessionToken({
          uid,
          email,
          displayName: synced?.displayName || displayName,
          photoURL: synced?.photoURL ?? photoURL,
        });
        setAuthSessionCookie(req, res, sessionToken);

        const safePayload = JSON.stringify({
          type: 'KD_GOOGLE_AUTH_SUCCESS',
          sessionToken,
          gmailLoginCount,
          firstLoginBonusAwarded: firstLoginBonus.granted ? firstLoginBonus.points : 0,
          user: {
            uid,
            email,
            displayName: synced?.displayName || displayName,
            photoURL: synced?.photoURL ?? photoURL,
            bio: synced?.bio || '',
            preferredLanguage: synced?.preferredLanguage || 'en',
            preferences: synced?.preferences || {},
            streakCount: synced?.streakCount || 1,
            lastVisitDate: synced?.lastVisitDate || getJakartaDateKey(),
            isVip: Boolean(synced?.isVip),
          },
        }).replace(/</g, '\\u003c');

        res.setHeader('Cache-Control', 'no-store');
        res.type('text/html; charset=utf-8').send(
          `<!doctype html><html><body><script>
            if (window.opener) {
              window.opener.postMessage(${safePayload}, ${JSON.stringify(parsedState.origin)});
              window.close();
            } else {
              window.location.replace('/account');
            }
          </script><p>Authentication complete. You can close this window.</p></body></html>`
        );
      } catch {
        res
          .status(500)
          .type('text/html; charset=utf-8')
          .send('<p>Google sign-in encountered an unexpected error.</p>');
      }
    }
  );

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    try {
      const { viaCookie } = extractAuthSessionFromRequest(req);
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Cross-origin logout rejected' });
        return;
      }
      clearAuthSessionCookie(req, res);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to log out',
      });
    }
  });

  app.post('/api/users/sync', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }

      const uid = session.uid;
      const email = session.email;
      const isLoginEvent = Boolean(req.body?.isLoginEvent);
      const displayName = cleanText(
        req.body?.displayName,
        session.displayName || 'Kano Viewer'
      );
      const { synced, gmailLoginCount } = await recordGmailAccountAndSync({
        uid,
        email,
        displayName,
        photoURL: cleanText(req.body?.photoURL) || session.photoURL || null,
        visitDate: cleanText(req.body?.visitDate) || undefined,
        isLoginEvent,
      });

      const secHashes = extractClientSecurityHashes(req);
      await recordUserSecuritySignalInDb({
        userId: uid,
        ...secHashes,
        displayName: synced?.displayName || displayName,
      }).catch(() => null);

      const pendingRefCode = cleanText(req.body?.referralCode);
      if (pendingRefCode) {
        await bindReferralForUserInDb({
          refereeUid: uid,
          referralCode: pendingRefCode,
          ...secHashes,
          displayName: synced?.displayName || displayName,
        }).catch(() => null);
      }

      const firstLoginBonus = isLoginEvent
        ? await grantFirstLoginBonusIfEligibleInDb({
            userId: uid,
            displayName: synced?.displayName || displayName,
          }).catch(() => ({ granted: false, points: 0, dbConnected: false }))
        : { granted: false, points: 0, dbConnected: false };

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        user: synced,
        gmailLoginCount,
        firstLoginBonusAwarded: firstLoginBonus.granted ? firstLoginBonus.points : 0,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to sync user',
      });
    }
  });

  app.patch('/api/users/profile', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      const requestedUid = cleanText(req.body?.uid);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }

      const updated = await updateUserProfileInDb({
        uid: session.uid,
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
      const { session } = extractAuthSessionFromRequest(req);
      const uid = cleanText(String(req.params.uid || ''));
      if (!uid) {
        res.status(400).json({ ok: false, error: 'Missing uid' });
        return;
      }
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (session.uid !== uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
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

  // --- Points, Rewards & Payout Requests (USD & IDR) ---

  function handlePointsDbError(res: Response, err: unknown, fallbackMessage: string) {
    if (err instanceof DatabaseUnavailableError) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({
        ok: false,
        code: err.code,
        error: err.message,
        requiredConfig: err.requiredConfig,
      });
      return;
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : fallbackMessage,
    });
  }

  function validatePayoutDestinationAccount(
    method: PayoutMethod,
    rawDestination: string,
    rawBankCode?: string
  ): { valid: boolean; normalized: string; bankCode?: string; error?: string } {
    const trimmed = rawDestination.trim();
    if (!trimmed) {
      return { valid: false, normalized: '', error: 'Destination account is required' };
    }
    if (trimmed.length > 160) {
      return { valid: false, normalized: '', error: 'Destination account is too long' };
    }

    switch (method) {
      case 'dana':
      case 'ovo':
      case 'gopay':
      case 'shopeepay':
      case 'linkaja': {
        const digitsOnly = trimmed.replace(/[\s\-().]/g, '');
        if (!/^(\+?62|0)8[0-9]{7,13}$/.test(digitsOnly)) {
          return {
            valid: false,
            normalized: trimmed,
            error: 'Masukkan nomor HP/e-wallet Indonesia yang valid (contoh: 0812xxxxxxxx).',
          };
        }
        return { valid: true, normalized: digitsOnly };
      }
      case 'bank_transfer': {
        const bankCode = cleanText(rawBankCode).toUpperCase();
        const bankOpt = INDONESIAN_BANK_OPTIONS.find((b) => b.code === bankCode);
        if (!bankOpt) {
          return {
            valid: false,
            normalized: trimmed,
            error: 'Pilih bank Indonesia tujuan (BCA, BRI, BNI, Mandiri, BSI, CIMB, Jago, SeaBank, Permata, BTN).',
          };
        }
        const digits = trimmed.replace(/[^0-9]/g, '');
        if (digits.length < bankOpt.minDigits || digits.length > bankOpt.maxDigits) {
          return {
            valid: false,
            normalized: trimmed,
            bankCode: bankOpt.code,
            error: `Nomor rekening ${bankOpt.shortName} harus ${bankOpt.minDigits}–${bankOpt.maxDigits} digit angka.`,
          };
        }
        return {
          valid: true,
          normalized: `${bankOpt.shortName} - ${digits}`,
          bankCode: bankOpt.code,
        };
      }
      case 'paypal': {
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
          return {
            valid: false,
            normalized: trimmed,
            error: 'Please enter a valid PayPal email address.',
          };
        }
        return { valid: true, normalized: trimmed.toLowerCase() };
      }
      case 'wise': {
        const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
        const isWiseTagOrIban = /^[@a-zA-Z0-9._-]{4,80}$/.test(trimmed);
        if (!isEmail && !isWiseTagOrIban) {
          return {
            valid: false,
            normalized: trimmed,
            error: 'Please enter a valid Wise email, @wisetag, or account ID.',
          };
        }
        return { valid: true, normalized: isEmail ? trimmed.toLowerCase() : trimmed };
      }
      case 'usdt_polygon':
      case 'usdt_bep20':
      case 'usdt_erc20': {
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
          const netLabel =
            method === 'usdt_polygon'
              ? 'Polygon'
              : method === 'usdt_bep20'
              ? 'BEP20 (BNB Smart Chain)'
              : 'ERC20 (Ethereum)';
          return {
            valid: false,
            normalized: trimmed,
            error: `Please enter a valid ${netLabel} (0x...) wallet address.`,
          };
        }
        return { valid: true, normalized: trimmed };
      }
      case 'usdt_trc20': {
        if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
          return {
            valid: false,
            normalized: trimmed,
            error: 'Please enter a valid TRON TRC20 (T...) wallet address.',
          };
        }
        return { valid: true, normalized: trimmed };
      }
    }
  }

  function verifyAdminPayoutAuth(req: Request, res: Response): boolean {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const configuredSecret = getAdminPayoutSecret();
    if (!configuredSecret) {
      res.status(503).json({
        ok: false,
        error: 'Admin payout secret is not configured on the server',
      });
      return false;
    }

    const { ipHash } = extractClientSecurityHashes(req);
    const headerSecret = cleanText(req.headers['x-admin-secret']);
    const authHeader = cleanText(req.headers.authorization);
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const candidate = headerSecret || bearerSecret;

    if (!candidate) {
      if (ipHash && isEndpointRateLimited(`admin_auth_fail:${ipHash}`, 30, 60_000)) {
        res.status(429).json({ ok: false, error: 'Too many unauthorized admin attempts' });
        return false;
      }
      res.status(401).json({ ok: false, error: 'Missing admin authorization' });
      return false;
    }

    const expectedDigest = crypto
      .createHash('sha256')
      .update(configuredSecret)
      .digest();
    const candidateDigest = crypto
      .createHash('sha256')
      .update(candidate)
      .digest();

    if (!crypto.timingSafeEqual(expectedDigest, candidateDigest)) {
      if (ipHash && isEndpointRateLimited(`admin_auth_fail:${ipHash}`, 30, 60_000)) {
        res.status(429).json({ ok: false, error: 'Too many unauthorized admin attempts' });
        return false;
      }
      res.status(401).json({ ok: false, error: 'Invalid admin secret' });
      return false;
    }
    return true;
  }

  app.get('/api/points/config', (_req: Request, res: Response) => {
    try {
      const config = getPayoutRuntimeConfig();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        dbConnected: isDatabaseEnabled(),
        config,
        banks: INDONESIAN_BANK_OPTIONS,
        usdtNetworks: USDT_NETWORK_OPTIONS,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load points config',
      });
    }
  });

  app.get('/api/payouts/live', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
      const items = await listLivePayoutFeedFromDb(limit);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, items });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to load live payouts');
    }
  });

  app.get('/api/points/me', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const config = getPayoutRuntimeConfig();
      const summary = await getUserPointsSummaryFromDb(
        session.uid,
        extractUserTimeZone(req)
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, dbConnected: true, summary, config });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to load points summary');
    }
  });

  app.get('/api/points/ledger', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const requestedUid = cleanText(req.query.userId);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const data = await listUserLedgerFromDb(session.uid, limit, offset);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...data });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to load points ledger');
    }
  });

  app.get('/api/points/payouts', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const requestedUid = cleanText(req.query.userId);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const data = await listUserPayoutsFromDb(session.uid, limit, offset);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...data });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to load payout history');
    }
  });

  app.post('/api/points/claim', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      if (isEndpointRateLimited(`claim:${session.uid}`, 20, 60_000)) {
        res.status(429).json({
          ok: false,
          reason: 'cooldown_active',
          error: 'Too many claim requests. Please slow down.',
        });
        return;
      }

      const cfg = getPayoutRuntimeConfig();
      const isId = isIndonesianRequest(req);
      const action = cleanText(
        req.body?.action ?? req.body?.type,
        'daily_checkin'
      ).toLowerCase();

      res.setHeader('Cache-Control', 'no-store');

      if (action === 'daily_checkin' || action === 'checkin') {
        const result = await claimDailyCheckinInDb({
          userId: session.uid,
          displayName: session.displayName,
          timeZone: extractUserTimeZone(req),
        });
        if (!result.ok) {
          const statusCode =
            result.reason === 'daily_cap_reached'
              ? 429
              : result.reason === 'duplicate_claim'
              ? 409
              : 400;
          const message =
            result.reason === 'duplicate_claim'
              ? isId
                ? 'Check-in harian untuk periode berjalan sudah diklaim (reset serentak pukul 00:00 WIB).'
                : 'Daily check-in for the current cycle has already been claimed (resets at 17:00 UTC).'
              : result.reason === 'daily_cap_reached'
              ? isId
                ? `Batas poin harian (${cfg.maxDailyEarnPoints.toLocaleString('id-ID')} poin) hari ini sudah tercapai.`
                : `Daily earn limit (${cfg.maxDailyEarnPoints.toLocaleString('en-US')} pts) reached for today.`
              : isId
              ? 'Gagal menyelesaikan check-in harian.'
              : 'Unable to complete daily check-in';
          res.status(statusCode).json({
            ok: false,
            reason: result.reason,
            error: message,
            summary: result.summary,
            config: cfg,
          });
          return;
        }

        res.json({
          ok: true,
          awardedPoints: result.entry?.points ?? cfg.dailyCheckinPoints,
          streakDay: result.streakDay,
          streak: result.streakDay,
          entry: result.entry,
          summary: result.summary,
          config: cfg,
        });
        return;
      }

      if (action === 'watch_episode') {
        const dramaId = cleanText(req.body?.dramaId).slice(0, 80);
        const provider = cleanText(req.body?.provider, 'DramaBoxV2').slice(0, 40);
        const episodeNumber = Math.floor(Number(req.body?.episodeNumber) || 0);
        const sessionToken = cleanText(
          req.body?.sessionToken ?? req.body?.watchSessionToken
        ).slice(0, 128);
        const title = cleanText(req.body?.title).slice(0, 140);

        if (!dramaId || episodeNumber < 1 || episodeNumber > 5000) {
          res.status(400).json({
            ok: false,
            error: 'Valid dramaId and episodeNumber are required',
          });
          return;
        }
        if (!sessionToken) {
          res.status(400).json({
            ok: false,
            reason: 'invalid_session',
            error: 'Active watch session token is required to claim episode points',
          });
          return;
        }

        const result = await claimWatchEpisodeInDb({
          userId: session.uid,
          provider,
          dramaId,
          episodeNumber,
          sessionToken,
          title,
          displayName: session.displayName,
          timeZone: extractUserTimeZone(req),
        });

        if (!result.ok) {
          const statusCode =
            result.reason === 'daily_cap_reached' || result.reason === 'cooldown_active'
              ? 429
              : result.reason === 'duplicate_claim'
              ? 409
              : 400;
          const message =
            result.reason === 'duplicate_claim'
              ? isId
                ? 'Bonus episode ini sudah pernah diklaim untuk akun Anda.'
                : 'This episode watch bonus has already been claimed on your account.'
              : result.reason === 'watch_duration_insufficient'
              ? isId
                ? 'Tonton episode minimal 15 detik secara aktif untuk membuka bonus poin.'
                : 'Watch at least 15 seconds actively to unlock the episode bonus.'
              : result.reason === 'daily_cap_reached'
              ? isId
                ? `Batas poin harian (${cfg.maxDailyEarnPoints.toLocaleString('id-ID')} poin) hari ini sudah tercapai.`
                : `Daily earn limit (${cfg.maxDailyEarnPoints.toLocaleString('en-US')} pts) reached for today.`
              : result.reason === 'cooldown_active'
              ? isId
                ? `Tunggu ${result.cooldownSecondsRemaining || cfg.claimCooldownSeconds} detik sebelum klaim berikutnya.`
                : `Please wait ${result.cooldownSecondsRemaining || cfg.claimCooldownSeconds}s before the next claim`
              : isId
              ? 'Gagal mengklaim bonus episode.'
              : 'Unable to claim episode watch reward';
          res.status(statusCode).json({
            ok: false,
            reason: result.reason,
            cooldownSecondsRemaining: result.cooldownSecondsRemaining,
            error: message,
            summary: result.summary,
            config: cfg,
          });
          return;
        }

        res.json({
          ok: true,
          awardedPoints: result.entry?.points ?? cfg.watchEpisodePoints,
          entry: result.entry,
          summary: result.summary,
          config: cfg,
        });
        return;
      }

      if (action === 'watch_milestone') {
        const milestoneMinutes = Math.floor(
          Number(req.body?.milestoneMinutes ?? req.body?.minutes) || 0
        );
        const result = await claimWatchMilestoneInDb({
          userId: session.uid,
          milestoneMinutes,
          displayName: session.displayName,
          timeZone: extractUserTimeZone(req),
        });

        if (!result.ok) {
          const statusCode =
            result.reason === 'daily_cap_reached' ||
            result.reason === 'daily_watch_cap_reached'
              ? 429
              : result.reason === 'duplicate_claim'
              ? 409
              : 400;
          const message =
            result.reason === 'duplicate_claim'
              ? isId
                ? 'Bonus milestone ini sudah diklaim untuk periode hari ini.'
                : 'This milestone bonus has already been claimed for the current period.'
              : result.reason === 'milestone_not_reached'
              ? isId
                ? `Target menonton aktif ${milestoneMinutes} menit hari ini belum tercapai.`
                : `Active watch target of ${milestoneMinutes} minutes has not been reached yet.`
              : result.reason === 'daily_watch_cap_reached'
              ? isId
                ? `Batas poin nonton harian (${cfg.maxDailyWatchPoints.toLocaleString('id-ID')} poin) hari ini sudah tercapai.`
                : `Daily watch earn limit (${cfg.maxDailyWatchPoints.toLocaleString('en-US')} pts) reached for today.`
              : result.reason === 'daily_cap_reached'
              ? isId
                ? `Batas poin harian (${cfg.maxDailyEarnPoints.toLocaleString('id-ID')} poin) hari ini sudah tercapai.`
                : `Daily earn limit (${cfg.maxDailyEarnPoints.toLocaleString('en-US')} pts) reached for today.`
              : isId
              ? 'Milestone menit menonton tidak valid.'
              : 'Invalid watch milestone.';
          res.status(statusCode).json({
            ok: false,
            reason: result.reason,
            error: message,
            summary: result.summary,
            config: cfg,
          });
          return;
        }

        res.json({
          ok: true,
          milestoneMinutes: result.milestoneMinutes,
          awardedPoints: result.awardedPoints ?? result.entry?.points ?? 0,
          entry: result.entry,
          summary: result.summary,
          config: cfg,
        });
        return;
      }

      res.status(400).json({ ok: false, error: 'Unsupported claim action' });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to claim points');
    }
  });

  app.post('/api/points/redeem', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      const isId = isIndonesianRequest(req);
      if (isEndpointRateLimited(`redeem:${session.uid}`, 8, 60_000)) {
        res.status(429).json({
          ok: false,
          error: isId
            ? 'Terlalu banyak permintaan penarikan. Silakan tunggu sebentar.'
            : 'Too many payout requests. Please wait a moment.',
        });
        return;
      }

      let methodRaw = cleanText(req.body?.method).toLowerCase();
      if (methodRaw === 'usdt') {
        const net = cleanText(req.body?.network, 'polygon').toLowerCase();
        methodRaw = net.startsWith('usdt_') ? net : `usdt_${net}`;
      }
      if (!ALLOWED_PAYOUT_METHODS.has(methodRaw as PayoutMethod)) {
        res.status(400).json({ ok: false, error: 'Unsupported payout method' });
        return;
      }
      const method = methodRaw as PayoutMethod;

      const pointsSpent = Math.floor(Number(req.body?.pointsSpent) || 0);
      if (!Number.isFinite(pointsSpent) || pointsSpent <= 0 || pointsSpent > 10_000_000) {
        res.status(400).json({ ok: false, error: 'Invalid points amount' });
        return;
      }

      const accountHolderName = cleanText(req.body?.accountHolderName).slice(0, 100);
      if (accountHolderName.length < 2) {
        res.status(400).json({
          ok: false,
          error: 'Account holder / recipient name is required (min 2 chars)',
        });
        return;
      }

      const destCheck = validatePayoutDestinationAccount(
        method,
        String(req.body?.destinationAccount || ''),
        cleanText(req.body?.bankCode)
      );
      if (!destCheck.valid) {
        res.status(400).json({
          ok: false,
          error: destCheck.error || 'Invalid destination account',
        });
        return;
      }

      const idempotencyKey = cleanText(
        req.body?.idempotencyKey ?? req.headers['idempotency-key']
      ).slice(0, 80);

      const cfg = getPayoutRuntimeConfig();
      const result = await createPayoutRequestInDb({
        userId: session.uid,
        pointsSpent,
        method,
        destinationAccount: destCheck.normalized,
        accountHolderName,
        displayName: session.displayName,
        bankCode: destCheck.bankCode,
        network: cleanText(req.body?.network).slice(0, 24) || undefined,
        idempotencyKey: idempotencyKey || undefined,
      });

      res.setHeader('Cache-Control', 'no-store');
      if (!result.ok) {
        const isIdrMethod = [
          'dana',
          'ovo',
          'gopay',
          'shopeepay',
          'linkaja',
          'bank_transfer',
        ].includes(method);
        const message =
          result.reason === 'below_minimum'
            ? isIdrMethod
              ? isId
                ? `Minimum penarikan Rupiah adalah Rp ${cfg.minPayoutIdr.toLocaleString('id-ID')} (${result.minRequiredPoints} poin)`
                : `Minimum IDR withdrawal is Rp ${cfg.minPayoutIdr.toLocaleString('en-US')} (${result.minRequiredPoints} points)`
              : `Minimum Global withdrawal is $${cfg.minPayoutUsd.toFixed(2)} USD (${result.minRequiredPoints} points)`
            : result.reason === 'insufficient_balance'
            ? isId
              ? 'Saldo poin aktif tidak mencukupi untuk penarikan ini.'
              : 'Insufficient points balance for this withdrawal.'
            : result.reason === 'invalid_method_details'
            ? isId
              ? 'Detail metode atau kode bank tujuan tidak valid.'
              : 'Invalid payout method or bank code details.'
            : 'Unable to submit payout request';
        res.status(400).json({
          ok: false,
          reason: result.reason,
          minRequiredPoints: result.minRequiredPoints,
          minPayoutIdr: cfg.minPayoutIdr,
          minPayoutUsd: cfg.minPayoutUsd,
          error: message,
          summary: result.summary,
          config: cfg,
        });
        return;
      }

      if (!result.deduplicated && result.payout) {
        void notifyAdminTelegramNewWithdrawal({
          payout: result.payout,
          destinationAccountRaw: destCheck.normalized,
          userId: session.uid,
          userEmail: session.email,
          userDisplayName: session.displayName,
          levelInfo: result.summary?.levelInfo,
        }).catch(() => {});
      }

      res.status(result.deduplicated ? 200 : 201).json({
        ok: true,
        deduplicated: Boolean(result.deduplicated),
        idempotentReplay: Boolean(result.deduplicated),
        payout: result.payout,
        summary: result.summary,
        config: cfg,
      });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to create payout request');
    }
  });

  // --- Referral Program (1-Hour Verified Active Watch) & Watch Heartbeat ---

  app.get('/api/referrals/me', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const config = getPayoutRuntimeConfig();
      const referralSummary = await getUserReferralSummaryFromDb(
        session.uid,
        extractUserTimeZone(req)
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, referralSummary, config });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to load referral summary');
    }
  });

  app.post('/api/referrals/bind', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }

      if (isEndpointRateLimited(`refbind:${session.uid}`, 10, 60_000)) {
        res.status(429).json({
          ok: false,
          error: 'Too many referral bind attempts. Please wait a minute.',
        });
        return;
      }

      const referralCode = cleanText(req.body?.referralCode);
      if (!referralCode) {
        res.status(400).json({ ok: false, error: 'Referral code is required' });
        return;
      }

      const secHashes = extractClientSecurityHashes(req);
      await recordUserSecuritySignalInDb({
        userId: session.uid,
        ...secHashes,
        displayName: session.displayName,
      }).catch(() => null);

      const result = await bindReferralForUserInDb({
        refereeUid: session.uid,
        referralCode,
        ...secHashes,
        displayName: session.displayName,
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: result.bound,
        bound: result.bound,
        status: result.status,
        bindBonusAwarded: result.bindBonusAwarded ?? 0,
        reason: result.reason,
      });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to bind referral');
    }
  });

  app.post('/api/watch/session', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      if (isEndpointRateLimited(`wsess:${session.uid}`, 30, 60_000)) {
        res.status(429).json({
          ok: false,
          error: 'Too many watch session starts. Please wait a moment.',
        });
        return;
      }

      const dramaId = cleanText(req.body?.dramaId).slice(0, 80);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2').slice(0, 40);
      const episodeNumber = Math.max(
        1,
        Math.min(5000, Math.floor(Number(req.body?.episodeNumber) || 1))
      );
      if (!dramaId) {
        res.status(400).json({
          ok: false,
          error: 'dramaId is required',
        });
        return;
      }

      const previousSessionToken = cleanText(req.body?.previousSessionToken).slice(0, 128);
      const mediaKey = `${provider}:${dramaId}:ep${episodeNumber}`;
      const secHashes = extractClientSecurityHashes(req);
      const started = await startWatchSessionInDb({
        userId: session.uid,
        mediaKey,
        provider,
        dramaId,
        episodeNumber,
        deviceHash: secHashes.deviceHash,
        previousSessionToken: previousSessionToken || undefined,
      });

      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json(started);
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to initialize watch session');
    }
  });

  app.post('/api/watch/heartbeat', async (req: Request, res: Response) => {
    try {
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }

      if (isEndpointRateLimited(`hb:${session.uid}`, 18, 60_000)) {
        res.status(429).json({
          ok: false,
          reason: 'heartbeat_too_fast',
          error: 'Watch heartbeat rate limit exceeded',
        });
        return;
      }

      const sessionToken = cleanText(
        req.body?.sessionToken ?? req.body?.streamSessionId
      ).slice(0, 128);
      const dramaId = cleanText(req.body?.dramaId).slice(0, 80);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2').slice(0, 40);
      const episodeNumber = Math.max(
        1,
        Math.min(5000, Math.floor(Number(req.body?.episodeNumber) || 1))
      );
      if (!sessionToken || !dramaId) {
        res.status(400).json({
          ok: false,
          reason: 'invalid_session',
          error: 'sessionToken and dramaId are required',
        });
        return;
      }

      const seq = Math.floor(Number(req.body?.seq) || 0);
      if (seq < 1) {
        res.status(400).json({
          ok: false,
          reason: 'replay_blocked',
          error: 'Valid monotonic heartbeat seq is required',
        });
        return;
      }

      const mediaKey = `${provider}:${dramaId}:ep${episodeNumber}`;
      const currentTimeSec = Math.max(0, Number(req.body?.currentTimeSec) || 0);
      const isPlaying = Boolean(req.body?.isPlaying);
      const isBuffering = Boolean(req.body?.isBuffering);
      const tabVisible = Boolean(req.body?.tabVisible);
      const playbackRate = Number(req.body?.playbackRate) || 1;
      const secHashes = extractClientSecurityHashes(req);

      const hbRes = await recordWatchHeartbeatInDb({
        userId: session.uid,
        streamSessionId: sessionToken,
        seq,
        mediaKey,
        currentTimeSec,
        isPlaying,
        isBuffering,
        tabVisible,
        playbackRate,
        ...secHashes,
        displayName: session.displayName,
        timeZone: extractUserTimeZone(req),
      });

      res.setHeader('Cache-Control', 'no-store');
      if (
        !hbRes.ok &&
        (hbRes.reason === 'concurrent_stream_detected' ||
          hbRes.reason === 'heartbeat_too_fast')
      ) {
        res.status(429).json({
          ...hbRes,
          error:
            hbRes.reason === 'concurrent_stream_detected'
              ? 'Only one active playback stream per account is allowed'
              : 'Heartbeat frequency is too fast',
        });
        return;
      }
      if (
        !hbRes.ok &&
        (hbRes.reason === 'replay_blocked' || hbRes.reason === 'invalid_session')
      ) {
        res.status(hbRes.reason === 'replay_blocked' ? 409 : 401).json({
          ...hbRes,
          error:
            hbRes.reason === 'replay_blocked'
              ? 'Duplicate or out-of-order watch heartbeat detected'
              : 'Invalid or expired watch session',
        });
        return;
      }

      res.json(hbRes);
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to record watch heartbeat');
    }
  });

  type AdminAllowedPayoutStatus =
    | 'processing'
    | 'approved'
    | 'paid'
    | 'completed'
    | 'rejected'
    | 'failed';

  const ADMIN_ALLOWED_STATUSES: ReadonlySet<AdminAllowedPayoutStatus> = new Set([
    'processing',
    'approved',
    'paid',
    'completed',
    'rejected',
    'failed',
  ]);

  async function handleAdminPayoutStatusUpdate(
    req: Request,
    res: Response,
    options?: {
      defaultStatus?: AdminAllowedPayoutStatus;
      allowedStatuses?: ReadonlySet<AdminAllowedPayoutStatus>;
    }
  ): Promise<void> {
    if (!verifyAdminPayoutAuth(req, res)) return;
    try {
      const payoutId = cleanText(String(req.params.id || ''));
      if (!payoutId) {
        res.status(400).json({ ok: false, error: 'Missing payout id' });
        return;
      }

      const requestedStatus = cleanText(
        req.body?.status,
        options?.defaultStatus || ''
      ).toLowerCase() as AdminAllowedPayoutStatus;
      const allowedSet = options?.allowedStatuses || ADMIN_ALLOWED_STATUSES;
      if (!allowedSet.has(requestedStatus)) {
        res.status(400).json({
          ok: false,
          error: `status must be one of: ${Array.from(allowedSet).join(', ')}`,
        });
        return;
      }

      const adminNote =
        typeof req.body?.adminNote === 'string'
          ? req.body.adminNote
          : typeof req.body?.admin_note === 'string'
          ? req.body.admin_note
          : typeof req.body?.reason === 'string'
          ? req.body.reason
          : '';

      const result = await updateAdminPayoutStatusInDb({
        payoutId,
        status: requestedStatus,
        adminNote,
      });

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (!result.ok) {
        const statusCode =
          result.reason === 'not_found'
            ? 404
            : result.reason === 'already_finalized' || result.reason === 'invalid_transition'
            ? 409
            : 400;
        res.status(statusCode).json({
          ok: false,
          reason: result.reason,
          payout: result.payout,
          error:
            result.reason === 'not_found'
              ? 'Payout request not found'
              : result.reason === 'already_finalized'
              ? 'Payout request is already finalized (completed, paid, rejected, or failed)'
              : result.reason === 'invalid_transition'
              ? 'Invalid payout status transition'
              : 'Unable to update payout request',
        });
        return;
      }

      res.json({
        ok: true,
        payout: result.payout,
        refunded: Boolean(result.refunded),
        idempotent: Boolean(result.idempotent),
      });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to update payout status');
    }
  }

  app.get('/api/admin/payouts', async (req: Request, res: Response) => {
    if (!verifyAdminPayoutAuth(req, res)) return;
    try {
      const status = cleanText(req.query.status, 'all').toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const data = await listAdminPayoutRequestsFromDb({ status, limit, offset });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.json({ ok: true, items: data.items, total: data.total });
    } catch (err) {
      handlePointsDbError(res, err, 'Failed to list payout requests');
    }
  });

  app.patch('/api/admin/payouts/:id', async (req: Request, res: Response) => {
    await handleAdminPayoutStatusUpdate(req, res);
  });

  app.post('/api/admin/payouts/:id/approve', async (req: Request, res: Response) => {
    await handleAdminPayoutStatusUpdate(req, res, {
      defaultStatus: 'approved',
      allowedStatuses: new Set<AdminAllowedPayoutStatus>(['approved', 'paid', 'completed']),
    });
  });

  app.post('/api/admin/payouts/:id/reject', async (req: Request, res: Response) => {
    await handleAdminPayoutStatusUpdate(req, res, {
      defaultStatus: 'rejected',
      allowedStatuses: new Set<AdminAllowedPayoutStatus>(['rejected', 'failed']),
    });
  });

  // --- Watch History Cloud Sync ---

  const isGuestVisitorActorId = (uid: string) =>
    /^v-[a-zA-Z0-9._:-]{4,120}$/.test(uid);

  app.get('/api/watch-history', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      const requestedUid = cleanText(req.query.userId);
      if (session) {
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
      } else {
        if (!requestedUid) {
          res.status(400).json({ ok: false, error: 'Missing userId' });
          return;
        }
        if (!isGuestVisitorActorId(requestedUid)) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
      }
      const userId = session ? session.uid : requestedUid;
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      const requestedUid = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
      if (session) {
        if (viaCookie && !isTrustedSameOriginMutation(req)) {
          res.status(403).json({ ok: false, error: 'Untrusted origin' });
          return;
        }
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
        if (!dramaId) {
          res.status(400).json({ ok: false, error: 'dramaId is required' });
          return;
        }
      } else {
        if (!requestedUid || !dramaId) {
          res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
          return;
        }
        if (!isGuestVisitorActorId(requestedUid)) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
      }
      const userId = session ? session.uid : requestedUid;
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      const requestedUid = cleanText(req.query.userId ?? req.body?.userId);
      const dramaId = cleanText(req.query.dramaId ?? req.body?.dramaId);
      const provider = cleanText(req.query.provider ?? req.body?.provider) || undefined;
      if (session) {
        if (viaCookie && !isTrustedSameOriginMutation(req)) {
          res.status(403).json({ ok: false, error: 'Untrusted origin' });
          return;
        }
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
        if (!dramaId) {
          res.status(400).json({ ok: false, error: 'dramaId is required' });
          return;
        }
      } else {
        if (!requestedUid || !dramaId) {
          res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
          return;
        }
        if (!isGuestVisitorActorId(requestedUid)) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
      }
      const userId = session ? session.uid : requestedUid;
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
          (await findDramaBySlugInHomeCache(slug, providerHint)) ||
          (await findDramaBySlugInApiCache(slug, providerHint));

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
          providerHint ?? 'DramaBoxV2'
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
        const { session } = extractAuthSessionFromRequest(req);
        if (!session) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
        if (userId !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
        const result = await listUserCommentsFromDb(session.uid, limit, offset);
        res.json({ ok: true, ...result, limit, offset });
        return;
      }

      const dramaId = cleanText(req.query.dramaId);
      const provider = cleanText(req.query.provider, 'DramaBoxV2');
      const episode = Math.max(
        1,
        Number(req.query.episode ?? req.query.episodeNumber) || 1
      );
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required to post comments' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      const requestedUid = cleanText(req.body?.userId ?? req.body?.authorUid);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
      const episodeNumber = Math.max(
        1,
        Number(req.body?.episodeNumber ?? req.body?.episode) || 1
      );
      const content = cleanText(req.body?.text ?? req.body?.content);
      const authorName = cleanText(
        req.body?.authorName ?? req.body?.author,
        session.displayName || 'Viewer'
      );
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
      const authorEmail = session.email || cleanText(req.body?.authorEmail) || undefined;
      const authorPhotoURL =
        session.photoURL ?? (cleanText(req.body?.authorPhotoURL) || null);
      const authorBadge = cleanText(req.body?.authorBadge) || undefined;
      const authorInitials = cleanText(req.body?.authorInitials) || undefined;
      const authorColor = cleanText(req.body?.authorColor) || undefined;

      const comment = await createCommentInDb({
        id,
        dramaId,
        provider,
        episodeNumber,
        userId: session.uid,
        authorName,
        authorEmail,
        authorPhotoURL,
        authorBadge,
        authorInitials,
        authorColor,
        content,
        videoTimestampSec,
      });
      res.status(201).json({
        ok: true,
        persisted: Boolean(comment),
        comment: comment ?? {
          id,
          dramaId,
          provider,
          episodeNumber,
          authorUid: session.uid,
          author: authorName,
          authorEmail,
          authorPhotoURL,
          authorBadge,
          authorInitials,
          authorColor,
          text: content.slice(0, 400),
          videoTimestampSec,
          createdAt: Date.now(),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to create comment',
      });
    }
  });

  app.get('/api/likes', async (req: Request, res: Response) => {
    try {
      const { session } = extractAuthSessionFromRequest(req);
      const requestedUid = cleanText(req.query.userId);
      if (session) {
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
      } else {
        if (!requestedUid) {
          res.status(400).json({ ok: false, error: 'Missing userId' });
          return;
        }
        if (!isGuestVisitorActorId(requestedUid)) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
      }
      const userId = session ? session.uid : requestedUid;
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
      const { session } = extractAuthSessionFromRequest(req);
      const dramaId = cleanText(req.query.dramaId);
      const provider = cleanText(req.query.provider, 'DramaBoxV2');
      const requestedUid = cleanText(req.query.userId);
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      if (session) {
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
      } else if (requestedUid && !isGuestVisitorActorId(requestedUid)) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const userId = session ? session.uid : requestedUid;
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      const requestedUid = cleanText(req.body?.userId);
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
      if (session) {
        if (viaCookie && !isTrustedSameOriginMutation(req)) {
          res.status(403).json({ ok: false, error: 'Untrusted origin' });
          return;
        }
        if (requestedUid && requestedUid !== session.uid) {
          res.status(403).json({ ok: false, error: 'Forbidden' });
          return;
        }
        if (!dramaId) {
          res.status(400).json({ ok: false, error: 'dramaId is required' });
          return;
        }
      } else {
        if (!requestedUid || !dramaId) {
          res.status(400).json({ ok: false, error: 'userId and dramaId are required' });
          return;
        }
        if (!isGuestVisitorActorId(requestedUid)) {
          res.status(401).json({ ok: false, error: 'Authentication required' });
          return;
        }
      }
      const userId = session ? session.uid : requestedUid;
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
      const { session } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required to view Movie Watchlist' });
        return;
      }
      const requestedUid = cleanText(req.query.userId);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const mediaTypeRaw = cleanText(req.query.mediaType);
      const mediaType: 'movie' | 'drama' | undefined =
        mediaTypeRaw === 'movie' || mediaTypeRaw === 'drama' ? mediaTypeRaw : undefined;
      const result = await listFavoritesFromDb(session.uid, limit, offset, mediaType);
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required to save to Movie Watchlist' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      const requestedUid = cleanText(req.body?.userId);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
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
        userId: session.uid,
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
      const { session, viaCookie } = extractAuthSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      if (viaCookie && !isTrustedSameOriginMutation(req)) {
        res.status(403).json({ ok: false, error: 'Untrusted origin' });
        return;
      }
      const requestedUid = cleanText(req.body?.userId);
      if (requestedUid && requestedUid !== session.uid) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const dramaId = cleanText(req.body?.dramaId);
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
      const folderId = cleanText(req.body?.folderId, 'all');
      if (!dramaId) {
        res.status(400).json({ ok: false, error: 'dramaId is required' });
        return;
      }
      const updated = await updateFavoriteFolderInDb(session.uid, dramaId, provider, folderId);
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
      const provider = cleanText(req.body?.provider, 'DramaBoxV2');
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
      const provider = cleanText(req.query.provider, 'DramaBoxV2');
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
    try {
      const wibDay = syncJakartaDayRollover();
      res.setHeader('Cache-Control', 'no-store');
      const payload = await getCurrentReadOnlyVisitorStats(wibDay);
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load visitor stats',
      });
    }
  });

  app.post('/api/visitors/heartbeat', async (req: Request, res: Response) => {
    try {
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
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to record visitor heartbeat',
      });
    }
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

  // 301 canonical host redirect for legacy domains and www alias on non-API GET/HEAD requests
  app.use((req: Request, res: Response, next) => {
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/_serverFn/')
    ) {
      const rawHost = (
        (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
        req.get('host') ||
        ''
      )
        .split(':')[0]
        .trim()
        .toLowerCase();
      if (
        rawHost === 'www.kano-drama.live' ||
        rawHost === 'kano-drama.xyz' ||
        rawHost === 'www.kano-drama.xyz' ||
        rawHost === 'house-drama.xyz' ||
        rawHost === 'www.house-drama.xyz' ||
        rawHost === 'house-drama.web.id' ||
        rawHost === 'www.house-drama.web.id'
      ) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(301, `${DEFAULT_SITE_ORIGIN}${req.originalUrl || '/'}`);
        return;
      }
    }
    next();
  });

  app.get('/llms.txt', (_req: Request, res: Response) => {
    const siteOrigin = DEFAULT_SITE_ORIGIN;
    const curatedLinks = CURATED_PROGRAMMATIC_PAGES.slice(0, 12).map(
      (p) => `- [${p.label}](${siteOrigin}/genre/${encodeURIComponent(p.slug)}): ${p.description}`
    );

    const markdown = [
      '# KanoDrama',
      '',
      `> KanoDrama (${siteOrigin}) adalah platform streaming drama pendek (short drama), serial Asia, drama China dan Korea, serta film gratis dengan dukungan subtitle Bahasa Indonesia (Sub Indo) maupun pilihan bahasa lainnya.`,
      `> KanoDrama (${siteOrigin}) is a free streaming platform for vertical short dramas, Asian series, Chinese & Korean dramas, and full-length movies with Indonesian subtitles (Sub Indo) and multilingual options.`,
      '',
      '## Primary Sections',
      `- [Home](${siteOrigin}/): Beranda KanoDrama — streaming drama pendek, serial Asia, drama China/Korea, dan film gratis Sub Indo.`,
      `- [Explore Catalog](${siteOrigin}/explore): Browse and watch free from the full multi-provider short drama catalog.`,
      `- [Providers Directory](${siteOrigin}/providers): Full directory of 82+ short drama providers including DramaBox V2, NetShort, MeloLo V2, AnyReel, ReelShort V2, GoodShort, and DramaWave.`,
      `- [Trending Series](${siteOrigin}/trending): Watch free daily most-watched and top-ranked short dramas.`,
      `- [Latest Releases](${siteOrigin}/latest): Watch free newly added episodes and recent drama premieres.`,
      `- [VIP Selection](${siteOrigin}/vip): Watch free premium vertical drama series and complete boxsets.`,
      `- [Movies](${siteOrigin}/movies): Watch free full-length Asian & international movies online in HD with Indonesian and English subtitles.`,
      `- [Rewards & Referral](${siteOrigin}/rewards): Watch short dramas to earn points, claim daily milestones, and redeem IDR/USD payouts.`,
      `- [My Account](${siteOrigin}/account): User profile, Gmail login counter, saved watchlist, and watch history.`,
      '',
      '## Canonical Route Patterns',
      `- Detail Page: ${siteOrigin}/<provider>/detail/<slug>`,
      `- Episode Player: ${siteOrigin}/<provider>/watch/<slug>`,
      `- Provider Hub: ${siteOrigin}/provider/<provider-slug>`,
      `- Movie Detail: ${siteOrigin}/movie/detail/<slug>`,
      `- Movie Player: ${siteOrigin}/movie/watch/<slug>`,
      '',
      '## Providers & Curated Collections',
      `- [Multi-Provider Hub](${siteOrigin}/providers): Streaming aggregation across ${Object.keys(PROVIDER_LOGO_PATHS).length}+ short drama & movie providers including DramaBox V2, NetShort, MeloLo V2, AnyReel, ReelShort V2, GoodShort, DramaWave, LK21 Movies, and LookSeries Movies.`,
      ...curatedLinks,
      '',
      '## Machine-Readable Catalog & Site Info',
      `- [AI Catalog JSON](${siteOrigin}/ai-catalog.json): Structured JSON metadata, collections, providers, and featured catalog index.`,
      `- [XML Sitemap](${siteOrigin}/sitemap.xml): Standard sitemap index for homepage, categories, providers, dramas, and movies.`,
      `- [Robots Policy](${siteOrigin}/robots.txt): Crawler access rules and sitemap declarations.`,
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
    const siteOrigin = DEFAULT_SITE_ORIGIN;
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
        url: `${siteOrigin}/${getProviderRouteSlug(item.provider)}/detail/${encodeURIComponent(item.slug)}`,
        cover: item.cover
          ? buildOgImageEndpointUrl(item.cover, siteOrigin, item.title)
          : undefined,
        chapterCount: item.chapterCount,
        description: item.description,
      }));
      let movieEntries = cachedMovies.slice(0, 6).map((m) => ({
        id: m.slug,
        title: m.title,
        provider: /^ls-/i.test(m.slug) ? 'LookSeries' : 'LK21',
        url: `${siteOrigin}/movie/detail/${encodeURIComponent(m.slug)}`,
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
            url: `${siteOrigin}/movie/detail/${encodeURIComponent(slug)}`,
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
        url: `${siteOrigin}/provider/${entry.slug}`,
      }));

    const payload = {
      schemaVersion: '1.0',
      name: 'KanoDrama',
      url: siteOrigin,
      description:
        `KanoDrama (${siteOrigin}) is a free streaming platform for short dramas (drama pendek), Asian series, Chinese & Korean dramas, and HD movies with Indonesian subtitles (Sub Indo) and multilingual options.`,
      language: 'id, en',
      supportedLanguages: ['id', 'en'],
      generatedAt: new Date().toISOString(),
      endpoints: {
        home: `${siteOrigin}/`,
        explore: `${siteOrigin}/explore`,
        providersHub: `${siteOrigin}/providers`,
        trending: `${siteOrigin}/trending`,
        latest: `${siteOrigin}/latest`,
        vip: `${siteOrigin}/vip`,
        movies: `${siteOrigin}/movies`,
        account: `${siteOrigin}/account`,
        detailPattern: `${siteOrigin}/<provider>/detail/<slug>`,
        watchPattern: `${siteOrigin}/<provider>/watch/<slug>`,
        providerPattern: `${siteOrigin}/provider/<slug>`,
        lookseriesForYouApi: `${siteOrigin}/api/lookseries/foryou`,
        llmsTxt: `${siteOrigin}/llms.txt`,
        homeCatalogApi: `${siteOrigin}/api/home`,
        catalogFilterApi: `${siteOrigin}/api/catalog/filter`,
        sitemap: `${siteOrigin}/sitemap.xml`,
        robotsTxt: `${siteOrigin}/robots.txt`,
      },
      providers: Object.keys(PROVIDER_LOGO_PATHS),
      providerDirectory,
      collections: CURATED_PROGRAMMATIC_PAGES.map((p) => ({
        slug: p.slug,
        title: p.label,
        description: p.description,
        url: `${siteOrigin}/genre/${encodeURIComponent(p.slug)}`,
      })),
      featuredItems,
    };

    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=1800')
      .send(JSON.stringify(payload, null, 2));
  });

  app.get('/robots.txt', (_req: Request, res: Response) => {
    const siteOrigin = DEFAULT_SITE_ORIGIN;
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
          'Allow: /sitemap-part-',
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
          'Allow: /rewards',
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
          `Sitemap: ${siteOrigin}/sitemap.xml`,
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
    const siteOrigin = DEFAULT_SITE_ORIGIN;
    const cached = sitemapEntriesCache.get(siteOrigin);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.entries;
    }

    const existingPromise = sitemapBuildInFlight.get(siteOrigin);
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

      // 1) Homepage, primary categories & provider hubs first
      pushEntry(`${siteOrigin}/`, 'hourly', '1.0', todayIso);
      pushEntry(`${siteOrigin}/movies`, 'hourly', '0.95', todayIso);
      pushEntry(`${siteOrigin}/explore`, 'hourly', '0.95', todayIso);
      pushEntry(`${siteOrigin}/providers`, 'daily', '0.95', todayIso);
      pushEntry(`${siteOrigin}/trending`, 'hourly', '0.9', todayIso);
      pushEntry(`${siteOrigin}/latest`, 'hourly', '0.9', todayIso);
      pushEntry(`${siteOrigin}/vip`, 'daily', '0.85', todayIso);
      pushEntry(`${siteOrigin}/rewards`, 'daily', '0.9', todayIso);

      for (const provName of Object.keys(PROVIDER_SLUG_MAP)) {
        if (provName === 'LK21' || provName === 'LookSeries') continue;
        const provSlug = getProviderRouteSlug(provName);
        pushEntry(`${siteOrigin}/provider/${provSlug}`, 'daily', '0.85', todayIso);
      }

      for (const preset of CURATED_PROGRAMMATIC_PAGES) {
        pushEntry(`${siteOrigin}/genre/${preset.slug}`, 'daily', '0.85', todayIso);
      }

      // 2) Popular & newest valid dramas with complete metadata (/<provider>/detail/<slug>)
      const cachedSitemap = await getCachedDramasForSitemap(100000);
      let validDramaIndex = 0;
      for (const item of cachedSitemap.dramas) {
        const cleanTitle = cleanText(item.title);
        const cleanSlug = (item.slug || slugifyTitle(cleanTitle)).trim().toLowerCase();
        if (
          !cleanTitle ||
          cleanTitle.length < 2 ||
          !isValidSitemapSlug(cleanSlug) ||
          (item.chapterCount ?? 0) < 1 ||
          !cleanText(item.cover)
        ) {
          continue;
        }
        const provSlug = getProviderRouteSlug(item.provider);
        const loc = `${siteOrigin}/${provSlug}/detail/${encodeURIComponent(cleanSlug)}`;
        const lastmod = item.updatedAt
          ? new Date(item.updatedAt).toISOString().split('T')[0]
          : todayIso;
        const priority = validDramaIndex < 150 ? '0.9' : '0.8';
        validDramaIndex++;
        pushEntry(loc, 'daily', priority, lastmod);
      }

      // 3) Valid movies from PostgreSQL `movies` table (/movie/detail/<slug>)
      const cachedMovies = await listMoviesForSitemapFromDb(100000);
      let validMovieIndex = 0;
      for (const m of cachedMovies) {
        const cleanTitle = cleanText(m.title);
        const cleanSlug = cleanText(m.slug).toLowerCase();
        if (
          !cleanTitle ||
          cleanTitle.length < 2 ||
          !isValidSitemapSlug(cleanSlug) ||
          !cleanText(m.cover)
        ) {
          continue;
        }
        const loc = `${siteOrigin}/movie/detail/${encodeURIComponent(cleanSlug)}`;
        const lastmod = m.updatedAt
          ? new Date(m.updatedAt).toISOString().split('T')[0]
          : todayIso;
        const priority = validMovieIndex < 50 ? '0.9' : '0.85';
        validMovieIndex++;
        pushEntry(loc, 'daily', priority, lastmod);
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
              !cleanText(m.cover || m.coverHz || m.coverVt)
            ) {
              continue;
            }
            pushEntry(
              `${siteOrigin}/movie/detail/${encodeURIComponent(cleanSlug)}`,
              'daily',
              '0.85',
              todayIso
            );
          }
        } catch {
          // Ignore cold movie sitemap fallback errors
        }
      }

      // 4) Upstream fallback only if cache has zero dramas yet (cold boot)
      if (cachedSitemap.dramas.length === 0) {
        try {
          const token = getMolaToken();
          if (token) {
            const [rankRes, newRes, nsRankRes, nsAllRes, arForYouRes, mlRankRes] =
              await Promise.allSettled([
                fetch(
                  `${DRAMABOX_V2_BASE_URL}/ranking?page=1&lang=en&token=${token}`,
                  { signal: AbortSignal.timeout(5000) }
                ),
                fetch(
                  `${DRAMABOX_V2_BASE_URL}/terbaru?page=1&lang=en&token=${token}`,
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
                  `${MELOLO_V2_BASE_URL}/rank?page=1&page_size=18&token=${token}`,
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
                const slug = slugifyTitle(title);
                if (title.length >= 2 && isValidSitemapSlug(slug) && cover) {
                  pushEntry(
                    `${siteOrigin}/${provSlug}/detail/${encodeURIComponent(slug)}`,
                    'daily',
                    '0.8',
                    todayIso
                  );
                }
              }
            };
            await Promise.all([
              processResult(rankRes, 'DramaBoxV2'),
              processResult(newRes, 'DramaBoxV2'),
              processResult(nsRankRes, 'NetShort'),
              processResult(nsAllRes, 'NetShort'),
              processResult(arForYouRes, 'AnyReel'),
              processResult(mlRankRes, 'MeloLoV2'),
            ]);
          }
        } catch {
          // Fallback to root & tag entries
        }
      }

      // 5) Curated and dynamic /tag/* pages placed after core content URLs
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
        pushEntry(`${siteOrigin}/tag/${slug}`, 'daily', '0.8', todayIso);
      }

      for (const tag of cachedSitemap.tags) {
        const slug = slugifyTitle(tag);
        if (slug) {
          pushEntry(`${siteOrigin}/tag/${slug}`, 'daily', '0.75');
        }
      }

      const ttl =
        cachedSitemap.dramas.length > 0
          ? SITEMAP_CACHE_TTL_MS
          : SITEMAP_COLD_CACHE_TTL_MS;
      sitemapEntriesCache.set(siteOrigin, {
        expiresAt: Date.now() + ttl,
        entries,
      });

      return entries;
    })().finally(() => {
      sitemapBuildInFlight.delete(siteOrigin);
    });

    sitemapBuildInFlight.set(siteOrigin, buildPromise);
    return buildPromise;
  }

  const handleSitemapIndexXml = async (req: Request, res: Response) => {
    const origin = resolveOrigin(req);
    const siteOrigin = DEFAULT_SITE_ORIGIN;
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
      const partLoc = `${siteOrigin}/sitemap-part-${part}.xml`;
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
        buildCanonicalRedirectUrl(
          req,
          `/${provSlug}/watch/${encodeURIComponent(slug)}${epNum > 1 ? `?ep=${epNum}` : ''}`
        )
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
      const out: SsrRelatedLink[] = [];
      const seen = new Set<string>([excludeSlug.toLowerCase()]);
      const pushItems = (items: Array<Record<string, unknown>>) => {
        for (const item of items) {
          const title = cleanText(item.title ?? item.bookName);
          const slug = (cleanText(item.slug) || slugifyTitle(title)).toLowerCase();
          const provider = cleanText(item.provider, 'DramaBoxV2');
          if (!title || !slug || seen.has(slug)) {
            continue;
          }
          seen.add(slug);
          out.push({ title, slug, provider });
          if (out.length >= 6) break;
        }
      };

      if (tags[0]) {
        const filtered = await filterCatalogFromDb({
          genre: tags[0],
          limit: 10,
          offset: 0,
        });
        pushItems(filtered.items);
      }
      if (out.length < 6) {
        const general = await filterCatalogFromDb({
          limit: 12,
          offset: 0,
        });
        pushItems(general.items);
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

      if (lowerCleanPath === '/index.html') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(301, buildCanonicalRedirectUrl(req, '/'));
        return;
      }

      // Legacy account/provider route redirects (301 canonical)
      if (
        lowerCleanPath === '/dashboard' ||
        lowerCleanPath.startsWith('/dashboard/') ||
        lowerCleanPath === '/watchlist' ||
        lowerCleanPath.startsWith('/watchlist/')
      ) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.redirect(301, buildCanonicalRedirectUrl(req, '/account'));
        return;
      }

      if (
        lowerCleanPath === '/referral' ||
        lowerCleanPath.startsWith('/referral/')
      ) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(301, buildCanonicalRedirectUrl(req, '/rewards'));
        return;
      }

      if (lowerCleanPath === '/provider') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.redirect(301, buildCanonicalRedirectUrl(req, '/providers'));
        return;
      }

      const emptySlugScopedMatch = cleanPath.match(
        /^\/([a-z0-9_]+)\/(detail|watch)$/i
      );
      const isEmptyDramaOrMovieRoute =
        lowerCleanPath === '/drama' ||
        lowerCleanPath === '/movie' ||
        Boolean(emptySlugScopedMatch && isKnownProviderRouteSlug(emptySlugScopedMatch[1]));

      const rawScopedMatch = cleanPath.match(
        /^\/([a-z0-9_]+)\/(detail|watch)\/([^/]+)(?:\/(\d+))?$/i
      );
      const isUnknownScopedProviderRoute = Boolean(
        (rawScopedMatch && !isKnownProviderRouteSlug(rawScopedMatch[1])) ||
          (emptySlugScopedMatch && !isKnownProviderRouteSlug(emptySlugScopedMatch[1]))
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

      const rawLegacyProvMatch =
        !scopedMatch && !providerHubMatch && !legacyMovieSlugMatch
          ? cleanPath.match(/^\/drama\/([a-z0-9_]+)\/([^/]+)$/i)
          : null;
      const legacyProvMatch =
        rawLegacyProvMatch &&
        isKnownProviderRouteSlug(rawLegacyProvMatch[1]) &&
        rawLegacyProvMatch[1].toLowerCase() !== 'lk21' &&
        rawLegacyProvMatch[1].toLowerCase() !== 'lookseries'
          ? rawLegacyProvMatch
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
        'movies' | 'explore' | 'providers' | 'trending' | 'latest' | 'vip' | 'dashboard' | 'rewards'
      > = {
        '/movies': 'movies',
        '/explore': 'explore',
        '/providers': 'providers',
        '/trending': 'trending',
        '/latest': 'latest',
        '/vip': 'vip',
        '/account': 'dashboard',
        '/rewards': 'rewards',
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

      if ((isEmptyDramaOrMovieRoute && !queryBookId) || isUnknownScopedProviderRoute) {
        const emptyProvSlug =
          emptySlugScopedMatch?.[1]?.toLowerCase() ||
          rawScopedMatch?.[1]?.toLowerCase() ||
          '';
        const isMovieKind =
          lowerCleanPath === '/movie' ||
          emptyProvSlug === 'movie' ||
          emptyProvSlug === 'movies' ||
          emptyProvSlug === 'lk21' ||
          emptyProvSlug === 'lookseries';
        ssrHttpStatus = 404;
        isNotFoundResponse = true;
        html = injectNotFoundSeoIntoHtml(
          html,
          origin,
          req.path,
          isMovieKind ? 'movie' : 'drama',
          ssrLang
        );
      } else if (scopedMatch) {
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
              res.redirect(301, buildCanonicalRedirectUrl(req, targetPath));
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
            : queryProvHint ?? 'DramaBoxV2';
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
              (await findDramaBySlugInHomeCache(segment, providerHint)) ||
              (await findDramaBySlugInApiCache(segment, providerHint)) ||
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
            const canonicalProvSlug = getProviderRouteSlug(resolvedDrama.provider);
            if (
              routeProvSlug !== canonicalProvSlug ||
              segment.trim().toLowerCase() !== finalSlug
            ) {
              const targetPath = `/${canonicalProvSlug}/${isWatchRoute ? 'watch' : 'detail'}/${encodeURIComponent(finalSlug)}${epParam > 1 ? `?ep=${epParam}` : ''}`;
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.redirect(301, buildCanonicalRedirectUrl(req, targetPath));
              return;
            }
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
          res.redirect(301, buildCanonicalRedirectUrl(req, targetPath));
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
          res.redirect(301, buildCanonicalRedirectUrl(req, targetPath));
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
            const providerHint = queryProvHint ?? 'DramaBoxV2';
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
          res.redirect(301, buildCanonicalRedirectUrl(req, targetPath));
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
              : queryProvHint ?? 'DramaBoxV2';
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
        const normalizedTopicSeg = decodeURIComponent(slugSeg || '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        if (
          !normalizedTopicSeg ||
          normalizedTopicSeg === 'null' ||
          normalizedTopicSeg === 'undefined' ||
          normalizedTopicSeg === 'unknown' ||
          normalizedTopicSeg === 'none'
        ) {
          ssrHttpStatus = 404;
          isNotFoundResponse = true;
          html = injectNotFoundSeoIntoHtml(
            html,
            origin,
            req.path,
            'drama',
            ssrLang
          );
        } else {
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
        }
      } else if (providerHubMatch) {
        const rawProvSlug = decodeURIComponent(providerHubMatch[1]).trim().toLowerCase();
        if (
          rawProvSlug === 'movie' ||
          rawProvSlug === 'movies' ||
          rawProvSlug === 'lk21' ||
          rawProvSlug === 'lookseries'
        ) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.redirect(301, buildCanonicalRedirectUrl(req, '/movies'));
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
            res.redirect(301, buildCanonicalRedirectUrl(req, `/provider/${canonicalSlug}`));
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
      } else if (cleanPath === '/' || cleanPath === '') {
        let homeFeatured: HomeSsrFeaturedData | undefined;
        let initialHomeSsr: Awaited<ReturnType<typeof peekCachedHomeDataForSsr>> = null;
        try {
          const [cachedDramasRes, cachedMoviesRes, peekHome] = await Promise.race([
            Promise.all([
              getCachedDramasForSitemap(12).catch(() => ({ dramas: [], tags: [] })),
              listMoviesForSitemapFromDb(6).catch(() => []),
              peekCachedHomeDataForSsr(ssrLang, 'All').catch(() => null),
            ]),
            new Promise<[{ dramas: Array<{ title: string; slug: string; provider: string }>; tags: string[] }, Array<{ title: string; slug: string }>, null]>(
              (resolve) => setTimeout(() => resolve([{ dramas: [], tags: [] }, [], null]), 350)
            ),
          ]);
          initialHomeSsr = peekHome;
          const dramaLinks: SsrRelatedLink[] = cachedDramasRes.dramas
            .filter((d) => cleanText(d.title) && isValidSitemapSlug(d.slug))
            .slice(0, 12)
            .map((d) => ({
              title: cleanText(d.title),
              slug: d.slug,
              provider: d.provider,
            }));
          const movieLinks: SsrRelatedLink[] = cachedMoviesRes
            .filter((m) => cleanText(m.title) && isValidSitemapSlug(m.slug))
            .slice(0, 6)
            .map((m) => ({
              title: cleanText(m.title),
              slug: m.slug,
              provider: /^ls-/i.test(m.slug) ? 'LookSeries' : 'LK21',
            }));
          if (dramaLinks.length > 0 || movieLinks.length > 0) {
            homeFeatured = { dramas: dramaLinks, movies: movieLinks };
          }
        } catch {
          // Proceed cleanly without featured SSR links on timeout
        }

        html = injectPageMetadataIntoHtml(
          html,
          origin,
          'home',
          '/',
          ssrLang,
          homeFeatured
        );
        if (initialHomeSsr) {
          const homeBootstrapScript = `<script>window.__INITIAL_HOME__=${JSON.stringify(
            initialHomeSsr
          ).replace(/<\/script>/gi, '<\\/script>')};</script>`;
          html = html.replace('</head>', `${homeBootstrapScript}\n  </head>`);
        }
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

      if (!isBotOrAutomatedRequest(req)) {
        const bootVariant: BrowserBootVariant = isNotFoundResponse
          ? 'notfound'
          : sectionPage === 'rewards'
          ? 'rewards'
          : sectionPage === 'dashboard'
          ? 'account'
          : scopedMatch ||
            legacyMovieSlugMatch ||
            legacyProvMatch ||
            legacySlugOrIdMatch ||
            queryBookId
          ? 'detail'
          : sectionPage || tagMatch || genreMatch || providerHubMatch
          ? 'grid'
          : 'home';
        html = replaceRootWithBrowserShell(html, bootVariant);
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

  return { app, vite };
}

async function startServer() {
  const { app } = await createServerApp({ enableVite: !IS_PROD });
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

const isNodeTestRunner =
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.some((arg) => arg.includes('.test.'));

if (process.env.KD_DISABLE_AUTO_LISTEN !== '1' && !isNodeTestRunner) {
  void startServer();
}
