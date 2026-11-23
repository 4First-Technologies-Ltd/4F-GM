import { getBarColor } from '@/lib/home-data';

const SIZE = 210;
const TOTAL = 48;
const ARC = 300;
const START = 210;
const BAR_H = 18;
const BAR_W = 7;

/**
 * The segmented arc gauge from the mobile app, drawn as SVG so it scales to its tile.
 * `percentage` is null when there is no reading: the ring is empty and says so.
 */
export function GaugeRing({ percentage, maxKg, kgLeft }: { percentage: number | null; maxKg: number; kgLeft?: number | null }) {
  const empty = percentage == null;
  const p = empty ? 0 : Math.max(0, Math.min(100, percentage));
  const midR = SIZE / 2 - BAR_H / 2;
  const innerR = midR - BAR_H / 2 - 4;
  const active = Math.round((p / 100) * TOTAL);
  const kg = kgLeft ?? (p / 100) * maxKg;
  const c = SIZE / 2;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full max-w-[240px]"
      role="img"
      aria-label={empty ? 'Gas level: no reading' : `Gas level ${Math.round(p)} percent, ${kg.toFixed(1)} kilograms left`}
    >
      {Array.from({ length: TOTAL }, (_, i) => {
        const angle = START + (i / TOTAL) * ARC;
        const on = i < active;
        return (
          <g key={i} transform={`translate(${c} ${c}) rotate(${angle}) translate(0 ${-midR})`}>
            <rect
              x={-BAR_W / 2}
              y={-BAR_H / 2}
              width={BAR_W}
              height={BAR_H}
              rx={2}
              className={on ? undefined : 'fill-border'}
              fill={on ? getBarColor(i / (TOTAL - 1)) : undefined}
            />
          </g>
        );
      })}
      <circle cx={c} cy={c} r={innerR} className="fill-card" />
      <text
        x={c}
        y={c - 1}
        textAnchor="middle"
        fontSize={46}
        fontWeight={800}
        letterSpacing={-2}
        className={`${empty ? 'fill-muted-foreground/50' : 'fill-foreground'} font-mono`}
      >
        {empty ? '—' : `${Math.round(p)}%`}
      </text>
      <text
        x={c}
        y={c + 18}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        className={empty ? 'fill-muted-foreground' : undefined}
        fill={empty ? undefined : getBarColor(p / 100)}
      >
        Gas level
      </text>
      {!empty && (
        <text x={c} y={c + 36} textAnchor="middle" fontSize={13} className="fill-muted-foreground font-mono">
          {kg.toFixed(1)} kg
        </text>
      )}
    </svg>
  );
}
