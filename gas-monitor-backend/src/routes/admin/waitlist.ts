import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin';
import { asyncHandler } from '../../lib/asyncHandler';
import { paginated, parseListQuery } from '../../lib/listQuery';

/**
 * Waitlist. The landing page writes sign-ups straight into Supabase
 * (`public.waitlist`, anon INSERT only), so this reads that table with the
 * service-role key. Read-only: any admin role may view it (`waitlist.read`).
 *
 * The service-role key bypasses RLS — it must only ever live in this server's
 * env, never in a browser bundle.
 */
const router = Router();

const SORTABLE = ['created_at', 'name', 'email', 'city'] as const;

interface WaitlistRow {
  id: string;
  name: string | null;
  email: string;
  city: string | null;
  created_at: string;
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** PostgREST filter syntax treats these as structure, so strip them from user input. */
const clean = (s: string) => s.replace(/[,()*%\\":]/g, ' ').trim();

async function fetchWaitlist(params: URLSearchParams, key: string, url: string, count: boolean) {
  const res = await fetch(`${url}/rest/v1/waitlist?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(count ? { Prefer: 'count=exact' } : {}) }
  });
  if (!res.ok) {
    console.error('[waitlist] Supabase request failed', res.status);
    throw new Error('Could not load the waitlist from Supabase');
  }
  return res;
}

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const cfg = config();
    if (!cfg) {
      return res.status(503).json({ error: 'Waitlist is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const query = parseListQuery(req);
    const sort = (SORTABLE as readonly string[]).includes(query.sort ?? '') ? query.sort! : 'created_at';

    const params = new URLSearchParams({
      select: 'id,name,email,city,created_at',
      order: `${sort}.${query.dir}`,
      limit: String(query.take),
      offset: String(query.skip)
    });
    if (typeof req.query.city === 'string' && req.query.city) params.set('city', `eq.${req.query.city}`);
    const q = query.q ? clean(query.q) : '';
    if (q) params.set('or', `(name.ilike.*${q}*,email.ilike.*${q}*,city.ilike.*${q}*)`);

    const upstream = await fetchWaitlist(params, cfg.key, cfg.url, true);
    const data = (await upstream.json()) as WaitlistRow[];
    // Content-Range looks like "0-19/123" (or "*/0" when empty).
    const total = Number(upstream.headers.get('content-range')?.split('/')[1]) || 0;

    return res.json(paginated(data, total, query));
  })
);

router.get(
  '/summary',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const cfg = config();
    if (!cfg) {
      return res.status(503).json({ error: 'Waitlist is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const count = async (extra: Record<string, string>) => {
      const r = await fetchWaitlist(new URLSearchParams({ select: 'id', limit: '1', ...extra }), cfg.key, cfg.url, true);
      return Number(r.headers.get('content-range')?.split('/')[1]) || 0;
    };
    // Cities: a single column pull, capped, then grouped here (PostgREST has no GROUP BY).
    const citiesRes = await fetchWaitlist(new URLSearchParams({ select: 'city', limit: '10000' }), cfg.key, cfg.url, false);
    const cityRows = (await citiesRes.json()) as { city: string | null }[];
    const tally = new Map<string, number>();
    for (const { city } of cityRows) {
      const c = city?.trim();
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }

    const [total, last7d] = await Promise.all([count({}), count({ created_at: `gte.${weekAgo}` })]);
    const cities = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([city, signups]) => ({ city, signups }));

    return res.json({ total, last7d, cityCount: cities.length, cities: cities.slice(0, 50) });
  })
);

export default router;
