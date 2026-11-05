#!/bin/sh
# Self-signed certificate for the LOCAL dev broker only (valid 30 days, localhost / 127.0.0.1).
# Point clients at it with MQTT_CA_FILE=deploy/mqtt/certs-dev/server.crt
# Production uses a real certificate for mqtt.4fgmonitor.com; see README.md.
set -eu
export MSYS_NO_PATHCONV=1   # Git Bash on Windows would otherwise rewrite the /CN=... argument
cd "$(dirname "$0")"
mkdir -p certs-dev
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout certs-dev/server.key -out certs-dev/server.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
chmod 644 certs-dev/server.key certs-dev/server.crt
echo "wrote certs-dev/server.crt and server.key"
