# Variety Groceries payments authority design

Prepared 10 October 2026 for Christian Agbotah.

**Status:** approved conversational design converted to implementation-ready specification. This slice extends the merged Checkout + Orders Authority on `main`; it does not activate the public storefront against the production API.

## Intent

The Payments Authority slice makes electronic payment truth durable, provider-neutral, duplicate-safe and recoverable without allowing browsers, redirects, screenshots or unverified callbacks to mark an order paid. It introduces the first production money boundary on top of the existing order and Inventory reservation authorities.

Success means:

- one logical initiation cannot create two charges or two live payment attempts;
- payment state can change only from verified provider evidence or an authoritative provider lookup;
- duplicate or conflicting provider events cannot silently repeat or rewrite a financial effect;
- a successful payment is never lost because stock holds expired, and stock is never invented to satisfy a paid order;
- Inventory remains the only writer of reservations while Payments can ask it to extend or reacquire order coverage;
- a pending or uncertain provider interaction has an explicit reconciliation path instead of blind retry;
- Orders cannot cancel through an in-flight or captured payment state without consulting Payments;
- payment/provider credentials and card data never enter customer-visible persistence, audit details or logs;
- public storefront production cutover remains blocked until payment, refund, handover and fulfilment activation gates are complete.

## Existing foundation this design preserves

- NestJS `/api/v1`, PostgreSQL, Prisma, request IDs, typed `ApiProblem` errors and generated OpenAPI.
- Secure web/native identity, trusted-Origin/CSRF rules and durable guest checkout capability.
- Server-authoritative order totals and immutable order-line/address snapshots.
- Separate order `paymentStatus`, `fulfilmentStatus` and `deliveryStatus` dimensions.
- Principal-scoped durable `Idempotency(actorId, operation, key, requestHash, outcome)`.
- Atomic `AuditEvent` and `OutboxEvent` writes for committed domain changes.
- Inventory-owned lot reservations and the shared `AllocationService`.
- Current electronic checkout methods: `mobile_money`, `card_hosted`, `bank_transfer`.
- Current offline methods: `cash_counter`, `cash_on_delivery`.
- Existing shared `PaymentAttemptView`, `PaymentRow` and payment status vocabulary.
- Current production API intentionally omits `checkout.payment-outcome`, payment attempts, refund execution, stock handover, staff fulfilment and public web cutover.

The broader production design already assigns payment attempts, verified provider events, settlement and reconciliation to a dedicated Payments module. This specification makes that boundary concrete.

## Scope

This slice implements:

1. a provider-neutral `PaymentsModule` and provider adapter port;
2. durable electronic `PaymentAttempt` persistence;
3. a durable append-only provider-event ledger and reconciliation history;
4. customer/guest-owned payment initiation for an existing electronic-payment order;
5. one-live-attempt and request-idempotency guarantees across API instances;
6. provider webhook/event intake with fail-closed authentication;
7. authoritative provider lookup when a webhook cannot itself establish money truth;
8. duplicate-safe payment outcome application;
9. safe transition of the order payment dimension only;
10. extension or reacquisition of Inventory reservation coverage after verified success;
11. late-success routing to `requires_review` when stock cannot be reacquired;
12. staff payment-ledger reads and an explicit reconciliation command;
13. payment-aware cancellation guards;
14. customer-safe payment attempt projection in existing order reads;
15. configuration/readiness and provider capability gates;
16. audit/outbox events, observability and recovery tests.

This slice explicitly does **not** implement:

- refund requests, refund approval, provider refund execution or refund balance allocation;
- card PAN/CVV capture or direct card processing;
- cash-counter settlement or cashier reconciliation;
- COD cash collection/remittance;
- stock depletion/handover;
- picking, packing, dispatch, riders or delivery proof;
- automatic scheduled reconciliation workers or the outbox publisher;
- payment-provider settlement-file import unless the verified provider exposes it during a later slice;
- frontend production adapter cutover.

## Architectural decision

### Recommended approach: provider-neutral core, Hubtel first production adapter

