import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';

/**
 * Who can run which branch. Read-only for every admin role (`branchStaff.read`):
 * invites are created and revoked by the vendor owner, and an admin who needs to
 * cut someone off suspends the branch or the account instead.
 *
 * `displayStatus` folds expiry into the status so the panel never shows an
 * invite as pending when it can no longer be claimed.
 */
const router = Router();

const SORTABLE = ['createdAt', 'email', 'status'] as const;
const STATUSES = ['ACTIVE', 'INVITED', 'EXPIRED', 'REVOKED'] as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const now = new Date();
    const and: Prisma.BranchStaffWhereInput[] = [];

    const status = req.query.status;
    if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
      if (status === 'EXPIRED') and.push({ status: 'INVITED', expiresAt: { lte: now } });
      else if (status === 'INVITED') and.push({ status: 'INVITED', expiresAt: { gt: now } });
      else and.push({ status: status as 'ACTIVE' | 'REVOKED' });
    }

    const vendorId = req.query.vendorId;
    if (typeof vendorId === 'string' && vendorId) and.push({ branch: { vendorId } });

    if (query.q) {
      and.push({
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { user: { name: { contains: query.q, mode: 'insensitive' } } },
          { branch: { name: { contains: query.q, mode: 'insensitive' } } },
          { branch: { vendor: { businessName: { contains: query.q, mode: 'insensitive' } } } }
        ]
      });
    }
    const where: Prisma.BranchStaffWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      prisma.branchStaff.findMany({
        where,
        select: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, isSuspended: true, emailVerified: true } },
          branch: {
            select: {
              id: true,
              name: true,
              city: true,
              state: true,
              isActive: true,
              suspendedAt: true,
              vendor: { select: { id: true, businessName: true } }
            }
          }
        },
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.branchStaff.count({ where })
    ]);

    const data = rows.map((r) => ({
      ...r,
      displayStatus: r.status === 'INVITED' && r.expiresAt <= now ? 'EXPIRED' : r.status
    }));
    return res.json(paginated(data, total, query));
  })
);

export default router;
