import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-audit';
process.env.SITE_URL = 'https://kano-drama.live';
delete process.env.DATABASE_URL;

import { createServerApp } from '../server';
import { resolveProviderFromMolaSegment } from '../server/homeCache';
import {
  ACTIVE_PROVIDER_NAMES,
  ALL_PROVIDER_ADAPTERS,
  PROVIDER_ENDPOINT_CATALOG,
  ensureMeloloDecryptedUrl,
  getProviderAdapter,
  getStreamUrl,
  normalizeEpisodeList,
  normalizeStream,
  setActiveAppLanguage,
} from '../src/services/dramaProviders';
import {
  LEGACY_V1_TO_V2_PROVIDER,
  PROVIDER_LOGO_PATHS,
  PROVIDER_SLUG_MAP,
  isDeprecatedV1RouteSlug,
  isKnownProviderRouteSlug,
  parseProviderFromRouteSlug,
} from '../src/constants/providerLogos';

test('1. All 84 providers (82 active Mola + LK21 + LookSeries) are registered with V2 canonical names', () => {
  assert.equal(ACTIVE_PROVIDER_NAMES.length, 82);
  assert.equal(Object.keys(ALL_PROVIDER_ADAPTERS).length, 82);
  assert.equal(Object.keys(PROVIDER_SLUG_MAP).length, 84);
  assert.equal(Object.keys(PROVIDER_LOGO_PATHS).length, 84);

  const expectedV2 = [
    'DramaBoxV2',
    'MeloLoV2',
    'StoryReelV2',
    'VibeShortV2',
    'ShortMaxV2',
    'iDramaV2',
    'ReelShortV2',
  ] as const;

  for (const name of expectedV2) {
    assert.ok(ACTIVE_PROVIDER_NAMES.includes(name), `${name} must be active`);
    assert.ok(ALL_PROVIDER_ADAPTERS[name], `${name} adapter must exist`);
  }

  for (const [legacyV1, canonicalV2] of Object.entries(LEGACY_V1_TO_V2_PROVIDER)) {
    assert.equal(isDeprecatedV1RouteSlug(legacyV1), true);
    assert.equal(
      (ACTIVE_PROVIDER_NAMES as string[]).some((p) => p.toLowerCase() === legacyV1),
      false,
      `Deprecated V1 provider ${legacyV1} must not appear in ACTIVE_PROVIDER_NAMES`
    );
    assert.equal(parseProviderFromRouteSlug(legacyV1), canonicalV2);
  }

  for (const provider of ACTIVE_PROVIDER_NAMES) {
    const adapter = getProviderAdapter(provider);
    assert.equal(adapter.id, provider);
    assert.ok(PROVIDER_ENDPOINT_CATALOG[provider]?.length >= 1, `${provider} needs endpoint catalog`);
    const slug = PROVIDER_SLUG_MAP[provider];
    assert.ok(slug, `${provider} needs slug mapping`);
    assert.equal(isKnownProviderRouteSlug(slug), true, `${slug} should be recognized`);
    assert.equal(parseProviderFromRouteSlug(slug), provider);
  }

  assert.equal(parseProviderFromRouteSlug('lk21'), 'LK21');
  assert.equal(parseProviderFromRouteSlug('lookseries'), 'LookSeries');
  assert.equal(parseProviderFromRouteSlug('movie', 'ls-sample-series'), 'LookSeries');
  assert.equal(parseProviderFromRouteSlug('movie', 'sample-movie'), 'LK21');
  assert.equal(isKnownProviderRouteSlug('unknown-provider-xyz'), false);
});

test('2. normalizeEpisodeList handles 0-based indices cleanly and strips synthetic ep-* eids', () => {
  const zeroBased = normalizeEpisodeList({
    episodes: [
      { chapterIndex: 0, title: 'Pilot' },
      { chapterIndex: 1, id: 'ch-real-992', title: 'Secret' },
      { chapterIndex: 1, id: 'dramabox-ep-3', title: 'Duplicate index + synthetic id' },
    ],
  });

  assert.equal(zeroBased.length, 3);
  assert.equal(zeroBased[0].episodeNumber, 1);
  assert.equal(zeroBased[0].chapterIndex0, 0);
  assert.equal(zeroBased[0].chapterId, 'ep-1');
  assert.equal(zeroBased[0].eid, undefined);

  assert.equal(zeroBased[1].episodeNumber, 2);
  assert.equal(zeroBased[1].chapterIndex0, 1);
  assert.equal(zeroBased[1].chapterId, 'ch-real-992');
  assert.equal(zeroBased[1].eid, 'ch-real-992');

  assert.equal(zeroBased[2].episodeNumber, 3);
  assert.equal(zeroBased[2].chapterIndex0, 1);
  assert.equal(zeroBased[2].eid, undefined);
});

