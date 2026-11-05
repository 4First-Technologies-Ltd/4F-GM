import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { deviceClaimLimiter } from '../lib/security';
import { prisma } from '../lib/prisma';
import { verifyClaimCode } from '../lib/deviceAuth';
import { COMMAND_TYPES, CONFIG_LIMITS, DEFAULT_DEVICE_CONFIG, isValidDeviceId, type CommandType } from '../lib/deviceProtocol';
import { createCommand, presentCommand } from '../lib/deviceCommands';
import { deriveWakeThreshold, publishConfig, readDesired, sameConfig } from '../lib/deviceConfig';
import { busConfigured } from '../lib/deviceBus';
import { lagosDayStart } from '../lib/deviceDerive';
import { pickReorderOptions } from '../lib/deviceReorder';

/**
 * What the app and website read: the user's devices, live state, history and events.
 * Everything is scoped through DeviceMember, so a device id from someone else
 * answers 404, exactly as one that does not exist. Customers never see secrets,
 * claim hashes, or other members' accounts (owners see their own members).
 *
 * Writes: claiming, commands (the app asking a device to do something) and owner settings.
 */
const router = Router();
router.use(requireAuth);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Longest range each resolution may cover, so one request cannot read a whole table.
const MAX_RANGE_MS = { raw: 7 * DAY, hour: 90 * DAY, day: 800 * DAY } as const;
const MAX_RAW_ROWS = 1000;

/** Express 4 does not catch rejected promises: forward them to the app error handler. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

const uid = (req: Request) => req.user!.sub;
const notFound = (res: Response) => res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
const round = (n: number | null | undefined, dp = 2) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

const deviceInclude = {
  state: true,
  config: true,
  cylinder: { select: { id: true, name: true, sizeKg: true } },
} satisfies Prisma.DeviceInclude;

type DeviceFull = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

/** The device, only if this user is a member. */
async function accessible(userId: string, deviceId: string) {
  if (!isValidDeviceId(deviceId)) return null;
  const m = await prisma.deviceMember.findUnique({
    where: { deviceId_userId: { deviceId, userId } },
    include: { device: { include: deviceInclude } },
  });
  return m ? { role: m.role, device: m.device } : null;
}

function presentDevice(role: string, d: DeviceFull) {
  const s = d.state;
  const cfgDesired = d.config?.version ?? 0;
  const expectedEverySec = ((d.config?.desired as { reportEverySec?: number } | null)?.reportEverySec) ?? DEFAULT_DEVICE_CONFIG.reportEverySec;
  const readingAgeSec = s?.lastReadingAt ? Math.max(0, Math.round((Date.now() - s.lastReadingAt.getTime()) / 1000)) : null;
  return {
    id: d.id,
    nickname: d.nickname,
    role,
    cylinder: d.cylinder,
    emptyWeightKg: d.emptyWeightKg,
    alerts: { lowPercent: d.lowPercent, lowKg: d.lowKg, lowDays: d.lowDays },
    fw: s?.fw ?? d.fw,
    claimedAt: d.claimedAt,
    state: {
      online: s?.online ?? false,
      lastSeenAt: s?.lastSeenAt ?? null,
      lastReadingAt: s?.lastReadingAt ?? null,
      readingAgeSec,
      // No reading for well past the expected interval, whatever the connection says.
      stale: readingAgeSec == null ? true : readingAgeSec > expectedEverySec * 3,
      grossKg: round(s?.grossKg),
      netKg: round(s?.netKg),
      percent: round(s?.percent, 1),
      // null with a gross reading means: no empty weight known yet (calibrating) or no cylinder on the platform.
      calibrating: d.emptyWeightKg == null,
      tempC: round(s?.tempC, 1),
      batteryPct: s?.batteryPct ?? null,
      externalPower: s?.externalPower ?? false,
      rssi: s?.rssi ?? null,
    },
    config: {
      version: cfgDesired,
      applied: s?.cfgApplied ?? 0,
      pending: cfgDesired > (s?.cfgApplied ?? 0),
    },
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/', handle(async (req, res) => {
  const rows = await prisma.deviceMember.findMany({
    where: { userId: uid(req) },
    include: { device: { include: deviceInclude } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ devices: rows.filter((r) => !r.device.revokedAt).map((r) => presentDevice(r.role, r.device)) });
}));

