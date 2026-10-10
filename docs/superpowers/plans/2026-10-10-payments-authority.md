# Payments Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral, duplicate-safe Payments Authority that can initiate and verify electronic payments without allowing browser/client assertions to establish money truth, while preserving Inventory as the only reservation writer.

**Architecture:** Add a dedicated `PaymentsModule` between Orders and provider adapters. Payment attempts, provider events and reconciliation history become durable PostgreSQL authority; provider network I/O always happens outside database locks, while money-state application and paid-order reservation coverage commit atomically. Hubtel remains the first intended live adapter, but this plan does not implement or enable a live Hubtel adapter until its exact merchant verification contract and credentials are supplied; CI uses an injected deterministic fake provider.

**Tech Stack:** Node.js 24, TypeScript 5.9, NestJS 11, Prisma 7.10, PostgreSQL 17, Zod 4, existing shared `@variety/contracts`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-10-payments-authority-design.md`

## Global Constraints

- Money authority is integer GHS minor units only; no floating-point money.
- Orders may set only the initial checkout `paymentStatus` snapshot (`pending | unpaid`); post-checkout verified payment transitions belong to Payments.
- Inventory remains the only production writer of `Reservation` rows.
- `POST /orders/{orderId}/payment-outcome` stays absent from the production API.
- Browser redirects, screenshots, client fields and unauthenticated callback bodies never establish payment success.
- Provider network calls must not occur while PostgreSQL row locks or long-running transactions are held.
- Global row-lock order is Order -> PaymentAttempt(s) stable ID order -> reservation history -> Inventory stock rows/lots stable order.
- Provider-specific secret names, Hubtel signature semantics and live Hubtel endpoints must not be guessed or committed.
- Fake provider support is test-only/injected; production remains closed when no verified live adapter is registered.
- Hosted-card flow accepts no PAN/CVV; any returned redirect must be HTTPS and match the configured allowlist.
- Refund execution, POS money authority, COD cash/remittance, stock handover, fulfilment/dispatch and public frontend cutover remain out of scope.
- Node engine remains `>=24 <25`; do not loosen current pinned Nest/Prisma versions as part of this slice.
- Public storefront remains on demo transport after this merge.

## Review Focus

1. **Provider accepted but HTTP response was lost:** retry must reuse the same durable attempt and must not issue an uncontrolled second charge. Task 6 pins this with timeout-after-accept and replay tests.
2. **Stale provider lookup races a newer webhook/cancellation decision:** the later transaction must re-lock Order then Attempt and reject stale observations instead of regressing state. Tasks 7 and 8 pin this.
3. **Webhook row persisted but outcome transaction failed:** redelivery must resume the same provider-event row and apply at most one financial effect. Task 7 pins this.
4. **Provider evidence omits optional amount/currency fields:** success may be applied only when the adapter contract marks the observation authoritative and all supplied identity/amount/currency fields match; any supplied mismatch routes to exception. Task 7 pins both paths.
5. **Paid-order coverage already expires later than the newly requested confirmed deadline:** Inventory must never shorten a valid hold. Task 4 pins extension using `max(existing expiry, requested expiry)` semantics.

## File Structure Map

New production units:

- `apps/api/src/commerce-identity/commerce-identity.module.ts` — shared customer/guest commerce principal boundary.
- `apps/api/src/commerce-identity/guest-checkout.service.ts` — moved guest capability implementation.
- `apps/api/src/commerce-identity/checkout-principal.service.ts` — moved customer/guest principal resolution.
- `apps/api/src/payments/payment-provider.ts` — normalized provider port/types.
- `apps/api/src/payments/payment-provider.registry.ts` — registered adapter/capability authority.
- `apps/api/src/payments/payment-policy.service.ts` — method availability and cancellation-safety policy.
- `apps/api/src/payments/payment-initiation.service.ts` — durable two-stage initiation.
- `apps/api/src/payments/payment-outcome.service.ts` — only verified money-state transition service.
- `apps/api/src/payments/payment-provider-event.service.ts` — raw event authentication/dedupe/resume orchestration.
- `apps/api/src/payments/payment-reconciliation.service.ts` — authoritative lookup/reconciliation.
- `apps/api/src/payments/payment-query.service.ts` — staff ledger projection.
- `apps/api/src/payments/payment-attempts.controller.ts` — customer/guest initiation endpoint.
- `apps/api/src/payments/payment-provider-events.controller.ts` — provider event endpoint.
- `apps/api/src/payments/payments.controller.ts` — staff ledger/reconcile endpoints.
- `apps/api/src/payments/payments.module.ts` — module wiring/exports.
- `packages/contracts/src/payments.ts` — provider-neutral payment request/response contracts.

New tests:

- `apps/api/test/payment-values.spec.ts`
- `apps/api/test/payments-schema.spec.ts`
- `apps/api/test/payment-coverage.spec.ts`
- `apps/api/test/fake-payment-provider.ts`
- `apps/api/test/payment-provider.spec.ts`
- `apps/api/test/payment-initiation.spec.ts`
- `apps/api/test/payment-events.spec.ts`
- `apps/api/test/payment-reconciliation.spec.ts`
- `apps/api/test/payment-cancellation.spec.ts`
- `apps/api/test/payments-authority.spec.ts`

## Task 1: Shared Payment Contracts and Closed-by-Default Configuration

**Files:**
- Create: `packages/contracts/src/payments.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/validation.ts`
- Modify: `apps/api/src/config.ts`
- Test: `apps/api/test/payment-values.spec.ts`

**Interfaces:**
- Produces: `ElectronicPaymentMethod`, `PaymentProviderAction`, `PaymentInitiationRequest`, `PaymentInitiationResult`, `PaymentListQuery`, `PaymentReconcileResponse`, and their Zod schemas.
- Produces: `PaymentConfig | null` on `ApiConfig.payments`.
- `PaymentConfig` fields: `providerId`, `enabledMethods`, `confirmedHoldMinutes`, `requestTimeoutMs`, `reconcileAfterSeconds`, `hostedDomains`.

- [ ] **Step 1: Write failing contract/config tests**

Pin these cases in `payment-values.spec.ts`: fully absent payment bundle yields `payments=null`; partial bundle throws; full bundle accepts only `mobile_money | card_hosted | bank_transfer`; confirmed hold is a positive integer; timeout is `100..30000` ms; reconcile delay is `30..86400` seconds; hosted domains are lowercase hostnames with no scheme/path; initiation schema accepts only optional Ghana `+233` payer phone and rejects amount/currency/status/provider/card fields.

- [ ] **Step 2: Run RED gate**

Run: `cd apps/api && npm run build && node --test --test-concurrency=1 dist/test/payment-values.spec.js`

Expected: FAIL because payment contracts/config do not exist.

- [ ] **Step 3: Add provider-neutral shared contracts**

Define:

```ts
export type ElectronicPaymentMethod = "mobile_money" | "card_hosted" | "bank_transfer";
export type PaymentProviderAction =
  | { kind: "redirect"; url: string }
  | { kind: "prompt"; message: string; reference?: string }
  | { kind: "instructions"; message: string; reference?: string }
  | { kind: "none" };
