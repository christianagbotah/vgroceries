# Variety Groceries checkout and orders authority design

Prepared 10 October 2026 for Christian Agbotah.

**Status:** approved conversational design converted to implementation-ready specification. This slice extends the merged Commerce Reservation Core; it does not activate the public storefront against the production API.

## Intent

The next Commerce Authority slice makes online checkout and customer orders durable, concurrency-safe and server-authoritative. A customer must be able to obtain a live quote, place exactly one order despite retries, reserve all requested stock atomically, read only orders they are entitled to see, track an order with a separate verification capability, and cancel an eligible order without leaking or stranding stock.

The existing `AllocationService` remains the only reservation mutation authority. The Orders module owns online order records and order lifecycle decisions. Payment providers, refund execution, stock depletion/handover, staff fulfilment, dispatch and public frontend cutover remain later slices.

Success means an order cannot exist without the required active holds, a hold cannot be created outside Inventory, the same checkout cannot create two orders, one customer's identifiers cannot expose another customer's order, and any failed transaction leaves order, reservation, slot, audit and outbox state unchanged.

## Existing foundation this design preserves

- NestJS API under `/api/v1`, PostgreSQL and Prisma.
- Secure web sessions and rotating native token contracts from the foundation milestone.
- `Idempotency(actorId, operation, key, requestHash, outcome)` as the durable replay record.
- `AuditEvent` and `OutboxEvent` written in caller transactions.
- Catalogue `Product` and `Variant` records with integer GHS minor-unit prices.
- Inventory `Location`, `StockPosition`, `StockLot` and lot-specific `Reservation` records.
- `AllocationService.create/release/expire`; Inventory alone mutates reservations.
- Current portable checkout contracts in `packages/contracts` and the explicit 92-operation REST mapping.
- Public web remains in demo mode until commerce, money and delivery activation gates are complete.

## Scope

This slice implements these production capabilities:

1. public delivery-zone and delivery-slot reads;
2. server-authoritative checkout quote;
3. secure guest checkout session establishment;
4. durable idempotent online order creation;
5. atomic order-line creation plus inventory allocation;
6. delivery-slot capacity booking as part of the same transaction;
7. authenticated-customer and guest-capability order status reads;
8. reference plus verification-code order tracking;
9. authenticated customer order listing;
10. safe pre-handover cancellation with reservation and slot release;
11. customer-safe order projections, audit events and outbox events.

This slice explicitly does **not** implement:

- payment-provider requests, provider webhooks or `checkout.payment-outcome`;
- payment attempts, settlement or reconciliation authority;
- refunds or return merchandise authorization;
- stock consumption/handover;
- picking, packing, dispatch, riders or delivery proof;
- POS completion;
- staff order-transition endpoints;
- production web adapter cutover.

## Architectural decision

### Module boundaries

`OrdersModule` owns order persistence, checkout orchestration, ownership checks, public tracking, customer order projections and cancellation rules. It may call Inventory and read Catalogue/Delivery configuration, but no other module may write Orders tables directly.

`InventoryModule` continues to own every reservation state change. `OrdersModule` passes stable order and order-line claim identifiers into `AllocationService` and never inserts or updates `Reservation` itself.

A small `DeliveryConfigModule` owns delivery zones, slots and slot bookings. This is configuration/capacity authority only. It does not own riders, jobs, dispatch or delivery state machines.

Payment state remains an order snapshot dimension, but this slice does not create payment-attempt records or interpret provider outcomes. A later `PaymentsModule` becomes the only authority allowed to change payment status from verified money events.

### Commerce stock source

Online checkout allocates from one configured commerce stock location for this milestone. The API reads `COMMERCE_LOCATION_ID`, verifies that it references an active `Location`, and fails readiness/checkout closed when it is absent or invalid. It never silently selects the first location. Preserving an explicit location identifier keeps later multi-location routing additive.

## Persistence model

### Order

Add an `Order` table with at least:

- stable opaque `id`;
- unique human-facing `reference`;
- `channel = online` for this slice;
- nullable `customerUserId`;
- nullable `guestSessionId`;
- contact snapshots: name, phone and optional email;
- fulfilment `delivery | collection`;
- nullable zone and slot identifiers;
- selected payment method;
- separate payment, fulfilment and delivery statuses;
- integer `subtotalMinor`, `discountMinor`, `deliveryFeeMinor`, `totalMinor`;
- `verificationKeyVersion` and `verificationCodeHash`;
- optimistic `version` integer;
- UTC created/updated timestamps;
- optional cancelled timestamp/reason.

