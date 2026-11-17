import { Request, Router } from 'express';
import { BugSeverity, BugStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { sendTesterBugUpdateEmail, sendTesterInviteEmail } from '../../lib/email';
import { ACTIVE_BUG_STATUSES, BUG_AREAS, withEvidenceUrls } from '../../lib/bugs';

/**
 * Triage side of the beta-tester bug tracker. Like the support inbox, working
 * the queue (status, assignee, comments) is open to every admin role; adding
 * and removing testers is OPERATIONS.
 */
const router = Router();

const adminName = (req: Request) => req.admin!.name;
const adminId = (req: Request) => req.admin!.adminId;

// ── Overview ────────────────────────────────────────────────────────────────

router.get(
  '/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [newCount, criticalOpen, unassigned, awaitingRetest, needsInfo, mine, testers] = await Promise.all([
      prisma.bugReport.count({ where: { status: 'NEW' } }),
      prisma.bugReport.count({ where: { severity: 'CRITICAL', status: { in: ACTIVE_BUG_STATUSES } } }),
      prisma.bugReport.count({ where: { status: { in: ACTIVE_BUG_STATUSES }, assigneeId: null } }),
      prisma.bugReport.count({ where: { status: 'FIXED' } }),
      prisma.bugReport.count({ where: { status: 'NEEDS_INFO' } }),
      prisma.bugReport.count({ where: { status: { in: ACTIVE_BUG_STATUSES }, assigneeId: adminId(req) } }),
      prisma.tester.count({ where: { isActive: true } })
    ]);
    return res.json({ new: newCount, criticalOpen, unassigned, awaitingRetest, needsInfo, assignedToMe: mine, activeTesters: testers });
  })
);

// ── Testers (before /:id so "testers" is not read as a report) ──────────────

router.get(
  '/testers',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.TesterWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } }
          ]
        }
      : {};
    if (req.query.active === 'true') where.isActive = true;
    if (req.query.active === 'false') where.isActive = false;

    const [rows, total] = await Promise.all([
      prisma.tester.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          invitedByName: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { bugs: true } }
        },
        orderBy: orderBy(query, ['createdAt', 'name', 'lastLoginAt'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.tester.count({ where })
    ]);
    const data = rows.map(({ _count, ...t }) => ({ ...t, reportCount: _count.bugs }));
    return res.json(paginated(data, total, query));
  })
);

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter the tester’s name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200)
});

router.post(
  '/testers',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name, email } = parsed.data;

    const existing = await prisma.tester.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'That email is already on the test team.' });

    const tester = await prisma.tester.create({ data: { name, email, invitedByName: adminName(req) } });
    const emailed = await sendTesterInviteEmail({ to: email, name });
    await writeAuditLog(req, {
      action: 'TESTER_CHANGED',
      resource: 'tester',
      resourceId: tester.id,
      summary: `Added beta tester ${name} (${email})`
    });
    return res.status(201).json({ tester: { id: tester.id, name, email, isActive: true }, emailed });
  })
);

const testerPatchSchema = z
  .object({ name: z.string().trim().min(2).max(100), isActive: z.boolean() })
  .partial();

router.patch(
  '/testers/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = testerPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.tester.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Tester not found' });

    const data: Prisma.TesterUpdateInput = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== existing.isActive) {
      data.isActive = parsed.data.isActive;
      // Deactivating ends their session now and invalidates any code already sent.
      if (!parsed.data.isActive) Object.assign(data, { tokenVersion: { increment: 1 }, otpCodeHash: null, otpExpiresAt: null });
    }
    const tester = await prisma.tester.update({ where: { id: existing.id }, data });
    if (data.isActive !== undefined) {
      await writeAuditLog(req, {
        action: 'TESTER_CHANGED',
        resource: 'tester',
        resourceId: tester.id,
        summary: `${tester.isActive ? 'Reactivated' : 'Deactivated'} beta tester ${tester.name} (${tester.email})`
      });
    }
    return res.json({ tester: { id: tester.id, name: tester.name, email: tester.email, isActive: tester.isActive } });
  })
);

