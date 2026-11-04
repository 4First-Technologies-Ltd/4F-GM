import mqtt, { type MqttClient } from 'mqtt';
import { mqttTlsOptions } from './mqttTls';

/**
 * The API's way to reach devices: publish to the broker, nothing else. (The app
 * and website never touch MQTT; they call the API.) The connection is made on
 * first use, so an API instance that never sends a command never connects.
 *
 * One client per process, kept for its lifetime: if the broker goes away the
 * client reconnects by itself, and callers in the meantime fail fast. Every call
 * has a deadline, so a broker that is down produces a clear error the caller can
 * turn into "device channel unavailable", never a request that hangs.
 */

const TIMEOUT_MS = Number(process.env.DEVICE_BUS_TIMEOUT_MS) || 5000;

let client: MqttClient | null = null;

/** True when a broker address is configured. */
export const busConfigured = (): boolean => !!process.env.MQTT_URL;

function withDeadline<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function ensureClient(): MqttClient {
  if (client) return client;
  const url = process.env.MQTT_URL;
  if (!url) throw new Error('MQTT_URL is not set');
  const apiUsername = `${process.env.MQTT_SERVICE_USER || 'service'}.api-${process.pid}-${Math.random().toString(16).slice(2, 6)}`;
  client = mqtt.connect(url, {
    ...mqttTlsOptions(),
    // Unique per process: the broker makes client id = user name, so two API instances
    // sharing a name would knock each other off.
    clientId: apiUsername,
    username: apiUsername,
    password: process.env.MQTT_SERVICE_PASS || 'service',
    clean: true,
    reconnectPeriod: 2000,
    keepalive: 60,
    // Do not let publishes pile up while disconnected: they would be sent minutes later, long after we told the caller "failed".
    queueQoSZero: false,
  });
  client.on('error', (err) => console.error('[deviceBus] mqtt error:', err.message));
  return client;
}

/** Resolves with a connected client, or rejects quickly if the broker is unreachable. */
function connected(): Promise<MqttClient> {
  const c = ensureClient();
  if (c.connected) return Promise.resolve(c);
  return withDeadline(
    new Promise<MqttClient>((resolve, reject) => {
      const ok = () => { cleanup(); resolve(c); };
      const bad = (err: Error) => { cleanup(); reject(err); };
      const cleanup = () => { c.off('connect', ok); c.off('error', bad); };
      c.on('connect', ok);
      c.on('error', bad);
    }),
    'connecting to the broker',
  );
}

/** Publish at QoS 1. Resolves when the broker has accepted the message; rejects on error or deadline. */
export async function publishToDevice(topic: string, payload: string, opts: { retain?: boolean } = {}): Promise<void> {
  const c = await connected();
  await withDeadline(
    new Promise<void>((resolve, reject) => {
      c.publish(topic, payload, { qos: 1, retain: opts.retain ?? false }, (err) => (err ? reject(err) : resolve()));
    }),
    'publishing to the broker',
  );
}

/** For tests and clean shutdown. */
export async function closeBus(): Promise<void> {
  const c = client;
  client = null;
  if (c) await new Promise<void>((r) => c.end(true, {}, () => r()));
}
