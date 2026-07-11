import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const orders = await prisma.order.findMany({
    where: status ? { status: status as 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' } : undefined,
    include: {
      consumer: { select: { name: true, email: true } },
      vendor: { select: { businessName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  return NextResponse.json({ orders });
}
