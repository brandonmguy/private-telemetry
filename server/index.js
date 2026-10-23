'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { version } = require('../package.json');

const app = express();
const receiver = express();
const API_PORT = Number(process.env.API_PORT || 3000);
const RECV_PORT = Number(process.env.RECV_PORT || 3001);
const API_HOST = process.env.API_HOST || '127.0.0.1';
const RECV_HOST = process.env.RECV_HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'telemetry.db');
for (const port of [API_PORT, RECV_PORT]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ports must be integers between 1 and 65535');
}
if (API_PORT === RECV_PORT) throw new Error('API_PORT and RECV_PORT must be different');
// Trust only configured proxy addresses, never arbitrary forwarded headers.
if (process.env.TRUST_PROXY) receiver.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
receiver.use(express.json({ limit: '10mb' }));

fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec([
  'PRAGMA journal_mode = WAL;',
  'PRAGMA busy_timeout = 5000;',
  'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, source_ip TEXT, frame_id TEXT, name TEXT, event_type TEXT, event_time TEXT, msg_type TEXT, source TEXT, raw_json TEXT NOT NULL);',
  ...['received_at', 'name', 'source', 'frame_id', 'event_type'].map(column => 'CREATE INDEX IF NOT EXISTS idx_' + column + ' ON messages(' + column + ');'),
].join('\n'));

function get(obj, ...keys) {
  for (const key of keys) obj = obj && typeof obj === 'object' ? obj[key] : null;
  return obj ?? null;
}
function scalar(...values) {
  const value = values.find(value => (typeof value === 'string' && value.length > 0) || typeof value === 'number' || typeof value === 'boolean');
  return value == null ? null : String(value);
}
function extractFields(body, sourceIp) {
  return {
    frameId: scalar(body.frameId),
    name: scalar(body.name),
    msgType: scalar(body.type),
    eventTime: scalar(get(body, 'payload', 'value', 'eventTime'), get(body, 'payload', 'data', 'uploadTime'), get(body, 'payload', 'value', 'eventData', 'eventTime'), body.eventtime),
    eventType: scalar(get(body, 'payload', 'value', 'eventType'), get(body, 'payload', 'type'), body.eventtype),
    source: scalar(body.deviceId, body.deviceid, get(body, 'payload', 'value', 'eventData', 'lensDeviceId'), get(body, 'payload', 'value', 'eventData', 'deviceId'), get(body, 'payload', 'deviceId'), body.source, get(body, 'payload', 'value', 'eventData', 'source'), body.appName, sourceIp),
  };
}
const insertMsg = db.prepare('INSERT INTO messages (received_at, source_ip, frame_id, name, event_type, event_time, msg_type, source, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

receiver.get('/', (req, res) => res.json({ status: 'lens-telemetry receiver', ok: true }));
receiver.post('*', (req, res, next) => {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use Content-Type: application/json' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Expected a JSON object' });
  try {
    const sourceIp = req.ip || 'unknown';
    const fields = extractFields(body, sourceIp);
    insertMsg.run(new Date().toISOString(), sourceIp, fields.frameId, fields.name, fields.eventType,
      fields.eventTime, fields.msgType, fields.source, JSON.stringify(body));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

const SORTABLE = ['received_at', 'source_ip', 'frame_id', 'name', 'event_type', 'event_time', 'msg_type', 'source'];
function queryOptions(query) {
  const conds = [];
  const params = [];
  const filters = {};
  for (const key of ['source', 'name', 'event_type', 'msg_type', 'search', 'from', 'to']) {
    if (query[key] === undefined || query[key] === '') continue;
    if (typeof query[key] !== 'string') throw Object.assign(new Error(key + ' must be a single string'), { status: 400 });
    let value = query[key];
    if (key === 'from' || key === 'to') {
      if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
        throw Object.assign(new Error(key + ' must be an ISO timestamp with timezone'), { status: 400 });
      }
      value = new Date(value).toISOString();
    }
    filters[key] = value;
    if (key === 'search') {
      conds.push('(frame_id LIKE ? OR name LIKE ? OR source LIKE ? OR raw_json LIKE ?)');
      params.push(...Array(4).fill('%' + value + '%'));
    } else {
      conds.push(key === 'from' ? 'received_at >= ?' : key === 'to' ? 'received_at <= ?' : key + ' = ?');
      params.push(value);
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) throw Object.assign(new Error('from must be before to'), { status: 400 });
  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params, filters,
    sort: SORTABLE.includes(query.sort) ? query.sort : 'received_at', dir: query.dir === 'asc' ? 'ASC' : 'DESC' };
}
function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) {
    throw Object.assign(new Error('Expected an integer between 1 and ' + maximum), { status: 400 });
  }
  return Number(value);
}
function parseRow(row) {
  return { ...row, raw_json: JSON.parse(row.raw_json) };
}
app.get('/api/health', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true, version });
});
app.get('/api/messages', (req, res) => {
  const { where, params, sort, dir } = queryOptions(req.query);
  const page = positiveInteger(req.query.page, 1, 1000000);
  const pageSize = positiveInteger(req.query.pageSize, 50, 1000);
  const total = db.prepare('SELECT COUNT(*) AS count FROM messages ' + where).get(...params).count;
  const rows = db.prepare('SELECT id, received_at, source_ip, frame_id, name, event_type, event_time, msg_type, source FROM messages ' + where + ' ORDER BY ' + sort + ' ' + dir + ', id ' + dir + ' LIMIT ? OFFSET ?').all(...params, pageSize, (page - 1) * pageSize);
  res.json({ total, page, pageSize, rows });
});

