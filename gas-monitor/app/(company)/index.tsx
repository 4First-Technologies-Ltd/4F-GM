import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, TextInput,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { ApprovalBanner } from '@/components/approval-banner';
import { NotificationBell } from '@/components/notification-bell';
import { companyApi, FleetInvite, FleetRider } from '@/lib/api';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', surface: '#F5FBF5', border: '#E0EEE0', text: '#1A2E1A',
  muted: '#7A9A7A', accent: '#2D7450', accentLight: '#E8F5E8', red: '#D32F2F',
  amber: '#B45309', amberLight: '#FEF3E2',
};

export default function FleetScreen() {
  const [riders, setRiders] = useState<FleetRider[]>([]);
  const [invites, setInvites] = useState<FleetInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await companyApi.getFleet();
      setRiders(data.riders);
      setInvites(data.invites);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your fleet.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function invite() {
    if (!/\S+@\S+\.\S+/.test(email)) { setInviteErr('Enter a valid email address.'); return; }
    setInviting(true);
    setInviteErr('');
    try {
      await companyApi.inviteRider(email.trim());
      setEmail('');
      await load();
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setInviting(false);
    }
  }

  function removeRider(r: FleetRider) {
    Alert.alert(
      `Remove ${r.user.name}?`,
      r.activeOrders > 0
        ? `They have ${r.activeOrders} delivery(ies) in progress. Those stay with them, but they will leave your fleet and may need 4FG approval again before taking new ones.`
        : 'They will leave your fleet and may need 4FG approval again before taking new deliveries.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(r.id);
            try { await companyApi.removeRider(r.id); await load(); }
            catch (err) { Alert.alert('Could not remove rider', err instanceof Error ? err.message : 'Please try again.'); }
            finally { setBusyId(null); }
          },
        },
      ],
    );
  }

  async function withdraw(i: FleetInvite) {
    setBusyId(i.id);
    try { await companyApi.withdrawInvite(i.id); await load(); }
    catch (err) { Alert.alert('Could not withdraw invite', err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusyId(null); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={{ position: 'absolute', right: 16, top: 8 }}>
          <NotificationBell />
        </View>
        <Text style={s.title}>Your riders</Text>
        <Text style={s.sub}>{riders.length} in your fleet{invites.length ? ` · ${invites.length} invited` : ''}</Text>
      </View>

      <ApprovalBanner kind="company" />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
        >
          {!!error && <View style={s.errBox}><Text style={s.errText}>{error}</Text></View>}

          <View style={s.card}>
            <Text style={s.cardTitle}>Invite a rider</Text>
            <Text style={s.muted}>
              They sign up as a Rider in the app with this email. Joining your fleet approves them, so only invite riders you have vetted.
            </Text>
            <TextInput
              style={s.input} value={email} onChangeText={setEmail} placeholder="Rider's email"
              placeholderTextColor={C.muted + '99'} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            />
            {!!inviteErr && <Text style={[s.muted, { color: C.red }]}>{inviteErr}</Text>}
            <TouchableOpacity style={[s.btn, inviting && { opacity: 0.7 }]} onPress={invite} disabled={inviting}>
              {inviting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Send invite</Text>}
            </TouchableOpacity>
          </View>

          {invites.map((i) => (
            <View key={i.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{i.email}</Text>
                <Text style={[s.muted, { color: C.amber }]}>Waiting for them to sign up</Text>
              </View>
              {busyId === i.id ? <ActivityIndicator color={C.accent} /> : (
                <TouchableOpacity onPress={() => withdraw(i)}><Text style={[s.link, { color: C.red }]}>Withdraw</Text></TouchableOpacity>
              )}
            </View>
          ))}

          {riders.length === 0 && !error && <Text style={s.muted}>No riders have joined yet.</Text>}

          {riders.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle} numberOfLines={1}>{r.user.name}</Text>
                <View style={[s.pill, r.activeOrders === 0 && { backgroundColor: C.surface }]}>
                  <Text style={[s.pillText, r.activeOrders === 0 && { color: C.muted }]}>
                    {r.activeOrders === 0 ? 'Free' : `${r.activeOrders} active`}
                  </Text>
                </View>
              </View>
              <Text style={s.muted}>{r.user.email}</Text>
              <Text style={s.muted}>{[r.vehicleType, r.plateNumber].filter(Boolean).join(' · ') || 'No vehicle details'}</Text>
              <View style={[s.row, { marginTop: 8 }]}>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${r.phone}`)}><Text style={s.link}>Call {r.phone}</Text></TouchableOpacity>
                {busyId === r.id ? <ActivityIndicator color={C.accent} /> : (
                  <TouchableOpacity onPress={() => removeRider(r)}><Text style={[s.link, { color: C.red }]}>Remove</Text></TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 4 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  muted: { color: C.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { backgroundColor: C.accentLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: C.accent, fontSize: 11, fontWeight: '700' },
  link: { color: C.accent, fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, backgroundColor: C.surface,
    paddingHorizontal: 16, minHeight: 48, color: C.text, fontSize: 15, marginTop: 6,
  },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
});
