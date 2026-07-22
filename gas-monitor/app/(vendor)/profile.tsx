import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, VendorProfile, VendorStatus } from '@/lib/api';
import { useDrawer } from './_layout';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
  amber: '#B45309',
  amberLight: '#FEF3E2',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const STATUS_META: Record<VendorStatus, { label: string; color: string; bg: string }> = {
  APPROVED: { label: 'Approved', color: C.accent, bg: C.accentLight },
  PENDING: { label: 'Pending Review', color: C.amber, bg: C.amberLight },
  REJECTED: { label: 'Rejected', color: C.red, bg: '#FFF0F0' },
};

export default function VendorProfileScreen() {
  const { openDrawer } = useDrawer();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(null);

  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState('');

  async function loadProfile() {
    try {
      const data = await vendorApi.getProfile();
      setProfile(data);
      setBusinessName(data.businessName);
      setBusinessAddress(data.businessAddress);
      setPhone(data.phone);
      setBio(data.bio ?? '');
      setLogoUrl(data.logoUrl);
    } catch {
      // empty state / stale profile handles this
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  async function handlePickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setLogoUrl(result.assets[0].uri);
    }
  }

  async function handleSave() {
    setApiErr('');
    if (!businessName.trim() || !businessAddress.trim() || !phone.trim()) {
      setApiErr('Business name, address, and phone are required.');
      return;
    }
    setSaving(true);
    try {
      const updated = await vendorApi.updateProfile({
        businessName: businessName.trim(),
        businessAddress: businessAddress.trim(),
        phone: phone.trim(),
        bio: bio.trim() || null,
        logoUrl: logoUrl || null,
      });
      setProfile(updated);
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  const status = profile ? STATUS_META[profile.status] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Business Profile</Text>
          <Text style={s.headerSub}>How customers see your business</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={[s.heroCard, cardShadow]}>
            <TouchableOpacity onPress={handlePickLogo} activeOpacity={0.8} style={s.logoWrap}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={s.logoImg} />
              ) : (
                <View style={s.logoImg}>
                  <IconSymbol name="storefront.fill" size={26} color="#fff" />
                </View>
              )}
              <View style={s.logoEditBadge}>
                <IconSymbol name="plus" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={s.heroName} numberOfLines={1}>{businessName || 'Your Business'}</Text>
            {status && (
              <View style={[s.statusPill, { backgroundColor: status.bg }]}>
                <Text style={[s.statusPillText, { color: status.color }]}>{status.label}</Text>
              </View>
            )}
          </View>

          {/* Form */}
          <View style={s.field}>
            <Text style={s.label}>Business name</Text>
            <TextInput
              style={s.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Adaeze Gas Supplies"
              placeholderTextColor={C.muted + '99'}
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Business address</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={businessAddress}
              onChangeText={setBusinessAddress}
              placeholder="Street, city, state"
              placeholderTextColor={C.muted + '99'}
              multiline
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Business phone</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 080XXXXXXXX"
              placeholderTextColor={C.muted + '99'}
              keyboardType="phone-pad"
            />
          </View>

          <View style={s.field}>
            <View style={s.bioLabelRow}>
              <Text style={s.label}>About your business</Text>
              <Text style={s.bioCount}>{bio.length}/500</Text>
            </View>
            <TextInput
              style={[s.input, s.inputBio]}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 500))}
              placeholder="A short description consumers will see on your listings"
              placeholderTextColor={C.muted + '99'}
              multiline
              maxLength={500}
            />
          </View>

          {profile && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Member since</Text>
              <Text style={s.metaValue}>
                {new Date(profile.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}

          {!!apiErr && (
            <View style={s.apiErr}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Profile</Text>}
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  menuBtn: {
    width: 44, height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  body: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },

  heroCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  logoWrap: { position: 'relative' },
  logoImg: {
    width: 72, height: 72,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEditBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 4 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  field: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  bioLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioCount: { color: C.muted, fontSize: 11.5 },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    height: 52,
    color: C.text,
    fontSize: 15,
  },
  inputMultiline: { height: 60, paddingTop: 14, textAlignVertical: 'top' },
  inputBio: { height: 100, paddingTop: 14, textAlignVertical: 'top' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metaLabel: { color: C.muted, fontSize: 13, fontWeight: '600' },
  metaValue: { color: C.text, fontSize: 13, fontWeight: '700' },

  apiErr: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },

  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
