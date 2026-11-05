import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  deviceCommand: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  deviceConfig: { findUnique: vi.fn(), findMany: vi.fn() },
}));
const bus = vi.hoisted(() => ({ busConfigured: vi.fn(), publishToDevice: vi.fn() }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/deviceBus', () => bus);

import { createCommand, presentCommand, sweepExpiredCommands } from '../src/lib/deviceCommands';
import { deriveWakeThreshold, readDesired, sameConfig, syncAllConfigs } from '../src/lib/deviceConfig';

const NOW = new Date('2026-11-03T10:00:00Z');
const base = { deviceId: 'FG-T-0001', online: true, userId: 'u1', role: 'OWNER' as const, type: 'REPORT_NOW' as const };
const row = (over: object = {}) => ({
  id: 'cmd_x', deviceId: 'FG-T-0001', type: 'REPORT_NOW', args: null, status: 'QUEUED', requestedBy: 'u1', idempotencyKey: null,
  requestedAt: NOW, sentAt: null, ackedAt: null, expiresAt: new Date(NOW.getTime() + 30_000), result: null, detail: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  bus.busConfigured.mockReturnValue(true);
  bus.publishToDevice.mockResolvedValue(undefined);
  db.deviceCommand.findUnique.mockResolvedValue(null);
  db.deviceCommand.findFirst.mockResolvedValue(null);
  db.deviceCommand.create.mockImplementation(async ({ data }: any) => row(data));
  db.deviceCommand.updateMany.mockResolvedValue({ count: 1 });
});

describe('who may send what', () => {
  it('a member can ask for a refresh but not zero the scale', async () => {
    expect((await createCommand({ ...base, role: 'MEMBER' }, NOW)).ok).toBe(true);
    expect(await createCommand({ ...base, role: 'MEMBER', type: 'TARE' }, NOW)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' });
  });
  it('a viewer can send nothing', async () => {
    for (const type of ['REPORT_NOW', 'TARE', 'REBOOT'] as const) {
      expect(await createCommand({ ...base, role: 'VIEWER', type }, NOW)).toMatchObject({ ok: false, status: 403 });
    }
    expect(db.deviceCommand.create).not.toHaveBeenCalled();
  });
});

describe('offline devices', () => {
  it('never queues a tare or refresh for a device that is offline', async () => {
    for (const type of ['TARE', 'REPORT_NOW'] as const) {
      expect(await createCommand({ ...base, online: false, type }, NOW)).toMatchObject({ ok: false, status: 409, code: 'DEVICE_OFFLINE' });
    }
    expect(db.deviceCommand.create).not.toHaveBeenCalled();
    expect(bus.publishToDevice).not.toHaveBeenCalled();
  });
  it('does queue a reboot, which is harmless to run late', async () => {
    const out = await createCommand({ ...base, online: false, type: 'REBOOT' }, NOW);
    expect(out.ok).toBe(true);
  });
  it('says so plainly when there is no broker configured', async () => {
    bus.busConfigured.mockReturnValue(false);
    expect(await createCommand(base, NOW)).toMatchObject({ ok: false, status: 503, code: 'CHANNEL_UNAVAILABLE' });
  });
});

describe('rate limiting', () => {
  it('refuses a repeat inside the minimum interval and says how long to wait', async () => {
    db.deviceCommand.findFirst.mockResolvedValue({ requestedAt: new Date(NOW.getTime() - 10_000) });
    const out = await createCommand({ ...base, type: 'TARE' }, NOW); // 30 s interval, 10 s ago
    expect(out).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED', retryAfterSec: 20 });
    expect(db.deviceCommand.create).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('stores the command with its deadline, publishes it, then marks it sent', async () => {
    const out = await createCommand({ ...base, type: 'TARE' }, NOW);
    expect(out.ok && out.reused).toBe(false);
    const created = db.deviceCommand.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ deviceId: 'FG-T-0001', type: 'TARE', status: 'QUEUED', requestedBy: 'u1' });
    expect(created.expiresAt.getTime() - NOW.getTime()).toBe(60_000);

    const [topic, payload] = bus.publishToDevice.mock.calls[0];
    expect(topic).toBe('4fg/v1/d/FG-T-0001/dn/cmd');
    expect(JSON.parse(payload)).toMatchObject({ id: created.id, type: 'TARE', issued: NOW.toISOString(), ttl: 60, args: {} });

    // Compare-and-set, so an ack that arrived first is never overwritten by SENT.
    expect(db.deviceCommand.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: created.id, status: 'QUEUED' }, data: { status: 'SENT' } });
  });
  it('a broker failure marks the command failed and tells the caller, rather than leaving it "sent"', async () => {
    bus.publishToDevice.mockRejectedValue(new Error('broker down'));
    const out = await createCommand(base, NOW);
    expect(out).toMatchObject({ ok: false, status: 503, code: 'CHANNEL_UNAVAILABLE' });
    expect(db.deviceCommand.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', detail: 'CHANNEL_UNAVAILABLE' });
  });
});

describe('idempotency', () => {
  it('a repeated key returns the original command and sends nothing new', async () => {
    db.deviceCommand.findUnique.mockResolvedValue(row({ id: 'cmd_first', status: 'ACKED' }));
    const out = await createCommand({ ...base, idempotencyKey: 'tap-1234abcd' }, NOW);
    expect(out).toMatchObject({ ok: true, reused: true });
    expect(db.deviceCommand.create).not.toHaveBeenCalled();
    expect(bus.publishToDevice).not.toHaveBeenCalled();
  });
  it('two identical requests racing past the lookup produce one command', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' });
    db.deviceCommand.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ id: 'cmd_winner' }));
    db.deviceCommand.create.mockRejectedValueOnce(dup);
    const out = await createCommand({ ...base, idempotencyKey: 'tap-1234abcd' }, NOW);
    expect(out).toMatchObject({ ok: true, reused: true });
    expect(out.ok && out.command.id).toBe('cmd_winner');
    expect(bus.publishToDevice).not.toHaveBeenCalled();
  });
  it('a permission failure is reported even when the key was used before', async () => {
    expect(await createCommand({ ...base, role: 'VIEWER', idempotencyKey: 'tap-1234abcd' }, NOW)).toMatchObject({ ok: false, status: 403 });
  });
});

