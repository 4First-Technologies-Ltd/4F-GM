import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { getMonitorTerms } from '../lib/pricing';

/**
 * Public, unauthenticated marketplace feed. Only listings from vendors who
 * signed up, were approved by an admin and are not suspended are exposed —
 * the moment a vendor is rejected or suspended their listings drop out.
 */
const router = Router();

const publicWhere: Prisma.GasListingWhereInput = {
  vendor: { status: 'APPROVED', user: { isSuspended: false } }
};

// Explicit select: never leak plan, commission or account details publicly.
const publicSelect = {
  id: true,
  gasType: true,
  customName: true,
  pricePerKg: true,
  cylinderSizes: true,
  otherSizes: true,
  inStock: true,
  createdAt: true,
  updatedAt: true,
  vendor: {
    select: {
      id: true,
      businessName: true,
      businessAddress: true,
      state: true,
      city: true,
      bio: true,
      logoUrl: true,
      lat: true,
      lng: true,
      phone: true
    }
  }
} satisfies Prisma.GasListingSelect;

router.get(
  '/listings',
  asyncHandler(async (_req, res) => {
    const listings = await prisma.gasListing.findMany({
      where: publicWhere,
      select: publicSelect,
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ listings });
  })
);

router.get(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const listing = await prisma.gasListing.findFirst({
      where: { ...publicWhere, id: req.params.id },
      select: publicSelect
    });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    return res.json({ listing });
  })
);

// 4FG Monitor terms set in the admin dashboard, for display on the storefront.
// Orders are priced from the same values server-side.
router.get(
  '/monitor',
  asyncHandler(async (_req, res) => {
    return res.json({ monitor: await getMonitorTerms() });
  })
);

export default router;
