import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Switch, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSensorReading } from '@/hooks/use-sensor-reading';
import { useDeviceConfig } from '@/hooks/use-device-config';

const C = {
  bg: '#EDF7ED',
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  dim: '#AECAAE',
  muted: '#7A9A7A',
  text: '#1A2E1A',
  textSub: '#3D6B3D',
  red: '#D32F2F',
  green: '#2D7450',
  orange: '#E65100',
  yellow: '#F9A825',
  blue: '#1565C0',
  accent: '#2D7450',
};

const cardShadow = Platform.select({
  ios: { shadowColor: '#1A2E1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 2 },
  default: {},
});

export default function DeviceScreen() {
  // Sensor reading hook for live data
  const { reading, loading, error, fetch, setError } = useSensorReading();

  // Device config hook
  const deviceConfig = useDeviceConfig();

  // Device settings state
  const [autoSync, setAutoSync] = useState(true);
  const [lowAlerts, setLowAlerts] = useState(true);
  const [criticalAlerts, setCriticalAlerts] = useState(true);

  // Configuration mode state
  const [configMode, setConfigMode] = useState<'view' | 'phone' | 'location' | 'minimum' | 'password'>('view');
  const [phoneInput, setPhoneInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [minimumLevelInput, setMinimumLevelInput] = useState('1');
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Fetch sensor reading on mount and periodically if auto-sync enabled
  useEffect(() => {
    fetch();
    deviceConfig.fetchConfig();

    if (autoSync) {
      const interval = setInterval(fetch, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoSync, fetch]);

  const handleSetPhoneNumber = async () => {
    if (!phoneInput.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }
    try {
      const result = await deviceConfig.setPhoneNumber(phoneInput);
      if (result.success) {
        Alert.alert('Success', result.message);
        setPhoneInput('');
        setConfigMode('view');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to set phone number');
    }
  };

  const handleSetLocation = async () => {
    if (!locationInput.trim()) {
      Alert.alert('Error', 'Please enter a location');
      return;
    }
    try {
      const result = await deviceConfig.setLocation(locationInput);
      if (result.success) {
        Alert.alert('Success', result.message);
        setLocationInput('');
        setConfigMode('view');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to set location');
    }
  };

  const handleSetMinimumLevel = async () => {
    const level = parseInt(minimumLevelInput, 10);
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      Alert.alert('Error', 'Minimum level must be between 1 and 9 kg');
      return;
    }
    try {
      const result = await deviceConfig.setMinimumLevel(level);
      if (result.success) {
        Alert.alert('Success', result.message);
        setMinimumLevelInput('1');
        setConfigMode('view');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to set minimum level');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPasswordInput.trim() || !newPasswordInput.trim()) {
      Alert.alert('Error', 'Please enter both passwords');
      return;
    }
    if (newPasswordInput.length > 4 || !/^[a-zA-Z0-9]{1,4}$/.test(newPasswordInput)) {
      Alert.alert('Error', 'New password must be 1-4 alphanumeric characters');
      return;
    }
    try {
      const result = await deviceConfig.changePassword(oldPasswordInput, newPasswordInput);
      if (result.success) {
        Alert.alert('Success', result.message);
        setOldPasswordInput('');
        setNewPasswordInput('');
        setConfigMode('view');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Device</Text>
          <Text style={s.headerSub}>Sensor status and configuration</Text>
        </View>

        {/* Connection Status */}
        <View style={[s.card, { ...cardShadow }]}>
          <View
            style={[
              s.accentBar,
              { backgroundColor: loading ? C.yellow : error ? C.red : C.green },
            ]}
          />
          <View style={s.deviceHero}>
            <View
              style={[
                s.deviceIcon,
                {
                  backgroundColor: (error ? C.red : C.green) + '18',
                  borderColor: (error ? C.red : C.green) + '40',
                },
              ]}
            >
              <Text style={[s.deviceIconText, { color: error ? C.red : C.green }]}>4FG</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.deviceName}>4FG Sensor v2</Text>
              <Text style={s.deviceId}>ID: FG-2024-0047</Text>
              <View style={s.connectedRow}>
                <View style={[s.connDot, { backgroundColor: error ? C.red : C.green }]} />
                <Text style={[s.connText, { color: error ? C.red : C.green }]}>
                  {loading ? 'Querying...' : error ? 'Error' : 'Connected'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Error Display */}
        {error && (
          <View style={[s.card, { backgroundColor: C.red + '1A', borderColor: C.red + '40' }]}>
            <Text style={[s.cardTitle, { color: C.red, paddingHorizontal: 16, paddingTop: 16 }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setError(null);
                fetch();
              }}
              style={{ paddingHorizontal: 16, paddingBottom: 16, marginTop: 8 }}
            >
              <Text style={{ color: C.red, fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Signal + Battery */}
        <View style={s.row}>
          <MetricCard
            label="SIGNAL"
            value="Strong"
            sub="–62 dBm"
            color={C.green}
            abbr="SIG"
          />
          <MetricCard
            label="BATTERY"
            value="84%"
            sub="~14 days left"
            color={C.blue}
            abbr="BAT"
          />
        </View>

        {/* Sensor Readings - NOW LIVE DATA */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Sensor Readings</Text>
            <TouchableOpacity onPress={fetch} disabled={loading}>
              <Text style={[s.liveChip, { opacity: loading ? 0.5 : 1 }]}>
                {loading ? 'UPDATING' : 'LIVE'}
              </Text>
            </TouchableOpacity>
          </View>
          <ReadingRow
            label="Weight Sensor"
            value={reading ? `${reading.weight.toFixed(1)} kg` : loading ? 'Loading...' : '0.0 kg'}
            note={reading ? 'Calibrated' : 'Not available'}
            color={reading ? C.green : C.muted}
          />
          <ReadingRow
            label="Temperature"
            value={
              reading?.temperature ? `${reading.temperature}°C` : loading ? 'Loading...' : '24°C'
            }
            note={reading?.temperature ? 'Normal' : 'Not available'}
            color={reading?.temperature ? C.green : C.muted}
          />
          <ReadingRow
            label="Pressure"
            value={reading?.pressure ? `${reading.pressure} bar` : loading ? 'Loading...' : '0 bar'}
            note={reading?.pressure ? 'Reading' : 'Empty'}
            color={reading?.pressure ? C.green : C.red}
          />
          <ReadingRow
            label="Last Updated"
            value={reading?.timestamp ? new Date(reading.timestamp).toLocaleTimeString() : 'Never'}
            note={reading ? 'Just now' : 'Pending'}
            color={C.muted}
          />
        </View>

        {/* Settings */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Device Settings</Text>
          </View>
          <ToggleRow
            label="Auto-sync"
            sub="Sync readings every 30 seconds"
            value={autoSync}
            onToggle={setAutoSync}
          />
          <ToggleRow
            label="Low Gas Alerts"
            sub="Notify when below 25%"
            value={lowAlerts}
            onToggle={setLowAlerts}
          />
          <ToggleRow
            label="Critical Alerts"
            sub="Notify when below 10%"
            value={criticalAlerts}
            onToggle={setCriticalAlerts}
            isLast
          />
        </View>

        {/* Device Configuration */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Device Configuration</Text>
          </View>

          {configMode === 'view' ? (
            <>
              <ConfigRowButton
                label="Phone Number"
                value={deviceConfig.config.phoneNumber || 'Not set'}
                onPress={() => {
                  setPhoneInput(deviceConfig.config.phoneNumber || '');
                  setConfigMode('phone');
                }}
              />
              <ConfigRowButton
                label="Location"
                value={deviceConfig.config.location || 'Default (Owerri)'}
                onPress={() => {
                  setLocationInput(deviceConfig.config.location || '');
                  setConfigMode('location');
                }}
              />
              <ConfigRowButton
                label="Minimum Alert Level"
                value={`${deviceConfig.config.minimumLevel || 1} kg`}
                onPress={() => {
                  setMinimumLevelInput(String(deviceConfig.config.minimumLevel || 1));
                  setConfigMode('minimum');
                }}
              />
              <ConfigRowButton
                label="Change Password"
                value="Reset device password"
                onPress={() => {
                  setOldPasswordInput('');
                  setNewPasswordInput('');
                  setConfigMode('password');
                }}
                isLast
              />
            </>
          ) : configMode === 'phone' ? (
            <ConfigFormSection title="Set Phone Number">
              <Text style={s.configHint}>Phone number for device notifications (local format, e.g. 08000000000)</Text>
              <TextInput
                style={s.input}
                placeholder="08000000000"
                placeholderTextColor={C.muted}
                value={phoneInput}
                onChangeText={setPhoneInput}
                keyboardType="phone-pad"
                editable={!deviceConfig.loading}
              />
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setConfigMode('view')}>
                  <Text style={s.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 1 }, deviceConfig.loading && { opacity: 0.6 }]}
                  onPress={handleSetPhoneNumber}
                  disabled={deviceConfig.loading}
                >
                  {deviceConfig.loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ConfigFormSection>
          ) : configMode === 'location' ? (
            <ConfigFormSection title="Set Device Location">
              <Text style={s.configHint}>Set the location where your gas monitor is installed</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Main Store, Warehouse A"
                placeholderTextColor={C.muted}
                value={locationInput}
                onChangeText={setLocationInput}
                editable={!deviceConfig.loading}
              />
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setConfigMode('view')}>
                  <Text style={s.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 1 }, deviceConfig.loading && { opacity: 0.6 }]}
                  onPress={handleSetLocation}
                  disabled={deviceConfig.loading}
                >
                  {deviceConfig.loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ConfigFormSection>
          ) : configMode === 'minimum' ? (
            <ConfigFormSection title="Set Minimum Alert Level">
              <Text style={s.configHint}>Critical gas level threshold (1-9 kg, integer only)</Text>
              <TextInput
                style={s.input}
                placeholder="1"
                placeholderTextColor={C.muted}
                value={minimumLevelInput}
                onChangeText={setMinimumLevelInput}
                keyboardType="number-pad"
                editable={!deviceConfig.loading}
              />
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setConfigMode('view')}>
                  <Text style={s.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 1 }, deviceConfig.loading && { opacity: 0.6 }]}
                  onPress={handleSetMinimumLevel}
                  disabled={deviceConfig.loading}
                >
                  {deviceConfig.loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ConfigFormSection>
          ) : configMode === 'password' ? (
            <ConfigFormSection title="Change Device Password">
              <Text style={s.configHint}>Update your device password (1-4 alphanumeric characters)</Text>
              <TextInput
                style={s.input}
                placeholder="Current password"
                placeholderTextColor={C.muted}
                value={oldPasswordInput}
                onChangeText={setOldPasswordInput}
                secureTextEntry
                editable={!deviceConfig.loading}
              />
              <TextInput
                style={[s.input, { marginTop: 10 }]}
                placeholder="New password"
                placeholderTextColor={C.muted}
                value={newPasswordInput}
                onChangeText={setNewPasswordInput}
                secureTextEntry
                editable={!deviceConfig.loading}
              />
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setConfigMode('view')}>
                  <Text style={s.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 1 }, deviceConfig.loading && { opacity: 0.6 }]}
                  onPress={handleChangePassword}
                  disabled={deviceConfig.loading}
                >
                  {deviceConfig.loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ConfigFormSection>
          ) : null}

          {deviceConfig.error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{deviceConfig.error}</Text>
              <TouchableOpacity onPress={deviceConfig.clearError}>
                <Text style={s.errorDismiss}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Calibration Section */}
        <View style={[s.card, { ...cardShadow }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Scale Calibration</Text>
          </View>
          <TouchableOpacity
            style={[s.calibrateBtn, deviceConfig.loading && { opacity: 0.6 }]}
            onPress={async () => {
              try {
                const result = await deviceConfig.setMinimumLevel(deviceConfig.config.minimumLevel || 1);
                Alert.alert('Calibration', result.message);
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Calibration failed');
              }
            }}
            disabled={deviceConfig.loading}
          >
            {deviceConfig.loading ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <>
                <Text style={s.calibrateBtnText}>Calibrate Scale (TARE)</Text>
                <Text style={s.calibrateBtnSub}>Zero the scale for accurate measurements</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ abbr, label, value, sub, color }: {
  abbr: string; label: string; value: string; sub: string; color: string;
}) {
  return (
    <View style={[s.card, s.metricCard, { borderColor: color + '40', ...cardShadow }]}>
      <View style={[s.metricIcon, { backgroundColor: color + '18' }]}>
        <Text style={[s.metricIconText, { color }]}>{abbr}</Text>
      </View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricSub}>{sub}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function ReadingRow({ label, value, note, color }: {
  label: string; value: string; note: string; color: string;
}) {
  return (
    <View style={s.readingRow}>
      <Text style={s.readingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.readingNote, { color }]}>{note}</Text>
        <Text style={s.readingValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToggleRow({ label, sub, value, onToggle, isLast }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void; isLast?: boolean;
}) {
  return (
    <View style={[s.toggleRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: C.border, true: C.accent + 'AA' }}
        thumbColor={value ? C.accent : C.muted}
      />
    </View>
  );
}

function ConfigRowButton({ label, value, onPress, isLast }: {
  label: string; value: string; onPress: () => void; isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.configRow, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.configLabel}>{label}</Text>
        <Text style={s.configValue}>{value}</Text>
      </View>
      <Text style={s.configArrow}>›</Text>
    </TouchableOpacity>
  );
}

function ConfigFormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.configForm}>
      <Text style={s.configFormTitle}>{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { paddingVertical: 8, paddingHorizontal: 2, marginBottom: 4 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: C.muted, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  accentBar: { height: 3 },
  deviceHero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  deviceIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceIconText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  deviceName: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 2 },
  deviceId: { color: C.muted, fontSize: 12, marginBottom: 8 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  connText: { fontSize: 13, fontWeight: '600' },

  row: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, padding: 16, gap: 3 },
  metricIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  metricIconText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  metricValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  metricSub: { color: C.muted, fontSize: 12 },
  metricLabel: { color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 4 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  liveChip: {
    color: C.green,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    backgroundColor: C.green + '1A',
    borderWidth: 1,
    borderColor: C.green + '40',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  readingLabel: { color: C.muted, fontSize: 13 },
  readingValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  readingNote: { fontSize: 11, fontWeight: '500' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 12,
  },
  toggleLabel: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  toggleSub: { color: C.muted, fontSize: 12 },

  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  configLabel: { color: C.muted, fontSize: 13, marginBottom: 4 },
  configValue: { color: C.text, fontSize: 15, fontWeight: '600' },
  configArrow: { color: C.accent, fontSize: 24, fontWeight: '300' },

  configForm: {
    padding: 16,
    gap: 12,
  },
  configFormTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  configHint: { color: C.muted, fontSize: 12, marginBottom: 12, lineHeight: 16 },

  input: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: C.text,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },

  errorBox: {
    backgroundColor: C.red + '1A',
    borderColor: C.red + '40',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: C.red, fontSize: 13, flex: 1, fontWeight: '500' },
  errorDismiss: { color: C.red, fontSize: 13, fontWeight: '600', marginLeft: 8 },

  calibrateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  calibrateBtnText: { color: C.accent, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  calibrateBtnSub: { color: C.muted, fontSize: 12 },
});
