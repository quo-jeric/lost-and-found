/**
 * Location Repository
 * Strict SQL isolation for locations table.
 */

/**
 * Fetch all locations ordered alphabetically by location_name.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 * @returns {Promise<Array<{ location_id: number, location_name: string }>>}
 */
export async function findAllLocations(conn) {
  const sql = `
    SELECT location_id, location_name
    FROM locations
    ORDER BY location_name ASC
  `;
  const [rows] = await conn.query(sql);
  return rows;
}
