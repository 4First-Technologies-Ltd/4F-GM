import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);

// ── POST /vendor/profile ──────────────────────────────────────────────────────

const profileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  businessAddress: z.string().min(1, 'Business address is required'),
  phone: z.string().min(1, 'Phone number is required'),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = profileSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.vendorProfile.upsert({
    where: { userId: req.user!.sub },
    create: { userId: req.user!.sub, ...result.data },
    update: result.data,
  });

  res.status(201).json({ profile });
});

// ── GET /vendor/me ────────────────────────────────────────────────────────────

router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: req.user!.sub },
    include: { documents: true, listings: true },
  });

  if (!profile) {
    res.status(404).json({ error: 'Vendor profile not found' });
    return;
  }

  res.json({ profile });
});

// ── POST /vendor/documents ────────────────────────────────────────────────────

const documentSchema = z.object({
  documents: z.array(z.object({
    url: z.string().min(1),
    fileName: z.string().min(1),
  })).min(1),
});

router.post('/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = documentSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) {
    res.status(404).json({ error: 'Vendor profile not found. Create profile first.' });
    return;
  }

  const count = await prisma.vendorDocument.createMany({
    data: result.data.documents.map((d) => ({ vendorId: profile.id, ...d })),
  });

  res.status(201).json({ count: count.count });
});

// ── GET /vendor/listings ──────────────────────────────────────────────────────

router.get('/listings', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  const listings = await prisma.gasListing.findMany({
    where: { vendorId: profile.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ listings });
});

// ── POST /vendor/listings ─────────────────────────────────────────────────────

const listingSchema = z.object({
  gasType: z.enum(['COOKING', 'MEDICAL', 'INDUSTRIAL', 'BULK', 'OTHER']),
  customName: z.string().optional(),
  pricePerKg: z.number().positive('Price per kg must be positive'),
  cylinderSizes: z.array(z.string()).min(1, 'Select at least one cylinder size'),
  otherSizes: z.string().optional(),
  inStock: z.boolean().optional().default(true),
});

router.post('/listings', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = listingSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  if (profile.status !== 'APPROVED') {
    res.status(403).json({ error: 'Vendor account must be approved to create listings' });
    return;
  }

  const listing = await prisma.gasListing.create({
    data: { ...result.data, vendorId: profile.id },
  });

  res.status(201).json({ listing });
});

// ── PATCH /vendor/listings/:id ────────────────────────────────────────────────

router.patch('/listings/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = listingSchema.partial().safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  const exists = await prisma.gasListing.findFirst({ where: { id: req.params.id, vendorId: profile.id } });
  if (!exists) { res.status(404).json({ error: 'Listing not found' }); return; }

  const listing = await prisma.gasListing.update({
    where: { id: req.params.id },
    data: result.data,
  });

  res.json({ listing });
});

// ── DELETE /vendor/listings/:id ───────────────────────────────────────────────

router.delete('/listings/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  const exists = await prisma.gasListing.findFirst({ where: { id: req.params.id, vendorId: profile.id } });
  if (!exists) { res.status(404).json({ error: 'Listing not found' }); return; }

  await prisma.gasListing.delete({ where: { id: req.params.id } });
  res.json({ message: 'Listing deleted' });
});

// ── GET /vendor/orders ────────────────────────────────────────────────────────

router.get('/orders', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  const orders = await prisma.order.findMany({
    where: { vendorId: profile.id },
    include: {
      consumer: { select: { id: true, name: true, email: true } },
      listing: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ orders });
});

// ── PATCH /vendor/orders/:id ──────────────────────────────────────────────────

const orderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DELIVERED', 'CANCELLED']),
});

router.patch('/orders/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = orderStatusSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) { res.status(404).json({ error: 'Vendor profile not found' }); return; }

  const exists = await prisma.order.findFirst({ where: { id: req.params.id, vendorId: profile.id } });
  if (!exists) { res.status(404).json({ error: 'Order not found' }); return; }

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: result.data.status },
  });

  res.json({ order });
});

export default router;
