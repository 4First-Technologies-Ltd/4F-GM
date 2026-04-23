import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  dim: '#AECAAE',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  red: '#D32F2F',
  orange: '#E65100',
  green: '#2D7450',
  yellow: '#C79000',
};

const HISTORY = [
  { date: 'Today, 8:35 AM', level: 0, kg: 0.0, delta: -2.1, status: 'critical' },
  { date: 'Yesterday, 6:12 PM', level: 17, kg: 2.1, delta: -1.8, status: 'low' },
  { date: 'Apr 20, 10:04 AM', level: 31, kg: 3.9, delta: -2.4, status: 'moderate' },
  { date: 'Apr 18, 7:50 PM', level: 50, kg: 6.3, delta: -1.5, status: 'moderate' },
  { date: 'Apr 16, 9:20 AM', level: 62, kg: 7.8, delta: -3.0, status: 'good' },
  { date: 'Apr 13, 3:30 PM', level: 86, kg: 10.8, delta: -1.4, status: 'good' },
  { date: 'Apr 11, 11:00 AM', level: 97, kg: 12.1, delta: 0, status: 'good' },
];

const STATUS_COLOR: Record<string, string> = {
  critical: C.red,
  low: C.orange,
  moderate: C.yellow,
  good: C.green,
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function HistoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Usage History</Text>
          <Text style={s.headerSub}>Last 30 days of gas readings</Text>
        </View>

        {/* Summary strip */}
        <View style={[s.summaryCard, { ...cardShadow }]}>
          <SummaryItem label="AVG DAILY USE" value="1.8 kg" />
          <View style={s.divider} />
          <SummaryItem label="TOTAL USED" value="12.1 kg" />
          <View style={s.divider} />
          <SummaryItem label="REFILLS" value="1" />
        </View>

        {/* Timeline */}
        {HISTORY.map((item, i) => {
          const color = STATUS_COLOR[item.status];
          return (
            <View key={i} style={[s.card, { ...cardShadow }]}>
              <View style={[s.cardLeft, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                <Text style={[s.cardPct, { color }]}>{item.level}%</Text>
                <Text style={[s.cardKg, { color }]}>{item.kg.toFixed(1)} kg</Text>
              </View>
              <View style={s.cardRight}>
                <Text style={s.cardDate}>{item.date}</Text>
                {item.delta < 0 && (
                  <Text style={s.cardDelta}>↓ {Math.abs(item.delta).toFixed(1)} kg used since last reading</Text>
                )}
                <View style={[s.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                  <View style={[s.badgeDot, { backgroundColor: color }]} />
                  <Text style={[s.badgeText, { color }]}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  header: { paddingVertical: 8, paddingHorizontal: 2, marginBottom: 4 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: C.muted, fontSize: 13, marginTop: 2 },

  summaryCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    paddingVertical: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: C.text, fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },
  divider: { width: 1, backgroundColor: C.border },

  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardLeft: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: C.border,
    borderWidth: 0,
    paddingVertical: 16,
  },
  cardPct: { fontSize: 22, fontWeight: '800' },
  cardKg: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  cardRight: { flex: 1, padding: 14, gap: 6 },
  cardDate: { color: C.text, fontSize: 13, fontWeight: '600' },
  cardDelta: { color: C.muted, fontSize: 12 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
