import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { redact } from '../src/lib/serverLog';
import { safeEqual, sha256 } from '../src/lib/security';
import { validatePassword } from '../src/lib/password';
import { hashOtp, generateOtp } from '../src/lib/otp';
import { kgOf } from '../src/lib/pricing';

const pw = z.string().superRefine(validatePassword);

describe('safeEqual', () => {
  it('matches equal strings and rejects different ones, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('sha256', () => {
  it('is deterministic and never returns the input', () => {
    expect(sha256('token')).toBe(sha256('token'));
    expect(sha256('token')).not.toContain('token');
  });
});

describe('password policy', () => {
  it('rejects short, common and over-long passwords', () => {
    expect(pw.safeParse('short1').success).toBe(false);
    expect(pw.safeParse('password123').success).toBe(false);
    expect(pw.safeParse('x'.repeat(73)).success).toBe(false);
  });
  it('accepts a reasonable password', () => {
    expect(pw.safeParse('gas-monitor-2026').success).toBe(true);
  });
});

describe('otp', () => {
  it('generates 6 digits and stores only a hash', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(hashOtp(otp)).not.toBe(otp);
  });
});

describe('log redaction', () => {
  it('removes bearer tokens, JWTs, secrets and OTP codes', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk';
    const out = redact(`Bearer ${jwt} password=hunter2 {"token":"abc"} OTP for a@b.com: 123456`);
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('123456');
    expect(out).not.toContain('eyJhbGci');
  });
});

describe('pricing helpers', () => {
  it('reads kilograms from size labels', () => {
    expect(kgOf('12.5 kg')).toBe(12.5);
    expect(kgOf('Bulk Tank')).toBeNull();
  });
});
