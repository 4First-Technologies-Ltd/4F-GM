import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getAccessToken, getSavedUser } from '@/lib/storage';
import type { ApiUser } from '@/lib/api';

const C = {
  bg: '#EDF7ED',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  text: '#1A2E1A',
  muted: '#7A9A7A',
};

export default function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 350,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) {
        router.replace('/onboarding');
        return;
      }
      const user = await getSavedUser<ApiUser>();
      if (user?.role === 'VENDOR') {
        router.replace(user.vendorStatus === 'APPROVED' ? '/(vendor)' : '/vendor-pending');
      } else {
        router.replace('/(tabs)');
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={s.container}>
      <StatusBar style="dark" />

      {/* Decorative background circles */}
      <View style={[s.decCircle, { width: 340, height: 340, top: -100, right: -100 }]} />
      <View style={[s.decCircle, { width: 220, height: 220, bottom: -60, left: -60 }]} />

      {/* Logo + wordmark */}
      <Animated.View style={[s.logoBlock, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={s.badge}>
          <Text style={s.badgeText}>4FG</Text>
        </View>
        <Text style={s.appName}>
          <Text style={{ color: C.accent }}>4FG</Text>
          {' '}Monitor
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, { opacity: taglineOpacity }]}>
        Smart Gas Monitoring
      </Animated.Text>

      {/* Bottom dots loader */}
      <Animated.View style={[s.loaderRow, { opacity: taglineOpacity }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[s.loaderDot, i === 1 && { backgroundColor: C.accent, width: 20 }]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  decCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: C.accent,
    opacity: 0.05,
  },

  logoBlock: {
    alignItems: 'center',
    gap: 16,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  appName: {
    color: C.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  tagline: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginTop: 4,
  },

  loaderRow: {
    flexDirection: 'row',
    gap: 6,
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  loaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accentLight,
  },
});
