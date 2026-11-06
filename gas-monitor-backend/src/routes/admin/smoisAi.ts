import { Router } from 'express';
import { z } from 'zod';
import { requireSmois } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { smosCan } from '../../lib/smois';
import { ANALYST_SYSTEM, AiError, WRITER_SYSTEM, aiEnabled, aiModel, aiRateLimited, askClaude } from '../../lib/smoisAi';
import {
  actor, assignedAccountIds, isManagement, kpiActual, kpiStatus, logActivity, parsePeriod, previousPeriod, endOfDay, summariseSnapshots, toDay
} from '../../lib/smoisCore';

/**
 * SMOIS phase 4: rule-based management alerts, and an optional Claude
 * assistant for copy, questions about the data, and report drafts.
 *
 * The assistant only receives aggregates the caller is already allowed to see.
 * Contact details and message text are never sent. Everything it returns is a
 * draft for a person to check.
 */
const router = Router();

// ── Alerts (no model: plain rules) ──────────────────────────────────────────

router.get(
  '/alerts',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const mgmt = isManagement(req);
    const me = req.admin!.adminId;
    const alerts: { level: 'warning' | 'error' | 'info'; text: string; href: string }[] = [];

    const [overdue, stale, pendingReview] = await Promise.all([
      prisma.smosTask.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: now }, ...(mgmt ? {} : { assigneeId: me }) } }),
      prisma.smosContent.count({ where: { status: 'SUBMITTED', updatedAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } }),
      smosCan(req.smos ?? null, 'smois.reports.review') ? prisma.smosReport.count({ where: { status: 'SUBMITTED' } }) : Promise.resolve(0)
    ]);
    if (overdue) alerts.push({ level: 'error', text: `${overdue} task${overdue > 1 ? 's are' : ' is'} overdue`, href: '/dashboard/smois/tasks?due=overdue' });
    if (stale) alerts.push({ level: 'warning', text: `${stale} submission${stale > 1 ? 's have' : ' has'} waited over 24 hours for review`, href: '/dashboard/smois/content?status=SUBMITTED' });
    if (pendingReview) alerts.push({ level: 'info', text: `${pendingReview} report${pendingReview > 1 ? 's' : ''} waiting for review`, href: '/dashboard/smois/reports' });

    if (smosCan(req.smos ?? null, 'smois.analytics.read')) {
      const accounts = await prisma.socialAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      const week = new Date(now.getTime() - 7 * 86400000);
      const recent = await prisma.smosMetricSnapshot.groupBy({ by: ['accountId'], where: { date: { gte: week } }, _count: true });
      const have = new Set(recent.map((r) => r.accountId));
      const missing = accounts.filter((a) => !have.has(a.id));
      if (missing.length) alerts.push({ level: 'warning', text: `No figures recorded in 7 days for: ${missing.slice(0, 4).map((m) => m.name).join(', ')}${missing.length > 4 ? '…' : ''}`, href: '/dashboard/smois/analytics' });

      const kpis = await prisma.smosKpi.findMany({ where: { periodEnd: { gte: now } }, take: 50 });
      for (const k of kpis) {
        const { status } = kpiStatus(k, await kpiActual(k));
        if (status === 'AT_RISK') alerts.push({ level: 'warning', text: `Target "${k.name}" is at risk`, href: '/dashboard/smois/kpis' });
      }
    }
    if (smosCan(req.smos ?? null, 'smois.inbox.work')) {
      const open = await prisma.smosConversation.findMany({ where: { status: { in: ['NEW', 'OPEN', 'IN_PROGRESS', 'ESCALATED'] }, firstResponseAt: null }, select: { priority: true, receivedAt: true } });
      const target: Record<string, number> = { HIGH: 30, NORMAL: 120, LOW: 1440 };
      const late = open.filter((c) => now.getTime() - c.receivedAt.getTime() > (target[c.priority] ?? 120) * 60000).length;
      if (late) alerts.push({ level: 'error', text: `${late} enquir${late > 1 ? 'ies are' : 'y is'} past the reply target`, href: '/dashboard/smois/inbox' });
      const escalated = await prisma.smosConversation.count({ where: { status: 'ESCALATED' } });
      if (escalated) alerts.push({ level: 'warning', text: `${escalated} escalated conversation${escalated > 1 ? 's' : ''}`, href: '/dashboard/smois/inbox' });
    }
    return res.json({ data: alerts });
  })
);

