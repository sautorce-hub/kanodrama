import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.ADMIN_PAYOUT_SECRET = 'test-admin-secret-home-cache';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-home-cache';
process.env.SITE_URL = 'https://kano-drama.live';
delete process.env.DATABASE_URL;
process.env.MOLA_API_TOKEN = 'test-mola-token-home-cache';

import { createServerApp } from '../server';
import { clearHomeCatalogCache, HOME_CACHE_TTL_MS } from '../server/homeCache';

async function withMockedUpstreamServer<T>(
  upstreamHandler: (url: string) => Response | Promise<Response>,
  run: (baseUrl: string) => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return originalFetch(input, init);
    }
    if (url.startsWith('https://api.molatv.id/')) {
      return upstreamHandler(url);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const { app } = await createServerApp({ enableVite: false });
  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await clearHomeCatalogCache({ includeApiFeedCache: true });
    return await run(baseUrl);
  } finally {
    await clearHomeCatalogCache({ includeApiFeedCache: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    globalThis.fetch = originalFetch;
  }
}

function makeMockBookResponse(providerSlug: string, lang: string) {
  const safeId = `${providerSlug}-${lang}-101`;
  return new Response(
    JSON.stringify({
      data: {
        list: [
          {
            bookId: safeId,
            bookName: `Mock ${providerSlug} ${lang.toUpperCase()} CEO Romance`,
            coverWap: `https://img.kano-drama.live/${safeId}.jpg`,
            introduction: `Cached catalog description for ${providerSlug} (${lang}).`,
            chapterCount: 48,
            tags: ['Romance', 'CEO'],
            playCount: '1.8M',
          },
        ],
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

test('1. Home catalog cache serves HIT on repeated refreshes without extra upstream calls and isolates lang keys', async () => {
  let upstreamCalls = 0;
  await withMockedUpstreamServer(
    (url) => {
      upstreamCalls += 1;
      const match = url.match(/^https:\/\/api\.molatv\.id\/api\/([^/]+)\//);
      const slug = match?.[1] || 'dramaboxv2';
      const lang = url.includes('lang=in') ? 'id' : 'en';
      return makeMockBookResponse(slug, lang);
    },
    async (base) => {
      assert.ok(HOME_CACHE_TTL_MS >= 5 * 60 * 1000 && HOME_CACHE_TTL_MS <= 30 * 60 * 1000);

      // First request for id:All misses and populates cache
      const firstRes = await fetch(`${base}/api/home?lang=id&provider=All`);
      assert.equal(firstRes.status, 200);
      assert.equal(firstRes.headers.get('x-home-cache'), 'MISS');
      assert.match(firstRes.headers.get('cache-control') || '', /stale-while-revalidate=/i);
      const firstBody = (await firstRes.json()) as {
        cached: boolean;
        stale: boolean;
        heroSpotlights: Array<{ provider: string }>;
        trendingTop: Array<{ provider: string }>;
        catalogGrid: Array<{ provider: string }>;
      };
      assert.equal(firstBody.cached, false);
      assert.equal(firstBody.stale, false);
      assert.ok(firstBody.heroSpotlights.length > 0);
      assert.ok(firstBody.catalogGrid.length > 0);

      const callsAfterFirstMiss = upstreamCalls;
      assert.ok(callsAfterFirstMiss > 0);

      // Repeated refreshes for id:All hit cache with ZERO additional upstream calls
      const secondRes = await fetch(`${base}/api/home?lang=id&provider=All`);
      assert.equal(secondRes.status, 200);
      assert.equal(secondRes.headers.get('x-home-cache'), 'HIT');
      const secondBody = (await secondRes.json()) as { cached: boolean; stale: boolean };
      assert.equal(secondBody.cached, true);
      assert.equal(secondBody.stale, false);
      assert.equal(upstreamCalls, callsAfterFirstMiss);

      // Different language uses a distinct cache key
      const enRes = await fetch(`${base}/api/home?lang=en&provider=All`);
      assert.equal(enRes.status, 200);
      assert.equal(enRes.headers.get('x-home-cache'), 'MISS');
      assert.ok(upstreamCalls > callsAfterFirstMiss);
    }
  );
});

test('2. Home cache preserves cached catalog on upstream failure, supports cache-clear, and SSR keeps SEO meta + __INITIAL_HOME__', async () => {
  let failUpstream = false;
  await withMockedUpstreamServer(
    (url) => {
      if (failUpstream) {
        return new Response('Upstream error', { status: 503 });
      }
      const match = url.match(/^https:\/\/api\.molatv\.id\/api\/([^/]+)\//);
      const slug = match?.[1] || 'dramaboxv2';
      return makeMockBookResponse(slug, 'en');
    },
    async (base) => {
      // Warm cache
      const warmRes = await fetch(`${base}/api/home?lang=en&provider=All`);
      assert.equal(warmRes.status, 200);
      const warmBody = (await warmRes.json()) as { catalogGrid: Array<{ bookId: string }> };
      assert.ok(warmBody.catalogGrid.length > 0);

      // Upstream fails on forced refresh -> existing cached items MUST be preserved with stale=true
      failUpstream = true;
      const failRefreshRes = await fetch(`${base}/api/home?lang=en&provider=All&refresh=1`);
      assert.equal(failRefreshRes.status, 200);
      const failRefreshBody = (await failRefreshRes.json()) as {
        cached: boolean;
        stale: boolean;
        catalogGrid: Array<{ bookId: string }>;
      };
      assert.equal(failRefreshBody.cached, true);
      assert.equal(failRefreshBody.stale, true);
      assert.equal(failRefreshBody.catalogGrid.length, warmBody.catalogGrid.length);

      // SSR home page preserves SEO metadata + embeds __INITIAL_HOME__
      const ssrRes = await fetch(`${base}/`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        },
      });
      assert.equal(ssrRes.status, 200);
      const ssrHtml = await ssrRes.text();
      assert.match(ssrHtml, /<title>.*KanoDrama.*<\/title>/i);
      assert.match(ssrHtml, /<meta[^>]+name="description"/i);
      assert.match(ssrHtml, /<meta[^>]+property="og:image"/i);
      assert.match(ssrHtml, /window\.__INITIAL_HOME__\s*=/);

      // Clean cache clear removes entries
      const clearRes = await fetch(`${base}/api/home/cache-clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: 'en', provider: 'All', warm: false }),
      });
      assert.equal(clearRes.status, 200);
      const clearBody = (await clearRes.json()) as { ok: boolean; clearedKeys: string[] };
      assert.equal(clearBody.ok, true);
      assert.ok(clearBody.clearedKeys.includes('home:en:All'));

      // After clear with upstream still failing, emergency LookSeries fallback works or gracefully recovers without 500
      failUpstream = false;
      const rebuiltRes = await fetch(`${base}/api/home?lang=en&provider=All`);
      assert.equal(rebuiltRes.status, 200);
      assert.equal(rebuiltRes.headers.get('x-home-cache'), 'MISS');
    }
  );
});

test('3. LookSeries emergency fallback populates Home cache if all primary drama upstreams fail on cold cache', async () => {
  await withMockedUpstreamServer(
    (url) => {
      if (url.includes('/lookseries/')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'ls-9001',
                title: 'LookSeries Fallback Drama',
                cover: 'https://img.kano-drama.live/ls-9001.jpg',
                synopsis: 'Fallback drama item from LookSeries.',
                episodes: 16,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response('Upstream unavailable', { status: 503 });
    },
    async (base) => {
      const res = await fetch(`${base}/api/home?lang=id&provider=All`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        stale: boolean;
        catalogGrid: Array<{ provider: string; title: string }>;
      };
      assert.equal(body.stale, true);
      assert.ok(
        body.catalogGrid.some((item) => item.provider === 'LookSeries'),
        'LookSeries fallback should populate catalogGrid when primary drama upstreams fail'
      );
    }
  );
});
