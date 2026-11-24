import 'dotenv/config';
import { ensureDatabaseReady, listCatalogForSitemapFromDb } from '../server/db.ts';
import {
  getGoogleIndexingStatus,
  notifyGoogleIndexingUrls,
  resolveSiteOrigin,
} from '../server/googleIndexing.ts';
import { CURATED_PROGRAMMATIC_PAGES } from '../src/utils/programmaticSeo.ts';
import { getProviderRouteSlug } from '../src/constants/providerLogos.ts';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.min(50, Math.max(1, Number(limitArg.split('=')[1]) || 20)) : 20;

  await ensureDatabaseReady();
  const origin = resolveSiteOrigin();
  const statusBefore = await getGoogleIndexingStatus(origin);
  console.log(
    `[GoogleIndexing CLI] Origin=${origin} Configured=${statusBefore.configured}`
  );

  const dramas = await listCatalogForSitemapFromDb(limit);
  const targets = [
    ...dramas.map((d) => ({
      url: `${origin}/${getProviderRouteSlug(d.provider)}/detail/${encodeURIComponent(d.slug)}`,
      entityType: 'drama' as const,
      entityId: d.dramaId,
      provider: d.provider,
      action: 'URL_UPDATED' as const,
    })),
    ...CURATED_PROGRAMMATIC_PAGES.slice(0, 6).map((p) => ({
      url: `${origin}/genre/${p.slug}`,
      entityType: 'genre' as const,
      entityId: p.slug,
      provider: 'KanoDrama',
      action: 'URL_UPDATED' as const,
    })),
  ];

  const results = await notifyGoogleIndexingUrls(targets, {
    fallbackOrigin: origin,
    force,
    maxBatchSize: limit,
  });

  console.log(`[GoogleIndexing CLI] Processed ${results.length} URLs:`);
  for (const r of results) {
    console.log(`  - [${r.status}] (${r.httpStatus}) ${r.url} :: ${r.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[GoogleIndexing CLI] Error:', err);
    process.exit(1);
  });
