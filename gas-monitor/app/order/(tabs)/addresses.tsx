import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';

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

interface Address {
  id: string;
  label: string;
  full: string;
  isDefault: boolean;
}

const INITIAL_ADDRESSES: Address[] = [
  { id: '1', label: 'Home',   full: '14 Admiralty Way, Lekki Phase 1, Lagos',   isDefault: true  },
  { id: '2', label: 'Office', full: '3 Broad St, Lagos Marina, Lagos Island',    isDefault: false },
];

export default function MyAddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>(INITIAL_ADDRESSES);
  const [showModal, setShowModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newFull, setNewFull] = useState('');

  function setDefault(id: string) {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  function remove(id: string) {
    setAddresses((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      if (updated.length > 0 && !updated.some((a) => a.isDefault)) {
        updated[0].isDefault = true;
      }
      return updated;
    });
  }

  function addAddress() {
    if (!newLabel.trim() || !newFull.trim()) return;
    const id = Date.now().toString();
    setAddresses((prev) => [
      ...prev,
      { id, label: newLabel.trim(), full: newFull.trim(), isDefault: prev.length === 0 },
    ]);
    setNewLabel('');
    setNewFull('');
    setShowModal(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>My Addresses</Text>
          <Text style={s.headerSub}>{addresses.length} saved address{addresses.length !== 1 ? 'es' : ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
          <IconSymbol name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {addresses.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIconCircle}>
            <IconSymbol name="mappin.fill" size={32} color={C.dim} />
          </View>
          <Text style={s.emptyTitle}>No saved addresses</Text>
          <Text style={s.emptySubtitle}>Add a delivery address to speed up your orders</Text>
          <TouchableOpacity style={s.emptyAddBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
            <IconSymbol name="plus" size={16} color="#fff" />
            <Text style={s.emptyAddBtnText}>Add Address</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.listContainer} showsVerticalScrollIndicator={false}>
          {addresses.map((addr) => (
            <View key={addr.id} style={[s.addressCard, cardShadow]}>
              <View style={s.cardLeft}>
                <View style={[s.addrIconCircle, addr.isDefault && s.addrIconCircleDefault]}>
                  <IconSymbol name="mappin.fill" size={18} color={addr.isDefault ? '#fff' : C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.labelRow}>
                    <Text style={s.addrLabel}>{addr.label}</Text>
                    {addr.isDefault && (
                      <View style={s.defaultBadge}>
                        <Text style={s.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.addrFull} numberOfLines={2}>{addr.full}</Text>
                </View>
              </View>

              <View style={s.cardActions}>
                {!addr.isDefault && (
                  <TouchableOpacity style={s.actionBtn} onPress={() => setDefault(addr.id)} activeOpacity={0.7}>
                    <Text style={s.actionBtnText}>Set default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.actionBtn, s.actionBtnDelete]} onPress={() => remove(addr.id)} activeOpacity={0.7}>
                  <IconSymbol name="xmark.circle.fill" size={15} color={C.red} />
                  <Text style={[s.actionBtnText, { color: C.red }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addMoreBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
            <IconSymbol name="plus" size={18} color={C.accent} />
            <Text style={s.addMoreBtnText}>Add New Address</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Add Address Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Address</Text>

            <Text style={s.inputLabel}>Label</Text>
            <TextInput
              style={s.input}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. Home, Office, Parent's house"
              placeholderTextColor={C.muted + '99'}
            />

            <Text style={s.inputLabel}>Full Address</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={newFull}
              onChangeText={setNewFull}
              placeholder="Street, area, city"
              placeholderTextColor={C.muted + '99'}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)} activeOpacity={0.7}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (!newLabel.trim() || !newFull.trim()) && { opacity: 0.45 }]}
                onPress={addAddress}
                disabled={!newLabel.trim() || !newFull.trim()}
                activeOpacity={0.85}>
                <Text style={s.saveBtnText}>Save Address</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

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
  addBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContainer: { paddingHorizontal: 20, gap: 12, paddingTop: 4 },

  addressCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardLeft: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  addrIconCircle: {
    width: 44, height: 44,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrIconCircleDefault: { backgroundColor: C.accent, borderColor: C.accent },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  addrLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    backgroundColor: C.accentLight,
  },
  defaultBadgeText: { color: C.accent, fontSize: 10, fontWeight: '700' },
  addrFull: { color: C.muted, fontSize: 13, lineHeight: 18 },

  cardActions: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
  },
  actionBtnDelete: { backgroundColor: '#FFEBEE', borderColor: C.red + '30' },
  actionBtnText: { color: C.accent, fontSize: 12, fontWeight: '600' },

  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.accent + '50',
    borderStyle: 'dashed',
    backgroundColor: C.accentLight,
    marginTop: 4,
  },
  addMoreBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptySubtitle: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyAddBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' },
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
    marginBottom: 8,
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  inputLabel: { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: -6 },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 14,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