export interface PaymentInitiationRequest { payerPhone?: string; }
export interface PaymentInitiationResult {
  attemptId: string;
  method: ElectronicPaymentMethod;
  attemptStatus: string;
  paymentStatus: string;
  action: PaymentProviderAction;
}
```

Add Zod schemas and exports without provider-specific secret fields.

- [ ] **Step 4: Add central payment policy configuration**

Use these application-owned environment names only:

`PAYMENT_PROVIDER_ID`, `PAYMENT_ENABLED_METHODS`, `PAYMENT_CONFIRMED_HOLD_MINUTES`, `PAYMENT_PROVIDER_TIMEOUT_MS`, `PAYMENT_RECONCILE_AFTER_SECONDS`, `PAYMENT_HOSTED_DOMAINS`.

All six are absent -> payments closed. Any partial bundle -> startup error. Do not add Hubtel credential names in this task.

- [ ] **Step 5: Run GREEN gate and existing config tests**

Run the focused test, then `npm test` from `apps/api`.

Expected: focused PASS; no existing API regression.

- [ ] **Step 6: Commit**

Commit message: `feat: define payment contracts and policy config`.

## Task 2: Extract Shared Commerce Identity Boundary

**Files:**
- Create: `apps/api/src/commerce-identity/commerce-identity.module.ts`
- Move: `apps/api/src/orders/guest-checkout.service.ts` -> `apps/api/src/commerce-identity/guest-checkout.service.ts`
- Move: `apps/api/src/orders/checkout-principal.service.ts` -> `apps/api/src/commerce-identity/checkout-principal.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Modify imports in checkout/order tests and controllers as required.
- Test: existing `guest-checkout.spec.ts`, `checkout-command.spec.ts`, `order-reads.spec.ts`.

