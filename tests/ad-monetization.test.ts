import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VIDEO_PLAYER_REDIRECT_URLS,
  _resetAdMonetizationStateForTest,
  getNextVideoRedirectUrl,
  shouldTriggerEpisodeRedirect,
  triggerVideoEpisodeRedirectAd,
} from '../src/utils/adMonetization.ts';

test('Video player episode redirect schedule starts at 2->3 and skips every 2 episodes', () => {
  assert.equal(shouldTriggerEpisodeRedirect(1, 2), false);
  assert.equal(shouldTriggerEpisodeRedirect(2, 3), true);
  assert.equal(shouldTriggerEpisodeRedirect(3, 4), false);
  assert.equal(shouldTriggerEpisodeRedirect(4, 5), true);
  assert.equal(shouldTriggerEpisodeRedirect(5, 6), false);
  assert.equal(shouldTriggerEpisodeRedirect(6, 7), true);
  assert.equal(shouldTriggerEpisodeRedirect(7, 8), false);
  assert.equal(shouldTriggerEpisodeRedirect(8, 9), true);

  // Backward or same-episode transitions should never trigger redirects
  assert.equal(shouldTriggerEpisodeRedirect(4, 3), false);
  assert.equal(shouldTriggerEpisodeRedirect(3, 2), false);
  assert.equal(shouldTriggerEpisodeRedirect(3, 3), false);
});

test('Video player redirect rotates through all 5 URLs and opens only 1 per trigger', () => {
  _resetAdMonetizationStateForTest();

  const expectedUrls = [
    'https://uplcm.com/4/12359849',
    'https://uplcm.com/4/12095269',
    'https://uplcm.com/4/12095268',
    'https://uplcm.com/4/12095249',
    'https://uplcm.com/4/12056282',
  ];
  assert.deepEqual([...VIDEO_PLAYER_REDIRECT_URLS], expectedUrls);

  const storageMap = new Map<string, string>();
  const openedCalls: Array<{ url: string; target?: string; features?: string }> = [];

  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevDocument = (globalThis as Record<string, unknown>).document;

  (globalThis as Record<string, unknown>).document = {};
  (globalThis as Record<string, unknown>).window = {
    __kdAllowAppPopup: undefined,
    sessionStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
    },
    open: (url: string, target?: string, features?: string) => {
      openedCalls.push({ url, target, features });
      return {};
    },
  };

  try {
    // 1 -> 2: no redirect
    assert.equal(triggerVideoEpisodeRedirectAd(1, 2, 'DramaBoxV2:d1'), false);
    assert.equal(openedCalls.length, 0);

    // 2 -> 3: triggers exactly 1 redirect, duplicate immediate trigger is blocked
    assert.equal(triggerVideoEpisodeRedirectAd(2, 3, 'DramaBoxV2:d1'), true);
    assert.equal(triggerVideoEpisodeRedirectAd(2, 3, 'DramaBoxV2:d1'), false);
    assert.equal(openedCalls.length, 1);
    assert.equal(openedCalls[0].url, expectedUrls[0]);

    // Verify all 5 URLs rotate 1-by-1 via getNextVideoRedirectUrl
    const rotated = [
      getNextVideoRedirectUrl(),
      getNextVideoRedirectUrl(),
      getNextVideoRedirectUrl(),
      getNextVideoRedirectUrl(),
      getNextVideoRedirectUrl(),
    ];
    assert.deepEqual(rotated, [
      expectedUrls[1],
      expectedUrls[2],
      expectedUrls[3],
      expectedUrls[4],
      expectedUrls[0],
    ]);
  } finally {
    (globalThis as Record<string, unknown>).window = prevWindow;
    (globalThis as Record<string, unknown>).document = prevDocument;
  }
});

test('index.html disables popunder and keeps only redirect ad mechanism', () => {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), 'index.html'),
    'utf-8'
  );
  assert.doesNotMatch(html, /crookedagreement/i);
  assert.doesNotMatch(html, /popunder|kd_popunder_last_shown_at/i);
});
