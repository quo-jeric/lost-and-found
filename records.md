# Project Progress & Codebase State Records (`records.md`)

> **Notice for AI Agents & Developers:**
> Always read this document before starting any new task in this repository. It serves as the single source of truth for the codebase's current state, applied migrations, implemented modules, conventions, and upcoming roadmap. When completing tasks or milestones, update this document to keep it current.

---

## 1. Project Overview & Tech Stack

- **Application:** Lost and Found Backend Tracking Service
- **Runtime & Language:** Node.js (v20+ recommended), ES Modules (`"type": "module"`)
- **Framework:** Express.js (`v5.2.1`)
- **Database:** MySQL 8.0+ via `mysql2/promise` (Raw SQL only, no ORM)
- **Testing Framework:** Vitest (`v5.0.5`, ESM-native)
- **Linting & Rules:** Strict SQL isolation, transactional audit logging, zero physical deletes

---

## 2. Current Codebase State

### 2.1 File & Directory Map

```text
lost-and-found-app/
├── config/
│   ├── index.js                     # Environment variable validation and frozen config export
│   └── db.js                        # MySQL connection pool (time_zone = +00:00, utf8mb4)
├── middleware/                      # Express middleware (renamed from middlewares/ per spec)
│   ├── auth.js                      # requireAuth (401), requireRole factory (401/403), optionalAuth
│   └── session.js                   # express-session + express-mysql-session factory
├── migrations/                      # Forward-only SQL migrations (managed by scripts/migrate.js)
│   ├── 001_create_users.sql         # users table
│   ├── 002_create_categories.sql    # categories table
│   ├── 003_create_locations.sql     # locations table
│   ├── 004_create_items.sql         # items table (initial definition)
│   ├── 005_create_claims.sql        # claims table
│   ├── 006_create_audit_logs.sql    # audit_logs table
│   └── 007_add_item_category.sql    # adds category_id FK to items table
├── repositories/                    # SQL layer (strict isolation: only repositories execute SQL)
│   ├── audit-repository.js          # writeAudit(), getAuditLogsForRecord() (sanitizes sensitive fields)
│   ├── user-repository.js           # findUserById(), findUserByEmail(), createUser(), archiveUser(), restoreUser()
│   ├── item-repository.js           # findItemById(), findItems(), insertItem(), updateItem(), archiveItem()
│   └── claim-repository.js          # findClaimById(), findClaims(), findPendingClaimByContact(), insertClaim(), updateClaimStatus()
├── services/                        # Business logic layer (auth-agnostic, transaction orchestration)
│   ├── auth-service.js              # login() (timing-safe, argon2id), logout(), hashPassword(), verifyPassword()
│   ├── items-service.js             # addItem(), editItem(), getItemById(), listItems(), archiveItem()
│   └── claims-service.js            # raiseClaim(), getClaimById(), listClaims(), reviewClaim()
├── controllers/
│   ├── auth-controller.js           # loginHandler, logoutHandler, meHandler (session regenerate/destroy)
│   ├── item-controller.js           # listItemsHandler, getItemHandler, createItemHandler, updateItemHandler, archiveItemHandler
│   └── claim-controller.js          # createClaimHandler, listClaimsHandler, getClaimHandler, reviewClaimHandler
├── routes/
│   ├── auth-routes.js               # POST /login (public), POST /logout, GET /me (requireAuth)
│   ├── item-routes.js               # GET /, GET /:id (public/optionalAuth), POST /, PUT /:id (staff), DELETE /:id (admin)
│   └── claim-routes.js              # POST / (public/optionalAuth), GET /, GET /:id, PATCH /:id/review (staff)
├── utils/                           # Shared helpers & error classes
│   └── app-error.js                 # AppError operational error class (status, code, details)
├── scripts/                         # Operational CLI scripts
│   ├── migrate.js                   # Migration runner with SHA-256 checksums & GET_LOCK
│   └── setup-db-users.sql           # SQL script to provision laf_app, laf_migrate, and laf_test
├── specs/                           # Engineering guidelines and design documents
│   ├── global-spec.md               # Architecture, API design, deletion policy, and coding standards
│   └── database-schema-plan.md      # Detailed DB & migration architecture guide
├── tests/                           # Unit and integration test suites
│   └── unit/
│       ├── auth-middleware.test.js  # 19 unit tests covering requireAuth, requireRole, optionalAuth
│       ├── items-service.test.js    # 46 unit tests covering addItem, editItem, getItemById, listItems, archiveItem
│       ├── claims-service.test.js   # 61 unit tests covering raiseClaim, getClaimById, listClaims, reviewClaim
│       ├── item-controller.test.js  # 9 unit tests covering all item HTTP handlers and envelopes
│       └── claim-controller.test.js # 8 unit tests covering all claim HTTP handlers and envelopes
├── app.js                           # Express app setup (session middleware, auth/item/claim routes, error handler)
├── server.js                        # HTTP server bootstrap with DB health-check
├── package.json                     # Project manifest and scripts
├── records.md                       # Progress record and codebase state (this file)
└── README.md                        # Project documentation and quickstart
```

