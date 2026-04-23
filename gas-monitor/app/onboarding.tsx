import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView, Platform, ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';

const heroBg = require('@/assets/images/onboarding-hero.jpg');

const { width: W, height: H } = Dimensions.get('window');

const C = {
  green: '#2D7450',
  greenBright: '#22C55E',
  greenLight: '#E8F5E8',
  greenDark: '#1A4730',
  white: '#FFFFFF',
  text: '#1A2E1A',
  muted: '#6B8F6B',
  border: '#E0EEE0',
  dotInactive: '#D1E8D1',
};

const SLIDES = [
  {
    key: 'monitor',
    title: 'Monitor Your\nGas Level',
    body: 'Real-time readings from your 4FG sensor keep you informed at all times.',
    hero: false,
  },
  {
    key: 'alerts',
    title: 'Get Smart\nAlerts',
    body: 'Timely refill reminders and critical alerts before you ever run out.',
    hero: false,
  },
  {
    key: 'safety',
    title: 'Smart Gas\nMonitoring,\nSimplified',
    body: "AI-powered insights predict your usage so you're always a step ahead.",
    hero: true,
  },
];

// ── Illustration: slide 1 ─────────────────────────────────────────────────────

function IconCircle({ name, bg }: { name: any; bg?: string }) {
  return (
    <View style={[il.iconCircle, bg ? { backgroundColor: bg } : {}]}>
      <IconSymbol name={name} size={22} color={C.white} />
    </View>
  );
}

