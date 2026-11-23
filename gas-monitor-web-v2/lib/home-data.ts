/**
 * Data and maths for the consumer home (components/dashboard/home/HomeBento). Mirrors the mobile
 * home (gas-monitor/app/(tabs)/index.tsx) so both clients say the same thing about the same account.
 */
import { API_BASE_URL } from './api';
import type { PublicListing } from './marketplace';

/** The public marketplace feed, or null when it can't be reached. */
export async function fetchPublicListings(): Promise<PublicListing[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/marketplace/listings`);
    if (!res.ok) return null;
    return ((await res.json()) as { listings: PublicListing[] }).listings;
  } catch {
    return null;
  }
}

export function getStatus(pct: number): { label: string; color: string } {
  if (pct <= 10) return { label: 'Critical', color: '#FF3B30' };
  if (pct <= 25) return { label: 'Low', color: '#FF9500' };
  if (pct <= 60) return { label: 'Moderate', color: '#CC9A00' };
  return { label: 'Good', color: '#34C759' };
}

const BAR_STOPS: [number, string][] = [
  [0, '#FF3B30'],
  [0.25, '#FF9500'],
  [0.5, '#FFCC00'],
  [0.75, '#4CD964'],
  [1, '#34C759']
];

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const v = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${v(r1, r2)}${v(g1, g2)}${v(b1, b2)}`;
}

/** Red to green along the gauge; `t` is 0 to 1. */
export function getBarColor(t: number): string {
  for (let i = 0; i < BAR_STOPS.length - 1; i++) {
    const [t1, c1] = BAR_STOPS[i];
    const [t2, c2] = BAR_STOPS[i + 1];
    if (t <= t2) return lerpHex(c1, c2, Math.max(0, Math.min(1, (t - t1) / (t2 - t1))));
  }
  return BAR_STOPS[BAR_STOPS.length - 1][1];
}
