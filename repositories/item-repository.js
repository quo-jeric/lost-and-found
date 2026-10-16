import { writeAudit } from './audit-repository.js';

/** Explicit projection — no SELECT * */
const ITEM_COLUMNS = [
  'item_id',
  'title',
  'description',
  'category_id',
  'color',
  'brand',
  'serial_number',
  'found_at',
  'location_id',
  'finder_name',
  'storage_notes',
  'logged_by',
  'item_status',
  'image_url',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Fetch a single item by its ID. Excludes archived items by default.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @param {number} itemId
 * @param {{ includeArchived?: boolean, forUpdate?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function findItemById(conn, itemId, { includeArchived = false, forUpdate = false } = {}) {
  const archiveClause = includeArchived ? '' : 'AND deleted_at IS NULL';
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const sql = `
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE item_id = ? ${archiveClause}
    LIMIT 1
    ${lockClause}
  `;
  const [rows] = await conn.execute(sql, [itemId]);
  return rows[0] || null;
}

/**
 * Insert a new item record. Must be called within an open transaction.
 *
 * @param {import('mysql2/promise').Connection} conn - Active transaction connection
 * @param {object} itemData
 * @returns {Promise<number>} The inserted item_id
 */
export async function insertItem(conn, itemData) {
  const {
    title,
    description = null,
    category_id,
    color = null,
    brand = null,
    serial_number = null,
    found_at,
    location_id,
    finder_name,
    storage_notes = null,
    logged_by,
    item_status = 'active',
    image_url = null,
  } = itemData;

  const sql = `
    INSERT INTO items (
      title, description, category_id, color, brand, serial_number,
      found_at, location_id, finder_name, storage_notes, logged_by,
      item_status, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await conn.execute(sql, [
    title,
    description,
    category_id,
    color,
    brand,
    serial_number,
    found_at,
    location_id,
    finder_name,
    storage_notes,
    logged_by,
    item_status,
    image_url,
  ]);

  return result.insertId;
}

/**
 * Allowlist of columns that may be changed via editItem.
 * Columns that must never be changed externally (item_id, logged_by, created_at, deleted_*) are excluded.
 */
const EDITABLE_COLUMNS = new Set([
  'title',
  'description',
  'category_id',
  'color',
  'brand',
  'serial_number',
  'found_at',
  'location_id',
  'finder_name',
  'storage_notes',
  'item_status',
  'image_url',
]);

/**
 * Update mutable fields on an existing item. Must be called within an open transaction.
 * Only columns present in `fields` are updated (partial update).
 *
 * @param {import('mysql2/promise').Connection} conn - Active transaction connection
 * @param {number} itemId
 * @param {object} fields - Key/value pairs of columns to update
 * @returns {Promise<void>}
 */
export async function updateItem(conn, itemId, fields) {
  const entries = Object.entries(fields).filter(([col]) => EDITABLE_COLUMNS.has(col));

  if (entries.length === 0) {
    // Nothing to update — not an error; caller should handle this case
    return;
  }

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  const sql = `UPDATE items SET ${setClauses} WHERE item_id = ?`;
  await conn.execute(sql, [...values, itemId]);
}

export { writeAudit };
