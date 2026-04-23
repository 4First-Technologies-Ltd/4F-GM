import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Switch, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { authApi } from '@/lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [pushNotif, setPushNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(false);
  const [units, setUnits] = useState<'kg' | 'lbs'>('kg');
  const [signingOut, setSigningOut] = useState(false);

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
          <View style={s.profileRow}>
            <View style={s.avatar}>
              <Text style={[s.avatarText, { color: C.accent }]}>BB</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>Bubble Barrel User</Text>
              <Text style={s.profileEmail}>devops@bubblebarrel.dev</Text>
            </View>
            <TouchableOpacity style={s.editBtn} activeOpacity={0.7}>
              <Text style={s.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="Notifications" />
          <ToggleRow label="Push Notifications" sub="Refill alerts on your device" value={pushNotif} onToggle={setPushNotif} />
          <ToggleRow label="Email Alerts" sub="Daily summary to your inbox" value={emailNotif} onToggle={setEmailNotif} isLast />
        </View>

        {/* Units */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="Measurement Units" />
          <View style={s.segmentRow}>
            <TouchableOpacity
              style={[s.segment, units === 'kg' && s.segmentActive]}
              onPress={() => setUnits('kg')}
              activeOpacity={0.7}
            >
              <Text style={[s.segmentText, units === 'kg' && s.segmentTextActive]}>Kilograms (kg)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.segment, units === 'lbs' && s.segmentActive]}
              onPress={() => setUnits('lbs')}
              activeOpacity={0.7}
            >
              <Text style={[s.segmentText, units === 'lbs' && s.segmentTextActive]}>Pounds (lbs)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={[s.card, { ...cardShadow }]}>
          <SectionHeader title="About" />
          <InfoRow label="App Version" value="1.0.0" />
          <InfoRow label="Device ID" value="FG-2024-0047" />
          <InfoRow label="Last Sync" value="14 min ago" isLast />
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

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
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
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  editBtnText: { color: C.muted, fontSize: 13, fontWeight: '600' },

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
