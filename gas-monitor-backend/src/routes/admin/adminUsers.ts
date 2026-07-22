import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const adminUsers = await prisma.adminUser.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ adminUsers });
  })
);

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['OPERATIONS', 'SUPPORT'])
});

router.post(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const email = result.data.email.toLowerCase();
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An admin with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(result.data.password, 10);
    const adminUser = await prisma.adminUser.create({
      data: { name: result.data.name, email, passwordHash, role: result.data.role },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
    });

    return res.status(201).json({ adminUser });
  })
);

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional()
});

router.patch(
  '/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.adminUser.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const data: { isActive?: boolean; passwordHash?: string } = {};
    if (result.data.isActive !== undefined) data.isActive = result.data.isActive;
    if (result.data.password) data.passwordHash = await bcrypt.hash(result.data.password, 10);

    const adminUser = await prisma.adminUser.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
    });

    return res.json({ adminUser });
  })
);

router.delete(
  '/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.adminUser.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    await prisma.adminUser.delete({ where: { id } });
    return res.json({ ok: true });
  })
);

export default router;
