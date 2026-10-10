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

1. **Provider accepted but HTTP response was lost:** retry must reuse the same durable attempt and must not issue an uncontrolled second charge. Task 6 pins timeout-after-accept and replay.
2. **Stale provider lookup races a newer webhook/cancellation decision:** the later transaction must re-lock Order then Attempt and reject stale observations instead of regressing state. Tasks 7 and 8 pin this.
3. **Webhook row persisted but outcome transaction failed:** redelivery must resume the same provider-event row and apply at most one financial effect. Task 7 pins this.
4. **Provider evidence omits optional amount/currency fields:** success may be applied only when the adapter contract marks the observation authoritative and all supplied identity/amount/currency fields match; any supplied mismatch routes to exception. Task 7 pins both paths.
5. **Paid-order coverage already expires later than the requested confirmed deadline:** Inventory must never shorten a valid hold. Task 4 pins `max(existing expiry, requested expiry)`.

## File Structure Map

New production units:

- `apps/api/src/commerce-identity/commerce-identity.module.ts`
- `apps/api/src/commerce-identity/guest-checkout.service.ts`
- `apps/api/src/commerce-identity/checkout-principal.service.ts`
- `apps/api/src/payments/payment-provider.ts`
- `apps/api/src/payments/payment-provider.registry.ts`
- `apps/api/src/payments/payment-policy.service.ts`
- `apps/api/src/payments/payment-initiation.service.ts`
- `apps/api/src/payments/payment-outcome.service.ts`
- `apps/api/src/payments/payment-provider-event.service.ts`
- `apps/api/src/payments/payment-reconciliation.service.ts`
- `apps/api/src/payments/payment-query.service.ts`
- `apps/api/src/payments/payment-attempts.controller.ts`
- `apps/api/src/payments/payment-provider-events.controller.ts`
- `apps/api/src/payments/payments.controller.ts`
- `apps/api/src/payments/payments.module.ts`
- `packages/contracts/src/payments.ts`

New focused tests:

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
- Produces `ElectronicPaymentMethod`, `PaymentProviderAction`, `PaymentInitiationRequest`, `PaymentInitiationResult`, `PaymentListQuery`, `PaymentReconcileResponse` and Zod schemas.
- Produces `PaymentConfig | null` on `ApiConfig.payments` with `providerId`, `enabledMethods`, `confirmedHoldMinutes`, `requestTimeoutMs`, `reconcileAfterSeconds`, `hostedDomains`.

- [ ] **Step 1: Write failing contract/config tests**

Pin: fully absent bundle -> `payments=null`; partial bundle throws; methods are only `mobile_money|card_hosted|bank_transfer`; confirmed hold is positive integer; timeout is `100..30000` ms; reconcile delay `30..86400` seconds; hosted domains are lowercase hostnames with no scheme/path; initiation schema accepts only optional Ghana `+233` payer phone and rejects amount/currency/status/provider/card fields.

- [ ] **Step 2: Run RED gate**

Run: `cd apps/api && npm run build && node --test --test-concurrency=1 dist/test/payment-values.spec.js`

Expected: FAIL because contracts/config do not exist.

- [ ] **Step 3: Add provider-neutral contracts**

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

Add bounded `PaymentListQuery` and `{attemptId,status,settlementState}` reconciliation response. No adapter credentials appear in shared contracts.

- [ ] **Step 4: Add application payment policy configuration**

Use exactly: `PAYMENT_PROVIDER_ID`, `PAYMENT_ENABLED_METHODS`, `PAYMENT_CONFIRMED_HOLD_MINUTES`, `PAYMENT_PROVIDER_TIMEOUT_MS`, `PAYMENT_RECONCILE_AFTER_SECONDS`, `PAYMENT_HOSTED_DOMAINS`.

All absent -> closed. Any partial bundle -> startup error. Do not add Hubtel secret names.

- [ ] **Step 5: Run GREEN gate and full API regression**

Expected: focused PASS and `npm test` remains green.

- [ ] **Step 6: Commit**

`feat: define payment contracts and policy config`

## Task 2: Extract Shared Commerce Identity Boundary

