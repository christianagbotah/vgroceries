# Handoff — current authorities and next integration wave

This is the current engineering handoff for Variety Groceries at Wave L1 code checkpoint `3752722`. The generated production OpenAPI contains **82 paths**.

## 1. Current backend authority boundary

The backend currently owns these capability boundaries:

1. **Identity, sessions and authorization** — web/native authentication, durable sessions, role/location grants and guarded staff/rider routes.
2. **Catalogue + inventory** — publication-aware catalogue reads, safety-stock-aware availability, receiving, lots/expiry, reservations and audit/outbox history.
3. **Commerce reservations + checkout/orders** — atomic multi-line reservation, guest/customer ownership, delivery slots, secure order tracking, cancellation and idempotency.
4. **Payments** — provider-neutral initiation, raw provider evidence, authoritative reconciliation, duplicate-callback safety, late-payment recovery and administrator ledger views.
5. **Refunds** — durable refund obligations, approval/execution/reconciliation, cumulative capture limits, retries and safe customer projections.
6. **Fulfilment + stock handover** — confirmation, picking, correction, packing and exactly-once handover/collection stock depletion.
7. **Dispatch + rider operations** — post-handover queue, durable rider profiles/jobs/events/proof metadata, assignment/reassignment, custody-safe delivery lifecycle, failure/reschedule/return-to-store handling and explicit manual-provider fallback.
8. **Product Media authority** — durable media records, upload/generation-job/review/gallery authority plus guarded UAT tooling.
9. **Logistics Network & Workflow Configuration (Wave L1)** — configurable nodes/hubs, directed lanes, immutable workflow versions, deterministic route rules, activation preflight, route simulation, admin workspace and guarded direct-route bootstrap.

## 2. Logistics configuration boundary

Business owners can model head office, warehouses, fulfilment centres, hubs, outlets, pickup points and other business-defined facilities without hard-coded regional/district/zonal levels. Direct routes may have one stop and zero lanes; multi-hop routes require explicit active lanes for every adjacent stop. Highest numeric route priority wins; an equal-highest match fails as ambiguous rather than using a hidden browser/server tiebreaker.

Published delivery workflows are immutable. Route rules pin exact published versions. Doorstep routes require a workflow ending in `delivered`; pickup/collection routes require `customer_collected`. L1 configuration/simulation has a regression proving it does not mutate Order, Reservation, StockLot, StockDepletion, FulfilmentRun, DeliveryJob, PaymentAttempt or Refund runtime authority.

See `docs/WAVE_L1_LOGISTICS_CONFIGURATION_HANDOFF.md` and `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md`.

## 3. Inventory, handover and custody invariants

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing do **not** decrement physical stock. Delivery stock is consumed once at Fulfilment handover to dispatch; collection stock is consumed once at customer handover. Dispatch/Rider and Logistics configuration never become a second stock-depletion authority. A parcel visiting a logistics node does not create saleable inventory. Any goods physically returned require future Physical Returns inspection/disposition before inventory can increase.

## 4. Delivery, COD and provider boundaries

Delivery completion, COD cash collection and rider remittance remain separate dimensions. A delivered COD job is not settled payment. Supported delivery-proof metadata remains `signature` or `photo_note`; `pin` stays closed until an order-bound verifier exists. Manual-provider assignment records staff evidence only and does not fabricate courier booking, GPS or ETA.

Product Media backend/UAT authority is implemented, but external image generation and S3-compatible production storage are not claimed active without explicit credentialed verification.

## 5. Frontend/cutover rule

Frontend operations use the service/HTTP adapter boundary and may retain mock support for demos/regressions. Production journeys must bind to server projections and `allowedActions`; visual state is never authority. The UI must not infer stock depletion, mark COD paid from delivery, present returned goods as restocked, expose unapproved media, or claim parcel movement/provider delivery from configuration alone.

## 6. Next implementation sequence

1. **Wave L2 — Shipment Route Execution + Dispatch Integration** — Shipment/Stop/Leg runtime identities, immutable route snapshot, append-only movement events, Fulfilment handover activation, depart/arrive/reroute and final-mile readiness.
2. **Wave L3 — Advanced Customer Tracking** — truthful route-aware customer timeline derived only from committed shipment/dispatch events.
3. **Wave L4 — Notification Authority & Inbox** — durable in-app notifications plus provider-backed Email/SMS/WhatsApp delivery ledger, retries, suppression/preferences and receipts.
4. **COD cash collection + rider remittance** — customer cash fact, rider liability, remittance/allocation/reconciliation, separate from delivery.
5. **Physical Returns Authority** — physical receipt, inspection/disposition and controlled restock/quarantine/damage outcomes.
6. **POS Authority** — counter sales/cashier sessions reusing exactly-once stock depletion.
7. **External courier adapters, L5 SLA/AI route assistance, product-content/provider cutovers and remaining storefront production cutover** — each behind explicit authority and verification.

## 7. Deliberately closed scope

This checkpoint does **not** claim live Shipment movement, route-aware customer tracking cutover, Email/SMS/WhatsApp/in-app Notification Authority, COD collection/remittance, Physical Returns/restocking, POS cashier authority, external courier network integration, live GPS/ETA, delivery-proof binary storage, Hubtel production credentials/money movement, external AI image generation, S3-compatible Product Media production storage, complete typed grocery specifications, or complete public-storefront cutover.

## 8. Verification checkpoint

Wave L1 clean-room verification has applied **10/10 migrations**, generated deterministic **82-path** OpenAPI (`fe1de21570acdea4f22297c1cda1952efcf0f092feabf9ecdce04fadbd3d365b`), passed root lint/typecheck/production build with **50/50 static pages**, **27/27** handoff regressions, **114/114** Bun tests (**1009 expectations**), **38/38** contract checks, **24/24** acceptance checks and **60/60** production-server route sweep. The exact-head complete API result is recorded in `docs/WAVE_L1_LOGISTICS_CONFIGURATION_HANDOFF.md` and `docs/VERIFICATION.md` after its running final process completes.

GitHub PostgreSQL 17 workflows remain required before merge. No production database migration or live-provider activation is implied by this local verification.
