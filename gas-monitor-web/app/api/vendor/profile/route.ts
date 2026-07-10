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
