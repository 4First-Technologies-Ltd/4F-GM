import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireSmois } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { smosCan } from '../../lib/smois';
import {
  KPI_METRICS, METRIC_KEYS, actor, assignedAccountIds, canWorkOnAccount, endOfDay, isManagement, kpiActual,
  kpiStatus, logActivity, parseDay, parsePeriod, previousPeriod, startOfToday, summariseSnapshots, taskCompletionRate, toDay
} from '../../lib/smoisCore';

/**
 * SMOIS insights: daily metric snapshots, growth analytics, KPIs, staff
 * performance and periodic reports.
 *
 * Every figure here comes from rows people entered (labelled MANUAL/ESTIMATED)
 * or from SMOIS's own records. Gaps are returned as null with coverage counts,
 * never filled in: PRD 17.6 and 40.5.
 */
const router = Router();

const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Accounts a reader may see analytics for: everything for management, else assigned ones. */
async function readableAccountIds(req: Parameters<typeof isManagement>[0]): Promise<string[] | 'ALL'> {
  if (isManagement(req) || req.smos === 'VIEWER') return 'ALL';
  return assignedAccountIds(req.admin!.adminId);
}

// ── Snapshots ───────────────────────────────────────────────────────────────

const num = z.number().int().min(0).max(2_000_000_000).optional().nullable();
const snapshotSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  followers: num, reach: num, impressions: num, engagement: num, profileVisits: num, videoViews: num, websiteClicks: num,
  source: z.enum(['MANUAL', 'ESTIMATED']).default('MANUAL')
});

router.get(
  '/snapshots',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req);
    const readable = await readableAccountIds(req);
    const where: Prisma.SmosMetricSnapshotWhereInput = { date: { gte: from, lte: to } };
    if (typeof req.query.accountId === 'string' && req.query.accountId) {
      if (readable !== 'ALL' && !readable.includes(req.query.accountId)) return res.json({ data: [] });
      where.accountId = req.query.accountId;
    } else if (readable !== 'ALL') where.accountId = { in: readable };
    const data = await prisma.smosMetricSnapshot.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      take: 400,
      include: { account: { select: { name: true, platform: true } } }
    });
    return res.json({ data });
  })
);

router.post(
  '/snapshots',
  requireSmois('smois.metrics.record'),
  asyncHandler(async (req, res) => {
    const parsed = snapshotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { accountId, date, source, ...values } = parsed.data;
    const day = parseDay(date)!;
    if (day > startOfToday()) return res.status(400).json({ error: 'A reading cannot be dated in the future' });
    if (Object.values(values).every((v) => v == null)) return res.status(400).json({ error: 'Enter at least one figure' });
    const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (!(await canWorkOnAccount(req, accountId))) return res.status(403).json({ error: 'You are not assigned to this account' });
    const a = actor(req);
    try {
      const snapshot = await prisma.smosMetricSnapshot.create({
        data: { accountId, date: day, ...values, source, recordedById: a.id, recordedByName: a.name }
      });
      await logActivity(req, 'metrics', snapshot.id, `Recorded ${account.name} figures for ${date}`, { source });
      return res.status(201).json({ snapshot });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return res.status(409).json({ error: `${account.name} already has a reading for ${date}. Management can correct it.` });
      }
      throw e;
    }
  })
);

