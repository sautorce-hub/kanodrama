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
import {
  _setDbPoolForTest,
  isMovieMarkedUnavailable,
  markMovieAvailability,
  resolveDramaBySlugFromDb,
  upsertDramaCatalogBatchInDb,
} from '../server/db';
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
import {
  buildDramaSeoMetadata,
  generateMetadata,
  generateSitemapXml,
  getDramaPath,
  getWatchPath,
  resolveCanonicalDramaSlug,
} from '../src/utils/seo';

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

test('5. Clean canonical drama slugs omit ID suffixes across links, metadata, sitemaps, and return 301 from legacy ID-suffixed URLs', async () => {
  const sampleTitle = "The Mafia Boss's Unexpected Bride";
  const expectedCleanSlug = 'the-mafia-boss-s-unexpected-bride';

  assert.equal(
    resolveCanonicalDramaSlug({
      title: sampleTitle,
      slug: `${expectedCleanSlug}-dram-4429`,
      bookId: '4429',
      provider: 'DramaBoxV2',
    }),
    expectedCleanSlug
  );
  assert.equal(
    getDramaPath('4429', sampleTitle, 'DramaBoxV2', `${expectedCleanSlug}-dram-4429`),
    `/dramaboxv2/detail/${expectedCleanSlug}`
  );
  assert.equal(
    getWatchPath('4429', sampleTitle, 'DramaBoxV2', `${expectedCleanSlug}-dram-4429`, 3),
    `/dramaboxv2/watch/${expectedCleanSlug}?ep=3`
  );

  const sampleDrama = {
    bookId: '4429',
    title: sampleTitle,
    slug: `${expectedCleanSlug}-dram-4429`,
    cover: 'https://img.kano-drama.live/mafia-bride.jpg',
    description: 'An unexpected contract marriage with a powerful mafia boss.',
    chapterCount: 55,
    tags: ['Romance', 'CEO'],
    isVip: false,
    provider: 'DramaBoxV2' as const,
  };
  const seoMeta = buildDramaSeoMetadata(sampleDrama, 'https://kano-drama.live', 'en');
  assert.equal(
    seoMeta.canonicalUrl,
    `https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}`
  );

  const xml = generateSitemapXml([sampleDrama], 'https://kano-drama.live');
  assert.ok(xml.includes(`https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}</loc>`));
  assert.doesNotMatch(xml, /-dram-4429/);

  await withTestServer(
    async (url) => {
      if (url.includes('/dramaboxv2/allepisode')) {
        return new Response(
          JSON.stringify({
            data: [
              { chapterIndex: 0, chapterId: 'ep-mb-1', title: 'Episode 1' },
              { chapterIndex: 1, chapterId: 'ep-mb-2', title: 'Episode 2' },
              { chapterIndex: 2, chapterId: 'ep-mb-3', title: 'Episode 3' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/dramaboxv2/detail')) {
        if (!url.includes('4429')) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            data: {
              bookId: '4429',
              bookName: sampleTitle,
              coverWap: 'https://img.kano-drama.live/mafia-bride.jpg',
              introduction: 'An unexpected contract marriage with a powerful mafia boss.',
              chapterCount: 55,
              tags: ['Romance', 'CEO'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/dramaboxv2/search')) {
        if (url.includes('unknown')) {
          return new Response(JSON.stringify({ data: { list: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (url.includes('/dramaboxv2/')) {
        return new Response(
          JSON.stringify({
            data: {
              list: [
                {
                  bookId: '4429',
                  bookName: sampleTitle,
                  slug: `${expectedCleanSlug}-dram-4429`,
                  coverWap: 'https://img.kano-drama.live/mafia-bride.jpg',
                  introduction: 'An unexpected contract marriage with a powerful mafia boss.',
                  chapterCount: 55,
                  tags: ['Romance', 'CEO'],
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
      // Warm home catalog & sitemap
      await fetch(`${base}/api/home?lang=en&provider=All`);

      // 5a. Legacy ID-suffixed detail URL returns 301 Permanent Redirect to clean URL
      const legacyDetailRes = await fetch(
        `${base}/dramaboxv2/detail/${expectedCleanSlug}-dram-4429`,
        {
          redirect: 'manual',
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }
      );
      assert.equal(legacyDetailRes.status, 301);
      assert.equal(
        legacyDetailRes.headers.get('location'),
        `/dramaboxv2/detail/${expectedCleanSlug}`
      );

      // 5b. Legacy ID-suffixed watch URL returns 301 Permanent Redirect to clean watch URL preserving ?ep=
      const legacyWatchRes = await fetch(
        `${base}/dramaboxv2/watch/${expectedCleanSlug}-dram-4429?ep=3`,
        {
          redirect: 'manual',
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }
      );
      assert.equal(legacyWatchRes.status, 301);
      assert.equal(
        legacyWatchRes.headers.get('location'),
        `/dramaboxv2/watch/${expectedCleanSlug}?ep=3`
      );

      // 5c. Even an uncached legacy -dram-9999 URL redirects 301 to clean slug
      const uncachedLegacyRes = await fetch(
        `${base}/dramaboxv2/detail/unknown-legacy-title-dram-9999`,
        { redirect: 'manual' }
      );
      assert.equal(uncachedLegacyRes.status, 301);
      assert.equal(
        uncachedLegacyRes.headers.get('location'),
        '/dramaboxv2/detail/unknown-legacy-title'
      );

      // 5d. Clean detail and watch pages render 200 OK with clean canonical & og:url (no ID suffix)
      const cleanDetailRes = await fetch(
        `${base}/dramaboxv2/detail/${expectedCleanSlug}`,
        {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }
      );
      assert.equal(cleanDetailRes.status, 200);
      const cleanDetailHtml = await cleanDetailRes.text();
      assert.equal(
        extractTagContent(cleanDetailHtml, /<link\s+rel="canonical"\s+href="([^"]+)"/i),
        `https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}`
      );
      assert.equal(
        extractTagContent(cleanDetailHtml, /<meta\s+property="og:url"\s+content="([^"]+)"/i),
        `https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}`
      );
      assert.doesNotMatch(cleanDetailHtml, /-dram-4429/);

      const cleanWatchRes = await fetch(
        `${base}/dramaboxv2/watch/${expectedCleanSlug}?ep=3`,
        {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }
      );
      assert.equal(cleanWatchRes.status, 200);
      const cleanWatchHtml = await cleanWatchRes.text();
      assert.equal(
        extractTagContent(cleanWatchHtml, /<link\s+rel="canonical"\s+href="([^"]+)"/i),
        `https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}`
      );
      assert.equal(
        extractTagContent(cleanWatchHtml, /<meta\s+property="og:url"\s+content="([^"]+)"/i),
        `https://kano-drama.live/dramaboxv2/watch/${expectedCleanSlug}?ep=3`
      );
      assert.doesNotMatch(cleanWatchHtml, /-dram-4429/);

      // 5e. /sitemap-part-1.xml emits clean slug without ID suffix
      const sitemapRes = await fetch(`${base}/sitemap-part-1.xml`);
      assert.equal(sitemapRes.status, 200);
      const sitemapXml = await sitemapRes.text();
      assert.ok(
        sitemapXml.includes(
          `https://kano-drama.live/dramaboxv2/detail/${expectedCleanSlug}</loc>`
        )
      );
      assert.doesNotMatch(sitemapXml, /-dram-4429/);
    }
  );
});

test('6. Genuine identical-title collision gets -2 only on conflict while legacy -dram-XXXX DB slugs self-heal', async (t) => {
  type CatalogRow = {
    drama_id: string;
    provider: string;
    slug: string;
    title: string;
    description: string;
    cover: string;
    chapter_count: number;
    genres: string[];
    status: string;
    popularity_score: number;
    rating: number;
    play_count: string | null;
    is_vip: boolean;
    drama_json: Record<string, unknown>;
  };

  const rows = new Map<string, CatalogRow>([
    [
      'DramaBoxV2:4429',
      {
        drama_id: '4429',
        provider: 'DramaBoxV2',
        slug: 'the-mafia-boss-s-unexpected-bride-dram-4429',
        title: "The Mafia Boss's Unexpected Bride",
        description: 'Legacy stored row.',
        cover: 'https://img.kano-drama.live/4429.jpg',
        chapter_count: 40,
        genres: ['Romance'],
        status: 'Completed',
        popularity_score: 900000,
        rating: 4.8,
        play_count: '900K',
        is_vip: false,
        drama_json: {
          bookId: '4429',
          provider: 'DramaBoxV2',
          title: "The Mafia Boss's Unexpected Bride",
          slug: 'the-mafia-boss-s-unexpected-bride-dram-4429',
          cover: 'https://img.kano-drama.live/4429.jpg',
          description: 'Legacy stored row.',
          chapterCount: 40,
          tags: ['Romance'],
        },
      },
    ],
  ]);

  const mockPool: any = {
    query: async (sql: string, params: any[] = []) => {
      if (/CREATE TABLE|CREATE INDEX|ALTER TABLE|SELECT 1/i.test(sql)) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      if (sql.includes('SELECT chapter_count, slug FROM drama_catalog')) {
        const key = `${params[1]}:${params[0]}`;
        const hit = rows.get(key);
        return {
          rows: hit ? [{ chapter_count: hit.chapter_count, slug: hit.slug }] : [],
          rowCount: hit ? 1 : 0,
        };
      }
      if (sql.includes('SELECT drama_id, provider FROM drama_catalog WHERE LOWER(slug) = $1')) {
        const target = String(params[0] || '').toLowerCase();
        const hit = Array.from(rows.values()).find((r) => r.slug.toLowerCase() === target);
        return {
          rows: hit ? [{ drama_id: hit.drama_id, provider: hit.provider }] : [],
          rowCount: hit ? 1 : 0,
        };
      }
      if (sql.includes('INSERT INTO drama_catalog')) {
        const [
          dramaId,
          provider,
          slug,
          title,
          description,
          cover,
          chapterCount,
          genres,
          status,
          popularityScore,
          rating,
          playCount,
          isVip,
          dramaJsonStr,
        ] = params;
        const key = `${provider}:${dramaId}`;
        const prev = rows.get(key);
        const parsedJson = JSON.parse(String(dramaJsonStr)) as Record<string, unknown>;
        parsedJson.slug = slug;
        rows.set(key, {
          drama_id: dramaId,
          provider,
          slug,
          title,
          description,
          cover,
          chapter_count: Math.max(prev?.chapter_count || 0, Number(chapterCount) || 1),
          genres,
          status,
          popularity_score: Math.max(prev?.popularity_score || 0, Number(popularityScore) || 0),
          rating: Number(rating) || 4.8,
          play_count: playCount,
          is_vip: Boolean(isVip),
          drama_json: parsedJson,
        });
        return {
          rows: [{ slug, chapter_count: chapterCount, was_inserted: !prev }],
          rowCount: 1,
        };
      }
      if (sql.includes('WHERE (LOWER(slug) = ANY($1::text[]) OR drama_id = $2)')) {
        const candidates = (params[0] as string[]).map((s) => s.toLowerCase());
        const rawId = String(params[1] || '');
        const hit = Array.from(rows.values()).find(
          (r) => candidates.includes(r.slug.toLowerCase()) || r.drama_id === rawId
        );
        return { rows: hit ? [hit] : [], rowCount: hit ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async (sql: string, params?: any[]) => mockPool.query(sql, params),
      release: () => {},
    }),
  };

  _setDbPoolForTest(mockPool);
  t.after(() => {
    _setDbPoolForTest(null);
  });

  await upsertDramaCatalogBatchInDb([
    {
      dramaId: '4429',
      provider: 'DramaBoxV2',
      slug: 'the-mafia-boss-s-unexpected-bride',
      title: "The Mafia Boss's Unexpected Bride",
      description: 'Original DramaBoxV2 hit.',
      cover: 'https://img.kano-drama.live/4429.jpg',
      chapterCount: 50,
      genres: ['Romance'],
      status: 'Completed',
      popularityScore: 950000,
      rating: 4.9,
      isVip: false,
      dramaJson: {
        bookId: '4429',
        provider: 'DramaBoxV2',
        title: "The Mafia Boss's Unexpected Bride",
        cover: 'https://img.kano-drama.live/4429.jpg',
        description: 'Original DramaBoxV2 hit.',
        chapterCount: 50,
        tags: ['Romance'],
      },
    },
    {
      dramaId: '9981',
      provider: 'NetShort',
      slug: 'the-mafia-boss-s-unexpected-bride',
      title: "The Mafia Boss's Unexpected Bride",
      description: 'Second distinct drama sharing identical title.',
      cover: 'https://img.kano-drama.live/9981.jpg',
      chapterCount: 30,
      genres: ['Romance'],
      status: 'Completed',
      popularityScore: 700000,
      rating: 4.7,
      isVip: false,
      dramaJson: {
        bookId: '9981',
        provider: 'NetShort',
        title: "The Mafia Boss's Unexpected Bride",
        cover: 'https://img.kano-drama.live/9981.jpg',
        description: 'Second distinct drama sharing identical title.',
        chapterCount: 30,
        tags: ['Romance'],
      },
    },
  ]);

  assert.equal(
    rows.get('DramaBoxV2:4429')?.slug,
    'the-mafia-boss-s-unexpected-bride'
  );
  assert.equal(
    rows.get('NetShort:9981')?.slug,
    'the-mafia-boss-s-unexpected-bride-2'
  );

  const resolvedFromLegacy = await resolveDramaBySlugFromDb(
    'the-mafia-boss-s-unexpected-bride-dram-4429',
    'DramaBoxV2'
  );
  assert.equal(resolvedFromLegacy?.dramaId, '4429');
  assert.equal(resolvedFromLegacy?.slug, 'the-mafia-boss-s-unexpected-bride');
});

test('7. Drama detail title-first SEO, OpenGraph/Twitter tags, and /genre vs /tag keyword differentiation', async () => {
  const idDetail = generateMetadata({
    page: 'drama',
    lang: 'id',
    pathname: '/dramaboxv2/detail/pewaris-kopi-malam',
    title: 'Pewaris Kopi Malam',
    description:
      'Pewaris muda menyamar sebagai barista demi mengungkap pengkhianatan keluarga.',
    providerName: 'DramaBoxV2',
    episodeCount: 68,
    tags: ['Romance', 'CEO'],
    image: 'https://img.kano-drama.live/pewaris-kopi.jpg',
  });
  assert.ok(idDetail.title.startsWith('Pewaris Kopi Malam'));
  assert.match(idDetail.title, /\(68 (?:Ep|Episode)\)/);
  assert.match(idDetail.title, /Romance/);
  assert.match(idDetail.title, /Drama Pendek Sub Indo/i);
  assert.ok(!idDetail.title.includes('...'));
  assert.ok(idDetail.description.startsWith('Pewaris Kopi Malam'));
  assert.match(idDetail.description, /68 (?:Ep|Episode)/i);
  assert.match(idDetail.description, /Romance/i);
  assert.match(idDetail.description, /drama pendek/i);
  assert.ok(idDetail.description.length <= 160);
  assert.match(idDetail.keywords, /Pewaris Kopi Malam Sub Indo/i);
  assert.match(idDetail.keywords, /Drama Pendek Romance Sub Indo/i);
  assert.equal(
    idDetail.canonicalUrl,
    'https://kano-drama.live/dramaboxv2/detail/pewaris-kopi-malam'
  );
  assert.equal(idDetail.openGraph.url, idDetail.canonicalUrl);
  assert.ok(idDetail.openGraph.image.includes('pewaris-kopi.jpg'));

  const enDetail = buildDramaSeoMetadata(
    {
      bookId: '4429',
      title: "The Mafia Boss's Unexpected Bride",
      slug: 'the-mafia-boss-s-unexpected-bride',
      cover: 'https://img.kano-drama.live/mafia-bride.jpg',
      description: 'An unexpected contract marriage with a powerful mafia boss.',
      chapterCount: 55,
      tags: ['Romance', 'CEO'],
      isVip: false,
      provider: 'DramaBoxV2',
    },
    'https://kano-drama.live',
    'en'
  );
  assert.ok(enDetail.title.startsWith("The Mafia Boss's Unexpected Bride"));
  assert.match(enDetail.title, /\(55 Eps\)/);
  assert.match(enDetail.title, /Short Drama/i);
  assert.ok(!enDetail.title.includes('...'));
  assert.ok(enDetail.description.startsWith("The Mafia Boss's Unexpected Bride"));
  assert.match(enDetail.description, /55 (?:Eps|Episodes)/i);
  assert.match(enDetail.description, /Romance/i);
  assert.match(enDetail.description, /short drama/i);
  assert.ok(enDetail.description.length <= 160);
  assert.match(enDetail.keywords, /Short Drama/i);

  // /genre/* vs /tag/* differentiation across ID & EN
  for (const lang of ['id', 'en'] as const) {
    const g = resolveProgrammaticLanding('ceo', 'genre', undefined, lang);
    const tg = resolveProgrammaticLanding('ceo', 'tag', undefined, lang);
    assert.notEqual(g.keywords, tg.keywords);
    assert.notEqual(g.title, tg.title);
    assert.notEqual(g.description, tg.description);
    assert.notEqual(g.h1, tg.h1);
    assert.notEqual(g.intro, tg.intro);
    assert.ok(!g.description.endsWith('...') || g.description.length <= 160);
    assert.ok(!tg.description.endsWith('...') || tg.description.length <= 160);
    if (lang === 'id') {
      assert.doesNotMatch(tg.intro, /\bacross\b/i);
      assert.doesNotMatch(g.h1, /\bBest CEO Vertical\b/i);
      assert.match(g.keywords, /genre CEO/i);
      assert.match(tg.keywords, /trope|topik/i);
    } else {
      assert.match(g.keywords, /genre/i);
      assert.match(tg.keywords, /trope|tag/i);
    }
  }

  // Full SSR detail & programmatic HTML check
  await withTestServer(
    (url) => {
      if (url.includes('/dramaboxv2/detail')) {
        return new Response(
          JSON.stringify({
            data: {
              bookId: '8821',
              bookName: 'Rahasia Pewaris Restoran',
              coverWap: 'https://img.kano-drama.live/rahasia-pewaris.jpg',
              introduction: 'Koki jenius menyembunyikan identitas aslinya dari keluarga.',
              chapterCount: 48,
              tags: ['Romance', 'Family'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/dramaboxv2/allepisode')) {
        return new Response(
          JSON.stringify({
            data: [{ chapterIndex: 0, chapterId: 'ep-rp-1', title: 'Episode 1' }],
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
                  bookId: '8821',
                  bookName: 'Rahasia Pewaris Restoran',
                  coverWap: 'https://img.kano-drama.live/rahasia-pewaris.jpg',
                  introduction: 'Koki jenius menyembunyikan identitas aslinya dari keluarga.',
                  chapterCount: 48,
                  tags: ['Romance', 'Family'],
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
      await fetch(`${base}/api/home?lang=id&provider=All`);
      const [detailRes, genreRes, tagRes] = await Promise.all([
        fetch(`${base}/dramaboxv2/detail/rahasia-pewaris-restoran?lang=id`, {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }),
        fetch(`${base}/genre/romance?lang=id`, {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }),
        fetch(`${base}/tag/romance?lang=id`, {
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
        }),
      ]);

      assert.equal(detailRes.status, 200);
      const detailHtml = await detailRes.text();
      const ssrTitle = extractTagContent(detailHtml, /<title>([^<]+)<\/title>/i);
      const ssrDesc = extractTagContent(
        detailHtml,
        /<meta\s+name="description"\s+content="([^"]+)"/i
      );
      const ssrKeywords = extractTagContent(
        detailHtml,
        /<meta\s+name="keywords"\s+content="([^"]+)"/i
      );
      const ssrOgImage = extractTagContent(
        detailHtml,
        /<meta\s+property="og:image"\s+content="([^"]+)"/i
      );
      const ssrOgUrl = extractTagContent(
        detailHtml,
        /<meta\s+property="og:url"\s+content="([^"]+)"/i
      );
      const ssrCanonical = extractTagContent(
        detailHtml,
        /<link\s+rel="canonical"\s+href="([^"]+)"/i
      );

      assert.ok(ssrTitle.startsWith('Rahasia Pewaris Restoran'));
      assert.match(ssrTitle, /48 (?:Ep|Episode)/i);
      assert.match(ssrTitle, /Drama Pendek Sub Indo/i);
      assert.ok(ssrDesc.startsWith('Rahasia Pewaris Restoran'));
      assert.match(ssrKeywords, /Sub Indo/i);
      assert.equal(
        ssrCanonical,
        'https://kano-drama.live/dramaboxv2/detail/rahasia-pewaris-restoran'
      );
      assert.equal(ssrOgUrl, ssrCanonical);
      assert.ok(ssrOgImage.includes('rahasia-pewaris.jpg'));
      assert.doesNotMatch(detailHtml, /HouseDrama|house-drama/i);

      const genreHtml = await genreRes.text();
      const tagHtml = await tagRes.text();
      assert.match(
        genreHtml,
        /<meta\s+name="twitter:url"\s+content="https:\/\/kano-drama\.live\/genre\/romance"/i
      );
      assert.match(
        tagHtml,
        /<meta\s+name="twitter:url"\s+content="https:\/\/kano-drama\.live\/tag\/romance"/i
      );
      const genreKeywords = extractTagContent(
        genreHtml,
        /<meta\s+name="keywords"\s+content="([^"]+)"/i
      );
      const tagKeywords = extractTagContent(
        tagHtml,
        /<meta\s+name="keywords"\s+content="([^"]+)"/i
      );
      assert.notEqual(genreKeywords, tagKeywords);
      assert.doesNotMatch(genreHtml, /HouseDrama|house-drama/i);
      assert.doesNotMatch(tagHtml, /HouseDrama|house-drama/i);
    }
  );
});