**Files:**
- Create: `apps/api/src/commerce-identity/commerce-identity.module.ts`
- Move: `apps/api/src/orders/guest-checkout.service.ts` -> `apps/api/src/commerce-identity/guest-checkout.service.ts`
- Move: `apps/api/src/orders/checkout-principal.service.ts` -> `apps/api/src/commerce-identity/checkout-principal.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Modify affected imports.
- Test: existing `guest-checkout.spec.ts`, `checkout-command.spec.ts`, `order-reads.spec.ts`.

**Interfaces:**
- Preserve `GuestCheckoutService`, `CheckoutPrincipalService` and `CheckoutPrincipal` signatures.
- `CommerceIdentityModule` exports both services; Payments can import it without importing Orders.

- [ ] **Step 1: Add failing source/module-boundary assertion**

Assert commerce identity does not live under Orders and Payments need not import `OrdersModule` for principal resolution.

- [ ] **Step 2: Run RED gate**

Expected: FAIL on current file ownership.

- [ ] **Step 3: Move services with no behavior changes**

Use `git mv`; `CommerceIdentityModule` imports `IdentityModule` and provides/exports the moved services.

- [ ] **Step 4: Rewire Orders imports**

`OrdersModule` imports `CommerceIdentityModule`; update controller/test imports.

- [ ] **Step 5: Run unchanged guest/checkout/order suites**

Expected: PASS.

- [ ] **Step 6: Commit**

`refactor: share commerce identity boundary`

## Task 3: Durable Payment Schema and Reservation Generations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610100004_payments_authority/migration.sql`
- Modify: `apps/api/test/commerce-fixtures.ts`
- Test: `apps/api/test/payments-schema.spec.ts`

**Interfaces:**
- Adds `PaymentAttempt`, `PaymentProviderEvent`, `PaymentReconciliation`.
- Adds `Reservation.generation Int @default(1)`.
- Adds `Order.paymentAttempts` relation.

- [ ] **Step 1: Write failing database-invariant tests**

Pin positive amount/callback/generation, allowed method/status/initiation/settlement/verification/trigger/result values, unique merchant reference, provider+providerRef uniqueness, event dedupe, one live attempt per order, immutable attempt identity fields, append-only provider/reconciliation history, and same claim/line/lot reuse only across different generations.

Allowed values include:

- attempt status: `initiated|pending|succeeded|failed|expired`;
- initiation: `created|accepted|uncertain|rejected`;
- settlement: `unsettled|settled|reconciled|exception`;
- event verification: `verified|lookup_required|invalid`;
- event processing: nullable until processed, then `duplicate|applied|pending|mismatch|exception|rejected`;
- reconciliation trigger: `webhook|customer_retry|staff|worker`;
- reconciliation result: `matched|state_changed|no_record|mismatch|exception`.

- [ ] **Step 2: Run RED gate on a fresh disposable PostgreSQL database**

Expected: FAIL because migration/models do not exist.

- [ ] **Step 3: Add Prisma models**

`PaymentAttempt`: id/order/provider/method/currency/amount/merchantReference/providerRef/status/initiationState/settlementState/callbackCount/failureCode/failureReason/providerExpiresAt/createdAt/updatedAt/resolvedAt/version plus event/reconciliation relations.

`PaymentProviderEvent`: provider/eventId-or-dedupe/attempt/providerRef/rawBodyHash/verification/observed fields/nullable processingResult/safeMetadata/receivedAt/processedAt.

`PaymentReconciliation`: attempt/provider/trigger/observed fields/result/safeNote/requestId/createdAt.

- [ ] **Step 4: Add SQL protections**

Create one-live-attempt partial unique index for `initiated|pending`; CHECK constraints; append-only update/delete triggers for provider events/reconciliations; immutable attempt trigger for order/provider/method/currency/amount/merchantReference; reservation uniqueness becomes `(claimType,claimId,claimLineId,lotId,generation)` with generation > 0.

- [ ] **Step 5: Update fixture reset ordering**

Payment children truncate before Order; do not invent historical attempts.

- [ ] **Step 6: Run migrations/schema tests/full API**

Expected: migrations 001/002/003/004 apply to empty DB; focused and full API tests PASS.

- [ ] **Step 7: Commit**

`feat: add durable payment authority schema`

## Task 4: Inventory Paid-Order Coverage and Reservation Reacquisition

**Files:**
- Modify: `apps/api/src/inventory/allocation.types.ts`
- Modify: `apps/api/src/inventory/allocation.service.ts`
- Test: `apps/api/test/payment-coverage.spec.ts`
- Extend: `apps/api/test/allocation.spec.ts`

