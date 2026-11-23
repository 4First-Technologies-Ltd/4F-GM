import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { savedApi, type SavedListing } from '@/lib/api';
import { fmtPrice, initialsOf } from '@/app/order/_shared';

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
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function SavedItemsScreen() {
  const [items, setItems] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await savedApi.list());
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your saved items.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on every focus, so something saved from the order form shows up straight away.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(id: string) {
    setRemoving(id);
    try {
      await savedApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      setError(err?.message ?? 'Could not remove this item.');
    } finally {
      setRemoving(null);
    }
  }

  // Opens the Suppliers tab with this supplier's order form already showing.
  const order = (id: string) => router.navigate({ pathname: '/order', params: { listingId: id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Saved items</Text>
          <Text style={s.headerSub}>{items.length} saved</Text>
        </View>
        <View style={s.headerBadge}>
          <IconSymbol name="bookmark.fill" size={18} color={C.accent} />
        </View>
      </View>

      {loading ? (
        <View style={s.emptyState}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : error && items.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>Couldn&apos;t load saved items</Text>
          <Text style={s.emptySubtitle}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }} activeOpacity={0.8}>
            <Text style={{ color: C.accent, fontWeight: '700', marginTop: 6 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIconCircle}>
            <IconSymbol name="bookmark.fill" size={32} color={C.dim} />
          </View>
          <Text style={s.emptyTitle}>Nothing saved yet</Text>
          <Text style={s.emptySubtitle}>
            Open a supplier and choose &quot;Save &amp; continue shopping&quot; to keep it here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={C.accent} onRefresh={() => { setRefreshing(true); void load(); }} />
          }
        >
          {error ? <Text style={s.inlineError}>{error}</Text> : null}
          {items.map((item) => (
            <View key={item.id} style={[s.card, cardShadow]}>
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  {item.vendor.logoUrl ? (
                    <Image source={{ uri: item.vendor.logoUrl }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Text style={s.avatarText}>{initialsOf(item.vendor.businessName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{item.vendor.businessName}</Text>
                  <Text style={s.address} numberOfLines={1}>{item.vendor.businessAddress}</Text>
                </View>
                <View style={[s.openBadge, { backgroundColor: item.inStock ? C.accentLight : '#FFF0F0' }]}>
                  <Text style={[s.openText, { color: item.inStock ? C.accent : C.red }]}>
                    {item.inStock ? 'Open' : 'Closed'}
                  </Text>
                </View>
              </View>

              <View style={s.cardBottom}>
                <Text style={s.price}>{fmtPrice(item.pricePerKg)}<Text style={s.priceUnit}> / kg</Text></Text>
                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.removeBtn}
                    onPress={() => remove(item.id)}
                    disabled={removing === item.id}
                    activeOpacity={0.8}
                    accessibilityLabel={`Remove ${item.vendor.businessName} from saved`}
                  >
                    <IconSymbol name="trash.fill" size={16} color={C.red} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.orderBtn, !item.inStock && { opacity: 0.5 }]}
                    onPress={() => order(item.id)}
                    disabled={!item.inStock}
                    activeOpacity={0.85}
                  >
                    <IconSymbol name="cart.fill" size={15} color="#fff" />
                    <Text style={s.orderBtnText}>Order now</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  headerBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentLight,
    borderWidth: 1, borderColor: C.accent + '40', alignItems: 'center', justifyContent: 'center',
  },

  listContainer: { paddingHorizontal: 20, gap: 12, paddingTop: 4 },
  inlineError: { color: C.red, fontSize: 13 },

  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 13, borderWidth: 1, overflow: 'hidden',
    backgroundColor: C.accent + '1A', borderColor: C.accent + '40', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  name: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  address: { color: C.muted, fontSize: 12 },
  openBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  openText: { fontSize: 11, fontWeight: '700' },

  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12,
  },
  price: { color: C.accent, fontSize: 17, fontWeight: '800' },
  priceUnit: { color: C.muted, fontSize: 12, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: {
    width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
  orderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  orderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
