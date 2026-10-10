# Commerce Reservation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the durable, concurrency-safe stock reservation/allocation authority that online checkout and POS will share, without activating the partial production API for the public shop.

**Architecture:** Extend the existing NestJS/PostgreSQL foundation with one inventory-owned `AllocationService`. Every reservation is lot-specific, FEFO-ordered, location-scoped, exact-decimal and created inside a caller-supplied PostgreSQL transaction after locking affected stock positions in a stable order. The service remains an internal domain boundary in this slice; checkout, POS, handover and web cutover are separate follow-up plans that call the same API.

**Tech Stack:** Node 24, TypeScript 5.9, NestJS 11, PostgreSQL 17, Prisma 7, `Prisma.Decimal`, Node test runner, shared `@variety/contracts` package.

**Spec:** `docs/superpowers/specs/2026-10-09-production-backend-design.md`

## Global Constraints

- Keep the existing Next.js interface and Ghana/GHS conventions; money remains integer pesewas and stock quantities exact decimal strings with at most three fractional digits.
- One business and one configured stock location today, but all allocation records retain explicit `locationId` through `StockPosition` so multi-location expansion does not change the contract.
- Inventory alone decides stock mutations/reservations; callers must not write allocation rows directly.
- Available-to-sell = eligible physical stock - unexpired active allocations - safety stock.
- Exclude damaged, expired, quarantined and otherwise unsaleable lots; lots expiring today are ineligible.
- Browsing/cart editing does not create holds.
- Lock affected variant/location stock positions in a consistent order, recheck every line inside the transaction, and roll back the whole command on any conflict.
- Picking/packing does not deplete stock. Consumption/handover is a later slice.
- Public shop remains in demo mode until commerce, money and delivery acceptance criteria are complete; do not set `API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL` to this partial API.
- Existing foundation identity, audit, outbox and idempotency conventions remain authoritative and must not be bypassed.

## Review Focus

- Two independent transactions competing for the final sellable unit: exactly one allocation succeeds; the other receives `OUT_OF_STOCK`; no over-reservation is committed.
- Multi-line request where a later line is unavailable: zero allocations from earlier lines remain after rollback.
- Expired/today/quarantined/damaged lots are never allocated, even when they make physical quantity look sufficient.
- Safety stock cannot be consumed by an allocation; a request that would cross the safety threshold is refused atomically.
- Count-based variants reject fractional quantities before mutation, while `kg`/`litre` variants accept valid quantities up to three decimals.

---

### Task 1: Make reservations lot-specific and enforce allocation invariants in PostgreSQL

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610100002_commerce_reservation_core/migration.sql`
- Modify: `apps/api/test/foundation.spec.ts`

**Interfaces:**
- Consumes: existing `StockPosition`, `StockLot`, `Variant`, `Reservation`, and `variant_availability` foundation view.
- Produces: durable `Reservation` rows with `claimType`, `claimId`, `claimLineId`, `lotId`, `quantity`, `state`, `expiresAt`, `createdAt`; relation to `StockLot`; indexes/constraints used by `AllocationService`.

- [ ] **Step 1: Write the migration regression test**

Add a test that creates a fully-linked active reservation and asserts `inventory/overview` subtracts it, then marks it expired/released and asserts availability returns. Add direct database assertions that `quantity <= 0`, unsupported `state`, and duplicate `(claimType, claimId, claimLineId, lotId)` are rejected.

- [ ] **Step 2: Run the foundation suite and confirm the new assertions fail before the migration/schema change**

Run: `npm test --prefix apps/api`

Expected: FAIL because the new reservation fields/constraints do not exist.

- [ ] **Step 3: Update the Prisma model and SQL migration**

Use the exact model contract:

```ts
Reservation {
  id: string
  positionId: string
  lotId: string
  claimType: string
  claimId: string
  claimLineId: string
  quantity: Decimal(15,3)
  state: "active" | "released" | "consumed" | "expired"
  expiresAt: timestamptz
  createdAt: timestamptz
}
```

Keep the SQL table name `Reservation`. Because the foundation explicitly had no reservation command and is not public-authoritative, the migration may remove pre-commerce placeholder reservation rows before making the new linkage columns non-null. Add SQL `CHECK` constraints for positive quantity and allowed state values, plus unique/index coverage for the claim key, active-expiry scans and lot lookups. Rebuild `variant_availability` so only `state='active' AND expiresAt > now()` rows reduce availability.

- [ ] **Step 4: Regenerate Prisma and run migration + tests**

Run:
`npm run --prefix apps/api generate`
`npm run --prefix apps/api migrate:deploy`
`npm test --prefix apps/api`

Expected: schema generation succeeds; migration applies to the isolated database; all foundation tests pass including the new reservation persistence checks.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/202610100002_commerce_reservation_core/migration.sql apps/api/test/foundation.spec.ts
git commit -m "feat: make stock reservations lot-specific"
```

### Task 2: Add pure allocation request/result types and quantity normalization

**Files:**
- Create: `apps/api/src/inventory/allocation.types.ts`
- Create: `apps/api/src/inventory/allocation.values.ts`
- Create: `apps/api/test/allocation-values.spec.ts`

