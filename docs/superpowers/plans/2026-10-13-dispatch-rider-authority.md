# Dispatch + Rider Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production Dispatch + Rider Authority after fulfilment handover, with durable assignment/custody/lifecycle/proof state, rider ownership, manual-provider fallback, no second stock depletion, and no COD settlement side effects.

**Architecture:** Add migration 007 and a focused NestJS `dispatch` module with command/query/policy services plus separate admin and rider controllers. Dispatch consumes only authoritative Order/Fulfilment handover evidence; it never imports Inventory depletion logic. Shared Zod contracts and production OpenAPI expose server-derived `allowedActions`/`blockers`, while every mutation uses the established idempotency/audit/outbox transaction pattern.

**Tech Stack:** Node 24, TypeScript 5.9, NestJS 11, Prisma 7, PostgreSQL 17, Zod 4, Node test runner, shared `@variety/contracts` package.

**Spec:** `docs/superpowers/specs/2026-10-13-dispatch-rider-authority-design.md`

## Global Constraints

- Fulfilment handover remains the only delivery stock-depletion boundary; Dispatch must never update `Order.stockConsumedAt`, `StockLot`, `Reservation`, or `StockDepletion`.
- Delivery completion must not set COD payment success or create cash/remittance records.
- Rider identity comes from the authenticated backend session, never from a trusted request-body `riderId`.
- Returned goods remain outside sellable inventory until future Physical Returns Authority.
- No live provider APIs, webhooks, GPS, ETA, route optimization, provider secrets, or proof-media blob storage in this milestone.
- Current production backend roles remain `admin | inventory_manager | customer | rider`; administrative dispatch mutations are admin-only in this milestone.
- Stable IDs, UTC timestamps, GHS minor units, platform error envelope, and `Idempotency-Key` rules remain unchanged.
- Migration name is `202610130007_dispatch_rider_authority` and must apply cleanly after migrations 001-006.
- Active rider-ownership DB uniqueness covers rider-owned jobs when status is `assigned`, `accepted`, `picked_up`, `out_for_delivery`, `failed`, or `rescheduled`, plus `return_to_store` while `returned_to_store_at IS NULL`.
- Production OpenAPI grows from exactly 35 paths to exactly 57 paths: 9 admin-dispatch, 3 admin-rider, and 10 rider-self-service paths.

## Review Focus

- **Stale inventory semantics:** rider pickup, fail, reschedule and return-to-store must leave stock/depletion/reservations byte-for-byte unchanged; pinned in Tasks 4, 5 and 8.
- **Identity confusion:** foreign job IDs and browser-supplied rider identifiers must never cross rider ownership; pinned in Tasks 6 and 7.
- **Custody-safe reassignment:** a rider/provider cannot be swapped after physical pickup until goods are safely returned; pinned in Tasks 4 and 5.
- **COD coupling:** delivery may finish while payment remains `unpaid`/otherwise unsettled; pinned in Task 7.
- **Race safety:** one order cannot receive two jobs and one rider cannot own two conflicting active jobs; pinned in Tasks 2, 4 and 8.

---

### Task 1: Shared Dispatch/Rider Production Contracts

**Files:**
- Modify: `packages/contracts/src/dispatch.ts`
- Modify: `packages/contracts/src/rider.ts`
- Modify: `packages/contracts/src/index.ts` only if new exports are split into helper files
- Test: `apps/api/test/dispatch-contracts.spec.ts`

**Interfaces:**
- Consumes: existing `DeliveryStatus`, common replay/error/pagination conventions.
- Produces: Zod request/query schemas and exported TypeScript types used by controllers/OpenAPI in later tasks.

- [ ] **Step 1: Write failing contract tests** asserting exact accepted status/action/proof/failure vocabularies, normalized note lengths, assignment one-of semantics (`riderProfileId` xor `manualProvider`), and no authoritative `cashCollected`, `remit`, or browser-trusted `riderId` mutation field.
- [ ] **Step 2: Run** `cd apps/api && npm test -- --test-name-pattern="dispatch contracts"` and verify failure because production schemas are absent/stale.
- [ ] **Step 3: Implement schemas/types** in `packages/contracts/src/dispatch.ts` and `packages/contracts/src/rider.ts`: `dispatchListQuerySchema`, `dispatchAssignRequestSchema`, `dispatchUnassignRequestSchema`, `dispatchReassignRequestSchema`, `dispatchRescheduleRequestSchema`, `dispatchReturnRequestSchema`, `dispatchReturnedRequestSchema`, `dispatchProviderTransitionRequestSchema`, `riderAvailabilityRequestSchema`, `riderAcceptRequestSchema`, `riderPickupRequestSchema`, `riderOutRequestSchema`, `riderDeliverRequestSchema`, `riderFailRequestSchema`, `riderNoteRequestSchema`, plus queue/detail/fleet/rider response schemas with `allowedActions`, `blockers`, and `allowedProofMethods`.
- [ ] **Step 4: Run** `cd apps/api && npm test -- --test-name-pattern="dispatch contracts"` and verify PASS.
- [ ] **Step 5: Commit** `feat(dispatch): define production dispatch rider contracts`.

