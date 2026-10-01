import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { RiderOrder } from '@/lib/api';
import {
  RIDER_STATUS_META, fmtNaira, nextRiderAction, orderRef, supplierLabel, callNumber, openInMaps,
} from '@/lib/riderOrders';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export function RiderOrderCard({
  order,
  onPress,
  onAdvance,
  advancing,
}: {
  order: RiderOrder;
  onPress: () => void;
  /** When provided, the card shows the next-step button (Start Delivery / Mark as Delivered). */
  onAdvance?: () => void;
  advancing?: boolean;
}) {
  const meta = RIDER_STATUS_META[order.status];
  const action = onAdvance ? nextRiderAction(order.status) : null;
  const date = new Date(order.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return (
    <TouchableOpacity style={[s.card, cardShadow]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.topRow}>
        <Text style={s.ref}>{orderRef(order)}</Text>
        <View style={[s.pill, { backgroundColor: meta.bg }]}>
          <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={s.line}>
        <IconSymbol name="storefront.fill" size={16} color={C.muted} />
        <Text style={s.lineText} numberOfLines={1}>
          Pick up from <Text style={s.strong}>{supplierLabel(order)}</Text>
        </Text>
      </View>
      <View style={s.line}>
        <IconSymbol name="mappin" size={16} color={C.muted} />
        <Text style={s.lineText} numberOfLines={2}>{order.deliveryAddress}</Text>
      </View>
      <View style={s.line}>
        <IconSymbol name="person.fill" size={16} color={C.muted} />
        <Text style={s.lineText} numberOfLines={1}>{order.consumer.name}</Text>
      </View>

      <View style={s.metaRow}>
        <Text style={s.metaText}>
          {order.quantity} × {order.cylinderSize}
        </Text>
        <Text style={s.metaText}>{fmtNaira(order.totalAmount)} · {date}</Text>
      </View>

      {action && (
        <View style={s.actions}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => openInMaps(order.deliveryAddress)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color={C.accent} />
          </TouchableOpacity>
          {!!order.consumer.phone && (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => callNumber(order.consumer.phone)}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <IconSymbol name="phone.fill" size={20} color={C.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.actionBtn, advancing && { opacity: 0.7 }]}
            onPress={onAdvance}
            disabled={advancing}
            activeOpacity={0.85}
          >
            {advancing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.actionText}>{action.label}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ref: { color: C.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },

  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineText: { flex: 1, color: C.text, fontSize: 13.5, lineHeight: 19 },
  strong: { fontWeight: '700' },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  metaText: { color: C.muted, fontSize: 12.5, fontWeight: '600' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
});
