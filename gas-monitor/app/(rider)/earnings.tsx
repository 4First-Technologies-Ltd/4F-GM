import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { bankApi, riderApi, RiderEarningsResponse } from '@/lib/api';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
  amber: '#B26A00',
  amberBg: '#FFF4E0',
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  PAID: { text: 'Paid', color: C.accent, bg: C.accentLight },
  PROCESSING: { text: 'On its way', color: '#1565C0', bg: '#E3F0FF' },
  PENDING: { text: 'Waiting to be sent', color: C.amber, bg: C.amberBg },
  FAILED: { text: 'Will be retried', color: C.amber, bg: C.amberBg },
};

export default function RiderEarningsScreen() {
  const [data, setData] = useState<RiderEarningsResponse | null>(null);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    setError('');
    try {
      const [earnings, account] = await Promise.all([
        riderApi.earnings(),
        bankApi.getAccount().catch(() => undefined),
      ]);
      setData(earnings);
      setHasAccount(account === undefined ? null : !!account);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your earnings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <Text style={s.title}>Earnings</Text>
        <Text style={s.subtitle}>Your share of the delivery fee on each order you deliver</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={data?.earnings ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.accent} colors={[C.accent]} />
          }
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 14 }}>
              {hasAccount === false && (
                <TouchableOpacity style={s.notice} activeOpacity={0.8} onPress={() => router.push('/(rider)/profile')}>
                  <Text style={s.noticeText}>
                    You have not added a bank account yet, so we cannot pay you. Tap to add one on your profile.
                    Anything waiting is sent once you do.
                  </Text>
                </TouchableOpacity>
              )}
              {!!error && (
                <View style={s.errBox}>
                  <Text style={s.errText}>{error}</Text>
                </View>
              )}
              {data && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Paid to you</Text>
                    <Text style={s.statValue}>{naira(data.totals.paid)}</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>On its way</Text>
                    <Text style={s.statValue}>{naira(data.totals.pending)}</Text>
                  </View>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            !error ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <IconSymbol name="tag.fill" size={32} color={C.accent} />
                </View>
                <Text style={s.emptyTitle}>No earnings yet</Text>
                <Text style={s.emptyBody}>You earn a share of the delivery fee each time you mark an order delivered.</Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const st = STATUS[item.status] ?? { text: item.status, color: C.muted, bg: C.accentLight };
            return (
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.amount}>{naira(item.amount)}</Text>
                  <Text style={s.when}>
                    {new Date(item.paidAt ?? item.createdAt).toLocaleDateString()} · Order {item.orderId.slice(0, 8)}
                  </Text>
                </View>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Text style={[s.badgeText, { color: st.color }]}>{st.text}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  notice: { backgroundColor: C.amberBg, borderRadius: 12, padding: 14 },
  noticeText: { color: C.amber, fontSize: 13, lineHeight: 18 },
  errBox: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  statLabel: { fontSize: 12, color: C.muted },
  statValue: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 4 },
  row: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  amount: { fontSize: 16, fontWeight: '700', color: C.text },
  when: { fontSize: 12, color: C.muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 14 },
  emptyBody: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6 },
});
