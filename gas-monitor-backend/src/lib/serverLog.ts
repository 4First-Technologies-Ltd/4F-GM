import { format } from 'util';
import { prisma } from './prisma';

/**
 * Persists warnings and errors from this process so an admin can read them
 * without host access. Console output is still written as normal — capture
 * wraps console.warn/console.error, it does not replace them.
 *
 * Design constraints:
 *  - Logging must never break or slow a request: writes are buffered and
 *    flushed in batches, failures are swallowed, and the buffer is capped so a
 *    runaway error loop cannot grow memory or flood the database.
 *  - Log text routinely contains things that must not be stored (this codebase
 *    prints OTP codes when email is unconfigured), so every entry is redacted.
 */

const RETENTION_DAYS = 14;
const MAX_BUFFER = 500;
const MAX_MESSAGE = 2000;
const MAX_STACK = 6000;
const FLUSH_MS = 2000;

type Entry = {
  level: 'WARN' | 'ERROR';
  source: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
};

const buffer: Entry[] = [];
let timer: NodeJS.Timeout | null = null;
let flushing = false;
let installed = false;
let dropped = 0;

export function redact(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[jwt]')
    .replace(/("?(?:password|passwordHash|token|secret|authorization|otp|code)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1[redacted]')
    // "OTP for a@b.com: 123456" (lib/email.ts logs this when Resend is unset)
    .replace(/(otp[^\n:]{0,80}:\s*)\d{4,8}\b/gi, '$1[redacted]')
    .replace(/\b[a-f0-9]{40,}\b/gi, '[hex]');
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function recordServerLog(entry: Entry): void {
  if (buffer.length >= MAX_BUFFER) {
    dropped += 1;
    return;
  }
  buffer.push({
    ...entry,
    message: clip(redact(entry.message), MAX_MESSAGE),
    stack: entry.stack ? clip(redact(entry.stack), MAX_STACK) : null
  });
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_MS);
    timer.unref?.();
  }
}

async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    if (dropped > 0) {
      batch.push({ level: 'WARN', source: 'console', message: `${dropped} log entries were dropped (buffer full)` });
      dropped = 0;
    }
    await prisma.serverLog.createMany({ data: batch });
  } catch {
    // Deliberately silent: reporting a failure here would re-enter capture.
  } finally {
    flushing = false;
  }
}

/** Mark an error as already recorded with request context, so console capture skips it. */
const LOGGED = Symbol('serverLogged');

export function recordHttpError(err: unknown, req: { path: string; method: string }, statusCode: number): void {
  const isErr = err instanceof Error;
  if (typeof err === 'object' && err !== null) (err as Record<symbol, unknown>)[LOGGED] = true;
  recordServerLog({
    level: 'ERROR',
    source: 'http',
    message: isErr ? err.message : String(err),
    stack: isErr ? err.stack : null,
    path: req.path,
    method: req.method,
    statusCode
  });
}

/** Wrap console.warn / console.error once. Call early, before other modules log. */
export function installServerLogCapture(): void {
  if (installed) return;
  installed = true;

  for (const [fn, level] of [
    ['warn', 'WARN'],
    ['error', 'ERROR']
  ] as const) {
    const original = console[fn].bind(console);
    console[fn] = (...args: unknown[]) => {
      original(...args);
      try {
        const first = args[0];
        if (typeof first === 'object' && first !== null && (first as Record<symbol, unknown>)[LOGGED]) return;
        const err = args.find((a): a is Error => a instanceof Error);
        recordServerLog({
          level,
          source: 'console',
          message: format(...args.map((a) => (a instanceof Error ? a.message : a))),
          stack: err?.stack ?? null
        });
      } catch {
        // never let capture throw into the caller
      }
    };
  }
}

export async function pruneServerLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.serverLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

export const SERVER_LOG_RETENTION_DAYS = RETENTION_DAYS;
