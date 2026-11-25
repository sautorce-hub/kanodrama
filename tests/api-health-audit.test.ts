import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.ADMIN_PAYOUT_SECRET = 'test-admin-secret-api-audit';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-api-audit';
process.env.SITE_URL = 'https://kano-drama.live';
delete process.env.DATABASE_URL;
delete process.env.MOLA_API_TOKEN;

import { createServerApp, signAuthSessionToken } from '../server';

async function withTestServer<T>(
  run: (baseUrl: string) => Promise<T>
): Promise<T> {
  const { app } = await createServerApp({ enableVite: false });
  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('1. Malformed JSON and unknown /api routes return structured JSON instead of HTML', async () => {
  await withTestServer(async (base) => {
    const badJsonRes = await fetch(`${base}/api/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    });
    assert.equal(badJsonRes.status, 400);
    assert.match(badJsonRes.headers.get('content-type') || '', /application\/json/i);
    const badJsonBody = (await badJsonRes.json()) as { ok?: boolean; error?: string };
    assert.equal(badJsonBody.ok, false);
    assert.match(badJsonBody.error || '', /Malformed JSON/i);

    const unknownApiRes = await fetch(`${base}/api/does-not-exist-xyz`);
    assert.equal(unknownApiRes.status, 404);
    assert.match(unknownApiRes.headers.get('content-type') || '', /application\/json/i);
    const unknownBody = (await unknownApiRes.json()) as { ok?: boolean; error?: string };
    assert.equal(unknownBody.ok, false);
  });
});

test('2. Core health, home, platforms, config, auth session, and visitor routes respond 200 JSON without DB', async () => {
  await withTestServer(async (base) => {
    const getEndpoints = [
      '/api/health',
      '/api/home',
      '/api/home/cache-status',
      '/api/platforms',
      '/api/auth/config',
      '/api/auth/session',
      '/api/points/config',
      '/api/visitors/stats',
    ];

    for (const path of getEndpoints) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, `${path} should return 200`);
      assert.match(res.headers.get('content-type') || '', /application\/json/i);
      const data = await res.json();
      assert.equal(typeof data, 'object');
      assert.notEqual(data, null);
    }

    const googleUrlRes = await fetch(`${base}/api/auth/google/url`);
    assert.equal(googleUrlRes.status, 503);
    assert.match(googleUrlRes.headers.get('content-type') || '', /application\/json/i);
    const googleUrlData = (await googleUrlRes.json()) as { ok?: boolean; error?: string };
    assert.equal(googleUrlData.ok, false);

    const revalidateRes = await fetch(`${base}/api/home/revalidate`, {
      method: 'POST',
    });
    assert.equal(revalidateRes.status, 200);
    const revalidateData = (await revalidateRes.json()) as { ok?: boolean };
    assert.equal(revalidateData.ok, true);

    const logoutRes = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);
    const logoutData = (await logoutRes.json()) as { ok?: boolean };
    assert.equal(logoutData.ok, true);

    const hbRes = await fetch(`${base}/api/visitors/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'audit-visitor-1' }),
    });
    assert.equal(hbRes.status, 200);
    const hbData = (await hbRes.json()) as { onlineNow?: number; totalVisitors?: number };
    assert.equal(typeof hbData.onlineNow, 'number');
    assert.equal(typeof hbData.totalVisitors, 'number');
  });
});

test('3. Mola root returns 400, deprecated V1 returns 410, and unconfigured V2 returns 503', async () => {
  await withTestServer(async (base) => {
    const rootRes = await fetch(`${base}/api/mola/`);
    assert.equal(rootRes.status, 400);
    const rootBody = (await rootRes.json()) as { ok?: boolean; error?: string };
    assert.equal(rootBody.ok, false);

    const v1Res = await fetch(`${base}/api/mola/dramabox/home`);
    assert.equal(v1Res.status, 410);

    const v2Res = await fetch(`${base}/api/mola/dramaboxv2/home`);
    assert.equal(v2Res.status, 503);
  });
});

