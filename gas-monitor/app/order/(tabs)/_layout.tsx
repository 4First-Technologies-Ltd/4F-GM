import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

const TAB_BAR_BG = '#FFFFFF';
const TAB_BAR_BORDER = '#E0EEE0';
const ACTIVE = '#2D7450';
const INACTIVE = '#9EBA9E';

export default function OrderLayout() {
  // A fixed height ignores the iPhone home indicator and tucks the bar underneath it: add the inset,
  // and keep labels clear of the zone where iOS holds back taps for its own swipe gesture.
  const bottom = Math.max(useSafeAreaInsets().bottom, 10);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopColor: TAB_BAR_BORDER,
          borderTopWidth: 1,
          height: 54 + bottom,
          paddingBottom: bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Suppliers',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="storefront.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bookmark.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Order History',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="addresses"
        options={{
          title: 'My Addresses',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="mappin" color={color} />,
        }}
      />
    </Tabs>
  );
}
