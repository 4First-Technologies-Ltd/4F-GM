import { Router } from 'express';
import { Prisma, SmosCampaignStatus, SmosConversationStatus, SmosSentiment } from '@prisma/client';
import { z } from 'zod';
import { requireSmois } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { actor, endOfDay, logActivity, parseDay, parsePeriod, startOfToday, toDay } from '../../lib/smoisCore';

/**
 * SMOIS phase 3: shared inbox, contacts, campaigns, social listening,
 * competitor benchmarking and the brand asset library.
 *
 * Conversations, mentions and competitor readings are logged by people from
 * what they can see on the platforms; nothing here is fed by an API.
 */
const router = Router();

const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS'] as const;
const OPEN_STATES: SmosConversationStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'ESCALATED'];

// ── Contacts ────────────────────────────────────────────────────────────────

const contactSchema = z.object({
  platform: z.enum(PLATFORMS),
  displayName: z.string().trim().min(1).max(120),
  username: z.string().trim().max(120).optional().nullable(),
  profileUrl: z.string().trim().url().max(500).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  category: z.enum(['PROSPECT', 'CUSTOMER', 'POTENTIAL', 'PARTNER', 'INFLUENCER', 'MEDIA', 'APPLICANT', 'SUPPORT_CASE', 'OTHER']).default('OTHER'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  consentNote: z.string().trim().max(500).optional().nullable()
});

router.get(
  '/contacts',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SmosContactWhereInput = {};
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { username: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    if (typeof req.query.category === 'string' && req.query.category) where.category = req.query.category;
    const [rows, total] = await Promise.all([
      prisma.smosContact.findMany({
        where,
        orderBy: orderBy(query, ['displayName', 'createdAt'] as const, 'displayName'),
        skip: query.skip,
        take: query.take,
        include: { _count: { select: { conversations: true } } }
      }),
      prisma.smosContact.count({ where })
    ]);
    return res.json(paginated(rows, total, query));
  })
);

router.post(
  '/contacts',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const a = actor(req);
    const d = parsed.data;
    const contact = await prisma.smosContact.create({
      data: {
        ...d,
        username: trim(d.username), profileUrl: trim(d.profileUrl), email: trim(d.email), phone: trim(d.phone),
        location: trim(d.location), notes: trim(d.notes), consentNote: trim(d.consentNote),
        createdById: a.id, createdByName: a.name
      }
    });
    await logActivity(req, 'contact', contact.id, `Added contact ${contact.displayName}`);
    return res.status(201).json({ contact });
  })
);

router.patch(
  '/contacts/:id',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const parsed = contactSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosContact.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    const contact = await prisma.smosContact.update({ where: { id: existing.id }, data: parsed.data });
    await logActivity(req, 'contact', contact.id, `Updated contact ${contact.displayName}`, { fields: Object.keys(parsed.data) });
    return res.json({ contact });
  })
);

router.get(
  '/contacts/:id',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const contact = await prisma.smosContact.findUnique({
      where: { id: req.params.id },
      include: { conversations: { orderBy: { receivedAt: 'desc' }, take: 50, select: { id: true, subject: true, status: true, kind: true, receivedAt: true } } }
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    return res.json({ contact });
  })
);

// Erasure on request (Nigeria Data Protection Act). Conversations stay, unlinked.
router.delete(
  '/contacts/:id',
  requireSmois('smois.campaigns.manage'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.smosContact.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    await prisma.$transaction([
      prisma.smosConversation.updateMany({ where: { contactId: existing.id }, data: { contactId: null } }),
      prisma.smosContact.delete({ where: { id: existing.id } })
    ]);
    await logActivity(req, 'contact', existing.id, `Erased contact record for ${existing.displayName}`);
    return res.json({ ok: true });
  })
);

// ── Inbox ───────────────────────────────────────────────────────────────────

/** Response-time targets in minutes (PRD 14.8). Wall-clock: business hours are not modelled yet. */
const SLA_MINUTES: Record<string, number> = { HIGH: 30, NORMAL: 120, LOW: 24 * 60 };

function sla(c: { priority: string; receivedAt: Date; firstResponseAt: Date | null; status: SmosConversationStatus }) {
  const target = SLA_MINUTES[c.priority] ?? 120;
  const dueAt = new Date(c.receivedAt.getTime() + target * 60000);
  const responded = c.firstResponseAt;
  const breached = responded ? responded > dueAt : !['RESOLVED', 'CLOSED'].includes(c.status) && new Date() > dueAt;
  return { targetMinutes: target, dueAt, responded: !!responded, breached };
}

