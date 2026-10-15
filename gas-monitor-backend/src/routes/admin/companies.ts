import { Router } from 'express';
import { CompanyStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

/**
 * Logistics companies. Approval is an OPERATIONS decision, like vendors. Rejecting
 * or resetting a company takes its whole fleet off the road at once (riders are
 * assignable only while their company is APPROVED — lib/fleet.ts) and nothing
 * else needs updating.
 */
const router = Router();

const SORTABLE = ['createdAt', 'companyName', 'status'] as const;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, email: true, createdAt: true } },
  _count: { select: { riders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.LogisticsCompanyWhereInput = {};

    const status = req.query.status;
    if (typeof status === 'string' && status in CompanyStatus) where.status = status as CompanyStatus;

    if (query.q) {
      where.OR = [
        { companyName: { contains: query.q, mode: 'insensitive' } },
        { address: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.logisticsCompany.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.logisticsCompany.count({ where })
    ]);
    return res.json(paginated(companies, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const company = await prisma.logisticsCompany.findUnique({
      where: { id: req.params.id },
      include: {
        ...LIST_INCLUDE,
        riders: {
          select: {
            id: true,
            phone: true,
            vehicleType: true,
            plateNumber: true,
            status: true,
            user: { select: { name: true, email: true } }
          },
          orderBy: { createdAt: 'asc' }
        },
        invites: {
          where: { status: 'INVITED' },
          select: { id: true, email: true, expiresAt: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    return res.json({ company });
  })
);

const patchSchema = z.object({ status: z.nativeEnum(CompanyStatus) });

const AUDIT_ACTION = {
  APPROVED: 'COMPANY_APPROVED',
  REJECTED: 'COMPANY_REJECTED',
  PENDING: 'COMPANY_STATUS_RESET'
} as const;

router.patch(
  '/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const company = await prisma.logisticsCompany.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { riders: true } } }
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { status } = result.data;
    const updated = await prisma.logisticsCompany.update({ where: { id: company.id }, data: { status } });

    await writeAuditLog(req, {
      action: AUDIT_ACTION[status],
      resource: 'company',
      resourceId: company.id,
      summary: `${company.companyName}: ${company.status} → ${status}`,
      metadata: { from: company.status, to: status, companyName: company.companyName, riders: company._count.riders }
    });

    return res.json({ company: updated });
  })
);

export default router;
