// Gauge color helpers (same math as the mobile app)

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const v = (a: number, b: number) =>
    Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${v(r1, r2)}${v(g1, g2)}${v(b1, b2)}`;
}

const BAR_STOPS: [number, string][] = [
  [0, '#FF3B30'],
  [0.25, '#FF9500'],
  [0.5, '#FFCC00'],
  [0.75, '#4CD964'],
  [1, '#34C759']
];

export function getBarColor(t: number): string {
  for (let i = 0; i < BAR_STOPS.length - 1; i++) {
    const [t1, c1] = BAR_STOPS[i];
    const [t2, c2] = BAR_STOPS[i + 1];
    if (t <= t2) return lerpHex(c1, c2, Math.max(0, Math.min(1, (t - t1) / (t2 - t1))));
  }
  return BAR_STOPS[BAR_STOPS.length - 1][1];
}

export function getStatus(pct: number) {
  if (pct <= 10) return { label: 'Critical — Refill Now', color: '#FF3B30' };
  if (pct <= 25) return { label: 'Low — Order Soon', color: '#FF9500' };
  if (pct <= 60) return { label: 'Moderate Level', color: '#CC9A00' };
  return { label: 'Good Level', color: '#34C759' };
}
