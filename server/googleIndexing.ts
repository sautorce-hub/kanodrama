import crypto from 'node:crypto';
import {
  getRecentlyPingedUrlsFromDb,
  getSeoIndexingSummaryFromDb,
  upsertSeoIndexingLogInDb,
} from './db.ts';
import { getProviderRouteSlug } from '../src/constants/providerLogos.ts';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_INDEXING_PUBLISH_ENDPOINT =
  'https://indexing.googleapis.com/v3/urlNotifications:publish';
const GOOGLE_INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';

interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

export interface IndexingUrlTarget {
  url: string;
  entityType?: 'drama' | 'movie' | 'episode' | 'genre' | 'sitemap' | 'page';
  entityId?: string;
  provider?: string;
  action?: 'URL_UPDATED' | 'URL_DELETED';
}

export interface IndexingSubmitResult {
  url: string;
  status: 'submitted' | 'queued_unconfigured' | 'skipped_recent' | 'error';
  httpStatus: number;
  message: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
const inMemoryRecentPings = new Map<string, number>();

export function resolveSiteOrigin(fallbackOrigin?: string): string {
  const candidates = [
    process.env.SITE_URL,
    process.env.APP_URL,
    process.env.VITE_SITE_URL,
    fallbackOrigin,
    'http://localhost:3000',
  ];
  for (const cand of candidates) {
    const clean = (cand || '').trim().replace(/\/+$/, '');
    if (clean && /^https?:\/\//i.test(clean)) {
      return clean;
    }
  }
  return 'http://localhost:3000';
}

function loadServiceAccountCredentials(): ServiceAccountCredentials | null {
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

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGoogleIndexingAccessToken(
  creds: ServiceAccountCredentials
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > nowSec + 60) {
    return cachedAccessToken.token;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: GOOGLE_INDEXING_SCOPE,
      aud: GOOGLE_TOKEN_ENDPOINT,
      exp: nowSec + 3600,
      iat: nowSec,
    })
  );

  const unsignedJwt = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = base64UrlEncode(signer.sign(creds.privateKey));
  const assertion = `${unsignedJwt}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`OAuth token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenJson.access_token) {
    throw new Error('OAuth token response missing access_token');
  }

  cachedAccessToken = {
    token: tokenJson.access_token,
    expiresAt: nowSec + Math.max(300, Number(tokenJson.expires_in) || 3600),
  };
  return cachedAccessToken.token;
}

