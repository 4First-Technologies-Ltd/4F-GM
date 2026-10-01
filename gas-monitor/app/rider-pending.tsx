import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, riderApi, RiderStatus } from '@/lib/api';
import { homeRouteFor } from '@/lib/homeRoute';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  border: '#E0EEE0',
  amber: '#B45309',
  amberBg: '#FFFBEB',
  amberBorder: '#FCD34D',
  red: '#D32F2F',
  redBg: '#FFF0F0',
  redBorder: '#D32F2F55',
};

type ViewState = RiderStatus | 'NO_PROFILE';

const COPY: Record<ViewState, { title: string; body: string }> = {
  PENDING: {
    title: 'Application Submitted!',
    body: "Your rider account is under review by the 4FG team. You'll be able to take deliveries as soon as it's approved — this usually takes within 24 hours.",
  },
  REJECTED: {
    title: 'Application Not Approved',
    body: "We couldn't approve your rider application. Please contact support if you think this is a mistake.",
  },
  APPROVED: {
    title: "You're approved!",
    body: 'Your rider account is active.',
  },
  NO_PROFILE: {
    title: 'Finish setting up',
    body: "Your account is verified, but we don't have your rider details yet. Add your phone number and vehicle to submit your application.",
  },
};

export default function RiderPendingScreen() {
  const [state, setState] = useState<ViewState>('PENDING');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const user = await authApi.refreshUser();
      if (user.riderStatus === 'APPROVED') {
        router.replace(homeRouteFor(user));
        return;
      }
      if (user.riderStatus) {
        setState(user.riderStatus);
      } else {
        // No profile row yet — e.g. sign-up was interrupted after email verification.
        try {
          await riderApi.getProfile();
        } catch {
          setState('NO_PROFILE');
        }
      }
    } catch {
      // offline: keep showing the last known state
    } finally {
      setChecking(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { check(); }, [check]));

  async function handleSignOut() {
    await authApi.logout();
    router.replace('/sign-in');
  }

  const rejected = state === 'REJECTED';
  const copy = COPY[state];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />

      <View style={[s.decCircle, { width: 320, height: 320, top: -100, right: -100 }]} />
      <View style={[s.decCircle, { width: 200, height: 200, bottom: -50, left: -60 }]} />

      <View style={s.content}>
        <View style={s.badge}>
          <Text style={s.badgeText}>4FG</Text>
        </View>

        <View style={[s.statusCard, rejected && s.statusCardRed]}>
          <View style={[s.iconWrap, rejected && s.iconWrapRed]}>
            <IconSymbol
              name={rejected ? 'xmark.circle.fill' : state === 'NO_PROFILE' ? 'bicycle' : 'hourglass'}
              size={40}
              color={rejected ? C.red : C.amber}
            />
          </View>
          <Text style={s.statusTitle}>{copy.title}</Text>
          <Text style={[s.statusBody, rejected && { color: C.red }]}>{copy.body}</Text>
        </View>

        {state === 'NO_PROFILE' ? (
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.push({ pathname: '/rider-sign-up', params: { resume: '1' } })}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Add rider details</Text>
          </TouchableOpacity>
        ) : (
          !rejected && (
            <TouchableOpacity style={s.secondaryBtn} onPress={check} disabled={checking} activeOpacity={0.8}>
              {checking
                ? <ActivityIndicator color={C.accent} size="small" />
                : <Text style={s.secondaryBtnText}>Check status</Text>}
            </TouchableOpacity>
          )
        )}

        <Text style={s.supportText}>
          Need help?{' '}
          <Text style={{ color: C.accent, fontWeight: '700' }}>Contact support@4fg.com</Text>
        </Text>
      </View>

      <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  decCircle: { position: 'absolute', borderRadius: 9999, backgroundColor: C.accent, opacity: 0.05 },

  content: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 32, gap: 20 },

  badge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  badgeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 },

  statusCard: {
    width: '100%',
    backgroundColor: C.amberBg,
    borderWidth: 1.5,
    borderColor: C.amberBorder,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  statusCardRed: { backgroundColor: C.redBg, borderColor: C.redBorder },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: C.amberBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconWrapRed: { backgroundColor: '#FFE4E4', borderColor: C.redBorder },
  statusTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  statusBody: { color: C.amber, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  primaryBtn: {
    width: '100%',
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  secondaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 28,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: C.accent, fontSize: 15, fontWeight: '700' },

  supportText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  signOutBtn: {
    marginHorizontal: 28,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    backgroundColor: C.card,
  },
  signOutText: { color: C.muted, fontSize: 15, fontWeight: '600' },
});
