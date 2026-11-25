import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { authApi, ordersApi, savedApi, type ApiUser } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { useAddresses } from '@/hooks/use-addresses';
import { UseMyLocationButton } from '@/components/use-my-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwitchRoleLink } from '@/components/role-switcher';

type IconSymbolName = React.ComponentProps<typeof IconSymbol>['name'];

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;

const OPEN = ['CONFIRMED', 'ACCEPTED', 'OUT_FOR_DELIVERY'];

const SHORTCUTS: { icon: IconSymbolName; label: string; route: string }[] = [
  { icon: 'shippingbox.fill', label: 'My orders', route: '/order/history' },
  { icon: 'bookmark.fill', label: 'Saved items', route: '/order/saved' },
  { icon: 'wifi', label: 'My monitors', route: '/monitors' },
  { icon: 'bell.fill', label: 'Notifications', route: '/notifications' },
];

function memberSince(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

/**
 * The customer's own profile: picture, details, saved addresses, a summary of
 * their activity and shortcuts. Switch role stays at the bottom.
 */
export default function ProfileScreen() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [stats, setStats] = useState<{ orders: number; open: number; saved: number } | null>(null);

  const { addresses, loading: addressesLoading, error: addressError, add, setDefault, remove } = useAddresses();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState<(typeof ADDRESS_LABELS)[number]>('Home');
  const [newAddress, setNewAddress] = useState('');
  const [addressBusy, setAddressBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const apply = (u: ApiUser | null) => {
        if (!alive || !u) return;
        setUser(u);
        setName(u.name ?? '');
        setPhone(u.phone ?? '');
      };
      getSavedUser<ApiUser>().then(apply);
      authApi.refreshUser().then(apply).catch(() => {});
      Promise.all([ordersApi.list(), savedApi.ids().catch(() => [] as string[])])
        .then(([orders, saved]) => {
          if (alive) setStats({ orders: orders.length, open: orders.filter((o) => OPEN.includes(o.status)).length, saved: saved.length });
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

  const initials =
    (user?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  const photo = localPhoto ?? user?.avatarUrl ?? null;
  const dirty = !!user && (name.trim() !== (user.name ?? '') || phone.trim() !== (user.phone ?? ''));

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setUser(updated);
      setName(updated.name ?? '');
      setPhone(updated.phone ?? '');
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function choosePhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to choose a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7, // keeps phone photos well under the 5 MB limit
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoBusy(true);
    setLocalPhoto(asset.uri);
    try {
      const { key } = await authApi.uploadAvatar({ uri: asset.uri, mimeType: asset.mimeType });
      setUser(await authApi.updateProfile({ avatarKey: key }));
    } catch (err: any) {
      setLocalPhoto(null);
      Alert.alert('Upload failed', err?.message ?? 'Could not upload the photo. Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      setUser(await authApi.updateProfile({ avatarKey: null }));
      setLocalPhoto(null);
    } catch (err: any) {
      Alert.alert('Could not remove the photo', err?.message ?? 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function editPhoto() {
    if (photoBusy) return;
    if (!photo) {
      void choosePhoto();
      return;
    }
    Alert.alert('Profile picture', undefined, [
      { text: 'Choose a new photo', onPress: () => void choosePhoto() },
      { text: 'Remove photo', style: 'destructive', onPress: () => void removePhoto() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function saveAddress() {
    if (newAddress.trim().length < 5) {
      Alert.alert('Address too short', 'Enter the full delivery address.');
      return;
    }
    setAddressBusy('new');
    try {
      await add(newLabel, newAddress.trim());
      setNewAddress('');
      setNewLabel('Home');
      setAdding(false);
    } catch (err: any) {
      Alert.alert('Could not save the address', err?.message ?? 'Please try again.');
    } finally {
      setAddressBusy(null);
    }
  }

  async function makeDefault(id: string) {
    setAddressBusy(id);
    try {
      await setDefault(id);
    } catch (err: any) {
      Alert.alert('Could not update', err?.message ?? 'Please try again.');
    } finally {
      setAddressBusy(null);
    }
  }

  function confirmRemove(id: string, label: string) {
    Alert.alert('Remove address?', `"${label}" will be removed from your saved addresses.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setAddressBusy(id);
          try {
            await remove(id);
          } catch (err: any) {
            Alert.alert('Could not remove', err?.message ?? 'Please try again.');
          } finally {
            setAddressBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <IconSymbol name="chevron.left" size={20} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Picture, name, email */}
          <View style={s.hero}>
            <TouchableOpacity
              onPress={editPhoto}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={photo ? 'Change or remove profile picture' : 'Add a profile picture'}
            >
              <View style={s.avatar}>
                {photo ? (
                  <Image source={{ uri: photo }} style={s.avatarImg} />
                ) : (
                  <Text style={s.avatarText}>{initials}</Text>
                )}
                {photoBusy && (
                  <View style={s.avatarBusy}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
              <View style={s.cameraBadge}>
                <IconSymbol name="camera.fill" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={s.heroName} numberOfLines={1}>{user?.name ?? 'Your account'}</Text>
            <Text style={s.heroEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
            {!!user?.createdAt && <Text style={s.heroSince}>Member since {memberSince(user.createdAt)}</Text>}
          </View>

          {/* Activity */}
          <View style={s.statsRow}>
            {[
              { label: 'Orders', value: stats?.orders, route: '/order/history' },
              { label: 'In progress', value: stats?.open, route: '/order/history' },
              { label: 'Saved', value: stats?.saved, route: '/order/saved' },
              { label: 'Addresses', value: addressesLoading ? undefined : addresses.length, route: null },
            ].map((stat) => (
              <TouchableOpacity
                key={stat.label}
                style={[s.stat, cardShadow]}
                disabled={!stat.route}
                onPress={() => stat.route && router.push(stat.route as never)}
                activeOpacity={0.8}
              >
                <Text style={s.statValue}>{stat.value ?? '–'}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Personal details */}
          <View style={[s.card, cardShadow]}>
            <Text style={s.cardTitle}>Personal details</Text>
            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Your name"
              placeholderTextColor={C.muted + '99'}
            />

            <Text style={s.label}>Phone</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 0803 000 0000"
              placeholderTextColor={C.muted + '99'}
            />
            <Text style={s.hint}>Riders use this number to reach you when they arrive.</Text>

            <Text style={s.label}>Email</Text>
            <View style={[s.input, s.inputReadonly]}>
              <Text style={s.readonlyText} numberOfLines={1}>{user?.email ?? ''}</Text>
            </View>

            <TouchableOpacity
              style={[s.saveBtn, (!dirty || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!dirty || saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save changes</Text>}
            </TouchableOpacity>
          </View>

          {/* Delivery addresses (the same list the order form and the website use) */}
          <View style={[s.card, cardShadow]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Delivery addresses</Text>
              {!adding && (
                <TouchableOpacity onPress={() => setAdding(true)} style={s.addLink} activeOpacity={0.7}>
                  <IconSymbol name="plus" size={16} color={C.accent} />
                  <Text style={s.addLinkText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {addressesLoading ? (
              <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />
            ) : addresses.length === 0 && !adding ? (
              <Text style={s.empty}>No saved addresses yet. Add one to check out faster.</Text>
            ) : (
              addresses.map((a) => (
                <View key={a.id} style={s.addressRow}>
                  <View style={s.addressIcon}>
                    <IconSymbol name="mappin" size={16} color={C.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.addressLabel}>{a.label}</Text>
                      {a.isDefault && (
                        <View style={s.defaultPill}>
                          <Text style={s.defaultPillText}>Default</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.addressText} numberOfLines={2}>{a.fullAddress}</Text>
                    <View style={s.addressActions}>
                      {!a.isDefault && (
                        <TouchableOpacity onPress={() => makeDefault(a.id)} disabled={addressBusy !== null} activeOpacity={0.7}>
                          <Text style={s.actionText}>Make default</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => confirmRemove(a.id, a.label)} disabled={addressBusy !== null} activeOpacity={0.7}>
                        <Text style={[s.actionText, { color: C.red }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {addressBusy === a.id && <ActivityIndicator color={C.accent} />}
                </View>
              ))
            )}
            {!!addressError && <Text style={[s.hint, { color: C.red }]}>{addressError}</Text>}

            {adding && (
              <View style={s.addForm}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ADDRESS_LABELS.map((l) => (
                    <TouchableOpacity
                      key={l}
                      onPress={() => setNewLabel(l)}
                      style={[s.chip, newLabel === l && s.chipOn]}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chipText, newLabel === l && s.chipTextOn]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[s.input, { minHeight: 72, textAlignVertical: 'top', marginTop: 10 }]}
                  value={newAddress}
                  onChangeText={setNewAddress}
                  multiline
                  placeholder="House number, street, area, city"
                  placeholderTextColor={C.muted + '99'}
                />
                <UseMyLocationButton onAddress={setNewAddress} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[s.secondaryBtn, { flex: 1 }]}
                    onPress={() => {
                      setAdding(false);
                      setNewAddress('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, { flex: 1, marginTop: 0 }, addressBusy === 'new' && { opacity: 0.6 }]}
                    onPress={saveAddress}
                    disabled={addressBusy === 'new'}
                    activeOpacity={0.85}
                  >
                    {addressBusy === 'new' ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save address</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Shortcuts */}
          <View style={[s.card, cardShadow, { paddingVertical: 6 }]}>
            {SHORTCUTS.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[s.linkRow, i > 0 && s.linkRowBorder]}
                onPress={() => router.push(item.route as never)}
                activeOpacity={0.7}
              >
                <View style={s.linkIcon}>
                  <IconSymbol name={item.icon} size={17} color={C.accent} />
                </View>
                <Text style={s.linkText}>{item.label}</Text>
                <IconSymbol name="chevron.right" size={16} color={C.muted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Security */}
          <View style={[s.card, cardShadow, { paddingVertical: 6 }]}>
            <TouchableOpacity
              style={s.linkRow}
              onPress={() => router.push({ pathname: '/forgot-password', params: { email: user?.email ?? '' } } as never)}
              activeOpacity={0.7}
            >
              <View style={s.linkIcon}>
                <IconSymbol name="lock.fill" size={17} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.linkText}>Change password</Text>
                <Text style={s.hint}>We email you a code to set a new one.</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={C.muted} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.linkRow, s.linkRowBorder]} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.7}>
              <View style={s.linkIcon}>
                <IconSymbol name="gearshape.fill" size={17} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.linkText}>Settings</Text>
                <Text style={s.hint}>Notifications, units, privacy and account deletion.</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Pushed to the bottom of the screen so it is always easy to find. */}
          <View style={s.bottom}>
            <SwitchRoleLink />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },

  // flexGrow + the bottom block's marginTop:'auto' keep Switch role at the foot of short screens too.
  container: { padding: 16, gap: 16, flexGrow: 1, paddingBottom: 24 },

  hero: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  avatar: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: C.accentLight, overflow: 'hidden',
    borderWidth: 1, borderColor: C.accent + '40', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.accent, fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  cameraBadge: {
    position: 'absolute', right: 0, bottom: 6, width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  heroName: { color: C.text, fontSize: 19, fontWeight: '800' },
  heroEmail: { color: C.muted, fontSize: 13 },
  heroSince: { color: C.muted, fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, alignItems: 'center', gap: 2,
  },
  statValue: { color: C.accent, fontSize: 20, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  hint: { color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  input: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15,
  },
  inputReadonly: { backgroundColor: '#EEF4EE' },
  readonlyText: { color: C.muted, fontSize: 15 },
  saveBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.accent },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  secondaryBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },

  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  addLinkText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 13, paddingVertical: 8 },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  addressIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  addressLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  addressText: { color: C.muted, fontSize: 13, lineHeight: 18 },
  addressActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actionText: { color: C.accent, fontSize: 13, fontWeight: '700' },
  defaultPill: { backgroundColor: C.accentLight, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  defaultPillText: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  addForm: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 },
  chip: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: C.accent, backgroundColor: C.accentLight },
  chipText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: C.accent },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  linkRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  linkIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  linkText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },

  bottom: { marginTop: 'auto', paddingTop: 8 },
});
