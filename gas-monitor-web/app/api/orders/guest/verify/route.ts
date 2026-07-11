import { NextResponse } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/server/prisma';
import { PAYSTACK_BASE, paystackHeaders } from '@/lib/server/paystack';

export const runtime = 'nodejs';

// Unauthenticated verification for guest checkout. Safe because the order is
// only ever moved to the status Paystack itself reports, keyed by a reference
// that is generated server-side and returned to the payer.
export async function POST(req: Request) {
  const { reference } = (await req.json().catch(() => ({}))) as { reference?: string };
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
