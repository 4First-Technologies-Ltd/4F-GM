import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tx = {
    deviceAlertState: { updateMany: vi.fn(), createMany: vi.fn() },
    notification: { createMany: vi.fn() },
    deviceEvent: { create: vi.fn() },
  };
  return {
    tx,
    device: { findUnique: vi.fn() },
    deviceAlertState: { updateMany: vi.fn() },
    deviceReadingDaily: { findMany: vi.fn() },
    deviceState: { findMany: vi.fn() },
    pushToken: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
});
const push = vi.hoisted(() => ({ sendExpoPush: vi.fn() }));
const mail = vi.hoisted(() => ({ send: vi.fn() }));
const sms = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/expoPush', () => push);
vi.mock('../src/lib/email', () => ({ EMAIL_FROM: 'from@4fg.test', getClient: () => ({ emails: { send: mail.send } }) }));
vi.mock('../src/services/termii-service', () => ({ getTermiiService: () => sms }));

import {
  alertMessage, decide, evaluateDeviceAlerts, forecastDaysLeft, isClearOfEmpty, isClearOfLow, isEmpty, isLow, offlineAfterMs, sweepOffline,
} from '../src/lib/deviceAlerts';

const NOW = new Date('2026-11-03T12:00:00Z');
const g = (netKg: number | null, percent: number | null, present = true) => ({ present, netKg, percent });
const T = { lowPercent: 20, lowKg: null, lowDays: null };

describe('decisions', () => {
  it('fires once when armed, re-arms only when cleared', () => {
    expect(decide(null, true, false)).toBe('fire'); // no row yet = armed
    expect(decide({ armed: true }, true, false)).toBe('fire');
    expect(decide({ armed: false }, true, false)).toBe('none'); // already told them
    expect(decide({ armed: false }, false, true)).toBe('rearm');
    expect(decide({ armed: false }, false, false)).toBe('none');
    expect(decide({ armed: true }, false, true)).toBe('none');
  });

  it('LOW triggers on any configured criterion, and never on unknown gas', () => {
    expect(isLow(g(2, 16), T, null)).toBe(true);
    expect(isLow(g(3, 24), T, null)).toBe(false);
    expect(isLow(g(3, 24), { ...T, lowKg: 3.5 }, null)).toBe(true);
    expect(isLow(g(8, 64), { ...T, lowDays: 5 }, 4)).toBe(true);
    expect(isLow(g(8, 64), { ...T, lowDays: 5 }, null)).toBe(false); // no forecast yet: do not guess
    expect(isLow(g(null, null), T, null)).toBe(false); // calibrating
    expect(isLow(g(null, null, false), T, null)).toBe(false); // cylinder off the platform
  });

  it('LOW only clears with a margin, so a wobbling reading does not re-alert', () => {
    expect(isClearOfLow(g(2.6, 21), T, null)).toBe(false); // just above the line is not clear
    expect(isClearOfLow(g(3.8, 31), T, null)).toBe(true);
    expect(isClearOfLow(g(12.5, 100), { ...T, lowKg: 3, lowDays: 4 }, 9)).toBe(true);
    expect(isClearOfLow(g(3.2, 26), { ...T, lowKg: 3 }, null)).toBe(false); // 3.2 kg is within 25% of the kg line
    expect(isClearOfLow(g(null, null, false), T, null)).toBe(false); // no evidence: stay as we are
  });

  it('EMPTY needs real gas to return before it clears', () => {
    expect(isEmpty(g(0.4, 3))).toBe(true);
    expect(isEmpty(g(0.6, 5))).toBe(false);
    expect(isEmpty(g(null, null, false))).toBe(false); // a lifted-off cylinder is not an empty one
    expect(isClearOfEmpty(g(1.0, 8))).toBe(false);
    expect(isClearOfEmpty(g(12.5, 100))).toBe(true);
  });

  it('a device is offline after 2.5 reporting intervals, and never in under 20 minutes', () => {
    expect(offlineAfterMs(3600)).toBe(2.5 * 3600 * 1000);
    expect(offlineAfterMs(60)).toBe(20 * 60_000);
  });
});

