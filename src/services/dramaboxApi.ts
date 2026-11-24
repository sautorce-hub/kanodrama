import {
  dramaBoxProvider,
  getStreamUrl as unifiedGetStreamUrl,
  prefetchStreamUrl as unifiedPrefetchStreamUrl,
  isStreamCached as unifiedIsStreamCached,
} from './dramaProviders';
import type { LanguageCode, ProviderName } from '../types/drama';

export { dramaBoxProvider as dramaBoxAdapter };

export const isStreamCached = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBox'
) => unifiedIsStreamCached(bookId, episode, provider);

export const getStreamUrl = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBox'
) => unifiedGetStreamUrl(bookId, episode, provider);

export const prefetchStreamUrl = (
  bookId: string,
  episode: number,
  provider: ProviderName = 'DramaBox'
) => unifiedPrefetchStreamUrl(bookId, episode, provider);

export const setLanguage = (lang: LanguageCode) =>
  dramaBoxProvider.setLanguage(lang);
export const getForYou = (page = 1) => dramaBoxProvider.fetchForYou(page);
export const getRanking = (page = 1) => dramaBoxProvider.fetchRanking(page);
export const getNewReleases = (page = 1) =>
  dramaBoxProvider.fetchNewReleases(page);
export const getVipContent = (page = 1) => dramaBoxProvider.fetchVip(page);
export const getDubbing = (page = 1) =>
  dramaBoxProvider.fetchDubbing ? dramaBoxProvider.fetchDubbing(page) : Promise.resolve({ items: [], hasMore: false, page });
export const searchDramas = (keyword: string, page = 1) =>
  dramaBoxProvider.searchDramas(keyword, page);
export const getDramaDetail = (bookId: string) =>
  dramaBoxProvider.fetchDetail(bookId);
export const getAllEpisodes = (bookId: string) =>
  dramaBoxProvider.fetchAllEpisodes(bookId);
