import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, RefreshControl, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { staffApi, GasListing, StaffBranch } from '@/lib/api';

const C = {
  bg: '#EDF7ED', card: '#FFFFFF', border: '#E0EEE0', text: '#1A2E1A', muted: '#7A9A7A',
  accent: '#2D7450', accentLight: '#E8F5E8', red: '#D32F2F',
};

/** Stock only — price, sizes and branch assignment stay with the vendor owner. */
export default function ManagerStockScreen() {
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [filter, setFilter] = useState('all');
  const [listings, setListings] = useState<GasListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([staffApi.me(), staffApi.getListings()]);
      setBranches(b);
      setListings(l);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load stock.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggle(l: GasListing) {
    setBusyId(l.id);
    try {
      const updated = await staffApi.setStock(l.id, !l.inStock);
      setListings((all) => all.map((x) => (x.id === l.id ? { ...x, inStock: updated.inStock } : x)));
    } catch (err) {
      Alert.alert('Could not update stock', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const shown = listings.filter((l) => filter === 'all' || l.branchId === filter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title}>Stock</Text>
        <Text style={s.sub}>Mark products in or out of stock</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
        >
          {!!error && <View style={s.errBox}><Text style={s.errText}>{error}</Text></View>}

          {branches.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[{ id: 'all', name: 'All branches' }, ...branches].map((b) => {
                const on = filter === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setFilter(b.id)}
                    style={[s.chip, on && { borderColor: C.accent, backgroundColor: C.accentLight }]}
                  >
                    <Text style={[s.chipText, on && { color: C.accent }]}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {shown.length === 0 && !error && <Text style={s.muted}>No listings for your branch yet.</Text>}

          {shown.map((l) => (
            <View key={l.id} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{l.customName ?? l.gasType}</Text>
                <Text style={s.muted}>
                  ₦{l.pricePerKg.toLocaleString()}/kg · {[...l.cylinderSizes, l.otherSizes].filter(Boolean).join(', ')}
                </Text>
                {branches.length > 1 && (
                  <Text style={s.muted}>{branches.find((b) => b.id === l.branchId)?.name}</Text>
                )}
              </View>
              {busyId === l.id ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Switch
                  value={l.inStock}
                  onValueChange={() => toggle(l)}
                  trackColor={{ true: C.accent, false: C.border }}
                />
              )}
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, gap: 12 },
  card: {
    backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  errBox: { backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#D32F2F55', borderRadius: 12, padding: 12 },
  errText: { color: C.red, fontSize: 13, textAlign: 'center' },
});
