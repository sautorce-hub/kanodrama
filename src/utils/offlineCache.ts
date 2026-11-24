import type { EpisodeItem, MediaProviderName, StreamSource } from '../types/drama';

const OFFLINE_CACHE_NAME = 'kano-drama-episodes-v1';
const OFFLINE_INDEX_KEY = 'kano_drama_offline_index_v1';

export interface OfflineCachedEntry {
  key: string;
  bookId: string;
  provider: MediaProviderName;
  episodeNumber: number;
  title?: string;
  savedAt: number;
}

function makeKey(bookId: string, provider: MediaProviderName, episodeNumber: number): string {
  return `${provider}:${bookId}:ep${episodeNumber}`;
}

export function getOfflineCachedIndex(): Record<string, OfflineCachedEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OFFLINE_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OfflineCachedEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isEpisodeCachedOffline(
  bookId: string,
  provider: MediaProviderName,
  episodeNumber: number
): boolean {
  const index = getOfflineCachedIndex();
  return Boolean(index[makeKey(bookId, provider, episodeNumber)]);
}

export async function cacheEpisodeForOffline(params: {
  bookId: string;
  provider: MediaProviderName;
  episodeNumber: number;
  title?: string;
  streamSource?: StreamSource | null;
  episodes?: EpisodeItem[];
}): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const key = makeKey(params.bookId, params.provider, params.episodeNumber);
  try {
    if ('caches' in window) {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const payload = JSON.stringify({
        savedAt: Date.now(),
        bookId: params.bookId,
        provider: params.provider,
        episodeNumber: params.episodeNumber,
        streamSource: params.streamSource ?? null,
        episodes: params.episodes ?? [],
      });
      await cache.put(
        new Request(`/__offline__/episode/${encodeURIComponent(key)}`),
        new Response(payload, {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    const index = getOfflineCachedIndex();
    const entries = Object.values(index)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, 60);
    const nextIndex: Record<string, OfflineCachedEntry> = {};
    for (const item of entries) {
      nextIndex[item.key] = item;
    }
    nextIndex[key] = {
      key,
      bookId: params.bookId,
      provider: params.provider,
      episodeNumber: params.episodeNumber,
      title: params.title,
      savedAt: Date.now(),
    };
    localStorage.setItem(OFFLINE_INDEX_KEY, JSON.stringify(nextIndex));
    return true;
  } catch {
    return false;
  }
}

export async function readOfflineCachedEpisode(
  bookId: string,
  provider: MediaProviderName,
  episodeNumber: number
): Promise<{
  streamSource: StreamSource | null;
  episodes: EpisodeItem[];
} | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  const key = makeKey(bookId, provider, episodeNumber);
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const match = await cache.match(
      `/__offline__/episode/${encodeURIComponent(key)}`
    );
    if (!match) return null;
    const json = (await match.json()) as {
      streamSource?: StreamSource | null;
      episodes?: EpisodeItem[];
    };
    return {
      streamSource: json.streamSource ?? null,
      episodes: Array.isArray(json.episodes) ? json.episodes : [],
    };
  } catch {
    return null;
  }
}
