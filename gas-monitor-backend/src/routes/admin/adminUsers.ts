import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireOperations, requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

const SORTABLE = ['createdAt', 'name', 'email', 'role'] as const;

const SELECT = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

// Operations may view the list; every write below stays super admin only.
router.get(
  '/',
  requireOperations,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const role = req.query.role;
    const active = req.query.active;

    const where: Prisma.AdminUserWhereInput = {};
    if (role === 'SUPER_ADMIN' || role === 'OPERATIONS' || role === 'SUPPORT') {
      where.role = role;
    }
    if (active === 'true' || active === 'false') {
      where.isActive = active === 'true';
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [adminUsers, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        select: SELECT,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.adminUser.count({ where })
    ]);

    return res.json(paginated(adminUsers, total, query));
  })
);

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS', 'SUPPORT'])
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
      data: { name: result.data.name, email, passwordHash, role: result.data.role, mustChangePassword: true },
      select: SELECT
    });

    await writeAuditLog(req, {
      action: 'ADMIN_CREATED',
      resource: 'admin',
      resourceId: adminUser.id,
      summary: `Created ${result.data.role} admin ${adminUser.name} (${adminUser.email})`,
      metadata: { role: result.data.role, email: adminUser.email }
    });

    return res.status(201).json({ adminUser });
  })
);

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS', 'SUPPORT']).optional()
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

    // Deactivating yourself locks you out of the panel on next login.
    if (req.admin?.adminId === id && result.data.isActive === false) {
      return res.status(409).json({ error: 'You cannot deactivate your own admin account' });
    }

    const roleChanging = result.data.role !== undefined && result.data.role !== existing.role;

    // Self-demotion is how a sole super admin locks everyone out of admin
    // management; a different super admin has to do it.
    if (roleChanging && req.admin?.adminId === id) {
      return res.status(409).json({ error: 'You cannot change your own role' });
    }

    if (roleChanging && existing.role === 'SUPER_ADMIN') {
      const remaining = await prisma.adminUser.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } }
      });
      if (remaining === 0) {
        return res.status(409).json({ error: 'Cannot demote the last active super admin' });
      }
    }

    if (existing.role === 'SUPER_ADMIN' && result.data.isActive === false) {
      const remaining = await prisma.adminUser.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } }
      });
      if (remaining === 0) {
        return res.status(409).json({ error: 'Cannot deactivate the last active super admin' });
      }
    }

    const data: {
      isActive?: boolean;
      role?: 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';
      passwordHash?: string;
      mustChangePassword?: boolean;
      tokenVersion?: { increment: number };
    } = {};
    if (result.data.isActive !== undefined) data.isActive = result.data.isActive;
    if (roleChanging) data.role = result.data.role;
    if (result.data.password) {
      data.passwordHash = await bcrypt.hash(result.data.password, 10);
      // A reset password is known to the resetter: force the owner to replace it,
      // and sign out whoever may still hold a session under the old one.
      data.mustChangePassword = true;
      data.tokenVersion = { increment: 1 };
    }

    const adminUser = await prisma.adminUser.update({ where: { id }, data, select: SELECT });

    if (result.data.isActive !== undefined && result.data.isActive !== existing.isActive) {
      await writeAuditLog(req, {
        action: 'ADMIN_DEACTIVATED',
        resource: 'admin',
        resourceId: id,
        summary: `${existing.name} (${existing.email}) ${result.data.isActive ? 'reactivated' : 'deactivated'}`,
        metadata: { email: existing.email, isActive: result.data.isActive }
      });
    }
    if (roleChanging) {
      await writeAuditLog(req, {
        action: 'ADMIN_UPDATED',
        resource: 'admin',
        resourceId: id,
        summary: `Role changed for ${existing.name} (${existing.email}): ${existing.role} → ${result.data.role}`,
        metadata: { email: existing.email, fields: ['role'], from: existing.role, to: result.data.role }
      });
    }
    if (result.data.password) {
      await writeAuditLog(req, {
        action: 'ADMIN_UPDATED',
        resource: 'admin',
        resourceId: id,
        // Records THAT the password changed, never any form of the value.
        summary: `Password reset for ${existing.name} (${existing.email})`,
        metadata: { email: existing.email, fields: ['password'] }
      });
    }

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

    if (req.admin?.adminId === id) {
      return res.status(409).json({ error: 'You cannot delete your own admin account' });
    }

    if (existing.role === 'SUPER_ADMIN') {
      const remaining = await prisma.adminUser.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } }
      });
      if (remaining === 0) {
        return res.status(409).json({ error: 'Cannot delete the last active super admin' });
      }
    }

    await prisma.adminUser.delete({ where: { id } });

    await writeAuditLog(req, {
      action: 'ADMIN_DELETED',
      resource: 'admin',
      resourceId: id,
      summary: `Deleted ${existing.role} admin ${existing.name} (${existing.email})`,
      metadata: { email: existing.email, role: existing.role }
    });

    return res.json({ ok: true });
  })
);

export default router;
