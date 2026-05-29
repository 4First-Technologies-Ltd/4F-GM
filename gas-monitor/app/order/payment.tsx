import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ordersApi } from '@/lib/api';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  red: '#D32F2F',
  redLight: '#FFEBEE',
};

// Must match the callback_url set in the backend orders.ts
const CALLBACK_URL_PREFIX = 'https://4fgmonitor.app.local/payment-callback';

type Phase = 'loading' | 'webview' | 'verifying' | 'error';

export default function PaymentScreen() {
  const {
    authorizationUrl,
    reference,
    orderId,
    amount,
    supplierName,
  } = useLocalSearchParams<{
    authorizationUrl: string;
    reference: string;
    orderId: string;
    amount: string;
    supplierName: string;
  }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const handled = useRef(false);

  async function handleCallbackUrl() {
    if (handled.current) return;
    handled.current = true;
    setPhase('verifying');

    try {
      await ordersApi.verify(reference);
      router.replace({
        pathname: '/order/payment-success',
        params: { orderId, reference, amount, supplierName },
      });
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Payment could not be verified. Please contact support.');
      setPhase('error');
    }
  }

  function onNavigationStateChange(state: WebViewNavigation) {
    if (state.url.startsWith(CALLBACK_URL_PREFIX)) {
      handleCallbackUrl();
    }
  }

  function onShouldStartLoadWithRequest(request: { url: string }) {
    if (request.url.startsWith(CALLBACK_URL_PREFIX)) {
      handleCallbackUrl();
      return false; // Block the WebView from actually navigating
    }
    return true;
  }

  // ── Verifying overlay ───────────────────────────────────────────────────────
  if (phase === 'verifying') {
    return (
      <SafeAreaView style={s.centeredScreen}>
        <StatusBar style="dark" />
        <View style={s.verifyingCard}>
          <ActivityIndicator size="large" color={C.accent} style={{ marginBottom: 16 }} />
          <Text style={s.verifyingTitle}>Confirming payment…</Text>
          <Text style={s.verifyingSub}>Please wait while we verify your transaction.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error screen ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={s.centeredScreen}>
        <StatusBar style="dark" />
        <View style={s.errorCard}>
          <View style={s.errorIconCircle}>
            <IconSymbol name="xmark.circle.fill" size={40} color={C.red} />
          </View>
          <Text style={s.errorTitle}>Verification Failed</Text>
          <Text style={s.errorSub}>{errorMsg}</Text>
          <TouchableOpacity style={s.errorBackBtn} onPress={() => router.replace('/order')} activeOpacity={0.85}>
            <Text style={s.errorBackBtnText}>Back to Orders</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Payment WebView ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.cancelBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="xmark.circle.fill" size={26} color={C.dim} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Secure Payment</Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {supplierName} · ₦{Number(amount).toLocaleString()}
          </Text>
        </View>
        <View style={s.lockBadge}>
          <IconSymbol name="lock.fill" size={14} color={C.accent} />
          <Text style={s.lockText}>SSL</Text>
        </View>
      </View>

      {/* Loading bar shown while WebView is loading */}
      {phase === 'loading' && (
        <View style={s.loadingBar}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={s.loadingText}>Loading Paystack…</Text>
        </View>
      )}

      <WebView
        source={{ uri: authorizationUrl }}
        style={[s.webview, phase === 'loading' && { opacity: 0, height: 0 }]}
        onLoadEnd={() => setPhase('webview')}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        // Improve rendering on Android
        androidLayerType="hardware"
        // Allow mixed content for Paystack checkout
        mixedContentMode="compatibility"
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  centeredScreen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  cancelBtn: { padding: 2 },
  headerTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accentLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lockText: { color: C.accent, fontSize: 11, fontWeight: '700' },

  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 32,
    backgroundColor: C.bg,
  },
  loadingText: { color: C.muted, fontSize: 14 },

  webview: { flex: 1 },

  // Verifying
  verifyingCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  verifyingTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  verifyingSub: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Error
  errorCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  errorIconCircle: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: C.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  errorSub: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorBackBtn: {
    marginTop: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  errorBackBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