// ── Claim ────────────────────────────────────────────────────────────────────

const claimSchema = z.object({
  deviceId: z.string().trim().min(3).max(32),
  claimCode: z.string().trim().min(6).max(20),
  nickname: z.string().trim().min(1).max(60).optional(),
});

const INVALID_CLAIM = { error: 'That device id and code do not match an unclaimed device.', code: 'INVALID_CLAIM' };

router.post('/claim', deviceClaimLimiter, handle(async (req, res) => {
  const body = claimSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Enter the device id and the claim code printed on the unit.', code: 'VALIDATION' });
  const { deviceId, claimCode, nickname } = body.data;
  const userId = uid(req);

  if (!isValidDeviceId(deviceId)) return res.status(404).json(INVALID_CLAIM);
  if (await prisma.deviceMember.findUnique({ where: { deviceId_userId: { deviceId, userId } } })) {
    return res.status(409).json({ error: 'This device is already linked to your account.', code: 'ALREADY_LINKED' });
  }

  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, claimCodeHash: true, ownerId: true, revokedAt: true } });
  // One answer for unknown, revoked, already claimed and wrong code: nothing to enumerate.
  if (!device || device.revokedAt || device.ownerId || !verifyClaimCode(claimCode, device.claimCodeHash)) {
    return res.status(404).json(INVALID_CLAIM);
  }

  const cylinder = await prisma.cylinderProfile.findFirst({ where: { userId, isActive: true }, select: { id: true } });

  try {
    await prisma.$transaction(async (tx) => {
      // Compare-and-set: two people entering the same code at once cannot both win.
      const won = await tx.device.updateMany({
        where: { id: deviceId, ownerId: null, claimCodeHash: device.claimCodeHash },
        data: { ownerId: userId, claimedAt: new Date(), claimCodeHash: null, nickname: nickname ?? null, cylinderId: cylinder?.id ?? null },
      });
      if (won.count !== 1) throw new Error('CLAIM_LOST');
      await tx.deviceMember.create({ data: { deviceId, userId, role: 'OWNER' } });
      await tx.deviceConfig.upsert({ where: { deviceId }, create: { deviceId, version: 1, desired: DEFAULT_DEVICE_CONFIG }, update: {} });
      await tx.deviceState.upsert({ where: { deviceId }, create: { deviceId }, update: {} });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'CLAIM_LOST') return res.status(404).json(INVALID_CLAIM);
    throw err;
  }

  // Best effort: the ingest worker also re-publishes every config when it starts.
  if (busConfigured()) publishConfig(deviceId).catch((err) => console.error(`[config] publish after claim failed for ${deviceId}:`, err instanceof Error ? err.message : err));

  const mine = await accessible(userId, deviceId);
  res.status(201).json({ device: presentDevice(mine!.role, mine!.device) });
}));

// ── One device ───────────────────────────────────────────────────────────────

router.get('/:id', handle(async (req, res) => {
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);

  const members =
    mine.role === 'OWNER'
      ? (await prisma.deviceMember.findMany({ where: { deviceId: mine.device.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } })).map(
          (m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role }),
        )
      : undefined;

  res.json({ device: presentDevice(mine.role, mine.device), ...(members ? { members } : {}) });
}));

// ── Refill suggestion ────────────────────────────────────────────────────────

/**
 * What the "order a refill" prompt shows: the cylinder size this device weighs and
 * the in-stock listings that sell it. It only suggests; the order itself goes
 * through the normal order endpoints, which price everything again server-side.
 */