describe('forecast', () => {
  const day = (consumedKg: number, readings = 10) => ({ consumedKg, readings });
  it('days left at the recent pace', () => {
    expect(forecastDaysLeft(6, [day(1.5), day(1.5), day(1.5), day(1.5)])).toBe(4);
  });
  it('says nothing until there is real history', () => {
    expect(forecastDaysLeft(6, [day(1.5), day(1.5)])).toBeNull(); // two days is not enough
    expect(forecastDaysLeft(6, [day(1.5, 1), day(1.5, 2), day(1.5, 2)])).toBeNull(); // days with barely any readings do not count
    expect(forecastDaysLeft(null, [day(1), day(1), day(1)])).toBeNull();
    expect(forecastDaysLeft(6, [day(0), day(0.01), day(0)])).toBeNull(); // barely used: no meaningful figure
  });
});

describe('wording', () => {
  const ctx = { name: 'Kitchen', percent: 17.6, netKg: 2.2, daysLeft: null, lastSeenAt: NOW, batteryPct: 12 };
  it('says what happened in plain words, with the numbers', () => {
    expect(alertMessage('LOW', ctx)).toEqual({ title: 'Gas is running low', body: 'Kitchen is at 18% (about 2.2 kg left). Time to order a refill.' });
    expect(alertMessage('LOW', { ...ctx, daysLeft: 3.4 }).body).toContain('roughly 3 days at your usual pace');
    expect(alertMessage('EMPTY', ctx).body).toContain('less than 0.5 kg');
    expect(alertMessage('LOW_BATTERY', ctx).body).toContain('(12%)');
  });
  it('offline says when it was last heard from, in Lagos time', () => {
    const m = alertMessage('OFFLINE', ctx);
    expect(m.body).toContain('has not checked in since 3 Nov at 13:00'); // 12:00 UTC is 13:00 in Lagos
    expect(m.body).toContain('last reading was 18%');
  });
});

// ── Evaluation against the database ──────────────────────────────────────────

const user = (id: string, over: object = {}) => ({ id, name: id, email: `${id}@x.test`, emailVerified: true, phone: '08030000000', pushEnabled: true, emailNotifEnabled: true, smsAlertsEnabled: false, ...over });
const device = (over: object = {}, state: object = {}) => ({
  id: 'FG-T-0001', revokedAt: null, nickname: 'Kitchen', emptyWeightKg: 14.8, lowPercent: 20, lowKg: null, lowDays: null,
  cylinder: { sizeKg: 12.5 }, config: { desired: {} }, alertStates: [],
  members: [{ user: user('u1') }, { user: user('u2', { pushEnabled: false }) }],
  state: { grossKg: 17, netKg: 2.2, percent: 17.6, lastSeenAt: NOW, batteryMv: 3600, batteryPct: 80, externalPower: false, ...state },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.device.findUnique.mockResolvedValue(device());
  db.tx.deviceAlertState.updateMany.mockResolvedValue({ count: 0 });
  db.tx.deviceAlertState.createMany.mockResolvedValue({ count: 1 });
  db.deviceAlertState.updateMany.mockResolvedValue({ count: 1 });
  db.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
  db.deviceReadingDaily.findMany.mockResolvedValue([]);
  push.sendExpoPush.mockResolvedValue(1);
  mail.send.mockResolvedValue({ error: null });
  sms.sendSms.mockResolvedValue({});
  delete process.env.TERMII_API_KEY;
});

