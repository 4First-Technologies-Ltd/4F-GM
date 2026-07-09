import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Switch, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, GasListing, GasType } from '@/lib/api';
import { useDrawer } from './_layout';

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
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const GAS_TYPES: { id: GasType; label: string; color: string }[] = [
  { id: 'COOKING',    label: 'Cooking Gas',  color: '#2D7450' },
  { id: 'MEDICAL',    label: 'Medical O₂',   color: '#1565C0' },
  { id: 'INDUSTRIAL', label: 'Industrial',   color: '#E65100' },
  { id: 'BULK',       label: 'Bulk LPG',     color: '#6A1B9A' },
  { id: 'OTHER',      label: 'Other',        color: '#7A9A7A' },
];

const FIXED_SIZES = ['6 kg', '12.5 kg', '25 kg', '50 kg'];

interface ListingForm {
  gasType: GasType;
  customName: string;
  pricePerKg: string;
  cylinderSizes: string[];
  otherSizes: string;
  inStock: boolean;
}

function emptyForm(): ListingForm {
  return { gasType: 'COOKING', customName: '', pricePerKg: '', cylinderSizes: [], otherSizes: '', inStock: true };
}

// ── Listing card ──────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  onEdit,
  onDelete,
  onToggleStock,
}: {
  listing: GasListing;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStock: () => void;
}) {
  const meta = GAS_TYPES.find((g) => g.id === listing.gasType);
  const label = listing.customName ?? meta?.label ?? listing.gasType;
  const color = meta?.color ?? C.muted;

  return (
    <View style={[lc.card, cardShadow]}>
      <View style={lc.topRow}>
        <View style={[lc.typeDot, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[lc.typeText, { color }]}>{label}</Text>
        </View>
        <View style={[lc.stockBadge, { backgroundColor: listing.inStock ? C.accentLight : '#FFF0F0' }]}>
          <Text style={[lc.stockText, { color: listing.inStock ? C.accent : C.red }]}>
            {listing.inStock ? 'In Stock' : 'Out of Stock'}
          </Text>
        </View>
      </View>

      <Text style={lc.price}>₦{listing.pricePerKg.toLocaleString()} / kg</Text>

      <View style={lc.sizesRow}>
        {listing.cylinderSizes.map((sz) => (
          <View key={sz} style={lc.sizeChip}>
            <Text style={lc.sizeChipText}>{sz}</Text>
          </View>
        ))}
        {listing.otherSizes ? (
          <View style={lc.sizeChip}>
            <Text style={lc.sizeChipText}>{listing.otherSizes}</Text>
          </View>
        ) : null}
      </View>

      <View style={lc.actions}>
        <TouchableOpacity style={lc.actionBtn} onPress={onToggleStock} activeOpacity={0.8}>
          <IconSymbol name="arrow.clockwise" size={14} color={C.muted} />
          <Text style={lc.actionText}>Toggle Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={lc.actionBtn} onPress={onEdit} activeOpacity={0.8}>
          <IconSymbol name="gearshape.fill" size={14} color={C.accent} />
          <Text style={[lc.actionText, { color: C.accent }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={lc.actionBtnDanger} onPress={onDelete} activeOpacity={0.8}>
          <IconSymbol name="xmark.circle.fill" size={14} color={C.red} />
          <Text style={[lc.actionText, { color: C.red }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

function ListingFormView({
  initial,
  onSubmit,
  onCancel,
  loading,
  apiErr,
}: {
  initial: ListingForm;
  onSubmit: (form: ListingForm) => void;
  onCancel: () => void;
  loading: boolean;
  apiErr: string;
}) {
  const [form, setForm] = useState<ListingForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ListingForm>(key: K, value: ListingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const n = { ...e }; delete n[key as string]; return n; });
  }

  function toggleSize(sz: string) {
    set('cylinderSizes', form.cylinderSizes.includes(sz)
      ? form.cylinderSizes.filter((s) => s !== sz)
      : [...form.cylinderSizes, sz]);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.pricePerKg || isNaN(Number(form.pricePerKg)) || Number(form.pricePerKg) <= 0)
      errs.pricePerKg = 'Enter a valid price per kg';
    if (form.cylinderSizes.length === 0 && !form.otherSizes.trim())
      errs.cylinderSizes = 'Select or enter at least one cylinder size';
    if (form.gasType === 'OTHER' && !form.customName.trim())
      errs.customName = 'Enter a name for this gas type';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <ScrollView contentContainerStyle={f.container} keyboardShouldPersistTaps="handled">
      <Text style={f.sectionLabel}>Gas Type</Text>
      <View style={f.typeGrid}>
        {GAS_TYPES.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[f.typeBtn, form.gasType === g.id && { borderColor: g.color, backgroundColor: g.color + '18' }]}
            onPress={() => set('gasType', g.id)}
            activeOpacity={0.8}
          >
            <Text style={[f.typeBtnText, form.gasType === g.id && { color: g.color, fontWeight: '700' }]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {form.gasType === 'OTHER' && (
        <View style={f.field}>
          <Text style={f.label}>Gas name</Text>
          <TextInput
            style={[f.input, !!errors.customName && f.inputError]}
            value={form.customName}
            onChangeText={(t) => set('customName', t)}
            placeholder="e.g. Acetylene, Hydrogen"
            placeholderTextColor={C.muted + '99'}
          />
          {!!errors.customName && <Text style={f.error}>{errors.customName}</Text>}
        </View>
      )}

      <View style={f.field}>
        <Text style={f.label}>Price per kg (₦)</Text>
        <TextInput
          style={[f.input, !!errors.pricePerKg && f.inputError]}
          value={form.pricePerKg}
          onChangeText={(t) => set('pricePerKg', t)}
          placeholder="e.g. 680"
          placeholderTextColor={C.muted + '99'}
          keyboardType="numeric"
        />
        {!!errors.pricePerKg && <Text style={f.error}>{errors.pricePerKg}</Text>}
      </View>

      <Text style={f.sectionLabel}>Available Cylinder Sizes</Text>
      <View style={f.sizeGrid}>
        {FIXED_SIZES.map((sz) => {
          const active = form.cylinderSizes.includes(sz);
          return (
            <TouchableOpacity
              key={sz}
              style={[f.sizeBtn, active && f.sizeBtnActive]}
              onPress={() => toggleSize(sz)}
              activeOpacity={0.8}
            >
              <Text style={[f.sizeBtnText, active && f.sizeBtnTextActive]}>{sz}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={f.field}>
        <Text style={f.label}>Other sizes <Text style={{ color: C.muted, fontWeight: '400' }}>(optional)</Text></Text>
        <TextInput
          style={f.input}
          value={form.otherSizes}
          onChangeText={(t) => set('otherSizes', t)}
          placeholder="e.g. 100 kg, 200 kg"
          placeholderTextColor={C.muted + '99'}
        />
      </View>

      {!!errors.cylinderSizes && <Text style={f.error}>{errors.cylinderSizes}</Text>}

      <View style={f.stockRow}>
        <Text style={f.label}>In Stock</Text>
        <Switch
          value={form.inStock}
          onValueChange={(v) => set('inStock', v)}
          trackColor={{ false: C.border, true: C.accent }}
          thumbColor="#fff"
        />
      </View>

      {!!apiErr && (
        <View style={f.apiErr}>
          <Text style={f.apiErrText}>{apiErr}</Text>
        </View>
      )}

      <View style={f.btnRow}>
        <TouchableOpacity style={f.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={f.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[f.submitBtn, loading && { opacity: 0.7 }]}
          onPress={() => validate() && onSubmit(form)}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={f.submitBtnText}>Save Listing</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ListingsScreen() {
  const { openDrawer } = useDrawer();
  const [listings, setListings] = useState<GasListing[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editTarget, setEditTarget] = useState<GasListing | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formApiErr, setFormApiErr] = useState('');

  async function loadListings() {
    try {
      const data = await vendorApi.getListings();
      setListings(data);
    } catch {
      // empty state handles this
    }
  }

  useFocusEffect(useCallback(() => { loadListings(); }, []));

  async function handleSubmit(form: ListingForm) {
    setFormLoading(true);
    setFormApiErr('');
    try {
      const payload = {
        gasType: form.gasType,
        customName: form.gasType === 'OTHER' ? form.customName : undefined,
        pricePerKg: Number(form.pricePerKg),
        cylinderSizes: form.cylinderSizes,
        otherSizes: form.otherSizes.trim() || undefined,
        inStock: form.inStock,
      };

      if (editTarget) {
        const updated = await vendorApi.updateListing(editTarget.id, payload);
        setListings((prev) => prev.map((l) => (l.id === editTarget.id ? updated : l)));
      } else {
        const created = await vendorApi.createListing(payload);
        setListings((prev) => [created, ...prev]);
      }

      setView('list');
      setEditTarget(null);
    } catch (err) {
      setFormApiErr(err instanceof Error ? err.message : 'Failed to save listing.');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete Listing', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await vendorApi.deleteListing(id);
            setListings((prev) => prev.filter((l) => l.id !== id));
          } catch {
            // silently fail
          }
        },
      },
    ]);
  }

  async function handleToggleStock(listing: GasListing) {
    try {
      const updated = await vendorApi.updateListing(listing.id, { inStock: !listing.inStock });
      setListings((prev) => prev.map((l) => (l.id === listing.id ? updated : l)));
    } catch {
      // silently fail
    }
  }

  function openAdd() {
    setEditTarget(null);
    setFormApiErr('');
    setView('form');
  }

  function openEdit(listing: GasListing) {
    setEditTarget(listing);
    setFormApiErr('');
    setView('form');
  }

  const initialForm: ListingForm = editTarget
    ? {
        gasType: editTarget.gasType,
        customName: editTarget.customName ?? '',
        pricePerKg: String(editTarget.pricePerKg),
        cylinderSizes: editTarget.cylinderSizes,
        otherSizes: editTarget.otherSizes ?? '',
        inStock: editTarget.inStock,
      }
    : emptyForm();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{view === 'form' ? (editTarget ? 'Edit Listing' : 'Add Listing') : 'My Listings'}</Text>
          {view === 'list' && (
            <Text style={s.headerSub}>{listings.length} listing{listings.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        {view === 'list' && (
          <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <IconSymbol name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {view === 'form' ? (
        <ListingFormView
          key={editTarget?.id ?? 'new'}
          initial={initialForm}
          onSubmit={handleSubmit}
          onCancel={() => { setView('list'); setEditTarget(null); }}
          loading={formLoading}
          apiErr={formApiErr}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {listings.length === 0 ? (
              <View style={s.emptyState}>
                <View style={s.emptyIconCircle}>
                  <IconSymbol name="list.bullet" size={32} color={C.dim} />
                </View>
                <Text style={s.emptyTitle}>No listings yet</Text>
                <Text style={s.emptySubtitle}>Add your first gas listing so customers can find and order from you.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
                  <Text style={s.emptyBtnText}>Add First Listing</Text>
                </TouchableOpacity>
              </View>
            ) : (
              listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onEdit={() => openEdit(listing)}
                  onDelete={() => handleDelete(listing.id)}
                  onToggleStock={() => handleToggleStock(listing)}
                />
              ))
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

// ── Listing card styles ───────────────────────────────────────────────────────
const lc = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeDot: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeText: { fontSize: 12, fontWeight: '700' },
  stockBadge: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  stockText: { fontSize: 11, fontWeight: '700' },
  price: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sizesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  sizeChipText: { color: C.text, fontSize: 12, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#D32F2F30',
  },
  actionText: { color: C.muted, fontSize: 12, fontWeight: '600' },
});

// ── Form styles ───────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 16 },
  sectionLabel: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.2, marginBottom: -8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  typeBtnText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  field: { gap: 6 },
  label: { color: C.text, fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    height: 52,
    color: C.text,
    fontSize: 15,
  },
  inputError: { borderColor: C.red, backgroundColor: '#FFF5F5' },
  error: { color: C.red, fontSize: 12 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  sizeBtnActive: { borderColor: C.accent, backgroundColor: C.accentLight },
  sizeBtnText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  sizeBtnTextActive: { color: C.accent, fontWeight: '700' },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  apiErr: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: C.red, fontSize: 13, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  submitBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  menuBtn: {
    width: 44, height: 44,
    borderRadius: 13,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  addBtn: {
    width: 44, height: 44,
    borderRadius: 13,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { paddingHorizontal: 20, gap: 12 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
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
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
