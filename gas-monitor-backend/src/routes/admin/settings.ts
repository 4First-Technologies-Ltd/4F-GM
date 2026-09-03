import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

async function getOrCreateSettings() {
  return prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });
}

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
  platformFeePercent: z.number().min(0).max(100).optional()
});

router.patch(
  '/',
  // Was an inline SUPER_ADMIN||OPERATIONS check; now the shared ranked guard so
  // the rule lives in one place.
  requireOperations,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const before = await getOrCreateSettings();
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