---

## 3. Database & Migration Status

All migrations are tracked in `schema_migrations` with SHA-256 checksums. Applied migrations must never be edited; schema changes require a new forward-only migration.

| Migration File | Status | Description |
| :--- | :--- | :--- |
| `001_create_users.sql` | Applied | Creates `users` table (`user_id`, `full_name`, `email`, `password_hash`, `role`, `is_active`, timestamps). |
| `002_create_categories.sql` | Applied | Creates `categories` table (`category_id`, `category_name`). |
| `003_create_locations.sql` | Applied | Creates `locations` table (`location_id`, `location_name`). |
| `004_create_items.sql` | Applied | Creates `items` table (`item_id`, `title`, `description`, `color`, `brand`, `serial_number`, `found_at`, `location_id`, `finder_name`, `storage_notes`, `logged_by`, `item_status`, `image_url`, timestamps). |
| `005_create_claims.sql` | Applied | Creates `claims` table (`claim_id`, `item_id`, `claimant_name`, `claimant_email`, `claimant_phone`, `proof_description`, `claim_status`, `processed_by`, `processing_notes`, `resolved_at`, timestamps). |
| `006_create_audit_logs.sql` | Applied | Creates `audit_logs` table (`log_id`, `performed_by`, `item_id`, `claim_id`, `action_type`, `old_state_snapshot`, `new_state_snapshot`, `timestamp`). |
| `007_add_item_category.sql` | Applied | Adds `category_id INT NOT NULL` to `items` after `brand` with foreign key referencing `categories(category_id) ON DELETE CASCADE`. |

---

## 4. Implemented Modules & Features

### 4.1 Lost Items Management Service (`services/items-service.js`)
- **`addItem(itemData, context)`**:
  - Validates `actorId` (must be positive integer).
  - Validates payload:
    - `title` (required, 1-255 chars, trimmed)
    - `category_id` (required, positive integer)
    - `location_id` (required, positive integer)
    - `finder_name` (required, 1-75 chars, trimmed)
    - `found_at` (required, valid date, cannot be in future, normalized to UTC DATETIME string)
    - `item_status` (optional, defaults to `'active'`, allowed: `'active'`, `'inactive'`)
    - String length limits for `color` (50), `brand` (50), `serial_number` (255), `image_url` (255)
  - Pre-validation fails fast before acquiring a connection or opening a transaction.
  - Acquires connection, begins transaction, calls `itemRepository.insertItem()`, re-fetches record via `findItemById()`, writes audit log entry (`action: 'INSERT'`), commits, and releases connection.
  - Automatic rollback on any error.
  - Foreign key failures (`ER_NO_REFERENCED_ROW_2`) are remapped to `AppError(400, 'INVALID_REFERENCE')`.
- **`editItem(itemId, updateData, context)`**:
  - Validates `itemId`, `actorId`, and supplied fields.
  - Rejects with `VALIDATION_ERROR(400)` if no editable fields are provided.
  - Acquires row lock in transaction (`findItemById(conn, itemId, { forUpdate: true })`).
  - Throws `NOT_FOUND(404)` if item does not exist.
  - Updates only mutable columns via `itemRepository.updateItem()`.
  - Immunizes immutable fields (`logged_by`, `item_id`, `created_at`).
  - Writes audit log entry (`action: 'UPDATE'`) capturing `oldValues` and `newValues`.
  - Commits transaction and releases connection; rolls back on failure.