function IllustrationMonitor() {
  const CW = 260;
  const CH = 210;
  const DW = 88;
  const DH = 108;
  const IS = 52;

  return (
    <View style={{ width: CW, height: CH }}>
      {/* Central device mockup */}
      <View style={{
        position: 'absolute',
        width: DW, height: DH,
        borderRadius: 22,
        backgroundColor: C.greenLight,
        borderWidth: 1.5,
        borderColor: C.green + '35',
        top: (CH - DH) / 2,
        left: (CW - DW) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}>
        <Text style={{ color: C.green, fontSize: 16, fontWeight: '900', letterSpacing: 1 }}>4FG</Text>
        <Text style={{ color: C.green + 'BB', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>SENSOR</Text>
      </View>

      {/* Top-left: flame */}
      <View style={{ position: 'absolute', top: 8, left: 22 }}><IconCircle name="flame.fill" /></View>
      {/* Top-right: wifi */}
      <View style={{ position: 'absolute', top: 8, right: 22 }}><IconCircle name="wifi" /></View>
      {/* Mid-left: chart */}
      <View style={{ position: 'absolute', top: (CH - IS) / 2, left: 0 }}><IconCircle name="chart.line.uptrend.xyaxis" /></View>
      {/* Mid-right: bell */}
      <View style={{ position: 'absolute', top: (CH - IS) / 2, right: 0 }}><IconCircle name="bell.fill" /></View>
      {/* Bottom-left: thermometer */}
      <View style={{ position: 'absolute', bottom: 8, left: 22 }}><IconCircle name="thermometer.medium" /></View>
      {/* Bottom-right: shield */}
      <View style={{ position: 'absolute', bottom: 8, right: 22 }}><IconCircle name="shield.fill" /></View>
    </View>
  );
}

// ── Illustration: slide 2 ─────────────────────────────────────────────────────

function IllustrationAlerts() {
  const cardShadow = Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 18 },
    android: { elevation: 5 },
    default: {},
  });
  const btnShadow = Platform.select({
    ios: { shadowColor: C.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.40, shadowRadius: 16 },
    android: { elevation: 8 },
    default: {},
  });

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Alert card */}
      <View style={[il.alertCard, cardShadow]}>
        {/* Top icon row */}
        <View style={il.alertIconRow}>
          {[
            { icon: 'thermometer.medium', active: true },
            { icon: 'lightbulb.fill', active: false },
            { icon: 'wifi', active: false },
          ].map(({ icon, active }, i) => (
            <View key={i} style={[il.alertIconBox, active && il.alertIconBoxActive]}>
              <IconSymbol name={icon as any} size={15} color={active ? C.green : C.muted} />
            </View>
          ))}
        </View>

        {/* Content bars */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <View style={{ gap: 6 }}>
            <View style={{ height: 9, borderRadius: 5, backgroundColor: '#FFB300', width: '80%' }} />
            <View style={{ height: 9, borderRadius: 5, backgroundColor: '#FFB300' + '55', width: '55%' }} />
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ height: 9, borderRadius: 5, backgroundColor: C.green, width: '65%' }} />
            <View style={{ height: 9, borderRadius: 5, backgroundColor: C.greenLight, width: '40%' }} />
          </View>
        </View>
      </View>

      {/* Green confirm circle overlapping card bottom */}
      <View style={[il.confirmCircle, btnShadow]}>
        <IconSymbol name="checkmark.circle.fill" size={30} color={C.white} />
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const isHero = current === SLIDES.length - 1;

  function goNext() {
    const next = current + 1;
    scrollRef.current?.scrollTo({ x: W * next, animated: true });
    setCurrent(next);
  }

  return (
    <View style={{ flex: 1, backgroundColor: isHero ? C.greenDark : C.white }}>
      <StatusBar style={isHero ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          setCurrent(Math.round(e.nativeEvent.contentOffset.x / W));
        }}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, idx) => {
          const dark = slide.hero;
          const pt = insets.top + (dark ? 0 : 8);
          const pb = insets.bottom + 8;

          const slideInner = (
            <View
              style={{
                flex: 1,
                paddingTop: pt,
                paddingBottom: pb,
                paddingHorizontal: 28,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* ── Top area ── */}
              <View style={{ width: '100%', alignItems: dark ? 'center' : 'flex-end' }}>
                {dark ? (
                  <View style={s.heroBrand}>
                    <View style={s.heroBadge}>
                      <Text style={s.heroBadgeText}>4FG</Text>
                    </View>
                    <Text style={s.heroBrandName}>
                      <Text style={{ color: C.greenBright }}>4FG</Text>
                      <Text style={{ color: C.white }}> Monitor</Text>
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => router.replace('/sign-in')}
                    activeOpacity={0.7}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={s.skipLink}>Skip</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Illustration (slides 1 & 2 only) ── */}
              {!dark && (
                <View style={s.illustrationWrap}>
                  {idx === 0 && <IllustrationMonitor />}
                  {idx === 1 && <IllustrationAlerts />}
                </View>
              )}

              {/* ── Text block ── */}
              <View style={[s.textBlock, dark && s.textBlockHero]}>
                <Text style={[s.title, dark && { color: C.white }]}>{slide.title}</Text>
                <Text style={[s.body, dark && { color: 'rgba(255,255,255,0.72)' }]}>{slide.body}</Text>
              </View>

              {/* ── Dots ── */}
              <View style={s.dotsRow}>
                {SLIDES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      i === current
                        ? [s.dotActive, dark && { backgroundColor: C.greenBright }]
                        : dark
                          ? { backgroundColor: 'rgba(255,255,255,0.30)' }
                          : {},
                    ]}
                  />
                ))}
              </View>

              {/* ── CTA buttons ── */}
              <View style={s.btnGroup}>
                {dark ? (
                  <>
                    <TouchableOpacity
                      style={[s.primaryBtn, { backgroundColor: C.greenBright }]}
                      activeOpacity={0.85}
                      onPress={() => router.replace('/sign-up')}
                    >
                      <Text style={s.primaryBtnText}>Get Started</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => router.replace('/sign-in')}
                      style={{ paddingVertical: 8 }}
                    >
                      <Text style={s.loginLink}>
                        Already have account?{'  '}
                        <Text style={{ color: C.greenBright, fontWeight: '700' }}>Log In</Text>
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={goNext}>
                      <Text style={s.primaryBtnText}>Next</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => router.replace('/sign-in')}
                      style={{ paddingVertical: 8 }}
                    >
                      <Text style={[s.loginLink, { color: C.green }]}>Skip</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );

          // Hero slide: photo background + dark overlay
          if (dark) {
            return (
              <ImageBackground
                key={slide.key}
                source={heroBg}
                resizeMode="cover"
                style={{ width: W, height: H }}
              >
                <View style={s.heroOverlay}>{slideInner}</View>
              </ImageBackground>
            );
          }

          return (
            <View
              key={slide.key}
              style={{ width: W, height: H, backgroundColor: C.white }}
            >
              {slideInner}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Illustration styles ───────────────────────────────────────────────────────
const iconCircleShadow = Platform.select({
  ios: { shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 8 },
  android: { elevation: 4 },
  default: {},
});

const il = StyleSheet.create({
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    ...iconCircleShadow,
  },

  alertCard: {
    width: 230,
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 14,
  },
  alertIconRow: { flexDirection: 'row', gap: 10 },
  alertIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#ECECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIconBoxActive: {
    backgroundColor: C.greenLight,
    borderColor: C.green + '30',
  },
  confirmCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },

});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,10,5,0.62)',
  },

  heroBrand: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroBrandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  skipLink: {
    color: C.green,
    fontSize: 15,
    fontWeight: '600',
  },

  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxHeight: H * 0.38,
  },

  textBlock: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  textBlockHero: {
    paddingHorizontal: 8,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  body: {
    color: C.muted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.dotInactive,
  },
  dotActive: {
    width: 20,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },

  btnGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: C.green,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  loginLink: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 14,
    fontWeight: '500',
  },
});