router.get('/:id/reorder', handle(async (req, res) => {
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);

  const sizeKg = mine.device.cylinder?.sizeKg ?? null;
  if (sizeKg == null) return res.json({ sizeKg: null, options: [], hasOpenOrder: false, needsCylinder: true });

  const [listings, past, open] = await Promise.all([
    prisma.gasListing.findMany({
      where: {
        inStock: true,
        vendor: { status: 'APPROVED', user: { isSuspended: false } },
        OR: [{ branchId: null }, { branch: { isActive: true, suspendedAt: null } }],
      },
      select: {
        id: true, vendorId: true, pricePerKg: true, cylinderSizes: true, otherSizes: true,
        vendor: { select: { businessName: true } },
        branch: { select: { name: true, isMain: true, city: true } },
      },
    }),
    prisma.order.findMany({
      where: { consumerId: uid(req), vendorId: { not: null }, status: 'DELIVERED' },
      select: { vendorId: true },
      distinct: ['vendorId'],
      take: 50,
    }),
    // Paid and not yet delivered. An unpaid PENDING order does not count.
    prisma.order.findFirst({ where: { consumerId: uid(req), status: { in: ['CONFIRMED', 'OUT_FOR_DELIVERY'] } }, select: { id: true } }),
  ]);

  const previous = new Set(past.map((o) => o.vendorId!));
  res.json({ sizeKg, options: pickReorderOptions(sizeKg, listings, previous), hasOpenOrder: !!open, needsCylinder: false });
}));

// ── History ──────────────────────────────────────────────────────────────────

const readingsQuery = z.object({
  bucket: z.enum(['raw', 'hour', 'day']).default('hour'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_RAW_ROWS).default(500),
});

router.get('/:id/readings', handle(async (req, res) => {
  const q = readingsQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'Invalid query', code: 'VALIDATION', details: q.error.issues.map((i) => i.path.join('.') + ': ' + i.message) });
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);

  const { bucket, limit } = q.data;
  const to = q.data.to ?? new Date();
  const from = q.data.from ?? new Date(to.getTime() - (bucket === 'day' ? 30 * DAY : DAY));
  if (from >= to) return res.status(400).json({ error: '`from` must be before `to`', code: 'VALIDATION' });
  if (to.getTime() - from.getTime() > MAX_RANGE_MS[bucket]) {
    return res.status(400).json({ error: `At most ${MAX_RANGE_MS[bucket] / DAY} days per request at "${bucket}" resolution`, code: 'RANGE_TOO_LARGE' });
  }
  const deviceId = mine.device.id;

  if (bucket === 'raw') {
    // Newest `limit` rows in the range, returned oldest first for charting.
    const rows = await prisma.deviceReading.findMany({
      where: { deviceId, t: { gte: from, lte: to } },
      orderBy: { t: 'desc' },
      take: limit,
      select: { t: true, grossKg: true, netKg: true, percent: true, tempC: true, settled: true },
    });
    return res.json({ bucket, from, to, truncated: rows.length === limit, points: rows.reverse() });
  }

  if (bucket === 'hour') {
    const rows = await prisma.$queryRaw<
      Array<{ t: Date; grossKg: number; netKg: number | null; percent: number | null; minPercent: number | null; tempC: number | null; n: number }>
    >(Prisma.sql`
      SELECT date_trunc('hour', "t") AS "t",
             AVG("grossKg")::float8 AS "grossKg",
             AVG("netKg")::float8 AS "netKg",
             AVG("percent")::float8 AS "percent",
             MIN("percent")::float8 AS "minPercent",
             AVG("tempC")::float8 AS "tempC",
             COUNT(*)::int AS "n"
      FROM "device_readings"
      WHERE "deviceId" = ${deviceId} AND "t" >= ${from} AND "t" <= ${to} AND "settled" = true
      GROUP BY 1 ORDER BY 1`);
    return res.json({ bucket, from, to, points: rows.map((r) => ({ ...r, grossKg: round(r.grossKg), netKg: round(r.netKg), percent: round(r.percent, 1), minPercent: round(r.minPercent, 1), tempC: round(r.tempC, 1) })) });
  }

  const days = await prisma.deviceReadingDaily.findMany({
    where: { deviceId, day: { gte: lagosDayStart(from), lte: to } },
    orderBy: { day: 'asc' },
    select: { day: true, startKg: true, endKg: true, minKg: true, maxKg: true, consumedKg: true, readings: true },
  });
  res.json({ bucket, from, to, points: days });
}));

