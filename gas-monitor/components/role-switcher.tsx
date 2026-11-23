import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { authApi, type ApiUser, type RoleInfo, type UserRole } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';
import { homeRouteFor } from '@/lib/homeRoute';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  border: '#E0EEE0',
  red: '#D32F2F',
};

const META: Record<UserRole, { icon: string; title: string; sub: string; join: string }> = {
  CONSUMER: { icon: '🛍️', title: 'Customer', sub: 'Shop, order and track deliveries', join: '' },
  VENDOR: { icon: '🏪', title: 'Vendor', sub: 'Manage your listings and orders', join: 'Register your business' },
  RIDER: { icon: '🏍️', title: 'Rider', sub: 'Accept deliveries and earn', join: 'Become a delivery partner' },
  LOGISTICS_COMPANY: { icon: '🚚', title: 'Logistics company', sub: 'Run your fleet of riders', join: 'Register your fleet' },
  BRANCH_MANAGER: { icon: '🧑‍💼', title: 'Branch manager', sub: 'Orders and stock for your branch', join: '' },
};

const statusText = (r: RoleInfo): string => {
  switch (r.status) {
    case 'NOT_REGISTERED': return 'Not registered';
    case 'PENDING': return 'Pending approval';
    case 'REJECTED': return 'Not approved';
    default: return '';
  }
};

/** Bottom sheet listing every role the account holds or could register for. */
export function RoleSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [busy, setBusy] = useState<UserRole | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    getSavedUser<ApiUser>().then(setUser);
    // Fresh standings (an approval may have landed since the user was saved).
    authApi.refreshUser().then(setUser).catch(() => {});
  }, [visible]);

  const choose = async (r: RoleInfo) => {
    if (!user) return;
    setError('');
    if (r.role === user.role) return onClose();
    if (r.status === 'NOT_REGISTERED') {
      onClose();
      router.push({ pathname: '/become-role', params: { role: r.role } } as never);
      return;
    }
    if (!r.canSwitch) {
      setError('This role was not approved. Contact support for help.');
      return;
    }
    setBusy(r.role);
    try {
      const updated = await authApi.switchRole(r.role);
      onClose();
      router.replace(homeRouteFor(updated) as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <Text style={s.title}>Switch role</Text>
        <Text style={s.account}>{user?.email}</Text>

        {!user && <ActivityIndicator color={C.accent} style={{ marginVertical: 28 }} />}

        {user?.roles?.map((r) => {
          const m = META[r.role];
          if (!m) return null;
          const current = r.role === user.role;
          return (
            <TouchableOpacity
              key={r.role}
              activeOpacity={0.8}
              disabled={busy !== null}
              onPress={() => choose(r)}
              style={[s.row, current && s.rowCurrent]}
            >
              <Text style={s.icon}>{m.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{m.title}</Text>
                <Text style={s.rowSub}>{r.status === 'NOT_REGISTERED' ? m.join : m.sub}</Text>
              </View>
              {busy === r.role ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Text style={[s.badge, current && { color: C.accent }]}>{current ? 'Current' : statusText(r)}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {!!error && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity onPress={onClose} style={s.close} activeOpacity={0.7}>
          <Text style={{ color: C.muted, fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/** A link for the account screens that opens the switcher. Hidden on older API builds that send no roles. */
export function SwitchRoleLink() {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    getSavedUser<ApiUser>().then((u) => setShow(!!u?.roles?.length));
  }, []);

  if (!show) return null;
  return (
    <>
      <TouchableOpacity style={s.link} activeOpacity={0.7} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={s.linkText}>Switch role</Text>
      </TouchableOpacity>
      <RoleSwitcher visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, padding: 20, paddingBottom: 32, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  account: { color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card, marginBottom: 10,
  },
  rowCurrent: { borderColor: C.accent, backgroundColor: C.accentLight },
  icon: { fontSize: 22 },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  rowSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  badge: { color: C.muted, fontSize: 11, fontWeight: '700' },
  error: { color: C.red, fontSize: 12, marginTop: 4 },
  close: { alignItems: 'center', paddingTop: 14 },
  link: { alignItems: 'center', paddingVertical: 14 },
  linkText: { color: C.accent, fontSize: 13, fontWeight: '600' },
});
