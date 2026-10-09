import { Request, Router } from 'express';
import {
  LeadActivityType,
  LeadSource,
  LeadStage,
  LeadType,
  Prisma,
  TaskStatus
} from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

/**
 * CRM: the vendor/rider acquisition pipeline, follow-up tasks, and private
 * notes and tags on any account. Reads are open to every admin; pipeline and
 * task changes are OPERATIONS. Notes and tags are the exception — any admin
 * (including SUPPORT) can add them, since support staff are who learn things.
 */
const router = Router();

const actor = (req: Request) => ({ id: req.admin!.adminId, name: req.admin!.name });
const trimOrNull = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

// ── Overview ────────────────────────────────────────────────────────────────

router.get(
  '/overview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [stages, overdueTasks, myOpenTasks, followUpsDue, newThisWeek, wonThisWeek] = await Promise.all([
      prisma.lead.groupBy({ by: ['stage'], _count: true }),
      prisma.crmTask.count({ where: { status: 'OPEN', dueAt: { lt: now } } }),
      prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: req.admin!.adminId } }),
      prisma.lead.count({
        where: { stage: { in: ['NEW', 'CONTACTED', 'ONBOARDING'] }, nextFollowUpAt: { lt: now } }
      }),
      prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.lead.count({ where: { stage: 'WON', stageChangedAt: { gte: weekAgo } } })
    ]);
    return res.json({
      stages: Object.fromEntries(stages.map((s) => [s.stage, s._count])),
      overdueTasks,
      myOpenTasks,
      followUpsDue,
      newThisWeek,
      wonThisWeek
    });
  })
);

// ── Leads ───────────────────────────────────────────────────────────────────

router.get(
  '/leads',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { stage, type, owner } = req.query;

    const where: Prisma.LeadWhereInput = {};
    if (typeof stage === 'string' && stage in LeadStage) where.stage = stage as LeadStage;
    if (typeof type === 'string' && type in LeadType) where.type = type as LeadType;
    if (owner === 'me') where.ownerId = req.admin!.adminId;
    else if (owner === 'unassigned') where.ownerId = null;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { contactName: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { _count: { select: { tasks: { where: { status: 'OPEN' } } } } },
        orderBy: orderBy(query, ['updatedAt', 'createdAt', 'stageChangedAt', 'nextFollowUpAt', 'name'] as const, 'updatedAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.lead.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.get(
  '/leads/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        tasks: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }
      }
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    return res.json({ lead });
  })
);

const leadFields = {
  name: z.string().trim().min(2).max(120),
  type: z.nativeEnum(LeadType),
  source: z.nativeEnum(LeadSource),
  contactName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(160).nullish().or(z.literal('')),
  state: z.string().trim().max(60).nullish(),
  city: z.string().trim().max(60).nullish(),
  nextFollowUpAt: z.string().datetime().nullish()
};

router.post(
  '/leads',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ ...leadFields, type: leadFields.type.default('VENDOR'), source: leadFields.source.default('OUTREACH') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const me = actor(req);

    const lead = await prisma.lead.create({
      data: {
        name: d.name,
        type: d.type,
        source: d.source,
        contactName: trimOrNull(d.contactName),
        phone: trimOrNull(d.phone),
        email: trimOrNull(d.email)?.toLowerCase() ?? null,
        state: trimOrNull(d.state),
        city: trimOrNull(d.city),
        nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
        ownerId: me.id,
        ownerName: me.name,
        activities: { create: { type: 'NOTE', body: 'Lead created', authorName: me.name } }
      }
    });
    await writeAuditLog(req, {
      action: 'LEAD_CREATED',
      resource: 'lead',
      resourceId: lead.id,
      summary: `Added ${lead.type.toLowerCase()} lead ${lead.name}`
    });
    return res.status(201).json({ lead });
  })
);

const leadPatchSchema = z
  .object({
    ...leadFields,
    stage: z.nativeEnum(LeadStage),
    lostReason: z.string().trim().max(300).nullish(),
    owner: z.union([z.literal('me'), z.null()]),
    convertedUserId: z.string().min(1).nullable()
  })
  .partial();

