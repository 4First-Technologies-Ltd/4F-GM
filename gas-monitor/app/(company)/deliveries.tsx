import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { companyApi, FleetDelivery } from '@/lib/api';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', border: '#E0EEE0', text: '#1A2E1A', muted: '#7A9A7A',
  accent: '#2D7450', accentLight: '#E8F5E8', red: '#D32F2F', amber: '#B45309', amberLight: '#FEF3E2',
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Awaiting payment', color: C.muted, bg: '#F5FBF5' },
  CONFIRMED: { label: 'Assigned', color: C.amber, bg: C.amberLight },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: C.accent, bg: C.accentLight },
  DELIVERED: { label: 'Delivered', color: C.accent, bg: C.accentLight },
  CANCELLED: { label: 'Cancelled', color: C.red, bg: '#FFF0F0' },
};

/** Read-only view of what the fleet's riders are delivering. */
export default function FleetDeliveriesScreen() {
  const [orders, setOrders] = useState<FleetDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await companyApi.getDeliveries());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load deliveries.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY');
  const done = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED').slice(0, 30);

  const card = (o: FleetDelivery) => {
    const st = STATUS[o.status] ?? STATUS.PENDING;
    return (
      <View key={o.id} style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>#{o.id.slice(0, 8).toUpperCase()}</Text>
          <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.color }]}>{st.label}</Text></View>
        </View>
        <Text style={s.line}>{o.quantity} × {o.cylinderSize}{o.vendor ? ` · ${o.vendor.businessName}` : ''}</Text>
        <Text style={s.muted}>{o.rider ? `Rider: ${o.rider.user.name}` : 'No rider'} · for {o.consumer.name}</Text>
        <Text style={s.muted}>{o.deliveryAddress}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title}>Deliveries</Text>
        <Text style={s.sub}>What your riders are delivering</Text>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
        >
          {!!error && <View style={s.errBox}><Text style={s.errText}>{error}</Text></View>}
          {active.length === 0 && !error && <Text style={s.muted}>No active deliveries right now.</Text>}
          {active.map(card)}
          {done.length > 0 && <Text style={s.section}>Recently finished</Text>}
          {done.map(card)}
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
  body: { paddingHorizontal: 20, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  line: { color: C.text, fontSize: 14 },
  muted: { color: C.muted, fontSize: 13 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
});
