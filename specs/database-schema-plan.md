# Implementation Plan: Raw SQL Migrations, Audit Trail & Database Architecture

This plan covers the migration runner, database users, audit trail, and repository rules for writing SQL tables and relationships with **raw SQL only**. It follows [`global-spec.md`](./global-spec.md) (Section 4: Database). If the two ever disagree, `global-spec.md` wins and this plan gets corrected.

Core principles:

- **No record is ever physically deleted.** "Delete" means archive (`deleted_at` / `deleted_by`).
- **Every change is attributable.** Each write records who did it and writes an `audit_log` row in the same transaction.
- **The database enforces the rules**, not just code review: least-privilege users, `RESTRICT` foreign keys, and an append-only audit table.

---

## 1. Project Directory Layout

Root-level layout (matches `global-spec.md`):

```
lost-and-found-app/
├── config/
│   ├── index.js              # env loading + validation
│   └── db.js                 # mysql2 pool (restricted app user)
├── migrations/               # numbered, forward-only raw .sql files
│   ├── 001_create_users.sql
│   ├── 002_create_audit_log.sql
│   ├── 003_audit_log_no_update_trigger.sql
│   ├── 004_audit_log_no_delete_trigger.sql
│   ├── 005_create_sessions.sql
│   └── ...                   # business tables defined by you
├── repositories/             # Raw SQL only (no SQL in services/controllers)
│   ├── audit-repository.js   # writeAudit()
│   └── user-repository.js
├── scripts/
│   ├── migrate.js            # Raw SQL migration runner
│   └── setup-db-users.sql    # One-time DBA script: users and grants
├── specs/
│   ├── global-spec.md
│   └── database-schema-plan.md   # This plan
├── server.js
├── app.js
├── package.json
└── .env
```

`schema_migrations` is created by the runner itself, so there is no `000_` migration file.

---

## 2. Standards Checklist for Every Migration

Every table you write must satisfy these rules from `global-spec.md` Section 4:

| Rule | Requirement |
| --- | --- |
| **Engine & charset** | `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` on every table |
| **Primary key** | `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` |
| **Timestamps** | `created_at`, `updated_at` (`TIMESTAMP`, defaults as in the spec), stored in UTC |
| **Audit columns** | `created_by`, `updated_by`, `deleted_at`, `deleted_by` on every business table. The `*_by` columns are `BIGINT UNSIGNED NULL` foreign keys to `users.id` |
| **Exceptions to the above** | `audit_log` (append-only), `schema_migrations`, `sessions` |
| **Foreign keys** | Always `ON DELETE RESTRICT ON UPDATE RESTRICT`. `CASCADE` and `SET NULL` are not allowed |
| **Constraint names** | Foreign key `fk_<table>_<column>`, unique `uq_<table>_<column(s)>`, index `idx_<table>_<column(s)>` |
| **Indexes** | Index every foreign key column and `deleted_at` |
| **Money** | `DECIMAL(10, 2)`, never `FLOAT` (e.g. `reward_amount DECIMAL(10, 2)`) |
| **Unique keys** | On archivable tables, use a generated column that is `NULL` when archived so values can be reused (see the `users` example in the spec) |
| **Idempotent DDL** | Use `IF NOT EXISTS` where possible; one logical change per file |

Foreign keys are named by column, not by parent table, because a table can reference the same parent twice (e.g. `items.reported_by` and `items.claimed_by` both reference `users`).

---

## 3. Database Users and Privileges (`scripts/setup-db-users.sql`)

Run once by a DBA or root, **outside** `npm run db:migrate`. Database name and passwords below are placeholders.

| User | Privileges | Used by |
| --- | --- | --- |
| `laf_app` | `SELECT, INSERT, UPDATE` on the schema; `DELETE` on `sessions` only | Running app (`DB_USER`) |
| `laf_migrate` | `SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER` on the schema. No `DROP`, no `DELETE` | `scripts/migrate.js` (`DB_MIGRATION_USER`) |
| `laf_test` | All privileges on `lost_and_found_test` only | Test setup and resets |

```sql
-- Part A: run before the first migration
CREATE USER IF NOT EXISTS 'laf_app'@'%' IDENTIFIED BY '<password>';
CREATE USER IF NOT EXISTS 'laf_migrate'@'%' IDENTIFIED BY '<password>';
CREATE USER IF NOT EXISTS 'laf_test'@'%' IDENTIFIED BY '<password>';

GRANT SELECT, INSERT, UPDATE ON lost_and_found.* TO 'laf_app'@'%';
GRANT SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER
  ON lost_and_found.* TO 'laf_migrate'@'%';
GRANT ALL PRIVILEGES ON lost_and_found_test.* TO 'laf_test'@'%';

-- Part B: run after migration 005 has created the sessions table
GRANT DELETE ON lost_and_found.sessions TO 'laf_app'@'%';
```

What this enforces at the database level:

- The app cannot run `DELETE` or `REPLACE` on business tables (both need the `DELETE` privilege).
- Neither the app nor the migration user can `DROP` or `TRUNCATE` a table, so `audit_log` cannot be wiped through them.
- `DELETE` on `sessions` is allowed only so the session store can purge expired sessions. Because `laf_app` cannot create tables, `sessions` is created by migration 005 and the session store must be configured with `createDatabaseTable: false`.

---

## 4. Audit Trail

### 4.1 `audit_log` table

Defined in `migrations/002_create_audit_log.sql` (full SQL in `global-spec.md` Section 4, Audit Trail). Columns: `id`, `table_name`, `record_id`, `action`, `actor_user_id`, `old_values` (JSON), `new_values` (JSON), `request_id`, `ip_address`, `created_at`.

