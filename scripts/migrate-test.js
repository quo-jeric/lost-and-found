// scripts/migrate-test.js
import 'dotenv/config';

process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'lost_and_found_test';
process.env.DB_MIGRATION_USER = process.env.TEST_DB_USER || 'laf_test';
process.env.DB_MIGRATION_PASSWORD = process.env.TEST_DB_PASSWORD || '';

// Dynamically import migrate runner with test env injected
await import('./migrate.js');
