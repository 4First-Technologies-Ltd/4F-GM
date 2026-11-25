import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Platform, Switch, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { authApi, ApiUser, UnitPreference } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { DeleteAccountLink } from '@/components/delete-account';
import { ReportBugLink } from '@/components/report-bug';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  dim: '#AECAAE',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  red: '#D32F2F',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function SettingsScreen() {
  const [signingOut, setSigningOut] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);

  // On every focus, so a name or phone changed on the profile screen shows up here.
  useFocusEffect(
    useCallback(() => {
      // Show the cached user straight away, then pick up changes made on the website.
      getSavedUser<ApiUser>().then((u) => u && setUser(u));
      authApi.refreshUser().then(setUser).catch(() => {});
    }, []),
  );

  const initials =
    (user?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  /** Optimistic: flip the control now, put it back if the server refuses. */
  async function savePreference(patch: Partial<{ pushEnabled: boolean; emailNotifEnabled: boolean; unitPreference: UnitPreference }>) {
    if (!user) return;
    const previous = user;
    setUser({ ...user, ...patch });
    try {
      setUser(await authApi.updateProfile(patch));
    } catch (err: any) {
      setUser(previous);
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await authApi.logout();
            } finally {
              setSigningOut(false);
              router.replace('/sign-in');
            }
          },
        },
      ],
    );
  }

  const units = user?.unitPreference ?? 'KG';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Settings</Text>
          <Text style={s.headerSub}>Account and preferences</Text>
        </View>

        {/* Profile */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={[s.accentBar, { backgroundColor: C.accent }]} />
          <TouchableOpacity
            style={s.profileRow}
            activeOpacity={0.7}
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={s.avatar}>
              <Text style={[s.avatarText, { color: C.accent }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName} numberOfLines={1}>{user?.name ?? 'Your account'}</Text>
              <Text style={s.profileEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
              {user?.phone ? <Text style={s.profileEmail} numberOfLines={1}>{user.phone}</Text> : null}
            </View>
            <IconSymbol name="chevron.right" size={18} color={C.dim} />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="Notifications" />
          <ToggleRow
            label="Push Notifications"
            sub="Order updates and refill reminders on your device"
            value={user?.pushEnabled ?? true}
            onToggle={(v) => savePreference({ pushEnabled: v })}
          />
          <ToggleRow
            label="Email Notifications"
            sub="Refill reminders and order updates by email"
            value={user?.emailNotifEnabled ?? true}
            onToggle={(v) => savePreference({ emailNotifEnabled: v })}
            isLast
          />
        </View>

        {/* Units */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="Measurement Units" />
          <View style={s.segmentRow}>
            <TouchableOpacity
              style={[s.segment, units === 'KG' && s.segmentActive]}
              onPress={() => savePreference({ unitPreference: 'KG' })}
              activeOpacity={0.7}
            >
              <Text style={[s.segmentText, units === 'KG' && s.segmentTextActive]}>Kilograms (kg)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.segment, units === 'LBS' && s.segmentActive]}
              onPress={() => savePreference({ unitPreference: 'LBS' })}
              activeOpacity={0.7}
            >
              <Text style={[s.segmentText, units === 'LBS' && s.segmentTextActive]}>Pounds (lbs)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Insights & help */}
        <View style={[s.card, { ...cardShadow }]}>
          <LinkRow label="Spending analytics" icon="chart.bar.fill" onPress={() => router.push('/analytics')} />
          <LinkRow label="Privacy Policy" icon="shield.fill" onPress={() => router.push('/legal/privacy')} />
          <LinkRow label="Terms of Service" icon="doc.fill" onPress={() => router.push('/legal/terms')} isLast />
        </View>

        {/* App Info */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="About" />
          <InfoRow label="App Version" value={Constants.expoConfig?.version ?? '1.0.0'} isLast />
        </View>

        {/* Danger zone */}
        <TouchableOpacity
          style={[s.dangerBtn, { ...cardShadow }, signingOut && { opacity: 0.7 }]}
          activeOpacity={0.8}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={s.dangerText}>Sign Out</Text>}
        </TouchableOpacity>

        <ReportBugLink />
        <DeleteAccountLink />

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function LinkRow({ label, icon, onPress, isLast }: {
  label: string; icon: React.ComponentProps<typeof IconSymbol>['name']; onPress: () => void; isLast?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.row, isLast && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7}>
      <IconSymbol name={icon} size={18} color={C.accent} />
      <Text style={[s.rowLabel, { flex: 1, marginBottom: 0 }]}>{label}</Text>
      <IconSymbol name="chevron.right" size={14} color={C.dim} />
    </TouchableOpacity>
  );
}
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function ToggleRow({ label, sub, value, onToggle, isLast }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void; isLast?: boolean;
}) {
  return (
    <View style={[s.row, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: C.border, true: C.accent + 'AA' }}
        thumbColor={value ? C.accent : C.muted}
      />
    </View>
  );
}

function InfoRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[s.row, isLast && { borderBottomWidth: 0 }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { paddingVertical: 8, paddingHorizontal: 2, marginBottom: 4 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: C.muted, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  accentBar: { height: 3 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  profileName: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  profileEmail: { color: C.muted, fontSize: 12 },

  sectionHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 12,
  },
  rowLabel: { color: C.text, fontSize: 14, fontWeight: '500', marginBottom: 2 },
  rowSub: { color: C.muted, fontSize: 12 },
  infoValue: { color: C.muted, fontSize: 13, marginLeft: 'auto' },

  segmentRow: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 8 },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
  },
  segmentActive: { borderColor: C.accent + '80', backgroundColor: C.accentLight },
  segmentText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  segmentTextActive: { color: C.accent, fontWeight: '700' },

  dangerBtn: {
    backgroundColor: C.red,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  dangerText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
