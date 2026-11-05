import { describe, expect, it } from 'vitest';
import {
  COMMAND_POLICY,
  CONFIG_LIMITS,
  DEFAULT_DEVICE_CONFIG,
  ackSchema,
  commandSchema,
  configSchema,
  deviceTopics,
  isValidDeviceId,
  parseUpTopic,
  telemetrySchema,
} from '../src/lib/deviceProtocol';

const now = '2026-11-02T06:00:00Z';

describe('device ids and topics', () => {
  it('accepts printed ids and rejects anything that could widen an MQTT topic', () => {
    expect(isValidDeviceId('FG-2024-0047')).toBe(true);
    for (const bad of ['', 'a', 'FG/2024', 'FG+2024', 'FG#', '../x', 'FG 2024', '-lead', 'x'.repeat(40)]) {
      expect(isValidDeviceId(bad)).toBe(false);
    }
    expect(() => deviceTopics('FG/..')).toThrow();
  });

  it('builds the six topics and parses upstream ones back', () => {
    const t = deviceTopics('FG-2024-0047');
    expect(t.telemetry).toBe('4fg/v1/d/FG-2024-0047/up/telemetry');
    expect(t.cmd).toBe('4fg/v1/d/FG-2024-0047/dn/cmd');
    expect(parseUpTopic(t.ack)).toEqual({ deviceId: 'FG-2024-0047', kind: 'ack' });
    expect(parseUpTopic(t.status)).toEqual({ deviceId: 'FG-2024-0047', kind: 'status' });
  });

  it('does not treat downstream or foreign topics as device uploads', () => {
    expect(parseUpTopic(deviceTopics('FG-2024-0047').cmd)).toBeNull();
    expect(parseUpTopic('4fg/v1/d/FG-2024-0047/up/telemetry/extra')).toBeNull();
    expect(parseUpTopic('other/v1/d/FG-2024-0047/up/telemetry')).toBeNull();
  });
});

describe('telemetry', () => {
  const valid = { v: 1, seq: 7, t: now, r: [{ t: now, kg: 31.42 }] };

  it('fills defaults for optional fields', () => {
    const out = telemetrySchema.parse(valid);
    expect(out.why).toBe('heartbeat');
    expect(out.r[0].s).toBe(1);
  });

  it('rejects malformed or out-of-range messages', () => {
    expect(telemetrySchema.safeParse({ ...valid, v: 2 }).success).toBe(false);
    expect(telemetrySchema.safeParse({ ...valid, r: [] }).success).toBe(false);
    expect(telemetrySchema.safeParse({ ...valid, r: [{ t: now, kg: 9999 }] }).success).toBe(false);
    expect(telemetrySchema.safeParse({ ...valid, r: [{ t: 'yesterday', kg: 1 }] }).success).toBe(false);
    expect(telemetrySchema.safeParse({ ...valid, seq: -1 }).success).toBe(false);
  });

  it('caps a batch so an offline buffer cannot become a flood', () => {
    const many = Array.from({ length: 49 }, () => ({ t: now, kg: 1 }));
    expect(telemetrySchema.safeParse({ ...valid, r: many }).success).toBe(false);
  });
});

describe('acks', () => {
  it('accepts a command ack and a config ack', () => {
    expect(ackSchema.safeParse({ cmd: 'cmd_1', res: 'OK', t: now }).success).toBe(true);
    expect(ackSchema.safeParse({ cfg: 8, res: 'OK', t: now }).success).toBe(true);
  });
  it('rejects an unknown result', () => {
    expect(ackSchema.safeParse({ cmd: 'cmd_1', res: 'MAYBE', t: now }).success).toBe(false);
  });
});

describe('commands and config', () => {
  it('only customer-safe command types can be issued', () => {
    expect(commandSchema.safeParse({ id: 'c1', type: 'TARE', issued: now, ttl: 60 }).success).toBe(true);
    expect(commandSchema.safeParse({ id: 'c1', type: 'FACTORY_RESET', issued: now, ttl: 60 }).success).toBe(false);
    expect(Object.keys(COMMAND_POLICY)).not.toContain('FACTORY_RESET');
  });

  it('never queues a tare for an offline device', () => {
    expect(COMMAND_POLICY.TARE.queueIfOffline).toBe(false);
    expect(COMMAND_POLICY.TARE.roles).toEqual(['OWNER']);
  });

  it('the default config is inside its own limits', () => {
    expect(configSchema.safeParse({ version: 1, ...DEFAULT_DEVICE_CONFIG }).success).toBe(true);
  });

  it('refuses config values that could drain the battery or silence the unit', () => {
    const base = { version: 1, ...DEFAULT_DEVICE_CONFIG };
    expect(configSchema.safeParse({ ...base, reportEverySec: CONFIG_LIMITS.reportEverySec.min - 1 }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, reportEverySec: CONFIG_LIMITS.reportEverySec.max + 1 }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, reportEverySec: 90.5 }).success).toBe(false);
  });
});
