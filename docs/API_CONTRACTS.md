# API contracts & domain models

These are **proposed application contracts** for the future backend — not claims about any
third-party endpoint. The prototype implements every operation in the mock service
(`src/services/mock/router.ts`). The service boundary has **two adapters, typed against the
same shared response models** (`src/services/views.ts`):

- `src/services/client.ts` — client components fetch `/api/mock/v1/<operation>` over HTTP;
- `src/services/server-data.ts` — server-rendered pages call the same operations in-process.

A backend swap replaces BOTH adapters (the client points at the real API; server data calls the
real services). Pages never import `src/services/mock` directly — the mock layer can be deleted
once production implementations exist and all imports are re-pointed.

## Conventions

- **Base**: `POST|GET /api/mock/v1/<operation>` (dev mock). Real backend: same operations,
  versioned (`/api/v1/...`), authenticated.
- **Envelope**: `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message", "details" } }`.
- **IDs**: stable prefixed strings (`prd_`, `var_`, `lot_`, `ord_`, `res_`, `ret_`, `ref_`, `job_`, `rdr_`, `stf_`).
- **Timestamps**: UTC ISO-8601 strings. **Money**: integer minor units (pesewas), currency `GHS`,
  visible `₵`. **Quantities**: decimal strings (e.g. `"1.5"`) — never floats as stock authority.
- **Pagination**: `page` + `perPage` with `total`/`pages` in the response (catalogue).
- **Idempotency**: checkout and POS completion carry `idempotencyKey`; payment attempts carry one
  too. Checkout replays return the ORIGINAL order (no second hold); reusing a key with different
  input fails with `IDEMPOTENCY_CONFLICT`; POS replays return the original receipt and never
  double-consume stock.

## Error codes

| Code | Meaning | HTTP (proposed) |
|---|---|---|
| `OUT_OF_STOCK` | Requested quantity exceeds available-to-sell (details carry line conflicts) | 409 |
| `RESERVATION_EXPIRED` | Hold expired before completion | 409 |
| `RESERVATION_LOST` | Consumption attempted while reservations no longer cover the order | 409 |
| `IDEMPOTENCY_CONFLICT` | Idempotency key reused with different input | 409 |
| `VERSION_CONFLICT` | Concurrent modification (backend duty) | 409 |
| `PAYMENT_PENDING` | Electronic payment not confirmed yet | 400 |
| `PAYMENT_REQUIRES_REVIEW` | Outcome needs staff/provider reconciliation | 400 |
| `REFUND_LIMIT_EXCEEDED` | Return/refund beyond eligible original balance | 400 |
| `DELIVERY_ZONE_UNSUPPORTED` | Zone inactive or unknown | 400 |
| `FORBIDDEN` | Actor lacks permission (rider/role checks in mock) | 403 |
| `VALIDATION_FAILED` | Input validation / state-machine violation | 400 |
| `NETWORK`, `BAD_RESPONSE`, `SERVICE_UNAVAILABLE` | Client-side transport honesty (offline demo mode) | —/503 |

## Domain models (TypeScript)

Defined in `src/types/domain.ts`. Summary of the core families:

- **Catalogue**: `Product` (slug, category, tags, publication), `ProductVariant` (unit, unitSize,
  priceMinor, compareAt, barcode, `purchaseUnit` conversion, `safetyStock`), `Category`,
  `UnitConversion` (baseUnit, altUnit, explicit factor).
- **Inventory**: `Location` (store/backroom/quarantine), `StockLot` (kind: regular /
  returns_quarantine / damaged / disposal, quantity, expiry, supplier, PO), `StockMovement`
  (signed delta, reason, reference, actor), `Reservation` (orderId, quantity, expiresAt,
  consumedAt / releasedAt+reason), `StockAdjustment` (reason, request → approval),
  `Stocktake` (expected vs counted with variances).
- **Orders**: `Order` (channel online|pos, fulfilment delivery|collection, five separate status
  fields, totals, events, notes, `stockConsumedAt` — the single depletion marker,
  `verificationCode`), `OrderLine` (variant, quantity, price, FEFO allocations, substitution link),
  `PaymentAttempt` (status, providerRef, idempotencyKey, callbackCount, settlementState).
- **POS**: `CashierSession` (float, movements, expected/counted/difference), `HeldDraftSale`
  (reservations with expiry), `PosTransaction` (receipt).
- **Delivery**: `DeliveryZone` (areas, fee, minimum, hours, cutoff, slot capacity), `DeliverySlot`,
  `Rider` (in-house/contracted, zones, optional last-location), `DeliveryProvider` (capability
  flags, `not_connected`), `DeliveryJob` (status, rider/provider, COD cash fields: toCollect /
  cashCollectedAt / remittedAt, proof).
- **Returns**: `ReturnRequest` + `ReturnLine` (eligible-balance aware) + `Refund` (method
  including `manual_recording`, provider transfer state, retryCount).
- **Purchasing**: `Supplier`, `PurchaseOrder`, `GoodsReceipt`.
- **People & governance**: `Customer`, `Address` (Ghana fields incl. optional GhanaPostGPS),
  `StaffUser`/`StaffRole`, `AuditEvent` (actor, reason, before/after), `AISuggestion`
  (evidence, data period, review state, `source: deterministic_demo`).

### Status machines (enforced by the mock service)

| Dimension | States |
|---|---|
| Payment | unpaid → pending → succeeded / failed / expired → partially_refunded → refunded; requires_review |
| Fulfilment | awaiting_confirmation → confirmed → picking → packed → dispatched → delivered (or ready_for_collection → collected); cancelled |
| Delivery | unassigned → assigned → accepted → picked_up → out_for_delivery → delivered; failed → rescheduled / return_to_store |
| Return | requested → approved / rejected → received → inspected → resolved |
| Refund | requested → awaiting_approval → processing → succeeded / failed (retryable) / requires_review |

