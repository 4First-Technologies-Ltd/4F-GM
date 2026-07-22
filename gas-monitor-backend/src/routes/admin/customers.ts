import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

const REVENUE_STATUSES = ['CONFIRMED', 'DELIVERED'] as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const customers = await prisma.user.findMany({
      where: { role: 'CONSUMER' },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        orders: { select: { totalAmount: true, status: true } },
        _count: { select: { addresses: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    const rows = customers.map((c) => {
      const totalSpend = c.orders
        .filter((o) => (REVENUE_STATUSES as readonly string[]).includes(o.status))
        .reduce((sum, o) => sum + o.totalAmount, 0);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        emailVerified: c.emailVerified,
        createdAt: c.createdAt,
        orderCount: c.orders.length,
        totalSpend,
        addressCount: c._count.addresses
      };
    });

    return res.json({ customers: rows });
  })
);

export default router;