// ── Events ───────────────────────────────────────────────────────────────────

const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().regex(/^\d{1,18}$/).optional(),
  code: z.string().regex(/^[A-Z_]{2,40}$/).optional(),
});

router.get('/:id/events', handle(async (req, res) => {
  const q = eventsQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'Invalid query', code: 'VALIDATION' });
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);

  const { limit, before, code } = q.data;
  const rows = await prisma.deviceEvent.findMany({
    where: { deviceId: mine.device.id, ...(code ? { code } : {}), ...(before ? { id: { lt: BigInt(before) } } : {}) },
    orderBy: { id: 'desc' },
    take: limit + 1,
    select: { id: true, t: true, code: true, payload: true },
  });
  const page = rows.slice(0, limit);
  res.json({
    // BigInt ids are strings in JSON; pass the last one back as `before` for the next page.
    events: page.map((e) => ({ id: e.id.toString(), t: e.t, code: e.code, payload: e.payload })),
    next: rows.length > limit ? page.at(-1)!.id.toString() : null,
  });
}));

// ── Commands ─────────────────────────────────────────────────────────────────

const commandBody = z.object({
  type: z.enum(COMMAND_TYPES as [CommandType, ...CommandType[]]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/).optional(),
});

router.post('/:id/commands', handle(async (req, res) => {
  const body = commandBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: `type must be one of ${COMMAND_TYPES.join(', ')}`, code: 'VALIDATION' });
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);

  // The standard header wins, so a client library can retry blindly.
  const headerKey = req.header('Idempotency-Key');
  const out = await createCommand({
    deviceId: mine.device.id,
    online: mine.device.state?.online ?? false,
    userId: uid(req),
    role: mine.role,
    type: body.data.type,
    idempotencyKey: headerKey && /^[A-Za-z0-9_.:-]{8,80}$/.test(headerKey) ? headerKey : body.data.idempotencyKey,
  });
  if (!out.ok) {
    if (out.retryAfterSec) res.setHeader('Retry-After', String(out.retryAfterSec));
    return res.status(out.status).json({ error: out.error, code: out.code, ...(out.retryAfterSec ? { retryAfterSec: out.retryAfterSec } : {}) });
  }
  // 202: accepted, the device has not answered yet. Poll the command until it leaves QUEUED / SENT.
  res.status(out.reused ? 200 : 202).json({ command: presentCommand(out.command) });
}));

router.get('/:id/commands', handle(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);
  const rows = await prisma.deviceCommand.findMany({ where: { deviceId: mine.device.id }, orderBy: { requestedAt: 'desc' }, take: limit });
  res.json({ commands: rows.map((c) => presentCommand(c)) });
}));

router.get('/:id/commands/:cid', handle(async (req, res) => {
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);
  const c = await prisma.deviceCommand.findFirst({ where: { id: req.params.cid, deviceId: mine.device.id } });
  if (!c) return res.status(404).json({ error: 'Command not found', code: 'COMMAND_NOT_FOUND' });
  res.json({ command: presentCommand(c) });
}));

// ── Settings ─────────────────────────────────────────────────────────────────

