import { NextResponse } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { PAYSTACK_BASE, paystackHeaders } from '@/lib/server/paystack';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { reference } = (await req.json()) as { reference?: string };
  if (!reference) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  }

  try {
    const { data: ps } = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: paystackHeaders()
    });

    if (ps.data.status !== 'success') {
      return NextResponse.json({ error: 'Payment was not successful', paystackStatus: ps.data.status }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { paystackRef: reference },
      data: { status: 'CONFIRMED', paystackStatus: ps.data.status }
    });

    return NextResponse.json({ success: true, orderId: order.id, status: order.status });
  } catch (err: any) {
    const msg = err?.response?.data?.message ?? 'Verification failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
