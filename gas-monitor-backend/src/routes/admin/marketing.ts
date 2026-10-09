import { Request, Response, Router } from 'express';
import { CampaignStatus, Prisma, RecipientStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations, requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import {
  CampaignError,
  resolveAudience,
  segmentFilterSchema,
  sendTestEmail,
  startCampaign
} from '../../lib/marketing';

/**
 * Marketing email: saved audiences (segments), campaigns, and the suppression
 * list. Reads are open to every admin; creating, editing and SENDING are
 * OPERATIONS. Removing someone from the suppression list (re-subscribing them)
 * is SUPER_ADMIN, because it overrides an opt-out.
 */
const router = Router();

const authorName = (req: Request) => req.admin!.name;

function fail(res: Response, err: unknown) {
  if (err instanceof CampaignError) return res.status(err.status).json({ error: err.message });
  throw err;
}

// ── Overview ────────────────────────────────────────────────────────────────

router.get(
  '/overview',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [campaigns, sending, sent30, failed30, suppressed, segments] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: 'SENDING' } }),
      prisma.campaignRecipient.count({ where: { status: 'SENT', sentAt: { gte: since } } }),
      prisma.campaignRecipient.count({ where: { status: 'FAILED', campaign: { startedAt: { gte: since } } } }),
      prisma.marketingSuppression.count(),
      prisma.segment.count()
    ]);
    return res.json({ campaigns, sending, sent30, failed30, suppressed, segments });
  })
);

// ── Segments ────────────────────────────────────────────────────────────────

router.get(
  '/segments',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const segments = await prisma.segment.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { campaigns: true } } }
    });
    return res.json({ segments });
  })
);

router.post(
  '/segments/preview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = segmentFilterSchema.safeParse(req.body?.filter ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const audience = await resolveAudience(parsed.data);
    return res.json({ count: audience.length, sample: audience.slice(0, 5).map((a) => ({ name: a.name, email: a.email })) });
  })
);

const segmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish(),
  filter: segmentFilterSchema
});

router.post(
  '/segments',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = segmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { filter, description, name } = parsed.data;
    const segment = await prisma.segment.create({
      data: { name, description: description || null, filter: filter as Prisma.InputJsonValue, createdByName: authorName(req) }
    });
    await writeAuditLog(req, { action: 'SEGMENT_CHANGED', resource: 'segment', resourceId: segment.id, summary: `Created segment "${name}"` });
    return res.status(201).json({ segment });
  })
);

router.patch(
  '/segments/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = segmentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const existing = await prisma.segment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Segment not found' });
    const { filter, description, name } = parsed.data;
    const segment = await prisma.segment.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(filter ? { filter: filter as Prisma.InputJsonValue } : {})
      }
    });
    await writeAuditLog(req, { action: 'SEGMENT_CHANGED', resource: 'segment', resourceId: segment.id, summary: `Edited segment "${segment.name}"` });
    return res.json({ segment });
  })
);

router.delete(
  '/segments/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const existing = await prisma.segment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Segment not found' });
    const live = await prisma.campaign.count({ where: { segmentId: existing.id, status: 'SENDING' } });
    if (live) return res.status(409).json({ error: 'A campaign is sending to this segment right now' });
    await prisma.segment.delete({ where: { id: existing.id } });
    await writeAuditLog(req, { action: 'SEGMENT_CHANGED', resource: 'segment', resourceId: existing.id, summary: `Deleted segment "${existing.name}"` });
    return res.json({ ok: true });
  })
);

// ── Suppression list ────────────────────────────────────────────────────────

router.get(
  '/suppressions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.MarketingSuppressionWhereInput = query.q ? { email: { contains: query.q.toLowerCase() } } : {};
    const [data, total] = await Promise.all([
      prisma.marketingSuppression.findMany({
        where,
        orderBy: orderBy(query, ['createdAt', 'email'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.marketingSuppression.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.post(
  '/suppressions',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().toLowerCase().email(), reason: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const row = await prisma.marketingSuppression.upsert({
      where: { email: parsed.data.email },
      create: { email: parsed.data.email, reason: parsed.data.reason || `Added by ${authorName(req)}` },
      update: {}
    });
    await writeAuditLog(req, { action: 'SUPPRESSION_CHANGED', resource: 'suppression', resourceId: row.email, summary: `Suppressed ${row.email}` });
    return res.status(201).json({ suppression: row });
  })
);

router.delete(
  '/suppressions/:email',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const row = await prisma.marketingSuppression.findUnique({ where: { email } });
    if (!row) return res.status(404).json({ error: 'Not on the suppression list' });
    await prisma.marketingSuppression.delete({ where: { email } });
    await writeAuditLog(req, { action: 'SUPPRESSION_CHANGED', resource: 'suppression', resourceId: email, summary: `Removed ${email} from the suppression list` });
    return res.json({ ok: true });
  })
);

// ── Campaigns ───────────────────────────────────────────────────────────────

router.get(
  '/campaigns',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status } = req.query;
    const where: Prisma.CampaignWhereInput = {};
    if (typeof status === 'string' && status in CampaignStatus) where.status = status as CampaignStatus;
    if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { subject: { contains: query.q, mode: 'insensitive' } }];

    const [data, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: { segment: { select: { id: true, name: true } } },
        orderBy: orderBy(query, ['createdAt', 'sentAt', 'name'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.campaign.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.get(
  '/campaigns/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { segment: { select: { id: true, name: true } } }
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const pending = campaign.status === 'DRAFT' ? 0 : await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: 'PENDING' } });
    return res.json({ campaign: { ...campaign, pendingCount: pending } });
  })
);

