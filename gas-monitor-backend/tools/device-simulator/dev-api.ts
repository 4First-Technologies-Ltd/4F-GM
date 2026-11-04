/**
 * Just the API, against a scratch database on this machine, with development
 * defaults for the secrets it needs. For trying the device endpoints and for the
 * local MQTT broker to authenticate against (deploy/mqtt/docker-compose.dev.yml).
 *
 *   DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/scratch DIRECT_URL=$DATABASE_URL \
 *   MQTT_AUTH_TOKEN=devtoken MQTT_SERVICE_PASS=devsvc npm run sim:api
 *
 * Refuses to start unless the database is on this machine.
 */
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error('Refusing to start: DATABASE_URL must point at a database on this machine.');
  process.exit(1);
}
process.env.NODE_ENV = 'test'; // quiet logging, and never production behaviour
process.env.JWT_ACCESS_SECRET ||= 'dev-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'dev-refresh-secret';

async function main() {
  const { createApp } = await import('../../src/app');
  const port = Number(process.env.PORT) || 9000;
  // 0.0.0.0 so the broker container can reach it through host.docker.internal.
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`dev API on http://localhost:${port}  (broker auth ${process.env.MQTT_AUTH_TOKEN ? 'ENABLED' : 'disabled: set MQTT_AUTH_TOKEN'})`);
  });
}
main();
