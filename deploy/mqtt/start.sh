#!/bin/sh
# Container entry command: build the real config from the template, then run Mosquitto.
# Required environment: API_HOST, API_PORT, MQTT_AUTH_TOKEN.
set -eu

for v in API_HOST API_PORT MQTT_AUTH_TOKEN; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || { echo "start.sh: $v is not set" >&2; exit 1; }
done

# The token goes into a URL path, so it must be URL-safe (letters, digits, - and _ only).
case "$MQTT_AUTH_TOKEN" in
  *[!A-Za-z0-9_-]*) echo "start.sh: MQTT_AUTH_TOKEN may only contain letters, digits, - and _" >&2; exit 1 ;;
esac

mkdir -p /mosquitto/data /etc/mosquitto
sed -e "s|__API_HOST__|$API_HOST|g" \
    -e "s|__API_PORT__|$API_PORT|g" \
    -e "s|__TOKEN__|$MQTT_AUTH_TOKEN|g" \
    /mosquitto-template/mosquitto.conf > /etc/mosquitto/mosquitto.conf

exec /usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf
