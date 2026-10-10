# Refunds Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, approval-gated, provider-neutral Refunds Authority that safely returns captured electronic money for paid cancellations and over-capture correction without weakening Payments, Orders, Inventory, or future Returns boundaries.

**Architecture:** `RefundsModule` owns refund obligations, one durable execution identity per refund, reconciliation history, staff refund commands, and refund reads. Payments exports capture-locking and order-payment projection boundaries plus provider-neutral refund-adapter registration/readiness; Orders coordinates cancellation and admin financial actions by calling Refunds, while provider network I/O always happens after local execution intent commits.

**Tech Stack:** Node.js 24, TypeScript 5.9, NestJS 11, Prisma 7, PostgreSQL 17, Zod 4, Node test runner, existing Audit/Outbox/Idempotency infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-10-refunds-authority-design.md`

## Global Constraints

- Production money is integer GHS minor units; no floating-point money arithmetic.
- Every production Refund is linked to exactly one `PaymentAttempt` whose status is `succeeded`.
- Durable Refund rows consume capture refund capacity in every non-deleted status; failed/uncertain work is retried on the same row, never replaced to evade the cap.
- Full cancellation refunds the remaining refundable balance of every successful capture, even when total captured money exceeds `Order.totalMinor`.
- `refund_excess_capture` derives the excess on the server and never cancels fulfilment or releases stock/slot resources.
- Refund approval is mandatory in this milestone; approval is not proof that money moved.
- One Refund has at most one `RefundExecution`; retries reuse the same execution and merchant refund reference.
- Provider calls and provider lookups occur outside PostgreSQL transactions.
- Lock order is always Order -> PaymentAttempt rows by id -> Refund rows by id -> RefundExecution -> existing Inventory/Delivery locks where cancellation requires them.
- Refunds never mutates `PaymentAttempt` truth. Order payment-status changes go through a Payments-owned projection service.
- Orders never writes Refund tables directly; it invokes Refunds services.
- Production electronic payment readiness fails closed if the configured charge provider/method lacks compatible refund capability.
- Hubtel remains disabled; no guessed Hubtel refund endpoint, credential, signature, retry, reference, or lookup behavior may enter source.
- No production refund webhook, physical Returns workflow, manual/cash refund recording, POS refund authority, handover/depletion, dispatch/COD, worker scheduler, or storefront backend cutover is added here.
- Production API grows from 25 to exactly 28 documented paths only in Task 10.
- DB-integrated RED/GREEN gates must use an isolated PostgreSQL 17 database. On the current VPS, use the existing `.github/workflows/api.yml` disposable PostgreSQL service rather than any live application database.
- Public storefront transport remains demo/mock after this milestone.

## Review Focus

1. **Duplicate capture after a legitimate fulfilment** — `refund_excess_capture` must refund only the server-derived excess, preserve fulfilment/stock, and restore the order to `succeeded` after the excess is returned. Pinned in Task 6 and Task 7 tests.
2. **Crash after the provider accepted a refund but before local success persisted** — replay/retry must lookup the same merchant refund reference before any resend and must never create a second transfer. Pinned in Task 8.
3. **A cancelled order that later receives another successful stale payment attempt** — same-reason cancellation replay/admin recovery must create only the newly missing obligation without duplicating earlier Refunds. Pinned in Task 5 and Task 6.
4. **Concurrent refund capacity exhaustion** — two actors racing the final refundable pesewas on one capture may create at most one durable obligation. Pinned in Task 4.
5. **Provider evidence missing money identity** — claimed success without matching `amountMinor` and `GHS` currency must become `requires_review`, never `succeeded`. Pinned in Task 7 and Task 8.

---

## File Structure

### Shared contracts
- Create `packages/contracts/src/refunds.ts` — production Refunds enums, action requests/responses, ledger query/rows, customer-safe refund projection, admin order financial-action request/response.
- Modify `packages/contracts/src/index.ts` — export Refunds contracts.
- Modify `packages/contracts/src/checkout.ts` — add optional customer-safe `refunds` projection to `PublicOrder` without breaking existing consumers.
- Modify `packages/contracts/src/validation.ts` only where the existing aggregate request-schema registry requires the new Refunds schemas.

### Financial provider boundary / Payments-owned helpers
- Create `apps/api/src/payments/refund-provider.ts` — refund adapter interfaces and normalized observation/result types.
- Create `apps/api/src/payments/refund-provider.registry.ts` — provider-id/method lookup and capability checks.
- Create `apps/api/src/payments/payment-capture.service.ts` — Order-already-locked PaymentAttempt locking/read authority.
- Create `apps/api/src/payments/payment-refund-projection.service.ts` — the only Refunds-facing writer of `Order.paymentStatus`.
- Modify `apps/api/src/payments/payment-policy.service.ts`, `payments.module.ts`, `payment-provider.registry.ts` only as needed to fail charging/readiness closed when refund capability is missing.
- Modify `apps/api/src/health/health.controller.ts` and `apps/api/src/bootstrap.ts` to register refund adapters and readiness without registering any production fake.

### Refunds authority
- Create `apps/api/src/refunds/refund.values.ts` — normalization/hash/allocation helpers with no database I/O.
- Create `apps/api/src/refunds/refund-obligation.service.ts` — per-capture capacity locking and full-cancellation/excess obligation creation.
- Create `apps/api/src/refunds/refund-outcome.service.ts` — central normalized provider observation state machine.
- Create `apps/api/src/refunds/refund-action.service.ts` — approval, execute, retry, reconcile, action idempotency and network orchestration.
- Create `apps/api/src/refunds/refund-query.service.ts` — bounded administrator ledger.
- Create `apps/api/src/refunds/refunds.controller.ts` — `GET /refunds` and `POST /refunds/{refundId}/actions`.
- Create `apps/api/src/refunds/refunds.module.ts` — imports Payments and exports obligation service for Orders.

### Orders integration
- Modify `apps/api/src/orders/order-cancellation.service.ts` — customer paid cancellation + late-success replay recovery.
- Create `apps/api/src/orders/admin-order-actions.controller.ts` — admin-only financial action route.
- Create `apps/api/src/orders/order-financial-action.service.ts` — idempotent `cancel_refund` / `refund_excess_capture` orchestration.
- Modify `apps/api/src/orders/order-projection.service.ts` — safe Refund projections only.
- Modify `apps/api/src/orders/orders.module.ts` — wire Refunds and admin controller/service.

### Persistence / documentation / tests
- Modify `apps/api/prisma/schema.prisma`.
- Create `apps/api/prisma/migrations/202610100005_refunds_authority/migration.sql`.
- Create `apps/api/test/fake-refund-provider.ts`.
- Create focused tests named in each task below.
- Modify `apps/api/src/http/openapi.ts`, `docs/openapi-foundation.json`, `docs/API_CONTRACTS.md`, `docs/BACKEND_FOUNDATION.md`, `docs/PAYMENTS_AUTHORITY.md`.
- Create `docs/REFUNDS_AUTHORITY.md`.

---

### Task 1: Refund contracts and refund-provider readiness boundary

**Files:**
- Create: `packages/contracts/src/refunds.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/checkout.ts`
- Create: `apps/api/src/payments/refund-provider.ts`
- Create: `apps/api/src/payments/refund-provider.registry.ts`
- Modify: `apps/api/src/payments/payment-policy.service.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Create: `apps/api/test/fake-refund-provider.ts`
- Modify: `apps/api/test/payment-initiation.spec.ts`
- Modify: `apps/api/test/payment-events.spec.ts`
- Modify: `apps/api/test/payment-event-hardening.spec.ts`
- Modify: `apps/api/test/payment-provider.spec.ts`
- Modify: `apps/api/test/payment-cancellation.spec.ts`
- Modify: `apps/api/test/payment-reconciliation.spec.ts`
- Test: `apps/api/test/refund-values.spec.ts`
- Test: `apps/api/test/refund-provider.spec.ts`

