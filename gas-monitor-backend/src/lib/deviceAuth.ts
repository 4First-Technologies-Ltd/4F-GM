import crypto from 'crypto';
import { safeEqual, sha256 } from './security';

/**
 * Device credentials. A device's MQTT secret is 32 random bytes, so a fast hash
 * (not bcrypt) is enough to store it and cheap enough for the broker to check on
 * every connect. Only hashes are stored; the plain values are shown once at
 * provisioning and printed on / flashed into the unit.
 */

export const hashDeviceSecret = (secret: string): string => sha256(secret);

export const generateDeviceSecret = (): string => crypto.randomBytes(32).toString('base64url');

export function verifyDeviceSecret(secret: string, storedHash: string): boolean {
  return safeEqual(hashDeviceSecret(secret), storedHash);
}

// No 0/O, 1/I/L, so a code read off a sticker is hard to mistype.
const CLAIM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Eight characters shown as XXXX-XXXX. ~40 bits, and claiming is rate limited. */
export function generateClaimCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CLAIM_ALPHABET[bytes[i] % CLAIM_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accept lower case, spaces and a missing hyphen: "abcd efgh" and "ABCD-EFGH" are the same code. */
export const normalizeClaimCode = (input: string): string => input.replace(/[\s-]/g, '').toUpperCase();

export const hashClaimCode = (input: string): string => sha256(normalizeClaimCode(input));

export function verifyClaimCode(input: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  return safeEqual(hashClaimCode(input), storedHash);
}
