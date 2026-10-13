# Variety Groceries Fulfilment + Stock Handover Authority design

**Date:** 12 October 2026  
**Status:** Conversational design approved; written specification pending user review.  
**Base:** `main` at `94d480a2af80a57c9808bcf455ba542d34fcf7ab` (`Implement Refunds Authority (#10)`).

## 1. Intent

Variety Groceries now has durable catalogue/inventory foundations, order reservation authority, checkout/orders authority, payment authority and refund authority. The next production gap is the physical movement from a reserved order to a packed order whose goods actually leave the store.

This milestone creates the production authority for staff fulfilment and the single inventory depletion event required at physical handover. It must make these guarantees:

1. picking and packing never deduct physical stock;
2. stock is deducted exactly once, atomically, only when the packed goods actually leave store custody;
3. the depletion is tied to the exact order reservations and exact lots that funded the order;
4. retry, double-click, multiple API instances and concurrent staff actions cannot double-deplete;
5. shortage or inconsistent reservation/lot state fails before any partial physical-stock mutation;
6. an order whose stock has left the store can no longer use the pre-handover cancellation path;
7. COD delivery is allowed to leave the store while payment remains unpaid, but delivery completion, cash collection and rider remittance remain later separate events.

The authority is intentionally designed so future Dispatch and POS authorities reuse the same Inventory-owned depletion primitive instead of creating competing stock engines.

## 2. Existing production foundation

This specification extends the merged production authorities rather than replacing them:

- NestJS API under `/api/v1`;
- PostgreSQL/Prisma with forward-only migrations;
- durable web/native identity and access guards;
- current production roles `admin | inventory_manager | customer | rider`;
- `Idempotency(actorId, operation, key, requestHash, outcome)`;
- append-only `AuditEvent` and durable `OutboxEvent`;
- Inventory-owned FEFO reservations through `AllocationService`;
- reservation generations and `ensureClaimCoverage(...)` recovery;
- Orders-owned order/customer lifecycle and cancellation;
- `Order.stockConsumedAt` already reserved as the pre/post-handover boundary;
- Payments-owned verified capture truth and refund-aware order payment projection;
- Refunds-owned returned-money obligations and execution;
- separate payment, fulfilment, delivery, return and refund status dimensions;
- production OpenAPI generated from implemented backend routes.

The current Inventory schema stores per-lot physical quantity and active `Reservation` rows, but has no production stock-depletion authority. `StockMovement` is currently receipt-oriented and `Order.stockConsumedAt` is never set by a real backend handover flow. This milestone closes that gap without inventing Dispatch, Returns or POS authority prematurely.

## 3. Scope

This milestone implements:

1. a production `FulfilmentModule` for administrator-operated order fulfilment;
2. durable fulfilment operational state for confirmation, picking, shortage recording, packing and handover evidence;
3. queue/detail reads suitable for `/admin/fulfilment`;
4. reservation-backed lot-level pick confirmation without physical stock mutation;
5. unresolved-shortage blocking for pack/handover;
6. payment/fulfilment eligibility checks before goods leave store custody;
7. an Inventory-owned generic `consumeClaim(...)` depletion primitive;
8. immutable `StockDepletion` and `StockDepletionLine` provenance;
9. atomic lot decrement + reservation consumption + depletion provenance + audit/outbox;
10. delivery handover from `packed -> dispatched`;
11. collection packing from `picking -> ready_for_collection` and collection handover to `collected`;
12. once-only `Order.stockConsumedAt` recording in the same transaction as depletion;
13. idempotent mutating fulfilment actions;
14. customer-safe fulfilment history through existing order projections where appropriate;
15. production OpenAPI/contracts for the implemented fulfilment surface;
16. tests for concurrency, retries, shortages, payment gating, lot provenance and rollback.

## 4. Explicitly outside this milestone

The following remain closed:

- rider assignment, rider workloads and provider booking;
- delivery-job persistence and live delivery tracking;
- rider accept/pick-up/out-for-delivery/delivered actions;
- COD cash collection and rider remittance;
- provider quote/book/cancel/status/webhook/POD integrations;
- customer delivery ETA calculation;
- physical Returns Authority, return intake, inspection and restock;
- substitution approval and cross-product replacement;
- automatic stock reallocation after a physical shortage;
- inventory adjustment approval expansion beyond the existing foundation;
- POS sale/payment/cashier authority;
- cash-at-collection settlement authority;
- manual cash refunds;
- automatic outbox workers/pollers;
- live Hubtel activation;
- public storefront production-backend cutover;
- expansion from the current production roles to the full prototype role matrix (`operations_manager`, `picker_packer`, `dispatcher`, `finance_reviewer`, etc.).

