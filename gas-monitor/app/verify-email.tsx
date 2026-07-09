import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, vendorApi } from '@/lib/api';
import { takePendingVendorProfile } from '@/lib/pendingVendorProfile';

const C = {
  bg: '#FFFFFF',
  surface: '#F8FCF8',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  border: '#E0EEE0',
  borderFocus: '#2D7450',
  red: '#D32F2F',
};

export default function VerifyEmailScreen() {
  const { email, role } = useLocalSearchParams<{ email?: string; role?: string }>();
  const [otp, setOtp] = useState('');
  const [focused, setFocused] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  async function handleVerify() {
    if (!email || otp.length !== 6) return;
    setApiErr('');
    setLoading(true);
    try {
      await authApi.verifyOtp(email, otp);

      if (role === 'VENDOR') {
        const pending = takePendingVendorProfile();
        if (pending) {
          await vendorApi.createProfile({
            businessName: pending.businessName,
            businessAddress: pending.businessAddress,
            phone: pending.phone,
            lat: pending.lat,
            lng: pending.lng,
          });
          if (pending.documents.length > 0) {
            await vendorApi.uploadDocuments(pending.documents.map((d) => ({ url: d.uri, fileName: d.fileName })));
          }
        }
        router.replace('/vendor-pending');
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setApiErr('');
    setResendMsg('');
    setResending(true);
    try {
      await authApi.resendOtp(email, 'SIGNUP_VERIFICATION');
      setResendMsg('A new code is on its way.');
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <TouchableOpacity
            style={s.back}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>

          <View style={s.header}>
            <View style={s.badge}>
              <Text style={s.badgeText}>4FG</Text>
            </View>
            <Text style={s.title}>Verify your email</Text>
            <Text style={s.subtitle}>
              Enter the 6-digit code we sent to{'\n'}
              <Text style={{ fontWeight: '700', color: C.text }}>{email}</Text>
            </Text>
          </View>

          <View style={sf.wrap}>
            <Text style={sf.label}>Verification code</Text>
            <View style={[sf.row, focused && sf.rowFocused]}>
              <TextInput
                style={sf.input}
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={C.muted + '66'}
                keyboardType="number-pad"
                maxLength={6}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                textContentType="oneTimeCode"
              />
            </View>
          </View>

          {!!apiErr && (
            <View style={s.apiErrBox}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}
          {!!resendMsg && (
            <View style={s.successBox}>
              <Text style={s.successText}>{resendMsg}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, (loading || otp.length !== 6) && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleVerify}
            disabled={loading || otp.length !== 6}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Verify email</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleResend}
            disabled={resending}
            style={s.switchLink}
          >
            <Text style={s.switchText}>
              Didn&apos;t get a code?{'  '}
              <Text style={{ color: C.accent, fontWeight: '700' }}>
                {resending ? 'Sending…' : 'Resend code'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field styles ──────────────────────────────────────────────────────────────
const sf = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    height: 60,
  },
  rowFocused: { borderColor: C.borderFocus, backgroundColor: C.accentLight + '55' },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 10,
    paddingVertical: 0,
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28, paddingBottom: 32 },

  back: {
    marginTop: 8,
    marginBottom: 8,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  badgeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  title: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  subtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  apiErrBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: C.red + '55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },

  successBox: {
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '40',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  successText: { color: C.accent, fontSize: 13, textAlign: 'center', fontWeight: '600' },

  primaryBtn: {
    marginTop: 20,
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  switchLink: { alignItems: 'center', paddingVertical: 20 },
  switchText: { color: C.muted, fontSize: 14 },
});
