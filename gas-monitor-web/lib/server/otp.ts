import crypto from 'crypto';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}
