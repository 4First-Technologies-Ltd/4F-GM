import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { getMonitorTerms } from '../lib/pricing';
import { publicImageUrl } from '../lib/storage';

/**
 * Public, unauthenticated marketplace feed. Only listings from vendors who
 * signed up, were approved by an admin and are not suspended are exposed —
 * the moment a vendor is rejected or suspended their listings drop out.
 */
const router = Router();

const publicWhere: Prisma.GasListingWhereInput = {
  vendor: { status: 'APPROVED', user: { isSuspended: false } },
  // Listings on a closed or suspended branch drop out; pre-branch rows (null) stay visible.
  OR: [{ branchId: null }, { branch: { isActive: true, suspendedAt: null } }]
};

// Explicit select: never leak plan, commission or account details publicly.
/** Stored keys become URLs; the raw key is not part of the public shape. */
function toPublic<T extends { imageKey: string | null; vendor: { logoUrl: string | null } }>({ imageKey, ...listing }: T) {
  return { ...listing, imageUrl: publicImageUrl(imageKey), vendor: { ...listing.vendor, logoUrl: publicImageUrl(listing.vendor.logoUrl) } };
}

const publicSelect = {
  id: true,
  gasType: true,
  customName: true,
  pricePerKg: true,
  cylinderSizes: true,
  otherSizes: true,
  inStock: true,
  imageKey: true,
  createdAt: true,
  updatedAt: true,
  branch: {
    select: {
      id: true,
      name: true,
      isMain: true,
      address: true,
      state: true,
      city: true,
      lat: true,
      lng: true,
      phone: true
    }
  },
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
    return res.json({ listings: listings.map(toPublic) });
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
    return res.json({ listing: toPublic(listing) });
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