Actions: `INSERT`, `UPDATE`, `ARCHIVE`, `RESTORE`, `ANONYMIZE`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`.

### 4.2 Immutability

Migrations 003 and 004 add `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise `SQLSTATE '45000'`, making `audit_log` append-only. One statement per file.

### 4.3 Rules for writing audit rows

1. Written in the **same transaction** as the change. If the audit insert fails, the change rolls back.
2. The actor comes from `req.session.userId`, passed down by the service. System jobs pass `actorId = null`.
3. Snapshots never contain `password_hash`, tokens or secrets.
4. `ANONYMIZE` entries record changed field names only, not old values, so erased personal data does not survive in the log.
5. Authentication events (`LOGIN`, `LOGIN_FAILED`, `LOGOUT`) and role/permission changes are audited.

---

## 5. Migration Runner Specification (`npm run db:migrate`)

A lightweight, dependency-free runner at `scripts/migrate.js`.

### 5.1 Tracking table

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schema_migrations_migration_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.2 Workflow

1. **Dedicated connection.** Open its own connection with `mysql2/promise` as the migration user (`DB_MIGRATION_USER`) with `multipleStatements: true`. It does not use the app pool, which must never enable multiple statements.
2. **Lock.** Run `SELECT GET_LOCK('lost_and_found_migrate', 0)`. If it returns `0`, another run is in progress: exit with a clear message. Release the lock in `finally`.
3. **Ensure `schema_migrations` exists.**
4. **Read and validate files.** List `migrations/*.sql`, sorted numerically. Names must match `^\d{3,}_[a-z0-9_]+\.sql$`. Duplicate numbers abort the run.
5. **Verify applied migrations.** For every row in `schema_migrations`, recompute the SHA-256 of the file. If the file is missing or the checksum differs, abort before running anything. This enforces "never edit an applied migration".
6. **Apply pending migrations in order.** For each one: run the file's SQL, then insert `migration_name` and `checksum`, then log the result.
7. **On failure, stop immediately** and exit non-zero, printing the failing file name.
8. Add `"db:migrate": "node scripts/migrate.js"` to `package.json`.

### 5.3 Important limitation: no rollback

MySQL commits DDL (`CREATE`, `ALTER`, `CREATE TRIGGER`) implicitly, so wrapping a migration in a transaction does **not** make it atomic. A failed multi-statement file can leave the schema half-applied, and nothing is recorded in `schema_migrations`. Mitigations:

- One logical change per file.
- Idempotent DDL (`IF NOT EXISTS`) so the file can be fixed and re-run.
- Forward-only: to undo a change, write a new migration.

### 5.4 Risk: triggers and binary logging

If binary logging is enabled, MySQL may reject `CREATE TRIGGER` for a non-SUPER user (error 1419) unless `log_bin_trust_function_creators=1` is set. Check this on your server before running migration 003.

---

## 6. Repository Integration Guidelines

1. **SQL isolation.** All SQL lives in `repositories/`. No SQL in controllers, routes or services.
2. **Parameterized queries.** Use `?` placeholders with `execute()` or `query()`. Never concatenate variables into SQL.
3. **Explicit projection.** No `SELECT *`. List columns.
4. **Exclude archived rows.** Default reads include `AND deleted_at IS NULL`.
5. **No deletes.** No `DELETE FROM`, `REPLACE INTO` or `TRUNCATE` in application code. Repositories expose `archive()` and `restore()`, never `delete()`. `npm run check:no-delete` enforces this in CI.
6. **Writes need an actor and a transaction.** Every write function takes `{ actorId, conn }`. The service opens the transaction (`getConnection`, `beginTransaction`, `commit`, `rollback`, `release()` in `finally`) so the change and its audit row commit together.

Example archive function:

```js
import { writeAudit } from './audit-repository.js';

export async function archiveItem(id, { actorId, conn }) {
  const [rows] = await conn.execute(
    'SELECT id, title, status FROM items WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  if (rows.length === 0) return null;

  await conn.execute(
    'UPDATE items SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ? WHERE id = ?',
    [actorId, actorId, id],
  );

  await writeAudit(conn, {
    tableName: 'items',
    recordId: id,
    action: 'ARCHIVE',
    actorId,
    oldValues: rows[0],
    newValues: { deleted_by: actorId },
  });

  return rows[0];
}
```

---

## 7. Next Steps

1. **Set up database users.** Run Part A of `scripts/setup-db-users.sql` as root or a DBA, and add `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` to `.env` and `.env.example`.
2. **Implement the runner.** Write `scripts/migrate.js` per Section 5 and add the `db:migrate` script.
3. **Write the foundation migrations.** `001_create_users`, `002_create_audit_log`, `003` and `004` (triggers), `005_create_sessions`.
4. **Apply and grant.** Run `npm run db:migrate`, then Part B of the setup script (`DELETE` on `sessions`).
5. **Add `audit-repository.js` and the `check:no-delete` script** (already defined in `global-spec.md`).
6. **Write your business table migrations** (`items`, claims, etc.) using the checklist in Section 2.
7. **Verify.**
   - A `DELETE` against a business table as `laf_app` fails with a privilege error.
   - `UPDATE` and `DELETE` on `audit_log` fail with "append-only".
   - Editing an applied migration file makes `db:migrate` abort.

### Open items for you

- Confirm the real database and test database names (placeholders used: `lost_and_found`, `lost_and_found_test`).
- Decide which tables need the generated-column unique key (any table with a natural unique value that must be reusable after archiving, such as `users.email`).
- Confirm how long audit rows must be retained. The spec currently keeps them indefinitely.