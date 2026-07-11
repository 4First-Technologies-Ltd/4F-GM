import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const addresses = await prisma.address.findMany({
    where: { userId: auth.sub },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
  });

  return NextResponse.json({ addresses });
}

const createSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  fullAddress: z.string().min(1, 'Address is required'),
  isDefault: z.boolean().optional()
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = createSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  if (result.data.isDefault) {
    await prisma.address.updateMany({ where: { userId: auth.sub }, data: { isDefault: false } });
  }

  const address = await prisma.address.create({
    data: { userId: auth.sub, ...result.data }
  });

  return NextResponse.json({ address }, { status: 201 });
}
