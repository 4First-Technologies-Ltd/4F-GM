import { Router } from 'express';
import { AuditAction, Prisma } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { paginated, parseListQuery } from '../../lib/listQuery';

const router = Router();

/**
 * The audit trail is APPEND-ONLY. There is deliberately no POST, PATCH or
 * DELETE here — an audit log that can be edited is not an audit log. Entries are
 * written only by writeAuditLog() from the routes that perform the action.
 */

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const action = req.query.action;
    const resource = req.query.resource;
    const actorId = req.query.actorId;
    const from = req.query.from;

    const where: Prisma.AuditLogWhereInput = {};
    if (typeof action === 'string' && action in AuditAction) {
      where.action = action as AuditAction;
    }
    if (typeof resource === 'string' && resource) {
      where.resource = resource;
    }
    if (typeof actorId === 'string' && actorId) {
      where.actorId = actorId;
    }
    if (typeof from === 'string' && from) {
      const since = new Date(from);
      if (!Number.isNaN(since.getTime())) {
        where.createdAt = { gte: since };
      }
    }
    if (query.q) {
      where.OR = [
        { summary: { contains: query.q, mode: 'insensitive' } },
        { actorName: { contains: query.q, mode: 'insensitive' } },
        { actorEmail: { contains: query.q, mode: 'insensitive' } },
        { resourceId: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        // Audit is always newest-first; there is no useful alternative ordering.
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take
      }),
      prisma.auditLog.count({ where })
    ]);

    return res.json(paginated(entries, total, query));
  })
);

/** Distinct actors, for the audit filter dropdown. */
router.get(
  '/actors',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const actors = await prisma.auditLog.groupBy({
      by: ['actorId', 'actorName', 'actorEmail'],
      _count: { _all: true },
      orderBy: { _count: { actorId: 'desc' } }
    });
    return res.json({
      actors: actors.map((a) => ({
        id: a.actorId,
        name: a.actorName,
        email: a.actorEmail,
        entries: a._count._all
      }))
    });
  })
);

export default router;
