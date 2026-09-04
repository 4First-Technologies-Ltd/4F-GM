/**
 * Mask credential-shaped values before rendering captured request context.
 *
 * This is a LAST LINE OF DEFENCE, not the guard. Error context routinely carries
 * authorization headers, cookies, tokens and request bodies; the server must
 * redact at capture time so secrets never reach the database in the first place.
 * Masking only at render leaves them sitting in the store and in any export.
 */

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|x-api-key|api[-_]?key|token|access[-_]?token|refresh[-_]?token|password|passwordhash|secret|client[-_]?secret|session|jwt|bearer|otp|pin|bvn|card|cvv|pan)$/i;

/** Long random-looking strings and JWTs, even under an innocuous key name. */
const SECRET_SHAPED = /^(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{40,}|sk_[A-Za-z0-9_]{16,})$/;

const MAX_DEPTH = 6;

function maskValue(value: string): string {
  if (value.length <= 8) return '••••';
  return `••••${value.slice(-4)}`;
}

export function redactContext(input: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[…]';
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map((v) => redactContext(v, depth + 1));
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = typeof value === 'string' ? maskValue(value) : '••••';
        continue;
      }
      out[key] = redactContext(value, depth + 1);
    }
    return out;
  }

  if (typeof input === 'string' && SECRET_SHAPED.test(input)) {
    return maskValue(input);
  }

  return input;
}
