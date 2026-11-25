import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { IconSymbol } from '@/components/ui/icon-symbol';

const C = { accent: '#2D7450', accentLight: '#E8F5E8' };

/** "12 Allen Avenue, Ikeja, Lagos": the parts the phone knows, without repeats. */
export function formatPlace(p: Location.LocationGeocodedAddress): string {
  const street = [p.streetNumber, p.street].filter(Boolean).join(' ') || p.name || '';
  const parts = [street, p.district, p.city ?? p.subregion, p.region].filter((x): x is string => !!x && x.trim().length > 0);
  return parts.filter((x, i) => parts.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(', ');
}

/** Reads the phone's position and turns it into a street address. Null if it could not. */
export async function currentAddress(): Promise<{ address: string; lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Location is off', 'Allow location access to fill in your address, or type it in.');
    return null;
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude: lat, longitude: lng } = pos.coords;
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const address = place ? formatPlace(place) : '';
    if (!address) {
      Alert.alert('Address not found', "We couldn't work out the address here. Please type it in.");
      return null;
    }
    return { address, lat, lng };
  } catch {
    Alert.alert('Location unavailable', "We couldn't get your location. Please try again or type the address.");
    return null;
  }
}

/**
 * "Use my location" for any address form: fills the field with the address the
 * phone is at. The customer can still edit it (add a flat number, landmark).
 */
export function UseMyLocationButton({ onAddress }: { onAddress: (address: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const found = await currentAddress();
      if (found) onAddress(found.address);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      style={s.btn}
      onPress={run}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Use my current location for the address"
    >
      {busy ? <ActivityIndicator size="small" color={C.accent} /> : <IconSymbol name="location.fill" size={15} color={C.accent} />}
      <Text style={s.text}>{busy ? 'Finding your address…' : 'Use my location'}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    backgroundColor: C.accentLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8,
  },
  text: { color: C.accent, fontSize: 13, fontWeight: '700' },
});
