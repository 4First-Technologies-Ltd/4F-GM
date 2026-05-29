import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi, vendorApi } from '@/lib/api';

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
  dim: '#AECAAE',
};

type Step = 1 | 2 | 3;

interface SelectedDoc {
  uri: string;
  fileName: string;
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  secure, onToggleSecure, error, autoComplete, textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secure?: boolean;
  onToggleSecure?: () => void;
  error?: string;
  autoComplete?: 'email' | 'new-password' | 'name' | 'tel';
  textContentType?: 'emailAddress' | 'newPassword' | 'name' | 'telephoneNumber';
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
        />
        {onToggleSecure && (
          <TouchableOpacity onPress={onToggleSecure} activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name={secure ? 'eye.fill' : 'eye.slash.fill'} size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={sf.error}>{error}</Text>}
    </View>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const LABELS = ['Account', 'Business', 'Verify'];
  return (
    <View style={si.row}>
      {LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const active = n === step;
        return (
          <React.Fragment key={n}>
            <View style={si.item}>
              <View style={[si.circle, active && si.circleActive, done && si.circleDone]}>
                {done
                  ? <IconSymbol name="checkmark.circle.fill" size={16} color="#fff" />
                  : <Text style={[si.num, (active || done) && si.numActive]}>{n}</Text>}
              </View>
              <Text style={[si.label, active && si.labelActive]}>{label}</Text>
            </View>
            {i < LABELS.length - 1 && <View style={[si.line, done && si.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VendorSignUpScreen() {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Step 2
  const [phone, setPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Step 3
  const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);

  // Shared
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiErr, setApiErr] = useState('');
  const [loading, setLoading] = useState(false);

  function clearErr(key: string) {
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Your full name is required';
    if (!businessName.trim()) errs.businessName = 'Business name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'At least 6 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {};
    if (!phone.trim()) errs.phone = 'Phone number is required';
    if (!businessAddress.trim()) errs.businessAddress = 'Business address is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goBack() {
    if (step === 1) router.back();
    else setStep((s) => (s - 1) as Step);
  }

  function goNext() {
    setApiErr('');
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  async function captureLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to capture your business GPS coordinates.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Error', 'Could not retrieve location. You can skip this step.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function pickDocuments() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to select identity documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const docs = result.assets.map((a) => ({
        uri: a.uri,
        fileName: a.fileName ?? a.uri.split('/').pop() ?? 'document',
      }));
      setSelectedDocs((prev) => [...prev, ...docs]);
    }
  }

  function removeDoc(index: number) {
    setSelectedDocs((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setLoading(true);
    setApiErr('');
    try {
      await authApi.register(name.trim(), email.trim(), password, 'VENDOR');

      await vendorApi.createProfile({
        businessName: businessName.trim(),
        businessAddress: businessAddress.trim(),
        phone: phone.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
      });

      if (selectedDocs.length > 0) {
        await vendorApi.uploadDocuments(
          selectedDocs.map((d) => ({ url: d.uri, fileName: d.fileName })),
        );
      }

      router.replace('/vendor-pending');
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Vendor Sign Up</Text>
            <Text style={s.headerSub}>Step {step} of 3</Text>
          </View>
        </View>

        {/* Step indicator */}
        <View style={s.indicatorWrap}>
          <StepIndicator step={step} />
        </View>

        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── STEP 1: Account details ── */}
          {step === 1 && (
            <View style={s.form}>
              <View style={s.formHeader}>
                <Text style={s.formTitle}>Account Details</Text>
                <Text style={s.formSub}>Set up your login and business identity</Text>
              </View>

              <Field label="Your full name" value={name}
                onChangeText={(t) => { setName(t); clearErr('name'); }}
                placeholder="Jane Smith" autoCapitalize="words" error={errors.name}
                autoComplete="name" textContentType="name" />

              <Field label="Business name" value={businessName}
                onChangeText={(t) => { setBusinessName(t); clearErr('businessName'); }}
                placeholder="Acme Gas Supplies Ltd." autoCapitalize="words"
                error={errors.businessName} />

              <Field label="Email address" value={email}
                onChangeText={(t) => { setEmail(t); clearErr('email'); }}
                placeholder="you@business.com" keyboardType="email-address"
                error={errors.email} autoComplete="email" textContentType="emailAddress" />

              <Field label="Password" value={password}
                onChangeText={(t) => { setPassword(t); clearErr('password'); }}
                placeholder="Min. 6 characters" secure={!showPwd}
                onToggleSecure={() => setShowPwd((p) => !p)} error={errors.password}
                autoComplete="new-password" textContentType="newPassword" />
            </View>
          )}

          {/* ── STEP 2: Business info ── */}
          {step === 2 && (
            <View style={s.form}>
              <View style={s.formHeader}>
                <Text style={s.formTitle}>Business Information</Text>
                <Text style={s.formSub}>Help customers find and contact you</Text>
              </View>

              <Field label="Phone number" value={phone}
                onChangeText={(t) => { setPhone(t); clearErr('phone'); }}
                placeholder="+234 800 000 0000" keyboardType="phone-pad"
                error={errors.phone} autoComplete="tel" textContentType="telephoneNumber" />

              <View style={sf.wrap}>
                <Text style={sf.label}>Business address</Text>
                <TextInput
                  style={[sf.textArea, !!errors.businessAddress && sf.textAreaError]}
                  value={businessAddress}
                  onChangeText={(t) => { setBusinessAddress(t); clearErr('businessAddress'); }}
                  placeholder="Full address of your business"
                  placeholderTextColor={C.muted + '99'}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                {!!errors.businessAddress && <Text style={sf.error}>{errors.businessAddress}</Text>}
              </View>

              {/* GPS location */}
              <View style={sf.wrap}>
                <Text style={sf.label}>
                  GPS Location{'  '}
                  <Text style={{ color: C.muted, fontWeight: '400' }}>(optional)</Text>
                </Text>
                {coords ? (
                  <View style={s.locationCaptured}>
                    <IconSymbol name="location.fill" size={15} color={C.accent} />
                    <Text style={s.locationCapturedText} numberOfLines={1}>
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                    </Text>
                    <TouchableOpacity onPress={() => setCoords(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <IconSymbol name="xmark.circle.fill" size={18} color={C.dim} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.locationBtn, gettingLocation && { opacity: 0.7 }]}
                    onPress={captureLocation}
                    disabled={gettingLocation}
                    activeOpacity={0.8}
                  >
                    {gettingLocation
                      ? <ActivityIndicator size="small" color={C.accent} />
                      : <IconSymbol name="location.fill" size={16} color={C.accent} />}
                    <Text style={s.locationBtnText}>
                      {gettingLocation ? 'Getting location...' : 'Capture GPS location'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── STEP 3: Verification docs ── */}
          {step === 3 && (
            <View style={s.form}>
              <View style={s.formHeader}>
                <Text style={s.formTitle}>Identity Verification</Text>
                <Text style={s.formSub}>
                  Upload a government-issued ID or business registration document. You can skip this and add documents later from your profile.
                </Text>
              </View>

              <TouchableOpacity style={s.uploadBtn} onPress={pickDocuments} activeOpacity={0.8}>
                <IconSymbol name="plus" size={20} color={C.accent} />
                <Text style={s.uploadBtnText}>Select document(s) from library</Text>
              </TouchableOpacity>

              {selectedDocs.length > 0 && (
                <View style={s.docList}>
                  {selectedDocs.map((doc, i) => (
                    <View key={i} style={s.docItem}>
                      <IconSymbol name="doc.fill" size={18} color={C.accent} />
                      <Text style={s.docName} numberOfLines={1}>{doc.fileName}</Text>
                      <TouchableOpacity onPress={() => removeDoc(i)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <IconSymbol name="xmark.circle.fill" size={18} color={C.dim} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {!!apiErr && (
                <View style={s.apiErrBox}>
                  <Text style={s.apiErrText}>{apiErr}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.primaryBtn, loading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.primaryBtnText}>Submit Application</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.skipLink, loading && { opacity: 0.4 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={s.skipLinkText}>Skip for now — submit without documents</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom nav for steps 1 & 2 */}
          {step < 3 && (
            <View style={s.bottomNav}>
              <TouchableOpacity style={s.primaryBtn} onPress={goNext} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Next</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.replace('/sign-in')}
                style={s.switchLink}
              >
                <Text style={s.switchText}>
                  Already have an account?{'  '}
                  <Text style={{ color: C.accent, fontWeight: '700' }}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Step indicator styles ─────────────────────────────────────────────────────
const si = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: { alignItems: 'center', gap: 5 },
  circle: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: { backgroundColor: C.accent, borderColor: C.accent },
  circleDone: { backgroundColor: C.accent, borderColor: C.accent },
  num: { color: C.muted, fontSize: 13, fontWeight: '700' },
  numActive: { color: '#fff' },
  label: { color: C.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  labelActive: { color: C.accent },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: C.border,
    marginBottom: 18,
    marginHorizontal: 6,
  },
  lineDone: { backgroundColor: C.accent },
});

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
  rowError: { borderColor: C.red, backgroundColor: '#FFF5F5' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
  textArea: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 90,
  },
  textAreaError: { borderColor: C.red, backgroundColor: '#FFF5F5' },
  error: { color: C.red, fontSize: 12, marginTop: 2 },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },

  indicatorWrap: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },

  scrollContent: { paddingHorizontal: 28 },

  form: { gap: 20, paddingTop: 20 },
  formHeader: { gap: 6, marginBottom: 4 },
  formTitle: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  formSub: { color: C.muted, fontSize: 14, lineHeight: 20 },

  locationCaptured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accentLight,
    borderWidth: 1.5,
    borderColor: C.accent + '40',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationCapturedText: { flex: 1, color: C.accent, fontSize: 13, fontWeight: '600' },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  locationBtnText: { color: C.accent, fontSize: 14, fontWeight: '600' },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.accent + '60',
    borderRadius: 16,
    borderStyle: 'dashed',
    backgroundColor: C.accentLight,
    paddingVertical: 20,
  },
  uploadBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },

  docList: {
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    padding: 12,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docName: { flex: 1, color: C.text, fontSize: 13, fontWeight: '500' },

  apiErrBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: '#D32F2F', fontSize: 13, textAlign: 'center' },

  bottomNav: { gap: 4, marginTop: 12 },

  primaryBtn: {
    marginTop: 8,
    backgroundColor: C.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  skipLink: { alignItems: 'center', paddingVertical: 12 },
  skipLinkText: { color: C.muted, fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },

  switchLink: { alignItems: 'center', paddingVertical: 16 },
  switchText: { color: C.muted, fontSize: 14 },
});
