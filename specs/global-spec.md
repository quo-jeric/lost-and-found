# Global Spec

Shared engineering rules for this Express.js project. All code, human or AI-generated, must follow this document.

## 1. Stack

- Runtime: Node.js (current LTS)
- Language: JavaScript with ES Modules (`"type": "module"` in `package.json`)
- Framework: Express
- Database: MySQL via `mysql2/promise`, raw SQL (no ORM)
- Auth: server-side sessions (`express-session` with a MySQL-backed store)
- Testing: `supertest` for HTTP tests, run with Vitest (ESM-native)
- Lint/format: ESLint + Prettier

## 2. Shared Rules

- Use `import`/`export` only. No `require`/`module.exports`.
- Include the `.js` extension in relative imports (`import x from './x.js'`).
- Use `async`/`await`. No raw callback chains or unhandled promises.
- Use `const` by default, `let` only when reassigning, never `var`.
- Strict equality (`===`) only.
- One responsibility per file. Keep route handlers thin; put logic in services and SQL in repositories.
- No secrets in source. All configuration comes from environment variables, validated at startup.
- Never log secrets, passwords, session IDs or full request bodies containing credentials.
- Prefer small pure functions; avoid hidden global state.
- Comments explain why, not what.

### Naming

| Item | Convention | Example |
| --- | --- | --- |
| Files | `kebab-case.js` | `user-service.js` |
| Variables/functions | `camelCase` | `findUserById` |
| Classes | `PascalCase` | `AppError` |
| Constants | `UPPER_SNAKE_CASE` | `SESSION_MAX_AGE` |
| DB tables/columns | `snake_case` | `created_at` |
| Routes | plural nouns, kebab-case | `/api/v1/user-roles` |

### Suggested Layout

The project uses a root-level layout (no `src/` folder):

```
lost-and-found-app/
  app.js                # Express app (no listen) - imported by tests
  server.js             # Starts HTTP server
  config/
    index.js            # env loading + validation
    db.js               # mysql2 pool (the only pool)
  migrations/           # numbered, forward-only .sql files
  repositories/         # SQL lives here only
  scripts/
    migrate.js          # raw SQL migration runner
    setup-db-users.sql  # one-time DBA script: DB users and grants
  middleware/           # auth, error handler, validation, rate limit
  routes/               # route definitions per resource
  controllers/          # req/res handling
  services/             # business logic
  utils/                # logger, AppError, helpers
  specs/                # global-spec.md, database-schema-plan.md
  tests/
    integration/        # supertest tests
    unit/
```

## 3. Environment Configuration

- Load with `dotenv` in `config/index.js`; export a single frozen config object.
- Fail fast on startup if a required variable is missing.
- Commit `.env.example` with every variable and no real values. `.env` is git-ignored.

Required variables:

```
NODE_ENV=development
PORT=3000
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_MIGRATION_USER=
DB_MIGRATION_PASSWORD=
SESSION_SECRET=
SESSION_MAX_AGE_MS=86400000
CORS_ORIGIN=
LOG_LEVEL=info
```

## 4. Database (Raw MySQL)

### Connection

- Use a single shared pool created in `config/db.js`. Never open ad-hoc connections per request.
- Use `mysql2/promise`.
- The app pool connects as the restricted app user (`DB_USER`, see Database Users and Privileges). Only `scripts/migrate.js` uses the migration user (`DB_MIGRATION_USER`).
- Never enable `multipleStatements` on the app pool. Only the migration runner's dedicated connection may enable it.

```js
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
```

- Verify connectivity at startup (`SELECT 1`) and exit non-zero on failure.
- Close the pool on `SIGTERM`/`SIGINT` for graceful shutdown.

### Query Rules

- **Always parameterize.** Use `?` or named placeholders via `pool.execute()` / `pool.query()`. Never concatenate or template user input into SQL.
- Dynamic identifiers (column or table names, `ORDER BY`) must be checked against a hard-coded allowlist.
- Select explicit columns. No `SELECT *` in application code.
- All SQL lives in `repositories/`. Controllers and services never contain SQL strings.
- No `DELETE FROM`, `REPLACE INTO` or `TRUNCATE` in application code (see Deletion Policy).
- Every write to a business table runs in a transaction together with its audit entry (see Audit Trail) and carries the acting user's id.
- Repository functions return plain objects and never expose `req`/`res`.
- Always paginate list queries with `LIMIT`/`OFFSET` and a hard maximum page size.

### Transactions

