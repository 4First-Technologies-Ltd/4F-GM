import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ApiRequestError, riderApi, type RiderJobsResponse } from '@/lib/api';
import { fmtNaira } from '@/lib/riderOrders';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  amber: '#B45309',
  amberLight: '#FEF3E2',
  red: '#D32F2F',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

const POLL_MS = 20_000;
const LOCATION_EVERY_MS = 3 * 60_000;

/** Best effort: the pool works without a location, it just can't show distances or send nearby alerts. */
async function currentPosition(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return undefined;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return undefined;
  }
}

const waited = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
};

/**
 * The rider's online switch and the job pool: accepted orders no rider has
 * taken yet. One job at a time. Mirrors the website's components/rider/JobPool.tsx.
 */
export function RiderJobPool({ hasActiveJob, onTaken }: { hasActiveJob: boolean; onTaken: () => void | Promise<void> }) {
  const [data, setData] = useState<RiderJobsResponse | null>(null);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const lastLocation = useRef(0);
  const online = data?.online ?? false;

  const load = useCallback(async () => {
    try {
      setData(await riderApi.getJobs());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load jobs.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, POLL_MS);
      return () => clearInterval(id);
    }, [load]),
  );

  // While online, keep the location fresh so distances and nearby alerts stay right.
  useEffect(() => {
    if (!online) return;
    const tick = async () => {
      if (Date.now() - lastLocation.current < LOCATION_EVERY_MS) return;
      lastLocation.current = Date.now();
      const pos = await currentPosition();
      if (pos) await riderApi.updateLocation(pos).catch(() => {});
    };
    tick();
    const id = setInterval(tick, LOCATION_EVERY_MS);
    return () => clearInterval(id);
  }, [online]);

  async function toggle() {
    if (!data) return;
    setToggling(true);
    setError('');
    try {
      const going = !data.online;
      const pos = going ? await currentPosition() : undefined;
      if (pos) lastLocation.current = Date.now();
      await riderApi.setOnline(going, pos);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your status.');
    } finally {
      setToggling(false);
    }
  }

  async function take(id: string) {
    setTaking(id);
    setError('');
    try {
      await riderApi.acceptJob(id);
      await Promise.all([load(), onTaken()]);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'JOB_TAKEN'
          ? 'Another rider took that job first.'
          : err instanceof Error ? err.message : 'Could not take this job.',
      );
      await load();
    } finally {
      setTaking(null);
    }
  }

  if (!data) {
    return error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />;
  }

  if (!data.approved) {
    return (
      <View style={s.note}>
        <Text style={s.noteText}>Once your rider account is approved you can go online and take jobs.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.toggleCard, cardShadow]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.dot, { backgroundColor: online ? '#22C55E' : '#C9D8C9' }]} />
            <Text style={s.toggleTitle}>{online ? "You're online" : "You're offline"}</Text>
          </View>
          <Text style={s.toggleSub}>
            {online ? 'You see new jobs and get alerts for jobs near you.' : 'Go online to see jobs and get alerts.'}
          </Text>
        </View>
        <TouchableOpacity
          style={[online ? s.btnOutline : s.btnPrimary, toggling && { opacity: 0.6 }]}
          onPress={toggle}
          disabled={toggling}
          activeOpacity={0.8}
        >
          {toggling ? (
            <ActivityIndicator color={online ? C.accent : '#fff'} />
          ) : (
            <Text style={online ? s.btnOutlineText : s.btnPrimaryText}>{online ? 'Go offline' : 'Go online'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {!!error && <Text style={s.error}>{error}</Text>}

      {online && (
        <>
          <Text style={s.section}>Available jobs{data.jobs.length > 0 ? ` (${data.jobs.length})` : ''}</Text>
          {hasActiveJob && <Text style={s.muted}>Finish your current delivery to take another job.</Text>}
          {data.jobs.length === 0 && (
            <View style={s.note}>
              <Text style={s.noteText}>No jobs right now. New ones appear here automatically.</Text>
            </View>
          )}
          {data.jobs.map((job) => (
            <View key={job.id} style={[s.job, cardShadow]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="storefront.fill" size={15} color={C.accent} />
                    <Text style={s.jobVendor} numberOfLines={1}>
                      {job.vendorName}
                      {job.branchName && job.branchName !== 'Main branch' ? ` · ${job.branchName}` : ''}
                    </Text>
                  </View>
                  <Text style={s.muted} numberOfLines={2}>{job.pickupAddress || 'Pickup address not set'}</Text>
                </View>
                <Text style={s.pay}>{job.riderPay > 0 ? fmtNaira(job.riderPay) : '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <IconSymbol name="mappin" size={15} color={C.muted} />
                <Text style={s.jobLine}>{job.deliveryAddress}</Text>
              </View>
              <View style={s.jobFooter}>
                <Text style={s.muted}>
                  {job.quantity} × {job.cylinderSize}
                  {job.distanceKm != null ? ` · ${job.distanceKm} km to pickup` : ''} · {waited(job.waitingSince)}
                </Text>
                <TouchableOpacity
                  style={[s.btnPrimary, (hasActiveJob || taking !== null) && { opacity: 0.5 }]}
                  disabled={hasActiveJob || taking !== null}
                  onPress={() => take(job.id)}
                  activeOpacity={0.85}
                >
                  {taking === job.id ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>Take job</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  toggleCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  toggleTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  toggleSub: { color: C.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  btnPrimary: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 96, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnOutline: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 96, alignItems: 'center' },
  btnOutlineText: { color: C.text, fontSize: 13, fontWeight: '700' },
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  muted: { color: C.muted, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  note: { backgroundColor: C.card, borderRadius: 16, padding: 18, alignItems: 'center' },
  noteText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  error: { color: C.red, fontSize: 13 },
  job: { backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 10 },
  jobVendor: { color: C.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  jobLine: { color: C.text, fontSize: 13, flex: 1, lineHeight: 18 },
  pay: { color: C.accent, fontSize: 18, fontWeight: '800' },
  jobFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10,
  },
});
