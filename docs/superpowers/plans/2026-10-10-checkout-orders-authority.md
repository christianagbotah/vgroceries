# Checkout + Orders Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build durable, concurrency-safe online checkout and customer order authority on the merged FEFO reservation core without switching the public storefront away from demo transport.

**Architecture:** Add focused Orders and DeliveryConfig modules to the existing NestJS/PostgreSQL API. Orders owns checkout/order records, guest/customer ownership, projections and cancellation; Inventory remains the only reservation mutation authority through `AllocationService`, and DeliveryConfig owns zone/slot capacity. Every checkout side effect is committed in one PostgreSQL transaction with durable scoped idempotency.

**Tech Stack:** Node.js 24, TypeScript 5.9.3, NestJS 11.2.7, Prisma 7.10.0, PostgreSQL 17, Zod 4.3.5, Node `crypto`; no new runtime dependency is required.

**Spec:** `docs/superpowers/specs/2026-10-10-checkout-orders-authority-design.md`

## Global Constraints

- Public Next.js storefront remains on demo transport after this branch; do not set `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL` or remove demo behavior.
- Inventory alone mutates `Reservation`; Orders may only call `AllocationService.create/release/expire`.
- Money authority is integer GHS minor units. Checkout line totals use exact `Prisma.Decimal` and decimal half-up rounding; JavaScript floating-point multiplication is forbidden for authoritative totals.
- Quantities are positive decimal strings with at most three fractional digits; non-`kg`/`litre` units require whole quantities.
- Online stock source is explicit `COMMERCE_LOCATION_ID`; absence/inactive location closes checkout/readiness and never falls back to the first location.
- Authenticated ownership comes only from the validated session principal. Guest ownership comes only from a validated guest-session cookie. Body `customerId`, names, phone numbers, references and IDs never grant authority.
- Guest session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`; guest mutation CSRF is a separate token and trusted-Origin checks still apply.
- `checkout.payment-outcome`, provider calls, PaymentAttempt creation, refunds, stock handover/depletion, POS, staff fulfilment transitions and dispatch remain unimplemented.
- Customer projections never expose reservation metadata/lot IDs; current required `allocations` arrays render as `[]`.
- One forward-only migration follows `202610100002_commerce_reservation_core`; GitHub PostgreSQL 17 remains the compatibility authority.
- Keep existing `{ok,data}` / safe error envelope, request IDs, no-store headers and current API error codes.

## Review Focus

1. **First guest checkout without a prior quote/session:** establish guest cookies but create no order; reject that first mutation until the client retries with the issued guest CSRF token.
2. **Duplicate variant IDs in one basket:** reject before pricing/allocation so one cart line cannot create ambiguous duplicate order-line claims.
3. **Expired/revoked guest capability:** it must not read a prior guest order; quote may establish a new guest session without transferring ownership.
4. **Verification-key rotation:** an order created under a retained old key version must still replay the identical 10-character tracking code and verify successfully.
5. **Contact/address boundary input:** trim accepted text, reject empty-after-trim fields and malformed Ghana phone/email/GhanaPostGPS values before any order or hold is written.

---

## File Structure

**Shared contracts/config**
- Modify `packages/contracts/src/checkout.ts` — additive delivery policy fields and stable checkout/order response types.
- Modify `packages/contracts/src/validation.ts` — REST checkout body, tracking, account order query/cancel validation.
- Modify `apps/api/src/config.ts` — commerce location, hold TTLs, guest TTL and verification key-ring configuration.
- Modify `.github/workflows/api.yml` — PostgreSQL-17 test configuration for the new required settings.

**Orders domain**
- Create `apps/api/src/orders/checkout.values.ts` — exact line pricing, normalized semantic checkout payload/hash helpers and contact validation.
- Create `apps/api/src/orders/verification-code.service.ts` — versioned deterministic Crockford Base32 code generation/verification.
- Create `apps/api/src/orders/guest-checkout.service.ts` — guest session creation, cookie/CSRF validation and revocation/expiry checks.
- Create `apps/api/src/orders/checkout-principal.service.ts` — authenticated customer vs guest capability resolution.
- Create `apps/api/src/orders/checkout-quote.service.ts` — authoritative quote rules with no mutations.
- Create `apps/api/src/orders/checkout-command.service.ts` — atomic idempotent order + allocation + slot booking command.
- Create `apps/api/src/orders/order-projection.service.ts` — customer-safe `PublicOrder` mapping.
- Create `apps/api/src/orders/order-query.service.ts` — owner status/list reads and tracking lookup.
- Create `apps/api/src/orders/tracking-throttle.service.ts` — durable failed-tracking throttle until Redis-backed public activation.
- Create `apps/api/src/orders/order-cancellation.service.ts` — locked pre-handover cancellation/release.
- Create `apps/api/src/orders/checkout.controller.ts`, `orders.controller.ts`, `account-orders.controller.ts`, `orders.module.ts` — HTTP wiring only.

**Delivery configuration**
- Create `apps/api/src/delivery-config/delivery-config.service.ts` — zone/slot reads plus transaction-scoped book/release operations.
- Create `apps/api/src/delivery-config/delivery-config.controller.ts` and `delivery-config.module.ts` — public zone/slot reads.

**Persistence/integration**
- Modify `apps/api/prisma/schema.prisma`.
- Create `apps/api/prisma/migrations/202610100003_checkout_orders_authority/migration.sql`.
- Modify `apps/api/src/bootstrap.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/http/openapi.ts`.
- Modify `apps/api/scripts/seed-preview.ts` for development delivery/customer fixtures.
- Create focused tests under `apps/api/test/checkout-values.spec.ts`, `commerce-schema.spec.ts`, `guest-checkout.spec.ts`, `delivery-config.spec.ts`, `checkout-quote.spec.ts`, `checkout-command.spec.ts`, `order-reads.spec.ts`, `order-cancel.spec.ts` plus shared `apps/api/test/commerce-fixtures.ts`.
- Update `docs/openapi-foundation.json`, `docs/API_CONTRACTS.md`, `docs/BACKEND_FOUNDATION.md` and add `docs/CHECKOUT_ORDERS_AUTHORITY.md`.

### Task 1: Lock contracts, configuration and pure checkout values

**Files:**
- Modify: `packages/contracts/src/checkout.ts`
- Modify: `packages/contracts/src/validation.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `.github/workflows/api.yml`
- Create: `apps/api/src/orders/checkout.values.ts`
- Create: `apps/api/src/orders/verification-code.service.ts`
- Test: `apps/api/test/checkout-values.spec.ts`