// ── Assistant ───────────────────────────────────────────────────────────────

router.get(
  '/ai/status',
  requireSmois('smois.read'),
  asyncHandler(async (_req, res) => res.json({ enabled: aiEnabled(), model: aiEnabled() ? aiModel() : null }))
);

/** Shared gate: configured, rate limited, then errors turned into friendly messages. */
async function withAi(req: Parameters<typeof actor>[0], res: import('express').Response, run: () => Promise<unknown>) {
  if (!aiEnabled()) return res.status(503).json({ error: 'The AI assistant is not switched on. Ask a super admin to set it up.' });
  if (aiRateLimited(actor(req).id)) return res.status(429).json({ error: 'You have used the assistant a lot this hour. Try again later.' });
  try {
    return res.json(await run());
  } catch (e) {
    if (e instanceof AiError) return res.status(502).json({ error: e.message });
    throw e;
  }
}

const DRAFT_NOTE = 'AI-generated draft. Check facts and wording before using it. Nothing is published automatically.';

const TASKS: Record<string, string> = {
  caption: 'Write 3 alternative captions for the post described.',
  ideas: 'Suggest 6 post ideas related to the topic, each in one line.',
  hashtags: 'Suggest up to 10 relevant hashtags, space separated.',
  repurpose: 'Rewrite the text as a short version for another format (for example a story or a reel script).',
  rewrite: 'Rewrite the text for the platform named, keeping its meaning.',
  grammar: 'Fix spelling and grammar only. Return the corrected text.',
  tone: 'Suggest how to make the text friendlier and clearer, as short bullet points, then give the improved text.',
  brief: 'Write a short content brief: objective, audience, key message, call to action.'
};

router.post(
  '/ai/content',
  requireSmois('smois.content.create'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      task: z.enum(Object.keys(TASKS) as [string, ...string[]]),
      platform: z.string().trim().max(40).optional(),
      input: z.string().trim().min(3).max(3000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Describe what you want help with' });
    const { task, platform, input } = parsed.data;
    return withAi(req, res, async () => {
      const text = await askClaude(WRITER_SYSTEM, `${TASKS[task]}${platform ? `\nPlatform: ${platform}` : ''}\n\nText or topic:\n${input}`, 900);
      await logActivity(req, 'ai', 'content', `Used the AI assistant for ${task}`);
      return { text, note: DRAFT_NOTE };
    });
  })
);

/** Builds the data the assistant may use, from what THIS admin can see. */
async function analystContext(req: Parameters<typeof actor>[0], from: Date, to: Date, days: number) {
  const mgmt = isManagement(req);
  const prev = previousPeriod({ from, days });
  const readable: string[] | 'ALL' = mgmt || req.smos === 'VIEWER' ? 'ALL' : await assignedAccountIds(req.admin!.adminId);
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true, ...(readable === 'ALL' ? {} : { id: { in: readable } }) },
    select: { id: true, name: true, platform: true }
  });
  const ids = accounts.map((a) => a.id);
  const [snaps, prevSnaps, posts, content, tasks, kpis] = await Promise.all([
    prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: ids }, date: { gte: from, lte: to } } }),
    prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: ids }, date: { gte: prev.from, lte: prev.to } } }),
    prisma.smosPublication.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, publishedAt: { gte: from, lte: endOfDay(to) } }, _count: true }),
    prisma.smosContent.groupBy({ by: ['status'], _count: true }),
    prisma.smosTask.groupBy({ by: ['status'], where: mgmt ? {} : { assigneeId: req.admin!.adminId }, _count: true }),
    prisma.smosKpi.findMany({ where: { periodEnd: { gte: from }, periodStart: { lte: to } }, take: 30, include: { account: { select: { name: true } } } })
  ]);
  const ctx: Record<string, unknown> = {
    period: { from: toDay(from), to: toDay(to), days },
    previousPeriod: { from: toDay(prev.from), to: toDay(prev.to) },
    dataSource: 'Figures were typed in by the team (source MANUAL or ESTIMATED). No platform is connected.',
    accounts: accounts.map((a) => ({
      name: a.name, platform: a.platform,
      current: summariseSnapshots(snaps.filter((s) => s.accountId === a.id), days),
      previous: summariseSnapshots(prevSnaps.filter((s) => s.accountId === a.id), prev.days),
      postsPublishedInPeriod: posts.find((p) => p.accountId === a.id)?._count ?? 0,
      sources: [...new Set(snaps.filter((s) => s.accountId === a.id).map((s) => s.source))]
    })),
    contentByStatus: Object.fromEntries(content.map((c) => [c.status, c._count])),
    tasksByStatus: Object.fromEntries(tasks.map((t) => [t.status, t._count])),
    targets: await Promise.all(kpis.map(async (k) => {
      const actual = await kpiActual(k);
      return { name: k.name, measure: k.metric, goal: k.targetValue, account: k.account?.name ?? 'all', owner: k.assigneeName ?? 'team', actual, ...kpiStatus(k, actual) };
    }))
  };
  // Per-person output only for management, and only counts: no judgements.
  if (smosCan(req.smos ?? null, 'smois.performance.read')) {
    const [pubs, done] = await Promise.all([
      prisma.smosPublication.groupBy({ by: ['recordedByName'], where: { publishedAt: { gte: from, lte: endOfDay(to) } }, _count: true }),
      prisma.smosTask.groupBy({ by: ['assigneeName'], where: { status: 'COMPLETED', completedAt: { gte: from, lte: endOfDay(to) } }, _count: true })
    ]);
    ctx.postsRecordedByPerson = Object.fromEntries(pubs.map((p) => [p.recordedByName, p._count]));
    ctx.tasksCompletedByPerson = Object.fromEntries(done.map((d) => [d.assigneeName, d._count]));
  }
  return ctx;
}

