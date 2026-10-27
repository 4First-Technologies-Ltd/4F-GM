import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchVersionPolicy, installedVersion, updateState, type VersionPolicy } from '@/lib/appVersion';

const C = {
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  accent: '#2D7450',
};

/**
 * Asks the API at launch and whenever the app comes back to the front. Too old
 * (below `min`) and nothing else can be used until the user updates; merely
 * behind (below `latest`) and it asks once per version, then lets them carry on.
 * A failed check lets the app run: being offline must never lock anyone out.
 */
export function UpdateGate() {
  const [policy, setPolicy] = useState<VersionPolicy | null>(null);
  // Kept in memory: "Not now" lasts until the app is next opened.
  const [dismissed, setDismissed] = useState<string | null>(null);

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
          <Text style={s.body}>
            {required
              ? `This version (${installedVersion}) is too old to keep working. Update to ${policy.latest} to carry on.`
              : `Version ${policy.latest} is ready. You have ${installedVersion}.`}
          </Text>
          {policy.storeUrl ? (
            <Pressable style={s.primary} onPress={() => void Linking.openURL(policy.storeUrl!)}>
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
});