The z.ai frontend may visually support the broader future role/workflow model, but production routes in this milestone remain protected by current backend roles and must not claim unsupported authority.

## 5. Authority boundaries

### 5.1 Fulfilment owns operational work

`FulfilmentModule` is the only production writer of fulfilment operational records introduced by this milestone. It owns:

- confirmation metadata;
- picking-start metadata;
- per-reservation pick outcomes;
- shortage records;
- packing completion metadata;
- handover metadata;
- permitted fulfilment transition orchestration;
- fulfilment queue/detail projections.

It may update `Order.fulfilmentStatus` and `Order.stockConsumedAt` only through its transactionally enforced transition service.

### 5.2 Orders remains order/customer truth

Orders continues to own:

- order creation;
- customer/guest ownership;
- order lines and commercial snapshots;
- cancellation semantics;
- delivery/collection choice;
- customer-safe order/tracking history.

Pre-handover cancellation remains in `OrderCancellationService`. Its existing guard on `stockConsumedAt` and dispatched/delivered/collected states remains binding. Fulfilment does not implement a second cancellation path.

### 5.3 Inventory remains physical-stock truth

`AllocationService` (or a focused Inventory-owned depletion collaborator called by it) is the only writer that may:

- lock reservation rows for a claim;
- validate exact claim coverage;
- lock the referenced stock lots;
- decrement `StockLot.quantity`;
- mark reservations consumed;
- persist `StockDepletion`/`StockDepletionLine` provenance;
- emit inventory depletion audit/outbox events.

Fulfilment never decrements stock directly and never edits reservation rows directly.

### 5.4 Payments remains payment truth

Fulfilment does not infer payment success from `Order.paymentStatus` alone and does not mutate `PaymentAttempt` or Refund rows.

Before non-COD handover, Fulfilment asks a Payments-owned read helper for verified retained capture coverage. The helper computes net successful captured money after successful refunds and exposes whether unresolved/live financial states make handover unsafe.

### 5.5 Refunds remains returned-money truth

Fulfilment never creates refunds. If an order cannot proceed before handover, the existing cancellation/refund path is used. Once handover has happened, future reversal requires Returns Authority rather than restoring stock or cancelling the order in place.

### 5.6 Intended dependency direction

The intended dependency is:

`Fulfilment -> Payments`

`Fulfilment -> Inventory`

`Orders -> Refunds -> Payments -> Inventory`

Fulfilment must not import Refunds for normal handover, and Inventory must not import Orders/Fulfilment. The generic depletion primitive works from claim identifiers and validated reservation coverage.

## 6. Fulfilment state model

The existing shared `FulfilmentStatus` remains authoritative:

- `awaiting_confirmation`
- `confirmed`
- `picking`
- `packed`
- `dispatched`
- `delivered`
- `ready_for_collection`
- `collected`
- `cancelled`

This milestone permits these production transitions:

### Delivery orders

`awaiting_confirmation -> confirmed -> picking -> packed -> dispatched`

### Collection orders

`awaiting_confirmation -> confirmed -> picking -> ready_for_collection -> collected`

`delivered` remains Dispatch Authority work. `cancelled` remains Orders cancellation work.

A transition may be replayed only when the same idempotency key and same request body are used. A changed action/body under the same replay key is an idempotency conflict.

Invalid backward or skipped transitions are rejected with `RULE_VIOLATION` or `CONFLICT`; controllers do not silently coerce state.

## 7. Fulfilment persistence

### 7.1 FulfilmentRun

Create one durable `FulfilmentRun` per Order (`orderId UNIQUE`). It records operational metadata without becoming a second order-status authority.

Fields:

- UUID `id`;
- unique `orderId` FK;
- `locationId` snapshot for the stock source;
- nullable `confirmedBy`, `confirmedAt`;
- nullable `pickingStartedBy`, `pickingStartedAt`;
- nullable `packedBy`, `packedAt`;
- nullable `packNote`;
- nullable `handedOverBy`, `handedOverAt`;
- nullable `handoverKind`: `dispatch | collection`;
- integer optimistic `version`;
- `createdAt`, `updatedAt`.

