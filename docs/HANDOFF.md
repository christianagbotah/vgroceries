# Handoff — current authorities and next integration wave

This is the current engineering handoff for Variety Groceries at reviewed code checkpoint `8355ac1a1d1878389f6c40f3172f4f5252ff3144`. The repository combines the Next.js commerce experience with a NestJS/PostgreSQL authority layer for the highest-risk retail operations. The current generated production OpenAPI contains **69 paths**.

## 1. Current backend authority boundary

The backend currently owns these capability boundaries:

1. **Identity, sessions and authorization** — web/native authentication, durable sessions, role/location grants and guarded staff/rider routes.
2. **Catalogue + inventory** — publication-aware catalogue reads, safety-stock-aware availability, receiving, lots/expiry, reservations and audit/outbox history.
3. **Commerce reservations + checkout/orders** — atomic multi-line reservation, guest/customer ownership, delivery slots, secure order tracking, cancellation and idempotency.
4. **Payments** — provider-neutral initiation, raw provider evidence, authoritative reconciliation, duplicate-callback safety, late-payment recovery and administrator ledger views.
5. **Refunds** — durable refund obligations, approval/execution/reconciliation, cumulative capture limits, retries and safe customer projections.
6. **Fulfilment + stock handover** — confirmation, picking, correction, packing and exactly-once handover/collection stock depletion.
7. **Dispatch + rider operations** — post-handover queue, durable rider profiles/jobs/events/proof metadata, assignment/reassignment, declared/effective availability, custody-safe delivery lifecycle, failure/reschedule/return-to-store handling and explicit manual-provider fallback.
8. **Product Media authority** — durable media records, upload/presign-complete flow, generation-job lifecycle, review/approval/rejection/archive, featured/reorder/brand-mode controls and protected/public content serving. The checked-in UAT tooling keeps storage/provider capabilities explicit rather than pretending external integrations are live.

The Dispatch/Rider surface remains **22 paths**. Product Media is now part of the integrated contract and guarded UAT workflow; it is no longer a future placeholder milestone.

## 2. Inventory, handover and custody invariants

The central stock rule remains:

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing do **not** decrement physical stock. Delivery stock is consumed once at Fulfilment handover to dispatch; collection stock is consumed once at customer handover. Dispatch/Rider operations never become a second stock-depletion authority.

The database now reinforces the application boundary. A DeliveryJob cannot be rooted without authoritative delivery handover evidence, and status/custody combinations cannot release failed rider custody as unassigned before the parcel is actually returned. Store-returned custody requires a recorded return timestamp. Rider pickup therefore changes custody only; delivery completion changes operational outcome/customer custody only; failed or returned delivery never makes stock saleable again.

Any goods that physically come back must later enter Physical Returns inspection/disposition before inventory can increase.

## 3. Delivery, COD and proof boundaries

Delivery completion, COD cash collection and rider remittance are separate dimensions. A delivered COD job must not be interpreted as settled payment. There is still no rider-cash-liability/remittance ledger in this authority.

Supported delivery-proof metadata is `signature` or `photo_note`. `pin` is deliberately rejected until a secure order-bound verifier exists. Dispatch proof metadata is not the same as Product Media storage; secure delivery-proof binary storage remains a separate future boundary.

Manual-provider assignment records staff evidence only. It does not perform courier network calls and does not fabricate provider booking, GPS movement or ETA.

## 4. Product Media boundary

Product Media has moved from planned work into an implemented backend/UAT authority. The repository contains upload, generation-job, review, approval and gallery controls plus guarded deployment/runtime tooling. The UAT runbook uses a stable filesystem media root and supports deterministic fake-provider validation.

This does **not** mean every production provider is active. S3-compatible production storage still requires its own credentialed cutover and verification, and external AI image generation remains disabled until a real provider key/configuration is deliberately enabled and checked. Product ingredients, allergens, nutrition, health claims and lot expiry must continue to come from typed/authoritative data rather than image generation or inference.

See `docs/PRODUCT_MEDIA_RUNBOOK.md` for the operational boundary.

## 5. Frontend swap/cutover rule

Frontend operations still use the service/HTTP adapter boundary and may retain mock support for demos/regressions. Production journeys must bind to real server projections and `allowedActions` capability-by-capability; visual state is never authority.

In particular, the UI must not infer stock depletion, mark COD paid from delivery, present returned goods as restocked, expose unapproved product media, or fabricate courier/GPS/ETA/provider state. The public/UAT portal work is useful cutover evidence but is not a blanket declaration that every storefront/account route is production-authoritative.

## 6. Next implementation sequence

The recommended next authority sequence is:

1. **COD cash collection + rider remittance** — durable customer cash collection, rider liability, remittance and reconciliation without conflating those events with delivery status.
2. **Physical Returns Authority** — actual received quantities, inspection/disposition, saleable restock vs quarantine/damaged/unsafe outcomes, cumulative return limits and lot provenance.
3. **POS Authority** — counter-sale workflow reusing the exactly-once stock-depletion primitive with cashier sessions and cash/MoMo/card settlement boundaries.
4. **External delivery-provider adapters** — keep in-house riders first-class while adding configured providers behind honest manual/API capability modes; no provider is API-live until credentials, booking/status/webhooks and failure behavior are verified.
5. **Product-content completion** — finish typed category-driven grocery specifications and production media-provider/storage cutover; never invent ingredients, allergens, nutrition or health claims.
6. **Remaining storefront/account production cutover** — replace residual mock-backed journeys only after their required write authorities are real.
7. **Reports, notifications and AI automation** — derive from authoritative ledgers and route any write/action through the same permission and transaction boundaries as human operations.

## 7. Deliberately closed scope

This checkpoint does **not** claim production-live COD collection/remittance, Physical Returns/restocking, POS cashier authority, external courier network integration, live GPS/ETA, delivery-proof binary storage, Hubtel production credentials/money movement, SMS/email/push, external AI image generation, S3-compatible Product Media production storage, complete typed grocery specifications, or complete public-storefront cutover.

## 8. Verification checkpoint

Fresh integrated verification against code checkpoint `8355ac1a1d1878389f6c40f3172f4f5252ff3144` produced:

- fresh isolated PostgreSQL 18 database: **9/9 migrations applied**;
- complete API integration/security/concurrency suite: **399/399 pass**;
- focused Dispatch/Rider/manual-provider suite: **68/68 pass**;
- deterministic production OpenAPI: **69 paths**, two byte-identical generations;
- root frozen install, ESLint, strict TypeScript and Next.js production build: **PASS**;
- static build output: **49 pages**;
- Bun regression suite: **97/97 pass**;
- shared contract checks: **32/32 pass**;
- business acceptance checks: **24/24 pass**;
- production-server route sweep: **68/68 pass**.

The local database was isolated from production/staging. A fresh GitHub PR run on PostgreSQL 17 remains required before merge readiness is claimed. See `docs/VERIFICATION.md` for the evidence record and `docs/KNOWN_ISSUES.md` for remaining boundaries.
