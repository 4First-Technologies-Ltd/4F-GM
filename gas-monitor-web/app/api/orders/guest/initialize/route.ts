import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/server/prisma';
import { PAYSTACK_BASE, CALLBACK_URL, paystackHeaders } from '@/lib/server/paystack';

export const runtime = 'nodejs';

const guestInitSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120).optional(),
  supplierName: z.string().min(1),
  cylinderSize: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  totalAmount: z.number().positive(),
  deliveryAddress: z.string().min(5)
});

export async function POST(req: Request) {
  const result = guestInitSchema.safeParse(await req.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { email, name, supplierName, cylinderSize, quantity, totalAmount, deliveryAddress } = result.data;

  // Attach the order to an existing account with this email, or create a
  // lightweight guest account (unverified, random password) to own the order.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name?.trim() || 'Guest customer',
        password: await bcrypt.hash(randomUUID(), 10),
        role: 'CONSUMER',
        emailVerified: false
      }
    });
  }

  const order = await prisma.order.create({
    data: {
      consumerId: user.id,
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
        email,
        amount: Math.round(totalAmount * 100), // naira → kobo
        reference,
        callback_url: CALLBACK_URL,
        metadata: {
          orderId: order.id,
          supplierName,
          cylinderSize,
          guestCheckout: true,
          custom_fields: [
            { display_name: 'Order ID', variable_name: 'order_id', value: order.id },
            { display_name: 'Supplier', variable_name: 'supplier_name', value: supplierName },
            { display_name: 'Cylinder Size', variable_name: 'cylinder_size', value: cylinderSize }
          ]
        }
      },
      { headers: paystackHeaders() }
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { paystackRef: ps.data.reference }
    });

    return NextResponse.json({
      orderId: order.id,
      reference: ps.data.reference,
      authorizationUrl: ps.data.authorization_url,
      amount: totalAmount,
      email
    });
  } catch (err: any) {
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    const msg = err?.response?.data?.message ?? 'Payment initialization failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
