import argon2 from 'argon2';
import { pool } from '../config/db.js';
import { findUserByEmail } from '../repositories/user-repository.js';
import { writeAudit } from '../repositories/audit-repository.js';
import { AppError } from '../utils/app-error.js';

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

/**
 * Hashes a plaintext password using argon2id.
 * Use only during user creation or password change — never in hot paths.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Verifies a plaintext password against a stored argon2 hash.
 *
 * @param {string} hash
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // argon2.verify throws on a malformed hash — treat as mismatch.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Validates credentials against the database and writes an audit entry.
 *
 * Does NOT touch the session — session management (regenerate, set userId)
 * belongs to the auth controller so this service stays auth-agnostic.
 *
 * Returns the minimal user payload to store in the session on success.
 * Throws AppError(401, 'INVALID_CREDENTIALS') on any credential mismatch.
 *
 * Timing note: a dummy argon2.hash() is run when the email is not found so
 * the response time does not reveal whether an email exists in the system.
 *
 * @param {{ email: string, password: string }} credentials
 * @param {{ requestId?: string|null, ipAddress?: string|null }} [context]
 * @returns {Promise<{ id: number, fullName: string, email: string, role: string }>}
 */
export async function login(
  { email, password },
  { requestId = null, ipAddress = null } = {},
) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new AppError('Email is required', { status: 400, code: 'VALIDATION_ERROR' });
  }
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required', { status: 400, code: 'VALIDATION_ERROR' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  // A single generic error is used for both "email not found" and "wrong
  // password" to avoid leaking account existence information.
  const credentialsError = new AppError('Invalid credentials', {
    status: 401,
    code: 'INVALID_CREDENTIALS',
  });

  if (!user) {
    // Run a dummy hash so the response time matches a found-user path.
    await argon2.hash('dummy-timing-placeholder');
    await _writeAuthAudit('LOGIN_FAILED', { actorId: null, requestId, ipAddress });
    throw credentialsError;
  }

  const valid = await verifyPassword(user.password_hash, password);

  if (!valid) {
    await _writeAuthAudit('LOGIN_FAILED', { actorId: user.id, requestId, ipAddress });
    throw credentialsError;
  }

  await _writeAuthAudit('LOGIN', { actorId: user.id, requestId, ipAddress });

  // Return only the minimal payload needed to populate the session.
  // Never include password_hash in the return value.
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * Writes a LOGOUT audit entry. Session destruction and cookie clearing are
 * handled by the auth controller.
 *
 * @param {{ actorId: number, requestId?: string|null, ipAddress?: string|null }} context
 */
export async function logout({ actorId, requestId = null, ipAddress = null }) {
  await _writeAuthAudit('LOGOUT', { actorId, requestId, ipAddress });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Writes a LOGIN, LOGIN_FAILED, or LOGOUT row to the audit log.
 * Failures are silently swallowed — a failed audit write must not surface a
 * 500 to the client during authentication flows.
 */
async function _writeAuthAudit(action, { actorId, requestId, ipAddress }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await writeAudit(conn, {
      tableName: 'users',
      recordId: actorId,
      action,
      actorId,
      requestId,
      ipAddress,
    });
    await conn.commit();
  } catch {
    // Best-effort: audit failure must not prevent the auth flow from completing.
    await conn.rollback();
  } finally {
    conn.release();
  }
}