**Interfaces:**
- Consumes: `Prisma.Decimal`; variant unit strings from `Variant.unit`.
- Produces:
  - `AllocationLineInput { claimLineId: string; variantId: string; quantity: string }`
  - `CreateAllocationInput { claimType: "order" | "pos_draft"; claimId: string; locationId: string; expiresAt: Date; lines: AllocationLineInput[] }`
  - `AllocationLotResult { reservationId: string; claimLineId: string; variantId: string; lotId: string; quantity: string; expiryDate: string | null }`
  - `normalizeAllocationQuantity(raw: string, unit: string): Prisma.Decimal`

- [ ] **Step 1: Write failing value tests**

Cover `0`, negative values, more than three decimal places, non-numeric strings, fractional `piece`/count units, valid `kg`/`litre` decimals, and duplicate `claimLineId` inputs.

- [ ] **Step 2: Run only the new value suite**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/allocation-values.spec.js`

Expected: FAIL because allocation value helpers do not exist.

- [ ] **Step 3: Implement the types and normalizer**

`normalizeAllocationQuantity(raw: string, unit: string): Prisma.Decimal` must reject invalid/zero/negative quantities with `ApiProblem(400, "VALIDATION_FAILED", ...)`; count-based units require integers; `kg` and `litre` allow up to three decimals. Add `validateAllocationLines(lines)` that rejects duplicate `claimLineId` and empty input before any database work.

- [ ] **Step 4: Run the new suite**

Expected: all allocation value tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inventory/allocation.types.ts apps/api/src/inventory/allocation.values.ts apps/api/test/allocation-values.spec.ts
git commit -m "test: define exact allocation values"
```

### Task 3: Implement FEFO allocation inside a caller-owned transaction

**Files:**
- Create: `apps/api/src/inventory/allocation.service.ts`
- Modify: `apps/api/src/inventory/inventory.controller.ts` (module provider/export only; no new public reservation endpoint)
- Create: `apps/api/test/allocation.spec.ts`

**Interfaces:**
- Consumes: `Database`, `Prisma.TransactionClient`, `CreateAllocationInput`, `normalizeAllocationQuantity`.
- Produces:
  - `AllocationService.create(tx: Prisma.TransactionClient, input: CreateAllocationInput): Promise<AllocationLotResult[]>`
  - `AllocationService.release(tx: Prisma.TransactionClient, claimType: string, claimId: string): Promise<number>`
  - `AllocationService.expire(tx: Prisma.TransactionClient, now: Date): Promise<number>`

- [ ] **Step 1: Write failing single-line FEFO tests**

Create dated eligible lots plus an undated lot. Assert allocation chooses the earliest eligible expiry first, then later expiry, then undated; it must skip expired, expiring-today, quarantined, damaged and zero-quantity lots. Assert persisted reservations carry the exact chosen `lotId` and requested total.

- [ ] **Step 2: Run the allocation suite**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/allocation.spec.js`

Expected: FAIL because `AllocationService` is missing.

- [ ] **Step 3: Implement `create(...)` with stable row locks and a full-request preflight**

Algorithm decisions that are fixed by the spec:
- Validate/aggregate request lines by `variantId` for availability checks while retaining `claimLineId` for persisted rows.
- Sort distinct `(variantId, locationId)` keys lexicographically before locking.
- `SELECT ... FOR UPDATE` the corresponding `StockPosition` rows in that order; missing position is `OUT_OF_STOCK`.
- Re-read variants and all eligible lots inside the same transaction.
- Compute available quantity after active/unexpired reservations and safety stock before inserting any new reservation.
- If any line is short, throw `ApiProblem(409, "OUT_OF_STOCK", ..., { conflicts })` before the first insert.
- Split each claim line across eligible lots in FEFO order. For equal expiry dates use `StockLot.createdAt`, then `StockLot.id` as deterministic tie-breakers; null expiry sorts last.

- [ ] **Step 4: Add and pass multi-line rollback + safety-stock tests**

Tests must prove that when line 2 is unavailable, line 1 leaves zero new reservation rows, and that safety stock is never allocated.

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/allocation.spec.js`

Expected: PASS.

- [ ] **Step 5: Add and pass release/expiry tests**

