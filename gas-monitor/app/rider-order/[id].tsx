import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { advanceOrder } from '@/hooks/use-rider-orders';
import { riderApi, RiderOrder } from '@/lib/api';
import {
  RIDER_STATUS_META, fmtNaira, nextRiderAction, orderRef, supplierLabel, callNumber, openInMaps,
} from '@/lib/riderOrders';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

function ContactRow({
  icon, title, name, detail, onCall, onMap,
}: {
  icon: 'person.fill' | 'storefront.fill';
  title: string;
  name: string;
  detail?: string | null;
  onCall?: () => void;
  onMap?: () => void;
}) {
  return (
    <View style={[s.card, cardShadow]}>
      <Text style={s.cardTitle}>{title}</Text>
      <View style={s.contactRow}>
        <View style={s.contactIcon}>
          <IconSymbol name={icon} size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.contactName}>{name}</Text>
          {!!detail && <Text style={s.contactDetail}>{detail}</Text>}
        </View>
        {onMap && (
          <TouchableOpacity style={s.roundBtn} onPress={onMap} activeOpacity={0.8}>
            <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color={C.accent} />
          </TouchableOpacity>
        )}
        {onCall && (
          <TouchableOpacity style={s.roundBtn} onPress={onCall} activeOpacity={0.8}>
            <IconSymbol name="phone.fill" size={20} color={C.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function RiderOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<RiderOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    try {
      // The API has no single-order endpoint for riders; the assigned list is small.
      const orders = await riderApi.getOrders();
      const found = orders.find((o) => o.id === id) ?? null;
      setOrder(found);
      setError(found ? '' : 'This order is no longer assigned to you.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdvance() {
    if (!order) return;
    setAdvancing(true);
    const changed = await advanceOrder(order);
    if (changed) await load();
    setAdvancing(false);
  }

  const meta = order ? RIDER_STATUS_META[order.status] : null;
  const action = order ? nextRiderAction(order.status) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{order ? orderRef(order) : 'Order'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : !order ? (
        <View style={s.center}>
          <Text style={s.errText}>{error || 'Order not found.'}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {meta && (
              <View style={[s.banner, { backgroundColor: meta.bg }]}>
                <Text style={[s.bannerText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            )}

            <ContactRow
              icon="storefront.fill"
              title="Pick up from"
              name={supplierLabel(order)}
              detail={order.vendor?.businessAddress}
              onCall={order.vendor?.phone ? () => callNumber(order.vendor?.phone) : undefined}
              onMap={order.vendor?.businessAddress ? () => openInMaps(order.vendor!.businessAddress!) : undefined}
            />

            <ContactRow
              icon="person.fill"
              title="Deliver to"
              name={order.consumer.name}
              detail={order.deliveryAddress}
              onCall={order.consumer.phone ? () => callNumber(order.consumer.phone) : undefined}
              onMap={() => openInMaps(order.deliveryAddress)}
            />

            <View style={[s.card, cardShadow]}>
              <Text style={s.cardTitle}>Order</Text>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Cylinder</Text>
                <Text style={s.kvValue}>{order.cylinderSize}</Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Quantity</Text>
                <Text style={s.kvValue}>{order.quantity}</Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Total</Text>
                <Text style={s.kvValue}>{fmtNaira(order.totalAmount)}</Text>
              </View>
              <Text style={s.note}>Paid online — no cash to collect.</Text>
            </View>
          </ScrollView>

          {action && (
            <View style={s.footer}>
              <TouchableOpacity
                style={[s.primaryBtn, advancing && { opacity: 0.7 }]}
                onPress={handleAdvance}
                disabled={advancing}
                activeOpacity={0.85}
              >
                {advancing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>{action.label}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </>
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
    paddingTop: 4,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errText: { color: C.muted, fontSize: 14, textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },

  banner: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  bannerText: { fontSize: 14, fontWeight: '800' },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  cardTitle: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: { color: C.text, fontSize: 15, fontWeight: '700' },
  contactDetail: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between' },
  kvLabel: { color: C.muted, fontSize: 14 },
  kvValue: { color: C.text, fontSize: 14, fontWeight: '700' },
  note: { color: C.muted, fontSize: 12, marginTop: 2 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