- **`getItemById(itemId)`**:
  - Validates `itemId` and retrieves item using `pool` directly without transaction overhead.

### 4.2 Items Repository (`repositories/item-repository.js`)
- **`findItemById(conn, itemId, options)`**: Parameterized query with explicit projection of columns (`ITEM_COLUMNS`). Supports `{ includeArchived, forUpdate }`.
- **`insertItem(conn, itemData)`**: Parameterized insert of all item columns within caller's transaction. Returns `insertId`.
- **`updateItem(conn, itemId, fields)`**: Parameterized dynamic `UPDATE` query filtered strictly against an allowlist of mutable columns (`EDITABLE_COLUMNS`).

### 4.3 Error Handling (`utils/app-error.js`)
- `AppError` class inheriting from `Error`:
  - `name = 'AppError'`
  - `status`: HTTP status code (e.g. 400, 404, 409, 500)
  - `code`: Machine-readable error code string (e.g. `'VALIDATION_ERROR'`, `'NOT_FOUND'`, `'INVALID_REFERENCE'`)
  - `details`: Array or object containing field-level validation messages
  - `isOperational = true`

### 4.4 Unit Testing Suite (`tests/unit/items-service.test.js`)
- **Coverage**: 35 unit tests executed via Vitest.
- **Test Categories**:
  - `addItem`: Success path, transaction commit/release, metadata passing (`requestId`, `ipAddress`), transaction rollback on repository error, rollback on audit error, field-by-field validation checks, future date rejection, invalid status rejection, actor ID validation, foreign key remapping.
  - `editItem`: Success path, partial updates, transaction commit/release, protection against altering `logged_by`, 404 on non-existent item, rollback on failure, empty payload validation, invalid ID validation, field bounds validation, foreign key remapping.
  - `getItemById`: Success retrieval, null for non-existent item, 400 for invalid ID.
  - `AppError`: Prototype and operational flag verification.
- **Run command**: `npm test` (passes 35/35 tests in ~500ms).

### 4.5 Claims Repository (`repositories/claim-repository.js`)
- **`findClaimById(conn, claimId, options)`**: Parameterized query with explicit projection of `CLAIM_COLUMNS`. Supports `{ forUpdate }` for row-level locking.
- **`findPendingClaimByContact(conn, { itemId, email, phone })`**: Detects an existing `pending` claim for the same item where either the email or phone matches. Uses dynamic `IS NOT NULL` guards to skip null values safely.
- **`insertClaim(conn, claimData)`**: Parameterized insert that hard-codes `claim_status = 'pending'` in SQL. Returns `insertId`.

### 4.6 Public Claims Service (`services/claims-service.js`)
- **`raiseClaim(claimData, context)`**:
  - No `actorId` required — the claimant is an anonymous public user. The audit log records `actorId: null`.
  - Validates payload pre-connection:
    - `item_id` (required, positive integer)
    - `claimant_name` (required, 1–50 chars, trimmed)
    - Contact presence: at least one of `claimant_email` or `claimant_phone` must be non-empty.
    - `claimant_email` (optional, validated against email regex when present, max 50 chars)
    - `claimant_phone` (optional, max 20 chars)
    - `proof_description` (optional, max 5000 chars)
  - Within a transaction: verifies item exists and is `'active'`, checks for duplicate pending claim via `findPendingClaimByContact`, inserts claim, re-fetches record, writes audit log (`action: 'INSERT'`, `actorId: null`), commits.
  - Rolls back automatically on any error; always releases connection in `finally`.
  - Remaps `ER_NO_REFERENCED_ROW_2` → `AppError(400, 'INVALID_REFERENCE')`.
  - Custom error codes: `ITEM_INACTIVE` (400), `DUPLICATE_CLAIM` (409).
- **`getClaimById(claimId)`**:
  - Validates `claimId` and retrieves claim using `pool` directly without transaction overhead.

