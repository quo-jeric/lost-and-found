# Lost and Found App

A backend service for a Lost and Found tracking system built with **Node.js**, **Express**, and **Raw MySQL** (no ORM).

---

## Features

- **Raw SQL Migrations:** Forward-only migration runner with SHA-256 checksum verification and advisory locks (`GET_LOCK`).
- **No Physical Deletes:** Strict soft-delete architecture (`deleted_at`, `deleted_by`) with foreign key constraints set to `ON DELETE RESTRICT`.
- **Transactional Audit Trail:** Every business write and auth event writes an audit log in the same transaction, automatically stripping sensitive credentials.
- **Least-Privilege Database Users:** Dedicated roles for runtime application (`laf_app`), migrations (`laf_migrate`), and testing (`laf_test`).
- **Strict SQL Isolation:** Repository layer pattern with parameterized queries and explicit column selections (no `SELECT *`).

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

---

## Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts development server with nodemon auto-reloading |
| `npm start` | Starts server in production mode |
| `npm run db:migrate` | Runs all pending database migrations in order |
| `npm run check:no-delete` | Lints repository/service files to enforce no physical `DELETE` or `TRUNCATE` statements |

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
