import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

/**
 * Order routes are only for approved riders. Profile routes stay open to any
 * rider (a new rider has to create their profile before they can be approved).
 * Sends the error response itself and returns null when the rider may not proceed.
 */
async function loadApprovedRider(req: Request, res: Response) {
  const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub } });
  if (!profile) {
    res.status(404).json({ error: 'Rider profile not found' });
    return null;
  }
  if (profile.status !== 'APPROVED') {
    res.status(403).json({ error: 'Your rider account has not been approved yet', code: 'RIDER_NOT_APPROVED' });
    return null;
  }
  return profile;
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: req.user!.sub }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    return res.json({ profile });
  })
);

const profileSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  vehicleType: z.string().trim().min(1).max(40).optional(),
  plateNumber: z.string().trim().min(1).max(20).optional(),
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

    const profile = await prisma.riderProfile.upsert({
      where: { userId: req.user!.sub },
      create: { userId: req.user!.sub, ...result.data },
      update: result.data
    });

    return res.status(201).json({ profile });
  })
);

const patchSchema = profileSchema.partial();

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    const profile = await prisma.riderProfile.update({
      where: { userId: req.user!.sub },
      data: result.data
    });

    return res.json({ profile });
  })
);

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadApprovedRider(req, res);
    if (!profile) return;

    const orders = await prisma.order.findMany({
      where: { riderId: profile.id },
      include: {
        consumer: { select: { id: true, name: true, email: true, phone: true } },
        vendor: { select: { id: true, businessName: true, businessAddress: true, phone: true } }
      },
      orderBy: { assignedAt: 'desc' }
    });

    return res.json({ orders });
  })
);

// A rider only ever moves an order forward through its own leg of the
// journey — never back to PENDING/CONFIRMED (that's the vendor/payment
// side) and never CANCELLED (that stays a vendor/consumer decision).
const orderStatusSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED'])
});

// The one status each target may be reached from: CONFIRMED (paid) →
// OUT_FOR_DELIVERY → DELIVERED. Anything else — an unpaid PENDING order, a
// CANCELLED one, skipping a step, or repeating one — is rejected.
const REQUIRED_CURRENT_STATUS = {
  OUT_FOR_DELIVERY: 'CONFIRMED',
  DELIVERED: 'OUT_FOR_DELIVERY'
} as const;

router.patch(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = orderStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;

    const profile = await loadApprovedRider(req, res);
    if (!profile) return;

    const target = result.data.status;

    // Compare-and-set in one statement so two quick taps (or a vendor changing
    // the status at the same moment) can't both apply.
    const { count } = await prisma.order.updateMany({
      where: { id, riderId: profile.id, status: REQUIRED_CURRENT_STATUS[target] },
      data: { status: target }
    });

    if (count === 0) {
      const existing = await prisma.order.findFirst({
        where: { id, riderId: profile.id },
        select: { status: true }
      });
      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(409).json({
        error: `This order can't be marked ${target.toLowerCase().replace(/_/g, ' ')} while it is ${existing.status
          .toLowerCase()
          .replace(/_/g, ' ')}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    return res.json({ order });
  })
);

export default router;
