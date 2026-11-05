import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({ device: { findUnique: vi.fn() } }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

import { ACC, deviceMayAccess, isServiceUsername } from '../src/lib/mqttAcl';
import { hashDeviceSecret } from '../src/lib/deviceAuth';

describe('deviceMayAccess', () => {
  const me = 'FG-2026-0001';
  const t = (s: string, id = me) => `4fg/v1/d/${id}/${s}`;

  it('lets a device publish only its four upstream topics', () => {
    for (const s of ['up/telemetry', 'up/event', 'up/ack', 'up/status']) expect(deviceMayAccess(me, t(s), ACC.WRITE)).toBe(true);
    expect(deviceMayAccess(me, t('up/other'), ACC.WRITE)).toBe(false);
    expect(deviceMayAccess(me, t('dn/cmd'), ACC.WRITE)).toBe(false); // cannot forge its own commands
    expect(deviceMayAccess(me, t('dn/cfg'), ACC.WRITE)).toBe(false); // or its own config
  });
  it('lets it subscribe to, and receive, only its downstream topics', () => {
    for (const acc of [ACC.READ, ACC.SUBSCRIBE]) {
      expect(deviceMayAccess(me, t('dn/cmd'), acc)).toBe(true);
      expect(deviceMayAccess(me, t('dn/cfg'), acc)).toBe(true);
      expect(deviceMayAccess(me, t('dn/#'), acc)).toBe(true);
      expect(deviceMayAccess(me, t('up/telemetry'), acc)).toBe(false); // may not read its own uploads back, nor anyone's
      expect(deviceMayAccess(me, t('#'), acc)).toBe(false);
      expect(deviceMayAccess(me, t('+/cmd'), acc)).toBe(false);
    }
  });
  it('never reaches another device, by id or by wildcard', () => {
    expect(deviceMayAccess(me, t('up/telemetry', 'FG-2026-0002'), ACC.WRITE)).toBe(false);
    expect(deviceMayAccess(me, t('dn/cmd', 'FG-2026-0002'), ACC.SUBSCRIBE)).toBe(false);
    expect(deviceMayAccess(me, '4fg/v1/d/+/dn/cmd', ACC.SUBSCRIBE)).toBe(false);
    expect(deviceMayAccess(me, '4fg/v1/d/#', ACC.SUBSCRIBE)).toBe(false);
    expect(deviceMayAccess(me, '#', ACC.SUBSCRIBE)).toBe(false);
    expect(deviceMayAccess(me, '$SYS/#', ACC.SUBSCRIBE)).toBe(false);
  });
  it('a prefix of another id is not that id', () => {
    expect(deviceMayAccess('FG-2026-000', '4fg/v1/d/FG-2026-0001/up/telemetry', ACC.WRITE)).toBe(false);
  });
  it('denies read-write and an id that could widen a topic', () => {
    expect(deviceMayAccess(me, t('up/telemetry'), ACC.READWRITE)).toBe(false);
    expect(deviceMayAccess('FG/../x', '4fg/v1/d/FG/../x/up/telemetry', ACC.WRITE)).toBe(false);
    expect(deviceMayAccess('+', '4fg/v1/d/+/up/telemetry', ACC.WRITE)).toBe(false);
  });
});

describe('isServiceUsername', () => {
  it('accepts the base name and dotted suffixes only', () => {
    for (const u of ['service', 'service.ingest', 'service.api-1234-ab', 'service.cli_x.y']) expect(isServiceUsername(u, 'service')).toBe(true);
    for (const u of ['servicex', 'service.', 'service..', 'service/ingest', 'service.a b', 'SERVICE', 'xservice.ingest', 'FG-T-0001', '']) expect(isServiceUsername(u, 'service')).toBe(false);
  });
  it('is never true for non-strings or an empty base', () => {
    expect(isServiceUsername(undefined, 'service')).toBe(false);
    expect(isServiceUsername(42, 'service')).toBe(false);
    expect(isServiceUsername('service', '')).toBe(false);
  });
});

describe('broker auth routes', () => {
  let server: Server;
  let base: string;
  const TOKEN = 'test-token-0123456789';

  beforeAll(async () => {
    const { default: router } = await import('../src/routes/internalMqtt');
    const app = express();
    app.use(express.json());
    app.use('/internal/mqtt', router);
    // Stand-in for the app's real error handler: the routes must never reach it.
    app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ leaked: true, error: String(err?.message ?? err) }));
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/mqtt`;
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MQTT_AUTH_TOKEN = TOKEN;
    process.env.MQTT_SERVICE_USER = 'service';
    process.env.MQTT_SERVICE_PASS = 'svc-secret-value';
    db.device.findUnique.mockResolvedValue({ secretHash: hashDeviceSecret('right-secret'), revokedAt: null });
  });

  const call = async (path: string, body: object, token = TOKEN) =>
    (await fetch(`${base}/${token}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;

  it('does not exist unless a token is configured, and rejects a wrong one', async () => {
    expect(await call('auth', { username: 'service', password: 'svc-secret-value', clientid: 'x' }, 'wrong-token')).toBe(404);
    delete process.env.MQTT_AUTH_TOKEN;
    expect(await call('auth', { username: 'service', password: 'svc-secret-value', clientid: 'x' }, TOKEN)).toBe(404);
  });

  describe('auth', () => {
    it('accepts a device with its own secret', async () => {
      expect(await call('auth', { username: 'FG-T-0001', password: 'right-secret', clientid: 'FG-T-0001' })).toBe(200);
    });
    it('rejects a wrong secret, an unknown device, a revoked device and an empty password', async () => {
      expect(await call('auth', { username: 'FG-T-0001', password: 'wrong', clientid: 'FG-T-0001' })).toBe(401);
      db.device.findUnique.mockResolvedValueOnce(null);
      expect(await call('auth', { username: 'FG-T-0001', password: 'right-secret', clientid: 'FG-T-0001' })).toBe(401);
      db.device.findUnique.mockResolvedValueOnce({ secretHash: hashDeviceSecret('right-secret'), revokedAt: new Date() });
      expect(await call('auth', { username: 'FG-T-0001', password: 'right-secret', clientid: 'FG-T-0001' })).toBe(401);
      expect(await call('auth', { username: 'FG-T-0001', password: '', clientid: 'FG-T-0001' })).toBe(401);
    });
    it('rejects a client id that differs from the user name (no logging in as someone else)', async () => {
      expect(await call('auth', { username: 'FG-T-0001', password: 'right-secret', clientid: 'FG-T-0002' })).toBe(401);
    });
    it('accepts the service account only with the configured password', async () => {
      expect(await call('auth', { username: 'service', password: 'svc-secret-value', clientid: 'ingest' })).toBe(200);
      expect(await call('auth', { username: 'service', password: 'guess', clientid: 'ingest' })).toBe(401);
      expect(await call('auth', { username: 'service.ingest', password: 'svc-secret-value', clientid: 'service.ingest' })).toBe(200);
      expect(await call('auth', { username: 'servicex', password: 'svc-secret-value', clientid: 'servicex' })).toBe(401);
    });
    it('has no default service password: unset means nobody gets in as service', async () => {
      delete process.env.MQTT_SERVICE_PASS;
      expect(await call('auth', { username: 'service', password: 'service', clientid: 'ingest' })).toBe(401);
    });
  });

  describe('superuser', () => {
    it('is only the service account', async () => {
      expect(await call('superuser', { username: 'service' })).toBe(200);
      expect(await call('superuser', { username: 'service.api-12' })).toBe(200);
      expect(await call('superuser', { username: 'servicex' })).toBe(403);
      expect(await call('superuser', { username: 'FG-T-0001' })).toBe(403);
    });
  });

  describe('acl', () => {
    const acl = (username: string, topic: string, acc: number, clientid = username) => call('acl', { username, clientid, topic, acc });
    it('applies the topic rules to devices', async () => {
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0001/up/telemetry', 2)).toBe(200);
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0001/dn/cmd', 4)).toBe(200);
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0002/up/telemetry', 2)).toBe(403);
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0001/dn/cmd', 2)).toBe(403);
    });
    it('accepts the access code as a string too (form-style callers)', async () => {
      expect(await call('acl', { username: 'FG-T-0001', clientid: 'FG-T-0001', topic: '4fg/v1/d/FG-T-0001/up/ack', acc: '2' })).toBe(200);
    });
    it('stops serving a device that was revoked while connected', async () => {
      db.device.findUnique.mockResolvedValueOnce({ revokedAt: new Date() });
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0001/up/telemetry', 2)).toBe(403);
    });
    it('lets the service account do anything', async () => {
      expect(await acl('service', '4fg/v1/d/FG-T-0001/dn/cmd', 2, 'api-1')).toBe(200);
      expect(await acl('service', '4fg/v1/d/+/up/#', 4, 'ingest')).toBe(200);
    });
    it('does not trust a client id that differs from the user name', async () => {
      expect(await acl('FG-T-0001', '4fg/v1/d/FG-T-0001/up/telemetry', 2, 'FG-T-0002')).toBe(403);
    });
  });

  it('a database failure answers 503 and never reaches the app error handler (which would store the path, token included)', async () => {
    db.device.findUnique.mockRejectedValueOnce(new Error('db down'));
    const r = await fetch(`${base}/${TOKEN}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'FG-T-0001', password: 'right-secret', clientid: 'FG-T-0001' }) });
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('leaked');
  });
});
