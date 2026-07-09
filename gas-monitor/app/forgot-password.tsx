import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi } from '@/lib/api';

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

type Step = 'email' | 'reset' | 'done';

function Field({
  label, value, onChangeText, placeholder, keyboardType, secure, onToggleSecure, autoComplete, textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  secure?: boolean;
  onToggleSecure?: () => void;
  autoComplete?: 'email' | 'new-password' | 'one-time-code';
  textContentType?: 'emailAddress' | 'newPassword' | 'oneTimeCode';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={sf.wrap}>
      <Text style={sf.label}>{label}</Text>
      <View style={[sf.row, focused && sf.rowFocused]}>
        <TextInput
          style={sf.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted + '99'}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          textContentType={textContentType}
        />
        {onToggleSecure && (
          <TouchableOpacity onPress={onToggleSecure} activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name={secure ? 'eye.fill' : 'eye.slash.fill'} size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [apiErr, setApiErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleRequestCode() {
    if (!email.trim()) {
      setApiErr('Email is required');
      return;
    }
    setApiErr('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStep('reset');
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setApiErr('');
    if (password !== confirmPassword) {
      setApiErr('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), otp, password);
      setStep('done');
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setApiErr('');
    setSuccessMsg('');
    setResending(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSuccessMsg('A new code is on its way.');
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
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            {step === 'email' && (
              <>
                <Text style={s.title}>Forgot password?</Text>
                <Text style={s.subtitle}>Enter your email and we&apos;ll send you a code</Text>
              </>
            )}
            {step === 'reset' && (
              <>
                <Text style={s.title}>Enter your code</Text>
                <Text style={s.subtitle}>Code sent to {email.trim()}</Text>
              </>
            )}
            {step === 'done' && (
              <>
                <Text style={s.title}>Password updated</Text>
                <Text style={s.subtitle}>Sign in with your new password</Text>
              </>
            )}
          </View>

          {step === 'email' && (
            <View style={s.form}>
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
              />
            </View>
          )}

          {step === 'reset' && (
            <View style={s.form}>
              <Field
                label="Verification code"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
              />
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                secure={!showPwd}
                onToggleSecure={() => setShowPwd((p) => !p)}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <Field
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                secure={!showPwd}
                autoComplete="new-password"
                textContentType="newPassword"
              />
            </View>
          )}

          {!!apiErr && (
            <View style={s.apiErrBox}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}
          {!!successMsg && (
            <View style={s.successBox}>
              <Text style={s.successText}>{successMsg}</Text>
            </View>
          )}

          {step === 'email' && (
            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.7 }]}
              activeOpacity={0.85}
              onPress={handleRequestCode}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Send code</Text>}
            </TouchableOpacity>
          )}

          {step === 'reset' && (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, (loading || otp.length !== 6) && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleReset}
                disabled={loading || otp.length !== 6}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Update password</Text>}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={handleResend} disabled={resending} style={s.switchLink}>
                <Text style={s.switchText}>
                  Didn&apos;t get a code?{'  '}
                  <Text style={{ color: C.accent, fontWeight: '700' }}>{resending ? 'Sending…' : 'Resend code'}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'done' && (
            <TouchableOpacity
              style={s.primaryBtn}
              activeOpacity={0.85}
              onPress={() => router.replace('/sign-in')}
            >
              <Text style={s.primaryBtnText}>Go to sign in</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
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
    height: 52,
    gap: 10,
  },
  rowFocused: { borderColor: C.borderFocus, backgroundColor: C.accentLight + '55' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32 },

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
  subtitle: { color: C.muted, fontSize: 14, textAlign: 'center' },

  form: { gap: 18 },

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
    marginTop: 16,
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  switchLink: { alignItems: 'center', paddingVertical: 20 },
  switchText: { color: C.muted, fontSize: 14 },
});
