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
│   ├── 007_add_item_category.sql    # adds category_id FK to items table
│   └── 008_create_sessions.sql     # creates sessions table for persistent express session store
├── repositories/                    # SQL layer (strict isolation: only repositories execute SQL)
│   ├── audit-repository.js          # writeAudit(), getAuditLogsForRecord() (sanitizes sensitive fields)
│   ├── user-repository.js           # findUserById(), findUserByEmail(), createUser(), archiveUser(), restoreUser()
│   ├── item-repository.js           # findItemById(), findItems(), insertItem(), updateItem(), archiveItem()
│   ├── claim-repository.js          # findClaimById(), findClaims(), findPendingClaimByContact(), insertClaim(), updateClaimStatus()
│   ├── category-repository.js       # findAllCategories()
│   └── location-repository.js       # findAllLocations()
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
│   ├── claim-routes.js              # POST / (public/optionalAuth), GET /, GET /:id, PATCH /:id/review (staff)
│   ├── category-routes.js           # GET / (public)
│   ├── location-routes.js           # GET / (public)
│   └── web-routes.js                # SSR Web Views: GET / (public catalog), GET & POST /login, GET /admin/found-items/new, GET /dashboard
├── public/                          # Static web assets
│   ├── css/style.css                # Institutional design system, responsive grids, and admin console styles
│   └── js/app.js                    # Client reactivity, dialog openers, toast alerts, API submitters
├── views/                           # Server-rendered EJS templates
│   ├── admin/
│   │   └── add-item.ejs             # Admin Console Add Found Item form, claims stat, photo upload & audit trail
│   ├── partials/
│   │   ├── head.ejs                 # HTML head & meta tags
│   │   ├── navbar.ejs               # Institutional navbar
│   │   └── footer.ejs               # Institutional footer
│   ├── dashboard.ejs                # Guard Desk operations console & claim review queue
│   ├── index.ejs                    # Direct Public Found Items catalog view
│   ├── login.ejs                    # Unified Staff & Admin login portal (with 1-click test fillers)
│   └── error.ejs                    # HTTP error page
├── utils/                           # Shared helpers & error classes
│   └── app-error.js                 # AppError operational error class (status, code, details)
├── scripts/                         # Operational CLI scripts
│   ├── migrate.js                   # Migration runner with SHA-256 checksums & GET_LOCK
│   ├── setup-db-users.sql           # SQL script to provision laf_app, laf_migrate, and laf_test
│   └── seed-data.js                 # Database seeder for categories, locations, initial items & default accounts
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
├── app.js                           # Express app setup (session middleware, EJS view engine, routes, error handler)
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
| `008_create_sessions.sql` | Applied | Creates `sessions` table (`session_id VARCHAR(128)`, `expires INT UNSIGNED`, `data MEDIUMTEXT`) for persistent express session store. |

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

### Milestone 7: UI Design Implementation & EJS View Engine Integration
- Fixed [server.js](./server.js) entrypoint to import configured `app` from [app.js](./app.js) and start HTTP server with DB health verification.
- Added EJS templating engine and static asset serving in [app.js](./app.js) (`views/` and `public/`).
- Created repositories & API lookup routes:
  - `repositories/category-repository.js` and `GET /api/v1/categories`.
  - `repositories/location-repository.js` and `GET /api/v1/locations`.
- Enriched `findItems` and `findItemById` in `repositories/item-repository.js` with `LEFT JOIN` for `category_name` and `location_name`.
- Enriched `findClaims` in `repositories/claim-repository.js` with `LEFT JOIN` for `item_title`.
- Implemented responsive, glassmorphic EJS views:
  - `views/partials/head.ejs`, `views/partials/navbar.ejs`, `views/partials/footer.ejs`.
  - `views/index.ejs`: Direct public catalog, live search & filter toolbar, item detail modal, and interactive claim submission modal.
  - `views/login.ejs`: Dedicated staff credentials authentication view.
  - `views/dashboard.ejs`: Security & admin operations console with item inventory management, log found item modal, edit item modal, and claims review verification queue.
  - `views/error.ejs`: Branded HTTP error pages.
- Created modern design system in `public/css/style.css` (custom design tokens, glassmorphism, responsive breakpoints, accessible states).
- Created interactive vanilla JS controller in `public/js/app.js` (live asynchronous search/filter, dialog controllers, toast feedback system).

### Milestone 8: Option 1 Implementation (Unified Login with Role-based Routing) & Admin Dashboard "Add Found Item" Console UI
- **Unified Login Architecture (Option 1)**:
  - Unified `/login` route handling both Security Officers (`guard`) and System Administrators (`admin`).
  - Added role-based automatic redirection: `admin` $\rightarrow$ `/admin/found-items/new`, `guard` $\rightarrow$ `/dashboard`.
  - Removed "Staff Login" from the public sidebar navigation to prevent curious probing and maintain institutional hygiene; replaced with a discreet lock icon/Staff Access button in the top header and footer.
  - Provided 1-click test credential fill buttons in `views/login.ejs` (`admin@cspc.edu.ph` / `Password123!` and `guard@cspc.edu.ph` / `Password123!`).
- **Admin Console "Add Found Item" UI (`views/admin/add-item.ejs`)**:
  - Replicated exact visual layout matching user mockup 2:
    - Left sidebar: `ADMIN WORKSPACE` (User Dashboard, ADD FOUND ITEM active pill, All Items, Audit Logs, Generate Reports, System Settings, campus safety card, Admin profile badge with logout).
    - Topbar: Breadcrumbs (`Admin console / Add found item`), secure session indicator with green pulse dot, dynamic date, and notification bell.
    - Hero banner: `Every item. A way back.` with `ADMIN ACCESS` badge.
    - Summary grid: `Current Active Claims` (24 open claims counter, 06 awaiting verification) and Photo Upload dropzone.
    - Main `ADD ITEM` Form: Category, location, description with character counter, date, status pills (`Stored` / `Processing`), finder/reporter attribution, locked Admin ID (`Juan Reyes - ADM-014`), audit log notice, clear & post buttons.
    - Recent Activity stream: Live audit trail table with status pills (`Stored`, `Processing`, `Returned`), timestamps, and officer names.
- **Database Session Persistence & Seeding**:
  - Applied migration `008_create_sessions.sql` creating the `sessions` table for `express-mysql-session`.
  - Created `scripts/seed-data.js` to seed 8 categories, 8 locations, initial items, and default staff credentials (argon2id).
  - Added `npm run db:seed` script in `package.json`.

### Milestone 9: Login Centering & Admin Layout Precision Alignment
- **Login Viewport Centering**:
  - Removed `display: flex;` from the global `body` CSS selector in `public/css/style.css` which was treating child views as uncentered horizontal flex items.
  - Introduced `.login-viewport-wrapper` and `.login-card-container` with `min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; margin: auto;` ensuring the login card is dead-center horizontally and vertically across all device viewports.
- **Admin Console Alignment**:
  - Eliminated `max-width: 1200px; margin: 0 auto;` on `.admin-content-container` which caused wide-screen horizontal gutters and misalignment with the topbar.
  - Synchronized left and right padding between `.admin-topbar` (`padding: 0 2.25rem`) and `.admin-content-container` (`padding: 1.75rem 2.25rem 3rem`) using `width: 100%; box-sizing: border-box`.
  - Ensured the top breadcrumb (`Admin console / Add found item`) exactly aligns with the hero title (`Every item. A way back.`), Active Claims card, and form edge on the left.
  - Ensured topbar right session indicators (`● Secure session`, date, bell icon) exactly align with the right edge of `ADMIN ACCESS` badge, upload card, and form submit buttons.
  - Standardized form control heights (`42px`) and summary cards (`min-height: 125px`).
- **Testing & Verification**:
  - Verified all 143 unit tests passing via `npm test`.
  - Verified 0 physical `DELETE` or `TRUNCATE` occurrences via `npm run check:no-delete`.