router.patch(
  '/leads/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = leadPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;

    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const me = actor(req);

    const data: Prisma.LeadUpdateInput = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.type !== undefined) data.type = d.type;
    if (d.source !== undefined) data.source = d.source;
    if (d.contactName !== undefined) data.contactName = trimOrNull(d.contactName);
    if (d.phone !== undefined) data.phone = trimOrNull(d.phone);
    if (d.email !== undefined) data.email = trimOrNull(d.email)?.toLowerCase() ?? null;
    if (d.state !== undefined) data.state = trimOrNull(d.state);
    if (d.city !== undefined) data.city = trimOrNull(d.city);
    if (d.nextFollowUpAt !== undefined) data.nextFollowUpAt = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
    if (d.owner === 'me') {
      data.ownerId = me.id;
      data.ownerName = me.name;
    } else if (d.owner === null) {
      data.ownerId = null;
      data.ownerName = null;
    }

    let stageNote: string | null = null;
    if (d.stage && d.stage !== lead.stage) {
      const reason = trimOrNull(d.lostReason);
      if (d.stage === 'LOST' && !reason) {
        return res.status(400).json({ error: 'Say why this lead was lost' });
      }
      data.stage = d.stage;
      data.stageChangedAt = new Date();
      data.lostReason = d.stage === 'LOST' ? reason : null;
      if (d.stage === 'WON' || d.stage === 'LOST') data.nextFollowUpAt = null;
      stageNote = `Stage ${lead.stage} → ${d.stage}${d.stage === 'LOST' ? ` (${reason})` : ''}`;

      // A won lead that already has an account becomes linked to it.
      if (d.stage === 'WON' && !lead.convertedUserId && d.convertedUserId === undefined) {
        const email = (d.email !== undefined ? trimOrNull(d.email) : lead.email)?.toLowerCase();
        const match = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;
        if (match) data.convertedUserId = match.id;
      }
    }
    if (d.convertedUserId !== undefined) {
      if (d.convertedUserId) {
        const user = await prisma.user.findUnique({ where: { id: d.convertedUserId }, select: { id: true } });
        if (!user) return res.status(400).json({ error: 'That account does not exist' });
      }
      data.convertedUserId = d.convertedUserId;
    }

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...data,
        ...(stageNote
          ? { activities: { create: { type: 'STAGE_CHANGE' as const, body: stageNote, authorName: me.name } } }
          : {})
      }
    });
    await writeAuditLog(req, {
      action: 'LEAD_UPDATED',
      resource: 'lead',
      resourceId: lead.id,
      summary: stageNote ? `${lead.name}: ${stageNote}` : `Edited lead ${lead.name}`
    });
    return res.json({ lead: updated });
  })
);

router.delete(
  '/leads/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await prisma.lead.delete({ where: { id: lead.id } });
    await writeAuditLog(req, {
      action: 'LEAD_DELETED',
      resource: 'lead',
      resourceId: lead.id,
      summary: `Deleted lead ${lead.name}`
    });
    return res.json({ ok: true });
  })
);

const activitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'MESSAGE', 'MEETING']).default('NOTE'),
  body: z.string().trim().min(1, 'Write something first').max(4000)
});

router.post(
  '/leads/:id/activities',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const [activity] = await prisma.$transaction([
      prisma.leadActivity.create({
        data: { leadId: lead.id, type: parsed.data.type as LeadActivityType, body: parsed.data.body, authorName: actor(req).name }
      }),
      prisma.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } })
    ]);
    return res.status(201).json({ activity });
  })
);

// ── Tasks ───────────────────────────────────────────────────────────────────

