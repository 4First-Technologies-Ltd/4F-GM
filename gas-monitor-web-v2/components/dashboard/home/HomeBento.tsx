'use client';

/**
 * Consumer home. Same tiles, same order and same data as the mobile home
 * (gas-monitor/app/(tabs)/index.tsx). Below `lg` it is the phone layout: two
 * columns, gauge tall on the left. From `lg` the same tiles spread over four.
 *
 * Only what the monitor reports is shown. With no linked device the gauge says
 * "Device not synced yet"; with a device that has not reported, "No readings yet".
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Plus, Store, Trash2, Check } from 'lucide-react';
import {
  ApiRequestError,
  cylinderApi,
  monitorApi,
  ordersApi,
  type CylinderImageKey,
  type CylinderProfile,
  type Monitor,
  type MonitorDayPoint,
  type Order
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatNaira } from '@/lib/format';
import { fetchPublicListings, getStatus } from '@/lib/home-data';
import { dateLabel, daysLeft, firstNameOf, greetingFor, weekBars } from '@/lib/home-content';
import type { PublicListing } from '@/lib/marketplace';
import { GaugeRing } from './GaugeRing';
import { HomeStories } from './HomeStories';
import { Sheet } from './Sheet';

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

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label}</span>
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

const INPUT =
  'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

// ── Home ──────────────────────────────────────────────────────────────────────

export function HomeBento() {
  const { user } = useAuth();

  // Reminder (local only, same as the app)
  const [selectedReminder, setSelectedReminder] = useState('1 day before');
  const [reminderSet, setReminderSet] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  // Live data. `null` listings means still loading or unreachable.
  const [orders, setOrders] = useState<Order[]>([]);
  const [listings, setListings] = useState<PublicListing[] | null>(null);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [dayPoints, setDayPoints] = useState<MonitorDayPoint[]>([]);

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
    const [o, m, d] = await Promise.allSettled([ordersApi.list(), fetchPublicListings(), monitorApi.list()]);
    if (!alive.current) return;
    if (o.status === 'fulfilled') setOrders(o.value);
    setListings(m.status === 'fulfilled' ? m.value : null);
    setListingsLoaded(true);
    if (d.status === 'fulfilled') {
      setMonitors(d.value.devices);
      const first = d.value.devices[0];
      if (first) {
        const r = await monitorApi.daily(first.id, 7).catch(() => ({ points: [] as MonitorDayPoint[] }));
        if (alive.current) setDayPoints(r.points);
      } else {
        setDayPoints([]);
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
  // Only what the monitor reports. No reading means no level: nothing is made up.
  const hasReading = !!monitor && !monitor.state.calibrating && monitor.state.percent != null;
  const level: number | null = hasReading ? Math.round(monitor!.state.percent as number) : null;
  const maxKg = monitor?.cylinder?.sizeKg ?? activeProfile?.sizeKg ?? 12.5;
  const kgLeft: number | null = level == null ? null : (monitor!.state.netKg ?? (level / 100) * maxKg);
  const status = level == null ? null : getStatus(level);
  const offline = !!monitor && (!monitor.state.online || monitor.state.stale);
  // Why there is nothing to show: no device linked, or a device that has not reported.
  const emptyMsg = !monitor ? 'Device not synced yet' : 'No readings yet';

  const bars = useMemo(() => weekBars(dayPoints), [dayPoints]);
  const hasUsage = bars.some((b) => b.kg != null);
  const weekTotal = bars.reduce((sum, b) => sum + (b.kg ?? 0), 0);
  const maxBar = Math.max(0.1, ...bars.map((b) => b.kg ?? 0));

  const days = kgLeft == null ? null : daysLeft(kgLeft, bars);
  const daysText = days == null ? '—' : `~${days}`;
  const daysSub = level == null ? emptyMsg : days == null ? 'Not enough use yet' : 'at your recent use';

  const inStock = useMemo(() => (listings ?? []).filter((l) => l.inStock), [listings]);
  const best = useMemo(
    () => inStock.reduce<PublicListing | null>((b, l) => (b == null || l.pricePerKg < b.pricePerKg ? l : b), null),
    [inStock]
  );
  const supplierCount = useMemo(() => new Set(inStock.map((l) => l.vendor.id)).size, [inStock]);

  const activeOrder = useMemo(() => {
    const open = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY');
    return [...open].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  }, [orders]);

  const now = new Date();
  const userName = firstNameOf(user?.name);

  const weekContent = (
    <>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Last 7 days</span>
        {hasUsage && <span className={`${LABEL} font-mono`}>{weekTotal.toFixed(1)} kg used</span>}
      </div>
      {hasUsage ? (
        <>
          <div className="mt-2 flex h-[54px] items-end gap-1.5" role="img" aria-label="Gas used each day over the last 7 days">
            {bars.map((b) => (
              <span
                key={b.key}
                className={`flex-1 rounded-t ${b.kg == null ? 'bg-border' : b.today ? 'bg-primary' : 'bg-primary/25'}`}
                style={{ height: b.kg == null ? 3 : Math.max(4, (b.kg / maxBar) * 54) }}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {bars.map((b) => (
              <span
                key={b.key}
                className={`flex-1 text-center text-[10px] ${b.today ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground'}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="py-5 text-center text-sm text-muted-foreground">No usage history yet</p>
      )}
    </>
  );

  return (
    <section aria-label="Home" className="mx-auto max-w-lg space-y-3 lg:max-w-none">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{dateLabel(now)}</p>
          <h2 className="mt-0.5 text-[21px] font-extrabold leading-[26px] tracking-tight text-foreground">
            {greetingFor(now)}
            {userName && (
              <>
                ,<br className="lg:hidden" /> {userName}
              </>
            )}
          </h2>
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

      {/* Circular cards: Deals, Safety, Tips, Rewards, New */}
      <HomeStories listings={listings} />

      {level != null && level <= 25 && (
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
          {level == null ? (
            <Link href="/dashboard/monitors" className={`max-w-full rounded-full ${FOCUS}`}>
              <Pill label={emptyMsg} color="var(--muted-foreground)" />
            </Link>
          ) : offline ? (
            <Link href="/dashboard/monitors" className={`max-w-full rounded-full ${FOCUS}`}>
              <Pill label="Offline · last reading" color="#B7791F" />
            </Link>
          ) : (
            <Pill label={`Live · ${status!.label}`} color="var(--primary)" />
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
            {best ? formatNaira(best.pricePerKg) : '—'}
          </p>
          <span className={`${SUB} truncate`}>
            {!listingsLoaded
              ? 'Loading…'
              : best
                ? `per kg · ${best.vendor.businessName}`
                : listings
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
              {supplierCount > 0
                ? `${supplierCount} supplier${supplierCount === 1 ? '' : 's'} with gas in stock`
                : 'Find a supplier and order gas'}
            </span>
          </span>
          <span className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-bold text-[#1A4730]">Browse</span>
        </Link>

        {/* Weekly usage */}
        {monitor ? (
          <Link href="/dashboard/monitors" className={`${TILE} col-span-2 lg:col-span-2 ${FOCUS}`}>
            {weekContent}
          </Link>
        ) : (
          <div className={`${TILE} col-span-2 lg:col-span-2`}>{weekContent}</div>
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