**Interfaces:**
- Preserves class names and `CheckoutPrincipal` union exactly.
- Produces `CommerceIdentityModule` exporting `GuestCheckoutService` and `CheckoutPrincipalService`.

- [ ] **Step 1: Add a failing module-boundary assertion**

Add a source-level assertion that Payments can import commerce identity without importing `OrdersModule`, and that Orders no longer owns the two identity services.

- [ ] **Step 2: Run RED gate**

Expected: FAIL because services still live under Orders.

- [ ] **Step 3: Move services without changing behavior**

Use `git mv`; update imports only. `CommerceIdentityModule` imports `IdentityModule` and exports the two existing services.

- [ ] **Step 4: Rewire Orders**

`OrdersModule` imports `CommerceIdentityModule`; remove duplicate providers/exports for moved services unless required as re-exports for compatibility.

- [ ] **Step 5: Run existing identity/checkout/order suites**

Run focused existing suites serially after build.

Expected: all unchanged behavior PASS.

- [ ] **Step 6: Commit**

Commit message: `refactor: share commerce identity boundary`.

## Task 3: Durable Payment Schema and Reservation Generations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610100004_payments_authority/migration.sql`
- Modify: `apps/api/test/commerce-fixtures.ts`
- Test: `apps/api/test/payments-schema.spec.ts`

**Interfaces:**
- Produces Prisma models `PaymentAttempt`, `PaymentProviderEvent`, `PaymentReconciliation`.
- Adds `Reservation.generation Int @default(1)`.
- `Order` gains relation `paymentAttempts PaymentAttempt[]`.

- [ ] **Step 1: Write failing PostgreSQL invariant tests**

Test positive amount/callback/generation constraints, allowed enum-like state values, unique merchant reference, provider+providerRef uniqueness, provider-event dedupe, one live attempt per order, immutable attempt identity fields, append-only provider events/reconciliations, and reservation reuse of the same lot only when generation differs.

- [ ] **Step 2: Run RED gate on a fresh disposable PostgreSQL database**

Expected: FAIL because migration/models do not exist.

- [ ] **Step 3: Add Prisma models**

`PaymentAttempt` must carry: `id`, `orderId`, `provider`, `method`, `currency`, `amountMinor`, `merchantReference`, nullable `providerRef`, `status`, `initiationState`, `settlementState`, `callbackCount`, optional `failureCode`, optional normalized `failureReason`, optional `providerExpiresAt`, timestamps, `version`.

`PaymentProviderEvent` must carry provider identity/dedupe, optional attempt/provider refs, raw-body hash, verification result, normalized observed fields, nullable processing result, safe metadata, receive/process timestamps.

`PaymentReconciliation` must carry attempt/provider, trigger, observed normalized fields, result, safe note, request ID and timestamp.

- [ ] **Step 4: Add database-only protections in migration**

