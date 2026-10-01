import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Platform, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, riderApi, ApiUser, RiderProfile } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
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

export default function RiderProfileScreen() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const savedUser = await getSavedUser<ApiUser>();
        if (savedUser) {
          setUser(savedUser);
          setName(savedUser.name ?? '');
        }
        try {
          const p = await riderApi.getProfile();
          setProfile(p);
          setPhone(p.phone);
          setVehicleType(p.vehicleType ?? '');
          setPlateNumber(p.plateNumber ?? '');
        } catch {
          // keep whatever is already on screen
        }
      })();
    }, []),
  );

  async function handleSave() {
    setErr('');
    setSaved(false);
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!phone.trim()) { setErr('Phone number is required.'); return; }

    setSaving(true);
    try {
      const [updatedUser, updatedProfile] = await Promise.all([
        name.trim() !== user?.name ? authApi.updateProfile({ name: name.trim() }) : Promise.resolve(user),
        riderApi.updateProfile({
          phone: phone.trim(),
          vehicleType: vehicleType.trim() || undefined,
          plateNumber: plateNumber.trim() || undefined,
        }),
      ]);
      if (updatedUser) setUser(updatedUser);
      setProfile(updatedProfile);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await authApi.logout();
          router.replace('/sign-in');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.card, cardShadow]}>
            <View style={s.cardHeaderRow}>
              <View style={s.avatar}>
                <IconSymbol name="person.fill" size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{user?.name ?? '—'}</Text>
                <Text style={s.userEmail}>{user?.email ?? '—'}</Text>
              </View>
              <View style={s.badge}>
                <Text style={s.badgeText}>Rider</Text>
              </View>
            </View>

            <View style={s.divider} />

            <View style={s.field}>
              <Text style={s.label}>Full name</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={C.muted + '99'} />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Phone number</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor={C.muted + '99'}
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Vehicle type</Text>
              <TextInput
                style={s.input}
                value={vehicleType}
                onChangeText={setVehicleType}
                placeholder="e.g. Motorbike, Tricycle, Van"
                placeholderTextColor={C.muted + '99'}
                maxLength={40}
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Plate number</Text>
              <TextInput
                style={s.input}
                value={plateNumber}
                onChangeText={setPlateNumber}
                autoCapitalize="characters"
                placeholder="Optional"
                placeholderTextColor={C.muted + '99'}
                maxLength={20}
              />
            </View>

            {!!err && (
              <View style={s.apiErr}>
                <Text style={s.apiErrText}>{err}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save changes</Text>}
            </TouchableOpacity>
            {saved && <Text style={s.savedHint}>Saved.</Text>}

            {profile && (
              <View style={s.accountRow}>
                <Text style={s.accountLabel}>Account status</Text>
                <Text style={[s.accountValue, { color: profile.status === 'APPROVED' ? C.accent : C.red }]}>
                  {profile.status.charAt(0) + profile.status.slice(1).toLowerCase()}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={[s.signOutBtn, cardShadow]} onPress={handleSignOut} activeOpacity={0.8}>
            <IconSymbol name="arrow.left" size={18} color={C.red} />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },

  content: { paddingHorizontal: 20, gap: 14 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { color: C.text, fontSize: 16, fontWeight: '700' },
  userEmail: { color: C.muted, fontSize: 13, marginTop: 2 },
  badge: { backgroundColor: C.accentLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: C.accent, fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: C.border },

  field: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    height: 50,
    color: C.text,
    fontSize: 15,
  },

  apiErr: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },

  saveBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  savedHint: { color: C.accent, fontSize: 12, textAlign: 'center', fontWeight: '600' },

  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountLabel: { color: C.muted, fontSize: 13 },
  accountValue: { fontSize: 13, fontWeight: '700' },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D32F2F30',
    paddingVertical: 16,
  },
  signOutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
