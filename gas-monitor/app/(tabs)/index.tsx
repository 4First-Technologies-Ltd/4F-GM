import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';
import { cylinderApi, CylinderProfile, CylinderImageKey } from '@/lib/api';

const monoFont = Fonts?.mono ?? 'monospace';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  hero: '#EDF7ED',
  heroDark: '#2D7450',
  heroText: '#1A2E1A',
  heroSubText: '#7A9A7A',
  gaugeOuter: '#FFFFFF',
  gaugeTrack: '#C0DCC0',
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
  red: '#D32F2F',
  orange: '#E65100',
  yellow: '#F9A825',
};

// ── Cylinder image map ────────────────────────────────────────────────────────
const CYLINDER_IMAGES: Record<string, ReturnType<typeof require>> = {
  '6kg': require('@/assets/images/6kg.png'),
  '12.5kg': require('@/assets/images/12-5kg.png'),
  '50kg': require('@/assets/images/50kg.png'),
};

const SIZE_OPTIONS: { label: string; kg: number; key: CylinderImageKey }[] = [
  { label: '6 kg', kg: 6, key: '6kg' },
  { label: '12.5 kg', kg: 12.5, key: '12.5kg' },
  { label: '50 kg', kg: 50, key: '50kg' },
];

// ── Gauge helpers ─────────────────────────────────────────────────────────────
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
  if (pct <= 10) return { label: 'Critical — Refill Now', color: '#FF3B30' };
  if (pct <= 25) return { label: 'Low — Order Soon', color: '#FF9500' };
  if (pct <= 60) return { label: 'Moderate Level', color: '#CC9A00' };
  return { label: 'Good Level', color: '#34C759' };
}

// ── Segmented arc gauge ───────────────────────────────────────────────────────
const GAUGE_TOTAL = 48;
const GAUGE_ARC   = 300;
const GAUGE_START = 210;
const GAUGE_BAR_H = 18;
const GAUGE_BAR_W = 7;
const GAUGE_BAR_R = 2;

const innerDiskShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14 },
  android: { elevation: 8 },
  default: {},
});

function GaugeRing({ percentage, maxKg, size = 210 }: { percentage: number; maxKg: number; size?: number }) {
  const p = Math.max(0, Math.min(100, percentage));
  const midR  = size / 2 - GAUGE_BAR_H / 2;
  const innerD = 2 * (midR - GAUGE_BAR_H / 2 - 4);
  const activeCount = Math.round((p / 100) * GAUGE_TOTAL);
  const currentColor = getBarColor(p / 100);

  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: GAUGE_TOTAL }, (_, i) => {
        const t        = i / (GAUGE_TOTAL - 1);
        const angleDeg = GAUGE_START + (i / GAUGE_TOTAL) * GAUGE_ARC;
        const isActive = i < activeCount;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: GAUGE_BAR_W,
              height: GAUGE_BAR_H,
              borderRadius: GAUGE_BAR_R,
              backgroundColor: isActive ? getBarColor(t) : '#C2D9C2',
              top: (size - GAUGE_BAR_H) / 2,
              left: (size - GAUGE_BAR_W) / 2,
              transform: [{ rotate: `${angleDeg}deg` }, { translateY: -midR }],
            }}
          />
        );
      })}
      <View style={[
        {
          position: 'absolute',
          width: innerD,
          height: innerD,
          borderRadius: innerD / 2,
          backgroundColor: C.gaugeOuter,
          top: (size - innerD) / 2,
          left: (size - innerD) / 2,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
        },
        innerDiskShadow,
      ]}>
        <Text style={[s.gaugePercent, { fontFamily: monoFont }]}>{p}%</Text>
        <Text style={[s.gaugeLabel, { color: currentColor }]}>Gas Level</Text>
        <Text style={[s.gaugeKg, { fontFamily: monoFont }]}>{((p / 100) * maxKg).toFixed(1)} kg</Text>
      </View>
    </View>
  );
}

// ── Cylinder profile card (back of flip) ──────────────────────────────────────
const GAUGE_SIZE = 210;
const CARD_W     = 310;
const CARD_H     = 170;

// Flip container must fit both faces: wide enough for the card, tall enough for the gauge
const FLIP_W = CARD_W;
const FLIP_H = Math.max(GAUGE_SIZE, CARD_H);

