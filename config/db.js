import mysql from 'mysql2/promise';
import { config } from './index.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  namedPlaceholders: true,
  charset: 'utf8mb4',
  timezone: 'Z',
});

// Pin every pooled connection's session time zone to UTC.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

export default pool;