**Interfaces:**
- Produces: `roundLineTotalMinor(unitPriceMinor: number, quantity: string): number`.
- Produces: `canonicalCheckoutRequest(input: CompleteOrderRequest): Record<string, unknown>` and `checkoutRequestHash(input: CompleteOrderRequest): string`; both exclude transport `idempotencyKey` and normalize only semantic fields.
- Produces: `validateCheckoutContact(...)` / `validateCheckoutLines(...)` helpers that throw `ApiProblem(400,"VALIDATION_FAILED",...)`.
- Produces: `VerificationCodeService.codeFor(orderId: string, keyVersion?: number): string`, `digestFor(orderId: string, code: string, keyVersion: number): string`, `verify(orderId: string, code: string, keyVersion: number, storedDigest: string): boolean`.
- Extends `ApiConfig` with `commerce: CommerceConfig | null`, where `CommerceConfig` contains `locationId`, `paymentHoldMinutes`, `offlineHoldMinutes`, `guestTtlMinutes`, `verificationActiveKeyVersion`, and `verificationKeys: Map<number, Buffer>`. A fully absent commerce bundle keeps the API bootable with commerce closed; a partially supplied or malformed bundle is a startup configuration error.

- [ ] **Step 1: Write failing pure-value/config tests**

Add tests named:
- `weighted price rounds half up at the line boundary` asserting `125 * 0.5 => 63`, `199 * 1.005 => 200`, and exact integer results without `Number(quantity)` multiplication.
- `count lines reject fractional and duplicate variants`.
- `semantic checkout hash ignores replay metadata and redundant matching customerId but changes with business input`.
- `verification codes are 10 Crockford characters deterministic and versioned`.
- `retained verification key versions reproduce old codes`.
- `checkout config allows the fully absent commerce bundle as closed, rejects partial/malformed bundles, and accepts a complete bundle with the active key present`.
- contact/address Review Focus cases: whitespace-only required fields and malformed Ghana phone/email/GhanaPostGPS fail before mutation helpers return.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/checkout-values.spec.js`
Expected: FAIL because checkout value/verification modules and commerce config fields do not exist.

- [ ] **Step 3: Extend portable contracts without breaking demo transport**

In `checkout.ts`, add optional `slotPolicy?: "required" | "optional" | "none"` and `codEnabled?: boolean` to `ZoneView`. In `validation.ts`, add/export `slotViewSchema`, a backend REST checkout-body schema where body `idempotencyKey` is optional, plus reusable replay-key validation `^[A-Za-z0-9:_-]{8,128}$`, `trackRequestSchema`, bounded `accountOrdersQuerySchema` (`page` default 1, `perPage` default 50, max 100, optional compatibility `customerId`), and a path-oriented cancellation body schema (`reason`, optional compatibility `orderId`). Preserve the existing mock request schemas.

- [ ] **Step 4: Add strict commerce configuration**

Parse the commerce env bundle `COMMERCE_LOCATION_ID`, `CHECKOUT_PAYMENT_HOLD_MINUTES`, `CHECKOUT_OFFLINE_HOLD_MINUTES`, `GUEST_CHECKOUT_TTL_MINUTES`, `ORDER_VERIFICATION_ACTIVE_VERSION`, `ORDER_VERIFICATION_KEYS`. If all six are absent, set `config.commerce = null`; if any are present, require all six and validate them. `ORDER_VERIFICATION_KEYS` is a JSON object mapping positive integer version strings to 64-hex-character (32-byte) keys and must contain the active version. TTLs are positive integers; no production default is invented.

Update API CI env with deterministic test-only values: commerce location `loc_accra`, payment hold `15`, offline hold `1440`, guest TTL `1440`, active verification version `1`, and one fixed 32-byte hex key.

- [ ] **Step 5: Implement exact checkout values and versioned verification codes**

Use `Prisma.Decimal.mul(...).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)` for line totals. Canonicalization sorts object keys and excludes replay transport metadata plus compatibility `customerId` (the principal already scopes replay); it preserves line order and normalized semantic values. Verification code derivation is `HMAC-SHA256(key, "order-code-v1:" + orderId)` encoded to the first 50 bits as 10 Crockford Base32 characters. Stored digest is `HMAC-SHA256(key, "order-code-hash-v1:" + orderId + ":" + normalizedCode)` and comparison is constant-time.

- [ ] **Step 6: Run focused tests plus shared contract checks**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/checkout-values.spec.js && bun scripts/contracts-check.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/checkout.ts packages/contracts/src/validation.ts apps/api/src/config.ts apps/api/src/orders/checkout.values.ts apps/api/src/orders/verification-code.service.ts apps/api/test/checkout-values.spec.ts .github/workflows/api.yml
git commit -m "feat: define checkout authority values"
```