// Corrections are management-only and keep the previous reading in the trail.
router.patch(
  '/snapshots/:id',
  requireSmois('smois.metrics.correct'),
  asyncHandler(async (req, res) => {
    const parsed = snapshotSchema.omit({ accountId: true, date: true }).extend({ reason: z.string().trim().min(3).max(300) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.smosMetricSnapshot.findUnique({ where: { id: req.params.id }, include: { account: { select: { name: true } } } });
    if (!existing) return res.status(404).json({ error: 'Reading not found' });
    const { reason, source, ...values } = parsed.data;
    const before = Object.fromEntries(METRIC_KEYS.map((k) => [k, existing[k]]));
    const snapshot = await prisma.smosMetricSnapshot.update({ where: { id: existing.id }, data: { ...values, source } });
    await logActivity(req, 'metrics', existing.id, `Corrected ${existing.account.name} figures for ${toDay(existing.date)}`, {
      reason,
      before: before as Prisma.InputJsonValue,
      after: Object.fromEntries(METRIC_KEYS.map((k) => [k, snapshot[k]])) as Prisma.InputJsonValue
    });
    return res.json({ snapshot });
  })
);

// ── Analytics ───────────────────────────────────────────────────────────────

router.get(
  '/analytics',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req);
    const prev = previousPeriod(period);
    const readable = await readableAccountIds(req);
    const accounts = await prisma.socialAccount.findMany({
      where: { isActive: true, ...(readable === 'ALL' ? {} : { id: { in: readable } }) },
      select: { id: true, name: true, platform: true, handle: true },
      orderBy: { name: 'asc' }
    });
    const ids = accounts.map((a) => a.id);
    const [snaps, prevSnaps, posts] = await Promise.all([
      prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: ids }, date: { gte: period.from, lte: period.to } } }),
      prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: ids }, date: { gte: prev.from, lte: prev.to } } }),
      prisma.smosPublication.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids }, publishedAt: { gte: period.from, lte: endOfDay(period.to) } },
        _count: true
      })
    ]);
    const postCount = new Map(posts.map((p) => [p.accountId, p._count]));
    const rows = accounts.map((acc) => ({
      account: acc,
      current: summariseSnapshots(snaps.filter((s) => s.accountId === acc.id), period.days),
      previous: summariseSnapshots(prevSnaps.filter((s) => s.accountId === acc.id), prev.days),
      postsPublished: postCount.get(acc.id) ?? 0,
      sources: [...new Set(snaps.filter((s) => s.accountId === acc.id).map((s) => s.source))]
    }));
    return res.json({
      period: { from: toDay(period.from), to: toDay(period.to), days: period.days },
      previousPeriod: { from: toDay(prev.from), to: toDay(prev.to) },
      rows,
      note: 'Figures are entered by the team and labelled with their source. No platform is connected yet.'
    });
  })
);

/** Daily series for one account, for the growth chart. */
router.get(
  '/analytics/series',
  requireSmois('smois.analytics.read'),
  asyncHandler(async (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : '';
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });
    const readable = await readableAccountIds(req);
    if (readable !== 'ALL' && !readable.includes(accountId)) return res.status(403).json({ error: 'You do not have access to this account' });
    const { from, to } = parsePeriod(req);
    const data = await prisma.smosMetricSnapshot.findMany({
      where: { accountId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { date: true, followers: true, reach: true, impressions: true, engagement: true, source: true }
    });
    return res.json({ data: data.map((d) => ({ ...d, date: toDay(d.date) })) });
  })
);

// ── KPIs ────────────────────────────────────────────────────────────────────

const kpiSchema = z.object({
  name: z.string().trim().min(2).max(120),
  metric: z.enum(KPI_METRICS),
  targetValue: z.number().positive().max(1_000_000_000),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable()
});

router.get(
  '/kpis',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const mine = !isManagement(req);
    const rows = await prisma.smosKpi.findMany({
      where: mine ? { OR: [{ assigneeId: req.admin!.adminId }, { assigneeId: null }] } : {},
      orderBy: { periodEnd: 'desc' },
      take: 100,
      include: { account: { select: { name: true, platform: true } } }
    });
    const data = await Promise.all(
      rows.map(async (k) => {
        const actual = await kpiActual(k);
        return { ...k, periodStart: toDay(k.periodStart), periodEnd: toDay(k.periodEnd), actual, ...kpiStatus(k, actual) };
      })
    );
    return res.json({ data });
  })
);

