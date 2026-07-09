import { Router, Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { createHmac } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/authenticate.js';

const router = Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';
const PAYSTACK_BASE = 'https://api.paystack.co';
// Intercept-only URL — WebView blocks navigation to it and extracts the reference
const CALLBACK_URL = 'https://4fgmonitor.app.local/payment-callback';

function paystackHeaders() {
  return { Authorization: `Bearer ${PAYSTACK_SECRET}` };
}

// ── POST /api/orders/initialize ───────────────────────────────────────────────

const initSchema = z.object({
  supplierName:    z.string().min(1),
  cylinderSize:    z.string().min(1),
  quantity:        z.number().int().min(1).max(10),
  totalAmount:     z.number().positive(),
  deliveryAddress: z.string().min(5),
});

router.post('/initialize', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const result = initSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { supplierName, cylinderSize, quantity, totalAmount, deliveryAddress } = result.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
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
      status: 'PENDING',
    },
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
            { display_name: 'Order ID',       variable_name: 'order_id',       value: order.id      },
            { display_name: 'Supplier',        variable_name: 'supplier_name',  value: supplierName  },
            { display_name: 'Cylinder Size',   variable_name: 'cylinder_size',  value: cylinderSize  },
          ],
        },
      },
      { headers: paystackHeaders() },
    );

    // Persist the reference so we can verify later
    await prisma.order.update({
      where: { id: order.id },
      data: { paystackRef: ps.data.reference },
    });

    res.json({
      orderId: order.id,
      reference: ps.data.reference,
      authorizationUrl: ps.data.authorization_url,
      amount: totalAmount,
      email: user.email,
    });
  } catch (err: any) {
    // Clean up the pending order if Paystack initialization failed
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    const msg = err?.response?.data?.message ?? 'Payment initialization failed';
    res.status(502).json({ error: msg });
  }
});

// ── POST /api/orders/verify ───────────────────────────────────────────────────

router.post('/verify', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { reference } = req.body as { reference?: string };
  if (!reference) {
    res.status(400).json({ error: 'reference is required' });
    return;
  }

  try {
    const { data: ps } = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: paystackHeaders() },
    );

    if (ps.data.status !== 'success') {
      res.status(400).json({ error: 'Payment was not successful', paystackStatus: ps.data.status });
      return;
    }

    const order = await prisma.order.update({
      where: { paystackRef: reference },
      data: { status: 'CONFIRMED', paystackStatus: ps.data.status },
    });

    res.json({ success: true, orderId: order.id, status: order.status });
  } catch (err: any) {
    const msg = err?.response?.data?.message ?? 'Verification failed';
    res.status(502).json({ error: msg });
  }
});

// ── GET /api/orders ───────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const orders = await prisma.order.findMany({
    where: { consumerId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: { select: { businessName: true, businessAddress: true } },
    },
  });
  res.json({ orders });
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, consumerId: req.user!.sub },
    include: {
      vendor: { select: { businessName: true, businessAddress: true } },
    },
  });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
});

// ── POST /api/orders/webhook ──────────────────────────────────────────────────
// Mount this BEFORE express.json() in index.ts so the raw body is available.

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (signature && rawBody) {
    const hash = createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
    if (hash !== signature) {
      res.status(400).send('Bad signature');
      return;
    }
  }

  const event = req.body as { event: string; data: { reference: string; status: string } };

  if (event.event === 'charge.success') {
    await prisma.order.updateMany({
      where: { paystackRef: event.data.reference, status: 'PENDING' },
      data: { status: 'CONFIRMED', paystackStatus: event.data.status },
    });
  }

  res.status(200).send('OK');
});

export default router;