### Task 2: Add durable commerce persistence and readiness invariants

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610100003_checkout_orders_authority/migration.sql`
- Create: `apps/api/test/commerce-fixtures.ts`
- Create: `apps/api/test/commerce-schema.spec.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/scripts/seed-preview.ts`

**Interfaces:**
- Produces Prisma models: `GuestCheckoutSession`, `CustomerAddress`, `DeliveryZone`, `DeliverySlot`, `Order`, `OrderDeliveryAddress`, `OrderLine`, `OrderEvent`, `DeliverySlotBooking`, `TrackingThrottle`.
- `Order` has exactly one owner (`customerUserId XOR guestSessionId`), version `1` initially, non-negative integer money fields, immutable snapshot lines, `verificationKeyVersion`, `verificationCodeHash`.
- `DeliverySlotBooking.state` is `active | released`; one booking per order. `DeliveryZone` also persists the existing contract display fields `areas`, `serviceHours`, `cutoff`, and non-authoritative `slotsPerDay` alongside fee/minimum/slotPolicy/COD policy; actual capacity still comes only from slot rows + active bookings. `CustomerAddress` and `OrderDeliveryAddress` carry label/recipient/phone/locality/street/optional landmark/GhanaPostGPS, with the order snapshot unique by order ID.

- [ ] **Step 1: Write schema/constraint tests before the migration exists**

Tests assert owner XOR enforcement, non-negative order money, positive slot capacity, supported order/booking/status values, unique order reference, unique order booking, address ownership FKs, 64-hex verification digest shape, a tracking throttle durable key, and database append-only/immutable protection for `OrderLine`, `OrderDeliveryAddress` and `OrderEvent` updates/deletes. Add a readiness test proving absent/inactive configured commerce location returns `503 UNAVAILABLE` while liveness remains `200`.

- [ ] **Step 2: Verify RED against current Prisma client/database**

Run: `npm run --prefix apps/api generate && npm run --prefix apps/api build && node --test apps/api/dist/test/commerce-schema.spec.js`
Expected: FAIL because commerce models/migration do not exist.

- [ ] **Step 3: Add Prisma models and a forward-only SQL migration**

Use PostgreSQL `CHECK` constraints for owner XOR, supported string states/channels/slot policy/booking state, positive slot capacity, non-negative money and verification digest shape. Add trigger protection so committed `OrderLine`, `OrderDeliveryAddress` and `OrderEvent` rows cannot be updated/deleted; corrections use later business events rather than history rewrites. Use FK indexes for owner/order/slot/zone lookups and unique constraints for order reference and one booking per order. `OrderLine.quantity` is `Decimal(15,3)` and timestamps are `timestamptz`.

- [ ] **Step 4: Apply from an empty test database and generate Prisma**

Run: `npm run --prefix apps/api generate && npm run --prefix apps/api migrate:deploy`
Expected: migrations `001`, `002`, `003` apply cleanly to the isolated PostgreSQL database.

- [ ] **Step 5: Add shared commerce fixtures and preview seed records**

`commerce-fixtures.ts` resets commerce tables safely and seeds two customers, owned addresses, active/inactive zones, required/optional/none slot-policy examples, future/past/full/final-capacity slots, fractional `kg` and integer `piece` variants, and the configured commerce location. `seed-preview.ts` adds equivalent development-safe configuration without successful fake provider payments.

- [ ] **Step 6: Enforce commerce-location readiness**

Inject `API_CONFIG` into `HealthController`; `/health/ready` checks PostgreSQL plus `config.commerce` exists and its `locationId` resolves to an active `Location`, otherwise returns `503 UNAVAILABLE`. Quote/checkout services use the same fail-closed commerce guard rather than falling back to `stockLocationId`. Preserve the existing successful response shape.

- [ ] **Step 7: Run schema tests and full existing API tests**

Run: `npm test --prefix apps/api`
Expected: all pre-existing tests plus `commerce-schema.spec` PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/health/health.controller.ts apps/api/scripts/seed-preview.ts apps/api/test/commerce-fixtures.ts apps/api/test/commerce-schema.spec.ts
git commit -m "feat: add durable checkout order schema"
```

