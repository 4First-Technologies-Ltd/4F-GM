import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

/** App usage analytics over `app_events`. Read-only; every admin role. */
const router = Router();

// Bucket by Nigerian calendar day, not UTC — occurredAt is stored as UTC.
const LOCAL_TS = Prisma.sql`("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')`;

// `actor` = the user when known, else the user that same install later signed
// in as, else the install itself. Without this stitching, someone who browses
// logged out and then signs in is counted as two people.
const STITCHED = Prisma.sql`(
  SELECT e.*, COALESCE(e."userId", s."userId", e."anonymousId") AS actor
  FROM app_events e
  LEFT JOIN (
    SELECT DISTINCT ON ("anonymousId") "anonymousId", "userId"
    FROM app_events
    WHERE "anonymousId" IS NOT NULL AND "userId" IS NOT NULL
    ORDER BY "anonymousId", "occurredAt" DESC
  ) s ON s."anonymousId" = e."anonymousId"
) ev`;

router.get(
  '/overview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const n = parseInt(String(req.query.days ?? ''), 10);
    const days = Number.isNaN(n) || n <= 0 ? 30 : Math.min(n, 180);
    const since = new Date(Date.now() - days * 86_400_000);

    const [totals, daily, topEvents, topScreens, platforms, roles, versions] = await Promise.all([
      prisma.$queryRaw<Array<{ events: number; people: number; users: number; devices: number; sessions: number }>>`
        SELECT COUNT(*)::int AS events,
               COUNT(DISTINCT actor)::int AS people,
               COUNT(DISTINCT "userId")::int AS users,
               COUNT(DISTINCT "anonymousId")::int AS devices,
               COUNT(DISTINCT "sessionId")::int AS sessions
        FROM ${STITCHED} WHERE "occurredAt" >= ${since}`,
      prisma.$queryRaw<Array<{ day: string; active: number; events: number }>>`
        SELECT to_char(date_trunc('day', ${LOCAL_TS}), 'YYYY-MM-DD') AS day,
               COUNT(DISTINCT actor)::int AS active,
               COUNT(*)::int AS events
        FROM ${STITCHED} WHERE "occurredAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<Array<{ name: string; count: number; actors: number }>>`
        SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT actor)::int AS actors
        FROM ${STITCHED} WHERE "occurredAt" >= ${since}
        GROUP BY name ORDER BY count DESC LIMIT 20`,
      prisma.$queryRaw<Array<{ screen: string; views: number; actors: number }>>`
        SELECT screen, COUNT(*)::int AS views, COUNT(DISTINCT actor)::int AS actors
        FROM ${STITCHED}
        WHERE name = 'screen_viewed' AND screen IS NOT NULL AND "occurredAt" >= ${since}
        GROUP BY screen ORDER BY views DESC LIMIT 15`,
      prisma.$queryRaw<Array<{ platform: string; events: number; actors: number }>>`
        SELECT platform, COUNT(*)::int AS events, COUNT(DISTINCT actor)::int AS actors
        FROM ${STITCHED} WHERE "occurredAt" >= ${since}
        GROUP BY platform ORDER BY events DESC`,
      prisma.$queryRaw<Array<{ role: string; actors: number }>>`
        SELECT COALESCE(u.role::text, 'ANONYMOUS') AS role, COUNT(DISTINCT ev.actor)::int AS actors
        FROM ${STITCHED}
        LEFT JOIN users u ON u.id = ev."userId"
        WHERE ev."occurredAt" >= ${since}
        GROUP BY 1 ORDER BY actors DESC`,
      prisma.$queryRaw<Array<{ version: string; actors: number }>>`
        SELECT COALESCE("appVersion", 'unknown') AS version, COUNT(DISTINCT actor)::int AS actors
        FROM ${STITCHED} WHERE "occurredAt" >= ${since}
        GROUP BY 1 ORDER BY actors DESC LIMIT 8`
    ]);

    return res.json({
      days,
      since: since.toISOString(),
      totals: totals[0] ?? { events: 0, people: 0, users: 0, devices: 0, sessions: 0 },
      daily,
      topEvents,
      topScreens,
      platforms,
      roles,
      versions
    });
  })
);

export default router;