router.get(
  '/inbox',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const where: Prisma.SmosConversationWhereInput = {};
    if (req.query.open === '1') where.status = { in: OPEN_STATES };
    else if (typeof req.query.status === 'string' && req.query.status in SmosConversationStatus) where.status = req.query.status as SmosConversationStatus;
    if (req.query.mine === '1') where.ownerId = req.admin!.adminId;
    if (req.query.unassigned === '1') where.ownerId = null;
    if (typeof req.query.accountId === 'string' && req.query.accountId) where.accountId = req.query.accountId;
    if (query.q) where.subject = { contains: query.q, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      prisma.smosConversation.findMany({
        where,
        orderBy: orderBy(query, ['receivedAt', 'updatedAt', 'priority'] as const, 'receivedAt'),
        skip: query.skip,
        take: query.take,
        include: { contact: { select: { id: true, displayName: true, username: true, platform: true } }, _count: { select: { messages: true } } }
      }),
      prisma.smosConversation.count({ where })
    ]);
    return res.json(paginated(rows.map((r) => ({ ...r, sla: sla(r) })), total, query));
  })
);

const conversationSchema = z.object({
  accountId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  kind: z.enum(['DM', 'COMMENT', 'MENTION', 'ENQUIRY']).default('DM'),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(1).max(4000),
  priority: z.enum(['HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
  receivedAt: z.string().datetime().optional()
});

router.post(
  '/inbox',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const parsed = conversationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (!(await prisma.socialAccount.findUnique({ where: { id: d.accountId }, select: { id: true } }))) return res.status(404).json({ error: 'Account not found' });
    const a = actor(req);
    const receivedAt = d.receivedAt ? new Date(d.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + 5 * 60000) return res.status(400).json({ error: 'Received time cannot be in the future' });
    const conversation = await prisma.smosConversation.create({
      data: {
        accountId: d.accountId, contactId: d.contactId || null, kind: d.kind, subject: d.subject, priority: d.priority, receivedAt,
        createdById: a.id, createdByName: a.name,
        messages: { create: { direction: 'INBOUND', body: d.body, authorId: a.id, authorName: a.name, createdAt: receivedAt } }
      }
    });
    await logActivity(req, 'inbox', conversation.id, `Logged ${d.kind.toLowerCase()} "${d.subject}"`);
    return res.status(201).json({ conversation });
  })
);

router.get(
  '/inbox/:id',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const c = await prisma.smosConversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true, messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ conversation: { ...c, sla: sla(c) } });
  })
);

router.post(
  '/inbox/:id/claim',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const a = actor(req);
    const c = await prisma.smosConversation.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    if (['RESOLVED', 'CLOSED'].includes(c.status)) return res.status(409).json({ error: 'This conversation is finished' });
    // Compare-and-set: two people cannot both take it.
    const r = await prisma.smosConversation.updateMany({
      where: { id: c.id, OR: [{ ownerId: null }, { ownerId: a.id }] },
      data: { ownerId: a.id, ownerName: a.name, status: c.status === 'NEW' ? 'OPEN' : c.status }
    });
    if (r.count === 0) return res.status(409).json({ error: `${c.ownerName} already owns this conversation` });
    await logActivity(req, 'inbox', c.id, `Took ownership of "${c.subject}"`);
    return res.json({ ok: true });
  })
);

router.post(
  '/inbox/:id/reply',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ body: z.string().trim().min(1).max(4000), direction: z.enum(['OUTBOUND', 'NOTE']).default('OUTBOUND') }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Write the message' });
    const a = actor(req);
    const c = await prisma.smosConversation.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    if (['RESOLVED', 'CLOSED'].includes(c.status)) return res.status(409).json({ error: 'Reopen it first' });
    // One owner replies; others leave notes. Stops duplicate answers.
    if (parsed.data.direction === 'OUTBOUND' && c.ownerId && c.ownerId !== a.id) {
      return res.status(409).json({ error: `${c.ownerName} owns this conversation. Add a note, or ask them to hand it over.` });
    }
    const outbound = parsed.data.direction === 'OUTBOUND';
    await prisma.$transaction([
      prisma.smosMessage.create({ data: { conversationId: c.id, direction: parsed.data.direction, body: parsed.data.body, authorId: a.id, authorName: a.name } }),
      prisma.smosConversation.update({
        where: { id: c.id },
        data: {
          ...(outbound && !c.firstResponseAt ? { firstResponseAt: new Date() } : {}),
          ...(outbound ? { status: 'WAITING_CUSTOMER', ownerId: c.ownerId ?? a.id, ownerName: c.ownerName ?? a.name } : {})
        }
      })
    ]);
    await logActivity(req, 'inbox', c.id, `${outbound ? 'Replied to' : 'Noted on'} "${c.subject}"`);
    return res.status(201).json({ ok: true });
  })
);

