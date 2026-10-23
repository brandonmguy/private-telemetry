#!/usr/bin/env node
/**
 * Sends a batch of sample Poly Lens telemetry messages to the receiver.
 * Usage: node scripts/test-send.js [host] [port]
 *   host defaults to localhost
 *   port defaults to 3001
 */

const HOST = process.argv[2] || 'localhost';
const PORT = process.argv[3] || 3001;
const URL  = `http://${HOST}:${PORT}/`;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isoNow() { return new Date().toISOString(); }

const DEVICES = [
  { appName: 'PolyStudio-X50-Lab1',  lensDeviceId: 'dev-001', ip: '10.0.1.10' },
  { appName: 'PolyLens-CCX600-East', lensDeviceId: 'dev-002', ip: '10.0.1.11' },
  { appName: 'PolyStudio-E70-Conf',  lensDeviceId: 'dev-003', ip: '10.0.1.12' },
];

function makePrimaryDeviceInfo(dev) {
  return {
    frameId: uuid(),
    deviceId: dev.lensDeviceId,
    appName: dev.appName,
    name: 'DeviceInfo.primaryDeviceInfo',
    type: 'telemetry',
    payload: {
      version: '1',
      value: {
        eventType: 'DeviceInfo',
        eventVersion: '1.0',
        eventTime: isoNow(),
        eventData: {
          m_type: 'primaryDeviceInfo',
          manufacturer: 'Poly',
          productFamily: 'Studio',
          hardwareModel: 'Studio X50',
          hardwareRevision: 'A',
          serialNumber: 'ABC123456',
          softwareRelease: '4.2.0',
          softwareBuild:   '4.2.0-123456',
          macAddress: '00:11:22:33:44:55',
          proxyAgent: dev.appName,
          proxyAgentId: dev.lensDeviceId,
          proxyAgentVersion: '4.2.0',
        },
      },
    },
  };
}

function makeDeviceHealthInfo(dev) {
  return {
    frameId: uuid(),
    appName: dev.appName,
    name: 'DeviceEvent.deviceHealthInfo',
    type: 'telemetry',
    payload: {
      version: '1',
      value: {
        eventType: 'DeviceEvent',
        eventVersion: '1.0',
        eventTime: isoNow(),
        eventData: {
          m_type: 'deviceHealthInfo',
          lensDeviceId: dev.lensDeviceId,
          cpuLevel: Math.floor(Math.random() * 60) + 10,
          cpuLevelAvg: Math.floor(Math.random() * 40) + 15,
          memoryUtilizationPct: Math.floor(Math.random() * 50) + 20,
          memoryUtilizationAvgPct: Math.floor(Math.random() * 40) + 20,
          uptime: `${Math.floor(Math.random() * 24)}:${Math.floor(Math.random() * 60)}:00`,
          diskUtilization: `${Math.floor(Math.random() * 60) + 10}%`,
          networkLoad: Math.floor(Math.random() * 30),
          cpu1CoreCelsiusTemp: 45 + Math.random() * 15,
          fanSpeed: 1200 + Math.floor(Math.random() * 800),
          bluetoothConnected: Math.random() > 0.5,
        },
      },
    },
  };
}

function makeCdrInfo(dev) {
  const duration = Math.floor(Math.random() * 3600);
  return {
    frameId: uuid(),
    appName: dev.appName,
    deviceId: dev.lensDeviceId,
    name: 'DeviceInfo.cdrInfo',
    type: 'telemetry',
    payload: {
      version: '1',
      value: {
        eventType: 'DeviceInfo',
        eventVersion: '1.0',
        eventTime: isoNow(),
        eventData: {
          lensDeviceId: dev.lensDeviceId,
          callId: uuid(),
          callDirection: Math.random() > 0.5 ? 'incoming' : 'outgoing',
          callDuration: `${Math.floor(duration / 3600)}:${String(Math.floor((duration % 3600) / 60)).padStart(2,'0')}:${String(duration % 60).padStart(2,'0')}`,
          callDurationMs: duration * 1000,
          remoteParty: `sip:user${Math.floor(Math.random() * 999)}@example.com`,
          protocolType: 'SIP',
          disconnectInfo: 'NORMAL_CLEARING',
          startTime: isoNow(),
          endTime: isoNow(),
          source: dev.appName,
          lineType: 'SIP',
        },
      },
    },
  };
}

function makeAppState(dev) {
  const states = ['IN_MEETING', 'IDLE', 'INCOMING_CALL', 'IN_CALL', 'WAKING'];
  return {
    frameId: uuid(),
    deviceId: dev.lensDeviceId,
    name: 'DeviceInfo.AppState',
    type: 'telemetry',
    payload: {
      version: '1',
      value: {
        eventType: 'DeviceInfo',
        eventVersion: '1.0',
        eventTime: isoNow(),
        eventData: {
          m_type: 'AppState',
          appName: 'com.poly.studio',
          appState: states[Math.floor(Math.random() * states.length)],
        },
      },
    },
  };
}

function makeServiceInfo(dev) {
  const statuses = ['REGISTERED', 'UNREGISTERED', 'REGISTERING', 'FAILED'];
  return {
    frameId: uuid(),
    name: 'DeviceInfo.serviceInfo',
    type: 'telemetry',
    payload: {
      version: '1',
      value: {
        eventType: 'DeviceInfo',
        eventVersion: '1.0',
        eventTime: isoNow(),
        eventData: {
          lensDeviceId: dev.lensDeviceId,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          serverAddr: '10.0.0.1',
          serverPort: '5060',
          sipAddr: `sip:room${Math.floor(Math.random()*100)}@corp.example.com`,
          protocolType: 'SIP',
          lineType: 'PRIMARY',
          srvPlatform: 'Teams',
        },
      },
    },
  };
}

async function sendMsg(payload, devIp) {
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': devIp,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    return res.ok && json.ok;
  } catch (err) {
    console.error('  ✗ Send failed:', err.message);
    return false;
  }
}

async function main() {
  console.log(`\n🚀 Sending test telemetry to ${URL}\n`);

  const messages = [];
  for (const dev of DEVICES) {
    messages.push([makePrimaryDeviceInfo(dev), dev.ip]);
    messages.push([makeDeviceHealthInfo(dev), dev.ip]);
    messages.push([makeDeviceHealthInfo(dev), dev.ip]);
    messages.push([makeCdrInfo(dev), dev.ip]);
    messages.push([makeAppState(dev), dev.ip]);
    messages.push([makeServiceInfo(dev), dev.ip]);
  }

  let ok = 0;
  for (const [msg, ip] of messages) {
    const success = await sendMsg(msg, ip);
    if (success) {
      ok++;
      console.log(`  ✓ ${msg.name} (${msg.appName || '?'})`);
    }
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n✅ Sent ${ok}/${messages.length} messages successfully.\n`);
  if (ok !== messages.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
