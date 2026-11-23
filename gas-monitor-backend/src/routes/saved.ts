import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { publicSelect, publicWhere, toPublic } from './marketplace';

/**
 * Saved items at /api/saved: marketplace listings a signed-in user saved to come back to.
 *
 * Everything is scoped to the caller (`req.user.sub`); a listing id from the client is only
 * ever used to look one listing up. Saving reuses the marketplace's own visibility rules
 * (`publicWhere`), so a listing from a rejected or suspended vendor, or on a closed branch,
 * cannot be saved and drops out of the saved list. The row is kept, so the listing comes
 * back if the vendor is reinstated.
 */
const router = Router();
router.use(requireAuth);

/** Per-user cap, so the list stays a shortlist and a script cannot grow the table without bound. */
export const MAX_SAVED = 200;

// Just the ids, so a card or listing page can show "saved" without loading the list.
router.get(
  '/ids',
  asyncHandler(async (req, res) => {
    const rows = await prisma.savedListing.findMany({
      where: { userId: req.user!.sub, listing: publicWhere },
      select: { listingId: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_SAVED
    });
    return res.json({ ids: rows.map((r) => r.listingId) });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.savedListing.findMany({
      where: { userId: req.user!.sub, listing: publicWhere },
      select: { createdAt: true, listing: { select: publicSelect } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SAVED
    });
    return res.json({ listings: rows.map((r) => ({ ...toPublic(r.listing), savedAt: r.createdAt })) });
  })
);

// Idempotent: saving something already saved succeeds and changes nothing.
router.put(
  '/:listingId',
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const listingId = req.params.listingId;

    const listing = await prisma.gasListing.findFirst({ where: { ...publicWhere, id: listingId }, select: { id: true } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const already = await prisma.savedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { listingId: true }
    });
    if (!already) {
      if ((await prisma.savedListing.count({ where: { userId } })) >= MAX_SAVED) {
        return res.status(409).json({
          error: `You can save up to ${MAX_SAVED} items. Remove one to save another.`,
          code: 'SAVED_LIMIT'
        });
      }
      // upsert, not create: two taps at once must not fail on the primary key.
      await prisma.savedListing.upsert({
        where: { userId_listingId: { userId, listingId } },
        create: { userId, listingId },
        update: {}
      });
    }
    return res.json({ saved: true });
  })
);

// Idempotent: removing something that is not saved succeeds.
router.delete(
  '/:listingId',
  asyncHandler(async (req, res) => {
    await prisma.savedListing.deleteMany({ where: { userId: req.user!.sub, listingId: req.params.listingId } });
    return res.json({ saved: false });
  })
);

export default router;
