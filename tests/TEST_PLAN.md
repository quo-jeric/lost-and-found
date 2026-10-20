# Integration and End-to-End Test Plan

## Scope and test approach

The application is a mixed Express REST API and server-rendered EJS web app. Keep
the existing Vitest unit suite, add HTTP integration coverage with Supertest
against the real Express app and migrated MySQL schema, and add a browser journey
with Playwright against a live app process. MySQL is a real dependency for both
new tiers, including the persistent session store; no database, repository,
service, or browser behavior is mocked.

All integration and browser tests require a dedicated MySQL schema whose name
ends in `_test` (normally `lost_and_found_test`). The shared test helper checks
the selected database name and required migrated tables before tests can write.
Fixtures use unique emails and labels; test users are deactivated and test items
are archived in teardown. Claim rows are retained and marked rejected because
business records must not be physically deleted. Test-only category and location
rows are retained in the isolated test schema.

## Areas under test

| Boundary | Areas |
|---|---|
| HTTP/API | Authentication (`POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`); item list/create/update/archive (`GET/POST /api/v1/items`, `PUT/DELETE /api/v1/items/:id`); claim create/list/review (`POST/GET /api/v1/claims`, `PATCH /api/v1/claims/:id/review`) |
| Session/security | MySQL-backed session persistence, cookie-based authenticated requests, unauthenticated 401 responses, public claim submission, staff-only operations |
| Database/repositories | User credential lookup; item and claim insert/read/update; category/location foreign keys; active/inactive item filtering; pending-claim duplicate detection; audit-log writes and actor attribution |
| Server-rendered UI | Public catalog EJS rendering, selecting an item, item details panel, claim dialog, client-side claim submission, success feedback |
| Persistence | API/browser write followed by HTTP or SQL read-back; accepted-claim handling archives the item; audit rows correspond to successful business writes |

## Test-by-test implementation plans

### `tests/integration/auth.test.js`

1. Create a unique staff account in the test schema and start requests against
   the real Express app with the MySQL session store.
2. Verify that anonymous requests to `/api/v1/auth/me` and `/api/v1/auth/logout`
   return 401.
3. Log in through `/api/v1/auth/login`; verify the sanitized account payload
   and use the same cookie agent to read `/api/v1/auth/me`.
4. Log out, then verify the same cookie agent can no longer read the protected
   profile endpoint.
5. Read `audit_log` for the fixture user and verify `LOGIN` and `LOGOUT` records.
6. Deactivate the test user during teardown.

**Pass criteria:** expected HTTP statuses and profile fields match; no password
hash is exposed; the session is invalid after logout; both audit events persist.

### `tests/integration/items.test.js`

1. Create a staff account and unique category/location foreign-key fixtures.
2. Verify an anonymous `POST /api/v1/items` is rejected with 401.
3. Log in and create an item through the API; verify the returned ID, status,
   and logging actor.
4. Query the public item list by its unique title and confirm it contains the
   created item.
5. Update the title and serial number through `PUT /api/v1/items/:id`, then
   read the row directly from MySQL to verify persisted values.
6. Archive the item through the admin-only `DELETE /api/v1/items/:id` endpoint;
   verify public detail now returns 404 while the database row remains
   `inactive`.
7. Verify the corresponding `INSERT`, `UPDATE`, and `ARCHIVE` audit entries;
   archive the fixture and deactivate the staff account during teardown.

**Pass criteria:** unauthorized writes are blocked; create/update/read/archive
responses are correct; state and audit records persist; the row is retained.

### `tests/integration/claims.test.js`

1. Create a staff account and category/location fixtures; log in and create an
   active item through the API.
2. Verify an anonymous request to `GET /api/v1/claims` returns 401.
3. Submit a public claim with a unique email and identifying proof; verify a
   pending claim is returned and duplicate submission returns 409
   (`DUPLICATE_CLAIM`).
4. Log in as staff, filter the claim list by item, and accept the claim with
   processing notes.
5. Read claim and item rows from MySQL to verify the accepted status, reviewer,
   notes, and automatic item archival.
6. Verify the public claim `INSERT` audit entry has no actor, and claim/item
   review audit entries identify the staff account.
7. Mark any remaining pending claims rejected, archive the item, and deactivate
   the staff account during teardown.

**Pass criteria:** duplicate prevention and staff authorization behave as
specified; claim and item state transitions persist atomically with audit data.

### `tests/e2e/public-claim.spec.js`

1. Start the real app with the Playwright web-server lifecycle and seed a unique
   active item into the test schema.
2. Verify an anonymous request to the staff-only claims list returns 401.
3. Load `/` in Chromium, locate and select the fixture card, and verify the
   selected item details update.
4. Open the claim dialog, enter claimant contact and ownership proof, and submit
   using the real browser-side JavaScript.
5. Assert the browser receives HTTP 201, the dialog closes, and the success
   toast appears.
6. Read the claim row from MySQL and verify its item, claimant, proof, and
   pending state.
7. Reject any remaining pending fixture claim and archive the item during
   teardown.

**Pass criteria:** the rendered UI journey reaches the real claims endpoint,
shows success only after a successful response, and stores the submitted data.

## Environment and execution

- Node.js 20+; Playwright Chromium installed with `npx playwright install chromium`.
- MySQL 8+ test schema with migrations `001`–`009` applied, including `sessions`.
- Dedicated credentials exposed as `TEST_DB_HOST`, `TEST_DB_PORT`,
  `TEST_DB_USER`, `TEST_DB_PASSWORD`, and `TEST_DB_NAME`; the name must end in
  `_test`. The app and session middleware use these settings only after the
  test helper has verified the schema.
- The migration runner reads `DB_*` variables, so point those variables and
  migration credentials at the isolated test schema while applying migrations.
- Docker is not required because MySQL is provisioned separately. This does not
  remove the browser E2E tier: Playwright runs independently against that MySQL
  instance.
- `npm run test:unit` runs the offline unit baseline;
  `npm run test:integration` runs the real-MySQL HTTP tests;
  `npm run test:e2e` runs the browser test; `npm test` runs all three tiers.

## Known gaps and review expectations

- The browser suite currently covers the public claim workflow, not staff
  dashboard rendering or image upload.
- The MySQL test schema is external infrastructure, not a Docker-managed
  disposable instance. Do not point it at a shared or production schema.
- Reviewers should confirm all three integrations use the real app and database,
  the browser test exercises the rendered UI and client script, fixtures are
  unique and safely cleaned up, and each write has read-back/audit assertions.
