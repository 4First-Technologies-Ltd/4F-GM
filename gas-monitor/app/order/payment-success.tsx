import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

export default function PaymentSuccessScreen() {
  const { orderId, reference, amount, supplierName } = useLocalSearchParams<{
    orderId: string;
    reference: string;
    amount: string;
    supplierName: string;
  }>();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />

      <View style={s.content}>
        {/* Animated checkmark */}
        <Animated.View style={[s.checkCircle, { transform: [{ scale: scaleAnim }] }]}>
          <IconSymbol name="checkmark.circle.fill" size={64} color={C.accent} />
        </Animated.View>

        <Animated.View style={[s.textBlock, { opacity: fadeAnim }]}>
          <Text style={s.headline}>Payment Successful</Text>
          <Text style={s.subline}>Your order has been confirmed and{'\n'}will be processed shortly.</Text>
        </Animated.View>

        {/* Order summary card */}
        <Animated.View style={[s.summaryCard, { opacity: fadeAnim },
          Platform.select({
            ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
            android: { elevation: 3 },
          }),
        ]}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Supplier</Text>
            <Text style={s.summaryValue} numberOfLines={1}>{supplierName}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Amount paid</Text>
            <Text style={[s.summaryValue, s.amountValue]}>
              ₦{Number(amount).toLocaleString()}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Reference</Text>
            <Text style={[s.summaryValue, s.refValue]} numberOfLines={1}>{reference}</Text>
          </View>
        </Animated.View>
      </View>

      {/* Actions */}
      <Animated.View style={[s.actions, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => router.replace('/order/history')}
          activeOpacity={0.85}
        >
          <IconSymbol name="clock.fill" size={18} color="#fff" />
          <Text style={s.primaryBtnText}>View Order History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.8}
        >
          <Text style={s.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 24,
  },

  checkCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBlock: { alignItems: 'center', gap: 8 },
  headline: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subline: { color: C.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  summaryCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingVertical: 6,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  summaryLabel: { color: C.muted, fontSize: 14 },
  summaryValue: { color: C.text, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 16 },
  amountValue: { color: C.accent, fontSize: 18, fontWeight: '800' },
  refValue: { color: C.dim, fontSize: 12, fontWeight: '500' },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: -20 },

  actions: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  secondaryBtnText: { color: C.muted, fontSize: 15, fontWeight: '600' },
});
