# Backend Foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, task by task. The owner authorised integration and this foundation milestone with “then go ahead” on 10 October 2026.

**Goal:** Run a separate NestJS API against PostgreSQL with secure identity, permission-scoped stock receiving, persistent catalogue/availability reads and reusable web/native contracts.

**Architecture:** Keep the existing Next.js application at the repository root. Add `apps/api` with its own pinned npm lockfile/build, and move the framework-free contracts to `packages/contracts`, retaining web import shims. PostgreSQL owns sessions, stock, idempotency, audit and outbox records. This is a private foundation preview; commerce, provider integrations, workers and live AI remain later milestones in the existing spec.

**Tech Stack:** Node 24; NestJS 11.2.7; Prisma/client/pg adapter 7.10.0; PostgreSQL 17; Zod 4; built-in Node crypto and test runner. Do not upgrade the web application's dependency graph.

**Spec:** `docs/superpowers/specs/2026-10-09-production-backend-design.md`

## Global Constraints

- One stock truth; location IDs, UTC timestamps, GHS integer minor units and precise decimal stock strings.
- Web: secure HttpOnly same-site sessions, trusted origins and CSRF on authenticated cookie mutations. Native: short-lived opaque bearer tokens and rotating refresh sessions with durable reuse revocation.
- Authorisation is derived from the stored user/session: owner admins have business-wide active-location access; inventory managers require location grants. Body `actor`, roles or customer IDs never grant privileges.
- No Next.js, React, Prisma or mock-store imports in shared contracts.
- Stock changes, idempotent outcomes, audit and outbox events commit atomically. No worker or exactly-once delivery claims in this milestone.
- Public shop remains on its existing mode until the full commerce backend is ready. Missing production endpoints fail closed.

## Review Focus

- Two API instances must share login throttles, session revocation and receiving replay state.
- Duplicate native refresh attempts must revoke the session family, including the newly issued access token.
- Invalid second receiving lines and ungranted locations must leave no partial lots/movements/audit/outbox.
- Expired/quarantined/damaged lots, expired holds and inactive records must not inflate public availability.
- Malformed request bodies, pagination, forged actor data and untrusted origins must return safe errors without leaking credentials.

### Task 1: Executable API, durable schema and contracts package

**Files:** `apps/api/package.json`, `package-lock.json`, `tsconfig.json`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/*`, `src/bootstrap.ts`, `src/database/*`, `src/http/*`, `src/health/*`; `packages/contracts/{package.json,tsconfig.json,src/*}`; existing web contracts shims, root tsconfig and CI.

**Interfaces:** Produces `createApplication(config: ApiConfig): Promise<INestApplication>`, injected `Database extends PrismaClient`, and `@variety/contracts` built CommonJS types/schemas. API prefix `/api/v1`, live `/health/live`, ready `/health/ready`, `{ok,data}` / `{ok:false,error,requestId}` responses.

- [x] Write `test/foundation.spec.ts` using real localhost HTTP and PostgreSQL. Assert liveness/readiness, safe 404 errors, request IDs and package response validation.
- [x] Run the startup cases against a controller-free application: expected 404 instead of health 200.
- [x] Add fail-fast environment validation, database lifecycle, bounded JSON parser, security headers, exact CORS allowlist and health handlers. Create migration with users/sessions/throttles, catalogue/location/positions/lots/holds/receipts/movements, idempotency, audit and outbox tables; nonnegative/unique/FK constraints and append-only movement/audit triggers.
- [x] Apply migrations to an empty PostgreSQL database; rebuild and run tests. Expected health 200/ready 200; unknown routes 404; secret-free errors; identical web contracts behavior.
- [x] Commit task and record commands/results in the milestone checkpoint.

### Task 2: Web and native identity with permissions

**Files:** `packages/contracts/src/identity.ts`, `apps/api/src/identity/{crypto,identity.service,identity.controller,access.guard,identity.module}.ts`, `src/config.ts`, `scripts/create-owner.ts`; `test/foundation.spec.ts`.

**Interfaces:** Login `POST /auth/sessions` accepts `{email,password,client:"web"|"native"}`; `GET /auth/me`, `POST /auth/logout`, `POST /auth/refresh` (native). Session actor contains user ID, role and granted location IDs; `AccessGuard` evaluates explicit permissions and cookie CSRF. Crypto functions hash/verify passwords with salted scrypt and hash random tokens before storage.

- [x] Write tests for valid/invalid login, normalized identities, cookie flags, missing/wrong CSRF, origin rejection, resource permission denial, disabled users, expiry/revocation, native rotation and refresh reuse, durable login throttling across two API instances.
- [x] Run these tests; expected authentication routes 404 before implementation.
- [x] Implement identity and bootstrap-owner CLI; use constant-shape credential failures, durable atomic throttle counters, random session/CSRF secrets and hashed tokens. Lock native session rows during rotation; retain used refresh digests and revoke the family on reuse. Never return web bearer credentials.
- [x] Build and run the full API suite against PostgreSQL. Expected all identity assertions pass and no stored plaintext passwords/session tokens.
- [x] Commit task and update checkpoint.

### Task 3: Persistent catalogue, stock availability and atomic receiving

**Files:** `apps/api/src/catalog/*`, `src/inventory/*`, `src/database/transaction.ts`, `scripts/seed-preview.ts`; `packages/contracts/src/foundation.ts`; `test/foundation.spec.ts`; `docs/BACKEND_FOUNDATION.md`; `.github/workflows/api.yml`, root README and verification docs.

**Interfaces:** Existing public REST mapping: `/catalog/categories`, `/catalog/products`, `/catalog/products/:slug`, `/catalog/home`, `POST /catalog/products:by-variants`. Protected `/inventory/overview`, `/inventory/receive`. Shared receive request/response remain compatible; receiving requires `Idempotency-Key`. Public availability uses the explicitly configured stock location; inventory managers see granted locations and owner admins can access any active location.

- [x] Write real HTTP/database tests for publication filters, bounded paging/search/sort, contract conformance, exact decimal availability with expired holds/lots, inactive locations/variants/categories, permission scope, concurrent same-key receiving replay, changed-input conflicts, rollback and append-only history.
- [x] Run the new tests. Expected catalogue/inventory routes 404 before implementation.
- [x] Add SQL availability view using UTC expiry and active holds; indexed, bounded catalogue reads. Receive in one transaction: lock scoped idempotency key and sorted stock positions, validate every variant/location, create lots/movements/receipt, persist outcome/audit/outbox. Origin/CSRF and permission checks precede mutation; ignore client actor identity.
- [x] Build/run all API tests on empty migrated PostgreSQL and verify persistence after application restart. Run web lint/types/build and all existing suites. Add PostgreSQL service CI, explicit preview seeding (prohibited in production) and operational instructions.
- [x] Request an independent whole-branch review, fix material findings with reproducing tests, prepare a draft PR and verified checkpoint for publication. Expected no remaining blocking finding; do not switch public shop or deploy this partial backend.

## Acceptance and deferred milestones

This plan ends at a running, tested backend foundation. Orders/POS/reservation commands, real payment/refund/delivery flows, password recovery/MFA/registration UX, worker publishing, native screens and AI inference are explicitly subsequent milestones. The full existing 92-operation OpenAPI remains a target; publish a separate foundation OpenAPI documenting only implemented endpoints. Database preview fixtures are test/sample data, never inferred real inventory.

Implementation and review corrections passed the checks in `docs/BACKEND_FOUNDATION_CHECKPOINT.md`. Publication and hosted CI results are recorded on the foundation PR.
