import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ordersApi, type ConsumerOrder } from '@/lib/api';
import { STATUS_META, fmtPrice, fmtDate, initialsOf, shortRef, supplierOf } from '@/app/order/_shared';

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
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function OrderHistoryScreen() {
  const [orders, setOrders] = useState<ConsumerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await ordersApi.list());
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Order History</Text>
          <Text style={s.headerSub}>{orders.length} order{orders.length === 1 ? '' : 's'} total</Text>
        </View>
        <View style={s.headerBadge}>
          <IconSymbol name="clock.fill" size={18} color={C.accent} />
        </View>
      </View>

      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : error && orders.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>Couldn&apos;t load orders</Text>
          <Text style={s.emptySubtitle}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }} activeOpacity={0.8}>
            <Text style={{ color: C.accent, fontWeight: '700', marginTop: 6 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIconCircle}>
            <IconSymbol name="clock.fill" size={32} color={C.dim} />
          </View>
          <Text style={s.emptyTitle}>No order history</Text>
          <Text style={s.emptySubtitle}>Your past orders will appear here</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={C.accent} onRefresh={() => { setRefreshing(true); void load(); }} />
          }
        >
          {orders.map((order) => {
            const meta = STATUS_META[order.status];
            const supplier = supplierOf(order);
            return (
              <TouchableOpacity
                key={order.id}
                style={[s.orderCard, cardShadow]}
                onPress={() => router.push(`/order/${order.id}`)}
                activeOpacity={0.82}
              >
                <View style={s.orderTop}>
                  <View style={[s.supplierAvatar, { backgroundColor: C.accent + '1A', borderColor: C.accent + '40' }]}>
                    <Text style={[s.supplierInitials, { color: C.accent }]}>{initialsOf(supplier)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.orderSupplier} numberOfLines={1}>{supplier}</Text>
                    <Text style={s.orderMeta}>{order.cylinderSize} × {order.quantity} · {fmtDate(order.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={14} color={C.dim} />
                  </View>
                </View>

                <View style={s.orderBottom}>
                  <View style={s.orderIdRow}>
                    <IconSymbol name="doc.fill" size={11} color={C.dim} />
                    <Text style={s.orderId}>{shortRef(order)}</Text>
                  </View>
                  <Text style={s.totalValue}>{fmtPrice(order.totalAmount)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
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
  backBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  headerBadge: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContainer: { paddingHorizontal: 20, gap: 12, paddingTop: 4 },

  orderCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  supplierAvatar: {
    width: 46, height: 46,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInitials: { fontSize: 14, fontWeight: '800' },
  orderSupplier: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  orderMeta: { color: C.muted, fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },

  orderBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderId: { color: C.dim, fontSize: 12, fontWeight: '600' },
  totalValue: { color: C.accent, fontSize: 17, fontWeight: '800' },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 10,
  },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
