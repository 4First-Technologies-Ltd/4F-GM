import crypto from 'crypto';
import { Prisma, type DeviceCommand, type DeviceRole } from '@prisma/client';
import { prisma } from './prisma';
import { COMMAND_POLICY, deviceTopics, type CommandType } from './deviceProtocol';
import { busConfigured, publishToDevice } from './deviceBus';

/**
 * App → cloud → device commands. A command is a database row first (QUEUED), is
 * then published, and becomes ACKED / FAILED / EXPIRED when the device answers or
 * the clock runs out. See docs/CLOUD_ARCHITECTURE.md section 8.
 */

export type CommandResult =
  | { ok: true; command: DeviceCommand; reused: boolean }
  | { ok: false; status: 403 | 409 | 429 | 503; code: string; error: string; retryAfterSec?: number };

export const newCommandId = (): string => `cmd_${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;

export interface CreateCommandInput {
  deviceId: string;
  /** Presence from DeviceState: the broker's last word on whether the device is connected. */
  online: boolean;
  userId: string;
  role: DeviceRole;
  type: CommandType;
  /** Client-supplied; a repeat of the same key returns the original command instead of a new one. */
  idempotencyKey?: string;
}

const fail = (status: 403 | 409 | 429 | 503, code: string, error: string, retryAfterSec?: number): CommandResult => ({ ok: false, status, code, error, retryAfterSec });

export async function createCommand(input: CreateCommandInput, now = new Date()): Promise<CommandResult> {
  const { deviceId, type, idempotencyKey } = input;
  const policy = COMMAND_POLICY[type];

  if (!(policy.roles as readonly string[]).includes(input.role)) {
    return fail(403, 'FORBIDDEN_ROLE', 'Only the owner of this device can do that.');
  }

  // A repeat of a request we already accepted is answered with that command, whatever its state now.
  if (idempotencyKey) {
    const prior = await prisma.deviceCommand.findUnique({ where: { deviceId_idempotencyKey: { deviceId, idempotencyKey } } });
    if (prior) return { ok: true, command: prior, reused: true };
  }

  if (!busConfigured()) return fail(503, 'CHANNEL_UNAVAILABLE', 'The device channel is not available right now. Please try again shortly.');

  // A tare or refresh that runs late is worse than one that never runs: do not queue those.
  if (!policy.queueIfOffline && !input.online) {
    return fail(409, 'DEVICE_OFFLINE', 'The device is offline, so this cannot run now. Try again when it is back online.');
  }

  const recent = await prisma.deviceCommand.findFirst({
    where: { deviceId, type, requestedAt: { gt: new Date(now.getTime() - policy.minIntervalSec * 1000) } },
    orderBy: { requestedAt: 'desc' },
    select: { requestedAt: true },
  });
  if (recent) {
    const wait = Math.max(1, Math.ceil((recent.requestedAt.getTime() + policy.minIntervalSec * 1000 - now.getTime()) / 1000));
    return fail(429, 'RATE_LIMITED', `Please wait ${wait} seconds before sending that again.`, wait);
  }

  const id = newCommandId();
  let created: DeviceCommand;
  try {
    created = await prisma.deviceCommand.create({
      data: {
        id,
        deviceId,
        type,
        status: 'QUEUED',
        requestedBy: input.userId,
        idempotencyKey: idempotencyKey ?? null,
        requestedAt: now,
        expiresAt: new Date(now.getTime() + policy.ttlSec * 1000),
      },
    });
  } catch (err) {
    // Two identical requests raced past the lookup above; the unique key lets exactly one win.
    if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const prior = await prisma.deviceCommand.findUnique({ where: { deviceId_idempotencyKey: { deviceId, idempotencyKey } } });
      if (prior) return { ok: true, command: prior, reused: true };
    }
    throw err;
  }

  const body = JSON.stringify({ id, type, issued: now.toISOString(), ttl: policy.ttlSec, args: {} });
  try {
    await publishToDevice(deviceTopics(deviceId).cmd, body);
  } catch (err) {
    console.error(`[command] publish failed for ${id}:`, err instanceof Error ? err.message : err);
    await prisma.deviceCommand.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: 'FAILED', result: 'FAILED', detail: 'CHANNEL_UNAVAILABLE', ackedAt: new Date() },
    });
    return fail(503, 'CHANNEL_UNAVAILABLE', 'The device channel is not available right now. Please try again shortly.');
  }

  // Compare-and-set: an ack can beat us here on a fast device, and must not be overwritten with SENT.
  await prisma.deviceCommand.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'SENT', sentAt: new Date() } });
  const command = (await prisma.deviceCommand.findUnique({ where: { id } })) ?? created;
  return { ok: true, command, reused: false };
}

/** What the app sees. A command past its deadline reads as EXPIRED even before the sweeper has written that down. */
export function presentCommand(c: DeviceCommand, now = new Date()) {
  const lapsed = (c.status === 'QUEUED' || c.status === 'SENT') && c.expiresAt <= now;
  return {
    id: c.id,
    type: c.type,
    status: lapsed ? 'EXPIRED' : c.status,
    requestedAt: c.requestedAt,
    sentAt: c.sentAt,
    ackedAt: c.ackedAt,
    expiresAt: c.expiresAt,
    result: lapsed ? 'EXPIRED' : c.result,
    detail: lapsed ? 'The device did not answer in time.' : c.detail,
  };
}

/** Persist expiry for commands nobody answered. Safe to run often and from more than one place. */
export async function sweepExpiredCommands(now = new Date()): Promise<number> {
  const res = await prisma.deviceCommand.updateMany({
    where: { status: { in: ['QUEUED', 'SENT'] }, expiresAt: { lte: now } },
    data: { status: 'EXPIRED', result: 'EXPIRED', detail: 'The device did not answer in time.' },
  });
  return res.count;
}
