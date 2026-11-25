import { Router } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { assignRiderAsAdmin, hidePin } from '../../lib/dispatch';

const router = Router();

/**
 * Orders are otherwise READ-ONLY from the admin panel: order state is driven
 * by the consumer/vendor flows and the Paystack webhook, and no route here
 * should touch `status` or payment fields. The one exception is rider
 * assignment below, the fallback when no rider takes a job from the pool — it
 * only ever writes `riderId`/`assignedAt` (and `poolEnteredAt` when it puts an
 * order back in the pool), never `status`. Cancelling a paid order nobody would
 * deliver happens through a dispatch suggestion (routes/admin/dispatch.ts).
 */

const SORTABLE = ['createdAt', 'totalAmount', 'status'] as const;

const LIST_INCLUDE = {
  consumer: { select: { id: true, name: true, email: true } },
  vendor: { select: { id: true, businessName: true } },
  rider: { select: { id: true, phone: true, user: { select: { name: true } } } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const status = req.query.status;
    const vendorId = req.query.vendorId;

    const where: Prisma.OrderWhereInput = {};
    if (typeof status === 'string' && status in OrderStatus) {
      where.status = status as OrderStatus;
    }
    if (typeof vendorId === 'string' && vendorId) {
      where.vendorId = vendorId;
    }
    if (query.q) {
      where.OR = [
        { id: { contains: query.q, mode: 'insensitive' } },
        { paystackRef: { contains: query.q, mode: 'insensitive' } },
        { deliveryAddress: { contains: query.q, mode: 'insensitive' } },
        { consumer: { name: { contains: query.q, mode: 'insensitive' } } },
        { consumer: { email: { contains: query.q, mode: 'insensitive' } } },
        { vendor: { businessName: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.order.count({ where })
    ]);

    return res.json(paginated(orders.map(hidePin), total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        ...LIST_INCLUDE,
        listing: { select: { id: true, gasType: true, customName: true, pricePerKg: true } }
      }
    });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json({ order: hidePin(order) });
  })
);

const assignRiderSchema = z.object({
  riderId: z.string().min(1).nullable()
});

router.patch(
  '/:id/rider',
  // Reassigning delivery is an operational decision, same rank as vendor
  // approval, not something a read-only SUPPORT admin should trigger.
  requireOperations,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = assignRiderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { riderId } = result.data;
    const outcome = await assignRiderAsAdmin(id, riderId);
    if (!outcome.ok) {
      return res.status(outcome.status).json({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });
    }
    const order = { riderId: outcome.from };
    const updated = (await prisma.order.findUnique({ where: { id }, include: LIST_INCLUDE }))!;

    await writeAuditLog(req, {
      action: riderId ? 'ORDER_RIDER_ASSIGNED' : 'ORDER_RIDER_UNASSIGNED',
      resource: 'order',
      resourceId: id,
      summary: riderId
        ? `Order ${id}: assigned to ${updated.rider?.user.name ?? riderId}`
        : `Order ${id}: rider unassigned`,
      metadata: { from: order.riderId, to: riderId }
    });

    return res.json({ order: hidePin(updated) });
  })
);

export default router;
