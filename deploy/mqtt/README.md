# MQTT broker for 4FG devices

Mosquitto with the `mosquitto-go-auth` plugin. Every connection and every topic access is checked against the 4FG API (`/internal/mqtt/<token>/…`), so **the database is the single list of who may connect**. Revoking a device in the database cuts it off at the broker.

**Status:** built and tested locally against a real Mosquitto over TLS. **Not deployed.** Nothing in this folder touches your VPS until you run the steps below.

## What was verified locally (2 to 3 Nov 2026)

Against `iegomez/mosquitto-go-auth` (Mosquitto 2.0.15), TLS, the real API and a real Postgres:

- A device connects only with its own secret. A wrong secret, an unknown device, an anonymous client and a wrong service password are all refused.
- A client that does not trust the certificate refuses to connect (validation is on; there is no skip switch).
- A device cannot publish into another device's topics (the message never arrives) and cannot subscribe to another device's commands.
- A device using another device's client id does **not** knock that device off (`use_username_as_clientid`).
- The ingest worker, a simulated device, the command round trip and the contract checks (`npm run sim:check`) all pass through it.
- Revoking a connected device: readings stop within the 30 s cache window (the worker's own check drops the few that slip through); a new connection is refused.

## Run it locally

```bash
sh deploy/mqtt/gen-dev-cert.sh                     # self-signed cert for 127.0.0.1 (30 days)
# 1. a scratch Postgres with the migrations applied (see tools/device-simulator/README.md)
# 2. the API, with broker auth on:
cd gas-monitor-backend
MQTT_AUTH_TOKEN=devtoken123 MQTT_SERVICE_PASS=devsvc npm run sim:api
# 3. the broker (reaches the API through host.docker.internal):
cd ../deploy/mqtt && MQTT_AUTH_TOKEN=devtoken123 docker compose -f docker-compose.dev.yml up
# 4. clients trust the dev certificate:
export MQTT_URL=mqtts://127.0.0.1:8883 MQTT_CA_FILE=$PWD/certs-dev/server.crt MQTT_SERVICE_PASS=devsvc
```

Create devices with `npm run device:provision`, then give each simulated device its secret with `--password`.

## Deploying to the VPS (for you to run)

Work on a branch of `/opt/4fg`. Everything below is additive and can be rolled back by removing the two services.

### 1. DNS, firewall

- DNS: an `A` record `mqtt.4fgmonitor.com` pointing at the VPS. **DNS only** (grey cloud): a proxy would break MQTT.
- Firewall: `sudo ufw allow 8883/tcp`. Do **not** open 1883; there is no plain-text listener.

### 2. Certificate

Caddy already runs there. Add a site so it obtains a real certificate for the new name, and block the internal routes on the public API:

```caddyfile
mqtt.4fgmonitor.com {
    respond "MQTT broker" 404
}

ugo.4fgmonitor.com {
    @internal path /internal/*
    respond @internal 404          # the broker reaches these over the Docker network, never publicly
    # …your existing config…
}
```

The broker reads `server.crt` and `server.key` from `/opt/4fg/mqtt/certs/`. Copy Caddy's certificate there (path inside the Caddy data volume: `…/certificates/acme-v02.api.letsencrypt.org-directory/mqtt.4fgmonitor.com/mqtt.4fgmonitor.com.crt` and `.key`), and repeat after each renewal (about every 60 days) with a cron job that copies the files and runs `docker compose restart mqtt`. Devices reconnect by themselves with backoff. (Whether a `SIGHUP` alone reloads certificates on this Mosquitto version is untested here; restarting is the safe choice.) `certbot --standalone` is an alternative if you prefer not to reach into Caddy's volume.

### 3. Secrets (`/opt/4fg/.env`)

Generate and add these. **Delete lines, do not leave them blank** (the app reads some with `??`):

```
MQTT_AUTH_TOKEN=<40+ random letters/digits, e.g. openssl rand -hex 24>
MQTT_SERVICE_USER=service
MQTT_SERVICE_PASS=<32+ random characters>
MQTT_URL=mqtts://mqtt.4fgmonitor.com:8883
```

`MQTT_AUTH_TOKEN` is in a URL path, so it must be letters, digits, `-`, `_` only (`start.sh` refuses anything else). With the token unset the API's `/internal/mqtt` routes do not exist (404).

### 4. `docker-compose.yml`

```yaml
  mqtt:
    image: iegomez/mosquitto-go-auth:latest      # PIN a digest before production, see caveats
    restart: unless-stopped
    ports: ["8883:8883"]
    environment:
      API_HOST: api
      API_PORT: "3000"                           # the PORT your api container listens on (see .env)
      MQTT_AUTH_TOKEN: ${MQTT_AUTH_TOKEN}
    volumes:
      - ./repo/deploy/mqtt/mosquitto.conf.template:/mosquitto-template/mosquitto.conf:ro
      - ./repo/deploy/mqtt/start.sh:/start.sh:ro
      - ./mqtt/certs:/mosquitto/certs:ro
      - ./mqtt/data:/mosquitto/data
    command: ["sh", "/start.sh"]
    depends_on: [api]
    networks:
      default:
        aliases: [mqtt.4fgmonitor.com]           # so api and ingest reach it by the name on the certificate

  ingest:
    build: ./repo/gas-monitor-backend
    command: node dist/workers/ingest.js
    restart: unless-stopped
    env_file: .env
    depends_on: [db, mqtt]
```

Also pass `MQTT_URL`, `MQTT_SERVICE_USER`, `MQTT_SERVICE_PASS`, `MQTT_AUTH_TOKEN` to the `api` service (it publishes commands and answers the broker). Deploy order: `git pull` in `repo/`, `docker compose build api ingest`, `docker compose up -d api` (this applies the device migration), then `up -d mqtt ingest`.

### 5. Check it

```bash
openssl s_client -connect mqtt.4fgmonitor.com:8883 -servername mqtt.4fgmonitor.com </dev/null | grep -i "verify return\|subject"
docker compose logs --tail 30 mqtt ingest
```

Then provision one device (`npm run device:provision -- --id FG-TEST-0001 --confirm`, run where `DATABASE_URL` points at the VPS database; it prints the target first) and connect the simulator with its secret.

## Things to know before production

- **The plugin image is old.** The latest `iegomez/mosquitto-go-auth` tag was built in May 2023 and contains Mosquitto 2.0.15. Pin it by digest, check Mosquitto's security advisories, and consider building the plugin against a current Mosquitto. It also runs as root inside the container.
- **A refused publish is dropped silently.** Mosquitto does not disconnect a client that publishes to a forbidden topic (the dev broker does). A forbidden subscribe returns failure code 0x80. Firmware must not rely on being disconnected.
- **Cache window.** Allow/deny answers are cached 30 s. A revoked device that is already connected can still get a message through for up to 30 s (the ingest worker drops it as `revoked`). A *denial* is cached too, so after fixing a credential, wait 30 s or restart the broker.
- **Failure of the API means no new connections.** Cached answers keep connected devices working for 30 s; after that the broker denies. Keep the API healthy; the broker restarts fine without the API but then nothing authenticates until it is back.
- **Service clients need their own user name** (`service.ingest`, `service.api-<pid>`, `service.cli-…`) because the broker forces client id = user name. The code already does this; any new service client must too.
- **State to back up:** `/opt/4fg/mqtt/data` (queued commands and retained messages). The database stays the source of truth for config: the ingest worker re-publishes every device's config when it starts.
- **Capacity:** fine for a pilot of hundreds of devices on the 2 vCore / 4 GB VPS. Authentication is one API call per device connect; a regional outage that reconnects thousands at once is absorbed by device backoff plus the cache.
- **Scaling later:** a second broker, clustering or a managed broker would be a separate project; the topic and auth design carry over unchanged.