**Interfaces:**
- Produces contract enums:
  - `RefundStatus = "awaiting_approval" | "approved" | "processing" | "succeeded" | "failed" | "requires_review"`
  - `RefundSourceType = "customer_cancellation" | "payment_review_cancellation" | "overcharge_correction" | "return"`
  - `RefundAction = "approve" | "execute" | "retry" | "reconcile"`
- Produces `refundActionRequestSchema`, `refundListQuerySchema`, `refundLedgerRowSchema`, `refundListResponseSchema`, `customerRefundViewSchema`, `adminOrderFinancialActionRequestSchema`.
- `RefundActionResponse = { refundId: string; refundStatus: RefundStatus; executionStatus?: "created" | "pending" | "succeeded" | "failed" | "uncertain"; reconciliationState?: "unreconciled" | "reconciled" | "exception"; orderPaymentStatus: string }`.
- `AdminOrderFinancialActionResponse = { orderId: string; fulfilmentStatus: string; paymentStatus: string; refundIds: string[] }`.
- `CustomerRefundView = { id: string; amountMinor: number; amountLabel: string; status: RefundStatus; sourceLabel: string; createdAt: string; approvedAt?: string; resolvedAt?: string; failureReason?: string }`.
- `RefundListResponse = { page: number; perPage: number; total: number; items: RefundLedgerRow[] }`; `RefundLedgerRow` includes exactly the safe staff fields listed in the approved spec and no raw provider/auth/replay evidence.
- `RefundActionResponse = { refundId: string; refundStatus: RefundStatus; executionStatus?: "created" | "pending" | "succeeded" | "failed" | "uncertain"; reconciliationState?: "unreconciled" | "reconciled" | "exception"; orderPaymentStatus: string }`.
- `AdminOrderFinancialActionResponse = { orderId: string; fulfilmentStatus: string; paymentStatus: string; refundIds: string[] }`.
- `CustomerRefundView = { id: string; amountMinor: number; amountLabel: string; status: RefundStatus; sourceLabel: string; createdAt: string; approvedAt?: string; resolvedAt?: string; failureReason?: string }`.
- `RefundListResponse = { page: number; perPage: number; total: number; items: RefundLedgerRow[] }`; `RefundLedgerRow` includes exactly the safe staff fields listed in the approved spec and no raw provider/auth/replay evidence.
- `RefundProviderCapabilities` fields: `methods: ElectronicPaymentMethod[]`, `lookupSupported: boolean`, `safeRetryAfterDefinitiveFailure: boolean`, `safeRetryAfterNoRecord: boolean`, `safeRetryAfterUnknown: boolean`.
- `RefundProviderInitiationResult` is `accepted/pending`, `accepted/succeeded` (success must include `amountMinor` + `currency: "GHS"`), or `rejected` with safe failure fields.
- `RefundProviderObservation` fields: `providerId`, `merchantRefundReference`, optional `providerRefundReference`, `state: "pending" | "succeeded" | "failed" | "not_found" | "unknown"`, optional `amountMinor`, optional `currency: "GHS"`, optional safe failure fields/timestamp.
- `RefundProviderInitiationResult` is `accepted/pending`, `accepted/succeeded` (success must include `amountMinor` + `currency: "GHS"`), or `rejected` with safe failure fields.
- `RefundProviderObservation` fields: `providerId`, `merchantRefundReference`, optional `providerRefundReference`, `state: "pending" | "succeeded" | "failed" | "not_found" | "unknown"`, optional `amountMinor`, optional `currency: "GHS"`, optional safe failure fields/timestamp.
- `RefundProviderAdapter` methods:
  - `capabilities(): RefundProviderCapabilities`
  - `initiateRefund(input: RefundProviderInitiationInput): Promise<RefundProviderInitiationResult>`
  - `lookupRefund(input: RefundProviderLookupInput): Promise<RefundProviderObservation>`
