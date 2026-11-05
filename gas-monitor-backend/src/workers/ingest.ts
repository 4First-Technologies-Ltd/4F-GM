import 'dotenv/config';
import mqtt, { type IPublishPacket } from 'mqtt';
import { initSentry, Sentry } from '../lib/sentry';
import { installServerLogCapture } from '../lib/serverLog';

initSentry();
installServerLogCapture();

import { INGEST_SUBSCRIPTION } from '../lib/deviceProtocol';
import { routeMessage } from '../lib/deviceIngest';
import { sweepExpiredCommands } from '../lib/deviceCommands';
import { sweepOffline } from '../lib/deviceAlerts';
import { syncAllConfigs } from '../lib/deviceConfig';
import { prisma } from '../lib/prisma';
import { mqttTlsOptions } from '../lib/mqttTls';

/**
 * Subscribes to everything devices publish and stores it.
 *
 * Delivery guarantees:
 *  - persistent session under a fixed client id: if this process is down, the
 *    broker keeps the QoS 1 messages and delivers them on restart;
 *  - one message at a time, in order; the broker is acknowledged only AFTER the
 *    database write commits, so a crash never loses an accepted message;
 *  - a database failure is retried with backoff and blocks the queue (the broker
 *    holds the backlog) rather than dropping data;
 *  - a message that can never succeed (bad JSON, schema violation, unknown device)
 *    is logged and acknowledged, so it cannot jam the queue.
 *
 * Assumes ONE instance. To scale out, switch to MQTT shared subscriptions.
 */

const URL = process.env.MQTT_URL;
if (!URL) {
  console.error('[ingest] MQTT_URL is not set');
  process.exit(1);
}

const INGEST_USERNAME = `${process.env.MQTT_SERVICE_USER || 'service'}.ingest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_BACKOFF_MS = 30_000;

async function processWithRetry(topic: string, payload: Buffer) {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await routeMessage(topic, payload);
      if (!out.ok) console.warn(`[ingest] dropped ${topic}: ${out.reason}${out.detail ? ` (${out.detail})` : ''}`);
      return;
    } catch (err) {
      const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
      console.error(`[ingest] ${topic} failed (attempt ${attempt + 1}), retrying in ${wait}ms:`, err instanceof Error ? err.message : err);
      if (attempt === 3) Sentry.captureException(err);
      await sleep(wait);
    }
  }
}

const client = mqtt.connect(URL, {
  ...mqttTlsOptions(),
  // Fixed, so the broker keeps this worker's backlog while it is down. The broker makes client id = user name.
  clientId: INGEST_USERNAME,
  username: INGEST_USERNAME,
  password: process.env.MQTT_SERVICE_PASS || 'service',
  clean: false,
  reconnectPeriod: 2000,
  keepalive: 60,
});

// mqtt.js calls this once per incoming PUBLISH and sends the PUBACK only when we
// call `done`, and does not deliver the next message until then (backpressure).
client.handleMessage = (packet: IPublishPacket, done) => {
  processWithRetry(packet.topic, packet.payload as Buffer).finally(() => done());
};

// Commands nobody answered become EXPIRED. The API already reports them as expired the
// moment their deadline passes; this makes it permanent. Idempotent, so safe if it overlaps.
const sweep = setInterval(() => {
  sweepExpiredCommands()
    .then((n) => n && console.log(`[ingest] expired ${n} unanswered command(s)`))
    .catch((err) => console.error('[ingest] expiry sweep failed:', err instanceof Error ? err.message : err));
}, 5000);
sweep.unref();

// Devices that have gone quiet past their own reporting interval trigger the OFFLINE alert.
const offlineSweep = setInterval(() => {
  sweepOffline()
    .then((n) => n && console.log(`[ingest] raised ${n} offline alert(s)`))
    .catch((err) => console.error('[ingest] offline sweep failed:', err instanceof Error ? err.message : err));
}, Number(process.env.OFFLINE_SWEEP_MS) || 60_000);
offlineSweep.unref();

/** Re-publish every device's retained config from the database (it is the truth, the broker's copy is not). */
function resyncConfigs() {
  const publish = (topic: string, payload: string) =>
    new Promise<void>((resolve, reject) => client.publish(topic, payload, { qos: 1, retain: true }, (e) => (e ? reject(e) : resolve())));
  syncAllConfigs(publish)
    .then((n) => console.log(`[ingest] re-published ${n} device config(s)`))
    .catch((err) => console.error('[ingest] config resync failed:', err instanceof Error ? err.message : err));
}

client.on('connect', (ack) => {
  console.log(`[ingest] connected to ${URL} (session present: ${ack.sessionPresent})`);
  client.subscribe(INGEST_SUBSCRIPTION, { qos: 1 }, (err) => {
    if (err) console.error('[ingest] subscribe failed', err);
    else console.log(`[ingest] subscribed to ${INGEST_SUBSCRIPTION}`);
  });
  resyncConfigs();
});
client.on('reconnect', () => console.warn('[ingest] reconnecting to broker'));
client.on('error', (err) => console.error('[ingest] mqtt error:', err.message));

async function shutdown() {
  console.log('[ingest] shutting down');
  client.end(false, {}, async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
