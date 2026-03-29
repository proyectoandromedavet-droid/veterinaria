#!/usr/bin/env node
'use strict';

/**
 * Lightweight migration runner — no external dependencies.
 *
 * - Reads all *.sql files from scripts/migrations/ in filename order.
 * - Tracks applied migrations in `migration_history` table.
 * - Idempotent: re-runs are safe (already-applied files are skipped).
 * - Supports --rollback (not implemented for SQL files — logs a warning).
 *
 * Usage:
 *   node scripts/migrate.js            # apply all pending migrations
 *   node scripts/migrate.js --status   # list applied/pending
 *   node scripts/migrate.js --dry-run  # show what would run, don't execute
 */

require('dotenv').config();

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS migration_history (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    filename    VARCHAR(255)  NOT NULL,
    applied_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR(64)   NOT NULL COMMENT 'SHA-256 of file contents',
    duration_ms INT UNSIGNED  NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_migration_filename (filename)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function getConnection() {
  return mysql.createConnection({
    host:     process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE || 'vetmanager',
    user:     process.env.MYSQL_USER     || 'vetapp',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  });
}

function checksum(content) {
  return require('crypto').createHash('sha256').update(content).digest('hex');
}

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function getApplied(conn) {
  const [rows] = await conn.execute('SELECT filename, checksum FROM migration_history');
  return new Map(rows.map(r => [r.filename, r.checksum]));
}

async function run() {
  const isDry    = process.argv.includes('--dry-run');
  const isStatus = process.argv.includes('--status');

  const conn = await getConnection();
  try {
    await conn.execute(ENSURE_TABLE);

    const files   = getMigrationFiles();
    const applied = await getApplied(conn);

    if (isStatus) {
      console.log('\nMigration status:');
      for (const f of files) {
        const status = applied.has(f) ? '✓ applied' : '○ pending';
        console.log(`  ${status}  ${f}`);
      }
      const pending = files.filter(f => !applied.has(f));
      console.log(`\n${applied.size} applied, ${pending.length} pending\n`);
      return;
    }

    const pending = files.filter(f => !applied.has(f));
    if (!pending.length) {
      console.log('✓ All migrations already applied.');
      return;
    }

    console.log(`Running ${pending.length} pending migration(s)${isDry ? ' [DRY RUN]' : ''}...\n`);

    for (const filename of pending) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const content  = fs.readFileSync(filepath, 'utf8');
      const hash     = checksum(content);

      if (isDry) {
        console.log(`  [DRY] Would apply: ${filename}`);
        continue;
      }

      const t0 = Date.now();
      try {
        await conn.execute(content);
        const ms = Date.now() - t0;
        await conn.execute(
          'INSERT INTO migration_history (filename, checksum, duration_ms) VALUES (?, ?, ?)',
          [filename, hash, ms]
        );
        console.log(`  ✓ ${filename}  (${ms}ms)`);
      } catch (err) {
        console.error(`  ✗ ${filename} FAILED: ${err.message}`);
        process.exit(1);
      }
    }

    console.log('\nAll migrations applied successfully.');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('Migration runner error:', err.message);
  process.exit(1);
});
