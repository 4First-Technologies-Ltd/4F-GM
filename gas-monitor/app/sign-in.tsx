import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, ApiUser, ApiRequestError } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';

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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secure,
  onToggleSecure,
  error,
  autoComplete,
  textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  secure?: boolean;
  onToggleSecure?: () => void;
  error?: string;
  autoComplete?: 'email' | 'current-password' | 'name';
  textContentType?: 'emailAddress' | 'password' | 'name';
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={sf.wrap}>
      <Text style={sf.label}>{label}</Text>
      <View style={[
        sf.row,
        focused && sf.rowFocused,
        !!error && sf.rowError,
      ]}>
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
          <TouchableOpacity
            onPress={onToggleSecure}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <IconSymbol
              name={secure ? 'eye.fill' : 'eye.slash.fill'}
              size={18}
              color={C.muted}
            />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={sf.error}>{error}</Text>}
    </View>
  );
}

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [apiErr, setApiErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    let valid = true;
    setApiErr('');

    if (!email.trim()) { setEmailErr('Email is required'); valid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setEmailErr('Enter a valid email'); valid = false; }
    else setEmailErr('');

    if (!password) { setPwdErr('Password is required'); valid = false; }
    else if (password.length < 6) { setPwdErr('At least 6 characters'); valid = false; }
    else setPwdErr('');

    if (!valid) return;

    setLoading(true);
    try {
      await authApi.login(email.trim(), password);
      const user = await getSavedUser<ApiUser>();
      if (user?.role === 'VENDOR') {
        router.replace(user.vendorStatus === 'APPROVED' ? '/(vendor)' : '/vendor-pending');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'EMAIL_NOT_VERIFIED') {
        router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
        return;
      }
      setApiErr(err instanceof Error ? err.message : 'Sign in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity
            style={s.back}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>

          {/* Header */}
          <View style={s.header}>
            <View style={s.badge}>
              <Text style={s.badgeText}>4FG</Text>
            </View>
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to your account</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              error={emailErr}
              autoComplete="email"
              textContentType="emailAddress"
            />
            <View>
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secure={!showPwd}
                onToggleSecure={() => setShowPwd((p) => !p)}
                error={pwdErr}
                autoComplete="current-password"
                textContentType="password"
              />
              <TouchableOpacity
                onPress={() => router.push('/forgot-password')}
                activeOpacity={0.7}
                style={{ alignSelf: 'flex-end', marginTop: -6 }}
              >
                <Text style={s.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* API error */}
          {!!apiErr && (
            <View style={s.apiErrBox}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}

          {/* Sign In button */}
          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.7 }]}
            activeOpacity={0.85}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Sign In</Text>}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Sign up link */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.replace('/sign-up')}
            style={s.switchLink}
          >
            <Text style={s.switchText}>
              Don&apos;t have an account?{'  '}
              <Text style={{ color: C.accent, fontWeight: '700' }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field styles ──────────────────────────────────────────────────────────────
const sf = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
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
  rowFocused: {
    borderColor: C.borderFocus,
    backgroundColor: C.accentLight + '55',
  },
  rowError: {
    borderColor: C.red,
    backgroundColor: '#FFF5F5',
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  error: {
    color: C.red,
    fontSize: 12,
    marginTop: 2,
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },

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

  header: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
  },

  form: { gap: 18 },

  forgotLink: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },

  apiErrBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: C.red + '55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  apiErrText: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '500',
  },

  switchLink: { alignItems: 'center', paddingVertical: 6 },
  switchText: {
    color: C.muted,
    fontSize: 14,
  },
});
