import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireSuperAdmin(req);
  if (unauthorized) return unauthorized;

  const adminUsers = await prisma.adminUser.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ adminUsers });
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['OPERATIONS', 'SUPPORT'])
});

export async function POST(req: Request) {
  const unauthorized = requireSuperAdmin(req);
  if (unauthorized) return unauthorized;

  const result = createSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const email = result.data.email.toLowerCase();
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'An admin with this email already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(result.data.password, 10);
  const adminUser = await prisma.adminUser.create({
    data: { name: result.data.name, email, passwordHash, role: result.data.role },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
  });

  return NextResponse.json({ adminUser }, { status: 201 });
}