`release(...)` changes only active rows for the exact claim to `released`; retry returns `0` and makes no additional change. `expire(...)` changes active rows with `expiresAt <= now` to `expired`; it must never change consumed/released rows.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/inventory/allocation.service.ts apps/api/src/inventory/inventory.controller.ts apps/api/test/allocation.spec.ts
git commit -m "feat: add transactional FEFO allocation service"
```

### Task 4: Prove final-unit concurrency across independent API/database clients

**Files:**
- Modify: `apps/api/test/allocation.spec.ts`

**Interfaces:**
- Consumes: `AllocationService.create(...)`; two independent `Database`/Prisma connections or two application instances, matching the foundation's cross-replica test pattern.
- Produces: concurrency evidence required by the production backend spec.

- [ ] **Step 1: Write the failing final-unit race test**

Seed one eligible sellable unit after safety stock. Start two transactions concurrently with different claim IDs requesting that same unit. Assert one commits and one returns `OUT_OF_STOCK`, total active reservation quantity is exactly `1`, and `variant_availability.availableToSell` is `0`.

- [ ] **Step 2: Run the race test repeatedly**

Run the same test at least 10 rounds in one suite execution to expose timing races.

Expected before any needed lock correction: at least one round should reproduce over-allocation or a transactional error that is not the documented domain conflict.

- [ ] **Step 3: If required, minimally correct lock/retry behavior**

Use the existing foundation pattern: stable `FOR UPDATE` locking and bounded retry only for PostgreSQL deadlock/serialization failures. Do not retry `OUT_OF_STOCK`, validation, or rule failures.

- [ ] **Step 4: Re-run allocation + foundation suites**

Run: `npm test --prefix apps/api`

Expected: all rounds pass; exactly one claimant wins each final-unit race; foundation tests remain green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/allocation.spec.ts apps/api/src/inventory/allocation.service.ts
git commit -m "test: prove final-unit allocation safety"
```

### Task 5: Add audit/outbox hooks without exposing a public reservation endpoint

**Files:**
- Modify: `apps/api/src/inventory/allocation.service.ts`
- Modify: `apps/api/test/allocation.spec.ts`

**Interfaces:**
- Consumes: caller `actorId` and `requestId` added to `CreateAllocationInput`.
- Produces: one `AuditEvent(action="inventory.allocated")` and one `OutboxEvent(type="inventory.allocated")` per successful claim creation; `inventory.released`/`inventory.expired` events for state changes when a caller supplies operation context.

- [ ] **Step 1: Write a failing atomicity test**

Inject a failure while writing the outbox record and assert reservation rows, audit rows and outbox rows all roll back together.

- [ ] **Step 2: Run the targeted test and confirm failure**

Expected: FAIL because allocation currently has no event hooks.

- [ ] **Step 3: Implement atomic audit/outbox writes in the caller transaction**

No background publisher is added here. Payload contains claim type/id, location, affected variant IDs and reservation IDs; it contains no unnecessary customer personal data.

- [ ] **Step 4: Run the full API suite**

Run: `npm test --prefix apps/api`

Expected: PASS; injected outbox failure leaves no allocation state.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/inventory/allocation.service.ts apps/api/test/allocation.spec.ts
git commit -m "feat: audit stock allocations atomically"
```

### Task 6: Document the internal commerce authority checkpoint and keep OpenAPI unchanged

**Files:**
- Create: `docs/COMMERCE_RESERVATION_CORE.md`
- Modify: `docs/BACKEND_FOUNDATION.md`
- Modify: `docs/BACKEND_FOUNDATION_CHECKPOINT.md`

**Interfaces:**
- Consumes: completed allocation service and tests.
- Produces: an explicit checkpoint stating what is safe for the next order/POS slices and what is still intentionally unavailable over HTTP.

- [ ] **Step 1: Document the internal API and invariants**

Record the three methods, FEFO ordering, lock order, eligible-lot rules, exact-quantity rules, state transitions, event behavior and the destructive cleanup of pre-commerce placeholder reservation rows in the migration.

- [ ] **Step 2: Record the measured verification evidence**

Include exact commands/results for migration on an empty database, `npm test --prefix apps/api`, the repeated final-unit race, and the outbox rollback test.

- [ ] **Step 3: Confirm no accidental public endpoint was added**

Run generated OpenAPI and assert the implemented HTTP operation count remains the foundation count (`13`) and no `/reservations`/`/allocations` route appears.

- [ ] **Step 4: Run repository verification before completion**

Run the API full suite plus the existing web lint, strict TypeScript, production build, Bun tests, engine regressions, contracts and route sweep using the commands already documented in `docs/BACKEND_FOUNDATION_CHECKPOINT.md`.

Expected: all existing gates stay green; public web remains on demo transport.

- [ ] **Step 5: Commit**

```bash
git add docs/COMMERCE_RESERVATION_CORE.md docs/BACKEND_FOUNDATION.md docs/BACKEND_FOUNDATION_CHECKPOINT.md
git commit -m "docs: checkpoint commerce reservation core"
```

## Self-review

- **Spec coverage:** This plan implements only the inventory allocation authority portion of Milestone 2. Orders/checkout, POS, handover/depletion/expiry worker and web adapter cutover remain deliberately separate plans so each can be reviewed and tested against this one stock authority.
- **Step scan:** Every implementation task begins with a failing test and has an explicit verification command and commit boundary.
- **Type consistency:** `CreateAllocationInput` and `AllocationLotResult` are introduced in Task 2 and consumed unchanged by Tasks 3–5.
- **Review Focus coverage:** final-unit race → Task 4; multi-line rollback/safety stock → Task 3; expiry/quarantine/damage/FEFO → Task 3; quantity precision/count units → Task 2.
- **Proportion:** The plan fixes interfaces, invariants and tests without transcribing service bodies; implementation details remain with the executing agent.
