'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
test('collector integration', { timeout: 40000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
  const dbPath = path.join(temp, 'data', 'telemetry.db');
  const apiPort = await freePort();
  let recvPort = await freePort();
  while (recvPort === apiPort) recvPort = await freePort();
  const base = 'http://127.0.0.1:' + apiPort;
  let child;
  let output = '';
  const env = { ...process.env, DB_PATH: dbPath, API_PORT: String(apiPort), RECV_PORT: String(recvPort),
    API_HOST: '127.0.0.1', RECV_HOST: '127.0.0.1', TRUST_PROXY: '' };
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  t.after(async () => {
    await stop();
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.match(path.basename(temp), /^telemetry-test-/);
    fs.rmSync(temp, { recursive: true, force: true });
  });
  async function start() {
    output = '';
    child = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Startup timed out: ' + output);
  }
  const read = async url => {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    return response.json();
  };
  const post = (body, headers = {}) => fetch('http://127.0.0.1:' + recvPort + '/arbitrary/path', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  await start();
  await t.test('built UI and empty export', async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<html/);
    assert.equal((await read('/api/export')).manifest.record_count, 0);
  });
  const payload = { deviceId: 'device-001', appName: 'shared-app', name: 'DeviceInfo.test', frameId: 'frame-001',
    type: 'telemetry', unknown: { retained: true }, payload: { value: { eventTime: '2026-01-01T12:00:00Z',
      eventType: 'DeviceInfo', eventData: { lensDeviceId: 'fallback-id' } } } };
  await t.test('payload retention, stable identity, spoofed forwarding header', async () => {
    assert.equal((await post(payload, { 'X-Forwarded-For': '198.51.100.99' })).status, 200);
    const list = await read('/api/messages');
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].source, 'device-001');
    assert.equal(list.rows[0].source_ip, '127.0.0.1');
    assert.deepEqual((await read('/api/messages/' + list.rows[0].id)).raw_json, payload);
    assert.equal((await read('/api/stats')).last24h, 1);
  });
  await t.test('invalid pagination, dates, identifiers, payloads and formats', async () => {
    for (const url of ['/api/messages?page=-1', '/api/messages?pageSize=1001', '/api/messages?page=1&page=2',
      '/api/messages?from=garbage', '/api/messages?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z',
      '/api/messages/NaN', '/api/export?format=csv']) {
      const response = await fetch(base + url);
      assert.equal(response.status, 400, url);
      assert.ok((await response.json()).error);
    }
    assert.equal((await post([])).status, 400);
    assert.equal((await post({ name: { unexpected: true }, type: 12 })).status, 200);
    const malformed = await fetch('http://127.0.0.1:' + recvPort, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"broken":',
    });
    assert.equal(malformed.status, 400);
    assert.ok((await malformed.json()).error);
    assert.equal((await fetch('http://127.0.0.1:' + recvPort, { method: 'POST', body: 'not json' })).status, 415);
    assert.equal((await fetch(base + '/api/unknown')).status, 404);
  });
  await t.test('filtered JSON and NDJSON exports match their manifests', async () => {
    const query = '?source=device-001&from=2000-01-01T00:00:00Z';
    const exported = await read('/api/export' + query);
    assert.equal(exported.manifest.record_count, 1);
    assert.equal(exported.manifest.filters.source, 'device-001');
    assert.deepEqual(exported.messages[0].raw_json, payload);
    const response = await fetch(base + '/api/export' + query + '&format=ndjson');
    assert.match(response.headers.get('content-disposition'), /attachment/);
    const lines = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(lines[0].kind, 'manifest');
    assert.equal(lines[0].record_count, 1);
    assert.equal(lines[1].kind, 'message');
    assert.deepEqual(lines[1].raw_json, payload);
  });
  await t.test('last24h excludes older messages on the previous calendar date', async () => {
    const db = new DatabaseSync(dbPath);
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 1);
    old.setUTCHours(0, 0, 0, 0);
    db.prepare('INSERT INTO messages (received_at, raw_json) VALUES (?, ?)').run(old.toISOString(), '{}');
    db.close();
    const stats = await read('/api/stats');
    assert.equal(stats.total, 3);
    assert.equal(stats.last24h, 2);
  });
  await t.test('online backup and overwrite protection', async () => {
    const destination = path.join(temp, 'backup.db');
    const result = spawnSync(process.execPath, ['scripts/backup.js', destination], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const db = new DatabaseSync(destination, { readOnly: true });
    assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 3);
    db.close();
    assert.equal(spawnSync(process.execPath, ['scripts/backup.js', destination], { cwd: root, env }).status, 1);
  });
  await t.test('restart persistence and explicit lab reset', async () => {
    await stop();
    await start();
    assert.equal((await read('/api/messages')).total, 3);
    assert.equal((await fetch(base + '/api/messages', { method: 'DELETE' })).status, 200);
    assert.equal((await read('/api/messages')).total, 0);
  });
  await stop();
  env.TRUST_PROXY = 'loopback';
  await start();
  await t.test('explicitly trusted proxy forwarding', async () => {
    assert.equal((await post(payload, { 'X-Forwarded-For': '198.51.100.99' })).status, 200);
    assert.equal((await read('/api/messages')).rows[0].source_ip, '198.51.100.99');
  });
});