### Task 3: Establish secure guest checkout capabilities and principal resolution

**Files:**
- Create: `apps/api/src/orders/guest-checkout.service.ts`
- Create: `apps/api/src/orders/checkout-principal.service.ts`
- Create: `apps/api/src/orders/orders.module.ts`
- Create: `apps/api/test/guest-checkout.spec.ts`
- Modify: `apps/api/src/bootstrap.ts`

**Interfaces:**
- Produces `GuestCheckoutContext { guestSessionId: string; actorId: string; actorScope: string }`.
- Produces `CheckoutPrincipal = { kind:"customer"; userId:string; actorId:string; actorScope:string } | { kind:"guest"; guestSessionId:string; actorId:string; actorScope:string }`.
- `GuestCheckoutService.ensure(req,res)` creates/reuses `vg_guest` and companion `vg_guest_csrf` cookies and returns the durable guest context.
- `GuestCheckoutService.requireMutation(req,res)` requires trusted Origin plus matching `X-CSRF-Token`; a missing/expired capability is bootstrapped but the current mutation is rejected before domain work.
- `CheckoutPrincipalService.forMutation(req,res)` uses authenticated customer credentials when present; otherwise guest mutation capability. Present-but-invalid or non-customer credentials fail closed and never downgrade to guest.
- `CheckoutPrincipalService.forRead(req): Promise<CheckoutPrincipal>` resolves an existing owning customer/guest capability without creating ownership; missing credentials/capability return `UNAUTHENTICATED`.

- [ ] **Step 1: Write guest security tests**

Cover HttpOnly/Secure/SameSite guest cookie attributes, separate readable CSRF cookie, hashed-only storage, trusted-Origin enforcement, invalid CSRF, expiry/revocation, cross-API-instance reuse, and no raw token in database/audit. Include Review Focus service tests: `requireMutation` with no guest session establishes cookies but returns `403` before invoking any domain callback; an expired guest capability is rejected and a later `ensure` creates a distinct session rather than reviving ownership. The full HTTP zero-order assertion is repeated in Task 6 once `/checkout/complete` exists.

- [ ] **Step 2: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/guest-checkout.spec.js`
Expected: FAIL because guest/principal services are missing.

- [ ] **Step 3: Implement guest capability storage and cookie helpers**

Reuse `randomToken`, `tokenHash`, `sameSecretHash`, `trustedOrigin` and configured `secureCookies`. Touch `lastSeenAt` only for a valid live session. Never accept guest session IDs or token material from the body.

- [ ] **Step 4: Implement principal resolution without weakening Identity**

Detect presence of `vg_session`/Bearer credentials. When present, call `IdentityService.authenticate(req)` and require role `customer`. When absent, use guest capability. Do not catch authentication failures and silently continue as guest.

- [ ] **Step 5: Register `OrdersModule` in the application and run tests**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/guest-checkout.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders apps/api/src/bootstrap.ts apps/api/test/guest-checkout.spec.ts
git commit -m "feat: secure guest checkout capability"
```

### Task 4: Implement delivery-zone reads and concurrency-safe slot capacity

**Files:**
- Create: `apps/api/src/delivery-config/delivery-config.service.ts`
- Create: `apps/api/src/delivery-config/delivery-config.controller.ts`
- Create: `apps/api/src/delivery-config/delivery-config.module.ts`
- Create: `apps/api/test/delivery-config.spec.ts`
- Modify: `apps/api/src/bootstrap.ts`

**Interfaces:**
- Implements operations `checkout.zones` and `checkout.slots` at their documented `/api/v1/checkout/...` routes.
- Produces `DeliveryConfigService.listZones(): Promise<ZoneView[]>`.
- Produces `DeliveryConfigService.listSlots(zoneId: string, now?: Date): Promise<SlotView[]>` with `booked` derived from active bookings.
- Produces `DeliveryConfigService.requireZone(tx, zoneId): Promise<DeliveryZone>`.
- Produces `DeliveryConfigService.lockAndBookSlot(tx, { orderId, zoneId, slotId, now }, context: { actorId:string; requestId:string }): Promise<DeliverySlotBooking>` and writes `delivery.slot_booked` audit/outbox in the caller transaction.
- Produces `DeliveryConfigService.releaseBooking(tx, orderId, context: { actorId:string; requestId:string }): Promise<number>`; when a booking changes it writes `delivery.slot_released` audit/outbox in the caller transaction.

- [ ] **Step 1: Write delivery read/capacity tests**

Assert inactive zones are hidden, zone response carries additive slot/COD policy, only active future slots appear, `booked` equals active booking count, and zone mismatch/inactive/past/full slots return `VALIDATION_FAILED` or `CONFLICT` without a booking. Add two independent API/database clients racing for the one-capacity fixture slot and assert one booking winner and one `409 CONFLICT` loser.

