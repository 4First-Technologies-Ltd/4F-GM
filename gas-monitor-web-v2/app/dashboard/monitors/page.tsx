'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, cylinderApi, monitorApi, type Monitor, type MonitorHourPoint } from '@/lib/api';

const SIZES = [6, 12.5, 25, 50];

/** The customer's profile for this size, creating one the first time. */
async function cylinderIdFor(sizeKg: number): Promise<string> {
  const existing = (await cylinderApi.list()).find((c) => c.sizeKg === sizeKg);
  if (existing) return existing.id;
  const made = await cylinderApi.create({ name: `${sizeKg} kg`, sizeKg, imageKey: sizeKg <= 9 ? '6kg' : sizeKg <= 30 ? '12.5kg' : '50kg' });
  return made.id;
}

const errText =(e: unknown, fallback: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : fallback);

function ago(sec: number | null): string {
  if (sec == null) return 'never';
  if (sec < 90) return 'just now';
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} days ago`;
}

/** What the gauge says. `null` is never shown as 0: see docs/DEVICE_API.md. */
function levelText(m: Monitor): { big: string; small: string } {
  const s = m.state;
  if (s.calibrating) return { big: 'Calibrating', small: s.grossKg != null ? `${s.grossKg.toFixed(1)} kg on the platform` : 'Waiting for a reading' };
  if (s.percent == null) return { big: 'No cylinder', small: 'Nothing is on the platform right now' };
  return { big: `${Math.round(s.percent)}%`, small: s.netKg != null ? `${s.netKg.toFixed(1)} kg of gas left` : '' };
}

function Chart({ points }: { points: MonitorHourPoint[] }) {
  const pts = points.filter((p) => p.percent != null);
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">Not enough readings yet for a chart.</p>;
  const t0 = new Date(pts[0].t).getTime();
  const span = Math.max(1, new Date(pts[pts.length - 1].t).getTime() - t0);
  const path = pts
    .map((p, i) => `${i ? 'L' : 'M'}${(((new Date(p.t).getTime() - t0) / span) * 300).toFixed(1)},${(60 - (Math.min(100, p.percent!) / 100) * 56 - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 300 60" className="h-24 w-full" role="img" aria-label="Gas level over the last 24 hours">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
    </svg>
  );
}

