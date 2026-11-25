import { NotificationBell } from '@/components/notification-bell';
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { staffApi, ManagerOrder, StaffBranch } from '@/lib/api';
import { AcceptRejectActions } from '@/components/accept-reject-actions';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', surface: '#F5FBF5', border: '#E0EEE0', text: '#1A2E1A',
  muted: '#7A9A7A', accent: '#2D7450', accentLight: '#E8F5E8', red: '#D32F2F',
  amber: '#B45309', amberLight: '#FEF3E2',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Needs accepting',
  ACCEPTED: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/**
 * A branch manager's orders. They accept or reject paid orders; riders then
 * choose their own jobs from the pool, so there is no rider assignment here.
 */
export default function ManagerOrdersScreen() {
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, o] = await Promise.all([staffApi.me(), staffApi.getOrders()]);
      setBranches(b);
      setOrders(o);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // PENDING orders are unpaid; payment confirms them, so they never show here.
  const visible = orders.filter(
    (o) => o.status !== 'PENDING' && (filter === 'all' || o.branch?.id === filter),
  );
  // Orders waiting to be accepted come first.
  const active = visible
    .filter((o) => o.status === 'CONFIRMED' || o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY')
    .sort((a, b) => Number(b.status === 'CONFIRMED') - Number(a.status === 'CONFIRMED'));
  const done = visible.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED').slice(0, 20);

  function card(o: ManagerOrder, isActive: boolean) {
    return (
      <View key={o.id} style={[s.card, cardShadow]}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>#{o.id.slice(0, 8).toUpperCase()}</Text>
          <View style={[s.pill, o.status === 'CANCELLED' && { backgroundColor: '#FFF0F0' }]}>
            <Text style={[s.pillText, o.status === 'CANCELLED' && { color: C.red }]}>{STATUS_LABEL[o.status]}</Text>
          </View>
        </View>
        <Text style={s.line}>{o.quantity} × {o.cylinderSize} · ₦{o.totalAmount.toLocaleString()}</Text>
        {branches.length > 1 && !!o.branch && <Text style={s.muted}>{o.branch.name}</Text>}
        <Text style={s.line}>{o.consumer.name}</Text>
        {!!o.consumer.phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.consumer.phone}`)}>
            <Text style={[s.line, { color: C.accent, fontWeight: '700' }]}>{o.consumer.phone}</Text>
          </TouchableOpacity>
        )}
        <Text style={s.muted}>{o.deliveryAddress}</Text>
        {o.rider ? (
          <Text style={s.muted}>Rider: {o.rider.user.name} · {o.rider.phone}</Text>
        ) : isActive && o.status === 'ACCEPTED' ? (
          <Text style={[s.muted, { color: C.amber }]}>Waiting for a rider to take it</Text>
        ) : null}

        {isActive && o.status === 'CONFIRMED' && (
          <View style={{ marginTop: 6 }}>
            <AcceptRejectActions orderId={o.id} api={staffApi} onDone={load} />
          </View>
        )}
        {isActive && o.status === 'ACCEPTED' && !o.rider && (
          <View style={{ marginTop: 6 }}>
            <AcceptRejectActions orderId={o.id} api={staffApi} onDone={load} canAccept={false} />
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={{ position: 'absolute', right: 16, top: 8 }}>
          <NotificationBell />
        </View>
        <Text style={s.title}>Orders</Text>
        <Text style={s.sub}>
          {branches.length === 0 ? 'Waiting for a branch invite' : branches.map((b) => b.name).join(' · ')}
        </Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
        >
          {!!error && <View style={s.errBox}><Text style={s.errText}>{error}</Text></View>}

          {branches.length === 0 && !error && (
            <View style={s.noteBox}>
              <Text style={s.noteText}>
                You are not assigned to a branch yet. Ask the vendor to invite {'‘'}your email{'’'} from their
                Branches screen, then pull down to refresh.
              </Text>
            </View>
          )}

          {branches.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: 'all', name: 'All branches' }, ...branches].map((b) => {
                const on = filter === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setFilter(b.id)}
                    style={[s.chip, on && { borderColor: C.accent, backgroundColor: C.accentLight }]}
                  >
                    <Text style={[s.chipText, on && { color: C.accent }]}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {branches.length > 0 && active.length === 0 && (
            <View style={s.noteBox}><Text style={s.noteText}>No active orders right now.</Text></View>
          )}
          {active.map((o) => card(o, true))}

          {done.length > 0 && <Text style={s.section}>Recently finished</Text>}
          {done.map((o) => card(o, false))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, gap: 14 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  line: { color: C.text, fontSize: 14 },
  muted: { color: C.muted, fontSize: 13 },
  pill: { backgroundColor: C.accentLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: C.accent, fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10, alignItems: 'center' },
  link: { color: C.accent, fontSize: 14, fontWeight: '700' },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
  noteBox: { backgroundColor: C.amberLight, borderRadius: 12, padding: 12 },
  noteText: { color: C.amber, fontSize: 13 },
});
