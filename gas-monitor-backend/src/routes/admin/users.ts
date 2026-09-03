import { Router } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

const SORTABLE = ['createdAt', 'name', 'email'] as const;

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  emailVerified: true,
  isSuspended: true,
  createdAt: true,
  vendorProfile: { select: { id: true, status: true, businessName: true } },
  _count: { select: { orders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const role = req.query.role;
    const suspended = req.query.suspended;
    const verified = req.query.verified;

    const where: Prisma.UserWhereInput = {};
    if (typeof role === 'string' && role in Role) {
      where.role = role as Role;
    }
    if (suspended === 'true' || suspended === 'false') {
      where.isSuspended = suspended === 'true';
    }
    if (verified === 'true' || verified === 'false') {
      where.emailVerified = verified === 'true';
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: LIST_SELECT,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.user.count({ where })
    ]);

    return res.json(paginated(users, total, query));
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
  requireOperations,
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

    await writeAuditLog(req, {
      action: 'USER_CREATED',
      resource: 'user',
      resourceId: user.id,
      summary: `Created ${result.data.role.toLowerCase()} ${user.name} (${user.email})`,
      metadata: { role: result.data.role, email: user.email }
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
  requireOperations,
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

    // Suspension is the consequential change here, so it gets its own action
    // rather than being buried inside a generic "updated" entry.
    if (result.data.isSuspended !== undefined && result.data.isSuspended !== existing.isSuspended) {
      await writeAuditLog(req, {
        action: result.data.isSuspended ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED',
        resource: 'user',
        resourceId: id,
        summary: `${existing.name} (${existing.email}) ${result.data.isSuspended ? 'suspended' : 'reinstated'}`,
        metadata: { email: existing.email }
      });
    } else {
      const changed = Object.keys(rest).concat(password ? ['password'] : [], email ? ['email'] : []);
      await writeAuditLog(req, {
        action: 'USER_UPDATED',
        resource: 'user',
        resourceId: id,
        summary: `Updated ${existing.name} (${existing.email}): ${changed.join(', ') || 'no fields'}`,
        // Never record the password itself, hashed or otherwise — only that it changed.
        metadata: { fields: changed }
      });
    }

    return res.json({ user });
  })
);

router.delete(
  '/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
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

    await writeAuditLog(req, {
      action: 'USER_DELETED',
      resource: 'user',
      resourceId: id,
      summary: `Deleted ${existing.role.toLowerCase()} ${existing.name} (${existing.email})`,
      metadata: { email: existing.email, role: existing.role }
    });

    return res.json({ ok: true });
  })
);

export default router;