### Task 2: Migration 007 and Prisma Persistence

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610130007_dispatch_rider_authority/migration.sql`
- Test: `apps/api/test/dispatch-schema.spec.ts`
- Test: `apps/api/test/migration-chain.spec.ts` if migration-sequence assertions live there; otherwise extend the existing schema/migration authority test.

**Interfaces:**
- Consumes: `User`, `Order`, existing audit/outbox/idempotency tables.
- Produces: Prisma models `RiderProfile`, `DeliveryJob`, `DeliveryEvent`, `DeliveryProof` and DB constraints used by all later tasks.

- [ ] **Step 1: Write failing schema tests** for one rider profile per `User`, one job per `Order`, proof uniqueness, status/custody checks, assignment-kind checks, append-only event/proof policy where supported, and the partial unique active-rider index.
- [ ] **Step 2: Run** `cd apps/api && npm test -- --test-name-pattern="dispatch schema|migration"` and verify RED.
- [ ] **Step 3: Add Prisma relations/models** exactly matching the spec. Use `RiderProfile.availabilityState` only for declared `available|offline`; do not persist a mutable `busy` flag.
- [ ] **Step 4: Write migration 007** including the active-rider partial unique index predicate: rider-owned rows are conflicting for statuses `assigned, accepted, picked_up, out_for_delivery, failed, rescheduled`, or `return_to_store` while `returned_to_store_at IS NULL`.
- [ ] **Step 5: Apply the full migration chain** against the test PostgreSQL database with `npm run migrate:deploy`; verify 001-007 apply cleanly.
- [ ] **Step 6: Run** schema/migration tests and verify PASS.
- [ ] **Step 7: Commit** `feat(dispatch): add durable delivery rider schema`.

### Task 3: Dispatch Values, Policy, Idempotency and Event Primitives

**Files:**
- Create: `apps/api/src/dispatch/dispatch.values.ts`
- Create: `apps/api/src/dispatch/dispatch-policy.service.ts`
- Create: `apps/api/src/dispatch/dispatch-event.service.ts`
- Test: `apps/api/test/dispatch-values.spec.ts`
- Test: `apps/api/test/dispatch-policy.spec.ts`

**Interfaces:**
- Consumes: Prisma transaction client, existing `Idempotency`, `AuditEvent`, `OutboxEvent`, Order/Fulfilment state.
- Produces: `DispatchCommandContext`, `DispatchAllowedAction`, `DispatchBlocker`, `effectiveRiderState(...)`, `assertDispatchEligible(...)`, `recordDeliveryTransition(...)`, normalized failure/proof/note helpers.

- [ ] **Step 1: Write failing policy/value tests** for handed-over eligibility (`fulfilment=delivery`, `fulfilmentStatus=dispatched`, `stockConsumedAt!=null`, fulfilment handover provenance), rider effective state, failure reason vocabulary, bounded notes, and proof-method availability.
- [ ] **Step 2: Run** targeted tests and verify RED.
- [ ] **Step 3: Implement pure value helpers and `DispatchPolicyService`** with no Inventory imports; `pin` must be excluded from `allowedProofMethods` unless a real order-bound verifier exists (none in this milestone).
- [ ] **Step 4: Implement `DispatchEventService.recordTransition(tx, ...)`** to atomically write `DeliveryEvent`, relevant customer-safe `OrderEvent`, `AuditEvent`, and `OutboxEvent`; never include raw proof secret values.
- [ ] **Step 5: Run** targeted tests and verify PASS.
- [ ] **Step 6: Commit** `feat(dispatch): add delivery policy and event primitives`.

### Task 4: Admin Assignment, Availability, Unassign and Reassign Commands

**Files:**
- Create: `apps/api/src/dispatch/dispatch-command.service.ts`
- Test: `apps/api/test/dispatch-assignment.spec.ts`
- Test: `apps/api/test/dispatch-concurrency.spec.ts`

**Interfaces:**
- Consumes: Task 2 models; Task 3 policy/event helpers; existing idempotency transaction convention.
- Produces: `assign(orderId, input, context)`, `unassign(jobId, input, context)`, `reassign(jobId, input, context)`, `setRiderAvailability(riderProfileId, input, context)`.

- [ ] **Step 1: Write failing tests** covering lazy one-job creation, non-handed-over rejection, missing `stockConsumedAt`, offline rider rejection, derived busy rejection, idempotent replay, changed-body idempotency conflict, unassign-before-pickup, and reassignment blocked after custody leaves dispatch.
- [ ] **Step 2: Add concurrency RED tests** proving two admins cannot assign one order twice and cannot assign one rider to two conflicting jobs.
- [ ] **Step 3: Snapshot stock authority in tests** (`StockLot.quantity`, `Reservation.state`, `StockDepletion` count, `Order.stockConsumedAt`) before assignment/unassign/reassign and assert no change afterward.
- [ ] **Step 4: Implement deterministic row-lock order**: Order -> existing DeliveryJob -> RiderProfile -> conflicting rider jobs. Let the DB partial unique index remain the final race safety net.
- [ ] **Step 5: Implement admin commands** with same-transaction idempotency, order `deliveryStatus` projection updates, event/audit/outbox writes, and no fulfilment/inventory writes.
- [ ] **Step 6: Run** assignment/concurrency tests and verify PASS.
- [ ] **Step 7: Commit** `feat(dispatch): add assignment and rider availability authority`.

### Task 5: Delivery Exceptions, Manual Provider and Return-to-Store Commands

**Files:**
- Modify: `apps/api/src/dispatch/dispatch-command.service.ts`
- Create: `apps/api/src/dispatch/manual-provider.service.ts`
- Test: `apps/api/test/dispatch-exceptions.spec.ts`
- Test: `apps/api/test/manual-provider.spec.ts`

**Interfaces:**
- Consumes: Task 4 command foundation.
- Produces: `reschedule(jobId, ...)`, `returnToStore(jobId, ...)`, `receiveReturnedGoods(jobId, ...)`, `manualProviderTransition(jobId, ...)`; `ManualProviderService` makes zero network calls.

- [ ] **Step 1: Write failing exception tests** for failed -> rescheduled, return instruction (`custodyState=return_pending`), physical return acknowledgement (`custodyState=store_returned`, `returnedToStoreAt`), and unsafe reassign rejection while prior custody remains rider/provider.
- [ ] **Step 2: Write failing manual-provider tests** proving assignment/milestones are staff-attributed, require explicit manual source/reference where applicable, and perform no network request/provider webhook behavior.
- [ ] **Step 3: Add stock non-mutation assertions** for fail/reschedule/return instruction/returned acknowledgement.
- [ ] **Step 4: Implement exception/manual-provider methods**; physical return releases active rider ownership but preserves historical rider relation and never restores sellable stock.
- [ ] **Step 5: Run** targeted tests and verify PASS.
- [ ] **Step 6: Commit** `feat(dispatch): add delivery exception and manual provider flows`.

### Task 6: Dispatch and Rider Query Projections

**Files:**
- Create: `apps/api/src/dispatch/dispatch-query.service.ts`
- Test: `apps/api/test/dispatch-query.spec.ts`
- Test: `apps/api/test/rider-query-privacy.spec.ts`

**Interfaces:**
- Consumes: Task 2 persistence and Task 3 policy.
- Produces: `listDispatch(...)`, `dispatchDetail(jobId)`, `listRiders()`, `riderDetail(id)`, `riderMe(userId)`, `riderJobs(userId)`, `riderJob(userId, jobId)`, `riderHistory(userId)`.

- [ ] **Step 1: Write failing query tests** proving handed-over orders without jobs appear as `unassigned`, packed-but-not-handed-over orders do not, `allowedActions/blockers` are server-derived, and declared/effective rider availability are distinct.
- [ ] **Step 2: Write failing rider privacy tests** proving a rider sees only own active/history jobs and cannot retrieve another rider's job/customer address by guessed ID.
- [ ] **Step 3: Implement bounded projections** with minimum required customer/contact/address data, read-only COD due context, no cash/remittance claims, no fake GPS/ETA, and no raw internal/proof secrets.
- [ ] **Step 4: Run** query/privacy tests and verify PASS.
- [ ] **Step 5: Commit** `feat(dispatch): add dispatch and rider projections`.

### Task 7: Rider Lifecycle Commands and Proof Authority

**Files:**
- Create: `apps/api/src/dispatch/rider-command.service.ts`
- Modify: `apps/api/src/dispatch/dispatch-command.service.ts` only for shared internal transition primitive if necessary
- Test: `apps/api/test/rider-lifecycle.spec.ts`
- Test: `apps/api/test/rider-ownership.spec.ts`

**Interfaces:**
- Consumes: authenticated rider `userId`; Task 3 transition/event helpers; Task 2 models.
- Produces: `setOwnAvailability(userId, ...)`, `accept(userId, jobId, ...)`, `pickup(...)`, `outForDelivery(...)`, `deliver(...)`, `fail(...)`, `note(...)`.

- [ ] **Step 1: Write failing ownership tests** proving rider commands derive ownership from authenticated `userId`, reject foreign jobs, and cannot be bypassed by arbitrary body IDs.
- [ ] **Step 2: Write failing lifecycle tests** for `assigned->accepted->picked_up->out_for_delivery->delivered`, valid failure branches, required bounded failure reason, note idempotency, and retry-safe transitions.
- [ ] **Step 3: Write failing proof/COD tests** proving delivery requires an allowed proof method/reference, writes exactly one `DeliveryProof`, sets `Order.deliveryStatus=delivered` and `Order.fulfilmentStatus=delivered`, but leaves COD `Order.paymentStatus` unchanged.
- [ ] **Step 4: Assert pickup inventory invariants**: no new depletion, no lot/reservation mutation, unchanged `stockConsumedAt`.
- [ ] **Step 5: Implement rider command service** with row locking, same-transaction idempotency/events/audit/outbox, ownership from session user, and no Inventory/Payments mutation dependency.
- [ ] **Step 6: Run** rider lifecycle/ownership tests and verify PASS.
- [ ] **Step 7: Commit** `feat(dispatch): add rider lifecycle and proof authority`.

### Task 8: Concurrency, Rollback and Authority-Boundary Hardening

**Files:**
- Modify: `apps/api/test/dispatch-concurrency.spec.ts`
- Create: `apps/api/test/dispatch-authority-boundary.spec.ts`
- Create: `apps/api/test/dispatch-fault-rollback.spec.ts`

**Interfaces:**
- Consumes: Tasks 4-7 complete command/query behavior.
- Produces: regression proof that Dispatch cannot become a second inventory/payment authority.

- [ ] **Step 1: Add RED race tests** for concurrent deliver-vs-fail, concurrent return-vs-reassign, duplicate deliver retries, and rider action after pre-pickup unassignment.
- [ ] **Step 2: Add RED authority-boundary tests** that snapshot inventory/payment tables and prove assignment, accept, pickup, out, fail, reschedule, return and delivery do not create/change forbidden stock/COD rows.
- [ ] **Step 3: Add RED fault-injection tests** proving failed audit/outbox writes roll back business state/proof/event mutations.
- [ ] **Step 4: Apply minimal locking/transaction fixes** in command/event services until all tests pass without widening scope.
- [ ] **Step 5: Run** all Dispatch/Rider tests and verify PASS.
- [ ] **Step 6: Commit** `test(dispatch): harden concurrency and authority boundaries`.

### Task 9: Admin and Rider HTTP Controllers + Module Wiring

**Files:**
- Create: `apps/api/src/dispatch/admin-dispatch.controller.ts`
- Create: `apps/api/src/dispatch/admin-riders.controller.ts`
- Create: `apps/api/src/dispatch/rider.controller.ts`
- Create: `apps/api/src/dispatch/dispatch.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Test: `apps/api/test/dispatch-http.spec.ts`
- Test: `apps/api/test/rider-http.spec.ts`