The row is created lazily at the first fulfilment mutation and is not deleted.

### 7.2 FulfilmentPick

Picking is reservation-backed because reservation rows already encode the exact FEFO lot allocation.

Create at most one pick record per Reservation (`reservationId UNIQUE`). Fields:

- UUID `id`;
- `fulfilmentRunId` FK;
- `orderId` snapshot;
- `orderLineId` / `claimLineId` snapshot;
- `reservationId` FK;
- `lotId` FK;
- `variantId` snapshot;
- expected `quantity` decimal;
- picked `pickedQuantity` decimal;
- `state`: `picked | shortage`;
- nullable normalized `note`;
- `recordedBy`;
- `recordedAt`;
- optimistic `version`.

The expected quantity, order line, reservation and lot relationship are validated from authoritative reservation/order data and may not be supplied as trusted client truth.

A pick record may be corrected before packing through the same reservation identity, but the service must retain audit history and may not permit picked quantity greater than reserved quantity.

### 7.3 Shortage semantics

`pickedQuantity < expected quantity` produces `state = shortage`.

A shortage:

- does not decrement lot quantity;
- does not release or rewrite the reservation automatically;
- blocks pack/handover;
- is visible in the fulfilment queue/detail;
- requires an explicit later operational resolution (future reallocation/substitution/adjustment) or order cancellation before handover.

This milestone does not hide discrepancies by silently moving the reservation to another lot.

## 8. Packing rules

Packing is an operational gate only; it does not consume stock.

Before pack completion, Fulfilment validates in one transaction that:

1. the order is currently `picking`;
2. every active reservation belonging to the order has one pick record;
3. every pick is `picked` and `pickedQuantity == reservation.quantity`;
4. reservation coverage still matches the order lines exactly;
5. the order is not cancelled and `stockConsumedAt IS NULL`.

For delivery, successful pack sets `Order.fulfilmentStatus = packed`.

For collection, successful pack sets `Order.fulfilmentStatus = ready_for_collection`.

Packing stores `packedBy`, `packedAt` and an optional safe note, writes an `OrderEvent`, `AuditEvent` and `OutboxEvent`, and increments versions. It does not mutate `StockLot` or Reservation state.

## 9. Payment handover policy

Physical handover is the irreversible point where goods leave store custody, so verified payment policy is checked immediately before depletion.

### 9.1 Electronic/non-COD orders

Payments exports a transaction-aware read helper, conceptually:

`getHandoverCoverage(tx, orderId) -> { successfulCapturedMinor, successfulRefundedMinor, retainedMinor, liveOrUncertain: boolean }`

`retainedMinor = successfulCapturedMinor - successfulRefundedMinor`.

Handover is allowed only when:

- `liveOrUncertain = false`;
- retained verified capture is at least the order amount that must remain paid for fulfilment;
- the order payment state is not `failed`, `expired`, `refund_pending`, `refunded` or `requires_review` in a way inconsistent with the verified coverage.

The service trusts verified PaymentAttempt/Refund evidence, not browser/payment redirect state.

An order with a legitimate excess capture correction may have a `partially_refunded` projection and still be handover-eligible when retained verified capture covers the order total.

### 9.2 COD delivery

A delivery order with `paymentMethod = cash_on_delivery` may be handed over while payment remains `unpaid`, provided the order was validly created under a COD-enabled delivery zone.

Handover does not mark COD paid and does not create cash-collection/remittance records. Those are later Dispatch/COD authority events.

### 9.3 Collection cash

Cash-at-counter / cash-at-collection production settlement remains outside this milestone. A collection order without verified retained payment is not handed over through this authority until the later POS/cash authority provides an explicit verified settlement boundary.

## 10. Inventory depletion model

### 10.1 Generic claim consumption

Inventory adds a generic transaction-only primitive, conceptually:

`consumeClaim(tx, input)`

where input includes:

- `claimType`;
- `claimId`;
- expected lines (`claimLineId`, `variantId`, quantity);
- `locationId`;
- depletion reason/kind;
- actor/request context.

For this milestone Fulfilment calls it with `claimType = order` and `claimId = order.id`.

