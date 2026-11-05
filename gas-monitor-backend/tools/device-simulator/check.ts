/**
 * Contract smoke test. Run against a live dev broker with a simulator connected:
 *
 *   npm run sim:broker      (terminal 1)
 *   npm run sim:device      (terminal 2)
 *   npm run sim:check       (terminal 3)   optional arg: device id (default FG-SIM-0001)
 *
 * It checks the behaviours a device and the broker must get right, from the
 * cloud's side. Exits 0 when everything passes.
 */
import mqtt from 'mqtt';
import { mqttTlsOptions } from '../../src/lib/mqttTls';
import { deviceTopics } from '../../src/lib/deviceProtocol';

const DEV = process.argv[2] || 'FG-SIM-0001';
// A second, real device to play the attacker. Against a real broker it must exist and these must be its credentials.
const OTHER = process.env.CHECK_OTHER_ID || 'FG-SIM-0099';
const OTHER_PASS = process.env.CHECK_OTHER_PASS || 'x';
const TLS = mqttTlsOptions();
const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
const T = deviceTopics(DEV);
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

const svc = mqtt.connect(url, { ...TLS, clientId: `${process.env.MQTT_SERVICE_USER || 'service'}.check-${Date.now()}`, username: `${process.env.MQTT_SERVICE_USER || 'service'}.check-${Date.now()}`, password: process.env.MQTT_SERVICE_PASS || 'service', reconnectPeriod: 0 });
const inbox: { topic: string; body: any }[] = [];
svc.on('message', (topic, p) => { try { inbox.push({ topic, body: JSON.parse(p.toString()) }); } catch { /* ignore */ } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<R>(fn: () => R | undefined, ms: number): Promise<R | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(100); }
}
const cmd = (over: object) => ({ id: `chk_${Math.random().toString(36).slice(2, 8)}`, type: 'REPORT_NOW', issued: new Date().toISOString(), ttl: 30, args: {}, ...over });
const sendCmd = (c: any) => svc.publish(T.cmd, JSON.stringify(c), { qos: 1 });
const acksFor = (id: string) => inbox.filter((m) => m.topic === T.ack && m.body.cmd === id).map((m) => m.body);

async function aclChecks() {
  // 1. A device may not publish into another device's topics.
  svc.subscribe(T.telemetry, { qos: 1 });
  await sleep(300);
  const evil = mqtt.connect(url, { ...TLS, clientId: OTHER, username: OTHER, password: OTHER_PASS, reconnectPeriod: 0 });
  await new Promise<void>((r) => evil.once('connect', () => r()));
  evil.publish(T.telemetry, '{"forged":true}', { qos: 1 });
  await sleep(1200);
  check('a device cannot publish into another device\'s topic (the forged message never arrives)', !inbox.some((m) => m.topic === T.telemetry && m.body?.forged));
  evil.end(true);

  // 2. A device may not subscribe to another device's commands.
  const evil2 = mqtt.connect(url, { ...TLS, clientId: OTHER, username: OTHER, password: OTHER_PASS, reconnectPeriod: 0 });
  await new Promise<void>((r) => evil2.once('connect', () => r()));
  const denied = await new Promise<boolean>((resolve) => {
    evil2.once('close', () => resolve(true));
    evil2.subscribe(T.cmd, { qos: 1 }, (err, granted) => resolve(!!err || granted?.[0]?.qos === 128));
    setTimeout(() => resolve(false), 1500);
  });
  check('device cannot subscribe to another device\'s commands', denied);
  evil2.end(true);

  // 3. A device cannot log in under a name that is not its client id.
  const imposter = mqtt.connect(url, { ...TLS, clientId: OTHER, username: DEV, password: 'x', reconnectPeriod: 0 });
  const rejected = await new Promise<boolean>((resolve) => {
    imposter.once('connect', () => resolve(false));
    imposter.once('error', () => resolve(true));
    setTimeout(() => resolve(false), 1500);
  });
  check('username that differs from client id is refused', rejected);
  imposter.end(true);
}

async function commandChecks() {
  svc.subscribe([T.ack, T.telemetry], { qos: 1 });
  await sleep(300);

  // Duplicate delivery: acked twice, acted on once.
  const dup = cmd({});
  const before = inbox.filter((m) => m.topic === T.telemetry && m.body.why === 'refresh').length;
  sendCmd(dup); await sleep(400); sendCmd(dup);
  await waitFor(() => (acksFor(dup.id).length >= 2 ? true : undefined), 4000);
  const acks = acksFor(dup.id);
  check('duplicate command is answered both times with the same result', acks.length === 2 && acks.every((a) => a.res === 'OK'), `${acks.length} acks`);
  await sleep(600);
  const refreshes = inbox.filter((m) => m.topic === T.telemetry && m.body.why === 'refresh').length - before;
  check('duplicate command acts only once', refreshes === 1, `${refreshes} refresh reports`);

  // Expired before it arrived.
  const old = cmd({ issued: new Date(Date.now() - 120_000).toISOString(), ttl: 30 });
  sendCmd(old);
  const exp = await waitFor(() => acksFor(old.id)[0], 4000);
  check('expired command is refused with EXPIRED', exp?.res === 'EXPIRED');

  // Manufacturer-only type must never be accepted from the cloud channel.
  const fr = cmd({ type: 'FACTORY_RESET' });
  sendCmd(fr);
  const frAck = await waitFor(() => acksFor(fr.id)[0], 4000);
  check('FACTORY_RESET is rejected by the device', frAck?.res === 'REJECTED');

  // Out-of-range config must not be applied (non-retained so it cannot poison the broker).
  svc.publish(T.cfg, JSON.stringify({ version: 9999, reportEverySec: 5, changeStepKg: 0.5, wakeBelowKg: 4, lowBatteryMv: 3300 }), { qos: 1 });
  const cfgAck = await waitFor(() => inbox.find((m) => m.topic === T.ack && m.body.cfg === 9999)?.body, 4000);
  check('out-of-range config is rejected, not applied', cfgAck?.res === 'REJECTED');
}

svc.once('connect', async () => {
  try {
    await aclChecks();
    await commandChecks();
  } catch (e) {
    check('check run completed without error', false, String(e));
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  svc.end(true, {}, () => process.exit(failed ? 1 : 0));
});
svc.on('error', (e) => { console.error('mqtt error:', e.message); process.exit(1); });
