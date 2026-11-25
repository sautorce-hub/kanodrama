import {
  dramaBoxV2Provider,
  getStreamUrl as unifiedGetStreamUrl,
  prefetchStreamUrl as unifiedPrefetchStreamUrl,
  isStreamCached as unifiedIsStreamCached,
} from './dramaProviders';
import type { LanguageCode, ProviderName } from '../types/drama';

export { dramaBoxV2Provider as dramaBoxAdapter };

export const isStreamCached = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2'
) => unifiedIsStreamCached(bookId, episode, provider);

export const getStreamUrl = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2',
  extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
) => unifiedGetStreamUrl(bookId, episode, provider, extra);

export const prefetchStreamUrl = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBoxV2',
  extra?: { eid?: string; chapterId?: string; chapterIndex0?: number }
) => unifiedPrefetchStreamUrl(bookId, episode, provider, extra);

export const setLanguage = (lang: LanguageCode) =>
  dramaBoxV2Provider.setLanguage(lang);
export const getForYou = (page = 1) => dramaBoxV2Provider.fetchForYou(page);
export const getRanking = (page = 1) => dramaBoxV2Provider.fetchRanking(page);
export const getNewReleases = (page = 1) =>
  dramaBoxV2Provider.fetchNewReleases(page);
export const getVipContent = (page = 1) => dramaBoxV2Provider.fetchVip(page);
export const getDubbing = (page = 1) =>
  dramaBoxV2Provider.fetchDubbing ? dramaBoxV2Provider.fetchDubbing(page) : Promise.resolve({ items: [], hasMore: false, page });
export const searchDramas = (keyword: string, page = 1) =>
  dramaBoxV2Provider.searchDramas(keyword, page);
export const getDramaDetail = (bookId: string) =>
  dramaBoxV2Provider.fetchDetail(bookId);
export const getAllEpisodes = (bookId: string) =>
  dramaBoxV2Provider.fetchAllEpisodes(bookId);