router.post(
  '/kpis',
  requireSmois('smois.kpi.manage'),
  asyncHandler(async (req, res) => {
    const parsed = kpiSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const start = parseDay(d.periodStart)!;
    const end = parseDay(d.periodEnd)!;
    if (end < start) return res.status(400).json({ error: 'The end date is before the start date' });
    if (d.metric === 'FOLLOWER_GROWTH' && d.assigneeId) {
      return res.status(400).json({ error: 'Follower growth is shared across the team and cannot be a personal target' });
    }
    const assignee = d.assigneeId ? await prisma.adminUser.findUnique({ where: { id: d.assigneeId } }) : null;
    if (d.assigneeId && !assignee) return res.status(404).json({ error: 'Assignee not found' });
    const a = actor(req);
    const kpi = await prisma.smosKpi.create({
      data: {
        name: d.name, metric: d.metric, targetValue: d.targetValue, periodStart: start, periodEnd: end,
        accountId: d.accountId || null, assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? null,
        createdById: a.id, createdByName: a.name
      }
    });
    await logActivity(req, 'kpi', kpi.id, `Set target "${kpi.name}"`);
    return res.status(201).json({ kpi });
  })
);

router.delete(
  '/kpis/:id',
  requireSmois('smois.kpi.manage'),
  asyncHandler(async (req, res) => {
    const kpi = await prisma.smosKpi.findUnique({ where: { id: req.params.id } });
    if (!kpi) return res.status(404).json({ error: 'Target not found' });
    await prisma.smosKpi.delete({ where: { id: kpi.id } });
    await logActivity(req, 'kpi', kpi.id, `Removed target "${kpi.name}"`);
    return res.json({ ok: true });
  })
);

// ── Staff performance ───────────────────────────────────────────────────────

/**
 * Scorecard categories and their starting weights (PRD 19.3). A category with
 * nothing to measure it is reported as null and left out of the overall score,
 * whose weights are re-based over what was measured. Community engagement is
 * not measurable until the inbox exists, so it is always null for now.
 */
const SCORECARD = [
  { key: 'tasks', label: 'Task execution and deadlines', weight: 20 },
  { key: 'consistency', label: 'Content production and consistency', weight: 20 },
  { key: 'quality', label: 'Content quality and approval', weight: 15 },
  { key: 'community', label: 'Community engagement', weight: 15 },
  { key: 'reporting', label: 'Reporting and documentation', weight: 10 },
  { key: 'objectives', label: 'Assigned objectives', weight: 20 }
] as const;

const pctOf = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

async function performanceFor(adminId: string, name: string, from: Date, to: Date) {
  const range = { gte: from, lte: endOfDay(to) };
  const [tasks, created, reviews, published, reports, kpis] = await Promise.all([
    taskCompletionRate(adminId, from, to),
    prisma.smosContent.findMany({ where: { creatorId: adminId, createdAt: range }, select: { id: true, status: true } }),
    prisma.smosContentReview.findMany({ where: { content: { creatorId: adminId }, createdAt: range }, select: { decision: true } }),
    prisma.smosPublication.findMany({ where: { recordedById: adminId, publishedAt: range }, select: { publishedAt: true } }),
    prisma.smosReport.findMany({ where: { authorId: adminId, periodStart: { lte: to }, periodEnd: { gte: from }, status: { in: ['SUBMITTED', 'APPROVED'] } }, select: { id: true } }),
    prisma.smosKpi.findMany({ where: { assigneeId: adminId, periodStart: { lte: to }, periodEnd: { gte: from } } })
  ]);
  const overdue = await prisma.smosTask.count({
    where: { assigneeId: adminId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: new Date() } }
  });

  const weeks = Math.max(1, Math.ceil(((to.getTime() - from.getTime()) / 86400000 + 1) / 7));
  const activeWeeks = new Set(published.map((p) => Math.floor((p.publishedAt.getTime() - from.getTime()) / (7 * 86400000)))).size;
  const approved = reviews.filter((r) => r.decision === 'APPROVED').length;

  const kpiResults = await Promise.all(
    kpis.map(async (k) => kpiStatus(k, await kpiActual(k)).achievedPct)
  );
  const measuredKpis = kpiResults.filter((v): v is number => v != null);

  const values: Record<(typeof SCORECARD)[number]['key'], number | null> = {
    tasks: tasks.onTimeRate,
    consistency: published.length || created.length ? pctOf(activeWeeks, weeks) : null,
    quality: pctOf(approved, reviews.length),
    community: null,
    reporting: pctOf(Math.min(reports.length, weeks), weeks),
    objectives: measuredKpis.length ? Math.round((measuredKpis.reduce((a, v) => a + Math.min(v, 100), 0) / measuredKpis.length) * 10) / 10 : null
  };
  const measured = SCORECARD.filter((c) => values[c.key] != null);
  const weightSum = measured.reduce((a, c) => a + c.weight, 0);
  const overall = weightSum ? Math.round((measured.reduce((a, c) => a + values[c.key]! * c.weight, 0) / weightSum) * 10) / 10 : null;

  return {
    adminId,
    name,
    tasks: { assigned: tasks.total, completed: tasks.completed, overdueNow: overdue, completionRate: tasks.rate, onTimeRate: tasks.onTimeRate },
    content: {
      created: created.length,
      submitted: created.filter((c) => c.status !== 'IDEA' && c.status !== 'PLANNED' && c.status !== 'IN_PRODUCTION').length,
      approvedReviews: approved,
      rejectedReviews: reviews.filter((r) => r.decision === 'REJECTED').length,
      revisionsRequested: reviews.filter((r) => r.decision === 'REVISION_REQUESTED').length,
      published: published.length
    },
    reportsSubmitted: reports.length,
    scorecard: {
      categories: SCORECARD.map((c) => ({ ...c, value: values[c.key] })),
      overall,
      measuredWeight: weightSum
    }
  };
}