// Exports are an in-memory snapshot intended for lab-sized collections.
app.get('/api/export', (req, res) => {
  const format = req.query.format || 'json';
  if (!['json', 'ndjson'].includes(format)) return res.status(400).json({ error: 'format must be json or ndjson' });
  const { where, params, filters, sort, dir } = queryOptions(req.query);
  const messages = db.prepare('SELECT * FROM messages ' + where + ' ORDER BY ' + sort + ' ' + dir + ', id ' + dir).all(...params).map(parseRow);
  const manifest = {
    schema_version: 1, app_version: version, exported_at: new Date().toISOString(),
    filters, sort, direction: dir.toLowerCase(), record_count: messages.length,
    data_dictionary: 'https://info.lens.poly.com/docs/Compliance/EU%20Data/data-dictionary',
    payload_representation: 'Parsed JSON; original wire bytes and HTTP headers are not retained.',
  };
  res.set('Content-Disposition', 'attachment; filename="telemetry-' + Date.now() + '.' + format + '"');
  if (format === 'json') return res.json({ manifest, messages });
  res.type('application/x-ndjson');
  res.send([JSON.stringify({ kind: 'manifest', ...manifest }), ...messages.map(row => JSON.stringify({ kind: 'message', ...row }))].join('\n') + '\n');
});
app.get('/api/messages/:id', (req, res) => {
  const id = positiveInteger(req.params.id, null, Number.MAX_SAFE_INTEGER);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});
app.get('/api/sources', (req, res) => res.json(db.prepare('SELECT source, COUNT(*) AS count FROM messages GROUP BY source ORDER BY count DESC').all()));
app.get('/api/event-types', (req, res) => res.json(db.prepare('SELECT name, COUNT(*) AS count FROM messages GROUP BY name ORDER BY count DESC').all()));
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
  const last24h = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE received_at >= ?').get(new Date(Date.now() - 86400000).toISOString()).count;
  const sources = db.prepare('SELECT COUNT(DISTINCT source) AS count FROM messages').get().count;
  const eventTypes = db.prepare('SELECT COUNT(DISTINCT name) AS count FROM messages').get().count;
  res.json({ total, last24h, sources, eventTypes });
});
app.delete('/api/messages', (req, res) => {
  db.exec('DELETE FROM messages');
  res.json({ ok: true });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
const DIST = path.join(__dirname, '../client/dist');
app.use(express.static(DIST));
app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html'), error => {
  if (error) res.status(503).send('Frontend not built. Run npm run setup from the repository root.');
}));
function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status === 500) console.error('Request failed:', error);
  res.status(status).json({ ok: false, error: status === 500 ? 'Internal server error' : error.message });
}
receiver.use(handleError);
app.use(handleError);
const servers = [
  receiver.listen(RECV_PORT, RECV_HOST, () => console.log('Receiver: http://' + RECV_HOST + ':' + RECV_PORT)),
  app.listen(API_PORT, API_HOST, () => console.log('Viewer: http://' + API_HOST + ':' + API_PORT)),
];
let stopping = false;
function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 8000);
  timeout.unref();
  Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
    .then(() => { db.close(); clearTimeout(timeout); process.exitCode = exitCode; });
}
for (const server of servers) server.on('error', error => { console.error('Listener failed:', error.message); shutdown(1); });
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
