import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { analyticsApi, type Analytics, type OrderStatus } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  clay: '#A9714C',
  track: '#EEF5EE',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

/** 12,500 → ₦12.5k so six monthly bars stay readable on a phone. */
const nairaShort = (n: number) => (n >= 1000 ? '₦' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '₦' + Math.round(n));

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.kpi, cardShadow]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/**
 * Same figures as the website's Analytics page, drawn with plain Views (no chart library on mobile).
 */
export function AnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await analyticsApi.get());
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Could not load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  }

  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.errTitle}>Couldn&apos;t load analytics</Text>
        <Text style={s.errSub}>{error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); void load(); }} activeOpacity={0.8}>
          <Text style={s.retry}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isVendor = data.role === 'VENDOR';
  const total = data.role === 'VENDOR' ? data.totalRevenue : data.totalSpend;
  const monthly = data.role === 'VENDOR'
    ? data.monthly.map((m) => ({ month: m.month, value: m.revenue }))
    : data.monthly.map((m) => ({ month: m.month, value: m.spend }));
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.value));
  const maxStatus = Math.max(1, ...data.statusBreakdown.map((b) => b.count));

  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.accent} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <Text style={s.intro}>
        {isVendor ? 'Revenue and order trends for your business.' : 'Your spending and order activity over time.'}
      </Text>

      <View style={s.kpiRow}>
        <Kpi label={isVendor ? 'Total revenue' : 'Total spend'} value={naira(total)} />
        <Kpi label="Total orders" value={String(data.totalOrders)} />
      </View>
      <View style={s.kpiRow}>
        <Kpi label="Avg. order value" value={naira(data.avgOrderValue)} />
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>{isVendor ? 'Revenue' : 'Spend'} — last 6 months</Text>
        {monthly.every((m) => m.value === 0) ? (
          <Text style={s.empty}>No activity in the last 6 months.</Text>
        ) : (
          <View style={s.chart}>
            {monthly.map((m) => (
              <View key={m.month} style={s.barCol}>
                <Text style={s.barValue} numberOfLines={1}>{m.value > 0 ? nairaShort(m.value) : ''}</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { height: `${Math.max(2, (m.value / maxMonthly) * 100)}%` }]} />
                </View>
                <Text style={s.barLabel}>{m.month}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>Orders by status</Text>
        {data.statusBreakdown.every((b) => b.count === 0) ? (
          <Text style={s.empty}>No orders yet.</Text>
        ) : (
          data.statusBreakdown.map((b) => (
            <View key={b.status} style={s.hRow}>
              <Text style={s.hLabel}>{STATUS_LABEL[b.status] ?? b.status}</Text>
              <View style={s.hTrack}>
                <View style={[s.hFill, { width: `${(b.count / maxStatus) * 100}%` }]} />
              </View>
              <Text style={s.hCount}>{b.count}</Text>
            </View>
          ))
        )}
      </View>

      {data.role === 'VENDOR' && (
        <View style={[s.card, cardShadow]}>
          <Text style={s.cardTitle}>Top listings</Text>
          {data.topListings.length === 0 ? (
            <Text style={s.empty}>No orders yet — top listings will appear here.</Text>
          ) : (
            data.topListings.map((l) => (
              <View key={l.id} style={s.listingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.listingName} numberOfLines={1}>{l.name}</Text>
                  <Text style={s.listingSub}>{l.orders} order{l.orders === 1 ? '' : 's'}</Text>
                </View>
                <Text style={s.listingRevenue}>{naira(l.revenue)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  errTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  errSub: { color: C.muted, fontSize: 14, textAlign: 'center' },
  retry: { color: C.accent, fontWeight: '700', marginTop: 4 },

  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  intro: { color: C.muted, fontSize: 13 },

  kpiRow: { flexDirection: 'row', gap: 12 },
  kpi: {
    flex: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 16, gap: 6,
  },
  kpiLabel: { color: C.muted, fontSize: 12, fontWeight: '600' },
  kpiValue: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },

  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, gap: 12 },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 13 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 170 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barValue: { color: C.muted, fontSize: 9, fontWeight: '600' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: C.track, borderRadius: 8, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: C.accent, borderRadius: 8 },
  barLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },

  hRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hLabel: { width: 104, color: C.text, fontSize: 12, fontWeight: '500' },
  hTrack: { flex: 1, height: 10, backgroundColor: C.track, borderRadius: 5, overflow: 'hidden' },
  hFill: { height: '100%', backgroundColor: C.clay, borderRadius: 5 },
  hCount: { width: 28, textAlign: 'right', color: C.text, fontSize: 12, fontWeight: '700' },

  listingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border,
  },
  listingName: { color: C.text, fontSize: 14, fontWeight: '600' },
  listingSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  listingRevenue: { color: C.accent, fontSize: 14, fontWeight: '800' },
});
