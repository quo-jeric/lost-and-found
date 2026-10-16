import { pool } from '../config/db.js';
import { findItemById, archiveItem } from '../repositories/item-repository.js';
import {
  findClaimById,
  findPendingClaimByContact,
  insertClaim,
  findClaims,
  updateClaimStatus,
} from '../repositories/claim-repository.js';
import { writeAudit } from '../repositories/audit-repository.js';
import { AppError } from '../utils/app-error.js';

// ─── Validation helpers ──────────────────────────────────────────────────────

// RFC-5322-inspired, pragmatic regex sufficient for user-facing input checks.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROOF_MAX_LENGTH = 5000;

/**
 * Validate and normalize the public claim payload.
 * Runs before any connection is acquired or transaction opened.
 *
 * @param {object} data - Raw request input
 * @returns {object} Cleaned, validated payload
 */
function validateClaimPayload(data) {
  const errors = [];

  // item_id — required positive integer
  const item_id = Number(data.item_id);
  if (!Number.isInteger(item_id) || item_id <= 0) {
    errors.push({ field: 'item_id', message: 'A valid item_id is required.' });
  }

  // claimant_name — required, 1-50 chars
  const claimant_name = typeof data.claimant_name === 'string' ? data.claimant_name.trim() : '';
  if (!claimant_name) {
    errors.push({ field: 'claimant_name', message: 'claimant_name is required.' });
  } else if (claimant_name.length > 50) {
    errors.push({ field: 'claimant_name', message: 'claimant_name must be 50 characters or fewer.' });
  }

  // claimant_email — optional, but validated for format when present
  let claimant_email = null;
  if (data.claimant_email !== undefined && data.claimant_email !== null && data.claimant_email !== '') {
    claimant_email = String(data.claimant_email).trim();
    if (claimant_email.length > 50) {
      errors.push({ field: 'claimant_email', message: 'claimant_email must be 50 characters or fewer.' });
      claimant_email = null; // prevent format check on already-invalid value
    } else if (!EMAIL_REGEX.test(claimant_email)) {
      errors.push({ field: 'claimant_email', message: 'claimant_email must be a valid email address.' });
      claimant_email = null;
    }
  }

  // claimant_phone — optional, max 20 chars
  let claimant_phone = null;
  if (data.claimant_phone !== undefined && data.claimant_phone !== null && data.claimant_phone !== '') {
    claimant_phone = String(data.claimant_phone).trim();
    if (claimant_phone.length > 20) {
      errors.push({ field: 'claimant_phone', message: 'claimant_phone must be 20 characters or fewer.' });
      claimant_phone = null;
    } else if (!claimant_phone) {
      // Treat whitespace-only as absent
      claimant_phone = null;
    }
  }

  // Contact presence check — at least one valid contact must exist
  // Only run if neither email nor phone errored out (to avoid misleading "no contact" when there IS one but it's invalid)
  const hasValidEmail = claimant_email !== null;
  const hasValidPhone = claimant_phone !== null;
  // Check raw input intent: user provided something in either field
  const attemptedEmail = data.claimant_email !== undefined && data.claimant_email !== null && String(data.claimant_email).trim() !== '';
  const attemptedPhone = data.claimant_phone !== undefined && data.claimant_phone !== null && String(data.claimant_phone).trim() !== '';

  if (!attemptedEmail && !attemptedPhone) {
    // User provided neither — primary contact error
    errors.push({
      field: 'contact',
      message: 'At least one contact method (claimant_email or claimant_phone) is required.',
    });
  } else if ((attemptedEmail && !hasValidEmail) || (attemptedPhone && !hasValidPhone)) {
    // User attempted to provide contact(s) but both were invalid — already captured above per-field.
    // Only add the general contact error if the net result is still zero valid contacts.
    if (!hasValidEmail && !hasValidPhone) {
      errors.push({
        field: 'contact',
        message: 'At least one contact method (claimant_email or claimant_phone) must be valid.',
      });
    }
  }

  // proof_description — optional, max 5000 chars
  let proof_description = null;
  if (data.proof_description !== undefined && data.proof_description !== null) {
    proof_description = String(data.proof_description).trim() || null;
    if (proof_description && proof_description.length > PROOF_MAX_LENGTH) {
      errors.push({
        field: 'proof_description',
        message: `proof_description must be ${PROOF_MAX_LENGTH} characters or fewer.`,
      });
    }
  }

  if (errors.length > 0) {
    throw new AppError('Validation failed.', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: errors,
    });
  }

  return {
    item_id,
    claimant_name,
    claimant_email,
    claimant_phone,
    proof_description,
  };
}

/**
 * Validate a positive integer claim ID.
 *
 * @param {*} id
 * @returns {number} Coerced integer
 */
function validateClaimId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('Invalid claim ID.', { status: 400, code: 'VALIDATION_ERROR' });
  }
  return n;
}

/**
 * Validate a positive integer actor ID.
 *
 * @param {*} actorId
 * @returns {number} Coerced integer
 */
function validateActorId(actorId) {
  const n = Number(actorId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('A valid actorId is required.', { status: 400, code: 'VALIDATION_ERROR' });
  }
  return n;
}


// ─── MySQL error helpers ──────────────────────────────────────────────────────

/**
 * Remap well-known MySQL constraint errors to structured AppErrors.
 *
 * @param {Error} err
 */
