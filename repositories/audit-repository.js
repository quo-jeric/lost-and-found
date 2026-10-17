const VALID_ACTIONS = new Set([
  'INSERT',
  'UPDATE',
  'ARCHIVE',
  'RESTORE',
  'ANONYMIZE',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
]);

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'refresh_token',
  'access_token',
  'secret',
  'session_id',
  'cookie',
  'authorization',
]);

/**
 * Sanitizes object snapshot by stripping sensitive keys (passwords, tokens, secrets).
 */
function sanitizeSnapshot(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeSnapshot(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      continue;
    }
    sanitized[key] = typeof value === 'object' && value !== null ? sanitizeSnapshot(value) : value;
  }
  return sanitized;
}

/**
 * Writes an entry into the audit trail within the provided database connection/transaction.
 *
 * @param {import('mysql2/promise').Connection} conn - Active database connection (with transaction)
 * @param {Object} options
 * @param {string} options.tableName - Target table name
 * @param {number|string|null} [options.recordId] - ID of the record changed
 * @param {string} options.action - Action enum (INSERT, UPDATE, ARCHIVE, RESTORE, ANONYMIZE, LOGIN, LOGIN_FAILED, LOGOUT)
 * @param {number|string|null} [options.actorId] - User ID who performed the action (null for system)
 * @param {Object|null} [options.oldValues] - State before change
 * @param {Object|null} [options.newValues] - State after change
 * @param {string|null} [options.requestId] - Associated HTTP request ID
 * @param {string|null} [options.ipAddress] - IP address of the client
 * @returns {Promise<number>} Inserted audit log ID
 */
export async function writeAudit(
  conn,
  {
    tableName,
    recordId = null,
    action,
    actorId = null,
    oldValues = null,
    newValues = null,
    requestId = null,
    ipAddress = null,
  },
) {
  if (!conn) {
    throw new Error('Database connection (conn) is required for writeAudit');
  }

  if (!tableName || typeof tableName !== 'string') {
    throw new Error('Valid tableName is required for writeAudit');
  }

  const normalizedAction = (action || '').toUpperCase();
  if (!VALID_ACTIONS.has(normalizedAction)) {
    throw new Error(
      `Invalid audit action '${action}'. Must be one of: ${Array.from(VALID_ACTIONS).join(', ')}`,
    );
  }

  let sanitizedOld = sanitizeSnapshot(oldValues);
  let sanitizedNew = sanitizeSnapshot(newValues);

  // Requirement: ANONYMIZE entries record changed field names only, not old values
  if (normalizedAction === 'ANONYMIZE' && oldValues && typeof oldValues === 'object') {
    sanitizedOld = {
      anonymizedFields: Object.keys(oldValues),
    };
  }

  const oldJson = sanitizedOld !== null ? JSON.stringify(sanitizedOld) : null;
  const newJson = sanitizedNew !== null ? JSON.stringify(sanitizedNew) : null;
  const actorUserId = actorId !== undefined && actorId !== null ? Number(actorId) : null;
  const recId = recordId !== undefined && recordId !== null ? Number(recordId) : null;

  const sql = `
    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      actor_user_id,
      old_values,
      new_values,
      request_id,
      ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await conn.execute(sql, [
    tableName,
    recId,
    normalizedAction,
    actorUserId,
    oldJson,
    newJson,
    requestId,
    ipAddress,
  ]);
  return result.insertId;
}

/**
 * Retrieves audit logs for a specific table record.
 */
export async function getAuditLogsForRecord(conn, { tableName, recordId, limit = 50, offset = 0 }) {
  const sql = `
    SELECT
      id,
      table_name,
      record_id,
      action,
      actor_user_id,
      old_values,
      new_values,
      request_id,
      ip_address,
      created_at
    FROM audit_log
    WHERE table_name = ? AND record_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await conn.query(sql, [tableName, recordId, Number(limit), Number(offset)]);
  return rows;
}

/**
 * Retrieves the latest transactional audit logs joined with actor details.
 */
export async function getLatestAuditLogs(conn, { limit = 50 } = {}) {
  try {
    const sql = `
      SELECT
        a.id,
        a.table_name,
        a.record_id,
        a.action,
        a.actor_user_id,
        a.created_at,
        u.full_name AS actor_name,
        u.role AS actor_role
      FROM audit_log a
      LEFT JOIN users u ON a.actor_user_id = u.user_id
      ORDER BY a.id DESC
      LIMIT ?
    `;
    const [rows] = await conn.query(sql, [Number(limit)]);
    return rows;
  } catch (err) {
    return [];
  }
}

