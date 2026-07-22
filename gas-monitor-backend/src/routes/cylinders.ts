import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { createCylinderSchema, updateCylinderSchema } from '../lib/cylinderSchemas';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profiles = await prisma.cylinderProfile.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'asc' }
    });
    return res.json({ profiles });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = createCylinderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.cylinderProfile.create({
      data: { userId: req.user!.sub, ...result.data }
    });
    return res.status(201).json({ profile });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.sub) {
      return res.status(404).json({ error: 'Cylinder profile not found' });
    }

    const result = updateCylinderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.cylinderProfile.update({ where: { id }, data: result.data });
    return res.json({ profile });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.sub) {
      return res.status(404).json({ error: 'Cylinder profile not found' });
    }

    await prisma.cylinderProfile.delete({ where: { id } });
    return res.json({ success: true });
  })
);

router.patch(
  '/:id/activate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.cylinderProfile.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.sub) {
      return res.status(404).json({ error: 'Cylinder profile not found' });
    }

    const [, profile] = await prisma.$transaction([
      prisma.cylinderProfile.updateMany({ where: { userId: req.user!.sub }, data: { isActive: false } }),
      prisma.cylinderProfile.update({ where: { id }, data: { isActive: true } })
    ]);

    return res.json({ profile });
  })
);

export default router;
