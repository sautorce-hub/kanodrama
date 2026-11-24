import { Readable } from 'node:stream';
import { Router, type Request, type Response } from 'express';
import {
  extractLookSeriesBookId,
  fetchAndRewriteLookSeriesM3u8,
  fetchLookSeriesSegment,
  getLookSeriesCategory,
  getLookSeriesDetail,
  getLookSeriesEpisodes,
  getLookSeriesFeed,
  getLookSeriesSearch,
  getLookSeriesStream,
  type LookSeriesFeedSection,
} from './lookseriesService.ts';

interface CreateLookSeriesRouterOptions {
  getToken: () => string;
  resolveOrigin: (req: Request) => string;
}

function cleanQueryText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

/**
 * Dedicated Express Router for LookSeries Movies & Series endpoints (/api/lookseries/...).
 * MOLA_API_TOKEN is injected exclusively server-side and stripped from client responses.
 */
export function createLookSeriesRouter({
  getToken,
}: CreateLookSeriesRouterOptions): Router {
  const router = Router();

  const handleFeed =
    (section: LookSeriesFeedSection) => async (req: Request, res: Response) => {
      try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const data = await getLookSeriesFeed(getToken, section, page);
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.json(data);
      } catch (err) {
        res.status(502).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : `Failed to load LookSeries ${section}`,
        });
      }
    };

  router.get('/foryou', handleFeed('foryou'));
  router.get('/film', handleFeed('film'));
  router.get('/series', handleFeed('series'));
  router.get('/kartun', handleFeed('kartun'));

  router.get('/category', async (req: Request, res: Response) => {
    try {
      const topicId = cleanQueryText(
        req.query.topic_id ?? req.query.key,
        'netflix'
      );
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getLookSeriesCategory(getToken, topicId, page);
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load LookSeries category',
      });
    }
  });

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = cleanQueryText(req.query.q ?? req.query.keyword);
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getLookSeriesSearch(getToken, q, page);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to search LookSeries',
      });
    }
  });

  router.get('/detail', async (req: Request, res: Response) => {
    try {
      const rawId = cleanQueryText(
        req.query.book_id ?? req.query.bookId ?? req.query.slug
      );
      const bookId = extractLookSeriesBookId(rawId);
      if (!bookId) {
        res
          .status(400)
          .json({ ok: false, error: 'Missing book_id query parameter' });
        return;
      }
      const detail = await getLookSeriesDetail(getToken, bookId);
      if (!detail) {
        res.status(404).json({ ok: false, error: 'LookSeries title not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(detail);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load LookSeries detail',
      });
    }
  });

  router.get('/allepisode', async (req: Request, res: Response) => {
    try {
      const rawId = cleanQueryText(
        req.query.book_id ?? req.query.bookId ?? req.query.slug
      );
      const bookId = extractLookSeriesBookId(rawId);
      if (!bookId) {
        res
          .status(400)
          .json({ ok: false, error: 'Missing book_id query parameter' });
        return;
      }
      const eps = await getLookSeriesEpisodes(getToken, bookId);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(eps);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load LookSeries episodes',
      });
    }
  });

  router.get('/stream', async (req: Request, res: Response) => {
    try {
      const rawId = cleanQueryText(
        req.query.book_id ?? req.query.bookId ?? req.query.slug
      );
      const bookId = extractLookSeriesBookId(rawId);
      if (!bookId) {
        res
          .status(400)
          .json({ ok: false, error: 'Missing book_id query parameter' });
        return;
      }
      const rawEpStr = cleanQueryText(req.query.episode);
      const parsedEp = rawEpStr !== '' ? Number(rawEpStr) : 1;
      const episode =
        Number.isFinite(parsedEp) && parsedEp >= 0 ? Math.floor(parsedEp) : 1;
      const chapterId =
        cleanQueryText(
          req.query.chapter_id ?? req.query.chapterId ?? req.query.vid
        ) || undefined;
      const rawIdx0Str = cleanQueryText(
        req.query.chapter_index0 ?? req.query.chapterIndex0
      );
      const parsedIdx0 = rawIdx0Str !== '' ? Number(rawIdx0Str) : NaN;
      const chapterIndex0 =
        Number.isFinite(parsedIdx0) && parsedIdx0 >= 0
          ? Math.floor(parsedIdx0)
          : undefined;
      const forceRefresh =
        req.query.refresh === '1' || req.query.refresh === 'true';
      const stream = await getLookSeriesStream(getToken, {
        bookId,
        episode,
        chapterId,
        chapterIndex0,
        forceRefresh,
      });
      res.setHeader(
        'Cache-Control',
        forceRefresh ? 'no-store' : 'private, max-age=60'
      );
      res.json(stream);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load LookSeries stream',
      });
    }
  });

  router.get('/proxy/m3u8', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = cleanQueryText(req.query.url);
    const streamKey = cleanQueryText(req.query.key) || undefined;
    const via =
      cleanQueryText(req.query.via) === 'upstream' ? 'upstream' : undefined;
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url query parameter' });
      return;
    }
    try {
      const { status, body } = await fetchAndRewriteLookSeriesM3u8(
        getToken,
        rawUrl,
        streamKey,
        via
      );
      res.status(status);
      res.setHeader(
        'Content-Type',
        'application/vnd.apple.mpegurl; charset=utf-8'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(body);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to proxy LookSeries m3u8',
      });
    }
  });

  router.get('/proxy/segment', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = cleanQueryText(req.query.url);
    const streamKey = cleanQueryText(req.query.key) || undefined;
    const via =
      cleanQueryText(req.query.via) === 'upstream' ? 'upstream' : undefined;
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url query parameter' });
      return;
    }
    try {
      const seg = await fetchLookSeriesSegment(
        rawUrl,
        req.get('range'),
        getToken,
        streamKey,
        via
      );
      res.status(seg.status);
      res.setHeader('Content-Type', seg.contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Accept-Ranges'
      );
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (seg.contentLength) res.setHeader('Content-Length', seg.contentLength);
      if (seg.contentRange) res.setHeader('Content-Range', seg.contentRange);
      if (seg.acceptRanges) res.setHeader('Accept-Ranges', seg.acceptRanges);

      if (seg.upstream.body) {
        const nodeStream = Readable.fromWeb(
          seg.upstream.body as unknown as import('node:stream/web').ReadableStream
        );
        const cleanup = () => {
          if (!nodeStream.destroyed) nodeStream.destroy();
        };
        nodeStream.on('error', () => {
          cleanup();
          if (!res.headersSent) {
            res.status(502).json({ ok: false, error: 'Segment stream error' });
          } else if (!res.writableEnded) {
            res.end();
          }
        });
        req.on('close', cleanup);
        res.on('error', cleanup);
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await seg.upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to proxy LookSeries segment',
        });
      }
    }
  });

  return router;
}
