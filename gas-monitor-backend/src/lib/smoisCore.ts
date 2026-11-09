import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { writeAuditLog } from './audit';
import { seesEverything } from './smois';

/** Shared helpers for the SMOIS routes (routes/admin/smois*.ts). */

export const actor = (req: Request) => ({ id: req.admin!.adminId, name: req.admin!.name });

/** The admin sees every account and every colleague's work, not just their own. */
export const isManagement = (req: Request) => seesEverything(req.smos ?? null);

const DAY = 24 * 60 * 60 * 1000;

/** Append to the shared admin audit trail, tagged so SMOIS can filter its own activity. */
export function logActivity(
  req: Request,
  resource: string,
  resourceId: string,
  summary: string,
  metadata?: Prisma.InputJsonValue
) {
  return writeAuditLog(req, {
    action: 'SMOIS_ACTIVITY',
    resource: `smois.${resource}`,
    resourceId,
    summary,
    metadata
  });
}

/** Account ids this admin is currently assigned to. */
export async function assignedAccountIds(adminId: string): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.socialAccountAssignment.findMany({
    where: { adminId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { accountId: true }
  });
  return [...new Set(rows.map((r) => r.accountId))];
}

/**
 * Whether the admin may act on this account. Management works on any account;
 * a manager only on the ones they are assigned to.
 */
export async function canWorkOnAccount(req: Request, accountId: string): Promise<boolean> {
  if (isManagement(req)) return true;
  return (await assignedAccountIds(req.admin!.adminId)).includes(accountId);
}

// ── Dates ───────────────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day as UTC midnight, matching how @db.Date columns round-trip. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** ?from=&to= (YYYY-MM-DD, inclusive). Defaults to the last 30 days. */
export function parsePeriod(req: Request): { from: Date; to: Date; days: number } {
  const today = startOfToday();
  const to = parseDay(req.query.to) ?? today;
  const from = parseDay(req.query.from) ?? new Date(to.getTime() - 29 * DAY);
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { from: a, to: b, days: Math.round((b.getTime() - a.getTime()) / DAY) + 1 };
}

/** The period of equal length that ends the day before `from`. */
export function previousPeriod(p: { from: Date; days: number }) {
  const to = new Date(p.from.getTime() - DAY);
  const from = new Date(to.getTime() - (p.days - 1) * DAY);
  return { from, to, days: p.days };
}

/** End of the `to` day, for filtering timestamp columns. */
export const endOfDay = (d: Date) => new Date(d.getTime() + DAY - 1);

// ── Metrics ─────────────────────────────────────────────────────────────────

export const METRIC_KEYS = [
  'followers',
  'reach',
  'impressions',
  'engagement',
  'profileVisits',
  'videoViews',
  'websiteClicks'
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

type Snap = { date: Date; accountId: string } & Partial<Record<MetricKey, number | null>>;

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 10000) / 100);

/**
 * Summarise one account's snapshots over a period. `null` means "not recorded",
 * never zero: a missing day is not a day with no followers.
 */
