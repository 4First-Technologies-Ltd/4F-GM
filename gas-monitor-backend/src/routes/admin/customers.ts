import { Router } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';

const router = Router();

/** Only money that actually landed counts towards spend. */
const REVENUE_STATUSES: OrderStatus[] = ['CONFIRMED', 'DELIVERED'];

const SORTABLE = ['createdAt', 'name', 'email'] as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const verified = req.query.verified;

    const where: Prisma.UserWhereInput = { role: 'CONSUMER' };
    if (verified === 'true' || verified === 'false') {
      where.emailVerified = verified === 'true';
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          emailVerified: true,
          isSuspended: true,
          createdAt: true,
          _count: { select: { addresses: true, orders: true } }
        },
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.user.count({ where })
    ]);

    // Spend is aggregated in the DATABASE for exactly the page being returned,
    // rather than by pulling every order into memory and summing in JS.
    const ids = customers.map((c) => c.id);
    const spendByConsumer = ids.length
      ? await prisma.order.groupBy({
          by: ['consumerId'],
          where: { consumerId: { in: ids }, status: { in: REVENUE_STATUSES } },
          _sum: { totalAmount: true }
        })
      : [];

    const spend = new Map(spendByConsumer.map((row) => [row.consumerId, row._sum.totalAmount ?? 0]));

    const rows = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      emailVerified: c.emailVerified,
      isSuspended: c.isSuspended,
      createdAt: c.createdAt,
      orderCount: c._count.orders,
      addressCount: c._count.addresses,
      totalSpend: spend.get(c.id) ?? 0
    }));

    return res.json(paginated(rows, total, query));
  })
);

export default router;
