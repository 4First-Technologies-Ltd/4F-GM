import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi } from '@/lib/api';

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
};

export default function VendorPendingScreen() {
  async function handleSignOut() {
    await authApi.logout();
    router.replace('/sign-in');
  }

  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />

      {/* Decorative circles */}
      <View style={[s.decCircle, { width: 320, height: 320, top: -100, right: -100 }]} />
      <View style={[s.decCircle, { width: 200, height: 200, bottom: -50, left: -60 }]} />

      <View style={s.content}>
        {/* Brand badge */}
        <View style={s.badge}>
          <Text style={s.badgeText}>4FG</Text>
        </View>

        {/* Status illustration */}
        <View style={s.statusCard}>
          <View style={s.hourglassWrap}>
            <IconSymbol name="hourglass" size={40} color={C.amber} />
          </View>
          <Text style={s.statusTitle}>Application Submitted!</Text>
          <Text style={s.statusBody}>
            Your vendor account is under review by the 4FG team. We'll send you a notification once your account is approved — this usually takes within 24 hours.
          </Text>
        </View>

        {/* What happens next */}
        <View style={s.stepsCard}>
          <Text style={s.stepsTitle}>What happens next</Text>
          {[
            { icon: 'checkmark.circle.fill' as const, label: 'Application received', done: true },
            { icon: 'shield.fill' as const, label: 'Identity documents reviewed', done: false },
            { icon: 'storefront.fill' as const, label: 'Account approved & activated', done: false },
          ].map((item, i) => (
            <View key={i} style={s.stepRow}>
              <View style={[s.stepDot, item.done && s.stepDotDone]}>
                <IconSymbol
                  name={item.icon}
                  size={14}
                  color={item.done ? C.accent : C.muted}
                />
              </View>
              <Text style={[s.stepLabel, !item.done && { color: C.muted }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Support note */}
        <Text style={s.supportText}>
          Need help?{' '}
          <Text style={{ color: C.accent, fontWeight: '700' }}>
            Contact support@4fg.com
          </Text>
        </Text>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  decCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: C.accent,
    opacity: 0.05,
  },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 32,
    gap: 20,
  },

  badge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },

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
  hourglassWrap: {
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
  statusTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  statusBody: {
    color: C.amber,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  stepsCard: {
    width: '100%',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  stepsTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  stepLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  supportText: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

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
  signOutText: {
    color: C.muted,
    fontSize: 15,
    fontWeight: '600',
  },
});
