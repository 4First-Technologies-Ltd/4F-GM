import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { vendorApi, VendorDocument } from '@/lib/api';
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
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DocumentRow({ doc }: { doc: VendorDocument }) {
  return (
    <TouchableOpacity
      style={[s.docCard, cardShadow]}
      activeOpacity={0.8}
      onPress={() => {
        if (doc.url.startsWith('http')) Linking.openURL(doc.url);
      }}
    >
      <View style={s.docIconCircle}>
        <IconSymbol name="doc.fill" size={20} color={C.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.docName} numberOfLines={1}>{doc.fileName}</Text>
        <Text style={s.docMeta}>Uploaded {fmtDate(doc.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function VendorDocumentsScreen() {
  const { openDrawer } = useDrawer();
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [apiErr, setApiErr] = useState('');

  async function loadDocuments() {
    try {
      const profile = await vendorApi.getProfile();
      setDocuments(profile.documents ?? []);
    } catch {
      // empty state handles this
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadDocuments(); }, []));

  async function handleAddDocument() {
    setApiErr('');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to add a document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? 'document';

    setUploading(true);
    try {
      await vendorApi.uploadDocuments([{ url: asset.uri, fileName }]);
      await loadDocuments();
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer} activeOpacity={0.7}>
          <IconSymbol name="line.3.horizontal" size={22} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Documents</Text>
          <Text style={s.headerSub}>{documents.length} document{documents.length !== 1 ? 's' : ''} on file</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, uploading && { opacity: 0.7 }]}
          onPress={handleAddDocument}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {uploading ? <ActivityIndicator color="#fff" size="small" /> : <IconSymbol name="plus" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {!!apiErr && (
            <View style={s.apiErr}>
              <Text style={s.apiErrText}>{apiErr}</Text>
            </View>
          )}

          {documents.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <IconSymbol name="doc.fill" size={32} color={C.dim} />
              </View>
              <Text style={s.emptyTitle}>No documents yet</Text>
              <Text style={s.emptySubtitle}>
                Add an identity or business registration document to help verify your account.
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={handleAddDocument} activeOpacity={0.8}>
                <Text style={s.emptyBtnText}>Add Document</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ gap: 10 }}>
                {documents.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </View>
              <Text style={s.helperText}>
                Documents are reviewed by our team and can't be removed once submitted.
              </Text>
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
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

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  body: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },

  docCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docIconCircle: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: { color: C.text, fontSize: 14, fontWeight: '700' },
  docMeta: { color: C.muted, fontSize: 12, marginTop: 2 },

  helperText: { color: C.muted, fontSize: 12.5, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  apiErr: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#D32F2F55',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiErrText: { color: '#D32F2F', fontSize: 13, textAlign: 'center' },

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
