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
│   └── item-repository.js           # findItemById() [supports FOR UPDATE], insertItem(), updateItem()
├── services/                        # Business logic layer (auth-agnostic, transaction orchestration)
│   └── items-service.js             # addItem(), editItem(), getItemById() with payload validation & audit logging
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
│       └── items-service.test.js    # 35 unit tests covering addItem, editItem, getItemById, and AppError
├── app.js                           # Express application setup (kept free of listen() for testing)
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

---

## 7. Upcoming Roadmap & Pending Tasks

- [ ] **HTTP Controllers & Routes for Items**:
  - Implement `controllers/item-controller.js` to handle request parsing, context extraction (`req.session.userId`, `req.ip`, `req.id`), and standardized JSON responses.
  - Implement `routes/item-routes.js` with endpoint definitions:
    - `POST /api/v1/items` (create lost item)
    - `PUT /api/v1/items/:id` (edit lost item)
    - `GET /api/v1/items/:id` (fetch lost item details)
    - `GET /api/v1/items` (list/search lost items with pagination)
  - Mount items routes in `app.js`.
- [ ] **Auth & Session Middleware**:
  - Implement `middleware/auth.js` (`requireAuth`, `requireRole('admin', 'guard')`).
  - Session configuration with persistent MySQL session store (`express-mysql-session`).
- [ ] **Image Upload Handling**:
  - Configure file upload middleware (e.g. Multer) with file type validation and size limits.
  - Map uploaded image paths to `image_url` prior to invoking `items-service.js`.
- [ ] **Claims Management Workflow**:
  - Implement `repositories/claim-repository.js`.
  - Implement `services/claims-service.js` (create claim, review claim, approve/reject claim).
- [ ] **Integration Tests**:
  - Supertest HTTP test suite for items endpoints in `tests/integration/items.test.js`.
