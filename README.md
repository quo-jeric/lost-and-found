# Lost and Found App

A backend service for a Lost and Found tracking system built with **Node.js**, **Express**, and **Raw MySQL** (no ORM).

---

## Features

- **Raw SQL Migrations:** Forward-only migration runner with SHA-256 checksum verification and advisory locks (`GET_LOCK`).
- **No Physical Deletes:** Strict soft-delete architecture (`deleted_at`, `deleted_by`) with foreign key constraints set to `ON DELETE RESTRICT`.
- **Transactional Audit Trail:** Every business write and auth event writes an audit log in the same transaction, automatically stripping sensitive credentials.
- **Least-Privilege Database Users:** Dedicated roles for runtime application (`laf_app`), migrations (`laf_migrate`), and testing (`laf_test`).
- **Strict SQL Isolation:** Repository layer pattern with parameterized queries and explicit column selections (no `SELECT *`).
- **Core Items Management:** Services for creating, updating, and querying lost items with payload validation, row-locking edits, and transactional audit logs.

> 💡 **For AI Agents & Developers:**
> Before executing tasks, always inspect [`records.md`](./records.md) for the latest system state, applied migrations, implemented modules, and development roadmap.

---

## Getting Started & Setup

### 1. Prerequisites
- **Node.js** 18+ (Node 20+ recommended)
- **MySQL** 8.0+

### 2. Installation
```bash
git clone <repo-url>
cd lost-and-found-app
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and provide your database credentials:
```bash
cp .env.example .env
```

Key environment variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME` — Database connection settings
- `DB_USER`, `DB_PASSWORD` — Restricted app user credentials
- `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` — Migration user credentials
- `SESSION_SECRET` — Session cookie signing key

### 4. Database Setup & Migrations
1. **Create database users (One-time, as root/DBA):**
   ```bash
   mysql -u root -p < scripts/setup-db-users.sql
   ```
2. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

### 5. Running Tests

The complete test command runs unit, database-backed integration, and browser
end-to-end tests. Integration and E2E tests require a separate MySQL test schema
whose name ends with `_test` (for example, `lost_and_found_test`) and the
`TEST_DB_*` environment variables shown in `.env.example`. Apply the migrations
to that schema before running those suites. The test harness refuses to run if
the configured database name does not end in `_test`. The migration script reads
`DB_*` (not `TEST_DB_*`), so point its `DB_*` settings and migration credentials
at the isolated test schema when applying migrations.

Install Playwright's Chromium browser once:
```bash
npx playwright install chromium
```

Run the test tiers:
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm test
```

See [`tests/TEST_PLAN.md`](./tests/TEST_PLAN.md) for per-suite implementation
plans and the API, database, session, and UI areas covered.

---

## Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts development server with nodemon auto-reloading |
| `npm start` | Starts server in production mode |
| `npm run db:migrate` | Runs all pending database migrations in order |
| `npm run check:no-delete` | Lints repository/service files to enforce no physical `DELETE` or `TRUNCATE` statements |
| `npm test` | Runs unit, MySQL integration, and Playwright E2E suites |
| `npm run test:unit` | Runs the isolated Vitest unit suite |
| `npm run test:integration` | Runs Supertest HTTP flows against the isolated MySQL schema |
| `npm run test:e2e` | Runs Playwright browser flows against the live test app |
| `npm run test:watch` | Runs Vitest in watch mode for active development |

---

## Git & Commit Conventions

This project follows **Conventional Commits** and structured git branching.

### Commit Types
```
<type>: <short description>

Example: feat: add items search and filtering repository
```

| Type | When to use |
| :--- | :--- |
| `feat:` | A new feature or functionality |
| `fix:` | A bug fix |
| `refactor:` | Code changes that neither fix a bug nor add a feature |
| `docs:` | Documentation changes only (e.g. `README.md`, specs) |
| `chore:` | Build tasks, package updates, configuration adjustments |
| `test:` | Adding or modifying tests |

### Branch Naming
- `feature/<short-name>`
- `fix/<short-name>`
- `chore/<short-name>`
