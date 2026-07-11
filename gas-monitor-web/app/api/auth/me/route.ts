import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  pushEnabled: true,
  emailNotifEnabled: true,
  smsAlertsEnabled: true,
  unitPreference: true,
  createdAt: true,
  updatedAt: true,
  vendorProfile: { select: { status: true } }
} as const;

function serialize<T extends { vendorProfile: { status: string } | null }>(user: T) {
  const { vendorProfile, ...userData } = user;
  return { ...userData, vendorStatus: vendorProfile?.status ?? undefined };
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: SELECT });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user: serialize(user) });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  pushEnabled: z.boolean().optional(),
  emailNotifEnabled: z.boolean().optional(),
  smsAlertsEnabled: z.boolean().optional(),
  unitPreference: z.enum(['KG', 'LBS']).optional()
});

export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = updateSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.sub },
    data: result.data,
    select: SELECT
  });

  return NextResponse.json({ user: serialize(user) });
}
