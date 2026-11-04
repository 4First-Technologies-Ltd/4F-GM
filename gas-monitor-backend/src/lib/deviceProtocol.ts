import { z } from 'zod';

/**
 * Device ↔ cloud wire contract (MQTT, JSON). Single source of truth: the ingest
 * worker validates inbound messages with these schemas and the device simulator
 * builds its messages from the same types. Narrative spec: docs/CLOUD_ARCHITECTURE.md.
 */

export const PROTOCOL_VERSION = 1;

// A device id becomes part of an MQTT topic, so it must never contain `/`, `+` or `#`.
export const DEVICE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,31}$/;

export const isValidDeviceId = (id: string): boolean => DEVICE_ID_RE.test(id);

// ── Topics ───────────────────────────────────────────────────────────────────

const ROOT = `4fg/v${PROTOCOL_VERSION}/d`;

export type UpKind = 'telemetry' | 'event' | 'ack' | 'status';

export function deviceTopics(deviceId: string) {
  if (!isValidDeviceId(deviceId)) throw new Error(`Invalid device id: ${deviceId}`);
  const base = `${ROOT}/${deviceId}`;
  return {
    telemetry: `${base}/up/telemetry`,
    event: `${base}/up/event`,
    ack: `${base}/up/ack`,
    status: `${base}/up/status`,
    cmd: `${base}/dn/cmd`,
    cfg: `${base}/dn/cfg`,
  } as const;
}

/** What the ingest worker subscribes to. */
export const INGEST_SUBSCRIPTION = `${ROOT}/+/up/#`;

const UP_TOPIC_RE = new RegExp(`^4fg/v${PROTOCOL_VERSION}/d/([A-Za-z0-9-]+)/up/(telemetry|event|ack|status)$`);

/** Split an inbound topic into device id and message kind, or null if it is not ours. */
export function parseUpTopic(topic: string): { deviceId: string; kind: UpKind } | null {
  const m = UP_TOPIC_RE.exec(topic);
  if (!m || !isValidDeviceId(m[1])) return null;
  return { deviceId: m[1], kind: m[2] as UpKind };
}

// ── Device → cloud ───────────────────────────────────────────────────────────

const isoTime = z.iso.datetime({ offset: true });

export const REPORT_REASONS = ['heartbeat', 'change', 'event', 'refresh', 'boot', 'retry'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const readingSchema = z.object({
  t: isoTime,
  /** Gross weight on the platform in kg, platform tare already removed. */
  kg: z.number().min(-5).max(500),
  /** Temperature in °C. */
  c: z.number().min(-60).max(150).optional(),
  /** 1 = the reading has settled (no knock, no cylinder being moved). */
  s: z.union([z.literal(0), z.literal(1)]).default(1),
});

export const telemetrySchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Monotonic across reboots; a retry or redelivery repeats it. */
  seq: z.number().int().min(0),
  t: isoTime,
  /** Uptime in seconds. */
  up: z.number().int().min(0).optional(),
  r: z.array(readingSchema).min(1).max(48),
  bat: z
    .object({
      mv: z.number().int().min(0).max(20000),
      pct: z.number().int().min(0).max(100).optional(),
      /** 1 = running on external power. */
      ext: z.union([z.literal(0), z.literal(1)]).default(0),
    })
    .optional(),
  net: z.object({ rssi: z.number().int().min(-140).max(0), rat: z.string().max(12) }).optional(),
  fw: z.string().max(32).optional(),
  /** Factory calibration version in use. */
  cal: z.number().int().min(0).optional(),
  /** Config version the device currently holds. */
  cfg: z.number().int().min(0).optional(),
  why: z.enum(REPORT_REASONS).default('heartbeat'),
});
export type Telemetry = z.infer<typeof telemetrySchema>;

export const EVENT_CODES = [
  'BOOT',
  'CYLINDER_CHANGED',
  'TARE_DONE',
  'LOW_BATTERY',
  'TAMPER',
  'FAULT',
  'NETWORK_RECOVERED',
] as const;
export type EventCode = (typeof EVENT_CODES)[number];

