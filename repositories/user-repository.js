import { pool } from '../config/db.js';
import { writeAudit } from './audit-repository.js';

const USER_COLUMNS = [
  'id',
  'email',
  'password_hash',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'deleted_at',
  'deleted_by',
].join(', ');

/**
 * Find user by ID. Excludes archived users by default.
 */
export async function findUserById(id, { conn = pool, includeArchived = false } = {}) {
  const whereDeleted = includeArchived ? '' : 'AND deleted_at IS NULL';
  const sql = `SELECT ${USER_COLUMNS} FROM users WHERE id = ? ${whereDeleted} LIMIT 1`;
  const [rows] = await conn.execute(sql, [id]);
  return rows[0] || null;
}

/**
 * Find active user by email.
 */
export async function findUserByEmail(email, { conn = pool } = {}) {
  const sql = `SELECT ${USER_COLUMNS} FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`;
  const [rows] = await conn.execute(sql, [email]);
  return rows[0] || null;
}

/**
 * Create a new user with audit log in the provided transaction.
 */
export async function createUser({ email, passwordHash }, { actorId = null, conn }) {
  if (!conn) {
    throw new Error('Active transaction connection is required for createUser');
  }

  const sql = `
    INSERT INTO users (
      email,
      password_hash,
      created_by,
      updated_by
    ) VALUES (?, ?, ?, ?)
  `;

  const [result] = await conn.execute(sql, [email, passwordHash, actorId, actorId]);
  const newUserId = result.insertId;

  await writeAudit(conn, {
    tableName: 'users',
    recordId: newUserId,
    action: 'INSERT',
    actorId,
    newValues: { id: newUserId, email, created_by: actorId },
  });

  return findUserById(newUserId, { conn });
}

/**
 * Archive a user (soft delete). Never physically deletes.
 */
export async function archiveUser(id, { actorId, conn }) {
  if (!conn) {
    throw new Error('Active transaction connection is required for archiveUser');
  }

  const [rows] = await conn.execute(
    'SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const existing = rows[0];

  await conn.execute(
    'UPDATE users SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ? WHERE id = ?',
    [actorId, actorId, id],
  );

  await writeAudit(conn, {
    tableName: 'users',
    recordId: id,
    action: 'ARCHIVE',
    actorId,
    oldValues: existing,
    newValues: { deleted_by: actorId },
  });

  return existing;
}

/**
 * Restore an archived user.
 */
export async function restoreUser(id, { actorId, conn }) {
  if (!conn) {
    throw new Error('Active transaction connection is required for restoreUser');
  }

  const [rows] = await conn.execute(
    'SELECT id, email FROM users WHERE id = ? AND deleted_at IS NOT NULL FOR UPDATE',
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const existing = rows[0];

  await conn.execute(
    'UPDATE users SET deleted_at = NULL, deleted_by = NULL, updated_by = ? WHERE id = ?',
    [actorId, id],
  );

  await writeAudit(conn, {
    tableName: 'users',
    recordId: id,
    action: 'RESTORE',
    actorId,
    oldValues: existing,
    newValues: { restored_by: actorId },
  });

  return findUserById(id, { conn });
}
