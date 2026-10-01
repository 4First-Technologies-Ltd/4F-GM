import { Router } from 'express';
import { Prisma, RiderStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

const SORTABLE = ['createdAt', 'status'] as const;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, email: true, createdAt: true } },
  _count: { select: { orders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const status = req.query.status;

    const where: Prisma.RiderProfileWhereInput = {};
    if (typeof status === 'string' && status in RiderStatus) {
      where.status = status as RiderStatus;
    }
    if (query.q) {
      where.OR = [
        { phone: { contains: query.q, mode: 'insensitive' } },
        { plateNumber: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [riders, total] = await Promise.all([
      prisma.riderProfile.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.riderProfile.count({ where })
    ]);

    return res.json(paginated(riders, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rider = await prisma.riderProfile.findUnique({
      where: { id: req.params.id },
      include: {
        ...LIST_INCLUDE,
        orders: {
          orderBy: { assignedAt: 'desc' },
          take: 20,
          select: { id: true, status: true, deliveryAddress: true, assignedAt: true, createdAt: true }
        }
      }
    });
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }
    return res.json({ rider });
  })
);

const patchSchema = z.object({
  status: z.nativeEnum(RiderStatus)
});

const AUDIT_ACTION = {
  APPROVED: 'RIDER_APPROVED',
  REJECTED: 'RIDER_REJECTED',
  PENDING: 'RIDER_STATUS_RESET'
} as const;

router.patch(
  '/:id',
  // Approving a rider lets them be assigned live orders — an OPERATIONS-level
  // decision, matching the vendor-approval guard.
  requireOperations,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const rider = await prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    const { status } = result.data;
    const updated = await prisma.riderProfile.update({
      where: { id },
      data: { status },
      include: LIST_INCLUDE
    });

    await writeAuditLog(req, {
      action: AUDIT_ACTION[status],
      resource: 'rider',
      resourceId: id,
      summary: `${updated.user.name}: ${rider.status} → ${status}`,
      metadata: { from: rider.status, to: status, riderName: updated.user.name }
    });

    return res.json({ rider: updated });
  })
);

export default router;