describe('evaluateDeviceAlerts', () => {
  it('fires LOW once: in-app for everyone, an event, push only for those who want it', async () => {
    const out = await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(out.map((a) => a.rule)).toEqual(['LOW']);
    expect(db.tx.notification.createMany.mock.calls[0][0].data.map((n: any) => n.userId)).toEqual(['u1', 'u2']);
    expect(db.tx.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ kind: 'REFILL', refId: 'FG-T-0001' }); // tapping it opens the refill suggestions
    expect(db.tx.deviceEvent.create.mock.calls[0][0].data).toMatchObject({ code: 'ALERT_LOW', deviceId: 'FG-T-0001' });
    expect(db.pushToken.findMany.mock.calls[0][0].where.userId.in).toEqual(['u1']); // u2 switched push off
    expect(push.sendExpoPush).toHaveBeenCalledWith(expect.any(Array), 'Gas is running low', expect.stringContaining('18%'), expect.objectContaining({ type: 'device_alert', rule: 'LOW', action: 'order' }), 'alerts');
    expect(mail.send).not.toHaveBeenCalled(); // LOW is push + in-app only
  });

  it('does not repeat an alert it already sent', async () => {
    db.device.findUnique.mockResolvedValue(device({ alertStates: [{ rule: 'LOW', armed: false }] }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    expect(db.tx.notification.createMany).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it('re-arms after a refill', async () => {
    db.device.findUnique.mockResolvedValue(device({ alertStates: [{ rule: 'LOW', armed: false }, { rule: 'EMPTY', armed: false }] }, { grossKg: 27.3, netKg: 12.5, percent: 100 }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    const rearmed = db.deviceAlertState.updateMany.mock.calls.map((c) => c[0].where.rule).sort();
    expect(rearmed).toEqual(['EMPTY', 'LOW']);
  });

  it('losing the race to another evaluator sends nothing', async () => {
    db.tx.deviceAlertState.createMany.mockResolvedValue({ count: 0 });
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    expect(db.tx.notification.createMany).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it('claims with compare-and-set, falling back to creating the row', async () => {
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(db.tx.deviceAlertState.updateMany.mock.calls[0][0]).toMatchObject({ where: { deviceId: 'FG-T-0001', rule: 'LOW', armed: true }, data: { armed: false } });
    expect(db.tx.deviceAlertState.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('says only "almost finished" when a cylinder is first seen already empty, and still marks LOW as told', async () => {
    db.device.findUnique.mockResolvedValue(device({}, { grossKg: 15.1, netKg: 0.3, percent: 2.4 }));
    const out = await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(out.map((a) => a.rule)).toEqual(['EMPTY']);
    const claimed = db.tx.deviceAlertState.createMany.mock.calls.map((c) => c[0].data[0].rule).sort();
    expect(claimed).toEqual(['EMPTY', 'LOW']);
    expect(db.tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(2); // EMPTY also emails: both members are verified and opted in
  });

  it('stays silent while calibrating or when the cylinder is off the platform', async () => {
    db.device.findUnique.mockResolvedValue(device({ emptyWeightKg: null }, { netKg: null, percent: null }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    db.device.findUnique.mockResolvedValue(device({}, { grossKg: 0.15, netKg: null, percent: null }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
  });

  it('does nothing for an unclaimed, revoked or stateless device', async () => {
    db.device.findUnique.mockResolvedValue(device({ members: [] }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    db.device.findUnique.mockResolvedValue(device({ revokedAt: new Date() }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    db.device.findUnique.mockResolvedValue(null);
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('uses the days-left forecast only when the owner asked for one', async () => {
    db.device.findUnique.mockResolvedValue(device({ lowDays: 5 }, { grossKg: 21, netKg: 6.2, percent: 49.6 }));
    db.deviceReadingDaily.findMany.mockResolvedValue([1.5, 1.5, 1.5, 1.5].map((c) => ({ consumedKg: c, readings: 10 }))); // ~4 days left
    expect((await evaluateDeviceAlerts('FG-T-0001', NOW)).map((a) => a.rule)).toEqual(['LOW']);
    expect(alertMessage('LOW', { name: 'K', percent: 49.6, netKg: 6.2, daysLeft: 4.1, lastSeenAt: null, batteryPct: null }).body).toContain('roughly 4 days');
    db.deviceReadingDaily.findMany.mockClear();
    db.device.findUnique.mockResolvedValue(device({}, { grossKg: 21, netKg: 6.2, percent: 49.6 }));
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(db.deviceReadingDaily.findMany).not.toHaveBeenCalled(); // no days threshold: no extra query per reading
  });

  it('SMS goes only to people who switched it on, for the alerts that warrant it, and only with an SMS provider configured', async () => {
    process.env.TERMII_API_KEY = 'k';
    db.device.findUnique.mockResolvedValue(device({ members: [{ user: user('u1', { smsAlertsEnabled: true }) }, { user: user('u2') }] }, { grossKg: 15.1, netKg: 0.3, percent: 2.4 }));
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(sms.sendSms.mock.calls[0][0]).toBe('08030000000');
    sms.sendSms.mockClear();
    db.device.findUnique.mockResolvedValue(device({ members: [{ user: user('u1', { smsAlertsEnabled: true }) }] })); // LOW: no SMS
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('email respects verification and the person\'s own setting', async () => {
    db.device.findUnique.mockResolvedValue(device({ members: [{ user: user('u1') }, { user: user('u2', { emailNotifEnabled: false }) }, { user: user('u3', { emailVerified: false }) }] }, { grossKg: 15.1, netKg: 0.3, percent: 2.4 }));
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(mail.send.mock.calls.map((c) => c[0].to)).toEqual(['u1@x.test']);
  });

  it('a delivery failure is contained: the alert is still recorded and nothing throws', async () => {
    push.sendExpoPush.mockRejectedValue(new Error('expo down'));
    await expect(evaluateDeviceAlerts('FG-T-0001', NOW)).resolves.toHaveLength(1);
    expect(db.tx.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('OFFLINE fires after 2.5 reporting intervals of silence, not before', async () => {
    const hourly = { config: { desired: { reportEverySec: 3600 } } };
    db.device.findUnique.mockResolvedValue(device(hourly, { lastSeenAt: new Date(NOW.getTime() - 2 * 3600_000) }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW, ['OFFLINE'])).toEqual([]);
    db.device.findUnique.mockResolvedValue(device(hourly, { lastSeenAt: new Date(NOW.getTime() - 3 * 3600_000) }));
    const out = await evaluateDeviceAlerts('FG-T-0001', NOW, ['OFFLINE']);
    expect(out.map((a) => a.rule)).toEqual(['OFFLINE']);
    expect(out[0].body).toContain('has not checked in since 3 Nov at 10:00');
  });

  it('OFFLINE re-arms as soon as the device is heard from again', async () => {
    db.device.findUnique.mockResolvedValue(device({ alertStates: [{ rule: 'OFFLINE', armed: false }] }));
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(db.deviceAlertState.updateMany.mock.calls.map((c) => c[0].where.rule)).toContain('OFFLINE');
  });

  it('LOW_BATTERY fires below the configured voltage, never on mains power, and re-arms with margin', async () => {
    const low = { batteryMv: 3200, batteryPct: 9 };
    db.device.findUnique.mockResolvedValue(device({}, { grossKg: 21, netKg: 6.2, percent: 49.6, ...low }));
    expect((await evaluateDeviceAlerts('FG-T-0001', NOW)).map((a) => a.rule)).toEqual(['LOW_BATTERY']);
    db.device.findUnique.mockResolvedValue(device({}, { grossKg: 21, netKg: 6.2, percent: 49.6, ...low, externalPower: true }));
    expect(await evaluateDeviceAlerts('FG-T-0001', NOW)).toEqual([]);
    db.deviceAlertState.updateMany.mockClear();
    db.device.findUnique.mockResolvedValue(device({ alertStates: [{ rule: 'LOW_BATTERY', armed: false }] }, { grossKg: 21, netKg: 6.2, percent: 49.6, batteryMv: 3500 }));
    await evaluateDeviceAlerts('FG-T-0001', NOW);
    expect(db.deviceAlertState.updateMany.mock.calls.map((c) => c[0].where.rule)).toContain('LOW_BATTERY');
  });
});

describe('sweepOffline', () => {
  it('looks closely only at devices that are overdue by their own interval', async () => {
    const q = (id: string, minutesAgo: number, reportEverySec: number) => ({ deviceId: id, lastSeenAt: new Date(NOW.getTime() - minutesAgo * 60_000), device: { config: { desired: { reportEverySec } } } });
    db.deviceState.findMany.mockResolvedValue([q('FG-A', 40, 3600), q('FG-B', 200, 3600), q('FG-C', 25, 300)]);
    db.device.findUnique.mockResolvedValue(device({ id: 'FG-X' }, { lastSeenAt: new Date(NOW.getTime() - 200 * 60_000) }));
    await sweepOffline(NOW);
    // A: quiet 40 min but reports hourly (limit 150 min): fine. B: 200 min: overdue. C: 25 min at 5 min interval (limit 20 min floor): overdue.
    expect(db.device.findUnique).toHaveBeenCalledTimes(2);
    expect(db.device.findUnique.mock.calls.map((c) => c[0].where.id)).toEqual(['FG-B', 'FG-C']);
  });
  it('never re-examines devices already alerted (filtered in the query)', async () => {
    db.deviceState.findMany.mockResolvedValue([]);
    await sweepOffline(NOW);
    expect(db.deviceState.findMany.mock.calls[0][0].where.device.alertStates).toEqual({ none: { rule: 'OFFLINE', armed: false } });
  });
});
