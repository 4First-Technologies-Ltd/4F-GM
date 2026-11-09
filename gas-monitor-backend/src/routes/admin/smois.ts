import { Router } from 'express';
import { Prisma, SmosContentStatus, SmosTaskStatus } from '@prisma/client';
import { z } from 'zod';
import { requireSmois } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { assignedAccountIds, actor, canWorkOnAccount, endOfDay, isManagement, logActivity, parseDay } from '../../lib/smoisCore';
import { smosCan } from '../../lib/smois';

/**
 * SMOIS operations: accounts and who works on them, content and its approval
 * workflow, publication records, tasks, and the activity trail. Insights
 * (metrics, KPIs, performance, reports) live in smoisInsights.ts.
 *
 * Nothing here talks to a social platform. Publication and metrics are entered
 * by people and labelled as such; see CLAUDE.md "Social media operations".
 */
const router = Router();

const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS'] as const;

// ── Team ────────────────────────────────────────────────────────────────────

router.get(
  '/team',
  requireSmois('smois.read'),
  asyncHandler(async (_req, res) => {
    const admins = await prisma.adminUser.findMany({
      where: { isActive: true, OR: [{ smosRole: { not: null } }, { role: { in: ['SUPER_ADMIN', 'OPERATIONS'] } }] },
      select: { id: true, name: true, role: true, smosRole: true },
      orderBy: { name: 'asc' }
    });
    return res.json({ data: admins });
  })
);

// ── Accounts ────────────────────────────────────────────────────────────────