export async function notifyGoogleIndexingUrls(
  targets: IndexingUrlTarget[],
  options?: {
    fallbackOrigin?: string;
    force?: boolean;
    dedupHours?: number;
    maxBatchSize?: number;
  }
): Promise<IndexingSubmitResult[]> {
  if (!targets || targets.length === 0) return [];

  const dedupMs = Math.max(1, options?.dedupHours ?? 12) * 3600 * 1000;
  const maxBatch = Math.min(50, Math.max(1, options?.maxBatchSize ?? 15));
  const force = Boolean(options?.force);

  const deduped = new Map<string, IndexingUrlTarget>();
  for (const t of targets) {
    const cleanUrl = (t.url || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) continue;
    if (!deduped.has(cleanUrl)) {
      deduped.set(cleanUrl, { ...t, url: cleanUrl });
    }
    if (deduped.size >= maxBatch) break;
  }

  const uniqueTargets = Array.from(deduped.values());
  if (uniqueTargets.length === 0) return [];

  const urlList = uniqueTargets.map((u) => u.url);
  const recentDbMap = force
    ? new Map<string, number>()
    : await getRecentlyPingedUrlsFromDb(urlList, dedupMs);

  const now = Date.now();
  const creds = loadServiceAccountCredentials();
  const results: IndexingSubmitResult[] = [];

  let accessToken: string | null = null;
  let tokenError: string | null = null;
  if (creds) {
    try {
      accessToken = await getGoogleIndexingAccessToken(creds);
    } catch (err) {
      tokenError = err instanceof Error ? err.message : String(err);
    }
  }

  for (const target of uniqueTargets) {
    const lastMem = inMemoryRecentPings.get(target.url) || 0;
    const lastDb = recentDbMap.get(target.url) || 0;
    const lastAt = Math.max(lastMem, lastDb);

    if (!force && lastAt > 0 && now - lastAt < dedupMs) {
      results.push({
        url: target.url,
        status: 'skipped_recent',
        httpStatus: 204,
        message: 'Already submitted within deduplication window',
      });
      continue;
    }

    inMemoryRecentPings.set(target.url, now);
    const action = target.action || 'URL_UPDATED';

    if (!creds) {
      const msg =
        'Queued in PostgreSQL (configure GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON to dispatch live Google pings)';
      await upsertSeoIndexingLogInDb({
        url: target.url,
        entityType: target.entityType || 'drama',
        entityId: target.entityId || '',
        provider: target.provider || '',
        action,
        status: 'queued_unconfigured',
        responseCode: 0,
        responseBody: msg,
      });
      results.push({
        url: target.url,
        status: 'queued_unconfigured',
        httpStatus: 202,
        message: msg,
      });
      continue;
    }

    if (!accessToken) {
      const msg = tokenError || 'Failed to obtain Google OAuth access token';
      await upsertSeoIndexingLogInDb({
        url: target.url,
        entityType: target.entityType || 'drama',
        entityId: target.entityId || '',
        provider: target.provider || '',
        action,
        status: 'error',
        responseCode: 401,
        responseBody: msg,
      });
      results.push({
        url: target.url,
        status: 'error',
        httpStatus: 401,
        message: msg,
      });
      continue;
    }

    try {
      const publishRes = await fetch(GOOGLE_INDEXING_PUBLISH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url: target.url,
          type: action,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const bodyText = (await publishRes.text().catch(() => '')).slice(0, 600);
      const ok = publishRes.ok;

      await upsertSeoIndexingLogInDb({
        url: target.url,
        entityType: target.entityType || 'drama',
        entityId: target.entityId || '',
        provider: target.provider || '',
        action,
        status: ok ? 'submitted' : 'error',
        responseCode: publishRes.status,
        responseBody: bodyText,
      });

      results.push({
        url: target.url,
        status: ok ? 'submitted' : 'error',
        httpStatus: publishRes.status,
        message: ok ? 'Submitted to Google Indexing API' : bodyText || `HTTP ${publishRes.status}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await upsertSeoIndexingLogInDb({
        url: target.url,
        entityType: target.entityType || 'drama',
        entityId: target.entityId || '',
        provider: target.provider || '',
        action,
        status: 'error',
        responseCode: 500,
        responseBody: msg,
      });
      results.push({
        url: target.url,
        status: 'error',
        httpStatus: 500,
        message: msg,
      });
    }
  }

  return results;
}

export async function notifyCatalogAdditionsToGoogle(
  items: Array<{
    dramaId: string;
    provider: string;
    slug: string;
    chapterCount: number;
    reason: 'new_drama' | 'new_episode';
  }>,
  fallbackOrigin?: string
): Promise<IndexingSubmitResult[]> {
  if (!items || items.length === 0) return [];
  const origin = resolveSiteOrigin(fallbackOrigin);
  const targets: IndexingUrlTarget[] = [];

  for (const item of items) {
    if (!item.slug) continue;
    const provSlug = getProviderRouteSlug(item.provider);
    const encodedSlug = encodeURIComponent(item.slug);
    const baseDramaUrl = `${origin}/${provSlug}/detail/${encodedSlug}`;
    targets.push({
      url: baseDramaUrl,
      entityType: item.reason === 'new_episode' ? 'episode' : 'drama',
      entityId: item.dramaId,
      provider: item.provider,
      action: 'URL_UPDATED',
    });

    if (item.reason === 'new_episode' && item.chapterCount > 1) {
      targets.push({
        url: `${origin}/${provSlug}/watch/${encodedSlug}?ep=${item.chapterCount}`,
        entityType: 'episode',
        entityId: `${item.dramaId}:ep${item.chapterCount}`,
        provider: item.provider,
        action: 'URL_UPDATED',
      });
    }
  }

  return notifyGoogleIndexingUrls(targets, {
    fallbackOrigin: origin,
    dedupHours: 12,
    maxBatchSize: 15,
  });
}

export async function notifyMovieAdditionsToGoogle(
  items: Array<{
    slug: string;
    movieId: string;
    title: string;
  }>,
  fallbackOrigin?: string
): Promise<IndexingSubmitResult[]> {
  if (!items || items.length === 0) return [];
  const origin = resolveSiteOrigin(fallbackOrigin);
  const targets: IndexingUrlTarget[] = items
    .filter((m) => Boolean(m.slug))
    .map((m) => ({
      url: `${origin}/movie/detail/${encodeURIComponent(m.slug)}`,
      entityType: 'movie',
      entityId: m.movieId || m.slug,
      provider: 'LK21',
      action: 'URL_UPDATED',
    }));

  return notifyGoogleIndexingUrls(targets, {
    fallbackOrigin: origin,
    dedupHours: 12,
    maxBatchSize: 15,
  });
}

export async function getGoogleIndexingStatus(fallbackOrigin?: string) {
  const creds = loadServiceAccountCredentials();
  const origin = resolveSiteOrigin(fallbackOrigin);
  const dbSummary = await getSeoIndexingSummaryFromDb(25);
  return {
    configured: Boolean(creds),
    clientEmailHint: creds
      ? creds.clientEmail.replace(/(.{4}).*(@.*)/, '$1***$2')
      : null,
    siteOrigin: origin,
    ...dbSummary,
  };
}
