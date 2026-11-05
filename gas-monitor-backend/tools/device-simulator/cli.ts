/**
 * Developer CLI that plays the cloud's side of the contract.
 *
 *   npm run sim:cli -- watch [deviceId]            print every device message
 *   npm run sim:cli -- send <deviceId> <TYPE>      send a command, wait for the ack
 *   npm run sim:cli -- config <deviceId> k=v ...   publish a new retained config (version bumps)
 *
 * Connects as the broker's service account (MQTT_URL, MQTT_SERVICE_USER, MQTT_SERVICE_PASS).
 */
import mqtt from 'mqtt';
import { mqttTlsOptions } from '../../src/lib/mqttTls';
import { COMMAND_POLICY, CONFIG_LIMITS, configSchema, deviceTopics, parseUpTopic, type CommandType } from '../../src/lib/deviceProtocol';

const [, , sub, ...rest] = process.argv;
const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
const cliUser = `${process.env.MQTT_SERVICE_USER || 'service'}.cli-${Math.random().toString(16).slice(2, 8)}`;
const client = mqtt.connect(url, {
  ...mqttTlsOptions(),
  clientId: cliUser,
  username: cliUser,
  password: process.env.MQTT_SERVICE_PASS || 'service',
  reconnectPeriod: 0,
});
let finishing = false;
client.on('error', (e) => {
  if (finishing) return; // the socket reset while closing is not a failure
  console.error('mqtt error:', e.message);
  process.exit(1);
});

const stamp = () => new Date().toISOString().slice(11, 23);
const done = (code = 0) => {
  finishing = true;
  client.end(false, {}, () => process.exit(code));
};

client.on('connect', () => {
  if (sub === 'watch') return watch(rest[0]);
  if (sub === 'send') return send(rest[0], rest[1] as CommandType);
  if (sub === 'config') return config(rest[0], rest.slice(1));
  console.log('usage: watch [deviceId] | send <deviceId> <REPORT_NOW|TARE|REBOOT> | config <deviceId> key=value ...');
  done(1);
});

function watch(deviceId?: string) {
  client.subscribe(deviceId ? `4fg/v1/d/${deviceId}/#` : '4fg/v1/d/#', { qos: 1 });
  client.on('message', (topic, payload, packet) => {
    const p = parseUpTopic(topic);
    const dir = p ? 'UP  ' : 'DOWN';
    console.log(`${stamp()} ${dir} ${topic.replace('4fg/v1/d/', '')}${packet.retain ? ' (retained)' : ''}\n         ${payload.toString()}`);
  });
}

function send(deviceId: string, type: CommandType) {
  if (!deviceId || !(type in COMMAND_POLICY)) return (console.log('types:', Object.keys(COMMAND_POLICY).join(', ')), done(1));
  const t = deviceTopics(deviceId);
  const id = `cmd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ttl = COMMAND_POLICY[type].ttlSec;
  client.subscribe(t.ack, { qos: 1 }, () => {
    client.publish(t.cmd, JSON.stringify({ id, type, issued: new Date().toISOString(), ttl, args: {} }), { qos: 1 });
    console.log(`${stamp()} sent ${type} ${id} (ttl ${ttl}s), waiting for ack...`);
  });
  client.on('message', (_topic, payload) => {
    const m = JSON.parse(payload.toString());
    if (m.cmd !== id) return;
    console.log(`${stamp()} ack: ${m.res}${m.detail ? ` (${m.detail})` : ''}`);
    done(m.res === 'OK' ? 0 : 2);
  });
  setTimeout(() => { console.log(`${stamp()} no ack within ${ttl + 5}s: this is what the API would mark EXPIRED`); done(3); }, (ttl + 5) * 1000);
}

function config(deviceId: string, pairs: string[]) {
  if (!deviceId || !pairs.length) return (console.log('limits:', JSON.stringify(CONFIG_LIMITS)), done(1));
  const t = deviceTopics(deviceId);
  let current: Record<string, unknown> | null = null;
  client.subscribe(t.cfg, { qos: 1 });
  client.on('message', (_topic, payload) => { current = JSON.parse(payload.toString()); });
  // The retained message arrives right after subscribing; give it a moment.
  setTimeout(() => {
    const next: Record<string, unknown> = { ...(current ?? { reportEverySec: 3600, changeStepKg: 0.5, wakeBelowKg: 0, lowBatteryMv: 3300 }) };
    for (const p of pairs) { const [k, v] = p.split('='); next[k] = Number(v); }
    next.version = ((current as any)?.version ?? 0) + 1;
    const ok = configSchema.safeParse(next);
    if (!ok.success) { console.log('invalid config:', ok.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')); return done(1); }
    client.publish(t.cfg, JSON.stringify(ok.data), { qos: 1, retain: true }, () => {
      console.log(`${stamp()} published config v${ok.data.version}`, ok.data);
      done(0);
    });
  }, 700);
}
