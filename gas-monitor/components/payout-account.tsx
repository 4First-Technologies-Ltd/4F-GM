import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { bankApi, BankOption, PayoutAccount } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  red: '#D32F2F',
};

/**
 * The bank account a vendor or rider is paid into. The account name is resolved
 * by the bank, and a change needs the account password (the backend enforces it).
 */
export function PayoutAccountCard() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [pickBank, setPickBank] = useState(false);
  const [bank, setBank] = useState<BankOption | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    bankApi.getAccount().then(setAccount).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!editing || banks.length) return;
    bankApi.banks().then(setBanks).catch(() => setErr('Could not load the list of banks. Try again shortly.'));
  }, [editing, banks.length]);

  async function save() {
    setErr('');
    if (!bank) return setErr('Choose your bank.');
    if (!/^\d{10}$/.test(accountNumber)) return setErr('Account number must be 10 digits.');
    if (!password) return setErr('Enter your password to confirm.');
    setBusy(true);
    try {
      setAccount(await bankApi.saveAccount({ bankCode: bank.code, accountNumber, password }));
      setEditing(false);
      setBank(null);
      setAccountNumber('');
      setPassword('');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save your payout account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.title}>Payout account</Text>
      <Text style={s.sub}>The bank account your earnings are paid into. We confirm the name with your bank.</Text>

      {!loaded ? (
        <ActivityIndicator color={C.accent} />
      ) : !editing ? (
        <>
          {account ? (
            <View style={s.acct}>
              <Text style={s.acctName}>{account.accountName}</Text>
              <Text style={s.acctSub}>{account.bankName} · ••••{account.last4}</Text>
            </View>
          ) : (
            <Text style={s.sub}>No payout account yet. Add one to get paid.</Text>
          )}
          <TouchableOpacity style={s.btn} onPress={() => setEditing(true)} activeOpacity={0.85}>
            <Text style={s.btnText}>{account ? 'Change account' : 'Add bank account'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={s.label}>Bank</Text>
          <TouchableOpacity style={s.input} onPress={() => setPickBank(true)} activeOpacity={0.8}>
            <Text style={{ color: bank ? C.text : C.muted }}>{bank?.name ?? 'Select your bank'}</Text>
          </TouchableOpacity>

          <Text style={s.label}>Account number</Text>
          <TextInput
            style={s.input}
            value={accountNumber}
            onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            placeholder="10 digits"
            placeholderTextColor={C.muted}
          />

          <Text style={s.label}>Your password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="To confirm it is you"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
          />

          {!!err && <Text style={s.err}>{err}</Text>}

          <TouchableOpacity style={[s.btn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save account</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEditing(false); setErr(''); setPassword(''); }}
            disabled={busy}
            style={{ alignItems: 'center', paddingTop: 12 }}
          >
            <Text style={{ color: C.muted }}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      <Modal visible={pickBank} animationType="slide" onRequestClose={() => setPickBank(false)}>
        <View style={s.modal}>
          <Text style={s.title}>Choose your bank</Text>
          {banks.length === 0 ? (
            <ActivityIndicator color={C.accent} />
          ) : (
            <FlatList
              data={banks}
              keyExtractor={(b) => b.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.row}
                  onPress={() => { setBank(item); setPickBank(false); }}
                >
                  <Text style={{ color: C.text }}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity onPress={() => setPickBank(false)} style={{ alignItems: 'center', padding: 16 }}>
            <Text style={{ color: C.muted }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
  title: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  sub: { fontSize: 13, color: C.muted, marginBottom: 12 },
  acct: { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 12 },
  acctName: { fontSize: 14, fontWeight: '600', color: C.text },
  acctSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, color: C.text,
  },
  err: { color: C.red, fontSize: 13, marginTop: 10 },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  btnText: { color: '#fff', fontWeight: '700' },
  modal: { flex: 1, backgroundColor: C.card, padding: 16, paddingTop: 48 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
});
