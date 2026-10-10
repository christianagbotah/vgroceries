# Variety Groceries Refunds Authority design

**Date:** 10 October 2026  
**Status:** Conversational design approved; written specification pending user review.  
**Base:** `main` at `92c623ddba9268d099d170d59a0f1abbc4275ebb` (`Implement payments authority (#8)`).

## 1. Intent

Variety Groceries needs a production financial authority for money that must be returned after a successful electronic payment. The immediate production problem is paid cancellation and paid orders routed to review. Physical product returns, inspection, restocking, quarantine, disposal and POS/cash refunds remain later authorities.

The Refunds Authority must make four guarantees:

1. a refund request or approval is never confused with money actually returned;
2. no concurrent request, retry or provider ambiguity can return the same captured money twice;
3. every refund is tied to the successful payment capture that funds it, including accidental multiple captures for one order;
4. a paid order can be cancelled before handover without releasing stock while silently losing the customer's refund obligation.

A live merchant provider must not be enabled for public electronic charging unless Variety can also safely return money through a verified refund adapter for that provider and method.

## 2. Existing production foundation

This specification extends the merged production authorities rather than replacing them:

- NestJS API under `/api/v1`;
- PostgreSQL/Prisma with forward migrations;
- durable web/native identity and administrator authorization;
- `Idempotency(actorId, operation, key, requestHash, outcome)`;
- append-only `AuditEvent` and durable `OutboxEvent`;
- Inventory-owned reservation mutation through `AllocationService`;
- Orders-owned order/fulfilment lifecycle and customer cancellation;
- Payments-owned `PaymentAttempt`, provider evidence, reconciliation and verified financial outcomes;
- `Order.paymentStatus` as the customer/staff financial projection;
- provider network I/O performed outside database transactions;
- global order-first financial locking used by Payments and cancellation;
- generated production OpenAPI currently containing 25 implemented paths.

The Payments Authority already records real success even when stock is unavailable, a payment succeeds after cancellation, or a stale attempt succeeds. Those cases remain explicit `requires_review` states until Refunds supplies the return-of-funds path.

## 3. Scope

This milestone implements:

1. durable refund obligations against successful `PaymentAttempt` rows;
2. per-capture refundable-balance enforcement;
3. approval-required electronic refunds;
4. provider-neutral refund execution and status lookup;
5. safe retry/recovery using one stable merchant refund reference;
6. refund reconciliation history;
7. customer paid cancellation that atomically creates refund obligations before releasing order resources;
8. administrator `cancel_refund` resolution for paid/review orders and cancelled orders with a later successful capture;
9. administrator `refund_excess_capture` correction for verified duplicate/over-capture without cancelling fulfilment;
10. administrator refund ledger and refund actions;
11. customer-safe refund projections on order/status/tracking responses;
12. audit/outbox coverage for refund state changes;
13. production OpenAPI for the implemented Refunds surface;
14. readiness rules that prevent public electronic charging without compatible refund capability.

## 4. Explicitly outside this milestone

The following remain closed:

- physical return intake and return lines;
- return approval, receiving and inspection;
- saleable restock, quarantine, damaged/unsaleable disposition or disposal;
- refund calculation from returned quantities;
- discretionary goodwill credits;
- generic manual/cash refund recording;
- POS and cashier refund authority;
- physical stock handover/depletion;
- picking, packing, dispatch, riders and COD;
- automatic outbox workers/pollers;
- refund webhooks/provider push events;
- live Hubtel activation;
- public storefront production-backend cutover;
- expansion from the current production `admin` role into the broader `finance_reviewer` permission model.

The broader portable contract may retain `manual_recording` and Return-related shapes for prototype compatibility, but production Refunds routes in this milestone do not accept them.

## 5. Authority boundaries

### 5.1 Refunds owns returned-money obligations

`RefundsModule` is the only production writer of `Refund`, `RefundExecution` and `RefundReconciliation` rows. Orders and controllers must not create or update those tables directly.

Refunds owns:

- how much of a specific successful capture is already committed to refunds;
- refund approval state;
- outbound refund execution state;
- refund retry/recovery;
- refund reconciliation history;
- refund ledger projections.

### 5.2 Payments remains capture truth

`PaymentAttempt.status = succeeded` remains the authoritative statement that money was captured. Refunds never rewrites a successful `PaymentAttempt` to failed, refunded or any other invented state.

Payments exports transaction-aware capture helpers that Refunds can use to lock/read payment attempts in stable order. Refunds does not directly mutate `PaymentAttempt` rows.

Payments also owns the financial provider adapter boundary. The existing charge adapter remains separate from the refund adapter: no guessed refund methods are bolted onto `PaymentProviderAdapter`.

