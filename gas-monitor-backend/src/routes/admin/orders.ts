import { Router } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';

const router = Router();

/**
 * Orders are READ-ONLY from the admin panel. No status-transition endpoint has
 * ever existed here: order state is driven by the consumer/vendor flows and the
 * Paystack webhook. Do not add a mutation route without deciding what it should
 * do to payment state.
 */

const SORTABLE = ['createdAt', 'totalAmount', 'status'] as const;

const LIST_INCLUDE = {
  consumer: { select: { id: true, name: true, email: true } },
  vendor: { select: { id: true, businessName: true } }
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

    return res.json(paginated(orders, total, query));
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
    return res.json({ order });
  })
);

export default router;
