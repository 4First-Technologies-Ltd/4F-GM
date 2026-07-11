import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const listings = await prisma.gasListing.findMany({
    include: {
      vendor: { select: { businessName: true } },
      _count: { select: { orders: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  return NextResponse.json({ listings });
}