Create partial unique index for one live attempt per order where status is `initiated|pending`; CHECK constraints for supported states/currency/positive fields; append-only update/delete triggers for provider-event and reconciliation rows; immutable-column trigger for attempt order/provider/method/currency/amount/merchantReference; reservation uniqueness becomes `(claimType, claimId, claimLineId, lotId, generation)` with `generation > 0`.

- [ ] **Step 5: Update fixture reset ordering**

Delete/truncate payment child tables before Order and add no fabricated historical attempts.

- [ ] **Step 6: Run migration + schema tests + full API regression**

Expected: empty DB applies migrations `001/002/003/004`; schema tests PASS; existing API suite PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add durable payment authority schema`.

## Task 4: Inventory Paid-Order Coverage and Reservation Reacquisition

**Files:**
- Modify: `apps/api/src/inventory/allocation.types.ts`
- Modify: `apps/api/src/inventory/allocation.service.ts`
- Test: `apps/api/test/payment-coverage.spec.ts`
- Extend: `apps/api/test/allocation.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface EnsureClaimCoverageInput {
  claimType: "order";
  claimId: string;
  locationId: string;
  expiresAt: Date;
  actorId: string;
  requestId: string;
  lines: AllocationLineInput[];
}
export interface EnsureClaimCoverageResult {
  generation: number;
  reused: boolean;
  reservationIds: string[];
}
```

- Produces `AllocationService.ensureClaimCoverage(tx, input)`.

- [ ] **Step 1: Write failing coverage tests**

Pin: fully covered generation 1 extends expiry; existing later expiry is never shortened; expired generation 1 can reacquire the same lot as generation 2; released generation can reacquire; partial active generation refuses rather than silently mixing generations; no-stock reacquisition leaves no partial generation; two orders competing for one final unit produce one coverage success.

- [ ] **Step 2: Run RED gate**

Expected: FAIL because generation-aware coverage command does not exist.

- [ ] **Step 3: Refactor FEFO allocation internals without changing `create()` behavior**

Extract only the private locking/preflight/allocation pieces needed by both `create` and coverage; keep external `create` contract unchanged and generation 1 for ordinary checkout.

- [ ] **Step 4: Implement `ensureClaimCoverage`**

Under caller transaction: lock claim history; mark this claim's already-expired active rows expired; detect one full active generation; extend using `max(current expiry, requested expiry)`; otherwise require zero active partial rows, choose `max(generation)+1`, then run normal FEFO preflight/allocation atomically. Write Inventory-owned audit/outbox for extension/reacquisition.

- [ ] **Step 5: Run focused coverage + allocation regression**

Expected: all PASS including existing final-unit concurrency tests.

- [ ] **Step 6: Commit**

Commit message: `feat: support paid order reservation coverage`.

## Task 5: Provider Port, Registry, Capability Policy and Readiness

**Files:**
- Create: `apps/api/src/payments/payment-provider.ts`
- Create: `apps/api/src/payments/payment-provider.registry.ts`
- Create: `apps/api/src/payments/payment-policy.service.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Create: `apps/api/test/fake-payment-provider.ts`
- Test: `apps/api/test/payment-provider.spec.ts`
- Modify: `apps/api/src/orders/checkout-command.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify health readiness wiring as needed.

**Interfaces:**

```ts
export type PaymentTrustMode = "verified_event" | "lookup_required";
export interface PaymentProviderCapabilities {
  methods: ElectronicPaymentMethod[];
  trustMode: PaymentTrustMode;
  safeInitiationRetry: boolean;
}
export interface PaymentProviderObservation {
  providerId: string;
  merchantReference: string;
  providerReference?: string;
  state: "pending" | "succeeded" | "failed" | "expired" | "unknown";
  amountMinor?: number;
  currency?: "GHS";
  providerEventId?: string;
  failureCode?: string;
  customerSafeMessage?: string;
  providerTimestamp?: Date;
}
export interface PaymentProviderAdapter {
  readonly id: string;
  capabilities(): PaymentProviderCapabilities;
  initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult>;
  verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification>;
  lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation>;
}
```

- [ ] **Step 1: Write failing provider-policy tests**

Pin: no payment config means electronic checkout closed but cash remains bootable; configured provider missing from registry makes readiness unavailable and electronic checkout 503; enabled method not advertised by adapter fails readiness/checkout; fake provider registration makes supported methods available; card redirect rejects HTTP or non-allowlisted host.

- [ ] **Step 2: Run RED gate**

Expected: FAIL because Payments module/registry/policy do not exist.

- [ ] **Step 3: Implement provider-normalization types and registry**

Registry must allow test/future adapters to register explicitly; production contains no built-in fake and no guessed Hubtel adapter.

- [ ] **Step 4: Implement `PaymentPolicyService`**

Provide `assertElectronicMethodAvailable(method)` and provider/action validation. It reads `ApiConfig.payments` and active adapter capabilities.

- [ ] **Step 5: Gate electronic checkout**

Before an electronic order is created, `CheckoutCommandService` calls payment policy. Cash policies remain the existing Orders rules.

- [ ] **Step 6: Wire readiness**

Absent bundle is a valid closed state. Configured but missing/incompatible adapter makes `/health/ready` unavailable; registered compatible adapter restores readiness. Keep response additive and OpenAPI-adjusted later.

- [ ] **Step 7: Run focused provider tests and checkout regression**

Expected: PASS with fake adapter injected by tests; no live provider network dependency.

- [ ] **Step 8: Commit**

Commit message: `feat: add provider neutral payment boundary`.

## Task 6: Durable Customer/Guest Payment Initiation

**Files:**
- Create: `apps/api/src/payments/payment-initiation.service.ts`
- Create: `apps/api/src/payments/payment-attempts.controller.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-initiation.spec.ts`

**Interfaces:**
- Consumes `CheckoutPrincipalService`, `PaymentProviderRegistry`, `PaymentPolicyService`.
- Produces `PaymentInitiationService.initiate(req, principal, orderId, idempotencyKey, input): Promise<PaymentInitiationResult>`.
- Endpoint: `POST /api/v1/orders/{orderId}/payment-attempts`.

- [ ] **Step 1: Write failing initiation tests**

Pin customer ownership, guest ownership, forged order access, trusted-Origin/CSRF, required replay key, same-key replay, changed-input conflict, two different keys racing one order, server-owned amount/currency/method/provider, no card fields, normal adapter call once, and timeout-after-accept recovery without a second uncontrolled charge.

- [ ] **Step 2: Run RED gate**

Expected: route/service missing.

- [ ] **Step 3: Implement Stage A durable intent**

Inside one short transaction: actor-scoped advisory lock + idempotency hash; Order row lock; ownership and electronic policy checks; refuse terminal-success/review or a second live attempt; create `PaymentAttempt(status=initiated, initiationState=created)` using a pre-generated UUID and unique `VG-PAY-<uuid>` merchant reference; audit/outbox; store replay outcome `{attemptId}`; commit.

- [ ] **Step 4: Implement Stage B outside transaction**

Call adapter `initiate` with immutable server attempt data and `AbortSignal.timeout(config.requestTimeoutMs)`. On accepted response, persist safe provider ref/action state as pending/accepted; on definitive reject mark failed/rejected; on timeout/ambiguous response keep initiated + uncertain + exception. Do not perform provider network calls while DB transaction is open.

- [ ] **Step 5: Implement replay/recovery path**

Same idempotency key returns the durable attempt. For `created|uncertain`, perform lookup first; retry initiation with the same merchant reference only when adapter capability `safeInitiationRetry=true` and lookup proves no provider record. Never create another attempt for HTTP replay.

- [ ] **Step 6: Validate customer-safe actions**

Hosted redirect must be HTTPS and hostname must be present in configured allowlist. Returned response contains only the normalized provider action.

- [ ] **Step 7: Run focused concurrency/recovery tests**

Expected: one live attempt; same-key replay stable; timeout-after-accept does not duplicate provider charge.

- [ ] **Step 8: Commit**

Commit message: `feat: initiate durable electronic payments`.

## Task 7: Provider Event Intake and Verified Outcome State Machine

**Files:**
- Create: `apps/api/src/payments/payment-outcome.service.ts`
- Create: `apps/api/src/payments/payment-provider-event.service.ts`
- Create: `apps/api/src/payments/payment-provider-events.controller.ts`
- Modify: `apps/api/src/bootstrap.ts` for provider-event raw-body handling.
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-events.spec.ts`