**Interfaces:**

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

Produces `AllocationService.ensureClaimCoverage(tx,input)`.

- [ ] **Step 1: Write failing coverage tests**

Pin full active generation extension, later existing expiry never shortened, expired/released generation 1 -> same-lot generation 2, partial active generation -> `RESERVATION_LOST`, no-stock reacquisition -> `OUT_OF_STOCK` with no new partial generation, idempotent repeated ensure, and two orders racing final unit -> at most one reacquires.

- [ ] **Step 2: Run RED gate**

Expected: coverage command absent.

- [ ] **Step 3: Refactor private FEFO allocation internals only as needed**

Keep external `create()` semantics unchanged and generation 1 for checkout.

- [ ] **Step 4: Implement `ensureClaimCoverage`**

Under caller transaction: lock claim history; expire this claim's stale active rows; detect complete active generation; extend each expiry to `max(existing,requested)`; otherwise require no active partial generation, choose `max(generation)+1`, and run current FEFO/safety-stock preflight/allocation all-or-nothing. Inventory writes `inventory.coverage_extended` or `inventory.coverage_reacquired` audit/outbox events.

- [ ] **Step 5: Run focused + existing allocation regression**

Expected: PASS including final-unit races.

- [ ] **Step 6: Commit**

`feat: support paid order reservation coverage`

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
- Modify health readiness wiring.

**Interfaces:**

```ts
export type PaymentTrustMode = "verified_event" | "lookup_required";
export interface PaymentProviderCapabilities {
  methods: ElectronicPaymentMethod[];
  trustMode: PaymentTrustMode;
  safeInitiationRetry: boolean;
}
export interface PaymentProviderInitiationInput {
  attemptId: string;
  merchantReference: string;
  orderReference: string;
  method: ElectronicPaymentMethod;
  amountMinor: number;
  currency: "GHS";
  payerPhone?: string;
  signal: AbortSignal;
}
export type PaymentProviderInitiationResult =
  | { kind: "accepted"; providerReference?: string; action: PaymentProviderAction; expiresAt?: Date }
  | { kind: "rejected"; failureCode?: string; customerSafeMessage?: string };
export interface PaymentProviderLookupInput {
  merchantReference: string;
  providerReference?: string;
  signal: AbortSignal;
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
export interface PaymentProviderEventInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}
export type PaymentProviderEventVerification =
  | { verification: "invalid"; providerEventId?: string }
  | { verification: "lookup_required"; providerEventId?: string; merchantReference?: string; providerReference?: string }
  | { verification: "verified"; providerEventId?: string; observation: PaymentProviderObservation };
export interface PaymentProviderAdapter {
  readonly id: string;
  capabilities(): PaymentProviderCapabilities;
  initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult>;
  verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification>;
  lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation>;
}
```

- [ ] **Step 1: Write failing provider-policy tests**

No config -> electronic checkout closed while cash remains bootable; configured adapter missing -> readiness unavailable + electronic checkout 503; enabled method not in adapter capabilities -> unavailable; injected fake restores readiness; HTTP/non-allowlisted card redirect is rejected.

- [ ] **Step 2: Run RED gate**

Expected: provider module absent.

- [ ] **Step 3: Implement registry and normalized provider types**

`PaymentProviderRegistry.register(adapter)` is explicit; no built-in fake and no guessed Hubtel adapter in production.

- [ ] **Step 4: Implement `PaymentPolicyService.assertElectronicMethodAvailable(method)` and safe action validation**

Use config + active adapter capabilities + configured hosted-domain allowlist.

- [ ] **Step 5: Gate electronic checkout before order creation**

Cash rules remain Orders-owned; electronic selection fails closed if provider/method is unavailable.

- [ ] **Step 6: Wire readiness**

Absent payment bundle is a valid closed state. Configured incompatible/missing adapter makes readiness unavailable. Compatible registered adapter restores readiness.

- [ ] **Step 7: Run focused provider + checkout regression**

Expected: PASS with injected fake; no external network.

- [ ] **Step 8: Commit**

`feat: add provider neutral payment boundary`

## Task 6: Durable Customer/Guest Payment Initiation

**Files:**
- Create: `apps/api/src/payments/payment-initiation.service.ts`
- Create: `apps/api/src/payments/payment-attempts.controller.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-initiation.spec.ts`

