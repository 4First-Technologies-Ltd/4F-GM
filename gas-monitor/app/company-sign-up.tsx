import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView,
  ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, companyApi } from '@/lib/api';
import { setPendingCompanyProfile } from '@/lib/pendingCompanyProfile';
import { LegalConsent } from '@/components/legal-consent';
import { SignUpTabs, RIDER_SUBTABS } from '@/components/signup-tabs';
import { useLegalConsent } from '@/lib/legal-consent';

const C = {
  bg: '#FFFFFF', surface: '#F8FCF8', accent: '#2D7450', text: '#1A2E1A',
  muted: '#7A9A7A', border: '#E0EEE0', red: '#D32F2F',
};

/**
 * Logistics company sign-up: owner account plus company details in one form.
 * `?resume=1` is the recovery path for a verified account with no company
 * profile (sign-up interrupted): it shows only the company details.
 */
export default function CompanySignUpScreen() {
  const { resume } = useLocalSearchParams<{ resume?: string }>();
  const resuming = resume === '1';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const consent = useLegalConsent();
  const [consentInvalid, setConsentInvalid] = useState(false);

  async function submit() {
    setErr('');
    if (!resuming) {
      if (!name.trim()) return setErr('Your full name is required.');
      if (!/\S+@\S+\.\S+/.test(email)) return setErr('Enter a valid email address.');
      if (password.length < 6) return setErr('Choose a password of at least 6 characters.');
    }
    if (!companyName.trim()) return setErr('Company name is required.');
    if (!phone.trim()) return setErr('A company phone number is required.');
    if (!address.trim()) return setErr('Company address is required.');
    if (!resuming && !consent.all) {
      setConsentInvalid(true);
      return setErr('Please read and accept the Terms and Conditions and the Privacy Policy to continue.');
    }

    const details = {
      companyName: companyName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(state.trim() ? { state: state.trim() } : {}),
    };

    setLoading(true);
    try {
      if (resuming) {
        await companyApi.createProfile(details);
        router.replace('/company-pending');
        return;
      }
      setPendingCompanyProfile(details);
      const result = await authApi.register(name.trim(), email.trim(), password, 'LOGISTICS_COMPANY');
      router.replace({ pathname: '/verify-email', params: { email: result.email, role: 'LOGISTICS_COMPANY' } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const input = (
    label: string, value: string, set: (t: string) => void, placeholder: string, extra?: object,
  ) => (
    <>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input} value={value} onChangeText={set} placeholder={placeholder}
        placeholderTextColor={C.muted + '99'} {...extra}
      />
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>
          <Text style={s.title}>{resuming ? 'Company details' : 'Register your fleet'}</Text>
          <Text style={s.sub}>
            After 4FG approves your company you can invite your riders by email. Riders you invite are approved by joining your fleet.
          </Text>

          {!resuming && (
            <SignUpTabs
              category="RIDER"
              sub={{
                tabs: RIDER_SUBTABS,
                value: 'COMPANY',
                onChange: (k) => { if (k === 'SINGLE') router.replace('/rider-sign-up'); },
              }}
            />
          )}

          {!resuming && (
            <>
              {input('Your full name', name, setName, 'Account owner', { autoCapitalize: 'words' })}
              {input('Email', email, setEmail, 'you@company.com', { autoCapitalize: 'none', autoCorrect: false, keyboardType: 'email-address' })}
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
            </>
          )}

          {input('Company name', companyName, setCompanyName, 'e.g. Swift Dispatch Ltd', { autoCapitalize: 'words' })}
          {input('Company phone', phone, setPhone, '+234 800 000 0000', { keyboardType: 'phone-pad' })}
          {input('Company address', address, setAddress, 'Street and area', { multiline: true })}
          {input('City', city, setCity, 'e.g. Lagos')}
          {input('State', state, setState, 'e.g. Lagos')}

          {!resuming && <LegalConsent invalid={consentInvalid} />}

          {!!err && <View style={s.errBox}><Text style={s.errText}>{err}</Text></View>}

          <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{resuming ? 'Submit' : 'Create account'}</Text>}
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
    paddingHorizontal: 16, minHeight: 52, color: C.text, fontSize: 15,
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