function CylinderProfileCard({ profile, level }: { profile: CylinderProfile | null; level: number }) {
  const levelColor = getBarColor(level / 100);
  return (
    <View style={profileCard.card}>
      {profile ? (
        <>
          {/* Left — large cylinder image */}
          <View style={profileCard.imageCol}>
            <Image
              source={CYLINDER_IMAGES[profile.imageKey] ?? CYLINDER_IMAGES['12.5kg']}
              style={profileCard.image}
              resizeMode="contain"
            />
          </View>

          {/* Divider */}
          <View style={profileCard.divider} />

          {/* Right — profile details */}
          <View style={profileCard.detailCol}>
            <Text style={profileCard.label}>PROFILE</Text>
            <Text style={profileCard.name} numberOfLines={2}>{profile.name}</Text>

            <View style={profileCard.sizeBadge}>
              <Text style={profileCard.sizeText}>
                {profile.customSizeLabel ?? `${profile.sizeKg} kg`}
              </Text>
            </View>

            <Text style={profileCard.label}>GAS LEVEL</Text>
            <View style={[profileCard.levelBar, { borderColor: levelColor + '40' }]}>
              <View style={[profileCard.levelFill, { width: `${level}%` as any, backgroundColor: levelColor }]} />
            </View>
            <Text style={[profileCard.levelPct, { color: levelColor }]}>
              {level}% · {((level / 100) * profile.sizeKg).toFixed(1)} kg left
            </Text>
          </View>
        </>
      ) : (
        <View style={profileCard.emptyWrap}>
          <Text style={{ fontSize: 36 }}>🪣</Text>
          <Text style={profileCard.name}>No Profile Set</Text>
          <Text style={profileCard.emptyHint}>Tap the dropdown above to add a cylinder</Text>
        </View>
      )}
    </View>
  );
}

const profileCard = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 24,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  imageCol: {
    width: 120,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  image: { width: 96, height: 130 },
  divider: { width: 1, backgroundColor: C.border },
  detailCol: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: 'center',
    gap: 4,
  },
  label: { color: C.dim, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  name: { color: C.text, fontSize: 15, fontWeight: '800', lineHeight: 20, marginBottom: 6 },
  sizeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
    marginBottom: 10,
  },
  sizeText: { color: C.accent, fontSize: 11, fontWeight: '700' },
  levelBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.surface,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 2,
  },
  levelFill: { height: '100%', borderRadius: 3 },
  levelPct: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 20 },
  emptyHint: { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});

