import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  isSuspended: true,
  createdAt: true,
  vendorProfile: { select: { status: true } },
  _count: { select: { orders: true } }
} as const;

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } }
          ]
        }
      : undefined,
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  return NextResponse.json({ users });
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['CONSUMER', 'VENDOR']),
  phone: z.string().min(1).nullable().optional()
});

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const result = createSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const email = result.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const password = await bcrypt.hash(result.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: result.data.name,
      email,
      password,
      role: result.data.role,
      phone: result.data.phone ?? null,
      emailVerified: true
    },
    select: LIST_SELECT
  });

  return NextResponse.json({ user }, { status: 201 });
}
