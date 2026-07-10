import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
  if (!existing || existing.userId !== auth.sub) {
    return NextResponse.json({ error: 'Cylinder profile not found' }, { status: 404 });
  }

  const [, profile] = await prisma.$transaction([
    prisma.cylinderProfile.updateMany({ where: { userId: auth.sub }, data: { isActive: false } }),
    prisma.cylinderProfile.update({ where: { id }, data: { isActive: true } })
  ]);

  return NextResponse.json({ profile });
}
