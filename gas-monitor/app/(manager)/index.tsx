import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { staffApi, ManagerOrder, StaffBranch } from '@/lib/api';
import { AssignRiderSheet } from '@/components/assign-rider-sheet';

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
  CONFIRMED: 'Ready to dispatch',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

type Next = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export default function ManagerOrdersScreen() {
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ManagerOrder | null>(null);

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

  function advance(order: ManagerOrder, status: Next, label: string) {
    Alert.alert(label, `Order #${order.id.slice(0, 8).toUpperCase()} for ${order.consumer.name}.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: label,
        style: status === 'CANCELLED' ? 'destructive' : 'default',
        onPress: async () => {
          setBusyId(order.id);
          try {
            await staffApi.updateOrderStatus(order.id, status);
            await load();
          } catch (err) {
            Alert.alert('Could not update order', err instanceof Error ? err.message : 'Please try again.');
            await load();
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  // PENDING orders are unpaid; payment confirms them, so they never show here.
  const visible = orders.filter(
    (o) => o.status !== 'PENDING' && (filter === 'all' || o.branch?.id === filter),
  );
  const active = visible.filter((o) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY');
  const done = visible.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED').slice(0, 20);

  function card(o: ManagerOrder, isActive: boolean) {
    const busy = busyId === o.id;
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
        ) : isActive ? (
          <Text style={[s.muted, { color: C.amber }]}>No rider assigned</Text>
        ) : null}

        {isActive && (
          <View style={s.actions}>
            {busy ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <>
                <TouchableOpacity onPress={() => setAssigning(o)}>
                  <Text style={s.link}>{o.rider ? 'Change rider' : 'Assign rider'}</Text>
                </TouchableOpacity>
                {o.status === 'CONFIRMED' && (
                  <TouchableOpacity onPress={() => advance(o, 'OUT_FOR_DELIVERY', 'Start delivery')}>
                    <Text style={s.link}>Start delivery</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => advance(o, 'DELIVERED', 'Mark delivered')}>
                  <Text style={s.link}>Mark delivered</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => advance(o, 'CANCELLED', 'Cancel order')}>
                  <Text style={[s.link, { color: C.red }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
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

      <AssignRiderSheet
        order={assigning}
        api={staffApi}
        onClose={() => setAssigning(null)}
        onAssigned={async () => { setAssigning(null); await load(); }}
      />
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
