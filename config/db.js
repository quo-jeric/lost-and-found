import mysql from 'mysql2/promise';
import { config } from './index.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  charset: 'utf8mb4',
  timezone: 'Z', // JS Date <-> DB values are UTC
});

// Pin every pooled connection's session time zone to UTC.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

export default pool;