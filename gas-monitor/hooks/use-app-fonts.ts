import {
  FiraCode_400Regular,
  FiraCode_500Medium,
  FiraCode_700Bold,
} from '@expo-google-fonts/fira-code';
import {
  FiraSans_400Regular,
  FiraSans_500Medium,
  FiraSans_700Bold,
} from '@expo-google-fonts/fira-sans';
import { useFonts } from 'expo-font';

export function useAppFonts() {
  return useFonts({
    FiraCode_400Regular,
    FiraCode_500Medium,
    FiraCode_700Bold,
    FiraSans_400Regular,
    FiraSans_500Medium,
    FiraSans_700Bold,
  });
}
