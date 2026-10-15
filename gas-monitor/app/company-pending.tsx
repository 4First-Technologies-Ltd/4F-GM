import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, companyApi, CompanyStatus } from '@/lib/api';
import { homeRouteFor } from '@/lib/homeRoute';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', accent: '#2D7450', text: '#1A2E1A', muted: '#7A9A7A',
  border: '#E0EEE0', amber: '#B45309', red: '#D32F2F',
};

type ViewState = CompanyStatus | 'NO_PROFILE';

const COPY: Record<ViewState, { title: string; body: string }> = {
  PENDING: {
    title: 'Application submitted',
    body: "Your company is under review by the 4FG team. You'll be able to invite your riders as soon as it's approved, usually within 24 hours.",
  },
  REJECTED: {
    title: 'Application not approved',
    body: "We couldn't approve your company. Please contact support if you think this is a mistake.",
  },
  APPROVED: { title: "You're approved!", body: 'Your company is active.' },
  NO_PROFILE: {
    title: 'Finish setting up',
    body: "Your account is verified, but we don't have your company details yet. Add them to submit your application.",
  },
};

export default function CompanyPendingScreen() {
  const [state, setState] = useState<ViewState>('PENDING');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const user = await authApi.refreshUser();
      if (user.companyStatus === 'APPROVED') {
        router.replace(homeRouteFor(user));
        return;
      }
      if (user.companyStatus) {
        setState(user.companyStatus);
      } else {
        try {
          await companyApi.getProfile();
        } catch {
          setState('NO_PROFILE');
        }
      }
    } catch {
      // offline: keep the last known state
    } finally {
      setChecking(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { check(); }, [check]));

  async function signOut() {
    await authApi.logout();
    router.replace('/sign-in');
  }

  const rejected = state === 'REJECTED';
  const copy = COPY[state];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />
      <View style={s.content}>
        <View style={[s.card, rejected && { borderColor: C.red + '55', backgroundColor: '#FFF0F0' }]}>
          <IconSymbol name={rejected ? 'xmark.circle.fill' : 'hourglass'} size={40} color={rejected ? C.red : C.amber} />
          <Text style={s.title}>{copy.title}</Text>
          <Text style={[s.body, rejected && { color: C.red }]}>{copy.body}</Text>
        </View>

        {state === 'NO_PROFILE' ? (
          <TouchableOpacity
            style={s.primary}
            onPress={() => router.push({ pathname: '/company-sign-up', params: { resume: '1' } })}
            activeOpacity={0.85}
          >
            <Text style={s.primaryText}>Add company details</Text>
          </TouchableOpacity>
        ) : (
          !rejected && (
            <TouchableOpacity style={s.secondary} onPress={check} disabled={checking} activeOpacity={0.8}>
              {checking ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={s.secondaryText}>Check status</Text>}
            </TouchableOpacity>
          )
        )}
      </View>

      <Text style={s.supportText}>
        Need help? <Text style={{ color: C.accent, fontWeight: '700' }}>Contact 4fgmonitor@gmail.com</Text>
      </Text>

      <TouchableOpacity style={s.signOut} onPress={signOut} activeOpacity={0.8}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  card: {
    backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border,
    padding: 24, alignItems: 'center', gap: 10,
  },
  title: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { borderWidth: 1.5, borderColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: C.accent, fontSize: 15, fontWeight: '700' },
  supportText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  signOut: { alignItems: 'center', padding: 20 },
  signOutText: { color: C.muted, fontSize: 14, fontWeight: '600' },
});
