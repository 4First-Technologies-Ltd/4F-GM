import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RiderOrderCard } from '@/components/rider-order-card';
import { useRiderOrders } from '@/hooks/use-rider-orders';
import { isHistoryOrder } from '@/lib/riderOrders';

const C = {
  bg: '#EDF7ED',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
};

export default function RiderHistoryScreen() {
  const { orders, loading, refreshing, error, refresh } = useRiderOrders();

  const history = useMemo(
    () =>
      orders
        .filter(isHistoryOrder)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [orders],
  );
  const deliveredCount = history.filter((o) => o.status === 'DELIVERED').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <View>
          <Text style={s.title}>History</Text>
          <Text style={s.subtitle}>{deliveredCount} delivered</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={history}
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
                <IconSymbol name="clock.fill" size={32} color={C.accent} />
              </View>
              <Text style={s.emptyTitle}>No past deliveries yet</Text>
              <Text style={s.emptyBody}>Completed and cancelled orders will appear here.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          renderItem={({ item }) => (
            <RiderOrderCard
              order={item}
              onPress={() => router.push({ pathname: '/rider-order/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: C.muted, fontSize: 13, fontWeight: '600', marginTop: 2 },

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
});
