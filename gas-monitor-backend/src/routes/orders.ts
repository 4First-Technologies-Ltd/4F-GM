import { Router, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { CALLBACK_URL } from '../lib/paystack';
import { planVendorSplit } from '../lib/settlement';
import {
  GatewayError,
  defaultGateway,
  enabledGateways,
  getGateway,
  resolveGateway,
  type PaymentGateway,
  type StartedPayment
} from '../lib/gateways';
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
        vendor: { select: { businessName: true, businessAddress: true } },
        rider: { select: { phone: true, user: { select: { name: true } } } }
      }
    });
    return res.json({ orders });
  })
);

// Public: checkout shows a picker only when more than one gateway is enabled.
// Declared before '/:id' so it is not read as an order id.
router.get('/payment-providers', (_req, res) => {
  return res.json({
    default: defaultGateway().id,
    providers: enabledGateways().map((g) => ({ id: g.id, label: g.label }))
  });
});

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, consumerId: req.user!.sub },
      include: {
        vendor: { select: { businessName: true, businessAddress: true } },
        rider: { select: { phone: true, user: { select: { name: true } } } }
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
  /** With cylinderSize "Loose": how much gas, by weight (kg) or by money (naira). Exactly one. */
  looseKg: z.number().positive().optional(),
  looseAmount: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY, `You can order at most ${MAX_ORDER_QUANTITY} at a time`),
  deliveryAddress: z.string().min(5),
  /** The gateway the customer chose (see GET /payment-providers). Omitted by older clients: the default is used. */
  paymentProvider: z.string().optional()
};

type OrderItem = z.infer<z.ZodObject<typeof orderItemShape>>;

function checkOrderItem(item: OrderItem, ctx: z.RefinementCtx) {
  if (item.listingId && item.product) {
    ctx.addIssue({ code: 'custom', message: 'Order either a listing or a product, not both' });
  } else if (!item.listingId && !item.product) {
    // Client-priced orders let a modified app pay any amount it likes. Kept only
    // as an explicit, temporary escape hatch for old builds.
    if (process.env.ALLOW_CLIENT_PRICED_ORDERS !== 'true') {
      ctx.addIssue({ code: 'custom', message: 'Please update the app to place orders' });
    } else if (!item.supplierName || item.totalAmount == null) {
      ctx.addIssue({ code: 'custom', message: 'supplierName and totalAmount are required' });
    }
  }
}

async function priceOrder(item: OrderItem): Promise<PricedOrder> {
  if (item.listingId) {
    return priceListingOrder(item.listingId, item.cylinderSize, item.quantity, { kg: item.looseKg, amount: item.looseAmount });
  }
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

/**
 * Moves a paid order PENDING → CONFIRMED. Only a PENDING order moves (a later
 * verify call can no longer drag a delivered or cancelled order backwards).
 */
async function confirmOrder(orderId: string) {
  await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'CONFIRMED', paystackStatus: 'success' }
  });
  return prisma.order.findUnique({ where: { id: orderId } });
}

type PaymentOutcome = { code: number; body: Record<string, unknown> };

/**
 * Checks the order's payment with the gateway it was started on and confirms
 * it. The amount collected must match the order, and a signed-in caller may
 * only confirm their own order.
 */
async function verifyOrderPayment(reference: string, consumerId?: string): Promise<PaymentOutcome> {
  const order = await prisma.order.findFirst({ where: { paystackRef: reference, ...(consumerId ? { consumerId } : {}) } });
  if (!order) return { code: 404, body: { error: 'Order not found or amount mismatch' } };

  // Always the gateway the order was started on, even if it is no longer enabled.
  const gateway = getGateway(order.paymentProvider);
  if (!gateway) return { code: 502, body: { error: 'Verification failed' } };

  try {
    const result = await gateway.verify(reference, order.totalAmount);
    if (result.state === 'amount_mismatch') {
      return { code: 404, body: { error: 'Order not found or amount mismatch' } };
    }
    if (result.state !== 'paid') {
      // Not an error until the payment is final: the customer may still be paying.
      return {
        code: 400,
        body: { error: 'Payment was not successful', paystackStatus: result.status ?? result.state }
      };
    }
  } catch (err) {
    return { code: 502, body: { error: err instanceof GatewayError ? err.message : 'Verification failed' } };
  }

  const confirmed = await confirmOrder(order.id);
  return { code: 200, body: { success: true, orderId: order.id, status: confirmed?.status } };
}

/**
 * Opens a payment for a freshly created order on the chosen gateway and stores
 * the reference and gateway id on the order. Throws with a message fit to show.
 */