router.post(
  '/inbox/:id/status',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']),
      escalationType: z.enum(['COMPLAINT', 'LEGAL', 'SECURITY', 'PRODUCT', 'MEDIA', 'PARTNERSHIP', 'SENSITIVE']).optional(),
      escalationNote: z.string().trim().max(1000).optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { status } = parsed.data;
    if (status === 'ESCALATED' && (!parsed.data.escalationType || !trim(parsed.data.escalationNote))) {
      return res.status(400).json({ error: 'Say what kind of escalation this is and why' });
    }
    const a = actor(req);
    const c = await prisma.smosConversation.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    if (c.ownerId && c.ownerId !== a.id && req.smos !== 'MANAGEMENT' && req.smos !== 'ADMIN') {
      return res.status(403).json({ error: `${c.ownerName} owns this conversation` });
    }
    await prisma.smosConversation.update({
      where: { id: c.id },
      data: {
        status,
        ...(status === 'RESOLVED' || status === 'CLOSED' ? { resolvedAt: new Date() } : { resolvedAt: null }),
        ...(status === 'ESCALATED' ? { escalationType: parsed.data.escalationType, escalationNote: trim(parsed.data.escalationNote) } : {})
      }
    });
    await logActivity(req, 'inbox', c.id, `Moved "${c.subject}" to ${status}`, { escalationType: parsed.data.escalationType ?? null });
    return res.json({ ok: true });
  })
);

router.get(
  '/inbox-summary',
  requireSmois('smois.inbox.work'),
  asyncHandler(async (_req, res) => {
    const [open, unassigned, escalated, responded, breachedOpen] = await Promise.all([
      prisma.smosConversation.count({ where: { status: { in: OPEN_STATES } } }),
      prisma.smosConversation.count({ where: { status: { in: OPEN_STATES }, ownerId: null } }),
      prisma.smosConversation.count({ where: { status: 'ESCALATED' } }),
      prisma.smosConversation.findMany({
        where: { firstResponseAt: { not: null }, receivedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
        select: { receivedAt: true, firstResponseAt: true, priority: true },
        take: 1000
      }),
      prisma.smosConversation.findMany({ where: { status: { in: OPEN_STATES }, firstResponseAt: null }, select: { priority: true, receivedAt: true, firstResponseAt: true, status: true } })
    ]);
    const mins = responded.map((r) => (r.firstResponseAt!.getTime() - r.receivedAt.getTime()) / 60000).sort((a, b) => a - b);
    const withinTarget = responded.filter((r) => !sla({ ...r, status: 'RESOLVED' }).breached).length;
    return res.json({
      open, unassigned, escalated,
      overdueNow: breachedOpen.filter((c) => sla(c).breached).length,
      last30Days: {
        answered: responded.length,
        medianFirstResponseMinutes: mins.length ? Math.round(mins[Math.floor(mins.length / 2)]) : null,
        withinTargetPct: responded.length ? Math.round((withinTarget / responded.length) * 1000) / 10 : null
      },
      note: 'Targets: high 30 min, normal 2 h, low 24 h, measured on the wall clock. Business hours are not modelled yet.'
    });
  })
);

// ── Campaigns ───────────────────────────────────────────────────────────────

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(['BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'LEAD_GENERATION', 'ENGAGEMENT', 'RECRUITMENT', 'EVENT', 'PARTNERSHIP', 'SALES_PROMOTION', 'PUBLIC_RELATIONS', 'EDUCATION']).default('BRAND_AWARENESS'),
  objective: z.string().trim().max(1000).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  targetAudience: z.string().trim().max(500).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.number().int().min(0).max(10_000_000_000).optional().nullable(),
  spend: z.number().int().min(0).max(10_000_000_000).optional().nullable(),
  leads: z.number().int().min(0).optional().nullable(),
  expectedResults: z.string().trim().max(1000).optional().nullable(),
  actualResults: z.string().trim().max(2000).optional().nullable(),
  lessons: z.string().trim().max(3000).optional().nullable(),
  trackingLinks: z.array(z.string().trim().url().max(500)).max(20).default([])
});

router.get(
  '/campaigns',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const where: Prisma.SmosCampaignWhereInput = {};
    if (typeof req.query.status === 'string' && req.query.status in SmosCampaignStatus) where.status = req.query.status as SmosCampaignStatus;
    const rows = await prisma.smosCampaign.findMany({
      where, orderBy: { startDate: 'desc' }, take: 100,
      include: { _count: { select: { content: true } } }
    });
    return res.json({ data: rows.map((r) => ({ ...r, startDate: toDay(r.startDate), endDate: toDay(r.endDate) })) });
  })
);