const accountSchema = z.object({
  platform: z.enum(PLATFORMS),
  name: z.string().trim().min(2).max(120),
  handle: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  accountType: z.enum(['BUSINESS', 'CREATOR', 'PERSONAL']).default('BUSINESS'),
  description: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

const currentAssignments = () => ({
  where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
  orderBy: [{ isPrimary: 'desc' as const }, { startsAt: 'asc' as const }]
});

router.get(
  '/accounts',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SocialAccountWhereInput = {};
    if (typeof req.query.platform === 'string' && (PLATFORMS as readonly string[]).includes(req.query.platform)) {
      where.platform = req.query.platform as (typeof PLATFORMS)[number];
    }
    if (req.query.active === 'false') where.isActive = false;
    else if (req.query.active !== 'all') where.isActive = true;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { handle: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.socialAccount.findMany({
        where,
        orderBy: orderBy(query, ['name', 'platform', 'createdAt'] as const, 'name'),
        skip: query.skip,
        take: query.take,
        include: { assignments: currentAssignments() }
      }),
      prisma.socialAccount.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

router.post(
  '/accounts',
  requireSmois('smois.accounts'),
  asyncHandler(async (req, res) => {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const a = actor(req);
    try {
      const account = await prisma.socialAccount.create({
        data: { ...parsed.data, createdById: a.id, createdByName: a.name }
      });
      await logActivity(req, 'account', account.id, `Registered ${account.platform} account ${account.name}`);
      return res.status(201).json({ account });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return res.status(409).json({ error: 'That handle is already registered on this platform' });
      }
      throw e;
    }
  })
);

router.patch(
  '/accounts/:id',
  requireSmois('smois.accounts'),
  asyncHandler(async (req, res) => {
    const parsed = accountSchema
      .partial()
      .extend({ isActive: z.boolean().optional(), connection: z.enum(['MANUAL', 'CONNECTED', 'EXPIRED', 'DISCONNECTED']).optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Account not found' });
    const account = await prisma.socialAccount.update({ where: { id: existing.id }, data: parsed.data });
    await logActivity(req, 'account', account.id, `Updated account ${account.name}`, { fields: Object.keys(parsed.data) });
    return res.json({ account });
  })
);

router.get(
  '/accounts/:id',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const account = await prisma.socialAccount.findUnique({
      where: { id: req.params.id },
      include: { assignments: { orderBy: { startsAt: 'desc' } } }
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.json({ account });
  })
);

const assignSchema = z.object({
  adminId: z.string().min(1),
  isPrimary: z.boolean().default(false),
  reason: z.string().trim().max(500).optional().nullable()
});

router.post(
  '/accounts/:id/assign',
  requireSmois('smois.assign'),
  asyncHandler(async (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const employee = await prisma.adminUser.findUnique({ where: { id: parsed.data.adminId } });
    if (!employee || !employee.isActive) return res.status(404).json({ error: 'Team member not found' });
    if (!employee.smosRole && employee.role !== 'SUPER_ADMIN' && employee.role !== 'OPERATIONS') {
      return res.status(409).json({ error: 'That admin has no Social Media Operations role yet. Give them one under Admin users.' });
    }
    const a = actor(req);
    const result = await prisma.$transaction(async (tx) => {
      const open = await tx.socialAccountAssignment.findFirst({
        where: { accountId: account.id, adminId: employee.id, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }
      });
      if (open) return null;
      if (parsed.data.isPrimary) {
        // One primary at a time: demote, don't end, so the history stays true.
        await tx.socialAccountAssignment.updateMany({
          where: { accountId: account.id, isPrimary: true, endsAt: null },
          data: { isPrimary: false }
        });
      }
      return tx.socialAccountAssignment.create({
        data: {
          accountId: account.id,
          adminId: employee.id,
          adminName: employee.name,
          isPrimary: parsed.data.isPrimary,
          reason: trim(parsed.data.reason),
          assignedById: a.id,
          assignedByName: a.name
        }
      });
    });
    if (!result) return res.status(409).json({ error: `${employee.name} is already assigned to this account` });
    await logActivity(req, 'assignment', result.id, `Assigned ${employee.name} to ${account.name}`, { accountId: account.id });
    return res.status(201).json({ assignment: result });
  })
);

router.post(
  '/assignments/:id/end',
  requireSmois('smois.assign'),
  asyncHandler(async (req, res) => {
    const reason = z.object({ reason: z.string().trim().min(2).max(500) }).safeParse(req.body);
    if (!reason.success) return res.status(400).json({ error: 'Say why the assignment is ending' });
    const row = await prisma.socialAccountAssignment.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Assignment not found' });
    if (row.endsAt && row.endsAt <= new Date()) return res.status(409).json({ error: 'That assignment has already ended' });
    const updated = await prisma.socialAccountAssignment.update({
      where: { id: row.id },
      data: { endsAt: new Date(), isPrimary: false, reason: reason.data.reason }
    });
    await logActivity(req, 'assignment', row.id, `Ended ${row.adminName}'s assignment`, { reason: reason.data.reason });
    return res.json({ assignment: updated });
  })
);

// ── Content ─────────────────────────────────────────────────────────────────

const FORMATS = ['TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY', 'POLL', 'LINK', 'DOCUMENT'] as const;

const contentBase = z.object({
  title: z.string().trim().min(2).max(160),
  objective: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  format: z.enum(FORMATS).default('TEXT'),
  caption: z.string().max(5000).default(''),
  hashtags: z.string().trim().max(500).optional().nullable(),
  mediaNotes: z.string().trim().max(1000).optional().nullable(),
  accountId: z.string().min(1),
  plannedAt: z.string().datetime().optional().nullable(),
  reviewerId: z.string().optional().nullable()
});

const EDITABLE: SmosContentStatus[] = ['IDEA', 'PLANNED', 'IN_PRODUCTION', 'REVISION_REQUESTED', 'SUBMITTED', 'APPROVED', 'SCHEDULED'];

router.get(
  '/content',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SmosContentWhereInput = {};
    if (typeof req.query.status === 'string' && req.query.status in SmosContentStatus) {
      where.status = req.query.status as SmosContentStatus;
    }
    if (typeof req.query.accountId === 'string' && req.query.accountId) where.accountId = req.query.accountId;
    if (req.query.mine === '1') where.creatorId = req.admin!.adminId;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { caption: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.smosContent.findMany({
        where,
        orderBy: orderBy(query, ['updatedAt', 'createdAt', 'plannedAt', 'title', 'status'] as const, 'updatedAt'),
        skip: query.skip,
        take: query.take,
        include: { account: { select: { id: true, name: true, platform: true, handle: true } } }
      }),
      prisma.smosContent.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

router.post(
  '/content',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const parsed = contentBase.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const account = await prisma.socialAccount.findUnique({ where: { id: d.accountId } });
    if (!account || !account.isActive) return res.status(404).json({ error: 'Account not found' });
    if (!(await canWorkOnAccount(req, account.id))) {
      return res.status(403).json({ error: 'You are not assigned to this account' });
    }
    const reviewer = d.reviewerId ? await prisma.adminUser.findUnique({ where: { id: d.reviewerId } }) : null;
    const a = actor(req);
    const content = await prisma.smosContent.create({
      data: {
        title: d.title,
        objective: trim(d.objective),
        category: trim(d.category),
        format: d.format,
        caption: d.caption,
        hashtags: trim(d.hashtags),
        mediaNotes: trim(d.mediaNotes),
        accountId: account.id,
        plannedAt: d.plannedAt ? new Date(d.plannedAt) : null,
        status: d.plannedAt ? 'PLANNED' : 'IDEA',
        creatorId: a.id,
        creatorName: a.name,
        reviewerId: reviewer?.id ?? null,
        reviewerName: reviewer?.name ?? null,
        versions: { create: { version: 1, title: d.title, caption: d.caption, hashtags: trim(d.hashtags), editorId: a.id, editorName: a.name, reason: 'Created' } }
      }
    });
    await logActivity(req, 'content', content.id, `Created content "${content.title}" for ${account.name}`);
    return res.status(201).json({ content });
  })
);

router.get(
  '/content/:id',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const content = await prisma.smosContent.findUnique({
      where: { id: req.params.id },
      include: {
        account: { select: { id: true, name: true, platform: true, handle: true } },
        versions: { orderBy: { version: 'desc' } },
        reviews: { orderBy: { createdAt: 'desc' } },
        publications: { orderBy: { publishedAt: 'desc' } }
      }
    });
    if (!content) return res.status(404).json({ error: 'Content not found' });
    return res.json({ content });
  })
);

/** Creator, or management. Reviewers and other managers cannot rewrite someone else's draft. */
const canEditContent = (req: Parameters<typeof isManagement>[0], creatorId: string) =>
  isManagement(req) || creatorId === req.admin!.adminId;

router.patch(
  '/content/:id',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const parsed = contentBase
      .partial()
      .omit({ accountId: true })
      .extend({ reason: z.string().trim().max(500).optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Content not found' });
    if (!canEditContent(req, existing.creatorId)) return res.status(403).json({ error: 'Only the creator or management can edit this' });
    if (!EDITABLE.includes(existing.status)) return res.status(409).json({ error: `Content that is ${existing.status.toLowerCase()} cannot be edited` });

    const { reason, plannedAt, reviewerId, ...rest } = parsed.data;
    const copyChanged =
      (rest.title !== undefined && rest.title !== existing.title) ||
      (rest.caption !== undefined && rest.caption !== existing.caption) ||
      (rest.hashtags !== undefined && trim(rest.hashtags) !== existing.hashtags);
    const underReview = (['SUBMITTED', 'APPROVED', 'SCHEDULED'] as SmosContentStatus[]).includes(existing.status);
    if (copyChanged && underReview && !reason) {
      return res.status(400).json({ error: 'Say why you are changing content that was already submitted' });
    }

    const a = actor(req);
    const reviewer = reviewerId ? await prisma.adminUser.findUnique({ where: { id: reviewerId } }) : null;
    const data: Prisma.SmosContentUpdateInput = {
      ...rest,
      ...(rest.objective !== undefined ? { objective: trim(rest.objective) } : {}),
      ...(rest.category !== undefined ? { category: trim(rest.category) } : {}),
      ...(rest.hashtags !== undefined ? { hashtags: trim(rest.hashtags) } : {}),
      ...(rest.mediaNotes !== undefined ? { mediaNotes: trim(rest.mediaNotes) } : {}),
      ...(plannedAt !== undefined ? { plannedAt: plannedAt ? new Date(plannedAt) : null } : {}),
      ...(reviewerId !== undefined ? { reviewerId: reviewer?.id ?? null, reviewerName: reviewer?.name ?? null } : {})
    };
    if (copyChanged) {
      data.version = { increment: 1 };
      // A material change after approval goes back to review (PRD 10.4).
      if (existing.status === 'APPROVED' || existing.status === 'SCHEDULED') data.status = 'SUBMITTED';
    }
    const content = await prisma.$transaction(async (tx) => {
      const updated = await tx.smosContent.update({ where: { id: existing.id }, data });
      if (copyChanged) {
        await tx.smosContentVersion.create({
          data: {
            contentId: existing.id,
            version: updated.version,
            title: updated.title,
            caption: updated.caption,
            hashtags: updated.hashtags,
            editorId: a.id,
            editorName: a.name,
            reason: reason ?? 'Edited'
          }
        });
      }
      return updated;
    });
    await logActivity(req, 'content', content.id, `Edited content "${content.title}"${copyChanged ? ` (v${content.version})` : ''}`, {
      returnedToReview: copyChanged && (existing.status === 'APPROVED' || existing.status === 'SCHEDULED'),
      reason: reason ?? null
    });
    return res.json({ content });
  })
);

router.post(
  '/content/:id/submit',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Content not found' });
    if (!canEditContent(req, existing.creatorId)) return res.status(403).json({ error: 'Only the creator or management can submit this' });
    if (!(['IDEA', 'PLANNED', 'IN_PRODUCTION', 'REVISION_REQUESTED'] as SmosContentStatus[]).includes(existing.status)) {
      return res.status(409).json({ error: `Content that is ${existing.status.toLowerCase()} cannot be submitted` });
    }
    if (!existing.caption.trim()) return res.status(400).json({ error: 'Write the caption before submitting' });
    // Compare-and-set so two clicks cannot submit twice.
    const r = await prisma.smosContent.updateMany({ where: { id: existing.id, status: existing.status }, data: { status: 'SUBMITTED' } });
    if (r.count === 0) return res.status(409).json({ error: 'This content just changed. Refresh and try again.' });
    await logActivity(req, 'content', existing.id, `Submitted "${existing.title}" for review (v${existing.version})`);
    return res.json({ ok: true });
  })
);

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
  comments: z.string().trim().max(2000).optional().nullable()
});

