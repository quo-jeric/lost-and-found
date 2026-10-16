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

```
src/
  app.js              # Express app (no listen) - imported by tests
  server.js           # Starts HTTP server
  config/             # env loading + validation
  db/
    pool.js           # mysql2 pool
    migrations/       # numbered .sql files
    repositories/     # SQL lives here only
  middleware/         # auth, error handler, validation, rate limit
  routes/             # route definitions per resource
  controllers/        # req/res handling
  services/           # business logic
  utils/              # logger, AppError, helpers
tests/
  integration/        # supertest tests
  unit/
```

## 3. Environment Configuration

- Load with `dotenv` in `src/config/`; export a single frozen config object.
- Fail fast on startup if a required variable is missing.
- Commit `.env.example` with every variable and no real values. `.env` is git-ignored.

Required variables:

```
NODE_ENV=development
PORT=3306
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
SESSION_SECRET=
SESSION_MAX_AGE_MS=86400000
CORS_ORIGIN=
LOG_LEVEL=info
```

## 4. Database (Raw MySQL)

### Connection

- Use a single shared pool created in `src/db/pool.js`. Never open ad-hoc connections per request.
- Use `mysql2/promise`.

```js
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

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
});
```

- Verify connectivity at startup (`SELECT 1`) and exit non-zero on failure.
- Close the pool on `SIGTERM`/`SIGINT` for graceful shutdown.

### Query Rules

- **Always parameterize.** Use `?` or named placeholders via `pool.execute()` / `pool.query()`. Never concatenate or template user input into SQL.
- Dynamic identifiers (column or table names, `ORDER BY`) must be checked against a hard-coded allowlist.
- Select explicit columns. No `SELECT *` in application code.
- All SQL lives in `src/db/repositories/`. Controllers and services never contain SQL strings.
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

- Schema changes are numbered `.sql` files in `src/db/migrations/` (e.g. `001_create_users.sql`), applied in order. Never edit a migration that has been applied; add a new one.
- Use `InnoDB` and `utf8mb4` for all tables.
- Every table has: `id` (`BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`), `created_at`, `updated_at` (`TIMESTAMP`, with defaults).
- Define foreign keys and indexes explicitly; index every column used in frequent `WHERE`/`JOIN`.
- Store timestamps in UTC.
- Use `DECIMAL` for money, never `FLOAT`.
- Prefer soft delete (`deleted_at`) only where the requirement exists; otherwise hard delete.

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- Recommended: a pre-commit hook (`husky` + `lint-staged`) running ESLint and Prettier on staged files.

## 6. API Conventions

- Base path is versioned: `/api/v1/...`.
- Use REST semantics:
  - `GET` read, `POST` create, `PUT`/`PATCH` update, `DELETE` remove.
  - Return `201` for creates, `204` for successful deletes with no body.
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
- If cookies are used for auth on state-changing routes, add CSRF protection (e.g. `csrf-csrf` or a custom double-submit token) unless `sameSite: 'strict'` is enforced and documented.

### General Security

- Use `helmet` with sensible defaults.
- Configure `cors` with an explicit origin allowlist from `CORS_ORIGIN` and `credentials: true` only when needed.
- Apply `express-rate-limit` globally, with stricter limits on login and other sensitive routes.
- Disable the `x-powered-by` header.
- Keep dependencies updated; run `npm audit` in CI.
- Sanitize and validate all input; escape output where HTML is ever rendered.

## 8. Error Handling

- Define an `AppError` class in `src/utils/app-error.js`:

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

- Use a structured logger (`pino` recommended) in `src/utils/logger.js`. Do not use `console.log` in application code.
- Log level from `LOG_LEVEL`; JSON output in production, pretty output in development only.
- Use an HTTP request logger (e.g. `pino-http`) that attaches a request ID to every log line.
- Levels: `error` (failures needing attention), `warn` (recoverable/suspicious), `info` (lifecycle, requests), `debug` (diagnostics).
- Redact sensitive fields: `password`, `authorization`, `cookie`, `set-cookie`, tokens.

## 10. Testing

- Test HTTP behavior with `supertest` against the exported `app` (no real port binding).
- Use Vitest as the runner (ESM-native). Test files: `*.test.js` under `tests/`.
- Use a separate test database (`DB_NAME` set by test env, e.g. `myapp_test`). Never run tests against development or production data.
- Apply migrations before the suite; reset or truncate tables between tests (or wrap each test in a transaction/rollback where practical).
- For authenticated routes, use `supertest.agent(app)` so the session cookie persists across requests.
- Cover at minimum, per endpoint: success path, validation failure, unauthenticated (401), unauthorized (403), and not-found (404) cases.
- Keep unit tests for services and utilities free of DB and network access (mock repositories).
- Target: critical paths (auth, writes, transactions) must be tested; aim for sensible coverage, enforce a threshold in CI once the project stabilizes.

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../../src/app.js';

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
- CI must run, in order: `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm audit --omit=dev`.
- No merge with failing checks.

## 12. Definition of Done

- [ ] Code follows this spec and passes `lint` and `format:check`
- [ ] All SQL is parameterized and lives in repositories
- [ ] Inputs validated at the route boundary
- [ ] Errors use `AppError` and the shared response format
- [ ] Supertest coverage for new endpoints (success + failure paths)
- [ ] New env vars added to `.env.example` and config validation
- [ ] Schema changes shipped as a new numbered migration