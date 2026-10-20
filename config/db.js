import mysql from 'mysql2/promise';
import { config } from './index.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  namedPlaceholders: true,
  charset: 'utf8mb4',
  timezone: 'Z', // JS Date <-> DB values are UTC
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,

  ssl: config.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true} : undefined,
});

// Pin every pooled connection's session time zone to UTC.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

export default pool;