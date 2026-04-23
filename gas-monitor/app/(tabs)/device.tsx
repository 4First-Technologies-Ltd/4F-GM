import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  dim: '#AECAAE',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  red: '#D32F2F',
  green: '#2D7450',
  orange: '#E65100',
  yellow: '#F9A825',
  blue: '#1565C0',
  accent: '#2D7450',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function DeviceScreen() {
  const [autoSync, setAutoSync] = useState(true);
  const [lowAlerts, setLowAlerts] = useState(true);
  const [criticalAlerts, setCriticalAlerts] = useState(true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Device</Text>
          <Text style={s.headerSub}>Sensor status and configuration</Text>
        </View>

        {/* Connection Status */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={[s.accentBar, { backgroundColor: C.green }]} />
          <View style={s.deviceHero}>
            <View style={[s.deviceIcon, { backgroundColor: C.green + '18', borderColor: C.green + '40' }]}>
              <Text style={[s.deviceIconText, { color: C.green }]}>4FG</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deviceName}>4FG Sensor v2</Text>
              <Text style={s.deviceId}>ID: FG-2024-0047</Text>
              <View style={s.connectedRow}>
                <View style={[s.connDot, { backgroundColor: C.green }]} />
                <Text style={[s.connText, { color: C.green }]}>Connected</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Signal + Battery */}
        <View style={s.row}>
          <MetricCard
            label="SIGNAL"
            value="Strong"
            sub="–62 dBm"
            color={C.green}
            abbr="SIG"
          />
          <MetricCard
            label="BATTERY"
            value="84%"
            sub="~14 days left"
            color={C.blue}
            abbr="BAT"
          />
        </View>

        {/* Sensor Readings */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Sensor Readings</Text>
            <Text style={s.liveChip}>LIVE</Text>
          </View>
          <ReadingRow label="Weight Sensor" value="0.0 kg" note="Calibrated" color={C.muted} />
          <ReadingRow label="Temperature" value="24°C" note="Normal" color={C.green} />
          <ReadingRow label="Pressure" value="0 bar" note="Empty" color={C.red} />
          <ReadingRow label="Firmware" value="v3.1.4" note="Up to date" color={C.blue} />
        </View>

        {/* Settings */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Device Settings</Text>
          </View>
          <ToggleRow
            label="Auto-sync"
            sub="Sync readings every 5 minutes"
            value={autoSync}
            onToggle={setAutoSync}
          />
          <ToggleRow
            label="Low Gas Alerts"
            sub="Notify when below 25%"
            value={lowAlerts}
            onToggle={setLowAlerts}
          />
          <ToggleRow
            label="Critical Alerts"
            sub="Notify when below 10%"
            value={criticalAlerts}
            onToggle={setCriticalAlerts}
            isLast
          />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ abbr, label, value, sub, color }: {
  abbr: string; label: string; value: string; sub: string; color: string;
}) {
  return (
    <View style={[s.card, s.metricCard, { borderColor: color + '40', ...cardShadow }]}>
      <View style={[s.metricIcon, { backgroundColor: color + '18' }]}>
        <Text style={[s.metricIconText, { color }]}>{abbr}</Text>
      </View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricSub}>{sub}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function ReadingRow({ label, value, note, color }: {
  label: string; value: string; note: string; color: string;
}) {
  return (
    <View style={s.readingRow}>
      <Text style={s.readingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.readingNote, { color }]}>{note}</Text>
        <Text style={s.readingValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToggleRow({ label, sub, value, onToggle, isLast }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void; isLast?: boolean;
}) {
  return (
    <View style={[s.toggleRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: C.border, true: C.accent + 'AA' }}
        thumbColor={value ? C.accent : C.muted}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { paddingVertical: 8, paddingHorizontal: 2, marginBottom: 4 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: C.muted, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  accentBar: { height: 3 },
  deviceHero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  deviceIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceIconText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  deviceName: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 2 },
  deviceId: { color: C.muted, fontSize: 12, marginBottom: 8 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { fontSize: 13, fontWeight: '600' },

  row: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, padding: 16, gap: 3 },
  metricIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  metricIconText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  metricValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  metricSub: { color: C.muted, fontSize: 12 },
  metricLabel: { color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  liveChip: {
    color: C.green,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    backgroundColor: C.green + '1A',
    borderWidth: 1,
    borderColor: C.green + '40',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  readingLabel: { color: C.muted, fontSize: 13 },
  readingValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  readingNote: { fontSize: 11, fontWeight: '500' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 12,
  },
  toggleLabel: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  toggleSub: { color: C.muted, fontSize: 12 },
});
