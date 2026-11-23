import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { authApi, companyApi, riderApi, vendorApi } from '@/lib/api';
import { homeRouteFor } from '@/lib/homeRoute';
import { isValidRcNumber, RC_NUMBER_HINT } from '@/lib/rcNumber';

const C = {
  bg: '#EDF7ED', surface: '#F8FCF8', accent: '#2D7450', accentLight: '#E8F5E8',
  text: '#1A2E1A', muted: '#7A9A7A', border: '#E0EEE0', red: '#D32F2F',
};

type Joinable = 'VENDOR' | 'RIDER' | 'LOGISTICS_COMPANY';
const VEHICLES = ['Motorbike', 'Bicycle', 'Tricycle', 'Car / Van'];
const COPY: Record<Joinable, { title: string; blurb: string }> = {
  VENDOR: { title: 'Register your business', blurb: 'Sell gas on the marketplace from the account you already use.' },
  RIDER: { title: 'Become a delivery partner', blurb: 'Accept deliveries and earn, using the account you already have.' },
  LOGISTICS_COMPANY: { title: 'Register your fleet', blurb: 'Invite riders and watch their deliveries, using the account you already have.' },
};

/**
 * Add another role to the signed-in account. Creates the profile exactly as sign-up
 * does (pending approval, and pending accounts get the whole app), then switches in.
 */
export default function BecomeRoleScreen() {
  const raw = useLocalSearchParams<{ role?: string }>().role;
  const role: Joinable | null = raw === 'VENDOR' || raw === 'RIDER' || raw === 'LOGISTICS_COMPANY' ? raw : null;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [rcNumber, setRcNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  if (!role) {
    router.back();
    return null;
  }

  async function submit() {
    setErr('');
    if (role === 'VENDOR') {
      if (!name.trim() || !address.trim() || !phone.trim()) return setErr('Fill in every field.');
      if (!isValidRcNumber(rcNumber)) return setErr('Enter a valid RC number, e.g. RC1234567.');
    } else if (role === 'RIDER') {
      if (!phone.trim() || !vehicleType) return setErr('Add your phone number and choose a vehicle type.');
    } else if (!name.trim() || !phone.trim() || !address.trim()) {
      return setErr('Add your company name, phone number and address.');
    }

    setLoading(true);
    try {
      if (role === 'VENDOR') {
        await vendorApi.createProfile({
          businessName: name.trim(), businessAddress: address.trim(), phone: phone.trim(), rcNumber: rcNumber.trim(),
        });
      } else if (role === 'RIDER') {
        await riderApi.createProfile({
          phone: phone.trim(), vehicleType, plateNumber: plateNumber.trim() || undefined,
        });
      } else {
        await companyApi.createProfile({
          companyName: name.trim(), address: address.trim(), phone: phone.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(state.trim() ? { state: state.trim() } : {}),
        });
      }
      const updated = await authApi.switchRole(role!);
      router.replace(homeRouteFor(updated) as never);
    } catch (e) {
      // The profile may exist even if the switch failed: refresh so the switcher shows it.
      await authApi.refreshUser().catch(() => {});
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const field = (
    label: string, value: string, set: (t: string) => void, placeholder: string, extra?: object,
  ) => (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input} value={value} onChangeText={set} placeholder={placeholder}
        placeholderTextColor={C.muted + '99'} {...extra}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{COPY[role].title}</Text>
          <Text style={s.sub}>{COPY[role].blurb}</Text>

          {role === 'VENDOR' && (
            <>
              {field('Business name', name, setName, 'Your business name', { autoCapitalize: 'words' })}
              {field('Business address', address, setAddress, 'Street address')}
              {field('Phone number', phone, setPhone, '08012345678', { keyboardType: 'phone-pad' })}
              {field('RC number', rcNumber, setRcNumber, 'RC1234567', { autoCapitalize: 'characters' })}
              <Text style={s.hint}>{RC_NUMBER_HINT}</Text>
            </>
          )}

          {role === 'RIDER' && (
            <>
              {field('Phone number', phone, setPhone, '08012345678', { keyboardType: 'phone-pad' })}
              <Text style={s.label}>Vehicle type</Text>
              <View style={s.chips}>
                {VEHICLES.map((v) => (
                  <TouchableOpacity
                    key={v} activeOpacity={0.8} onPress={() => setVehicleType(v)}
                    style={[s.chip, vehicleType === v && s.chipActive]}
                  >
                    <Text style={[s.chipText, vehicleType === v && { color: '#fff' }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {field('Plate number (optional)', plateNumber, setPlateNumber, 'ABC-123-XY', { autoCapitalize: 'characters', maxLength: 20 })}
            </>
          )}

          {role === 'LOGISTICS_COMPANY' && (
            <>
              {field('Company name', name, setName, 'Your company name', { autoCapitalize: 'words' })}
              {field('Phone number', phone, setPhone, '08012345678', { keyboardType: 'phone-pad' })}
              {field('Address', address, setAddress, 'Street address')}
              {field('State (optional)', state, setState, 'e.g. Lagos')}
              {field('City (optional)', city, setCity, 'e.g. Ikeja')}
            </>
          )}

          {!!err && <Text style={s.error}>{err}</Text>}

          <TouchableOpacity style={[s.primary, loading && { opacity: 0.7 }]} disabled={loading} onPress={submit} activeOpacity={0.85}>
            <Text style={s.primaryText}>{loading ? 'Submitting…' : 'Submit application'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={{ color: C.muted, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { padding: 24, gap: 16 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.muted, fontSize: 14, marginBottom: 4 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12, marginTop: -8 },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, backgroundColor: C.surface,
    paddingHorizontal: 16, height: 52, color: C.text, fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.accentLight },
  chipActive: { backgroundColor: C.accent },
  chipText: { color: C.accent, fontSize: 13, fontWeight: '600' },
  error: { color: C.red, fontSize: 13 },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 6 },
});
