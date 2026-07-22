import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [userCount, vendorPending, vendorApproved, vendorRejected, orderCount, listingCount, revenue, pendingValue] =
      await Promise.all([
        prisma.user.count(),
        prisma.vendorProfile.count({ where: { status: 'PENDING' } }),
        prisma.vendorProfile.count({ where: { status: 'APPROVED' } }),
        prisma.vendorProfile.count({ where: { status: 'REJECTED' } }),
        prisma.order.count(),
        prisma.gasListing.count(),
        prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { status: { in: ['CONFIRMED', 'DELIVERED'] } }
        }),
        prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { status: 'PENDING' }
        })
      ]);

    const totalRevenue = revenue._sum.totalAmount ?? 0;
    const totalPendingValue = pendingValue._sum.totalAmount ?? 0;

    return res.json({
      userCount,
      vendorPending,
      vendorApproved,
      vendorRejected,
      orderCount,
      listingCount,
      revenue: totalRevenue,
      pendingValue: totalPendingValue,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0
    });
  })
);

export default router;
