import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: { vendorId: profile.id },
    include: {
      consumer: { select: { id: true, name: true, email: true } },
      listing: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ orders });
}
