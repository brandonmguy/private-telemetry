'use strict';
const { DatabaseSync, backup } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const source = path.resolve(process.env.DB_PATH || path.join(__dirname, '../server/telemetry.db'));
  const destination = path.resolve(process.argv[2] || path.join(__dirname, '../backups', `telemetry-${Date.now()}.db`));
  if (!fs.existsSync(source)) throw new Error(`Database does not exist: ${source}`);
  if (source === destination || fs.existsSync(destination)) throw new Error('Choose a new backup file; existing files are not overwritten.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
  console.log(`Backup saved to ${destination}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