`PaymentsModule` owns payment attempts, verified provider observations, settlement/reconciliation state and the order's **payment dimension**. Orders continues to own the order record and every non-payment lifecycle dimension. Inventory continues to own all reservation writes.

Hubtel is the first intended production adapter, but the core never embeds Hubtel-specific state transitions. The adapter converts verified Hubtel evidence into a normalized provider result understood by Payments.

Live Hubtel activation is deliberately gated: this specification does not invent credential names, signature semantics, webhook guarantees, status endpoints or refund behavior that have not been verified against the merchant's actual Hubtel access. The core and a deterministic fake provider can be implemented and fully tested without that guesswork. The Hubtel adapter may be enabled only after exact merchant documentation/credentials prove the initiation and verification capabilities used by the implementation.

### Rejected approach: Hubtel logic inside Orders

This is initially shorter but couples order lifecycle code to one provider, makes duplicate/reconciliation behavior harder to isolate, and makes a later provider migration a risky order refactor. It is rejected.

### Rejected approach: browser-facing `payment-outcome` as authority

The existing mock operation is useful for demo simulation but is not a production trust boundary. A browser redirect or client POST can be forged and cannot establish money movement. Production `POST /orders/{orderId}/payment-outcome` remains absent.

## Module boundaries

### Commerce identity extraction

The existing guest checkout and checkout-principal services are needed by both Orders and Payments. Move them into a small shared `CommerceIdentityModule` without changing cookie/session semantics. It owns guest capability resolution and the `customer | guest` commerce principal only; it does not own orders or payments.

Both `OrdersModule` and `PaymentsModule` import this module. This avoids a circular dependency where Payments would otherwise need to import Orders merely for guest ownership resolution.

### PaymentsModule

Payments owns:

- `PaymentAttempt`;
- `PaymentProviderEvent`;
- `PaymentReconciliation` history;
- provider adapter selection and capability checks;
- payment initiation orchestration;
- verified provider outcome interpretation;
- staff reconciliation commands;
- the right to mutate post-checkout `Order.paymentStatus` transitions and customer-safe payment events. Orders may set only the initial `pending | unpaid` snapshot while creating the order.

No other module may create/update payment attempts or interpret provider payment outcomes.

Payments may read immutable order totals, selected payment method and order-line snapshots directly. It may update only the order payment dimension plus append payment-related `OrderEvent`, audit and outbox rows. It must not modify fulfilment/delivery status, order totals or line snapshots.

### OrdersModule

Orders continues to own checkout, customer order reads and cancellation. It imports a narrow Payments service for:

- electronic-method availability checks at checkout;
- `assertCancellationSafe(tx, orderId)` before cancellation.

Orders does not create `PaymentAttempt` records and cannot mark an order paid.

### InventoryModule

Inventory remains the sole reservation writer. Payments never inserts, updates or deletes `Reservation` directly. It calls a new Inventory command that ensures a paid order has durable claim coverage.

## Payment method capability policy

Cash methods remain outside provider payment attempts:

| Method | Provider attempt | Checkout availability | Provider success required before fulfilment |
| --- | --- | --- | --- |
| `mobile_money` | yes | only when configured provider supports it | yes |
| `card_hosted` | yes | only when configured provider supports hosted card | yes |
| `bank_transfer` | yes | only when configured provider supports authoritative verification | yes |
| `cash_counter` | no | collection policy only | no electronic provider |
| `cash_on_delivery` | no | COD-enabled delivery zone only | cash authority is a later delivery/cash slice |

Electronic checkout fails closed when the configured payment provider does not advertise the selected method. The implementation must not accept an electronic method merely because the enum contains it.

For card payments Variety Groceries is **hosted-card only**. The API never accepts PAN, CVV or raw card credentials. Any hosted checkout URL returned by a provider must use HTTPS and match an adapter allowlist before it is returned to a client.

## Provider adapter port

Define a narrow `PaymentProviderAdapter` contract with no refund method in this slice:

