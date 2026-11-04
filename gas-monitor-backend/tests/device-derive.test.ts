import { describe, expect, it } from 'vitest';
import { CLOCK_TOLERANCE_MS, computeGas, correctTimes, foldRollup, isCylinderSwap, lagosDayStart } from '../src/lib/deviceDerive';
import { generateClaimCode, generateDeviceSecret, hashClaimCode, hashDeviceSecret, normalizeClaimCode, verifyClaimCode, verifyDeviceSecret } from '../src/lib/deviceAuth';

describe('computeGas', () => {
  it('subtracts the empty weight and expresses it against the nominal fill', () => {
    expect(computeGas(21.05, 14.8, 12.5)).toEqual({ present: true, netKg: 6.25, percent: 50 });
  });
  it('never goes below 0 or above 100', () => {
    expect(computeGas(14.7, 14.8, 12.5).netKg).toBe(0);
    expect(computeGas(40, 14.8, 12.5).percent).toBe(100);
  });
  it('says "unknown", not 0%, when the empty weight is not known yet', () => {
    expect(computeGas(21, null, 12.5)).toEqual({ present: true, netKg: null, percent: null });
  });
  it('treats a lifted-off cylinder as absent, not as an empty one', () => {
    expect(computeGas(0.15, 14.8, 12.5)).toEqual({ present: false, netKg: null, percent: null });
  });
  it('gives net but no percent when the cylinder size is unknown', () => {
    expect(computeGas(21.05, 14.8, null)).toEqual({ present: true, netKg: 6.25, percent: null });
  });
});

describe('correctTimes', () => {
  const received = new Date('2026-11-02T12:00:00Z');
  it('leaves a clock that is close enough alone', () => {
    const r = correctTimes([{ t: '2026-11-02T11:55:00Z' }], '2026-11-02T11:59:00Z', received);
    expect(r.corrected).toBe(false);
    expect(r.times[0].toISOString()).toBe('2026-11-02T11:55:00.000Z');
  });
  it('shifts a whole batch by the skew and keeps the spacing', () => {
    // Device believes it is 2 hours behind.
    const r = correctTimes([{ t: '2026-11-02T08:00:00Z' }, { t: '2026-11-02T09:55:00Z' }], '2026-11-02T10:00:00Z', received);
    expect(r.corrected).toBe(true);
    expect(r.times.map((t) => t.toISOString())).toEqual(['2026-11-02T10:00:00.000Z', '2026-11-02T11:55:00.000Z']);
  });
  it('repairs a device that woke up thinking it is 1970', () => {
    const r = correctTimes([{ t: '1970-01-01T00:00:00Z' }], '1970-01-01T00:00:10Z', received);
    expect(r.times[0].getTime()).toBeGreaterThan(received.getTime() - 30_000);
    expect(r.times[0].getTime()).toBeLessThanOrEqual(received.getTime() + 60_000);
  });
  it('never returns a time in the future', () => {
    const r = correctTimes([{ t: '2026-11-02T13:00:00Z' }], '2026-11-02T11:59:59Z', received);
    expect(r.times[0].getTime()).toBeLessThanOrEqual(received.getTime() + 60_000);
  });
  it('tolerance is five minutes', () => expect(CLOCK_TOLERANCE_MS).toBe(300_000));
});

describe('cylinder swap', () => {
  it('a jump up is a swap; ordinary use is not', () => {
    expect(isCylinderSwap(1.2, 27.3)).toBe(true);
    expect(isCylinderSwap(0.15, 27.3)).toBe(true); // fitted onto an empty platform
    expect(isCylinderSwap(27.3, 27.1)).toBe(false);
    expect(isCylinderSwap(20, 21)).toBe(false); // noise / slow drift
  });
});

describe('lagosDayStart', () => {
  it('a Lagos day starts at 23:00 UTC the evening before', () => {
    expect(lagosDayStart(new Date('2026-11-02T12:00:00Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(lagosDayStart(new Date('2026-11-02T22:59:59Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(lagosDayStart(new Date('2026-11-02T23:00:00Z')).toISOString()).toBe('2026-11-02T23:00:00.000Z');
  });
});

describe('foldRollup', () => {
  const at = (m: number) => new Date(Date.UTC(2026, 10, 2, 8, m));
  const pt = (m: number, grossKg: number, extra: object = {}) => ({ t: at(m), grossKg, present: true, settled: true, ...extra });

  it('sums the falls between consecutive settled readings', () => {
    const r = foldRollup(null, null, [pt(0, 20), pt(5, 19.8), pt(10, 19.5)])!;
    expect(r).toMatchObject({ startKg: 20, endKg: 19.5, minKg: 19.5, maxKg: 20, readings: 3 });
    expect(r.consumedKg).toBeCloseTo(0.5, 5);
  });
  it('counts the step from the previous batch', () => {
    const r = foldRollup(null, { grossKg: 20, present: true }, [pt(0, 19.7)])!;
    expect(r.consumedKg).toBeCloseTo(0.3, 5);
  });
  it('continues an existing day', () => {
    const first = foldRollup(null, null, [pt(0, 20), pt(5, 19.5)])!;
    const next = foldRollup(first, { grossKg: 19.5, present: true }, [pt(10, 19.0)])!;
    expect(next.consumedKg).toBeCloseTo(1.0, 5);
    expect(next.readings).toBe(3);
    expect(next.startKg).toBe(20);
  });
  it('a refill is not negative usage and not usage', () => {
    const r = foldRollup(null, null, [pt(0, 16), pt(5, 15.9), pt(10, 0.15, { present: false }), pt(15, 27.3), pt(20, 27.2)])!;
    expect(r.consumedKg).toBeCloseTo(0.2, 5); // 0.1 before the swap, 0.1 after, none across it
    expect(r.minKg).toBe(15.9); // the lifted-off 0.15 kg reading must not become the day's minimum
  });
  it('ignores unsettled readings entirely', () => {
    const r = foldRollup(null, null, [pt(0, 20), pt(5, 17, { settled: false }), pt(10, 19.9)])!;
    expect(r.consumedKg).toBeCloseTo(0.1, 5);
    expect(r.readings).toBe(2);
  });
  it('returns the existing rollup unchanged when there is nothing usable', () => {
    expect(foldRollup(null, null, [pt(0, 0.1, { present: false })])).toBeNull();
  });
});

describe('device credentials', () => {
  it('claim codes look right and are forgiving to type', () => {
    const code = generateClaimCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeClaimCode('abcd efgh')).toBe('ABCDEFGH');
    expect(verifyClaimCode(code.toLowerCase().replace('-', ' '), hashClaimCode(code))).toBe(true);
  });
  it('a wrong or missing claim code never verifies', () => {
    const h = hashClaimCode('ABCD-EFGH');
    expect(verifyClaimCode('ABCD-EFGJ', h)).toBe(false);
    expect(verifyClaimCode('ABCD-EFGH', null)).toBe(false);
  });
  it('secrets are long, unique, and only their hash is checked', () => {
    const a = generateDeviceSecret();
    const b = generateDeviceSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(verifyDeviceSecret(a, hashDeviceSecret(a))).toBe(true);
    expect(verifyDeviceSecret(b, hashDeviceSecret(a))).toBe(false);
    expect(hashDeviceSecret(a)).not.toContain(a);
  });
});
