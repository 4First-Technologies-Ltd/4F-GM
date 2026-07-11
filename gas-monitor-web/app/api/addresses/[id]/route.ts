import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  fullAddress: z.string().min(1).optional(),
  isDefault: z.boolean().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const existing = await prisma.address.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.sub) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  if (result.data.isDefault) {
    await prisma.address.updateMany({ where: { userId: auth.sub }, data: { isDefault: false } });
  }

  const address = await prisma.address.update({ where: { id }, data: result.data });
  return NextResponse.json({ address });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.address.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.sub) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  await prisma.address.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