- `id`: stable provider identifier;
- `capabilities()`: supported electronic methods and verification mode;
- `initiate(input)`: start or recover one provider transaction using the durable attempt/merchant reference;
- `verifyEvent(rawRequest)`: authenticate/normalize an inbound provider event when supported;
- `lookup(input)`: authoritative status lookup by durable merchant/provider reference.

Normalized provider observations contain only:

- provider ID;
- merchant attempt reference;
- optional provider reference;
- normalized state `pending | succeeded | failed | expired | unknown`;
- integer amount minor and currency when the provider returns them;
- provider event identifier when one exists;
- customer-safe failure category/message if available;
- provider timestamp when available;
- trust mode/evidence source.

The adapter never mutates application tables.

### Webhook trust modes

A provider capability declares one of:

- `verified_event`: the adapter can cryptographically authenticate the event and the verified payload itself is authoritative for the represented status;
- `lookup_required`: the inbound event is only a wake-up hint; Payments must perform a server-to-provider lookup before applying money state.

Provider IP address alone is never sufficient payment authority. When the production Hubtel event-verification contract is not proven, Hubtel must run as `lookup_required` or stay disabled; a callback body alone cannot mark an order paid.

## Persistence model

### PaymentAttempt

Add a durable attempt record with at least:

- opaque `id`;
- `orderId` foreign key;
- `provider` identifier;
- selected `method`;
- `currency = GHS`;
- immutable `amountMinor`, which must equal the current immutable order total at attempt creation;
- unique application `merchantReference` generated from the attempt, never customer-controlled;
- optional provider reference, unique per provider when present;
- status `initiated | pending | succeeded | failed | expired`;
- initiation state `created | accepted | uncertain | rejected`;
- settlement state `unsettled | settled | reconciled | exception`;
- callback/event count;
- optional normalized failure code and customer-safe failure reason;
- optional provider expiry timestamp;
- created/updated/resolved timestamps;
- optimistic version integer.

Database/application invariants:

- amount is positive integer minor units and currency is `GHS`;
- provider/method/status/initiation/settlement values are constrained;
- `callbackCount >= 0`;
- merchant reference is unique;
- provider reference is unique within provider when non-null;
- at most one live attempt (`initiated | pending`) exists for an order;
- a succeeded order cannot obtain another live attempt;
- attempt amount/method/order/provider identity never change after creation.

A failed or expired attempt may be followed by a new attempt with a new idempotency key, but the order's selected electronic method does not change in this slice.

### PaymentProviderEvent

Persist every accepted or rejected provider observation needed for financial audit as an append-only event:

- opaque ID;
- provider;
- provider event ID when supplied;
- deterministic dedupe key when the provider has no event ID;
- resolved attempt ID/provider reference when available;
- raw-body cryptographic hash, not raw secrets;
- verification result `verified | lookup_required | invalid`;
- normalized observed state, amount/currency and provider timestamp when supplied;
- processing result `duplicate | applied | pending | mismatch | exception | rejected`;
- received/processed timestamps;
- small redacted safe-metadata JSON only.

Unique `(provider, providerEventId)` when an event ID exists and unique `(provider, dedupeKey)` otherwise make event ingestion duplicate-safe independently of HTTP idempotency retention. Dedupe is not the same as discard: if a duplicate delivery finds the existing event still `received`, lookup-pending or exception/unprocessed, processing resumes from that durable row. Only an already terminally applied/rejected event is acknowledged as a no-op duplicate.

Raw signatures, authorization headers, card data and provider secrets are never persisted in this table.

### PaymentReconciliation

Persist each authoritative reconciliation observation so uncertain network outcomes are explainable:

- ID, paymentAttemptId, provider;
- trigger `webhook | customer_retry | staff | worker`;
- observed normalized provider state/reference/amount/currency;
- result `matched | state_changed | no_record | mismatch | exception`;
- safe note;
- request ID and timestamps.

Reconciliation history is append-only. The attempt carries only the latest status/settlement projection.

## Reservation generation and paid-order coverage

