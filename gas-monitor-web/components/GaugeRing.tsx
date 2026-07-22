import { getBarColor } from '@/lib/gauge';

const GAUGE_TOTAL = 48;
const GAUGE_ARC = 300;
const GAUGE_START = 210;
const GAUGE_BAR_H = 18;
const GAUGE_BAR_W = 7;

export default function GaugeRing({ percentage, maxKg, size = 230 }: { percentage: number; maxKg: number; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percentage)));
  const midR = size / 2 - GAUGE_BAR_H / 2;
  const innerD = 2 * (midR - GAUGE_BAR_H / 2 - 6);
  const activeCount = Math.round((p / 100) * GAUGE_TOTAL);
  const currentColor = getBarColor(p / 100);

  return (
    <div className="device-gauge" style={{ width: size, height: size }} role="img" aria-label={`Gas level ${p} percent`}>
      {Array.from({ length: GAUGE_TOTAL }, (_, i) => {
        const t = i / (GAUGE_TOTAL - 1);
        const angleDeg = GAUGE_START + (i / GAUGE_TOTAL) * GAUGE_ARC;
        const isActive = i < activeCount;
        return (
          <span
            key={i}
            className="device-gauge-bar"
            style={{
              width: GAUGE_BAR_W,
              height: GAUGE_BAR_H,
              background: isActive ? getBarColor(t) : '#C2D9C2',
              top: (size - GAUGE_BAR_H) / 2,
              left: (size - GAUGE_BAR_W) / 2,
              transform: `rotate(${angleDeg}deg) translateY(${-midR}px)`
            }}
          />
        );
      })}
      <div
        className="device-gauge-disk"
        style={{ width: innerD, height: innerD, top: (size - innerD) / 2, left: (size - innerD) / 2 }}
      >
        <strong className="device-gauge-percent">{p}%</strong>
        <span className="device-gauge-label" style={{ color: currentColor }}>
          Gas Level
        </span>
        <span className="device-gauge-kg">{((p / 100) * maxKg).toFixed(1)} kg</span>
      </div>
    </div>
  );
}