- `RefundProviderRegistry.require(providerId: string, method: ElectronicPaymentMethod): RefundProviderAdapter`.
- `createApplication(config?, paymentAdapters?, refundAdapters?)` adds the third adapter array without changing existing defaults.

- [ ] **Step 1: Write failing contract/provider tests**

Pin strict request rejection for body actor/amount/provider/currency fields, enum values above, Ghana/GHS-safe output shapes, adapter-id validation, method support, and readiness failure when charge capability exists but matching refund capability does not.

- [ ] **Step 2: Run RED gate**

Run contract build and API compile locally; push the test-only checkpoint and require `API foundation` to fail only the new Refunds contract/provider assertions while existing suites remain green.

- [ ] **Step 3: Implement shared contracts and provider types**

Keep all Zod request objects `.strict()`. Customer-safe projections must not contain merchant/provider refund references, actor ids, retries, reconciliation internals, or raw provider data.

- [ ] **Step 4: Implement refund registry and fail-closed charging/readiness**

`PaymentPolicyService.assertElectronicMethodAvailable(method)` must require both the configured charge adapter and a same-id Refund adapter that supports `method`. Health readiness must use the same policy boundary. No dependency from Payments to `RefundsModule` is allowed.

- [ ] **Step 5: Extend bootstrap/test adapter injection**

Production defaults remain empty arrays. `FakeRefundProvider` lives under `apps/api/test` only and exposes deterministic hooks for later tasks. Update every existing payment-enabled test listed in this task to pass a same-id compatible fake Refund adapter through the third `createApplication` argument; do not weaken readiness merely to preserve the old two-argument test harness.

- [ ] **Step 6: Run GREEN gate**