router.get(
  '/tasks',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status, assignee, due } = req.query;

    const where: Prisma.CrmTaskWhereInput = {};
    if (typeof status === 'string' && status in TaskStatus) where.status = status as TaskStatus;
    if (assignee === 'me') where.assigneeId = req.admin!.adminId;
    else if (assignee === 'unassigned') where.assigneeId = null;
    if (due === 'overdue') {
      where.status = 'OPEN';
      where.dueAt = { lt: new Date() };
    }
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.crmTask.findMany({
        where,
        include: { lead: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
        orderBy: orderBy(query, ['dueAt', 'createdAt', 'status'] as const, 'dueAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.crmTask.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

const taskCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  dueAt: z.string().datetime().nullish(),
  leadId: z.string().min(1).nullish(),
  userId: z.string().min(1).nullish(),
  assignee: z.union([z.literal('me'), z.null()]).default('me')
});

router.post(
  '/tasks',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = taskCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const me = actor(req);

    if (d.leadId && !(await prisma.lead.findUnique({ where: { id: d.leadId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Lead not found' });
    }
    if (d.userId && !(await prisma.user.findUnique({ where: { id: d.userId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Account not found' });
    }

    const task = await prisma.crmTask.create({
      data: {
        title: d.title,
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
        leadId: d.leadId ?? null,
        userId: d.userId ?? null,
        assigneeId: d.assignee === 'me' ? me.id : null,
        assigneeName: d.assignee === 'me' ? me.name : null,
        createdByName: me.name
      }
    });
    await writeAuditLog(req, {
      action: 'TASK_CHANGED',
      resource: 'task',
      resourceId: task.id,
      summary: `Created task "${task.title}"`
    });
    return res.status(201).json({ task });
  })
);

const taskPatchSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    dueAt: z.string().datetime().nullable(),
    status: z.nativeEnum(TaskStatus),
    assignee: z.union([z.literal('me'), z.null()])
  })
  .partial();

router.patch(
  '/tasks/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = taskPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const task = await prisma.crmTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const me = actor(req);

    const data: Prisma.CrmTaskUpdateInput = {};
    if (d.title !== undefined) data.title = d.title;
    if (d.dueAt !== undefined) data.dueAt = d.dueAt ? new Date(d.dueAt) : null;
    if (d.status !== undefined && d.status !== task.status) {
      data.status = d.status;
      data.completedAt = d.status === 'DONE' ? new Date() : null;
    }
    if (d.assignee === 'me') {
      data.assigneeId = me.id;
      data.assigneeName = me.name;
    } else if (d.assignee === null) {
      data.assigneeId = null;
      data.assigneeName = null;
    }

    const updated = await prisma.crmTask.update({ where: { id: task.id }, data });
    await writeAuditLog(req, {
      action: 'TASK_CHANGED',
      resource: 'task',
      resourceId: task.id,
      summary: d.status && d.status !== task.status ? `Marked "${task.title}" ${d.status.toLowerCase()}` : `Edited task "${task.title}"`
    });
    return res.json({ task: updated });
  })
);

router.delete(
  '/tasks/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const task = await prisma.crmTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await prisma.crmTask.delete({ where: { id: task.id } });
    await writeAuditLog(req, {
      action: 'TASK_CHANGED',
      resource: 'task',
      resourceId: task.id,
      summary: `Deleted task "${task.title}"`
    });
    return res.json({ ok: true });
  })
);

// ── Account notes & tags ────────────────────────────────────────────────────

router.get(
  '/tags',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const tags = await prisma.crmTag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
    return res.json({ tags });
  })
);

/** Everything the CRM knows about one account, for the profile panel. */
router.get(
  '/profiles/:userId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const [notes, tags, tasks] = await Promise.all([
      prisma.crmNote.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.crmUserTag.findMany({ where: { userId }, include: { tag: true }, orderBy: { tag: { name: 'asc' } } }),
      prisma.crmTask.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 50 })
    ]);
    return res.json({ notes, tags: tags.map((t) => ({ id: t.tag.id, name: t.tag.name })), tasks });
  })
);

const noteSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(4000) });

router.post(
  '/profiles/:userId/notes',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const me = actor(req);

    const note = await prisma.crmNote.create({
      data: { userId: user.id, body: parsed.data.body, authorId: me.id, authorName: me.name }
    });
    await writeAuditLog(req, {
      action: 'CRM_NOTE_ADDED',
      resource: 'user',
      resourceId: user.id,
      summary: `Added a note on ${user.name}`
    });
    return res.status(201).json({ note });
  })
);

router.delete(
  '/notes/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const note = await prisma.crmNote.findUnique({ where: { id: req.params.id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await prisma.crmNote.delete({ where: { id: note.id } });
    await writeAuditLog(req, {
      action: 'CRM_NOTE_ADDED',
      resource: 'user',
      resourceId: note.userId,
      summary: 'Deleted a CRM note'
    });
    return res.json({ ok: true });
  })
);

const tagSchema = z.object({ name: z.string().trim().toLowerCase().min(2).max(30) });

router.post(
  '/profiles/:userId/tags',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const tag = await prisma.crmTag.upsert({
      where: { name: parsed.data.name },
      create: { name: parsed.data.name },
      update: {}
    });
    await prisma.crmUserTag.upsert({
      where: { userId_tagId: { userId: user.id, tagId: tag.id } },
      create: { userId: user.id, tagId: tag.id },
      update: {}
    });
    await writeAuditLog(req, {
      action: 'CRM_TAG_CHANGED',
      resource: 'user',
      resourceId: user.id,
      summary: `Tagged ${user.name} "${tag.name}"`
    });
    return res.status(201).json({ tag: { id: tag.id, name: tag.name } });
  })
);

router.delete(
  '/profiles/:userId/tags/:tagId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId, tagId } = req.params;
    const link = await prisma.crmUserTag.findUnique({
      where: { userId_tagId: { userId, tagId } },
      include: { tag: true, user: { select: { name: true } } }
    });
    if (!link) return res.status(404).json({ error: 'Tag not found on this account' });
    await prisma.crmUserTag.delete({ where: { userId_tagId: { userId, tagId } } });
    await writeAuditLog(req, {
      action: 'CRM_TAG_CHANGED',
      resource: 'user',
      resourceId: userId,
      summary: `Removed tag "${link.tag.name}" from ${link.user.name}`
    });
    return res.json({ ok: true });
  })
);

export default router;
