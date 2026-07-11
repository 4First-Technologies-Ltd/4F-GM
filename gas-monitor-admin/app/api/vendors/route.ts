import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const vendors = await prisma.vendorProfile.findMany({
    where: status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      documents: true,
      _count: { select: { listings: true, orders: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ vendors });
}