**Interfaces:**
- Produces `PaymentOutcomeService.apply(tx, attemptId, observation, context)` as the only verified post-checkout order-payment writer.
- Produces `PaymentProviderEventService.ingest(providerId, rawBody, headers, requestId)`.
- Endpoint: `POST /api/v1/payments/providers/{provider}/events`.

- [ ] **Step 1: Write failing event/outcome tests**

Pin invalid provider auth, unknown provider, duplicate event, redelivery after injected DB failure, `verified_event`, `lookup_required`, pending/failure/expiry, success with active holds, late success reacquisition, late success no stock -> attempt succeeded + settlement exception + order `requires_review`, success after cancellation -> review, amount/currency/reference mismatch, supplied field mismatch, terminal-state conflict, and two late-success orders racing one final unit.

- [ ] **Step 2: Run RED gate**

Expected: event route/outcome service missing.

- [ ] **Step 3: Preserve raw request bytes only for provider routes**

Install route-specific `express.raw({ type: "application/json", limit: "64kb" })` before the general JSON parser. Controller reads Buffer + headers; raw body is hashed and discarded after verification. Do not persist signatures/auth headers/raw payload.

- [ ] **Step 4: Implement event persistence/dedupe/resume**

Create or resolve the durable provider event by `(provider,eventId)` or `(provider,dedupeKey)`. Invalid verification may create safe security evidence only. A duplicate terminally processed event returns duplicate; an existing unprocessed/exception row resumes processing rather than being discarded.

