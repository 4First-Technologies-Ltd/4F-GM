/**
 * Fake 4FG device. Speaks the real MQTT contract (src/lib/deviceProtocol.ts) so
 * the backend and apps can be built before hardware exists, and so the firmware
 * engineer has a reference for message order and timing.
 *
 *   npm run sim:broker                          # terminal 1
 *   npm run sim:device -- --scenario refill     # terminal 2
 *   npm run sim:cli -- watch                    # terminal 3
 *
 * Time: timestamps are real. `--speed N` makes the gas drain N times faster and
 * the report interval N times shorter, so a cylinder empties in minutes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import mqtt, { type MqttClient } from 'mqtt';
import { mqttTlsOptions } from '../../src/lib/mqttTls';
import {
  DEFAULT_DEVICE_CONFIG,
  PROTOCOL_VERSION,
  commandSchema,
  configSchema,
  deviceTopics,
  eventSchema,
  telemetrySchema,
  type AckResult,
  type DeviceConfigMessage,
  type EventCode,
  type ReportReason,
} from '../../src/lib/deviceProtocol';

const { values: args } = parseArgs({
  options: {
    device: { type: 'string', default: 'FG-SIM-0001' },
    url: { type: 'string', default: process.env.MQTT_URL || 'mqtt://localhost:1883' },
    password: { type: 'string', default: 'sim-secret' },
    cylinder: { type: 'string', default: '12.5' }, // nominal gas kg
    'empty-weight': { type: 'string', default: '14.8' }, // cylinder tare (TW)
    percent: { type: 'string', default: '80' },
    speed: { type: 'string', default: '1' },
    scenario: { type: 'string', default: 'steady' }, // steady | refill | outage | lowbat | chaos
    'clock-skew-sec': { type: 'string', default: '0' },
    'state-dir': { type: 'string', default: path.join(__dirname, '.state') },
    reset: { type: 'boolean', default: false },
    'platform-empty': { type: 'boolean', default: false }, // start with no cylinder, so TARE can succeed
  },
});

const DEVICE = args.device!;
const SPEED = Math.max(1, Number(args.speed));
const NOMINAL_KG = Number(args.cylinder);
const EMPTY_KG = Number(args['empty-weight']);
const SKEW_MS = Number(args['clock-skew-sec']) * 1000;
const SCENARIO = args.scenario!;
const wantsRefill = SCENARIO === 'refill' || SCENARIO === 'chaos';
const wantsOutage = SCENARIO === 'outage' || SCENARIO === 'chaos';
const wantsLowBat = SCENARIO === 'lowbat' || SCENARIO === 'chaos';
const FW = '0.1.0-sim';
const T = deviceTopics(DEVICE);

// ── Persistent state (stands in for flash / NVM) ─────────────────────────────

interface Persisted {
  seq: number;
  cfg: DeviceConfigMessage;
  gasKg: number;
  zeroErrKg: number;
  batteryMv: number;
  /** Last ~20 command results, so a redelivered command is answered, not re-run. */
  recent: { id: string; res: AckResult; detail?: string }[];
}
const stateFile = path.join(args['state-dir']!, `${DEVICE}.json`);
fs.mkdirSync(args['state-dir']!, { recursive: true });
let st: Persisted = {
  seq: 0,
  cfg: { version: 0, ...DEFAULT_DEVICE_CONFIG },
  gasKg: (NOMINAL_KG * Number(args.percent)) / 100,
  zeroErrKg: 0.15,
  batteryMv: wantsLowBat ? 3450 : 3700,
  recent: [],
};
if (!args.reset && fs.existsSync(stateFile)) st = { ...st, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));

// ── Physical model ───────────────────────────────────────────────────────────

let cylinderPresent = !args['platform-empty'];
let moving = false; // a cylinder is being lifted on or off: readings are unsettled
let cooking = false;
let bootedAt = Date.now();
let rebooting = false;
let bootReason = 'power_on';
const noise = () => (Math.random() - 0.5) * 0.04;
const nowMs = () => Date.now() + SKEW_MS;
const iso = (ms = nowMs()) => new Date(ms).toISOString();
const uptimeSec = () => Math.floor((Date.now() - bootedAt) / 1000);

