import crypto from 'crypto';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

/** Constant-time string comparison that tolerates different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/** One-way hash for values we only ever need to look up (refresh tokens). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const json429 = { error: 'Too many requests. Please wait a few minutes and try again.' };

function limiter(windowMs: number, limit: number, key?: (req: Request) => string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: json429,
    ...(key ? { keyGenerator: key } : {})
  });
}

const emailOf = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return `${req.ip}|${email}`;
};

const MIN = 60 * 1000;

/** Password guessing: customer and admin sign-in. */
export const loginLimiter = limiter(15 * MIN, 10, emailOf);
export const adminLoginLimiter = limiter(15 * MIN, 5);
/** Guessing six-digit second-factor codes. */
export const adminMfaLimiter = limiter(15 * MIN, 10);
/** Anything that sends an email or SMS costs money and can be used to harass. */
export const otpSendLimiter = limiter(10 * MIN, 3, emailOf);
/** Guessing codes. */
export const otpVerifyLimiter = limiter(15 * MIN, 10, emailOf);
export const registerLimiter = limiter(60 * MIN, 10);
/**
 * Opening and accepting an invite link. The token is 256 random bits so guessing is
 * hopeless; this only stops hammering, and is generous enough for several managers
 * accepting from one shop's shared connection.
 */
export const inviteLimiter = limiter(15 * MIN, 60);
/** Each invite sends an email, so cap how many one vendor can send (and spam someone with). */
export const inviteSendLimiter = limiter(60 * MIN, 30, (req: Request) => (req.user?.sub ?? req.ip ?? 'anon'));
export const contactLimiter = limiter(60 * MIN, 5);
export const guestOrderLimiter = limiter(15 * MIN, 20);
/** Each call mints an upload link, so cap how many a vendor can request. */
export const documentUploadLimiter = limiter(60 * MIN, 30);
