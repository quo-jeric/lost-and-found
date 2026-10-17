import { writeAudit } from './audit-repository.js';

/** Explicit projection — no SELECT * */
const ITEM_COLUMNS = [
  'i.item_id',
  'i.title',
  'i.description',
  'i.category_id',
  'i.color',
  'i.brand',
  'i.serial_number',
  'i.found_at',
  'i.location_id',
  'i.finder_name',
  'i.storage_notes',
  'i.logged_by',
  'i.item_status',
  'i.image_url',
  'i.created_at',
  'i.updated_at',
  'c.category_name',
  'l.location_name',
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
  const archiveClause = includeArchived ? '' : "AND i.item_status = 'active'";
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const sql = `
    SELECT ${ITEM_COLUMNS}
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.category_id
    LEFT JOIN locations l ON i.location_id = l.location_id
    WHERE i.item_id = ? ${archiveClause}
    LIMIT 1
    ${lockClause}
  `;
  const [rows] = await conn.execute(sql, [itemId]);
  return rows[0] || null;
}

/**
 * Find items with filtering and pagination.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @param {object} [filters]
 * @param {object} [pagination]
 * @returns {Promise<{ items: object[], total: number, page: number, pageSize: number }>}
 */
export async function findItems(conn, filters = {}, pagination = {}) {
  const {
    category_id,
    location_id,
    item_status = 'active',
    search,
    from_date,
    to_date,
  } = filters;

  const conditions = [];
  const params = [];

  if (category_id !== undefined && category_id !== null && category_id !== '') {
    conditions.push('i.category_id = ?');
    params.push(Number(category_id));
  }

  if (location_id !== undefined && location_id !== null && location_id !== '') {
    conditions.push('i.location_id = ?');
    params.push(Number(location_id));
  }

  if (item_status && item_status !== 'all') {
    conditions.push('i.item_status = ?');
    params.push(item_status);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    conditions.push('(i.title LIKE ? OR i.brand LIKE ? OR i.color LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  if (from_date) {
    conditions.push('i.found_at >= ?');
    params.push(from_date);
  }

  if (to_date) {
    conditions.push('i.found_at <= ?');
    params.push(to_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = Math.max(1, Number(pagination.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(pagination.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS total FROM items i ${whereClause}`;
  const [countRows] = await conn.query(countSql, params);
  const total = Number(countRows[0]?.total ?? 0);

  const fetchSql = `
    SELECT ${ITEM_COLUMNS}
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.category_id
    LEFT JOIN locations l ON i.location_id = l.location_id
    ${whereClause}
    ORDER BY i.item_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await conn.query(fetchSql, [...params, pageSize, offset]);

  return { items: rows, total, page, pageSize };
}

/**
 * Soft-archive an item by setting item_status to 'inactive'.
 * Never physically deletes rows.
 *
 * @param {import('mysql2/promise').Connection} conn
 * @param {number} itemId
 * @returns {Promise<void>}
 */
export async function archiveItem(conn, itemId) {
  const sql = `UPDATE items SET item_status = 'inactive' WHERE item_id = ?`;
  await conn.execute(sql, [itemId]);
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
