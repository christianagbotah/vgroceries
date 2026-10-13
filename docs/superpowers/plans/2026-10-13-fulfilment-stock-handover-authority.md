# Fulfilment + Stock Handover Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production administrator fulfilment workflow and exactly-once reservation-backed stock depletion boundary for delivery dispatch handover and customer collection.

**Architecture:** Add a dedicated `FulfilmentModule` that owns operational fulfilment state and orchestrates Orders, Payments and Inventory without taking over their authorities. Add an Inventory-owned `StockDepletionService.consumeClaim(...)` primitive that atomically locks reservations/lots, validates exact coverage, decrements physical lots once, marks reservations consumed and persists immutable lot provenance. Fulfilment uses the existing durable idempotency/audit/outbox patterns and returns backend-derived `allowedActions` compatible with the merged z.ai fulfilment workspace.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL 17, Zod shared contracts, Jest/Bun API integration tests, Swagger/OpenAPI.

**Spec:** `docs/superpowers/specs/2026-10-12-fulfilment-stock-handover-authority-design.md`

## Global Constraints

- Preserve the merged z.ai frontend wave at `main` merge `7723f457b87fa4722da317013d31f225506d166b`.
- Migration is forward-only `202610120006_fulfilment_stock_handover` after migrations 001–005.
- Picking and packing must never decrement physical stock.
- The single physical depletion point is handover/collection and must be exactly once.
- Inventory is the only writer of `StockLot.quantity`, reservation consumption and depletion provenance.
- Fulfilment must never create Refunds or mutate PaymentAttempt truth.
- Money remains integer GHS minor units; quantities remain Prisma Decimal / normalized decimal strings.
- Every fulfilment mutation requires `Idempotency-Key`, audit and outbox in the authoritative transaction.
- Current production mutation role remains `admin`; do not broaden role authority in this milestone.
- No live courier, COD collection/remittance, physical Returns, POS cash authority, Hubtel activation or storefront backend cutover.
- Generated production OpenAPI must be exactly 35 paths: current 28 plus seven fulfilment paths.

## Review Focus

- Expired/released/multi-generation reservations must fail before any lot mutation; covered in Task 3 depletion tests.
- Multiple reservations sharing one lot must aggregate before decrement and never produce a transient negative lot; covered in Task 3.
- Partially-refunded-but-still-covered electronic orders must remain handover-eligible while refund-pending/review states block; covered in Task 4.
- Packing/cancellation and handover/cancellation races must produce one coherent winner under deterministic locking; covered in Task 7.
- z.ai `allowedActions` must come from backend policy, never from client visual state; covered in Task 6 contract/projection tests.

---

### Task 1: Production contracts and migration 006

**Files:**
- Create: `packages/contracts/src/fulfilment.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610120006_fulfilment_stock_handover/migration.sql`
- Test: `apps/api/test/fulfilment-schema.spec.ts`

**Interfaces:**
- Produces shared schemas `fulfilmentConfirmRequestSchema`, `fulfilmentStartPickingRequestSchema`, `fulfilmentPickRequestSchema`, `fulfilmentPackRequestSchema`, `fulfilmentHandoverRequestSchema`, `fulfilmentQueueResponseSchema`, `fulfilmentDetailResponseSchema`.
- Produces Prisma models `FulfilmentRun`, `FulfilmentPick`, `StockDepletion`, `StockDepletionLine` and relations from Order/Reservation/StockLot.

- [ ] Write failing schema/migration tests for uniqueness, checks, immutable depletion provenance and valid handover kinds.
- [ ] Run `bun test apps/api/test/fulfilment-schema.spec.ts` and confirm failure.
- [ ] Add contracts, Prisma models and migration; pick request trusts only picked quantity + bounded note, never lot/order identity.
- [ ] Run schema tests and verify pass.
- [ ] Commit `feat(api): add fulfilment and depletion persistence`.

### Task 2: Inventory claim coverage authority

