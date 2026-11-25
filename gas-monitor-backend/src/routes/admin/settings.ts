import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog } from '../../lib/audit';
import { getOrCreateSettings } from '../../lib/settings';
import { MAX_ORDER_QUANTITY } from '../../lib/pricing';
import { VERSION_PATTERN, compareVersions } from '../../lib/appVersion';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await getOrCreateSettings();
    return res.json({ settings });
  })
);

const patchSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  allowVendorSignups: z.boolean().optional(),
  supportEmail: z.string().email().nullable().optional(),
  platformFeePercent: z.number().min(0).max(100).optional(),
  // Rider's share of the flat delivery fee on each delivered order; the platform keeps the rest.
  riderSharePercent: z.number().min(0).max(100).optional(),
  // 4FG Monitor commercial terms — orders are priced from these server-side.
  monitorUnitPrice: z
    .number()
    .int('Monitor price must be whole naira')
    .positive('Monitor price must be above 0')
    .max(10_000_000)
    .optional(),
  monitorDeliveryFee: z
    .number()
    .int('Delivery fee must be whole naira')
    .min(0, 'Delivery fee cannot be negative')
    .max(1_000_000)
    .optional(),
  monitorMinQuantity: z
    .number()
    .int('Minimum order must be a whole number')
    .min(1, 'Minimum order must be at least 1')
    .max(MAX_ORDER_QUANTITY, `Minimum order cannot exceed the ${MAX_ORDER_QUANTITY}-unit order limit`)
    .optional(),
  // Mobile version gate. Below min the app is blocked until updated; below latest it only asks.
  minAppVersion: z.string().trim().regex(VERSION_PATTERN, 'Minimum app version must look like 1.2.0').optional(),
  latestAppVersion: z.string().trim().regex(VERSION_PATTERN, 'Latest app version must look like 1.2.0').optional(),
  storeUrlAndroid: z.string().trim().regex(/^https:\/\/\S+$/, 'Play Store link must be an https link').optional(),
  storeUrlIos: z
    .union([z.literal(''), z.string().trim().regex(/^https:\/\/\S+$/, 'App Store link must be an https link')])
    .optional(),
  // What's new in the latest version, shown in the app's update prompt.
  updateNotes: z.string().trim().max(2000, 'Update notes can be at most 2000 characters').optional(),
  // Where riders collect platform (4FG Monitor) orders.
  platformPickupAddress: z.string().trim().max(300, 'Pickup address can be at most 300 characters').optional(),
  // Dispatch watcher (lib/dispatchWatcher.ts): minutes an order waits before each step.
  dispatchNotifyAfterMin: z.number().int().min(0).max(240).optional(),
  dispatchAssignAfterMin: z.number().int().min(1).max(720).optional(),
  dispatchCancelAfterMin: z.number().int().min(1).max(2880).optional(),
  dispatchRadiusKm: z.number().min(0.5).max(200).optional(),
  dispatchVendorStallMin: z.number().int().min(1).max(1440).optional(),
  dispatchDeliveryStallMin: z.number().int().min(5).max(2880).optional()
});

router.patch(
  '/',
  // Was an inline SUPER_ADMIN||OPERATIONS check; now the shared ranked guard so
  // the rule lives in one place.
  requireOperations,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const before = await getOrCreateSettings();

    const min = result.data.minAppVersion ?? before.minAppVersion;
    const latest = result.data.latestAppVersion ?? before.latestAppVersion;
    if (compareVersions(min, latest) > 0) {
      return res.status(400).json({ error: 'Minimum app version cannot be higher than the latest version.' });
    }
    const notify = result.data.dispatchNotifyAfterMin ?? before.dispatchNotifyAfterMin;
    const assign = result.data.dispatchAssignAfterMin ?? before.dispatchAssignAfterMin;
    const cancel = result.data.dispatchCancelAfterMin ?? before.dispatchCancelAfterMin;
    if (!(notify < assign && assign < cancel)) {
      return res.status(400).json({ error: 'Dispatch steps must come in order: alert riders, then suggest a rider, then suggest cancelling.' });
    }
    const settings = await prisma.platformSettings.update({
      where: { id: 'singleton' },
      data: result.data
    });

    const changed = Object.entries(result.data)
      .filter(([key, value]) => value !== (before as Record<string, unknown>)[key])
      .map(([key, value]) => `${key}: ${String((before as Record<string, unknown>)[key])} → ${String(value)}`);

    if (changed.length) {
      await writeAuditLog(req, {
        action: 'SETTINGS_UPDATED',
        resource: 'settings',
        resourceId: 'singleton',
        summary: `Platform settings changed — ${changed.join('; ')}`,
        metadata: { changes: result.data }
      });
    }

    return res.json({ settings });
  })
);

export default router;
