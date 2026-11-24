import type { DramaItem, WatchHistoryEntry } from '../types/drama';

export interface PickedForYouResult {
  items: DramaItem[];
  anchorTitle: string | null;
}

/**
 * Deterministic behavioral recommendation engine:
 * Scores unwatched / fresh catalog dramas using the viewer's watch history,
 * likes, watchlist items, and completed dramas (tag affinity, provider affinity,
 * and keyword overlap) without requiring any external LLM API call.
 */
export function buildPickedForYouRecommendations(params: {
  catalog: DramaItem[];
  watchHistory: WatchHistoryEntry[];
  likedDramaIds: string[];
  myListItems: DramaItem[];
  completedDramaIds: string[];
  limit?: number;
}): PickedForYouResult {
  const {
    catalog,
    watchHistory,
    likedDramaIds,
    myListItems,
    completedDramaIds,
    limit = 14,
  } = params;

  if (catalog.length === 0) {
    return { items: [], anchorTitle: null };
  }

  const watchedKeys = new Set(
    watchHistory.map((h) => `${h.provider}:${h.bookId}`)
  );
  const completedSet = new Set(completedDramaIds);
  const likedSet = new Set(likedDramaIds);

  const tagWeights = new Map<string, number>();
  const providerWeights = new Map<string, number>();
  const titleTokens = new Map<string, number>();

  const addSignal = (drama: DramaItem, weight: number) => {
    providerWeights.set(
      drama.provider,
      (providerWeights.get(drama.provider) ?? 0) + weight * 0.8
    );
    for (const tag of drama.tags) {
      const norm = tag.trim().toLowerCase();
      if (norm) {
        tagWeights.set(norm, (tagWeights.get(norm) ?? 0) + weight * 2.2);
      }
    }
    const words = drama.title
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((w) => w.length >= 3);
    for (const w of words) {
      titleTokens.set(w, (titleTokens.get(w) ?? 0) + weight * 0.45);
    }
  };

  // Recent watch history carries strongest signal with recency decay
  watchHistory.forEach((entry, idx) => {
    const recencyFactor = Math.max(0.4, 2.5 - idx * 0.2);
    const completionBoost = entry.progress >= 50 ? 1.35 : 1.0;
    addSignal(entry.drama, recencyFactor * completionBoost);
  });

  for (const item of myListItems) {
    const key = `${item.provider}:${item.bookId}`;
    const boost = likedSet.has(key) ? 2.4 : 1.5;
    addSignal(item, boost);
  }

  for (const item of catalog) {
    const key = `${item.provider}:${item.bookId}`;
    if (likedSet.has(key)) addSignal(item, 2.5);
    if (completedSet.has(key)) addSignal(item, 1.8);
  }

  const hasPersonalSignals =
    tagWeights.size > 0 || providerWeights.size > 0 || watchHistory.length > 0;

  if (!hasPersonalSignals) {
    // Cold-start smart diversity pick across providers and rich metadata
    const seen = new Set<string>();
    const coldPicks: DramaItem[] = [];
    for (const item of catalog) {
      const key = `${item.provider}:${item.bookId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (item.cover) {
        coldPicks.push(item);
      }
      if (coldPicks.length >= limit) break;
    }
    return { items: coldPicks, anchorTitle: null };
  }

  const scored: { drama: DramaItem; score: number }[] = [];
  const seenCandidates = new Set<string>();

  for (const candidate of catalog) {
    const key = `${candidate.provider}:${candidate.bookId}`;
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);

    // Exclude already actively watched or completed titles so recommendations feel fresh
    if (watchedKeys.has(key) || completedSet.has(key)) continue;

    let score = candidate.cover ? 0.5 : -5;
    score += providerWeights.get(candidate.provider) ?? 0;

    for (const tag of candidate.tags) {
      const norm = tag.trim().toLowerCase();
      score += tagWeights.get(norm) ?? 0;
    }

    const words = candidate.title
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((w) => w.length >= 3);
    for (const w of words) {
      score += titleTokens.get(w) ?? 0;
    }

    if (candidate.chapterCount >= 40) score += 0.35;
    if (candidate.isVip) score += 0.15;

    scored.push({ drama: candidate, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const anchorEntry = watchHistory[0];
  const anchorTitle =
    anchorEntry && scored.length > 0 && scored[0].score > 2.5
      ? anchorEntry.title
      : null;

  return {
    items: scored.slice(0, limit).map((s) => s.drama),
    anchorTitle,
  };
}
