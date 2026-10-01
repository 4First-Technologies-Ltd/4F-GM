import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, riderApi } from '@/lib/api';
import { setPendingRiderProfile } from '@/lib/pendingRiderProfile';
import { NetworkStatusDot } from '@/components/network-status-dot';

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

const VEHICLES = ['Motorbike', 'Bicycle', 'Tricycle', 'Car / Van'];

function Field({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  secure, onToggleSecure, error, autoComplete, textContentType, maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'characters';
  secure?: boolean;
  onToggleSecure?: () => void;
  error?: string;
  autoComplete?: 'email' | 'new-password' | 'name' | 'tel';
  textContentType?: 'emailAddress' | 'newPassword' | 'name' | 'telephoneNumber';
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={sf.wrap}>
      <Text style={sf.label}>{label}</Text>
      <View style={[sf.row, focused && sf.rowFocused, !!error && sf.rowError]}>
        <TextInput
          style={sf.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted + '99'}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
          secureTextEntry={secure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          textContentType={textContentType}
          maxLength={maxLength}
        />
        {onToggleSecure && (
          <TouchableOpacity
            onPress={onToggleSecure}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <IconSymbol name={secure ? 'eye.fill' : 'eye.slash.fill'} size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={sf.error}>{error}</Text>}
    </View>
  );
}

function RoleTabs() {
  const roles = [
    { key: 'CONSUMER', label: 'Consumer', href: '/sign-up' },
    { key: 'VENDOR', label: 'Vendor', href: '/vendor-sign-up' },
    { key: 'RIDER', label: 'Rider', href: null },
  ] as const;

  return (
    <View style={rt.wrap}>
      {roles.map((r) => (
        <TouchableOpacity
          key={r.key}
          style={[rt.tab, r.key === 'RIDER' && rt.tabActive]}
          onPress={() => { if (r.href) router.replace(r.href); }}
          activeOpacity={0.8}
        >
          <Text style={[rt.tabText, r.key === 'RIDER' && rt.tabTextActive]}>{r.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RiderSignUpScreen() {
  // `resume` = signed in already, verified, but the rider profile was never saved.
  const { resume } = useLocalSearchParams<{ resume?: string }>();
  const resuming = resume === '1';

  const [step, setStep] = useState<1 | 2>(resuming ? 2 : 1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [apiErr, setApiErr] = useState('');
  const [loading, setLoading] = useState(false);

  function validateAccount() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'At least 6 characters';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function validateVehicle() {
    const e: Record<string, string> = {};
    if (!phone.trim()) e.phone = 'Phone number is required';
    else if (phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number';
    if (!vehicleType.trim()) e.vehicleType = 'Choose or enter a vehicle type';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    setApiErr('');
    if (validateAccount()) setStep(2);
  }

  async function handleSubmit() {
    setApiErr('');
    if (!validateVehicle()) return;

    const details = {
      phone: phone.trim(),
      vehicleType: vehicleType.trim(),
      plateNumber: plateNumber.trim() || undefined,
    };

    setLoading(true);
    try {
      if (resuming) {
        await riderApi.createProfile(details);
        router.replace('/rider-pending');
        return;
      }
      // Profile creation needs a session, which only exists after OTP verification —
      // hold the details in memory until /verify-email completes.
      setPendingRiderProfile(details);
      const result = await authApi.register(name.trim(), email.trim(), password, 'RIDER');
      router.replace({ pathname: '/verify-email', params: { email: result.email, role: 'RIDER' } });
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <NetworkStatusDot />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <View style={s.badge}>
              <Text style={s.badgeText}>4FG</Text>
            </View>
            <Text style={s.title}>{resuming ? 'Rider details' : 'Become a Rider'}</Text>
            <Text style={s.subtitle}>
              {resuming ? 'Finish your application' : 'Deliver gas cylinders and earn'}
            </Text>
          </View>

          {!resuming && <RoleTabs />}

          {!resuming && (
            <View style={s.steps}>
              {[1, 2].map((n) => (
                <View key={n} style={[s.stepBar, n <= step && s.stepBarActive]} />
              ))}
            </View>
          )}

          {step === 1 ? (
            <View style={s.form}>
              <Field
                label="Full name" value={name} onChangeText={setName} placeholder="Jane Smith"
                autoCapitalize="words" error={errs.name} autoComplete="name" textContentType="name"
              />
              <Field
                label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com"
                keyboardType="email-address" error={errs.email} autoComplete="email" textContentType="emailAddress"
              />
              <Field
                label="Password" value={password} onChangeText={setPassword} placeholder="Min. 6 characters"
                secure={!showPwd} onToggleSecure={() => setShowPwd((p) => !p)} error={errs.password}
                autoComplete="new-password" textContentType="newPassword"
              />
            </View>
          ) : (
            <View style={s.form}>
              <Field
                label="Phone number" value={phone} onChangeText={setPhone} placeholder="08012345678"
                keyboardType="phone-pad" error={errs.phone} autoComplete="tel" textContentType="telephoneNumber"
              />

              <View style={sf.wrap}>
                <Text style={sf.label}>Vehicle type</Text>
                <View style={s.chips}>
                  {VEHICLES.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[s.chip, vehicleType === v && s.chipActive]}
                      onPress={() => setVehicleType(v)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chipText, vehicleType === v && s.chipTextActive]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!!errs.vehicleType && <Text style={sf.error}>{errs.vehicleType}</Text>}
              </View>

              <Field
                label="Plate number (optional)" value={plateNumber} onChangeText={setPlateNumber}
                placeholder="ABC-123-XY" autoCapitalize="characters" maxLength={20}
              />
            </View>
          )}

          {!!apiErr && (
            <View style={s.apiErrBox}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}

          {step === 1 ? (
            <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={handleNext}>
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, loading && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>{resuming ? 'Submit application' : 'Create Account'}</Text>}
              </TouchableOpacity>
              {!resuming && (
                <TouchableOpacity style={s.backLink} onPress={() => setStep(1)} activeOpacity={0.7}>
                  <Text style={s.backLinkText}>Back</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {!resuming && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.replace('/sign-in')} style={s.switchLink}>
              <Text style={s.switchText}>
                Already have an account?{'  '}
                <Text style={{ color: C.accent, fontWeight: '700' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  rowError: { borderColor: C.red, backgroundColor: '#FFF5F5' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
  error: { color: C.red, fontSize: 12, marginTop: 2 },
});

const rt = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 22,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
});

const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32 },

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
  subtitle: { color: C.muted, fontSize: 14 },

  steps: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border },
  stepBarActive: { backgroundColor: C.accent },

  form: { gap: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  chipText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
  chipTextActive: { color: C.accent, fontWeight: '700' },

  apiErrBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },

  primaryBtn: { marginTop: 20, backgroundColor: C.accent, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  backLink: { alignItems: 'center', paddingVertical: 14 },
  backLinkText: { color: C.muted, fontSize: 14, fontWeight: '600' },

  switchLink: { alignItems: 'center', paddingVertical: 12 },
  switchText: { color: C.muted, fontSize: 14 },
});
