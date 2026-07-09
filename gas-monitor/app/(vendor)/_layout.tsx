import React, { useRef, useState, createContext, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  TouchableWithoutFeedback, Dimensions, Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { authApi } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';

const { width: W } = Dimensions.get('window');
const DRAWER_W = Math.min(W * 0.78, 320);

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  border: '#E0EEE0',
  surface: '#F5FBF5',
};

// ── Drawer context ────────────────────────────────────────────────────────────

interface DrawerCtxType { openDrawer: () => void }
const DrawerCtx = createContext<DrawerCtxType>({ openDrawer: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, onPress, danger,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[d.navItem, active && d.navItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <IconSymbol
        name={icon}
        size={20}
        color={danger ? '#D32F2F' : active ? C.accent : C.muted}
      />
      <Text style={[d.navLabel, active && d.navLabelActive, danger && d.navLabelDanger]}>
        {label}
      </Text>
      {active && <View style={d.activeBar} />}
    </TouchableOpacity>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function VendorLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<string>('index');
  const [businessName, setBusinessName] = useState('Your Business');

  const translateX = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    getSavedUser<{ name?: string }>().then((u) => {
      if (u?.name) setBusinessName(u.name);
    });
  }, []);

  function openDrawer() {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0.45, duration: 260, useNativeDriver: true }),
    ]).start();
  }

  function closeDrawer() {
    Animated.parallel([
      Animated.timing(translateX, { toValue: -DRAWER_W, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  }

  function navigate(route: string) {
    closeDrawer();
    setActiveRoute(route);
    setTimeout(() => {
      if (route === 'index') router.replace('/(vendor)');
      else router.push(`/(vendor)/${route}` as any);
    }, 240);
  }

  async function handleSignOut() {
    closeDrawer();
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await authApi.logout();
          router.replace('/sign-in');
        },
      },
    ]);
  }

  return (
    <DrawerCtx.Provider value={{ openDrawer }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />

        {/* Backdrop */}
        {drawerOpen && (
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#000', opacity: backdropOpacity, zIndex: 10 },
              ]}
            />
          </TouchableWithoutFeedback>
        )}

        {/* Drawer panel */}
        <Animated.View
          style={[
            d.drawer,
            { width: DRAWER_W, transform: [{ translateX }], zIndex: 20 },
          ]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

            {/* Profile header */}
            <View style={d.profileHeader}>
              <View style={d.avatar}>
                <IconSymbol name="storefront.fill" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={d.businessName} numberOfLines={1}>{businessName}</Text>
                <View style={d.vendorBadge}>
                  <Text style={d.vendorBadgeText}>Vendor Account</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeDrawer} activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <IconSymbol name="xmark.circle.fill" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <View style={d.divider} />

            {/* Navigation */}
            <View style={d.navSection}>
              <NavItem
                icon="tray.fill"
                label="Incoming Orders"
                active={activeRoute === 'index'}
                onPress={() => navigate('index')}
              />
              <NavItem
                icon="list.bullet"
                label="My Listings"
                active={activeRoute === 'listings'}
                onPress={() => navigate('listings')}
              />
              <NavItem
                icon="chart.bar.fill"
                label="Earnings"
                active={activeRoute === 'earnings'}
                onPress={() => navigate('earnings')}
              />
            </View>

            <View style={d.divider} />

            <View style={d.navSection}>
              <NavItem
                icon="gearshape.fill"
                label="Settings"
                active={activeRoute === 'settings'}
                onPress={() => navigate('settings')}
              />
            </View>

            <View style={{ flex: 1 }} />

            <View style={[d.navSection, { paddingBottom: 8 }]}>
              <NavItem
                icon="arrow.left"
                label="Sign Out"
                danger
                onPress={handleSignOut}
              />
            </View>

            <Text style={d.version}>4FG Monitor · Vendor Portal</Text>
          </SafeAreaView>
        </Animated.View>
      </View>
    </DrawerCtx.Provider>
  );
}

// ── Drawer styles ─────────────────────────────────────────────────────────────
const d = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  vendorBadge: {
    marginTop: 4,
    backgroundColor: C.accentLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  vendorBadgeText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 8 },

  navSection: { paddingHorizontal: 12, gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
  },
  navItemActive: { backgroundColor: C.accentLight },
  navLabel: { color: C.muted, fontSize: 15, fontWeight: '600', flex: 1 },
  navLabelActive: { color: C.accent, fontWeight: '700' },
  navLabelDanger: { color: '#D32F2F' },
  activeBar: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },

  version: {
    color: C.muted + '80',
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 12,
  },
});
