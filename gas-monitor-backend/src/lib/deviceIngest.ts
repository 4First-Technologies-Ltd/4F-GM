import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  ackSchema,
  eventSchema,
  parseUpTopic,
  statusSchema,
  telemetrySchema,
} from './deviceProtocol';
import { evaluateDeviceAlerts } from './deviceAlerts';
import { computeGas, correctTimes, foldRollup, isCylinderSwap, lagosDayStart, type RollupPoint } from './deviceDerive';

/**
 * Turns messages a device published into rows. Pure of MQTT: the worker feeds
 * `routeMessage` a topic and bytes, so this is testable without a broker.
 *
 * Contract with the caller (the worker acknowledges the broker only after we return):
 *  - a rejected message (bad JSON, schema violation, unknown device) returns `{ ok: false }`
 *    and is dropped; retrying it could never succeed.
 *  - a database failure THROWS, so the caller retries and nothing is acknowledged.
 */

export type IngestOutcome =
  | { ok: true; detail?: string }
  | { ok: false; reason: 'topic' | 'json' | 'invalid' | 'unknown_device' | 'revoked'; detail?: string };

type Tx = Prisma.TransactionClient;

const DUP_WINDOW_MS = 5 * 60_000;

/**
 * Alerts are a consequence of data we have ALREADY committed. A failure here (a push outage,
 * a bad address) must never fail the ingest, or the broker would redeliver a message we stored.
 */
async function evaluateSafely(deviceId: string, at: Date): Promise<void> {
  try {
    await evaluateDeviceAlerts(deviceId, at);
  } catch (err) {
    console.error(`[alerts] evaluation failed for ${deviceId}:`, err instanceof Error ? err.message : err);
  }
}

async function loadDevice(deviceId: string) {
  return prisma.device.findUnique({
    where: { id: deviceId },
    include: { state: true, cylinder: { select: { sizeKg: true } } },
  });
}

const reject = (reason: Extract<IngestOutcome, { ok: false }>['reason'], detail?: string): IngestOutcome => ({ ok: false, reason, detail });