- Use a transaction for any operation that writes to more than one table or must be atomic.
- Always release the connection in `finally`.

```js
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  // ... queries using conn
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

### Schema and Migrations

The migration runner itself is specified in `specs/database-schema-plan.md`. Rules for migration files:

- Schema changes are numbered, forward-only `.sql` files in `migrations/` (e.g. `001_create_users.sql`), applied in order by `npm run db:migrate`. There are no down migrations: to undo a change, add a new migration.
- Never edit an applied migration. The runner stores a SHA-256 checksum for each applied file and aborts if one has changed.
- One logical change per file. MySQL commits DDL implicitly, so a migration cannot be rolled back. Write DDL idempotently where possible (`IF NOT EXISTS`) so a failed file can be fixed and re-run.
- Use `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` on every table.
- Store timestamps in UTC. Use `DECIMAL`, never `FLOAT`, for money.
- Define foreign keys and indexes explicitly. Index every foreign key column, `deleted_at`, and any column used in frequent `WHERE`/`JOIN`.

Every business table has these columns:

| Column | Definition |
| --- | --- |
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |
| `created_by` | `BIGINT UNSIGNED NULL` (FK to `users.id`; NULL for system actions) |
| `updated_by` | `BIGINT UNSIGNED NULL` (FK to `users.id`) |
| `deleted_at` | `TIMESTAMP NULL DEFAULT NULL` |
| `deleted_by` | `BIGINT UNSIGNED NULL` (FK to `users.id`) |

Exceptions: `audit_log` (append-only, no `updated_*` or `deleted_*`), `schema_migrations`, and the session store table `sessions`.

Constraint naming:

| Item | Convention | Example |
| --- | --- | --- |
| Foreign key | `fk_<table>_<column>` | `fk_items_reported_by` |
| Unique key | `uq_<table>_<column(s)>` | `uq_users_active_email` |
| Index | `idx_<table>_<column(s)>` | `idx_items_deleted_at` |

Foreign keys are named by column, not by parent table, because one table can reference the same parent more than once (e.g. `items.reported_by` and `items.claimed_by` both point to `users`).

### Deletion Policy (No Physical Deletes)

Records are kept for audit compliance. A business record is never physically removed.

- "Delete" means archive: set `deleted_at` and `deleted_by`, and write an audit entry.
- Repositories expose `archive()` and `restore()`. They never expose `delete()`.
- Reads exclude archived rows (`deleted_at IS NULL`) unless an explicit admin or audit function asks for them.
- Every foreign key is `ON DELETE RESTRICT ON UPDATE RESTRICT`. `CASCADE` and `SET NULL` are not allowed.
- Archiving a parent that still has active children is rejected with `409`, unless the service archives those children explicitly in the same transaction.
- The only permitted physical deletes are expired rows in the `sessions` store table, performed by the session store library.
- Unique keys on archivable tables must ignore archived rows, so a value can be reused after its owner is archived. Use a generated column that is `NULL` when archived (NULLs do not collide in a unique index):

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active_email VARCHAR(255) GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_users_active_email (active_email),
  KEY idx_users_deleted_at (deleted_at),
  KEY idx_users_created_by (created_by),
  KEY idx_users_updated_by (updated_by),
  KEY idx_users_deleted_by (deleted_by),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Personal data and erasure requests: archiving keeps the row. When a person's data must be erased (for example under the Philippine Data Privacy Act), anonymize it instead of deleting the row: overwrite personal fields with placeholders, keep the row and its ids so history stays intact, and record an `ANONYMIZE` audit entry.

The rule is enforced in three places: database privileges (below), the `check:no-delete` CI script, and code review.

### Database Users and Privileges

Create three MySQL users with least privilege. Grants live in `scripts/setup-db-users.sql`, run once by a DBA or root. They are not part of `db:migrate`.

| User | Privileges | Used by |
| --- | --- | --- |
| App user (`DB_USER`) | `SELECT, INSERT, UPDATE` on the app schema; additionally `DELETE` on `sessions` only | The running app |
| Migration user (`DB_MIGRATION_USER`) | `SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER` on the app schema. No `DROP`, no `DELETE` | `scripts/migrate.js` only |
| Test user | All privileges on the `_test` database only | Test setup and resets |

Without `DELETE` the app cannot run `DELETE` or `REPLACE`. Without `DROP` the migration user cannot drop or truncate tables. Dropping a table requires a DBA.

### Audit Trail

Every `INSERT`, `UPDATE`, archive, restore and anonymize on a business table writes a row to `audit_log`.

- The audit row is written in the same transaction as the change. If the audit insert fails, the change rolls back.
- Repository write functions accept `{ actorId, conn }` and call `writeAudit()` from `repositories/audit-repository.js`. Services take `actorId` from `req.session.userId`; system jobs pass `null`.
- Authentication events are audited too: `LOGIN`, `LOGIN_FAILED` and `LOGOUT`, plus any role or permission change.
- Snapshots in `old_values` and `new_values` never include `password_hash`, tokens or other secrets. `ANONYMIZE` entries record the names of changed fields only, never the old values.
- `audit_log` is append-only. Triggers reject `UPDATE` and `DELETE`, and no application or migration user holds `DROP`, so the table cannot be truncated either.
- Audit rows are kept indefinitely unless a documented retention policy says otherwise. `audit_log` is separate from application logs (Section 9).

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64) NOT NULL,
  record_id BIGINT UNSIGNED NULL,
  action ENUM('INSERT', 'UPDATE', 'ARCHIVE', 'RESTORE', 'ANONYMIZE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT') NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  request_id VARCHAR(64) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_log_table_record (table_name, record_id),
  KEY idx_audit_log_actor_user_id (actor_user_id),
  KEY idx_audit_log_created_at (created_at),
  CONSTRAINT fk_audit_log_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

The two immutability triggers go in their own migration files (one statement per file):

```sql
CREATE TRIGGER trg_audit_log_no_update BEFORE UPDATE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';
```

```sql
CREATE TRIGGER trg_audit_log_no_delete BEFORE DELETE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';
```

## 5. Linting and Formatting

### Tooling

- ESLint (flat config, `eslint.config.js`) + Prettier.
- Use `eslint-config-prettier` to disable ESLint rules that conflict with Prettier.
- Run lint and format checks in CI; a failing check blocks merge.

### Prettier (`.prettierrc`)

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

### ESLint (`eslint.config.js`)

```js
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/', 'coverage/', 'dist/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-return-await': 'error',
      'require-await': 'warn',
    },
  },
  prettier,
];
```

### Scripts

```json
{
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js",
    "db:migrate": "node scripts/migrate.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:no-delete": "! grep -rniE '(DELETE[[:space:]]+FROM|REPLACE[[:space:]]+INTO|TRUNCATE)' repositories services controllers routes middleware",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- Recommended: a pre-commit hook (`husky` + `lint-staged`) running ESLint and Prettier on staged files.

## 6. API Conventions

- Base path is versioned: `/api/v1/...`.
- Use REST semantics:
  - `GET` read, `POST` create, `PUT`/`PATCH` update, `DELETE` archives the resource (soft delete, never a physical delete; see Section 4).
  - Return `201` for creates, `204` for a successful archive with no body.
- Resource names are plural nouns; nest at most one level (`/users/:id/sessions`).
- Validate every request (body, params, query) at the route boundary with a schema validator (e.g. `zod` or `joi`) in a validation middleware. Reject unknown fields.
- Keep `app.js` free of `listen()` so tests can import the app.
- Use `express.json({ limit: '100kb' })` and set body size limits explicitly.
- Handlers are `async` and wrapped so rejected promises reach the error middleware (use a small `asyncHandler` wrapper, or Express 5 native support).

### Response Format

Success:

```json
{ "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```

Error:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Email is invalid", "details": [] } }
```

- `meta` is present only on paginated lists.
- Never leak stack traces, SQL errors or internal messages to clients in production.

### Status Codes

| Code | Use |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 204 | No content |
| 400 | Malformed or invalid request |
| 401 | Not authenticated |
| 403 | Authenticated but not allowed |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate unique key) |
| 422 | Semantic validation failure (if distinguished from 400) |
| 429 | Rate limited |
| 500 | Unexpected server error |

## 7. Authentication and Security

### Session-Based Auth

- Use `express-session` with a persistent MySQL-backed store (e.g. `express-mysql-session`). Never use the default in-memory store outside tests.
- Cookie settings:
  - `httpOnly: true`
  - `secure: true` in production (and `app.set('trust proxy', 1)` when behind a proxy)
  - `sameSite: 'lax'` (use `'strict'` if no cross-site flows are needed)
  - `maxAge` from `SESSION_MAX_AGE_MS`
- Set `resave: false` and `saveUninitialized: false`.
- Regenerate the session ID on login (`req.session.regenerate`) to prevent fixation; destroy the session and clear the cookie on logout.
- Store only a minimal identifier (e.g. `userId`, `role`) in the session, never the full user record or password hash.
- Hash passwords with `argon2` or `bcrypt` (cost >= 12). Never store or log plaintext passwords.
- Protect routes with an `requireAuth` middleware; use a `requireRole(...)` middleware for authorization. Default to deny.
- Use constant-ish generic error messages for login failures ("Invalid credentials").
- Write an `audit_log` entry for every `LOGIN`, `LOGIN_FAILED` and `LOGOUT` (see Audit Trail).
- If cookies are used for auth on state-changing routes, add CSRF protection (e.g. `csrf-csrf` or a custom double-submit token) unless `sameSite: 'strict'` is enforced and documented.

### General Security

- Use `helmet` with sensible defaults.
- Configure `cors` with an explicit origin allowlist from `CORS_ORIGIN` and `credentials: true` only when needed.
- Apply `express-rate-limit` globally, with stricter limits on login and other sensitive routes.
- Disable the `x-powered-by` header.
- Keep dependencies updated; run `npm audit` in CI.
- Sanitize and validate all input; escape output where HTML is ever rendered.

## 8. Error Handling

- Define an `AppError` class in `utils/app-error.js`:

```js
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
```

- Throw `AppError` for expected failures (not found, forbidden, validation, conflict). Let unexpected errors bubble up.
- Register a single centralized error-handling middleware last. It:
  - maps `AppError` to its status/code,
  - maps known MySQL errors (e.g. `ER_DUP_ENTRY` -> 409) to `AppError`,
  - logs unexpected errors with stack and request ID,
  - returns a generic message for unexpected errors in production.
- Add a catch-all 404 handler before the error middleware.
- Handle `unhandledRejection` and `uncaughtException` by logging and shutting down gracefully (let the process manager restart).

## 9. Logging

- Use a structured logger (`pino` recommended) in `utils/logger.js`. Do not use `console.log` in application code.
- Log level from `LOG_LEVEL`; JSON output in production, pretty output in development only.
- Use an HTTP request logger (e.g. `pino-http`) that attaches a request ID to every log line.
- Levels: `error` (failures needing attention), `warn` (recoverable/suspicious), `info` (lifecycle, requests), `debug` (diagnostics).
- Redact sensitive fields: `password`, `authorization`, `cookie`, `set-cookie`, tokens.

## 10. Testing

- Test HTTP behavior with `supertest` against the exported `app` (no real port binding).
- Use Vitest as the runner (ESM-native). Test files: `*.test.js` under `tests/`.
- Use a separate test database (`DB_NAME` set by test env, e.g. `myapp_test`). Never run tests against development or production data.
- Apply migrations before the suite. Run the app under test with the restricted app user, and reset tables between tests through a separate connection as the test user (privileged on the `_test` database only), or wrap each test in a transaction/rollback where practical.
- Every write-endpoint test asserts that an `audit_log` row was written with the correct actor and action.
- No test may expect a record to be physically removed. Assert that `deleted_at` is set instead.
- Include one test proving the app user cannot `DELETE` from a business table (expect a privilege error).
- For authenticated routes, use `supertest.agent(app)` so the session cookie persists across requests.
- Cover at minimum, per endpoint: success path, validation failure, unauthenticated (401), unauthorized (403), and not-found (404) cases.
- Keep unit tests for services and utilities free of DB and network access (mock repositories).
- Target: critical paths (auth, writes, transactions) must be tested; aim for sensible coverage, enforce a threshold in CI once the project stabilizes.

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../../app.js';

describe('POST /api/v1/auth/login', () => {
  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
```

## 11. Git and CI

- Branch names: `feature/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- CI must run, in order: `npm ci`, `npm run lint`, `npm run format:check`, `npm run check:no-delete`, `npm test`, `npm audit --omit=dev`.
- No merge with failing checks.

## 12. Definition of Done

- [ ] Code follows this spec and passes `lint` and `format:check`
- [ ] All SQL is parameterized and lives in repositories
- [ ] Inputs validated at the route boundary
- [ ] Errors use `AppError` and the shared response format
- [ ] Supertest coverage for new endpoints (success + failure paths)
- [ ] New env vars added to `.env.example` and config validation
- [ ] Schema changes shipped as a new numbered migration (applied migrations never edited)
- [ ] No physical deletes: records are archived with `deleted_at`/`deleted_by`, and `npm run check:no-delete` passes
- [ ] Every write to a business table is audited in the same transaction
- [ ] New tables have the standard audit columns, `ON DELETE RESTRICT` foreign keys, and column-based constraint names