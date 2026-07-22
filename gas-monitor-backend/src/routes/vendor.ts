import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { listingSchema } from '../lib/vendorSchemas';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { documents: true, listings: true }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    return res.json({ profile });
  })
);

const profileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  businessAddress: z.string().min(1, 'Business address is required'),
  phone: z.string().min(1, 'Phone number is required'),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.post(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.vendorProfile.upsert({
      where: { userId: req.user!.sub },
      create: { userId: req.user!.sub, ...result.data },
      update: result.data
    });

    return res.status(201).json({ profile });
  })
);

const patchSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessAddress: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  bio: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const profile = await prisma.vendorProfile.update({
      where: { userId: req.user!.sub },
      data: result.data
    });

    return res.json({ profile });
  })
);

const documentSchema = z.object({
  documents: z
    .array(
      z.object({
        url: z.string().min(1),
        fileName: z.string().min(1)
      })
    )
    .min(1)
});

router.post(
  '/documents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = documentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found. Create profile first.' });
    }

    const count = await prisma.vendorDocument.createMany({
      data: result.data.documents.map((d) => ({ vendorId: profile.id, ...d }))
    });

    return res.status(201).json({ count: count.count });
  })
);

router.get(
  '/listings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const listings = await prisma.gasListing.findMany({
      where: { vendorId: profile.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ listings });
  })
);

router.post(
  '/listings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    if (profile.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Vendor account must be approved to create listings' });
    }

    const listing = await prisma.gasListing.create({
      data: { ...result.data, vendorId: profile.id }
    });

    return res.status(201).json({ listing });
  })
);

router.patch(
  '/listings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = await prisma.gasListing.update({ where: { id }, data: result.data });
    return res.json({ listing });
  })
);

router.delete(
  '/listings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    await prisma.gasListing.delete({ where: { id } });
    return res.json({ message: 'Listing deleted' });
  })
);

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const orders = await prisma.order.findMany({
      where: { vendorId: profile.id },
      include: {
        consumer: { select: { id: true, name: true, email: true } },
        listing: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ orders });
  })
);

const orderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DELIVERED', 'CANCELLED'])
});

router.patch(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = orderStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.order.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await prisma.order.update({ where: { id }, data: { status: result.data.status } });
    return res.json({ order });
  })
);

export default router;
