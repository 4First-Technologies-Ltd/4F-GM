import { Request, Router } from 'express';
import { Prisma, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { sendTicketReplyEmail } from '../../lib/email';
import { createTicket, slaDueFor } from '../../lib/tickets';

/**
 * Support inbox. Unlike most admin mutations, ticket work is open to every
 * admin role including SUPPORT: answering customers is what that role is for.
 * Managing canned replies stays OPERATIONS-only.
 */
const router = Router();

const adminName = (req: Request) => req.admin!.name;
const adminId = (req: Request) => req.admin!.adminId;

const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'PENDING'];

// ── Overview ────────────────────────────────────────────────────────────────

router.get(
  '/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const [open, pending, unassigned, breached, mine] = await Promise.all([
      prisma.ticket.count({ where: { status: 'OPEN' } }),
      prisma.ticket.count({ where: { status: 'PENDING' } }),
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES }, assigneeId: null } }),
      prisma.ticket.count({
        where: { status: { in: OPEN_STATUSES }, firstResponseAt: null, slaDueAt: { lt: now } }
      }),
      prisma.ticket.count({ where: { status: { in: OPEN_STATUSES }, assigneeId: adminId(req) } })
    ]);
    return res.json({ open, pending, unassigned, slaBreached: breached, assignedToMe: mine });
  })
);

// ── Canned replies (before /:id so "canned-replies" isn't read as an id) ────

router.get(
  '/canned-replies',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const replies = await prisma.cannedReply.findMany({ orderBy: { title: 'asc' } });
    return res.json({ replies });
  })
);

const cannedSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(4000)
});

router.post(
  '/canned-replies',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = cannedSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const reply = await prisma.cannedReply.create({ data: parsed.data });
    await writeAuditLog(req, {
      action: 'CANNED_REPLY_CHANGED',
      resource: 'canned_reply',
      resourceId: reply.id,
      summary: `Created canned reply "${reply.title}"`
    });
    return res.status(201).json({ reply });
  })
);

router.patch(
  '/canned-replies/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = cannedSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const existing = await prisma.cannedReply.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Canned reply not found' });
    const reply = await prisma.cannedReply.update({ where: { id: existing.id }, data: parsed.data });
    await writeAuditLog(req, {
      action: 'CANNED_REPLY_CHANGED',
      resource: 'canned_reply',
      resourceId: reply.id,
      summary: `Edited canned reply "${reply.title}"`
    });
    return res.json({ reply });
  })
);

router.delete(
  '/canned-replies/:id',
  requireOperations,
  asyncHandler(async (req, res) => {
    const existing = await prisma.cannedReply.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Canned reply not found' });
    await prisma.cannedReply.delete({ where: { id: existing.id } });
    await writeAuditLog(req, {
      action: 'CANNED_REPLY_CHANGED',
      resource: 'canned_reply',
      resourceId: existing.id,
      summary: `Deleted canned reply "${existing.title}"`
    });
    return res.json({ ok: true });
  })
);

// ── Tickets ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status, priority, category, assignee, sla } = req.query;

    const where: Prisma.TicketWhereInput = {};
    if (status === 'active') where.status = { in: OPEN_STATUSES };
    else if (typeof status === 'string' && status in TicketStatus) where.status = status as TicketStatus;
    if (typeof priority === 'string' && priority in TicketPriority) where.priority = priority as TicketPriority;
    if (typeof category === 'string' && category in TicketCategory) where.category = category as TicketCategory;
    if (assignee === 'me') where.assigneeId = adminId(req);
    else if (assignee === 'unassigned') where.assigneeId = null;
    if (sla === 'breached') {
      where.status = { in: OPEN_STATUSES };
      where.firstResponseAt = null;
      where.slaDueAt = { lt: new Date() };
    }
    if (query.q) {
      const number = Number(query.q.replace('#', ''));
      where.OR = [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { requesterName: { contains: query.q, mode: 'insensitive' } },
        { requesterEmail: { contains: query.q, mode: 'insensitive' } },
        ...(Number.isInteger(number) ? [{ number }] : [])
      ];
    }

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: { _count: { select: { messages: true } } },
        orderBy: orderBy(query, ['lastMessageAt', 'createdAt', 'priority', 'slaDueAt'] as const, 'lastMessageAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.ticket.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        requester: { select: { id: true, name: true, role: true, phone: true, createdAt: true } },
        order: {
          select: { id: true, status: true, totalAmount: true, cylinderSize: true, quantity: true, createdAt: true }
        }
      }
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json({ ticket });
  })
);

const createSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(2).max(8000),
  requesterName: z.string().trim().min(2).max(120),
  requesterEmail: z.string().email(),
  category: z.nativeEnum(TicketCategory).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  orderId: z.string().min(1).optional()
});

// For tickets that arrive by phone or WhatsApp and need to be tracked.
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    if (parsed.data.orderId) {
      const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true } });
      if (!order) return res.status(400).json({ error: 'Order not found' });
    }

    const ticket = await createTicket({ ...parsed.data, channel: 'ADMIN' });
    await writeAuditLog(req, {
      action: 'TICKET_CREATED',
      resource: 'ticket',
      resourceId: ticket.id,
      summary: `Opened ticket #${ticket.number}: ${ticket.subject}`
    });
    return res.status(201).json({ ticket });
  })
);

const patchSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  category: z.nativeEnum(TicketCategory).optional(),
  // 'me' claims it; null releases it.
  assignee: z.union([z.literal('me'), z.null()]).optional()
});

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { status, priority, category, assignee } = parsed.data;
    const data: Prisma.TicketUpdateInput = {};
    const changes: string[] = [];

    if (status && status !== ticket.status) {
      data.status = status;
      data.resolvedAt = status === 'RESOLVED' || status === 'CLOSED' ? (ticket.resolvedAt ?? new Date()) : null;
      changes.push(`status ${ticket.status} → ${status}`);
    }
    if (priority && priority !== ticket.priority) {
      data.priority = priority;
      // Re-time the SLA from creation, but never revive a response that already happened.
      if (!ticket.firstResponseAt) data.slaDueAt = slaDueFor(priority, ticket.createdAt);
      changes.push(`priority ${ticket.priority} → ${priority}`);
    }
    if (category && category !== ticket.category) {
      data.category = category;
      changes.push(`category ${ticket.category} → ${category}`);
    }
    if (assignee === 'me') {
      data.assigneeId = adminId(req);
      data.assigneeName = adminName(req);
      changes.push(`assigned to ${adminName(req)}`);
    } else if (assignee === null && ticket.assigneeId) {
      data.assigneeId = null;
      data.assigneeName = null;
      changes.push('unassigned');
    }

    if (changes.length === 0) return res.json({ ticket });

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...data,
        messages: {
          create: {
            author: 'SYSTEM',
            authorName: adminName(req),
            authorId: adminId(req),
            body: `${adminName(req)}: ${changes.join(', ')}`,
            internal: true
          }
        }
      }
    });
    await writeAuditLog(req, {
      action: 'TICKET_UPDATED',
      resource: 'ticket',
      resourceId: ticket.id,
      summary: `Ticket #${ticket.number}: ${changes.join(', ')}`
    });
    return res.json({ ticket: updated });
  })
);

const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(8000),
  // 'reply' emails the requester; 'note' is internal; 'requester' logs a reply
  // the customer sent by other means (inbound email is not wired up yet).
  kind: z.enum(['reply', 'note', 'requester']).default('reply')
});

router.post(
  '/:id/messages',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { body, kind } = parsed.data;

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.status === 'CLOSED') {
      return res.status(409).json({ error: 'This ticket is closed. Reopen it to add a message.' });
    }

    const now = new Date();
    const fromRequester = kind === 'requester';
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        author: fromRequester ? 'REQUESTER' : 'ADMIN',
        authorName: fromRequester ? ticket.requesterName : adminName(req),
        authorId: fromRequester ? null : adminId(req),
        body,
        internal: kind === 'note'
      }
    });

    const update: Prisma.TicketUpdateInput = { lastMessageAt: now };
    if (kind === 'reply') {
      update.firstResponseAt = ticket.firstResponseAt ?? now;
      update.status = 'PENDING'; // ball is in the customer's court
      // Replying claims an unassigned ticket so two agents don't both answer.
      if (!ticket.assigneeId) {
        update.assigneeId = adminId(req);
        update.assigneeName = adminName(req);
      }
    } else if (fromRequester) {
      update.status = 'OPEN';
      update.resolvedAt = null;
    }
    await prisma.ticket.update({ where: { id: ticket.id }, data: update });

    let emailed: boolean | null = null;
    if (kind === 'reply') {
      emailed = await sendTicketReplyEmail({
        to: ticket.requesterEmail,
        name: ticket.requesterName,
        ticketNumber: ticket.number,
        subject: ticket.subject,
        body
      });
      await writeAuditLog(req, {
        action: 'TICKET_REPLIED',
        resource: 'ticket',
        resourceId: ticket.id,
        summary: `Replied on ticket #${ticket.number}${emailed ? '' : ' (email not delivered)'}`
      });
    }

    return res.status(201).json({ message, emailed });
  })
);

export default router;
