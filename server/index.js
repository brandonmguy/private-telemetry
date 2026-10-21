'use strict';
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { DatabaseSync } = require('node:sqlite');

const app      = express();
const receiver = express();

const RECV_PORT = process.env.RECV_PORT || 3001;
const API_PORT  = process.env.API_PORT  || 3000;
const DB_PATH   = process.env.DB_PATH   || path.join(__dirname, 'telemetry.db');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
receiver.use(express.json({ limit: '10mb' }));

// ── Database ──────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at  TEXT    NOT NULL,
    source_ip    TEXT,
    frame_id     TEXT,
    name         TEXT,
    event_type   TEXT,
    event_time   TEXT,
    msg_type     TEXT,
    source       TEXT,
    raw_json     TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_received_at ON messages(received_at);
  CREATE INDEX IF NOT EXISTS idx_name        ON messages(name);
  CREATE INDEX IF NOT EXISTS idx_source      ON messages(source);
  CREATE INDEX IF NOT EXISTS idx_frame_id    ON messages(frame_id);
  CREATE INDEX IF NOT EXISTS idx_event_type  ON messages(event_type);
`);

// ── Field extractor ───────────────────────────────────────────────────────────
function get(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return (cur !== undefined && cur !== null) ? cur : null;
}

function extractFields(body, sourceIp) {
  const frameId  = body.frameId ?? null;
  const name     = body.name    ?? null;
  const msgType  = body.type    ?? null;

  const eventTime =
    get(body, 'payload', 'value', 'eventTime') ||
    get(body, 'payload', 'data', 'uploadTime') ||
    get(body, 'payload', 'value', 'eventData', 'eventTime') ||
    null;

  const eventType =
    get(body, 'payload', 'value', 'eventType') ||
    get(body, 'payload', 'type') ||
    null;

  const source =
    get(body, 'source') ||
    get(body, 'payload', 'value', 'eventData', 'source') ||
    get(body, 'payload', 'value', 'eventData', 'lensDeviceId') ||
    get(body, 'appName') ||
    name ||
    sourceIp;

  return { frameId, name, eventType, eventTime, msgType, source };
}

// ── Prepared statements ───────────────────────────────────────────────────────
const insertMsg = db.prepare(`
  INSERT INTO messages (received_at, source_ip, frame_id, name, event_type, event_time, msg_type, source, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── Receiver ──────────────────────────────────────────────────────────────────
receiver.get('/', (req, res) => res.json({ status: 'lens-telemetry receiver', ok: true }));

receiver.post('*', (req, res) => {
  try {
    const sourceIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown';

    const body   = req.body;
    const fields = extractFields(body, sourceIp);

    insertMsg.run(
      new Date().toISOString(),
      sourceIp,
      fields.frameId,
      fields.name,
      fields.eventType,
      fields.eventTime,
      fields.msgType,
      fields.source,
      JSON.stringify(body)
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Receiver error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── API ───────────────────────────────────────────────────────────────────────
const SORTABLE = ['received_at','source_ip','frame_id','name','event_type','event_time','msg_type','source'];

app.get('/api/messages', (req, res) => {
  const {
    page = 1, pageSize = 50,
    source, name, event_type, msg_type, search,
    from, to,
    sort = 'received_at', dir = 'desc',
  } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'received_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const conds  = [];
  const params = [];

  if (source)     { conds.push('source = ?');                                       params.push(source); }
  if (name)       { conds.push('name = ?');                                         params.push(name); }
  if (event_type) { conds.push('event_type = ?');                                   params.push(event_type); }
  if (msg_type)   { conds.push('msg_type = ?');                                     params.push(msg_type); }
  if (from)       { conds.push('received_at >= ?');                                 params.push(from); }
  if (to)         { conds.push('received_at <= ?');                                 params.push(to); }
  if (search)     {
    conds.push('(frame_id LIKE ? OR name LIKE ? OR source LIKE ? OR raw_json LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(pageSize);

  const total = db.prepare(`SELECT COUNT(*) as count FROM messages ${where}`).get(...params).count;
  const rows  = db.prepare(
    `SELECT id, received_at, source_ip, frame_id, name, event_type, event_time, msg_type, source
     FROM messages ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, Number(pageSize), offset);

  res.json({ total, page: Number(page), pageSize: Number(pageSize), rows });
});

app.get('/api/messages/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  try { row.raw_json = JSON.parse(row.raw_json); } catch (_) {}
  res.json(row);
});

app.get('/api/sources', (req, res) => {
  res.json(db.prepare('SELECT source, COUNT(*) as count FROM messages GROUP BY source ORDER BY count DESC').all());
});

app.get('/api/event-types', (req, res) => {
  res.json(db.prepare('SELECT name, COUNT(*) as count FROM messages GROUP BY name ORDER BY count DESC').all());
});

app.get('/api/stats', (req, res) => {
  const total      = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const last24h    = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE received_at >= datetime('now','-1 day')`).get().count;
  const sources    = db.prepare('SELECT COUNT(DISTINCT source) as count FROM messages').get().count;
  const eventTypes = db.prepare('SELECT COUNT(DISTINCT name) as count FROM messages').get().count;
  res.json({ total, last24h, sources, eventTypes });
});

app.delete('/api/messages', (req, res) => {
  db.exec('DELETE FROM messages');
  res.json({ ok: true });
});

// Static frontend
const DIST = path.join(__dirname, '../client/dist');
app.use(express.static(DIST));
app.get('*', (req, res) => {
  const p = path.join(DIST, 'index.html');
  res.sendFile(p, err => {
    if (err) res.send('Frontend not built. Run: cd client && npm install && npm run build');
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
receiver.listen(RECV_PORT, () =>
  console.log(`📡  Receiver  →  http://0.0.0.0:${RECV_PORT}  (POST any path)`)
);
app.listen(API_PORT, () =>
  console.log(`🌐  UI + API  →  http://0.0.0.0:${API_PORT}`)
);