router.get(
  '/performance',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const all = smosCan(req.smos ?? null, 'smois.performance.read');
    const own = smosCan(req.smos ?? null, 'smois.performance.own');
    if (!all && !own) return res.status(403).json({ error: 'You do not have access to staff performance' });
    const { from, to } = parsePeriod(req);
    const staff = await prisma.adminUser.findMany({
      where: all ? { smosRole: 'MANAGER' } : { id: req.admin!.adminId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
    // The env root login has no row; "own" for it would otherwise be empty.
    const people = !all && staff.length === 0 ? [{ id: req.admin!.adminId, name: req.admin!.name }] : staff;
    const data = await Promise.all(people.map((p) => performanceFor(p.id, p.name, from, to)));
    return res.json({
      period: { from: toDay(from), to: toDay(to) },
      note: 'Shared account growth is not credited to individuals. Categories with nothing to measure are left out of the overall score.',
      data
    });
  })
);

// ── Reports ─────────────────────────────────────────────────────────────────

function periodFor(type: 'WEEKLY' | 'MONTHLY', start: Date): { start: Date; end: Date } | null {
  if (type === 'WEEKLY') {
    if (start.getUTCDay() !== 1) return null; // weeks start on Monday
    return { start, end: new Date(start.getTime() + 6 * 86400000) };
  }
  if (start.getUTCDate() !== 1) return null;
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)) };
}

/** Figures a report draws from system records, so authors never retype them. */
async function reportFigures(authorId: string, from: Date, to: Date) {
  const perf = await performanceFor(authorId, '', from, to);
  const accounts = await assignedAccountIds(authorId);
  const snaps = await prisma.smosMetricSnapshot.findMany({
    where: { accountId: { in: accounts }, date: { gte: from, lte: to } },
    include: { account: { select: { name: true, platform: true } } }
  });
  const growth = accounts.map((id) => {
    const rows = snaps.filter((s) => s.accountId === id);
    return { account: rows[0]?.account ?? null, ...summariseSnapshots(rows, Math.round((to.getTime() - from.getTime()) / 86400000) + 1) };
  }).filter((g) => g.account);
  return { tasks: perf.tasks, content: perf.content, accounts: growth };
}

router.get(
  '/reports',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const review = smosCan(req.smos ?? null, 'smois.reports.review');
    const write = smosCan(req.smos ?? null, 'smois.reports.write');
    if (!review && !write) return res.status(403).json({ error: 'You do not have access to reports' });
    const where: Prisma.SmosReportWhereInput = review ? {} : { authorId: req.admin!.adminId };
    if (req.query.type === 'WEEKLY' || req.query.type === 'MONTHLY') where.type = req.query.type;
    if (typeof req.query.status === 'string' && ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED'].includes(req.query.status)) {
      where.status = req.query.status as 'DRAFT';
    }
    const rows = await prisma.smosReport.findMany({ where, orderBy: { periodStart: 'desc' }, take: 100 });
    return res.json({ data: rows.map((r) => ({ ...r, periodStart: toDay(r.periodStart), periodEnd: toDay(r.periodEnd) })) });
  })
);

