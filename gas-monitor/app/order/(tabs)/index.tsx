import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ordersApi } from '@/lib/api';

// ── Palette ───────────────────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
type GasType = 'cooking' | 'medical' | 'industrial' | 'bulk';

interface Supplier {
  id: string;
  name: string;
  types: GasType[];
  address: string;
  lat: number;
  lng: number;
  sizes: string[];
  isOpen: boolean;
  hours: string;
  rating: number;
  initials: string;
  color: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fmtPrice(n: number): string {
  return '₦' + n.toLocaleString();
}

// ── Filter categories ─────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',        label: 'All'          },
  { id: 'cooking',    label: 'Cooking Gas'  },
  { id: 'medical',    label: 'Medical O₂'  },
  { id: 'industrial', label: 'Industrial'   },
  { id: 'bulk',       label: 'Bulk LPG'    },
];

const TYPE_META: Record<GasType, { color: string; label: string }> = {
  cooking:    { color: '#2D7450', label: 'Cooking Gas'  },
  medical:    { color: '#1565C0', label: 'Medical O₂'  },
  industrial: { color: '#E65100', label: 'Industrial'   },
  bulk:       { color: '#6A1B9A', label: 'Bulk LPG'    },
};

// ── Mock supplier data ────────────────────────────────────────────────────────
const SUPPLIERS: Supplier[] = [
  {
    id: '1', name: 'Ardova Gas Ltd', initials: 'AG', color: '#2D7450',
    types: ['cooking'], address: '14 Admiralty Way, Lekki Phase 1',
    lat: 6.5280, lng: 3.3810,
    sizes: ['6 kg', '12.5 kg', '50 kg'], isOpen: true, hours: '7am – 9pm', rating: 4.8,
  },
  {
    id: '2', name: 'MedGas Nigeria', initials: 'MG', color: '#1565C0',
    types: ['medical'],
    address: '22 Adeola Odeku St, Victoria Island',
    lat: 6.5190, lng: 3.4020,
    sizes: ['Medical O₂', 'N₂', 'CO₂'], isOpen: true, hours: '24 hrs', rating: 4.9,
  },
  {
    id: '3', name: 'Total Gas Depot', initials: 'TG', color: '#E65100',
    types: ['cooking', 'bulk'],
    address: '5 Kingsway Rd, Ikoyi',
    lat: 6.5300, lng: 3.3900,
    sizes: ['12.5 kg', '50 kg'], isOpen: true, hours: '6am – 8pm', rating: 4.5,
  },
  {
    id: '4', name: 'HomeGas Express', initials: 'HG', color: '#2D7450',
    types: ['cooking'],
    address: '18 Bode Thomas St, Surulere',
    lat: 6.5150, lng: 3.3650,
    sizes: ['6 kg', '12.5 kg'], isOpen: true, hours: '8am – 7pm', rating: 4.3,
  },
  {
    id: '5', name: 'ProMed Gases', initials: 'PM', color: '#1565C0',
    types: ['medical', 'industrial'],
    address: '3 Broad St, Lagos Marina',
    lat: 6.5230, lng: 3.3940,
    sizes: ['Medical O₂', 'Argon', 'CO₂', 'N₂'], isOpen: true, hours: '8am – 6pm', rating: 4.7,
  },
  {
    id: '6', name: 'Industrial Gas Co.', initials: 'IG', color: '#E65100',
    types: ['industrial', 'bulk'],
    address: '11 Creek Rd, Apapa',
    lat: 6.4980, lng: 3.3590,
    sizes: ['50 kg', '100 kg', 'Bulk Tank'], isOpen: false, hours: 'Opens 6am', rating: 4.6,
  },
  {
    id: '7', name: 'GreenEnergy LPG', initials: 'GE', color: '#2D7450',
    types: ['cooking', 'bulk'],
    address: '7 Obafemi Awolowo Way, Ikeja',
    lat: 6.5900, lng: 3.3400,
    sizes: ['6 kg', '12.5 kg', '50 kg'], isOpen: true, hours: '7am – 8pm', rating: 4.4,
  },
  {
    id: '8', name: 'QuickGas Delivery', initials: 'QG', color: '#2D7450',
    types: ['cooking'],
    address: '29 Herbert Macaulay Way, Yaba',
    lat: 6.5100, lng: 3.3790,
    sizes: ['6 kg', '12.5 kg'], isOpen: true, hours: '8am – 9pm', rating: 4.6,
  },
  {
    id: '9', name: 'NatGas Industrial', initials: 'NI', color: '#6A1B9A',
    types: ['industrial', 'bulk'],
    address: '45 Tin Can Island Rd, Apapa',
    lat: 6.4920, lng: 3.3470,
    sizes: ['50 kg', '100 kg', 'Bulk LPG'], isOpen: true, hours: '24 hrs', rating: 4.2,
  },
  {
    id: '10', name: 'OilServ Gas Depot', initials: 'OS', color: '#6A1B9A',
    types: ['bulk', 'industrial'],
    address: '2 Wharf Rd, Apapa',
    lat: 6.4850, lng: 3.3320,
    sizes: ['50 kg', 'Bulk Tank'], isOpen: false, hours: 'Opens 7am', rating: 4.3,
  },
];

