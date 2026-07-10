import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { createCylinderSchema } from '@/lib/server/cylinderSchemas';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const profiles = await prisma.cylinderProfile.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: 'asc' }
  });
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = createCylinderSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const profile = await prisma.cylinderProfile.create({
    data: { userId: auth.sub, ...result.data }
  });
  return NextResponse.json({ profile }, { status: 201 });
}