router.post(
  '/reports',
  requireSmois('smois.reports.write'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ type: z.enum(['WEEKLY', 'MONTHLY']), periodStart: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a report type and period' });
    const start = parseDay(parsed.data.periodStart);
    const period = start && periodFor(parsed.data.type, start);
    if (!period) return res.status(400).json({ error: parsed.data.type === 'WEEKLY' ? 'A weekly report starts on a Monday' : 'A monthly report starts on the 1st' });
    if (period.start > startOfToday()) return res.status(400).json({ error: 'That period has not started yet' });
    const a = actor(req);
    try {
      const report = await prisma.smosReport.create({
        data: { type: parsed.data.type, periodStart: period.start, periodEnd: period.end, authorId: a.id, authorName: a.name }
      });
      await logActivity(req, 'report', report.id, `Started ${report.type.toLowerCase()} report for ${toDay(period.start)}`);
      return res.status(201).json({ report });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return res.status(409).json({ error: 'You already have a report for that period' });
      }
      throw e;
    }
  })
);

router.get(
  '/reports/:id',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const report = await prisma.smosReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const review = smosCan(req.smos ?? null, 'smois.reports.review');
    if (!review && report.authorId !== req.admin!.adminId) return res.status(404).json({ error: 'Report not found' });
    // Submitted reports show the figures frozen at submission; drafts show live ones.
    const figures = report.figures ?? (await reportFigures(report.authorId, report.periodStart, report.periodEnd));
    return res.json({
      report: { ...report, periodStart: toDay(report.periodStart), periodEnd: toDay(report.periodEnd) },
      figures,
      figuresFrozen: !!report.figures
    });
  })
);

const narrativeSchema = z.object({
  summary: z.string().max(4000).optional(),
  challenges: z.string().max(4000).optional(),
  nextPeriod: z.string().max(4000).optional(),
  recommendations: z.string().max(4000).optional()
});

router.patch(
  '/reports/:id',
  requireSmois('smois.reports.write'),
  asyncHandler(async (req, res) => {
    const parsed = narrativeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const report = await prisma.smosReport.findUnique({ where: { id: req.params.id } });
    if (!report || report.authorId !== req.admin!.adminId) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'DRAFT' && report.status !== 'RETURNED') return res.status(409).json({ error: 'A submitted report cannot be edited' });
    const updated = await prisma.smosReport.update({ where: { id: report.id }, data: { narrative: parsed.data } });
    return res.json({ report: updated });
  })
);

router.post(
  '/reports/:id/submit',
  requireSmois('smois.reports.write'),
  asyncHandler(async (req, res) => {
    const report = await prisma.smosReport.findUnique({ where: { id: req.params.id } });
    if (!report || report.authorId !== req.admin!.adminId) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'DRAFT' && report.status !== 'RETURNED') return res.status(409).json({ error: 'This report was already submitted' });
    const narrative = (report.narrative ?? {}) as { summary?: string };
    if (!narrative.summary?.trim()) return res.status(400).json({ error: 'Add your summary before submitting' });
    const figures = await reportFigures(report.authorId, report.periodStart, report.periodEnd);
    const r = await prisma.smosReport.updateMany({
      where: { id: report.id, status: report.status },
      data: { status: 'SUBMITTED', figures: figures as unknown as Prisma.InputJsonValue, submittedAt: new Date() }
    });
    if (r.count === 0) return res.status(409).json({ error: 'This report just changed. Refresh and try again.' });
    await logActivity(req, 'report', report.id, `Submitted ${report.type.toLowerCase()} report for ${toDay(report.periodStart)}`);
    return res.json({ ok: true });
  })
);

