/**
 * Loose gas: the customer buys by weight or by money instead of a fixed
 * cylinder size. Mirrors gas-monitor-backend/src/lib/pricing.ts, which is the
 * authority; this only previews what the server will charge.
 */
export const MIN_LOOSE_KG = 0.5;
export const MAX_LOOSE_KG = 100;

export interface LooseQuote {
  /** Kilograms of gas the customer gets. */
  kg: number;
  /** Naira charged for the gas itself (delivery is extra). */
  gasCost: number;
  /** Set when the quote is not orderable. */
  error: string | null;
}

/** By weight: kg to 0.1, charged at the vendor's price per kg. */
export function quoteByKg(input: string, pricePerKg: number): LooseQuote {
  const raw = Number(input.replace(',', '.'));
  if (!input.trim() || !Number.isFinite(raw) || raw <= 0) return { kg: 0, gasCost: 0, error: null };
  const kg = Math.round(raw * 10) / 10;
  return { kg, gasCost: Math.round(pricePerKg * kg), error: limitError(kg) };
}

/** By money: the customer pays exactly this for gas; kg is what it buys, rounded down to 0.01. */
export function quoteByAmount(input: string, pricePerKg: number): LooseQuote {
  const gasCost = Math.round(Number(input.replace(/[,\s]/g, '')));
  if (!input.trim() || !Number.isFinite(gasCost) || gasCost <= 0 || pricePerKg <= 0) {
    return { kg: 0, gasCost: 0, error: null };
  }
  const kg = Math.floor((gasCost / pricePerKg) * 100) / 100;
  return { kg, gasCost, error: limitError(kg) };
}

function limitError(kg: number): string | null {
  if (kg < MIN_LOOSE_KG) return `The minimum is ${MIN_LOOSE_KG} kg of gas.`;
  if (kg > MAX_LOOSE_KG) return `The most you can order at once is ${MAX_LOOSE_KG} kg.`;
  return null;
}
