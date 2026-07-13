'use client';

import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import Image from 'next/image';
import { cylinderApi, CylinderProfile, CylinderImageKey, ApiRequestError } from '@/lib/api';
import { IconCheck, IconClose, IconBell } from '@/components/icons';

// ── Linked-device persistence ─────────────────────────────────────────────────

interface LinkedDevice {
  deviceId: string;
  name: string;
  firmware: string;
  linkedAt: string;
}

interface DeviceSettings {
  autoSync: boolean;
  lowAlerts: boolean;
  criticalAlerts: boolean;
}

const DEVICE_KEY = '4fg_device';
const DEVICE_SETTINGS_KEY = '4fg_device_settings';
const DEFAULT_SETTINGS: DeviceSettings = { autoSync: true, lowAlerts: true, criticalAlerts: true };

function loadDevice(): LinkedDevice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as LinkedDevice) : null;
  } catch {
    return null;
  }
}

function loadSettings(): DeviceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DEVICE_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DeviceSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── Gauge color helpers (same math as the mobile app) ─────────────────────────

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

function getBarColor(t: number): string {
  for (let i = 0; i < BAR_STOPS.length - 1; i++) {
    const [t1, c1] = BAR_STOPS[i];
    const [t2, c2] = BAR_STOPS[i + 1];
    if (t <= t2) return lerpHex(c1, c2, Math.max(0, Math.min(1, (t - t1) / (t2 - t1))));
  }
  return BAR_STOPS[BAR_STOPS.length - 1][1];
}

function getStatus(pct: number) {
  if (pct <= 10) return { label: 'Critical — Refill Now', color: '#FF3B30' };
  if (pct <= 25) return { label: 'Low — Order Soon', color: '#FF9500' };
  if (pct <= 60) return { label: 'Moderate Level', color: '#CC9A00' };
  return { label: 'Good Level', color: '#34C759' };
}

// ── Segmented arc gauge (48 bars over a 300° arc) ─────────────────────────────

const GAUGE_TOTAL = 48;
const GAUGE_ARC = 300;
const GAUGE_START = 210;
const GAUGE_BAR_H = 18;
const GAUGE_BAR_W = 7;

