import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, VendorEarningsResponse } from '@/lib/api';
import { useDrawer } from './_layout';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
  amber: '#B26A00',
  amberBg: '#FFF4E0',
  blue: '#1565C0',
  blueBg: '#E3F0FF',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  SETTLED: { text: 'Paid at checkout', color: C.accent, bg: C.accentLight },
  PAID: { text: 'Paid out', color: C.accent, bg: C.accentLight },
  IN_PAYOUT: { text: 'Payout on its way', color: C.blue, bg: C.blueBg },
  AVAILABLE: { text: 'Awaiting payout', color: C.amber, bg: C.amberBg },
};

export default function EarningsScreen() {
  const { openDrawer } = useDrawer();
  const [data, setData] = useState<VendorEarningsResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await vendorApi.earnings());
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your earnings.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const totals = data?.totals;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Earnings</Text>
          <Text style={s.headerSub}>After commission, delivery fee excluded</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />}
      >
        {!!error && (
          <View style={s.errBox}>
            <Text style={s.errText}>{error}</Text>
          </View>
        )}

        {data && !data.payoutAccount && (
          <TouchableOpacity style={s.notice} activeOpacity={0.8} onPress={() => router.push('/(vendor)/profile')}>
            <Text style={s.noticeText}>
              You have not added a payout account yet, so we cannot pay you. Tap to add your bank account on your profile.
            </Text>
          </TouchableOpacity>
        )}
        {data?.payoutAccount && (
          <Text style={s.acct}>
            Paid to {data.payoutAccount.accountName} · {data.payoutAccount.bankName} ••••{data.payoutAccount.last4}
          </Text>
        )}

        {totals && (
          <>
            <View style={[s.heroCard, cardShadow]}>
              <Text style={s.heroLabel}>Paid to you</Text>
              <Text style={s.heroValue}>{naira(totals.settled + totals.paidOut)}</Text>
              <Text style={s.heroCaption}>
                from {totals.orders} delivered order{totals.orders !== 1 ? 's' : ''}
              </Text>
            </View>

            <View style={s.statRow}>
              <View style={[s.statCard, cardShadow]}>
                <Text style={s.statValue}>{naira(totals.settled)}</Text>
                <Text style={s.statLabel}>Paid at checkout</Text>
              </View>
              <View style={[s.statCard, cardShadow]}>
                <Text style={s.statValue}>{naira(totals.awaitingPayout)}</Text>
                <Text style={s.statLabel}>Awaiting payout</Text>
              </View>
              <View style={[s.statCard, cardShadow]}>
                <Text style={s.statValue}>{naira(totals.commission)}</Text>
                <Text style={s.statLabel}>Commission</Text>
              </View>
            </View>
          </>
        )}

        {data && data.earnings.length === 0 && !error && (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <IconSymbol name="chart.bar.fill" size={34} color={C.dim} />
            </View>
            <Text style={s.emptyTitle}>No earnings yet</Text>
            <Text style={s.emptySubtitle}>Earnings appear here once an order you fulfilled is delivered.</Text>
          </View>
        )}

        {data && data.earnings.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Delivered orders</Text>
            <View style={{ gap: 10 }}>
              {data.earnings.map((e) => {
                const st = STATUS[e.status] ?? { text: e.status, color: C.muted, bg: C.accentLight };
                return (
                  <View key={e.id} style={[s.row, cardShadow]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.rowAmount}>{naira(e.netAmount)}</Text>
                      <Text style={s.rowMeta} numberOfLines={2}>
                        {naira(e.grossAmount)} gas − {naira(e.commissionAmount)} commission ({e.commissionPercent}%)
                      </Text>
                      <Text style={s.rowMeta} numberOfLines={1}>
                        {e.order.cylinderSize} × {e.order.quantity} · {fmtDate(e.createdAt)}
                      </Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: st.bg }]}>
                      <Text style={[s.badgeText, { color: st.color }]}>{st.text}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

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

  body: { paddingHorizontal: 20, gap: 14 },

  errBox: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13 },
  notice: { backgroundColor: C.amberBg, borderRadius: 12, padding: 14 },
  noticeText: { color: C.amber, fontSize: 13, lineHeight: 18 },
  acct: { color: C.muted, fontSize: 12.5 },

  heroCard: { backgroundColor: C.accent, borderRadius: 22, padding: 20, gap: 4 },
  heroLabel: { color: '#DCEFE4', fontSize: 13, fontWeight: '600' },
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
    gap: 4,
  },
  statValue: { color: C.text, fontSize: 15, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 11.5, fontWeight: '600' },

  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  row: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowAmount: { color: C.text, fontSize: 16, fontWeight: '800' },
  rowMeta: { color: C.muted, fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 120 },
  badgeText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIconCircle: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptySubtitle: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 6 },
});
