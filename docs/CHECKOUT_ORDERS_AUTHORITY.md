# Checkout + Orders Authority

**Status:** implemented production backend subset, 10 October 2026. The public Next.js storefront remains on demo transport until Payments, stock handover/depletion and delivery/fulfilment authority are ready.

## Authority boundaries

`OrdersModule` owns online order records, immutable line/address snapshots, customer-safe order events, durable checkout idempotency, guest/customer ownership, tracking and cancellation. It never writes `Reservation` directly. `AllocationService` remains the sole stock-reservation writer and `DeliveryConfigService` owns slot capacity/bookings. Payments are intentionally not implemented here; no provider callback or `PaymentAttempt` authority is exposed.

## Implemented commerce routes

The `/api/v1` production subset adds `GET /checkout/zones`, `GET /checkout/zones/{zoneId}/slots`, `POST /checkout/quote`, `POST /checkout/complete`, `GET /orders/{orderId}`, `POST /orders/track`, `GET /account/orders`, and `POST /account/orders/{orderId}/cancel`.

Quote is non-promissory and always uses current published variants, the configured commerce location, exact Decimal line pricing, safety-stock-aware availability and active delivery policy. Checkout revalidates all of those facts again inside the command.

## Atomic checkout and replay

`POST /checkout/complete` requires `Idempotency-Key`. The durable replay scope is the authenticated customer or guest-session capability plus operation and key. The semantic request hash excludes transport replay metadata and compatibility `customerId`. Same scope/key/request returns the original order; changed input returns `IDEMPOTENCY_CONFLICT`.

One PostgreSQL transaction creates the order and immutable snapshots, calls Inventory allocation for every line, locks/books an optional delivery slot, appends the customer event, writes audit/outbox rows and records the replay outcome. A failure at any point rolls everything back. Electronic payment methods begin `pending`; counter/COD remain `unpaid`. The replay record contains only non-secret order metadata; the verification code is deterministically re-derived from the retained versioned HMAC key.

## Guest and customer security

Guests receive a random `vg_guest` HttpOnly cookie and separate readable CSRF cookie; PostgreSQL stores only token/CSRF hashes. Guest mutations require a trusted Origin and matching `X-CSRF-Token`. A first mutation without a capability bootstraps cookies but is rejected before business mutation, forcing a safe retry. Expired or revoked guest sessions never regain ownership.

Presented customer credentials always fail closed if invalid or non-customer; they never downgrade to guest. `customerId` in a request cannot establish ownership. Owner status requires either the owning customer session or the exact owning guest capability. Public tracking instead requires reference plus verification code and uses durable 15-minute hashed failure counters; submitted codes are not persisted.

## Delivery and cancellation

Slot capacity is derived from active bookings. The final-capacity decision locks the exact slot row `FOR UPDATE`, preventing two API instances from booking the same last place. Cancellation is authenticated-customer only. It locks the order, refuses post-handover/terminal or refund-sensitive captured-money states, updates cancellation/version, releases Inventory reservations and releases any active slot booking in one transaction. Repeating the same cancellation does not duplicate release events/capacity.

## Configuration

Commerce is closed when the entire bundle is absent and startup fails on a partial/malformed bundle: `COMMERCE_LOCATION_ID`, `CHECKOUT_PAYMENT_HOLD_MINUTES`, `CHECKOUT_OFFLINE_HOLD_MINUTES`, `GUEST_CHECKOUT_TTL_MINUTES`, `ORDER_VERIFICATION_ACTIVE_VERSION`, `ORDER_VERIFICATION_KEYS`. Readiness is 503 when commerce is configured against a missing/inactive location while liveness remains available.

## Database and verification

Migration `202610100003_checkout_orders_authority` adds guest sessions, customer addresses, delivery zones/slots/bookings, orders/lines/address snapshots/events and tracking throttle. PostgreSQL constraints enforce ownership XOR, status/money invariants and positive capacity; order lines, delivery snapshots and order events are append-only.

Verification includes fresh 001/002/003 migration, exact pricing, price-change, final-unit stock race, final-slot race, replay races/conflicts, guest isolation, ownership privacy, tracking throttles/key rotation, cancellation row-lock race, audit/outbox fault rollback, generated OpenAPI drift, the complete API suite and all existing repository gates.

## Deferred production boundaries

Still intentionally absent: payment-provider outcomes/charging/refunds, `PaymentAttempt` authority, stock consume/handover, staff fulfilment transitions, dispatch/riders, POS completion, outbox publisher, Redis-backed public-edge tracking limits, and frontend production transport cutover. Those must land before the public shop is switched from demo mode.
