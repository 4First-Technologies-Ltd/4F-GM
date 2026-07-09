import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MOCK_ORDERS, STATUS_META, fmtPrice, type OrderStatus } from '@/app/order/_shared';

// ── Palette ───────────────────────────────────────────────────────────────────
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
  orange: '#E65100',
  orangeLight: '#FFF3E0',
  red: '#D32F2F',
  redLight: '#FFEBEE',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

// Status-specific content
const STATUS_CONTENT: Record<OrderStatus, { icon: string; headline: string; sub: string }> = {
  delivered:  {
    icon: 'checkmark.circle.fill',
    headline: 'Order Delivered',
    sub: 'Your gas has been successfully delivered.',
  },
  processing: {
    icon: 'hourglass',
    headline: 'Order in Progress',
    sub: 'Your order is confirmed and on its way.',
  },
  cancelled:  {
    icon: 'xmark.circle.fill',
    headline: 'Order Cancelled',
    sub: 'This order was cancelled before delivery.',
  },
};

// ── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ steps, status }: { steps: { label: string; time: string; done: boolean }[]; status: OrderStatus }) {
  const accentColor = status === 'processing' ? C.orange : C.accent;
  // Index of the first incomplete step (the "in-progress" step for processing)
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <View style={tl.wrap}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isCurrent = i === activeIdx && status === 'processing';
        const isDone = step.done;

        return (
          <View key={i} style={tl.row}>
            {/* Left column: dot + connector line */}
            <View style={tl.dotCol}>
              <View style={[
                tl.dot,
                isDone && { backgroundColor: accentColor, borderColor: accentColor },
                isCurrent && { backgroundColor: C.orangeLight, borderColor: C.orange, borderWidth: 2 },
                !isDone && !isCurrent && { backgroundColor: C.surface, borderColor: C.dim },
              ]}>
                {isDone && <IconSymbol name="checkmark.circle.fill" size={10} color="#fff" />}
                {isCurrent && <View style={[tl.pulseDot, { backgroundColor: C.orange }]} />}
              </View>
              {!isLast && (
                <View style={[tl.line, { backgroundColor: isDone ? accentColor + '60' : C.border }]} />
              )}
            </View>

            {/* Right column: label + time */}
            <View style={[tl.labelCol, !isLast && { paddingBottom: 20 }]}>
              <Text style={[
                tl.stepLabel,
                isDone && { color: C.text },
                isCurrent && { color: C.orange, fontWeight: '700' },
                !isDone && !isCurrent && { color: C.dim },
              ]}>
                {step.label}
              </Text>
              {step.time ? (
                <Text style={[tl.stepTime, isDone && { color: C.muted }, isCurrent && { color: C.orange }]}>
                  {step.time}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const tl = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', gap: 14 },
  dotCol: { alignItems: 'center', width: 22 },
  dot: {
    width: 22, height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, flex: 1, marginTop: 2 },
  labelCol: { flex: 1, paddingTop: 2 },
  stepLabel: { fontSize: 14, fontWeight: '600' },
  stepTime: { fontSize: 12, color: '#9EBA9E', marginTop: 2 },
});

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={[sc.card, cardShadow]}>
      <View style={sc.titleRow}>
        <View style={sc.iconCircle}>
          <IconSymbol name={icon as any} size={15} color={C.accent} />
        </View>
        <Text style={sc.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: {
    width: 30, height: 30,
    borderRadius: 8,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.text, fontSize: 14, fontWeight: '700' },
});

