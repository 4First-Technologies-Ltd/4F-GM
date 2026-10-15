import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, Branch, BranchInput, StaffMember } from '@/lib/api';
import { useDrawer } from './_layout';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
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

/** Managers for one branch: invite by email, revoke access. Loaded when expanded. */
function BranchManagers({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try {
      setStaff(await vendorApi.getBranchStaff(branchId));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load managers.');
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && staff === null) load();
  }

  async function invite() {
    if (!/\S+@\S+\.\S+/.test(email)) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    setErr('');
    try {
      await vendorApi.inviteStaff(branchId, email.trim());
      setEmail('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  }

  function revoke(m: StaffMember) {
    Alert.alert('Remove manager?', `${m.user?.name ?? m.email} will lose access to this branch immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await vendorApi.revokeStaff(branchId, m.id);
            await load();
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Could not remove the manager.');
          }
        },
      },
    ]);
  }

  return (
    <View style={{ marginTop: 6 }}>
      <TouchableOpacity onPress={toggle}>
        <Text style={s.link}>{open ? 'Hide managers' : 'Managers'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={s.branchLine}>
            Managers can run this branch&apos;s orders and stock. They cannot see earnings, documents or other branches.
          </Text>
          {staff === null && !err && <ActivityIndicator color={C.accent} size="small" />}
          {staff?.map((m) => (
            <View key={m.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.branchLine, { color: C.text }]} numberOfLines={1}>{m.user?.name ?? m.email}</Text>
                <Text style={s.branchLine}>
                  {m.status === 'ACTIVE' ? m.email : `Invited ${m.email}, waiting for them to sign up`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => revoke(m)}>
                <Text style={[s.link, { color: C.red, marginRight: 0 }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Manager's email"
            placeholderTextColor={C.muted + '99'}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          {!!err && <Text style={[s.branchLine, { color: C.red }]}>{err}</Text>}
          <TouchableOpacity style={[s.btn, busy && { opacity: 0.7 }]} onPress={invite} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Send invite</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const EMPTY: BranchInput = { name: '', address: '', city: '', state: '', phone: '' };

export default function BranchesScreen() {
  const { openDrawer } = useDrawer();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [max, setMax] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  // `null` = form closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<BranchInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await vendorApi.getBranches();
      setBranches(data.branches);
      setMax(data.maxBranches);
      setLoadErr('');
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const activeCount = branches.filter((b) => b.isActive).length;
  const atLimit = activeCount >= max;

  function openNew() {
    setForm(EMPTY);
    setFormErr('');
    setEditing('new');
  }

  function openEdit(b: Branch) {
    setForm({
      name: b.name, address: b.address, city: b.city ?? '', state: b.state ?? '', phone: b.phone,
    });
    setFormErr('');
    setEditing(b.id);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.address.trim() || !form.phone.trim()) {
      setFormErr('Branch name, address and phone are required.');
      return;
    }
    const payload: BranchInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      ...(form.city?.trim() ? { city: form.city.trim() } : {}),
      ...(form.state?.trim() ? { state: form.state.trim() } : {}),
    };
    setSaving(true);
    setFormErr('');
    try {
      if (editing === 'new') await vendorApi.createBranch(payload);
      else if (editing) await vendorApi.updateBranch(editing, payload);
      setEditing(null);
      await load();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Could not save the branch.');
    } finally {
      setSaving(false);
    }
  }

  async function run(id: string, action: 'make-main' | 'deactivate' | 'reactivate') {
    setBusyId(id);
    try {
      await vendorApi.branchAction(id, action);
      await load();
    } catch (err) {
      Alert.alert('Could not update branch', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmClose(b: Branch) {
    Alert.alert(
      `Close ${b.name}?`,
      'Its listings stop showing to customers. You can reopen it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close branch', style: 'destructive', onPress: () => run(b.id, 'deactivate') },
      ],
    );
  }

  const field = (key: keyof BranchInput, label: string, placeholder: string, extra?: object) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={(form[key] as string) ?? ''}
        onChangeText={(t) => setForm((f) => ({ ...f, [key]: t }))}
        placeholder={placeholder}
        placeholderTextColor={C.muted + '99'}
        {...extra}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Branches</Text>
          <Text style={s.headerSub}>{activeCount} of {max} open on your plan</Text>
        </View>
        {editing === null && (
          <TouchableOpacity
            style={[s.addBtn, atLimit && { opacity: 0.4 }]}
            onPress={openNew}
            disabled={atLimit}
            activeOpacity={0.8}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!!loadErr && (
            <View style={s.errBox}><Text style={s.errText}>{loadErr}</Text></View>
          )}

          {editing !== null && (
            <View style={[s.card, cardShadow]}>
              <Text style={s.cardTitle}>{editing === 'new' ? 'New branch' : 'Edit branch'}</Text>
              {field('name', 'Branch name', 'e.g. Lekki Phase 1')}
              {field('address', 'Address', 'Street and area', { multiline: true })}
              {field('city', 'City', 'e.g. Lagos')}
              {field('state', 'State', 'e.g. Lagos')}
              {field('phone', 'Branch phone', '080XXXXXXXX', { keyboardType: 'phone-pad' })}
              {!!formErr && <View style={s.errBox}><Text style={s.errText}>{formErr}</Text></View>}
              <View style={s.row}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setEditing(null)} disabled={saving}>
                  <Text style={s.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {atLimit && editing === null && (
            <View style={s.noteBox}>
              <Text style={s.noteText}>
                You have reached the branch limit for your plan. Close a branch to add another.
              </Text>
            </View>
          )}

          {branches.map((b) => (
            <View key={b.id} style={[s.card, cardShadow, !b.isActive && { opacity: 0.6 }]}>
              <View style={s.row}>
                <IconSymbol name="mappin" size={18} color={C.accent} />
                <Text style={s.branchName} numberOfLines={1}>{b.name}</Text>
                {b.isMain && <View style={s.pill}><Text style={s.pillText}>Main</Text></View>}
                {b.suspendedAt
                  ? <View style={[s.pill, { backgroundColor: '#FFF0F0' }]}><Text style={[s.pillText, { color: C.red }]}>Suspended</Text></View>
                  : !b.isActive && <View style={[s.pill, { backgroundColor: C.amberLight }]}><Text style={[s.pillText, { color: C.amber }]}>Closed</Text></View>}
              </View>
              <Text style={s.branchLine}>{b.address}</Text>
              {!!(b.city || b.state) && (
                <Text style={s.branchLine}>{[b.city, b.state].filter(Boolean).join(', ')}</Text>
              )}
              <Text style={s.branchLine}>{b.phone}</Text>
              {!!b.suspendedAt && (
                <Text style={[s.branchLine, { color: C.red }]}>
                  Suspended by 4FG{b.suspendedReason ? `: ${b.suspendedReason}` : ''}. Contact support to have it restored.
                </Text>
              )}

              <View style={[s.row, { marginTop: 8, flexWrap: 'wrap' }]}>
                {busyId === b.id ? (
                  <ActivityIndicator color={C.accent} size="small" />
                ) : (
                  <>
                    <TouchableOpacity onPress={() => openEdit(b)}><Text style={s.link}>Edit</Text></TouchableOpacity>
                    {b.isActive && !b.suspendedAt && !b.isMain && (
                      <TouchableOpacity onPress={() => run(b.id, 'make-main')}><Text style={s.link}>Make main</Text></TouchableOpacity>
                    )}
                    {b.isActive && !b.isMain && (
                      <TouchableOpacity onPress={() => confirmClose(b)}><Text style={[s.link, { color: C.red }]}>Close</Text></TouchableOpacity>
                    )}
                    {!b.isActive && !b.suspendedAt && (
                      <TouchableOpacity onPress={() => run(b.id, 'reactivate')}><Text style={s.link}>Reopen</Text></TouchableOpacity>
                    )}
                  </>
                )}
              </View>
              {b.isActive && <BranchManagers branchId={b.id} />}
            </View>
          ))}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  menuBtn: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 6 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchName: { color: C.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  branchLine: { color: C.muted, fontSize: 13 },
  pill: { backgroundColor: C.accentLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: C.accent, fontSize: 11, fontWeight: '700' },
  link: { color: C.accent, fontSize: 14, fontWeight: '700', marginRight: 16 },
  field: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 14, backgroundColor: C.surface,
    paddingHorizontal: 16, minHeight: 48, color: C.text, fontSize: 15,
  },
  btn: { flex: 1, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnGhost: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnGhostText: { color: C.text, fontSize: 15, fontWeight: '700' },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
  noteBox: { backgroundColor: C.amberLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  noteText: { color: C.amber, fontSize: 13 },
});