function Detail({ initial, onChanged }: { initial: Monitor; onChanged: () => void }) {
  const [m, setM] = useState(initial);
  const [points, setPoints] = useState<MonitorHourPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [lowPercent, setLowPercent] = useState(String(initial.alerts.lowPercent));
  const [nickname, setNickname] = useState(initial.nickname ?? '');
  const owner = m.role === 'OWNER';
  const [size, setSize] = useState<number | null>(initial.cylinder?.sizeKg ?? null);
  const [tw, setTw] = useState(initial.emptyWeightKg != null ? String(initial.emptyWeightKg) : '');

  const reload = useCallback(async () => {
    const [d, h] = await Promise.all([monitorApi.get(initial.id), monitorApi.hourly(initial.id).catch(() => ({ points: [] }))]);
    setM(d.device);
    setPoints(h.points);
  }, [initial.id]);

  useEffect(() => {
    void reload().catch((e) => setNote(errText(e, 'Could not load this monitor.')));
  }, [reload]);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      // One key per tap: a retry returns the same command instead of sending a second.
      const key = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let { command } = await monitorApi.command(m.id, 'REPORT_NOW', key);
      for (let i = 0; i < 12 && (command.status === 'QUEUED' || command.status === 'SENT'); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        command = (await monitorApi.getCommand(m.id, command.id)).command;
      }
      if (command.status === 'ACKED') await reload();
      setNote(command.status === 'ACKED' ? 'Updated.' : command.status === 'FAILED' ? `The monitor could not do that${command.detail ? ` (${command.detail})` : ''}.` : 'The monitor did not respond. Try again in a moment.');
    } catch (e) {
      setNote(errText(e, 'Could not reach the monitor.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveCylinder(e: FormEvent) {
    e.preventDefault();
    const empty = Number(tw);
    if (size == null || !Number.isFinite(empty) || empty < 1 || empty > 100) {
      setNote('Choose the cylinder size and enter its empty weight (1 to 100 kg).');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const cylinderId = await cylinderIdFor(size);
      const { device } = await monitorApi.settings(m.id, { cylinderId, emptyWeightKg: empty });
      setM(device);
      setNote('Saved. The gauge will show the gas left on the next reading.');
      onChanged();
    } catch (err) {
      setNote(errText(err, 'Could not save the cylinder.'));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const pct = Number(lowPercent);
      const { device } = await monitorApi.settings(m.id, { nickname: nickname.trim() || null, lowPercent: pct });
      setM(device);
      setNote('Saved.');
      onChanged();
    } catch (err) {
      setNote(errText(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  const lvl = levelText(m);
  return (
    <div className="mt-4 space-y-5 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-foreground">{lvl.big}</p>
          <p className="text-sm text-muted-foreground">{lvl.small}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className={m.state.stale || !m.state.online ? 'font-medium text-destructive' : ''}>
            {m.state.online && !m.state.stale ? 'Online' : m.state.stale ? 'No recent readings' : 'Offline'} · updated {ago(m.state.readingAgeSec)}
          </p>
          <p>
            {m.state.batteryPct != null && !m.state.externalPower ? `Battery ${m.state.batteryPct}% · ` : m.state.externalPower ? 'On mains power · ' : ''}
            {m.state.tempC != null ? `${m.state.tempC.toFixed(0)}°C` : ''}
          </p>
        </div>
      </div>

      <Chart points={points} />

      <div className="flex flex-wrap items-center gap-3">
        {m.role !== 'VIEWER' && (
          <button onClick={refresh} disabled={busy || !m.state.online} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? 'Working…' : 'Refresh now'}
          </button>
        )}
        <Link href={`/dashboard/refill?deviceId=${encodeURIComponent(m.id)}`} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground">
          Order a refill
        </Link>
        {note && <span className="text-sm text-muted-foreground" aria-live="polite">{note}</span>}
      </div>

      {m.config.pending && <p className="text-xs text-muted-foreground">A settings change will apply when the monitor next checks in.</p>}

      {owner && (
        <form onSubmit={saveCylinder} className={`space-y-3 border-t border-border pt-5 ${m.state.calibrating || !m.cylinder ? 'rounded-xl bg-primary/5 p-4' : ''}`}>
          <p className="text-sm font-medium text-foreground">
            {m.state.calibrating || !m.cylinder ? 'Set up your cylinder to see how much gas is left' : 'Cylinder'}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cylinder size">
            {SIZES.map((kg) => (
              <button
                key={kg}
                type="button"
                onClick={() => setSize(kg)}
                aria-pressed={size === kg}
                className={`rounded-full border px-4 py-2 text-sm ${size === kg ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
              >
                {kg} kg
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Empty weight in kg (stamped on the collar, marked TW)</span>
            <input type="number" step="0.1" min={1} max={100} value={tw} onChange={(e) => setTw(e.target.value)} className="w-40 rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Save cylinder
          </button>
        </form>
      )}

      {owner && (
        <form onSubmit={save} className="grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Name</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Warn me at (% left)</span>
            <input type="number" min={1} max={90} value={lowPercent} onChange={(e) => setLowPercent(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">Save</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [claimId, setClaimId] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [claimNote, setClaimNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { devices } = await monitorApi.list();
      setMonitors(devices);
      setOpen((cur) => cur ?? devices[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError(errText(e, 'Could not load your monitors.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(e: FormEvent) {
    e.preventDefault();
    setClaimNote(null);
    try {
      const { device } = await monitorApi.claim(claimId.trim(), claimCode.trim());
      setClaimId('');
      setClaimCode('');
      setOpen(device.id);
      await load();
    } catch (err) {
      setClaimNote(err instanceof ApiRequestError && err.code === 'INVALID_CLAIM' ? 'That ID and code do not match an unclaimed monitor. Check the label on the device.' : errText(err, 'Could not add the monitor.'));
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">My monitors</h1>
      <p className="mb-5 text-sm text-muted-foreground">Live gas level from your 4G monitors.</p>

      {error && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}
      {!monitors && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {monitors && monitors.length > 0 && (
        <ul className="space-y-2">
          {monitors.map((m) => {
            const l = levelText(m);
            return (
              <li key={m.id}>
                <button onClick={() => setOpen(open === m.id ? null : m.id)} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left">
                  <span>
                    <span className="block font-medium text-foreground">{m.nickname ?? m.id}</span>
                    <span className="text-xs text-muted-foreground">{m.nickname ? `${m.id} · ` : ''}{m.state.online ? 'Online' : 'Offline'}</span>
                  </span>
                  <span className="font-mono text-lg font-semibold text-foreground">{l.big}</span>
                </button>
                {open === m.id && <Detail key={m.id} initial={m} onChanged={load} />}
              </li>
            );
          })}
        </ul>
      )}

      {monitors && monitors.length === 0 && <p className="mb-4 text-sm text-muted-foreground">No monitors yet. Add yours with the ID and code printed on the device.</p>}

      <form onSubmit={claim} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-6 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Device ID</span>
          <input value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="FG-2026-0001" required className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Claim code</span>
          <input value={claimCode} onChange={(e) => setClaimCode(e.target.value)} placeholder="ABCD-EFGH" required className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add monitor</button>
        </div>
        {claimNote && <p className="text-sm text-destructive sm:col-span-3" role="alert">{claimNote}</p>}
      </form>
    </div>
  );
}
