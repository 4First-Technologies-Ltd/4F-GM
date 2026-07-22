import { Router } from 'express';
import type { OrderStatus, VendorStatus } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

const REVENUE_STATUSES: OrderStatus[] = ['CONFIRMED', 'DELIVERED'];
const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];
const VENDOR_STATUSES: VendorStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

function monthsBack(count: number): { since: Date; keys: string[] } {
  const since = new Date();
  since.setMonth(since.getMonth() - (count - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const keys: string[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < count; i++) {
    keys.push(cursor.toLocaleString('en', { month: 'short', year: '2-digit' }));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { since, keys };
}

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { since, keys } = monthsBack(6);

    const [totalUsers, totalVendors, allOrders, recentOrders, vendorStatusCounts, vendors] = await Promise.all([
      prisma.user.count(),
      prisma.vendorProfile.count(),
      prisma.order.findMany({ select: { totalAmount: true, status: true, vendorId: true } }),
      prisma.order.findMany({
        where: { createdAt: { gte: since }, status: { in: REVENUE_STATUSES } },
        select: { totalAmount: true, createdAt: true }
      }),
      Promise.all(VENDOR_STATUSES.map((status) => prisma.vendorProfile.count({ where: { status } }))),
      prisma.vendorProfile.findMany({ select: { id: true, businessName: true } })
    ]);

    const totalRevenue = allOrders
      .filter((o) => REVENUE_STATUSES.includes(o.status))
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = allOrders.length;

    const statusBreakdown = ORDER_STATUSES.map((status) => ({
      status,
      count: allOrders.filter((o) => o.status === status).length
    }));

    const vendorFunnel = VENDOR_STATUSES.map((status, i) => ({ status, count: vendorStatusCounts[i] }));

    const monthlyBuckets = new Map(keys.map((k) => [k, { month: k, revenue: 0, orders: 0 }]));
    for (const o of recentOrders) {
      const key = o.createdAt.toLocaleString('en', { month: 'short', year: '2-digit' });
      const bucket = monthlyBuckets.get(key);
      if (bucket) {
        bucket.revenue += o.totalAmount;
        bucket.orders += 1;
      }
    }
    const monthly = Array.from(monthlyBuckets.values());

    const vendorTotals = new Map<string, { orders: number; revenue: number }>();
    for (const o of allOrders) {
      if (!o.vendorId) continue;
      const entry = vendorTotals.get(o.vendorId) ?? { orders: 0, revenue: 0 };
      entry.orders += 1;
      if (REVENUE_STATUSES.includes(o.status)) entry.revenue += o.totalAmount;
      vendorTotals.set(o.vendorId, entry);
    }
    const topVendors = vendors
      .map((v) => ({
        id: v.id,
        businessName: v.businessName,
        orders: vendorTotals.get(v.id)?.orders ?? 0,
        revenue: vendorTotals.get(v.id)?.revenue ?? 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return res.json({
      totalUsers,
      totalVendors,
      totalRevenue,
      totalOrders,
      monthly,
      statusBreakdown,
      vendorFunnel,
      topVendors
    });
  })
);

export default router;