router.post(
  '/campaigns',
  requireSmois('smois.campaigns.manage'),
  asyncHandler(async (req, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const start = parseDay(d.startDate)!, end = parseDay(d.endDate)!;
    if (end < start) return res.status(400).json({ error: 'The end date is before the start date' });
    const a = actor(req);
    const campaign = await prisma.smosCampaign.create({ data: { ...d, startDate: start, endDate: end, ownerId: a.id, ownerName: a.name } });
    await logActivity(req, 'campaign', campaign.id, `Created campaign "${campaign.name}"`);
    return res.status(201).json({ campaign });
  })
);

router.patch(
  '/campaigns/:id',
  requireSmois('smois.campaigns.manage'),
  asyncHandler(async (req, res) => {
    const parsed = campaignSchema.partial().extend({ status: z.nativeEnum(SmosCampaignStatus).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });
    const { startDate, endDate, ...rest } = parsed.data;
    const campaign = await prisma.smosCampaign.update({
      where: { id: existing.id },
      data: { ...rest, ...(startDate ? { startDate: parseDay(startDate)! } : {}), ...(endDate ? { endDate: parseDay(endDate)! } : {}) }
    });
    await logActivity(req, 'campaign', campaign.id, `Updated campaign "${campaign.name}"${rest.status ? ` (${rest.status})` : ''}`, { fields: Object.keys(parsed.data) });
    return res.json({ campaign });
  })
);

/** Results from the campaign's own content. Paid and organic are not separated: only organic is tracked here. */
router.get(
  '/campaigns/:id/results',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const c = await prisma.smosCampaign.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    const pubs = await prisma.smosPublication.findMany({
      where: { content: { campaignId: c.id } },
      select: { id: true, metrics: { orderBy: { capturedAt: 'desc' }, take: 1 } }
    });
    const latest = pubs.map((p) => p.metrics[0]).filter(Boolean);
    const sum = (k: 'reach' | 'impressions' | 'likes' | 'comments' | 'shares' | 'clicks' | 'videoViews') => {
      const v = latest.map((m) => m[k]).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) : null;
    };
    const engagement = [sum('likes'), sum('comments'), sum('shares')];
    return res.json({
      posts: pubs.length, postsWithFigures: latest.length,
      reach: sum('reach'), impressions: sum('impressions'), clicks: sum('clicks'), videoViews: sum('videoViews'),
      engagement: engagement.some((x) => x != null) ? engagement.reduce<number>((a, b) => a + (b ?? 0), 0) : null,
      budget: c.budget, spend: c.spend, leads: c.leads,
      costPerLead: c.spend != null && c.leads ? Math.round(c.spend / c.leads) : null,
      note: 'Organic post figures only, from the latest reading per post. Paid results are not tracked.'
    });
  })
);

router.post(
  '/content/:id/campaign',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ campaignId: z.string().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a campaign' });
    const content = await prisma.smosContent.findUnique({ where: { id: req.params.id } });
    if (!content) return res.status(404).json({ error: 'Content not found' });
    if (content.creatorId !== req.admin!.adminId && req.smos !== 'MANAGEMENT' && req.smos !== 'ADMIN') return res.status(403).json({ error: 'Only the creator or management can do this' });
    if (parsed.data.campaignId && !(await prisma.smosCampaign.findUnique({ where: { id: parsed.data.campaignId }, select: { id: true } }))) return res.status(404).json({ error: 'Campaign not found' });
    await prisma.smosContent.update({ where: { id: content.id }, data: { campaignId: parsed.data.campaignId } });
    await logActivity(req, 'content', content.id, `${parsed.data.campaignId ? 'Linked' : 'Unlinked'} "${content.title}" ${parsed.data.campaignId ? 'to' : 'from'} a campaign`);
    return res.json({ ok: true });
  })
);

