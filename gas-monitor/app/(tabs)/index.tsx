import { NotificationBell } from '@/components/notification-bell';
import { HomeStories } from '@/components/home-stories';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import {
  cylinderApi,
  marketplaceApi,
  monitorApi,
  ordersApi,
  type ApiUser,
  type ConsumerOrder,
  type CylinderImageKey,
  type CylinderProfile,
  type MarketplaceListing,
  type Monitor,
  type MonitorDayPoint,
} from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { dateLabel, daysLeft, firstNameOf, greetingFor, weekBars } from '@/lib/homeContent';

const monoFont = Fonts?.mono ?? 'monospace';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  separator: '#EEF7EE',
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  deep: '#1A4730',
  clay: '#A9714C',
  clayLight: '#F3E6DB',
  red: '#D32F2F',
  amber: '#B7791F',
  amberLight: '#FBEFD5',
};

// ── Cylinder image map ────────────────────────────────────────────────────────
const CYLINDER_IMAGES: Record<string, ImageSourcePropType> = {
  '6kg': require('@/assets/images/6kg.png'),
  '12.5kg': require('@/assets/images/12-5kg.png'),
  '50kg': require('@/assets/images/50kg.png'),
};

const SIZE_OPTIONS: { label: string; kg: number; key: CylinderImageKey }[] = [
  { label: '6 kg', kg: 6, key: '6kg' },
  { label: '12.5 kg', kg: 12.5, key: '12.5kg' },
  { label: '50 kg', kg: 50, key: '50kg' },
];

