import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

const profileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  businessAddress: z.string().min(1, 'Business address is required'),
  phone: z.string().min(1, 'Phone number is required'),
  lat: z.number().optional(),
  lng: z.number().optional()
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = profileSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const profile = await prisma.vendorProfile.upsert({
    where: { userId: auth.sub },
    create: { userId: auth.sub, ...result.data },
    update: result.data
  });

  return NextResponse.json({ profile }, { status: 201 });
}

const patchSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessAddress: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  bio: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const existing = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!existing) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const profile = await prisma.vendorProfile.update({
    where: { userId: auth.sub },
    data: result.data
  });

  return NextResponse.json({ profile });
}