export function summariseSnapshots(snaps: Snap[], days: number) {
  const sorted = [...snaps].sort((a, b) => a.date.getTime() - b.date.getTime());
  const withFollowers = sorted.filter((s) => s.followers != null);
  const opening = withFollowers[0]?.followers ?? null;
  const closing = withFollowers[withFollowers.length - 1]?.followers ?? null;
  const net = opening != null && closing != null && withFollowers.length > 1 ? closing - opening : null;
  const sum = (k: MetricKey) => {
    const vals = sorted.map((s) => s[k]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const reach = sum('reach');
  const engagement = sum('engagement');
  return {
    opening,
    closing,
    net,
    growthPct: net != null && opening ? pct(net, opening) : null,
    reach,
    impressions: sum('impressions'),
    engagement,
    profileVisits: sum('profileVisits'),
    videoViews: sum('videoViews'),
    websiteClicks: sum('websiteClicks'),
    // Defined as engagement actions / reach x 100 (PRD 16.4); only when both exist.
    engagementRateByReach: reach && engagement != null ? pct(engagement, reach) : null,
    daysRecorded: new Set(sorted.map((s) => toDay(s.date))).size,
    daysInPeriod: days
  };
}

// ── KPIs ────────────────────────────────────────────────────────────────────

export const KPI_METRICS = [
  'FOLLOWER_GROWTH',
  'REACH',
  'IMPRESSIONS',
  'ENGAGEMENT',
  'POSTS_PUBLISHED',
  'TASK_COMPLETION'
] as const;

type KpiRow = {
  metric: string;
  targetValue: number;
  periodStart: Date;
  periodEnd: Date;
  accountId: string | null;
  assigneeId: string | null;
};

/** Task completion rate per the PRD: completed eligible tasks / eligible tasks. */
export async function taskCompletionRate(assigneeId: string | null, from: Date, to: Date) {
  const tasks = await prisma.smosTask.findMany({
    where: { status: { not: 'CANCELLED' }, dueAt: { gte: from, lte: endOfDay(to) }, ...(assigneeId ? { assigneeId } : {}) },
    select: { status: true, dueAt: true, completedAt: true }
  });
  if (tasks.length === 0) return { rate: null, onTimeRate: null, total: 0, completed: 0 };
  const done = tasks.filter((t) => t.status === 'COMPLETED');
  const onTime = done.filter((t) => t.completedAt && t.dueAt && t.completedAt <= t.dueAt);
  return {
    rate: pct(done.length, tasks.length),
    onTimeRate: done.length ? pct(onTime.length, done.length) : null,
    total: tasks.length,
    completed: done.length
  };
}

/** Actual value of a KPI from system records, or null when nothing was recorded. */
export async function kpiActual(k: KpiRow): Promise<number | null> {
  const to = endOfDay(k.periodEnd);
  if (k.metric === 'TASK_COMPLETION') return (await taskCompletionRate(k.assigneeId, k.periodStart, k.periodEnd)).rate;

  if (k.metric === 'POSTS_PUBLISHED') {
    return prisma.smosPublication.count({
      where: {
        publishedAt: { gte: k.periodStart, lte: to },
        ...(k.accountId ? { accountId: k.accountId } : {}),
        // A person's number counts only what they recorded: shared account
        // growth is never attributed to an individual without a method.
        ...(k.assigneeId ? { recordedById: k.assigneeId } : {})
      }
    });
  }

  const snaps = await prisma.smosMetricSnapshot.findMany({
    where: { date: { gte: k.periodStart, lte: k.periodEnd }, ...(k.accountId ? { accountId: k.accountId } : {}) }
  });
  if (snaps.length === 0) return null;
  if (k.metric === 'FOLLOWER_GROWTH') {
    const byAccount = new Map<string, Snap[]>();
    for (const s of snaps) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
    let total = 0;
    let any = false;
    for (const list of byAccount.values()) {
      const net = summariseSnapshots(list, 1).net;
      if (net != null) {
        total += net;
        any = true;
      }
    }
    return any ? total : null;
  }
  const key = ({ REACH: 'reach', IMPRESSIONS: 'impressions', ENGAGEMENT: 'engagement' } as const)[
    k.metric as 'REACH' | 'IMPRESSIONS' | 'ENGAGEMENT'
  ];
  return key ? summariseSnapshots(snaps, 1)[key] : null;
}

export type KpiStatus = 'NOT_STARTED' | 'NO_DATA' | 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'EXCEEDED' | 'MISSED';

export function kpiStatus(k: KpiRow, actual: number | null, now = new Date()): { achievedPct: number | null; status: KpiStatus } {
  if (now < k.periodStart) return { achievedPct: null, status: 'NOT_STARTED' };
  if (actual == null) return { achievedPct: null, status: 'NO_DATA' };
  const achievedPct = k.targetValue > 0 ? Math.round((actual / k.targetValue) * 1000) / 10 : null;
  if (achievedPct == null) return { achievedPct, status: 'NO_DATA' };
  if (achievedPct > 100) return { achievedPct, status: 'EXCEEDED' };
  if (achievedPct === 100) return { achievedPct, status: 'ACHIEVED' };
  if (now > endOfDay(k.periodEnd)) return { achievedPct, status: 'MISSED' };
  const span = endOfDay(k.periodEnd).getTime() - k.periodStart.getTime();
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - k.periodStart.getTime()) / span));
  return { achievedPct, status: achievedPct >= elapsed * 100 * 0.9 ? 'ON_TRACK' : 'AT_RISK' };
}