// .strict(): unknown fields are an error, so nothing can be smuggled into the device row.
const settingsBody = z
  .object({
    nickname: z.string().trim().min(1).max(60).nullable().optional(),
    cylinderId: z.string().min(1).max(64).nullable().optional(),
    emptyWeightKg: z.number().min(1).max(100).nullable().optional(),
    reportEverySec: z.number().int().min(CONFIG_LIMITS.reportEverySec.min).max(CONFIG_LIMITS.reportEverySec.max).optional(),
    changeStepKg: z.number().min(CONFIG_LIMITS.changeStepKg.min).max(CONFIG_LIMITS.changeStepKg.max).optional(),
    // Low-gas alert: any configured criterion triggers it. null clears an optional one.
    lowPercent: z.number().min(1).max(90).optional(),
    lowKg: z.number().min(0.5).max(50).nullable().optional(),
    lowDays: z.number().min(0.5).max(30).nullable().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to change');

router.patch('/:id/settings', handle(async (req, res) => {
  const body = settingsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid settings', code: 'VALIDATION', details: body.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) });
  const mine = await accessible(uid(req), req.params.id);
  if (!mine || mine.device.revokedAt) return notFound(res);
  if (mine.role !== 'OWNER') return res.status(403).json({ error: 'Only the owner can change device settings.', code: 'FORBIDDEN_ROLE' });
  const d = mine.device;
  const s = body.data;

  let cylinder = d.cylinder;
  if (s.cylinderId !== undefined) {
    cylinder = null;
    if (s.cylinderId !== null) {
      // Only one of the caller's own cylinders; never trust a client-sent id alone.
      cylinder = await prisma.cylinderProfile.findFirst({ where: { id: s.cylinderId, userId: uid(req) }, select: { id: true, name: true, sizeKg: true } });
      if (!cylinder) return res.status(400).json({ error: 'That cylinder is not in your account.', code: 'INVALID_CYLINDER' });
    }
  }
  const emptyWeightKg = s.emptyWeightKg !== undefined ? s.emptyWeightKg : d.emptyWeightKg;
  const lowPercent = s.lowPercent ?? d.lowPercent;
  const lowKg = s.lowKg !== undefined ? s.lowKg : d.lowKg;

  // The report-faster threshold depends on cylinder and empty weight, so it follows them.
  const prev = readDesired(d.config?.desired);
  const next = {
    ...prev,
    reportEverySec: s.reportEverySec ?? prev.reportEverySec,
    changeStepKg: s.changeStepKg ?? prev.changeStepKg,
    wakeBelowKg: deriveWakeThreshold(emptyWeightKg, cylinder?.sizeKg ?? null, lowPercent, lowKg),
  };
  const configChanged = !sameConfig(prev, next);

  await prisma.$transaction(async (tx) => {
    await tx.device.update({
      where: { id: d.id },
      data: {
        ...(s.nickname !== undefined ? { nickname: s.nickname } : {}),
        ...(s.cylinderId !== undefined ? { cylinderId: s.cylinderId } : {}),
        ...(s.emptyWeightKg !== undefined ? { emptyWeightKg: s.emptyWeightKg } : {}),
        ...(s.lowPercent !== undefined ? { lowPercent: s.lowPercent } : {}),
        ...(s.lowKg !== undefined ? { lowKg: s.lowKg } : {}),
        ...(s.lowDays !== undefined ? { lowDays: s.lowDays } : {}),
      },
    });
    if (configChanged) {
      await tx.deviceConfig.upsert({
        where: { deviceId: d.id },
        create: { deviceId: d.id, version: 1, desired: next },
        update: { version: { increment: 1 }, desired: next },
      });
    }
  });

  // The database is the truth; the retained message is a copy. If the broker is unreachable the
  // change is still saved ("pending") and the ingest worker re-publishes it on its next start.
  let configPublished: boolean | null = null;
  if (configChanged) {
    configPublished = await publishConfig(d.id).then(() => true, (err) => {
      console.error(`[config] publish failed for ${d.id}:`, err instanceof Error ? err.message : err);
      return false;
    });
  }

  const fresh = await accessible(uid(req), d.id);
  res.json({ device: presentDevice(fresh!.role, fresh!.device), configPublished });
}));

export default router;
