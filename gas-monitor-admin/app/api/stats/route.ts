import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

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

  return NextResponse.json({
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
}
