import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Daily ops briefing: yesterday's numbers, what is stuck right now, and a short
 * list of fixed-rule flags each with the action to take. Read-only — it never
 * changes orders, users or money. Rules, not an LLM: the output is predictable,
 * free, and cannot invent a problem.
 *
 * The "day" is a Lagos calendar day (UTC+1, no DST), as an operator would read it.
 */

const LAGOS_OFFSET_H = 1;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BRIEFING_HOUR_LAGOS = 7;

export function lagosDayRange(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - LAGOS_OFFSET_H * HOUR);
  return { start, end: new Date(start.getTime() + DAY) };
}

export function lagosYesterday(now = new Date()): string {
  const lagosNow = new Date(now.getTime() + LAGOS_OFFSET_H * HOUR);
  return new Date(lagosNow.getTime() - DAY).toISOString().slice(0, 10);
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export { isDay };

/* ───────────────────────────── metrics ───────────────────────────── */

export interface OpsMetrics {
  day: string;
  generatedAt: string;
  orders: {
    placed: number;
    delivered: number;
    cancelled: number;
    gmv: number;
    avgDeliveryHours: number | null;
    sevenDayAvg: { placed: number; delivered: number; gmv: number };
  };
  live: { awaitingRider: number; oldestAwaitingRiderMin: number | null; stuckOutForDelivery: number; approvedRiders: number };
  growth: { signups: { consumers: number; vendors: number; riders: number }; pendingVendors: number; pendingRiders: number; oldestPendingDays: number | null };
  support: { opened: number; openNow: number; overdueNow: number };
  money: { owedToVendors: number; paidOut: number; commission: number; payoutsNeedingAttention: number };
  reliability: { serverErrors: number; serverWarnings: number };
  marketing: { campaignsSent: number; emailsSent: number };
  crm: { followUpsOverdue: number; tasksOverdue: number };
}

const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const sum = (n: number | null | undefined) => n ?? 0;

export async function collectOpsMetrics(day: string, now = new Date()): Promise<OpsMetrics> {
  const { start, end } = lagosDayRange(day);
  const weekStart = new Date(start.getTime() - 7 * DAY);
  const inDay = { gte: start, lt: end };
  const rider30 = new Date(now.getTime() - 30 * 60_000);
  const out4h = new Date(now.getTime() - 4 * HOUR);

  const [
    placed, deliveredRows, cancelled, weekPlaced, weekDelivered,
    awaitingRider, oldestAwaiting, stuckOut, approvedRiders,
    signups, pendingVendors, pendingRiders, oldestVendor, oldestRider,
    ticketsOpened, ticketsOpen, ticketsOverdue,
    owed, paid, commission, payoutIssues,
    serverErrors, serverWarnings,
    campaignsSent, emailsSent,
    followUps, tasksOverdue
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: inDay } }),
    prisma.order.findMany({ where: { status: 'DELIVERED', updatedAt: inDay }, select: { totalAmount: true, createdAt: true, updatedAt: true }, take: 5000 }),
    prisma.order.count({ where: { status: 'CANCELLED', updatedAt: inDay } }),
    prisma.order.count({ where: { createdAt: { gte: weekStart, lt: start } } }),
    prisma.order.aggregate({ where: { status: 'DELIVERED', updatedAt: { gte: weekStart, lt: start } }, _count: true, _sum: { totalAmount: true } }),

    // Paid orders a vendor has accepted but no rider has been put on.
    prisma.order.count({ where: { status: 'CONFIRMED', riderId: null, vendorId: { not: null }, updatedAt: { lt: rider30 } } }),
    prisma.order.findFirst({ where: { status: 'CONFIRMED', riderId: null, vendorId: { not: null }, updatedAt: { lt: rider30 } }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    prisma.order.count({ where: { status: 'OUT_FOR_DELIVERY', updatedAt: { lt: out4h } } }),
    prisma.riderProfile.count({ where: { status: 'APPROVED' } }),

    prisma.user.groupBy({ by: ['role'], where: { createdAt: inDay }, _count: true }),
    prisma.vendorProfile.count({ where: { status: 'PENDING' } }),
    prisma.riderProfile.count({ where: { status: 'PENDING' } }),
    prisma.vendorProfile.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.riderProfile.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),

    prisma.ticket.count({ where: { createdAt: inDay } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'PENDING'] }, firstResponseAt: null, slaDueAt: { lt: now } } }),

    prisma.earning.aggregate({ where: { status: 'AVAILABLE' }, _sum: { netAmount: true } }),
    prisma.payout.aggregate({ where: { status: 'PAID', paidAt: inDay }, _sum: { amount: true } }),
    prisma.earning.aggregate({ where: { createdAt: inDay }, _sum: { commissionAmount: true } }),
    prisma.payout.count({ where: { status: { in: ['FAILED', 'PENDING'] } } }),

    prisma.serverLog.count({ where: { level: 'ERROR', createdAt: inDay } }),
    prisma.serverLog.count({ where: { level: 'WARN', createdAt: inDay } }),

    prisma.campaign.count({ where: { sentAt: inDay } }),
    prisma.campaignRecipient.count({ where: { status: 'SENT', sentAt: inDay } }),

    prisma.lead.count({ where: { stage: { in: ['NEW', 'CONTACTED', 'ONBOARDING'] }, nextFollowUpAt: { lt: now } } }),
    prisma.crmTask.count({ where: { status: 'OPEN', dueAt: { lt: now } } })
  ]);

  const gmv = deliveredRows.reduce((s, o) => s + o.totalAmount, 0);
  const durations = deliveredRows.map((o) => (o.updatedAt.getTime() - o.createdAt.getTime()) / HOUR).filter((h) => h > 0 && h < 72);
  const signupCount = (role: string) => signups.find((s) => s.role === role)?._count ?? 0;
  const oldestPending = [oldestVendor?.createdAt, oldestRider?.createdAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    day,
    generatedAt: now.toISOString(),
    orders: {
      placed,
      delivered: deliveredRows.length,
      cancelled,
      gmv: round(gmv, 2),
      avgDeliveryHours: durations.length ? round(durations.reduce((a, b) => a + b, 0) / durations.length, 1) : null,
      sevenDayAvg: { placed: round(weekPlaced / 7, 1), delivered: round(weekDelivered._count / 7, 1), gmv: round(sum(weekDelivered._sum.totalAmount) / 7) }
    },
    live: {
      awaitingRider,
      oldestAwaitingRiderMin: oldestAwaiting ? Math.round((now.getTime() - oldestAwaiting.updatedAt.getTime()) / 60_000) : null,
      stuckOutForDelivery: stuckOut,
      approvedRiders
    },
    growth: {
      signups: { consumers: signupCount('CONSUMER'), vendors: signupCount('VENDOR'), riders: signupCount('RIDER') },
      pendingVendors,
      pendingRiders,
      oldestPendingDays: oldestPending ? Math.floor((now.getTime() - oldestPending.getTime()) / DAY) : null
    },
    support: { opened: ticketsOpened, openNow: ticketsOpen, overdueNow: ticketsOverdue },
    money: {
      owedToVendors: round(sum(owed._sum.netAmount), 2),
      paidOut: round(sum(paid._sum.amount), 2),
      commission: round(sum(commission._sum.commissionAmount), 2),
      payoutsNeedingAttention: payoutIssues
    },
    reliability: { serverErrors, serverWarnings },
    marketing: { campaignsSent, emailsSent },
    crm: { followUpsOverdue: followUps, tasksOverdue }
  };
}

