import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAccessToken } from '../lib/jwt';

/**
 * Public usage-event ingest for the mobile app and web. Unauthenticated by
 * design (pre-login activity matters), so it is defended instead:
 *  - small batches, bounded property size, a strict event-name pattern;
 *  - a per-IP rate limit;
 *  - userId comes only from a VALID access token, never from the body;
 *  - timestamps are clamped so a bad device clock can't pollute history.
 */
const router = Router();

const MAX_EVENTS = 25;
const MAX_PROPERTIES_BYTES = 2048;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

const hits = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (h.resetAt < now) hits.delete(ip);
}, WINDOW_MS).unref();

const schema = z.object({
  platform: z.enum(['MOBILE', 'WEB']),
  anonymousId: z.string().min(8).max(64).optional(),
  sessionId: z.string().min(4).max(64).optional(),
  appVersion: z.string().max(32).optional(),
  events: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
        screen: z.string().max(100).optional(),
        properties: z.record(z.unknown()).optional(),
        occurredAt: z.string().datetime().optional()
      })
    )
    .min(1)
    .max(MAX_EVENTS)
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const hit = hits.get(key);
    if (!hit || hit.resetAt < now) hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else if (++hit.count > MAX_REQUESTS_PER_WINDOW) return res.status(429).json({ error: 'Too many requests' });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid events payload' });
    const { platform, anonymousId, sessionId, appVersion, events } = parsed.data;

    let userId: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        userId = verifyAccessToken(auth.slice(7)).sub;
      } catch {
        // An expired token just means this batch is anonymous.
      }
    }

    const data: Prisma.AppEventCreateManyInput[] = [];
    for (const e of events) {
      if (e.properties && Buffer.byteLength(JSON.stringify(e.properties)) > MAX_PROPERTIES_BYTES) continue;
      const claimed = e.occurredAt ? Date.parse(e.occurredAt) : now;
      const occurred = claimed > now + 5 * 60_000 || claimed < now - 48 * 3_600_000 ? now : claimed;
      data.push({
        name: e.name,
        screen: e.screen ?? null,
        properties: (e.properties as Prisma.InputJsonValue | undefined) ?? undefined,
        userId,
        anonymousId: anonymousId ?? null,
        sessionId: sessionId ?? null,
        platform,
        appVersion: appVersion ?? null,
        occurredAt: new Date(occurred)
      });
    }
    if (data.length) await prisma.appEvent.createMany({ data });

    return res.status(202).json({ stored: data.length });
  })
);

export default router;