Database constraints require exactly one checkout owner: authenticated `customerUserId` or `guestSessionId`, never both and never neither. `channel` is constrained to supported values. Money fields are non-negative and total consistency is checked by application logic and tests.

Initial statuses are:

- fulfilment: `awaiting_confirmation`;
- delivery: `unassigned`;
- electronic payment methods: `pending`;
- `cash_counter` / `cash_on_delivery`: `unpaid`.

### OrderLine

Each line snapshots the sale decision and is immutable after checkout:

- `id`, `orderId`, `variantId`, `productId`;
- product name, variant name and unit snapshot;
- exact decimal quantity `Decimal(15,3)`;
- integer `unitPriceMinor`;
- integer `lineTotalMinor`.

The order line ID is the Inventory `claimLineId`. Order-line response allocations are read from Inventory reservations by claim provenance rather than maintained as a second writable allocation copy.

### OrderEvent

Append-only order events record actor kind, optional actor identifier, action, optional from/to status, optional customer-safe note and UTC timestamp. Internal audit remains in `AuditEvent`; an `OrderEvent` is business history, not a replacement for security audit.

### GuestCheckoutSession

Add a durable guest session with:

- opaque session `id`;
- unique token hash;
- expiry and revocation timestamps;
- `csrfHash`;
- created/last-seen timestamps.

The raw session token is issued only in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. The database stores only its cryptographic hash. A companion non-HttpOnly CSRF token is issued separately; guest mutations must send it in the CSRF header and the API verifies it against `csrfHash`, in addition to allowed-Origin checks.

A missing guest session may be established by quote or checkout before the business transaction begins. Creating that capability is allowed to survive a later checkout failure; order/reservation/slot state is still all-or-nothing. A guest session is never accepted from request body fields.

### CustomerAddress

Authenticated customers may reference a saved `addressId`. Add a customer-owned address record linked to `User`; the server resolves it only when the authenticated principal owns it. Guest checkout uses `guestAddress` input and never creates a saved customer address implicitly.

Every delivery order persists an immutable `OrderDeliveryAddress` snapshot so editing a saved address later cannot rewrite historical orders.

### DeliveryZone, DeliverySlot and DeliverySlotBooking

A zone stores name, areas, active flag, delivery fee, minimum order, service-hours/cutoff display policy, slot policy (`required | optional | none`) and whether cash-on-delivery is enabled. The public zone contract may gain these policy fields additively.

A slot stores zone, UTC start/end timestamps, capacity and active state. `booked` is derived from active bookings rather than trusted as an independently mutable counter.

`DeliverySlotBooking` links one order to one slot and has `active | released` state plus timestamps. A unique order booking prevents duplicate capacity consumption.

Capacity checks lock the slot row with `FOR UPDATE`, count active bookings and create the booking while that lock is held. Cancellation releases the booking in the order transaction. This avoids counter drift and serializes two customers competing for the last slot.

## Identity, guest ownership and privacy

Request-body `customerId`, names, phone numbers or order IDs never establish authorization.

For authenticated customers, ownership derives from the validated web/native session principal. Checkout records that user as `customerUserId`; any body `customerId` is ignored for authority and, while retained for contract compatibility, must either be absent or match the principal when validated.

For guests, ownership derives from the validated guest-session cookie. Checkout records the durable guest session ID.

`GET /orders/{orderId}` returns the customer-safe projection only when:

- the authenticated customer owns the order; or
- the current guest session owns the order.

Staff access uses separate staff endpoints in a later slice. Guessing an order ID, reference, phone number or customer name must not grant this read.

`POST /orders/track` requires both the public reference and verification code and returns only the customer-safe projection. It does not create an authenticated session or grant access to other orders.

## Verification code design

The contract continues to expose a customer verification code from successful checkout, but the database never stores that plaintext code.

Generate a 10-character Crockford Base32 code deterministically from `HMAC-SHA256(secretVersion, orderId)` and store the key version plus a keyed hash/verification digest. The active and retained previous verification secrets live outside the database. Deterministic generation allows a same-key idempotent checkout replay to return the exact original code without storing it in plaintext.