// ── Insight row ───────────────────────────────────────────────────────────────
function InsightRow({ icon, label, value, valueColor }: {
  icon: string; label: string; value: string; valueColor: string;
}) {
  return (
    <View style={s.insightRow}>
      <View style={s.insightIconBox}>
        <Text style={s.insightIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.insightLabel}>{label}</Text>
        <Text style={[s.insightValue, { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
const REMINDER_OPTS = ['12 hrs before', '1 day before', '2 days before', '3 days before'];

export default function HomeScreen() {
  const [gasLevel, setGasLevel] = useState(100);
  const [simulating, setSimulating] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState('1 day before');
  const [reminderSet, setReminderSet] = useState(false);

  // Cylinder profiles
  const [profiles, setProfiles] = useState<CylinderProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  // UI state
  const [isFlipped, setIsFlipped] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  // Add-profile form
  const [newName, setNewName] = useState('');
  const [newSizeOption, setNewSizeOption] = useState<'6kg' | '12.5kg' | '50kg' | 'custom'>('12.5kg');
  const [customKg, setCustomKg] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const gaugeY = useRef(0);
  const contentY = useRef(0);
  const reminderY = useRef(0);

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [showBackFace, setShowBackFace] = useState(false);

  const activeProfile = profiles.find((p) => p.isActive) ?? null;
  const maxKg = activeProfile?.sizeKg ?? 12.5;

  // Load profiles on mount
  useEffect(() => {
    cylinderApi.list()
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setProfilesLoading(false));
  }, []);

  // Flip listener — swap face at the midpoint
  useEffect(() => {
    const id = flipAnim.addListener(({ value }) => {
      setShowBackFace(value >= 0.5);
    });
    return () => flipAnim.removeListener(id);
  }, [flipAnim]);

  function handleGaugeTap() {
    const toValue = isFlipped ? 0 : 1;
    setIsFlipped(!isFlipped);
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  function scrollToReminder() {
    scrollRef.current?.scrollTo({ y: contentY.current + reminderY.current - 16, animated: true });
  }

  function startDrain() {
    if (simulating) return;
    scrollRef.current?.scrollTo({ y: gaugeY.current, animated: true });
    setGasLevel(100);
    setSimulating(true);
    let current = 100;
    simRef.current = setInterval(() => {
      current -= 1;
      setGasLevel(current);
      if (current <= 0) {
        clearInterval(simRef.current!);
        simRef.current = null;
        setSimulating(false);
      }
    }, 240);
  }

  function stopDrain() {
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    setSimulating(false);
  }

  function resetLevel() { stopDrain(); setGasLevel(100); }

  useEffect(() => {
    return () => { if (simRef.current) clearInterval(simRef.current); };
  }, []);

  // Activate a profile
  async function activateProfile(id: string) {
    try {
      const updated = await cylinderApi.activate(id);
      setProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === updated.id })));
    } catch {}
    setSheetVisible(false);
  }

  // Delete a profile
  async function deleteProfile(id: string) {
    try {
      await cylinderApi.remove(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  }

  // Submit new profile
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
      imageKey = '12.5kg'; // fallback image for custom sizes
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

  const { label: statusLabel, color: statusColor } = getStatus(gasLevel);
  const daysLeft = Math.round((gasLevel / 100) * 30);
  const kgLeft = ((gasLevel / 100) * maxKg).toFixed(1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.hero }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero section ── */}
        <View style={s.hero}>

          {/* Header: title | profile pill | bell */}
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>4F G-Monitor</Text>
              <Text style={s.headerSub}>FG-2024-0047 · Connected</Text>
            </View>
            <View style={s.headerRight}>
              <TouchableOpacity
                style={s.profilePill}
                onPress={() => setSheetVisible(true)}
                activeOpacity={0.7}
                accessibilityLabel="Select cylinder profile"
              >
                <Text style={s.profilePillText} numberOfLines={1}>
                  {activeProfile?.name ?? 'Select Cylinder'}
                </Text>
                <IconSymbol name="chevron.down" size={13} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.notifBtn}
                activeOpacity={0.7}
                accessibilityLabel="Notifications"
              >
                <IconSymbol name="bell.fill" size={20} color={C.accent} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Flippable Gauge */}
          <View
            onLayout={(e) => { gaugeY.current = e.nativeEvent.layout.y; }}
            style={s.gaugeWrapper}
          >
            <TouchableOpacity onPress={handleGaugeTap} activeOpacity={1} accessible={false}>
              <View style={{ width: FLIP_W, height: FLIP_H, justifyContent: 'center', alignItems: 'center' }}>
                {/* Front face — gauge centred in the wider container */}
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backfaceVisibility: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                      transform: [{ perspective: 1400 }, { rotateY: frontRotate }],
                    },
                  ]}
                >
                  <GaugeRing percentage={gasLevel} maxKg={maxKg} />
                </Animated.View>

                {/* Back face — wide horizontal card */}
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backfaceVisibility: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                      transform: [{ perspective: 1400 }, { rotateY: backRotate }],
                    },
                  ]}
                >
                  <CylinderProfileCard profile={activeProfile} level={gasLevel} />
                </Animated.View>
              </View>
            </TouchableOpacity>
            <Text style={s.flipHint}>{isFlipped ? 'Tap to show gauge' : 'Tap gauge for profile'}</Text>
          </View>

          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '55' }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {/* Hero action buttons */}
          <View style={s.heroActions}>
            <TouchableOpacity style={s.heroSecondaryBtn} activeOpacity={0.7} onPress={resetLevel}>
              <Text style={s.heroSecondaryBtnText}>Reset</Text>
            </TouchableOpacity>
            {gasLevel === 0 ? (
              <TouchableOpacity
                style={[s.heroPrimaryBtn, { backgroundColor: C.red }]}
                activeOpacity={0.85}
                onPress={() => router.push('/order')}
              >
                <IconSymbol name="cart.fill" size={15} color="#fff" />
                <Text style={s.heroPrimaryBtnText}>Order Refill</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.heroPrimaryBtn} activeOpacity={0.85} onPress={scrollToReminder}>
                <IconSymbol name="bell.fill" size={15} color="#fff" />
                <Text style={s.heroPrimaryBtnText}>Set Reminder</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.heroIconBtn} activeOpacity={0.7}>
              <IconSymbol name="arrow.clockwise" size={18} color={C.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── White content section ── */}
        <View style={s.content} onLayout={(e) => { contentY.current = e.nativeEvent.layout.y; }}>

          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={[s.statNum, daysLeft === 0 && { color: C.red }, { fontFamily: monoFont }]}>{daysLeft}</Text>
              <Text style={s.statLabel}>DAYS LEFT</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statNum, { fontFamily: monoFont }]}>{kgLeft}</Text>
              <Text style={s.statLabel}>KG LEFT</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statNum, { fontFamily: monoFont, color: C.accent }]}>1.8</Text>
              <Text style={s.statLabel}>KG/DAY</Text>
            </View>
          </View>

          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>AI Insights</Text>
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            </View>
            {gasLevel <= 10 && (
              <View style={s.alertBanner}>
                <View style={s.alertIconBox}><Text style={s.alertIconText}>!</Text></View>
                <Text style={s.alertText}>Gas is empty — order a refill immediately.</Text>
              </View>
            )}
            <InsightRow icon="📅" label="PREDICTED EMPTY DATE"
              value={gasLevel === 0 ? 'Already empty' : 'In ~8 days at current usage'}
              valueColor={gasLevel === 0 ? C.red : C.textSub} />
            <InsightRow icon="📈" label="USAGE TREND"
              value="Using 1.8 kg/day on average this week" valueColor={C.orange} />
            <InsightRow icon="💡" label="SMART SUGGESTION"
              value="Order a refill to avoid running out" valueColor={C.muted} />
          </View>

          <View style={s.section} onLayout={(e) => { reminderY.current = e.nativeEvent.layout.y; }}>
            <View style={s.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol name="bell.fill" size={16} color={C.accent} />
                <Text style={s.sectionTitle}>Refill Reminder</Text>
              </View>
            </View>
            {reminderSet ? (
              <View style={s.reminderActive}>
                <View style={s.reminderCheckCircle}>
                  <IconSymbol name="checkmark.circle" size={36} color={C.accent} />
                </View>
                <Text style={s.reminderActiveTitle}>Reminder Active</Text>
                <View style={s.reminderActiveRow}>
                  <IconSymbol name="clock" size={13} color={C.muted} />
                  <Text style={s.reminderActiveDesc}>
                    Notify me{' '}
                    <Text style={{ color: C.accent, fontWeight: '700' }}>{selectedReminder}</Text>
                    {' '}before empty
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReminderSet(false)} activeOpacity={0.7}>
                  <Text style={s.cancelReminderText}>Cancel reminder</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={s.sectionSubtitle}>When should we remind you to refill?</Text>
                <View style={s.reminderGrid}>
                  {REMINDER_OPTS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[s.reminderOpt, selectedReminder === opt && s.reminderOptActive]}
                      onPress={() => setSelectedReminder(opt)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.reminderOptText, selectedReminder === opt && s.reminderOptTextActive]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.reminderBtnRow}>
                  <TouchableOpacity style={[s.getReminderBtn, { flex: 1 }]} onPress={() => setReminderSet(true)} activeOpacity={0.85}>
                    <IconSymbol name="bell.fill" size={16} color="#fff" />
                    <Text style={s.getReminderText}>Get Reminder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.orderRefillBtn} onPress={() => router.push('/order')} activeOpacity={0.85}>
                    <IconSymbol name="cart.fill" size={16} color="#fff" />
                    <Text style={s.getReminderText}>Order Refill</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.demoLabel}>DEMO CONTROLS</Text>
            <View style={s.demoRow}>
              <TouchableOpacity
                style={[s.drainBtn, simulating && { backgroundColor: C.red }]}
                activeOpacity={0.8}
                onPress={simulating ? stopDrain : startDrain}
              >
                <Text style={s.drainBtnText}>{simulating ? '■  Stop' : '▶  Simulate Drain'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.resetIconBtn} activeOpacity={0.7} onPress={resetLevel}>
                <IconSymbol name="arrow.clockwise" size={20} color={C.accent} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 16 }} />
        </View>
      </ScrollView>

      {/* ── Profile Selector Sheet ── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
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
                  <TouchableOpacity
                    style={s.profileRowMain}
                    onPress={() => activateProfile(p.id)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={CYLINDER_IMAGES[p.imageKey] ?? CYLINDER_IMAGES['12.5kg']}
                      style={s.profileRowImage}
                      resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.profileRowName}>{p.name}</Text>
                      <Text style={s.profileRowSize}>
                        {p.customSizeLabel ?? `${p.sizeKg} kg`}
                      </Text>
                    </View>
                    {p.isActive && (
                      <IconSymbol name="checkmark.circle.fill" size={20} color={C.accent} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.profileDeleteBtn}
                    onPress={() => deleteProfile(p.id)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Delete ${p.name}`}
                  >
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
                    <Image
                      source={CYLINDER_IMAGES[opt.key]}
                      style={{ width: 28, height: 28 }}
                      resizeMode="contain"
                    />
                    <Text style={[s.sizeOptText, newSizeOption === opt.key && s.sizeOptTextActive]}>
                      {opt.label}
                    </Text>
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

              {formError !== '' && (
                <Text style={s.formError}>{formError}</Text>
              )}

              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.6 }]}
                onPress={submitNewProfile}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.saveBtnText}>Save Profile</Text>
                )}
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
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  android: { elevation: 3 },
  default: {},
});

const s = StyleSheet.create({
  container: { flexGrow: 1 },

  // Hero
  hero: {
    backgroundColor: C.hero,
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { color: C.heroText, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { color: C.heroSubText, fontSize: 12, marginTop: 2 },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: 130,
  },
  profilePillText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  notifBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  gaugeWrapper: { marginVertical: 8, alignItems: 'center', gap: 6 },
  flipHint: { color: C.dim, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  heroActions: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' },
  heroSecondaryBtn: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 22, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
  },
  heroSecondaryBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  heroPrimaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.accent, borderRadius: 22, paddingVertical: 12,
  },
  heroPrimaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  heroIconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },

  // White content section
  content: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -28, paddingHorizontal: 20, paddingTop: 28,
    gap: 24, ...cardShadow,
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  statDivider: { width: 1, height: 36, backgroundColor: C.border },

  section: {
    gap: 0, borderWidth: 1, borderColor: C.border,
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: C.card, ...cardShadow,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: C.muted, fontSize: 13, paddingHorizontal: 16, paddingBottom: 12 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, backgroundColor: C.accentLight,
    borderWidth: 1, borderColor: C.accent + '40',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  liveText: { color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.red + '12', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: C.red + '30', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4,
  },
  alertIconBox: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.red, justifyContent: 'center', alignItems: 'center',
  },
  alertIconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  alertText: { flex: 1, color: C.red, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  insightRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: C.separator,
  },
  insightIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center',
  },
  insightIcon: { fontSize: 20 },
  insightLabel: { color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 3 },
  insightValue: { fontSize: 13, fontWeight: '500', lineHeight: 18 },

  reminderGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  reminderOpt: {
    flex: 1, minWidth: '44%', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, alignItems: 'center',
  },
  reminderOptActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  reminderOptText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  reminderOptTextActive: { color: C.accent, fontWeight: '700' },
  reminderBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  getReminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14,
  },
  orderRefillBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#D4480A', borderRadius: 14, paddingVertical: 14,
  },
  getReminderText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  reminderActive: {
    alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 10,
  },
  reminderCheckCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accent + '30',
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  reminderActiveTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  reminderActiveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reminderActiveDesc: { color: C.muted, fontSize: 13 },
  cancelReminderText: { color: C.accent, fontSize: 13, textDecorationLine: 'underline', marginTop: 4 },

  gaugePercent: { color: C.text, fontSize: 46, fontWeight: '800', letterSpacing: -2 },
  gaugeLabel: { fontSize: 13, fontWeight: '700' },
  gaugeKg: { color: C.muted, fontSize: 13, marginTop: 1 },

  demoLabel: {
    color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  drainBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accent, borderRadius: 13, paddingVertical: 13,
  },
  drainBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resetIconBtn: {
    width: 48, height: 48, borderRadius: 13,
    backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },

  // Bottom sheet
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    gap: 0,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  sheetEmpty: { color: C.muted, fontSize: 14, textAlign: 'center', marginVertical: 20 },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.separator,
  },
  profileRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 4,
  },
  profileRowImage: { width: 36, height: 36 },
  profileRowName: { color: C.text, fontSize: 14, fontWeight: '700' },
  profileRowSize: { color: C.muted, fontSize: 12, marginTop: 1 },
  profileDeleteBtn: {
    padding: 12,
  },

  addProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5,
    borderColor: C.accent + '60', backgroundColor: C.accentLight,
  },
  addProfileBtnText: { color: C.accent, fontSize: 15, fontWeight: '700' },

  // Add profile form
  fieldLabel: { color: C.textSub, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 15,
  },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeOpt: {
    flex: 1, minWidth: '22%', alignItems: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  sizeOptActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  sizeOptText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  sizeOptTextActive: { color: C.accent, fontWeight: '700' },
  formError: { color: C.red, fontSize: 13, marginTop: 8 },
  saveBtn: {
    marginTop: 20, backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
