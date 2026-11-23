'use client';

/**
 * Consumer home. Same tiles, same order and same data as the mobile home
 * (gas-monitor/app/(tabs)/index.tsx). Below `lg` it is the phone layout: two
 * columns, gauge tall on the left. From `lg` the same tiles spread over four.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, RotateCcw, Store, Trash2, Check } from 'lucide-react';
import {
  ApiRequestError,
  cylinderApi,
  monitorApi,
  ordersApi,
  type CylinderImageKey,
  type CylinderProfile,
  type Monitor,
  type MonitorHourPoint,
  type Order
} from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { estimateDays, fetchMarketplaceSummary, getStatus, type MarketplaceSummary } from '@/lib/home-data';
import { GaugeRing } from './GaugeRing';

const REMINDER_OPTS = ['12 hrs before', '1 day before', '2 days before', '3 days before'];

const SIZE_OPTIONS: { label: string; kg: number; key: CylinderImageKey }[] = [
  { label: '6 kg', kg: 6, key: '6kg' },
  { label: '12.5 kg', kg: 12.5, key: '12.5kg' },
  { label: '50 kg', kg: 50, key: '50kg' }
];

const CYLINDER_IMG: Record<CylinderImageKey, string> = {
  '6kg': '/images/cylinders/6kg.png',
  '12.5kg': '/images/cylinders/12-5kg.png',
  '50kg': '/images/cylinders/50kg.png'
};

const ORDER_STEPS: { status: Order['status']; label: string }[] = [
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { status: 'DELIVERED', label: 'Delivered' }
];

const errText = (e: unknown, fallback: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : fallback);

// ── Small pieces ──────────────────────────────────────────────────────────────

const TILE = 'flex flex-col gap-1 rounded-[20px] border border-border bg-card p-3.5 shadow-sm';
const LABEL = 'self-start text-[11px] font-bold tracking-wide text-muted-foreground';
const SUB = 'text-[11px] text-muted-foreground';
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function Pill({ label, color, children }: { label: string; color: string; children?: ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label}</span>
      {children}
    </span>
  );
}

function OrderSteps({ status }: { status: Order['status'] }) {
  const reached = ORDER_STEPS.findIndex((s) => s.status === status);
  return (
    <div>
      <div className="flex items-center">
        {ORDER_STEPS.map((s, i) => (
          <div key={s.status} className="flex flex-1 items-center last:flex-none">
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${i <= reached ? 'bg-primary' : 'bg-border'}`} />
            {i < ORDER_STEPS.length - 1 && <span className={`h-[3px] flex-1 ${i < reached ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {ORDER_STEPS.map((s) => (
          <span key={s.status}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

function UsageBars({ points }: { points: MonitorHourPoint[] }) {
  return (
    <div className="mt-1.5 flex h-[54px] items-end gap-0.5" role="img" aria-label="Gas level over the last 24 hours">
      {points.map((p, i) => (
        <span
          key={p.t}
          className={`flex-1 rounded-t-[3px] ${i === points.length - 1 ? 'bg-primary' : 'bg-primary/25'}`}
          style={{ height: Math.max(3, (Math.min(100, p.percent as number) / 100) * 54) }}
        />
      ))}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-5 pb-8 md:rounded-[28px]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
        <h3 className="mb-4 text-lg font-extrabold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

// ── Home ──────────────────────────────────────────────────────────────────────

export function HomeBento() {
  // Demo level: used until a monitor reports, and while "Simulate drain" runs
  const [gasLevel, setGasLevel] = useState(100);
  const [simulating, setSimulating] = useState(false);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reminder (local only, same as the app)
  const [selectedReminder, setSelectedReminder] = useState('1 day before');
  const [reminderSet, setReminderSet] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  // Live data. `undefined` means still loading.
  const [orders, setOrders] = useState<Order[]>([]);
  const [market, setMarket] = useState<MarketplaceSummary | null | undefined>(undefined);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [points, setPoints] = useState<MonitorHourPoint[]>([]);

  // Cylinder profiles
  const [profiles, setProfiles] = useState<CylinderProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState<CylinderImageKey | 'custom'>('12.5kg');
  const [customKg, setCustomKg] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (simRef.current) clearInterval(simRef.current);
    };
  }, []);

  const activeProfile = profiles.find((p) => p.isActive) ?? null;
  const monitor = monitors[0] ?? null;

  useEffect(() => {
    cylinderApi
      .list()
      .then((list) => alive.current && setProfiles(list))
      .catch(() => {})
      .finally(() => alive.current && setProfilesLoading(false));
  }, []);

  // Orders, marketplace and the monitor refresh on load and whenever the tab comes back into view.
  const refresh = useCallback(async () => {
    const [o, m, d] = await Promise.allSettled([ordersApi.list(), fetchMarketplaceSummary(), monitorApi.list()]);
    if (!alive.current) return;
    if (o.status === 'fulfilled') setOrders(o.value);
    setMarket(m.status === 'fulfilled' ? m.value : null);
    if (d.status === 'fulfilled') {
      setMonitors(d.value.devices);
      const first = d.value.devices[0];
      if (first) {
        const h = await monitorApi.hourly(first.id).catch(() => ({ points: [] as MonitorHourPoint[] }));
        if (alive.current) setPoints(h.points);
      } else {
        setPoints([]);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // ── Demo controls ───────────────────────────────────────────────────────────
  function stopDrain() {
    if (simRef.current) {
      clearInterval(simRef.current);
      simRef.current = null;
    }
    setSimulating(false);
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
  function resetLevel() {
    stopDrain();
    setGasLevel(100);
  }

  // ── Cylinder profiles ───────────────────────────────────────────────────────
  async function activateProfile(id: string) {
    try {
      const updated = await cylinderApi.activate(id);
      setProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === updated.id })));
    } catch {}
    setSheetOpen(false);
  }
  async function deleteProfile(id: string) {
    try {
      await cylinderApi.remove(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  }
  function resetAddForm() {
    setNewName('');
    setNewSize('12.5kg');
    setCustomKg('');
    setCustomLabel('');
    setFormError('');
  }
  async function submitNewProfile(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newName.trim()) return setFormError('Profile name is required.');

    let sizeKg: number;
    let imageKey: CylinderImageKey;
    let customSizeLabel: string | undefined;
    if (newSize === 'custom') {
      const parsed = parseFloat(customKg);
      if (!parsed || parsed <= 0) return setFormError('Enter a valid size in kg.');
      sizeKg = parsed;
      imageKey = '12.5kg';
      customSizeLabel = customLabel.trim() || `${parsed} kg`;
    } else {
      const opt = SIZE_OPTIONS.find((o) => o.key === newSize)!;
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
      setAddOpen(false);
      resetAddForm();
    } catch (err) {
      setFormError(errText(err, 'Failed to save profile.'));
    } finally {
      setSaving(false);
    }
  }

  // ── Derived values (same rules as the app) ──────────────────────────────────
  const liveLevel =
    monitor && !monitor.state.calibrating && monitor.state.percent != null ? Math.round(monitor.state.percent) : null;
  const isLive = liveLevel != null && !simulating;
  const level = isLive ? (liveLevel as number) : gasLevel;
  const maxKg = monitor?.cylinder?.sizeKg ?? activeProfile?.sizeKg ?? 12.5;
  const kgLeft = isLive && monitor?.state.netKg != null ? monitor.state.netKg : (level / 100) * maxKg;
  const status = getStatus(level);

  const days = isLive ? estimateDays(points, level) : Math.round((level / 100) * 30);
  const daysText = days == null ? '—' : isLive ? `~${days}` : String(days);
  const daysSub = isLive ? (days == null ? 'Not enough use yet' : 'at your recent use') : 'demo estimate';

  const activeOrder = useMemo(() => {
    const open = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY');
    return [...open].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  }, [orders]);

  const usagePoints = useMemo(() => points.filter((p) => p.percent != null), [points]);
  const usedPct =
    usagePoints.length >= 2
      ? Math.max(0, Math.round((usagePoints[0].percent as number) - (usagePoints[usagePoints.length - 1].percent as number)))
      : null;

  return (
    <section aria-label="Home" className="mx-auto max-w-lg space-y-3 lg:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-extrabold tracking-tight text-foreground">4F G-Monitor</h2>
          <p className="truncate text-xs text-muted-foreground">
            {monitor
              ? `${monitor.nickname ?? monitor.id} · ${monitor.state.online ? 'Online' : 'Offline'}`
              : 'No monitor connected yet'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Select cylinder profile"
          className={`flex max-w-[150px] items-center gap-1 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-bold text-primary ${FOCUS}`}
        >
          <span className="truncate">{activeProfile?.name ?? 'Select cylinder'}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-none" />
        </button>
      </div>

      {level <= 25 && (
        <Link
          href="/marketplace"
          className={`flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[13px] font-semibold text-destructive ${FOCUS}`}
        >
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-destructive text-[13px] font-extrabold text-white">
            !
          </span>
          <span className="flex-1">
            {level <= 10 ? 'Gas is almost out. Order a refill now.' : 'Gas is running low. Order a refill soon.'}
          </span>
          <ChevronRight className="h-4 w-4 flex-none" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {/* Gauge */}
        <div className={`${TILE} row-span-2 items-center gap-2 lg:col-span-2`}>
          <span className={LABEL}>Gas level</span>
          <GaugeRing percentage={level} maxKg={maxKg} kgLeft={kgLeft} />
          {isLive ? (
            <Pill label={`Live · ${status.label}`} color="var(--primary)" />
          ) : (
            <Link href="/dashboard/monitors" className={`max-w-full rounded-full ${FOCUS}`}>
              <Pill label={`Demo · ${status.label}`} color={status.color} />
            </Link>
          )}
        </div>

        {/* Days left */}
        <div className={TILE}>
          <span className={LABEL}>Days left</span>
          <p className={`font-mono text-[28px] font-extrabold leading-tight tracking-tight ${days === 0 ? 'text-destructive' : 'text-foreground'}`}>
            {daysText}
          </p>
          <span className={SUB}>{daysSub}</span>
        </div>

        {/* Best price */}
        <Link href="/marketplace" className={`${TILE} ${FOCUS}`}>
          <span className={LABEL}>Best price</span>
          <p className="font-mono text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
            {market?.best ? formatNaira(market.best.pricePerKg) : '—'}
          </p>
          <span className={`${SUB} truncate`}>
            {market === undefined
              ? 'Loading…'
              : market?.best
                ? `per kg · ${market.best.vendorName}`
                : market
                  ? 'No suppliers in stock'
                  : 'Could not load prices'}
          </span>
        </Link>

        {/* Marketplace */}
        <Link
          href="/marketplace"
          className={`${TILE} col-span-2 flex-row items-center gap-3 border-[#1A4730] bg-[#1A4730] text-white lg:col-span-2 ${FOCUS}`}
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/15">
            <Store className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold">Marketplace</span>
            <span className="block text-xs text-white/75">
              {market && market.supplierCount > 0
                ? `${market.supplierCount} supplier${market.supplierCount === 1 ? '' : 's'} with gas in stock`
                : 'Find a supplier and order gas'}
            </span>
          </span>
          <span className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-bold text-[#1A4730]">Browse</span>
        </Link>

        {/* Usage, only when a monitor has readings */}
        {usagePoints.length >= 2 && (
          <Link href="/dashboard/monitors" className={`${TILE} col-span-2 lg:col-span-2 ${FOCUS}`}>
            <div className="flex items-center justify-between">
              <span className={LABEL}>Last 24 hours</span>
              {usedPct != null && <span className={`${LABEL} font-mono`}>{usedPct}% used</span>}
            </div>
            <UsageBars points={usagePoints} />
          </Link>
        )}

        {/* Active order */}
        {activeOrder && (
          <Link href="/dashboard/orders" className={`${TILE} col-span-2 lg:col-span-2 ${FOCUS}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={LABEL}>Order in progress</span>
              <Pill label={activeOrder.status === 'OUT_FOR_DELIVERY' ? 'On the way' : 'Confirmed'} color="var(--primary)" />
            </div>
            <p className="mb-2 mt-0.5 truncate text-sm font-bold text-foreground">
              {activeOrder.supplierName ?? 'Your order'} · {activeOrder.cylinderSize}
              {activeOrder.quantity > 1 ? ` × ${activeOrder.quantity}` : ''}
            </p>
            <OrderSteps status={activeOrder.status} />
          </Link>
        )}

        {/* Cylinder */}
        <button type="button" onClick={() => setSheetOpen(true)} className={`${TILE} text-left ${FOCUS}`}>
          <span className={LABEL}>Cylinder</span>
          {activeProfile ? (
            <span className="mt-0.5 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CYLINDER_IMG[activeProfile.imageKey] ?? CYLINDER_IMG['12.5kg']} alt="" className="h-11 w-[34px] object-contain" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-extrabold text-foreground">{activeProfile.name}</span>
                <span className={SUB}>{activeProfile.customSizeLabel ?? `${activeProfile.sizeKg} kg`}</span>
              </span>
            </span>
          ) : (
            <span className={SUB}>Tap to add a cylinder profile</span>
          )}
        </button>

        {/* Reminder */}
        <button
          type="button"
          onClick={() => setReminderOpen(true)}
          className={`${TILE} border-transparent bg-[color-mix(in_srgb,#A9714C_16%,var(--card))] text-left ${FOCUS}`}
        >
          <span className={`${LABEL} !text-[#A9714C]`}>Reminder</span>
          <span className="text-[15px] font-extrabold text-foreground">{reminderSet ? 'On' : 'Not set'}</span>
          <span className={SUB}>{reminderSet ? selectedReminder : 'Tap to get a refill nudge'}</span>
        </button>

        {/* Demo controls */}
        <div className={`${TILE} col-span-2 gap-2.5 lg:col-span-2`}>
          <span className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground/70">DEMO CONTROLS</span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={simulating ? stopDrain : startDrain}
              className={`flex-1 rounded-[13px] py-3 text-sm font-bold text-white ${simulating ? 'bg-destructive' : 'bg-primary'} ${FOCUS}`}
            >
              {simulating ? '■  Stop' : '▶  Simulate drain'}
            </button>
            <button
              type="button"
              onClick={resetLevel}
              aria-label="Reset level"
              className={`flex h-12 w-12 items-center justify-center rounded-[13px] border border-border bg-primary/10 text-primary ${FOCUS}`}
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Reminder sheet */}
      {reminderOpen && (
        <Sheet title="Refill reminder" onClose={() => setReminderOpen(false)}>
          <p className="-mt-2 mb-3 text-[13px] text-muted-foreground">When should we remind you to refill?</p>
          <div className="grid grid-cols-2 gap-2">
            {REMINDER_OPTS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSelectedReminder(opt)}
                className={`rounded-xl border py-3 text-[13px] ${FOCUS} ${
                  selectedReminder === opt
                    ? 'border-primary/50 bg-primary/10 font-bold text-primary'
                    : 'border-border bg-muted/40 font-medium text-muted-foreground'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setReminderSet(true);
              setReminderOpen(false);
            }}
            className={`mt-5 w-full rounded-[14px] bg-primary py-3.5 text-base font-bold text-primary-foreground ${FOCUS}`}
          >
            {reminderSet ? 'Update reminder' : 'Turn on reminder'}
          </button>
          {reminderSet && (
            <button
              type="button"
              onClick={() => {
                setReminderSet(false);
                setReminderOpen(false);
              }}
              className="mt-3.5 block w-full text-center text-[13px] text-primary underline"
            >
              Turn off reminder
            </button>
          )}
        </Sheet>
      )}

      {/* Profile selector */}
      {sheetOpen && (
        <Sheet title="Cylinder Profiles" onClose={() => setSheetOpen(false)}>
          {profilesLoading ? (
            <div className="my-6 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : profiles.length === 0 ? (
            <p className="my-5 text-center text-sm text-muted-foreground">No cylinder profiles yet. Add one below.</p>
          ) : (
            <ul>
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => activateProfile(p.id)}
                    className={`flex flex-1 items-center gap-3 py-3.5 pl-1 text-left ${FOCUS}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={CYLINDER_IMG[p.imageKey] ?? CYLINDER_IMG['12.5kg']} alt="" className="h-9 w-9 object-contain" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-foreground">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.customSizeLabel ?? `${p.sizeKg} kg`}</span>
                    </span>
                    {p.isActive && <Check className="h-5 w-5 text-primary" aria-label="Active" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProfile(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className={`p-3 text-destructive ${FOCUS}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false);
              setAddOpen(true);
            }}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-primary/40 bg-primary/10 py-3.5 text-[15px] font-bold text-primary ${FOCUS}`}
          >
            <Plus className="h-4 w-4" />
            Add New Profile
          </button>
        </Sheet>
      )}

      {/* Add profile */}
      {addOpen && (
        <Sheet
          title="New Cylinder Profile"
          onClose={() => {
            setAddOpen(false);
            resetAddForm();
          }}
        >
          <form onSubmit={submitNewProfile} noValidate>
            <label htmlFor="cyl-name" className="mb-1.5 block text-[13px] font-bold text-foreground/80">
              Profile Name
            </label>
            <input
              id="cyl-name"
              className={INPUT}
              placeholder="e.g. Kitchen Cylinder"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
            />

            <p className="mb-1.5 mt-4 text-[13px] font-bold text-foreground/80">Cylinder Size</p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Cylinder size">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={newSize === opt.key}
                  onClick={() => setNewSize(opt.key)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs ${FOCUS} ${
                    newSize === opt.key ? 'border-primary/50 bg-primary/10 font-bold text-primary' : 'border-border bg-muted/40 font-semibold text-muted-foreground'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CYLINDER_IMG[opt.key]} alt="" className="h-7 w-7 object-contain" />
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={newSize === 'custom'}
                onClick={() => setNewSize('custom')}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs ${FOCUS} ${
                  newSize === 'custom' ? 'border-primary/50 bg-primary/10 font-bold text-primary' : 'border-border bg-muted/40 font-semibold text-muted-foreground'
                }`}
              >
                <span className="text-xl leading-7">✏️</span>
                Custom
              </button>
            </div>

            {newSize === 'custom' && (
              <div className="mt-3 space-y-2">
                <input
                  className={INPUT}
                  aria-label="Size in kg"
                  placeholder="Size in kg (e.g. 25)"
                  inputMode="decimal"
                  value={customKg}
                  onChange={(e) => setCustomKg(e.target.value)}
                />
                <input
                  className={INPUT}
                  aria-label="Label"
                  placeholder="Label (optional, e.g. 25 kg)"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  maxLength={30}
                />
              </div>
            )}

            {formError && (
              <p className="mt-2 text-[13px] text-destructive" role="alert">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className={`mt-5 w-full rounded-[14px] bg-primary py-3.5 text-base font-bold text-primary-foreground disabled:opacity-60 ${FOCUS}`}
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </Sheet>
      )}
    </section>
  );
}