router.post(
  '/content/:id/review',
  requireSmois('smois.content.review'),
  asyncHandler(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { decision, comments } = parsed.data;
    if (decision !== 'APPROVED' && !trim(comments)) {
      return res.status(400).json({ error: 'Tell the author what needs to change' });
    }
    const existing = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Content not found' });
    if (existing.status !== 'SUBMITTED') return res.status(409).json({ error: 'This content is not waiting for review' });
    const a = actor(req);
    if (existing.creatorId === a.id) return res.status(403).json({ error: 'You cannot review content you created' });

    const next: SmosContentStatus = decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : 'REVISION_REQUESTED';
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.smosContent.updateMany({
        where: { id: existing.id, status: 'SUBMITTED', version: existing.version },
        data: { status: next }
      });
      if (r.count === 0) return false;
      await tx.smosContentReview.create({
        data: { contentId: existing.id, version: existing.version, decision, comments: trim(comments), reviewerId: a.id, reviewerName: a.name }
      });
      return true;
    });
    if (!done) return res.status(409).json({ error: 'The author just changed this content. Refresh to review the latest version.' });
    await logActivity(req, 'content', existing.id, `${decision.replace('_', ' ').toLowerCase()}: "${existing.title}" (v${existing.version})`, {
      decision,
      comments: trim(comments)
    });
    return res.json({ ok: true, status: next });
  })
);

