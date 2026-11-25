import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { riderApi, type RiderOrder } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  red: '#D32F2F',
};

/**
 * Completing a delivery needs the 4-digit PIN the customer gives the rider at
 * the door. Five wrong tries lock the order for 15 minutes (the server says so).
 */
export function DeliveryPinModal({
  order,
  onClose,
  onDelivered,
}: {
  order: RiderOrder | null;
  onClose: () => void;
  onDelivered: () => void | Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) {
      setPin('');
      setError('');
    }
  }, [order]);

  async function submit() {
    if (!order) return;
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter the 4-digit PIN from the customer.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await riderApi.updateOrderStatus(order.id, 'DELIVERED', pin);
      onClose();
      await onDelivered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the delivery.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!order} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.scrim}>
        <View style={s.sheet}>
          <Text style={s.title}>Complete this delivery</Text>
          <Text style={s.body}>
            Once the customer has their cylinder(s), ask for their 4-digit delivery PIN and enter it here.
          </Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus
            textContentType="oneTimeCode"
            placeholder="••••"
            placeholderTextColor={C.muted}
            style={s.input}
            onSubmitEditing={submit}
            accessibilityLabel="Delivery PIN"
          />
          {!!error && <Text style={s.error}>{error}</Text>}
          <View style={s.row}>
            <TouchableOpacity style={s.secondary} disabled={busy} onPress={onClose} activeOpacity={0.8}>
              <Text style={s.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primary, busy && { opacity: 0.7 }]} disabled={busy} onPress={submit} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Complete delivery</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 20, padding: 20, gap: 10 },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingVertical: 12,
    textAlign: 'center', fontSize: 30, fontWeight: '800', letterSpacing: 14, color: C.text,
  },
  error: { color: C.red, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primary: { flex: 1, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  secondaryText: { color: C.text, fontSize: 14, fontWeight: '700' },
});