### 5.3 Orders remains cancellation/fulfilment truth

Orders owns `Order.fulfilmentStatus`, cancellation timestamps/reasons, order events, reservation release and slot release. Paid cancellation calls Refunds synchronously inside the same PostgreSQL transaction before Orders marks the cancellation complete and releases resources.

Orders must not directly insert refund rows.

### 5.4 Inventory remains stock truth

Refunds never creates, releases, consumes or restores inventory reservations. Paid cancellation continues to release unconsumed order reservations only through `AllocationService` after refund obligations have been created successfully in the same transaction.

### 5.5 Dependency direction

The intended module dependency is:

`Orders -> Refunds -> Payments -> Inventory`

Payments must not import Refunds. This avoids a circular dependency when Orders coordinates cancellation and Refunds consults captured-money truth.

Provider interfaces/registries for both incoming payments and outgoing refunds live at the financial-provider boundary exported by Payments. Refund ledger/workflow remains owned by Refunds.

## 6. Financial model

### 6.1 Refund capacity is per successful capture

A production refund is always linked to exactly one successful `PaymentAttempt`.

For a successful attempt `A`:

`refundable(A) = A.amountMinor - sum(all durable Refund.amountMinor linked to A)`

Every durable Refund row consumes refund capacity regardless of whether its current status is `awaiting_approval`, `approved`, `processing`, `failed`, `requires_review` or `succeeded`. A failed/uncertain refund is still an obligation that must be retried/reconciled, not abandoned and replaced by another refund row.

Therefore the service must never create refunds whose committed sum exceeds the capture amount.

### 6.2 Do not cap cancellation refunds only at Order.totalMinor

The order total is not a safe cap when more than one `PaymentAttempt` has actually succeeded. A rare late/stale provider success can create two real captures for one order.

A full cancellation must create refund obligations for the full remaining refundable balance of **every successful capture** on that order. If two ₵100 captures succeeded, cancellation can legitimately create ₵200 of refund obligations even though the order total is ₵100.

This prevents an accidental duplicate charge from being stranded by an order-level-only cap.

### 6.3 Future Return integration

Future Returns Authority will calculate an approved business refund amount from return lines/disposition and ask Refunds to allocate that approved amount across refundable successful captures. Returns will not implement a second money-transfer engine.

This milestone does not expose that Return integration as a production route.

### 6.4 Currency and arithmetic

Refund money is integer GHS minor units. `amountMinor` is a positive integer; `currency` is exactly `GHS`. No floating-point money arithmetic is allowed.

## 7. Refund lifecycle

Production `Refund.status` is one of:

- `awaiting_approval` — durable obligation created, not yet approved for provider execution;
- `approved` — administrator approved; no provider transfer has started;
- `processing` — provider execution has started or provider reports pending;
- `succeeded` — provider evidence confirms the refund amount/currency was returned;
- `failed` — provider authoritatively rejected/failed the same refund execution and a safe retry may be possible;
- `requires_review` — outcome is ambiguous, mismatched, stale or otherwise unsafe to infer.

There is no production `rejected` state for these obligations. Refund rows in this milestone represent money the business already owes because cancellation/review was accepted. A finance reviewer may control execution, but cannot erase the obligation.

`RefundExecution.status` is one of:

- `created`;
- `pending`;
- `succeeded`;
- `failed`;
- `uncertain`.

`RefundExecution.reconciliationState` is one of:

- `unreconciled`;
- `reconciled`;
- `exception`.

Retry continues the same `Refund` and same unique `RefundExecution`; it never creates a replacement execution with a new financial identity.

## 8. Persistence model

### 8.1 Refund

`Refund` fields:

- opaque UUID `id`;
- `orderId` FK to `Order`;
- `paymentAttemptId` FK to `PaymentAttempt`;
- `provider` snapshot copied from the successful payment attempt;
- `method` snapshot, restricted to production electronic methods;
- `currency = GHS`;
- positive `amountMinor`;
- `sourceType`: `customer_cancellation | payment_review_cancellation | overcharge_correction | return`;
- nullable `returnId` reserved for future Returns Authority; no FK is introduced until Returns owns its production table;
- normalized required `reason`;
- `status`;
- `requestedBy` actor id/string;
- nullable `approvedBy`, `approvedAt`;
- nullable customer-safe `failureReason`;
- `createdAt`, `updatedAt`, nullable `resolvedAt`;
- integer optimistic `version`.

Constraints:

- amount must be positive;
- currency must be `GHS`;
- provider/method/source/status values must be valid;
- `sourceType = return` requires `returnId`; other source types require `returnId IS NULL`;
- order/payment-attempt relationship is validated transactionally: the attempt must belong to the order and be `succeeded`;
- financial identity fields (`orderId`, `paymentAttemptId`, provider, method, currency, amount, source and return id) are immutable after insert;
- Refund rows cannot be deleted.

### 8.2 RefundExecution

Exactly one execution row may exist per Refund (`refundId UNIQUE`). It contains:

- UUID `id`;
- unique `refundId` FK;
- provider snapshot;
- method snapshot;
- currency/amount snapshots;
- globally unique merchant refund reference generated by the server;
- original payment merchant reference snapshot;
- nullable original payment provider reference snapshot;
- nullable provider refund reference;
- execution `status`;
- reconciliation state;
- nonnegative `attemptCount`;
- nullable provider failure code and safe failure reason;
- timestamps and optimistic `version`.

Unique provider refund references are enforced for non-null references within one provider.

Financial identity and merchant reference are immutable. The row is not deleted or replaced on retry.

### 8.3 RefundReconciliation

Every authoritative lookup/recovery produces an append-only `RefundReconciliation` row containing:

- execution/refund ids;
- provider;
- trigger: `execute_recovery | retry | manual_reconcile`;
- observed state;
- optional provider refund reference;
- optional observed amount/currency;
- result: `matched | pending | failed | no_record | exception`;
- safe note/reason only;
- request id;
- timestamp.

Rows cannot be updated or deleted.

Raw provider responses, authentication headers, signatures, credentials and secret material are never persisted.

## 9. Financial provider refund boundary

A separate `RefundProviderAdapter` is exported from the financial-provider boundary. It is not merged into `PaymentProviderAdapter`.

Required capability shape:

- adapter id equal to the original payment provider id;
- supported electronic methods;
- refund lookup support;
- explicit `safeRetryAfterDefinitiveFailure` capability.

Provider execution input contains only server-derived values:

- refund/execution id;
- merchant refund reference;
- original payment merchant reference;
- optional original payment provider reference;
- order reference;
- method;
- amount minor;
- `GHS` currency;
- abort signal.

`initiateRefund` returns either:

- accepted/pending with an optional normalized provider refund reference;
- accepted/succeeded with normalized provider refund reference plus authoritative `amountMinor` and `currency`; or
- rejected with safe failure code/message.

An immediate `succeeded` result is applied only when its amount/currency match the immutable Refund identity. If a provider cannot return that money identity on initiation, the adapter must normalize the result as pending and require lookup before success is recorded.

`lookupRefund` returns normalized observation:

- provider id;
- merchant refund reference;
- optional provider refund reference;
- `pending | succeeded | failed | not_found | unknown`;
- optional observed amount/currency;
- optional failure code/safe message;
- optional provider timestamp.

A `succeeded` observation is not applicable unless the financial identity matches the Refund/Execution. Missing or mismatched amount/currency/reference evidence routes to `requires_review`; it is never guessed into success.

No refund webhook endpoint is introduced in this milestone. Provider push-event support can be added later and must feed the same outcome service.

## 10. Provider readiness and live-provider safety

The configured payment provider determines the refund provider. A successful payment attempt can be refunded only through a `RefundProviderAdapter` registered under that attempt's immutable provider id.

Electronic charging must fail closed for production readiness when a configured payment provider/method lacks compatible refund support. This check belongs at the shared financial-provider readiness boundary rather than by creating a Payments -> Refunds module dependency.

The API may still boot with the entire electronic-payments bundle absent. Refund obligations already persisted in the database remain durable even if a provider adapter later becomes temporarily unavailable; execution returns `UNAVAILABLE` rather than deleting or rewriting the obligation.

No production fake refund adapter exists. Deterministic fake adapters live only under the test suite.

### Hubtel

Hubtel remains disabled. No endpoint, refund reference rule, authentication field, retry rule or lookup assumption may be invented.

Live Hubtel enablement requires the verified merchant contract for both charging and refunds, including:

- official API/version;
- refund endpoint and authentication;
- relationship between original transaction reference and refund reference;
- idempotency semantics;
- refund status lookup semantics;
- partial-refund capability;
- retry guarantees;
- supported payment methods;
- amount/currency representation;
- terminal and ambiguous states;
- any webhook verification contract if push refund events are later added.

Until those are verified, production source must contain no Hubtel refund implementation.

## 11. Captured-money helpers exported by Payments

Payments exports a transaction-aware capture service instead of allowing Refunds to implement its own payment-attempt semantics.

The service must support an Order-already-locked call that:

