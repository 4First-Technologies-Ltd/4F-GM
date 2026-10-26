import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

const C = {
  bg: '#EDF7ED',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  dim: '#AECAAE',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  accent: '#2D7450',
};

/**
 * Usage history is empty until the sensor reports real readings — the previous
 * hardcoded rows were demo data and must not reach users.
 */
export default function HistoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Usage History</Text>
        <Text style={s.headerSub}>Your gas readings over time</Text>
      </View>

      <View style={s.empty}>
        <View style={s.iconCircle}>
          <IconSymbol name="chart.line.uptrend.xyaxis" size={32} color={C.dim} />
        </View>
        <Text style={s.emptyTitle}>No readings yet</Text>
        <Text style={s.emptySub}>
          Once your 4FG sensor is set up and reporting, your gas level history will appear here.
        </Text>
        <TouchableOpacity style={s.cta} onPress={() => router.push('/(tabs)/device')} activeOpacity={0.85}>
          <Text style={s.ctaText}>Set up your device</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingVertical: 8, paddingHorizontal: 18, marginTop: 8 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: C.muted, fontSize: 13, marginTop: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 10 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptySub: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 10, backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
