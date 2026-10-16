import { pool } from '../config/db.js';
import { writeAudit } from './audit-repository.js';

// Projection for all user queries. Aliases user_id -> id so the rest of the
// codebase always works with `user.id` regardless of the underlying column name.
const USER_COLUMNS = [
  'user_id AS id',
  'full_name',
  'email',
  'password_hash',
  'role',
  'is_active',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Find an active user by their primary key.
 *
 * @param {number} id
 * @param {{ conn?: import('mysql2/promise').Pool|import('mysql2/promise').Connection }} [options]
 * @returns {Promise<Object|null>}
 */
export async function findUserById(id, { conn = pool } = {}) {
  const sql = `SELECT ${USER_COLUMNS} FROM users WHERE user_id = ? AND is_active = true LIMIT 1`;
  const [rows] = await conn.execute(sql, [id]);
  return rows[0] || null;
}

/**
 * Find an active user by email address.
 *
 * @param {string} email
 * @param {{ conn?: import('mysql2/promise').Pool|import('mysql2/promise').Connection }} [options]
 * @returns {Promise<Object|null>}
 */
export async function findUserByEmail(email, { conn = pool } = {}) {
  const sql = `SELECT ${USER_COLUMNS} FROM users WHERE email = ? AND is_active = true LIMIT 1`;
  const [rows] = await conn.execute(sql, [email]);
  return rows[0] || null;
}

/**
 * Create a new user within a caller-supplied transaction.
 *
 * @param {{ fullName: string, email: string, passwordHash: string, role?: string }} userData
 * @param {{ actorId?: number|null, conn: import('mysql2/promise').Connection }} ctx
 * @returns {Promise<Object>} The newly created user row
 */
export async function createUser(
  { fullName, email, passwordHash, role = 'user' },
  { actorId = null, conn },
) {
  if (!conn) {
    throw new Error('Active transaction connection is required for createUser');
  }

  const sql = `
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `;

  const [result] = await conn.execute(sql, [fullName, email, passwordHash, role]);
  const newUserId = result.insertId;

  await writeAudit(conn, {
    tableName: 'users',
    recordId: newUserId,
    action: 'INSERT',
    actorId,
    newValues: { id: newUserId, full_name: fullName, email, role },
  });

  return findUserById(newUserId, { conn });
}

/**
 * Deactivate (soft-archive) a user. Never physically deletes.
 *
 * @param {number} id
 * @param {{ actorId: number, conn: import('mysql2/promise').Connection }} ctx
 * @returns {Promise<Object|null>} The user as it was before archival, or null if not found
 */
export async function archiveUser(id, { actorId, conn }) {
  if (!conn) {
    throw new Error('Active transaction connection is required for archiveUser');
  }

  const [rows] = await conn.execute(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = ? AND is_active = true FOR UPDATE`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const existing = rows[0];

  await conn.execute('UPDATE users SET is_active = false WHERE user_id = ?', [id]);

  await writeAudit(conn, {
    tableName: 'users',
    recordId: id,
    action: 'ARCHIVE',
    actorId,
    oldValues: { id: existing.id, email: existing.email, role: existing.role },
    newValues: { is_active: false },
  });

  return existing;
}

/**
 * Reactivate an archived user.
 *
 * @param {number} id
 * @param {{ actorId: number, conn: import('mysql2/promise').Connection }} ctx
 * @returns {Promise<Object|null>} The restored user, or null if not found
 */
export async function restoreUser(id, { actorId, conn }) {
  if (!conn) {
    throw new Error('Active transaction connection is required for restoreUser');
  }

  const [rows] = await conn.execute(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = ? AND is_active = false FOR UPDATE`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const existing = rows[0];

  await conn.execute('UPDATE users SET is_active = true WHERE user_id = ?', [id]);

  await writeAudit(conn, {
    tableName: 'users',
    recordId: id,
    action: 'RESTORE',
    actorId,
    oldValues: { id: existing.id, email: existing.email, is_active: false },
    newValues: { is_active: true },
  });

  return findUserById(id, { conn });
}