- [ ] **Step 2: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/delivery-config.spec.js`
Expected: FAIL because DeliveryConfig module does not exist.

- [ ] **Step 3: Implement public zone/slot reads**

Map persisted UTC slot start/end to `SlotView.date = YYYY-MM-DD` and `window = HH:MM–HH:MM` in UTC; return additive zone policy fields. Do not persist or trust an independently mutable `booked` counter.

- [ ] **Step 4: Implement `FOR UPDATE` slot booking/release**

`lockAndBookSlot` locks the exact slot row, validates zone/active/future policy, counts active bookings while locked, creates one active booking for the order and emits the delivery booking audit/outbox records. `releaseBooking` only changes `active` to `released`; retry returns zero, cannot add capacity twice, and emits release records only when a row actually changes.

- [ ] **Step 5: Wire `DeliveryConfigModule` and run tests**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/delivery-config.spec.js`
Expected: PASS, including the final-capacity race.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/delivery-config apps/api/src/bootstrap.ts apps/api/test/delivery-config.spec.ts
git commit -m "feat: add delivery slot authority"
```

### Task 5: Implement authoritative checkout quoting

**Files:**
- Create: `apps/api/src/orders/checkout-quote.service.ts`
- Create: `apps/api/src/orders/checkout.controller.ts`
- Create: `apps/api/test/checkout-quote.spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

**Interfaces:**
- Implements operation `checkout.quote` at `POST /api/v1/checkout/quote`.
- Produces `type CheckoutQuoteInput = { lines: CartLineInput[]; zoneId?: string }` and `CheckoutQuoteService.quote(input: CheckoutQuoteInput): Promise<QuoteResponse>` where absent `zoneId` is a collection quote and a present zone is a delivery quote.
- `POST /api/v1/checkout/quote` validates body with shared schema, ensures a guest capability when no customer session is required, creates no order/reservation/booking, and returns the existing `QuoteResponse` shape.

- [ ] **Step 1: Write quote tests**

Assert current published/active variant price snapshots, safety-stock-aware availability, active-but-expired reservations being ignored without waiting for cleanup, from `variant_availability`, exact half-up weighted pricing, merchandise-subtotal delivery minimum, zero-fee collection quote, unknown/inactive zone rejection, out-of-stock conflict details, duplicate variant rejection, unpublished/inactive variant rejection, count-unit fraction rejection and no order/reservation/booking side effects.

Include a price-change case: quote once, update `Variant.priceMinor`, quote again, and assert the new authoritative price appears.

- [ ] **Step 2: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/checkout-quote.spec.js`
Expected: FAIL because quote service/route is absent.

- [ ] **Step 3: Implement quote reads using the configured commerce location**

Load all variants/products in one bounded query, validate publication/activity and unit increments, require `config.commerce`, then read `variant_availability` for `config.commerce.locationId`, calculate line totals through `roundLineTotalMinor`, and map Inventory-style conflicts to the portable quote conflict shape. The quote does not lock stock and explicitly remains non-promissory.

- [ ] **Step 4: Expose the route and guest bootstrap**

Annotate quote with HTTP 200. Controller validation must not trust client prices/totals. Ensure guest cookies can be established by quote; quote remains usable without authentication and without mutation CSRF because it creates no business state beyond the guest capability.

- [ ] **Step 5: Run focused and allocation regression tests**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/checkout-quote.spec.js apps/api/dist/test/allocation-values.spec.js apps/api/dist/test/allocation.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/checkout-quote.service.ts apps/api/src/orders/checkout.controller.ts apps/api/src/orders/orders.module.ts apps/api/test/checkout-quote.spec.ts
git commit -m "feat: add authoritative checkout quotes"
```

### Task 6: Implement one atomic idempotent checkout command

**Files:**
- Create: `apps/api/src/orders/checkout-command.service.ts`
- Create: `apps/api/test/checkout-command.spec.ts`
- Modify: `apps/api/src/orders/checkout.controller.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

**Interfaces:**
- Produces `CheckoutCommandService.complete(req: ApiRequest, principal: CheckoutPrincipal, input: CompleteOrderRequest, idempotencyKey: string): Promise<CompleteOrderResponse>`.
- Consumes `AllocationService.create(tx, CreateAllocationInput)` and `DeliveryConfigService.lockAndBookSlot(...)` only; it never mutates Reservation directly.
- Uses actor scope `customer:<userId>` or `guest:<guestSessionId>` as `Idempotency.actorId`; operation is exactly `checkout.complete`.
- All order lines share one absolute `expiresAt`: electronic methods use `config.commerce.paymentHoldMinutes`; COD/cash-counter use `config.commerce.offlineHoldMinutes`.

- [ ] **Step 1: Write checkout command tests for atomic happy paths and policy**

Cover guest and authenticated-customer checkout, plus a direct first guest `POST /checkout/complete` without prior quote that sets guest cookies but returns `403` and creates zero order/reservation/booking rows; then cover immutable line/name/unit/price snapshots, address snapshot ownership, collection rejecting zone/slot/address, delivery requiring exactly one valid address source, `cash_counter` collection-only, `cash_on_delivery` delivery-only + COD-enabled zone, required/optional/none slot policies, initial payment/status dimensions, one identical reservation expiry across every line of the order, no `PaymentAttempt`/payment-event authority, and order/audit/outbox/allocation/slot records committed together. Assert the persisted `Idempotency.outcome` contains no verification code, session token, CSRF token or address secret.

- [ ] **Step 2: Add replay and key-scope tests**

Run two independent API instances simultaneously with the same actor/key/body and assert both responses return one order/reference/code and one reservation set. Assert same actor/key with changed quantity returns `409 IDEMPOTENCY_CONFLICT`; the same textual key under two different guest/customer scopes creates independent orders. Assert header/body replay-key mismatch returns `IDEMPOTENCY_CONFLICT`, while header-only REST input is accepted by the backend schema.

- [ ] **Step 3: Add concurrency and rollback tests**

Assert two customer scopes racing for the final stock unit produce one order winner and one `OUT_OF_STOCK` loser; a multi-line checkout with one unavailable line leaves zero new orders/reservations/bookings/idempotency rows. Inject `order.created` outbox failure and audit failure separately and assert order, lines, Inventory allocation, slot booking and idempotency outcome all roll back.

- [ ] **Step 4: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/checkout-command.spec.js`
Expected: FAIL because atomic checkout command is absent.

