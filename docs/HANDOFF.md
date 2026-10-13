# Handoff — current production authorities and next integration wave

This is the engineering handoff for Variety Groceries after the **Dispatch + Rider Authority** implementation. The repository contains the polished frontend/prototype surface plus a real NestJS/PostgreSQL backend for identity, inventory, commerce, payments, refunds, fulfilment/stock handover, dispatch and rider operations.

## 1. Current backend authority boundary

The production API now owns these capabilities:

1. **Identity, sessions and authorization** — web/native authentication, durable sessions, role/location grants and guarded staff/rider routes.
2. **Catalogue + inventory** — publication-aware catalogue reads, safety-stock-aware availability, receiving, lots/expiry, reservations and audit/outbox history.
3. **Commerce reservations + checkout/orders** — atomic multi-line reservation, guest/customer ownership, delivery slots, order tracking, cancellation and idempotency.
4. **Payments** — provider-neutral initiation, raw provider evidence, authoritative reconciliation, duplicate callback safety, late-payment recovery and admin ledger.
5. **Refunds** — durable refund obligations, approval/execution/reconciliation, cumulative capture limits, retries and safe customer projections.
6. **Fulfilment + stock handover** — administrator fulfilment queue/detail, confirmation, picking, pick correction, packing and exactly-once handover/collection stock depletion.
7. **Dispatch + rider operations** — post-handover dispatch queue, durable rider profiles/jobs/events/proof metadata, assignment/reassignment, declared/effective availability, custody-safe lifecycle, failure/reschedule/return-to-store handling and explicit manual-provider fallback.

The production OpenAPI surface is **57 paths**. Dispatch + Rider adds exactly **22 paths** to the prior 35-path authority surface: 9 administrator dispatch paths, 3 administrator rider paths and 10 rider self-service paths.

## 2. Inventory and custody invariants

The backend enforces:

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing **do not** decrement physical stock. Physical stock is consumed at exactly one authoritative boundary:

- delivery order: Fulfilment handover from store custody to dispatch;
- collection order: Fulfilment handover directly to the customer.

Dispatch starts only after the delivery order has authoritative handover evidence and `stockConsumedAt` is already set. Dispatch/rider commands never call `StockDepletionService.consumeClaim(...)`, never mutate stock lots/reservations/depletion rows, and never become a second inventory authority.

Rider pickup changes operational custody to the rider but consumes **zero** additional stock. Delivery completion changes delivery/fulfilment outcome and customer custody only. A failed delivery or returned-to-store parcel does not re-enter saleable inventory; a future Physical Returns Authority must inspect and disposition actual received goods before any restock.

## 3. Delivery, COD and proof boundaries

Delivery completion, COD cash collection and rider remittance remain separate dimensions. A COD delivery can therefore be delivered while payment remains unsettled. The Dispatch/Rider milestone intentionally contains no `cashCollectedAt`, remittance ledger, rider cash liability or payment-success shortcut.

Proof of delivery is durable metadata/reference only. Supported production proof methods are `signature` and `photo_note`; PIN is not authoritative until an order-bound verifier exists. The backend stores no proof-media blobs in this milestone.

Manual-provider assignment is explicit staff-recorded evidence only. It performs no courier network call and does not pretend a provider integration, GPS location or ETA exists.

## 4. Frontend swap point

Frontend operations still route through `src/services/client.ts` and the HTTP adapter. The z.ai Dispatch/Rider readiness wave is intentionally separate from backend authority and must consume the real server projections/`allowedActions` when cut over.

Do not infer stock, payment or custody authority from visual state. In particular:

- rider pickup must never consume stock;
- dispatch assignment happens after Fulfilment handover;
- delivery success must not mark COD paid;
- return-to-store must display as awaiting Returns inspection, not as restocked;
- no UI may fabricate courier booking, GPS movement or ETA.

## 5. Next implementation sequence