function GaugeRing({ percentage, maxKg, size = 230 }: { percentage: number; maxKg: number; size?: number }) {
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

// ── Cylinder images / size options ────────────────────────────────────────────

const CYLINDER_IMAGES: Record<CylinderImageKey, string> = {
  '6kg': '/images/cylinders/6kg.png',
  '12.5kg': '/images/cylinders/12-5kg.png',
  '50kg': '/images/cylinders/50kg.png'
};

const SIZE_OPTIONS: { label: string; kg: number; key: CylinderImageKey }[] = [
  { label: '6 kg', kg: 6, key: '6kg' },
  { label: '12.5 kg', kg: 12.5, key: '12.5kg' },
  { label: '50 kg', kg: 50, key: '50kg' }
];

// ── Pairing wizard ────────────────────────────────────────────────────────────

const DISCOVERED_DEVICES = [
  { deviceId: 'FG-2024-0047', name: '4FG Sensor v2', firmware: 'v3.1.4', signal: '-62 dBm' },
  { deviceId: 'FG-2024-0112', name: '4FG Sensor v2', firmware: 'v3.1.4', signal: '-78 dBm' }
];

const LINK_STAGES = [
  'Establishing secure connection…',
  'Verifying device identity…',
  'Registering device to your account…',
  'Syncing sensor calibration…',
  'Finalizing link…'
];

function isValidDeviceId(value: string) {
  return /^FG-\d{4}-\d{4}$/i.test(value.trim());
}

function PairingWizard({ onLinked }: { onLinked: (device: LinkedDevice) => void }) {
  const [step, setStep] = useState<'find' | 'linking' | 'done'>('find');
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualError, setManualError] = useState('');
  const [selected, setSelected] = useState<{ deviceId: string; name: string; firmware: string } | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  function startScan() {
    setScanning(true);
    setScanDone(false);
    timersRef.current.push(
      setTimeout(() => {
        setScanning(false);
        setScanDone(true);
      }, 2200)
    );
  }

  function beginLink(device: { deviceId: string; name: string; firmware: string }) {
    setSelected(device);
    setStep('linking');
    setStageIndex(0);
    LINK_STAGES.forEach((_, i) => {
      timersRef.current.push(setTimeout(() => setStageIndex(i), i * 900));
    });
    timersRef.current.push(
      setTimeout(() => {
        setStep('done');
      }, LINK_STAGES.length * 900 + 400)
    );
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    const id = manualId.trim().toUpperCase();
    if (!isValidDeviceId(id)) {
      setManualError('Enter a valid device ID in the format FG-2024-0047 (printed under your sensor).');
      return;
    }
    setManualError('');
    beginLink({ deviceId: id, name: '4FG Sensor v2', firmware: 'v3.1.4' });
  }

  function finish() {
    if (!selected) return;
    onLinked({ ...selected, linkedAt: new Date().toISOString() });
  }

  return (
    <section className="card device-pairing-card">
      <div className="device-pairing-head">
        <span className="device-pairing-badge">4FG</span>
        <div>
          <h2>Link your 4FG sensor</h2>
          <p className="hero-card-sub">
            Pair the smart sensor attached to your cylinder to see live gas levels, usage insights and refill alerts —
            right here on the web.
          </p>
        </div>
      </div>

      <ol className="device-steps" aria-hidden="true">
        <li className={step === 'find' ? 'is-active' : 'is-done'}>Find device</li>
        <li className={step === 'linking' ? 'is-active' : step === 'done' ? 'is-done' : ''}>Link &amp; pair</li>
        <li className={step === 'done' ? 'is-active' : ''}>Ready</li>
      </ol>

      {step === 'find' && (
        <>
          <div className="device-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'scan'}
              className={mode === 'scan' ? 'is-active' : ''}
              onClick={() => setMode('scan')}
            >
              Scan for devices
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'manual'}
              className={mode === 'manual' ? 'is-active' : ''}
              onClick={() => setMode('manual')}
            >
              Enter device ID
            </button>
          </div>

          {mode === 'scan' && (
            <div className="device-scan-area">
              {!scanning && !scanDone && (
                <>
                  <p className="hero-card-sub">
                    Make sure your sensor is powered on and within range, then start scanning.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={startScan}>
                    Scan for nearby devices
                  </button>
                </>
              )}
              {scanning && (
                <div className="device-scan-pulse">
                  <span className="device-scan-ring" />
                  <span className="device-scan-ring device-scan-ring-2" />
                  <span className="device-scan-dot">4FG</span>
                  <p className="hero-card-sub">Scanning for nearby 4FG sensors…</p>
                </div>
              )}
              {scanDone && (
                <ul className="device-found-list">
                  {DISCOVERED_DEVICES.map((d) => (
                    <li key={d.deviceId}>
                      <div>
                        <strong>{d.name}</strong>
                        <span className="hero-card-sub">
                          {d.deviceId} · Signal {d.signal}
                        </span>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => beginLink(d)}>
                        Link
                      </button>
                    </li>
                  ))}
                  <li className="device-found-rescan">
                    <button type="button" className="link-underline" onClick={startScan}>
                      Scan again
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <form onSubmit={handleManualSubmit} noValidate className="device-manual-form">
              <div className="field">
                <label htmlFor="deviceId">Device ID</label>
                <input
                  id="deviceId"
                  placeholder="FG-2024-0047"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <p className="hero-card-sub">You&apos;ll find the ID printed on the base of your 4FG sensor.</p>
              {manualError && (
                <p className="form-error" role="alert">
                  {manualError}
                </p>
              )}
              <button type="submit" className="btn btn-primary">
                Link device
              </button>
            </form>
          )}
        </>
      )}

      {step === 'linking' && selected && (
        <div className="device-linking">
          <div className="device-scan-pulse">
            <span className="device-scan-ring" />
            <span className="device-scan-dot">4FG</span>
          </div>
          <strong>{selected.deviceId}</strong>
          <ul className="device-link-stages">
            {LINK_STAGES.map((stage, i) => (
              <li key={stage} className={i < stageIndex ? 'is-done' : i === stageIndex ? 'is-active' : ''}>
                {i < stageIndex ? <IconCheck className="device-stage-icon" /> : <span className="device-stage-dot" />}
                {stage}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'done' && selected && (
        <div className="device-link-done">
          <span className="device-link-done-icon">
            <IconCheck />
          </span>
          <h3>Device linked!</h3>
          <p className="hero-card-sub">
            <strong>{selected.name}</strong> ({selected.deviceId}) is now paired to your account. Set up a cylinder
            profile next so readings map to the right cylinder size.
          </p>
          <button type="button" className="btn btn-primary" onClick={finish}>
            Go to my device
          </button>
        </div>
      )}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DevicePage() {
  const [hydrated, setHydrated] = useState(false);
  const [device, setDevice] = useState<LinkedDevice | null>(null);
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_SETTINGS);

  // Gas level simulation (mirrors the mobile app until live sensor data is wired up)
  const [gasLevel, setGasLevel] = useState(100);
  const [simulating, setSimulating] = useState(false);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cylinder profiles
  const [profiles, setProfiles] = useState<CylinderProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-profile form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSizeOption, setNewSizeOption] = useState<CylinderImageKey | 'custom'>('12.5kg');
  const [customKg, setCustomKg] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setDevice(loadDevice());
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    cylinderApi
      .list()
      .then(setProfiles)
      .catch((err) => setProfileError(err instanceof ApiRequestError ? err.message : 'Could not load cylinder profiles.'))
      .finally(() => setProfilesLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (simRef.current) clearInterval(simRef.current);
    };
  }, []);

  const activeProfile = profiles.find((p) => p.isActive) ?? null;
  const maxKg = activeProfile?.sizeKg ?? 12.5;
  const status = getStatus(gasLevel);
  const daysLeft = Math.round((gasLevel / 100) * 30);
  const kgLeft = ((gasLevel / 100) * maxKg).toFixed(1);

  const readings = useMemo(
    () => [
      { label: 'Weight Sensor', value: `${kgLeft} kg`, note: 'Calibrated', color: 'var(--accent)' },
      { label: 'Temperature', value: '24°C', note: 'Normal', color: '#2d7450' },
      {
        label: 'Pressure',
        value: gasLevel === 0 ? '0 bar' : `${((gasLevel / 100) * 6.8).toFixed(1)} bar`,
        note: gasLevel === 0 ? 'Empty' : gasLevel <= 25 ? 'Low' : 'Normal',
        color: gasLevel === 0 ? '#d32f2f' : gasLevel <= 25 ? '#e65100' : '#2d7450'
      },
      { label: 'Firmware', value: device?.firmware ?? 'v3.1.4', note: 'Up to date', color: '#1565c0' }
    ],
    [gasLevel, kgLeft, device]
  );

  function persistDevice(next: LinkedDevice | null) {
    setDevice(next);
    if (next) window.localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(DEVICE_KEY);
  }

  function updateSetting<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    window.localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(next));
  }

  function unlinkDevice() {
    if (!window.confirm('Unlink this device? You can pair it again anytime.')) return;
    stopDrain();
    setGasLevel(100);
    persistDevice(null);
  }

  function startDrain() {
    if (simulating) return;
    setGasLevel(100);
    setSimulating(true);
    let current = 100;
    simRef.current = setInterval(() => {
      current -= 1;
      setGasLevel(current);
      if (current <= 0) {
        if (simRef.current) clearInterval(simRef.current);
        simRef.current = null;
        setSimulating(false);
      }
    }, 240);
  }

  function stopDrain() {
    if (simRef.current) {
      clearInterval(simRef.current);
      simRef.current = null;
    }
    setSimulating(false);
  }

  function resetLevel() {
    stopDrain();
    setGasLevel(100);
  }

  async function activateProfile(id: string) {
    setBusyId(id);
    try {
      const updated = await cylinderApi.activate(id);
      setProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === updated.id })));
    } catch {
      // leave state unchanged on failure
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProfile(id: string) {
    setBusyId(id);
    try {
      await cylinderApi.remove(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function submitNewProfile(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newName.trim()) {
      setFormError('Profile name is required.');
      return;
    }

    let sizeKg: number;
    let imageKey: CylinderImageKey;
    let customSizeLabel: string | undefined;

    if (newSizeOption === 'custom') {
      const parsed = parseFloat(customKg);
      if (!parsed || parsed <= 0) {
        setFormError('Enter a valid size in kg.');
        return;
      }
      sizeKg = parsed;
      imageKey = '12.5kg';
      customSizeLabel = customLabel.trim() || `${parsed} kg`;
    } else {
      const opt = SIZE_OPTIONS.find((o) => o.key === newSizeOption)!;
      sizeKg = opt.kg;
      imageKey = opt.key;
    }

    setSaving(true);
    try {
      const created = await cylinderApi.create({
        name: newName.trim(),
        sizeKg,
        imageKey,
        ...(customSizeLabel ? { customSizeLabel } : {})
      });
      setProfiles((prev) => [...prev, created]);
      if (profiles.length === 0) {
        // First profile becomes active automatically for a smoother setup
        await activateProfile(created.id);
      }
      setShowAddForm(false);
      setNewName('');
      setNewSizeOption('12.5kg');
      setCustomKg('');
      setCustomLabel('');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return <p className="hero-card-sub">Loading device…</p>;
  }

  if (!device) {
    return <PairingWizard onLinked={persistDevice} />;
  }

  return (
    <>
      {/* Device hero */}
      <section className="card device-hero-card">
        <div className="device-hero-main">
          <span className="device-hero-icon">4FG</span>
          <div>
            <h2>{device.name}</h2>
            <p className="hero-card-sub">ID: {device.deviceId}</p>
            <span className="device-conn">
              <span className="device-conn-dot" /> Connected
            </span>
          </div>
        </div>
        <div className="device-hero-actions">
          <span className="hero-card-sub">Linked {new Date(device.linkedAt).toLocaleDateString()}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={unlinkDevice}>
            <IconClose className="device-btn-icon" /> Unlink device
          </button>
        </div>
      </section>

      <section className="dashboard-grid device-grid">
        {/* Gauge card */}
        <div className="card device-gauge-card">
          <div className="dashboard-card-head">
            <h2>Live gas level</h2>
            <span className="device-live-chip">
              <span className="device-live-dot" /> LIVE
            </span>
          </div>
          <div className="device-gauge-wrap">
            <GaugeRing percentage={gasLevel} maxKg={maxKg} />
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
          <div className="device-demo-row">
            <button
              type="button"
              className={`btn btn-sm ${simulating ? 'btn-danger-soft' : 'btn-secondary'}`}
              onClick={simulating ? stopDrain : startDrain}
            >
              {simulating ? '■ Stop' : '▶ Simulate drain'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetLevel}>
              Reset
            </button>
          </div>
        </div>

        <div className="device-side-col">
          {/* Cylinder profiles */}
          <div className="card">
            <div className="dashboard-card-head">
              <h2>Cylinder profiles</h2>
              <button type="button" className="link-underline" onClick={() => setShowAddForm((v) => !v)}>
                {showAddForm ? 'Close' : '+ Add profile'}
              </button>
            </div>

            {activeProfile && (
              <div className="device-active-profile">
                <Image
                  src={CYLINDER_IMAGES[activeProfile.imageKey] ?? CYLINDER_IMAGES['12.5kg']}
                  alt=""
                  width={64}
                  height={86}
                  className="device-cylinder-img"
                />
                <div className="device-active-profile-info">
                  <span className="device-profile-label">ACTIVE PROFILE</span>
                  <strong>{activeProfile.name}</strong>
                  <span className="device-size-badge">{activeProfile.customSizeLabel ?? `${activeProfile.sizeKg} kg`}</span>
                  <div className="device-level-track">
                    <div
                      className="device-level-fill"
                      style={{ width: `${gasLevel}%`, background: getBarColor(gasLevel / 100) }}
                    />
                  </div>
                  <span className="device-level-note" style={{ color: getBarColor(gasLevel / 100) }}>
                    {gasLevel}% · {kgLeft} kg left
                  </span>
                </div>
              </div>
            )}

            {profileError && (
              <p className="form-error" role="alert">
                {profileError}
              </p>
            )}
            {profilesLoading && <p className="hero-card-sub">Loading profiles…</p>}
            {!profilesLoading && profiles.length === 0 && !showAddForm && (
              <p className="hero-card-sub">No cylinder profiles yet — add one so readings map to your cylinder size.</p>
            )}

            {profiles.length > 0 && (
              <ul className="device-profile-list">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="device-profile-row"
                      onClick={() => activateProfile(p.id)}
                      disabled={busyId === p.id}
                    >
                      <Image
                        src={CYLINDER_IMAGES[p.imageKey] ?? CYLINDER_IMAGES['12.5kg']}
                        alt=""
                        width={30}
                        height={40}
                        className="device-cylinder-img"
                      />
                      <span className="device-profile-row-info">
                        <strong>{p.name}</strong>
                        <span>{p.customSizeLabel ?? `${p.sizeKg} kg`}</span>
                      </span>
                      {p.isActive && <IconCheck className="device-profile-check" />}
                    </button>
                    <button
                      type="button"
                      className="device-profile-delete"
                      aria-label={`Delete ${p.name}`}
                      disabled={busyId === p.id}
                      onClick={() => deleteProfile(p.id)}
                    >
                      <IconClose />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showAddForm && (
              <form onSubmit={submitNewProfile} noValidate className="device-add-form">
                <div className="field">
                  <label htmlFor="profileName">Profile name</label>
                  <input
                    id="profileName"
                    placeholder="e.g. Kitchen Cylinder"
                    maxLength={50}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <span className="device-profile-label">CYLINDER SIZE</span>
                <div className="device-size-grid">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`device-size-opt${newSizeOption === opt.key ? ' is-active' : ''}`}
                      onClick={() => setNewSizeOption(opt.key)}
                    >
                      <Image src={CYLINDER_IMAGES[opt.key]} alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`device-size-opt${newSizeOption === 'custom' ? ' is-active' : ''}`}
                    onClick={() => setNewSizeOption('custom')}
                  >
                    <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>✏️</span>
                    <span>Custom</span>
                  </button>
                </div>
                {newSizeOption === 'custom' && (
                  <div className="device-custom-fields">
                    <input
                      placeholder="Size in kg (e.g. 25)"
                      inputMode="decimal"
                      value={customKg}
                      onChange={(e) => setCustomKg(e.target.value)}
                    />
                    <input
                      placeholder="Label (optional, e.g. 25 kg)"
                      maxLength={30}
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                    />
                  </div>
                )}
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            )}
          </div>

          {/* Sensor readings */}
          <div className="card">
            <div className="dashboard-card-head">
              <h2>Sensor readings</h2>
              <span className="device-live-chip">
                <span className="device-live-dot" /> LIVE
              </span>
            </div>
            <ul className="device-reading-list">
              <li>
                <span>Signal</span>
                <span>
                  <em style={{ color: '#2d7450' }}>Strong</em> –62 dBm
                </span>
              </li>
              <li>
                <span>Battery</span>
                <span>
                  <em style={{ color: '#1565c0' }}>~14 days left</em> 84%
                </span>
              </li>
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

          {/* Device settings */}
          <div className="card">
            <h2>Device settings</h2>
            <div className="settings-row">
              <div>
                <strong>Auto-sync</strong>
                <p className="hero-card-sub">Sync readings every 5 minutes.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoSync}
                  onChange={(e) => updateSetting('autoSync', e.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="sr-only">Auto-sync</span>
              </label>
            </div>
            <div className="settings-row">
              <div>
                <strong>Low gas alerts</strong>
                <p className="hero-card-sub">Notify when the level drops below 25%.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.lowAlerts}
                  onChange={(e) => updateSetting('lowAlerts', e.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="sr-only">Low gas alerts</span>
              </label>
            </div>
            <div className="settings-row">
              <div>
                <strong>Critical alerts</strong>
                <p className="hero-card-sub">Notify when the level drops below 10%.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.criticalAlerts}
                  onChange={(e) => updateSetting('criticalAlerts', e.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="sr-only">Critical alerts</span>
              </label>
            </div>
            {(settings.lowAlerts || settings.criticalAlerts) && (
              <p className="device-alert-note">
                <IconBell className="device-btn-icon" /> Alerts are delivered per your notification preferences in
                Settings.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
