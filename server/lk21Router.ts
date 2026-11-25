import { Readable } from 'node:stream';
import { Router, type Request, type Response } from 'express';
import {
  fetchAndRewriteLk21M3u8,
  fetchLk21Segment,
  fetchLk21Subtitle,
  getLk21Category,
  getLk21Detail,
  getLk21Episodes,
  getLk21Home,
  getLk21Latest,
  getLk21Menu,
  getLk21Search,
  getLk21StoredSources,
  getLk21Stream,
} from './lk21Service.ts';

interface CreateLk21RouterOptions {
  getToken: () => string;
  resolveOrigin: (req: Request) => string;
}

function cleanQueryText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function getHttpStatusForLk21Error(err: unknown, defaultStatus = 502): number {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (
    err instanceof TypeError ||
    /Invalid URL|Missing /i.test(msg)
  ) {
    return 400;
  }
  if (/Disallowed .* origin/i.test(msg)) {
    return 403;
  }
  if (/\bHTTP 404\b|not found/i.test(msg)) {
    return 404;
  }
  if (/MOLA_API_TOKEN is not configured/i.test(msg)) {
    return 503;
  }
  return defaultStatus;
}

/**
 * Dedicated Express Router for independent LK21 Movies endpoints (/api/lk21/...).
 * MOLA_API_TOKEN is injected exclusively inside server-side lk21Service calls.
 */
export function createLk21Router({
  getToken,
  resolveOrigin,
}: CreateLk21RouterOptions): Router {
  const router = Router();

  router.get('/home', async (req: Request, res: Response) => {
    try {
      const data = await getLk21Home(getToken, resolveOrigin(req));
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load LK21 home catalog',
      });
    }
  });

  router.get('/menu', async (_req: Request, res: Response) => {
    try {
      const data = await getLk21Menu(getToken);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json(data);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load LK21 menu',
      });
    }
  });

  router.get('/latest', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getLk21Latest(getToken, page, resolveOrigin(req));
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load LK21 latest movies',
      });
    }
  });

  router.get('/category', async (req: Request, res: Response) => {
    try {
      const key = cleanQueryText(req.query.key, 'lk21.featured');
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getLk21Category(
        getToken,
        key,
        page,
        resolveOrigin(req)
      );
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json(data);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load LK21 category',
      });
    }
  });

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = cleanQueryText(req.query.q);
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getLk21Search(getToken, q, page, resolveOrigin(req));
      res.json(data);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to search LK21 movies',
      });
    }
  });

  router.get('/detail', async (req: Request, res: Response) => {
    try {
      const slug = cleanQueryText(req.query.slug);
      if (!slug) {
        res.status(400).json({ ok: false, error: 'Missing slug query parameter' });
        return;
      }
      const detail = await getLk21Detail(getToken, slug, resolveOrigin(req));
      if (!detail) {
        res.status(404).json({ ok: false, error: 'Movie not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(detail);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load LK21 movie detail',
      });
    }
  });

  router.get('/episodes', async (req: Request, res: Response) => {
    try {
      const slug = cleanQueryText(req.query.slug);
      if (!slug) {
        res.status(400).json({ ok: false, error: 'Missing slug query parameter' });
        return;
      }
      const eps = await getLk21Episodes(getToken, slug);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(eps);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load LK21 episodes',
      });
    }
  });

  router.get('/sources', async (req: Request, res: Response) => {
    try {
      const slug = cleanQueryText(req.query.slug);
      if (!slug) {
        res.status(400).json({ ok: false, error: 'Missing slug query parameter' });
        return;
      }
      const epRaw = Number(req.query.episode);
      const episode = Number.isFinite(epRaw) && epRaw > 0 ? epRaw : undefined;
      const sources = await getLk21StoredSources(slug, episode);
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.json({ ok: true, slug: slug.toLowerCase(), sources });
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err, 500)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load movie sources',
      });
    }
  });

  router.get('/stream', async (req: Request, res: Response) => {
    try {
      const slug = cleanQueryText(req.query.slug);
      const vid = cleanQueryText(req.query.vid) || undefined;
      const episodeRaw = Number(req.query.episode);
      const episode =
        Number.isFinite(episodeRaw) && episodeRaw > 0 ? episodeRaw : undefined;
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      if (!slug && !vid) {
        res.status(400).json({ ok: false, error: 'Missing slug query parameter' });
        return;
      }
      const stream = await getLk21Stream(getToken, {
        slug,
        vid,
        episode,
        forceRefresh,
      });
      res.json(stream);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load LK21 stream',
      });
    }
  });

  router.get('/proxy/m3u8', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = cleanQueryText(req.query.url);
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url query parameter' });
      return;
    }
    try {
      const { status, body } = await fetchAndRewriteLk21M3u8(getToken, rawUrl);
      res.status(status);
      res.setHeader(
        'Content-Type',
        'application/vnd.apple.mpegurl; charset=utf-8'
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(body);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to proxy LK21 m3u8',
      });
    }
  });

  router.get('/proxy/segment', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = cleanQueryText(req.query.url);
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url query parameter' });
      return;
    }
    try {
      const seg = await fetchLk21Segment(rawUrl, req.get('range'), getToken);
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
          if (!nodeStream.destroyed) {
            nodeStream.destroy();
          }
        };
        nodeStream.on('error', () => {
          cleanup();
          if (!res.headersSent) {
            res.status(502).json({ ok: false, error: 'Upstream segment stream error' });
          } else {
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
        res.status(getHttpStatusForLk21Error(err)).json({
          ok: false,
          error:
            err instanceof Error ? err.message : 'Failed to proxy LK21 segment',
        });
      }
    }
  });

  router.get('/proxy/subtitle', async (req: Request, res: Response) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const rawUrl = cleanQueryText(req.query.url);
    if (!rawUrl) {
      res.status(400).json({ ok: false, error: 'Missing url query parameter' });
      return;
    }
    try {
      const sub = await fetchLk21Subtitle(rawUrl);
      res.status(sub.status);
      res.setHeader('Content-Type', sub.contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(sub.body);
    } catch (err) {
      res.status(getHttpStatusForLk21Error(err)).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to proxy LK21 subtitle',
      });
    }
  });

  return router;
}