test('3. normalizeStream handles embed-only servers, mixed mirrors, AudioToon MP3, and HLS multi-quality streams', () => {
  const embedOnlyStream = normalizeStream(
    {
      data: {
        embedUrl: 'https://vidplay.example.com/embed/abc123',
        servers: [
          { name: 'Mirror A', embedUrl: 'https://vidplay.example.com/embed/abc123' },
          { name: 'Mirror B', embedUrl: 'https://mirror2.example.com/embed/xyz789' },
        ],
      },
    },
    'book-embed-only',
    1,
    'DrakorID'
  );

  assert.equal(embedOnlyStream.sourceType, 'embed');
  assert.equal(embedOnlyStream.embedUrl, 'https://vidplay.example.com/embed/abc123');
  assert.equal(embedOnlyStream.servers?.length, 2);

  const mixedStream = normalizeStream(
    {
      data: {
        embedUrl: 'https://vidplay.example.com/embed/abc123',
        servers: [
          { name: 'Mirror A', embedUrl: 'https://vidplay.example.com/embed/abc123' },
          { name: 'Mirror B', streamUrl: 'https://cdn.example.com/live/master.m3u8' },
        ],
      },
    },
    'book-embed-1',
    1,
    'DrakorID'
  );

  assert.equal(mixedStream.sourceType, 'hls');
  assert.equal(mixedStream.embedUrl, 'https://vidplay.example.com/embed/abc123');
  assert.equal(mixedStream.qualities[0]?.url, 'https://cdn.example.com/live/master.m3u8');
  assert.ok((mixedStream.servers?.length ?? 0) >= 2);

  const audioStream = normalizeStream(
    {
      data: {
        audioUrl: 'https://audio.example.com/tracks/ep1.mp3',
      },
    },
    'audiotoon-1',
    1,
    'AudioToon'
  );

  assert.equal(audioStream.sourceType, 'mp4');
  assert.equal(audioStream.streamUrl, 'https://audio.example.com/tracks/ep1.mp3');

  const hlsStream = normalizeStream(
    {
      data: {
        qualities: [
          { quality: 720, hlsUrl: 'https://cdn.example.com/v720/index.m3u8' },
          { quality: 1080, mp4Url: 'https://cdn.example.com/v1080/video.mp4' },
        ],
      },
    },
    'dramabox-1',
    1,
    'DramaBoxV2'
  );

  assert.equal(hlsStream.sourceType, 'hls');
  assert.equal(hlsStream.streamUrl, 'https://cdn.example.com/v720/index.m3u8');
  assert.equal(hlsStream.qualities.length, 2);
});