/** Record a cylinder change unless one was already logged within a few minutes (device event and our inference may both fire). */
async function recordCylinderChange(tx: Tx, deviceId: string, t: Date, payload: Prisma.InputJsonValue) {
  const near = await tx.deviceEvent.findFirst({
    where: {
      deviceId,
      code: 'CYLINDER_CHANGED',
      t: { gte: new Date(t.getTime() - DUP_WINDOW_MS), lte: new Date(t.getTime() + DUP_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (!near) await tx.deviceEvent.create({ data: { deviceId, t, code: 'CYLINDER_CHANGED', payload } });
}

// ── Telemetry ────────────────────────────────────────────────────────────────

export async function handleTelemetry(deviceId: string, payload: unknown, receivedAt = new Date()): Promise<IngestOutcome> {
  const parsed = telemetrySchema.safeParse(payload);
  if (!parsed.success) return reject('invalid', parsed.error.issues[0]?.message);
  const msg = parsed.data;

  const device = await loadDevice(deviceId);
  if (!device) return reject('unknown_device');
  if (device.revokedAt) return reject('revoked');

  const { times } = correctTimes(msg.r, msg.t, receivedAt);
  const nominal = device.cylinder?.sizeKg ?? null;
  const rows = msg.r
    .map((r, i) => {
      const gas = computeGas(r.kg, device.emptyWeightKg, nominal);
      return { t: times[i], grossKg: r.kg, tempC: r.c ?? null, settled: r.s === 1, ...gas };
    })
    .sort((a, b) => a.t.getTime() - b.t.getTime());

  const outcome: IngestOutcome = await prisma.$transaction(async (tx) => {
    const inserted = await tx.deviceReading.createMany({
      data: rows.map((r) => ({
        deviceId,
        t: r.t,
        receivedAt,
        seq: msg.seq,
        grossKg: r.grossKg,
        netKg: r.netKg,
        percent: r.percent,
        tempC: r.tempC,
        settled: r.settled,
        why: msg.why,
      })),
      skipDuplicates: true,
    });

    // Presence and health always update, even for a redelivered message.
    const health = {
      online: true,
      lastSeenAt: receivedAt,
      batteryPct: msg.bat?.pct,
      batteryMv: msg.bat?.mv,
      externalPower: msg.bat ? msg.bat.ext === 1 : undefined,
      rssi: msg.net?.rssi,
      cfgApplied: msg.cfg,
      fw: msg.fw,
      uptimeSec: msg.up,
    };

    if (inserted.count === 0) {
      await tx.deviceState.upsert({ where: { deviceId }, create: { deviceId, ...health }, update: health });
      return { ok: true, detail: 'duplicate' } as const;
    }

    // Only readings newer than what we already show move the live view and the rollups.
    const lastAt = device.state?.lastReadingAt ?? null;
    const fresh = rows.filter((r) => !lastAt || r.t > lastAt);
    const latest = fresh.at(-1);
    const live = latest
      ? { lastReadingAt: latest.t, grossKg: latest.grossKg, netKg: latest.netKg, percent: latest.percent, tempC: latest.tempC }
      : {};
    await tx.deviceState.upsert({ where: { deviceId }, create: { deviceId, ...health, ...live }, update: { ...health, ...live } });

    const fwChanged = msg.fw !== undefined && msg.fw !== device.fw;
    const calChanged = msg.cal !== undefined && msg.cal !== device.platformCal;
    if (fwChanged || calChanged) {
      await tx.device.update({ where: { id: deviceId }, data: { fw: msg.fw ?? device.fw, platformCal: msg.cal ?? device.platformCal } });
    }

    // What the device last showed, for the first step of the batch.
    let prev: { grossKg: number; present: boolean } | null =
      device.state?.grossKg != null
        ? { grossKg: device.state.grossKg, present: computeGas(device.state.grossKg, device.emptyWeightKg, nominal).present }
        : null;

    // Daily rollups, one per Lagos day touched.
    const byDay = new Map<number, RollupPoint[]>();
    for (const r of fresh) {
      const k = lagosDayStart(r.t).getTime();
      byDay.set(k, [...(byDay.get(k) ?? []), { t: r.t, grossKg: r.grossKg, present: r.present, settled: r.settled }]);
    }
    for (const [dayMs, points] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
      const day = new Date(dayMs);
      const existing = await tx.deviceReadingDaily.findUnique({ where: { deviceId_day: { deviceId, day } } });
      const next = foldRollup(existing, prev, points);
      if (next) await tx.deviceReadingDaily.upsert({ where: { deviceId_day: { deviceId, day } }, create: { deviceId, day, ...next }, update: next });
      const last = points.at(-1)!;
      prev = { grossKg: last.grossKg, present: last.present };
    }

    // Infer a cylinder swap from the series; the device may also send its own event.
    let before = device.state?.grossKg ?? null;
    for (const r of fresh) {
      if (r.settled && before != null && isCylinderSwap(before, r.grossKg)) {
        await recordCylinderChange(tx, deviceId, r.t, { inferred: true, fromKg: before, toKg: r.grossKg });
      }
      if (r.settled) before = r.grossKg;
    }

    return { ok: true, detail: `${inserted.count} readings` } as const;
  });
  if (outcome.ok && outcome.detail !== 'duplicate') await evaluateSafely(deviceId, receivedAt);
  return outcome;
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function handleEvent(deviceId: string, payload: unknown, receivedAt = new Date()): Promise<IngestOutcome> {
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return reject('invalid', parsed.error.issues[0]?.message);
  const msg = parsed.data;

  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, revokedAt: true } });
  if (!device) return reject('unknown_device');
  if (device.revokedAt) return reject('revoked');

  const t = correctTimes([{ t: msg.t }], msg.t, receivedAt).times[0];
  const data = (msg.data ?? undefined) as Prisma.InputJsonValue | undefined;

  await prisma.$transaction(async (tx) => {
    if (msg.code === 'CYLINDER_CHANGED') await recordCylinderChange(tx, deviceId, t, data ?? {});
    else await tx.deviceEvent.create({ data: { deviceId, t, code: msg.code, payload: data } });
    await tx.deviceState.upsert({ where: { deviceId }, create: { deviceId, online: true, lastSeenAt: receivedAt }, update: { online: true, lastSeenAt: receivedAt } });
  });
  if (msg.code === 'LOW_BATTERY') await evaluateSafely(deviceId, receivedAt);
  return { ok: true };
}

// ── Acknowledgements ─────────────────────────────────────────────────────────

export async function handleAck(deviceId: string, payload: unknown, receivedAt = new Date()): Promise<IngestOutcome> {
  const parsed = ackSchema.safeParse(payload);
  if (!parsed.success) return reject('invalid', parsed.error.issues[0]?.message);
  const msg = parsed.data;

  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, revokedAt: true } });
  if (!device) return reject('unknown_device');
  if (device.revokedAt) return reject('revoked');

  if ('cmd' in msg) {
    const status = msg.res === 'OK' ? 'ACKED' : msg.res === 'EXPIRED' ? 'EXPIRED' : 'FAILED';
    // The device's word is the truth: it may have acted just after we gave up on it (EXPIRED).
    // Already-final rows (ACKED / FAILED / CANCELLED) are left alone, which also absorbs duplicate acks.
    const res = await prisma.deviceCommand.updateMany({
      where: { id: msg.cmd, deviceId, status: { in: ['QUEUED', 'SENT', 'EXPIRED'] } },
      data: { status, ackedAt: receivedAt, result: msg.res, detail: msg.detail ?? null },
    });
    return { ok: true, detail: res.count ? status : 'ignored' };
  }

  await prisma.$transaction(async (tx) => {
    if (msg.res === 'OK') {
      await tx.deviceState.upsert({ where: { deviceId }, create: { deviceId, cfgApplied: msg.cfg, lastSeenAt: receivedAt }, update: {} });
      await tx.deviceState.updateMany({ where: { deviceId, cfgApplied: { lt: msg.cfg } }, data: { cfgApplied: msg.cfg } });
    } else {
      await tx.deviceEvent.create({
        data: { deviceId, t: receivedAt, code: 'CONFIG_REJECTED', payload: { cfg: msg.cfg, res: msg.res, detail: msg.detail ?? null } },
      });
    }
  });
  return { ok: true };
}

