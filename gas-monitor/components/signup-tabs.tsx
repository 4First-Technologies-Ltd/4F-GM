import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

const C = {
  surface: '#F8FCF8',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  muted: '#7A9A7A',
  border: '#E0EEE0',
};

export type SignUpCategory = 'CONSUMER' | 'VENDOR' | 'RIDER';

const CATEGORIES: { key: SignUpCategory; label: string; href: '/sign-up' | '/vendor-sign-up' | '/rider-sign-up' }[] = [
  { key: 'CONSUMER', label: 'Consumer', href: '/sign-up' },
  { key: 'VENDOR', label: 'Vendor', href: '/vendor-sign-up' },
  { key: 'RIDER', label: 'Rider', href: '/rider-sign-up' },
];

export interface SubTab<K extends string = string> {
  key: K;
  label: string;
}

/** Second row under Rider ("Single Rider" / "Logistics Company"). Vendor has one sign-up form, so no sub tabs. */
export const RIDER_SUBTABS: SubTab<'SINGLE' | 'COMPANY'>[] = [
  { key: 'SINGLE', label: 'Single Rider' },
  { key: 'COMPANY', label: 'Logistics Company' },
];

/**
 * The sign-up screens' header tabs: Consumer / Vendor / Rider, with an optional
 * second row of tabs under Rider. Switching category navigates to that
 * category's screen; the sub tabs are handled by the screen that owns them.
 */
export function SignUpTabs<K extends string>({
  category,
  sub,
}: {
  category: SignUpCategory;
  sub?: { tabs: SubTab<K>[]; value: K; onChange: (k: K) => void };
}) {
  return (
    <View style={s.outer}>
      <View style={s.wrap}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[s.tab, category === c.key && s.tabActive]}
            onPress={() => { if (c.key !== category) router.replace(c.href); }}
            activeOpacity={0.8}
          >
            <Text style={[s.tabText, category === c.key && s.tabTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {sub && (
        <View style={s.subWrap}>
          {sub.tabs.map((t) => {
            const active = sub.value === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.subTab, active && s.subTabActive]}
                onPress={() => { if (!active) sub.onChange(t.key); }}
                activeOpacity={0.8}
              >
                <Text style={[s.subText, active && s.subTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  outer: { marginBottom: 22 },
  wrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },

  subWrap: {
    flexDirection: 'row',
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  subTabActive: { borderBottomColor: C.accent },
  subText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  subTextActive: { color: C.accent },
});
