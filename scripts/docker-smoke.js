'use strict';
// A unique disposable project keeps test data separate from the normal lab stack.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const net = require('node:net');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return result;
}
async function main() {
  const tls = process.argv.includes('--https');
  const project = 'telemetry-smoke-' + Date.now();
  assert.match(project, /^telemetry-smoke-\d+$/);
  const apiPort = await port();
  let recvPort = await port();
  while (recvPort === apiPort) recvPort = await port();
  let httpsPort = await port();
  while ([apiPort, recvPort].includes(httpsPort)) httpsPort = await port();
  const env = { ...process.env, API_PORT: String(apiPort), HTTP_RECV_PORT: String(recvPort),
    UI_BIND: '127.0.0.1', RECEIVER_BIND: '127.0.0.1', HTTPS_BIND: '127.0.0.1',
    HTTPS_PORT: String(httpsPort), TELEMETRY_IMAGE: 'private-telemetry:smoke' };
  const args = ['compose', '--env-file', '.env.example', '-p', project, '-f', 'compose.yaml'];
  if (tls) args.push('-f', 'compose.https.yaml');
  function compose(...command) {
    const result = spawnSync('docker', [...args, ...command], { env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Docker command failed: ' + command.join(' '));
  }
  const base = 'http://127.0.0.1:' + apiPort;
  try {
    compose('up', '-d', '--build', '--wait', '--wait-timeout', '90');
    const ui = await fetch(base);
    assert.equal(ui.status, 200);
    assert.match(await ui.text(), /<html/);
    const payload = { deviceId: 'docker-smoke', name: 'test', frameId: 'docker-smoke-frame' };
    const response = await fetch('http://127.0.0.1:' + recvPort + '/telemetry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    if (tls) {
      const ca = fs.readFileSync(path.join(__dirname, '../certs/server.crt'));
      await new Promise((resolve, reject) => {
        const request = https.request({
          hostname: '127.0.0.1', port: httpsPort, path: '/device', method: 'POST',
          servername: 'localhost', ca, headers: { 'Content-Type': 'application/json' },
        }, result => {
          result.resume();
          result.on('end', () => result.statusCode === 200 ? resolve() : reject(new Error('HTTPS status ' + result.statusCode)));
        });
        request.on('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('HTTPS timeout')));
        request.end(JSON.stringify(payload));
      });
    }
    compose('up', '-d', '--force-recreate', '--no-deps', '--wait', '--wait-timeout', '90', 'collector');
    const exported = await (await fetch(base + '/api/export?source=docker-smoke')).json();
    assert.equal(exported.manifest.record_count, tls ? 2 : 1);
    assert.deepEqual(exported.messages[0].raw_json, payload);
    console.log('Docker smoke test passed: UI, receiver, export, persistence' + (tls ? ', HTTPS' : ''));
  } catch (error) {
    compose('logs', '--no-color');
    throw error;
  } finally {
    // Removes only the unique test project and its disposable volumes.
    compose('down', '--volumes');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