**Interfaces:**
- Consumes `CheckoutPrincipalService`, registry and policy.
- Produces `PaymentInitiationService.initiate(req,principal,orderId,idempotencyKey,input): Promise<PaymentInitiationResult>`.
- Endpoint: `POST /api/v1/orders/{orderId}/payment-attempts`.

- [ ] **Step 1: Write failing initiation tests**

Pin customer/guest ownership, forged access, trusted-Origin/CSRF, replay key, same-key replay, changed-input conflict, two different keys racing one order, no client amount/currency/method/provider/card authority, provider called once normally, failed/expired retry creates one new live attempt and only then moves Order back to `pending`, and timeout-after-accept recovery without a second charge.

- [ ] **Step 2: Run RED gate**

Expected: route/service absent.

- [ ] **Step 3: Implement Stage A durable intent**

One short transaction: actor-scoped advisory lock + request hash; replay check; Order lock; ownership/electronic capability/state checks; refuse second live/succeeded/review attempt; create `PaymentAttempt(initiated,created)` using server UUID and `VG-PAY-<uuid>` merchant reference; if prior attempt was failed/expired set Order payment status to pending only after the new attempt row exists; write `payment.attempt_created` audit/outbox; persist idempotency outcome `{attemptId}`; commit.

- [ ] **Step 4: Implement Stage B outside DB transaction**

Call adapter with immutable attempt data and `AbortSignal.timeout`. Accepted -> pending/accepted/provider ref and safe action; definitive reject -> failed/rejected; timeout/ambiguous -> initiated/uncertain/settlement exception. Emit `payment.initiation_pending`, `payment.initiation_failed`, or `payment.initiation_uncertain` audit/outbox as applicable.

- [ ] **Step 5: Implement replay/recovery**

Same key returns same attempt. `created|uncertain` performs lookup first; retry `initiate` with the same merchant reference only if `safeInitiationRetry=true` and lookup proves no provider record. Never create another attempt for replay.

- [ ] **Step 6: Validate customer-safe action**

Redirect is HTTPS + allowlisted hostname; response contains normalized action only.

- [ ] **Step 7: Run focused concurrency/recovery suite**

Expected: one live attempt and no duplicate provider charge.

- [ ] **Step 8: Commit**

`feat: initiate durable electronic payments`

## Task 7: Provider Event Intake and Verified Outcome State Machine

**Files:**
- Create: `apps/api/src/payments/payment-outcome.service.ts`
- Create: `apps/api/src/payments/payment-provider-event.service.ts`
- Create: `apps/api/src/payments/payment-provider-events.controller.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-events.spec.ts`

**Interfaces:**
- Produces `PaymentOutcomeService.apply(tx,attemptId,observation,context)` as the only verified post-checkout payment-state writer.
- Produces `PaymentProviderEventService.ingest(providerId,rawBody,headers,requestId)`.
- Endpoint: `POST /api/v1/payments/providers/{provider}/events`.

- [ ] **Step 1: Write failing event/outcome tests**

Pin invalid provider auth, unknown provider, callback count, duplicate event, redelivery after injected DB failure, verified_event, lookup_required, pending/failure/expiry, success with active holds, late success reacquisition, late success no stock -> attempt succeeded + exception + order requires_review, success after cancellation -> review, supplied amount/currency/reference mismatch, authoritative observation with omitted optional amount/currency, conflicting terminal outcomes, and two late-success orders racing final unit.

- [ ] **Step 2: Run RED gate**

Expected: event route/outcome service absent.

- [ ] **Step 3: Preserve raw bytes only on provider-event routes**

Route-specific `express.raw({type:"application/json",limit:"64kb"})` before general JSON parser. Hash/discard body after adapter verification. Never persist signature/auth headers/raw body.

- [ ] **Step 4: Implement event persistence/dedupe/resume**

Resolve configured provider; verify event; persist safe event using `(provider,eventId)` or deterministic `(provider,dedupeKey)`; increment attempt callback evidence only after resolving trusted attempt identity; terminal processed duplicate -> `duplicate:true` and `payment.provider_event_duplicate`; unprocessed/exception redelivery resumes same row.

- [ ] **Step 5: Implement lookup-required flow outside transaction**

Persist event first, perform authoritative lookup with timeout, then pass observation to outcome service. Callback body status alone never marks paid.

- [ ] **Step 6: Implement `PaymentOutcomeService` under global lock order**

