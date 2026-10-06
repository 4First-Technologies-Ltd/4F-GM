import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useLegalConsent } from '@/lib/legal-consent';

const C = { accent: '#2D7450', text: '#1A2E1A', muted: '#7A9A7A', border: '#E0EEE0', red: '#D32F2F', surface: '#F8FCF8' };

const ROWS = [
  { slug: 'terms', label: 'Terms and Conditions' },
  { slug: 'privacy', label: 'Privacy Policy' },
] as const;

/** Read-to-accept rows: each document must be opened and read to the end before it counts. */
export function LegalConsent({ invalid }: { invalid?: boolean }) {
  const consent = useLegalConsent();
  return (
    <View style={s.wrap}>
      {ROWS.map(({ slug, label }) => (
        <TouchableOpacity
          key={slug}
          style={[s.row, invalid && !consent[slug] && { borderColor: C.red }]}
          activeOpacity={0.8}
          onPress={() => router.push(`/legal/${slug}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`${consent[slug] ? 'Accepted' : 'Read and accept'} ${label}`}
        >
          <View style={[s.box, consent[slug] && s.boxOn]}>
            {consent[slug] && <Text style={s.tick}>{'✓'}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.sub}>{consent[slug] ? 'Accepted' : 'Tap to read and accept'}</Text>
          </View>
          <Text style={s.chev}>{'›'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, backgroundColor: C.surface },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: { color: C.text, fontSize: 14, fontWeight: '600' },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  chev: { color: C.muted, fontSize: 22 },
});