Require focused tests plus all pre-existing Payments tests to pass on PostgreSQL-17 hosted CI. Verify a payment-configured app with no compatible Refund adapter returns `UNAVAILABLE`, while a completely absent payments bundle may still boot.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src apps/api/src/payments apps/api/src/health apps/api/src/bootstrap.ts apps/api/test/fake-refund-provider.ts apps/api/test/refund-values.spec.ts apps/api/test/refund-provider.spec.ts
git commit -m "feat: add refund provider boundary"
```

### Task 2: Refund persistence and PostgreSQL invariants

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610100005_refunds_authority/migration.sql`
- Test: `apps/api/test/refunds-schema.spec.ts`

**Interfaces:**
- Produces Prisma models `Refund`, `RefundExecution`, `RefundReconciliation` with relations from `Order` and `PaymentAttempt`.
- `Refund.paymentAttemptId` references exactly one capture; service-level logic additionally requires that attempt to belong to the same order and be `succeeded`.
- `RefundExecution.refundId` is unique.

- [ ] **Step 1: Write the failing schema test**

Assert model availability plus DB rejection of zero/negative amount, non-GHS currency, invalid states, duplicate execution per Refund, duplicate merchant refund reference, duplicate `(provider, providerRefundRef)` when non-null, and negative attempt/version values.

- [ ] **Step 2: Add immutability/append-only RED assertions**

Assert Refund financial identity updates fail, Refund deletion fails, RefundExecution financial identity/merchant-reference updates fail, and RefundReconciliation update/delete fails.

- [ ] **Step 3: Run migration RED gate**

On a clean PostgreSQL-17 workflow database, migrations 001-004 must pass and the new schema test must fail because migration 005/models are absent.

- [ ] **Step 4: Implement Prisma models and migration 005**

Use database CHECK constraints for valid status/source/method/currency and positive/nonnegative scalar invariants; use triggers for immutable/delete/append-only rules. Do not attempt cross-row refund-capacity sums in CHECK constraints.

- [ ] **Step 5: Regenerate Prisma and run GREEN gate**

Expected: clean PostgreSQL 17 applies migrations 001-005; `refunds-schema.spec` passes; all prior schema/payment tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/test/refunds-schema.spec.ts
git commit -m "feat: add refunds authority persistence"
```

### Task 3: Payments capture authority and refund projection boundary

**Files:**
- Create: `apps/api/src/payments/payment-capture.service.ts`
- Create: `apps/api/src/payments/payment-refund-projection.service.ts`
- Modify: `apps/api/src/payments/payment-policy.service.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-refund-projection.spec.ts`

**Interfaces:**
- `PaymentCaptureState` contains `attempts`, `liveAttempts`, `successfulCaptures`, all in stable id order.
- `PaymentCaptureService.lockForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<PaymentCaptureState>` assumes the caller already holds the Order row and locks all PaymentAttempt rows by id.
- `PaymentRefundProjectionInput = { order: { id: string; totalMinor: number; fulfilmentStatus: string; paymentStatus: string }; captures: { id: string; amountMinor: number }[]; refunds: { amountMinor: number; status: RefundStatus; sourceType: RefundSourceType }[] }`.
- `PaymentRefundProjectionService.apply(tx, input): Promise<string>` is the only Refunds-facing writer of `Order.paymentStatus`; it never changes `PaymentAttempt.status`.

- [ ] **Step 1: Write projection RED tests**

Pin: no capture preserves normal payment semantics; cancelled+unresolved refund -> `refund_pending`; ambiguity -> `requires_review`; fully returned captured money -> `refunded`; successful overcharge-only correction returning net captured money to `Order.totalMinor` -> `succeeded`; legitimate partial business refund -> `partially_refunded`.

- [ ] **Step 2: Add capture-lock RED tests**

Prove live initiated/pending attempts are identified, uncertain initiation remains live, successful captures include every succeeded attempt, and no helper mutates attempt truth.

- [ ] **Step 3: Implement `PaymentCaptureService` and projection service**

Projection arithmetic uses integer minor units only. For non-cancelled over-capture, require complete committed correction coverage or return `requires_review`.

- [ ] **Step 4: Replace cancellation-safety internals with capture helper where appropriate**

Preserve current unpaid cancellation behavior. `PaymentPolicyService.assertCancellationSafe` may delegate to the capture service but must not become a second refund engine.

- [ ] **Step 5: Run GREEN gate**

Require the new tests plus all payment cancellation/outcome/reconciliation suites to pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments apps/api/test/payment-refund-projection.spec.ts
git commit -m "feat: expose payment capture refund boundaries"
```

