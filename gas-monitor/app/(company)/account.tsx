import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { authApi, companyApi, CompanyProfile } from '@/lib/api';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', border: '#E0EEE0', text: '#1A2E1A', muted: '#7A9A7A',
  accent: '#2D7450', red: '#D32F2F',
};

export default function CompanyAccountScreen() {
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useFocusEffect(useCallback(() => {
    companyApi.getProfile().then(setCompany).catch(() => {});
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
        <Text style={s.sub}>{company?.companyName ?? ''}</Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {company && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{company.companyName}</Text>
            <Text style={s.muted}>{company.address}</Text>
            {!!(company.city || company.state) && (
              <Text style={s.muted}>{[company.city, company.state].filter(Boolean).join(', ')}</Text>
            )}
            <Text style={s.muted}>{company.phone}</Text>
          </View>
        )}
        <TouchableOpacity style={s.signOut} onPress={signOut} activeOpacity={0.85}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 20, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 3 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13 },
  signOut: { marginTop: 16, borderWidth: 1.5, borderColor: C.red + '55', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  signOutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