**Interfaces:**
- Consumes: Task 1 schemas, Tasks 4-7 services, `AccessGuard`, `AuthRequest`.
- Produces: exact 22 production paths in the approved spec.

- [ ] **Step 1: Write failing admin HTTP tests** for authentication, admin-only mutations, validation envelope, mandatory `Idempotency-Key`, all 9 admin dispatch and 3 admin rider paths.
- [ ] **Step 2: Write failing rider HTTP tests** for rider-only access, session-derived identity, all 10 rider self-service paths, and foreign-job 403/404-safe behavior.
- [ ] **Step 3: Implement controllers** using existing parse/context conventions; no mutation body may supply trusted actor/rider identity.
- [ ] **Step 4: Implement `DispatchModule`** and import it in `bootstrap.ts` after Fulfilment and before Payments unless deterministic OpenAPI ordering tests require another explicit stable position.
- [ ] **Step 5: Run** HTTP tests and verify PASS.
- [ ] **Step 6: Commit** `feat(dispatch): expose admin and rider production APIs`.

### Task 10: Production OpenAPI 57-Path Contract

**Files:**
- Modify: `apps/api/src/http/production-openapi.ts`
- Modify: `docs/openapi-foundation.json`
- Test: `apps/api/test/production-openapi.spec.ts` or the repository's existing production OpenAPI authority test

