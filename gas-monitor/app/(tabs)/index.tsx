import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

const monoFont = Fonts?.mono ?? 'monospace';

// ── Color palette extracted from reference image ─────────────────────────────
const C = {
  // Hero / top section
  hero: '#EDF7ED',
  heroDark: '#2D7450',
  heroText: '#1A2E1A',
  heroSubText: '#7A9A7A',

  // Gauge
  gaugeOuter: '#FFFFFF',
  gaugeTrack: '#C0DCC0',

  // White content section
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  separator: '#EEF7EE',

  // Text on white backgrounds
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  muted: '#7A9A7A',
  dim: '#AECAAE',

  // Accent
  accent: '#2D7450',
  accentLight: '#E8F5E8',

  // Status
  red: '#D32F2F',
  orange: '#E65100',
  yellow: '#F9A825',
};

const MAX_KG = 12.5;

// ── Gauge color helpers ───────────────────────────────────────────────────────
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
const GAUGE_TOTAL = 48;   // number of bar segments
const GAUGE_ARC   = 300;  // degrees of arc (300° = classic fuel gauge)
const GAUGE_START = 210;  // starting angle in degrees clockwise from 12 o'clock (≈ 7 o'clock)
const GAUGE_BAR_H = 18;   // bar height (radial, sets stroke thickness)
const GAUGE_BAR_W = 7;    // bar width (tangential)
const GAUGE_BAR_R = 2;    // bar border radius

const innerDiskShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 14 },
  android: { elevation: 8 },
  default: {},
});

function GaugeRing({ percentage, size = 210 }: { percentage: number; size?: number }) {
  const p = Math.max(0, Math.min(100, percentage));
  const midR  = size / 2 - GAUGE_BAR_H / 2;         // radial distance from center to bar midpoint
  const innerD = 2 * (midR - GAUGE_BAR_H / 2 - 4);  // inner white disk diameter
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

      {/* Inner white disk */}
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
        <Text style={[s.gaugeKg, { fontFamily: monoFont }]}>{((p / 100) * MAX_KG).toFixed(1)} kg</Text>
      </View>
    </View>
  );
}

