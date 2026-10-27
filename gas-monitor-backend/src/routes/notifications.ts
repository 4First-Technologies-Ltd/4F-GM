import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth } from '../middleware/requireAuth';

/**
 * A signed-in user's own inbox (messages from the 4FG team) and the push token
 * of the device they are using. Every query is scoped to the caller.
 */
const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const take = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const where = { userId: req.user!.sub };
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, title: true, body: true, readAt: true, createdAt: true }
      }),
      prisma.notification.count({ where: { ...where, readAt: null } })
    ]);
    return res.json({ notifications, unread });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await prisma.notification.count({ where: { userId: req.user!.sub, readAt: null } });
    return res.json({ unread });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user!.sub, readAt: null },
      data: { readAt: new Date() }
    });
    return res.json({ updated: count });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    // updateMany with the owner in the filter: someone else's id simply matches nothing.
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.sub, readAt: null },
      data: { readAt: new Date() }
    });
    return res.json({ updated: count });
  })
);

const tokenSchema = z.object({
  token: z.string().min(10).max(300).regex(/^(Exponent|Expo)PushToken\[.+\]$/, 'Not an Expo push token'),
  platform: z.enum(['android', 'ios'])
});

router.put(
  '/push-token',
  asyncHandler(async (req, res) => {
    const result = tokenSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const { token, platform } = result.data;
    // A token belongs to one device. If someone else signed in on this phone, it moves to them.
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, platform, userId: req.user!.sub },
      update: { userId: req.user!.sub, platform }
    });
    return res.json({ ok: true });
  })
);

router.delete(
  '/push-token',
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : null;
    if (!token) return res.status(400).json({ error: 'token is required' });
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user!.sub } });
    return res.json({ ok: true });
  })
);

export default router;