/* ────────────────────────────── flags ────────────────────────────── */

export type FlagSeverity = 'critical' | 'warning' | 'info';
export interface OpsFlag {
  key: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
  action: string;
  /** Admin-panel route to act on it. */
  href: string;
}
export type BriefingStatus = 'ACTION' | 'WATCH' | 'OK';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Fixed rules. Thresholds are deliberately conservative — a flag should be worth acting on. */
export function deriveFlags(m: OpsMetrics): OpsFlag[] {
  const flags: OpsFlag[] = [];

  if (m.money.payoutsNeedingAttention > 0) {
    flags.push({
      key: 'payouts-attention',
      severity: 'critical',
      title: `${plural(m.money.payoutsNeedingAttention, 'payout')} failed or stuck`,
      detail: 'Vendors are waiting on money that has not left Paystack.',
      action: 'Open each payout, read the failure reason, then retry or cancel it.',
      href: '/dashboard/payouts?tab=payouts'
    });
  }

  if (m.live.awaitingRider > 0) {
    const mins = m.live.oldestAwaitingRiderMin ?? 0;
    flags.push({
      key: 'orders-no-rider',
      severity: m.live.awaitingRider >= 5 || mins >= 120 ? 'critical' : 'warning',
      title: `${plural(m.live.awaitingRider, 'paid order')} waiting for a rider`,
      detail: `The oldest has waited ${mins} minutes since the vendor confirmed it.`,
      action: 'Assign a rider from the order, or contact the vendor.',
      href: '/dashboard/orders?status=CONFIRMED'
    });
  }

  if (m.live.stuckOutForDelivery > 0) {
    flags.push({
      key: 'stuck-delivery',
      severity: 'warning',
      title: `${plural(m.live.stuckOutForDelivery, 'order')} out for delivery over 4 hours`,
      detail: 'Either the delivery was never marked complete or the customer is still waiting.',
      action: 'Call the rider; mark delivered or reassign.',
      href: '/dashboard/orders?status=OUT_FOR_DELIVERY'
    });
  }

  const o = m.orders;
  if (o.placed >= 5 && o.cancelled / o.placed > 0.3) {
    flags.push({
      key: 'cancel-rate',
      severity: 'warning',
      title: `${Math.round((o.cancelled / o.placed) * 100)}% of the day's orders were cancelled`,
      detail: `${o.cancelled} cancelled against ${o.placed} placed.`,
      action: 'Check which vendors are cancelling and why.',
      href: '/dashboard/orders?status=CANCELLED'
    });
  }
  if (o.sevenDayAvg.placed >= 3 && o.placed < o.sevenDayAvg.placed * 0.5) {
    flags.push({
      key: 'orders-down',
      severity: 'warning',
      title: 'Orders fell below half the weekly average',
      detail: `${o.placed} placed against a ${o.sevenDayAvg.placed}/day average. Check for an outage or a payment problem.`,
      action: 'Check server logs and the Paystack dashboard.',
      href: '/dashboard/server-logs'
    });
  }

  if (m.support.overdueNow > 0) {
    flags.push({
      key: 'support-overdue',
      severity: m.support.overdueNow >= 5 ? 'critical' : 'warning',
      title: `${plural(m.support.overdueNow, 'ticket')} past the first-reply deadline`,
      detail: 'Nobody has answered them yet.',
      action: 'Reply, starting with the oldest.',
      href: '/dashboard/support?sla=breached'
    });
  }

  const pending = m.growth.pendingVendors + m.growth.pendingRiders;
  if (pending > 0) {
    const old = (m.growth.oldestPendingDays ?? 0) >= 3;
    flags.push({
      key: 'approvals-waiting',
      severity: old ? 'warning' : 'info',
      title: `${plural(m.growth.pendingVendors, 'vendor')} and ${plural(m.growth.pendingRiders, 'rider')} awaiting approval`,
      detail: old ? `The oldest has waited ${m.growth.oldestPendingDays} days.` : 'Recent signups.',
      action: 'Review and approve or reject.',
      href: m.growth.pendingVendors >= m.growth.pendingRiders ? '/dashboard/vendors?status=PENDING' : '/dashboard/riders?status=PENDING'
    });
  }

  if (m.reliability.serverErrors >= 20) {
    flags.push({
      key: 'server-errors',
      severity: m.reliability.serverErrors >= 100 ? 'critical' : 'warning',
      title: `${m.reliability.serverErrors} server errors logged`,
      detail: `${m.reliability.serverWarnings} warnings as well.`,
      action: 'Open the error logs and look for a repeated cause.',
      href: '/dashboard/server-logs?level=ERROR&range=24h'
    });
  }

  if (m.crm.followUpsOverdue + m.crm.tasksOverdue > 0) {
    flags.push({
      key: 'crm-overdue',
      severity: 'info',
      title: `${plural(m.crm.followUpsOverdue, 'lead follow-up')} and ${plural(m.crm.tasksOverdue, 'task')} overdue`,
      detail: 'Recruiting slips when these pile up.',
      action: 'Clear the oldest first.',
      href: '/dashboard/tasks?due=overdue'
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function statusFromFlags(flags: OpsFlag[]): BriefingStatus {
  if (flags.some((f) => f.severity === 'critical')) return 'ACTION';
  if (flags.some((f) => f.severity === 'warning')) return 'WATCH';
  return 'OK';
}

/* ──────────────────────────── delivery ───────────────────────────── */

function telegramText(m: OpsMetrics, flags: OpsFlag[], status: BriefingStatus): string {
  const icon = { ACTION: '🔴', WATCH: '🟠', OK: '🟢' }[status];
  const lines = [
    `${icon} <b>4FG ops briefing — ${m.day}</b>`,
    `Orders: ${m.orders.placed} placed · ${m.orders.delivered} delivered · ${m.orders.cancelled} cancelled · ${naira(m.orders.gmv)}`,
    `Owed to vendors: ${naira(m.money.owedToVendors)} · commission ${naira(m.money.commission)}`
  ];
  if (flags.length === 0) lines.push('', 'Nothing needs attention.');
  else {
    lines.push('');
    for (const f of flags.slice(0, 6)) {
      lines.push(`${{ critical: '🔴', warning: '🟠', info: '🔵' }[f.severity]} <b>${f.title}</b> — ${f.action}`);
    }
    if (flags.length > 6) lines.push(`…and ${flags.length - 6} more`);
  }
  lines.push('', `${(process.env.ADMIN_PANEL_URL ?? 'https://4fgmpanel.4fgmonitor.com').replace(/\/$/, '')}/dashboard/briefing`);
  return lines.join('\n');
}

async function sendTelegram(text: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return 'Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)';
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return res.ok ? null : `Telegram responded ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : 'Telegram request failed';
  }
}

/**
 * Build (or rebuild) the briefing for a day.
 *  - `deliver`: also post it to Telegram. Only the scheduler does this, and only
 *    on the run that CREATES the row, so a restart or a second instance can't
 *    send the same morning twice.
 */
export async function generateBriefing(day: string, opts: { deliver: boolean }) {
  const metrics = await collectOpsMetrics(day);
  const flags = deriveFlags(metrics);
  const status = statusFromFlags(flags);
  const json = { metrics: metrics as unknown as Prisma.InputJsonValue, flags: flags as unknown as Prisma.InputJsonValue };

  if (!opts.deliver) {
    return prisma.opsBriefing.upsert({
      where: { day },
      create: { day, status, ...json },
      update: { status, ...json }
    });
  }

  let row;
  try {
    row = await prisma.opsBriefing.create({ data: { day, status, ...json } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // already done
    throw err;
  }
  const sendError = await sendTelegram(telegramText(metrics, flags, status));
  return prisma.opsBriefing.update({
    where: { id: row.id },
    data: { sentAt: sendError ? null : new Date(), sendError }
  });
}

/* ─────────────────────────── scheduling ──────────────────────────── */

async function tick() {
  const lagosHour = new Date(Date.now() + LAGOS_OFFSET_H * HOUR).getUTCHours();
  if (lagosHour < BRIEFING_HOUR_LAGOS) return;
  const day = lagosYesterday();
  if (await prisma.opsBriefing.findUnique({ where: { day }, select: { id: true } })) return;
  await generateBriefing(day, { deliver: true });
}

/**
 * Checks every 15 minutes and produces yesterday's briefing once it is past
 * 07:00 Lagos and none exists. Checking (rather than a single cron fire) means
 * a deploy that straddles 07:00 still produces the briefing afterwards.
 * Set OPS_BRIEFING_ENABLED=false to turn it off.
 */
export function startOpsBriefingScheduler(): void {
  if (process.env.OPS_BRIEFING_ENABLED === 'false') return;
  const run = () => tick().catch((err) => console.error('[ops-briefing] scheduled run failed', err));
  setTimeout(run, 30_000).unref();
  setInterval(run, 15 * 60_000).unref();
}