// Non-review status moves. Review outcomes and publishing have their own routes.
const MOVES: Partial<Record<SmosContentStatus, SmosContentStatus[]>> = {
  IDEA: ['PLANNED', 'CANCELLED'],
  PLANNED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['PLANNED', 'CANCELLED'],
  REVISION_REQUESTED: ['IN_PRODUCTION', 'CANCELLED'],
  REJECTED: ['ARCHIVED'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['APPROVED', 'CANCELLED'],
  PUBLISHED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED']
};

router.post(
  '/content/:id/status',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ status: z.nativeEnum(SmosContentStatus) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Unknown status' });
    const existing = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Content not found' });
    if (!canEditContent(req, existing.creatorId)) return res.status(403).json({ error: 'Only the creator or management can change this' });
    const to = parsed.data.status;
    if (!MOVES[existing.status]?.includes(to)) {
      return res.status(409).json({ error: `Cannot move content from ${existing.status} to ${to}` });
    }
    if (to === 'SCHEDULED' && !existing.plannedAt) return res.status(400).json({ error: 'Set a planned date before scheduling' });
    const r = await prisma.smosContent.updateMany({ where: { id: existing.id, status: existing.status }, data: { status: to } });
    if (r.count === 0) return res.status(409).json({ error: 'This content just changed. Refresh and try again.' });
    await logActivity(req, 'content', existing.id, `Moved "${existing.title}" from ${existing.status} to ${to}`);
    return res.json({ ok: true, status: to });
  })
);

