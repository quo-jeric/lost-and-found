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