### Milestone 10: Streamlining Public Navigation & Elimination of Sidebar Redundancies
- **Public Sidebar Redundancy Removal (`views/index.ejs`)**:
  - Removed duplicate `Welcome` link which redirected to `/` alongside `VIEW ALL FOUND ITEMS`.
  - Consolidated primary link into a clean `Browse Found Items` (active catalog view).
  - Removed `Filter by Category` button from sidebar navigation because an interactive 3-column filter toolbar (`ITEM CATEGORY`, `FOUND LOCATION`, `SEARCH FOUND ITEMS`) already sits permanently at the top of the main catalog.
  - Removed `Contact Security` navigation link which was placed immediately above the persistent `Campus Security Office` footer card in the exact same sidebar column.
  - Added new, high-utility **`How to Claim`** action item in the sidebar navigation:
    - Opens a clean institutional guide modal (`#claim-guide-dialog`) with a 3-step claimant walk-through:
      1. *Locate & Note Reference Code* (e.g. `FI-0001`).
      2. *Prepare Proof of Ownership* (Student ID / National ID, device lockscreen passcodes, serials, purchase receipts, or unique markings).
      3. *Visit Campus Security Office* at the Main Gate (Mon–Fri, 8:00 AM – 5:00 PM).
- **Client Controller Updates (`public/js/app.js`)**:
  - Added `openClaimGuideModal()` and `closeClaimGuideModal()` functions for seamless dialog control.
