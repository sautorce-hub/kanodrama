import 'dotenv/config';

import {
  PROVIDER_ENDPOINT_CATALOG,
  setActiveAppLanguage,
} from '../src/services/dramaProviders.ts';

import {
  syncDramasToCatalogDb,
  type CachedDramaItem,
} from '../server/homeCache.ts';

const MAX_PAGES = Math.max(
  1,
  Number(process.env.CATALOG_MAX_PAGES || 100)
);

const DELAY_MS = 300;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  setActiveAppLanguage('en');

  let total = 0;
  let errors = 0;

  const providers = Object.entries(PROVIDER_ENDPOINT_CATALOG);

  console.log(`Starting catalog sync: ${providers.length} providers`);

  for (const [provider, endpoints] of providers) {
    const seen = new Set<string>();
    let providerTotal = 0;

    for (const endpoint of endpoints) {
      const endpointSeen = new Set<string>();

      for (let page = 1; page <= MAX_PAGES; page++) {
        try {
          const result = await endpoint.fetch(page);

          if (!result.items?.length) break;

          const fresh = result.items.filter((item) => {
            const id = String(item.bookId || '');

            if (!id || endpointSeen.has(id)) return false;

            endpointSeen.add(id);
            return true;
          });

          // Endpoint mengulang halaman sebelumnya.
          if (fresh.length === 0) break;

          const unique = fresh.filter((item) => {
            const id = String(item.bookId);

            if (seen.has(id)) return false;

            seen.add(id);
            return true;
          });

          if (unique.length > 0) {
            const items: CachedDramaItem[] = unique.map((item) => ({
              ...item,
              bookId: String(item.bookId),
              provider,
              title: String(item.title || ''),
              cover: String(item.cover || ''),
              description: String(item.description || ''),
              chapterCount: Number(item.chapterCount || 0),
              tags: Array.isArray(item.tags) ? item.tags : [],
              isVip: Boolean(item.isVip),
            }));

            await syncDramasToCatalogDb(items);

            providerTotal += items.length;
            total += items.length;
          }

          console.log(
            `[${provider}/${endpoint.key}] page=${page} new=${unique.length}`
          );

          if (!result.hasMore) break;

          await sleep(DELAY_MS);
        } catch (error) {
          errors++;
          console.error(
            `[ERROR] ${provider}/${endpoint.key} page=${page}`,
            error instanceof Error ? error.message : error
          );

          // Gagal pada satu endpoint tidak menghentikan provider lain.
          break;
        }
      }
    }

    console.log(`[DONE] ${provider}: ${providerTotal} unique dramas`);
  }

  console.log(
    `SYNC FINISHED: ${total} unique dramas processed, ${errors} endpoint errors`
  );

  if (errors > 0) process.exitCode = 1;
}

main()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    console.error('CATALOG SYNC FAILED:', error);
    process.exit(1);
  });
