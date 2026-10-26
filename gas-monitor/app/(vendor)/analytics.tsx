import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AnalyticsView } from '@/components/analytics-view';
import { useDrawer } from './_layout';

const C = { bg: '#EDF7ED', text: '#1A2E1A', muted: '#7A9A7A', accent: '#2D7450', accentLight: '#E8F5E8' };

export default function VendorAnalyticsScreen() {
  const { openDrawer } = useDrawer();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Analytics</Text>
          <Text style={s.sub}>Revenue and order trends</Text>
        </View>
      </View>
      <AnalyticsView />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  menuBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: C.muted, fontSize: 12, marginTop: 1 },
});
