// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'bell.fill': 'notifications',
  'clock.fill': 'history',
  'clock': 'access-time',
  'gearshape.fill': 'settings',
  'wifi': 'wifi',
  'arrow.clockwise': 'refresh',
  'arrow.right': 'arrow-forward',
  'arrow.left': 'arrow-back',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.circle': 'check-circle-outline',
  'flame.fill': 'local-fire-department',
  'lightbulb.fill': 'lightbulb',
  'chart.line.uptrend.xyaxis': 'trending-up',
  'chart.bar.fill': 'bar-chart',
  'location.fill': 'location-on',
  'xmark.circle.fill': 'cancel',
  'plus': 'add',
  'minus': 'remove',
  'thermometer.medium': 'thermostat',
  'shield.fill': 'security',
  'person.fill': 'person',
  'envelope.fill': 'email',
  'lock.fill': 'lock',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