const publishSchema = z.object({
  url: z.string().trim().url().max(500).optional().nullable(),
  publishedAt: z.string().datetime().optional(),
  bypassReason: z.string().trim().min(5).max(500).optional()
});

router.post(
  '/content/:id/publish',
  requireSmois('smois.content.publish'),
  asyncHandler(async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Content not found' });
    if (!(await canWorkOnAccount(req, existing.accountId))) return res.status(403).json({ error: 'You are not assigned to this account' });

    const cleared = existing.status === 'APPROVED' || existing.status === 'SCHEDULED';
    const bypass = !cleared && !!parsed.data.bypassReason;
    if (!cleared && !bypass) {
      return res.status(409).json({ error: 'Only approved content can be published. Management may publish with an emergency reason.' });
    }
    if (bypass && !isManagement(req)) return res.status(403).json({ error: 'Only management can bypass approval' });
    if (bypass && !(['IDEA', 'PLANNED', 'IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED'] as SmosContentStatus[]).includes(existing.status)) {
      return res.status(409).json({ error: `Content that is ${existing.status.toLowerCase()} cannot be published` });
    }
    // The approval counts only if it was for the version being published.
    const approval = cleared
      ? await prisma.smosContentReview.findFirst({
          where: { contentId: existing.id, version: existing.version, decision: 'APPROVED' },
          orderBy: { createdAt: 'desc' }
        })
      : null;
    if (cleared && !approval) return res.status(409).json({ error: 'No approval on record for the current version. Resubmit it for review.' });

    const a = actor(req);
    const publishedAt = parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : new Date();
    if (publishedAt.getTime() > Date.now() + 5 * 60 * 1000) return res.status(400).json({ error: 'Published time cannot be in the future' });

    const publication = await prisma.$transaction(async (tx) => {
      const r = await tx.smosContent.updateMany({ where: { id: existing.id, status: existing.status }, data: { status: 'PUBLISHED' } });
      if (r.count === 0) return null;
      return tx.smosPublication.create({
        data: {
          contentId: existing.id,
          accountId: existing.accountId,
          url: trim(parsed.data.url),
          publishedAt,
          recordedById: a.id,
          recordedByName: a.name,
          approvedByName: approval?.reviewerName ?? null,
          bypassReason: bypass ? parsed.data.bypassReason : null
        }
      });
    });
    if (!publication) return res.status(409).json({ error: 'This content just changed. Refresh and try again.' });
    await logActivity(
      req,
      'publication',
      publication.id,
      `${bypass ? 'Emergency-published' : 'Recorded publication of'} "${existing.title}"`,
      { contentId: existing.id, url: publication.url, bypassReason: publication.bypassReason }
    );
    return res.status(201).json({ publication });
  })
);