// ── Reports ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status, severity, area, assignee, tester } = req.query;

    const where: Prisma.BugReportWhereInput = {};
    if (status === 'active') where.status = { in: ACTIVE_BUG_STATUSES };
    else if (typeof status === 'string' && status in BugStatus) where.status = status as BugStatus;
    if (typeof severity === 'string' && severity in BugSeverity) where.severity = severity as BugSeverity;
    if (typeof area === 'string' && (BUG_AREAS as readonly string[]).includes(area)) where.area = area;
    if (assignee === 'me') where.assigneeId = adminId(req);
    else if (assignee === 'unassigned') where.assigneeId = null;
    if (typeof tester === 'string' && tester) where.testerId = tester;
    if (query.q) {
      const number = Number(query.q.replace('#', ''));
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { screen: { contains: query.q, mode: 'insensitive' } },
        { tester: { name: { contains: query.q, mode: 'insensitive' } } },
        ...(Number.isInteger(number) ? [{ number }] : [])
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.bugReport.findMany({
        where,
        include: { tester: { select: { name: true } }, _count: { select: { comments: true, attachments: true } } },
        orderBy: orderBy(query, ['updatedAt', 'createdAt', 'severity', 'number'] as const, 'updatedAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.bugReport.count({ where })
    ]);
    const data = rows.map(({ tester: t, _count, ...bug }) => ({
      ...bug,
      testerName: t.name,
      commentCount: _count.comments,
      attachmentCount: _count.attachments
    }));
    return res.json(paginated(data, total, query));
  })
);

/** Reports are addressed by short number (#12) everywhere a human sees them. */
async function findByNumber(raw: string) {
  const number = Number(raw);
  if (!Number.isInteger(number)) return null;
  return prisma.bugReport.findUnique({ where: { number } });
}

router.get(
  '/:number',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const bug = await findByNumber(req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });
    const [attachments, comments, tester] = await Promise.all([
      prisma.bugAttachment.findMany({ where: { bugId: bug.id }, orderBy: { createdAt: 'asc' } }),
      prisma.bugComment.findMany({ where: { bugId: bug.id }, orderBy: { createdAt: 'asc' } }),
      prisma.tester.findUnique({ where: { id: bug.testerId }, select: { id: true, name: true, email: true, isActive: true } })
    ]);
    return res.json({ bug, tester, attachments: await withEvidenceUrls(attachments), comments });
  })
);

const patchSchema = z
  .object({
    status: z.nativeEnum(BugStatus),
    severity: z.nativeEnum(BugSeverity),
    /** "me", "none", or an admin snapshot is not accepted: assignment is to yourself or nobody. */
    assignee: z.enum(['me', 'none']),
    fixedInBuild: z.string().trim().min(1).max(40).nullable(),
    duplicateOfNumber: z.number().int().positive().nullable(),
    /** Optional message to the tester, sent with a status change. */
    message: z.string().trim().max(2000)
  })
  .partial();