The current reservation uniqueness `(claimType, claimId, claimLineId, lotId)` preserves one historical row forever. That prevents a legitimate late payment from reacquiring the same lot after an earlier hold expired/released.

Add a positive integer `generation` to `Reservation` and include it in the uniqueness key. Existing reservations migrate as generation `1`.

Inventory adds a command such as `ensureClaimCoverage(tx, input)` with these semantics:

1. lock the claim's reservation history and affected stock-position rows in stable order;
2. if active, unexpired reservations fully cover every requested order line, extend those active holds to the requested confirmed-order expiry and return the existing generation;
3. otherwise require that no still-active partial/competing generation remains;
4. choose `max(existing generation) + 1` for the claim;
5. run normal FEFO allocation/preflight using current physical stock, active holds and safety stock;
6. create one new reservation generation atomically across all lines or fail with no new holds;
7. audit/outbox the extension/reacquisition inside the caller transaction.

Payments supplies the immutable order lines and a configured confirmed-order hold deadline. Inventory alone decides lot selection and reservation mutation.

This command is idempotent for already-covered paid orders and gives later stock handover a single active generation to consume.

## Confirmed-order hold duration

Electronic checkout still starts with the short checkout-payment hold configured by the previous milestone. Verified payment success must not leave a paid order on that short deadline.

Add a required payment/commerce configuration value for the **confirmed electronic order hold**. On verified success Payments asks Inventory to extend existing coverage to that deadline or reacquire a new generation if the checkout hold already expired.

The duration remains policy/configuration, never a controller constant. The later fulfilment/handover slice will consume these holds before they expire and define operational escalation for overdue paid orders.

## Payment initiation API

Add:

`POST /api/v1/orders/{orderId}/payment-attempts`

Security:

- authenticated customer must own the order; or
- current guest checkout capability must own the order;
- cookie/guest mutations require the existing trusted-Origin and CSRF protections;
- order ID, phone, name or reference alone never grants initiation authority.

Request:

- required `Idempotency-Key` header;
- no client-controlled amount, currency, order total, provider reference or payment status;
- for `mobile_money`, an optional validated payer phone may be allowed so a customer can pay from a different Ghana MoMo number; absence uses the order contact phone;
- card-hosted initiation accepts no card details.

Response is a customer-safe `PaymentInitiationResult` containing the attempt ID, method, normalized attempt/payment status, and at most one provider action:

- `redirect` with a validated hosted HTTPS URL;
- `prompt` with safe instructions/reference;
- `instructions` for a verified bank-transfer flow;
- `none` when already pending/resolved or reconciliation is required.

Provider secrets and raw response payloads are never returned.

## Initiation idempotency and external-call recovery

External provider calls are never made inside a database transaction.

Initiation is a durable two-stage command:

### Stage A: persist intent before network I/O

Inside one PostgreSQL transaction:

1. derive the customer/guest actor scope;
2. take the existing transaction advisory lock for actor + operation + idempotency key;
3. validate replay hash;
4. lock the order;
5. verify ownership, electronic method, provider capability and allowed order/payment state;
6. refuse a second live attempt;
7. create `PaymentAttempt(status=initiated, initiationState=created)` with server-generated merchant reference;
8. write audit/outbox;
9. persist the idempotency outcome containing the non-secret attempt ID;
10. commit.

Same scope/key/request always returns/reuses the same attempt. Changed input returns `IDEMPOTENCY_CONFLICT`.

### Stage B: provider initiation

After Stage A commits, call the adapter with the durable attempt ID/merchant reference as the provider correlation key and use provider-supported idempotency when available.

Then update the attempt in a new transaction:

- accepted provider request -> provider reference/instructions, `pending`, `accepted`;
- definitive provider rejection -> `failed`, `rejected`;
- network timeout/ambiguous response -> remain `initiated`, set `initiationState=uncertain` and `settlementState=exception`; never create a new attempt or blindly issue another charge.

If the process crashes between Stage A and Stage B, the durable `created` attempt is recoverable. Reconciliation first performs provider lookup by merchant reference. A provider initiation may be retried with the same durable merchant/idempotency key only when the adapter's verified contract says that retry is safe; otherwise the attempt remains an exception for operator resolution.