### Task 4: Refund obligation authority and capture-cap enforcement

**Files:**
- Create: `apps/api/src/refunds/refund.values.ts`
- Create: `apps/api/src/refunds/refund-obligation.service.ts`
- Create: `apps/api/src/refunds/refunds.module.ts`
- Modify: `apps/api/src/payments/payments.module.ts` only if export wiring is needed
- Test: `apps/api/test/refund-obligation.spec.ts`

**Interfaces:**
- `RefundActorContext = { actorId: string; requestId: string }`.
- `RefundObligationService.ensureFullCancellation(tx, order, captureState, sourceType, reason, context): Promise<Refund[]>` where source is `customer_cancellation | payment_review_cancellation`.
- `RefundObligationService.ensureExcessCorrection(tx, order, captureState, reason, context): Promise<Refund[]>`.
- Both methods assume Order and PaymentAttempts are already locked; they lock existing Refund rows by id before computing capacity.
- `normalizeRefundReason(value: string): string` trims/collapses whitespace and enforces 1–500 characters, matching the existing production account-cancellation path contract.

- [ ] **Step 1: Write full-cancellation RED tests**

Cover unpaid/failed/expired captures rejected as funding sources, one succeeded capture, multiple succeeded captures, pre-existing obligations consuming capacity, and replay creating no duplicates.

- [ ] **Step 2: Write concurrency RED test**

Using two application/database instances, race the final refundable amount and assert total durable Refund amount never exceeds the successful capture amount.

- [ ] **Step 3: Write excess-correction RED tests**

For captured sum greater than order total, allocate only `sum(captures) - Order.totalMinor - committedRefunds`, newest successful captures first. Assert zero/negative excess creates nothing and no fulfilment/stock mutation occurs.

- [ ] **Step 4: Implement Refunds module/value/obligation services**

Create one Refund per positive remaining capture balance for full cancellation. Emit `refund.requested` audit and outbox in the caller transaction. Fail closed if existing durable obligations already exceed capture capacity.

- [ ] **Step 5: Run GREEN gate**

