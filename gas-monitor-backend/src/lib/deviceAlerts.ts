import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { computeGas } from './deviceDerive';
import { readDesired } from './deviceConfig';
import { sendExpoPush } from './expoPush';
import { EMAIL_FROM, getClient } from './email';
import { renderBroadcastHtml } from './broadcast';

/**
 * Alert rules for devices: LOW, EMPTY, OFFLINE, LOW_BATTERY.
 *
 * One alert per crossing, never one per reading. Each rule has a state (armed /
 * fired). It fires when armed and its condition holds; it re-arms only when the
 * condition has cleared WITH A MARGIN, so a reading that wobbles around a threshold
 * cannot send a stream of alerts. A refill clears LOW and EMPTY.
 *
 * Durability: claiming the alert and writing the in-app notification are ONE
 * transaction, so an alert is never lost or sent twice. Push, email and SMS go out
 * afterwards and are best effort (a Resend or Expo outage cannot lose the alert;
 * it is still in the person's in-app inbox).
 */

export const RULES = ['LOW', 'EMPTY', 'OFFLINE', 'LOW_BATTERY'] as const;
export type AlertRule = (typeof RULES)[number];

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Below this much gas (kg) the cylinder counts as finished. */
export const EMPTY_KG = 0.5;
/** EMPTY re-arms once there is clearly gas again. */
export const EMPTY_REARM_KG = 1.5;
/** LOW re-arms this many percentage points above the user's threshold. */
export const LOW_REARM_PERCENT_MARGIN = 10;
/** A device is "offline" after missing this many reporting intervals, and never sooner than OFFLINE_MIN_MS. */
export const OFFLINE_FACTOR = 2.5;
export const OFFLINE_MIN_MS = 20 * 60_000;
/** LOW_BATTERY re-arms this far above the device's low-battery voltage. */
export const BATTERY_REARM_MV = 150;
/** Days of history behind the days-left forecast, and the minimum needed to trust it. */
const FORECAST_WINDOW_DAYS = 14;
const FORECAST_MIN_DAYS = 3;
const FORECAST_MIN_KG_PER_DAY = 0.05;

// ── Decisions (pure) ─────────────────────────────────────────────────────────

export interface Gas { present: boolean; netKg: number | null; percent: number | null }
export interface Thresholds { lowPercent: number; lowKg: number | null; lowDays: number | null }

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Days of gas left at the household's recent pace. null until there are a few days
 * of real history (and while the cylinder is barely being used), so the app says
 * "learning your usage" instead of guessing.
 */
export function forecastDaysLeft(netKg: number | null, days: { consumedKg: number; readings: number }[]): number | null {
  if (netKg == null) return null;
  const usable = days.filter((d) => d.readings >= 3);
  if (usable.length < FORECAST_MIN_DAYS) return null;
  const perDay = usable.reduce((s, d) => s + d.consumedKg, 0) / usable.length;
  return perDay < FORECAST_MIN_KG_PER_DAY ? null : round1(netKg / perDay);
}

/** Any one of the owner's configured criteria is enough. Unknown gas (calibrating, or no cylinder) never alerts. */
export function isLow(g: Gas, t: Thresholds, daysLeft: number | null): boolean {
  if (!g.present || g.netKg == null) return false;
  if (g.percent != null && g.percent <= t.lowPercent) return true;
  if (t.lowKg != null && g.netKg <= t.lowKg) return true;
  if (t.lowDays != null && daysLeft != null && daysLeft <= t.lowDays) return true;
  return false;
}

/** All configured criteria are comfortably clear: the condition for re-arming LOW. */
export function isClearOfLow(g: Gas, t: Thresholds, daysLeft: number | null): boolean {
  if (!g.present || g.netKg == null) return false; // no evidence either way: stay as we are
  return (
    (g.percent == null || g.percent > t.lowPercent + LOW_REARM_PERCENT_MARGIN) &&
    (t.lowKg == null || g.netKg > t.lowKg * 1.25) &&
    (t.lowDays == null || daysLeft == null || daysLeft > t.lowDays + 1)
  );
}

