import 'dotenv/config';

const requiredEnvVars = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'SESSION_SECRET',
];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || (process.env.NODE_ENV === 'production' ? 2 : 10),
    migrationUser: process.env.DB_MIGRATION_USER || process.env.DB_USER,
    migrationPassword: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD,
  }),
  session: Object.freeze({
    secret: process.env.SESSION_SECRET,
    maxAgeMs: Number(process.env.SESSION_MAX_AGE_MS) || 86400000,
  }),
  cors: Object.freeze({
    origin: process.env.CORS_ORIGIN || '',
  }),
  logging: Object.freeze({
    level: process.env.LOG_LEVEL || 'info',
  }),
});

export default config;
