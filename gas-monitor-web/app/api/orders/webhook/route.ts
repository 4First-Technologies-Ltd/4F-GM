import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/server/prisma';
import { PAYSTACK_SECRET } from '@/lib/server/paystack';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const signature = req.headers.get('x-paystack-signature');
  const rawBody = await req.text();

  if (!signature) {
    return new NextResponse('Missing signature', { status: 400 });
  }

  const hash = createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  if (hash !== signature) {
    return new NextResponse('Bad signature', { status: 400 });
  }

  const event = JSON.parse(rawBody) as { event: string; data: { reference: string; status: string } };

  if (event.event === 'charge.success') {
    await prisma.order.updateMany({
      where: { paystackRef: event.data.reference, status: 'PENDING' },
      data: { status: 'CONFIRMED', paystackStatus: event.data.status }
    });
  }

  return new NextResponse('OK', { status: 200 });
}
