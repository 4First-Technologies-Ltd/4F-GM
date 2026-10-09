import { Router } from 'express';
import { Prisma, ServerLogLevel } from '@prisma/client';
import { requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { SERVER_LOG_RETENTION_DAYS } from '../../lib/serverLog';

/**
 * Server logs. SUPER_ADMIN only: even redacted, logs expose internals (paths,
 * stack traces, other people's emails) that no other admin role needs.
 */
const router = Router();

router.get(
  '/summary',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [errors24h, warnings24h, latest] = await Promise.all([
      prisma.serverLog.count({ where: { level: 'ERROR', createdAt: { gte: since } } }),
      prisma.serverLog.count({ where: { level: 'WARN', createdAt: { gte: since } } }),
      prisma.serverLog.findFirst({ where: { level: 'ERROR' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    ]);
    return res.json({ errors24h, warnings24h, lastErrorAt: latest?.createdAt ?? null, retentionDays: SERVER_LOG_RETENTION_DAYS });
  })
);

router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { level, source, range } = req.query;

    const where: Prisma.ServerLogWhereInput = {};
    if (typeof level === 'string' && level in ServerLogLevel) where.level = level as ServerLogLevel;
    if (source === 'http' || source === 'console') where.source = source;
    const hours = { '1h': 1, '24h': 24, '7d': 168 }[String(range) as '1h' | '24h' | '7d'];
    if (hours) where.createdAt = { gte: new Date(Date.now() - hours * 3_600_000) };
    if (query.q) {
      where.OR = [
        { message: { contains: query.q, mode: 'insensitive' } },
        { path: { contains: query.q, mode: 'insensitive' } },
        { stack: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.serverLog.findMany({
        where,
        orderBy: orderBy(query, ['createdAt', 'level'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.serverLog.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

export default router;
