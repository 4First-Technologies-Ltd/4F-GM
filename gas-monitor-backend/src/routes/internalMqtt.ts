import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { safeEqual } from '../lib/security';
import { hashDeviceSecret, verifyDeviceSecret } from '../lib/deviceAuth';
import { isValidDeviceId } from '../lib/deviceProtocol';
import { deviceMayAccess, isServiceUsername } from '../lib/mqttAcl';

/**
 * The broker's auth plugin (mosquitto-go-auth, HTTP backend) calls these to decide
 * who may connect and what they may touch. It reaches us over the internal Docker
 * network, never through the public proxy.
 *
 *   POST /internal/mqtt/<token>/auth        { username, password, clientid }
 *   POST /internal/mqtt/<token>/superuser   { username }
 *   POST /internal/mqtt/<token>/acl         { username, clientid, topic, acc }
 *
 * Answers are status-only: 200 allows, anything else denies. The plugin caches
 * answers for ~30 s, so revoking a device takes effect within that window for a
 * connected device, and immediately for a new connection.
 *
 * The token is in the path because the plugin cannot send headers. Two
 * consequences handled here: the whole feature is OFF (404) unless
 * MQTT_AUTH_TOKEN is set, and no error ever escapes to the app's error handler,
 * which stores request paths in the server logs.
 */
const router = Router();

const serviceUser = () => process.env.MQTT_SERVICE_USER || 'service';

/** The service account (ingest worker, API publisher, CLI). Needs an explicit password: no default in production. */
function isServiceLogin(username: unknown, password: unknown): boolean {
  const expected = process.env.MQTT_SERVICE_PASS;
  return !!expected && isServiceUsername(username, serviceUser()) && typeof password === 'string' && safeEqual(password, expected);
}

// Compared against when the device does not exist, so "unknown device" and "wrong secret" take the same time.
const DUMMY_HASH = hashDeviceSecret('no-such-device');

function guarded(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const expected = process.env.MQTT_AUTH_TOKEN;
    if (!expected || !safeEqual(String(req.params.token ?? ''), expected)) return res.status(404).end();
    try {
      await handler(req, res);
    } catch (err) {
      // Deliberately not rethrown and not logged with the request: see the note above.
      console.error('[mqtt-auth] lookup failed:', err instanceof Error ? err.message : 'unknown error');
      if (!res.headersSent) res.status(503).end();
    }
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

router.post('/:token/auth', guarded(async (req, res) => {
  const { username, password, clientid } = req.body ?? {};
  if (isServiceLogin(username, password)) return res.status(200).end();

  const id = str(username);
  // A device logs in as itself: user name and client id are the device id.
  if (!isValidDeviceId(id) || id !== str(clientid) || typeof password !== 'string' || !password) return res.status(401).end();
  const device = await prisma.device.findUnique({ where: { id }, select: { secretHash: true, revokedAt: true } });
  const ok = verifyDeviceSecret(password, device?.secretHash ?? DUMMY_HASH);
  if (!device || device.revokedAt || !ok) return res.status(401).end();
  res.status(200).end();
}));

router.post('/:token/superuser', guarded(async (req, res) => {
  // Only the service account bypasses topic rules; it has no row in the database to check.
  res.status(isServiceUsername(req.body?.username, serviceUser()) ? 200 : 403).end();
}));

router.post('/:token/acl', guarded(async (req, res) => {
  const { username, clientid, topic } = req.body ?? {};
  const acc = Number(req.body?.acc);
  if (isServiceUsername(username, serviceUser())) return res.status(200).end(); // authenticated as service at connect time
  const id = str(username);
  if (!isValidDeviceId(id) || id !== str(clientid)) return res.status(403).end();
  if (!deviceMayAccess(id, str(topic), acc)) return res.status(403).end();
  // A revoked device stops being served even if it is still connected.
  const device = await prisma.device.findUnique({ where: { id }, select: { revokedAt: true } });
  res.status(device && !device.revokedAt ? 200 : 403).end();
}));

export default router;
