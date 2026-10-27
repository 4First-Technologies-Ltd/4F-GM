import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { notificationsApi } from '@/lib/api';

/** Unread messages from the 4FG team; refreshed whenever the screen it sits on comes into focus. */
export function useUnreadCount() {
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      notificationsApi
        .unreadCount()
        .then((n) => live && setUnread(n))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [])
  );
  return unread;
}

/** Bell with an unread badge. Opens the inbox. */
export function NotificationBell() {
  const unread = useUnreadCount();
  return (
    <TouchableOpacity
      style={s.btn}
      onPress={() => router.push('/notifications')}
      activeOpacity={0.7}
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <IconSymbol name="bell.fill" size={20} color="#2D7450" />
      {unread > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0EEE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#D32F2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