An idempotent HTTP replay does not create another attempt. It returns the current durable attempt state and may trigger the safe reconciliation path, not a fresh uncontrolled provider charge.

## Provider event intake

Add:

`POST /api/v1/payments/providers/{provider}/events`

This route is intentionally outside customer session authentication and is protected by the provider adapter's event-authentication contract. It has strict body-size/content-type limits and preserves the raw body only long enough for verification/hash calculation.

Processing sequence:

1. resolve only a configured provider ID;
2. hash the raw body and call `verifyEvent`;
3. reject invalid authentication without financial mutation;
4. persist/dedupe the provider event;
5. if trust mode is `lookup_required`, perform authoritative `lookup` before money mutation;
6. resolve the durable attempt using merchant reference/provider reference, never customer body IDs alone;
7. validate provider, expected amount and currency when those values are available;
8. apply the normalized observation through the single Payment outcome service;
9. mark the provider event processing result;
10. return a duplicate-safe acknowledgement.

The callback endpoint must not expose materially different details that help an attacker enumerate orders or attempts.

## Outcome state machine

### Pending

A verified/authoritative pending observation changes an `initiated` attempt to `pending` but does not create a second financial effect. `Order.paymentStatus` remains `pending`.

### Failure/expiry

A verified failure/expiry makes the attempt terminal. If it is the current live attempt and the order has no successful/review payment, set the order payment dimension to `failed` or `expired` respectively. A later customer retry uses a new attempt and moves the order back to `pending` only after the new durable attempt is created.

### Success with active coverage

On first verified success:

1. resolve the attempt/order relationship without mutating it, then lock the order row followed by the payment-attempt row in the documented global lock order;
2. verify the observation matches the expected provider, amount and `GHS` currency;
3. call Inventory `ensureClaimCoverage` with immutable order lines and confirmed-order hold expiry;
4. if active holds already cover the order, Inventory extends them;
5. mark the attempt `succeeded`, `resolvedAt`, settlement state `unsettled`;
6. set `Order.paymentStatus = succeeded`;
7. append customer-safe order payment event plus audit/outbox;
8. commit atomically.

### Late success after hold expiry

If current holds expired/released, Inventory attempts a new reservation generation inside the same outcome transaction.

- reacquisition succeeds -> payment and order become `succeeded`, new paid-order holds protect fulfilment;
- reacquisition fails -> the **money is still recorded as succeeded**, the attempt is `succeeded` with settlement state `exception`, and `Order.paymentStatus = requires_review`; no stock is fabricated and no partial holds survive.

The customer-safe event explains that payment was received but fulfilment requires review without exposing lot/provider internals.

### Success after cancellation or incompatible order state

A verified provider success can never be discarded. If an order was cancelled or otherwise cannot safely continue, record the attempt as succeeded and route the order payment dimension to `requires_review`. Refunds Authority will later own the money-return path.

### Duplicate event

An already-terminally-processed provider event or repeated observation of the same terminal state increments/records callback evidence as appropriate but returns `duplicate: true` and performs no repeated order, stock, audit/outbox financial transition. A redelivery of an event whose first processing attempt stopped before a terminal processing result resumes lookup/outcome processing against the same durable event row rather than being discarded.

### Conflicting terminal outcomes

A failed/expired attempt later receiving a success observation, or a succeeded attempt receiving a contradictory terminal failure, is **not silently rewritten**. Persist the conflicting provider event/reconciliation result, set settlement state to `exception`, and require authoritative reconciliation/operator review. The first committed terminal financial effect is never replaced merely because a later webhook says something different.

## Reconciliation

Add a reusable `PaymentReconciliationService` and an authorised staff command:

`POST /api/v1/payments/{attemptId}/reconcile`

The service:

1. reads an immutable attempt snapshot without holding a database transaction open;
2. performs provider lookup outside a DB transaction;
3. opens a short transaction, locks the order row followed by the attempt row, and verifies the snapshot is still applicable;
4. records a `PaymentReconciliation` observation;
5. applies a compatible authoritative state through the same outcome service used by provider events;
6. records mismatches/stale observations as `settlementState=exception` instead of guessing.