### 4.7 Claims Unit Testing Suite (`tests/unit/claims-service.test.js`)
- **Coverage**: 48 unit tests executed via Vitest.
- **Test Categories**:
  - `raiseClaim` success: with email+phone, email only, phone only; trimming, proof_description defaults, actorId=null audit, context forwarding, commit/release assertions.
  - `raiseClaim` validation failures: each required field, contact presence, format checks, length limits — all fail before acquiring a DB connection.
  - Item verification: 404 on missing item, 400 `ITEM_INACTIVE` on inactive item.
  - Duplicate prevention: 409 on pending email match, pending phone match; allows new claim after rejected/accepted prior claim.
  - Transaction integrity: rollback on `insertClaim` failure, rollback on `writeAudit` failure, release even when rollback itself throws, FK remapping.
  - `getClaimById`: success retrieval, null on not-found, 400 on invalid ID, no transaction (pool used directly).
  - `AppError`: prototype and operational flag verification.
- **Run command**: `npm test` (passes 83/83 tests in ~500ms — 35 items + 48 claims).

### 4.8 Auth Middleware (`middleware/auth.js`)
- **`requireAuth`**: Checks `req.session.userId` (must be a positive integer). On success sets `req.actorId` and `req.actorRole`. On failure passes `AppError(401, 'UNAUTHORIZED')` to the error handler.
- **`requireRole(...allowedRoles)`**: Factory returning a middleware that first validates session presence (401), then checks `req.session.role` against `allowedRoles`. Passes `AppError(403, 'FORBIDDEN')` if the role doesn't match. Defaults to deny (empty role list → always 403).
- **`optionalAuth`**: Always calls `next()`. Sets `req.actorId = req.session.userId` and `req.actorRole = req.session.role` when an authenticated session is present; sets both to `null` for anonymous callers.

### 4.9 Session Middleware (`middleware/session.js`)
- Exports `createSessionMiddleware()` factory that configures `express-session` with:
  - Persistent MySQL store via `express-mysql-session` using the shared application pool.
  - Cookie settings: `httpOnly: true`, `secure` in production, `sameSite: 'lax'`, `maxAge` from config.
  - `resave: false`, `saveUninitialized: false`.
  - Auto-creation of the `sessions` table; expired session cleanup every 15 minutes.

### 4.10 Auth Service (`services/auth-service.js`)
- **`login({ email, password }, context)`**: Normalizes email, looks up user via `findUserByEmail`, runs timing-safe argon2id verify (runs dummy hash if email not found to prevent timing attacks). On success, writes `LOGIN` audit entry and returns `{ id, fullName, email, role }`. On failure, writes `LOGIN_FAILED` and throws `AppError(401, 'INVALID_CREDENTIALS')`. Session management is left to the controller.
- **`logout({ actorId, ... })`**: Writes a `LOGOUT` audit entry. Session destruction left to the controller.
- **`hashPassword(password)`**: Returns argon2id hash for use during user creation.
- **`verifyPassword(hash, password)`**: Returns boolean; swallows argon2 errors as `false`.

### 4.11 Auth Controller & Routes
- **`controllers/auth-controller.js`**:
  - `loginHandler`: Calls `auth-service.login()`, regenerates session ID (prevents fixation), stores `userId` and `role` in session, responds 200 with sanitized user object.
  - `logoutHandler`: Calls `auth-service.logout()`, destroys session, clears `connect.sid` cookie, responds 204.
  - `meHandler`: Fetches live user from `user-repository`, handles stale session (deactivated user), responds 200.
- **`routes/auth-routes.js`**: Mounts on `/api/v1/auth`. Public: `POST /login`. Protected: `POST /logout`, `GET /me`.

### 4.12 Auth Middleware Unit Testing (`tests/unit/auth-middleware.test.js`)
- **Coverage**: 19 unit tests executed via Vitest (no DB, no network — pure mock `req`/`res`/`next`).
- **Test Categories**: `requireAuth` (6 tests: success, null role, no session, null userId, userId=0, string userId), `requireRole` (8 tests: single role match, multi-role match, array-form, unauthenticated, no userId, wrong role, no role, empty allowlist), `optionalAuth` (5 tests: authenticated, no session, userId=0, string userId, no role).
- **Run command**: `npm test` (passes 102/102 tests — 19 auth + 35 items + 48 claims).

---

## 5. Architectural Rules & Standards

