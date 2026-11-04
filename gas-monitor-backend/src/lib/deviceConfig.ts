import { prisma } from './prisma';
import { CONFIG_LIMITS, DEFAULT_DEVICE_CONFIG, configSchema, deviceTopics, type DeviceConfigMessage } from './deviceProtocol';
import { publishToDevice } from './deviceBus';

/**
 * The cloud's side of the config "shadow": DeviceConfig is the single source of
 * truth; the retained MQTT message is a copy for the device to pick up whenever it
 * connects. Anything that changes the database row publishes afterwards, and the
 * ingest worker re-publishes everything on start, so the broker can be wiped and
 * devices still converge.
 */

export type DesiredConfig = Omit<DeviceConfigMessage, 'version'>;

/**
 * Report-faster threshold in GROSS kg (the device cannot see net gas): the empty
 * cylinder, plus the owner's low-gas level, plus a margin so readings arrive
 * promptly as the alert point approaches. The level is the largest of the owner's
 * percent and kg criteria (never under 2 kg). 0 (off) while the empty weight is unknown.
 */
export function deriveWakeThreshold(emptyWeightKg: number | null, nominalKg: number | null, lowPercent = 20, lowKg: number | null = null): number {
  if (emptyWeightKg == null || emptyWeightKg <= 0) return 0;
  const nominal = nominalKg ?? 0;
  const level = Math.max(2, (nominal * lowPercent) / 100, lowKg ?? 0);
  const margin = Math.max(1, 0.1 * nominal);
  const wake = Math.round((emptyWeightKg + level + margin) * 10) / 10;
  return Math.min(wake, CONFIG_LIMITS.wakeBelowKg.max);
}

/** Read the stored desired config, falling back to defaults for any missing field. */
export function readDesired(stored: unknown): DesiredConfig {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<DesiredConfig>;
  return {
    reportEverySec: s.reportEverySec ?? DEFAULT_DEVICE_CONFIG.reportEverySec,
    changeStepKg: s.changeStepKg ?? DEFAULT_DEVICE_CONFIG.changeStepKg,
    wakeBelowKg: s.wakeBelowKg ?? DEFAULT_DEVICE_CONFIG.wakeBelowKg,
    lowBatteryMv: s.lowBatteryMv ?? DEFAULT_DEVICE_CONFIG.lowBatteryMv,
  };
}

export const sameConfig = (a: DesiredConfig, b: DesiredConfig): boolean =>
  a.reportEverySec === b.reportEverySec && a.changeStepKg === b.changeStepKg && a.wakeBelowKg === b.wakeBelowKg && a.lowBatteryMv === b.lowBatteryMv;

/** Publish the stored config as the device's retained message. Throws if the broker cannot be reached. */
export async function publishConfig(deviceId: string): Promise<void> {
  const row = await prisma.deviceConfig.findUnique({ where: { deviceId } });
  if (!row) return;
  const msg = configSchema.parse({ version: row.version, ...readDesired(row.desired) });
  await publishToDevice(deviceTopics(deviceId).cfg, JSON.stringify(msg), { retain: true });
}

/**
 * Re-publish every active device's config. Run by the ingest worker on start, so
 * the database stays the source of truth even if the broker lost its retained
 * messages. `publish` is injected: the worker uses its own broker connection.
 */
export async function syncAllConfigs(publish: (topic: string, payload: string) => Promise<void>): Promise<number> {
  let sent = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.deviceConfig.findMany({
      where: { device: { revokedAt: null } },
      orderBy: { deviceId: 'asc' },
      take: 200,
      ...(cursor ? { cursor: { deviceId: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) return sent;
    for (const row of rows) {
      const parsed = configSchema.safeParse({ version: row.version, ...readDesired(row.desired) });
      if (!parsed.success) {
        console.warn(`[config] stored config for ${row.deviceId} is invalid, not published: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      await publish(deviceTopics(row.deviceId).cfg, JSON.stringify(parsed.data));
      sent++;
    }
    cursor = rows.at(-1)!.deviceId;
  }
}