function grossKg(): number {
  return Math.max(0, (cylinderPresent ? EMPTY_KG + st.gasKg : 0) + st.zeroErrKg + noise());
}
const netKg = () => (cylinderPresent ? st.gasKg : 0);
const tempC = () => 27 + 4 * Math.sin(Date.now() / 3.6e6) + (Math.random() - 0.5) * 0.4;

// ── Logging ──────────────────────────────────────────────────────────────────

const log = (...m: unknown[]) => console.log(new Date().toISOString().slice(11, 23), `[${DEVICE}]`, ...m);

// ── Connection with exponential backoff and jitter ───────────────────────────

let client: MqttClient | null = null;
let connected = false;
let blockedUntil = 0; // simulated coverage loss
let attempt = 0;
let firstConnect = true;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopping = false;

function connect() {
  if (stopping) return;
  const c = mqtt.connect(args.url!, {
    ...mqttTlsOptions(),
    clientId: DEVICE,
    username: DEVICE,
    password: args.password,
    clean: false, // persistent session: the broker holds commands sent while we are away
    reconnectPeriod: 0, // we do our own backoff, as the firmware must
    keepalive: 60,
    will: { topic: T.status, payload: JSON.stringify({ state: 'offline' }), qos: 1, retain: true },
  });
  client = c;
  c.on('connect', () => {
    connected = true;
    attempt = 0;
    log('connected');
    c.subscribe([T.cmd, T.cfg], { qos: 1 });
    publish(T.status, { state: 'online', fw: FW, t: iso() }, true);
    if (firstConnect) {
      firstConnect = false;
      event('BOOT', { reason: bootReason });
      report('boot');
    } else {
      event('NETWORK_RECOVERED');
      report('retry'); // flush whatever was buffered while offline
    }
  });
  c.on('message', (topic, payload) => {
    if (topic === T.cmd) onCommand(payload.toString());
    else if (topic === T.cfg) onConfig(payload.toString());
  });
  c.on('close', () => {
    connected = false;
    if (stopping || rebooting) return;
    const delay = Math.min(60000, 1000 * 2 ** attempt++) * (0.5 + Math.random() / 2); // jitter
    const wait = Math.max(delay, blockedUntil - Date.now());
    log(`disconnected, retrying in ${(wait / 1000).toFixed(1)}s`);
    reconnectTimer = setTimeout(connect, wait);
  });
  c.on('error', (e) => log('mqtt error:', e.message));
}

function publish(topic: string, body: unknown, retain = false) {
  if (!connected || !client) return false;
  client.publish(topic, JSON.stringify(body), { qos: 1, retain });
  return true;
}

// ── Reporting ────────────────────────────────────────────────────────────────

interface Sample { t: string; kg: number; c: number; s: 0 | 1 }
const pending: Sample[] = []; // offline buffer (ring, newest kept)
const MAX_PENDING = 48;
let lastReportAt = 0;
let lastReportedKg = grossKg();

function sample(): Sample {
  const s: Sample = {
    t: iso(),
    kg: Math.round(grossKg() * 100) / 100,
    c: Math.round(tempC() * 10) / 10,
    s: moving ? 0 : 1,
  };
  pending.push(s);
  if (pending.length > MAX_PENDING) pending.shift();
  return s;
}

