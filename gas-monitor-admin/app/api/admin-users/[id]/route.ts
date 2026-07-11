import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireSuperAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  }

  const data: { isActive?: boolean; passwordHash?: string } = {};
  if (result.data.isActive !== undefined) data.isActive = result.data.isActive;
  if (result.data.password) data.passwordHash = await bcrypt.hash(result.data.password, 10);

  const adminUser = await prisma.adminUser.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
  });

  return NextResponse.json({ adminUser });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireSuperAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  }

  await prisma.adminUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