A future worker may invoke this same service for old `initiated`, `pending` or `exception` attempts. This slice does not add the scheduler/publisher; the service is deliberately worker-safe and repeatable.

Settlement state meaning for this milestone:

- `unsettled`: provider confirms customer payment, but provider settlement has not independently been proven;
- `reconciled`: authoritative lookup agrees with the recorded payment state;
- `settled`: used only when the provider exposes explicit settlement evidence in a later verified capability;
- `exception`: transport ambiguity, state conflict, amount/currency mismatch, late-success stock failure or other operator-required inconsistency.

## Staff payments ledger

Implement the existing target:

`GET /api/v1/payments`

It is staff/finance-authorised, paginated and returns `PaymentRow`-compatible projections with order reference, method, amount, status, provider reference, settlement state, callback count, safe failure reason/note and timestamps.

Filters may cover status, settlement state, provider, method, order reference and date range when those filters already fit the shared list conventions. Do not expose provider credentials, signatures or raw event payloads.

## Customer-safe order projection

Existing owner/tracking order responses may now populate `paymentAttempts` from durable attempts.

Customer-safe rules:

- no provider credentials/signatures/raw payloads;
- provider reference may be shown when it is a safe support/reference value;
- failure reason must be normalized/customer-safe rather than raw provider debugging text;
- operational `note` is returned only when explicitly customer-safe;
- no reconciliation raw metadata;
- order verification secret remains outside payment records.

Public reference+code tracking gains no additional payment authority: it is read-only.

## Payment-aware cancellation

The current cancellation path predates payment attempts. Once Payments exists, Orders must call `PaymentsService.assertCancellationSafe(tx, orderId)` while the order is locked.

Cancellation rules:

- no attempt, or only terminal `failed/expired` attempts -> existing pre-handover cancellation may proceed;
- live `initiated/pending` attempt -> reject with `RULE_VIOLATION` / payment reconciliation required; do not release stock while a provider charge may still succeed;
- successful attempt, `succeeded`, `requires_review`, `partially_refunded`, `refund_pending` or `refunded` order payment states -> reject and require the future refund workflow;
- cancellation and payment-outcome transactions lock the order/attempt in a consistent order to make the race deterministic.

A verified success racing cancellation must result in exactly one safe committed outcome: either cancellation wins before any live payment exists, or payment wins and cancellation is refused. No path may yield a cancelled order with silently ignored captured money.

## Configuration and readiness

Payments uses a closed-by-default configuration bundle.

A fully absent payment-provider bundle means electronic provider initiation is disabled; cash methods and the rest of the API may still start. A partially configured bundle is a startup configuration error. A configured provider that fails its adapter readiness/capability checks makes electronic payment readiness unavailable without pretending payment can proceed.

The central payment configuration includes application-owned policy independent of provider secrets:

- active provider ID;
- enabled electronic methods (must be a subset of adapter capabilities);
- confirmed electronic order hold duration;
- provider request timeout/retry/reconciliation policy bounds;
- approved hosted-payment domains when redirect actions exist.

Provider-specific secret field names and webhook verification details are not invented here. Hubtel remains disabled until its exact merchant integration contract is supplied/verified; implementation must record those fields in the implementation plan before enabling the live adapter.

CI uses a deterministic fake provider with no network dependency and configurable outcomes (accepted, pending, failed, succeeded, timeout-after-accept, lookup mismatch, duplicate event).

## Security and privacy