function report(why: ReportReason) {
  if (!pending.length || why !== 'retry') sample(); // a catch-up flush sends the buffer as it stands
  const msg = {
    v: PROTOCOL_VERSION,
    seq: st.seq,
    t: iso(),
    up: uptimeSec(),
    r: pending.slice(),
    bat: { mv: Math.round(st.batteryMv), pct: Math.max(0, Math.min(100, Math.round((st.batteryMv - 3000) / 7))), ext: 0 as const },
    net: { rssi: -70 - Math.floor(Math.random() * 25), rat: 'LTE' },
    fw: FW,
    cal: 1,
    cfg: st.cfg.version,
    why,
  };
  const check = telemetrySchema.safeParse(msg);
  if (!check.success) return log('BUG: telemetry violates the contract', check.error.issues);
  if (!publish(T.telemetry, msg)) return; // offline: keep buffering
  log(`telemetry seq=${msg.seq} why=${why} readings=${msg.r.length} kg=${msg.r.at(-1)!.kg} net=${netKg().toFixed(2)}`);
  st.seq++;
  save();
  pending.length = 0;
  lastReportAt = Date.now();
  lastReportedKg = msg.r.at(-1)!.kg;
}

function event(code: EventCode, data?: Record<string, unknown>) {
  const msg = { v: PROTOCOL_VERSION, t: iso(), code, ...(data ? { data } : {}) };
  const check = eventSchema.safeParse(msg);
  if (!check.success) return log('BUG: event violates the contract', check.error.issues);
  if (publish(T.event, msg)) log(`event ${code}`);
}

function ack(body: Record<string, unknown>) {
  publish(T.ack, { ...body, t: iso() });
}

// ── Config (retained, applied by version) ────────────────────────────────────

function onConfig(raw: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return log('cfg: not JSON, ignored'); }
  const cfg = configSchema.safeParse(parsed);
  const version = (parsed as { version?: number })?.version;
  if (!cfg.success) {
    log('cfg rejected:', cfg.error.issues[0]?.message);
    if (typeof version === 'number') ack({ cfg: version, res: 'REJECTED', detail: 'out of range' });
    return;
  }
  if (cfg.data.version <= st.cfg.version) return; // retained redelivery or stale
  st.cfg = cfg.data;
  save();
  log(`config v${cfg.data.version} applied`, cfg.data);
  ack({ cfg: cfg.data.version, res: 'OK' });
}

// ── Commands ─────────────────────────────────────────────────────────────────

function finish(id: string, res: AckResult, detail?: string) {
  st.recent = [{ id, res, detail }, ...st.recent.filter((r) => r.id !== id)].slice(0, 20);
  save();
  ack({ cmd: id, res, ...(detail ? { detail } : {}) });
  log(`command ${id} -> ${res}${detail ? ` (${detail})` : ''}`);
}

function onCommand(raw: string) {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return log('cmd: not JSON, ignored'); }
  const cmd = commandSchema.safeParse(parsed);
  if (!cmd.success) {
    if (typeof parsed?.id === 'string') finish(parsed.id, 'REJECTED', 'unknown or malformed command');
    return;
  }
  const { id, type, issued, ttl } = cmd.data;
  const seen = st.recent.find((r) => r.id === id);
  if (seen) { // QoS 1 can deliver twice: repeat the original answer, do not act again
    log(`command ${id} duplicate, re-sending result`);
    return ack({ cmd: id, res: seen.res, ...(seen.detail ? { detail: seen.detail } : {}) });
  }
  if (nowMs() > new Date(issued).getTime() + ttl * 1000) return finish(id, 'EXPIRED', 'ttl elapsed');

  switch (type) {
    case 'REPORT_NOW':
      finish(id, 'OK');
      return report('refresh');
    case 'TARE':
      // Zeroing with a cylinder on would bake its weight into the zero point.
      if (cylinderPresent || grossKg() > 1) return finish(id, 'REJECTED', 'PLATFORM_NOT_EMPTY');
      st.zeroErrKg = 0;
      finish(id, 'OK');
      event('TARE_DONE');
      return report('event');
    case 'REBOOT':
      finish(id, 'OK');
      log('rebooting');
      rebooting = true;
      setTimeout(() => {
        // A clean disconnect skips the last will, so say goodbye first.
        publish(T.status, { state: 'offline', t: iso() }, true);
        client?.end(false, {}, () =>
          setTimeout(() => {
            rebooting = false;
            bootedAt = Date.now();
            bootReason = 'command';
            firstConnect = true; // a real reboot runs the boot sequence again
            pending.length = 0; // RAM buffer is lost on reset
            connect();
          }, 2000),
        );
      }, 300);
      return;
  }
}