1. locks every `PaymentAttempt` for the order in stable id order;
2. returns all attempts in stable order;
3. identifies live attempts (`initiated`/`pending`, including uncertain initiation state);
4. identifies successful captures;
5. does not mutate attempt truth.

Refunds uses that capture state while the caller holds the Order lock.

Payments also exposes the controlled write boundary for `Order.paymentStatus` financial projections. Refunds may request a refund projection update, but does not directly rewrite payment attempts or invent capture outcomes.

## 12. Creating refund obligations

`RefundObligationService` accepts a transaction, locked order/capture state, source, reason and actor context.

For a full cancellation it processes every successful `PaymentAttempt` in stable id order. For each attempt:

1. lock existing Refund rows for that attempt in stable id order;
2. calculate committed refund amount from all existing Refund rows;
3. calculate remaining refundable capture amount;
4. if remaining is zero, create nothing;
5. if remaining is positive, create exactly one Refund for that full remainder;
6. emit refund-requested audit/outbox records in the caller transaction.

If existing refund rows already exceed the capture amount, fail closed with `RULE_VIOLATION`/review rather than creating compensating fiction.

The operation is naturally replay-safe under locks: a second invocation sees the first Refund as committed capacity and creates nothing more.

For excess-capture correction, the service computes:

`remainingExcess = max(0, sum(successful captures) - Order.totalMinor - sum(all committed Refund amounts))`

It allocates only that server-derived excess, newest successful captures first, never touching the earliest legitimate captured consideration unless required by the arithmetic. This mode creates `overcharge_correction` Refund rows and never changes fulfilment or inventory.

## 13. Customer paid cancellation

The existing route remains:

`POST /api/v1/account/orders/{orderId}/cancel`

It remains authenticated-customer-owner only; guest self-service cancellation is still outside this milestone.

The cancellation transaction becomes:

1. lock Order;
2. verify customer ownership;
3. normalize/validate reason;
4. lock PaymentAttempts through Payments in stable order;
5. if any live/uncertain payment attempt can still become paid, refuse and require payment reconciliation;
6. reject after physical stock consumption or protected fulfilment states (`dispatched`, `delivered`, `collected`);
7. if successful captures exist, call Refunds to create all missing full-capture refund obligations;
8. update Order fulfilment to `cancelled`, cancellation time/reason/version;
9. if refund obligations exist, set financial projection to `refund_pending`;
10. release active order reservation through Inventory;
11. release active delivery-slot booking;
12. append customer-safe OrderEvent;
13. append audit/outbox;
14. commit atomically.

No provider refund network call occurs inside cancellation.

If Refund obligation creation/audit/outbox fails, cancellation, reservation release and slot release all roll back.

If the order is already cancelled with the same reason, the operation is a semantic retry. It may run `ensureRefundObligations` again so a later successful capture discovered after the original cancellation is not stranded. It must never create duplicate obligations. A different cancellation reason remains `CONFLICT`.

The response may add a customer-safe `refunds` summary without breaking existing clients.

## 14. Administrator `cancel_refund` resolution

A limited production staff action path is added:

`POST /api/v1/admin/orders/{orderId}/actions`

For this milestone the documented production actions are:

- `{ "action": "cancel_refund", "reason": "..." }`;
- `{ "action": "refund_excess_capture", "reason": "..." }`.

The route is administrator-only and requires `Idempotency-Key`.

It is valid for:

- a pre-handover order with successful captured money, including `requires_review` caused by paid-without-stock;
- an order already cancelled before a late successful capture was discovered, where refund obligations are still missing.

For a non-cancelled order it performs the same atomic cancellation/resource-release sequence as customer cancellation, but the actor is administrator and the Refund source is `payment_review_cancellation`.

For an already-cancelled order it does not rewrite the historical cancellation reason or re-release resources; it only ensures missing refund obligations for successful captures and updates the financial projection.

It refuses delivered/collected/stock-consumed orders that were not already cancelled; those require future Returns Authority.

The same endpoint also documents `refund_excess_capture` with a required reason. That action is valid only for a non-cancelled order whose successful captured amount exceeds `Order.totalMinor` after accounting for already committed Refunds. It creates only the missing excess-capture obligations, preserves fulfilment/inventory, and may be used after handover because it corrects duplicate/over-capture rather than reversing the sale.

The client never supplies refund amount, provider, payment-attempt id or currency for either action. Those are derived from locked server authority.

## 15. Approval workflow

Refund obligations are approval-required throughout this milestone.

The existing prototype setting `refundsRequireApproval` remains part of the broader product design but is not a production authority dependency here. Settings Authority may make this policy configurable later.

Approval rules:

