import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tx: any = {
    deviceReading: { createMany: vi.fn() },
    deviceState: { upsert: vi.fn(), updateMany: vi.fn() },
    device: { update: vi.fn() },
    deviceReadingDaily: { findUnique: vi.fn(), upsert: vi.fn() },
    deviceEvent: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    device: { findUnique: vi.fn() },
    deviceCommand: { updateMany: vi.fn() },
    deviceState: tx.deviceState,
    deviceEvent: tx.deviceEvent,
    $transaction: vi.fn((fn: (t: any) => unknown) => fn(tx)),
  };
});
const alerts = vi.hoisted(() => ({ evaluateDeviceAlerts: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/deviceAlerts', () => alerts);

import { handleAck, handleEvent, handleStatus, handleTelemetry, routeMessage } from '../src/lib/deviceIngest';

const NOW = new Date('2026-11-02T12:00:00Z');
const telemetry = (over: object = {}) => ({ v: 1, seq: 1, t: '2026-11-02T12:00:00Z', r: [{ t: '2026-11-02T12:00:00Z', kg: 20 }], ...over });
const device = (over: object = {}) => ({ id: 'FG-T-0001', revokedAt: null, emptyWeightKg: 14.8, fw: null, platformCal: 1, state: null, cylinder: { sizeKg: 12.5 }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.device.findUnique.mockResolvedValue(device());
  db.tx.deviceReading.createMany.mockResolvedValue({ count: 1 });
  db.tx.deviceReadingDaily.findUnique.mockResolvedValue(null);
  db.tx.deviceEvent.findFirst.mockResolvedValue(null);
  db.deviceCommand.updateMany.mockResolvedValue({ count: 1 });
  alerts.evaluateDeviceAlerts.mockResolvedValue([]);
});

describe('what is dropped (never retried) versus what throws (retried)', () => {
  it('drops a message that violates the contract without touching the database', async () => {
    const out = await handleTelemetry('FG-T-0001', { v: 2 }, NOW);
    expect(out).toMatchObject({ ok: false, reason: 'invalid' });
    expect(db.device.findUnique).not.toHaveBeenCalled();
  });
  it('drops bad JSON and foreign topics', async () => {
    expect(await routeMessage('4fg/v1/d/FG-T-0001/up/telemetry', '{nope', NOW)).toMatchObject({ ok: false, reason: 'json' });
    expect(await routeMessage('other/topic', '{}', NOW)).toMatchObject({ ok: false, reason: 'topic' });
  });
  it('drops unknown and revoked devices', async () => {
    db.device.findUnique.mockResolvedValueOnce(null);
    expect(await handleTelemetry('FG-T-0001', telemetry(), NOW)).toMatchObject({ ok: false, reason: 'unknown_device' });
    db.device.findUnique.mockResolvedValueOnce(device({ revokedAt: new Date() }));
    expect(await handleTelemetry('FG-T-0001', telemetry(), NOW)).toMatchObject({ ok: false, reason: 'revoked' });
    expect(db.tx.deviceReading.createMany).not.toHaveBeenCalled();
  });
  it('lets a database failure propagate, so the worker retries and does not acknowledge', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(handleTelemetry('FG-T-0001', telemetry(), NOW)).rejects.toThrow('connection lost');
  });
});

describe('telemetry', () => {
  it('stores readings with gas figures computed from the cylinder', async () => {
    await handleTelemetry('FG-T-0001', telemetry({ r: [{ t: '2026-11-02T12:00:00Z', kg: 21.05 }] }), NOW);
    const rows = db.tx.deviceReading.createMany.mock.calls[0][0];
    expect(rows.skipDuplicates).toBe(true);
    expect(rows.data[0]).toMatchObject({ deviceId: 'FG-T-0001', grossKg: 21.05, netKg: 6.25, percent: 50, seq: 1 });
  });
  it('a redelivered message only refreshes presence', async () => {
    db.tx.deviceReading.createMany.mockResolvedValue({ count: 0 });
    const out = await handleTelemetry('FG-T-0001', telemetry(), NOW);
    expect(out).toEqual({ ok: true, detail: 'duplicate' });
    expect(db.tx.deviceReadingDaily.upsert).not.toHaveBeenCalled();
    expect(db.tx.deviceState.upsert).toHaveBeenCalledTimes(1);
  });
  it('an older batch does not rewind the live reading', async () => {
    db.device.findUnique.mockResolvedValue(device({ state: { lastReadingAt: new Date('2026-11-02T11:59:00Z'), grossKg: 21 } }));
    await handleTelemetry('FG-T-0001', telemetry({ r: [{ t: '2026-11-02T10:00:00Z', kg: 25 }] }), NOW);
    const upd = db.tx.deviceState.upsert.mock.calls[0][0].update;
    expect(upd.grossKg).toBeUndefined();
    expect(upd.online).toBe(true);
    expect(db.tx.deviceReadingDaily.upsert).not.toHaveBeenCalled();
  });
  it('infers a cylinder change from a big step up, once', async () => {
    db.device.findUnique.mockResolvedValue(device({ state: { lastReadingAt: new Date('2026-11-02T11:00:00Z'), grossKg: 16 } }));
    await handleTelemetry('FG-T-0001', telemetry({ r: [{ t: '2026-11-02T12:00:00Z', kg: 27.3 }] }), NOW);
    expect(db.tx.deviceEvent.create).toHaveBeenCalledTimes(1);
    expect(db.tx.deviceEvent.create.mock.calls[0][0].data).toMatchObject({ code: 'CYLINDER_CHANGED', payload: { inferred: true } });
  });
  it('does not repeat a cylinder change the device already reported', async () => {
    db.device.findUnique.mockResolvedValue(device({ state: { lastReadingAt: new Date('2026-11-02T11:00:00Z'), grossKg: 16 } }));
    db.tx.deviceEvent.findFirst.mockResolvedValue({ id: 1n });
    await handleTelemetry('FG-T-0001', telemetry({ r: [{ t: '2026-11-02T12:00:00Z', kg: 27.3 }] }), NOW);
    expect(db.tx.deviceEvent.create).not.toHaveBeenCalled();
  });
  it('stamps readings from a wrong device clock with the corrected time', async () => {
    await handleTelemetry('FG-T-0001', telemetry({ t: '2026-11-02T08:00:00Z', r: [{ t: '2026-11-02T08:00:00Z', kg: 20 }] }), NOW);
    expect(db.tx.deviceReading.createMany.mock.calls[0][0].data[0].t.toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});

describe('alerts are a consequence of stored data, never a reason to fail ingest', () => {
  it('evaluates the rules after a reading is stored', async () => {
    await handleTelemetry('FG-T-0001', telemetry(), NOW);
    expect(alerts.evaluateDeviceAlerts).toHaveBeenCalledWith('FG-T-0001', NOW);
  });
  it('does not re-evaluate for a redelivered message', async () => {
    db.tx.deviceReading.createMany.mockResolvedValue({ count: 0 });
    await handleTelemetry('FG-T-0001', telemetry(), NOW);
    expect(alerts.evaluateDeviceAlerts).not.toHaveBeenCalled();
  });
  it('a broken alert path does not fail the message (the broker would redeliver data we already stored)', async () => {
    alerts.evaluateDeviceAlerts.mockRejectedValue(new Error('push provider down'));
    await expect(handleTelemetry('FG-T-0001', telemetry(), NOW)).resolves.toMatchObject({ ok: true });
  });
  it('a low-battery event re-checks the rules; other events do not', async () => {
    await handleEvent('FG-T-0001', { v: 1, t: '2026-11-02T12:00:00Z', code: 'LOW_BATTERY', data: { mv: 3200 } }, NOW);
    expect(alerts.evaluateDeviceAlerts).toHaveBeenCalledTimes(1);
    alerts.evaluateDeviceAlerts.mockClear();
    await handleEvent('FG-T-0001', { v: 1, t: '2026-11-02T12:00:00Z', code: 'BOOT' }, NOW);
    expect(alerts.evaluateDeviceAlerts).not.toHaveBeenCalled();
  });
});

describe('acks', () => {
  it('maps the device result onto the command and only touches non-final commands', async () => {
    await handleAck('FG-T-0001', { cmd: 'c1', res: 'OK', t: '2026-11-02T12:00:00Z' }, NOW);
    const call = db.deviceCommand.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'c1', deviceId: 'FG-T-0001', status: { in: ['QUEUED', 'SENT', 'EXPIRED'] } });
    expect(call.data).toMatchObject({ status: 'ACKED', result: 'OK' });
    await handleAck('FG-T-0001', { cmd: 'c2', res: 'REJECTED', detail: 'PLATFORM_NOT_EMPTY', t: '2026-11-02T12:00:00Z' }, NOW);
    expect(db.deviceCommand.updateMany.mock.calls[1][0].data).toMatchObject({ status: 'FAILED', detail: 'PLATFORM_NOT_EMPTY' });
  });
  it('records a rejected config as an event the admin can see', async () => {
    await handleAck('FG-T-0001', { cfg: 9, res: 'REJECTED', detail: 'out of range', t: '2026-11-02T12:00:00Z' }, NOW);
    expect(db.tx.deviceEvent.create.mock.calls[0][0].data).toMatchObject({ code: 'CONFIG_REJECTED' });
  });
  it('an applied config only ever raises the applied version', async () => {
    await handleAck('FG-T-0001', { cfg: 3, res: 'OK', t: '2026-11-02T12:00:00Z' }, NOW);
    expect(db.tx.deviceState.updateMany.mock.calls[0][0]).toMatchObject({ where: { deviceId: 'FG-T-0001', cfgApplied: { lt: 3 } }, data: { cfgApplied: 3 } });
  });
});

describe('presence', () => {
  it('the broker\'s offline message does not pretend we heard from the device', async () => {
    await handleStatus('FG-T-0001', { state: 'offline' }, NOW);
    const call = db.deviceState.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ online: false });
  });
  it('online records when it connected', async () => {
    await handleStatus('FG-T-0001', { state: 'online', fw: '1.0.3' }, NOW);
    expect(db.deviceState.upsert.mock.calls[0][0].update).toMatchObject({ online: true, lastSeenAt: NOW, fw: '1.0.3' });
  });
});
