# Lens Telemetry Viewer

A lightweight local telemetry receiver and browser UI for Poly Lens device messages.

## Architecture

```
Devices  →  POST :3001  →  Express Receiver  →  SQLite DB
                                                      ↓
Browser  ←  GET  :3000  ←  Express API + Static UI  ←┘
```

Single Node process runs both the inbound receiver (port 3001) and the UI+API (port 3000).

## Quick Start

### Prerequisites
- Node.js 18+

### 1. Install and build

```bash
cd lens-telemetry
npm run install:all   # installs server + client deps
npm run build         # builds the React frontend into server/dist
```

### 2. Start

```bash
npm start
```

- **Receiver**: `http://0.0.0.0:3001` — POST JSON here from devices
- **UI**: `http://localhost:3000` — open in browser

### 3. Send test messages

```bash
npm run test-send
# or point at a specific host:
node scripts/test-send.js 192.168.1.100 3001
```

## Configuration

Environment variables (all optional):

| Variable   | Default          | Description                   |
|------------|------------------|-------------------------------|
| RECV_PORT  | 3001             | Inbound telemetry port        |
| API_PORT   | 3000             | UI + REST API port            |
| DB_PATH    | server/telemetry.db | SQLite database path       |

Example:
```bash
RECV_PORT=8080 API_PORT=8000 npm start
```

## Receiver API

The receiver accepts **any POST** to any path on port 3001:

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{"frameId":"abc123","name":"DeviceInfo.primaryDeviceInfo","type":"telemetry",...}'
```

Returns: `{ "ok": true }` on success.

## REST API (port 3000)

| Endpoint              | Description                              |
|-----------------------|------------------------------------------|
| GET /api/messages     | Paginated message list (see params below)|
| GET /api/messages/:id | Single message with full JSON payload    |
| GET /api/sources      | Distinct sources with counts             |
| GET /api/event-types  | Distinct event names with counts         |
| GET /api/stats        | Summary stats (total, last24h, etc.)     |
| DELETE /api/messages  | Clear all messages (lab use)             |

### /api/messages query params

| Param      | Example             | Description                        |
|------------|---------------------|------------------------------------|
| page       | 1                   | Page number (default: 1)           |
| pageSize   | 50                  | Rows per page (default: 50)        |
| source     | PolyStudio-X50-Lab1 | Filter by source (exact)           |
| name       | DeviceInfo.cdrInfo  | Filter by event name (exact)       |
| msg_type   | telemetry           | Filter by message type             |
| search     | abc123              | Full-text search across all fields |
| from       | 2024-01-01T00:00:00Z| Received-at range start            |
| to         | 2024-01-02T00:00:00Z| Received-at range end              |
| sort       | received_at         | Column to sort by                  |
| dir        | desc                | Sort direction: asc or desc        |

## Source Field Extraction

The `source` identifier is extracted from incoming messages using this priority:

1. `body.source`
2. `body.payload.value.eventData.source`
3. `body.payload.value.eventData.lensDeviceId`
4. `body.appName`
5. `body.name` (event type)
6. Sender IP address (fallback)

If your devices send a consistent field for device identity, it will be picked up automatically.

## UI Features

- **Sidebar** — group and filter by Source or Event Name, with counts
- **Table** — sortable columns: received time, source, event name, type, event time, frame ID, source IP
- **Search** — full-text search across all stored fields
- **Type filter** — telemetry / request / response
- **Date range** — filter by received time
- **Detail panel** — click any row to see full JSON with collapsible tree viewer
- **Live mode** — auto-refreshes every 5s (toggle on/off)
- **Pagination** — 25/50/100/200 per page
- **Clear** — one-button database wipe for lab iteration

## Development

Run server and client separately with hot-reload:

```bash
# Terminal 1 — server with watch mode
npm run dev:server

# Terminal 2 — Vite dev server (proxies /api to :3000)
npm run dev:client
# Open http://localhost:5173
```

## Database

SQLite file at `server/telemetry.db`. Schema:

```sql
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT,     -- ISO 8601, when server received it
  source_ip   TEXT,     -- sender's IP address
  frame_id    TEXT,     -- body.frameId
  name        TEXT,     -- body.name (event type string)
  event_type  TEXT,     -- payload.value.eventType
  event_time  TEXT,     -- payload.value.eventTime (device timestamp)
  msg_type    TEXT,     -- body.type (telemetry/request/response)
  source      TEXT,     -- extracted device identifier
  raw_json    TEXT      -- complete original payload
);
```
