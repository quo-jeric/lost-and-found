import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';

const testDatabaseName = process.env.TEST_DB_NAME?.trim();

if (!testDatabaseName || !/_test$/i.test(testDatabaseName)) {
  throw new Error('TEST_DB_NAME is required and must end with "_test".');
}

const requiredTestVariables = ['TEST_DB_HOST', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
const missingVariables = requiredTestVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing test database environment variables: ${missingVariables.join(', ')}`);
}

process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST;
process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.TEST_DB_USER;
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD;
process.env.DB_NAME = testDatabaseName;
process.env.SESSION_SECRET =
  process.env.TEST_SESSION_SECRET || randomBytes(32).toString('hex');

let poolPromise;
let appPromise;

export async function getTestPool() {
  poolPromise ??= (async () => {
    const { pool } = await import('../../config/db.js');
    const [[{ database_name: connectedDatabase }]] = await pool.query(
      'SELECT DATABASE() AS database_name',
    );

    if (connectedDatabase !== testDatabaseName || !/_test$/i.test(connectedDatabase)) {
      await pool.end();
      throw new Error('The configured MySQL connection is not using TEST_DB_NAME.');
    }

    const [tableRows] = await pool.execute(
      `SELECT table_name AS table_name
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_name IN ('users', 'categories', 'locations', 'items', 'claims', 'audit_log', 'sessions')`,
      [testDatabaseName],
    );
    const availableTables = new Set(
      tableRows.map((row) => row.table_name || row.TABLE_NAME),
    );
    const missingTables = [
      'users',
      'categories',
      'locations',
      'items',
      'claims',
      'audit_log',
      'sessions',
    ].filter((tableName) => !availableTables.has(tableName));

    if (missingTables.length > 0) {
      await pool.end();
      throw new Error(
        `The test database is missing required migrated tables: ${missingTables.join(', ')}`,
      );
    }

    return pool;
  })();

  return poolPromise;
}

export async function getTestApp() {
  appPromise ??= import('../../app.js').then(({ app }) => app);
  return appPromise;
}

export async function createStaffFixture(pool, role = 'admin') {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `test-${suffix}@example.test`;
  const password = randomUUID();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, true)`,
    [`Integration ${role}`, email, passwordHash, role],
  );

  return { userId: result.insertId, email, password };
}

export async function createCatalogReferences(pool) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const [categoryResult] = await pool.execute(
    'INSERT INTO categories (category_name) VALUES (?)',
    [`T-${suffix}`],
  );
  const [locationResult] = await pool.execute(
    'INSERT INTO locations (location_name) VALUES (?)',
    [`T-${suffix}`],
  );

  return {
    categoryId: categoryResult.insertId,
    locationId: locationResult.insertId,
  };
}

export async function createItemFixture(pool, { userId, categoryId, locationId, title }) {
  const [result] = await pool.execute(
    `INSERT INTO items (
       title, description, category_id, color, brand, found_at, location_id,
       finder_name, logged_by, item_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      title,
      'Created by an isolated automated test.',
      categoryId,
      'Blue',
      'Test fixture',
      new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' '),
      locationId,
      'Automated test',
      userId,
    ],
  );

  return result.insertId;
}

export async function cleanupFixture(pool, { userId, itemId }) {
  if (itemId) {
    await pool.execute(
      `UPDATE claims
       SET claim_status = 'rejected',
           processed_by = ?,
           processing_notes = 'Automated test cleanup',
           resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)
       WHERE item_id = ? AND claim_status = 'pending'`,
      [userId, itemId],
    );
    await pool.execute(
      "UPDATE items SET item_status = 'inactive' WHERE item_id = ?",
      [itemId],
    );
  }

  if (userId) {
    await pool.execute('UPDATE users SET is_active = false WHERE user_id = ?', [userId]);
  }
}