export const isEmpty = (g: Gas): boolean => g.present && g.netKg != null && g.netKg <= EMPTY_KG;
export const isClearOfEmpty = (g: Gas): boolean => g.present && g.netKg != null && g.netKg > EMPTY_REARM_KG;

/** Armed + condition → fire. Fired + cleared → re-arm. Otherwise leave it. No state row yet means armed. */
export function decide(state: { armed: boolean } | null, fire: boolean, clear: boolean): 'fire' | 'rearm' | 'none' {
  const armed = state ? state.armed : true;
  if (armed && fire) return 'fire';
  if (!armed && clear) return 'rearm';
  return 'none';
}

export const offlineAfterMs = (reportEverySec: number): number => Math.max(OFFLINE_MIN_MS, OFFLINE_FACTOR * reportEverySec * 1000);

// ── Wording ──────────────────────────────────────────────────────────────────

export function formatLagos(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', ' at');
}

export interface MessageContext {
  name: string;
  percent: number | null;
  netKg: number | null;
  daysLeft: number | null;
  lastSeenAt: Date | null;
  batteryPct: number | null;
}

export function alertMessage(rule: AlertRule, c: MessageContext): { title: string; body: string } {
  const level = c.percent != null ? `${Math.round(c.percent)}%` : null;
  const left = c.netKg != null ? `${round1(c.netKg)} kg` : null;
  switch (rule) {
    case 'LOW': {
      const days = c.daysLeft != null ? `, roughly ${Math.max(1, Math.round(c.daysLeft))} day${Math.round(c.daysLeft) === 1 ? '' : 's'} at your usual pace` : '';
      return { title: 'Gas is running low', body: `${c.name} is at ${level ?? 'a low level'}${left ? ` (about ${left} left)` : ''}${days}. Time to order a refill.` };
    }
    case 'EMPTY':
      return { title: 'Gas is almost finished', body: `${c.name} has less than ${EMPTY_KG} kg left. Order a refill now so you do not run out.` };
    case 'OFFLINE':
      return {
        title: 'Your monitor is offline',
        body: `${c.name} has not checked in${c.lastSeenAt ? ` since ${formatLagos(c.lastSeenAt)}` : ''}${level ? `; its last reading was ${level}` : ''}. Check that it has power and signal.`,
      };
    case 'LOW_BATTERY':
      return { title: 'Monitor battery is low', body: `${c.name}'s battery is low${c.batteryPct != null ? ` (${c.batteryPct}%)` : ''}. Replace the batteries soon so it keeps reporting.` };
  }
}

/** Which extra channels each alert uses. In-app is always on; push follows the person's own setting. */
export const CHANNELS: Record<AlertRule, { push: boolean; email: boolean; sms: boolean }> = {
  LOW: { push: true, email: false, sms: false },
  EMPTY: { push: true, email: true, sms: true },
  OFFLINE: { push: true, email: false, sms: true },
  LOW_BATTERY: { push: true, email: true, sms: false },
};

// ── Evaluation ───────────────────────────────────────────────────────────────

interface Recipient {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  pushEnabled: boolean;
  emailNotifEnabled: boolean;
  smsAlertsEnabled: boolean;
}

export interface FiredAlert {
  deviceId: string;
  rule: AlertRule;
  title: string;
  body: string;
  recipients: Recipient[];
}

type Tx = Prisma.TransactionClient;

/** Compare-and-set: exactly one caller wins an armed rule. (createMany + skipDuplicates avoids aborting the transaction on a race.) */
async function claim(tx: Tx, deviceId: string, rule: AlertRule, now: Date): Promise<boolean> {
  const won = await tx.deviceAlertState.updateMany({ where: { deviceId, rule, armed: true }, data: { armed: false, firedAt: now, lastNotifiedAt: now } });
  if (won.count === 1) return true;
  const created = await tx.deviceAlertState.createMany({ data: [{ deviceId, rule, armed: false, firedAt: now, lastNotifiedAt: now }], skipDuplicates: true });
  return created.count === 1;
}

/**
 * Check one device against its rules and fire what is due. `rules` limits which are
 * checked (the offline sweep only checks OFFLINE). Safe to call as often as you like.
 */
