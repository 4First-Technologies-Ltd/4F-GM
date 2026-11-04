/**
 * End-to-end check of the device cloud: broker → ingest worker → Postgres → API,
 * driven by the simulator. Creates and deletes its own records.
 *
 *   DATABASE_URL=postgresql://postgres:test@127.0.0.1:5432/scratch \
 *   DIRECT_URL=$DATABASE_URL  npx prisma migrate deploy      # once, on a scratch database
 *   DATABASE_URL=... DIRECT_URL=... npm run sim:e2e
 *
 * Refuses to run unless the database is on this machine.
 */
import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import mqtt from 'mqtt';

const dbUrl = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error('Refusing to run: DATABASE_URL must point at a database on this machine (this test creates and deletes records).');
  process.exit(1);
}
process.env.NODE_ENV = 'test'; // quiet Prisma query logging (and never production behaviour)
process.env.JWT_ACCESS_SECRET ||= 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'e2e-refresh-secret';

const PORT = 18830;
const MQTT_URL = `mqtt://127.0.0.1:${PORT}`;
process.env.MQTT_URL = MQTT_URL;
const ROOT = path.resolve(__dirname, '../..');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
async function until<T>(what: string, fn: () => Promise<T | undefined | false> | T | undefined | false, ms = 30000, every = 400): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await sleep(every);
  }
  console.log(`      (timed out waiting for: ${what})`);
}

const children: { p: ChildProcess; out: string[] }[] = [];
function run(script: string, args: string[], env: Record<string, string> = {}) {
  const p = spawn(process.execPath, [TSX, path.join(ROOT, script), ...args], { cwd: ROOT, env: { ...process.env, MQTT_URL, ...env } });
  const out: string[] = [];
  const grab = (b: Buffer) => b.toString().split(/\r?\n/).filter(Boolean).forEach((l) => out.push(l));
  p.stdout.on('data', grab);
  p.stderr.on('data', grab);
  children.push({ p, out });
  return { p, out };
}
const seen = (out: string[], text: string) => out.some((l) => l.includes(text));