test('4. Resilient Mola adapter forwards cached eid/chapterIndex0, falls back to /stream_plain, and fast-fails on 503', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);

      if (url.includes('/api/mola/audiotoon/episodes')) {
        return new Response(
          JSON.stringify({
            episodes: [
              { chapterIndex: 0, chapterId: 'ch-real-101', title: 'Ep 1' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/mola/audiotoon/stream_plain')) {
        return new Response(
          JSON.stringify({
            data: { audioUrl: 'https://cdn.example.com/audio/ep1.mp3' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/mola/audiotoon/stream')) {
        return new Response(JSON.stringify({ error: 'Encrypted unavailable' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unhandled test url' }), { status: 404 });
    }) as typeof fetch;

    const adapter = getProviderAdapter('AudioToon');
    const episodes = await adapter.fetchAllEpisodes('book-audio-test-1');
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].episodeNumber, 1);
    assert.equal(episodes[0].chapterIndex0, 0);
    assert.equal(episodes[0].eid, 'ch-real-101');

    const stream = await getStreamUrl('book-audio-test-1', 1, 'AudioToon');
    assert.equal(stream.streamUrl, 'https://cdn.example.com/audio/ep1.mp3');
    const streamCall = calledUrls.find((u) => u.includes('/api/mola/audiotoon/stream_plain'));
    assert.ok(streamCall, 'Should fall back to /stream_plain on 404');
    assert.ok(streamCall.includes('eid=ch-real-101'), 'Should forward cached real eid');
    assert.ok(!streamCall.includes('ep-1'), 'Should never forward synthetic ep-* id');

    calledUrls.length = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(
      () => getStreamUrl('book-503-test', 1, 'Playlet'),
      /503/
    );
    assert.equal(calledUrls.length, 1, 'HTTP 503 must fast-fail without cycling fallback endpoints');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. resolveProviderFromMolaSegment returns empty string for unknown segments and canonical names for known ones', () => {
  assert.equal(resolveProviderFromMolaSegment('dramaboxv2'), 'DramaBoxV2');
  assert.equal(resolveProviderFromMolaSegment('storyreel_v2'), 'StoryReelV2');
  assert.equal(resolveProviderFromMolaSegment('bstation'), 'Bstation');
  assert.equal(resolveProviderFromMolaSegment('winknovel'), 'WinkNovel');
  assert.equal(resolveProviderFromMolaSegment('unknown-segment-999'), '');
});

test('6. Server routes enforce V1 deprecation (301/410), valid catalog count (82), and 404 noindex on unknown scoped routes', async () => {
  const { app } = await createServerApp({ enableVite: false });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const aiCatalogRes = await fetch(`${base}/ai-catalog.json`);
    assert.equal(aiCatalogRes.status, 200);
    const aiCatalog = (await aiCatalogRes.json()) as { providerDirectory?: unknown[] };
    assert.equal(aiCatalog.providerDirectory?.length, 82);

    const v1ApiRes = await fetch(`${base}/api/mola/dramabox/ranking`);
    assert.equal(v1ApiRes.status, 410);

    const v1PageRes = await fetch(`${base}/provider/dramabox`, { redirect: 'manual' });
    assert.equal(v1PageRes.status, 301);
    assert.equal(v1PageRes.headers.get('location'), '/provider/dramaboxv2');

    const unknownDetailRes = await fetch(`${base}/unknownprov/detail/some-slug`);
    assert.equal(unknownDetailRes.status, 404);
    assert.match(unknownDetailRes.headers.get('x-robots-tag') || '', /noindex/i);

    const unknownWatchRes = await fetch(`${base}/unknownprov/watch/some-slug`);
    assert.equal(unknownWatchRes.status, 404);
    assert.match(unknownWatchRes.headers.get('x-robots-tag') || '', /noindex/i);

    for (const activePath of [
      '/api/mola/melolo/rank?page=1&page_size=18',
      '/api/mola/idramav2/foryou?lang=id',
      '/api/mola/reelshortv2/foryou?page=1',
      '/api/mola/ansflix/foryou?page=1&pagesize=12',
    ]) {
      const activeRes = await fetch(`${base}${activePath}`);
      assert.notEqual(activeRes.status, 410, `Canonical route ${activePath} must not return 410`);
    }

    for (const disabledV1 of ['/api/mola/idrama/foryou', '/api/mola/reelshort/foryou']) {
      const disabledRes = await fetch(`${base}${disabledV1}`);
      assert.equal(disabledRes.status, 410, `Legacy v1 ${disabledV1} must return 410`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('7. resolveProviderFromMolaSegment maps melolo, idramav2, reelshortv2, ansflix cleanly', () => {
  assert.equal(resolveProviderFromMolaSegment('melolo'), 'MeloLoV2');
  assert.equal(resolveProviderFromMolaSegment('idramav2'), 'iDramaV2');
  assert.equal(resolveProviderFromMolaSegment('reelshortv2'), 'ReelShortV2');
  assert.equal(resolveProviderFromMolaSegment('ansflix'), 'Ansflix');
});

test('8. MeloLo (/melolo), iDramaV2 (/idramav2), ReelShortV2 (/reelshortv2), and Ansflix (/ansflix) match upstream specs', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);

      if (url.includes('/detail')) {
        return new Response(
          JSON.stringify({
            data: {
              bookId: 'bk-101',
              bookName: 'Spec Drama',
              chapterCount: 3,
              episodes: [
                { chapterIndex: 0, chapterId: 'c1', title: 'EP 1' },
                { chapterIndex: 1, chapterId: 'c2', title: 'EP 2' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/allepisode')) {
        return new Response(
          JSON.stringify({
            episodes: [{ chapterIndex: 0, chapterId: 'ep-real-1', title: 'EP 1' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/idramav2/stream') && url.includes('codec=h264')) {
        return new Response(JSON.stringify({ error: 'codec param rejected' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/stream')) {
        return new Response(
          JSON.stringify({
            data: { videoUrl: 'https://cdn.example.com/stream/ep1.mp4' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          books: [
            { book_id: 'b-1', title: 'Drama One', cover: 'https://cdn.example.com/c.jpg' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    setActiveAppLanguage('id');

    // 1) MeloLo (/api/mola/melolo/*)
    const melolo = getProviderAdapter('MeloLoV2');
    await melolo.setLanguage('id');
    await melolo.fetchForYou(1);
    await melolo.fetchRanking(1);
    await melolo.fetchNewReleases(1);
    await (melolo as typeof melolo & { fetchAllDrama: (p?: number) => Promise<unknown> }).fetchAllDrama(1);
    await melolo.fetchAnime!(1);
    await melolo.searchDramas('love', 1);
    const meloloStream = await melolo.fetchStream('bk-101', 1);
    assert.ok(
      meloloStream.streamUrl.startsWith('/api/mola/melolo/decrypt?url='),
      `Expected /api/mola/melolo/decrypt?url=..., got ${meloloStream.streamUrl}`
    );
    assert.equal(
      ensureMeloloDecryptedUrl('https://api.molatv.id/api/melolo/decrypt?url=abc&token=secret'),
      '/api/mola/melolo/decrypt?url=abc'
    );
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/set_language?lang=in')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/rank?') && u.includes('page_size=18')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/new_release?') && u.includes('page_size=10')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/all_drama?') && u.includes('page_size=10')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/anime?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/melolo/search?keyword=love')));

    // 2) iDramaV2 (/api/mola/idramav2/*, detail-backed episodes, stream fallback without codec)
    calledUrls.length = 0;
    const idrama = getProviderAdapter('iDramaV2');
    await idrama.setLanguage('id');
    await idrama.fetchForYou(1);
    await idrama.searchDramas('ceo', 1);
    const idramaEps = await idrama.fetchAllEpisodes('bk-101');
    assert.equal(idramaEps.length, 2);
    const idramaStream = await idrama.fetchStream('bk-101', 1);
    assert.equal(idramaStream.streamUrl, 'https://cdn.example.com/stream/ep1.mp4');
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/idramav2/set_language?lang=id')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/idramav2/foryou?lang=id')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/idramav2/search?') && u.includes('page_size=20') && u.includes('lang=id')));
    assert.ok(!calledUrls.some((u) => u.includes('/api/mola/idramav2/allepisode')), 'iDramaV2 should resolve episodes from /detail first');
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/idramav2/stream?') && !u.includes('codec=')));

    // 3) ReelShortV2 (/api/mola/reelshortv2/*, lang=in, search word=, populer/terbaru/anime/asia)
    calledUrls.length = 0;
    const reelshort = getProviderAdapter('ReelShortV2');
    await reelshort.setLanguage('id');
    await reelshort.fetchForYou(1);
    await reelshort.fetchRanking(1);
    await reelshort.fetchNewReleases(1);
    await reelshort.fetchAnime!(1);
    await (reelshort as typeof reelshort & { fetchAsia: (p?: number) => Promise<unknown> }).fetchAsia(1);
    await reelshort.searchDramas('boss', 1);
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/set_language?lang=in')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/foryou?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/populer?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/terbaru?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/anime?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/asia?')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/reelshortv2/search?') && u.includes('word=boss')));

    // 4) Ansflix (/api/mola/ansflix/*, lang=id, pagesize=12)
    calledUrls.length = 0;
    const ansflix = getProviderAdapter('Ansflix');
    await ansflix.setLanguage('id');
    await ansflix.fetchForYou(1);
    await ansflix.searchDramas('secret', 1);
    await ansflix.fetchDetail('bk-101');
    await ansflix.fetchAllEpisodes('bk-101');
    await ansflix.fetchStream('bk-101', 1);
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/set_language?lang=id')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/foryou?') && u.includes('pagesize=12')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/search?keyword=secret&page=1')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/detail?book_id=bk-101')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/allepisode?book_id=bk-101')));
    assert.ok(calledUrls.some((u) => u.includes('/api/mola/ansflix/stream?book_id=bk-101&episode=1')));
  } finally {
    setActiveAppLanguage('en');
    globalThis.fetch = originalFetch;
  }
});
