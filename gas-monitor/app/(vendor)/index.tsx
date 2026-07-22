import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, VendorOrder, OrderStatus } from '@/lib/api';
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

const FILTERS: { id: OrderStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_META: Record<OrderStatus, { color: string; bg: string; label: string }> = {
  PENDING:   { color: '#B45309', bg: '#FFFBEB', label: 'Pending'   },
  CONFIRMED: { color: '#2D7450', bg: '#EDF7ED', label: 'Confirmed' },
  DELIVERED: { color: '#1565C0', bg: '#E3F2FD', label: 'Delivered' },
  CANCELLED: { color: '#D32F2F', bg: '#FFF5F5', label: 'Cancelled' },
};

const GAS_LABELS: Record<string, string> = {
  COOKING:    'Cooking Gas',
  MEDICAL:    'Medical O₂',
  INDUSTRIAL: 'Industrial',
  BULK:       'Bulk LPG',
  OTHER:      'Other',
};

function fmtPrice(n: number) {
  return '₦' + n.toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onConfirm,
  onDeliver,
  onCancel,
}: {
  order: VendorOrder;
  onConfirm: () => void;
  onDeliver: () => void;
  onCancel: () => void;
}) {
  const meta = STATUS_META[order.status];
  const gasLabel = order.listing.customName ?? GAS_LABELS[order.listing.gasType] ?? order.listing.gasType;

  return (
    <View style={[oc.card, cardShadow]}>
      {/* Top row */}
      <View style={oc.topRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={oc.orderId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={oc.date}>{fmtDate(order.createdAt)}</Text>
        </View>
        <View style={[oc.statusBadge, { backgroundColor: meta.bg }]}>
          <Text style={[oc.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Customer */}
      <View style={oc.row}>
        <IconSymbol name="person.fill" size={14} color={C.muted} />
        <Text style={oc.rowText}>{order.consumer.name}</Text>
      </View>

      {/* Gas type + size */}
      <View style={oc.row}>
        <IconSymbol name="flame.fill" size={14} color={C.muted} />
        <Text style={oc.rowText}>
          {gasLabel} · {order.cylinderSize} × {order.quantity}
        </Text>
      </View>

      {/* Delivery address */}
      <View style={oc.row}>
        <IconSymbol name="location.fill" size={14} color={C.muted} />
        <Text style={oc.rowText} numberOfLines={1}>{order.deliveryAddress}</Text>
      </View>

      {/* Total */}
      <View style={[oc.row, oc.totalRow]}>
        <Text style={oc.totalLabel}>Total</Text>
        <Text style={oc.totalValue}>{fmtPrice(order.totalAmount)}</Text>
      </View>

      {/* Actions */}
      {order.status === 'PENDING' && (
        <View style={oc.actions}>
          <TouchableOpacity style={oc.actionBtnPrimary} onPress={onConfirm} activeOpacity={0.8}>
            <Text style={oc.actionBtnPrimaryText}>Confirm Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={oc.actionBtnDanger} onPress={onCancel} activeOpacity={0.8}>
            <Text style={oc.actionBtnDangerText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      {order.status === 'CONFIRMED' && (
        <View style={oc.actions}>
          <TouchableOpacity style={oc.actionBtnPrimary} onPress={onDeliver} activeOpacity={0.8}>
            <Text style={oc.actionBtnPrimaryText}>Mark as Delivered</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VendorOrdersScreen() {
  const { openDrawer } = useDrawer();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
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

  async function updateStatus(id: string, status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED') {
    try {
      const updated = await vendorApi.updateOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch {
      // no-op
    }
  }

  const filtered = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Incoming Orders</Text>
          <Text style={s.headerSub}>
            {pendingCount > 0 ? `${pendingCount} awaiting action` : 'All caught up'}
          </Text>
        </View>
        {pendingCount > 0 && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={s.filterScroll}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[s.pill, filter === f.id && s.pillActive]}
            onPress={() => setFilter(f.id)}
            activeOpacity={0.7}
          >
            <Text style={[s.pillText, filter === f.id && s.pillTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders list */}
      <ScrollView
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />
        }
      >
        {filtered.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <IconSymbol name="tray.fill" size={34} color={C.dim} />
            </View>
            <Text style={s.emptyTitle}>No orders yet</Text>
            <Text style={s.emptySubtitle}>
              {filter === 'ALL'
                ? 'Orders from customers will appear here once your account is approved and listings are live.'
                : `No ${filter.toLowerCase()} orders at the moment.`}
            </Text>
          </View>
        ) : (
          filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onConfirm={() => updateStatus(order.id, 'CONFIRMED')}
              onDeliver={() => updateStatus(order.id, 'DELIVERED')}
              onCancel={() => updateStatus(order.id, 'CANCELLED')}
            />
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Order card styles ─────────────────────────────────────────────────────────
const oc = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  orderId: { color: C.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  date: { color: C.muted, fontSize: 12, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { color: C.muted, fontSize: 13, flex: 1 },

  totalRow: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    justifyContent: 'space-between',
  },
  totalLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  totalValue: { color: C.accent, fontSize: 18, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 10 },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionBtnDanger: {
    paddingHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#D32F2F40',
    alignItems: 'center',
  },
  actionBtnDangerText: { color: '#D32F2F', fontSize: 13, fontWeight: '700' },
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
  pendingBadge: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

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

  list: { paddingHorizontal: 20, gap: 12 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
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
