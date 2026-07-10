import { NextResponse } from 'next/server';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { PAYSTACK_BASE, CALLBACK_URL, paystackHeaders } from '@/lib/server/paystack';

export const runtime = 'nodejs';

const initSchema = z.object({
  supplierName: z.string().min(1),
  cylinderSize: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  totalAmount: z.number().positive(),
  deliveryAddress: z.string().min(5)
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = initSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { supplierName, cylinderSize, quantity, totalAmount, deliveryAddress } = result.data;

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Create order in PENDING state first so we have an ID for the reference
  const order = await prisma.order.create({
    data: {
      consumerId: auth.sub,
      supplierName,
      cylinderSize,
      quantity,
      totalAmount,
      deliveryAddress,
      status: 'PENDING'
    }
  });

  const reference = `4FG-${order.id}`;

  try {
    const { data: ps } = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: user.email,
        amount: Math.round(totalAmount * 100), // naira → kobo
        reference,
        callback_url: CALLBACK_URL,
        metadata: {
          orderId: order.id,
          supplierName,
          cylinderSize,
          custom_fields: [
            { display_name: 'Order ID', variable_name: 'order_id', value: order.id },
            { display_name: 'Supplier', variable_name: 'supplier_name', value: supplierName },
            { display_name: 'Cylinder Size', variable_name: 'cylinder_size', value: cylinderSize }
          ]
        }
      },
      { headers: paystackHeaders() }
    );

    // Persist the reference so we can verify later
    await prisma.order.update({
      where: { id: order.id },
      data: { paystackRef: ps.data.reference }
    });

    return NextResponse.json({
      orderId: order.id,
      reference: ps.data.reference,
      authorizationUrl: ps.data.authorization_url,
      amount: totalAmount,
      email: user.email
    });
  } catch (err: any) {
    // Clean up the pending order if Paystack initialization failed
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    const msg = err?.response?.data?.message ?? 'Payment initialization failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