// ── Calendar ────────────────────────────────────────────────────────────────

router.get(
  '/calendar',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const from = parseDay(req.query.from);
    const to = parseDay(req.query.to);
    if (!from || !to || to.getTime() - from.getTime() > 100 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Give from and to as YYYY-MM-DD, at most 100 days apart' });
    }
    const where: Prisma.SmosContentWhereInput = {
      plannedAt: { gte: from, lte: endOfDay(to) },
      status: { notIn: ['CANCELLED', 'ARCHIVED'] }
    };
    if (typeof req.query.accountId === 'string' && req.query.accountId) where.accountId = req.query.accountId;
    const items = await prisma.smosContent.findMany({
      where,
      orderBy: { plannedAt: 'asc' },
      take: 500,
      select: {
        id: true, title: true, status: true, plannedAt: true, format: true, creatorName: true, accountId: true,
        account: { select: { name: true, platform: true } }
      }
    });
    // Conflicts per PRD 9.5, computed on read: nothing is stored that could go stale.
    const now = Date.now();
    const data = items.map((it) => {
      const t = it.plannedAt!.getTime();
      const warnings: string[] = [];
      if (t < now && !['PUBLISHED'].includes(it.status)) warnings.push('Planned date has passed and it is not published');
      if (items.some((o) => o.id !== it.id && o.accountId === it.accountId && Math.abs(o.plannedAt!.getTime() - t) < 60 * 60 * 1000)) {
        warnings.push('Another post on this account is planned within an hour');
      }
      return { ...it, warnings };
    });
    return res.json({ data });
  })
);

// ── Publications ────────────────────────────────────────────────────────────

router.get(
  '/publications',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SmosPublicationWhereInput = {};
    if (typeof req.query.accountId === 'string' && req.query.accountId) where.accountId = req.query.accountId;
    if (req.query.mine === '1') where.recordedById = req.admin!.adminId;
    if (query.q) where.content = { title: { contains: query.q, mode: 'insensitive' } };
    const [rows, total] = await Promise.all([
      prisma.smosPublication.findMany({
        where,
        orderBy: orderBy(query, ['publishedAt', 'createdAt'] as const, 'publishedAt'),
        skip: query.skip,
        take: query.take,
        include: {
          content: { select: { id: true, title: true, category: true, format: true, creatorName: true, account: { select: { name: true, platform: true } } } },
          metrics: { orderBy: { capturedAt: 'desc' }, take: 1 }
        }
      }),
      prisma.smosPublication.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

const metricNum = z.number().int().min(0).max(2_000_000_000).optional().nullable();
const postMetricSchema = z.object({
  reach: metricNum, impressions: metricNum, likes: metricNum, comments: metricNum,
  shares: metricNum, clicks: metricNum, videoViews: metricNum,
  source: z.enum(['MANUAL', 'ESTIMATED']).default('MANUAL')
});

router.post(
  '/publications/:id/metrics',
  requireSmois('smois.metrics.record'),
  asyncHandler(async (req, res) => {
    const parsed = postMetricSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { source, ...values } = parsed.data;
    if (Object.values(values).every((v) => v == null)) return res.status(400).json({ error: 'Enter at least one figure' });
    const pub = await prisma.smosPublication.findUnique({ where: { id: req.params.id }, include: { content: { select: { title: true } } } });
    if (!pub) return res.status(404).json({ error: 'Publication not found' });
    if (!(await canWorkOnAccount(req, pub.accountId))) return res.status(403).json({ error: 'You are not assigned to this account' });
    const a = actor(req);
    // Appended, never edited: the history of a post's numbers is the record.
    const metric = await prisma.smosPostMetric.create({
      data: { publicationId: pub.id, ...values, source, recordedById: a.id, recordedByName: a.name }
    });
    await logActivity(req, 'publication', pub.id, `Recorded post figures for "${pub.content.title}"`);
    return res.status(201).json({ metric });
  })
);

router.get(
  '/publications/:id/metrics',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const data = await prisma.smosPostMetric.findMany({ where: { publicationId: req.params.id }, orderBy: { capturedAt: 'desc' }, take: 100 });
    return res.json({ data });
  })
);

// ── Tasks ───────────────────────────────────────────────────────────────────

const TASK_TYPES = ['CONTENT_CREATION', 'GRAPHIC_DESIGN', 'VIDEO_PRODUCTION', 'PUBLISHING', 'COMMUNITY', 'CAMPAIGN', 'ANALYTICS_REVIEW', 'REPORTING', 'COMPETITOR_RESEARCH', 'GENERAL'] as const;

const taskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  type: z.enum(TASK_TYPES).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  assigneeId: z.string().min(1),
  accountId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable()
});

