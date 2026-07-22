import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Switch, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, vendorApi, ApiUser, VendorProfile, VendorStatus, UnitPreference } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { useDrawer } from './_layout';

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
  red: '#D32F2F',
  amber: '#B45309',
  amberLight: '#FEF3E2',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const STATUS_META: Record<VendorStatus, { label: string; color: string; bg: string }> = {
  APPROVED: { label: 'Approved', color: C.accent, bg: C.accentLight },
  PENDING: { label: 'Pending Review', color: C.amber, bg: C.amberLight },
  REJECTED: { label: 'Rejected', color: C.red, bg: '#FFF0F0' },
};

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export default function VendorSettingsScreen() {
  const { openDrawer } = useDrawer();

  const [user, setUser] = useState<ApiUser | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);

  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [bio, setBio] = useState('');
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);
  const [businessErr, setBusinessErr] = useState('');

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotifEnabled, setEmailNotifEnabled] = useState(true);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('KG');

  async function loadUser() {
    const saved = await getSavedUser<ApiUser>();
    if (saved) {
      setUser(saved);
      setName(saved.name ?? '');
      setPhone(saved.phone ?? '');
      setPushEnabled(saved.pushEnabled ?? true);
      setEmailNotifEnabled(saved.emailNotifEnabled ?? true);
      setSmsAlertsEnabled(saved.smsAlertsEnabled ?? false);
      setUnitPreference(saved.unitPreference ?? 'KG');
    }
  }

  async function loadVendorProfile() {
    try {
      const data = await vendorApi.getProfile();
      setVendorProfile(data);
      setBusinessName(data.businessName);
      setBusinessAddress(data.businessAddress);
      setBusinessPhone(data.phone);
      setBio(data.bio ?? '');
    } catch {
      // profile may not exist yet
    }
  }

  useFocusEffect(useCallback(() => { loadUser(); loadVendorProfile(); }, []));

  async function handleSaveAccount() {
    setSavingAccount(true);
    setAccountSaved(false);
    try {
      const updated = await authApi.updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setUser(updated);
      setAccountSaved(true);
    } catch {
      // keep previous values visible
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSaveBusiness() {
    setBusinessErr('');
    if (!businessName.trim() || !businessAddress.trim() || !businessPhone.trim()) {
      setBusinessErr('Business name, address, and phone are required.');
      return;
    }
    setSavingBusiness(true);
    setBusinessSaved(false);
    try {
      const updated = await vendorApi.updateProfile({
        businessName: businessName.trim(),
        businessAddress: businessAddress.trim(),
        phone: businessPhone.trim(),
        bio: bio.trim() || null,
      });
      setVendorProfile(updated);
      setBusinessSaved(true);
    } catch (err) {
      setBusinessErr(err instanceof Error ? err.message : 'Could not save your business profile.');
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handlePrefChange(patch: Partial<{
    pushEnabled: boolean;
    emailNotifEnabled: boolean;
    smsAlertsEnabled: boolean;
    unitPreference: UnitPreference;
  }>) {
    // optimistic update
    if (patch.pushEnabled !== undefined) setPushEnabled(patch.pushEnabled);
    if (patch.emailNotifEnabled !== undefined) setEmailNotifEnabled(patch.emailNotifEnabled);
    if (patch.smsAlertsEnabled !== undefined) setSmsAlertsEnabled(patch.smsAlertsEnabled);
    if (patch.unitPreference !== undefined) setUnitPreference(patch.unitPreference);
    try {
      const updated = await authApi.updateProfile(patch);
      setUser(updated);
    } catch {
      // revert on failure
      await loadUser();
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

  const status = vendorProfile ? STATUS_META[vendorProfile.status] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Account card */}
        <View style={[s.card, cardShadow]}>
          <View style={s.cardHeaderRow}>
            <View style={s.avatar}>
              <IconSymbol name="person.fill" size={22} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{user?.name ?? '—'}</Text>
              <Text style={s.userEmail}>{user?.email ?? '—'}</Text>
            </View>
            <View style={s.vendorBadge}>
              <Text style={s.vendorBadgeText}>Vendor</Text>
            </View>
          </View>

          <View style={s.divider} />

          <SectionTitle>Personal details</SectionTitle>
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
              placeholder="Optional"
              placeholderTextColor={C.muted + '99'}
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity
            style={[s.saveBtnSm, savingAccount && { opacity: 0.7 }]}
            onPress={handleSaveAccount}
            disabled={savingAccount}
            activeOpacity={0.85}
          >
            {savingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnSmText}>Save</Text>}
          </TouchableOpacity>
          {accountSaved && <Text style={s.savedHint}>Saved.</Text>}

          <View style={s.accountList}>
            <View style={s.accountRow}>
              <Text style={s.accountLabel}>Account type</Text>
              <Text style={s.accountValue}>Vendor</Text>
            </View>
            {user?.createdAt && (
              <View style={s.accountRow}>
                <Text style={s.accountLabel}>Member since</Text>
                <Text style={s.accountValue}>{new Date(user.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Business profile card */}
        <View style={[s.card, cardShadow]}>
          <View style={s.cardTitleRow}>
            <SectionTitle>Business profile</SectionTitle>
            {status && (
              <View style={[s.statusPill, { backgroundColor: status.bg }]}>
                <Text style={[s.statusPillText, { color: status.color }]}>{status.label}</Text>
              </View>
            )}
          </View>
          <Text style={s.cardCaption}>Shown to consumers browsing the marketplace.</Text>

          <View style={s.field}>
            <Text style={s.label}>Business name</Text>
            <TextInput style={s.input} value={businessName} onChangeText={setBusinessName} placeholderTextColor={C.muted + '99'} />
          </View>
          <View style={s.field}>
            <Text style={s.label}>Business address</Text>
            <TextInput style={[s.input, s.inputMultiline]} value={businessAddress} onChangeText={setBusinessAddress} multiline placeholderTextColor={C.muted + '99'} />
          </View>
          <View style={s.field}>
            <Text style={s.label}>Business phone</Text>
            <TextInput style={s.input} value={businessPhone} onChangeText={setBusinessPhone} keyboardType="phone-pad" placeholderTextColor={C.muted + '99'} />
          </View>
          <View style={s.field}>
            <View style={s.bioLabelRow}>
              <Text style={s.label}>About your business</Text>
              <Text style={s.bioCount}>{bio.length}/500</Text>
            </View>
            <TextInput
              style={[s.input, s.inputBio]}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 500))}
              placeholder="A short description consumers will see on your listings"
              placeholderTextColor={C.muted + '99'}
              multiline
              maxLength={500}
            />
          </View>

          {!!businessErr && (
            <View style={s.apiErr}>
              <Text style={s.apiErrText}>{businessErr}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.saveBtnSm, savingBusiness && { opacity: 0.7 }]}
            onPress={handleSaveBusiness}
            disabled={savingBusiness}
            activeOpacity={0.85}
          >
            {savingBusiness ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnSmText}>Save business profile</Text>}
          </TouchableOpacity>
          {businessSaved && <Text style={s.savedHint}>Saved.</Text>}
        </View>

        {/* Notifications card */}
        <View style={[s.card, cardShadow]}>
          <SectionTitle>Notifications</SectionTitle>
          <Text style={s.cardCaption}>Synced to your account across web and mobile.</Text>

          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Push notifications</Text>
              <Text style={s.toggleSub}>Order updates and refill reminders on your device.</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(v) => handlePrefChange({ pushEnabled: v })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#fff"
            />
          </View>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Email notifications</Text>
              <Text style={s.toggleSub}>Order updates by email.</Text>
            </View>
            <Switch
              value={emailNotifEnabled}
              onValueChange={(v) => handlePrefChange({ emailNotifEnabled: v })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#fff"
            />
          </View>
          <View style={[s.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>SMS alerts</Text>
              <Text style={s.toggleSub}>Text alerts for time-sensitive orders.</Text>
            </View>
            <Switch
              value={smsAlertsEnabled}
              onValueChange={(v) => handlePrefChange({ smsAlertsEnabled: v })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#fff"
            />
          </View>

          <View style={s.divider} />

          <Text style={s.label}>Measurement units</Text>
          <View style={s.unitRow}>
            {(['KG', 'LBS'] as UnitPreference[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[s.unitPill, unitPreference === u && s.unitPillActive]}
                onPress={() => handlePrefChange({ unitPreference: u })}
                activeOpacity={0.8}
              >
                <Text style={[s.unitPillText, unitPreference === u && s.unitPillTextActive]}>
                  {u === 'KG' ? 'Kilograms (kg)' : 'Pounds (lbs)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick links */}
        <TouchableOpacity style={[s.linkRow, cardShadow]} onPress={() => router.push('/(vendor)/documents')} activeOpacity={0.8}>
          <View style={s.linkIconCircle}>
            <IconSymbol name="doc.fill" size={18} color={C.accent} />
          </View>
          <Text style={s.linkText}>Documents</Text>
          <IconSymbol name="chevron.right" size={16} color={C.muted} />
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity style={[s.signOutBtn, cardShadow]} onPress={handleSignOut} activeOpacity={0.8}>
          <IconSymbol name="arrow.left" size={18} color={C.red} />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  menuBtn: {
    width: 44, height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },

  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCaption: { color: C.muted, fontSize: 12.5, marginTop: -6 },
  avatar: {
    width: 48, height: 48,
    borderRadius: 14,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { color: C.text, fontSize: 16, fontWeight: '700' },
  userEmail: { color: C.muted, fontSize: 13, marginTop: 2 },
  vendorBadge: {
    backgroundColor: C.accentLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  vendorBadgeText: { color: C.accent, fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: C.border },

  sectionTitle: { color: C.text, fontSize: 14, fontWeight: '800' },

  field: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  bioLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioCount: { color: C.muted, fontSize: 11.5 },
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
  inputMultiline: { height: 56, paddingTop: 13, textAlignVertical: 'top' },
  inputBio: { height: 90, paddingTop: 13, textAlignVertical: 'top' },

  apiErr: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },

  saveBtnSm: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnSmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  savedHint: { color: C.accent, fontSize: 12, textAlign: 'center', fontWeight: '600' },

  accountList: { gap: 8, marginTop: 2 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountLabel: { color: C.muted, fontSize: 13 },
  accountValue: { color: C.text, fontSize: 13, fontWeight: '600' },

  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  toggleLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  toggleSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  unitRow: { flexDirection: 'row', gap: 8 },
  unitPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
  },
  unitPillActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  unitPillText: { color: C.muted, fontSize: 12.5, fontWeight: '600' },
  unitPillTextActive: { color: C.accent, fontWeight: '700' },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  linkIconCircle: {
    width: 36, height: 36,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },

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
