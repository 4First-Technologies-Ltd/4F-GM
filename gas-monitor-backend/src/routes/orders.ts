import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { PAYSTACK_BASE, CALLBACK_URL, paystackHeaders } from '../lib/paystack';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { consumerId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { businessName: true, businessAddress: true } }
      }
    });
    return res.json({ orders });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, consumerId: req.user!.sub },
      include: {
        vendor: { select: { businessName: true, businessAddress: true } }
      }
    });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json({ order });
  })
);

const initSchema = z.object({
  supplierName: z.string().min(1),
  cylinderSize: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  totalAmount: z.number().positive(),
  deliveryAddress: z.string().min(5)
});

router.post(
  '/initialize',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = initSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { supplierName, cylinderSize, quantity, totalAmount, deliveryAddress } = result.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create order in PENDING state first so we have an ID for the reference
    const order = await prisma.order.create({
      data: {
        consumerId: req.user!.sub,
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

      return res.json({
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
      return res.status(502).json({ error: msg });
    }
  })
);

router.post(
  '/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reference } = (req.body ?? {}) as { reference?: string };
    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }

    try {
      const { data: ps } = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: paystackHeaders()
      });

      if (ps.data.status !== 'success') {
        return res.status(400).json({ error: 'Payment was not successful', paystackStatus: ps.data.status });
      }

      const order = await prisma.order.update({
        where: { paystackRef: reference },
        data: { status: 'CONFIRMED', paystackStatus: ps.data.status }
      });

      return res.json({ success: true, orderId: order.id, status: order.status });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Verification failed';
      return res.status(502).json({ error: msg });
    }
  })
);

const guestInitSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120).optional(),
  supplierName: z.string().min(1),
  cylinderSize: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  totalAmount: z.number().positive(),
  deliveryAddress: z.string().min(5)
});

router.post(
  '/guest/initialize',
  asyncHandler(async (req, res) => {
    const result = guestInitSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
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

      return res.json({
        orderId: order.id,
        reference: ps.data.reference,
        authorizationUrl: ps.data.authorization_url,
        amount: totalAmount,
        email
      });
    } catch (err: any) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      const msg = err?.response?.data?.message ?? 'Payment initialization failed';
      return res.status(502).json({ error: msg });
    }
  })
);

// Unauthenticated verification for guest checkout. Safe because the order is
// only ever moved to the status Paystack itself reports, keyed by a reference
// that is generated server-side and returned to the payer.
router.post(
  '/guest/verify',
  asyncHandler(async (req, res) => {
    const { reference } = (req.body ?? {}) as { reference?: string };
    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }

    try {
      const { data: ps } = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: paystackHeaders()
      });

      if (ps.data.status !== 'success') {
        return res.status(400).json({ error: 'Payment was not successful', paystackStatus: ps.data.status });
      }

      const order = await prisma.order.update({
        where: { paystackRef: reference },
        data: { status: 'CONFIRMED', paystackStatus: ps.data.status }
      });

      return res.json({ success: true, orderId: order.id, status: order.status });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Verification failed';
      return res.status(502).json({ error: msg });
    }
  })
);

export default router;