// ── Social listening ────────────────────────────────────────────────────────

const mentionSchema = z.object({
  term: z.string().trim().min(1).max(120),
  platform: z.enum(PLATFORMS).optional().nullable(),
  sourceUrl: z.string().trim().url().max(500).optional().nullable(),
  excerpt: z.string().trim().min(2).max(1000),
  authorHandle: z.string().trim().max(120).optional().nullable(),
  sentiment: z.nativeEnum(SmosSentiment).default('UNCERTAIN'),
  mentionedAt: z.string().datetime().optional()
});

router.get(
  '/mentions',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req);
    const where: Prisma.SmosMentionWhereInput = { mentionedAt: { gte: from, lte: endOfDay(to) } };
    if (typeof req.query.sentiment === 'string' && req.query.sentiment in SmosSentiment) where.sentiment = req.query.sentiment as SmosSentiment;
    const [rows, groups] = await Promise.all([
      prisma.smosMention.findMany({ where, orderBy: { mentionedAt: 'desc' }, take: 200 }),
      prisma.smosMention.groupBy({ by: ['sentiment'], where: { mentionedAt: { gte: from, lte: endOfDay(to) } }, _count: true })
    ]);
    // Alert: negative mentions in the last 7 days more than double the 7 before (and at least 3).
    const now = Date.now();
    const [recent, before] = await Promise.all([
      prisma.smosMention.count({ where: { sentiment: 'NEGATIVE', mentionedAt: { gte: new Date(now - 7 * 86400000) } } }),
      prisma.smosMention.count({ where: { sentiment: 'NEGATIVE', mentionedAt: { gte: new Date(now - 14 * 86400000), lt: new Date(now - 7 * 86400000) } } })
    ]);
    return res.json({
      data: rows,
      counts: Object.fromEntries(groups.map((g) => [g.sentiment, g._count])),
      alert: recent >= 3 && recent > before * 2 ? `Negative mentions rose to ${recent} in the last 7 days (${before} the week before).` : null,
      note: 'Mentions are logged by the team from what they find on the platforms. Sentiment is the logger’s judgement and coverage is partial.'
    });
  })
);

router.post(
  '/mentions',
  requireSmois('smois.listening.write'),
  asyncHandler(async (req, res) => {
    const parsed = mentionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const a = actor(req);
    const d = parsed.data;
    const mention = await prisma.smosMention.create({
      data: { ...d, platform: d.platform ?? null, sourceUrl: trim(d.sourceUrl), authorHandle: trim(d.authorHandle), mentionedAt: d.mentionedAt ? new Date(d.mentionedAt) : new Date(), recordedById: a.id, recordedByName: a.name }
    });
    await logActivity(req, 'mention', mention.id, `Logged a ${mention.sentiment.toLowerCase()} mention of "${mention.term}"`);
    return res.status(201).json({ mention });
  })
);

// ── Competitors ─────────────────────────────────────────────────────────────

const competitorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  website: z.string().trim().url().max(300).optional().nullable(),
  platform: z.enum(PLATFORMS),
  handle: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

router.get(
  '/competitors',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.smosCompetitor.findMany({
      orderBy: { name: 'asc' },
      include: { readings: { orderBy: { date: 'desc' }, take: 2 } }
    });
    return res.json({
      data: rows.map((c) => {
        const [latest, prev] = c.readings;
        return {
          ...c,
          readings: undefined,
          latest: latest ? { ...latest, date: toDay(latest.date) } : null,
          followerChange: latest?.followers != null && prev?.followers != null ? latest.followers - prev.followers : null
        };
      }),
      note: 'Public observations, estimates or third-party data entered by the team, labelled by basis. Not a feed.'
    });
  })
);

router.post(
  '/competitors',
  requireSmois('smois.competitors.manage'),
  asyncHandler(async (req, res) => {
    const parsed = competitorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    try {
      const competitor = await prisma.smosCompetitor.create({ data: parsed.data });
      await logActivity(req, 'competitor', competitor.id, `Added competitor ${competitor.name}`);
      return res.status(201).json({ competitor });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return res.status(409).json({ error: 'That competitor account is already tracked' });
      throw e;
    }
  })
);