Require all Task 4 tests and existing Payments/Inventory concurrency suites to pass on PostgreSQL 17.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/refunds apps/api/src/payments/payments.module.ts apps/api/test/refund-obligation.spec.ts
git commit -m "feat: add refund obligation authority"
```

### Task 5: Customer paid cancellation with atomic refund obligations

**Files:**
- Modify: `apps/api/src/orders/order-cancellation.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/refund-cancellation.spec.ts`
- Modify: `apps/api/test/order-cancel.spec.ts`
- Modify: `apps/api/test/payment-cancellation.spec.ts`

**Interfaces:**
- Preserve public service signature `OrderCancellationService.cancel(userId: string, requestId: string, orderId: string, reason: string)` so account controller clients do not change.
- Consumes `PaymentCaptureService`, `RefundObligationService`, `PaymentRefundProjectionService`, `AllocationService`, `DeliveryConfigService`.

- [ ] **Step 1: Write RED tests for unpaid vs paid customer cancellation**

Unpaid/failed/expired retains current behavior with zero Refunds. Successful captures create full obligations before reservation/slot release and set order projection to `refund_pending`.

- [ ] **Step 2: Pin late-success semantic replay**

Cancel once; introduce a later successful stale capture; replay with the same normalized reason; assert only the newly missing Refund is created. Different reason remains `CONFLICT`.

- [ ] **Step 3: Pin live-payment and handover protections**

Live/uncertain payment blocks cancellation until reconciliation. `stockConsumedAt`, dispatched, delivered, or collected blocks normal paid cancellation.

- [ ] **Step 4: Pin transaction rollback**

Inject Refund audit/outbox failure and assert order cancellation, new Refunds, reservation release, and slot release all roll back.

- [ ] **Step 5: Implement paid cancellation orchestration**

Lock Order first, then Payments, then Refunds; no provider call. For successful captures call `ensureFullCancellation(..., "customer_cancellation", ...)`, apply financial projection, then release Inventory/Delivery exactly once and append `order.cancelled_with_refund` when applicable.

- [ ] **Step 6: Run GREEN gate and commit**

```bash
git add apps/api/src/orders apps/api/test/refund-cancellation.spec.ts apps/api/test/order-cancel.spec.ts apps/api/test/payment-cancellation.spec.ts
git commit -m "feat: create refunds during paid cancellation"
```

### Task 6: Administrator cancel-refund and excess-capture correction

**Files:**
- Create: `apps/api/src/orders/order-financial-action.service.ts`
- Create: `apps/api/src/orders/admin-order-actions.controller.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/admin-order-refunds.spec.ts`

**Interfaces:**
- `OrderFinancialActionService.apply(req, actorId, orderId, input, idempotencyKey): Promise<AdminOrderFinancialActionResponse>`.
- Idempotency operation string: `orders.admin.financial_action`.
- Request is exactly `{ action: "cancel_refund" | "refund_excess_capture"; reason: string }`; normalized reason length is 1–500 characters.
- Controller is `@UseGuards(AccessGuard)` and hard-fails non-`admin` actors in this milestone.
- Keep the controller excluded from generated Swagger until Task 10; runtime route exists for tests.

- [ ] **Step 1: Write RED tests for `cancel_refund`**

Cover paid-without-stock `requires_review`, already-cancelled late-success recovery, no duplicate obligations, protected non-cancelled handover states, and non-admin refusal.

- [ ] **Step 2: Write RED tests for `refund_excess_capture`**

Assert server-derived excess only, no request amount/provider/payment-attempt selector accepted, no cancellation/stock/slot mutation, and the action remains allowed after handover because it corrects over-capture rather than reversing fulfilment.

- [ ] **Step 3: Write idempotency RED tests**

Same actor/key/same normalized input replays. Same actor/key with changed action or reason returns `IDEMPOTENCY_CONFLICT`. Different actors have independent scopes.

- [ ] **Step 4: Implement admin action controller/service**

Use the existing advisory-lock/idempotency pattern. `cancel_refund` uses source `payment_review_cancellation`; `refund_excess_capture` uses `overcharge_correction`. All amounts/providers/captures come from locked server state.

- [ ] **Step 5: Run GREEN gate and commit**

```bash
git add apps/api/src/orders apps/api/test/admin-order-refunds.spec.ts
git commit -m "feat: add admin refund order actions"
```

### Task 7: Central refund outcome state machine

**Files:**
- Create: `apps/api/src/refunds/refund-outcome.service.ts`
- Modify: `apps/api/src/refunds/refunds.module.ts`
- Test: `apps/api/test/refund-outcome.spec.ts`

**Interfaces:**
- `RefundOutcomeContext = { actorId: string; requestId: string; trigger: "execute" | "retry" | "manual_reconcile" }`.
- `RefundOutcomeService.apply(tx: Prisma.TransactionClient, executionId: string, observation: RefundProviderObservation, context: RefundOutcomeContext): Promise<RefundOutcomeResult>`.
- The service seed-reads only enough to discover `orderId`, then locks Order -> PaymentAttempts -> Refunds -> RefundExecution in the global order.
- `RefundOutcomeResult` contains `processingResult: "applied" | "pending" | "failed" | "exception" | "duplicate"`, plus refund/execution/order payment statuses.

- [ ] **Step 1: Write success/pending/failure RED tests**

Immediate matching success marks Refund/Execution succeeded once, never rewrites PaymentAttempt success, and updates order projection through Payments. Pending remains processing. Authoritative failure marks Refund/Execution failed without resurrecting fulfilment.

- [ ] **Step 2: Write evidence-mismatch RED tests**

Wrong provider, merchant refund reference, known provider refund reference, amount, currency, or claimed success missing amount/currency becomes Refund `requires_review` + execution reconciliation `exception`.

- [ ] **Step 3: Write duplicate/conflicting terminal RED tests**

Duplicate success is idempotent. A conflicting later terminal observation never reverses verified success and records an exception/audit condition only once.

- [ ] **Step 4: Implement outcome service**

Every local state transition writes matching audit/outbox in the same transaction. Call `PaymentRefundProjectionService.apply` only after Refund state is updated and while financial locks are held.

- [ ] **Step 5: Pin Review Focus overcharge projection**

A fulfilled order with only a successful overcharge correction and net captured money equal to `Order.totalMinor` must end at payment status `succeeded`, not `partially_refunded`.

- [ ] **Step 6: Run GREEN gate and commit**

```bash
git add apps/api/src/refunds/refund-outcome.service.ts apps/api/src/refunds/refunds.module.ts apps/api/test/refund-outcome.spec.ts
git commit -m "feat: add refund outcome authority"
```

### Task 8: Approval, execute, retry and reconciliation orchestration

**Files:**
- Create: `apps/api/src/refunds/refund-action.service.ts`
- Create: `apps/api/src/refunds/refunds.controller.ts`
- Modify: `apps/api/src/refunds/refunds.module.ts`
- Modify: `apps/api/test/fake-refund-provider.ts`
- Test: `apps/api/test/refund-actions.spec.ts`
- Test: `apps/api/test/refund-recovery.spec.ts`

**Interfaces:**
- `RefundActionService.apply(req, actorId, refundId, action, idempotencyKey): Promise<RefundActionResponse>`.
- Idempotency operation string: `refunds.action`.
- `approve` performs no network I/O.
- First `execute` Stage A creates/locks one RefundExecution and stable merchant reference, then commits before any provider call.
- `retry` and `reconcile` always start with `lookupRefund` when prior execution may have reached the provider.
- `attemptCount` is incremented only after the provider-call promise has actually been created; no PostgreSQL transaction remains open while awaiting it.
- Controller is admin-only and Swagger-excluded until Task 10.

- [ ] **Step 1: Write approval/idempotency RED tests**

Approval only from `awaiting_approval`; records approver/time; no provider call. Execute before approval is refused. Same key/action replays; changed input conflicts.

- [ ] **Step 2: Write committed-intent/network-boundary RED test**

The fake provider queries through a second DB client during `initiateRefund` and must observe the committed RefundExecution. Assert no transaction lock is held across the provider call.

- [ ] **Step 3: Write timeout-after-accept recovery RED test**

First execute starts provider transfer then times out -> execution `uncertain`, Refund `requires_review`. Same-key replay/retry calls lookup with the same merchant refund reference before any resend and records matching success without a second transfer.

- [ ] **Step 4: Write retry-capability RED tests**

Definitive failure may resend only when `safeRetryAfterDefinitiveFailure`; `not_found` only when `safeRetryAfterNoRecord`; `unknown` only when `safeRetryAfterUnknown`. Unsafe cases remain `requires_review`. Every resend reuses the same execution/reference.

- [ ] **Step 5: Write crash-after-provider-success RED test**

Inject local outcome audit/outbox failure after fake provider success. Recovery must lookup and persist the already-completed refund without invoking a second transfer.

- [ ] **Step 6: Implement action service + controller**

Every lookup appends `RefundReconciliation` with trigger/result and safe metadata only. Route accepts no body actor, amount, provider reference, currency, or payment-attempt selector.

- [ ] **Step 7: Run GREEN gate and commit**

```bash
git add apps/api/src/refunds apps/api/test/fake-refund-provider.ts apps/api/test/refund-actions.spec.ts apps/api/test/refund-recovery.spec.ts
git commit -m "feat: execute and reconcile refunds safely"
```

### Task 9: Staff refund ledger and customer-safe refund projections

**Files:**
- Create: `apps/api/src/refunds/refund-query.service.ts`
- Modify: `apps/api/src/refunds/refunds.controller.ts`
- Modify: `apps/api/src/refunds/refunds.module.ts`
- Modify: `apps/api/src/orders/order-projection.service.ts`
- Test: `apps/api/test/refund-reads.spec.ts`

**Interfaces:**
- `RefundQueryService.list(query: unknown): Promise<RefundListResponse>` parses `refundListQuerySchema` and returns bounded newest-first rows.
- Ledger filters: status, provider, method, source type, order reference, created-from, created-to; page >=1; perPage default 25 max 100.
- Customer projection uses only `CustomerRefundView[]` from shared contracts.

- [ ] **Step 1: Write administrator ledger RED tests**

Pin pagination/filter behavior and fields: capture amount, refund amount, succeeded-refund total, remaining capture capacity, refund source/status/reason, execution/reconciliation state, attempt count, optional staff-safe provider refund reference, safe failure reason, timestamps.

- [ ] **Step 2: Write ledger secrecy/auth RED tests**

Non-admin returns 403. Rows must not contain merchant refund reference, original payment provider reference, raw provider data, auth/signature headers, credentials, replay hashes, or reconciliation raw evidence.

- [ ] **Step 3: Write customer/tracking projection RED tests**

Owner order status and reference+verification tracking show the same safe refund summaries; guest capability does not gain broader access. No provider/internal identifiers leak.

- [ ] **Step 4: Implement query and projection**

`remainingRefundableMinor` means capture amount minus all durable Refund obligations for that capture; `alreadyRefundedMinor` means succeeded Refunds only. Keep these labels distinct.

- [ ] **Step 5: Run GREEN gate and commit**

```bash
git add apps/api/src/refunds apps/api/src/orders/order-projection.service.ts apps/api/test/refund-reads.spec.ts
git commit -m "feat: expose safe refund ledger and projections"
```

### Task 10: Production OpenAPI, authority docs and complete verification

**Files:**
- Modify: `apps/api/src/http/openapi.ts`
- Modify: `apps/api/src/refunds/refunds.controller.ts` — remove Swagger exclusion and document both Refund routes
- Modify: `apps/api/src/orders/admin-order-actions.controller.ts` — remove Swagger exclusion and document financial actions
- Modify: `docs/openapi-foundation.json`
- Create: `docs/REFUNDS_AUTHORITY.md`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/BACKEND_FOUNDATION.md`
- Modify: `docs/PAYMENTS_AUTHORITY.md`
- Test: `apps/api/test/refunds-authority.spec.ts`
- Modify: `apps/api/test/foundation.spec.ts`
- Modify: `apps/api/test/commerce-authority.spec.ts` only if exact authority scans belong there

