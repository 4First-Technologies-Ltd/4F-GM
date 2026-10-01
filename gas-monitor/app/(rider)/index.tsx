import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RiderOrderCard } from '@/components/rider-order-card';
import { advanceOrder, useRiderOrders } from '@/hooks/use-rider-orders';
import { getSavedUser } from '@/lib/storage';
import { isActiveOrder } from '@/lib/riderOrders';
import type { ApiUser, RiderOrder } from '@/lib/api';

const C = {
  bg: '#EDF7ED',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
};

export default function RiderDeliveriesScreen() {
  const { orders, loading, refreshing, error, refresh, reload } = useRiderOrders({ poll: true });
  const [firstName, setFirstName] = useState('');
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSavedUser<ApiUser>().then((u) => setFirstName(u?.name?.split(' ')[0] ?? ''));
    }, []),
  );

  // Out-for-delivery first (already in progress), then oldest assignment first.
  const active = orders
    .filter(isActiveOrder)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'OUT_FOR_DELIVERY' ? -1 : 1;
      return new Date(a.assignedAt ?? a.createdAt).getTime() - new Date(b.assignedAt ?? b.createdAt).getTime();
    });

  async function handleAdvance(order: RiderOrder) {
    setAdvancingId(order.id);
    const changed = await advanceOrder(order);
    if (changed) await reload();
    setAdvancingId(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <View>
          <Text style={s.hello}>{firstName ? `Hi, ${firstName}` : 'Hi there'}</Text>
          <Text style={s.title}>Active deliveries</Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{active.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={active}
          keyExtractor={(o) => o.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} colors={[C.accent]} />}
          ListHeaderComponent={
            error ? (
              <View style={s.errBox}>
                <Text style={s.errText}>{error}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <IconSymbol name="shippingbox.fill" size={32} color={C.accent} />
              </View>
              <Text style={s.emptyTitle}>No active deliveries</Text>
              <Text style={s.emptyBody}>
                New assignments from vendors will show up here. Pull down to refresh.
              </Text>
              <TouchableOpacity style={s.refreshBtn} onPress={refresh} activeOpacity={0.8}>
                <Text style={s.refreshText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          renderItem={({ item }) => (
            <RiderOrderCard
              order={item}
              onPress={() => router.push({ pathname: '/rider-order/[id]', params: { id: item.id } })}
              onAdvance={() => handleAdvance(item)}
              advancing={advancingId === item.id}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  hello: { color: C.muted, fontSize: 13, fontWeight: '600' },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  countBadge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },

  errBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },

  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  emptyBody: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  refreshBtn: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: C.accentLight,
  },
  refreshText: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
