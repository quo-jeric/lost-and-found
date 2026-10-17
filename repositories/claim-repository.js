/** Explicit projection — no SELECT * */
const CLAIM_COLUMNS = [
  'claim_id',
  'item_id',
  'claimant_name',
  'claimant_email',
  'claimant_phone',
  'proof_description',
  'claim_status',
  'processed_by',
  'processing_notes',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Fetch a single claim by its ID.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @param {number} claimId
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function findClaimById(conn, claimId, { forUpdate = false } = {}) {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM claims
    WHERE claim_id = ?
    LIMIT 1
    ${lockClause}
  `;
  const [rows] = await conn.execute(sql, [claimId]);
  return rows[0] || null;
}

/**
 * Look for an existing pending claim on the same item with a matching email or phone.
 * Used to prevent duplicate submissions from the same claimant.
 *
 * At least one of `email` or `phone` must be non-null for the check to be meaningful;
 * callers (claims-service) guarantee this through payload validation.
 *
 * @param {import('mysql2/promise').Connection} conn
 * @param {{ itemId: number, email: string|null, phone: string|null }} params
 * @returns {Promise<object|null>} Existing pending claim or null
 */
export async function findPendingClaimByContact(conn, { itemId, email, phone }) {
  // Build a dynamic WHERE fragment that only tests non-null values.
  // Both email and phone may be null individually; the OR ensures a hit on either match.
  const sql = `
    SELECT claim_id, item_id, claimant_email, claimant_phone, claim_status
    FROM claims
    WHERE item_id = ?
      AND claim_status = 'pending'
      AND (
        (? IS NOT NULL AND claimant_email = ?)
        OR
        (? IS NOT NULL AND claimant_phone = ?)
      )
    LIMIT 1
  `;
  const [rows] = await conn.execute(sql, [
    itemId,
    email, email,
    phone, phone,
  ]);
  return rows[0] || null;
}

/**
 * Insert a new claim record. Must be called within an open transaction.
 *
 * @param {import('mysql2/promise').Connection} conn - Active transaction connection
 * @param {object} claimData
 * @param {number} claimData.item_id
 * @param {string} claimData.claimant_name
 * @param {string|null} claimData.claimant_email
 * @param {string|null} claimData.claimant_phone
 * @param {string|null} claimData.proof_description
 * @returns {Promise<number>} The inserted claim_id
 */
export async function insertClaim(conn, claimData) {
  const {
    item_id,
    claimant_name,
    claimant_email = null,
    claimant_phone = null,
    proof_description = null,
  } = claimData;

  const sql = `
    INSERT INTO claims (
      item_id, claimant_name, claimant_email, claimant_phone,
      proof_description, claim_status
    ) VALUES (?, ?, ?, ?, ?, 'pending')
  `;

  const [result] = await conn.execute(sql, [
    item_id,
    claimant_name,
    claimant_email,
    claimant_phone,
    proof_description,
  ]);

  return result.insertId;
}

/**
 * Find claims with filtering and pagination.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @param {object} [filters]
 * @param {object} [pagination]
 * @returns {Promise<{ claims: object[], total: number, page: number, pageSize: number }>}
 */
export async function findClaims(conn, filters = {}, pagination = {}) {
  const {
    item_id,
    claim_status,
    search,
  } = filters;

  const conditions = [];
  const params = [];

  if (item_id !== undefined && item_id !== null && item_id !== '') {
    conditions.push('item_id = ?');
    params.push(Number(item_id));
  }

  if (claim_status) {
    conditions.push('claim_status = ?');
    params.push(claim_status);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    conditions.push('(claimant_name LIKE ? OR claimant_email LIKE ? OR claimant_phone LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = Math.max(1, Number(pagination.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(pagination.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM claims c ${whereClause}`;
  const [countRows] = await conn.query(countSql, params);
  const total = Number(countRows[0]?.total ?? 0);

  const fetchSql = `
    SELECT 
      c.claim_id, c.item_id, c.claimant_name, c.claimant_email, c.claimant_phone,
      c.proof_description, c.claim_status, c.processed_by, c.processing_notes,
      c.resolved_at, c.created_at, c.updated_at,
      i.title AS item_title
    FROM claims c
    LEFT JOIN items i ON c.item_id = i.item_id
    ${whereClause}
    ORDER BY c.created_at DESC, c.claim_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await conn.query(fetchSql, [...params, pageSize, offset]);

  return { claims: rows, total, page, pageSize };
}

/**
 * Update a claim's review status, handler, notes, and resolution timestamp.
 * Must be called within an open transaction.
 *
 * @param {import('mysql2/promise').Connection} conn - Active transaction connection
 * @param {number} claimId
 * @param {object} updates
 * @param {'accepted'|'rejected'} updates.status
 * @param {number} updates.processedBy
 * @param {string|null} [updates.processingNotes]
 * @param {Date|string} [updates.resolvedAt]
 * @returns {Promise<void>}
 */
export async function updateClaimStatus(conn, claimId, { status, processedBy, processingNotes = null, resolvedAt = new Date() }) {
  const sql = `
    UPDATE claims
    SET claim_status = ?, processed_by = ?, processing_notes = ?, resolved_at = ?
    WHERE claim_id = ?
  `;
  await conn.execute(sql, [status, processedBy, processingNotes, resolvedAt, claimId]);
}