Lock Order then Attempt. Validate provider/merchant reference and every supplied amount/currency. Pending -> pending. Failure/expiry -> terminal attempt and Order failed/expired only if no success/review exists. First success calls Inventory `ensureClaimCoverage` in same transaction. Active coverage extends; stale coverage reacquires. Catch only business coverage failures (`OUT_OF_STOCK` or `RESERVATION_LOST`) that are guaranteed mutation-free and then record real money success + settlement exception + Order `requires_review`. Other errors roll back. Emit `payment.succeeded|failed|expired|requires_review` plus customer-safe OrderEvent/audit/outbox.

- [ ] **Step 7: Handle incompatible/conflicting terminal observations**

Cancelled/incompatible order + first success -> attempt succeeded, Order requires_review. Failed/expired then later success, or succeeded then later failure, keeps first terminal effect, sets settlement exception, persists evidence and emits `payment.reconciliation_exception`; no silent rewrite.

- [ ] **Step 8: Run focused event/fault suite**

Expected: one financial effect, resumable redelivery, no secret leakage, no fabricated stock.

- [ ] **Step 9: Commit**

`feat: verify and apply provider payment events`

## Task 8: Reconciliation and Staff Payments Ledger

**Files:**
- Create: `apps/api/src/payments/payment-reconciliation.service.ts`
- Create: `apps/api/src/payments/payment-query.service.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/test/payment-reconciliation.spec.ts`

**Interfaces:**
- `PaymentReconciliationService.reconcile(attemptId,trigger,actorId,requestId)`.
- `PaymentQueryService.list(query)` returns bounded paginated `PaymentRow`-compatible rows.
- Endpoints: `GET /api/v1/payments`; `POST /api/v1/payments/{attemptId}/reconcile`.

- [ ] **Step 1: Write failing reconciliation/ledger tests**

Pin admin-only access, pagination/filters, no customer access, lookup outside transaction, repeat reconciliation across two API instances, stale lookup rejection, matched -> reconciled, mismatch -> exception, no-record uncertain initiation, and no raw metadata/secrets in staff rows.

- [ ] **Step 2: Run RED gate**

Expected: services/routes absent.

- [ ] **Step 3: Implement snapshot -> lookup -> locked apply**

Read immutable attempt snapshot; lookup outside transaction; start short transaction; lock Order then Attempt; verify version/reference snapshot still applicable; append `PaymentReconciliation`; apply compatible observation via same outcome service; stale/mismatch -> exception. Emit `payment.reconciled` or `payment.reconciliation_exception` audit/outbox.

- [ ] **Step 4: Implement staff ledger**

Admin-only for this milestone because Prisma has no finance role/grant yet. Support bounded `page/perPage` and filters for status, settlementState, provider, method, orderReference, date range. Return safe `PaymentRow` only.

- [ ] **Step 5: Run focused two-instance tests**

Expected: repeatable, no duplicate financial effect.

- [ ] **Step 6: Commit**

`feat: add payment reconciliation and ledger`

## Task 9: Payment-Aware Cancellation and Customer-Safe Projection

**Files:**
- Modify: `apps/api/src/payments/payment-policy.service.ts`
- Modify: `apps/api/src/orders/order-cancellation.service.ts`
- Modify: `apps/api/src/orders/order-projection.service.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/test/payment-cancellation.spec.ts`
- Extend: `apps/api/test/order-reads.spec.ts`

**Interfaces:**
- Produces `PaymentPolicyService.assertCancellationSafe(tx,orderId): Promise<void>`.
- Existing `PublicOrder.paymentAttempts` becomes a durable safe projection.

- [ ] **Step 1: Write failing cancellation/projection tests**

No attempt or only failed/expired -> cancellation allowed; initiated/pending -> reconciliation-required rule violation and no release; succeeded/review/refund-sensitive -> refund workflow required; success-vs-cancel race -> one safe serialised result; owner/tracking views expose safe attempt status/amount/callback/settlement only, with no raw provider/reconciliation material.

- [ ] **Step 2: Run RED gate**

Expected: cancellation guard/projection incomplete.

- [ ] **Step 3: Add Payments cancellation guard under existing Order lock**

Payments locks attempts in stable ID order and checks live/captured/review states before Orders releases reservations/slot.

- [ ] **Step 4: Populate customer-safe payment attempts**