export async function evaluateDeviceAlerts(deviceId: string, now = new Date(), rules: readonly AlertRule[] = RULES): Promise<FiredAlert[]> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      state: true,
      config: true,
      cylinder: { select: { sizeKg: true } },
      alertStates: true,
      members: {
        where: { role: { in: ['OWNER', 'MEMBER'] }, user: { isSuspended: false } },
        select: { user: { select: { id: true, name: true, email: true, emailVerified: true, phone: true, pushEnabled: true, emailNotifEnabled: true, smsAlertsEnabled: true } } },
      },
    },
  });
  // Nobody to tell (not claimed yet), or cut off: nothing to evaluate.
  if (!device || device.revokedAt || !device.state || device.members.length === 0) return [];

  const s = device.state;
  const recipients = device.members.map((m) => m.user);
  const states = new Map(device.alertStates.map((a) => [a.rule, a]));
  const desired = readDesired(device.config?.desired);
  const t: Thresholds = { lowPercent: device.lowPercent, lowKg: device.lowKg, lowDays: device.lowDays };
  const nominal = device.cylinder?.sizeKg ?? null;
  const present = s.grossKg != null ? computeGas(s.grossKg, device.emptyWeightKg, nominal).present : false;
  const gas: Gas = { present, netKg: s.netKg, percent: s.percent };

  let daysLeft: number | null = null;
  if (rules.includes('LOW') && t.lowDays != null) {
    const since = new Date(now.getTime() - FORECAST_WINDOW_DAYS * 86_400_000);
    daysLeft = forecastDaysLeft(s.netKg, await prisma.deviceReadingDaily.findMany({ where: { deviceId, day: { gte: since } }, select: { consumedKg: true, readings: true } }));
  }

  const offlineFire = s.lastSeenAt != null && now.getTime() - s.lastSeenAt.getTime() > offlineAfterMs(desired.reportEverySec);
  const batteryFire = !s.externalPower && s.batteryMv != null && s.batteryMv <= desired.lowBatteryMv;
  const batteryClear = s.externalPower || (s.batteryMv != null && s.batteryMv > desired.lowBatteryMv + BATTERY_REARM_MV);

  const verdict: Record<AlertRule, { fire: boolean; clear: boolean }> = {
    LOW: { fire: isLow(gas, t, daysLeft), clear: isClearOfLow(gas, t, daysLeft) },
    EMPTY: { fire: isEmpty(gas), clear: isClearOfEmpty(gas) },
    // Just heard from it (this runs after a reading) means it is not offline: clear. The sweep passes only OFFLINE.
    OFFLINE: { fire: offlineFire, clear: !offlineFire && s.lastSeenAt != null },
    LOW_BATTERY: { fire: batteryFire, clear: batteryClear },
  };

  const ctx: MessageContext = { name: device.nickname?.trim() || 'Your gas monitor', percent: s.percent, netKg: s.netKg, daysLeft, lastSeenAt: s.lastSeenAt, batteryPct: s.batteryPct };
  const fired: FiredAlert[] = [];

  // EMPTY first: if a cylinder is first seen already finished, one "almost finished" beats two alerts at once.
  const order = (['EMPTY', 'LOW', 'OFFLINE', 'LOW_BATTERY'] as const).filter((r) => rules.includes(r));
  for (const rule of order) {
    const action = decide(states.get(rule) ?? null, verdict[rule].fire, verdict[rule].clear);
    if (action === 'fire' && rule === 'LOW' && fired.some((f) => f.rule === 'EMPTY')) {
      // Still mark LOW as fired so it does not announce itself a minute later.
      await prisma.$transaction((tx) => claim(tx, deviceId, 'LOW', now));
      continue;
    }
    if (action === 'rearm') {
      await prisma.deviceAlertState.updateMany({ where: { deviceId, rule, armed: false }, data: { armed: true } });
    } else if (action === 'fire') {
      const { title, body } = alertMessage(rule, ctx);
      const won = await prisma.$transaction(async (tx) => {
        if (!(await claim(tx, deviceId, rule, now))) return false;
        // LOW and EMPTY lead to the refill suggestions; the others to the monitor itself.
        const kind = rule === 'LOW' || rule === 'EMPTY' ? 'REFILL' : 'MONITOR';
        await tx.notification.createMany({ data: recipients.map((u) => ({ userId: u.id, title, body, kind, refId: deviceId })) });
        await tx.deviceEvent.create({
          data: { deviceId, t: now, code: `ALERT_${rule}`, payload: { percent: s.percent, netKg: s.netKg, daysLeft, batteryMv: s.batteryMv, lastSeenAt: s.lastSeenAt?.toISOString() ?? null } },
        });
        return true;
      });
      if (won) fired.push({ deviceId, rule, title, body, recipients });
    }
  }

  // After the commit, and never allowed to throw into ingest.
  for (const alert of fired) await deliverExternal(alert).catch((err) => console.error(`[alerts] delivery failed for ${alert.deviceId}/${alert.rule}:`, err instanceof Error ? err.message : err));
  return fired;
}