The owner-approved production sequence after this milestone is:

1. **Wave A — production order tracking UX/API integration** — every customer order detail gets one-click tracking backed by authenticated ownership; guest tracking keeps reference + verification-code protection; admin detail links to operational fulfilment/dispatch truth. Remove production-facing payment simulators/demo tracking copy.
2. **Wave B — production catalogue media + grocery specifications** — durable ordered product galleries, primary/variant media, alt text/storage metadata and typed category-driven grocery attributes. Ingredients, allergens, nutrition and health claims are never invented; lot-specific expiry remains Inventory/StockLot truth.
3. **Wave C — external delivery-provider registry/adapters** — keep in-house riders first-class while adding configured external providers behind honest `manual`/`api` capability modes, quote/booking/tracking references and normalized provider events. No provider is labelled API-live until credentials/onboarding and real calls are verified.
4. **Wave D — COD cash collection + rider remittance authority** — customer cash collection, rider liability and remittance as separate durable, auditable events/ledgers.
5. **Physical Returns Authority** — full/partial actual receipts, inspection/disposition, saleable restock vs quarantine/damaged/unsafe and lot provenance.
6. **POS Authority and remaining storefront cutover** — counter-sale workflow reusing the same depletion primitive, followed by replacement of remaining mock-backed production journeys.

The approved Waves A–C design is tracked separately at commit `5918c7788ddfec733c9b5e28f5ce787ac9dac752`; the Wave A native TDD plan is commit `6834b8ee65b32f198ca2fcb4417e2c5b8461fc49`. They remain outside this focused Dispatch/Rider branch and will be rebased onto its reviewed PR head before Wave A execution.

## 6. Deliberately closed scope

The current backend does **not** yet claim production authority for COD cash collection/remittance, physical returns/restocking, POS cashier sales, live courier network integrations, live GPS/ETA, proof-media storage, production Hubtel activation, SMS/email/push, live AI execution or complete public-storefront cutover.

Do not create placeholder endpoints that pretend these are implemented. Keep provider/manual boundaries explicit until each authority is designed, tested and landed.

## 7. Verification checkpoint

Latest reviewed code checkpoint before this documentation commit:

- branch: `feat/dispatch-rider-authority-20261013`
- reviewed code SHA: `9515745da95dfaf2c59bee2d7019b18de3c24f3b`
- local clean-room PostgreSQL: **18.1**, migrations **001–007** applied successfully on a brand-new database
- complete API integration/security/concurrency tests: **333/333 pass**
- focused Dispatch/Rider review suite: **65/65 pass**
- production OpenAPI: **57 paths**, two consecutive byte-identical generations, zero committed drift
- Dispatch source authority scan: **PASS**; no second stock/payment/COD-remittance/GPS/ETA/provider-network authority found
- root ESLint: **PASS**
- root TypeScript `tsc --noEmit --incremental false`: **PASS**
- Next.js production build: **PASS**, static generation **48/48**
- handoff regression assertions: **24/24**
- Bun regression tests: **50/50** with **460** expectations
- shared contract checks: **32/32**
- business acceptance checks: **24/24**
- route sweep: **58/58 HTTP 200** on isolated port **33013**

The independent review defects were reproduced RED and fixed before this checkpoint, including customer-note privacy, reschedule retry/idempotency, former-rider access revocation, lock ordering, manual-provider/action projection truth, busy-state derivation, OpenAPI refinement parity, Returns-inspection messaging, a real PostgreSQL `40P01` admin assignment deadlock, and physically-returned unassigned recovery.

The repository's API GitHub workflow uses PostgreSQL 17. Its fresh PR run remains the required final PostgreSQL-17 evidence before merge readiness; local PostgreSQL 18.1 evidence is intentionally not presented as a substitute.

See `docs/VERIFICATION.md` for the evidence record and `docs/KNOWN_ISSUES.md` for deliberately closed production scope.