- production administrator only;
- allowed only from `awaiting_approval`;
- records `approvedBy` and `approvedAt`;
- transitions Refund to `approved`;
- emits audit/outbox;
- performs no provider network I/O;
- never means money was returned.

A second identical approval action is safely replayed through Idempotency. A different action using the same replay key is an idempotency conflict.

This milestone does not enforce two-distinct-person approval because the production role model currently has only a general administrator rather than the future finance-reviewer role. The actor remains fully audited so RBAC can add separation-of-duties later without changing refund financial identity.

## 16. Refund actions API

Production route:

`POST /api/v1/refunds/{refundId}/actions`

Administrator-only. `Idempotency-Key` is required.

Request action enum:

- `approve`;
- `execute`;
- `retry`;
- `reconcile`.

No body actor, amount, provider reference, currency or payment-attempt selector is accepted.

The action service uses scoped durable idempotency with semantic request hashes. Same actor/key/action/input replays the same Refund/Execution outcome. Same key with changed action/input returns `IDEMPOTENCY_CONFLICT` and changes nothing.

## 17. Execute flow

Execution is two-stage so provider I/O never occurs while PostgreSQL locks are held.

### Stage A: durable execution intent

Inside one transaction:

1. acquire advisory replay lock for actor + refund action + idempotency key;
2. resolve Refund seed to order id;
3. lock Order;
4. lock PaymentAttempts in stable id order;
5. lock Refund rows in stable id order;
6. lock existing RefundExecution if present;
7. revalidate successful capture and per-capture refund capacity;
8. require Refund status `approved` for first execution;
9. create the one RefundExecution if absent using a stable server-generated merchant refund reference;
10. set Refund to `processing` and execution to `created`;
11. persist audit/outbox and idempotency outcome containing only durable ids/replay metadata;
12. commit.

### Stage B: provider call

After commit, call `RefundProviderAdapter.initiateRefund` with the durable merchant refund reference.

The provider must be the one recorded on the original successful PaymentAttempt. A currently configured different provider cannot take over an existing refund.

### Stage C: apply normalized response

In a new transaction, re-lock Order -> PaymentAttempts -> Refunds -> RefundExecution and apply only if the execution identity/version still matches.

- accepted/pending -> Refund `processing`, execution `pending`;
- verified succeeded with matching money identity -> Refund/execution `succeeded`;
- authoritative rejection/failure -> Refund/execution `failed`;
- mismatch/unknown/stale identity -> Refund `requires_review`, execution reconciliation `exception`.

A provider success is never discarded because order state changed while the network call was in progress. Real money returned must be recorded; incompatible local state becomes an explicit review condition rather than changing provider truth.

## 18. Timeout, crash and retry recovery

A timeout after provider acceptance is treated as financially uncertain.

If provider initiation throws/times out after Stage A:

- execution becomes `uncertain`;
- Refund becomes `requires_review`;
- no new merchant refund reference is generated.

Same-key replay or `retry` must first perform `lookupRefund` using that same merchant refund reference.

Recovery rules:

- lookup says succeeded with matching identity -> apply success;
- lookup says pending -> remain processing;
- lookup says failed -> persist failed; retry may continue only if adapter capability explicitly says retry after definitive failure is safe;
- lookup says `not_found`/`unknown` -> resend only if adapter capability makes that safe; otherwise remain `requires_review`;
- lookup itself fails/ambiguous -> remain `requires_review`;
- mismatched provider/reference/amount/currency -> `requires_review`.

A database/outbox fault after the provider actually succeeded must not cause another refund transfer. The next replay performs lookup and records the already-completed transfer.

Retry always reuses the same RefundExecution and merchant refund reference. `attemptCount` increments only when an actual provider execution call is made.

## 19. Reconciliation

`reconcile` snapshots immutable refund/execution identity and version, performs provider lookup outside a database transaction, then re-locks financial authority and verifies the snapshot is still applicable before applying the observation.

Every lookup appends `RefundReconciliation` history.

Matching success/pending/failure uses the same central `RefundOutcomeService` as execution/retry. Reconciliation may never implement separate financial transition logic.

Stale snapshots, no-record outcomes, mismatches and conflicting terminal observations are recorded as exceptions; the system never guesses that money was or was not returned.

Until an outbox/worker milestone exists, pending/uncertain refunds are reconciled explicitly by staff actions. A future worker may call the same reconciliation service without changing financial rules.

## 20. Central RefundOutcomeService

All normalized provider observations flow through one `RefundOutcomeService`.

Before applying an observation it validates:

- provider id;
- merchant refund reference;
- known provider refund reference if already present;
- Refund/Execution amount;
- `GHS` currency;
- original PaymentAttempt relationship;
- current execution/refund state.