const REMINDER_OPTS = ['12 hrs before', '1 day before', '2 days before', '3 days before'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function lerpHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const v = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${v(r1, r2)}${v(g1, g2)}${v(b1, b2)}`;
}
const BAR_STOPS: [number, string][] = [
  [0, '#FF3B30'], [0.25, '#FF9500'], [0.50, '#FFCC00'], [0.75, '#4CD964'], [1, '#34C759'],
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
  if (pct <= 10) return { label: 'Critical', color: '#FF3B30' };
  if (pct <= 25) return { label: 'Low', color: '#FF9500' };
  if (pct <= 60) return { label: 'Moderate', color: '#CC9A00' };
  return { label: 'Good', color: '#34C759' };
}

const naira = (n: number) => `₦${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

// ── Segmented arc gauge (scales with `size`) ──────────────────────────────────
const GAUGE_TOTAL = 48;
const GAUGE_ARC = 300;
const GAUGE_START = 210;
const GAUGE_BAR_H = 18;
const GAUGE_BAR_W = 7;
const GAUGE_BAR_R = 2;

/** `percentage` is null when there is no reading: the ring is empty and says so. */
function GaugeRing({ percentage, maxKg, kgLeft, size = 210 }: { percentage: number | null; maxKg: number; kgLeft?: number | null; size?: number }) {
  const k = size / 210;
  const barH = GAUGE_BAR_H * k;
  const barW = GAUGE_BAR_W * k;
  const empty = percentage == null;
  const p = empty ? 0 : Math.max(0, Math.min(100, percentage));
  const midR = size / 2 - barH / 2;
  const innerD = 2 * (midR - barH / 2 - 4 * k);
  const activeCount = Math.round((p / 100) * GAUGE_TOTAL);
  const currentColor = getBarColor(p / 100);
  const kg = kgLeft ?? (p / 100) * maxKg;

  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: GAUGE_TOTAL }, (_, i) => {
        const t = i / (GAUGE_TOTAL - 1);
        const angleDeg = GAUGE_START + (i / GAUGE_TOTAL) * GAUGE_ARC;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: barW,
              height: barH,
              borderRadius: GAUGE_BAR_R,
              backgroundColor: i < activeCount ? getBarColor(t) : '#C2D9C2',
              top: (size - barH) / 2,
              left: (size - barW) / 2,
              transform: [{ rotate: `${angleDeg}deg` }, { translateY: -midR }],
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          width: innerD,
          height: innerD,
          borderRadius: innerD / 2,
          backgroundColor: C.card,
          top: (size - innerD) / 2,
          left: (size - innerD) / 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: monoFont, color: empty ? C.dim : C.text, fontSize: 46 * k, fontWeight: '800', letterSpacing: -2 * k }}>
          {empty ? '—' : `${Math.round(p)}%`}
        </Text>
        <Text style={{ color: empty ? C.muted : currentColor, fontSize: Math.max(10, 13 * k), fontWeight: '700' }}>Gas level</Text>
        {!empty && (
          <Text style={{ fontFamily: monoFont, color: C.muted, fontSize: Math.max(10, 13 * k) }}>{kg.toFixed(1)} kg</Text>
        )}
      </View>
    </View>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────────
function Pill({ label, color, bg, onPress }: { label: string; color: string; bg: string; onPress?: () => void }) {
  const body = (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <Text style={[s.pillText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{body}</TouchableOpacity> : body;
}

const ORDER_STEPS: { status: ConsumerOrder['status']; label: string }[] = [
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { status: 'DELIVERED', label: 'Delivered' },
];

function OrderSteps({ status }: { status: ConsumerOrder['status'] }) {
  const reached = ORDER_STEPS.findIndex((st) => st.status === status);
  return (
    <View>
      <View style={s.stepsRow}>
        {ORDER_STEPS.map((st, i) => (
          <React.Fragment key={st.status}>
            <View style={[s.stepDot, i <= reached ? s.stepDotOn : null]} />
            {i < ORDER_STEPS.length - 1 && <View style={[s.stepLine, i < reached ? s.stepLineOn : null]} />}
          </React.Fragment>
        ))}
      </View>
      <View style={s.stepLabels}>
        {ORDER_STEPS.map((st) => (
          <Text key={st.status} style={s.stepLabel}>{st.label}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const colW = (width - 32 - 10) / 2;
  const gaugeSize = Math.max(120, Math.floor(colW - 28));

  const [userName, setUserName] = useState('');

  // Reminder (local only)
  const [selectedReminder, setSelectedReminder] = useState('1 day before');
  const [reminderSet, setReminderSet] = useState(false);
  const [reminderVisible, setReminderVisible] = useState(false);

  // Live data
  const [orders, setOrders] = useState<ConsumerOrder[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [dayPoints, setDayPoints] = useState<MonitorDayPoint[]>([]);

  // Cylinder profiles
  const [profiles, setProfiles] = useState<CylinderProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  // Add-profile form
  const [newName, setNewName] = useState('');
  const [newSizeOption, setNewSizeOption] = useState<'6kg' | '12.5kg' | '50kg' | 'custom'>('12.5kg');
  const [customKg, setCustomKg] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const activeProfile = profiles.find((p) => p.isActive) ?? null;
  const monitor = monitors[0] ?? null;

  useEffect(() => {
    cylinderApi.list()
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setProfilesLoading(false));
    getSavedUser<ApiUser>().then((u) => setUserName(firstNameOf(u?.name))).catch(() => {});
  }, []);

  // Orders, marketplace and the monitor refresh every time the tab is focused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.allSettled([ordersApi.list(), marketplaceApi.listings(), monitorApi.list()]).then(async ([o, m, d]) => {
        if (cancelled) return;
        if (o.status === 'fulfilled') setOrders(o.value);
        if (m.status === 'fulfilled') setListings(m.value.listings);
        if (d.status === 'fulfilled') {
          setMonitors(d.value.devices);
          const first = d.value.devices[0];
          if (first) {
            const r = await monitorApi.daily(first.id, 7).catch(() => ({ points: [] as MonitorDayPoint[] }));
            if (!cancelled) setDayPoints(r.points);
          } else {
            setDayPoints([]);
          }
        }
      });
      return () => { cancelled = true; };
    }, []),
  );

  async function activateProfile(id: string) {
    try {
      const updated = await cylinderApi.activate(id);
      setProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === updated.id })));
    } catch {}
    setSheetVisible(false);
  }
  async function deleteProfile(id: string) {
    try {
      await cylinderApi.remove(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  }
  async function submitNewProfile() {
    setFormError('');
    if (!newName.trim()) { setFormError('Profile name is required.'); return; }

    let sizeKg: number;
    let imageKey: CylinderImageKey;
    let customSizeLabel: string | undefined;

    if (newSizeOption === 'custom') {
      const parsed = parseFloat(customKg);
      if (!parsed || parsed <= 0) { setFormError('Enter a valid size in kg.'); return; }
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
        ...(customSizeLabel ? { customSizeLabel } : {}),
      });
      setProfiles((prev) => [...prev, created]);
      setAddModalVisible(false);
      resetAddForm();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }
  function resetAddForm() {
    setNewName('');
    setNewSizeOption('12.5kg');
    setCustomKg('');
    setCustomLabel('');
    setFormError('');
  }

  // ── Derived values ──────────────────────────────────────────────────────────
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
    () => inStock.reduce<MarketplaceListing | null>((b, l) => (b == null || l.pricePerKg < b.pricePerKg ? l : b), null),
    [inStock],
  );
  const supplierCount = useMemo(() => new Set(inStock.map((l) => l.vendor.id)).size, [inStock]);

  const activeOrder = useMemo(() => {
    const open = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY');
    return open.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  }, [orders]);

  const goOrder = () => router.push('/order');
  const goMonitors = () => router.push('/monitors' as never);
  const goListing = (id: string) => router.navigate({ pathname: '/order', params: { listingId: id } });

  const now = new Date();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerDate}>{dateLabel(now)}</Text>
            <Text style={s.headerGreeting} numberOfLines={2}>
              {greetingFor(now)}{userName ? `,\n${userName}` : ''}
            </Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.profilePill}
              onPress={() => setSheetVisible(true)}
              activeOpacity={0.7}
              accessibilityLabel="Select cylinder profile"
            >
              <Text style={s.profilePillText} numberOfLines={1}>{activeProfile?.name ?? 'Select cylinder'}</Text>
              <IconSymbol name="chevron.down" size={13} color={C.accent} />
            </TouchableOpacity>
            <NotificationBell />
          </View>
        </View>

        {/* Circular cards: Deals, Safety, Tips, Rewards, New */}
        <View style={s.storiesWrap}>
          <HomeStories listings={listings} onOrder={goListing} />
        </View>

        {level != null && level <= 25 && (
          <TouchableOpacity style={s.alertBanner} onPress={goOrder} activeOpacity={0.85}>
            <View style={s.alertIconBox}><Text style={s.alertIconText}>!</Text></View>
            <Text style={s.alertText}>
              {level <= 10 ? 'Gas is almost out. Order a refill now.' : 'Gas is running low. Order a refill soon.'}
            </Text>
            <IconSymbol name="chevron.right" size={16} color={C.red} />
          </TouchableOpacity>
        )}

        <View style={s.bento}>
          {/* Row 1: gauge tile + two stat tiles */}
          <View style={s.row}>
            <View style={[s.card, s.gaugeCard]}>
              <Text style={s.k}>Gas level</Text>
              <GaugeRing percentage={level} maxKg={maxKg} kgLeft={kgLeft} size={gaugeSize} />
              {level == null ? (
                <Pill label={emptyMsg} color={C.muted} bg={C.surface} onPress={goMonitors} />
              ) : offline ? (
                <Pill label="Offline · last reading" color={C.amber} bg={C.amberLight} onPress={goMonitors} />
              ) : (
                <Pill label={`Live · ${status!.label}`} color={C.accent} bg={C.accentLight} />
              )}
            </View>

            <View style={s.col}>
              <View style={[s.card, s.fill]}>
                <Text style={s.k}>Days left</Text>
                <Text style={[s.v, { fontFamily: monoFont }, days === 0 && { color: C.red }]}>{daysText}</Text>
                <Text style={s.sub}>{daysSub}</Text>
              </View>
              <TouchableOpacity style={[s.card, s.fill]} onPress={goOrder} activeOpacity={0.8}>
                <Text style={s.k}>Best price</Text>
                <Text style={[s.v, { fontFamily: monoFont }]}>{best ? naira(best.pricePerKg) : '—'}</Text>
                <Text style={s.sub} numberOfLines={1}>{best ? `per kg · ${best.vendor.businessName}` : listings ? 'No suppliers in stock' : 'Loading…'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Marketplace */}
          <TouchableOpacity style={[s.card, s.deepCard]} onPress={goOrder} activeOpacity={0.85}>
            <View style={s.deepIcon}><IconSymbol name="storefront.fill" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.deepTitle}>Marketplace</Text>
              <Text style={s.deepSub}>
                {supplierCount > 0 ? `${supplierCount} supplier${supplierCount === 1 ? '' : 's'} with gas in stock` : 'Find a supplier and order gas'}
              </Text>
            </View>
            <View style={s.deepBtn}><Text style={s.deepBtnText}>Browse</Text></View>
          </TouchableOpacity>

          {/* Weekly usage */}
          <TouchableOpacity style={s.card} onPress={monitor ? goMonitors : undefined} activeOpacity={monitor ? 0.85 : 1} disabled={!monitor}>
            <View style={s.between}>
              <Text style={s.k}>Last 7 days</Text>
              {hasUsage && <Text style={[s.k, { fontFamily: monoFont }]}>{weekTotal.toFixed(1)} kg used</Text>}
            </View>
            {hasUsage ? (
              <>
                <View style={s.weekBars} accessibilityLabel="Gas used each day over the last 7 days">
                  {bars.map((b) => (
                    <View
                      key={b.key}
                      style={[
                        s.weekBar,
                        { height: b.kg == null ? 3 : Math.max(4, (b.kg / maxBar) * 54) },
                        b.today && s.weekBarNow,
                        b.kg == null && s.weekBarNone,
                      ]}
                    />
                  ))}
                </View>
                <View style={s.dayLabels}>
                  {bars.map((b) => (
                    <Text key={b.key} style={[s.dayLabel, b.today && { color: C.accent, fontWeight: '800' }]}>{b.label}</Text>
                  ))}
                </View>
              </>
            ) : (
              <Text style={s.noUsage}>No usage history yet</Text>
            )}
          </TouchableOpacity>

          {/* Active order */}
          {activeOrder && (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/order/${activeOrder.id}`)} activeOpacity={0.85}>
              <View style={s.between}>
                <Text style={s.k}>Order in progress</Text>
                <Pill
                  label={activeOrder.status === 'OUT_FOR_DELIVERY' ? 'On the way' : 'Confirmed'}
                  color={C.accent}
                  bg={C.accentLight}
                />
              </View>
              <Text style={s.orderTitle} numberOfLines={1}>
                {activeOrder.vendor?.businessName ?? activeOrder.supplierName ?? 'Your order'} · {activeOrder.cylinderSize}
                {activeOrder.quantity > 1 ? ` × ${activeOrder.quantity}` : ''}
              </Text>
              <OrderSteps status={activeOrder.status} />
            </TouchableOpacity>
          )}

          {/* Row: cylinder + reminder */}
          <View style={s.row}>
            <TouchableOpacity style={[s.card, s.fill, s.half]} onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
              <Text style={s.k}>Cylinder</Text>
              {activeProfile ? (
                <View style={s.cylRow}>
                  <Image source={CYLINDER_IMAGES[activeProfile.imageKey] ?? CYLINDER_IMAGES['12.5kg']} style={s.cylImg} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tileTitle} numberOfLines={1}>{activeProfile.name}</Text>
                    <Text style={s.sub}>{activeProfile.customSizeLabel ?? `${activeProfile.sizeKg} kg`}</Text>
                  </View>
                </View>
              ) : (
                <Text style={s.sub}>Tap to add a cylinder profile</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[s.card, s.clayCard, s.fill, s.half]} onPress={() => setReminderVisible(true)} activeOpacity={0.85}>
              <Text style={[s.k, { color: C.clay }]}>Reminder</Text>
              <Text style={s.tileTitle}>{reminderSet ? 'On' : 'Not set'}</Text>
              <Text style={s.sub}>{reminderSet ? selectedReminder : 'Tap to get a refill nudge'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── Reminder Modal ── */}
      <Modal visible={reminderVisible} transparent animationType="slide" onRequestClose={() => setReminderVisible(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setReminderVisible(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Refill reminder</Text>
            <Text style={s.sheetNote}>When should we remind you to refill?</Text>
            <View style={s.reminderGrid}>
              {REMINDER_OPTS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.reminderOpt, selectedReminder === opt && s.reminderOptActive]}
                  onPress={() => setSelectedReminder(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.reminderOptText, selectedReminder === opt && s.reminderOptTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={s.saveBtn}
              activeOpacity={0.85}
              onPress={() => { setReminderSet(true); setReminderVisible(false); }}
            >
              <Text style={s.saveBtnText}>{reminderSet ? 'Update reminder' : 'Turn on reminder'}</Text>
            </TouchableOpacity>
            {reminderSet && (
              <TouchableOpacity onPress={() => { setReminderSet(false); setReminderVisible(false); }} activeOpacity={0.7} style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={s.cancelReminderText}>Turn off reminder</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Profile Selector Sheet ── */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setSheetVisible(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Cylinder Profiles</Text>

            {profilesLoading ? (
              <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
            ) : profiles.length === 0 ? (
              <Text style={s.sheetEmpty}>No cylinder profiles yet. Add one below.</Text>
            ) : (
              profiles.map((p) => (
                <View key={p.id} style={s.profileRow}>
                  <TouchableOpacity style={s.profileRowMain} onPress={() => activateProfile(p.id)} activeOpacity={0.7}>
                    <Image source={CYLINDER_IMAGES[p.imageKey] ?? CYLINDER_IMAGES['12.5kg']} style={s.profileRowImage} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.profileRowName}>{p.name}</Text>
                      <Text style={s.profileRowSize}>{p.customSizeLabel ?? `${p.sizeKg} kg`}</Text>
                    </View>
                    {p.isActive && <IconSymbol name="checkmark.circle.fill" size={20} color={C.accent} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.profileDeleteBtn} onPress={() => deleteProfile(p.id)} activeOpacity={0.7} accessibilityLabel={`Delete ${p.name}`}>
                    <IconSymbol name="trash.fill" size={16} color={C.red} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity
              style={s.addProfileBtn}
              onPress={() => { setSheetVisible(false); setAddModalVisible(true); }}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" size={16} color={C.accent} />
              <Text style={s.addProfileBtnText}>Add New Profile</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Add Profile Modal ── */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setAddModalVisible(false); resetAddForm(); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.sheetOverlay} onPress={() => { setAddModalVisible(false); resetAddForm(); }}>
            <Pressable style={[s.sheet, { paddingBottom: 32 }]} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>New Cylinder Profile</Text>

              <Text style={s.fieldLabel}>Profile Name</Text>
              <TextInput
                style={s.fieldInput}
                placeholder="e.g. Kitchen Cylinder"
                placeholderTextColor={C.dim}
                value={newName}
                onChangeText={setNewName}
                maxLength={50}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Cylinder Size</Text>
              <View style={s.sizeGrid}>
                {SIZE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.sizeOpt, newSizeOption === opt.key && s.sizeOptActive]}
                    onPress={() => setNewSizeOption(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Image source={CYLINDER_IMAGES[opt.key]} style={{ width: 28, height: 28 }} resizeMode="contain" />
                    <Text style={[s.sizeOptText, newSizeOption === opt.key && s.sizeOptTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[s.sizeOpt, newSizeOption === 'custom' && s.sizeOptActive]}
                  onPress={() => setNewSizeOption('custom')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 24 }}>✏️</Text>
                  <Text style={[s.sizeOptText, newSizeOption === 'custom' && s.sizeOptTextActive]}>Custom</Text>
                </TouchableOpacity>
              </View>

              {newSizeOption === 'custom' && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Size in kg (e.g. 25)"
                    placeholderTextColor={C.dim}
                    value={customKg}
                    onChangeText={setCustomKg}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Label (optional, e.g. 25 kg)"
                    placeholderTextColor={C.dim}
                    value={customLabel}
                    onChangeText={setCustomLabel}
                    maxLength={30}
                  />
                </View>
              )}

              {formError !== '' && <Text style={s.formError}>{formError}</Text>}

              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={submitNewProfile} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Profile</Text>}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const s = StyleSheet.create({
  container: { paddingBottom: 28, gap: 12 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingHorizontal: 16, gap: 10 },
  headerDate: { color: C.muted, fontSize: 12 },
  headerGreeting: { color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, lineHeight: 26, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profilePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, maxWidth: 120,
  },
  profilePillText: { color: C.accent, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  storiesWrap: { marginTop: 2 },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16,
    backgroundColor: C.red + '12', borderWidth: 1, borderColor: C.red + '30',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
  },
  alertIconBox: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center' },
  alertIconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  alertText: { flex: 1, color: C.red, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  // Bento
  bento: { gap: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  col: { flex: 1, gap: 10 },
  fill: { flex: 1 },
  half: { flex: 1 },
  card: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 4, ...cardShadow,
  },
  gaugeCard: { flex: 1, alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  k: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, alignSelf: 'flex-start' },
  v: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.muted, fontSize: 11 },
  tileTitle: { color: C.text, fontSize: 15, fontWeight: '800' },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'center' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },

  deepCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.deep, borderColor: C.deep },
  deepIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', alignItems: 'center' },
  deepTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  deepSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  deepBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  deepBtnText: { color: C.deep, fontSize: 13, fontWeight: '700' },

  weekBars: { flexDirection: 'row', alignItems: 'flex-end', height: 54, gap: 6, marginTop: 8 },
  weekBar: { flex: 1, backgroundColor: C.accent + '40', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  weekBarNow: { backgroundColor: C.accent },
  weekBarNone: { backgroundColor: C.border },
  dayLabels: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dayLabel: { flex: 1, textAlign: 'center', color: C.muted, fontSize: 10, fontWeight: '600' },
  noUsage: { color: C.muted, fontSize: 14, textAlign: 'center', paddingVertical: 22 },

  orderTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  stepsRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#C2D9C2' },
  stepDotOn: { backgroundColor: C.accent },
  stepLine: { flex: 1, height: 3, backgroundColor: '#C2D9C2' },
  stepLineOn: { backgroundColor: C.accent },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  stepLabel: { color: C.muted, fontSize: 10 },

  cylRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  cylImg: { width: 34, height: 44 },
  clayCard: { backgroundColor: C.clayLight, borderColor: 'transparent' },

  // Sheets
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  sheetNote: { color: C.muted, fontSize: 13, marginTop: -8, marginBottom: 12 },
  sheetEmpty: { color: C.muted, fontSize: 14, textAlign: 'center', marginVertical: 20 },

  reminderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderOpt: {
    flex: 1, minWidth: '44%', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center',
  },
  reminderOptActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  reminderOptText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  reminderOptTextActive: { color: C.accent, fontWeight: '700' },
  cancelReminderText: { color: C.accent, fontSize: 13, textDecorationLine: 'underline' },

  profileRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.separator },
  profileRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 4 },
  profileRowImage: { width: 36, height: 36 },
  profileRowName: { color: C.text, fontSize: 14, fontWeight: '700' },
  profileRowSize: { color: C.muted, fontSize: 12, marginTop: 1 },
  profileDeleteBtn: { padding: 12 },

  addProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.accent + '60', backgroundColor: C.accentLight,
  },
  addProfileBtnText: { color: C.accent, fontSize: 15, fontWeight: '700' },

  fieldLabel: { color: C.textSub, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15,
  },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeOpt: {
    flex: 1, minWidth: '22%', alignItems: 'center', gap: 4, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  sizeOptActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  sizeOptText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  sizeOptTextActive: { color: C.accent, fontWeight: '700' },
  formError: { color: C.red, fontSize: 13, marginTop: 8 },
  saveBtn: { marginTop: 20, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