Tracking compares codes in constant time. The larger alphabet/length materially raises brute-force cost compared with a short numeric PIN. The HTTP layer also rate-limits failed tracking attempts by client address and reference. Public activation requires the shared Redis-backed limiter from the operations architecture; until then this endpoint is not exposed by the public production web configuration.

## Checkout quote

`POST /api/v1/checkout/quote` creates no order and no reservation.

The quote service:

1. validates non-empty unique variant lines and exact quantity precision;
2. loads active, published variants and current integer prices;
3. applies unit quantity rules shared with Inventory;
4. reads `variant_availability` for the configured commerce location;
5. resolves the requested delivery zone when present;
6. calculates authoritative line totals, subtotal, delivery fee and total;
7. reports per-line availability/conflicts and zone minimum status.

A quote is informative, not a promise. Checkout re-runs every authoritative rule inside its transaction.

Collection quotes have zero delivery fee and no zone minimum. Delivery minimum is calculated from merchandise subtotal before delivery fee. Collection requests reject zone, slot and delivery-address fields. Delivery requires a zone and exactly one address source; guests must supply `guestAddress`, while authenticated customers may use either an owned saved `addressId` or a one-off `guestAddress`. Supplying both is invalid.

Payment/fulfilment combinations are authoritative server rules: `cash_counter` is collection-only; `cash_on_delivery` is delivery-only and requires a zone with COD enabled; electronic methods may be used for either fulfilment mode. A delivery zone whose slot policy is `required` requires a valid future slot; `none` rejects a slot; `optional` accepts either.

## Exact pricing rule

Money authority uses integer GHS minor units. Quantity authority uses exact decimal arithmetic; JavaScript `number` multiplication is forbidden in checkout totals.

For each line:

`lineTotalMinor = roundHalfUp(Decimal(unitPriceMinor) * quantity)`

Round each line once to the nearest pesewa using decimal half-up rounding, then sum line totals. The order subtotal is the sum of line totals; this slice has no checkout discounts, so `discountMinor = 0`. `totalMinor = subtotalMinor + deliveryFeeMinor`.

The server snapshots the current variant price at checkout. Client prices, cart totals and prior quote totals are never accepted as authority.

## Atomic checkout command

`POST /api/v1/checkout/complete` requires an `Idempotency-Key`. The body contract remains compatible with `CompleteOrderRequest`; the HTTP header is authoritative transport metadata.

The operation uses this sequence inside one PostgreSQL transaction:

1. derive the actor scope as `customer:<userId>` or `guest:<guestSessionId>`;
2. canonicalize the semantic request excluding transport idempotency metadata and hash it;
3. take a transaction-scoped PostgreSQL advisory lock derived from actor scope + operation + idempotency key;
4. read the durable `Idempotency` record;
5. if present with the same hash, return the stored order outcome without new side effects;
6. if present with a different hash, return `IDEMPOTENCY_CONFLICT`;
7. validate identity/contact, fulfilment and address ownership/snapshot;
8. load and revalidate all variants, quantities, current prices and zone minimum policy;
9. if delivery uses a slot, lock that slot and verify zone, active state, time and remaining capacity;
10. create the order and immutable order lines;
11. call `AllocationService.create(tx, ...)` with claim type `order`, claim ID = order ID, line claim IDs = order-line IDs and the configured location;
12. create the delivery-slot booking when required;
13. append the placed `OrderEvent`;
14. write security/business `AuditEvent` and durable `OutboxEvent` in the same transaction;
15. store the `Idempotency` outcome containing order ID/reference and non-secret replay metadata;
16. commit and return `CompleteOrderResponse`, recomputing the deterministic verification code from the order ID/key version.

The advisory lock prevents concurrent same-key requests from both performing the expensive command. The unique `Idempotency` primary key remains the database backstop.

Any exception before commit rolls back order rows, lines, reservations, slot booking, audit, outbox and idempotency outcome together.

## Reservation duration

Checkout uses a configured online reservation TTL. The command passes one absolute expiry timestamp into `AllocationService`; all lines in the order share that reservation deadline.

Electronic-payment orders use the short checkout-payment TTL. Cash-on-delivery and cash-at-counter collection orders require a longer configurable fulfilment hold TTL because no immediate electronic callback will confirm them. These durations are configuration, never hard-coded in the controller.

