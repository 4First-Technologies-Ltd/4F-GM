import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { ApiRequestError, vendorApi, type VendorPlan, type VendorProfile } from '@/lib/api';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

/**
 * Mirrors `gas-monitor-backend/src/lib/plans.ts` (and the website's `lib/plans.ts`) —
 * the backend is the authority, these only label and price a plan without a round trip.
 */
const PLANS: Record<VendorPlan, { name: string; commission: number }> = {
  BASIC: { name: 'Basic', commission: 5 },
  GROWTH: { name: 'Growth', commission: 7 },
  PRO: { name: 'Pro / Premium', commission: 10 },
};

/** The one plan on sale; vendors on a retired plan can move to it. */
const OFFERED_PLAN: VendorPlan = 'GROWTH';
const COOLDOWN_DAYS = 14;

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

function daysRemaining(lockedUntil?: string | null) {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

export function VendorPlanCard({ profile, onUpdated }: { profile: VendorProfile; onUpdated: (p: VendorProfile) => void }) {
  const [switching, setSwitching] = useState(false);
  if (!profile.plan) return null;

  const current = PLANS[profile.plan];
  const lockedDays = daysRemaining(profile.planLockedUntil);
  const canSwitch = profile.plan !== OFFERED_PLAN;

  function confirmSwitch() {
    const target = PLANS[OFFERED_PLAN];
    Alert.alert(
      `Switch to ${target.name}?`,
      `The new ${target.commission}% rate applies to orders completed from now on, and you'll be held on it for ${COOLDOWN_DAYS} days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => void doSwitch() },
      ],
    );
  }

  async function doSwitch() {
    setSwitching(true);
    try {
      // The server owns the cooldown and can refuse even if this screen thought it had lapsed.
      onUpdated(await vendorApi.changePlan(OFFERED_PLAN));
    } catch (err) {
      Alert.alert(
        'Could not change plan',
        err instanceof ApiRequestError || err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSwitching(false);
    }
  }

  return (
    <View style={[s.card, cardShadow]}>
      <Text style={s.title}>Partner plan</Text>
      <Text style={s.sub}>4FG earns a commission only on orders completed through the marketplace.</Text>

      <View style={s.rateRow}>
        <Text style={s.rate}>{current.commission}%</Text>
        <Text style={s.planName}>{current.name} plan</Text>
      </View>
      {profile.planChangedAt ? <Text style={s.since}>since {fmtDate(profile.planChangedAt)}</Text> : null}

      {canSwitch && lockedDays > 0 ? (
        <Text style={s.locked}>
          You can change plan again in {lockedDays} day{lockedDays === 1 ? '' : 's'}
          {profile.planLockedUntil ? ` (${fmtDate(profile.planLockedUntil)})` : ''}.
        </Text>
      ) : null}

      {canSwitch && lockedDays === 0 ? (
        <TouchableOpacity style={[s.switchBtn, switching && { opacity: 0.6 }]} onPress={confirmSwitch} disabled={switching} activeOpacity={0.8}>
          {switching
            ? <ActivityIndicator color={C.accent} size="small" />
            : <Text style={s.switchText}>Switch to {PLANS[OFFERED_PLAN].name} ({PLANS[OFFERED_PLAN].commission}%)</Text>}
        </TouchableOpacity>
      ) : null}

      {profile.planChanges?.length ? (
        <View style={s.history}>
          <Text style={s.historyTitle}>PLAN HISTORY</Text>
          {profile.planChanges.map((c) => (
            <Text key={c.id} style={s.historyRow}>
              <Text style={{ color: C.text }}>{PLANS[c.fromPlan].name} → {PLANS[c.toPlan].name}</Text>
              {' · '}{fmtDate(c.createdAt)}{c.actor === 'ADMIN' ? ' · changed by 4FG' : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, gap: 6 },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 12, lineHeight: 17 },
  rateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  rate: { color: C.accent, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  planName: { color: C.text, fontSize: 14, fontWeight: '600' },
  since: { color: C.muted, fontSize: 12 },
  locked: {
    color: C.muted, fontSize: 13, backgroundColor: C.accentLight,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8,
  },
  switchBtn: {
    marginTop: 10, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: C.accent + '60', backgroundColor: C.accentLight,
  },
  switchText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  history: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 4 },
  historyTitle: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  historyRow: { color: C.muted, fontSize: 13 },
});
