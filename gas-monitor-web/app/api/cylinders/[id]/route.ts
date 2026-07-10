import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { updateCylinderSchema } from '@/lib/server/cylinderSchemas';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.sub) {
    return NextResponse.json({ error: 'Cylinder profile not found' }, { status: 404 });
  }

  const result = updateCylinderSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const profile = await prisma.cylinderProfile.update({ where: { id }, data: result.data });
  return NextResponse.json({ profile });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.sub) {
    return NextResponse.json({ error: 'Cylinder profile not found' }, { status: 404 });
  }

  await prisma.cylinderProfile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