// ── Reading row (white section list) ─────────────────────────────────────────
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
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const gaugeY = useRef(0);

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
    }, 240); // 100 steps × 80ms = 8 seconds
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

  useEffect(() => {
    return () => {
      if (simRef.current) clearInterval(simRef.current);
    };
  }, []);

  const { label: statusLabel, color: statusColor } = getStatus(gasLevel);
  const daysLeft = Math.round((gasLevel / 100) * 30);
  const kgLeft = ((gasLevel / 100) * MAX_KG).toFixed(1);

  return (
    // SafeAreaView uses hero green so status bar area blends with the hero section
    <SafeAreaView style={{ flex: 1, backgroundColor: C.hero }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero section (green background) ── */}
        <View style={s.hero}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>4F G-Monitor</Text>
              <Text style={s.headerSub}>FG-2024-0047 · Connected</Text>
            </View>
            <TouchableOpacity
              style={s.notifBtn}
              activeOpacity={0.7}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <IconSymbol name="bell.fill" size={20} color={C.accent} />
            </TouchableOpacity>
          </View>

          {/* Gauge */}
          <View
            style={s.gaugeWrapper}
            onLayout={(e) => { gaugeY.current = e.nativeEvent.layout.y; }}
          >
            <GaugeRing percentage={gasLevel} />
          </View>

          {/* Status badge */}
          <View style={[s.statusBadge, {
            backgroundColor: statusColor + '18',
            borderColor: statusColor + '55',
          }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {/* Hero action buttons */}
          <View style={s.heroActions}>
            <TouchableOpacity style={s.heroSecondaryBtn} activeOpacity={0.7}>
              <Text style={s.heroSecondaryBtnText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.heroPrimaryBtn}
              activeOpacity={0.85}
            >
              <IconSymbol name="bell.fill" size={15} color="#fff" />
              <Text style={s.heroPrimaryBtnText}>Set Reminder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.heroIconBtn} activeOpacity={0.7}>
              <IconSymbol name="arrow.clockwise" size={18} color={C.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── White content section ── */}
        <View style={s.content}>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={[s.statNum, daysLeft === 0 && { color: C.red }, { fontFamily: monoFont }]}>
                {daysLeft}
              </Text>
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

          {/* AI Insights */}
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
                <View style={s.alertIconBox}>
                  <Text style={s.alertIconText}>!</Text>
                </View>
                <Text style={s.alertText}>
                  Gas is empty — order a refill immediately.
                </Text>
              </View>
            )}

            <InsightRow
              icon="📅"
              label="PREDICTED EMPTY DATE"
              value={gasLevel === 0 ? 'Already empty' : 'In ~8 days at current usage'}
              valueColor={gasLevel === 0 ? C.red : C.textSub}
            />
            <InsightRow
              icon="📈"
              label="USAGE TREND"
              value="Using 1.8 kg/day on average this week"
              valueColor={C.orange}
            />
            <InsightRow
              icon="💡"
              label="SMART SUGGESTION"
              value="Order a refill to avoid running out"
              valueColor={C.muted}
            />
          </View>

          {/* Refill Reminder */}
          <View style={s.section}>
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
                <TouchableOpacity
                  style={s.getReminderBtn}
                  onPress={() => setReminderSet(true)}
                  activeOpacity={0.85}
                >
                  <IconSymbol name="bell.fill" size={16} color="#fff" />
                  <Text style={s.getReminderText}>Get Reminder</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Demo Controls */}
          <View style={s.section}>
            <Text style={s.demoLabel}>DEMO CONTROLS</Text>
            <View style={s.demoRow}>
              <TouchableOpacity
                style={[s.drainBtn, simulating && { backgroundColor: C.red }]}
                activeOpacity={0.8}
                onPress={simulating ? stopDrain : startDrain}
              >
                <Text style={s.drainBtnText}>
                  {simulating ? '■  Stop' : '▶  Simulate Drain'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.resetIconBtn} activeOpacity={0.7} onPress={resetLevel}>
                <IconSymbol name="arrow.clockwise" size={20} color={C.accent} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 16 }} />
        </View>

      </ScrollView>
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
  notifBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeWrapper: { marginVertical: 8 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  heroActions: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' },
  heroSecondaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroSecondaryBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  heroPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 22,
    paddingVertical: 12,
  },
  heroPrimaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  heroIconBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // White content section — rounded top, sits on top of hero bottom padding
  content: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 24,
    ...cardShadow,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  statDivider: { width: 1, height: 36, backgroundColor: C.border },

  // Sections
  section: {
    gap: 0,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: C.card,
    ...cardShadow,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: C.muted, fontSize: 13, paddingHorizontal: 16, paddingBottom: 12 },
  // Insights
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.red + '12',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.red + '30',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  alertIconBox: {
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertIconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  alertText: { flex: 1, color: C.red, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.separator,
  },
  insightIconBox: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightIcon: { fontSize: 20 },
  insightLabel: { color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 3 },
  insightValue: { fontSize: 13, fontWeight: '500', lineHeight: 18 },

  // Reminder
  reminderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  reminderOpt: {
    flex: 1,
    minWidth: '44%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
  },
  reminderOptActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  reminderOptText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  reminderOptTextActive: { color: C.accent, fontWeight: '700' },
  getReminderBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  getReminderText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Reminder active state
  reminderActive: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 10,
  },
  reminderCheckCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  reminderActiveTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  reminderActiveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reminderActiveDesc: { color: C.muted, fontSize: 13 },
  cancelReminderText: {
    color: C.accent,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },

  // Gauge center text
  gaugePercent: { color: C.text, fontSize: 46, fontWeight: '800', letterSpacing: -2 },
  gaugeLabel: { fontSize: 13, fontWeight: '700' },
  gaugeKg: { color: C.muted, fontSize: 13, marginTop: 1 },

  // Demo
  demoLabel: {
    color: C.dim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  drainBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
    borderRadius: 13,
    paddingVertical: 13,
  },
  drainBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resetIconBtn: {
    width: 48, height: 48,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