- [ ] **Step 5: Implement transaction ordering and replay lock**

Within one `db.$transaction`: `pg_advisory_xact_lock(hashtextextended(JSON.stringify([actorScope,"checkout.complete",key]),0))`; read replay record; validate owner/contact/fulfilment/address/current variant prices/zone policy; lock slot when supplied; create order + address snapshot + line IDs; call Inventory allocation using those line IDs; create booking through DeliveryConfig (which emits its own slot event); append placed order event; emit `order.created` audit/outbox; create replay outcome containing only non-secret order metadata. Recompute the tracking code from persisted order ID/key version for both first response and replay.

- [ ] **Step 6: Preserve exact error/transaction semantics**

`OUT_OF_STOCK` preserves line conflict details. Full slot returns `CONFLICT`. Unknown owned address is `NOT_FOUND`; another customer's address is `FORBIDDEN`. Client `customerId` absent/matching principal is tolerated for compatibility; forged mismatch is rejected and never changes owner authority.

- [ ] **Step 7: Run checkout, delivery and allocation suites**

Run: `npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/checkout-command.spec.js apps/api/dist/test/delivery-config.spec.js apps/api/dist/test/allocation.spec.js`
Expected: PASS, including independent-client stock/key/slot races.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orders/checkout-command.service.ts apps/api/src/orders/checkout.controller.ts apps/api/src/orders/orders.module.ts apps/api/test/checkout-command.spec.ts
git commit -m "feat: create atomic online orders"
```

### Task 7: Add customer-safe status, account listing and protected tracking

**Files:**
- Create: `apps/api/src/orders/order-projection.service.ts`
- Create: `apps/api/src/orders/order-query.service.ts`
- Create: `apps/api/src/orders/tracking-throttle.service.ts`
- Create: `apps/api/src/orders/orders.controller.ts`
- Create: `apps/api/src/orders/account-orders.controller.ts`
- Create: `apps/api/test/order-reads.spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

**Interfaces:**
- Produces `OrderProjectionService.publicOrder(orderId: string): Promise<PublicOrder>`; response omits verification code and internal data, returns `paymentAttempts: []`, `returns: []`, `notes: []` (customer-safe notes stay on events in this slice), no `job`, and every line has `allocations: []`.
- Produces `OrderQueryService.status(principal: CheckoutPrincipal, orderId: string): Promise<PublicOrder>`.
- Produces `OrderQueryService.listCustomer(userId: string, page: number, perPage: number): Promise<AccountOrderRow[]>` newest-first bounded account rows, preserving the existing array response contract; pagination controls only bound the query in this slice.
- Produces `OrderQueryService.track(reference: string, code: string, clientKey: string, requestId: string): Promise<PublicOrder>`.
- Produces `TrackingThrottleService.registerFailure(clientKey: string, reference: string): Promise<void>` using `TrackingThrottle`; no submitted code is persisted/logged.

- [ ] **Step 1: Write ownership/privacy tests**

Assert guest A cannot read guest B's order, customer A cannot read/list customer B's order, guessed IDs without ownership return no data, body/customer-name/phone/reference cannot grant status access, expired/revoked guest capability loses access, and non-customer authenticated roles fail closed. Assert public projection has no lot IDs, internal notes, audit rows, staff-only identity, verification code or fabricated payment attempts/jobs/returns.

- [ ] **Step 2: Write tracking/rotation/throttle tests**

Correct reference+code returns only the public projection. Wrong reference and wrong code produce the same safe authorization response/message. Submitted code never appears in `TrackingThrottle`, audit or console-captured security metadata. Repeated failures hit `429 RATE_LIMITED` durably across two API instances. An order stored with retained verification key version still verifies and checkout replay still reproduces its original code after active-key rotation.

