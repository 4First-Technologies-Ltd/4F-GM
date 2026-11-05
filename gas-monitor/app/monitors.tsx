import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ApiRequestError, cylinderApi, monitorApi, type Monitor, type MonitorHourPoint } from '@/lib/api';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', border: '#E0EEE0', text: '#1A2E1A', muted: '#7A9A7A',
  accent: '#2D7450', accentLight: '#E8F5E8', red: '#D32F2F',
};
const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const SIZES = [6, 12.5, 25, 50];

/** The customer's profile for this size, creating one the first time. */
async function cylinderIdFor(sizeKg: number): Promise<string> {
  const existing = (await cylinderApi.list()).find((c) => c.sizeKg === sizeKg);
  if (existing) return existing.id;
  const made = await cylinderApi.create({ name: `${sizeKg} kg`, sizeKg, imageKey: sizeKg <= 9 ? '6kg' : sizeKg <= 30 ? '12.5kg' : '50kg' });
  return made.id;
}

const errText =(e: unknown, fallback: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : fallback);

function ago(sec: number | null): string {
  if (sec == null) return 'never';
  if (sec < 90) return 'just now';
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} days ago`;
}

/** What the gauge says. `null` is never shown as 0: see docs/DEVICE_API.md. */
function levelText(m: Monitor): { big: string; small: string } {
  const s = m.state;
  if (s.calibrating) return { big: 'Calibrating', small: s.grossKg != null ? `${s.grossKg.toFixed(1)} kg on the platform` : 'Waiting for a reading' };
  if (s.percent == null) return { big: 'No cylinder', small: 'Nothing is on the platform right now' };
  return { big: `${Math.round(s.percent)}%`, small: s.netKg != null ? `${s.netKg.toFixed(1)} kg of gas left` : '' };
}

/** Last 24 hours as bars, one per hour. Plain views: no native chart dependency. */
function Chart({ points }: { points: MonitorHourPoint[] }) {
  const pts = points.filter((p) => p.percent != null);
  if (pts.length < 2) return <Text style={st.muted}>Not enough readings yet for a chart.</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2 }} accessibilityLabel="Gas level over the last 24 hours">
      {pts.map((p) => (
        <View key={p.t} style={{ flex: 1, height: Math.max(2, (Math.min(100, p.percent!) / 100) * 80), backgroundColor: C.accent, borderRadius: 2 }} />
      ))}
    </View>
  );
}

function Detail({ initial }: { initial: Monitor }) {
  const [m, setM] = useState(initial);
  const [points, setPoints] = useState<MonitorHourPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [size, setSize] = useState<number | null>(initial.cylinder?.sizeKg ?? null);
  const [tw, setTw] = useState(initial.emptyWeightKg != null ? String(initial.emptyWeightKg) : '');

  async function saveCylinder() {
    const empty = Number(tw);
    if (size == null || !Number.isFinite(empty) || empty < 1 || empty > 100) {
      setNote('Choose the cylinder size and enter its empty weight (1 to 100 kg).');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const cylinderId = await cylinderIdFor(size);
      const { device } = await monitorApi.settings(m.id, { cylinderId, emptyWeightKg: empty });
      setM(device);
      setNote('Saved. The gauge will show the gas left on the next reading.');
    } catch (e) {
      setNote(errText(e, 'Could not save the cylinder.'));
    } finally {
      setBusy(false);
    }
  }

  const reload = useCallback(async () => {
    const [d, h] = await Promise.all([monitorApi.get(initial.id), monitorApi.hourly(initial.id).catch(() => ({ points: [] as MonitorHourPoint[] }))]);
    setM(d.device);
    setPoints(h.points);
  }, [initial.id]);

  useEffect(() => { void reload().catch((e) => setNote(errText(e, 'Could not load this monitor.'))); }, [reload]);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      // One key per tap: a retry returns the same command instead of sending a second.
      const key = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let { command } = await monitorApi.command(m.id, 'REPORT_NOW', key);
      for (let i = 0; i < 12 && (command.status === 'QUEUED' || command.status === 'SENT'); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        command = (await monitorApi.getCommand(m.id, command.id)).command;
      }
      if (command.status === 'ACKED') await reload();
      setNote(command.status === 'ACKED' ? 'Updated.' : command.status === 'FAILED' ? `The monitor could not do that${command.detail ? ` (${command.detail})` : ''}.` : 'The monitor did not respond. Try again in a moment.');
    } catch (e) {
      setNote(errText(e, 'Could not reach the monitor.'));
    } finally {
      setBusy(false);
    }
  }

  const lvl = levelText(m);
  const warn = m.state.stale || !m.state.online;
  return (
    <View style={[st.card, cardShadow, { gap: 12 }]}>
      <Text style={st.big}>{lvl.big}</Text>
      <Text style={st.muted}>{lvl.small}</Text>
      <Text style={[st.muted, warn && { color: C.red, fontWeight: '600' }]}>
        {m.state.online && !m.state.stale ? 'Online' : m.state.stale ? 'No recent readings' : 'Offline'} · updated {ago(m.state.readingAgeSec)}
      </Text>
      <Text style={st.muted}>
        {m.state.externalPower ? 'On mains power' : m.state.batteryPct != null ? `Battery ${m.state.batteryPct}%` : ''}
        {m.state.tempC != null ? `  ${m.state.tempC.toFixed(0)}°C` : ''}
      </Text>
      <Chart points={points} />
      {m.config.pending && <Text style={st.muted}>A settings change will apply when the monitor next checks in.</Text>}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {m.role !== 'VIEWER' && (
          <TouchableOpacity style={[st.btn, (busy || !m.state.online) && { opacity: 0.5 }]} disabled={busy || !m.state.online} onPress={refresh} activeOpacity={0.8}>
            <Text style={st.btnText}>{busy ? 'Working…' : 'Refresh now'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={st.btnGhost} onPress={() => router.push({ pathname: '/order' as never, params: { deviceId: m.id } })} activeOpacity={0.8}>
          <Text style={st.btnGhostText}>Order a refill</Text>
        </TouchableOpacity>
      </View>
      {note && <Text style={st.muted}>{note}</Text>}

      {m.role === 'OWNER' && (
        <View style={[{ gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 }, (m.state.calibrating || !m.cylinder) && { backgroundColor: C.accentLight, borderRadius: 12, padding: 12 }]}>
          <Text style={st.name}>{m.state.calibrating || !m.cylinder ? 'Set up your cylinder to see how much gas is left' : 'Cylinder'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {SIZES.map((kg) => (
              <TouchableOpacity key={kg} onPress={() => setSize(kg)} activeOpacity={0.8} accessibilityState={{ selected: size === kg }} style={[st.chip, size === kg && st.chipOn]}>
                <Text style={[st.chipText, size === kg && { color: '#fff' }]}>{kg} kg</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={st.muted}>Empty weight in kg (stamped on the collar, marked TW)</Text>
          <TextInput style={st.input} value={tw} onChangeText={setTw} keyboardType="decimal-pad" placeholder="e.g. 15" placeholderTextColor={C.muted} />
          <TouchableOpacity style={[st.btn, busy && { opacity: 0.5 }]} disabled={busy} onPress={saveCylinder} activeOpacity={0.8}>
            <Text style={st.btnText}>Save cylinder</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function MonitorsScreen() {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [claimId, setClaimId] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [claimNote, setClaimNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { devices } = await monitorApi.list();
      setMonitors(devices);
      setOpen((cur) => cur ?? devices[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError(errText(e, 'Could not load your monitors.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function claim() {
    setClaimNote(null);
    try {
      const { device } = await monitorApi.claim(claimId.trim(), claimCode.trim());
      setClaimId('');
      setClaimCode('');
      setOpen(device.id);
      await load();
    } catch (e) {
      setClaimNote(e instanceof ApiRequestError && e.code === 'INVALID_CLAIM' ? 'That ID and code do not match an unclaimed monitor. Check the label on the device.' : errText(e, 'Could not add the monitor.'));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: C.accent, fontSize: 24 }}>‹</Text>
        </TouchableOpacity>
        <Text style={st.title}>My monitors</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.accent} />}
      >
        {error && <Text style={{ color: C.red }}>{error}</Text>}
        {!monitors && !error && <ActivityIndicator color={C.accent} />}
        {monitors?.map((m) => (
          <View key={m.id} style={{ gap: 8 }}>
            <TouchableOpacity style={[st.card, cardShadow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setOpen(open === m.id ? null : m.id)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{m.nickname ?? m.id}</Text>
                <Text style={st.muted}>{m.nickname ? `${m.id} · ` : ''}{m.state.online ? 'Online' : 'Offline'}</Text>
              </View>
              <Text style={st.level}>{levelText(m).big}</Text>
            </TouchableOpacity>
            {open === m.id && <Detail key={m.id} initial={m} />}
          </View>
        ))}
        {monitors && monitors.length === 0 && <Text style={st.muted}>No monitors yet. Add yours with the ID and code printed on the device.</Text>}

        <View style={[st.card, cardShadow, { gap: 10 }]}>
          <Text style={st.name}>Add a monitor</Text>
          <TextInput style={st.input} value={claimId} onChangeText={setClaimId} placeholder="Device ID, e.g. FG-2026-0001" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={C.muted} />
          <TextInput style={st.input} value={claimCode} onChangeText={setClaimCode} placeholder="Claim code, e.g. ABCD-EFGH" autoCapitalize="characters" autoCorrect={false} placeholderTextColor={C.muted} />
          <TouchableOpacity style={[st.btn, (!claimId.trim() || !claimCode.trim()) && { opacity: 0.5 }]} disabled={!claimId.trim() || !claimCode.trim()} onPress={claim} activeOpacity={0.8}>
            <Text style={st.btnText}>Add monitor</Text>
          </TouchableOpacity>
          {claimNote && <Text style={{ color: C.red, fontSize: 13 }}>{claimNote}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  name: { fontSize: 16, fontWeight: '600', color: C.text },
  level: { fontSize: 18, fontWeight: '700', color: C.accent },
  big: { fontSize: 32, fontWeight: '700', color: C.text },
  muted: { fontSize: 13, color: C.muted },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.text, backgroundColor: '#F5FBF5' },
  btn: { backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontWeight: '600' },
  btnGhost: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center' },
  btnGhostText: { color: C.text, fontWeight: '600' },
});
