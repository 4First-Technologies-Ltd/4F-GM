import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, VendorOrder } from '@/lib/api';
import { useDrawer } from './_layout';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

type Period = 'ALL' | 'MONTH' | 'WEEK';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'ALL', label: 'All Time' },
  { id: 'MONTH', label: 'This Month' },
  { id: 'WEEK', label: 'This Week' },
];

const GAS_LABELS: Record<string, string> = {
  COOKING: 'Cooking Gas',
  MEDICAL: 'Medical O₂',
  INDUSTRIAL: 'Industrial',
  BULK: 'Bulk LPG',
  OTHER: 'Other',
};

function fmtPrice(n: number) {
  return '₦' + Math.round(n).toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function inPeriod(iso: string, period: Period) {
  if (period === 'ALL') return true;
  const d = new Date(iso);
  const now = new Date();
  if (period === 'MONTH') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return d >= weekAgo;
}

// ── Payout row ────────────────────────────────────────────────────────────────

function PayoutRow({ order }: { order: VendorOrder }) {
  const gasLabel = order.listing.customName ?? GAS_LABELS[order.listing.gasType] ?? order.listing.gasType;
  return (
    <View style={[pr.card, cardShadow]}>
      <View style={pr.iconCircle}>
        <IconSymbol name="checkmark.circle.fill" size={18} color={C.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={pr.customer} numberOfLines={1}>{order.consumer.name}</Text>
        <Text style={pr.meta} numberOfLines={1}>
          {gasLabel} · {order.cylinderSize} × {order.quantity} · {fmtDate(order.createdAt)}
        </Text>
      </View>
      <Text style={pr.amount}>+{fmtPrice(order.totalAmount)}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const { openDrawer } = useDrawer();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [period, setPeriod] = useState<Period>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  async function loadOrders() {
    try {
      const data = await vendorApi.getOrders();
      setOrders(data);
    } catch {
      // silently fail — empty state handles this
    }
  }

  useFocusEffect(useCallback(() => { loadOrders(); }, []));

  async function handleRefresh() {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }

  const stats = useMemo(() => {
    const inRange = orders.filter((o) => inPeriod(o.createdAt, period));
    const delivered = inRange
      .filter((o) => o.status === 'DELIVERED')
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const pending = inRange.filter((o) => o.status === 'CONFIRMED');

    const totalEarnings = delivered.reduce((sum, o) => sum + o.totalAmount, 0);
    const pendingPayout = pending.reduce((sum, o) => sum + o.totalAmount, 0);
    const completedCount = delivered.length;
    const avgOrder = completedCount > 0 ? totalEarnings / completedCount : 0;

    return { delivered, totalEarnings, pendingPayout, completedCount, avgOrder };
  }, [orders, period]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Earnings</Text>
          <Text style={s.headerSub}>Track your revenue</Text>
        </View>
      </View>

      {/* Period pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={s.filterScroll}
      >
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[s.pill, period === p.id && s.pillActive]}
            onPress={() => setPeriod(p.id)}
            activeOpacity={0.7}
          >
            <Text style={[s.pillText, period === p.id && s.pillTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />}
      >
        {orders.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <IconSymbol name="chart.bar.fill" size={34} color={C.dim} />
            </View>
            <Text style={s.emptyTitle}>No earnings yet</Text>
            <Text style={s.emptySubtitle}>
              Revenue from delivered orders will show up here once customers start ordering from you.
            </Text>
          </View>
        ) : (
          <>
            {/* Hero total */}
            <View style={[s.heroCard, cardShadow]}>
              <View style={s.heroTopRow}>
                <Text style={s.heroLabel}>Total Earnings</Text>
                <View style={s.heroIconCircle}>
                  <IconSymbol name="chart.line.uptrend.xyaxis" size={16} color="#fff" />
                </View>
              </View>
              <Text style={s.heroValue}>{fmtPrice(stats.totalEarnings)}</Text>
              <Text style={s.heroCaption}>
                from {stats.completedCount} delivered order{stats.completedCount !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Stat grid */}
            <View style={s.statRow}>
              <View style={[s.statCard, cardShadow]}>
                <IconSymbol name="checkmark.circle.fill" size={18} color={C.accent} />
                <Text style={s.statValue}>{stats.completedCount}</Text>
                <Text style={s.statLabel}>Completed</Text>
              </View>
              <View style={[s.statCard, cardShadow]}>
                <IconSymbol name="tag.fill" size={18} color={C.accent} />
                <Text style={s.statValue}>{fmtPrice(stats.avgOrder)}</Text>
                <Text style={s.statLabel}>Avg. Order</Text>
              </View>
              <View style={[s.statCard, cardShadow]}>
                <IconSymbol name="clock.fill" size={18} color="#B45309" />
                <Text style={s.statValue}>{fmtPrice(stats.pendingPayout)}</Text>
                <Text style={s.statLabel}>Pending</Text>
              </View>
            </View>

            {/* Recent payouts */}
            <Text style={s.sectionTitle}>Recent Payouts</Text>
            {stats.delivered.length === 0 ? (
              <View style={s.emptyInline}>
                <Text style={s.emptyInlineText}>
                  No delivered orders {period === 'ALL' ? 'yet' : 'in this period'}.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {stats.delivered.map((order) => (
                  <PayoutRow key={order.id} order={order} />
                ))}
              </View>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Payout row styles ─────────────────────────────────────────────────────────
const pr = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customer: { color: C.text, fontSize: 14, fontWeight: '700' },
  meta: { color: C.muted, fontSize: 12, marginTop: 1 },
  amount: { color: C.accent, fontSize: 15, fontWeight: '800' },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  menuBtn: {
    width: 44, height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 44,
    marginBottom: 14,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  pillActive: { borderColor: C.accent, backgroundColor: C.accent },
  pillText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#fff', fontWeight: '700' },

  body: { paddingHorizontal: 20, gap: 14 },

  heroCard: {
    backgroundColor: C.accent,
    borderRadius: 22,
    padding: 20,
    gap: 4,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: '#DCEFE4', fontSize: 13, fontWeight: '600' },
  heroIconCircle: {
    width: 30, height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  heroCaption: { color: '#CBE6D6', fontSize: 12.5, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    gap: 6,
  },
  statValue: { color: C.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  statLabel: { color: C.muted, fontSize: 11.5, fontWeight: '600' },

  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '800', marginTop: 4 },

  emptyInline: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyInlineText: { color: C.muted, fontSize: 13 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 12,
    gap: 10,
  },
  emptyIconCircle: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
