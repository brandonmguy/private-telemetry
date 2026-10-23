# Lens Telemetry Viewer

A local receiver and browser UI for HP Poly device telemetry. Use it as a lab/sample
to explore secondary telemetry feeds and collect evidence for EU Data Act validation.
The viewer, APIs, and clear-data endpoint intentionally have no authentication.

## Choose your startup method

| Method | Install first | Initial setup | Normal startup |
|---|---|---|---|
| Docker | Docker Engine/Desktop with Compose v2, Linux containers | Download or clone this repo | `docker compose up -d` |
| Node/npm | Node.js **24.x**, including npm | `npm run setup` | `npm start` |

Run commands from the repository root. Docker and npm use the same application and
features, but use separate databases by default. No Visual Studio project is required.

## Option A: Docker

```sh
docker compose up -d
docker compose ps
```

The first start builds the frontend and installs server dependencies inside the image.
Open **http://localhost:3000**. The HTTP sample receiver is **http://localhost:3001**.
Both host ports are bound to localhost by default.

Send 18 synthetic messages from inside the container (no host Node installation needed):

```sh
docker compose exec collector node scripts/test-send.js
```

These are demonstration messages, not a complete representation of actual device data.

Useful commands:

```sh
docker compose logs -f
docker compose down
# After changing source code:
docker compose up -d --build
```

`down` preserves the SQLite named volume. Restarting or replacing the container
also preserves it. **`docker compose down --volumes` deletes that volume and its data.**
The restart policy restarts an exited process; an unhealthy status alone does not
automatically restart a running container.

### Optional settings

Copy `.env.example` to `.env` and edit only what you need. On PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux: `cp .env.example .env`.

- `API_PORT`: host viewer port (default 3000).
- `HTTP_RECV_PORT`: host HTTP receiver port (default 3001).
- `UI_BIND`: viewer binding (default 127.0.0.1).
- `RECEIVER_BIND`: HTTP receiver binding (default 127.0.0.1).
- `HTTPS_BIND` / `HTTPS_PORT`: optional gateway binding (default 0.0.0.0:443).

The container always uses ports 3000/3001 internally and `/data/telemetry.db`.
Native-only variables such as `DB_PATH`, `API_HOST`, and `RECV_HOST` do not
override these container settings.

## Option B: Node/npm

Use Node 24.x; older README guidance suggesting Node 18 was incompatible with the
server's built-in `node:sqlite` dependency.

```sh
npm run setup
npm start
```

Setup installs locked dependencies and builds the React UI into `client/dist`.
Open **http://localhost:3000**. Start again later with just `npm start`.
After pulling dependency/frontend changes, rerun `npm run setup`.

In another terminal:

```sh
npm run test-send
# Or target another HTTP lab receiver:
npm run test-send -- 192.168.1.100 3001
```

`npm start` and `npm run dev:server` load an optional root `.env` file.
Native settings:

| Variable | Default | Meaning |
|---|---|---|
| API_HOST | 127.0.0.1 | Viewer/API interface |
| RECV_HOST | 127.0.0.1 | HTTP receiver interface; set a LAN IP or 0.0.0.0 for direct LAN tests |
| API_PORT | 3000 | Viewer/API port |
| RECV_PORT | 3001 | HTTP receiver port |
| DB_PATH | server/telemetry.db | Database; relative overrides resolve from the working directory |
| TRUST_PROXY | unset | Comma-separated trusted reverse-proxy IPs/subnets, or Express names such as loopback |

The viewer and receiver must use different ports. Database parent directories are
created automatically. No forwarded sender address is trusted by default.

For development, run `npm run dev:server` and `npm run dev:client` in separate terminals.
Vite opens at http://localhost:5173 and proxies API calls to port 3000; adjust
`client/vite.config.js` if you change the native API port.

## HTTPS for real devices

HP's [secondary telemetry instructions](https://info.lens.poly.com/docs/Compliance/EU%20Data/shared-device-tel-setup)
specify an HTTPS connection, a reachable local server, and no proxy support on the
device. The gateway below terminates TLS at that local server; the device connects
directly to it.

1. Choose a LAN IP/DNS name reachable from the devices.
2. Obtain a PEM server certificate and private key. The certificate's Subject
   Alternative Name must match that endpoint, and the issuing chain must be trusted
   by your device/firmware. Use the full certificate chain where applicable.
3. Put the files at `certs/server.crt` and `certs/server.key`.
   Certificates, private keys, and local settings are excluded from Git and image builds.
