import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { authApi } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  red: '#D32F2F',
};

/**
 * "Delete my account" for every role: a quiet link that opens a password
 * confirmation sheet. The backend decides whether the account can be closed
 * (open orders, unpaid earnings, deliveries in progress all block it) and its
 * message is shown as-is.
 */
export function DeleteAccountLink({ businessAccount = false }: { businessAccount?: boolean }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!password) return;
    setBusy(true);
    try {
      await authApi.deleteAccount(password);
      setOpen(false);
      Alert.alert('Account deleted', 'Your account and personal details have been removed.');
      router.replace('/sign-in');
    } catch (err: any) {
      Alert.alert('Could not delete account', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TouchableOpacity style={s.link} activeOpacity={0.7} onPress={() => { setPassword(''); setOpen(true); }}>
        <Text style={s.linkText}>Delete my account</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.title}>Delete account</Text>
            <Text style={s.warn}>
              {businessAccount
                ? 'This removes your personal details, documents, bank details, photos and sessions, and takes your listings off the marketplace. Past orders and payout records are kept as anonymous financial records. This cannot be undone.'
                : 'This removes your personal details, saved addresses and sessions. Past orders are kept as anonymous financial records. This cannot be undone.'}
            </Text>
            <Text style={s.label}>Enter your password to confirm</Text>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Password"
              placeholderTextColor={C.muted + '99'}
            />
            <View style={s.actions}>
              <TouchableOpacity style={s.cancel} onPress={() => setOpen(false)} activeOpacity={0.7}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.delete, (!password || busy) && { opacity: 0.5 }]}
                onPress={confirm}
                disabled={!password || busy}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.deleteText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  link: { alignItems: 'center', paddingVertical: 14 },
  linkText: { color: C.red, fontSize: 13, fontWeight: '600' },

  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  warn: { color: C.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  cancelText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  delete: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.red },
  deleteText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
