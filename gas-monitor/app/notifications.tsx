import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { notificationsApi, type AppNotification } from '@/lib/api';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  accent: '#2D7450',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  border: '#E0EEE0',
  unread: '#E8F5E8',
};

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Messages from the 4FG team. Opened from the bell, or by tapping a push notification. */
export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { notifications } = await notificationsApi.list();
      setItems(notifications);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function open(n: AppNotification) {
    if (n.readAt) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    notificationsApi.markRead(n.id).catch(() => {});
  }

  async function readAll() {
    setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    notificationsApi.markAllRead().catch(() => {});
  }

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back} accessibilityLabel="Back" activeOpacity={0.7}>
          <IconSymbol name="chevron.left" size={22} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.title}>Messages</Text>
        {hasUnread ? (
          <TouchableOpacity onPress={readAll} activeOpacity={0.7}>
            <Text style={s.readAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={items.length ? s.list : s.emptyWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <IconSymbol name="bell.fill" size={32} color={C.muted} />
              <Text style={s.emptyTitle}>{error ? 'Could not load messages' : 'No messages yet'}</Text>
              <Text style={s.emptySub}>{error || 'Notes from the 4FG team will show up here.'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, !item.readAt && s.cardUnread]}
              onPress={() => void open(item)}
              activeOpacity={0.8}
            >
              <View style={s.row}>
                {!item.readAt && <View style={s.dot} />}
                <Text style={[s.cardTitle, { flex: 1 }]}>{item.title}</Text>
                <Text style={s.time}>{when(item.createdAt)}</Text>
              </View>
              <Text style={s.body}>{item.body}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, fontWeight: '800' },
  readAll: { color: C.accent, fontSize: 13, fontWeight: '700', width: 90, textAlign: 'right' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  emptyWrap: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  emptySub: { color: C.muted, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 6 },
  cardUnread: { backgroundColor: C.unread, borderColor: C.accent + '55' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  time: { color: C.muted, fontSize: 11 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
});