describe('expiry', () => {
  it('a command past its deadline reads as EXPIRED before the sweeper has run', () => {
    const lapsed = presentCommand(row({ status: 'SENT', expiresAt: new Date(NOW.getTime() - 1) }) as any, NOW);
    expect(lapsed).toMatchObject({ status: 'EXPIRED', result: 'EXPIRED' });
    expect(presentCommand(row({ status: 'SENT' }) as any, NOW).status).toBe('SENT');
  });
  it('a device answer is not overridden by the clock', () => {
    const done = presentCommand(row({ status: 'ACKED', result: 'OK', expiresAt: new Date(NOW.getTime() - 99_000) }) as any, NOW);
    expect(done).toMatchObject({ status: 'ACKED', result: 'OK' });
  });
  it('the sweeper only touches commands still waiting', async () => {
    db.deviceCommand.updateMany.mockResolvedValue({ count: 3 });
    expect(await sweepExpiredCommands(NOW)).toBe(3);
    expect(db.deviceCommand.updateMany.mock.calls[0][0]).toMatchObject({ where: { status: { in: ['QUEUED', 'SENT'] }, expiresAt: { lte: NOW } }, data: { status: 'EXPIRED' } });
  });
});

describe('wake threshold (gross kg)', () => {
  it('is the empty cylinder plus the last stretch of gas', () => {
    expect(deriveWakeThreshold(15, 12.5)).toBe(18.8); // 15 + 2.5 (20% of 12.5) + 1.25 margin
    expect(deriveWakeThreshold(15, 6)).toBe(18); // small cylinder: the 2 kg floor, 1 kg margin
    expect(deriveWakeThreshold(56, 50)).toBe(71); // 56 + 10 + 5: a 50 kg cylinder is well past the old 50 kg cap
  });
  it('follows the owner\'s own low-gas level', () => {
    expect(deriveWakeThreshold(15, 12.5, 40)).toBe(21.3); // 40% of 12.5 = 5 kg
    expect(deriveWakeThreshold(15, 12.5, 20, 6)).toBe(22.3); // a 6 kg criterion beats 20%
  });
  it('is off until the empty weight is known', () => {
    expect(deriveWakeThreshold(null, 12.5)).toBe(0);
  });
  it('never exceeds what the device accepts', () => {
    expect(deriveWakeThreshold(149, 50)).toBeLessThanOrEqual(150);
  });
});

describe('config helpers', () => {
  it('fills defaults for anything missing from the stored row', () => {
    expect(readDesired({ reportEverySec: 600 })).toEqual({ reportEverySec: 600, changeStepKg: 0.5, wakeBelowKg: 0, lowBatteryMv: 3300 });
    expect(readDesired(null).reportEverySec).toBe(3600);
  });
  it('knows when nothing changed, so no pointless version bump', () => {
    expect(sameConfig(readDesired(null), readDesired({}))).toBe(true);
    expect(sameConfig(readDesired(null), { ...readDesired(null), wakeBelowKg: 17.3 })).toBe(false);
  });
  it('re-publishes every stored config, skipping a corrupt one without stopping', async () => {
    db.deviceConfig.findMany
      .mockResolvedValueOnce([
        { deviceId: 'FG-A-0001', version: 2, desired: { reportEverySec: 600 } },
        { deviceId: 'FG-B-0002', version: 1, desired: { reportEverySec: 5 } }, // out of range: must not be sent
      ])
      .mockResolvedValueOnce([]);
    const publish = vi.fn().mockResolvedValue(undefined);
    expect(await syncAllConfigs(publish)).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe('4fg/v1/d/FG-A-0001/dn/cfg');
    expect(JSON.parse(publish.mock.calls[0][1])).toMatchObject({ version: 2, reportEverySec: 600 });
  });
});