router.get(
  '/campaigns/:id/recipients',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.CampaignRecipientWhereInput = { campaignId: req.params.id };
    const { status } = req.query;
    if (typeof status === 'string' && status in RecipientStatus) where.status = status as RecipientStatus;
    if (query.q) where.OR = [{ email: { contains: query.q.toLowerCase() } }, { name: { contains: query.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      prisma.campaignRecipient.findMany({ where, orderBy: { email: 'asc' }, skip: query.skip, take: query.take }),
      prisma.campaignRecipient.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(5).max(10000),
  segmentId: z.string().min(1).nullish()
});

async function checkSegment(segmentId: string | null | undefined) {
  if (!segmentId) return true;
  return !!(await prisma.segment.findUnique({ where: { id: segmentId }, select: { id: true } }));
}

router.post(
  '/campaigns',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    if (!(await checkSegment(parsed.data.segmentId))) return res.status(400).json({ error: 'Segment not found' });
    const campaign = await prisma.campaign.create({
      data: { ...parsed.data, segmentId: parsed.data.segmentId ?? null, createdByName: authorName(req) }
    });
    await writeAuditLog(req, { action: 'CAMPAIGN_CREATED', resource: 'campaign', resourceId: campaign.id, summary: `Drafted campaign "${campaign.name}"` });
    return res.status(201).json({ campaign });
  })
);

router.patch(
  '/campaigns/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = campaignSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });
    if (existing.status !== 'DRAFT') return res.status(409).json({ error: 'Only drafts can be edited' });
    if (!(await checkSegment(parsed.data.segmentId))) return res.status(400).json({ error: 'Segment not found' });
    const campaign = await prisma.campaign.update({ where: { id: existing.id }, data: parsed.data });
    await writeAuditLog(req, { action: 'CAMPAIGN_UPDATED', resource: 'campaign', resourceId: campaign.id, summary: `Edited campaign "${campaign.name}"` });
    return res.json({ campaign });
  })
);

router.delete(
  '/campaigns/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });
    if (existing.status === 'SENDING') return res.status(409).json({ error: 'Cancel the send before deleting' });
    await prisma.campaign.delete({ where: { id: existing.id } });
    await writeAuditLog(req, { action: 'CAMPAIGN_UPDATED', resource: 'campaign', resourceId: existing.id, summary: `Deleted campaign "${existing.name}"` });
    return res.json({ ok: true });
  })
);

router.post(
  '/campaigns/:id/test',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ to: z.string().trim().email() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address to send the test to' });
    try {
      await sendTestEmail(req.params.id, parsed.data.to);
      return res.json({ ok: true });
    } catch (err) {
      return fail(res, err);
    }
  })
);

router.post(
  '/campaigns/:id/send',
  requireOperations,
  asyncHandler(async (req, res) => {
    try {
      const { audienceSize } = await startCampaign(req.params.id);
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } });
      await writeAuditLog(req, {
        action: 'CAMPAIGN_SENT',
        resource: 'campaign',
        resourceId: campaign.id,
        summary: `Started sending "${campaign.name}" to ${audienceSize} recipient${audienceSize === 1 ? '' : 's'}`,
        metadata: { audienceSize }
      });
      return res.status(202).json({ campaign });
    } catch (err) {
      return fail(res, err);
    }
  })
);

router.post(
  '/campaigns/:id/cancel',
  requireOperations,
  asyncHandler(async (req, res) => {
    const { count } = await prisma.campaign.updateMany({
      where: { id: req.params.id, status: 'SENDING' },
      data: { status: 'CANCELLED' }
    });
    if (count === 0) return res.status(409).json({ error: 'This campaign is not sending' });
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } });
    await writeAuditLog(req, {
      action: 'CAMPAIGN_CANCELLED',
      resource: 'campaign',
      resourceId: campaign.id,
      summary: `Cancelled "${campaign.name}" after ${campaign.sentCount} sent`
    });
    return res.json({ campaign });
  })
);

export default router;
