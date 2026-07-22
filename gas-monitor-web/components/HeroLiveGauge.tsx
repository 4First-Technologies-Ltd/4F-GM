'use client';

import { useEffect, useState } from 'react';
import GaugeRing from '@/components/GaugeRing';
import { getStatus } from '@/lib/gauge';

const MAX_KG = 12.5;
const DRAIN_STEP = 4;
const DRAIN_INTERVAL_MS = 5000;

export default function HeroLiveGauge() {
  const [gasLevel, setGasLevel] = useState(100);

  useEffect(() => {
    const id = setInterval(() => {
      setGasLevel((prev) => (prev <= DRAIN_STEP ? 100 : prev - DRAIN_STEP));
    }, DRAIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const status = getStatus(gasLevel);
  const daysLeft = Math.round((gasLevel / 100) * 30);
  const kgLeft = ((gasLevel / 100) * MAX_KG).toFixed(1);
  const pressure = gasLevel === 0 ? '0 bar' : `${((gasLevel / 100) * 6.8).toFixed(1)} bar`;

  const readings = [
    { label: 'Signal', note: 'Strong', value: '−62 dBm', color: '#2d7450' },
    { label: 'Battery', note: '~14 days left', value: '84%', color: '#1565c0' },
    { label: 'Weight Sensor', note: 'Calibrated', value: `${kgLeft} kg`, color: 'var(--accent)' },
    { label: 'Temperature', note: 'Normal', value: '24°C', color: '#2d7450' },
    {
      label: 'Pressure',
      note: gasLevel === 0 ? 'Empty' : gasLevel <= 25 ? 'Low' : 'Normal',
      value: pressure,
      color: gasLevel === 0 ? '#d32f2f' : gasLevel <= 25 ? '#e65100' : '#2d7450'
    }
  ];

  return (
    <div className="hero-gauge-mirror">
      <div className="hero-gauge-col">
        <div className="dashboard-card-head">
          <h4>Live gas level</h4>
          <span className="device-live-chip">
            <span className="device-live-dot" /> LIVE
          </span>
        </div>

        <div className="device-gauge-wrap hero-gauge-wrap">
          <GaugeRing percentage={gasLevel} maxKg={MAX_KG} size={168} />
        </div>

        <div className="device-status-badge" style={{ background: `${status.color}18`, borderColor: `${status.color}55` }}>
          <span className="device-status-dot" style={{ background: status.color }} />
          <span style={{ color: status.color }}>{status.label}</span>
        </div>

        <div className="device-stats-row">
          <div className="device-stat">
            <strong style={daysLeft === 0 ? { color: '#d32f2f' } : undefined}>{daysLeft}</strong>
            <span>DAYS LEFT</span>
          </div>
          <div className="device-stat-divider" />
          <div className="device-stat">
            <strong>{kgLeft}</strong>
            <span>KG LEFT</span>
          </div>
          <div className="device-stat-divider" />
          <div className="device-stat">
            <strong style={{ color: 'var(--accent)' }}>1.8</strong>
            <span>KG/DAY</span>
          </div>
        </div>
      </div>

      <div className="hero-readings-col">
        <div className="dashboard-card-head">
          <h4>Sensor readings</h4>
          <span className="device-live-chip">
            <span className="device-live-dot" /> LIVE
          </span>
        </div>

        <ul className="device-reading-list hero-reading-list">
          {readings.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <span>
                <em style={{ color: r.color }}>{r.note}</em> {r.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
