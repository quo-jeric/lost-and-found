/**
 * Category Repository
 * Strict SQL isolation for categories table.
 */

/**
 * Fetch all categories ordered alphabetically by category_name.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @returns {Promise<Array<{ category_id: number, category_name: string }>>}
 */
export async function findAllCategories(conn) {
  const sql = `
    SELECT category_id, category_name
    FROM categories
    ORDER BY category_name ASC
  `;
  const [rows] = await conn.query(sql);
  return rows;
}