router.post(
  '/competitors/:id/readings',
  requireSmois('smois.listening.write'),
  asyncHandler(async (req, res) => {
    const n = z.number().int().min(0).max(2_000_000_000).optional().nullable();
    const parsed = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), followers: n, postsLastWeek: n, avgEngagement: n,
      notes: z.string().trim().max(500).optional().nullable(), basis: z.enum(['PUBLIC_OBSERVATION', 'ESTIMATE', 'THIRD_PARTY']).default('PUBLIC_OBSERVATION')
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { date, ...v } = parsed.data;
    const day = parseDay(date)!;
    if (day > startOfToday()) return res.status(400).json({ error: 'A reading cannot be dated in the future' });
    if (v.followers == null && v.postsLastWeek == null && v.avgEngagement == null) return res.status(400).json({ error: 'Enter at least one figure' });
    const comp = await prisma.smosCompetitor.findUnique({ where: { id: req.params.id } });
    if (!comp) return res.status(404).json({ error: 'Competitor not found' });
    const a = actor(req);
    try {
      const reading = await prisma.smosCompetitorReading.create({ data: { competitorId: comp.id, date: day, ...v, recordedById: a.id, recordedByName: a.name } });
      await logActivity(req, 'competitor', comp.id, `Recorded ${comp.name} figures for ${date}`);
      return res.status(201).json({ reading });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return res.status(409).json({ error: 'There is already a reading for that date' });
      throw e;
    }
  })
);

// ── Asset library ───────────────────────────────────────────────────────────

const assetSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.enum(['LOGO', 'BRAND_GUIDELINES', 'COMPANY_PHOTO', 'EXECUTIVE_PHOTO', 'PRODUCT_PHOTO', 'DESIGN', 'VIDEO', 'TEMPLATE', 'CAMPAIGN', 'EVENT_PHOTO', 'PRESS', 'CAPTION', 'DESCRIPTION', 'OTHER']).default('OTHER'),
  fileType: z.string().trim().max(40).optional().nullable(),
  url: z.string().trim().url().max(1000),
  restrictions: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});

router.get(
  '/assets',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const where: Prisma.SmosAssetWhereInput = { archived: req.query.archived === '1' };
    if (typeof req.query.category === 'string' && req.query.category) where.category = req.query.category;
    if (typeof req.query.q === 'string' && req.query.q.trim()) where.name = { contains: req.query.q.trim(), mode: 'insensitive' };
    const rows = await prisma.smosAsset.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 });
    const today = startOfToday();
    return res.json({ data: rows.map((r) => ({ ...r, expiresAt: r.expiresAt ? toDay(r.expiresAt) : null, expired: !!r.expiresAt && r.expiresAt < today })) });
  })
);

router.post(
  '/assets',
  requireSmois('smois.assets.write'),
  asyncHandler(async (req, res) => {
    const parsed = assetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const a = actor(req);
    const d = parsed.data;
    const asset = await prisma.smosAsset.create({
      data: { ...d, description: trim(d.description), fileType: trim(d.fileType), restrictions: trim(d.restrictions), expiresAt: d.expiresAt ? parseDay(d.expiresAt) : null, uploadedById: a.id, uploadedByName: a.name }
    });
    await logActivity(req, 'asset', asset.id, `Added asset "${asset.name}"`);
    return res.status(201).json({ asset });
  })
);

router.patch(
  '/assets/:id',
  requireSmois('smois.assets.write'),
  asyncHandler(async (req, res) => {
    const parsed = assetSchema.partial().extend({ archived: z.boolean().optional(), approved: z.boolean().optional(), newVersion: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosAsset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    // Approving a brand asset is a management call.
    if (parsed.data.approved !== undefined && req.smos !== 'MANAGEMENT' && req.smos !== 'ADMIN') return res.status(403).json({ error: 'Only management can approve assets' });
    const { newVersion, expiresAt, ...rest } = parsed.data;
    const asset = await prisma.smosAsset.update({
      where: { id: existing.id },
      data: { ...rest, ...(expiresAt !== undefined ? { expiresAt: expiresAt ? parseDay(expiresAt) : null } : {}), ...(newVersion || (rest.url && rest.url !== existing.url) ? { version: { increment: 1 }, approved: false } : {}) }
    });
    await logActivity(req, 'asset', asset.id, `Updated asset "${asset.name}"`, { fields: Object.keys(parsed.data) });
    return res.json({ asset });
  })
);

export default router;
