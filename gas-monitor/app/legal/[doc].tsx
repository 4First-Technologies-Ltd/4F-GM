import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE } from '@/lib/legal';
import { setLegalAccepted, useLegalConsent } from '@/lib/legal-consent';

const C = { bg: '#FFFFFF', accent: '#2D7450', text: '#1A2E1A', muted: '#7A9A7A', border: '#E0EEE0', surface: '#F8FCF8' };
const END_TOLERANCE = 24;

export default function LegalReaderScreen() {
  const { doc: slug } = useLocalSearchParams<{ doc: string }>();
  const doc = slug === 'privacy' ? LEGAL_DOCS.privacy : LEGAL_DOCS.terms;
  const consent = useLegalConsent();
  const already = consent[doc.slug];
  const [reachedEnd, setReachedEnd] = useState(false);
  const canAccept = already || reachedEnd;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_TOLERANCE) setReachedEnd(true);
  }

  function accept() {
    setLegalAccepted(doc.slug, true);
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={s.close}>Close</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{doc.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        onScroll={onScroll}
        scrollEventThrottle={64}
        // Content shorter than the screen never fires a scroll, so treat it as read.
        onContentSizeChange={(_, h) => { if (h < 400) setReachedEnd(true); }}
      >
        <Text style={s.updated}>Effective {LEGAL_EFFECTIVE_DATE}</Text>
        <Text style={s.summary}>{doc.summary}</Text>
        {doc.sections.map((sec, i) => (
          <View key={sec.id} style={{ marginTop: 22 }}>
            <Text style={s.h}>{i + 1}. {sec.heading}</Text>
            {sec.body.map((b, j) =>
              typeof b === 'string' ? (
                <Text key={j} style={s.p}>{b}</Text>
              ) : (
                <View key={j} style={{ marginTop: 6 }}>
                  {b.list.map((item, k) => (
                    <Text key={k} style={[s.p, { marginTop: 4, paddingLeft: 12 }]}>{'•'} {item}</Text>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        {!canAccept && <Text style={s.hint}>Scroll to the end to accept</Text>}
        <TouchableOpacity
          style={[s.btn, !canAccept && { opacity: 0.4 }]}
          disabled={!canAccept}
          activeOpacity={0.85}
          onPress={accept}
          accessibilityState={{ disabled: !canAccept }}
        >
          <Text style={s.btnText}>{already ? 'Accepted' : 'I have read and accept'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  close: { color: C.accent, fontWeight: '600', fontSize: 15, width: 44 },
  headerTitle: { color: C.text, fontWeight: '700', fontSize: 16, flex: 1, textAlign: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  updated: { color: C.muted, fontSize: 12 },
  summary: { color: C.text, fontSize: 15, lineHeight: 22, marginTop: 8, fontWeight: '500' },
  h: { color: C.text, fontSize: 16, fontWeight: '700' },
  p: { color: C.text, fontSize: 14, lineHeight: 21, marginTop: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface, gap: 8 },
  hint: { color: C.muted, fontSize: 12, textAlign: 'center' },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
