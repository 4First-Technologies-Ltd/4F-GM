import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1E293B',
    background: '#F1F5F9',
    tint: '#0F172A',
    icon: '#64748B',
    tabIconDefault: '#64748B',
    tabIconSelected: '#0F172A',
    card: '#FFFFFF',
    border: '#E2E8F0',
    muted: '#94A3B8',
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    tint: '#22C55E',
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#22C55E',
    card: '#1B2336',
    border: '#475569',
    muted: '#94A3B8',
  },
};

export const StatusColors = {
  safe: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  unknown: '#94A3B8',
} as const;

export type SensorStatus = keyof typeof StatusColors;

export const Fonts = Platform.select({
  ios: {
    sans: 'FiraSans_400Regular',
    sansMedium: 'FiraSans_500Medium',
    sansBold: 'FiraSans_700Bold',
    mono: 'FiraCode_400Regular',
    monoBold: 'FiraCode_700Bold',
    rounded: 'ui-rounded',
  },
  default: {
    sans: 'FiraSans_400Regular',
    sansMedium: 'FiraSans_500Medium',
    sansBold: 'FiraSans_700Bold',
    mono: 'FiraCode_400Regular',
    monoBold: 'FiraCode_700Bold',
    rounded: 'normal',
  },
  web: {
    sans: "'Fira Sans', system-ui, sans-serif",
    sansMedium: "'Fira Sans', system-ui, sans-serif",
    sansBold: "'Fira Sans', system-ui, sans-serif",
    mono: "'Fira Code', monospace",
    monoBold: "'Fira Code', monospace",
    rounded: "'SF Pro Rounded', sans-serif",
  },
});