1. **SQL Isolation**: All SQL statements reside in `repositories/`. No SQL in services, controllers, or route handlers.
2. **Auth Decoupling**: Services take `actorId` and context from callers. Session verification and role checking are handled separately in Express middlewares.
3. **Transactional Audit Logging**: Every business write (`INSERT`, `UPDATE`, `ARCHIVE`, `RESTORE`) must write to `audit_log` in the **same transaction**. If auditing fails, the operation rolls back.
4. **Zero Physical Deletes**: Business records must not be deleted. Archival uses `deleted_at` and `deleted_by`. CI checks this via `npm run check:no-delete`.
5. **Explicit Projections**: Never use `SELECT *`. Explicitly list requested column names.
6. **Parameterized Queries**: Always use `?` placeholders with `execute()` / `query()` to prevent SQL injection.

---

## 6. Chronological Progress Log

### Milestone 1: Foundation Setup & Initial Migrations
- Initialized Express backend with ESM support and configuration loader (`config/index.js`, `config/db.js`).
- Created raw SQL migration runner (`scripts/migrate.js`) with SHA-256 checksum verification and advisory locks.
- Applied migrations `001` through `006` (`users`, `categories`, `locations`, `items`, `claims`, `audit_logs`).
- Implemented `repositories/audit-repository.js` with snapshot sanitization for passwords and tokens.
- Implemented `repositories/user-repository.js` with soft delete (`archiveUser`, `restoreUser`) and audit logging.

### Milestone 2: Schema Enhancement for Categories
- Identified missing `category_id` in initial `004_create_items.sql`.
- Applied forward-only migration `007_add_item_category.sql` adding `category_id INT NOT NULL` referencing `categories(category_id)`.

### Milestone 3: Lost Items Core Feature Implementation
- Created `utils/app-error.js` for structured operational errors.
- Created `repositories/item-repository.js` with explicit column projections and safe update column allowlisting.
- Created `services/items-service.js` with `addItem()`, `editItem()`, and `getItemById()` featuring:
  - Input validation prior to database connection acquisition.
  - Single-transaction atomicity for data write + audit log insertion.
  - MySQL constraint error remapping (`ER_NO_REFERENCED_ROW_2` -> `INVALID_REFERENCE`).
- Added Vitest (`v5.0.5`) dev dependency and updated `package.json` scripts (`test`, `test:watch`).
- Created unit test suite in `tests/unit/items-service.test.js` (35 tests passing).

### Milestone 4: Public Claims Raising Feature Implementation
- Created `repositories/claim-repository.js` with `findClaimById()`, `findPendingClaimByContact()`, and `insertClaim()` using explicit column projections and parameterized queries.
- Created `services/claims-service.js` with `raiseClaim()` and `getClaimById()` featuring:
  - Unauthenticated public access (`actorId: null` in audit log).
  - Fail-fast input validation before acquiring any DB connection.
  - Atomic transaction with item existence/status check, duplicate pending claim detection, insert, and audit logging.
  - Custom error codes: `ITEM_INACTIVE` (400), `DUPLICATE_CLAIM` (409), `INVALID_REFERENCE` (400).
- Created unit test suite in `tests/unit/claims-service.test.js` (48 tests passing).
- Total test suite: 83/83 tests passing (`items-service` 35 + `claims-service` 48).

### Milestone 5: Session-Based Authentication Implementation
- Normalized `middlewares/` directory to `middleware/` per `specs/global-spec.md`.
- Installed production dependencies: `express-session`, `express-mysql-session`, `argon2`.
- Implemented `middleware/session.js` — persistent MySQL session store factory with cookie security settings.
- Implemented `middleware/auth.js` — `requireAuth`, `requireRole` (factory, default-deny), `optionalAuth`.
- Implemented `services/auth-service.js` — timing-safe login (argon2id + dummy hash on email miss), logout, and auth audit logging.
- Updated `repositories/user-repository.js` — aligned column projections with actual DB schema (`user_id`, `full_name`, `role`, `is_active`).
- Implemented `controllers/auth-controller.js` and `routes/auth-routes.js`.
- Wired session middleware, auth routes, 404 handler, and centralised error handler into `app.js`.
- Created unit test suite `tests/unit/auth-middleware.test.js` (19 tests).
- Total test suite: **102/102 tests passing** (19 auth + 35 items + 48 claims).

### Milestone 6: HTTP Controllers & Routes for Items and Claims
- Fixed soft-delete check in `repositories/item-repository.js` from `deleted_at IS NULL` to `item_status = 'active'`.
- Added repository query functions:
  - `findItems(conn, filters, pagination)` and `archiveItem(conn, itemId)` in `item-repository.js`.
  - `findClaims(conn, filters, pagination)` and `updateClaimStatus(conn, claimId, updates)` in `claim-repository.js`.