**Interfaces:**
- Final production paths added: `GET /refunds`, `POST /refunds/{refundId}/actions`, `POST /admin/orders/{orderId}/actions`.
- Existing `POST /account/orders/{orderId}/cancel` gains behavior but remains one path.
- Final generated production OpenAPI path count: exactly 28.

- [ ] **Step 1: Write OpenAPI/authority RED tests**

Assert exactly 28 documented paths; Refund action/admin order action require administrator security and `Idempotency-Key`; customer cancellation keeps customer security; no manual/cash refund execution route; no refund webhook route.

- [ ] **Step 2: Add source-authority scans**

Assert Orders source contains no direct Prisma `refund.create/update/delete`; Refunds contains no direct PaymentAttempt truth mutation; production has no fake Refund adapter or `Hubtel` refund implementation/guessed endpoint.

- [ ] **Step 3: Publish the three Refunds production paths**

Document strict request/response schemas, safe error responses, admin/customer security, and the distinction that approval/request is not a completed transfer.

- [ ] **Step 4: Write `docs/REFUNDS_AUTHORITY.md` and update authority docs**

State implemented/deferred boundaries explicitly: provider-neutral Refunds implemented; live Hubtel, physical Returns, manual/cash/POS refunds, handover/dispatch/COD, worker automation, and public storefront cutover still closed.