- [ ] **Step 5: Implement trust-mode lookup**

For `lookup_required`, persist the event first, perform adapter lookup outside DB transaction, then pass the authoritative observation to outcome application. Never trust callback body status alone in this mode.

- [ ] **Step 6: Implement `PaymentOutcomeService` under global lock order**

Lock Order then Attempt. Validate provider/merchant reference and any supplied amount/currency. Apply pending/failure/expiry compatible transitions. For first success call Inventory `ensureClaimCoverage` inside the same transaction; active coverage extends, expired coverage reacquires. If reacquisition fails, catch only the stock conflict needed to record actual payment success + `requires_review` without fabricated reservations. Write customer-safe OrderEvent, audit and outbox atomically.

- [ ] **Step 7: Handle conflicts without rewriting history**

A failed/expired terminal attempt later observed succeeded, or succeeded later observed failed, keeps the first terminal state, sets settlement `exception`, persists conflict evidence and requires reconciliation. A cancelled/incompatible order receiving first success records succeeded money and order `requires_review`.

- [ ] **Step 8: Run focused event suite including injected transaction faults**

Expected: duplicate-safe one financial effect; secrets absent from DB/audit/outbox; event redelivery resumes after failure.

- [ ] **Step 9: Commit**

Commit message: `feat: verify and apply provider payment events`.

## Task 8: Reconciliation and Staff Payments Ledger

**Files:**
- Create: `apps/api/src/payments/payment-reconciliation.service.ts`
- Create: `apps/api/src/payments/payment-query.service.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-reconciliation.spec.ts`

**Interfaces:**
- Produces `PaymentReconciliationService.reconcile(attemptId, trigger, actorId, requestId)`.
- Produces `PaymentQueryService.list(query)` returning paginated `PaymentRow`-compatible rows.
- Endpoints: `GET /api/v1/payments`; `POST /api/v1/payments/{attemptId}/reconcile`.

- [ ] **Step 1: Write failing reconciliation/ledger tests**

