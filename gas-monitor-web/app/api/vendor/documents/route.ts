import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

const documentSchema = z.object({
  documents: z
    .array(
      z.object({
        url: z.string().min(1),
        fileName: z.string().min(1)
      })
    )
    .min(1)
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = documentSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found. Create profile first.' }, { status: 404 });
  }

  const count = await prisma.vendorDocument.createMany({
    data: result.data.documents.map((d) => ({ vendorId: profile.id, ...d }))
  });

  return NextResponse.json({ count: count.count }, { status: 201 });
}
