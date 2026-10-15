import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView,
  ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi } from '@/lib/api';
import { LegalConsent } from '@/components/legal-consent';
import { useLegalConsent } from '@/lib/legal-consent';

const C = {
  bg: '#FFFFFF', surface: '#F8FCF8', accent: '#2D7450', text: '#1A2E1A',
  muted: '#7A9A7A', border: '#E0EEE0', red: '#D32F2F',
};

/**
 * Branch manager sign-up. The account only gets access once a vendor has
 * invited this exact email to a branch; signing up first is fine, the invite is
 * picked up on the next sign-in.
 */
export default function ManagerSignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const consent = useLegalConsent();
  const [consentInvalid, setConsentInvalid] = useState(false);

  async function submit() {
    setErr('');
    if (!name.trim()) return setErr('Your full name is required.');
    if (!/\S+@\S+\.\S+/.test(email)) return setErr('Enter the email address the vendor invited.');
    if (password.length < 6) return setErr('Choose a password of at least 6 characters.');
    if (!consent.all) {
      setConsentInvalid(true);
      return setErr('Please read and accept the Terms and Conditions and the Privacy Policy to continue.');
    }
    setLoading(true);
    try {
      const result = await authApi.register(name.trim(), email.trim(), password, 'BRANCH_MANAGER');
      router.replace({ pathname: '/verify-email', params: { email: result.email, role: 'BRANCH_MANAGER' } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>
          <Text style={s.title}>Branch manager sign up</Text>
          <Text style={s.sub}>
            Use the email address your vendor invited. You will see their branch orders and stock once you verify it.
          </Text>

          <Text style={s.label}>Full name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} autoCapitalize="words" placeholder="Your name" placeholderTextColor={C.muted + '99'} />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={C.muted + '99'}
          />

          <Text style={s.label}>Password</Text>
          <View style={s.pwRow}>
            <TextInput
              style={[s.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
              value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none"
              placeholder="Choose a password" placeholderTextColor={C.muted + '99'}
            />
            <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <IconSymbol name={show ? 'eye.slash.fill' : 'eye.fill'} size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <LegalConsent invalid={consentInvalid} />

          {!!err && <View style={s.errBox}><Text style={s.errText}>{err}</Text></View>}

          <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create account</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { padding: 24, gap: 8 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 12 },
  sub: { color: C.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  label: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, backgroundColor: C.surface,
    paddingHorizontal: 16, height: 52, color: C.text, fontSize: 15,
  },
  pwRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, backgroundColor: C.surface, paddingRight: 16,
  },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, padding: 12, marginTop: 8 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
