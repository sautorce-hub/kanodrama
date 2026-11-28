import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.ADMIN_PAYOUT_SECRET = 'test-admin-secret-seo-audit';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-seo-audit';
process.env.SITE_URL = 'https://kano-drama.live';
delete process.env.DATABASE_URL;
process.env.MOLA_API_TOKEN = 'test-mola-token-seo-audit';

import { createServerApp } from '../server';
import { isMovieMarkedUnavailable, markMovieAvailability } from '../server/db';
import {
  clearHomeCatalogCache,
  isCacheableMolaDetailOrEpisodePath,
} from '../server/homeCache';
import { getLk21Detail } from '../server/lk21Service';
import {
  formatCanonicalDate,
  formatCanonicalTime,
  getCanonicalTimeZone,
} from '../src/i18n/helpers';
import { resolveProgrammaticLanding } from '../src/utils/programmaticSeo';

async function withTestServer<T>(
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

function extractTagContent(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return (match?.[1] || '').trim();
}

test('1. Broken 404 /movie/detail/... slugs are blocked from feeds, details, and /sitemap-part-1.xml', async () => {
  const kurokoSlug = 'kuroko-no-basket-saikou-no-present-desu-2015';
  const mariahSlug = 'mariah-carey-presente-mon-plus-beau-cadeau-de-noel-2017';
  const validSlug = 'valid-action-feature-2025';

  markMovieAvailability(kurokoSlug, true);
  markMovieAvailability(mariahSlug, true);
  markMovieAvailability(validSlug, true);

  await withTestServer(
    (url) => {
      if (url.includes('/api/lk21/detail')) {
        if (url.includes(kurokoSlug)) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes(mariahSlug)) {
          return new Response(
            JSON.stringify({
              slug: mariahSlug,
              title: 'Movie Title',
              poster: '',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes(validSlug)) {
          return new Response(
            JSON.stringify({
              slug: validSlug,
              title: 'Valid Action Feature (2025)',
              poster: 'https://img.kano-drama.live/valid-action-2025.jpg',
              synopsis: 'An action-packed feature film verified 200 OK.',
              type: 'movie',
              rating: '8.1',
              providers: [{ name: 'VIP Stream', url: 'https://embed.kano-drama.live/v1' }],
              recommendations: [
                {
                  slug: kurokoSlug,
                  title: 'Kuroko Broken Recommendation',
                  poster: 'https://img.kano-drama.live/kuroko.jpg',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (url.includes('/api/lk21/episodes')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/lk21/')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                slug: kurokoSlug,
                title: 'Kuroko Broken Feed Item',
                poster: 'https://img.kano-drama.live/kuroko.jpg',
              },
              {
                slug: validSlug,
                title: 'Valid Action Feature (2025)',
                poster: 'https://img.kano-drama.live/valid-action-2025.jpg',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    async (base) => {
      // 1a. Both broken 404 & placeholder details return null/404 and get marked unavailable
      const kurokoRes = await fetch(`${base}/movie/detail/${kurokoSlug}`);
      assert.equal(kurokoRes.status, 404);
      assert.match(kurokoRes.headers.get('x-robots-tag') || '', /noindex/i);
      assert.equal(isMovieMarkedUnavailable(kurokoSlug), true);

      const mariahDetail = await getLk21Detail(() => 'test-token', mariahSlug, base);
      assert.equal(mariahDetail, null);
      assert.equal(isMovieMarkedUnavailable(mariahSlug), true);

      // 1b. Valid film still resolves 200 OK and filters out broken recommendations
      const validRes = await fetch(`${base}/movie/detail/${validSlug}`, {
        headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      });
      assert.equal(validRes.status, 200);
      const validHtml = await validRes.text();
      assert.doesNotMatch(validHtml, new RegExp(kurokoSlug));
      assert.doesNotMatch(validHtml, /HouseDrama|house-drama/i);

      // 1c. LK21 feeds exclude unavailable 404 movies
      const latestRes = await fetch(`${base}/api/lk21/latest?page=1`);
      assert.equal(latestRes.status, 200);
      const latestJson = (await latestRes.json()) as {
        items?: Array<{ slug: string }>;
      };
      assert.ok(latestJson.items?.some((item) => item.slug === validSlug));
      assert.equal(
        latestJson.items?.some((item) => item.slug === kurokoSlug || item.slug === mariahSlug),
        false
      );

      // 1d. Sitemap excludes marked-unavailable / 404 movie slugs and old brand
      const sitemapRes = await fetch(`${base}/sitemap-part-1.xml`);
      assert.equal(sitemapRes.status, 200);
      const sitemapXml = await sitemapRes.text();
      assert.doesNotMatch(sitemapXml, new RegExp(kurokoSlug));
      assert.doesNotMatch(sitemapXml, new RegExp(mariahSlug));
      assert.doesNotMatch(sitemapXml, /HouseDrama|house-drama/i);
    }
  );
});

test('2. /genre/* and /tag/* have unique title, meta description, h1, intro, and self-referencing canonicals', async () => {
  for (const lang of ['id', 'en'] as const) {
    for (const slug of ['ceo', 'romance', 'hidden-heir']) {
      const genreCfg = resolveProgrammaticLanding(slug, 'genre', undefined, lang);
      const tagCfg = resolveProgrammaticLanding(slug, 'tag', undefined, lang);

      assert.notEqual(
        genreCfg.title,
        tagCfg.title,
        `${lang}:${slug} genre and tag titles must differ`
      );
      assert.notEqual(
        genreCfg.description,
        tagCfg.description,
        `${lang}:${slug} genre and tag descriptions must differ`
      );
      assert.notEqual(
        genreCfg.h1,
        tagCfg.h1,
        `${lang}:${slug} genre and tag h1 must differ`
      );
      assert.notEqual(
        genreCfg.intro,
        tagCfg.intro,
        `${lang}:${slug} genre and tag intro must differ`
      );
      assert.equal(genreCfg.canonicalPath, `/genre/${slug}`);
      assert.equal(tagCfg.canonicalPath, `/tag/${slug}`);
      assert.ok(genreCfg.relatedSlugs.every((item) => item.path.startsWith('/genre/')));
      assert.ok(tagCfg.relatedSlugs.every((item) => item.path.startsWith('/tag/')));
    }
  }

  await withTestServer(
    () =>
      new Response(
        JSON.stringify({
          data: {
            list: [
              {
                bookId: 'seo-ceo-1',
                bookName: 'Billionaire CEO Secret Contract',
                coverWap: 'https://img.kano-drama.live/seo-ceo-1.jpg',
                introduction: 'A CEO contract romance hit.',
                chapterCount: 60,
                tags: ['CEO', 'Romance'],
              },
              {
                bookId: 'seo-ceo-2',
                bookName: 'After the Vow Romance',
                coverWap: 'https://img.kano-drama.live/seo-ceo-2.jpg',
                introduction: 'Romantic drama full season.',
                chapterCount: 45,
                tags: ['Romance', 'Marriage'],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
    async (base) => {
      // Warm home catalog so SSR landing has sample titles
      await fetch(`${base}/api/home?lang=id&provider=All`);

      const [genreRes, tagRes] = await Promise.all([
        fetch(`${base}/genre/ceo?lang=id`, {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }),
        fetch(`${base}/tag/ceo?lang=id`, {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }),
      ]);

      assert.equal(genreRes.status, 200);
      assert.equal(tagRes.status, 200);
      const genreHtml = await genreRes.text();
      const tagHtml = await tagRes.text();

      const genreTitle = extractTagContent(genreHtml, /<title>([^<]+)<\/title>/i);
      const tagTitle = extractTagContent(tagHtml, /<title>([^<]+)<\/title>/i);
      const genreDesc = extractTagContent(
        genreHtml,
        /<meta\s+name="description"\s+content="([^"]+)"/i
      );
      const tagDesc = extractTagContent(
        tagHtml,
        /<meta\s+name="description"\s+content="([^"]+)"/i
      );
      const genreCanonical = extractTagContent(
        genreHtml,
        /<link\s+rel="canonical"\s+href="([^"]+)"/i
      );
      const tagCanonical = extractTagContent(
        tagHtml,
        /<link\s+rel="canonical"\s+href="([^"]+)"/i
      );

      assert.ok(genreTitle.length > 10 && tagTitle.length > 10);
      assert.notEqual(genreTitle, tagTitle);
      assert.ok(genreDesc.length > 20 && tagDesc.length > 20);
      assert.notEqual(genreDesc, tagDesc);
      assert.equal(genreCanonical, 'https://kano-drama.live/genre/ceo');
      assert.equal(tagCanonical, 'https://kano-drama.live/tag/ceo');
      assert.doesNotMatch(genreHtml, /HouseDrama|house-drama/i);
      assert.doesNotMatch(tagHtml, /HouseDrama|house-drama/i);

      // /api/seo/landing differentiates genre vs tag too
      const [apiGenreRes, apiTagRes] = await Promise.all([
        fetch(`${base}/api/seo/landing?basePath=genre&slug=ceo&lang=id`),
        fetch(`${base}/api/seo/landing?basePath=tag&slug=ceo&lang=id`),
      ]);
      assert.equal(apiGenreRes.status, 200);
      assert.equal(apiTagRes.status, 200);
      const apiGenre = (await apiGenreRes.json()) as {
        landing: { title: string; description: string; h1: string };
      };
      const apiTag = (await apiTagRes.json()) as {
        landing: { title: string; description: string; h1: string };
      };
      assert.notEqual(apiGenre.landing.title, apiTag.landing.title);
      assert.notEqual(apiGenre.landing.description, apiTag.landing.description);
      assert.notEqual(apiGenre.landing.h1, apiTag.landing.h1);
    }
  );
});

test('3. Detail API & /dramaboxv2/detail/* SSR use caching and fast timeout fallback without blocking', async () => {
  assert.equal(isCacheableMolaDetailOrEpisodePath('dramaboxv2/detail'), true);
  assert.equal(isCacheableMolaDetailOrEpisodePath('dramaboxv2/allepisode'), true);
  assert.equal(isCacheableMolaDetailOrEpisodePath('dramaboxv2/stream'), false);

  let detailUpstreamCalls = 0;
  let stallUpstreamDetail = false;

  await withTestServer(
    async (url) => {
      if (url.includes('/dramaboxv2/detail')) {
        detailUpstreamCalls += 1;
        if (stallUpstreamDetail) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
        }
        return new Response(
          JSON.stringify({
            data: {
              bookId: 'fast-db-101',
              bookName: 'Fast Cached CEO Drama',
              coverWap: 'https://img.kano-drama.live/fast-db-101.jpg',
              introduction: 'Fast SSR detail cached payload.',
              chapterCount: 24,
              tags: ['CEO', 'Romance'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/dramaboxv2/allepisode')) {
        return new Response(
          JSON.stringify({
            data: [
              { chapterIndex: 0, chapterId: 'ep-fast-1', title: 'Episode 1' },
              { chapterIndex: 1, chapterId: 'ep-fast-2', title: 'Episode 2' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/dramaboxv2/')) {
        return new Response(
          JSON.stringify({
            data: {
              list: [
                {
                  bookId: 'fast-db-101',
                  bookName: 'Fast Cached CEO Drama',
                  coverWap: 'https://img.kano-drama.live/fast-db-101.jpg',
                  introduction: 'Cached from home feed.',
                  chapterCount: 24,
                  tags: ['CEO', 'Romance'],
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ data: { list: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    async (base) => {
      // 3a. Proxy /api/mola/dramaboxv2/detail caches repeated requests
      const firstApiRes = await fetch(
        `${base}/api/mola/dramaboxv2/detail?book_id=fast-db-101`
      );
      assert.equal(firstApiRes.status, 200);
      const callsAfterMiss = detailUpstreamCalls;
      assert.ok(callsAfterMiss >= 1);

      const secondApiRes = await fetch(
        `${base}/api/mola/dramaboxv2/detail?book_id=fast-db-101`
      );
      assert.equal(secondApiRes.status, 200);
      assert.equal(secondApiRes.headers.get('x-mola-cache'), 'HIT');
      assert.equal(detailUpstreamCalls, callsAfterMiss);

      // 3b. Warm home cache, then stall upstream detail (3.5s) -> SSR /dramaboxv2/detail/* falls back quickly
      await fetch(`${base}/api/home?lang=id&provider=All`);
      stallUpstreamDetail = true;
      const t0 = Date.now();
      const ssrSlowRes = await fetch(
        `${base}/dramaboxv2/detail/fast-cached-ceo-drama-fast-db-101`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          },
        }
      );
      const elapsedMs = Date.now() - t0;
      assert.equal(ssrSlowRes.status, 200);
      assert.ok(
        elapsedMs < 2000,
        `SSR detail page should fast-fallback below 2000ms, took ${elapsedMs}ms`
      );
      const ssrHtml = await ssrSlowRes.text();
      assert.match(ssrHtml, /Fast Cached CEO Drama/i);
      assert.match(
        ssrHtml,
        /<link\s+rel="canonical"\s+href="https:\/\/kano-drama\.live\/dramaboxv2\/detail\/[^"]+"/i
      );
      assert.doesNotMatch(ssrHtml, /HouseDrama|house-drama/i);
    }
  );
});

test('4. Brand naming and WIB/UTC timezone formatting remain compliant', () => {
  assert.equal(getCanonicalTimeZone('id'), 'Asia/Jakarta');
  assert.equal(getCanonicalTimeZone('en'), 'UTC');
  assert.equal(getCanonicalTimeZone('vi'), 'UTC');

  const sampleDate = '2026-11-28T10:00:00.000Z';
  assert.match(formatCanonicalTime(sampleDate, 'id'), /\bWIB\b/);
  assert.match(formatCanonicalTime(sampleDate, 'en'), /\bUTC\b/);
  assert.match(formatCanonicalTime(sampleDate, 'ja'), /\bUTC\b/);
  assert.match(formatCanonicalDate(sampleDate, 'id'), /\bWIB\b/);
  assert.match(formatCanonicalDate(sampleDate, 'en'), /\bUTC\b/);
});
