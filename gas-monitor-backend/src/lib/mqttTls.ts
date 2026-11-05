import fs from 'fs';

/**
 * Extra TLS options for MQTT clients. Production uses a publicly trusted
 * certificate, so nothing is needed. For a private CA or the local dev
 * certificate, set MQTT_CA_FILE to the PEM file to trust. Certificate
 * validation stays ON either way; there is intentionally no "skip verification" switch.
 */
export function mqttTlsOptions(): { ca?: Buffer } {
  const file = process.env.MQTT_CA_FILE;
  return file ? { ca: fs.readFileSync(file) } : {};
}