Expiry still belongs to Inventory. Orders read reservation state and must tolerate a hold being expired by Inventory; this slice does not invent payment recovery after expiry.

## Payment boundary

This slice stores the selected payment method and initial payment status only.

`paymentRequired=true` for `mobile_money`, `card_hosted` and `bank_transfer`; the response indicates that the future Payments slice must continue the flow. No provider call is issued and no `PaymentAttempt` is created here.

`checkout.payment-outcome` remains unimplemented in the production API. Browser/demo simulation continues only in demo transport.

A later Payments module may transition `pending` to verified outcomes and must handle late success after reservation expiry. Orders must not infer payment success from redirects, screenshots or client assertions.

## Order reads and projection

The customer-safe `PublicOrder` projection preserves separate payment, fulfilment and delivery status dimensions.

It contains contact/order summary, line snapshots, customer-safe events/notes, selected payment method, totals and slot label. It excludes internal audit data, internal notes, staff identities not intended for the customer, reservation implementation metadata and unrelated customer identifiers. Because the existing portable `OrderLineView` requires an `allocations` array, the customer projection returns `allocations: []`; lot IDs are not exposed publicly. A later staff projection may expose FEFO lot detail under staff authorization.

Until Payments/Delivery modules exist, `paymentAttempts`, delivery job and returns arrays are empty/absent according to the existing additive contract. The API must not fabricate demo provider records.

`GET /account/orders` is authenticated-customer only and returns only that principal's orders with bounded pagination/newest-first ordering.

## Tracking

`POST /api/v1/orders/track` accepts `{reference, code}`. Reference lookup must not reveal whether a reference exists through materially different unauthenticated error detail. Invalid reference/code combinations return the same customer-facing authorization failure.

Successful tracking returns only the public projection. Failed attempts participate in rate limiting and security logging without logging the submitted verification code.

## Cancellation

`POST /api/v1/account/orders/{orderId}/cancel` requires an authenticated customer who owns the order. Guest self-service cancellation is not enabled in this slice; guest users may track and contact support until a separate signed guest-mutation capability is designed.

Cancellation runs in one transaction and:

1. locks the order row;
2. verifies ownership and current version/state;
3. treats an already-cancelled order as an idempotent success when the semantic request matches;
4. refuses cancellation after stock consumption, dispatch, delivery or collection;
5. refuses any state that already represents captured money with `RULE_VIOLATION` / refund-workflow-required until Payments/Refunds owns that path;
6. changes fulfilment status to `cancelled`, increments version and records reason/time;
7. calls `AllocationService.release(tx, "order", orderId, ...)`;
8. releases any active delivery-slot booking;
9. appends order event, audit and outbox records;
10. commits atomically.

Reservation release and slot release are once-only. Retrying cancellation never increases capacity twice and never releases another order's reservations.

## API surface added by this slice

Implemented production operations:

| Operation | Endpoint | Access |
| --- | --- | --- |
| `checkout.zones` | `GET /api/v1/checkout/zones` | Public |
| `checkout.slots` | `GET /api/v1/checkout/zones/{zoneId}/slots` | Public |
| `checkout.quote` | `POST /api/v1/checkout/quote` | Public/guest session established |
| `checkout.complete` | `POST /api/v1/checkout/complete` | Customer or guest capability; idempotent |
| `checkout.status` | `GET /api/v1/orders/{orderId}` | Owning customer or owning guest session |
| `orders.track` | `POST /api/v1/orders/track` | Reference + verification code |
| `account.orders` | `GET /api/v1/account/orders` | Authenticated owning customer |
| `account.cancel` | `POST /api/v1/account/orders/{orderId}/cancel` | Authenticated owning customer |

`orders.detail` remains a staff-facing operation and is not exposed through the customer route merely because the mock currently shares a projection.

## Error semantics

Use existing machine-readable errors and HTTP mappings:

- `VALIDATION_FAILED` for malformed contact/address/slot/quantity input;
- `NOT_FOUND` when an authorized resource does not exist;
- `UNAUTHENTICATED` for missing required customer credentials;
- `FORBIDDEN` for authenticated ownership violations;
- `OUT_OF_STOCK` with line conflicts from Inventory;
- `IDEMPOTENCY_CONFLICT` for same replay key with different semantic input;
- `CONFLICT` for slot capacity, stale version or policy changes;
- `RULE_VIOLATION` when cancellation requires the future refund workflow;
- `INTERNAL` for unexpected faults after automatic transaction rollback.

