import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCK_NAME = 'lost_and_found_migrate';
const MIGRATION_NAME_PATTERN = /^\d{3,}_[a-z0-9_]+\.sql$/;

async function runMigrations() {
  console.log('Connecting to database as migration user...');

  let conn;
  let lockAcquired = false;

  try {
    // 1. Dedicated connection with multipleStatements enabled
    conn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.migrationUser,
      password: config.db.migrationPassword,
      database: config.db.name,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
      multipleStatements: true,
      charset: 'utf8mb4',
      timezone: 'Z',
      ssl: config.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    });

    // 2. Acquire migration lock
    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS lock_acquired', [LOCK_NAME]);
    if (!lockRows || lockRows[0].lock_acquired !== 1) {
      console.error(
        `Failed to acquire migration lock '${LOCK_NAME}'. Another migration is in progress. Aborting.`
      );
      process.exitCode = 1;
      return;
    }
    lockAcquired = true;

    // 3. Ensure schema_migrations table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_schema_migrations_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Read and validate migration files
    const migrationsDir = path.resolve(__dirname, '../migrations');
    let fileEntries;
    try {
      fileEntries = await fs.readdir(migrationsDir);
    } catch (err) {
      console.error(`Failed to read migrations directory: ${migrationsDir} - ${err.message}`);
      process.exitCode = 1;
      return;
    }

    const sqlFiles = fileEntries.filter((f) => f.endsWith('.sql'));
    const migrations = [];
    const seenNumbers = new Map();

    for (const fileName of sqlFiles) {
      if (!MIGRATION_NAME_PATTERN.test(fileName)) {
        console.error(
          `Invalid migration filename '${fileName}'. Names must match pattern ^\\d{3,}_[a-z0-9_]+\\.sql$`
        );
        process.exitCode = 1;
        return;
      }

      const match = fileName.match(/^(\d{3,})_/);
      const number = parseInt(match[1], 10);

      if (seenNumbers.has(number)) {
        console.error(
          `Duplicate migration number '${match[1]}' detected: '${seenNumbers.get(number)}' and '${fileName}'. Aborting.`
        );
        process.exitCode = 1;
        return;
      }
      seenNumbers.set(number, fileName);

      migrations.push({
        fileName,
        number,
        filePath: path.join(migrationsDir, fileName),
      });
    }

    // Sort numerically
    migrations.sort((a, b) => a.number - b.number);

    // 5. Verify applied migrations and checksums
    const [appliedRows] = await conn.query(
      'SELECT migration_name, checksum FROM schema_migrations ORDER BY id ASC'
    );

    const appliedMap = new Map();
    for (const row of appliedRows) {
      appliedMap.set(row.migration_name, row.checksum);
    }

    for (const row of appliedRows) {
      const filePath = path.join(migrationsDir, row.migration_name);
      let fileContent;
      try {
        fileContent = await fs.readFile(filePath, 'utf8');
      } catch {
        console.error(
          `Applied migration file missing on disk: '${row.migration_name}'. Aborting.`
        );
        process.exitCode = 1;
        return;
      }

      const currentChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      if (currentChecksum !== row.checksum) {
        console.error(
          `Checksum mismatch for applied migration '${row.migration_name}'. Applied migrations must never be edited. Aborting.`
        );
        process.exitCode = 1;
        return;
      }
    }

    // 6. Apply pending migrations in order
    const pending = migrations.filter((m) => !appliedMap.has(m.fileName));

    if (pending.length === 0) {
      console.log('No pending migrations. Database schema is up to date.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s) to apply.`);

    for (const m of pending) {
      console.log(`Applying migration: ${m.fileName}...`);
      const content = await fs.readFile(m.filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      try {
        if (content.trim().length > 0) {
          await conn.query(content);
        }
        await conn.execute(
          'INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)',
          [m.fileName, checksum]
        );
        console.log(`Successfully applied: ${m.fileName}`);
      } catch (err) {
        // 7. Stop immediately on failure and exit non-zero
        console.error(`Migration failed in file: ${m.fileName}`);
        console.error(`Error details: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log('All pending migrations applied successfully.');
  } catch (err) {
    console.error('Migration runner encountered an unexpected error:', err.message);
    process.exitCode = 1;
  } finally {
    if (conn) {
      if (lockAcquired) {
        try {
          await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
        } catch (lockErr) {
          console.error('Failed to release migration lock:', lockErr.message);
        }
      }
      try {
        await conn.end();
      } catch {
        // ignore connection close error
      }
    }
  }
}

runMigrations();