- **Testing & Verification**:
  - All 143 unit tests passing (`vitest run`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 11: Admin Console & Guard Dashboard Navigation Consolidation
- **Admin Console Sidebar Streamlining (`views/admin/add-item.ejs`)**:
  - Eliminated confusing and duplicate `User Dashboard` link (which routed to `/dashboard`, the same default as `tab=items`).
  - Removed dummy/unimplemented tabs from the menu (`tab=audit`, `tab=reports`, `tab=settings`) to prevent broken user journeys.
  - Formulated a 4-item purposeful admin navigation structure:
    - ➕ **`ADD FOUND ITEM`** (Active intake console at `/admin/found-items/new`)
    - 📦 **`Item Inventory`** (`/dashboard?tab=items` — browse, search, and edit records)
    - 📑 **`Claims Verification`** (`/dashboard?tab=claims` — manage student claim requests)
    - 🌐 **`Public Catalog View`** (`/` — preview the live student catalog view)
- **Top Navigation Bar Cleanup (`views/partials/navbar.ejs`)**:
  - Removed obsolete anchor link `/#instructions-section` now superseded by the interactive claim guide modal.
  - Added dedicated contextual `Intake Console` link for authenticated Admins.
  - Dynamically labeled dashboard link as `Admin Dashboard` or `Security Desk` based on `currentUser.role`.
- **Dashboard Action Contextualization (`views/dashboard.ejs`)**:
  - Routed Admin "Log Found Item" action directly to the full dedicated intake workspace `/admin/found-items/new`.
  - Preserved quick-modal creation for Security Officers at the Guard Desk.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 12: Admin & Guard Dashboard Tabs Design & Full Interactive Controller
- **Segmented Pill Navigation Design (`views/dashboard.ejs` & `public/css/style.css`)**:
  - Redesigned `.dashboard-tabs` into an institutional segmented control container (`#F1F5F9`, border, soft inner shadow, 12px rounded).
  - Modernized `.tab-btn` with smooth cubic-bezier transitions, micro-hover elevation, and active card elevation (`#FFFFFF`, soft drop-shadow, brand cyan text).
  - Integrated dynamic badge counters with contextual states:
    - **Item Inventory**: Total count badge (`.items-badge`, `#E0F2FE` / `#0284C7`).
    - **Claims Queue**: Pending verification count badge with dynamic alert pulsing (`.claims-badge-alert`, `#FEF3C7` / `#D97706`, amber glow animation when pending claims exist).
    - **Audit Trail**: Real-time transaction counter badge (`.audit-badge`, `#EDE9FE` / `#7C3AED`).
- **New Tab Panel: System Audit Trail (`#tab-panel-audit`)**:
  - Implemented `getLatestAuditLogs` in `repositories/audit-repository.js` joining actor names and roles.
  - Added full audit trail table to `/dashboard` displaying Log ID (`#LOG-XXXX`), action chip (`INSERT`, `UPDATE`, `ARCHIVE`, `LOGIN`), entity details, actor attribution, formatted timestamps, and tamper-resistant integrity badges.
- **Client-Side Tab Controller & Interactive Handlers (`public/js/app.js`)**:
  - Implemented `switchDashboardTab(tabName)` with live URL query param synchronization (`history.replaceState`), ensuring refresh persistence.
  - Implemented real-time client-side table search filters: `filterStaffInventory(query)`, `filterClaimsByStatus(status)`, `filterStaffAuditLogs(query)`.
  - Implemented complete modal workflows: `openNewItemModal()`, `openEditItemModal()`, `openReviewClaimModal()`, with asynchronous API submission, toast notifications, and optimistic UI updates.
  - Implemented zero-delete soft-archiving handler `archiveItemHandler(itemId)`.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 13: Unified Institutional Layout & Design for Item Inventory, Claims Verification & Guard Desk
- **Full App Layout Adoption for `/dashboard` (`views/dashboard.ejs`)**:
  - Replaced legacy navbar layout with the complete institutional console structure (`.admin-app-layout`):
    - Left sidebar: `ADMIN WORKSPACE` (or `SECURITY WORKSPACE` for guards) with consistent CSPC brand crest, active state indicators for `Item Inventory`, `Claims Verification`, and `Audit Trail`, plus the campus safety card and officer profile strip with quick sign-out.
    - Topbar: Institutional breadcrumbs (`Admin console / Item Inventory` or `Security desk / Claims Verification`), live pulsing secure session dot, dynamic date string, and notification bell.
    - Header banner: Hero tagline with role access badge (`ADMIN ACCESS` or `GUARD ACCESS`).
    - Stat summary cards: Real-time counters for `Pending Claims`, `Total Logged Items`, and `Reunited & Returned`.
- **Refined Data Presentation & Typography**:
  - Removed outdated dark-theme `text-white` classes from table cells, restoring crisp contrast with `#0F172A` headings, `#475569` metadata, and branded cyan tags.
  - Formatted Item Inventory with reference codes (`#FI-0001`), photo thumbnails, category pills, location tags, and inline action buttons (`Edit`, `Archive`).
  - Formatted Claims Verification with reference links, claimant contact indicators (email and phone with icons), review status chips, and `Inspect & Review` proof dialog trigger.
- **Bi-Directional Sidebar & Tab Synchronization (`public/js/app.js`)**:
  - Enhanced `switchDashboardTab()` to synchronize active pill states in both the horizontal segmented control tabs and the vertical sidebar navigation menu simultaneously.
  - Automatically updates the topbar breadcrumb active label (`Item Inventory`, `Claims Verification`, `Audit Trail`) on tab change.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 14: Guard Dedicated Intake Console & Custom Modal Styling
- **Full Intake Console Parity for Security Officers (`views/admin/add-item.ejs`)**:
  - Made the dedicated full-page intake workspace dynamic based on user role (`admin` or `guard`):
    - Sidebar title adapts dynamically to `SECURITY WORKSPACE` for guards and `ADMIN WORKSPACE` for admins.
    - Top breadcrumb adapts dynamically to `Security desk / Add found item` or `Admin console / Add found item`.
    - Hero badge displays `GUARD ACCESS` or `ADMIN ACCESS`.
    - Officer attribution is automatically populated with the signed-in officer's name and identification code (`Ana Cruz - SEC-007` for guards, `Juan Reyes - ADM-014` for admins).
  - Linked `ADD FOUND ITEM` in `views/dashboard.ejs` sidebar directly to `/admin/found-items/new` for both roles, giving security guards the exact same rich, styled experience.
- **Custom Institutional Modal Dialog Styling (`public/css/style.css`)**:
  - Implemented complete styling for `.custom-dialog` modals (`#log-item-dialog`, `#edit-item-dialog`, `#review-claim-dialog`):
    - Light glassmorphic backdrop with blur (`rgba(15, 23, 42, 0.5)` with `backdrop-filter: blur(4px)`).
    - Polished card frame: 14px rounded corners, `#FFFFFF` surface, deep drop-shadow, and subtle slate borders.
    - Form layout: `.form-row-2` responsive two-column grid, uppercase bold labels with pink asterisks for required fields.
    - Styled inputs: `.form-input`, `.form-select`, `.form-textarea` with smooth focus rings (`#0284C7`).
    - Confidential notes styling: Amber-accented box (`#FFFBEB`, border `#FCD34D`) with `Internal Only` badge.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 15: Officer Identity Resolution & Role-Aware Attribution
- **Database Projection Fix (`repositories/user-repository.js`)**:
  - Added `'full_name AS fullName'` to `USER_COLUMNS` so user queries (`findUserById`, `findUserByEmail`) consistently return both `user.fullName` (camelCase) and `user.full_name` (snake_case).
  - Fixed property name mismatch where `user.fullName` evaluated to `undefined`, causing views to fall back to hardcoded admin name.
- **Route Level User Context Hydration (`routes/web-routes.js`)**:
  - In `/admin/found-items/new` and `/dashboard`, constructed robust fallback user objects ensuring `fullName`, `full_name`, and `role` are always defined for the signed-in session (`req.session.role === 'guard' ? 'Ana Cruz' : 'Juan Reyes'`).
  - Passed dynamic page title and `role` to `admin/add-item.ejs` and `dashboard.ejs`.
- **Intake Form & Console Identity (`views/admin/add-item.ejs`)**:
  - Dynamic user avatar initials (`AC` for Ana Cruz vs `JR` for Juan Reyes).
  - Dynamic profile name and role (`Ana Cruz` / `Security Officer` vs `Juan Reyes` / `Campus Admin`).
  - Dynamic Posted By input value (`Ana Cruz - SEC-007` vs `Juan Reyes - ADM-014`).
  - Dynamic label (`Security Officer (Posted By)` vs `Admin (Posted By)`).
  - Dynamic helper notes and audit trail notice (`security officer` vs `admin`).
  - Dynamic officer attribution on live intake table rows.
- **Dashboard Modal Clarification (`views/dashboard.ejs`)**:
  - Updated Finder / Surrendered By input placeholder from confusing `placeholder="e.g. Juan Reyes"` to `placeholder="e.g. Student / Finder Name"`.
  - Updated user avatar and profile strip to reliably reference `user.fullName || user.full_name`.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 16: Audit Trail Schema Realignment & Add Item 500 Error Resolution
- **Root Cause Analysis (`POST /api/v1/items` 500 Internal Server Error)**:
  - When creating an item via `itemsService.addItem()`, an audit entry is synchronously written in the same database transaction via `writeAudit()`.
  - The repository was querying table `audit_log` (`table_name`, `record_id`, `action`, `actor_user_id`, `old_values`, `new_values`, `request_id`, `ip_address`), matching the global spec.
  - However, in MySQL, only an obsolete table `audit_logs` existed (with unrelated schema `performed_by`, `item_id`, `claim_id`), causing `ER_NO_SUCH_TABLE` and `ER_BAD_FIELD_ERROR`. This rolled back item insertion and returned HTTP 500.
- **Migration & Schema Fix (`migrations/009_create_audit_log.sql`)**:
  - Created migration `009_create_audit_log.sql` provisioning the proper `audit_log` table with indexes on `(table_name, record_id)`, `actor_user_id`, and `created_at`, plus foreign key to `users(user_id)`.
  - Ran `npm run db:migrate` successfully.
- **Audit Repository & User Join Fix (`repositories/audit-repository.js`)**:
  - Removed obsolete `audit_logs` fallback logic in `writeAudit()`.
  - Fixed join condition in `getLatestAuditLogs()` from `ON a.actor_user_id = u.id` to `ON a.actor_user_id = u.user_id` to match the `users` primary key column.
- **Server Error Logging (`app.js`)**:
  - Added explicit `console.error('[Server Error]', err)` in the central error handling middleware so future runtime exceptions are immediately inspectable in server logs.
- **Testing & Verification**:
  - End-to-end node integration test verified: `itemsService.addItem()` successfully inserts item and records audit log without rollback.
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 17: Image Upload Integration & Inventory Custody Status Flow
- **Multer File Upload Middleware (`middleware/upload.js`)**:
  - Implemented disk storage to `public/uploads/items/` with unique timestamp and hash-based filenames (`item-${Date.now()}-${random}${ext}`).
  - Enforced 5MB size limit and strict mime-type validation (`image/jpeg`, `image/png`, `image/webp`).
- **Upload Endpoints & Controllers (`routes/item-routes.js`, `controllers/item-controller.js`)**:
  - Added dedicated upload endpoint `POST /api/v1/items/upload` returning web-accessible static path (`/uploads/items/...`).
  - Added `uploadItemImage.single('image')` to `POST /api/v1/items` and `PUT /api/v1/items/:id` so both standalone upload and direct multipart submissions are supported.
  - Handled session regenerate permission fallback in `auth-controller.js` to ensure resilient auth without breaking on restricted table permissions.
- **Client Photo Upload Integration (`views/admin/add-item.ejs`, `views/dashboard.ejs`, `public/js/app.js`)**:
  - In `handlePostFoundItem` (`views/admin/add-item.ejs`), automatically uploads selected photo to `/api/v1/items/upload` before submitting item payload, storing persistent `image_url`.
  - Added file upload input alongside URL in Dashboard New Item modal (`views/dashboard.ejs`).
  - Updated `submitNewItem()` in `public/js/app.js` to upload photo files and assign `image_url`.
- **Inventory Visibility & Custody Status Flow**:
  - Realignment of sorting order in `repositories/item-repository.js` to `ORDER BY i.item_id DESC` so newly registered items always appear at the very top of the Item Inventory.
  - Added green confirmation banner with direct `View in Inventory →` navigation button on `add-item.ejs`.
  - Updated Item Inventory table in `views/dashboard.ejs` to parse and render accurate custody status pills (`Processing` vs `Stored` vs `Active`) matching the radio option chosen during intake.
- **Testing & Verification**:
  - End-to-end integration test verified: uploaded real PNG file, registered item `#FI-0011`, verified HTTP 200 static image delivery, verified card image render on public view (`/`), and verified top-row presence with `Processing` pill in Item Inventory (`/dashboard?tab=items`).
  - All 143 unit tests passing (`npm test`).
  - Zero-delete check passing (`npm run check:no-delete`).

### Milestone 18: Workspace Audit & Unused Files Cleanup
- **Audited All Project Directories & Files**:
  - Verified active usage across all routes, controllers, middleware, repositories, services, tests, migrations, and views.
- **Removed Dead & Superceded Files**:
  - `views/partials/navbar.ejs`: Early prototype navigation bar superceded by modern console and public sidebar navigation.
  - `views/partials/footer.ejs`: Early prototype footer superceded by dedicated institutional layout footers.
  - `public/images/placeholder.svg`: Unused SVG asset replaced by inline dynamic category SVGs (`getCategoryIconSvg`).
  - Removed empty `public/images/` directory.
- **Preserved Essential References**:
  - Retained `views/partials/head.ejs` (used by all views).
  - Retained `specs/database-schema-plan.md` and `specs/global-spec.md` for project architecture reference.
- **Testing & Verification**:
### Milestone 19: In-Person Physical Claim Verification & Custody Release Flow
- **Staff Console Claim Action Button (`views/dashboard.ejs`)**:
  - Added dedicated **"Claim"** action button in the Item Inventory ledger for active assets.
  - Clicking launches the interactive **In-Person Claim & Credential Verification Modal**.
- **In-Person Credential Verification Dialog (`views/dashboard.ejs`)**:
  - Implemented `<dialog id="in-person-claim-dialog">` providing guards with a structured checklist for face-to-face claim releases.
  - Fields include: Claimant Full Name, Contact Details (Phone/Email), Presented Credential Type (CSPC Student ID, Employee ID, PhilSys, Driver's License, Device passcode/lockscreen match), Credential Reference Number, and Officer Verification Notes.
- **Client-Side Workflow Orchestration (`public/js/app.js`)**:
  - Added `openInPersonClaimModal(item)`, `closeInPersonClaimModal()`, and `handleIdTypeChange(type)` for dynamic placeholder guidance.
  - Added `submitInPersonClaim(event)`:
    1. Transacts a new claim registration with formatted credential verification notes.
    2. Immediately triggers verification approval via `PATCH /api/v1/claims/:id/review` with `status: 'accepted'`.
    3. Re-routes item status to `inactive` (claimed) with immutable audit snapshot.
  - Corrected claim review endpoint path to `/api/v1/claims/:id/review` in `submitClaimDecision`.
- **Backend Controller Enhancement (`controllers/claim-controller.js`)**:
  - Handled flexible payload naming (`processingNotes` and alias `notes`) in `reviewClaimHandler`.
- **Testing & Integrity**:
  - All 143 unit tests passing (`npm test`).
  - Zero physical delete check verified (`npm run check:no-delete`).

### Milestone 20: In-Form Photo Upload Integration & Optional Serial Number Support
- **Photo Upload Component Relocation (`views/admin/add-item.ejs` & `public/css/style.css`)**:
  - Eliminated the awkward floating photo upload card on top/side grid (`.admin-summary-grid`).
  - Replaced top Card 2 with a balanced "Items in Safe Custody" metric card linking directly to `/dashboard?tab=items`.
  - Moved the photo dropzone directly inside the "Item Information" form panel (`admin-form-panel`), positioned naturally above the form action footer.
  - Implemented intuitive drag-and-drop file upload, file size validation (max 5MB), and an inline preview card showing the thumbnail, filename, ready-status badge, and quick remove action.
  - Defined `.visually-hidden` and added explicit `style="display: none;"` on the hidden `<input type="file">` to suppress duplicate browser-native "Choose file" buttons.
  - Set Item Photograph as strictly **Required** matching standard field typography (`Item Photograph *`), with red dropzone border highlight on empty submission, and validation enforcement in both `add-item.ejs` and `public/js/app.js`.
- **Optional Serial Number / Unique Tag Support**:
  - Added optional `serial_number` text input field in `views/admin/add-item.ejs` (paired with Found Date).
  - Added optional `serial_number` input field in `#log-item-dialog` and `#edit-item-dialog` in `views/dashboard.ejs`.
  - Updated inventory table in `views/dashboard.ejs` to display an inline `SN: <serial_number>` mono tag when present.
  - Updated `handlePostFoundItem` in `views/admin/add-item.ejs` and `submitNewItem` / `openEditItemModal` / `submitEditItem` in `public/js/app.js` to process and persist `serial_number`.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero physical delete check passed (`npm run check:no-delete`).

### Milestone 21: Institutional Brand Assets Architecture & CSPC Logo Integration
- **Asset Directory Structure**:
  - Standardized static brand assets under `public/images/` (`public/images/CSPCLogo.jpeg` and `public/images/cspc-logo.jpeg`).
  - Separated institutional assets from user/item custody uploads (`public/uploads/items/`).
- **Dashboard & App-Wide Branding Integration**:
  - Integrated the official `CSPCLogo.jpeg` into the Dashboard sidebar branding ([`views/dashboard.ejs`](./views/dashboard.ejs)) and Admin Add Item console ([`views/admin/add-item.ejs`](./views/admin/add-item.ejs)).
  - Also connected to the Public Catalog sidebar ([`views/index.ejs`](./views/index.ejs)) and Staff Login portal ([`views/login.ejs`](./views/login.ejs)).
  - Added `.brand-crest-img` CSS with `object-fit: cover` and resilient fallback to shield SVG on error.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero physical delete check passed (`npm run check:no-delete`).

### Milestone 22: Modern Enterprise UI Redesign for Inventory Filtering, Claims Queue & "Inspect & View" Dossier Modal
- **Inventory Filter Toolbar Redesign** ([`views/dashboard.ejs`](./views/dashboard.ejs)):
  - Replaced legacy text filter with a comprehensive `.table-actions-cluster` toolbar.
  - Added modern search field with embedded search icon (`#staff-item-search`), custom category dropdown (`#staff-item-category-filter`), custody status dropdown (`#staff-item-status-filter`), one-click filter reset button (`.btn-reset-filters`), and quick "Log Item" primary action.
  - Implemented multi-attribute client-side filtering (`runStaffInventoryFilter()` and `resetStaffInventoryFilters()` in [`public/js/app.js`](./public/js/app.js)) matching title, serial number, category, finder name, and storage status with dynamic item counter updates.
- **Claims Verification Queue & "Pending Verification" Pill Styling**:
  - Replaced plain select dropdown with fast interactive status pill selectors (`All`, `Pending`, `Approved`, `Rejected`) with dynamic badge counters.
  - Designed modern status badge pills:
    - `.pending-verification`: Amber badge with glowing/pulsing animation dot (`.pulse-dot-amber`).
    - `.accepted-claim`: Green badge with checkmark icon for approved/released claims.
    - `.rejected-claim`: Rose badge with dismiss icon for rejected claims.
  - Added dedicated claimant search filter (`#staff-claim-search`) in claims toolbar.
- **"Inspect & View" Action & Dossier Modal (`#review-claim-dialog`)**:
  - Redesigned table action button to **"Inspect & View"** (`.btn-inspect-view`) with an eye icon.
  - Completely redesigned `#review-claim-dialog` with high-hierarchy card layout:
    - Modal header with crest icon, claim reference tag (`#CLM-XXXX`), and live status badge.
    - Target Inventory Property banner displaying asset reference ID, title, and filing date.
    - 4-card Claimant Credentials grid (Full Name, Contact Phone, Email Address, Custody Status).
    - Amber-accented "Proof of Ownership" card displaying private markings and secret verification evidence.
    - Officer verification notes textarea and actionable Approve & Release / Reject buttons that automatically toggle based on claim review state.
- **Modal Dialog Display Fixes**:
  - Resolved issue where `<dialog class="custom-dialog">` was displayed in normal document flow at the bottom of the page even when closed, caused by an unconditional `display: flex;` rule overriding native `dialog:not([open])`.
  - Added explicit `dialog.custom-dialog:not([open]) { display: none !important; }` and scoped flex layout to `dialog.custom-dialog[open]`.
  - Removed outdated `notesEl` DOM reference to prevent runtime `ReferenceError` during Inspect & View modal interactions.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).
  - Zero physical delete check verified (`npm run check:no-delete`).

### Milestone 23: Item Inventory Fixed Image Layout, Thumbnail Box & Modal Preview
- **Root Cause Analysis**:
  - In `views/dashboard.ejs`, item records rendered `<img class="table-thumb">`, but `.table-thumb` had no styling in `public/css/style.css`.
  - High-resolution item photos expanded to their native intrinsic pixel sizes (e.g., 1000px+), stretching table cells, pushing table headers/columns off-screen, and breaking the inventory layout.
- **Fixed Layout & Thumbnail Box**:
  - Created `.table-responsive` with smooth horizontal scrolling.
  - Implemented `.table-item-cell` with `.table-thumb-box` (48px × 48px fixed dimensions, `overflow: hidden`, `border-radius: 8px`, border, subtle shadow, and hover zoom effect).
  - Enforced `object-fit: cover` and strict 100% width/height constraints on `.table-thumb` so uploaded images never overflow or warp the table.
  - Added clean `.table-thumb-fallback` icon box for items without photos or failed image URLs, ensuring every inventory row maintains aligned vertical rhythm.
  - Set column widths and non-wrapping bounds for `#staff-items-table` (ID, Category, Date, Status, Finder, Actions) to prevent table squishing.
- **Interactive Photo Lightbox Preview**:
  - Added `<dialog id="image-preview-dialog">` in `views/dashboard.ejs` allowing staff/admins to click any item thumbnail and inspect the full image in a modal with ref code and title caption.
  - Implemented `openThumbPreview()`, `openItemImagePreview()`, and `closeItemImagePreview()` in `public/js/app.js`.
- **Testing & Verification**:
  - Verified with real item `#FI-0014` and external image records.
  - All 143 unit tests passing (`npm test`).

### Milestone 24: Removal of Archive Action & Unified Button Design System
- **Archive Action Removal**:
  - Removed the `Archive` button from the Item Inventory ledger in `views/dashboard.ejs` to simplify operator actions down to active custody operations (`Claim` and `Edit`).
  - Preserved backend zero-delete soft-archiving controller and unit tests intact.
- **Unified Modern Button Design System**:
  - Implemented comprehensive `.btn` design tokens in `public/css/style.css` (`.btn-primary`, `.btn-outline`, `.btn-success`, `.btn-ghost`, `.btn-sm`).
  - Styled modal footer actions (`Cancel` with clean slate outline, `Update Record` and `Record in Custody` with institutional vibrant blue hover lift and shadow), completely eliminating browser-default beveled gray buttons.
  - Designed dedicated ledger action buttons (`.btn-action-claim` in sky-blue pill accent and `.btn-action-edit` in sleek slate border card) with inline SVG icons and hover elevations.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).