async function main() {
  const { prisma } = await import('../../src/lib/prisma');
  const { createApp } = await import('../../src/app');
  const { signAccessToken } = await import('../../src/lib/jwt');
  const { generateClaimCode, generateDeviceSecret, hashClaimCode, hashDeviceSecret } = await import('../../src/lib/deviceAuth');
  const { DEFAULT_DEVICE_CONFIG, deviceTopics } = await import('../../src/lib/deviceProtocol');

  const tag = Date.now().toString(36).toUpperCase();
  const DEV = `FG-E2E-${tag}`;
  const claimCode = generateClaimCode();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), '4fg-e2e-'));
  const T = deviceTopics(DEV);
  let server: import('node:http').Server | undefined;
  const userIds: string[] = [];

  try {
    // ── Fixtures ─────────────────────────────────────────────────────────────
    const mkUser = async (n: string) => {
      const u = await prisma.user.create({ data: { email: `e2e-${tag}-${n}@example.test`, name: `E2E ${n}`, password: 'x', emailVerified: true } });
      userIds.push(u.id);
      return { id: u.id, token: signAccessToken({ sub: u.id, email: u.email }) };
    };
    const alice = await mkUser('alice');
    const bob = await mkUser('bob');
    await prisma.cylinderProfile.create({ data: { userId: alice.id, name: '12.5 kg', sizeKg: 12.5, isActive: true } });
    await prisma.device.create({
      data: {
        id: DEV,
        secretHash: hashDeviceSecret(generateDeviceSecret()),
        claimCodeHash: hashClaimCode(claimCode),
        config: { create: { version: 1, desired: DEFAULT_DEVICE_CONFIG } },
        state: { create: {} },
      },
    });

    // ── Stack ────────────────────────────────────────────────────────────────
    const broker = run('tools/device-simulator/dev-broker.ts', [], { DEV_BROKER_PORT: String(PORT) });
    await until('broker', () => seen(broker.out, 'dev MQTT broker on'), 15000);
    const worker = run('src/workers/ingest.ts', []);
    await until('ingest worker subscribed', () => seen(worker.out, 'subscribed to'), 20000);
    check('ingest worker connects and subscribes', seen(worker.out, 'subscribed to'));

    server = createApp().listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/devices`;
    const api = async (who: { token: string }, p: string, init: RequestInit = {}) => {
      const r = await fetch(base + p, { ...init, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
      return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
    };

    // ── Claim and isolation ──────────────────────────────────────────────────
    check('list is empty before claiming', (await api(alice, '/')).body.devices?.length === 0);
    check('unclaimed device is invisible (404)', (await api(alice, `/${DEV}`)).status === 404);
    const wrong = await api(alice, '/claim', { method: 'POST', body: JSON.stringify({ deviceId: DEV, claimCode: 'ZZZZ-ZZZZ' }) });
    check('wrong claim code is refused with the generic answer', wrong.status === 404 && wrong.body.code === 'INVALID_CLAIM');
    const claim = await api(alice, '/claim', { method: 'POST', body: JSON.stringify({ deviceId: DEV, claimCode: claimCode.toLowerCase().replace('-', ' '), nickname: 'Kitchen' }) });
    check('claim succeeds (code is forgiving about case and spaces)', claim.status === 201 && claim.body.device?.role === 'OWNER', `status ${claim.status}`);
    check('claim picks up the active cylinder', claim.body.device?.cylinder?.sizeKg === 12.5);
    check('claiming twice by the same user is 409', (await api(alice, '/claim', { method: 'POST', body: JSON.stringify({ deviceId: DEV, claimCode }) })).status === 409);
    check('another user cannot claim a claimed device', (await api(bob, '/claim', { method: 'POST', body: JSON.stringify({ deviceId: DEV, claimCode }) })).status === 404);
    check('another user cannot see the device', (await api(bob, `/${DEV}`)).status === 404 && (await api(bob, `/${DEV}/readings`)).status === 404 && (await api(bob, `/${DEV}/events`)).status === 404);
    check('the claim code is single use (hash cleared)', (await prisma.device.findUnique({ where: { id: DEV } }))?.claimCodeHash === null);

    // ── Device comes alive ───────────────────────────────────────────────────
    const sim = run('tools/device-simulator/simulator.ts', [
      '--device', DEV, '--url', MQTT_URL, '--scenario', 'refill', '--speed', '400', '--percent', '12',
      '--cylinder', '12.5', '--empty-weight', '14.8', '--state-dir', stateDir, '--reset',
    ]);
    const live = await until('first reading in the API', async () => {
      const d = (await api(alice, `/${DEV}`)).body.device;
      return d?.state?.grossKg != null ? d : undefined;
    }, 25000);
    check('device appears online with a live reading', !!live?.state?.online && live.state.grossKg > 10, live ? `gross ${live.state.grossKg} kg` : '');
    check('without an empty weight it reports "calibrating", not a made-up percent', live?.state?.calibrating === true && live.state.percent === null);

    await prisma.device.update({ where: { id: DEV }, data: { emptyWeightKg: 14.8 } });
    const calibrated = await until('percent after calibration', async () => {
      const d = (await api(alice, `/${DEV}`)).body.device;
      return d?.state?.percent != null ? d : undefined;
    }, 25000);
    check('after calibration the percent appears and is sane', !!calibrated && calibrated.state.percent >= 0 && calibrated.state.percent <= 100, calibrated ? `${calibrated.state.percent}%, net ${calibrated.state.netKg} kg` : '');

    // ── Low-gas alert ────────────────────────────────────────────────────────
    const lowTitle = 'Gas is running low';
    const lowNote = await until('low-gas notification', async () => (await prisma.notification.findFirst({ where: { userId: alice.id, title: lowTitle } })) ?? undefined, 20000);
    check('the owner gets a low-gas notification once the level is under their threshold', !!lowNote && lowNote.body.includes('Kitchen') && /1\d%/.test(lowNote.body), lowNote?.body ?? '');
    await sleep(3000); // more readings arrive while it stays low
    check('and only one, however many readings follow', (await prisma.notification.count({ where: { userId: alice.id, title: lowTitle } })) === 1);
    check('the alert is also in the device\'s event history', ((await api(alice, `/${DEV}/events?code=ALERT_LOW`)).body.events as any[]).length === 1);
    check('the rule is now marked as told (not armed)', (await prisma.deviceAlertState.findUnique({ where: { deviceId_rule: { deviceId: DEV, rule: 'LOW' } } }))?.armed === false);
    check('the device shows the owner\'s alert thresholds', (await api(alice, `/${DEV}`)).body.device.alerts?.lowPercent === 20);

    // ── Cylinder swap (refill scenario) ──────────────────────────────────────
    const swapped = await until('CYLINDER_CHANGED event', async () => {
      const ev = (await api(alice, `/${DEV}/events?code=CYLINDER_CHANGED`)).body.events as any[];
      return ev?.length ? ev : undefined;
    }, 90000, 1000);
    await sleep(2500);
    const events = (await api(alice, `/${DEV}/events`)).body;
    const swaps = (events.events as any[]).filter((e) => e.code === 'CYLINDER_CHANGED');
    check('a cylinder change is recorded', !!swapped);
    check('device event and cloud inference are recorded once, not twice', swaps.length === 1, `${swaps.length} event(s)`);
    check('BOOT event is stored', (events.events as any[]).some((e) => e.code === 'BOOT'));
    const afterSwap = (await api(alice, `/${DEV}`)).body.device;
    check('after the swap the gauge shows a full cylinder', afterSwap.state.percent >= 90, `${afterSwap.state.percent}%`);

    const rearmed = await until('LOW re-armed after the refill', async () => ((await prisma.deviceAlertState.findUnique({ where: { deviceId_rule: { deviceId: DEV, rule: 'LOW' } } }))?.armed === true ? true : undefined), 15000);
    check('a refill re-arms the low-gas alert, ready for the next time', !!rearmed);
    check('and the refill itself did not send another notification', (await prisma.notification.count({ where: { userId: alice.id, title: lowTitle } })) === 1);

    // ── History ──────────────────────────────────────────────────────────────
    const raw = (await api(alice, `/${DEV}/readings?bucket=raw&limit=50`)).body;
    check('raw history returns oldest-first points', raw.points?.length > 3 && new Date(raw.points[0].t) <= new Date(raw.points.at(-1).t), `${raw.points?.length} points`);
    const hour = (await api(alice, `/${DEV}/readings?bucket=hour`)).body;
    check('hourly buckets aggregate', hour.points?.length >= 1 && hour.points[0].n >= 1);
    const day = (await api(alice, `/${DEV}/readings?bucket=day`)).body;
    check('daily rollup records consumption without counting the refill as usage', day.points?.length >= 1 && day.points.every((p: any) => p.consumedKg >= 0 && p.consumedKg < 6), day.points ? `consumed ${day.points.map((p: any) => p.consumedKg).join(', ')} kg` : '');
    check('history cannot read an unbounded range', (await api(alice, `/${DEV}/readings?bucket=raw&from=2020-01-01T00:00:00Z`)).status === 400);

    // ── Acks reach the database ──────────────────────────────────────────────
    const svc = mqtt.connect(MQTT_URL, { clientId: `e2e-${tag}`, username: 'service', password: 'service', reconnectPeriod: 0 });
    await new Promise<void>((r) => svc.once('connect', () => r()));
    await prisma.deviceCommand.create({ data: { id: `cmd_e2e_${tag}`, deviceId: DEV, type: 'REPORT_NOW', status: 'SENT', expiresAt: new Date(Date.now() + 60000), requestedBy: alice.id } });
    svc.publish(T.cmd, JSON.stringify({ id: `cmd_e2e_${tag}`, type: 'REPORT_NOW', issued: new Date().toISOString(), ttl: 30, args: {} }), { qos: 1 });
    const cmd = await until('command ack stored', async () => {
      const c = await prisma.deviceCommand.findUnique({ where: { id: `cmd_e2e_${tag}` } });
      return c?.status === 'ACKED' ? c : undefined;
    }, 15000);
    check('a device ack moves the command to ACKED', cmd?.result === 'OK' && !!cmd.ackedAt);

    await prisma.deviceConfig.update({ where: { deviceId: DEV }, data: { version: 2, desired: { ...DEFAULT_DEVICE_CONFIG, reportEverySec: 600 } } });
    check('config shows as pending until the device applies it', (await api(alice, `/${DEV}`)).body.device.config.pending === true);
    svc.publish(T.cfg, JSON.stringify({ version: 2, ...DEFAULT_DEVICE_CONFIG, reportEverySec: 600 }), { qos: 1, retain: true });
    const applied = await until('config applied', async () => {
      const d = (await api(alice, `/${DEV}`)).body.device;
      return d.config.applied >= 2 ? d : undefined;
    }, 15000);
    check('the device applying the config clears "pending"', !!applied && applied.config.pending === false);
    svc.publish(T.cfg, '', { qos: 1, retain: true }); // clear the retained message

    // ── Commands from the app ────────────────────────────────────────────────
    // The ack check above planted a REPORT_NOW row; it would trip the very rate limit tested below.
    await prisma.deviceCommand.deleteMany({ where: { id: `cmd_e2e_${tag}` } });
    await prisma.deviceMember.create({ data: { deviceId: DEV, userId: bob.id, role: 'MEMBER' } });
    const post = (who: { token: string }, body: object, headers: Record<string, string> = {}) =>
      api(who, `/${DEV}/commands`, { method: 'POST', body: JSON.stringify(body), headers });
    const poll = (cid: string, want: string[], ms = 15000) =>
      until(`command ${cid} to reach ${want.join('/')}`, async () => {
        const c = (await api(alice, `/${DEV}/commands/${cid}`)).body.command;
        return c && want.includes(c.status) ? c : undefined;
      }, ms);

    const r1 = await post(alice, { type: 'REPORT_NOW', idempotencyKey: 'e2e-refresh-0001' });
    check('a refresh is accepted (202) and not yet claimed to be done', r1.status === 202 && ['QUEUED', 'SENT', 'ACKED'].includes(r1.body.command?.status), `status ${r1.status}`);
    const fast = await post(alice, { type: 'REPORT_NOW' });
    check('asking again straight away is rate limited, with Retry-After', fast.status === 429 && fast.body.retryAfterSec > 0);
    const again = await post(alice, { type: 'REPORT_NOW' }, { 'Idempotency-Key': 'e2e-refresh-0001' });
    check('repeating the same request (Idempotency-Key header) returns the same command', again.status === 200 && again.body.command?.id === r1.body.command?.id);
    const acked = await poll(r1.body.command.id, ['ACKED', 'FAILED', 'EXPIRED']);
    check('the device answers: the command becomes ACKED', acked?.status === 'ACKED' && acked.result === 'OK', acked ? `${acked.status}/${acked.result}` : '');

    check('a member cannot zero the scale', (await post(bob, { type: 'TARE' })).status === 403);
    check('a member can see the device but not change its settings', (await api(bob, `/${DEV}`)).status === 200 && (await api(bob, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ nickname: 'Mine' }) })).status === 403);
    check('an unknown command type is refused', (await post(alice, { type: 'FACTORY_RESET' })).status === 400);

    const tare = await post(alice, { type: 'TARE' });
    const tareDone = await poll(tare.body.command.id, ['ACKED', 'FAILED', 'EXPIRED']);
    check('a tare with the cylinder still on is refused by the device and shown as FAILED', tareDone?.status === 'FAILED' && tareDone.detail === 'PLATFORM_NOT_EMPTY', tareDone ? `${tareDone.status}/${tareDone.detail}` : '');
    check('the command history lists what was sent', ((await api(alice, `/${DEV}/commands`)).body.commands as any[]).length >= 2);

    // ── Settings ─────────────────────────────────────────────────────────────
    check('unknown settings fields are refused, not ignored', (await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ secretHash: 'x' }) })).status === 400);
    check('a cylinder that is not yours is refused', (await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ cylinderId: 'someone-elses' }) })).status === 400);
    check('out-of-range reporting interval is refused', (await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ reportEverySec: 5 }) })).status === 400);
    const versionBefore = (await prisma.deviceConfig.findUnique({ where: { deviceId: DEV } }))!.version;
    const patched = await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ nickname: 'Kitchen gas', emptyWeightKg: 15, reportEverySec: 600 }) });
    check('owner settings are saved and the config is published', patched.status === 200 && patched.body.configPublished === true && patched.body.device.nickname === 'Kitchen gas');
    const stored = await prisma.deviceConfig.findUnique({ where: { deviceId: DEV } });
    check('the config version went up and the wake threshold was derived (15 + 2.5 + 1.25 kg)', stored!.version === versionBefore + 1 && (stored!.desired as any).wakeBelowKg === 18.8 && (stored!.desired as any).reportEverySec === 600);
    const settled = await until('device applies the new config', async () => {
      const d = (await api(alice, `/${DEV}`)).body.device;
      return d.config.applied >= stored!.version && !d.config.pending ? d : undefined;
    }, 15000);
    check('the device applies it and "pending" clears', !!settled);
    const noop = await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ nickname: 'Kitchen gas' }) });
    check('a change that does not touch the device config does not bump its version', noop.body.configPublished === null && (await prisma.deviceConfig.findUnique({ where: { deviceId: DEV } }))!.version === stored!.version);

    // The database is the truth: wipe the broker's copy, restart the worker, and it comes back.
    svc.publish(T.cfg, '', { qos: 1, retain: true });
    await sleep(500);
    worker.p.kill();
    await sleep(800);
    const worker2 = run('src/workers/ingest.ts', [], { OFFLINE_SWEEP_MS: '2000' });
    await until('worker resync', () => seen(worker2.out, 're-published'), 25000);
    const retained = await new Promise<any>((resolve) => {
      const listener = (topic: string, payload: Buffer, packet: any) => {
        if (topic === T.cfg && packet.retain && payload.length) { svc.off('message', listener); resolve(JSON.parse(payload.toString())); }
      };
      svc.on('message', listener);
      svc.subscribe(T.cfg, { qos: 1 });
      setTimeout(() => resolve(null), 6000);
    });
    check('after a worker restart the retained config is back, straight from the database', retained?.version === stored!.version && retained.wakeBelowKg === 18.8, retained ? `v${retained.version}` : 'missing');
    svc.unsubscribe(T.cfg);

    const th = await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ lowPercent: 30, lowDays: 4 }) });
    check('the owner can change their low-gas thresholds (percent and days)', th.status === 200 && th.body.device.alerts.lowPercent === 30 && th.body.device.alerts.lowDays === 4);
    check('the device\'s wake level follows: 15 + 30% of 12.5 + 1.25 kg', ((await prisma.deviceConfig.findUnique({ where: { deviceId: DEV } }))!.desired as any).wakeBelowKg === 20);
    check('thresholds outside the sensible range are refused', (await api(alice, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ lowPercent: 95 }) })).status === 400);
    check('a member cannot change them', (await api(bob, `/${DEV}/settings`, { method: 'PATCH', body: JSON.stringify({ lowPercent: 50 }) })).status === 403);

    // ── Presence, offline rules and expiry ───────────────────────────────────
    sim.p.kill(); // an abrupt death: the broker publishes the last will
    const gone = await until('device marked offline', async () => ((await api(alice, `/${DEV}`)).body.device?.state?.online === false ? true : undefined), 15000);
    check('when the device dies abruptly the API shows it offline (last will)', !!gone);
    const offTare = await post(alice, { type: 'TARE' });
    check('a tare for an offline device is refused outright, never queued', offTare.status === 409 && offTare.body.code === 'DEVICE_OFFLINE');
    check('and nothing was written for it', (await prisma.deviceCommand.count({ where: { deviceId: DEV, type: 'TARE', status: 'QUEUED' } })) === 0);

    // The device died a moment ago; pretend it has been silent for hours (its interval is 10 minutes).
    await prisma.deviceState.update({ where: { deviceId: DEV }, data: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
    const offTitle = 'Your monitor is offline';
    const offA = await until('offline alert for the owner', async () => (await prisma.notification.findFirst({ where: { userId: alice.id, title: offTitle } })) ?? undefined, 20000);
    check('a device that goes quiet raises an offline alert for the owner', !!offA && offA.body.includes('has not checked in since'), offA?.body ?? '');
    check('and for every member of the device, not just the owner', (await prisma.notification.count({ where: { userId: bob.id, title: offTitle } })) === 1);
    await sleep(5000); // several more sweeps
    check('the offline alert is not repeated by later sweeps', (await prisma.notification.count({ where: { userId: alice.id, title: offTitle } })) === 1);
    check('the alert is in the event history', ((await api(alice, `/${DEV}/events?code=ALERT_OFFLINE`)).body.events as any[]).length === 1);

    await prisma.deviceCommand.create({ data: { id: `cmd_e2e_old_${tag}`, deviceId: DEV, type: 'REBOOT', status: 'SENT', requestedBy: alice.id, expiresAt: new Date(Date.now() - 1000) } });
    const lapsed = (await api(alice, `/${DEV}/commands/cmd_e2e_old_${tag}`)).body.command;
    check('a command past its deadline reads as EXPIRED straight away', lapsed?.status === 'EXPIRED');
    const swept = await until('sweeper persists expiry', async () => ((await prisma.deviceCommand.findUnique({ where: { id: `cmd_e2e_old_${tag}` } }))?.status === 'EXPIRED' ? true : undefined), 15000);
    check('and the worker\'s sweeper writes that down', !!swept);

    // ── Hostile and broken input ─────────────────────────────────────────────
    const msg = (seq: number) => JSON.stringify({ v: 1, seq, t: new Date().toISOString(), r: [{ t: new Date().toISOString(), kg: 27.1 }], why: 'retry' });
    const once = msg(900001); // a real redelivery repeats the identical message, timestamp included
    svc.publish(T.telemetry, once, { qos: 1 });
    svc.publish(T.telemetry, once, { qos: 1 }); // broker redelivery
    await sleep(2000);
    check('a redelivered message is stored once', (await prisma.deviceReading.count({ where: { deviceId: DEV, seq: 900001 } })) === 1);

    svc.publish(deviceTopics('FG-NOPE-1').telemetry, msg(1), { qos: 1 });
    svc.publish(T.telemetry, '{not json', { qos: 1 });
    svc.publish(T.telemetry, JSON.stringify({ v: 1, seq: 5, t: 'yesterday', r: [] }), { qos: 1 });
    await until('worker logged drops', () => seen(worker2.out, 'unknown_device') && seen(worker2.out, ': json') && seen(worker2.out, ': invalid'), 8000);
    check('unknown device, bad JSON and a schema violation are dropped, not stored', seen(worker2.out, 'unknown_device') && seen(worker2.out, ': json') && seen(worker2.out, ': invalid'));
    check('and the worker keeps going afterwards', !seen(worker2.out, 'retrying in'));

    await prisma.device.update({ where: { id: DEV }, data: { revokedAt: new Date() } });
    const before = await prisma.deviceReading.count({ where: { deviceId: DEV } });
    svc.publish(T.telemetry, msg(900002), { qos: 1 });
    await sleep(1500);
    check('a revoked device is ignored by ingest', (await prisma.deviceReading.count({ where: { deviceId: DEV } })) === before && seen(worker2.out, 'revoked'));
    check('a revoked device disappears from the API', (await api(alice, '/')).body.devices.length === 0 && (await api(alice, `/${DEV}`)).status === 404);
    svc.end(true);

    // ── The broker disappears while a request is in flight ───────────────────
    await prisma.device.update({ where: { id: DEV }, data: { revokedAt: null } });
    await prisma.deviceCommand.deleteMany({ where: { id: `cmd_e2e_old_${tag}` } }); // its REBOOT would trip the reboot rate limit
    broker.p.kill();
    await sleep(500);
    const t0 = Date.now();
    const down = await post(alice, { type: 'REBOOT' });
    check('with the broker down the app gets a clear 503 quickly, not a hang', down.status === 503 && down.body.code === 'CHANNEL_UNAVAILABLE' && Date.now() - t0 < 9000, `${down.status} in ${Date.now() - t0} ms`);
    const failedRow = await prisma.deviceCommand.findFirst({ where: { deviceId: DEV, type: 'REBOOT' }, orderBy: { requestedAt: 'desc' } });
    check('and the command is recorded as FAILED, not left pretending to be sent', failedRow?.status === 'FAILED' && failedRow.detail === 'CHANNEL_UNAVAILABLE');
  } catch (e) {
    check('run completed without an exception', false, e instanceof Error ? e.message : String(e));
  } finally {
    for (const c of children) c.p.kill();
    const { closeBus } = await import('../../src/lib/deviceBus');
    await closeBus();
    server?.close();
    await sleep(500);
    const { prisma } = await import('../../src/lib/prisma');
    await prisma.device.deleteMany({ where: { id: DEV } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.$disconnect();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall end-to-end checks passed');
  process.exit(failed ? 1 : 0);
}

main();