Future POS may call the same primitive for its own claim type. Dispatch does not create another stock-depletion engine.

### 10.2 Depletion transaction algorithm

Inside one PostgreSQL transaction, Inventory must:

1. lock the claim's Reservation rows in deterministic order;
2. expire any already-expired active reservations before evaluating coverage;
3. require exactly one active reservation generation for the claim;
4. require reservation totals to match every expected claim line exactly;
5. reject partial, missing, extra or variant-mismatched coverage with `RESERVATION_LOST`;
6. lock every referenced `StockLot` in deterministic lot-id order;
7. revalidate each lot is the same lot referenced by its reservation;
8. reject quarantined, damaged/unsaleable or expired lots;
9. require each lot still has enough physical quantity to satisfy all reservations being consumed from it;
10. perform no mutation if any line/lot fails;
11. create or replay the once-only `StockDepletion` event for the claim;
12. decrement all lots;
13. mark all participating reservations `consumed`;
14. create immutable `StockDepletionLine` rows with before/after quantities and lot/reservation provenance;
15. emit one inventory audit event and one outbox event describing the depletion;
16. return the immutable depletion result.

No safety stock is subtracted again at depletion time: safety stock was an availability/allocation rule. Depletion consumes the already-reserved physical stock.

### 10.3 Depletion persistence

#### StockDepletion

Fields:

- UUID `id`;
- `claimType`;
- `claimId`;
- `locationId`;
- `kind`: `dispatch_handover | collection_handover | pos_handover` (POS reserved for future use);
- `actorId`;
- `requestId`;
- `createdAt`.

Constraints:

- unique `(claimType, claimId)` for once-only depletion;
- immutable after creation;
- not deletable.

#### StockDepletionLine

Fields:

- UUID `id`;
- `depletionId` FK;
- unique `reservationId` FK;
- `claimLineId`;
- `variantId`;
- `lotId` FK;
- positive `quantity` decimal;
- `lotQuantityBefore` decimal;
- `lotQuantityAfter` decimal;
- `createdAt`.

Constraints:

- quantity positive;
- before/after nonnegative;
- `before - quantity = after`;
- immutable and non-deletable;
- one reservation can fund only one depletion line.

`Reservation.state` gains/uses `consumed`; a consumed reservation is never returned to active/released/expired state.

## 11. Order handover transaction

Fulfilment handover coordinates the order boundary and Inventory depletion in one database transaction.

The lock order is deterministic:

`Order -> FulfilmentRun -> Reservation(s) -> StockLot(s) -> StockDepletion`

Financial coverage may be read/locked using the established Payments lock order without violating the existing global financial ordering; the implementation plan must pin the exact sequence and concurrency tests.

### 11.1 Delivery handover

Preconditions:

- order fulfilment type is delivery;
- `Order.fulfilmentStatus = packed`;
- all picks complete with no shortage;
- `stockConsumedAt IS NULL` unless this is a replay;
- payment policy passes (verified retained payment or valid COD);
- reservation coverage remains exact.

Atomic result:

- Inventory `consumeClaim(...)` succeeds;
- `Order.stockConsumedAt` is set to the same handover instant;
- `Order.fulfilmentStatus = dispatched`;
- `FulfilmentRun.handoverKind = dispatch`, actor/time recorded;
- customer-safe `OrderEvent` records dispatch handover;
- fulfilment audit/outbox event is emitted.

This milestone does not create a rider job or mark COD collected.

### 11.2 Collection handover

Preconditions:

- order fulfilment type is collection;
- `Order.fulfilmentStatus = ready_for_collection`;
- all picks complete with no shortage;
- verified retained payment coverage passes;
- `stockConsumedAt IS NULL` unless replay;
- reservation coverage remains exact.

Atomic result:

- Inventory `consumeClaim(...)` succeeds;
- `Order.stockConsumedAt` is set;
- `Order.fulfilmentStatus = collected`;
- `FulfilmentRun.handoverKind = collection`, actor/time recorded;
- customer-safe OrderEvent + audit/outbox events are written.

## 12. Exactly-once and idempotency

Every mutating public fulfilment action requires a valid `Idempotency-Key` and uses the existing durable Idempotency table.

Operations are independently namespaced, for example:

- `fulfilment.confirm`;
- `fulfilment.start_picking`;
- `fulfilment.record_pick`;
- `fulfilment.pack`;
- `fulfilment.handover`.

Rules:

- same actor + operation + key + same normalized input replays the original outcome;
- same actor + operation + key + different normalized input returns `IDEMPOTENCY_CONFLICT`;
- once `StockDepletion` exists, later handover replays return that depletion and never decrement lots again;
- a different idempotency key racing for the same handover is safe because the Order row and unique `(claimType, claimId)` depletion constraint serialize the once-only result;
- audit/outbox and idempotency outcome are committed in the same transaction as authoritative state.

## 13. Concurrency and rollback requirements

The implementation must demonstrate:

1. two API instances racing the final handover cannot both decrement stock;
2. a duplicated handover request after success replays without new StockDepletionLine rows;
3. a lot shortage discovered after packing rejects the entire handover with zero partial decrements;
4. a missing/expired/released reservation rejects with `RESERVATION_LOST` and no lot changes;
5. an audit/outbox persistence failure rolls back lot decrements, reservation consumption, `stockConsumedAt` and fulfilment status;
6. a packing action racing cancellation cannot leave a cancelled order packed;
7. a handover racing cancellation resolves under Order locking so exactly one irreversible outcome wins;
8. multiple reservations against the same lot aggregate the required decrement before mutation.

## 14. Production API surface

Expose administrator-only fulfilment routes under `/api/v1/admin/fulfilment`.

Required operations:

- `GET /admin/fulfilment` — bounded/filterable operational queue;
- `GET /admin/fulfilment/orders/:orderId` — fulfilment detail including reservation lots and pick state;
- `POST /admin/fulfilment/orders/:orderId/confirm`;
- `POST /admin/fulfilment/orders/:orderId/start-picking`;
- `PUT /admin/fulfilment/orders/:orderId/picks/:reservationId` — record/correct picked quantity before packing;
- `POST /admin/fulfilment/orders/:orderId/pack`;
- `POST /admin/fulfilment/orders/:orderId/handover`.

Mutations require `Idempotency-Key` and normal authenticated CSRF/bearer rules already enforced by the platform.

This milestone uses the current production `admin` role for fulfilment mutations. `inventory_manager` may receive read-only fulfilment detail only if the implementation can enforce location scope consistently; otherwise keep the whole production surface admin-only and defer role expansion rather than weakening authorization.

The implementation plan must pin the exact generated OpenAPI path count from the current 28-path baseline plus these routes and fail on drift.

## 15. Queue and detail projections

The administrator queue must be backend-derived, bounded and filterable by fulfilment status. It returns only safe operational fields needed by the frontend, including:

- order id/reference;
- created timestamp;
- delivery vs collection;
- customer display name/phone as permitted for staff;
- payment method/status projection;
- fulfilment status;
- delivery status;
- location;
- line count / quantity summary;
- pick completion / shortage count;
- packed/handover timestamps;
- whether handover is currently allowed plus machine-readable blocking reasons.

Detail additionally includes:

- order-line commercial snapshot;
- reservation id/lot id/lot number/expiry/expected quantity;
- pick record and shortage note;
- fulfilment timeline;
- allowed actions calculated by the service.

The frontend must not decide whether an action is permitted from visual state alone; the backend remains authoritative.

## 16. Validation and errors

Use existing error vocabulary where possible:

- `VALIDATION_FAILED` — malformed quantity/note/body/idempotency key;
- `FORBIDDEN` — role/location access failure;
- `NOT_FOUND` — inaccessible/missing order;
- `CONFLICT` — stale/competing fulfilment state or handover already resolved inconsistently;
- `RULE_VIOLATION` — invalid state transition/payment policy/shortage blocks action;
- `RESERVATION_LOST` — missing/partial/expired/released/mismatched reservation coverage;
- `OUT_OF_STOCK` — authoritative physical lot quantity cannot satisfy the reserved depletion;
- `IDEMPOTENCY_CONFLICT` — key reused with changed input;
- `PAYMENT_PENDING` / `PAYMENT_REQUIRES_REVIEW` where the existing financial boundary already uses those meanings.

Quantity remains decimal-safe using Prisma Decimal / normalized decimal strings. Physical stock authority never uses JavaScript floating-point arithmetic.

Notes are trimmed, bounded and safe; no secrets/provider payloads are accepted into fulfilment notes.

