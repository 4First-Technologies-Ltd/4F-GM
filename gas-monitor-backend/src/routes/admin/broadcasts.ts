import { Router } from 'express';
import { BroadcastAudience } from '@prisma/client';
import { z } from 'zod';
import { requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { countRecipients, runBroadcast } from '../../lib/broadcast';

/**
 * Messages from the admin team to users: everyone, one kind of account, or one
 * person. Super admin only: a broadcast reaches real people's phones and inboxes,
 * and cannot be recalled once sent.
 */
const router = Router();

const createSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the message a title').max(100),
    body: z.string().trim().min(3, 'Write the message').max(2000),
    audience: z.nativeEnum(BroadcastAudience),
    targetUserId: z.string().uuid().optional(),
    sendInApp: z.boolean().default(true),
    sendEmail: z.boolean().default(false),
    sendPush: z.boolean().default(false)
  })
  .superRefine((v, ctx) => {
    if (!v.sendInApp && !v.sendEmail && !v.sendPush) {
      ctx.addIssue({ code: 'custom', message: 'Choose at least one way to deliver it' });
    }
    if (v.audience === 'USER' && !v.targetUserId) {
      ctx.addIssue({ code: 'custom', message: 'Choose who to send it to' });
    }
    if (v.audience !== 'USER' && v.targetUserId) {
      ctx.addIssue({ code: 'custom', message: 'A specific person can only be chosen for "One person"' });
    }
  });

/** How many people an audience reaches right now, so the form can say so before sending. */
router.get(
  '/preview',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const audience = req.query.audience;
    if (typeof audience !== 'string' || !(audience in BroadcastAudience)) {
      return res.status(400).json({ error: 'Unknown audience' });
    }
    const targetUserId = typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined;
    return res.json({ count: await countRecipients(audience as BroadcastAudience, targetUserId) });
  })
);

router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const [rows, total] = await Promise.all([
      prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
      prisma.broadcast.count()
    ]);
    return res.json(paginated(rows, total, query));
  })
);

router.get(
  '/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: req.params.id } });
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
    const read = await prisma.notification.count({ where: { broadcastId: broadcast.id, readAt: { not: null } } });
    return res.json({ broadcast, readCount: read });
  })
);

router.post(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const result = createSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const input = result.data;

    if (input.audience === 'USER') {
      const target = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
      if (!target) return res.status(404).json({ error: 'That user does not exist' });
    }
    const count = await countRecipients(input.audience, input.targetUserId);
    if (count === 0) {
      return res.status(400).json({ error: 'No active accounts match, so nothing was sent' });
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        ...input,
        createdByName: req.admin?.name ?? null,
        createdByEmail: req.admin?.username ?? null
      }
    });

    await writeAuditLog(req, {
      action: 'BROADCAST_SENT',
      resource: 'broadcast',
      resourceId: broadcast.id,
      summary: `Broadcast "${broadcast.title}" to ${input.audience === 'USER' ? 'one user' : input.audience.toLowerCase()} (${count} recipient${count === 1 ? '' : 's'})`,
      metadata: {
        audience: input.audience,
        targetUserId: input.targetUserId ?? null,
        recipients: count,
        channels: [input.sendInApp && 'in-app', input.sendEmail && 'email', input.sendPush && 'push'].filter(Boolean) as string[]
      }
    });

    // Delivery continues after the response; the history page shows progress.
    void runBroadcast(broadcast.id);
    return res.status(201).json({ broadcast });
  })
);

export default router;
