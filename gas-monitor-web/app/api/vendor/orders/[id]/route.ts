import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

const orderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DELIVERED', 'CANCELLED'])
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = orderStatusSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { id } = await params;

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const exists = await prisma.order.findFirst({ where: { id, vendorId: profile.id } });
  if (!exists) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const order = await prisma.order.update({ where: { id }, data: { status: result.data.status } });
  return NextResponse.json({ order });
}
