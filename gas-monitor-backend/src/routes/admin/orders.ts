import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;

    const orders = await prisma.order.findMany({
      where: status ? { status: status as 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' } : undefined,
      include: {
        consumer: { select: { name: true, email: true } },
        vendor: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.json({ orders });
  })
);

export default router;
