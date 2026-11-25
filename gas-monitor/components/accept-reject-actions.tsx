import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  red: '#D32F2F',
};

type OrderApi = {
  acceptOrder: (id: string) => Promise<void>;
  rejectOrder: (id: string, reason?: string) => Promise<void>;
};

/**
 * Accept a paid order (it goes to the rider job pool) or reject it (it is
 * cancelled and 4FG refunds the customer). Vendors and branch managers no
 * longer pick riders: riders choose their own jobs. Mirrors the website's
 * components/orders/AcceptRejectActions.tsx.
 */
export function AcceptRejectActions({
  orderId,
  api,
  onDone,
  canAccept = true,
}: {
  orderId: string;
  api: OrderApi;
  onDone: () => void | Promise<void>;
  /** False once accepted: the order can still be rejected until a rider picks it up. */
  canAccept?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRejecting(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order.');
    } finally {
      setBusy(false);
      await onDone();
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={s.row}>
        {canAccept && (
          <TouchableOpacity
            style={[s.primary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => run(() => api.acceptOrder(orderId))}
            activeOpacity={0.8}
          >
            {busy && !rejecting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Accept order</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.danger} disabled={busy} onPress={() => setRejecting(true)} activeOpacity={0.8}>
          <Text style={s.dangerText}>Reject</Text>
        </TouchableOpacity>
      </View>
      {!!error && !rejecting && <Text style={s.error}>{error}</Text>}

      <Modal visible={rejecting} transparent animationType="fade" onRequestClose={() => !busy && setRejecting(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.scrim}>
          <View style={s.sheet}>
            <Text style={s.title}>Reject this order?</Text>
            <Text style={s.body}>
              The customer has already paid. The order will be cancelled and the 4FG team will refund them.
            </Text>
            <Text style={s.label}>Reason (shown to the customer)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              maxLength={300}
              multiline
              placeholder="e.g. We're out of 12.5 kg cylinders today"
              placeholderTextColor={C.muted}
              style={s.input}
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <View style={[s.row, { marginTop: 12 }]}>
              <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setRejecting(false)} activeOpacity={0.8}>
                <Text style={s.secondaryText}>Keep order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dangerSolid, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => run(() => api.rejectOrder(orderId, reason.trim() || undefined))}
                activeOpacity={0.8}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Reject order</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  danger: {
    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#D32F2F40', backgroundColor: '#FFF5F5',
  },
  dangerText: { color: C.red, fontSize: 13, fontWeight: '700' },
  dangerSolid: { flex: 1, backgroundColor: C.red, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  secondaryText: { color: C.text, fontSize: 13, fontWeight: '700' },
  error: { color: C.red, fontSize: 12 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 20, padding: 20, gap: 8 },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  label: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 80,
    textAlignVertical: 'top', color: C.text, fontSize: 14,
  },
});
