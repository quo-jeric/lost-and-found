import { pool } from '../config/db.js';
import { findItemById, insertItem, updateItem } from '../repositories/item-repository.js';
import { writeAudit } from '../repositories/audit-repository.js';
import { AppError } from '../utils/app-error.js';

// ─── Validation helpers ──────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['active', 'inactive']);

/**
 * Validate and coerce the payload used for creating an item.
 * Throws AppError(400) on any failure so the service never writes bad data.
 *
 * @param {object} data - Raw input
 * @returns {object} Cleaned, validated payload
 */
function validateItemPayload(data) {
  const errors = [];

  // title — required, 1-255 chars
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) errors.push({ field: 'title', message: 'Title is required.' });
  else if (title.length > 255) errors.push({ field: 'title', message: 'Title must be 255 characters or fewer.' });

  // category_id — required positive integer
  const category_id = Number(data.category_id);
  if (!Number.isInteger(category_id) || category_id <= 0) {
    errors.push({ field: 'category_id', message: 'A valid category_id is required.' });
  }

  // location_id — required positive integer
  const location_id = Number(data.location_id);
  if (!Number.isInteger(location_id) || location_id <= 0) {
    errors.push({ field: 'location_id', message: 'A valid location_id is required.' });
  }

  // finder_name — required, 1-75 chars
  const finder_name = typeof data.finder_name === 'string' ? data.finder_name.trim() : '';
  if (!finder_name) errors.push({ field: 'finder_name', message: 'finder_name is required.' });
  else if (finder_name.length > 75) errors.push({ field: 'finder_name', message: 'finder_name must be 75 characters or fewer.' });

  // found_at — required, valid date, not in the future
  let found_at = null;
  if (!data.found_at) {
    errors.push({ field: 'found_at', message: 'found_at is required.' });
  } else {
    const parsed = new Date(data.found_at);
    if (isNaN(parsed.getTime())) {
      errors.push({ field: 'found_at', message: 'found_at must be a valid date/time.' });
    } else if (parsed > new Date()) {
      errors.push({ field: 'found_at', message: 'found_at cannot be in the future.' });
    } else {
      // Store as MySQL DATETIME string in UTC
      found_at = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  // item_status — optional, defaults to 'active'
  const item_status = data.item_status ?? 'active';
  if (!VALID_STATUSES.has(item_status)) {
    errors.push({ field: 'item_status', message: "item_status must be 'active' or 'inactive'." });
  }

  // Optional string fields with length caps
  const optionalStrings = [
    { key: 'color', max: 50 },
    { key: 'brand', max: 50 },
    { key: 'serial_number', max: 255 },
    { key: 'image_url', max: 255 },
  ];

  const optional = {};
  for (const { key, max } of optionalStrings) {
    if (data[key] !== undefined && data[key] !== null) {
      const val = String(data[key]).trim();
      if (val.length > max) {
        errors.push({ field: key, message: `${key} must be ${max} characters or fewer.` });
      } else {
        optional[key] = val || null;
      }
    } else {
      optional[key] = null;
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
    title,
    description: data.description ? String(data.description).trim() || null : null,
    category_id,
    color: optional.color,
    brand: optional.brand,
    serial_number: optional.serial_number,
    found_at,
    location_id,
    finder_name,
    storage_notes: data.storage_notes ? String(data.storage_notes).trim() || null : null,
    item_status,
    image_url: optional.image_url,
  };
}

/**
 * Validate a positive integer item ID.
 *
 * @param {*} id
 * @returns {number} Coerced integer
 */
function validateItemId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('Invalid item ID.', { status: 400, code: 'VALIDATION_ERROR' });
  }
  return n;
}

/**
 * Validate the actorId provided by the caller (set by auth middleware, not this service).
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
 * Remap well-known MySQL error codes to meaningful AppErrors so callers
 * receive structured responses rather than raw DB exceptions.
 *
 * @param {Error} err
 */
function remapDbError(err) {
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    throw new AppError(
      'One or more referenced records do not exist (category, location, or user).',
      { status: 400, code: 'INVALID_REFERENCE' },
    );
  }
  throw err; // let unexpected errors bubble up
}

// ─── Service methods ──────────────────────────────────────────────────────────

/**
 * Add a new lost item record.
 *
 * The caller (controller) is responsible for setting `actorId` from the
 * authenticated session. This service does not inspect HTTP state.
 *
 * @param {object} itemData - Raw item fields from the request
 * @param {{ actorId: number, requestId?: string|null, ipAddress?: string|null }} context
 * @returns {Promise<object>} The newly created item record
 */