export const eventSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: isoTime,
  code: z.enum(EVENT_CODES),
  /** Free-form detail, e.g. `{ reason: "watchdog" }` for BOOT or `{ sub: "LOADCELL_OPEN" }` for FAULT. */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type DeviceEventMessage = z.infer<typeof eventSchema>;

export const ACK_RESULTS = ['OK', 'FAILED', 'EXPIRED', 'REJECTED'] as const;
export type AckResult = (typeof ACK_RESULTS)[number];

export const commandAckSchema = z.object({
  cmd: z.string().min(1).max(64),
  res: z.enum(ACK_RESULTS),
  detail: z.string().max(200).optional(),
  t: isoTime,
});
export const configAckSchema = z.object({
  cfg: z.number().int().min(0),
  res: z.enum(ACK_RESULTS),
  detail: z.string().max(200).optional(),
  t: isoTime,
});
export const ackSchema = z.union([commandAckSchema, configAckSchema]);
export type CommandAck = z.infer<typeof commandAckSchema>;
export type ConfigAck = z.infer<typeof configAckSchema>;

/** Retained presence message. The broker publishes `offline` as the last will. */
export const statusSchema = z.object({
  state: z.enum(['online', 'offline']),
  fw: z.string().max(32).optional(),
  t: isoTime.optional(),
});
export type StatusMessage = z.infer<typeof statusSchema>;

// ── Cloud → device ───────────────────────────────────────────────────────────

/**
 * Commands customers can trigger through the API. Manufacturer-only types
 * (FACTORY_RESET, FW_UPDATE) are deliberately absent: they never go through the app.
 */
export const COMMAND_POLICY = {
  REPORT_NOW: { ttlSec: 30, queueIfOffline: false, minIntervalSec: 5, roles: ['OWNER', 'MEMBER'] },
  // A tare that runs hours later, with a cylinder on the platform, would corrupt the zero point.
  TARE: { ttlSec: 60, queueIfOffline: false, minIntervalSec: 30, roles: ['OWNER'] },
  REBOOT: { ttlSec: 600, queueIfOffline: true, minIntervalSec: 120, roles: ['OWNER'] },
} as const;
export type CommandType = keyof typeof COMMAND_POLICY;
export const COMMAND_TYPES = Object.keys(COMMAND_POLICY) as CommandType[];

export const commandSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['REPORT_NOW', 'TARE', 'REBOOT']),
  issued: isoTime,
  /** Seconds after `issued` during which the device may act on it. */
  ttl: z.number().int().min(1).max(3600),
  args: z.record(z.string(), z.unknown()).default({}),
});
export type Command = z.infer<typeof commandSchema>;

/** Hard limits the device must also enforce, so a bad value cannot drain the battery or silence the unit. */
export const CONFIG_LIMITS = {
  reportEverySec: { min: 60, max: 86400 },
  changeStepKg: { min: 0.05, max: 5 },
  // Gross weight: a nearly empty 50 kg cylinder already weighs ~60 kg, and the platform is rated ~100 kg.
  wakeBelowKg: { min: 0, max: 150 },
  lowBatteryMv: { min: 2500, max: 4200 },
} as const;

const bounded = (k: keyof typeof CONFIG_LIMITS) => z.number().min(CONFIG_LIMITS[k].min).max(CONFIG_LIMITS[k].max);

export const configSchema = z.object({
  version: z.number().int().min(1),
  /** Heartbeat interval. */
  reportEverySec: bounded('reportEverySec').pipe(z.number().int()),
  /** Report early when the level moves by at least this much since the last report. */
  changeStepKg: bounded('changeStepKg'),
  /**
   * Report more promptly while the GROSS weight on the platform is below this (0 = off).
   * The device only knows gross weight, so the server computes this from the
   * cylinder's empty weight plus the user's level; it is recomputed when the cylinder changes.
   */
  wakeBelowKg: bounded('wakeBelowKg'),
  lowBatteryMv: bounded('lowBatteryMv').pipe(z.number().int()),
});
export type DeviceConfigMessage = z.infer<typeof configSchema>;

export const DEFAULT_DEVICE_CONFIG: Omit<DeviceConfigMessage, 'version'> = {
  reportEverySec: 3600,
  changeStepKg: 0.5,
  wakeBelowKg: 0,
  lowBatteryMv: 3300,
};