- [ ] **Step 3: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/order-reads.spec.js`
Expected: FAIL because projection/query/tracking services and routes are absent.

- [ ] **Step 4: Implement public projection and owner queries**

Build projection from persisted snapshots/events only. Format display labels without changing authoritative raw fields. `GET /orders/:orderId` must use `CheckoutPrincipalService.forRead` and never establish a new capability as authority for an old order. `GET /account/orders` uses mandatory `IdentityService.authenticate` and role `customer`. Its query parser accepts bounded `page`/`perPage` plus optional compatibility `customerId`; a supplied `customerId` must match the principal and never establishes ownership.

- [ ] **Step 5: Implement normalized tracking failures and durable throttle**

Use a 15-minute fixed window with two durable counters: maximum 5 failures per client-address+normalized-reference pair and maximum 100 failures per client address. Store only hashes of client/reference material. Deterministic tests pin both limits. Unknown reference and invalid code share one `FORBIDDEN` response. Security audit records request/reference hash/rate outcome only, never code. Document that Redis-backed limiting remains a public-activation prerequisite.

- [ ] **Step 6: Run read/security tests**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/order-reads.spec.js apps/api/dist/test/guest-checkout.spec.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/orders/order-projection.service.ts apps/api/src/orders/order-query.service.ts apps/api/src/orders/tracking-throttle.service.ts apps/api/src/orders/orders.controller.ts apps/api/src/orders/account-orders.controller.ts apps/api/src/orders/orders.module.ts apps/api/test/order-reads.spec.ts
git commit -m "feat: secure customer order reads"
```

### Task 8: Implement safe customer cancellation with once-only stock/slot release

**Files:**
- Create: `apps/api/src/orders/order-cancellation.service.ts`
- Create: `apps/api/test/order-cancel.spec.ts`
- Modify: `apps/api/src/orders/account-orders.controller.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

**Interfaces:**
- Produces `OrderCancellationService.cancel(req: AuthRequest, orderId: string, reason: string): Promise<AccountCancelResponse>`.
- Cancellation is authenticated-customer only; guest tracking does not imply guest mutation authority.
- Consumes `AllocationService.release(tx,"order",orderId, context)` and `DeliveryConfigService.releaseBooking(tx, orderId)`.

- [ ] **Step 1: Write cancellation ownership/state tests**

Assert unauthenticated/guest/admin/customer-B cancellation of customer-A order is rejected; customer A can cancel an eligible order; already-cancelled retry with the same normalized reason returns `cancelled` while a changed retry reason returns `CONFLICT`; protected `dispatched`, `delivered`, `collected` or `stockConsumedAt` states refuse mutation; payment status `succeeded`, `partially_refunded`, `refund_pending`, `refunded`, or `requires_review` returns `RULE_VIOLATION` with refund-workflow-required behavior; `pending`, `unpaid`, `failed`, and `expired` do not by themselves imply captured money in this pre-Payments slice.

- [ ] **Step 2: Write once-only release and atomic rollback tests**

After cancellation assert all active order reservations are `released`, exactly one active slot booking becomes `released`, order version increments once, reason/time/event persist, `order.cancelled` and conditional `delivery.slot_released` audit/outbox events exist, and repeated cancellation creates no duplicate release events or capacity. Inject order-cancellation audit/outbox failure and assert order status/version, reservations and slot booking all remain unchanged.

- [ ] **Step 3: Add the row-lock race test**

Use two independent PostgreSQL transactions. One path locks the order and performs cancellation; a test-only simulated future protected transition also locks the order and checks the post-lock status/version before attempting `dispatched`. Assert both cannot commit contradictory terminal transitions: cancellation-first makes transition reject, transition-first makes cancellation reject. This pins the locking contract future fulfilment code must follow.

- [ ] **Step 4: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/order-cancel.spec.js`
Expected: FAIL because cancellation service/route is absent.

- [ ] **Step 5: Implement locked cancellation transaction**

`SELECT id FROM "Order" WHERE id=... FOR UPDATE`, reload owner/state, validate current payment/fulfilment/depletion state, update cancelled fields + `version = version + 1`, release Inventory reservations, release slot booking, append customer-safe order event, audit and outbox in that transaction. Emit slot-release event only when an active booking actually changed.

- [ ] **Step 6: Expose `/account/orders/:orderId/cancel` with path/body consistency**

Annotate cancellation with HTTP 200. Authenticate via Identity, require customer role, validate `reason`, and when compatibility body `orderId` is present require it equals the path ID. Never accept `requestedBy`, actor or customer fields as authority.

- [ ] **Step 7: Run cancellation plus allocation/delivery regressions**

Run: `npm run --prefix apps/api build && node --test --test-concurrency=1 apps/api/dist/test/order-cancel.spec.js apps/api/dist/test/allocation.spec.js apps/api/dist/test/delivery-config.spec.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orders/order-cancellation.service.ts apps/api/src/orders/account-orders.controller.ts apps/api/src/orders/orders.module.ts apps/api/test/order-cancel.spec.ts
git commit -m "feat: add atomic customer cancellation"
```

### Task 9: Publish the implemented API surface and run the complete authority gates

