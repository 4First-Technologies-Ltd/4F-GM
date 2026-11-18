import React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { openBrowserAsync } from 'expo-web-browser';

// Testers file and follow their reports on the website (invite-only sign-in).
const REPORT_URL = 'https://4fgmonitor.com/testers/report';

/** Open the tester bug form with this phone's details already filled in. */
export async function openBugReport() {
  const params = new URLSearchParams();
  if (Device.modelName) params.set('model', Device.modelName);
  if (Platform.OS === 'android' && Device.osVersion) params.set('android', Device.osVersion);
  const version = Constants.expoConfig?.version;
  if (version) params.set('app', version);
  try {
    await openBrowserAsync(`${REPORT_URL}?${params.toString()}`);
  } catch {
    Alert.alert('Could not open the bug form', 'Please try again, or open 4fgmonitor.com/testers in your browser.');
  }
}

export function ReportBugLink() {
  return (
    <TouchableOpacity style={s.link} activeOpacity={0.7} onPress={openBugReport} accessibilityRole="link">
      <Text style={s.text}>Report a bug</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  link: { alignItems: 'center', paddingVertical: 14 },
  text: { color: '#2D7450', fontSize: 13, fontWeight: '600' },
});