export async function addItem(itemData, { actorId, requestId = null, ipAddress = null }) {
  const validatedActorId = validateActorId(actorId);
  const payload = validateItemPayload(itemData);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const insertedId = await insertItem(conn, { ...payload, logged_by: validatedActorId }).catch(remapDbError);
    const createdRecord = await findItemById(conn, insertedId);

    await writeAudit(conn, {
      tableName: 'items',
      recordId: insertedId,
      action: 'INSERT',
      actorId: validatedActorId,
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
 * Edit an existing lost item. Only fields present in `updateData` are changed
 * (partial update). `logged_by` cannot be changed after creation.
 *
 * @param {number|string} itemId
 * @param {object} updateData - Partial item fields to update
 * @param {{ actorId: number, requestId?: string|null, ipAddress?: string|null }} context
 * @returns {Promise<object>} The updated item record
 */
export async function editItem(itemId, updateData, { actorId, requestId = null, ipAddress = null }) {
  const validatedId = validateItemId(itemId);
  const validatedActorId = validateActorId(actorId);

  // Validate only the fields that were actually supplied
  const allowedKeys = [
    'title', 'description', 'category_id', 'color', 'brand', 'serial_number',
    'found_at', 'location_id', 'finder_name', 'storage_notes', 'item_status', 'image_url',
  ];
  const supplied = Object.fromEntries(
    Object.entries(updateData).filter(([k]) => allowedKeys.includes(k)),
  );

  if (Object.keys(supplied).length === 0) {
    throw new AppError('No editable fields were provided.', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  // Run partial validation — reuse validateItemPayload on a merged "full" object
  // so required-field checks only fire when that field is actually supplied.
  const partialErrors = [];

  if ('title' in supplied) {
    const title = typeof supplied.title === 'string' ? supplied.title.trim() : '';
    if (!title) partialErrors.push({ field: 'title', message: 'Title cannot be empty.' });
    else if (title.length > 255) partialErrors.push({ field: 'title', message: 'Title must be 255 characters or fewer.' });
    else supplied.title = title;
  }

  if ('category_id' in supplied) {
    const n = Number(supplied.category_id);
    if (!Number.isInteger(n) || n <= 0) partialErrors.push({ field: 'category_id', message: 'A valid category_id is required.' });
    else supplied.category_id = n;
  }

  if ('location_id' in supplied) {
    const n = Number(supplied.location_id);
    if (!Number.isInteger(n) || n <= 0) partialErrors.push({ field: 'location_id', message: 'A valid location_id is required.' });
    else supplied.location_id = n;
  }

  if ('finder_name' in supplied) {
    const v = typeof supplied.finder_name === 'string' ? supplied.finder_name.trim() : '';
    if (!v) partialErrors.push({ field: 'finder_name', message: 'finder_name cannot be empty.' });
    else if (v.length > 75) partialErrors.push({ field: 'finder_name', message: 'finder_name must be 75 characters or fewer.' });
    else supplied.finder_name = v;
  }

  if ('found_at' in supplied) {
    const parsed = new Date(supplied.found_at);
    if (isNaN(parsed.getTime())) {
      partialErrors.push({ field: 'found_at', message: 'found_at must be a valid date/time.' });
    } else if (parsed > new Date()) {
      partialErrors.push({ field: 'found_at', message: 'found_at cannot be in the future.' });
    } else {
      supplied.found_at = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  if ('item_status' in supplied && !VALID_STATUSES.has(supplied.item_status)) {
    partialErrors.push({ field: 'item_status', message: "item_status must be 'active' or 'inactive'." });
  }

  const stringCaps = { color: 50, brand: 50, serial_number: 255, image_url: 255 };
  for (const [key, max] of Object.entries(stringCaps)) {
    if (key in supplied && supplied[key] !== null) {
      const v = String(supplied[key]).trim();
      if (v.length > max) partialErrors.push({ field: key, message: `${key} must be ${max} characters or fewer.` });
      else supplied[key] = v || null;
    }
  }

  if (partialErrors.length > 0) {
    throw new AppError('Validation failed.', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: partialErrors,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existingRecord = await findItemById(conn, validatedId, { forUpdate: true });
    if (!existingRecord) {
      throw new AppError('Item not found.', { status: 404, code: 'NOT_FOUND' });
    }

    await updateItem(conn, validatedId, supplied).catch(remapDbError);

    const updatedRecord = await findItemById(conn, validatedId);

    await writeAudit(conn, {
      tableName: 'items',
      recordId: validatedId,
      action: 'UPDATE',
      actorId: validatedActorId,
      oldValues: existingRecord,
      newValues: updatedRecord,
      requestId,
      ipAddress,
    });

    await conn.commit();
    return updatedRecord;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Retrieve a single item by ID. Read-only; uses the pool directly.
 *
 * @param {number|string} itemId
 * @returns {Promise<object|null>}
 */
export async function getItemById(itemId) {
  const validatedId = validateItemId(itemId);
  return findItemById(pool, validatedId);
}