Pin admin-only access, pagination/filter ownership, no customer access, lookup outside transaction, repeat reconciliation across two API instances, stale lookup observation rejection, matched state -> `reconciled`, mismatch -> `exception`, no-record behavior for uncertain initiation, and no secret/raw metadata in staff rows.

- [ ] **Step 2: Run RED gate**

Expected: routes/services missing.

- [ ] **Step 3: Implement reconciliation snapshot/lookup/apply sequence**

Read immutable attempt snapshot first; network lookup outside transaction; open short transaction; lock Order then Attempt; verify snapshot version/references still match; append reconciliation row; invoke the same outcome logic for compatible observations; stale/mismatch becomes exception rather than state regression.

- [ ] **Step 4: Implement staff ledger**

Admin-authorized only for this milestone because no finance role/grant exists yet. Support bounded `page/perPage` and filters for status, settlementState, provider, method, orderReference and date range. Return safe `PaymentRow` fields only.

- [ ] **Step 5: Run focused two-instance tests**

Expected: repeatable reconciliation and no duplicate financial effects.

- [ ] **Step 6: Commit**

Commit message: `feat: add payment reconciliation and ledger`.

## Task 9: Payment-Aware Cancellation and Customer-Safe Payment Projection

**Files:**
- Modify: `apps/api/src/payments/payment-policy.service.ts`
- Modify: `apps/api/src/orders/order-cancellation.service.ts`
- Modify: `apps/api/src/orders/order-projection.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/payment-cancellation.spec.ts`
- Extend: `apps/api/test/order-reads.spec.ts`

**Interfaces:**
- Produces `PaymentPolicyService.assertCancellationSafe(tx, orderId): Promise<void>`.
- Existing `PublicOrder.paymentAttempts` becomes durable customer-safe projection.

- [ ] **Step 1: Write failing cancellation/projection tests**

Pin: no attempt allows cancellation; only failed/expired attempts allow existing cancellation; initiated/pending refuses and keeps reservations/slot; succeeded/review/refund-sensitive state refuses; success-vs-cancellation race yields exactly one safe outcome; owner/tracking views show attempt status/amount/callback count/settlement state but no raw event, signature, reconciliation metadata or unsafe provider text.

- [ ] **Step 2: Run RED gate**

Expected: current cancellation only checks order payment status and projections contain empty paymentAttempts.

- [ ] **Step 3: Implement cancellation guard under existing Order lock**

`OrderCancellationService` locks Order first as today, then calls Payments guard. Payments locks attempts in stable ID order and rejects live/captured/review states before Orders releases reservations/slot.

- [ ] **Step 4: Populate customer-safe payment attempt projection**

Query durable attempts newest/created order as defined by contract; map normalized safe failure reason; omit provider refs by default unless implementation later has an explicit safe flag; omit operational/reconciliation metadata.

- [ ] **Step 5: Add source-authority tests**

Assert Orders cannot create/update `PaymentAttempt` or write post-checkout verified payment transitions; Payments cannot directly mutate Reservation; only `PaymentOutcomeService` in Payments performs verified post-checkout `Order.paymentStatus` writes.

- [ ] **Step 6: Run focused cancellation/read/race tests**

Expected: PASS with no stranded stock or ignored successful payment.

- [ ] **Step 7: Commit**

Commit message: `feat: guard cancellation with payment authority`.

## Task 10: Production OpenAPI, Authority Docs and Exact Route Surface

