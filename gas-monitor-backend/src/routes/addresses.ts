import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.sub },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });

    return res.json({ addresses });
  })
);

const createSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  fullAddress: z.string().min(1, 'Address is required'),
  isDefault: z.boolean().optional()
});

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    if (result.data.isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user!.sub }, data: { isDefault: false } });
    }

    const address = await prisma.address.create({
      data: { userId: req.user!.sub, ...result.data }
    });

    return res.status(201).json({ address });
  })
);

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  fullAddress: z.string().min(1).optional(),
  isDefault: z.boolean().optional()
});

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.sub) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (result.data.isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user!.sub }, data: { isDefault: false } });
    }

    const address = await prisma.address.update({ where: { id }, data: result.data });
    return res.json({ address });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.sub) {
      return res.status(404).json({ error: 'Address not found' });
    }

    await prisma.address.delete({ where: { id } });
    return res.json({ ok: true });
  })
);

export default router;
