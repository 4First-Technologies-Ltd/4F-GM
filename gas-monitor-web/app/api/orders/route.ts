import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const orders = await prisma.order.findMany({
    where: { consumerId: auth.sub },
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { businessName: true, businessAddress: true } }
    }
  });
  return NextResponse.json({ orders });
}
