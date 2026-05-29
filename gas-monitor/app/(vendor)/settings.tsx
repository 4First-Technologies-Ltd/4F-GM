import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi } from '@/lib/api';
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
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function VendorSettingsScreen() {
  const { openDrawer } = useDrawer();
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    getSavedUser<{ name: string; email: string }>().then(setUser);
  }, []);

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

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
      </View>

      <View style={s.content}>
        {/* Account card */}
        <View style={[s.card, cardShadow]}>
          <View style={s.cardHeader}>
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
        </View>

        {/* Sign out */}
        <TouchableOpacity style={[s.signOutBtn, cardShadow]} onPress={handleSignOut} activeOpacity={0.8}>
          <IconSymbol name="arrow.left" size={18} color={C.red} />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
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
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
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
