import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, AssignableRider, VendorOrder } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
};

/**
 * Bottom sheet to pick an approved rider for an order, or unassign the current
 * one. Only ever changes the rider — order status is untouched.
 */
export function AssignRiderSheet({
  order,
  onClose,
  onAssigned,
}: {
  /** The order being assigned; the sheet is open while this is set. */
  order: VendorOrder | null;
  onClose: () => void;
  onAssigned: () => void | Promise<void>;
}) {
  const [riders, setRiders] = useState<AssignableRider[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const orderId = order?.id;
  const currentRiderId = order?.rider?.id ?? null;

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setRiders(null);
    setLoadError('');
    setError('');
    setSelected(currentRiderId);
    vendorApi
      .getRiders()
      .then((data) => { if (!cancelled) setRiders(data); })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load riders.');
      });
    return () => { cancelled = true; };
  }, [orderId, currentRiderId]);

  async function save(riderId: string | null) {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      await vendorApi.assignRider(order.id, riderId);
      await onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the rider.');
    } finally {
      setSaving(false);
    }
  }

  const unchanged = selected === currentRiderId;

  return (
    <Modal
      visible={order !== null}
      transparent
      animationType="slide"
      onRequestClose={() => { if (!saving) onClose(); }}
    >
      <Pressable style={s.backdrop} onPress={() => { if (!saving) onClose(); }} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>{currentRiderId ? 'Change rider' : 'Assign a rider'}</Text>
        {order && (
          <Text style={s.subtitle} numberOfLines={2}>
            Order #{order.id.slice(0, 8).toUpperCase()} · {order.deliveryAddress}
          </Text>
        )}

        <ScrollView style={s.list} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {!riders && !loadError && (
            <View style={s.center}><ActivityIndicator color={C.accent} /></View>
          )}

          {!!loadError && (
            <View style={s.errBox}><Text style={s.errText}>{loadError}</Text></View>
          )}

          {riders && riders.length === 0 && (
            <View style={s.emptyBox}>
              <IconSymbol name="person.fill" size={28} color={C.muted} />
              <Text style={s.emptyText}>
                No approved riders are available yet. Riders appear here once the 4FG team approves them.
              </Text>
            </View>
          )}

          {riders?.map((r) => {
            const checked = selected === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[s.riderRow, checked && s.riderRowActive]}
                onPress={() => setSelected(r.id)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
              >
                <View style={s.avatar}>
                  <IconSymbol name="bicycle" size={20} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.riderName}>{r.user.name}</Text>
                  <Text style={s.riderMeta}>
                    {[r.vehicleType, r.phone].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={[s.radio, checked && s.radioActive]}>
                  {checked && <View style={s.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!!error && (
          <View style={[s.errBox, { marginTop: 10 }]}><Text style={s.errText}>{error}</Text></View>
        )}

        <View style={s.footer}>
          {currentRiderId && (
            <TouchableOpacity
              style={[s.unassignBtn, saving && { opacity: 0.6 }]}
              onPress={() => save(null)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={s.unassignText}>Unassign</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.assignBtn, (saving || !selected || unchanged) && { opacity: 0.5 }]}
            onPress={() => save(selected)}
            disabled={saving || !selected || unchanged}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.assignText}>Assign</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 14 },

  list: { flexGrow: 0 },
  center: { paddingVertical: 28, alignItems: 'center' },

  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  riderRowActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: { color: C.text, fontSize: 15, fontWeight: '700' },
  riderMeta: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },

  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  emptyText: { color: C.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },

  errBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },

  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  unassignBtn: {
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D32F2F40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unassignText: { color: C.red, fontSize: 14, fontWeight: '700' },
  assignBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
