import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const REVENUE_STATUSES = ['CONFIRMED', 'DELIVERED'] as const;

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

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

  return NextResponse.json({ customers: rows });
}
