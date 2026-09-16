import { Router, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { PAYSTACK_BASE, CALLBACK_URL, paystackHeaders } from '../lib/paystack';
import { asyncHandler } from '../lib/asyncHandler';
import {
  MAX_ORDER_QUANTITY,
  PLATFORM_PRODUCTS,
  PricingError,
  priceListingOrder,
  pricePlatformOrder,
  type PlatformProduct,
  type PricedOrder
} from '../lib/pricing';

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

/**
 * What is being bought. Marketplace listings (`listingId`) and platform
 * products (`product`) are priced on the server and any client total is
 * ignored. Orders with neither come from older clients (the mobile app's
 * built-in supplier list) and still carry their own name and total.
 */
const orderItemShape = {
  listingId: z.string().uuid().optional(),
  product: z.enum(Object.keys(PLATFORM_PRODUCTS) as [PlatformProduct, ...PlatformProduct[]]).optional(),
  supplierName: z.string().min(1).optional(),
  totalAmount: z.number().positive().optional(),
  cylinderSize: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY, `You can order at most ${MAX_ORDER_QUANTITY} at a time`),
  deliveryAddress: z.string().min(5)
};

type OrderItem = z.infer<z.ZodObject<typeof orderItemShape>>;

function checkOrderItem(item: OrderItem, ctx: z.RefinementCtx) {
  if (item.listingId && item.product) {
    ctx.addIssue({ code: 'custom', message: 'Order either a listing or a product, not both' });
  } else if (!item.listingId && !item.product && (!item.supplierName || item.totalAmount == null)) {
    ctx.addIssue({ code: 'custom', message: 'supplierName and totalAmount are required' });
  }
}

async function priceOrder(item: OrderItem): Promise<PricedOrder> {
  if (item.listingId) return priceListingOrder(item.listingId, item.cylinderSize, item.quantity);
  if (item.product) return pricePlatformOrder(item.product, item.cylinderSize, item.quantity);
  return { supplierName: item.supplierName!, unitPrice: 0, totalAmount: item.totalAmount! };
}

/** Prices the order, or answers the request with the pricing error. */
async function priceOrRespond(item: OrderItem, res: Response): Promise<PricedOrder | null> {
  try {
    return await priceOrder(item);
  } catch (err) {
    if (err instanceof PricingError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

const initSchema = z.object(orderItemShape).superRefine(checkOrderItem);

router.post(
  '/initialize',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = initSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { cylinderSize, quantity, deliveryAddress } = result.data;

    const priced = await priceOrRespond(result.data, res);
    if (!priced) return;
    const { supplierName, totalAmount, listingId, vendorId } = priced;

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create order in PENDING state first so we have an ID for the reference
    const order = await prisma.order.create({
      data: {
        consumerId: req.user!.sub,
        listingId,
        vendorId,
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

const guestInitSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(2).max(120).optional(),
    ...orderItemShape
  })
  .superRefine(checkOrderItem);

router.post(
  '/guest/initialize',
  asyncHandler(async (req, res) => {
    const result = guestInitSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email, name, cylinderSize, quantity, deliveryAddress } = result.data;

    const priced = await priceOrRespond(result.data, res);
    if (!priced) return;
    const { supplierName, totalAmount, listingId, vendorId } = priced;

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
        listingId,
        vendorId,
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