- No client route can submit `outcome=succeeded` as production payment authority.
- No browser redirect establishes payment success.
- Customer/guest initiation derives order ownership from server principal capability only.
- Cookie/guest initiation retains trusted-Origin and CSRF enforcement.
- Provider event endpoints authenticate by adapter verification/lookup, not customer auth or IP alone.
- Raw provider authorization/signature headers are never persisted or logged.
- Card PAN/CVV never crosses Variety Groceries APIs.
- Provider-hosted redirect URLs are HTTPS and adapter-domain allowlisted.
- Amount and currency come from immutable server order state and verified provider evidence, never client values.
- Provider mismatch, wrong amount/currency/reference or malformed event fails closed and creates an exception/audit trail without marking paid.
- Safe structured logs use request ID, attempt ID and non-secret provider/reference identifiers; avoid customer phone/email unless specifically required and redacted.
- Provider secrets live only in deployment secret configuration and are excluded from source control, database rows, outbox payloads and client responses.

## Audit and outbox events

At minimum record durable business/security events for:

- `payment.attempt_created`;
- `payment.initiation_pending` / `payment.initiation_failed` / `payment.initiation_uncertain`;
- `payment.succeeded` / `payment.failed` / `payment.expired`;
- `payment.requires_review`;
- `payment.provider_event_invalid` (security audit only when no business aggregate is trusted);
- `payment.provider_event_duplicate`;
- `payment.reconciled` / `payment.reconciliation_exception`;
- paid-order reservation extension/reacquisition through Inventory's own event namespace.

Payment outcome application writes attempt/order projection, Inventory coverage, customer-safe `OrderEvent`, audit and outbox in one database transaction. Provider network calls occur before or after that transaction as defined above, never inside it.

Outbox publication itself remains a later operational slice; the durable records are still written now so a future publisher has a correct source.

## Failure and recovery behavior

### Provider initiation timeout

Keep the durable attempt. Mark initiation `uncertain`, never create a second attempt automatically, and reconcile by merchant reference.

### API crash after attempt creation

The attempt/idempotency record survives. Replay returns the same attempt and enters the safe reconciliation/initiation-recovery path.

### API crash after provider accepts but before response persistence

Provider lookup by merchant reference recovers the transaction. Blind second charge is forbidden.

### Webhook database failure

Return a provider-appropriate retryable failure. Because provider events are deduped and outcome application is transactional, a retry cannot duplicate money/order/stock effects.

### Success while stock is unavailable

Record real payment success, keep physical stock unchanged, set payment/order review exception and surface it to staff. Never downgrade money truth to pretend payment failed.

### Invalid or unknown provider event

No financial mutation. Record only safe security evidence when possible and return a generic acknowledgement/rejection appropriate to the verified provider contract.

## OpenAPI and contract changes

Production OpenAPI adds:

- `POST /api/v1/orders/{orderId}/payment-attempts`;
- `POST /api/v1/payments/providers/{provider}/events`;
- `GET /api/v1/payments`;
- `POST /api/v1/payments/{attemptId}/reconcile`.

Existing `GET /orders/{orderId}` and tracking/account projections now expose customer-safe durable payment attempts where the portable contract already permits them.

The production API continues to omit `POST /orders/{orderId}/payment-outcome`; keep the mock operation explicitly demo-only rather than treating the proposed 92-operation mapping as a security requirement.

Shared contracts add provider-neutral payment initiation/reconciliation schemas without leaking adapter-specific credentials or response shapes.

## Migration

Create the next PostgreSQL/Prisma migration after `202610100003_checkout_orders_authority` for:

- `PaymentAttempt`;
- `PaymentProviderEvent`;
- `PaymentReconciliation`;
- reservation `generation` and revised historical uniqueness;
- required indexes, foreign keys, check constraints and append-only protections.

Existing reservation rows become generation `1`.

Do **not** fabricate historical payment attempts for existing pre-activation electronic orders. This project has not cut the public storefront over to production payment authority; any non-production pending orders without attempts remain explicit legacy/test data rather than invented financial history.

## Concurrency and lock order

Use one documented row-lock order to reduce deadlocks:

1. order row;
2. payment-attempt row(s) in stable ID order;
3. reservation claim history;
4. stock positions/lots in Inventory's stable order.

Transaction-scoped advisory locks for HTTP idempotency and unique provider-event inserts may occur before these row locks; they must never invert the order/attempt row-lock sequence. Provider network I/O never occurs while these database locks are held.