const isOpen = (s: SmosTaskStatus) => s !== 'COMPLETED' && s !== 'CANCELLED';

router.get(
  '/tasks',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SmosTaskWhereInput = {};
    // Colleagues' tasks are management's view; a manager sees their own.
    if (!isManagement(req) || req.query.assignee === 'me') where.assigneeId = req.admin!.adminId;
    if (typeof req.query.status === 'string' && req.query.status in SmosTaskStatus) where.status = req.query.status as SmosTaskStatus;
    if (req.query.due === 'overdue') {
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
      where.dueAt = { lt: new Date() };
    }
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      prisma.smosTask.findMany({
        where,
        orderBy: orderBy(query, ['dueAt', 'createdAt', 'status', 'priority'] as const, 'dueAt'),
        skip: query.skip,
        take: query.take,
        include: { account: { select: { name: true, platform: true } } }
      }),
      prisma.smosTask.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

router.post(
  '/tasks',
  requireSmois('smois.tasks.manage'),
  asyncHandler(async (req, res) => {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const assignee = await prisma.adminUser.findUnique({ where: { id: d.assigneeId } });
    if (!assignee || !assignee.isActive) return res.status(404).json({ error: 'Assignee not found' });
    const a = actor(req);
    const task = await prisma.smosTask.create({
      data: {
        title: d.title, description: trim(d.description), type: d.type, priority: d.priority,
        assigneeId: assignee.id, assigneeName: assignee.name, createdById: a.id, createdByName: a.name,
        accountId: d.accountId || null, dueAt: d.dueAt ? new Date(d.dueAt) : null
      }
    });
    await logActivity(req, 'task', task.id, `Assigned task "${task.title}" to ${assignee.name}`);
    return res.status(201).json({ task });
  })
);

router.patch(
  '/tasks/:id',
  requireSmois('smois.tasks.manage'),
  asyncHandler(async (req, res) => {
    const parsed = taskSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosTask.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!isOpen(existing.status)) return res.status(409).json({ error: 'A finished task cannot be changed' });
    const { assigneeId, dueAt, description, accountId, ...rest } = parsed.data;
    const assignee = assigneeId && assigneeId !== existing.assigneeId ? await prisma.adminUser.findUnique({ where: { id: assigneeId } }) : null;
    if (assigneeId && assigneeId !== existing.assigneeId && !assignee) return res.status(404).json({ error: 'Assignee not found' });
    const task = await prisma.smosTask.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(description !== undefined ? { description: trim(description) } : {}),
        ...(accountId !== undefined ? { accountId: accountId || null } : {}),
        ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
        ...(assignee ? { assigneeId: assignee.id, assigneeName: assignee.name, status: 'PENDING' } : {})
      }
    });
    await logActivity(req, 'task', task.id, assignee ? `Reassigned task "${task.title}" to ${assignee.name}` : `Updated task "${task.title}"`);
    return res.json({ task });
  })
);