## 17. Audit, events and customer history

Every production transition records actor, request id, order, old/new state and safe context.

Recommended events:

- `fulfilment.confirmed`;
- `fulfilment.picking_started`;
- `fulfilment.pick_recorded`;
- `fulfilment.shortage_recorded`;
- `fulfilment.packed`;
- `fulfilment.ready_for_collection`;
- `inventory.depleted`;
- `fulfilment.dispatched`;
- `fulfilment.collected`.

Pick corrections remain auditable. Internal reservation/lot ids may appear in staff audit details/outbox but customer-facing OrderEvent notes must not leak internal stock controls.

Customer-safe order history may expose understandable states such as `Preparing order`, `Packed`, `Ready for collection`, `Dispatched`, `Collected` without exposing inventory internals.

## 18. Frontend compatibility

The z.ai frontend continuation wave is expected to improve `/admin/fulfilment` in parallel. This backend milestone must provide stable typed contracts so the frontend can replace demo operations without a page rewrite.

The frontend may show broader future controls, but when connected to this production API it must render backend-provided allowed actions and blocking reasons.

No backend implementation decision in this milestone should depend on frontend-only mock state.

## 19. Migration strategy

Add forward migration `202610120006_fulfilment_stock_handover` after migrations 001–005.

The migration must:

- create `FulfilmentRun`;
- create `FulfilmentPick`;
- create `StockDepletion`;
- create `StockDepletionLine`;
- add required FKs, indexes and checks;
- enforce immutable/non-deletable depletion provenance with database triggers or equivalent DB constraints consistent with Refunds Authority;
- permit/validate `Reservation.state = consumed` through DB checks where state checks exist;
- preserve all existing inventory/order/refund data;
- avoid destructive backfill assumptions.

Existing orders have no fulfilment rows; they are created lazily when acted upon. Existing `stockConsumedAt` values, if any fixture/manual data exists, are treated as already beyond the pre-handover boundary and must not be retroactively depleted.

## 20. Verification requirements

The implementation is not complete until evidence covers at least:

1. migration 006 applies cleanly after 001–005 on PostgreSQL 17;
2. schema constraints reject duplicate depletion per claim and duplicate reservation consumption;
3. confirmation is idempotent and state-safe;
4. picking records exact reservation/lot provenance;
5. picked quantity above reservation is rejected;
6. shortage records do not change physical stock;
7. shortage blocks packing;
8. packing does not change `StockLot.quantity`;
9. collection packing reaches `ready_for_collection`;
10. delivery packing reaches `packed`;
11. non-COD unpaid/unsafe financial state blocks handover;
12. valid COD delivery may hand over while remaining unpaid;
13. cash/unverified collection cannot hand over;
14. retained capture after a legitimate partial refund can still satisfy handover coverage;
15. exact reservation loss blocks handover;
16. expired/unsaleable/quarantined lot blocks handover;
17. physical shortage blocks all mutations atomically;
18. successful handover decrements each lot exactly once;
19. successful handover marks participating reservations `consumed`;
20. StockDepletionLine before/after math is exact;
21. `Order.stockConsumedAt` is written in the same transaction;
22. delivery handover becomes `dispatched`;
23. collection handover becomes `collected`;
24. same-key replay returns the original result;
25. changed input under same key conflicts;
26. two-instance race cannot double-deplete;
27. cancellation race and handover race produce one coherent winner;
28. audit/outbox failure rolls everything back;
29. customer projection leaks no internal stock details;
30. admin queue/detail are bounded and filterable;
31. unauthorized users cannot mutate fulfilment;
32. generated production OpenAPI has the exact approved paths and zero drift;
33. root lint/typecheck/build/contracts/acceptance/route-sweep remain green;
34. full API suite remains green with the new tests.

## 21. Completion boundary

This milestone is complete when Variety Groceries has a production-safe, durable and test-proven path from reserved order to confirmed/picked/packed order and a once-only physical handover that consumes the exact reserved stock.

It deliberately stops before rider dispatch orchestration, COD collection/remittance, physical Returns, POS/cash authority, worker automation and public storefront cutover.

The next recommended backend milestone after this one is **Dispatch + COD/Remittance Authority**, which will consume the stable packed-order and handover boundaries created here rather than reimplementing inventory depletion.
