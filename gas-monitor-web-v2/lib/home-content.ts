/**
 * Content and helpers for the consumer home (components/dashboard/home/HomeBento). The mobile app
 * mirrors this in gas-monitor/lib/homeContent.ts: keep the two in step.
 */
import type { MonitorDayPoint } from './api';
import type { PublicListing } from './marketplace';

// ── Greeting ──────────────────────────────────────────────────────────────────
export function greetingFor(d: Date = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function dateLabel(d: Date = new Date()): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const firstNameOf = (name?: string | null): string => name?.trim().split(/\s+/)[0] ?? '';

// ── Weekly usage ──────────────────────────────────────────────────────────────
export interface DayBar {
  key: string;
  label: string;
  /** Gas used that day in kg; null when the monitor sent no readings that day. */
  kg: number | null;
  today: boolean;
}

const LAGOS_OFFSET_MS = 3_600_000; // Lagos is UTC+1 all year
const lagosDateKey = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

/** The last seven Lagos days, oldest first, with usage filled in where the monitor reported. */
export function weekBars(points: MonitorDayPoint[], now: number = Date.now()): DayBar[] {
  const byDay = new Map<string, MonitorDayPoint>();
  for (const p of points) byDay.set(lagosDateKey(Date.parse(p.day)), p);
  const bars: DayBar[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = lagosDateKey(now - i * 86_400_000);
    const p = byDay.get(key);
    bars.push({
      key,
      label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${key}T12:00:00Z`).getUTCDay()],
      kg: p && p.readings > 0 ? p.consumedKg : null,
      today: i === 0
    });
  }
  return bars;
}

/**
 * Days of gas left at the recent rate of use. Today is left out when earlier days exist, since a
 * part-day would make the rate look low. Null until there is any use to go on.
 */
export function daysLeft(kgLeft: number, bars: DayBar[]): number | null {
  const withData = bars.filter((b): b is DayBar & { kg: number } => b.kg != null);
  const past = withData.filter((b) => !b.today);
  const basis = past.length > 0 ? past : withData;
  if (basis.length === 0) return null;
  const avg = basis.reduce((sum, b) => sum + b.kg, 0) / basis.length;
  if (!(avg > 0.05)) return null;
  return Math.max(0, Math.round(kgLeft / avg));
}

// ── Circular cards ────────────────────────────────────────────────────────────
export type StoryId = 'deals' | 'safety' | 'tips' | 'rewards' | 'new';

export const SAFETY_TIPS: { title: string; body: string }[] = [
  { title: 'Smell gas?', body: 'Do not switch anything on or off and keep flames away. Open windows, close the cylinder valve if it is safe to reach, leave the room and call your supplier or the emergency services.' },
  { title: 'Check for leaks with soapy water', body: 'Brush soapy water on the hose and connections. Bubbles mean a leak. Never use a flame to look for one.' },
  { title: 'Look at the hose and regulator', body: 'Check them often for cracks, stiffness or wear, and replace them when they look worn.' },
  { title: 'Keep the cylinder upright and ventilated', body: 'Stand it on a flat surface, away from heat and direct sun, with air moving around it.' },
  { title: 'Close the valve when you are done', body: 'Turn the cylinder valve off after cooking, at night and before you leave the house.' },
  { title: 'Store spare cylinders outside living areas', body: 'Never keep them in bedrooms, basements or closed cupboards.' }
];

export const SAVING_TIPS: { title: string; body: string }[] = [
  { title: 'Cover your pots', body: 'A lid keeps the heat in, so food cooks faster and uses less gas.' },
  { title: 'Match the pot to the burner', body: 'A flame wider than the pot heats the air, not your food.' },
  { title: 'Turn it down once it boils', body: 'A gentle simmer cooks as well as a hard boil and uses much less gas.' },
  { title: 'Soak beans and thaw food first', body: 'Less time on the flame means less gas used.' },
  { title: 'Keep the burners clean', body: 'A clean burner gives a steady blue flame that heats efficiently.' }
];

const RECENT_MS = 30 * 86_400_000;

/** The cheapest suppliers with gas in stock. */
export function dealsOf(listings: PublicListing[]): PublicListing[] {
  return listings.filter((l) => l.inStock).sort((a, b) => a.pricePerKg - b.pricePerKg).slice(0, 3);
}

/** Listings added in the last 30 days, newest first. */
export function newestOf(listings: PublicListing[], now: number = Date.now()): PublicListing[] {
  return listings
    .filter((l) => l.inStock && l.createdAt && now - Date.parse(l.createdAt) <= RECENT_MS)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
}

/** Changes when a card has something new to show, which is what puts its ring back. */
export function storySignature(id: StoryId, listings: PublicListing[] | null): string {
  if (id === 'deals') return dealsOf(listings ?? []).map((l) => `${l.id}:${l.pricePerKg}`).join(',');
  if (id === 'new') return newestOf(listings ?? []).map((l) => l.id).join(',');
  return 'v1';
}

// ── Which cards have been opened ──────────────────────────────────────────────
const SEEN_KEY = '4fg_home_seen';

export function loadSeen(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveSeen(seen: Record<string, string>): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Not remembering is harmless: the rings just show again next time.
  }
}