**Files:**
- Create: `apps/api/src/inventory/claim-coverage.service.ts`
- Create: `apps/api/src/inventory/depletion.types.ts`
- Modify: `apps/api/src/inventory/inventory.controller.ts`
- Test: `apps/api/test/claim-coverage.spec.ts`

**Interfaces:**
- Produces `ClaimCoverageService.lockExact(tx, input)` returning deterministic active reservation generation, reservation rows, lot identities and normalized totals.

- [ ] Write failing tests for exact coverage, partial/missing/extra coverage, multiple active generations, expired reservations and variant mismatch.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement `lockExact(...)` with deterministic reservation locking, stale-expiry handling and Decimal totals by `claimLineId` + `variantId`.
- [ ] Export from InventoryModule and verify tests pass.
- [ ] Commit `feat(inventory): add exact claim coverage authority`.

### Task 3: Exactly-once Inventory depletion primitive

**Files:**
- Create: `apps/api/src/inventory/stock-depletion.service.ts`
- Modify: `apps/api/src/inventory/inventory.controller.ts`
- Test: `apps/api/test/stock-depletion.spec.ts`

**Interfaces:**
- Produces `StockDepletionService.consumeClaim(tx, input: ConsumeClaimInput): Promise<ConsumeClaimResult>`.

- [ ] Write failing tests for exact-once consumption, same-transaction replay, multiple reservations sharing one lot, quarantined/expired/non-regular lot rejection, physical shortage atomicity, missing coverage, reservation `consumed`, before/after math and audit/outbox rollback.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement `consumeClaim(...)`: use ClaimCoverageService; lock lots by id; aggregate required quantity per lot before writes; create/replay unique depletion; decrement; consume reservations; persist lines; emit `inventory.depleted` audit/outbox.
- [ ] Run tests and verify pass.
- [ ] Commit `feat(inventory): consume reserved stock exactly once`.

### Task 4: Payments handover coverage policy

**Files:**
- Modify: `apps/api/src/payments/payment-capture.service.ts`
- Test: `apps/api/test/payment-handover-coverage.spec.ts`

**Interfaces:**
- Produces `PaymentCaptureService.getHandoverCoverage(tx, orderId)` returning `{ successfulCapturedMinor, successfulRefundedMinor, retainedMinor, liveOrUncertain }`.

- [ ] Write failing tests for no captures, successful capture, live attempts, successful refunds, pending/failed refunds, legitimate partial refund with sufficient retained coverage and duplicate captures.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement using `lockForOrder`; lock/read Refund rows in stable order; count only succeeded refunds as returned money; expose unsafe live/uncertain states.
- [ ] Run tests and verify pass.
- [ ] Commit `feat(payments): expose verified handover coverage`.

### Task 5: Fulfilment command authority — confirm, picking and pack

**Files:**
- Create: `apps/api/src/fulfilment/fulfilment.values.ts`
- Create: `apps/api/src/fulfilment/fulfilment-policy.service.ts`
- Create: `apps/api/src/fulfilment/fulfilment-command.service.ts`
- Create: `apps/api/src/fulfilment/fulfilment.module.ts`
- Test: `apps/api/test/fulfilment-command.spec.ts`
- Test: `apps/api/test/fulfilment-packing.spec.ts`

**Interfaces:**
- Produces `confirm(...)`, `startPicking(...)`, `recordPick(...)`, `pack(...)`.
- `FulfilmentPolicyService.allowedActions(state)` is the single backend action-policy source used by commands and reads.

- [ ] Write failing transition/idempotency tests for valid and invalid transitions, same-key replay, changed-body conflict, lazy run creation, reservation-backed pick provenance, over-pick rejection, shortage without stock mutation, shortage blocking pack and delivery/collection pack outcomes.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement Order-first locking and actor-scoped advisory idempotency using the Refunds pattern; derive pick identity from reservation/order rows; write OrderEvent/AuditEvent/OutboxEvent/Idempotency atomically.
- [ ] Run tests and verify pass.
- [ ] Commit `feat(fulfilment): add picking and packing authority`.