// ── Presence ─────────────────────────────────────────────────────────────────

export async function handleStatus(deviceId: string, payload: unknown, receivedAt = new Date()): Promise<IngestOutcome> {
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return reject('invalid', parsed.error.issues[0]?.message);
  const msg = parsed.data;

  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, revokedAt: true } });
  if (!device) return reject('unknown_device');
  if (device.revokedAt) return reject('revoked');

  const online = msg.state === 'online';
  // `offline` is the broker's last will: we only learn the device vanished, not when it last spoke.
  await prisma.deviceState.upsert({
    where: { deviceId },
    create: { deviceId, online, ...(online ? { lastSeenAt: receivedAt, fw: msg.fw } : {}) },
    update: { online, ...(online ? { lastSeenAt: receivedAt, fw: msg.fw } : {}) },
  });
  return { ok: true };
}

// ── Router ───────────────────────────────────────────────────────────────────

/** Entry point for the worker. Returns an outcome for rejected input; throws on database failure. */
export async function routeMessage(topic: string, payload: Buffer | string, receivedAt = new Date()): Promise<IngestOutcome> {
  const where = parseUpTopic(topic);
  if (!where) return reject('topic', topic);

  let body: unknown;
  try {
    body = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'));
  } catch {
    return reject('json');
  }

  switch (where.kind) {
    case 'telemetry': return handleTelemetry(where.deviceId, body, receivedAt);
    case 'event': return handleEvent(where.deviceId, body, receivedAt);
    case 'ack': return handleAck(where.deviceId, body, receivedAt);
    case 'status': return handleStatus(where.deviceId, body, receivedAt);
  }
}