Map durable attempts; normalized failure reason only; omit providerRef unless a later adapter supplies an explicitly customer-safe support reference; no reconciliation metadata or raw notes.

- [ ] **Step 5: Add source-authority assertions**

Orders cannot create/update PaymentAttempt or perform verified post-checkout payment transitions. Payments cannot mutate Reservation. Only `PaymentOutcomeService` is allowed to write verified post-checkout `Order.paymentStatus` states.

- [ ] **Step 6: Run focused race/read tests**

Expected: PASS with no stranded stock or ignored money.

- [ ] **Step 7: Commit**

`feat: guard cancellation with payment authority`

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
- Production API becomes existing 21 routes + four Payments routes.
- Browser `payment-outcome` remains absent.

- [ ] **Step 1: Write failing exact-surface tests**

New routes are `/api/v1/orders/{orderId}/payment-attempts`, `/api/v1/payments/providers/{provider}/events`, `/api/v1/payments`, `/api/v1/payments/{attemptId}/reconcile`.

Assert no fake route, no payment-outcome simulation, correct initiation owner security, provider event adapter-auth description, admin payment auth, Idempotency-Key header and no PAN/CVV/provider-secret schema fields.

- [ ] **Step 2: Run RED OpenAPI gate**

Expected: exact 21-route test fails.

- [ ] **Step 3: Extend generated OpenAPI using shared schemas**

Add envelopes/path/query/header definitions and safe errors. Provider-event route has no customer auth and explicitly documents adapter verification.

- [ ] **Step 4: Update authority docs**

State implemented core, live Hubtel still closed pending verified merchant contract, Refunds/Handover/Fulfilment deferred, public frontend still demo transport.

- [ ] **Step 5: Regenerate OpenAPI twice**

Second generation must produce no diff.

- [ ] **Step 6: Run authority scans**

No browser payment-outcome, direct Orders/Payments Reservation writes, direct Orders PaymentAttempt writes, card secret fields, production fake adapter, guessed Hubtel secrets/endpoints or frontend cutover.

- [ ] **Step 7: Commit**

`docs: checkpoint payments authority`

## Task 11: Full Verification, Hosted CI and Merge Gate

**Files:**
- No planned product changes. Any failure returns to its owning task and gets a focused fix/test commit.

**Interfaces:**
- Produces verification evidence only.

- [ ] **Step 1: Fresh PostgreSQL 17 migration verification**

Apply migrations 001/002/003/004 to an empty database. Expected: all apply.

- [ ] **Step 2: Complete API suite**

Run: `cd apps/api && npm test`. Expected: zero failures.

- [ ] **Step 3: Root static/build gates**

Run repository lint/type/build commands used by current CI. Expected: zero errors.

- [ ] **Step 4: Existing business/regression gates**

Run handoff regression, Bun suites, contracts check, business acceptance and public route sweep exactly as current repository verification defines them. Expected: all green; public route sweep still uses demo transport.

- [ ] **Step 5: Payment authority/secret scans**

Expected: no forbidden simulation route, direct Reservation mutation outside Inventory, PaymentAttempt authority outside Payments, PAN/CVV/provider secrets, production fake adapter, guessed Hubtel integration or frontend cutover.

- [ ] **Step 6: Spec coverage audit**

Map all 28 approved-spec verification cases to passing tests. Any uncovered case blocks PR readiness.

- [ ] **Step 7: Push exact clean feature head and open/ready implementation PR**

Record exact local evidence and explicitly state live Hubtel remains disabled pending merchant verification details.

- [ ] **Step 8: Require hosted workflows on exact feature SHA**

Repository CI and API/PostgreSQL-17 workflow must both succeed.

- [ ] **Step 9: Squash merge with expected head SHA**

Do not merge a moved/unverified head.

- [ ] **Step 10: Verify post-merge workflows on exact main SHA**

Milestone completes only when both post-merge workflows succeed on that exact commit.

## Execution Notes

- Create a fresh feature worktree from the merged planning/spec commit.
- Execute tasks in order; every implementation task starts RED and ends with its own commit.
- Run database-reset suites serially against a shared disposable DB to avoid fixture truncation races.
- Do not disturb unrelated VPS services or reuse another app's listening port.
- Do not add live Hubtel credentials, guessed webhook secrets or merchant endpoints to source control. Implementing the live Hubtel adapter begins only after the exact merchant contract is supplied and verified.