async function startOrderPayment(
  gateway: PaymentGateway,
  order: { id: string; totalAmount: number; deliveryFee: number; vendorId: string | null },
  customer: { email: string; name: string },
  meta: { supplierName: string; cylinderSize: string; guestCheckout?: boolean }
): Promise<StartedPayment> {
  const input = {
    reference: `4FG-${order.id}`,
    amountNaira: order.totalAmount,
    customer,
    callbackUrl: CALLBACK_URL,
    meta: { orderId: order.id, ...meta }
  };

  // Pay the vendor at checkout when the gateway can and the vendor has a payout account.
  let plan = await planVendorSplit(gateway, order);
  let started: StartedPayment;
  try {
    started = await gateway.initialize({ ...input, split: plan?.split });
  } catch (err) {
    // A split the gateway refused must not cost us the sale: pay the vendor later instead.
    // (If the gateway never answered, the payment may exist, so that is not retried.)
    if (!plan || !(err instanceof GatewayError) || err.indeterminate) throw err;
    console.error('[orders] split payment refused, retrying without it', { orderId: order.id, gateway: gateway.id, err });
    plan = null;
    started = await gateway.initialize(input);
  }

  // Persist the reference so we can verify later, and whether the vendor is settled by the gateway.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paystackRef: started.reference,
      paymentProvider: gateway.id,
      vendorSettledByGateway: !!plan,
      vendorSplitAmount: plan?.vendorAmount ?? null
    }
  });
  return started;
}

const initSchema = z.object(orderItemShape).superRefine(checkOrderItem);

router.post(
  '/initialize',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = initSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { deliveryAddress } = result.data;

    const gateway = resolveGateway(result.data.paymentProvider);
    if (!gateway) return res.status(400).json({ error: 'That payment method is not available' });

    const priced = await priceOrRespond(result.data, res);
    if (!priced) return;
    const { supplierName, totalAmount, listingId, vendorId, branchId } = priced;
    // The server decides the stored size and quantity for loose-gas orders.
    const cylinderSize = priced.cylinderSize ?? result.data.cylinderSize;
    const quantity = priced.quantity ?? result.data.quantity;

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
        branchId,
        supplierName,
        cylinderSize,
        quantity,
        totalAmount,
        deliveryFee: priced.deliveryFee ?? 0,
        deliveryAddress,
        status: 'PENDING'
      }
    });

    try {
      const started = await startOrderPayment(
        gateway,
        order,
        { email: user.email, name: user.name },
        { supplierName, cylinderSize }
      );
      return res.json({
        orderId: order.id,
        reference: started.reference,
        authorizationUrl: started.authorizationUrl,
        amount: totalAmount,
        email: user.email
      });
    } catch (err: any) {
      // Clean up the pending order if the gateway could not open a payment
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      return res.status(502).json({ error: err?.message ?? 'Payment initialization failed' });
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
    const outcome = await verifyOrderPayment(reference, req.user!.sub);
    return res.status(outcome.code).json(outcome.body);
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
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { email, name, deliveryAddress } = result.data;

    const gateway = resolveGateway(result.data.paymentProvider);
    if (!gateway) return res.status(400).json({ error: 'That payment method is not available' });

    const priced = await priceOrRespond(result.data, res);
    if (!priced) return;
    const { supplierName, totalAmount, listingId, vendorId, branchId } = priced;
    const cylinderSize = priced.cylinderSize ?? result.data.cylinderSize;
    const quantity = priced.quantity ?? result.data.quantity;

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
        branchId,
        supplierName,
        cylinderSize,
        quantity,
        totalAmount,
        deliveryFee: priced.deliveryFee ?? 0,
        deliveryAddress,
        status: 'PENDING'
      }
    });

    try {
      const started = await startOrderPayment(
        gateway,
        order,
        { email, name: user.name },
        { supplierName, cylinderSize, guestCheckout: true }
      );
      return res.json({
        orderId: order.id,
        reference: started.reference,
        authorizationUrl: started.authorizationUrl,
        amount: totalAmount,
        email
      });
    } catch (err: any) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      return res.status(502).json({ error: err?.message ?? 'Payment initialization failed' });
    }
  })
);

// Unauthenticated verification for guest checkout. Safe because the order is
// only ever moved to the status the gateway itself reports, keyed by a reference
// that is generated server-side and returned to the payer.
router.post(
  '/guest/verify',
  asyncHandler(async (req, res) => {
    const { reference } = (req.body ?? {}) as { reference?: string };
    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }
    const outcome = await verifyOrderPayment(reference);
    return res.status(outcome.code).json(outcome.body);
  })
);

export default router;
