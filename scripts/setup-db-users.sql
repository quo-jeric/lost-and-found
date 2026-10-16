-- scripts/setup-db-users.sql
-- One-time DBA script: DB users and privileges
-- Run once by root or a DBA, outside npm run db:migrate.
-- Database name and passwords below should be updated to match your environment.

-- Part A: Run before the first migration
CREATE USER IF NOT EXISTS 'laf_app'@'%' IDENTIFIED BY 'change_me_app_password';
CREATE USER IF NOT EXISTS 'laf_migrate'@'%' IDENTIFIED BY 'change_me_migrate_password';
CREATE USER IF NOT EXISTS 'laf_test'@'%' IDENTIFIED BY 'change_me_test_password';

GRANT SELECT, INSERT, UPDATE ON lost_and_found_db.* TO 'laf_app'@'%';
GRANT SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER
  ON lost_and_found_db.* TO 'laf_migrate'@'%';
GRANT ALL PRIVILEGES ON lost_and_found_test.* TO 'laf_test'@'%';

FLUSH PRIVILEGES;

-- Part B: Run after migration has created the sessions table
-- Grants DELETE privilege on sessions only, allowing the session store to purge expired sessions.
GRANT DELETE ON lost_and_found_db.sessions TO 'laf_app'@'%';

FLUSH PRIVILEGES;
