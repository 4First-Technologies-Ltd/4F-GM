import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  isSuspended: true,
  createdAt: true,
  vendorProfile: { select: { status: true } },
  _count: { select: { orders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } }
            ]
          }
        : undefined,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.json({ users });
  })
);

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['CONSUMER', 'VENDOR']),
  phone: z.string().min(1).nullable().optional()
});

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const email = result.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const password = await bcrypt.hash(result.data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: result.data.name,
        email,
        password,
        role: result.data.role,
        phone: result.data.phone ?? null,
        emailVerified: true
      },
      select: LIST_SELECT
    });

    return res.status(201).json({ user });
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        emailVerified: true,
        isSuspended: true,
        pushEnabled: true,
        emailNotifEnabled: true,
        smsAlertsEnabled: true,
        unitPreference: true,
        createdAt: true,
        updatedAt: true,
        vendorProfile: {
          select: {
            id: true,
            businessName: true,
            businessAddress: true,
            phone: true,
            status: true,
            bio: true,
            _count: { select: { listings: true, orders: true, documents: true } }
          }
        },
        addresses: { select: { id: true, label: true, fullAddress: true, isDefault: true } },
        cylinderProfiles: { select: { id: true, name: true, sizeKg: true, isActive: true } },
        orders: {
          select: { id: true, cylinderSize: true, quantity: true, totalAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: { select: { orders: true } }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  })
);

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  password: z.string().min(8).optional()
});

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (result.data.email && result.data.email.toLowerCase() !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: result.data.email.toLowerCase() } });
      if (emailTaken) {
        return res.status(409).json({ error: 'Another user already uses this email' });
      }
    }

    const { password, email, ...rest } = result.data;
    const data: Record<string, unknown> = { ...rest };
    if (email) data.email = email.toLowerCase();
    if (password) data.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        isSuspended: true,
        createdAt: true
      }
    });

    return res.json({ user });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { orders: true } },
        vendorProfile: { select: { _count: { select: { orders: true } } } }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const totalOrders = existing._count.orders + (existing.vendorProfile?._count.orders ?? 0);
    if (totalOrders > 0) {
      return res.status(409).json({ error: 'This user has order history and cannot be deleted. Suspend them instead.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ ok: true });
  })
);

export default router;