**Interfaces:**
- Consumes: Task 1 schemas and Task 9 routes.
- Produces: deterministic production OpenAPI with exactly 57 paths.

- [ ] **Step 1: Update the OpenAPI authority test first** to assert exactly 57 paths; all 22 new paths/methods; security; idempotency/CSRF headers on mutations; response schemas; and continued absence of COD remittance, physical returns, POS and live-provider webhook routes.
- [ ] **Step 2: Run** the OpenAPI test and verify RED against the current 35-path document.
- [ ] **Step 3: Extend `production-openapi.ts`** with dispatch/rider components and paths, and update description so Dispatch + Rider Authority is production while COD/Returns/POS/provider integrations remain closed.
- [ ] **Step 4: Generate OpenAPI twice** with `cd apps/api && npm run openapi`; verify byte-identical output and commit `docs/openapi-foundation.json`.
- [ ] **Step 5: Run** the OpenAPI test and verify PASS with exactly 57 paths.
- [ ] **Step 6: Commit** `docs(api): publish dispatch rider production contract`.

### Task 11: Full Regression, Documentation and PR Readiness

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`
- Modify only if required by contract cleanup: `packages/contracts/src/domain.ts`

**Interfaces:**
- Consumes: completed milestone.
- Produces: review-ready branch with fresh verification evidence and explicit next milestone boundary.

- [ ] **Step 1: Run API build/tests**: `cd apps/api && npm test`; require all tests green on PostgreSQL 17 after migrations 001-007.
- [ ] **Step 2: Run root verification commands** exactly as repository CI defines them (lint, TypeScript, production build, Bun/shared-contract/acceptance/route-sweep suites) and record exact counts in `docs/VERIFICATION.md`; do not reuse old counts.
- [ ] **Step 3: Generate OpenAPI twice again** and verify zero drift; assert exact 57-path count.
- [ ] **Step 4: Review production authority boundaries** with repository search: Dispatch source must not import/call `StockDepletionService`, `consumeClaim`, payment capture/settlement, cash collection/remittance, GPS/ETA/provider-network code.
- [ ] **Step 5: Update docs**: mark Dispatch + Rider Authority production; keep COD cash collection/remittance, Physical Returns, POS, live providers/GPS/notifications and storefront cutover explicitly closed. Next backend milestone is COD cash collection + rider remittance.
- [ ] **Step 6: Commit** `docs(dispatch): record authority handoff and verification`.
- [ ] **Step 7: Perform mandatory whole-branch review** focused on the design review checklist and fix any finding with RED->GREEN evidence before declaring ready.
- [ ] **Step 8: Open a draft PR** from `feat/dispatch-rider-authority-20261013` to `main`; attach exact verification evidence and keep it unmerged until review/CI are green.

## Self-Review Result

- **Spec coverage:** Sections 1-32 map to Tasks 1-11; no implementation scope from the approved spec is orphaned.
- **Type consistency:** shared contract names feed controllers/OpenAPI; persistence names match the written spec; rider identity is consistently session `userId` -> `RiderProfile`.
- **Race definition pinned:** DB/service active-ownership set is explicitly fixed in Global Constraints and Task 2, including pending return-to-store.
- **OpenAPI count pinned:** current 35 + 22 additive unique paths = exactly 57; no route in the planned list overlaps the existing 35.
- **YAGNI check:** COD ledgers, Returns disposition/restock, live providers, location/ETA, media storage, role expansion and POS remain outside this plan.
