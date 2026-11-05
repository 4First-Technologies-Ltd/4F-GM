/**
 * Local MQTT broker for development and tests. NOT for production: plain TCP,
 * in-memory, and it accepts any non-empty device password.
 *
 * It does enforce the same topic rules the production broker must:
 *   - a device authenticates as itself (username === client id)
 *   - it may publish only under its own `up/` topics and subscribe only to its own `dn/` topics
 *   - the `service` account (ingest worker, API, CLI) may do anything
 */
import { createServer } from 'node:net';
import { deviceTopics, isValidDeviceId } from '../../src/lib/deviceProtocol';
import { isServiceUsername } from '../../src/lib/mqttAcl';

const PORT = Number(process.env.DEV_BROKER_PORT) || 1883;
const SERVICE_USER = process.env.MQTT_SERVICE_USER || 'service';
const SERVICE_PASS = process.env.MQTT_SERVICE_PASS || 'service';
const VERBOSE = process.argv.includes('--verbose');

const ts = () => new Date().toISOString().slice(11, 23);

async function main() {
  const { Aedes } = await import('aedes');
  const broker = await Aedes.createBroker();
  const services = new WeakSet<object>();

  broker.authenticate = (client, username, password, done) => {
    const pass = password?.toString() ?? '';
    if (isServiceUsername(username, SERVICE_USER)) {
      if (pass !== SERVICE_PASS) return done(Object.assign(new Error('bad service credentials'), { returnCode: 4 }), false);
      services.add(client);
      return done(null, true);
    }
    const ok = !!username && username === client.id && isValidDeviceId(username) && pass.length > 0;
    if (!ok) return done(Object.assign(new Error('not authorised'), { returnCode: 5 }), false);
    done(null, true);
  };

  broker.authorizePublish = (client, packet, done) => {
    if (!client || services.has(client)) return done(null);
    const prefix = deviceTopics(client.id).telemetry.replace(/telemetry$/, '');
    if (packet.topic.startsWith(prefix)) return done(null);
    console.log(`${ts()} DENY publish  ${client.id} -> ${packet.topic}`);
    done(new Error('publish not allowed'));
  };

  broker.authorizeSubscribe = (client, sub, done) => {
    if (services.has(client)) return done(null, sub);
    const prefix = deviceTopics(client.id).cmd.replace(/cmd$/, '');
    if (sub.topic.startsWith(prefix)) return done(null, sub);
    console.log(`${ts()} DENY subscribe ${client.id} -> ${sub.topic}`);
    done(new Error('subscribe not allowed'));
  };

  broker.on('client', (c) => console.log(`${ts()} connect    ${c.id}`));
  broker.on('clientDisconnect', (c) => console.log(`${ts()} disconnect ${c.id}`));
  if (VERBOSE) {
    broker.on('publish', (p, c) => {
      if (c) console.log(`${ts()} ${p.topic} ${p.payload.toString().slice(0, 200)}`);
    });
  }

  createServer(broker.handle).listen(PORT, () => {
    console.log(`dev MQTT broker on mqtt://localhost:${PORT}  (service user: ${SERVICE_USER})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