A `succeeded` observation requires matching amount and currency. Missing money identity on a claimed success is an exception.

Terminal success is idempotent. Repeating the same success cannot reapply order/payment projections or duplicate audit/outbox financial effects.

A conflicting later terminal observation never reverses a prior verified success; it records an exception for reconciliation.

## 21. Order payment-status projection after refunds

`PaymentAttempt.status = succeeded` remains immutable capture truth. Refunds only changes the order-level financial projection through the Payments-owned projection boundary.

For an order:

- `capturedMinor` = sum of all successful PaymentAttempt amounts;
- `succeededRefundMinor` = sum of succeeded Refund amounts;
- unresolved refund obligations are Refunds not yet succeeded.

Projection rules for this milestone:

1. no successful captures -> preserve normal unpaid/failed/expired semantics;
2. any financially ambiguous refund observation -> `requires_review`;
3. non-cancelled order with captured money above `Order.totalMinor` and no complete committed excess-correction obligation -> `requires_review`;
4. cancelled order with captured money and any unresolved refund obligation -> `refund_pending`;
5. non-cancelled order with an unresolved `overcharge_correction` obligation -> `refund_pending`;
6. succeeded refunds equal all captured money -> `refunded`;
7. non-cancelled order whose only succeeded refunds are `overcharge_correction` and whose net captured money now equals `Order.totalMinor` -> `succeeded`;
8. succeeded business refunds are positive and legitimately reduce the order consideration while money remains -> `partially_refunded` (future Returns use);
9. captured money remains on a cancelled order with no durable refund obligation -> `requires_review`.

A definitive failed provider refund does not resurrect fulfilment. The order stays cancelled and financial projection stays `refund_pending`; the Refund row exposes `failed` until safe retry succeeds or requires review.

If multiple captures exist, the order reaches `refunded` only after every captured pesewa has a succeeded refund.

## 22. Customer-safe projections

Public/customer Order projections gain additive refund summaries.

A customer-safe Refund item may include:

- refund id;
- amount minor + formatted amount;
- status;
- source label safe for the customer;
- created time;
- approved time if useful;
- resolved time;
- normalized customer-safe failure/review message.

It must exclude:

- provider refund reference;
- original provider reference;
- merchant refund reference;
- internal actor ids;
- retry internals;
- reconciliation rows;
- raw provider data;
- audit/outbox records.

Tracking by reference + verification code may show the same safe refund summaries as owner order status; it does not grant any broader account access.

## 23. Staff Refunds ledger

Production route:

`GET /api/v1/refunds`

Administrator-only with bounded pagination.

Filters:

- refund status;
- provider;
- electronic method;
- source type;
- order reference;
- created-from timestamp;
- created-to timestamp.

Safe row fields include:

- refund id;
- order id/reference;
- payment attempt id;
- provider and method;
- capture amount;
- refund amount;
- already-refunded amount for that capture;
- remaining refundable amount for that capture;
- refund status/source/reason;
- requester/approver identity suitable for staff audit;
- execution state;
- reconciliation state;
- retry count;
- optional provider refund reference;
- safe failure reason;
- created/approved/resolved timestamps.

The staff ledger does not expose raw provider responses, signatures, credentials, authentication headers or secret configuration.

## 24. Security and authorization

Current production RBAC has `admin`, `inventory_manager`, `customer`, and `rider` roles. This milestone uses:

- customer owner identity for `account.cancel`;
- `admin` for Refunds ledger/actions and `admin.order.action`.

Client body fields never select actor/customer/admin identity.

The broader `finance_reviewer`, `refunds.view` and `refunds.approve` permission design remains the target for a later RBAC Authority milestone. Refunds services must depend on an authorization decision from controllers/guards, not hard-code prototype actor ids.

Customer cancellation retains trusted-Origin + CSRF requirements of authenticated web mutations. Administrator cookie mutations retain the same origin/CSRF protections used by the current identity foundation.

## 25. Lock ordering and concurrency

The global financial lock order is:

1. `Order` row;
2. all `PaymentAttempt` rows for that order in stable id order;
3. all `Refund` rows involved, in stable id order;
4. the `RefundExecution` row;
5. downstream Inventory/Delivery locks only where cancellation already requires them.

A service that begins from a Refund id may read an unlocked seed only to discover `orderId`, then acquire authority in the global order above before making decisions.

Required invariants:

- two administrators racing the final refundable amount can create at most one obligation for that money;
- concurrent customer/admin cancellation cannot create duplicate Refund rows;
- cancellation racing verified payment success serializes through the Order lock;
- refund execution racing reconciliation applies a terminal financial effect once;
- retries never generate a second merchant refund reference;
- provider I/O occurs with no PostgreSQL transaction held open.