const transitionSchema = z.object({
  to: z.nativeEnum(SmosTaskStatus),
  evidenceUrl: z.string().trim().url().max(500).optional().nullable(),
  evidenceNote: z.string().trim().max(1000).optional().nullable(),
  reviewNote: z.string().trim().max(1000).optional().nullable()
});

// Who may make each move: the assignee works the task, management signs it off.
const WORK: Partial<Record<SmosTaskStatus, SmosTaskStatus[]>> = {
  PENDING: ['ACCEPTED'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  REVISION_REQUIRED: ['IN_PROGRESS']
};
const REVIEW: Partial<Record<SmosTaskStatus, SmosTaskStatus[]>> = {
  SUBMITTED: ['COMPLETED', 'REVISION_REQUIRED'],
  PENDING: ['CANCELLED'], ACCEPTED: ['CANCELLED'], IN_PROGRESS: ['CANCELLED'], REVISION_REQUIRED: ['CANCELLED']
};

router.post(
  '/tasks/:id/transition',
  requireSmois('smois.tasks.work'),
  asyncHandler(async (req, res) => {
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { to } = parsed.data;
    const task = await prisma.smosTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const a = actor(req);
    const mayManage = smosCan(req.smos ?? null, 'smois.tasks.manage');

    const assigneeMove = task.assigneeId === a.id && WORK[task.status]?.includes(to);
    const managerMove = mayManage && REVIEW[task.status]?.includes(to);
    if (!assigneeMove && !managerMove) {
      return res.status(409).json({ error: `You cannot move this task from ${task.status} to ${to}` });
    }
    if (to === 'SUBMITTED' && !parsed.data.evidenceUrl && !trim(parsed.data.evidenceNote)) {
      return res.status(400).json({ error: 'Attach completion evidence: a link or a short description' });
    }
    if (to === 'REVISION_REQUIRED' && !trim(parsed.data.reviewNote)) {
      return res.status(400).json({ error: 'Tell them what needs to change' });
    }
    const r = await prisma.smosTask.updateMany({
      where: { id: task.id, status: task.status },
      data: {
        status: to,
        ...(to === 'SUBMITTED' ? { evidenceUrl: trim(parsed.data.evidenceUrl), evidenceNote: trim(parsed.data.evidenceNote) } : {}),
        ...(to === 'COMPLETED' || to === 'REVISION_REQUIRED' ? { reviewNote: trim(parsed.data.reviewNote) } : {}),
        ...(to === 'COMPLETED' ? { completedAt: new Date() } : {})
      }
    });
    if (r.count === 0) return res.status(409).json({ error: 'This task just changed. Refresh and try again.' });
    await logActivity(req, 'task', task.id, `Task "${task.title}": ${task.status} → ${to}`);
    return res.json({ ok: true, status: to });
  })
);

// ── Activity ────────────────────────────────────────────────────────────────

router.get(
  '/activity',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const all = smosCan(req.smos ?? null, 'smois.activity.read');
    const own = smosCan(req.smos ?? null, 'smois.activity.own');
    if (!all && !own) return res.status(403).json({ error: 'You do not have access to the activity log' });
    const query = parseListQuery(req);
    const where: Prisma.AuditLogWhereInput = { action: 'SMOIS_ACTIVITY' };
    if (!all) where.actorId = req.admin!.adminId;
    if (typeof req.query.resourceId === 'string' && req.query.resourceId) where.resourceId = req.query.resourceId;
    if (typeof req.query.actorId === 'string' && req.query.actorId && all) where.actorId = req.query.actorId;
    if (query.q) where.summary = { contains: query.q, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: { id: true, actorId: true, actorName: true, resource: true, resourceId: true, summary: true, metadata: true, createdAt: true }
      }),
      prisma.auditLog.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

export default router;
