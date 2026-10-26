import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { ApiUser, StaffBranch, authApi, staffApi } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { DeleteAccountLink } from '@/components/delete-account';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', border: '#E0EEE0', text: '#1A2E1A', muted: '#7A9A7A',
  accent: '#2D7450', red: '#D32F2F',
};

export default function ManagerAccountScreen() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);

  useFocusEffect(useCallback(() => {
    getSavedUser<ApiUser>().then(setUser);
    staffApi.me().then(setBranches).catch(() => {});
  }, []));

  function signOut() {
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
        <Text style={s.title}>Account</Text>
        <Text style={s.sub}>{user ? `${user.name} · ${user.email}` : ''}</Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.section}>Your branches</Text>
        {branches.length === 0 && <Text style={s.muted}>No branch assigned yet.</Text>}
        {branches.map((b) => (
          <View key={b.id} style={s.card}>
            <Text style={s.cardTitle}>{b.name}</Text>
            <Text style={s.muted}>{b.vendor.businessName}</Text>
            <Text style={s.muted}>{b.address}</Text>
            {(!b.isActive || !!b.suspendedAt) && (
              <Text style={[s.muted, { color: C.red }]}>
                {b.suspendedAt ? 'Suspended by 4FG' : 'Closed by the owner'}
              </Text>
            )}
          </View>
        ))}

        <TouchableOpacity style={s.signOut} onPress={signOut} activeOpacity={0.85}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <DeleteAccountLink />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 20, gap: 12 },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 3 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13 },
  signOut: { marginTop: 16, borderWidth: 1.5, borderColor: C.red + '55', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  signOutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