### Task 6: Handover authority and frontend-compatible projections

**Files:**
- Create: `apps/api/src/fulfilment/fulfilment-handover.service.ts`
- Create: `apps/api/src/fulfilment/fulfilment-query.service.ts`
- Test: `apps/api/test/fulfilment-handover.spec.ts`
- Test: `apps/api/test/fulfilment-query.spec.ts`

**Interfaces:**
- Produces `handover(...)`, bounded `list(...)` and `detail(orderId)` with backend-derived `allowedActions`, blocking reasons, picker/progress/shortage, lot expiry and packed/handover metadata compatible with z.ai's merged fulfilment workspace.

- [ ] Write failing tests for paid electronic delivery, valid unpaid COD delivery, unpaid electronic block, unverified collection block, retained coverage after partial refund, delivery -> dispatched, collection -> collected, same handover instant, replay/no second depletion, filter bounds and secret-free projections.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement handover: lock Order then FulfilmentRun, validate picks, apply payment/COD policy, call `StockDepletionService.consumeClaim(...)` in the same transaction, set `stockConsumedAt` and handover metadata, persist events and idempotency.
- [ ] Implement query projections and server-calculated actions/blockers.
- [ ] Run tests and commit `feat(fulfilment): add stock handover and operational projections`.

### Task 7: Controllers, authorization and race safety

**Files:**
- Create: `apps/api/src/fulfilment/fulfilment.controller.ts`
- Modify: `apps/api/src/fulfilment/fulfilment.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Test: `apps/api/test/fulfilment-http.spec.ts`
- Test: `apps/api/test/fulfilment-concurrency.spec.ts`
- Test: `apps/api/test/order-cancel.spec.ts`

**Interfaces:**
- Exposes exactly seven paths under `/api/v1/admin/fulfilment` from the approved spec.

- [ ] Write failing HTTP/auth tests for admin-only access, strict validation, required idempotency keys and exact route methods.
- [ ] Write failing two-instance race tests for handover vs handover, pack vs cancellation and handover vs cancellation.
- [ ] Implement controller/module/bootstrap wiring; use AccessGuard plus explicit admin role rather than broadening Permission roles.
- [ ] Run HTTP/concurrency/cancellation tests.
- [ ] Commit `feat(api): expose administrator fulfilment authority`.

### Task 8: OpenAPI cutover and authority-boundary gates

**Files:**
- Modify: `apps/api/src/http/openapi.ts`
- Modify: `apps/api/openapi.json`
- Test: `apps/api/test/fulfilment-authority.spec.ts`
- Modify: `scripts/contract-tests.mjs` only if required by existing contract gates.

**Interfaces:**
- OpenAPI path count becomes exactly 35.

- [ ] Write failing tests for all seven paths/methods, absent dispatch/rider/COD-remittance/Returns/POS authority routes, admin security, request/response schemas and source scans preventing Fulfilment from directly mutating StockLot/Reservation/Refund/PaymentAttempt.
- [ ] Run targeted tests and confirm failure.
- [ ] Update OpenAPI generator, including PUT handling for pick correction, and regenerate.
- [ ] Generate twice; require exactly 35 paths and byte-identical output.
- [ ] Commit `feat(api): publish fulfilment authority contract`.

### Task 9: Full verification, handoff and PR

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`

- [ ] Run PostgreSQL-17 migrations 001–006 and full API suite.
- [ ] Run root lint, typecheck, build, contracts, acceptance, route sweep and z.ai frontend regression suite; record only observed counts.
- [ ] Verify exact-head GitHub Actions `CI` and `API foundation` both succeed.
- [ ] Update handoff docs with exact SHA/counts/evidence.
- [ ] Open PR into `main`, explicitly leaving Dispatch/COD/remittance, Returns, POS and live-provider work closed.
