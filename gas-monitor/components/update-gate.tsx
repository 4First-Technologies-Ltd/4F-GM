import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchVersionPolicy,
  installedVersion,
  parseUpdateNotes,
  updateState,
  type VersionPolicy,
} from '@/lib/appVersion';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

/**
 * Asks the API at launch and whenever the app comes back to the front. Too old
 * (below `min`) and nothing else can be used until the user updates; merely
 * behind (below `latest`) and it asks once per version, then lets them carry on.
 * A failed check lets the app run: being offline must never lock anyone out.
 *
 * The card stays small: a short summary and "Read more", which opens the full
 * what's-new screen. Closing that screen returns to the card, so a forced update
 * can never be skipped by reading about it.
 */
export function UpdateGate() {
  const [policy, setPolicy] = useState<VersionPolicy | null>(null);
  // Kept in memory: "Not now" lasts until the app is next opened.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [details, setDetails] = useState(false);

  const check = useCallback(() => {
    fetchVersionPolicy().then(setPolicy).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!policy) return null;
  const state = updateState(policy);
  if (state === 'ok' || (state === 'available' && dismissed === policy.latest)) return null;
  const required = state === 'required';
  const notes = parseUpdateNotes(policy.notes);
  const update = () => {
    if (policy.storeUrl) void Linking.openURL(policy.storeUrl);
  };

  if (details) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setDetails(false)}>
        <SafeAreaView style={s.screen}>
          <View style={s.screenHeader}>
            <Pressable onPress={() => setDetails(false)} hitSlop={12}>
              <Text style={s.back}>‹ Back</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.screenBody}>
            <View style={s.versionChip}>
              <Text style={s.versionChipText}>
                Version {policy.latest} · you have {installedVersion}
              </Text>
            </View>
            <Text style={s.screenTitle}>{required ? 'Please update 4FG Monitor' : 'What’s new'}</Text>
            {required && (
              <Text style={s.screenLead}>
                This version ({installedVersion}) is too old to keep working. Update to {policy.latest} to carry on.
              </Text>
            )}
            <Text style={s.screenSummary}>{notes.summary}</Text>
            {notes.points.length > 0 && (
              <View style={s.points}>
                {notes.points.map((p, i) => (
                  <View key={i} style={s.pointRow}>
                    <View style={s.dot} />
                    <Text style={s.pointText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={s.screenFooter}>
            {policy.storeUrl ? (
              <Pressable style={s.primary} onPress={update}>
                <Text style={s.primaryText}>Update now</Text>
              </Pressable>
            ) : null}
            {!required && (
              <Pressable
                style={s.ghost}
                onPress={() => {
                  setDetails(false);
                  setDismissed(policy.latest);
                }}
              >
                <Text style={s.ghostText}>Not now</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  const hasMore = notes.points.length > 0 || notes.summary.length > 110;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!required) setDismissed(policy.latest);
      }}
    >
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{required ? 'Please update 4FG Monitor' : 'A new version is out'}</Text>
          <Text style={s.body} numberOfLines={required ? 3 : 2}>
            {required
              ? `This version (${installedVersion}) is too old to keep working. Update to ${policy.latest} to carry on.`
              : notes.summary}
          </Text>
          {hasMore && (
            <Pressable onPress={() => setDetails(true)} hitSlop={8}>
              <Text style={s.more}>Read more</Text>
            </Pressable>
          )}
          {policy.storeUrl ? (
            <Pressable style={s.primary} onPress={update}>
              <Text style={s.primaryText}>Update</Text>
            </Pressable>
          ) : null}
          {!required && (
            <Pressable style={s.ghost} onPress={() => setDismissed(policy.latest)}>
              <Text style={s.ghostText}>Not now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 8,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  body: { color: C.muted, fontSize: 14, lineHeight: 20 },
  more: { color: C.accent, fontSize: 14, fontWeight: '700' },
  primary: {
    marginTop: 12,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ghost: { paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: C.accent, fontSize: 15, fontWeight: '600' },

  // Full-screen "what's new"
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0 },
  screenHeader: { paddingHorizontal: 20, paddingVertical: 14 },
  back: { color: C.accent, fontSize: 16, fontWeight: '700' },
  screenBody: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  versionChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  versionChipText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  screenTitle: { color: C.text, fontSize: 26, fontWeight: '800' },
  screenLead: { color: C.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  screenSummary: { color: C.text, fontSize: 16, lineHeight: 24 },
  points: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 4,
  },
  pointRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginTop: 7 },
  pointText: { flex: 1, color: C.text, fontSize: 15, lineHeight: 22 },
  screenFooter: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: C.bg,
    borderTopColor: C.border,
    borderTopWidth: 1,
  },
});
