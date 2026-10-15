import crypto from 'crypto';
import { sha256 } from './security';

/**
 * RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s), compatible
 * with Google Authenticator, Microsoft Authenticator, Authy and 1Password.
 * Written against node:crypto so there is no third-party TOTP code in the
 * sign-in path.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Returns the matched time step, or null. One step of drift either side is
 * accepted. A step at or below `lastUsedStep` is rejected so a code that was
 * shoulder-surfed or intercepted cannot be replayed within its window.
 */
export function verifyTotp(secret: string, code: string, lastUsedStep?: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const nowStep = currentStep(now);
  for (const step of [nowStep, nowStep - 1, nowStep + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    const expected = Buffer.from(codeAt(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(account: string, secret: string): string {
  const issuer = '4FG Admin';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ── Secret at rest ──────────────────────────────────────────────────────────
// A database leak alone must not hand out second factors, so the secret is
// AES-256-GCM encrypted with a key that lives only in the environment.
function key(): Buffer {
  const material = process.env.MFA_ENCRYPTION_KEY ?? process.env.ADMIN_JWT_SECRET;
  if (!material) throw new Error('MFA_ENCRYPTION_KEY or ADMIN_JWT_SECRET must be set');
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, ct] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Recovery codes ──────────────────────────────────────────────────────────
export function generateRecoveryCodes(count = 8): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

export const normaliseRecoveryCode = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, '');
export const hashRecoveryCode = (v: string) => sha256(normaliseRecoveryCode(v));
export const looksLikeRecoveryCode = (v: string) => /^[0-9a-f]{5}-?[0-9a-f]{5}$/i.test(v.trim());