router.post(
  '/reports/:id/review',
  requireSmois('smois.reports.review'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ decision: z.enum(['APPROVED', 'RETURNED']), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (parsed.data.decision === 'RETURNED' && !trim(parsed.data.note)) return res.status(400).json({ error: 'Tell the author what to clarify' });
    const report = await prisma.smosReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'SUBMITTED') return res.status(409).json({ error: 'This report is not waiting for review' });
    const a = actor(req);
    if (report.authorId === a.id) return res.status(403).json({ error: 'You cannot review your own report' });
    const r = await prisma.smosReport.updateMany({
      where: { id: report.id, status: 'SUBMITTED' },
      data: { status: parsed.data.decision, reviewerName: a.name, reviewNote: trim(parsed.data.note), reviewedAt: new Date() }
    });
    if (r.count === 0) return res.status(409).json({ error: 'This report just changed. Refresh and try again.' });
    await logActivity(req, 'report', report.id, `${parsed.data.decision === 'APPROVED' ? 'Approved' : 'Returned'} ${report.authorName}'s ${report.type.toLowerCase()} report`);
    return res.json({ ok: true });
  })
);

// ── Dashboard overview ──────────────────────────────────────────────────────

router.get(
  '/overview',
  requireSmois('smois.read'),
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req);
    const range = { gte: period.from, lte: endOfDay(period.to) };
    const now = new Date();
    const me = req.admin!.adminId;
    const mgmt = isManagement(req);
    const canAnalytics = smosCan(req.smos ?? null, 'smois.analytics.read');
    const taskScope: Prisma.SmosTaskWhereInput = mgmt ? {} : { assigneeId: me };

    const [accounts, contentByStatus, published, taskGroups, overdueTasks, reportsToReview, managers] = await Promise.all([
      prisma.socialAccount.groupBy({ by: ['connection'], where: { isActive: true }, _count: true }),
      prisma.smosContent.groupBy({ by: ['status'], _count: true }),
      prisma.smosPublication.count({ where: { publishedAt: range } }),
      prisma.smosTask.groupBy({ by: ['status'], where: taskScope, _count: true }),
      prisma.smosTask.count({ where: { ...taskScope, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: now } } }),
      smosCan(req.smos ?? null, 'smois.reports.review') ? prisma.smosReport.count({ where: { status: 'SUBMITTED' } }) : Promise.resolve(null),
      mgmt ? prisma.adminUser.count({ where: { smosRole: 'MANAGER', isActive: true } }) : Promise.resolve(null)
    ]);

    let growth: { net: number | null; accountsWithData: number; accounts: number } | null = null;
    if (canAnalytics) {
      const readable = await readableAccountIds(req);
      const ids = (
        await prisma.socialAccount.findMany({ where: { isActive: true, ...(readable === 'ALL' ? {} : { id: { in: readable } }) }, select: { id: true } })
      ).map((a) => a.id);
      const snaps = await prisma.smosMetricSnapshot.findMany({ where: { accountId: { in: ids }, date: { gte: period.from, lte: period.to } } });
      let net: number | null = null;
      let withData = 0;
      for (const id of ids) {
        const n = summariseSnapshots(snaps.filter((s) => s.accountId === id), period.days).net;
        if (n != null) { net = (net ?? 0) + n; withData++; }
      }
      growth = { net, accountsWithData: withData, accounts: ids.length };
    }

    const countOf = (s: string) => contentByStatus.find((c) => c.status === s)?._count ?? 0;
    return res.json({
      period: { from: toDay(period.from), to: toDay(period.to) },
      accounts: { total: accounts.reduce((a, c) => a + c._count, 0), connectedByApi: accounts.find((c) => c.connection === 'CONNECTED')?._count ?? 0 },
      content: {
        awaitingApproval: countOf('SUBMITTED'), approved: countOf('APPROVED'), scheduled: countOf('SCHEDULED'),
        revisionRequested: countOf('REVISION_REQUESTED'), rejected: countOf('REJECTED'), publishedInPeriod: published
      },
      tasks: {
        pending: taskGroups.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).reduce((a, t) => a + t._count, 0),
        completed: taskGroups.find((t) => t.status === 'COMPLETED')?._count ?? 0,
        overdue: overdueTasks
      },
      reportsToReview,
      activeManagers: managers,
      growth,
      scope: mgmt ? 'department' : 'mine'
    });
  })
);

export default router;
