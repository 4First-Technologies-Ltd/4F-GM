import { isValidDeviceId } from './deviceProtocol';

/**
 * Which topics a device may touch. This is the rule the production broker
 * enforces (through its auth plugin calling the API) and the same one the dev
 * broker implements, so a firmware engineer sees identical behaviour on both.
 *
 *   publish   only   4fg/v1/d/<own id>/up/{telemetry,event,ack,status}
 *   subscribe only   4fg/v1/d/<own id>/dn/{cmd,cfg}   (or dn/#, which expands to those two)
 *
 * Nothing else: not another device's topics, not a wildcard above `dn/`, not
 * read access to its own `up/` topics. The ingest worker trusts the device id in
 * the topic, so THIS rule is what makes that safe.
 */

/**
 * The broker forces client id = user name (use_username_as_clientid), so every
 * service client needs its own user name or they would knock each other off.
 * "service", "service.ingest", "service.api-1234" are all the service account and
 * share one password. Anything else that merely starts with "service" is not.
 */
export function isServiceUsername(username: unknown, base: string): boolean {
  if (typeof username !== 'string' || !base) return false;
  return username === base || (username.startsWith(base + '.') && /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(username.slice(base.length + 1)));
}

/** Mosquitto's access codes, as the auth plugin passes them. */
export const ACC = { READ: 1, WRITE: 2, READWRITE: 3, SUBSCRIBE: 4 } as const;

const UP = /^up\/(telemetry|event|ack|status)$/;
const DN = new Set(['dn/cmd', 'dn/cfg', 'dn/#']);

export function deviceMayAccess(deviceId: string, topic: string, acc: number): boolean {
  if (!isValidDeviceId(deviceId)) return false;
  const base = `4fg/v1/d/${deviceId}/`;
  if (!topic.startsWith(base)) return false;
  const rest = topic.slice(base.length);
  if (acc === ACC.WRITE) return UP.test(rest);
  if (acc === ACC.READ || acc === ACC.SUBSCRIBE) return DN.has(rest);
  return false; // READWRITE is never needed, and denying it is the safe default
}