Unauthenticated tracking deliberately normalizes reference/code failures to avoid an order-existence oracle.

## Audit and outbox

At minimum, emit durable business events for:

- `order.created`;
- `order.cancelled`;
- `delivery.slot_booked`;
- `delivery.slot_released` where a booking existed.

Inventory continues to emit reservation allocation/release events from its own service in the same caller transaction. Event IDs are durable and workers remain at-least-once consumers with deduplication.

Audit metadata may include request ID, owner type/id, order ID, location, zone and reason, but must not include raw session tokens, CSRF values, verification codes or unnecessary address secrets.

## Concurrency and failure invariants

The implementation must prove all of the following:

- two customers racing for the final stock unit produce one order winner and one `OUT_OF_STOCK` loser;
- a multi-line checkout with one unavailable line creates no order and no reservations;
- two requests with the same actor/key/input return one order;
- same actor/key with changed input returns `IDEMPOTENCY_CONFLICT` and mutates nothing;
- the same textual key used by two different guest/customer scopes is independent;
- two customers racing for one remaining delivery-slot capacity produce one booking winner;
- injected audit or outbox failure rolls back order, allocation and slot booking;
- cancellation and reservation release are idempotent;
- cancellation cannot race with a later protected state transition without row/version conflict;
- expired reservations are never treated as active availability merely because a cleanup worker is delayed.

## Contract compatibility

Preserve the current portable request/response names wherever they are already sound. Necessary security changes are additive or tighten server behavior rather than trusting mock-only fields.

`CompleteOrderResponse` still returns `orderId`, `reference`, `verificationCode`, and `paymentRequired`. The verification code is reproducible for durable replay without plaintext database storage.

The generated foundation OpenAPI becomes a broader production OpenAPI only for endpoints implemented by this slice. The 92-operation target remains a roadmap, not evidence of implementation.

## Migration and seed strategy

Create one forward-only migration after the Commerce Reservation Core migration. It adds order, guest-session, address snapshot and delivery configuration tables plus constraints/indexes.

Development/test seed data must include:

- one configured active commerce location;
- at least two active delivery zones with different minimums/fees;
- bounded delivery slots including one final-capacity test slot;
- catalogue variants with integer and fractional-unit cases.

Do not seed fake successful provider payments into the production API database path for this milestone.

## Verification plan

Required backend tests include:

1. migrations from an empty PostgreSQL 17 database;
2. quote price/availability/minimum calculations;
3. exact half-up weighted line rounding without JavaScript floats;
4. forged body `customerId` cannot establish ownership;
5. saved address belongs to authenticated customer;
6. guest session A cannot read guest session B's order;
7. authenticated customer A cannot read/list/cancel customer B's order;
8. guessed order ID without ownership returns no data;
9. tracking requires correct reference + verification code and does not log the code;
10. tracking throttle behavior;
11. duplicate checkout exact replay;
12. duplicate key changed payload conflict;
13. final-stock concurrency across independent clients;
14. full multi-line rollback;
15. safety stock still enforced by AllocationService;
16. concurrent final delivery-slot capacity;
17. slot mismatch/inactive/past/full rejection;
18. cancellation releases reservations and slot exactly once;
19. cancellation after protected handover/dispatch state is refused;
20. audit/outbox fault injection rolls the whole command back;
21. no production payment-outcome endpoint appears;
22. no controller writes Reservation directly.

Repository gates remain mandatory: API tests, contract checks, strict TypeScript, lint, production web build, handoff regressions, business acceptance and route sweep. GitHub PostgreSQL-17 CI is the compatibility authority after PR creation.

## Rollout boundary

After this slice merges, the public storefront still remains on demo transport. Checkout/orders authority is necessary but not sufficient for production activation.

The next Commerce Authority slice should implement stock handover/depletion and the staff fulfilment transitions that lead to it, or POS on top of the same allocator depending on milestone sequencing. Money-provider integration follows with verified callbacks/reconciliation before the public web can be switched to one consistent production authority.