**Files:**
- Modify: `apps/api/src/http/openapi.ts`
- Modify: `apps/api/src/bootstrap.ts` if module registration still needs cleanup
- Modify: `docs/openapi-foundation.json`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/BACKEND_FOUNDATION.md`
- Create: `docs/CHECKOUT_ORDERS_AUTHORITY.md`
- Modify: `apps/api/test/foundation.spec.ts`

**Interfaces:**
- Generated OpenAPI adds exactly this slice's implemented production routes: zones, slots, quote, complete, owner status, track, account orders and account cancel.
- OpenAPI continues to omit `checkout.payment-outcome`, staff `orders.detail`, POS completion, fulfilment transitions, refunds, handover/depletion and dispatch.
- Documentation explicitly states frontend cutover is still prohibited.

- [ ] **Step 1: Update the OpenAPI regression test before generator changes**

Replace the old `13 paths` assertion with an exact implemented-route set. Assert `POST /checkout/complete` documents required `Idempotency-Key`, customer/guest security narrative and concrete request/response schemas. Assert quote and tracking use HTTP 200 while complete uses 201 and cancel uses 200. Assert `POST /orders/track` is public capability-based. Assert account list/cancel declare cookie/bearer auth. Assert `/orders/{orderId}/payment-outcome` is absent.

Add a static authority test that reads `apps/api/src/orders/**/*.ts` and fails if it finds direct `tx.reservation.create`, `update`, `updateMany`, `delete` or `deleteMany`; only imports/calls to `AllocationService` are permitted.

- [ ] **Step 2: Verify RED**

Run: `npm run --prefix apps/api build && node --test apps/api/dist/test/foundation.spec.js`
Expected: FAIL until OpenAPI generation is expanded.

- [ ] **Step 3: Expand `foundationOpenApi` only to actual implemented routes**

Change the OpenAPI title/description from foundation-only wording to the implemented production API surface. Add reusable schemas for ZoneView, SlotView, QuoteResponse, CompleteOrderResponse, PublicOrder, the existing `AccountOrderRow[]` response, and cancel response. Add a `guestAuth` cookie security scheme for `vg_guest`; owner-status and checkout-complete document customer cookie/bearer or guest capability alternatives. Quote, zones, slots and tracking remain public/capability reads; account routes remain customer cookie/bearer only. Keep concrete response `data` schemas for every route. Preserve safe error responses and request ID behavior. Do not document roadmap-only endpoints.

- [ ] **Step 4: Regenerate the committed OpenAPI artifact and update checkpoint docs**

Run from `apps/api`: `npm run openapi`.

`docs/CHECKOUT_ORDERS_AUTHORITY.md` records module boundaries, env keys, implemented endpoints, replay/security rules, migration name, verification commands and explicit deferred boundaries. `API_CONTRACTS.md` and `BACKEND_FOUNDATION.md` distinguish the production implemented subset from the 92-operation target.

- [ ] **Step 5: Run fresh PostgreSQL migration + complete API suite**

Using a fresh empty PostgreSQL 17-compatible disposable database, run:

```bash
npm run --prefix apps/api generate
npm run --prefix apps/api migrate:deploy
npm test --prefix apps/api
```

Expected: migrations 001/002/003 apply; all API tests pass, including checkout/order concurrency, security and rollback tests.

- [ ] **Step 6: Run API contract/OpenAPI checks**

```bash
(cd apps/api && npm run openapi)
git diff --exit-code -- docs/openapi-foundation.json
bun scripts/contracts-check.ts
```

Expected: generated OpenAPI matches committed artifact and portable contract checks pass.

- [ ] **Step 7: Run every repository gate**

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

Expected: lint/type/build green; current handoff, Bun, shared-contract, business-acceptance and 56-route sweep suites remain green. Route count changes only if the sweep intentionally covers API endpoints; the public Next.js page surface stays unchanged.

- [ ] **Step 8: Run final boundary/authority scans**

Verify repository search proves:
- Orders source contains no Reservation writes outside `AllocationService`.
- no production controller handles `checkout.payment-outcome`;
- no `PaymentAttempt` creation exists in the new Orders command;
- no frontend production API env/default cutover was introduced;
- public order projection cannot serialize reservation lot IDs.

Run `git diff --check` and inspect `git status --short` for only intended files.

- [ ] **Step 9: Commit the checkpoint**

```bash
git add apps/api/src/http/openapi.ts apps/api/src/bootstrap.ts apps/api/test/foundation.spec.ts docs/openapi-foundation.json docs/API_CONTRACTS.md docs/BACKEND_FOUNDATION.md docs/CHECKOUT_ORDERS_AUTHORITY.md
git commit -m "docs: checkpoint checkout orders authority"
```

## Completion Criteria

The implementation branch is ready for review only when:

- all nine tasks are committed independently and the worktree is clean;
- an empty PostgreSQL database migrates through the checkout/orders migration;
- exact checkout pricing, replay, final-stock race, final-slot race, privacy and fault-injection tests pass;
- customer cancellation releases stock/slot once and cannot cross protected states;
- GitHub PR `API foundation` passes on PostgreSQL 17 and repository `CI` passes;
- production OpenAPI exposes only implemented endpoints and still omits payment outcome;
- public Next.js storefront remains in demo transport.