// ── Main loop (1 Hz) ─────────────────────────────────────────────────────────

let lastSampleAt = 0;
let refillStage: 'none' | 'removed' = 'none';
let refillAt = 0;
let outageDone = false;
const startedAt = Date.now();
let lowBatSent = false;

function tick() {
  // Gas use: cooking in bursts on top of a small standing draw (~1.4 kg/day average).
  // One tick is SPEED simulated seconds, so scale the on/off odds to match.
  const flip = (p: number) => Math.random() < 1 - Math.pow(1 - p, SPEED);
  if (flip(cooking ? 0.02 : 0.004)) cooking = !cooking;
  if (cylinderPresent) st.gasKg = Math.max(0, st.gasKg - ((cooking ? 0.35 : 0.01) / 3600) * SPEED);
  st.batteryMv -= (wantsLowBat ? 0.4 : 0.002) * SPEED / 10;

  // Scenarios
  if (wantsRefill) {
    if (cylinderPresent && netKg() < NOMINAL_KG * 0.08 && refillStage === 'none') {
      cylinderPresent = false; moving = true; refillStage = 'removed'; refillAt = Date.now();
      log('scenario: cylinder removed for refill');
    } else if (refillStage === 'removed' && Date.now() - refillAt > 8000) {
      cylinderPresent = true; st.gasKg = NOMINAL_KG; refillStage = 'none'; moving = false;
      log('scenario: full cylinder fitted');
      event('CYLINDER_CHANGED', { kg: Math.round(grossKg() * 100) / 100 });
      report('event');
    }
  }
  if (wantsOutage && !outageDone && Date.now() - startedAt > 45000 && connected) {
    outageDone = true;
    blockedUntil = Date.now() + 40000;
    log('scenario: coverage lost for 40s (unclean drop, last will fires)');
    (client as any)?.stream?.destroy();
  }
  if (!lowBatSent && st.batteryMv <= st.cfg.lowBatteryMv) {
    lowBatSent = true;
    event('LOW_BATTERY', { mv: Math.round(st.batteryMv) });
  }

  // Sampling and report triggers, all driven by the config the cloud sent us.
  const cfgNow = st.cfg;
  const heartbeatMs = (cfgNow.reportEverySec * 1000) / SPEED;
  const lowGasMs = (Math.min(cfgNow.reportEverySec, 900) * 1000) / SPEED;
  const interval = cfgNow.wakeBelowKg > 0 && grossKg() < cfgNow.wakeBelowKg ? lowGasMs : heartbeatMs;
  if (Date.now() - lastSampleAt >= Math.max(1000, 60000 / SPEED)) { lastSampleAt = Date.now(); sample(); }
  if (moving) return; // never trigger a report off an unsettled reading
  const changed = Math.abs(grossKg() - lastReportedKg) >= cfgNow.changeStepKg;
  if (connected && (Date.now() - lastReportAt >= interval || changed)) {
    report(changed ? 'change' : 'heartbeat');
  }
}

// ── Start / stop ─────────────────────────────────────────────────────────────

log(`starting: scenario=${SCENARIO} speed=${SPEED}x gas=${st.gasKg.toFixed(2)}kg broker=${args.url}`);
connect();
const loop = setInterval(tick, 1000);

function shutdown() {
  stopping = true;
  clearInterval(loop);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (client && connected) {
    // A clean exit skips the last will, so say goodbye explicitly.
    client.publish(T.status, JSON.stringify({ state: 'offline', t: iso() }), { qos: 1, retain: true }, () =>
      client!.end(false, {}, () => process.exit(0)),
    );
    setTimeout(() => process.exit(0), 1500);
  } else process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