// ── Saved address type ────────────────────────────────────────────────────────
interface SavedAddress {
  id: string;
  label: string;
  full: string;
}

const DEFAULT_ADDRESSES: SavedAddress[] = [
  { id: '1', label: 'Home',   full: '14 Admiralty Way, Lekki Phase 1, Lagos'  },
  { id: '2', label: 'Office', full: '3 Broad St, Lagos Marina, Lagos Island'   },
];

// ── Cylinder options (for order form) ─────────────────────────────────────────
const CYLINDER_OPTS = [
  { size: '6 kg',    price: 4500,  label: 'Small',    sub: 'Solo use'        },
  { size: '12.5 kg', price: 8500,  label: 'Standard', sub: 'Most popular'    },
  { size: '50 kg',   price: 32000, label: 'Large',    sub: 'Commercial use'  },
];

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({
  supplier,
  distance,
  onPress,
}: {
  supplier: Supplier;
  distance: number | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.supplierCard, cardShadow]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: supplier.color + '1A', borderColor: supplier.color + '40' }]}>
          <Text style={[s.avatarText, { color: supplier.color }]}>{supplier.initials}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.supplierName} numberOfLines={1}>{supplier.name}</Text>
          <Text style={s.supplierAddress} numberOfLines={1}>{supplier.address}</Text>
          <View style={s.typeBadgeRow}>
            {supplier.types.map((t) => (
              <View key={t} style={[s.typeBadge, { backgroundColor: TYPE_META[t].color + '18', borderColor: TYPE_META[t].color + '44' }]}>
                <Text style={[s.typeBadgeText, { color: TYPE_META[t].color }]}>{TYPE_META[t].label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.cardMeta}>
          {distance !== null && (
            <Text style={s.distText}>{fmtDist(distance)}</Text>
          )}
          <View style={[s.openBadge, { backgroundColor: supplier.isOpen ? C.accentLight : '#FFF0F0' }]}>
            <Text style={[s.openText, { color: supplier.isOpen ? C.accent : C.red }]}>
              {supplier.isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
          <Text style={s.hoursText}>{supplier.hours}</Text>
        </View>
      </View>

      <View style={s.cardBottom}>
        <View style={s.sizesRow}>
          {supplier.sizes.slice(0, 3).map((sz) => (
            <View key={sz} style={s.sizeChip}>
              <Text style={s.sizeChipText}>{sz}</Text>
            </View>
          ))}
          {supplier.sizes.length > 3 && (
            <Text style={s.moreSizes}>+{supplier.sizes.length - 3}</Text>
          )}
        </View>
        <View style={s.cardBottomRight}>
          <Text style={s.ratingText}>⭐ {supplier.rating}</Text>
          <View style={[s.orderArrow, !supplier.isOpen && s.orderArrowClosed]}>
            <IconSymbol name="arrow.right" size={15} color={supplier.isOpen ? '#fff' : C.dim} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SuppliersScreen() {
  const [screen, setScreen] = useState<'suppliers' | 'order'>('suppliers');
  const [selectedSupplier, setSelectedSupplier] = useState<(Supplier & { distance: number | null }) | null>(null);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('Detecting your location...');
  const [locationStatus, setLocationStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  const [activeFilter, setActiveFilter] = useState('all');

  const [activeTab, setActiveTab] = useState<'new' | 'orders'>('new');
  const [selectedSize, setSelectedSize] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [placing, setPlacing] = useState(false);

  // Address picker state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(DEFAULT_ADDRESSES);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showAddrModal, setShowAddrModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('');
  const [newAddrFull, setNewAddrFull] = useState('');

  const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId) ?? null;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setLocationLabel('Location access denied — showing all suppliers');
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserCoords({ lat, lng });
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const area = place?.district ?? place?.subregion ?? place?.city ?? 'your area';
        setLocationLabel(`Near ${area}`);
      } catch {
        setLocationLabel('Near your location');
      }
      setLocationStatus('ok');
    })();
  }, []);

  const suppliersWithDist = SUPPLIERS.map((sup) => ({
    ...sup,
    distance: userCoords ? haversineKm(userCoords.lat, userCoords.lng, sup.lat, sup.lng) : null,
  }));

  const filtered = suppliersWithDist
    .filter((sup) => activeFilter === 'all' || sup.types.includes(activeFilter as GasType))
    .sort((a, b) => {
      if (a.distance === null || b.distance === null) return 0;
      return a.distance - b.distance;
    });

  function selectSupplier(supplier: (typeof filtered)[0]) {
    setSelectedSupplier(supplier);
    setScreen('order');
    setActiveTab('new');
    setQuantity(1);
    setSelectedAddressId(null);
  }

  function backToSuppliers() {
    setScreen('suppliers');
    setSelectedSupplier(null);
  }

  function addAddress() {
    if (!newAddrLabel.trim() || !newAddrFull.trim()) return;
    const id = Date.now().toString();
    setSavedAddresses((prev) => [...prev, { id, label: newAddrLabel.trim(), full: newAddrFull.trim() }]);
    setSelectedAddressId(id);
    setNewAddrLabel('');
    setNewAddrFull('');
    setShowAddForm(false);
    setShowAddrModal(false);
  }

  function closeAddrModal() {
    setShowAddrModal(false);
    setShowAddForm(false);
  }

  async function handlePlaceOrder() {
    if (!selectedAddressId || !selectedSupplier || !selectedAddress) return;
    setPlacing(true);
    try {
      const result = await ordersApi.initialize({
        supplierName: selectedSupplier.name,
        cylinderSize: cylinder.size,
        quantity,
        totalAmount: total,
        deliveryAddress: selectedAddress.full,
      });
      router.push({
        pathname: '/order/payment',
        params: {
          authorizationUrl: result.authorizationUrl,
          reference: result.reference,
          orderId: result.orderId,
          amount: String(result.amount),
          supplierName: selectedSupplier.name,
        },
      });
    } catch (err: any) {
      Alert.alert('Payment Error', err?.message ?? 'Could not start payment. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  const cylinder = CYLINDER_OPTS[selectedSize];
  const total = cylinder.price * quantity;

  // ── Supplier List ───────────────────────────────────────────────────────────
  if (screen === 'suppliers') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar style="dark" />

        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={C.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Find a Supplier</Text>
            <Text style={s.headerSub}>{filtered.length} supplier{filtered.length !== 1 ? 's' : ''} near you</Text>
          </View>
          <View style={s.headerBadge}>
            <IconSymbol name="location.fill" size={18} color={C.accent} />
          </View>
        </View>

        <View style={s.locationBar}>
          {locationStatus === 'loading' ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <IconSymbol name="location.fill" size={13} color={locationStatus === 'ok' ? C.accent : C.muted} />
          )}
          <Text style={[s.locationText, locationStatus === 'denied' && { color: C.muted }]}>
            {locationLabel}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          style={s.filterScroll}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[s.filterPill, activeFilter === f.id && s.filterPillActive]}
              onPress={() => setActiveFilter(f.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.filterPillText, activeFilter === f.id && s.filterPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={s.listContainer} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <IconSymbol name="location.fill" size={32} color={C.dim} />
              </View>
              <Text style={s.emptyTitle}>No suppliers found</Text>
              <Text style={s.emptySubtitle}>Try selecting a different category</Text>
            </View>
          ) : (
            filtered.map((sup) => (
              <SupplierCard
                key={sup.id}
                supplier={sup}
                distance={sup.distance}
                onPress={() => selectSupplier(sup)}
              />
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Order Form ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={backToSuppliers} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Order Refill</Text>
          {selectedSupplier && <Text style={s.headerSub}>{selectedSupplier.name}</Text>}
        </View>
        <View style={s.headerBadge}>
          <IconSymbol name="cart.fill" size={18} color={C.accent} />
        </View>
      </View>

      {selectedSupplier && (
        <View style={[s.supplierStrip, cardShadow]}>
          <View style={[s.stripAvatar, { backgroundColor: selectedSupplier.color + '1A' }]}>
            <Text style={[s.stripAvatarText, { color: selectedSupplier.color }]}>{selectedSupplier.initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stripName}>{selectedSupplier.name}</Text>
            <Text style={s.stripAddr} numberOfLines={1}>{selectedSupplier.address}</Text>
          </View>
          {selectedSupplier.distance !== null && (
            <Text style={s.stripDist}>{fmtDist(selectedSupplier.distance as number)}</Text>
          )}
        </View>
      )}

      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tab, activeTab === 'new' && s.tabActive]}
          onPress={() => setActiveTab('new')} activeOpacity={0.7}>
          <Text style={[s.tabText, activeTab === 'new' && s.tabTextActive]}>New Order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'orders' && s.tabActive]}
          onPress={() => setActiveTab('orders')} activeOpacity={0.7}>
          <Text style={[s.tabText, activeTab === 'orders' && s.tabTextActive]}>My Orders</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'new' ? (
        <ScrollView contentContainerStyle={s.formContainer}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={[s.card, cardShadow]}>
            <Text style={s.cardTitle}>Select Cylinder Size</Text>
            <View style={s.sizeGrid}>
              {CYLINDER_OPTS.map((c, i) => (
                <TouchableOpacity key={c.size}
                  style={[s.sizeCard, selectedSize === i && s.sizeCardActive]}
                  onPress={() => setSelectedSize(i)} activeOpacity={0.7}>
                  <Text style={[s.sizeBadge, selectedSize === i && s.sizeBadgeActive]}>{c.label}</Text>
                  <Text style={[s.sizeWeight, selectedSize === i && s.sizeWeightActive]}>{c.size}</Text>
                  <Text style={[s.sizePrice, selectedSize === i && s.sizePriceActive]}>{fmtPrice(c.price)}</Text>
                  <Text style={[s.sizeSub, selectedSize === i && s.sizeSubActive]}>{c.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[s.card, cardShadow]}>
            <Text style={s.cardTitle}>Quantity</Text>
            <View style={s.qtyRow}>
              <TouchableOpacity
                style={[s.qtyBtn, quantity <= 1 && s.qtyBtnDisabled]}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1} activeOpacity={0.7}>
                <IconSymbol name="minus" size={20} color={quantity <= 1 ? C.dim : C.accent} />
              </TouchableOpacity>
              <Text style={s.qtyNum}>{quantity}</Text>
              <TouchableOpacity
                style={[s.qtyBtn, quantity >= 10 && s.qtyBtnDisabled]}
                onPress={() => setQuantity((q) => Math.min(10, q + 1))}
                disabled={quantity >= 10} activeOpacity={0.7}>
                <IconSymbol name="plus" size={20} color={quantity >= 10 ? C.dim : C.accent} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.card, cardShadow]}>
            <View style={s.cardTitleRow}>
              <IconSymbol name="location.fill" size={15} color={C.accent} />
              <Text style={s.cardTitle}>Delivery Address</Text>
            </View>
            <TouchableOpacity
              style={[s.addrSelector, !selectedAddress && s.addrSelectorEmpty]}
              onPress={() => setShowAddrModal(true)}
              activeOpacity={0.75}
            >
              {selectedAddress ? (
                <View style={{ flex: 1 }}>
                  <Text style={s.addrSelLabel}>{selectedAddress.label}</Text>
                  <Text style={s.addrSelFull} numberOfLines={2}>{selectedAddress.full}</Text>
                </View>
              ) : (
                <Text style={s.addrSelPlaceholder}>Select a delivery address</Text>
              )}
              <IconSymbol name="chevron.right" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View style={[s.card, cardShadow]}>
            <Text style={s.cardTitle}>Order Summary</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>{cylinder.size} cylinder × {quantity}</Text>
              <Text style={s.summaryValue}>{fmtPrice(cylinder.price * quantity)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Delivery fee</Text>
              <Text style={[s.summaryValue, { color: C.accent }]}>Free</Text>
            </View>
            <View style={[s.summaryRow, s.summaryTotal]}>
              <Text style={s.summaryTotalLabel}>Total</Text>
              <Text style={s.summaryTotalValue}>{fmtPrice(total)}</Text>
            </View>
          </View>

          {!selectedAddressId && (
            <Text style={s.addressHint}>Select a delivery address to place your order</Text>
          )}

          <TouchableOpacity
            style={[s.placeBtn, (!selectedAddressId || placing) && { opacity: 0.55 }]}
            onPress={handlePlaceOrder}
            disabled={!selectedAddressId || placing}
            activeOpacity={0.85}>
            {placing
              ? <ActivityIndicator color="#fff" />
              : <>
                  <IconSymbol name="cart.fill" size={18} color="#fff" />
                  <Text style={s.placeBtnText}>Place Order</Text>
                </>}
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        <View style={s.ordersWrap}>
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <IconSymbol name="clock.fill" size={32} color={C.dim} />
            </View>
            <Text style={s.emptyTitle}>Track your orders</Text>
            <Text style={s.emptySubtitle}>After placing an order, view your full history in the History tab.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/order/history')} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>View Order History</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Address picker modal ── */}
      <Modal
        visible={showAddrModal}
        transparent
        animationType="slide"
        onRequestClose={closeAddrModal}
      >
        <KeyboardAvoidingView behavior="padding" style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeAddrModal} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>
              {showAddForm ? 'Add New Address' : 'Select Address'}
            </Text>

            {!showAddForm && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
                {savedAddresses.map((addr) => (
                  <TouchableOpacity
                    key={addr.id}
                    style={[s.addrOption, selectedAddressId === addr.id && s.addrOptionActive]}
                    onPress={() => { setSelectedAddressId(addr.id); closeAddrModal(); }}
                    activeOpacity={0.75}
                  >
                    <View style={[s.addrRadio, selectedAddressId === addr.id && s.addrRadioActive]}>
                      {selectedAddressId === addr.id && <View style={s.addrRadioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.addrOptLabel}>{addr.label}</Text>
                      <Text style={s.addrOptFull} numberOfLines={2}>{addr.full}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {showAddForm ? (
              <View style={s.addFormWrap}>
                <Text style={s.addFormInputLabel}>Label</Text>
                <TextInput
                  style={s.addrInput}
                  value={newAddrLabel}
                  onChangeText={setNewAddrLabel}
                  placeholder="e.g. Home, Office"
                  placeholderTextColor={C.muted + '99'}
                  autoFocus
                />
                <Text style={[s.addFormInputLabel, { marginTop: 10 }]}>Full Address</Text>
                <TextInput
                  style={[s.addrInput, s.addrInputMulti]}
                  value={newAddrFull}
                  onChangeText={setNewAddrFull}
                  placeholder="Street, area, city"
                  placeholderTextColor={C.muted + '99'}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
                <View style={s.addFormActions}>
                  <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowAddForm(false)} activeOpacity={0.7}>
                    <Text style={s.modalCancelBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalSaveBtn, (!newAddrLabel.trim() || !newAddrFull.trim()) && { opacity: 0.45 }]}
                    onPress={addAddress}
                    disabled={!newAddrLabel.trim() || !newAddrFull.trim()}
                    activeOpacity={0.85}
                  >
                    <Text style={s.modalSaveBtnText}>Save & Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.addAddrBtn} onPress={() => setShowAddForm(true)} activeOpacity={0.8}>
                <IconSymbol name="plus" size={16} color={C.accent} />
                <Text style={s.addAddrBtnText}>Add New Address</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  headerBadge: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },

  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  locationText: { color: C.text, fontSize: 13, fontWeight: '500', flex: 1 },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 44,
    marginBottom: 14,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  filterPillActive: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  filterPillText: { color: C.muted, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '700', lineHeight: 18 },

  listContainer: { paddingHorizontal: 20, gap: 12 },

  supplierCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 48, height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  supplierName: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  supplierAddress: { color: C.muted, fontSize: 12, marginBottom: 6 },
  typeBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { alignItems: 'flex-end', gap: 5, minWidth: 64 },
  distText: { color: C.text, fontSize: 13, fontWeight: '700' },
  openBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  openText: { fontSize: 11, fontWeight: '700' },
  hoursText: { color: C.dim, fontSize: 10 },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
  },
  sizesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  sizeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  sizeChipText: { color: C.text, fontSize: 11, fontWeight: '600' },
  moreSizes: { color: C.muted, fontSize: 11, alignSelf: 'center' },
  cardBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  orderArrow: {
    width: 34, height: 34,
    borderRadius: 17,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderArrowClosed: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },

  supplierStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  stripAvatar: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripAvatarText: { fontSize: 13, fontWeight: '800' },
  stripName: { color: C.text, fontSize: 14, fontWeight: '700' },
  stripAddr: { color: C.muted, fontSize: 11, marginTop: 1 },
  stripDist: { color: C.accent, fontSize: 13, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },

  formContainer: { paddingHorizontal: 20, gap: 14 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 14,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  sizeGrid: { flexDirection: 'row', gap: 8 },
  sizeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 3,
  },
  sizeCardActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  sizeBadge: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  sizeBadgeActive: { color: C.accent },
  sizeWeight: { color: C.text, fontSize: 14, fontWeight: '800' },
  sizeWeightActive: { color: C.accent },
  sizePrice: { color: C.muted, fontSize: 12, fontWeight: '600' },
  sizePriceActive: { color: C.accent, fontWeight: '700' },
  sizeSub: { color: C.dim, fontSize: 9, textAlign: 'center' },
  sizeSubActive: { color: C.accent + 'AA' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  qtyBtn: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: C.surface, borderColor: C.border },
  qtyNum: { color: C.text, fontSize: 30, fontWeight: '800', minWidth: 44, textAlign: 'center' },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  summaryLabel: { color: C.muted, fontSize: 14 },
  summaryValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  summaryTotal: { borderTopWidth: 2, borderTopColor: C.accent + '50', marginTop: 2, paddingTop: 14 },
  summaryTotalLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  summaryTotalValue: { color: C.accent, fontSize: 20, fontWeight: '800' },

  addressHint: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: -4 },

  placeBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  ordersWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderDot: { width: 10, height: 10, borderRadius: 5 },
  orderTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  orderMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  processingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: C.accentLight,
  },
  processingText: { color: C.accent, fontSize: 11, fontWeight: '700' },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
    gap: 10,
  },
  emptyIconCircle: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Address selector (inside card)
  addrSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  addrSelectorEmpty: { borderColor: C.border },
  addrSelLabel: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  addrSelFull: { color: C.muted, fontSize: 13, lineHeight: 18 },
  addrSelPlaceholder: { color: C.muted + '99', fontSize: 14, flex: 1 },

  // Address picker modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 14,
  },
  modalHandle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  addrOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  addrOptionActive: {
    backgroundColor: C.accentLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
    marginBottom: 1,
  },
  addrRadio: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrRadioActive: { borderColor: C.accent },
  addrRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  addrOptLabel: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  addrOptFull: { color: C.muted, fontSize: 12, lineHeight: 17 },

  addAddrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.accent + '50',
    borderStyle: 'dashed',
    backgroundColor: C.accentLight,
  },
  addAddrBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },

  addFormWrap: { gap: 2 },
  addFormInputLabel: { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  addrInput: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 14,
  },
  addrInputMulti: { minHeight: 70, textAlignVertical: 'top' },
  addFormActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  modalCancelBtnText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: C.accent,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
