import { Image } from 'react-native';

/** The 4FGM emblem in white, for the green logo badges on auth and splash screens. */
export function BadgeMark() {
  return (
    <Image
      source={require('@/assets/images/logo-mark-white.png')}
      style={{ width: '82%', height: '82%' }}
      resizeMode="contain"
    />
  );
}
