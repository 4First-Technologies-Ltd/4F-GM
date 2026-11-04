/**
 * Pure maths for turning raw device readings into what the app shows. No I/O, so
 * it is easy to test and to reuse (alerts, forecast) later.
 */

const HOUR = 3_600_000;

// ── Clock correction ─────────────────────────────────────────────────────────

/** A device clock this close to ours is trusted as it is. */
export const CLOCK_TOLERANCE_MS = 5 * 60_000;
/** Readings stamped further ahead of receipt than this are clamped to receipt. */
const FUTURE_SLACK_MS = 60_000;

export interface TimedReading { t: string }

/**
 * Correct reading times for a device clock that is off. The message carries the
 * time the device *thought* it was when sending; the difference to the real
 * receive time is the skew, applied to every reading so the spacing inside a
 * batch is kept. Within tolerance nothing changes. Never returns a time in the future.
 */
export function correctTimes(readings: TimedReading[], messageT: string, receivedAt: Date): { times: Date[]; skewMs: number; corrected: boolean } {
  const skewMs = receivedAt.getTime() - new Date(messageT).getTime();
  const corrected = Math.abs(skewMs) > CLOCK_TOLERANCE_MS;
  const shift = corrected ? skewMs : 0;
  const ceiling = receivedAt.getTime() + FUTURE_SLACK_MS;
  const times = readings.map((r) => new Date(Math.min(new Date(r.t).getTime() + shift, ceiling)));
  return { times, skewMs, corrected };
}

// ── Weight to gas ────────────────────────────────────────────────────────────

export interface GasReading {
  /** False when no cylinder is on the platform (it was lifted off). */
  present: boolean;
  netKg: number | null;
  percent: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * gross (device) − cylinder empty weight = gas; gas ÷ nominal fill = percent.
 *
 * With no empty weight known yet, net and percent are null: we would rather show
 * "calibrating" than a wrong number. A reading far below the empty weight means
 * the cylinder is not on the platform; that must not look like "0% gas left".
 */
export function computeGas(grossKg: number, emptyWeightKg: number | null, nominalKg: number | null): GasReading {
  if (emptyWeightKg == null) return { present: grossKg > 1, netKg: null, percent: null };
  const present = grossKg >= Math.max(1, emptyWeightKg * 0.5);
  if (!present) return { present: false, netKg: null, percent: null };
  const net = Math.max(0, grossKg - emptyWeightKg);
  const percent = nominalKg && nominalKg > 0 ? Math.min(100, (net / nominalKg) * 100) : null;
  return { present: true, netKg: round2(net), percent: percent == null ? null : round2(percent) };
}

// ── Cylinder swap ────────────────────────────────────────────────────────────

/** Gas never increases by itself, so a jump up this big means a different cylinder was fitted. */
export const SWAP_STEP_KG = 3;

export const isCylinderSwap = (prevGross: number, curGross: number): boolean =>
  curGross - prevGross >= SWAP_STEP_KG && curGross >= 5;

// ── Lagos days ───────────────────────────────────────────────────────────────

/** Lagos is UTC+1 all year, so a Lagos day starts at 23:00 UTC the evening before. */
export function lagosDayStart(t: Date): Date {
  const shifted = t.getTime() + HOUR;
  return new Date(Math.floor(shifted / (24 * HOUR)) * 24 * HOUR - HOUR);
}

// ── Daily rollup ─────────────────────────────────────────────────────────────

export interface RollupPoint { t: Date; grossKg: number; present: boolean; settled: boolean }
export interface DailyRollup { startKg: number; endKg: number; minKg: number; maxKg: number; consumedKg: number; readings: number }

/**
 * Fold new readings into a day's rollup. `prev` is the reading just before the
 * first new one (the device's previous state) so a batch's first step counts.
 *
 * Consumption is the sum of falls between consecutive settled readings with a
 * cylinder on the platform. Rises are ignored (a refill is not negative usage),
 * as are steps across a missing cylinder. Rollups only move forward in time:
 * callers pass readings newer than anything already rolled up.
 */
export function foldRollup(existing: DailyRollup | null, prev: { grossKg: number; present: boolean } | null, points: RollupPoint[]): DailyRollup | null {
  let r = existing;
  let last = prev;
  for (const p of points) {
    // A lifted-off cylinder breaks the chain: the next reading is a new cylinder, not usage.
    if (!p.present) { last = { grossKg: p.grossKg, present: false }; continue; }
    if (!p.settled) continue; // moving or knocked: not evidence of anything
    const g = p.grossKg;
    if (!r) r = { startKg: g, endKg: g, minKg: g, maxKg: g, consumedKg: 0, readings: 0 };
    if (last?.present && !isCylinderSwap(last.grossKg, g) && last.grossKg > g) {
      r = { ...r, consumedKg: round2(r.consumedKg + (last.grossKg - g)) };
    }
    r = { ...r, endKg: g, minKg: Math.min(r.minKg, g), maxKg: Math.max(r.maxKg, g), readings: r.readings + 1 };
    last = { grossKg: g, present: true };
  }
  return r;
}
