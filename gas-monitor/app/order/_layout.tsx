import { Stack } from 'expo-router';
import React from 'react';

export default function OrderStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="payment" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="payment-success" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
