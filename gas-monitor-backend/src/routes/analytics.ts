import { Router } from 'express';
import type { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const REVENUE_STATUSES: OrderStatus[] = ['CONFIRMED', 'DELIVERED'];
const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

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

function bucketByMonth(rows: { createdAt: Date; amount: number }[], keys: string[]) {
  const buckets = new Map(keys.map((k) => [k, { month: k, amount: 0, count: 0 }]));
  for (const row of rows) {
    const key = row.createdAt.toLocaleString('en', { month: 'short', year: '2-digit' });
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.amount += row.amount;
      bucket.count += 1;
    }
  }
  return Array.from(buckets.values());
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { role: true, vendorProfile: { select: { id: true } } }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { since, keys } = monthsBack(6);

    if (user.role === 'VENDOR' && user.vendorProfile) {
      const vendorId = user.vendorProfile.id;

      const [allOrders, recentOrders, listings] = await Promise.all([
        prisma.order.findMany({ where: { vendorId }, select: { totalAmount: true, status: true, listingId: true } }),
        prisma.order.findMany({
          where: { vendorId, createdAt: { gte: since }, status: { in: REVENUE_STATUSES } },
          select: { totalAmount: true, createdAt: true }
        }),
        prisma.gasListing.findMany({ where: { vendorId }, select: { id: true, gasType: true, customName: true } })
      ]);

      const totalRevenue = allOrders
        .filter((o) => REVENUE_STATUSES.includes(o.status))
        .reduce((sum, o) => sum + o.totalAmount, 0);
      const totalOrders = allOrders.length;

      const statusBreakdown = STATUSES.map((status) => ({
        status,
        count: allOrders.filter((o) => o.status === status).length
      }));

      const listingTotals = new Map<string, { orders: number; revenue: number }>();
      for (const o of allOrders) {
        if (!o.listingId) continue;
        const entry = listingTotals.get(o.listingId) ?? { orders: 0, revenue: 0 };
        entry.orders += 1;
        if (REVENUE_STATUSES.includes(o.status)) entry.revenue += o.totalAmount;
        listingTotals.set(o.listingId, entry);
      }
      const topListings = listings
        .map((l) => ({
          id: l.id,
          name: l.customName ?? l.gasType,
          orders: listingTotals.get(l.id)?.orders ?? 0,
          revenue: listingTotals.get(l.id)?.revenue ?? 0
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const monthly = bucketByMonth(
        recentOrders.map((o) => ({ createdAt: o.createdAt, amount: o.totalAmount })),
        keys
      ).map((b) => ({ month: b.month, revenue: b.amount, orders: b.count }));

      return res.json({
        role: 'VENDOR',
        totalRevenue,
        totalOrders,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        statusBreakdown,
        monthly,
        topListings
      });
    }

    const [allOrders, recentOrders] = await Promise.all([
      prisma.order.findMany({ where: { consumerId: req.user!.sub }, select: { totalAmount: true, status: true } }),
      prisma.order.findMany({
        where: { consumerId: req.user!.sub, createdAt: { gte: since }, status: { in: REVENUE_STATUSES } },
        select: { totalAmount: true, createdAt: true }
      })
    ]);

    const totalSpend = allOrders
      .filter((o) => REVENUE_STATUSES.includes(o.status))
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const totalOrders = allOrders.length;

    const statusBreakdown = STATUSES.map((status) => ({
      status,
      count: allOrders.filter((o) => o.status === status).length
    }));

    const monthly = bucketByMonth(
      recentOrders.map((o) => ({ createdAt: o.createdAt, amount: o.totalAmount })),
      keys
    ).map((b) => ({ month: b.month, spend: b.amount, orders: b.count }));

    return res.json({
      role: 'CONSUMER',
      totalSpend,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
      statusBreakdown,
      monthly
    });
  })
);

export default router;