**Files:**
- Modify: `apps/api/src/http/openapi.ts`
- Modify: `apps/api/test/commerce-authority.spec.ts`
- Create: `apps/api/test/payments-authority.spec.ts`
- Modify: `docs/openapi-foundation.json`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/BACKEND_FOUNDATION.md`
- Create: `docs/PAYMENTS_AUTHORITY.md`

**Interfaces:**
- Production route set becomes existing 21 routes + four Payments Authority routes.
- `POST /orders/{orderId}/payment-outcome` remains absent.

- [ ] **Step 1: Write failing exact-surface tests**

Expected new routes:

- `/api/v1/orders/{orderId}/payment-attempts`
- `/api/v1/payments/providers/{provider}/events`
- `/api/v1/payments`
- `/api/v1/payments/{attemptId}/reconcile`

Also assert no production fake-provider route, no payment-outcome simulation, initiation owner security, provider-event adapter-auth description, staff payment auth, Idempotency-Key header and no card-secret schema fields.

- [ ] **Step 2: Run RED OpenAPI gate**

Expected: current exact 21-route assertion fails.

- [ ] **Step 3: Extend generated OpenAPI from shared schemas**

Add envelopes, path parameters, payment list query filters, security requirements and safe error envelopes. Keep provider event endpoint outside customer auth and document adapter verification instead.

- [ ] **Step 4: Update authority documentation**

Document what is implemented, that Hubtel live activation remains closed pending verified merchant contract, that Refunds/Handover/Fulfilment are still deferred, and that storefront remains demo transport.

- [ ] **Step 5: Regenerate deterministic OpenAPI and verify clean diff**

Run API build/openapi generation twice and prove the second generation changes nothing.

- [ ] **Step 6: Run authority scans**

Scan production source for forbidden browser `payment-outcome`, direct Orders/Payments Reservation writes, direct Orders PaymentAttempt writes, card/PAN/CVV fields, built-in fake provider registration and frontend transport cutover.

- [ ] **Step 7: Commit**

Commit message: `docs: checkpoint payments authority`.

## Task 11: Full Verification, Hosted CI and Merge Gate

**Files:**
- No planned product changes. Any failure discovered here returns to the owning task and gets its own fix/test commit.

**Interfaces:**
- Consumes every prior task.
- Produces merge evidence only; no new behavior.

- [ ] **Step 1: Fresh database verification**

Apply migrations `202610100001`, `002`, `003`, `004` to an empty PostgreSQL 17 database. Expected: all apply successfully.

- [ ] **Step 2: Run the complete API suite serially**

Run: `cd apps/api && npm test`

Expected: zero failures.

- [ ] **Step 3: Run root static/build gates**

Run root lint, TypeScript checks used by repository CI and `bun run build`/equivalent current build command. Expected: zero errors.

- [ ] **Step 4: Run existing business/regression gates**

Run current handoff regression, Bun unit suites, contracts check, business acceptance and public route sweep exactly as repository CI/current milestone verification defines them. Expected: all green; public route sweep remains demo transport.

- [ ] **Step 5: Run payment authority scans and secret scans**

Expected: no forbidden simulation route, no direct Reservation mutation outside Inventory, no PaymentAttempt authority outside Payments, no PAN/CVV/provider secrets, no production fake adapter, no frontend cutover.

- [ ] **Step 6: Review plan/spec line by line against implementation**

Confirm all 28 verification cases in the design map to passing tests; record any gap as a fix before PR readiness.

- [ ] **Step 7: Push exact clean feature head and open/ready implementation PR**

PR body records exact local test evidence and explicitly states live Hubtel remains disabled until merchant verification details are supplied.

- [ ] **Step 8: Require hosted GitHub workflows on exact feature SHA**

Both repository CI and API/PostgreSQL-17 workflow must complete successfully before merge.

- [ ] **Step 9: Squash merge with expected head SHA**

Do not merge a moved/unverified head.

- [ ] **Step 10: Verify post-merge workflows on exact `main` merge SHA**

Milestone is complete only after both post-merge workflows report success on that exact commit.

## Execution Notes

- Use a fresh feature worktree from the planning/spec merge commit.
- Execute tasks in order; each task starts with a RED test and ends with an independently reviewable commit.
- Database-reset test suites must run serially against a shared disposable database to avoid fixture truncation races.
- Do not start unrelated VPS services or reuse another application's port.
- Do not add live Hubtel credentials, guessed webhook secrets or merchant endpoints to source control. When merchant documentation becomes available, implementing the Hubtel adapter is a separate bounded/architectural follow-up depending on how much of the provider port it exercises.