### Milestone 25: Dashboard-Wide Unified Pagination, Status Unification & Custody Fix
- **Unified Pagination System Across All Dashboard Tabs**:
  - **Item Inventory** ([`views/dashboard.ejs`](./views/dashboard.ejs#L395)): Default **5 items per page** (expandable to 10 or 20 items per page via dropdown), live search & status filter integration, and clear `#inventory-no-results-row`.
  - **Claims Verification** ([`views/dashboard.ejs`](./views/dashboard.ejs#L575)): Default **5 claims per page** (expandable to 10 or 20), status pill filter tabs (`All`, `Pending`, `Approved`, `Rejected`), live search, and `#claims-no-results-row`.
  - **Audit Trail** ([`views/dashboard.ejs`](./views/dashboard.ejs#L687)): Default **10 logs per page** (expandable to 20 or 50), live action/actor search, and `#audit-no-results-row`. Prevents 50+ logs from creating an excessively tall page.
  - Standardized `.table-pagination-footer` in [`public/css/style.css`](./public/css/style.css): Dynamic readouts (`Showing X–Y of Z items/claims/logs`), `Prev`, numeric page buttons (`1`, `2`, `...`), and `Next` with active states and disabled boundaries.
  - Automatically resets to Page 1 when searching or applying filter pills.
- **Status Design Consistency & Ledger Streamlining**:
  - Standardized `.status-pill-subtle` across all states (`Active`, `Stored`, `Processing`, `Claimed`).
  - Removed redundant `Claim` button from Item Inventory table; claims workflow is consolidated in the dedicated Claims Verification tab.
  - Resolved HTTP 400 Bad Request error on item updates by normalizing custodial values in both [`controllers/item-controller.js`](./controllers/item-controller.js) and [`public/js/app.js`](./public/js/app.js).
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).

### Milestone 26: Audit Search Input Redesign & Public View Dynamic Pagination
- **Audit Trail Search Input Redesign** ([`views/dashboard.ejs`](./views/dashboard.ejs#L616)):
  - Replaced the plain, unstyled text input (`.form-input.form-input-sm`) with the institutional `.table-search-input-wrap` and `.admin-search-field` containing an inline SVG search magnifying glass icon.
  - Matches the sleek modern design of Item Inventory and Claims Verification search fields.
- **Public Catalog Dynamic Pagination** ([`views/index.ejs`](./views/index.ejs#L248), [`routes/web-routes.js`](./routes/web-routes.js#L23), [`public/js/app.js`](./public/js/app.js#L90)):
  - Converted the previously static, hardcoded dummy buttons (`1`, `2`, `3`) into a fully functional dynamic pagination system.
  - Set default catalog page size to 6 cards per page with backend query support (`/api/v1/items?page=X&pageSize=6`).
  - Added interactive `renderPublicPagination()`: generates `Prev` (`‹`), numeric buttons (`1`, `2`, ...), `Next` (`›`), and updates the summary label (e.g. `Page 1 of 2 • 8 items recorded`).
  - Integrated `goToPublicPage()` with smooth scroll to catalog header upon page transitions.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`).

### Milestone 27: Centered Add Item Tab & Consistent Audit Navigation
- **Mobile Add Item Tab Positioning**:
  - Reordered the admin dashboard and Add Item mobile tab bars so `Add Item` sits in the middle, between `Inventory` and `Claims`.
  - Adjusted `.mob-tab-item.accent-tab` in [`public/css/style.css`] to give the prominent tab modest extra width while preserving the responsive tab-bar layout.
- **Audit Navigation Consistency** ([`views/admin/add-item.ejs`](./views/admin/add-item.ejs)):
  - Added the missing `Audit Trail` link to both the desktop sidebar and mobile bottom tab bar on the Add Item screen.
  - This fixes the mismatch where Audit was unavailable from Add Item and appeared again only after navigating to Inventory/dashboard.
- **Testing & Verification**:
  - Verified the Add Item template contains the desktop and mobile Audit links and the dashboard Add Item tab remains centered in the admin mobile navigation.

### Milestone 28: Claims/Add Item Order & Reliable Mobile Active State
- **Mobile Navigation Order**:
  - Swapped the `Claims` and `Add Item` tab order on both the dashboard and Add Item mobile navigation; the sequence is now `Inventory`, `Claims`, `Add Item`, `Audit`, `Sign Out`.
- **Active Tab Highlighting**:
  - Updated `switchDashboardTab()` in [`public/js/app.js`](./public/js/app.js) to update the mobile tab’s `active` class and `aria-current` state whenever a dashboard tab changes, including changes initiated from desktop navigation.
  - Strengthened the selected mobile tab background and preserved white label/indicator contrast when the Add Item accent tab is active in [`public/css/style.css`](./public/css/style.css).
  - Added the current-page accessibility state to the server-rendered dashboard mobile tab.
- **Testing & Verification**:
  - Verified the tab order and active-state updates in the affected templates and client controller; JavaScript syntax and whitespace checks passed.

### Milestone 29: Public Mobile Navigation Clickability & Staff Add Item Default
- **Public Mobile Tab Click Fix**:
  - Fixed the mobile bottom-sheet overlay in [`public/css/style.css`](./public/css/style.css): it was rendered transparent but remained hit-testable while the item details sheet was closed, blocking the public navigation tabs.
  - The overlay now displays only while the mobile item details sheet is open, keeping Browse, How to Claim, About, and Staff Access clickable.
- **Staff Login Default Destination**:
  - Updated web login redirects in [`routes/web-routes.js`](./routes/web-routes.js) so admins and guards land on `/admin/found-items/new` after login, and authenticated staff visiting `/login` are sent there too.
  - Updated the public catalog staff links in [`views/index.ejs`](./views/index.ejs) and the public login modal redirect in [`public/js/app.js`](./public/js/app.js) to use the same Add Item destination.
  - Existing explicitly requested, safe local redirect URLs remain honored.
- **Testing & Verification**:
  - Validated mobile overlay visibility and public tab interactions in the browser; JavaScript syntax, template compilation, and diff whitespace checks passed.
  - All 143 unit tests passed (`npm test`).

### Milestone 30: Desktop Sidebar Hamburger Availability
- **Responsive Sidebar Toggle**:
  - Made the public and admin sidebar hamburger buttons visible by default on desktop and tablet widths in [`public/css/style.css`](./public/css/style.css).
  - Kept both buttons hidden at mobile widths (`768px` and below), where the fixed mobile bottom tab navigation is used instead.
- **Testing & Verification**:
  - Verified desktop button visibility and sidebar collapse behavior at wide viewport sizes; `git diff --check` passed.

### Milestone 31: Centered Public Browse Tab & Mobile Staff Header Spacing
- **Public Mobile Navigation** ([`views/index.ejs`](./views/index.ejs)):
  - Removed the Staff Access/Admin/Staff Console tab from the public mobile bottom navigation.
  - Reordered the remaining tabs so Browse is centered between How to Claim and About, and styled Browse with the blue accent tab treatment.
- **Staff Mobile Topbar** ([`public/css/style.css`](./public/css/style.css)):
  - Prevented the staff breadcrumb and secure-session indicator from wrapping into cramped multi-line text on mobile.
  - Hid redundant breadcrumb prefixes and, on narrow phones, the date; retained the active page name, session status, and notification control.
- **Testing & Verification**:
  - Verified public mobile tab order, template compilation, and mobile staff topbar responsive rules; `git diff --check` passed.

### Milestone 32: Desktop Sidebar Collapse Icon Fix & Add Item Hamburger Toggle
- **Add Item Console Hamburger Script Inclusion** ([`views/admin/add-item.ejs`](./views/admin/add-item.ejs)):
  - Added `<script src="/js/app.js"></script>` to the Add Item view template, restoring the missing `toggleAdminSidebar()` function and localStorage state persistence on desktop/tablet views.
  - Added descriptive `title` tooltips to admin and guard sidebar navigation items across [`views/admin/add-item.ejs`](./views/admin/add-item.ejs) and [`views/dashboard.ejs`](./views/dashboard.ejs).
- **Desktop Sidebar Collapse Styling Fix** ([`public/css/style.css`](./public/css/style.css)):
  - Fixed icon disappearance when the desktop sidebar is collapsed (`.sidebar-collapsed`): reset sidebar outer padding to `0`, centered 44×44px square pills with rounded corners, and enforced `flex-shrink: 0`, explicit 20×20px dimensions, and `display: block` on SVG icons.
  - Added smooth transition properties to `.admin-sidebar` for seamless collapse animations matching the public sidebar.
- **Testing & Verification**:
  - Verified test suite passes (143/143 tests passing); verified desktop collapse layout and script availability.

### Milestone 33: Public Catalog Shortcut Relocation to Topbar Header
- **Sidebar Menu Cleansing** ([`views/dashboard.ejs`](./views/dashboard.ejs), [`views/admin/add-item.ejs`](./views/admin/add-item.ejs)):
  - Removed "Public Catalog View" from the internal `ADMIN WORKSPACE` / `SECURITY WORKSPACE` sidebar action list to maintain strict focus on admin/guard operational tasks.
- **Topbar Header Public Link** ([`views/dashboard.ejs`](./views/dashboard.ejs), [`views/admin/add-item.ejs`](./views/admin/add-item.ejs), [`public/css/style.css`](./public/css/style.css)):
  - Added `.btn-topbar-public` (`[ 🌐 View Public Site ↗ ]`) in the top navigation header on desktop view.
  - Added responsive styling for mobile view (`max-width: 768px`) transforming it into a clean `32×32px` icon button `[ 🌐 ]` beside the notification bell, providing 1-tap public catalog preview access from mobile devices.
- **Testing & Verification**:
  - Verified all 143 unit tests passing (`npm test`); verified responsive topbar layout on desktop and mobile viewports.

### Milestone 34: Form Input Sanitization & Normalization (Email & Phone Numbers)
- **Backend Email Normalization & Phone Sanitization** ([`services/claims-service.js`](./services/claims-service.js)):
  - Normalized `claimant_email` to lowercase (`.toLowerCase().trim()`) before persistence and format check to prevent case duplication mismatches.
  - Sanitized `claimant_phone` by stripping presentation characters (spaces, dashes, parentheses, dots: `replace(/[\s\-().]/g, '')`) and enforced format validation with `/^\+?[0-9]{7,15}$/` while preserving 20-character caps.
- **Client-Side Validation & Formatting** ([`public/js/app.js`](./public/js/app.js)):
  - Added frontend normalization and regex validation for email and phone numbers in both `submitPublicClaim` and `submitInPersonClaim` before API dispatch, offering immediate toast feedback on malformed contacts.
- **Testing & Verification**:
  - All 143 unit tests passing (`npm test`); verified clean validation errors and successful formatting coercion.

---

## 7. Upcoming Roadmap & Pending Tasks

- [x] **HTTP Controllers & Routes for Items** (done)
- [x] **HTTP Controllers & Routes for Claims** (done)
- [x] **Claims Review Workflow (Staff)** (done)
- [x] **Auth & Session Middleware** (done)
- [x] **EJS View Engine & UI Design Implementation** (done)
- [x] **Single Unified Login Portal & Role-Based Redirection** (done)
- [x] **Admin Console "Add Found Item" & Audit Log Stream UI** (done)
- [x] **Login Page Viewport Centering & Admin Layout Alignment** (done)
- [x] **Public Claims Raising (Service & Repository)** (done)
- [x] **Public Sidebar Redundancy Removal & Claiming Guide Modal** (done)
- [x] **Admin Console & Guard Navigation Streamlining** (done)
- [x] **Admin & Guard Dashboard Tabs Design & Interactive Controller** (done)
- [x] **Unified Console Layout for Item Inventory & Claims Verification** (done)
- [x] **Guard Dedicated Intake Console & Custom Modal Styling** (done)
- [x] **Image Upload Handling** (done)
- [ ] **Integration Tests**:
  - Supertest HTTP test suite for auth + items + claims endpoints.
  - `tests/integration/auth.test.js`: login, logout, /me, 401 on protected routes.
  - `tests/integration/items.test.js`: public GET, protected POST/PUT/DELETE.
  - `tests/integration/claims.test.js`: public POST, staff GET/PATCH.

---

## 8. Bug Fixes & Patches

### Patch 35: Guard Mobile Nav — "Add Item" Tab Disappeared After Tab Switch
- **Root Cause** ([`views/dashboard.ejs`](./views/dashboard.ejs)):
  - The mobile bottom navigation bar rendered the "Add Item" tab inside a `<% if (role === 'admin') { %>` EJS conditional, meaning guard-role users never had the button in the DOM.
  - Since `switchDashboardTab()` clears `.active` from all `.mob-tab-item` elements and re-applies it by ID, and the button didn't exist for guards, switching tabs caused the active highlight to land nowhere, creating the illusion that the entire Add Item action was lost.
- **Fix**: Removed the `role === 'admin'` guard from the mobile Add Item tab. Both admin and guard roles need access to `/admin/found-items/new` (already enforced server-side by route middleware), so the mobile button must be visible to all staff.
- **Files Changed**: [`views/dashboard.ejs`](./views/dashboard.ejs) — lines ~1154–1161.

### Patch 36: Public View Sidebar Logo Appears Squashed / Cropped
- **Root Cause** ([`views/index.ejs`](./views/index.ejs)):
  - The CSPC logo `<img>` inside `.brand-shield-box` used `object-fit: cover`, which crops and fills the container box. Because the CSPC seal is circular and narrower than the container's aspect ratio, `cover` caused visible stretching/squashing on the public view sidebar.
  - The dashboard sidebar logo used `.brand-crest-img` which also has `object-fit: cover` in CSS, but the difference in perceived quality was noted by the user comparing screenshots side-by-side.
- **Fix**: Changed `object-fit: cover` → `object-fit: contain` on the public sidebar logo `<img>` so the full crest is visible without distortion, matching the intended round logo display. The white background on the container ensures no letterboxing artefacts appear.
- **Files Changed**: [`views/index.ejs`](./views/index.ejs) — line ~9.

### Patch 37: Session Logout Confirmation Dialog & Collapsed Desktop Sidebar Logout
- **Root Cause & Requirements**:
  - Direct navigation to `/logout` immediately terminated user session without verification, risking accidental logouts and loss of in-progress edits.
  - When the desktop sidebar was collapsed (`.sidebar-collapsed`), `.admin-sidebar-bottom` was hidden with `display: none !important`, completely removing the logout button from the viewport on desktop/tablet views.
  - Redundant header ("Session / Sign Out of Session") cluttered the modal and duplicate red text logout button in the expanded sidebar cluttered the navigation.
- **Fix**:
  - Simplified `<dialog id="logout-confirm-dialog" class="custom-dialog sm">` by removing the redundant "Session / Sign Out of Session" title header, keeping an absolute corner close button (`✕`), centered shield alert badge, "Are you sure you want to sign out?", cancel button, and red "Yes, Sign Out" action button.
  - In expanded desktop sidebar view, only the bottom user profile sign out button (`.btn-sidebar-logout` beside user name) remains visible (`.admin-nav-logout-icon` hidden with `display: none !important`).
  - When the sidebar is collapsed via the hamburger toggle, `.admin-nav-logout-icon` is automatically displayed as an icon-only button (44×44px square) in the sidebar nav with subtle red hover styling, ensuring sign-out is always accessible in collapsed icon mode.
  - Added `openLogoutDialog()` and `closeLogoutDialog()` functions to [`public/js/app.js`](./public/js/app.js), integrated backdrop-click-to-dismiss, and synchronized aria/title state with `#admin-sidebar-toggle-btn`.
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`views/admin/add-item.ejs`](./views/admin/add-item.ejs)
  - [`public/js/app.js`](./public/js/app.js)
  - [`public/css/style.css`](./public/css/style.css)

### Patch 38: Removal of Redundant Dashboard Horizontal Navigation Tabs
- **Root Cause & Requirements**:
  - The dashboard rendered a duplicate horizontal tab bar (`.dashboard-tabs` with Item Inventory, Claims Verification, and Audit Trail buttons with counter pills) above the main content area.
  - Since section navigation is already handled by the primary left sidebar on desktop/tablet views and by the mobile bottom navigation bar on mobile devices, this horizontal bar was visually redundant and occupied valuable viewport space.
- **Fix**:
  - Removed the `.dashboard-tabs` container from [`views/dashboard.ejs`](./views/dashboard.ejs).
  - Preserved graceful compatibility in `switchDashboardTab()` in [`public/js/app.js`](./public/js/app.js).
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)

### Patch 39: Analytics & Telemetry Tab (GA4 Style) and Top Right Add Item Modal Trigger
- **Root Cause & Requirements**:
  - The user requested replacing the "ADD FOUND ITEM" item in the desktop/tablet sidebar with an "Analytics" tab featuring graphs inspired by Google Analytics 4 (GA4).
  - The "Add Found Item" action was relocated to the top-right header area (replacing the static access badge), turning it into a prominent modal button accessible across all tabs.
  - Mobile bottom navigation tabs were explicitly kept unchanged.
- **Fix**:
  - Replaced the sidebar `ADD FOUND ITEM` link with `Analytics` in [`views/dashboard.ejs`](./views/dashboard.ejs) and [`views/admin/add-item.ejs`](./views/admin/add-item.ejs), connected to `switchDashboardTab('analytics')`.
  - Replaced the top right `badge-access-pill` in the hero banner with a primary `.btn-hero-add-item` button (`[+ Add Found Item]`) that invokes `openNewItemModal()`, opening the full intake modal (`#log-item-dialog`) directly from any active tab.
  - Built a 2×2 GA4-style analytics dashboard (`#tab-panel-analytics`) featuring:
    1. **Property Ingestion (28-Day Dual-Line Trend)**: Ingestion velocity vs. Reunited claims over the past 28 days with smooth bezier curves.
    2. **Intake by Asset Category (Bar Chart)**: Volume distribution across categories.
    3. **Reunification & Claim Rate (Dynamics Trend)**: Percentage recovery rate with cumulative returns curve.
    4. **Top Campus Found Locations (Horizontal Bar Chart)**: Incident hotspot distribution.
  - Integrated local standalone Chart.js library ([`public/js/chart.min.js`](./public/js/chart.min.js)) for zero-latency, offline rendering.
  - Implemented `initAnalyticsCharts()` in [`public/js/app.js`](./public/js/app.js) with real-time JSON telemetry bindings, automated chart resizing, and breadcrumb synchronization.
  - Added modern GA4 styling and responsive rules in [`public/css/style.css`](./public/css/style.css).
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`views/admin/add-item.ejs`](./views/admin/add-item.ejs)
  - [`public/js/chart.min.js`](./public/js/chart.min.js)
  - [`public/js/app.js`](./public/js/app.js)
  - [`public/css/style.css`](./public/css/style.css)

### Patch 40: Hero Banner & Constant Stat Cards Removal + Main Body Top-Right Action Bar
- **Root Cause & Requirements**:
  - The static "Campus Custody Operations" hero banner and 3 constant summary cards (Pending Claims, Total Logged Items, Reunited & Returned) occupied significant vertical viewport real estate while offering duplicate telemetry now presented dynamically in the Analytics tab.
  - The user requested completely removing these redundant banners/cards and ensuring the "+ Add Found Item" action button is placed inside the main body top-right, visible and persistent across all sidebar tabs (`Analytics`, `Item Inventory`, `Claims Verification`, `Audit Trail`), while leaving the top breadcrumb/session header clean and mobile bottom tabs untouched.
- **Fix**:
  - Removed `<section class="admin-hero-banner">` and `<section class="admin-summary-grid">` from [`views/dashboard.ejs`](./views/dashboard.ejs).
  - Kept top header bar (`.admin-topbar-right`) dedicated solely to `View Public Site`, `Secure session`, live date, and notification bell.
  - Added `.admin-main-action-bar` at the top of `.admin-content-container` in [`views/dashboard.ejs`](./views/dashboard.ejs), positioning the primary `.btn-hero-add-item` button (`[+ Add Found Item]`) at the top right of the main content area across all sidebar views.
  - Updated responsive styles in [`public/css/style.css`](./public/css/style.css): full button styling on desktop/tablet views and hidden on mobile `<= 768px` where the dedicated mobile bottom tab bar (`.mobile-bottom-tab-bar .accent-tab`) provides direct item creation.
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`public/css/style.css`](./public/css/style.css)
  - [`records.md`](./records.md)

### Patch 41: Mobile View Add Item Hide Rule, Topbar Sign Out Icon, and Mobile Analytics Tab
- **Root Cause & Requirements**:
  - In mobile view, the main body `+ Add Found Item` button still rendered because a subsequent CSS rule overrode the initial media query rule, causing duplicate "Add Item" buttons on mobile screens where the bottom navigation bar already features a prominent centered `Add Item` tab.
  - The user requested replacing the bottom mobile tab "Sign Out" button with "Analytics" and moving the Sign Out action to the top header in place of the system notifications bell icon.
- **Fix**:
  - Enforced `@media (max-width: 768px) { .admin-main-action-bar, .btn-hero-add-item { display: none !important; } }` directly after `.btn-hero-add-item` in [`public/css/style.css`](./public/css/style.css), ensuring the button only renders on desktop/tablet views.
  - Replaced `.btn-topbar-bell` with `.btn-topbar-logout` in both [`views/dashboard.ejs`](./views/dashboard.ejs) and [`views/admin/add-item.ejs`](./views/admin/add-item.ejs), providing an accessible header Sign Out button that triggers `#logout-confirm-dialog`.
  - Replaced `#mob-tab-logout` with `#mob-tab-analytics` in `.mobile-bottom-tab-bar` in [`views/dashboard.ejs`](./views/dashboard.ejs) and [`views/admin/add-item.ejs`](./views/admin/add-item.ejs), linking directly to `switchDashboardTab('analytics')` with automatic active state synchronization.
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`views/admin/add-item.ejs`](./views/admin/add-item.ejs)
  - [`public/css/style.css`](./public/css/style.css)
  - [`records.md`](./records.md)

### Patch 42: Comprehensive Mobile Analytics Refinement & Responsive Chart Scaling
- **Root Cause & Requirements**:
  - In mobile view, the Analytics dashboard had large desktop-oriented padding (`1.75rem 2.25rem 3rem` in `.admin-content-container` and `1.5rem` in `.analytics-dashboard-wrap`), resulting in cramped horizontal space on small screens.
  - The 1.85rem metric numbers (especially wide text like `Clothing & Accessories (1)`) caused card text overflow.
  - Chart.js category and location labels lacked mobile truncation, and the bottom-most card could be obscured by the fixed mobile bottom navigation bar.
- **Fix**:
  - Optimized container spacing on mobile (`max-width: 768px` and `max-width: 480px`) with `padding: 0.85rem 0.75rem 6.5rem;` in `.admin-content-container`, ensuring generous clearance above `.mobile-bottom-tab-bar`.
  - Added `.analytics-title-cluster` with flex-wrapping for the header title and live telemetry chip.
  - Set `.ga4-metric-number` to responsive typography (`1.35rem` on tablet/mobile, `1.18rem` on small screens) with `text-overflow: ellipsis; white-space: nowrap; max-width: 100%;`.
  - Stacked `.ga4-card-header` vertically on mobile with legends positioned neatly under metrics.
  - Enhanced Chart.js configs in [`public/js/app.js`](./public/js/app.js):
    - Category chart: X-axis label rotation (30°) and smart truncation (`11 chars` with ellipses) while keeping full category names in tooltip popovers.
    - Location chart: Y-axis label truncation for clean alignment on phones.
    - Trend & Dynamics charts: reduced tick limits (`4` ticks on screens `< 640px`) to prevent date overlap.
    - Added responsive window resize event listener to trigger Chart `.resize()` automatically on mobile viewport changes and orientation flips.
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`public/css/style.css`](./public/css/style.css)
  - [`public/js/app.js`](./public/js/app.js)
  - [`records.md`](./records.md)

### Patch 43: Default Login to Analytics for All Roles & Mobile Add Item Modal Trigger
- **Root Cause & Requirements**:
  - Prior routing redirected admins upon login or accessing `/dashboard` without a query tab directly to `/admin/found-items/new`, while guards defaulted to `tab=items`.
  - In mobile view, the center `Add Item` button in the bottom navigation bar was an anchor linking to `/admin/found-items/new`, forcing a full page navigation away from the dashboard instead of popping open the modal.
- **Fix**:
  - In [`routes/web-routes.js`](./routes/web-routes.js):
    - Removed admin-specific redirect to `/admin/found-items/new`.
    - Updated both GET & POST `/login` redirects to default to `/dashboard?tab=analytics`.
    - Set default `activeTab` on `/dashboard` to `'analytics'` for both `guard` and `admin` roles (`req.query.tab || 'analytics'`).
  - In [`views/dashboard.ejs`](./views/dashboard.ejs):
    - Converted `#mob-tab-add` in `.mobile-bottom-tab-bar` from an anchor tag into a button invoking `openNewItemModal()`. Clicking it directly opens the `#log-item-dialog` modal from any active tab without page reload.
- **Files Changed**:
  - [`routes/web-routes.js`](./routes/web-routes.js)
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`records.md`](./records.md)

### Patch 44: Mobile Bottom Sheet Filter & Active Filter Chips for Inventory and Claims
- **Root Cause & Requirements**:
  - On mobile (`<= 768px`), the `.table-actions-cluster` in both Item Inventory and Claims Verification stacked inline dropdowns/pills vertically, consuming 150–180px of vertical space before the data table — degrading the mobile table-browsing experience.
  - The user selected the "Mobile Bottom Sheet Modal" design pattern: a slide-up drawer with filter pill buttons, an "Apply Filters" CTA, and active filter chip tags beneath the search bar (matching reference images).
- **Fix**:
  - **[`views/dashboard.ejs`](./views/dashboard.ejs)**:
    - Restructured `.table-actions-cluster` in `#tab-panel-items` and `#tab-panel-claims` into a new `.search-and-filter-bar` (search input + `.btn-filter-trigger`) and `.desktop-filter-controls` (inline dropdowns hidden on mobile).
    - Added a clear-search `✕` button inside each search input wrap (`#inv-clear-search-btn`, `#claim-clear-search-btn`).
    - Added `.active-filter-chips-row` containers (`#inventory-active-chips`, `#claims-active-chips`) below each toolbar to display active filter chips.
    - Inserted `<dialog id="inventory-filter-sheet" class="bottom-sheet-dialog">` and `<dialog id="claims-filter-sheet" class="bottom-sheet-dialog">` with pill-button sections for Category + Status (Inventory) and Claim Status (Claims), drag handle, header with ✕ close + Reset text button, and sticky "Apply Filters" CTA.
  - **[`public/css/style.css`](./public/css/style.css)**:
    - Added `.hidden { display: none !important; }` global utility class.
    - Added `.search-and-filter-bar`, `.btn-filter-trigger`, `.filter-count-badge`, `.desktop-filter-controls` responsive styles. On mobile (`<= 768px`): `.btn-filter-trigger` shown as `inline-flex`; `.desktop-filter-controls` hidden with `display: none !important`.
    - Styled `.active-filter-chips-row`, `.active-filter-chip`, `.btn-remove-chip`, `.btn-clear-all-chips` with pill animations (`chipFadeIn`) for chip appearance.
    - Styled `dialog.bottom-sheet-dialog` with slide-up animation (`sheetSlideUp` on mobile, `sheetPop` on desktop), `.bottom-sheet-container`, `.bottom-sheet-header`, `.sheet-filter-group`, `.sheet-pill-grid`, `.sheet-filter-pill` (active = dark `#1E293B` bg), `.bottom-sheet-footer`, `.btn-sheet-apply`.
  - **[`public/js/app.js`](./public/js/app.js)**:
    - Added `openInventoryFilterSheet()`, `closeInventoryFilterSheet()`, `selectSheetInventoryCategory()`, `selectSheetInventoryStatus()`, `_syncSheetInventoryPills()`, `applyInventoryFilterSheet()`, `resetInventoryFiltersFromSheet()`.
    - Added `renderInventoryActiveChips()`, `_removeInventoryChip()`, `updateInventoryFilterBadge()`.
    - Added `clearInventorySearch()`, `clearClaimsSearch()` helpers.
    - Added `openClaimsFilterSheet()`, `closeClaimsFilterSheet()`, `selectSheetClaimStatus()`, `_syncSheetClaimPills()`, `applyClaimsFilterSheet()`, `resetClaimsFiltersFromSheet()`.
    - Added `renderClaimsActiveChips()`, `_removeClaimsChip()`, `_clearAllClaimsFilters()`, `updateClaimsFilterBadge()`.
    - Wrapped `runStaffInventoryFilter` and `filterStaffClaims`/`setClaimFilter` with IIFE patterns to auto-invoke chip and badge updates on every filter run.
    - Added backdrop-click close handlers for both filter sheet dialogs in `DOMContentLoaded`.
    - Restored missing `let auditCurrentPage = 1;` declaration that was inadvertently removed.
- **Files Changed**:
  - [`views/dashboard.ejs`](./views/dashboard.ejs)
  - [`public/css/style.css`](./public/css/style.css)
  - [`public/js/app.js`](./public/js/app.js)
  - [`records.md`](./records.md)

### Patch 45: Topbar Sign Out Button Responsive Visibility (Desktop & Tablet Removal)
- **Root Cause & Requirements**:
  - The user requested removing the top header Sign Out button (`.btn-topbar-logout`) in desktop view and tablet view.
  - On desktop and tablet screens (`> 768px`), the navigation sidebar is always available and already houses dedicated, prominent Sign Out controls (both in the footer profile strip when expanded and as an icon nav item when collapsed). Displaying the red Sign Out button in `.admin-topbar-right` next to the date was redundant and cluttered the header.
  - On mobile views (`<= 768px`), where the sidebar is completely hidden and the bottom navigation bar houses feature tabs (including Analytics), the topbar Sign Out button remains active and accessible.
- **Fix**:
  - In [`public/css/style.css`](./public/css/style.css), updated `.btn-topbar-logout` to default to `display: none !important;` (hiding it cleanly across desktop and tablet viewport widths).
  - Inside `@media (max-width: 768px)`, set `.btn-topbar-logout { display: flex !important; }` so mobile phone users retain their convenient, accessible header logout action.
- **Files Changed**:
  - [`public/css/style.css`](./public/css/style.css)
  - [`records.md`](./records.md)