test('4. LK21 and LookSeries routers map validation (400), SSRF (403), and missing token (503) accurately', async () => {
  await withTestServer(async (base) => {
    const checks: Array<{ path: string; expectedStatus: number }> = [
      { path: '/api/lk21/detail?slug=sample-movie', expectedStatus: 503 },
      { path: '/api/lk21/stream?slug=sample-movie', expectedStatus: 503 },
      { path: '/api/lk21/proxy/m3u8?url=not-a-url', expectedStatus: 400 },
      { path: '/api/lk21/proxy/m3u8?url=http://127.0.0.1/test.m3u8', expectedStatus: 403 },
      { path: '/api/lk21/proxy/segment?url=not-a-url', expectedStatus: 400 },
      { path: '/api/lk21/proxy/subtitle?url=not-a-url', expectedStatus: 400 },
      { path: '/api/lookseries/detail?book_id=12345', expectedStatus: 503 },
      { path: '/api/lookseries/stream?book_id=12345', expectedStatus: 503 },
      { path: '/api/lookseries/proxy/m3u8?url=not-a-url', expectedStatus: 400 },
      { path: '/api/lookseries/proxy/m3u8?url=http://127.0.0.1/test.m3u8', expectedStatus: 403 },
      { path: '/api/lookseries/proxy/segment?url=not-a-url', expectedStatus: 400 },
    ];

    for (const check of checks) {
      const res = await fetch(`${base}${check.path}`);
      assert.equal(
        res.status,
        check.expectedStatus,
        `${check.path} expected HTTP ${check.expectedStatus}, got ${res.status}`
      );
      assert.match(res.headers.get('content-type') || '', /application\/json/i);
      const body = (await res.json()) as { ok?: boolean; error?: string };
      assert.equal(body.ok, false);
      assert.ok(body.error, `${check.path} should include error message`);
    }
  });
});

test('5. Authenticated user isolation, comments param symmetry, favorite defaults, and DB-less referral bind 503', async () => {
  await withTestServer(async (base) => {
    const token = signAuthSessionToken({
      uid: 'email_audit_user_a',
      email: 'audit-a@example.com',
      displayName: 'Audit User A',
      photoURL: null,
    });
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const unauthUserRes = await fetch(`${base}/api/users/email_audit_user_a`);
    assert.equal(unauthUserRes.status, 401);

    const crossUserRes = await fetch(`${base}/api/users/other_uid_999`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(crossUserRes.status, 403);

    const syncRes = await fetch(`${base}/api/users/sync`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        displayName: 'Audit User A',
        email: 'audit-a@example.com',
      }),
    });
    assert.equal(syncRes.status, 200);

    const selfUserRes = await fetch(`${base}/api/users/email_audit_user_a`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(selfUserRes.status, 200);

    const postCommentRes = await fetch(`${base}/api/comments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        dramaId: 'ls-12345',
        provider: 'LookSeries',
        episodeNumber: 2,
        content: 'Great episode!',
      }),
    });
    assert.equal(postCommentRes.status, 201);
    const commentBody = (await postCommentRes.json()) as {
      ok?: boolean;
      persisted?: boolean;
      comment?: { episodeNumber?: number; provider?: string; content?: string } | null;
    };
    assert.equal(commentBody.ok, true);
    assert.equal(commentBody.persisted, false);
    assert.ok(commentBody.comment);
    assert.equal(commentBody.comment?.episodeNumber, 2);
    assert.equal(commentBody.comment?.provider, 'LookSeries');

    const getCommentsRes = await fetch(
      `${base}/api/comments?dramaId=ls-12345&provider=LookSeries&episodeNumber=2`
    );
    assert.equal(getCommentsRes.status, 200);

    const favRes = await fetch(`${base}/api/favorites/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        dramaId: 'drama-101',
        title: 'Sample Drama',
      }),
    });
    assert.equal(favRes.status, 200);
    const favBody = (await favRes.json()) as { ok?: boolean; mediaType?: string };
    assert.equal(favBody.ok, true);
    assert.equal(favBody.mediaType, 'drama');

    const refBindRes = await fetch(`${base}/api/referrals/bind`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ referralCode: 'INVALID' }),
    });
    assert.equal(refBindRes.status, 503);
    const refBindBody = (await refBindRes.json()) as { code?: string };
    assert.equal(refBindBody.code, 'DATABASE_NOT_CONFIGURED');
  });
});