/** Push, email and SMS for a fired alert, honouring each person's own settings. Best effort. */
export async function deliverExternal(a: FiredAlert): Promise<void> {
  const ch = CHANNELS[a.rule];
  const data = { type: 'device_alert', deviceId: a.deviceId, rule: a.rule, ...(a.rule === 'LOW' || a.rule === 'EMPTY' ? { action: 'order' } : {}) };

  if (ch.push) {
    const ids = a.recipients.filter((r) => r.pushEnabled).map((r) => r.id);
    if (ids.length) {
      const tokens = await prisma.pushToken.findMany({ where: { userId: { in: ids } }, select: { token: true } });
      if (tokens.length) await sendExpoPush(tokens, a.title, a.body, data, 'alerts');
    }
  }

  if (ch.email) {
    const resend = getClient();
    if (resend) {
      for (const r of a.recipients.filter((x) => x.emailVerified && x.emailNotifEnabled)) {
        const { error } = await resend.emails.send({ from: EMAIL_FROM, to: r.email, subject: a.title, html: renderBroadcastHtml(a.title, a.body, r.name) });
        if (error) console.error('[alerts] Resend failed:', error.message);
      }
    }
  }

  // SMS costs credit, so only people who switched SMS alerts on, and only for the alerts that matter most.
  if (ch.sms && process.env.TERMII_API_KEY) {
    const { getTermiiService } = await import('../services/termii-service');
    const termii = getTermiiService();
    for (const r of a.recipients.filter((x) => x.smsAlertsEnabled && x.phone)) {
      await termii.sendSms(r.phone!, `4FG: ${a.title}. ${a.body}`).catch((err) => console.error('[alerts] SMS failed:', err instanceof Error ? err.message : err));
    }
  }
}

// ── Offline sweep ────────────────────────────────────────────────────────────

/** Fire OFFLINE for claimed devices that have gone quiet. Run every minute or so by the ingest worker. */
export async function sweepOffline(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - OFFLINE_MIN_MS);
  const quiet = await prisma.deviceState.findMany({
    where: {
      lastSeenAt: { lt: cutoff },
      // Already alerted ones are skipped here, so a long-dead device is not re-examined every minute.
      device: { claimedAt: { not: null }, revokedAt: null, alertStates: { none: { rule: 'OFFLINE', armed: false } } },
    },
    select: { deviceId: true, lastSeenAt: true, device: { select: { config: { select: { desired: true } } } } },
    orderBy: { lastSeenAt: 'asc' },
    take: 500,
  });
  let fired = 0;
  for (const { deviceId, lastSeenAt, device } of quiet) {
    // A device that reports hourly is "quiet" for 20 minutes most of the time; only look closely at the truly overdue.
    const overdue = lastSeenAt != null && now.getTime() - lastSeenAt.getTime() > offlineAfterMs(readDesired(device.config?.desired).reportEverySec);
    if (!overdue) continue;
    const out = await evaluateDeviceAlerts(deviceId, now, ['OFFLINE']);
    fired += out.length;
  }
  return fired;
}