- Extended domain services:
  - `items-service.js`: Added `listItems` with public data sanitization (`storage_notes` stripped, `item_status = 'active'` forced), `archiveItem` with transactional audit logging (`action: 'ARCHIVE'`), and `getItemById` backwards-compatible signature with optional public sanitization.
  - `claims-service.js`: Added `listClaims` (staff-only), and `reviewClaim` (atomic transaction: row-locking, status check, item deactivation with audit log if approved, claim status update, and claim audit log with `action: 'UPDATE'`).
- Implemented controllers:
  - `controllers/item-controller.js`: `listItemsHandler`, `getItemHandler`, `createItemHandler`, `updateItemHandler`, `archiveItemHandler`.
  - `controllers/claim-controller.js`: `createClaimHandler`, `listClaimsHandler`, `getClaimHandler`, `reviewClaimHandler`.
- Implemented routes:
  - `routes/item-routes.js`: Public `GET /` and `GET /:id` with `optionalAuth`; staff `POST /` and `PUT /:id` with `requireRole('admin', 'guard')`; admin `DELETE /:id` with `requireRole('admin')`.
  - `routes/claim-routes.js`: Public `POST /` with `optionalAuth`; staff `GET /`, `GET /:id`, and `PATCH /:id/review` with `requireRole('admin', 'guard')`.
- Mounted `/api/v1/items` and `/api/v1/claims` in `app.js`.
- Non-functional verification: verified `npm run check:no-delete` (0 occurrences of physical DELETE/TRUNCATE).
- Expanded unit test suites:
  - Added unit tests for `listItems`, `archiveItem`, and public sanitization in `tests/unit/items-service.test.js` (46 tests).
  - Added unit tests for `listClaims` and `reviewClaim` in `tests/unit/claims-service.test.js` (61 tests).
  - Created `tests/unit/item-controller.test.js` (9 tests).
  - Created `tests/unit/claim-controller.test.js` (8 tests).
- Total test suite: **143/143 tests passing** (19 auth + 46 items + 61 claims + 9 item-ctrl + 8 claim-ctrl).

---

## 7. Upcoming Roadmap & Pending Tasks

- [x] **HTTP Controllers & Routes for Items**:
  - Implemented `controllers/item-controller.js` and `routes/item-routes.js`.
  - Mounted on `/api/v1/items` in `app.js`.
  - Unit tests passing.
- [x] **HTTP Controllers & Routes for Claims**:
  - Implemented `controllers/claim-controller.js` and `routes/claim-routes.js`.
  - Mounted on `/api/v1/claims` in `app.js`.
  - Unit tests passing.
- [x] **Claims Review Workflow (Staff)**:
  - Implemented `reviewClaim(claimId, payload, context)` in `services/claims-service.js` with item deactivation and transactional audit logging.
- [x] **Auth & Session Middleware**:
  - `middleware/auth.js` (`requireAuth`, `requireRole`, `optionalAuth`) — done.
  - `middleware/session.js` (persistent MySQL session store) — done.
  - `services/auth-service.js` (login, logout, argon2id hashing) — done.
  - `controllers/auth-controller.js` + `routes/auth-routes.js` — done.
  - Unit tests in `tests/unit/auth-middleware.test.js` (19 tests) — done.
- [ ] **Image Upload Handling**:
  - Configure file upload middleware (e.g. Multer) with file type validation and size limits.
  - Map uploaded image paths to `image_url` prior to invoking `items-service.js`.
- [x] **Public Claims Raising (Service & Repository)**:
  - `repositories/claim-repository.js` — done.
  - `services/claims-service.js` (`raiseClaim`, `getClaimById`) — done.
  - Unit tests in `tests/unit/claims-service.test.js` (61 tests) — done.
- [ ] **Integration Tests**:
  - Supertest HTTP test suite for auth + items + claims endpoints.
  - `tests/integration/auth.test.js`: login, logout, /me, 401 on protected routes.
  - `tests/integration/items.test.js`: public GET, protected POST/PUT/DELETE.
  - `tests/integration/claims.test.js`: public POST, staff GET/PATCH.