function remapDbError(err) {
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    throw new AppError('One or more referenced records do not exist (item or user).', {
      status: 400,
      code: 'INVALID_REFERENCE',
    });
  }
  throw err;
}

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * Submit a public claim for a specific lost item.
 *
 * No authenticated actorId is required — public users do not hold accounts.
 * The audit log row records `actorId: null` and captures client request metadata instead.
 *
 * @param {object} claimData - Raw claim fields from the caller
 * @param {{ requestId?: string|null, ipAddress?: string|null }} [context] - Request metadata
 * @returns {Promise<object>} The newly created claim record
 */
export async function raiseClaim(claimData, { requestId = null, ipAddress = null } = {}) {
  // 1. Fail fast — validate before touching the connection pool.
  const payload = validateClaimPayload(claimData);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 2. Verify the target item exists and is active.
    const item = await findItemById(conn, payload.item_id);
    if (!item) {
      throw new AppError('Item not found.', { status: 404, code: 'NOT_FOUND' });
    }
    if (item.item_status !== 'active') {
      throw new AppError('Claims can only be raised for active items.', {
        status: 400,
        code: 'ITEM_INACTIVE',
      });
    }

    // 3. Check for a duplicate pending claim from the same claimant on this item.
    const duplicate = await findPendingClaimByContact(conn, {
      itemId: payload.item_id,
      email: payload.claimant_email,
      phone: payload.claimant_phone,
    });
    if (duplicate) {
      throw new AppError(
        'A pending claim for this item with the same contact information already exists.',
        { status: 409, code: 'DUPLICATE_CLAIM' },
      );
    }

    // 4. Insert the new claim record.
    const insertedId = await insertClaim(conn, payload).catch(remapDbError);

    // 5. Re-fetch the persisted record for the response and audit snapshot.
    const createdRecord = await findClaimById(conn, insertedId);

    // 6. Write the audit log entry in the same transaction.
    //    actorId is null — public claimant; client metadata provides traceability.
    await writeAudit(conn, {
      tableName: 'claims',
      recordId: insertedId,
      action: 'INSERT',
      actorId: null,
      newValues: createdRecord,
      requestId,
      ipAddress,
    });

    await conn.commit();
    return createdRecord;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Retrieve a single claim by ID. Read-only; uses the pool directly.
 *
 * @param {number|string} claimId
 * @returns {Promise<object|null>}
 */
export async function getClaimById(claimId) {
  const validatedId = validateClaimId(claimId);
  return findClaimById(pool, validatedId);
}

/**
 * List claims with filtering and pagination. Staff-only.
 *
 * @param {object} [filters]
 * @param {object} [pagination]
 * @param {object} context
 * @param {number} context.actorId - Staff user ID
 * @returns {Promise<{ claims: object[], total: number, page: number, pageSize: number }>}
 */
export async function listClaims(filters = {}, pagination = {}, context = {}) {
  validateActorId(context.actorId);
  return findClaims(pool, filters, pagination);
}

/**
 * Review a claim (approve or reject).
 * Staff role required at route level.
 *
 * @param {number|string} claimId
 * @param {object} payload
 * @param {'accepted'|'rejected'} payload.status
 * @param {string} [payload.processingNotes]
 * @param {object} context
 * @param {number} context.actorId
 * @param {string|null} [context.requestId]
 * @param {string|null} [context.ipAddress]
 * @returns {Promise<object>} Updated claim record
 */
export async function reviewClaim(claimId, payload = {}, context = {}) {
  const validatedId = validateClaimId(claimId);
  const validatedActorId = validateActorId(context.actorId);
  const { requestId = null, ipAddress = null } = context;

  const { status, processingNotes } = payload;
  if (status !== 'accepted' && status !== 'rejected') {
    throw new AppError('status must be "accepted" or "rejected".', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  let notes = null;
  if (processingNotes !== undefined && processingNotes !== null) {
    notes = String(processingNotes).trim();
    if (notes.length > 2000) {
      throw new AppError('processingNotes must be 2000 characters or fewer.', {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existingClaim = await findClaimById(conn, validatedId, { forUpdate: true });
    if (!existingClaim) {
      throw new AppError('Claim not found.', { status: 404, code: 'NOT_FOUND' });
    }

    if (existingClaim.claim_status !== 'pending') {
      throw new AppError('Only pending claims can be reviewed.', {
        status: 409,
        code: 'CLAIM_ALREADY_REVIEWED',
      });
    }

    if (status === 'accepted') {
      const existingItem = await findItemById(conn, existingClaim.item_id, {
        forUpdate: true,
        includeArchived: true,
      });

      if (existingItem) {
        await archiveItem(conn, existingClaim.item_id);

        await writeAudit(conn, {
          tableName: 'items',
          recordId: existingClaim.item_id,
          action: 'UPDATE',
          actorId: validatedActorId,
          oldValues: existingItem,
          newValues: { ...existingItem, item_status: 'inactive' },
          requestId,
          ipAddress,
        });
      }
    }

    const resolvedAt = new Date();
    await updateClaimStatus(conn, validatedId, {
      status,
      processedBy: validatedActorId,
      processingNotes: notes,
      resolvedAt,
    });

    const updatedClaim = await findClaimById(conn, validatedId);

    await writeAudit(conn, {
      tableName: 'claims',
      recordId: validatedId,
      action: 'UPDATE',
      actorId: validatedActorId,
      oldValues: existingClaim,
      newValues: updatedClaim,
      requestId,
      ipAddress,
    });

    await conn.commit();
    return updatedClaim;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

