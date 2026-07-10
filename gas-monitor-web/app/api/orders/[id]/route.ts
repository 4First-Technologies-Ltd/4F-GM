import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, consumerId: auth.sub },
    include: {
      vendor: { select: { businessName: true, businessAddress: true } }
    }
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ order });
}