Provider-event dedupe happens before financial outcome application, but the final attempt/order/coverage decision is made under database locks.

Two independent API instances racing:

- the same initiation key -> one attempt;
- different initiation keys on one order -> one live attempt, one conflict/replay-safe loser;
- duplicate success events -> one payment transition;
- success vs cancellation -> one safe serialised result;
- two late-success orders competing for the final unit -> at most one reacquires stock; the other remains paid and `requires_review`.

## Verification strategy

Implementation uses TDD and must include fresh empty-database migration verification.

Required focused tests include:

1. payment/config value validation and closed/partial bundle behavior;
2. payment schema constraints and append-only provider/reconciliation history;
3. same-key initiation replay and changed-input conflict;
4. two concurrent different keys cannot create two live attempts;
5. provider adapter is called once for a normal accepted initiation;
6. crash/timeout-after-provider-accept is recovered without a second charge;
7. bad customer/guest ownership cannot initiate another order's payment;
8. cookie/guest CSRF and trusted-Origin enforcement remains intact;
9. card initiation accepts no card data and only allowlisted HTTPS hosted URLs;
10. forged browser `payment-outcome` route remains absent;
11. invalid provider authentication cannot change payment/order/stock state;
12. duplicate provider events are acknowledged with one financial effect;
13. wrong provider reference, amount or currency routes to mismatch/exception without marking paid;
14. verified pending/failure/expiry transitions;
15. success extends active checkout holds to confirmed-order expiry;
16. success after hold expiry reacquires a new reservation generation;
17. late success competing for unavailable stock records payment success plus `requires_review` and no partial holds;
18. success after cancellation/incompatible state becomes review, never discarded;
19. conflicting terminal provider outcomes create reconciliation exception rather than silent rewrite;
20. reconciliation is repeatable across API instances;
21. cancellation refuses live/succeeded/review payment attempts and remains race-safe;
22. audit/outbox or Inventory-coverage fault rolls back payment/order financial transition atomically;
23. provider/event secrets and raw verification values do not appear in database outcomes, audit, outbox, logs or public projections;
24. staff payment ledger is role-scoped and paginated;
25. customer/tracking order projections remain customer-safe;
26. Payments source is the only production writer of `PaymentAttempt` and post-checkout verified `Order.paymentStatus` transitions; Orders is allowed only to set the initial checkout payment snapshot;
27. Orders/Payments source cannot mutate `Reservation` directly;
28. exact generated OpenAPI contains only implemented production routes.

Then rerun every existing API, root lint/type/build, contracts, handoff, business acceptance and public route sweep gate. Hosted PostgreSQL 17 CI must pass on the exact implementation head and again after merge to `main`.

## Production activation gate

Merging this slice does **not** switch the public storefront from demo mode.

Electronic payment can be publicly enabled only when all of these are true:

- the exact live provider merchant contract/credentials are configured outside source control;
- provider initiation and event/lookup authentication have been exercised against the real provider environment;
- duplicate and uncertain outcome recovery is proven;
- payment methods exposed by checkout exactly match verified adapter capabilities;
- Refunds Authority exists for captured-money cancellation/returns;
- stock handover/depletion and fulfilment authority exist and enforce payment/coverage rules;
- operational monitoring/reconciliation ownership is defined;
- the public frontend makes one consistent backend cutover rather than mixing mock/live money authority.

## Follow-on sequence

After Payments Authority is implemented and merged, the recommended production sequence is:

1. **Refunds Authority** — paid cancellation/returns, refund allocation, approval, provider execution and uncertain refund reconciliation;
2. **Stock Handover + Fulfilment Authority** — picking/packing state rules, once-only Inventory consumption at rider/customer handover, payment gating;
3. **Dispatch/COD Authority** — rider/provider assignment, proof, COD collection and remittance separation;
4. **outbox/worker operations** — publisher, scheduled payment reconciliation and reservation/order expiry workflows;
5. **production storefront cutover** only after the combined commerce/money/delivery acceptance gate is green.