Key invariants enforced in the mock engine (`src/services/mock/engine/`):

1. `availableToSell = sellablePhysical(unexpired, undamaged, unquarantined lots) − activeReservations − safetyStock`.
   Reservations are counted once, separately from lot quantities — no double subtraction.
2. Multi-line reservations are atomic: all-or-nothing with line-level conflicts, no stray holds.
3. **One depletion event per order** (`stockConsumedAt`): rider pickup for delivery, counter
   handover for POS. Picking/packing never deducts. Idempotent on retry.
4. Cancellation releases unconsumed holds; post-departure cancellations are blocked (use returns).
5. Returned goods enter inspection/quarantine; only an approved saleable disposition restocks.
6. Cumulative returns ≤ original line quantities; cumulative refunds ≤ original paid amount.
7. Cash-on-delivery: delivery completion, cash collection, and rider remittance are three events.

## Operation catalogue

**Catalogue (public)** — `catalog.categories`, `catalog.list` (query/category/sort/page),
`catalog.product?slug`, `catalog.by-variants`.
**Checkout** — `checkout.quote` (revalidation + zone rules), `checkout.complete` (atomic
reservation + order + payment attempt), `checkout.payment-outcome` (provider callback simulation;
duplicate-safe; late-success path re-checks stock and routes to review), `checkout.status`,
`checkout.zones`, `checkout.slots`.
**Tracking / account** — `orders.track` (reference + code), `account.summary/orders`, `account.cancel`,
`account.return-lines`, `account.create-return`, `account.returns`, `returns.detail`.
**AI (customer)** — `ai.assistant` (catalogue-grounded), `ai.budget-basket`.
**Staff: orders** — `admin.dashboard`, `admin.orders` (filters), `admin.order`, `admin.order.action`
(confirm / picking / packed / ready_for_collection / collect / dispatch / deliver / cancel / note /
substitute / resolve_review).
**Staff: fulfilment** — `admin.fulfilment` (queues with FEFO allocations).
**Staff: POS** — `admin.pos.search`, `admin.pos.complete` (idempotent), `admin.pos.hold`,
`admin.pos.drafts`, `admin.pos.resume`, `admin.pos.release-draft`, `admin.pos.receipt-lookup`.
**Staff: sessions** — `admin.sessions`, `admin.sessions.open/movement/close`.
**Staff: inventory** — `admin.inventory.overview/lots/receipts/adjustments/stocktakes/expiry`,
`admin.inventory.receive`, `admin.inventory.adjustments.create/decide`,
`admin.inventory.stocktakes.open/count/close`, `admin.inventory.lot.quarantine`,
`admin.inventory.lot.dispose`.
**Staff: catalogue & purchasing** — `admin.products`, `admin.product`, `admin.product.update`,
`admin.variant.update` (audited price changes), `admin.categories(.update)`, `admin.suppliers`,
`admin.purchases`, `admin.purchases.create/send`.
**Staff: delivery** — `admin.dispatch.queue`, `admin.dispatch.assign`, `admin.dispatch.job.action`
(reschedule / return_to_store / remit), `admin.riders`, `admin.riders.toggle`, `admin.providers`.
**Staff: returns/refunds** — `admin.returns`, `admin.return.action` (approve/reject/receive/inspect/
request_refund), `admin.refunds`, `admin.refund.action` (approve/execute/retry).
**Staff: finance & insight** — `admin.payments`, `admin.customers`, `admin.customer`,
`admin.reports`, `admin.ai.suggestions/generate/review/business-question`, `admin.team`,
`admin.audit`, `admin.settings(.update)`.
**Rider** — `rider.login`, `rider.jobs`, `rider.job`, `rider.action` (accept/pickup/out/deliver/
fail/note/location), `rider.history`.
**Demo (dev-only)** — `demo.reset`, `demo.flags`, `demo.scenario`.

## Provider adapters (planned, not connected)

The delivery provider adapter exposes capabilities `quote · book · cancel · status · webhook ·
proof_of_delivery`. Hubtel is a **candidate** adapter for Mobile Money and card collection
(developer portal consulted for planning only — no merchant account exists). External couriers are
not named as integrated; the owner selects providers after checking coverage, commercial terms,
technical access and capabilities. Manual booking remains the fallback.

## Replacing the mock with a real backend

1. Implement the operations above behind real endpoints with authentication, persistence
   (PostgreSQL is the proposed datastore), transactions for reservations/depletion, and
   multi-user concurrency control.
2. Re-implement `src/services/client.ts` `api()` to call the real endpoints (same envelopes and
   error codes) — no page changes required.
3. Cache invalidation: pages fetch with `cache: "no-store"` and refetch after mutations; for live
   cross-user freshness (e.g. a completed counter sale refreshing storefront stock) the backend
   should provide cache invalidation or push updates (SSE/websocket) — currently the storefront
   catalogue re-renders per request in dev.
4. Payment callbacks: the backend must verify provider outcomes server-side via the provider's
   supported verification mechanisms; the frontend never marks orders paid.
5. Remove `demo.*` operations and the demo role selector from production builds.

## Authoritative ledger requirements (backend)

Sales, returns and refunds must reflect in stock, cost of goods, tax (owner-configured — no rate
is hardcoded in this prototype), cash/payment balances and reporting. The mock records audit
events for sensitive actions (price changes, approvals, cancellations, disposals) with actor,
reason and before/after values; production logs must avoid secrets and unnecessary personal data.
