import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      emailVerified: true,
      isSuspended: true,
      pushEnabled: true,
      emailNotifEnabled: true,
      smsAlertsEnabled: true,
      unitPreference: true,
      createdAt: true,
      updatedAt: true,
      vendorProfile: {
        select: {
          id: true,
          businessName: true,
          businessAddress: true,
          phone: true,
          status: true,
          bio: true,
          _count: { select: { listings: true, orders: true, documents: true } }
        }
      },
      addresses: { select: { id: true, label: true, fullAddress: true, isDefault: true } },
      cylinderProfiles: { select: { id: true, name: true, sizeKg: true, isActive: true } },
      orders: {
        select: { id: true, cylinderSize: true, quantity: true, totalAmount: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      _count: { select: { orders: true } }
    }
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  password: z.string().min(8).optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (result.data.email && result.data.email.toLowerCase() !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: result.data.email.toLowerCase() } });
    if (emailTaken) {
      return NextResponse.json({ error: 'Another user already uses this email' }, { status: 409 });
    }
  }

  const { password, email, ...rest } = result.data;
  const data: Record<string, unknown> = { ...rest };
  if (email) data.email = email.toLowerCase();
  if (password) data.password = await bcrypt.hash(password, 10);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      emailVerified: true,
      isSuspended: true,
      createdAt: true
    }
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { orders: true } },
      vendorProfile: { select: { _count: { select: { orders: true } } } }
    }
  });

  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const totalOrders = existing._count.orders + (existing.vendorProfile?._count.orders ?? 0);
  if (totalOrders > 0) {
    return NextResponse.json(
      { error: 'This user has order history and cannot be deleted. Suspend them instead.' },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