4. Start the HTTPS configuration:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d
```

5. Allow inbound TCP 443 on the lab host as appropriate. Keep port 3000 local unless
   you deliberately want remote viewer access.
6. In Poly Lens, open **Manage > Inventory > device > Settings > Servers >
   Device Telemetry > Secondary Telemetry**, enable the feed, and enter the
   collector's LAN IP/FQDN and port (for example `telemetry.lab.example:443`).
   Device Provisioning must be enabled. Apply; HP documents overnight activation
   or activation after a device reboot.
7. Trigger a known device action, then check the viewer and gateway logs.

The provided Caddy gateway forwards only to the telemetry receiver, not to the
viewer/API. HTTP remains localhost-only unless you change its binding. The internal
TLS network uses `172.30.77.0/24` and trusts only gateway address `172.30.77.3`.
If that subnet conflicts with your environment, change both static addresses, the
subnet, and `TRUST_PROXY` together.

Use the same two `-f` arguments for subsequent logs, status, updates, and shutdown.
For example:

```sh
docker compose -f compose.yaml -f compose.https.yaml logs -f collector gateway
docker compose -f compose.yaml -f compose.https.yaml down
```

The app can also run natively behind an existing TLS reverse proxy. Forward HTTPS
requests to its HTTP receiver and set `TRUST_PROXY` to the actual proxy address if
sender IP attribution is needed. A self-signed test certificate does not prove
compatibility with physical devices.

## Viewing and exporting evidence

The UI supports source/event filters, search, message type, received-date range,
sorting, pagination, raw payload inspection, and five-second refresh.

**Export JSON** and **Export NDJSON** include all matching messages across pages,
using the active filters and sort order. Exports contain:
- A manifest: schema/app version, export time, filters, order, record count, and dictionary link.
- Each stored message: received time, device event time where present, sender IP,
  extracted fields, and the complete parsed JSON payload.

JSON uses `{ manifest, messages }`. NDJSON starts with a `kind: manifest` record,
then one `kind: message` record per message. Export timestamps are UTC.
Payloads preserve parsed JSON values, **not original wire bytes**, whitespace, or HTTP
headers. Exports are assembled in memory for lab-sized collections; filter large
collections into smaller date ranges.

Use [the validation record template](docs/validation-record.md) for device model,
firmware, expected data inventory, test actions, observed events, and gaps.
The app collects evidence; it does not determine legal compliance or establish that
the feed includes all data available to a data holder. Keep completed records and
exports outside source control.

### Device identification

New messages prefer stable identifiers in this order:

1. Top-level `deviceId` / `deviceid`.
2. `payload.value.eventData.lensDeviceId` / `deviceId`.
3. `payload.deviceId`.
4. Top-level `source`, then `payload.value.eventData.source`.
5. Top-level `appName`, then sender IP.

A source without a stable device ID is a fallback grouping, not verified identity.
Existing stored rows are preserved with their previous extracted source values.

## API reference

The receiver accepts a JSON object posted to any path on port 3001. Successful
inserts return `{ "ok": true }`. Malformed JSON/arrays return 400; non-JSON
content returns 415; payloads over 10 MB return 413. Unknown fields are retained.

| Method and endpoint | Purpose |
|---|---|
| GET /api/health | Process/database readiness and app version |
| GET /api/messages | Paginated message summaries |
| GET /api/messages/:id | Full stored message and parsed payload |
| GET /api/sources | Source counts |
| GET /api/event-types | Event-name counts |
| GET /api/stats | Total, last24h, sources, eventTypes |
| GET /api/export | Filtered evidence download |
| DELETE /api/messages | Clear **all** stored messages; lab reset |

Message list and export filters: `source`, `name`, `event_type`, `msg_type`,
`search`, `from`, `to`. Dates filter **received time** and must be ISO timestamps
including a timezone. Both bounds are inclusive. `sort` accepts received_at,
source_ip, frame_id, name, event_type, event_time, msg_type, or source; `dir`
accepts asc/desc. The message list additionally accepts `page` (default 1) and
`pageSize` (default 50, maximum 1000). Export accepts `format=json|ndjson`.

## Backups and reset

SQLite uses WAL journaling. Use the included online backup command instead of
copying a live database file without its journal.

Native:

```sh
npm run backup
# Or choose a new destination:
npm run backup -- backups/my-test.db
```

Docker:

```sh
docker compose exec collector node scripts/backup.js /data/backups/my-test.db
docker compose cp collector:/data/backups/my-test.db ./my-test.db
```

Existing destination files are never overwritten. For restore, stop the app first.
Move the current database and any matching `-wal` / `-shm` files aside, then put the
backup at the configured database path. For Docker, use `docker compose cp` with the
stopped collector and ensure the restored file is writable by its `node` user.
Restart and verify counts. Back up first if the collection matters.

The UI's **Clear** button requires confirmation and clears all messages regardless
of active filters. It preserves the database schema.

## Tests and automation

```sh
npm run setup
npm test
# With Docker installed:
node scripts/docker-smoke.js
```

Integration tests use a temporary database and check ingestion, sender attribution,
invalid inputs, date statistics, exports, online backups, restart persistence, and
reset. The Docker smoke test creates a unique disposable Compose project, checks
the built UI and exports, replaces the container, verifies persistence, and removes
only its own test project and volume.

GitHub Actions:
- Every push/PR builds and tests the npm workflow on Windows and Linux.
- A Linux job builds the image and tests Compose persistence plus HTTPS delivery
  using a disposable localhost certificate.
- Publishing a GitHub Release first runs verification, then publishes Linux
  amd64/arm64 images to `ghcr.io/<owner>/<repo>:<release-tag>`.
  It uses the workflow's temporary `GITHUB_TOKEN`; no personal token is required.

Image publication needs GitHub Actions enabled and package-write permission.
A newly created GHCR package may need its visibility changed to public before
anonymous users can pull it. No image exists just because these files are present.

After a release image is available, set `TELEMETRY_IMAGE` in `.env` to its exact tag, then:

```sh
docker compose pull collector
docker compose up -d --no-build
```

Use the HTTPS override arguments too when running the gateway. Upgrade deliberately
between versioned releases so a validation run stays on a known version.