router.patch(
  '/:number',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const input = parsed.data;
    const bug = await findByNumber(req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });

    const nextStatus = input.status ?? bug.status;
    const fixedInBuild = input.fixedInBuild !== undefined ? input.fixedInBuild : bug.fixedInBuild;
    if (nextStatus === 'FIXED' && !fixedInBuild) {
      return res.status(400).json({ error: 'Say which build contains the fix, so the tester knows what to retest.' });
    }
    const duplicateOf = input.duplicateOfNumber !== undefined ? input.duplicateOfNumber : bug.duplicateOfNumber;
    if (nextStatus === 'DUPLICATE') {
      if (!duplicateOf) return res.status(400).json({ error: 'Enter the number of the report this duplicates.' });
      if (duplicateOf === bug.number) return res.status(400).json({ error: 'A report cannot duplicate itself.' });
      const target = await prisma.bugReport.findUnique({ where: { number: duplicateOf }, select: { id: true } });
      if (!target) return res.status(400).json({ error: `Report #${duplicateOf} does not exist.` });
    }
    if (nextStatus === 'NEEDS_INFO' && bug.status !== 'NEEDS_INFO' && !input.message) {
      return res.status(400).json({ error: 'Tell the tester what you need to know.' });
    }

    const data: Prisma.BugReportUpdateInput = {};
    if (input.status) data.status = input.status;
    if (input.severity) data.severity = input.severity;
    if (input.assignee === 'me') Object.assign(data, { assigneeId: adminId(req), assigneeName: adminName(req) });
    if (input.assignee === 'none') Object.assign(data, { assigneeId: null, assigneeName: null });
    if (input.fixedInBuild !== undefined) data.fixedInBuild = input.fixedInBuild;
    data.duplicateOfNumber = nextStatus === 'DUPLICATE' ? duplicateOf : null;
    if (input.status) {
      const closing: BugStatus[] = ['FIXED', 'VERIFIED', 'WONT_FIX', 'DUPLICATE'];
      data.resolvedAt = closing.includes(input.status) ? new Date() : null;
    }

    const statusChanged = input.status !== undefined && input.status !== bug.status;
    const writes: Prisma.PrismaPromise<unknown>[] = [prisma.bugReport.update({ where: { id: bug.id }, data })];
    // A message sent with the change becomes a visible comment, so the thread tells the whole story.
    if (input.message) {
      writes.push(
        prisma.bugComment.create({ data: { bugId: bug.id, author: 'ADMIN', authorName: adminName(req), body: input.message } })
      );
    }
    await prisma.$transaction(writes);

    if (statusChanged || input.severity || input.assignee) {
      await writeAuditLog(req, {
        action: 'BUG_CHANGED',
        resource: 'bug',
        resourceId: bug.id,
        summary: `Bug #${bug.number}: ${[
          statusChanged && `status ${bug.status} → ${input.status}`,
          input.severity && input.severity !== bug.severity && `severity ${bug.severity} → ${input.severity}`,
          input.assignee && (input.assignee === 'me' ? `assigned to ${adminName(req)}` : 'unassigned')
        ]
          .filter(Boolean)
          .join(', ')}`
      });
    }

    // Tell the tester only about the changes that need something from them.
    if (statusChanged && (input.status === 'FIXED' || input.status === 'NEEDS_INFO')) {
      const tester = await prisma.tester.findUnique({ where: { id: bug.testerId }, select: { name: true, email: true, isActive: true } });
      if (tester?.isActive) {
        void sendTesterBugUpdateEmail({
          to: tester.email,
          name: tester.name,
          number: bug.number,
          title: bug.title,
          heading: input.status === 'FIXED' ? 'fixed, please retest' : 'we need a bit more information',
          message:
            input.status === 'FIXED'
              ? `We think this is fixed in build ${fixedInBuild}. Please retest and tell us whether it works.${input.message ? `\n\n${input.message}` : ''}`
              : input.message ?? ''
        });
      }
    }

    const updated = await prisma.bugReport.findUnique({ where: { id: bug.id } });
    return res.json({ bug: updated });
  })
);

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(4000),
  /** Internal notes are for the team; the tester never sees them. */
  internal: z.boolean().default(false)
});

router.post(
  '/:number/comments',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const bug = await findByNumber(req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });

    const comment = await prisma.bugComment.create({
      data: { bugId: bug.id, author: 'ADMIN', authorName: adminName(req), body: parsed.data.body, internal: parsed.data.internal }
    });
    await prisma.bugReport.update({ where: { id: bug.id }, data: { updatedAt: new Date() } });
    return res.status(201).json({ comment });
  })
);

export default router;