- [ ] **Step 5: Regenerate OpenAPI twice and prove determinism**

Run after contracts/API build:

```bash
npm run --prefix packages/contracts build
npm run --prefix apps/api generate
npm run --prefix apps/api build
npm run --prefix apps/api openapi
sha256sum docs/openapi-foundation.json
npm run --prefix apps/api openapi
sha256sum docs/openapi-foundation.json
```

Expected: hashes match; JSON contains exactly 28 paths.

- [ ] **Step 6: Fresh PostgreSQL-17 migration/API gate**

Require hosted `API foundation` on the exact feature head to apply migrations 001-005 to an empty PostgreSQL 17 database, pass the complete API suite, and report zero OpenAPI drift.

- [ ] **Step 7: Run complete root/business verification**

```bash
bun run lint
bunx tsc --noEmit --incremental false
bun run build
bun scripts/handoff-regressions.ts
bun test
bun scripts/contracts-check.ts
bash scripts/acceptance-checks.sh
bash scripts/route-sweep.sh
```

Expected: every command exits 0.

- [ ] **Step 8: Execute the 45-case spec audit**

Map every item in spec section 32 to a named passing test or source/openapi scan. Any uncovered case blocks PR readiness.

- [ ] **Step 9: Final diff/security hygiene**

Run `git diff --check`, placeholder scan, provider-secret/reference scan, direct-authority scan, and confirm the worktree is clean after the final commit.

- [ ] **Step 10: Commit final authority checkpoint**

```bash
git add apps/api/src/http apps/api/src/refunds apps/api/src/orders/admin-order-actions.controller.ts apps/api/test docs packages/contracts/src
git commit -m "docs: publish refunds authority surface"
```

- [ ] **Step 11: Push implementation PR and merge only after exact-head CI**

The implementation PR remains draft until Task 10 evidence is recorded. Require both hosted workflows green on the exact feature SHA, zero unresolved review threads, then squash-merge using expected-head SHA protection and require both workflows green again on the exact resulting `main` commit.

---

## Completion Definition

Refunds Authority is complete only when all ten tasks are committed, migration 005 applies cleanly after 001-004 on fresh PostgreSQL 17, all 45 approved verification cases have named evidence, the generated production OpenAPI is deterministic at exactly 28 paths, both hosted workflows are green on the feature head and again on the merged `main` SHA, and no live Hubtel/manual-cash/Returns/handover/dispatch/storefront authority has been accidentally introduced.