// ── Detail row (key/value) ────────────────────────────────────────────────────
function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={dr.row}>
      <Text style={dr.label}>{label}</Text>
      <Text style={[dr.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  label: { color: C.muted, fontSize: 13 },
  value: { color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = MOCK_ORDERS.find((o) => o.id === id);

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 16 }}>Order not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.accent, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const meta = STATUS_META[order.status];
  const content = STATUS_CONTENT[order.status];
  const showTimeline = order.status !== 'cancelled';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Order Details</Text>
          <Text style={s.headerSub}>{order.orderId}</Text>
        </View>
        <View style={[s.headerBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <IconSymbol name={content.icon as any} size={18} color={meta.color} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Status banner */}
        <View style={[s.statusBanner, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <View style={[s.bannerIconCircle, { backgroundColor: meta.color + '18' }]}>
            <IconSymbol name={content.icon as any} size={28} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerHeadline, { color: meta.color }]}>{content.headline}</Text>
            <Text style={[s.bannerSub, { color: meta.color + 'BB' }]}>{content.sub}</Text>
          </View>
        </View>

        {/* Supplier */}
        <Section title="Supplier" icon="storefront.fill">
          <View style={s.supplierRow}>
            <View style={[s.supplierAvatar, { backgroundColor: order.supplierColor + '1A', borderColor: order.supplierColor + '40' }]}>
              <Text style={[s.supplierInitials, { color: order.supplierColor }]}>{order.supplierInitials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.supplierName}>{order.supplier}</Text>
              <Text style={s.supplierAddr} numberOfLines={1}>{order.supplierAddress}</Text>
              <View style={s.supplierMeta}>
                <View style={[s.gasTypeBadge, { backgroundColor: order.supplierColor + '18', borderColor: order.supplierColor + '44' }]}>
                  <Text style={[s.gasTypeText, { color: order.supplierColor }]}>{order.gasType}</Text>
                </View>
                <Text style={s.ratingText}>⭐ {order.supplierRating}</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* Timeline */}
        {showTimeline && (
          <Section title="Order Timeline" icon="clock.fill">
            <Timeline steps={order.timeline} status={order.status} />
          </Section>
        )}

        {/* Order items */}
        <Section title="Order Items" icon="shippingbox.fill">
          <View style={s.itemRow}>
            <View style={s.itemIconCircle}>
              <IconSymbol name="flame.fill" size={20} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemLabel}>{order.size} cylinder</Text>
              <Text style={s.itemSub}>{order.gasType} · {fmtPrice(order.unitPrice)} each</Text>
            </View>
            <Text style={s.itemQty}>× {order.quantity}</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 2 }}>
            <DetailRow label="Subtotal" value={fmtPrice(order.unitPrice * order.quantity)} />
            <DetailRow label="Delivery fee" value={order.deliveryFee === 0 ? 'Free' : fmtPrice(order.deliveryFee)} valueColor={C.accent} />
            <View style={[dr.row, s.totalRow]}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{fmtPrice(order.total)}</Text>
            </View>
          </View>
        </Section>

        {/* Delivery details */}
        <Section title="Delivery Details" icon="mappin">
          <View style={s.addressRow}>
            <View style={s.addressPin}>
              <IconSymbol name="mappin" size={14} color={C.accent} />
            </View>
            <Text style={s.addressText}>{order.deliveryAddress}</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 2 }}>
            <DetailRow label="Date" value={order.date} />
            <DetailRow label="Time" value={order.time} />
          </View>
        </Section>

        {/* Payment */}
        <Section title="Payment" icon="tag.fill">
          <DetailRow label="Method" value={order.paymentMethod} />
          <DetailRow label="Amount paid" value={fmtPrice(order.total)} valueColor={C.accent} />
        </Section>

        {/* Action button */}
        {order.status === 'delivered' && (
          <TouchableOpacity style={s.actionBtnGreen} onPress={() => router.push('/order')} activeOpacity={0.85}>
            <IconSymbol name="arrow.clockwise" size={17} color="#fff" />
            <Text style={s.actionBtnText}>Reorder</Text>
          </TouchableOpacity>
        )}

        {order.status === 'processing' && (
          <TouchableOpacity style={s.actionBtnRed} activeOpacity={0.85}>
            <IconSymbol name="xmark.circle.fill" size={17} color={C.red} />
            <Text style={[s.actionBtnText, { color: C.red }]}>Cancel Order</Text>
          </TouchableOpacity>
        )}

        {order.status === 'cancelled' && (
          <TouchableOpacity style={s.actionBtnGreen} onPress={() => router.push('/order')} activeOpacity={0.85}>
            <IconSymbol name="cart.fill" size={17} color="#fff" />
            <Text style={s.actionBtnText}>Place New Order</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { paddingHorizontal: 20, gap: 14, paddingTop: 4 },

  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  bannerIconCircle: {
    width: 52, height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerHeadline: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  bannerSub: { fontSize: 12, marginTop: 3, lineHeight: 17 },

  // Supplier
  supplierRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  supplierAvatar: {
    width: 48, height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInitials: { fontSize: 15, fontWeight: '800' },
  supplierName: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  supplierAddr: { color: C.muted, fontSize: 12, marginBottom: 6 },
  supplierMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gasTypeBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  gasTypeText: { fontSize: 10, fontWeight: '700' },
  ratingText: { color: C.muted, fontSize: 12, fontWeight: '600' },

  // Order item
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIconCircle: {
    width: 46, height: 46,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  itemSub: { color: C.muted, fontSize: 12 },
  itemQty: { color: C.text, fontSize: 18, fontWeight: '800' },

  // Total row (bolder variant of DetailRow)
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: C.accent + '50',
    marginTop: 2,
    paddingTop: 14,
  },
  totalLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  totalValue: { color: C.accent, fontSize: 20, fontWeight: '800' },

  // Delivery address
  addressRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  addressPin: {
    width: 28, height: 28,
    borderRadius: 8,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  addressText: { color: C.text, fontSize: 14, fontWeight: '500', flex: 1, lineHeight: 20 },

  // Action buttons
  actionBtnGreen: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionBtnRed: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.red + '60',
    backgroundColor: C.redLight,
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