router.post(
  '/ai/ask',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ question: z.string().trim().min(5).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Ask a question of at least a few words' });
    const { from, to, days } = parsePeriod(req);
    return withAi(req, res, async () => {
      const context = await analystContext(req, from, to, days);
      const json = JSON.stringify(context);
      const answer = await askClaude(ANALYST_SYSTEM, `Data:\n${json.length > 30000 ? json.slice(0, 30000) : json}\n\nQuestion: ${parsed.data.question}`, 900);
      await logActivity(req, 'ai', 'ask', 'Asked the AI analyst a question', { period: `${toDay(from)} to ${toDay(to)}` });
      // The data used is returned so the reader can check the answer against it.
      return { answer, basis: context, note: DRAFT_NOTE };
    });
  })
);

router.post(
  '/ai/report-draft',
  requireSmois('smois.reports.write'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ reportId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a report' });
    const report = await prisma.smosReport.findUnique({ where: { id: parsed.data.reportId } });
    if (!report || report.authorId !== req.admin!.adminId) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'DRAFT' && report.status !== 'RETURNED') return res.status(409).json({ error: 'A submitted report cannot be edited' });
    const days = Math.round((report.periodEnd.getTime() - report.periodStart.getTime()) / 86400000) + 1;
    return withAi(req, res, async () => {
      // Own work only: the author's tasks and posts, plus their assigned accounts.
      const [tasks, posts, accountIds] = await Promise.all([
        prisma.smosTask.groupBy({ by: ['status'], where: { assigneeId: report.authorId, dueAt: { gte: report.periodStart, lte: endOfDay(report.periodEnd) } }, _count: true }),
        prisma.smosPublication.count({ where: { recordedById: report.authorId, publishedAt: { gte: report.periodStart, lte: endOfDay(report.periodEnd) } } }),
        assignedAccountIds(report.authorId)
      ]);
      const snaps = await prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: accountIds }, date: { gte: report.periodStart, lte: report.periodEnd } }, include: { account: { select: { name: true } } } });
      const data = {
        reportType: report.type, period: { from: toDay(report.periodStart), to: toDay(report.periodEnd) },
        tasksByStatus: Object.fromEntries(tasks.map((t) => [t.status, t._count])), postsPublished: posts,
        accounts: accountIds.map((id) => ({ name: snaps.find((s) => s.accountId === id)?.account.name ?? id, ...summariseSnapshots(snaps.filter((s) => s.accountId === id), days) }))
      };
      const text = await askClaude(
        ANALYST_SYSTEM,
        `Write a first draft of the "summary and work completed" section of a ${report.type.toLowerCase()} social media report, in the first person, 4 to 6 sentences, from this data only. Leave challenges and recommendations to the author.\n\nData:\n${JSON.stringify(data)}`,
        700
      );
      await logActivity(req, 'ai', report.id, 'Asked the AI for a report summary draft');
      return { text, note: DRAFT_NOTE };
    });
  })
);

export default router;
