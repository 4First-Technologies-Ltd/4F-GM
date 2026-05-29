import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);

const IMAGE_KEYS = ['6kg', '12.5kg', '50kg'] as const;

const createSchema = z.object({
  name: z.string().min(1, 'Profile name is required').max(50),
  sizeKg: z.number().positive('Size must be a positive number'),
  customSizeLabel: z.string().optional(),
  imageKey: z.enum(IMAGE_KEYS).default('12.5kg'),
});

const updateSchema = createSchema.partial();

// GET / — list profiles for the authenticated user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const profiles = await prisma.cylinderProfile.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ profiles });
});

// POST / — create a new cylinder profile
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.cylinderProfile.create({
    data: { userId: req.user!.sub, ...result.data },
  });
  res.status(201).json({ profile });
});

// PATCH /:id — update a profile
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.cylinderProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.sub) {
    res.status(404).json({ error: 'Cylinder profile not found' });
    return;
  }

  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const profile = await prisma.cylinderProfile.update({
    where: { id: req.params.id },
    data: result.data,
  });
  res.json({ profile });
});

// DELETE /:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.cylinderProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.sub) {
    res.status(404).json({ error: 'Cylinder profile not found' });
    return;
  }

  await prisma.cylinderProfile.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// PATCH /:id/activate — make this profile active, deactivate all others
router.patch('/:id/activate', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.cylinderProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user!.sub) {
    res.status(404).json({ error: 'Cylinder profile not found' });
    return;
  }

  await prisma.cylinderProfile.updateMany({
    where: { userId: req.user!.sub },
    data: { isActive: false },
  });

  const profile = await prisma.cylinderProfile.update({
    where: { id: req.params.id },
    data: { isActive: true },
  });
  res.json({ profile });
});

export default router;