## 26. Idempotency

`POST /refunds/{refundId}/actions` and `POST /admin/orders/{orderId}/actions` require `Idempotency-Key`.

Actor scopes use validated principals, never body actor fields.

The semantic request hash excludes transport metadata and includes only business input (resource id, action, normalized reason where applicable).

Same actor + operation + key + same business input replays the durable operation identity/outcome. Same key with changed input returns `IDEMPOTENCY_CONFLICT` without mutation.

External provider execution recovery must key from durable RefundExecution state; an Idempotency record alone never authorizes a blind second transfer.

Customer `account.cancel` retains its existing semantic retry rule based on locked order state/reason and gains replay-safe Refund obligation creation.

## 27. Errors

Use the existing production error vocabulary:

- `VALIDATION_FAILED` — malformed action/reason/filter;
- `UNAUTHENTICATED` / `FORBIDDEN` — identity/role failure;
- `NOT_FOUND` — unknown or inaccessible resource;
- `IDEMPOTENCY_CONFLICT` — same key, changed business input;
- `CONFLICT` — stale/terminal transition race;
- `RULE_VIOLATION` — refund cap, wrong state, unpaid capture, protected handover state;
- `UNAVAILABLE` — original provider/refund adapter capability unavailable;
- `INTERNAL` — unexpected failure.

Do not introduce a second error language only for Refunds. Where useful, safe structured details may report remaining refundable minor units without exposing provider internals.

## 28. Audit, outbox and logging

Minimum events:

- `refund.requested`;
- `refund.approved`;
- `refund.execution_started`;
- `refund.pending`;
- `refund.failed`;
- `refund.requires_review`;
- `refund.succeeded`;
- `refund.reconciled`;
- `order.cancelled_with_refund` for paid cancellation.

Each transactional state change writes audit/outbox in the same transaction. An injected audit/outbox failure rolls back that local state change.

Provider network calls are never placed inside outbox transactions.

Logs must not contain:

- merchant/provider credentials;
- authentication/signature headers;
- raw provider response bodies;
- card/mobile-money secrets;
- verification secrets.

Safe log correlation may use request id, Refund id, execution id, order id/reference and normalized state names.

## 29. Contract and production API surface

This milestone adds three production paths to the existing 25-path OpenAPI surface:

1. `GET /refunds`;
2. `POST /refunds/{refundId}/actions`;
3. `POST /admin/orders/{orderId}/actions` (documenting `cancel_refund` and `refund_excess_capture` in this milestone).

The existing `POST /account/orders/{orderId}/cancel` gains paid-cancellation behavior but is not a new path.

Expected production path count after this milestone: **28**.

Shared contracts add a dedicated Refunds contract module containing:

- refund status/source enums;
- refund action request/response;
- refund ledger query/row/response;
- customer-safe refund projection;
- administrator order-action request/response additions for `cancel_refund` and `refund_excess_capture`.

The old 92-operation roadmap remains a target inventory, not a claim that all those endpoints are implemented.

## 30. Migration and database constraints

One forward migration follows `202610100004_payments_authority` and creates Refunds tables, constraints, indexes and immutability/append-only triggers.

Required PostgreSQL enforcement includes:

- positive Refund amount;
- exact GHS currency;
- valid refund/execution/reconciliation states;
- unique execution per Refund;
- unique merchant refund reference;
- unique provider refund reference when non-null;
- nonnegative attempt count/version;
- immutable Refund financial identity;
- immutable RefundExecution financial identity/reference;
- no Refund deletion;
- append-only RefundReconciliation.

Cross-row refundable-balance sums remain transaction/service invariants because PostgreSQL CHECK constraints cannot safely express those aggregates.

Migration must apply cleanly to empty PostgreSQL 17 after migrations 001–004.

No migration invents refund history for legacy rows merely because an Order has a refund-like paymentStatus. Such mismatches require explicit reconciliation rather than fabricated financial records.

## 31. Seed/test-provider policy

Production seed must not create fake successful provider refund evidence.

Tests may use a deterministic `FakeRefundProvider` that can simulate:

- immediate success;
- pending then success;
- authoritative failure;
- timeout after accepting;
- unknown/no-record lookup;
- mismatched amount/currency/reference;
- safe retry after definitive failure;
- unsafe retry capability.

No fake refund provider is registered in production bootstrap.

## 32. Verification matrix

The implementation is not complete until fresh PostgreSQL 17 and repository CI prove at least the following:

1. migration 005 applies after 001–004;
2. Refund financial identity is immutable and rows cannot be deleted;
3. RefundExecution identity/reference is immutable and one-per-refund;
4. RefundReconciliation is append-only;
5. zero/negative amount, non-GHS currency and invalid states are DB-rejected;
6. unpaid/failed/expired attempts cannot fund Refund rows;
7. customer unpaid cancellation creates no Refund and preserves current cancellation semantics;
8. customer paid cancellation creates full refund obligations before releasing stock/slot;
9. multiple successful captures on one order each receive their full remaining refund obligation;
10. existing obligations consume capacity so replay creates no duplicates;
11. same-reason cancelled replay can pick up a later successful capture without duplicating earlier Refunds;
12. changed cancellation reason remains conflict;
13. live/uncertain payment attempt blocks cancellation until reconciliation;
14. stock-consumed/dispatched/delivered/collected order cannot use pre-handover paid cancellation;
15. cancellation audit/outbox fault rolls back cancellation, Refunds, reservation release and slot release;
16. admin `cancel_refund` handles paid-without-stock `requires_review` safely;
17. admin `cancel_refund` on an already-cancelled late-success order creates only missing obligations;
18. admin `refund_excess_capture` refunds only server-derived excess and never cancels/releases fulfilment resources;
19. excess-capture correction remains available after handover while normal cancellation stays blocked;
20. non-admin refund ledger/action/order action access is forbidden;
21. approval changes obligation state only and performs no provider call;
22. execute before approval is refused;
23. same action idempotency key replays; changed input conflicts;
24. two actors racing the final refundable amount cannot over-refund a capture;
25. provider sees the committed RefundExecution before network call;
26. provider call occurs outside the database transaction;
27. immediate verified success updates Refund once and does not rewrite PaymentAttempt success;
28. pending execution remains processing and later reconcile can settle it;
29. timeout-after-accept becomes uncertain/review and same-key recovery uses lookup before any resend;
30. provider success followed by local outbox failure recovers by lookup without a second transfer;
31. definitive provider failure retries only when adapter explicitly permits it and reuses the same merchant refund reference;
32. unsafe/not-found/unknown retry follows adapter capability and otherwise remains `requires_review`;
33. amount/currency/provider/reference mismatch cannot mark a refund succeeded;
34. duplicate success/reconcile observations cannot duplicate order/payment effects;
35. order remains `refund_pending` while a cancelled capture still has unresolved refund money;
36. overcharge correction returning net captured money to the legitimate order total restores `succeeded`, not `partially_refunded`;
37. order becomes `refunded` only when all successful capture money is successfully returned for a cancelled/full-refund order;
38. customer/tracking refund projection exposes no provider/internal secrets;
39. admin refund ledger is bounded/filterable and excludes raw evidence/secrets;
40. production routes reject `manual_recording`/cash refund execution;
41. source-authority scan proves Orders does not directly mutate Refund tables and Refunds does not mutate PaymentAttempt truth;
42. source scan proves no production fake/guessed Hubtel refund adapter exists;
43. generated OpenAPI is deterministic and exactly 28 paths;
44. root lint/typecheck/build/contracts/acceptance/route-sweep remain green;
45. API suite passes on PostgreSQL 17 with no OpenAPI drift.

## 33. Rollout and sequencing

The public storefront remains on demo transport after Refunds Authority. This milestone closes a financial prerequisite; it does not itself authorize public cutover.

Recommended subsequent authority order:

1. physical stock handover/depletion + staff fulfilment;
2. dispatch/riders/COD;
3. physical Returns Authority feeding approved amounts into Refunds;
4. POS/cash payment/refund authority;
5. outbox workers/background reconciliation;
6. verified live provider adapter activation, including Hubtel only if its exact merchant contract is available;
7. production storefront/backoffice adapter cutover.

## 34. Resolved design choices

The following are intentional, not open questions:

- Refunds is separate from physical Returns.
- Refund capacity is per successful payment capture, not only per order total.
- Full cancellation refunds every remaining successful capture, including accidental extra captures.
- A fulfilled/non-cancelled order can refund only the server-derived excess capture without cancelling the sale.
- Approval is mandatory in this milestone and cannot erase an owed refund.
- Generic manual/cash refund recording is not a production escape hatch.
- One Refund has one durable RefundExecution; retries reuse it.
- Provider lookup precedes any uncertain retry.
- Refund provider interfaces are separate from charge interfaces but share the financial-provider registry boundary.
- No refund webhook route is required for this milestone.
- Hubtel remains closed until verified refund semantics exist.
- Production API grows from 25 to 28 documented paths.
- Physical Returns and restocking are later authorities.
