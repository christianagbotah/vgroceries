# Known issues, incomplete work & integration limits

This document separates implemented backend authority from deliberately unconnected production capabilities. At reviewed checkpoint `8355ac1a1d1878389f6c40f3172f4f5252ff3144`, the generated production OpenAPI contains **69 paths**.

## 1. Production/backend authorities already implemented

The repository currently has durable authority for:

- web/native identity, sessions, authorization and location grants;
- catalogue/inventory reads, receiving, lots/expiry, reservations and safety-stock-aware availability;
- atomic checkout/orders, delivery slots, ownership, secure tracking, cancellation and idempotency;
- electronic payment initiation/evidence/reconciliation and late-payment recovery;
- refund obligation/approval/execution/reconciliation;
- fulfilment confirmation, picking/correction, packing and exactly-once stock handover/collection depletion;
- post-handover dispatch, rider profiles/availability, delivery jobs/events, assignment/reassignment, manual-provider fallback, proof metadata, failure/reschedule and return-to-store custody tracking;
- Product Media upload/generation-job/review/gallery authority and guarded UAT media operation.

Picking and packing do **not** reduce physical stock. Delivery stock leaves inventory at Fulfilment handover; rider pickup never performs a second depletion. New persistence constraints additionally require authoritative dispatch handover before a DeliveryJob can be rooted and prevent unsafe release of rider custody before physical return.

## 2. Backend/integration authorities still deliberately closed

1. **COD cash collection and rider remittance are not implemented.** Delivery status must remain independent from customer cash collection, rider liability and remittance/reconciliation.
2. **Physical Returns Authority is not implemented.** A returned-to-store delivery does not restore inventory; actual goods must be received, inspected and dispositioned before any saleable restock.
3. **POS cashier sales are not yet a production API authority.** POS must reuse the exactly-once depletion primitive and add cashier/session/payment controls rather than introducing a second stock path.
4. **External courier APIs are not connected.** Manual-provider evidence exists, but no courier may be labelled API-integrated until credentials, booking/status/webhooks and failure handling are verified.
5. **Live GPS/ETA authority does not exist.** Location sharing requires explicit consent, freshness semantics and a verified device/provider design; UI state must never fabricate movement or ETA.
6. **Delivery-proof binary storage is separate and not implemented.** Dispatch stores proof method/reference/note metadata. Product Media storage must not be reused implicitly as proof-of-delivery authority.
7. **Hubtel/live payment provider activation remains closed.** Provider-neutral payment/refund logic is implemented, but production credentials, webhooks and real money movement are not claimed active.
8. **Product Media external-provider/storage cutover is incomplete.** The authority and guarded UAT workflow exist, but S3-compatible production storage and real external AI image generation require explicit credentials, configuration and promotion checks. The deterministic fake provider remains the safe UAT default.
9. **Typed grocery specifications remain incomplete.** Production content must not fabricate ingredients, allergens, nutrition, expiry or health claims. Lot expiry remains StockLot truth.
10. **No live AI operations authority.** AI/product-media suggestions may assist, but sensitive stock, price, refund, payment, substitution or promotion actions must remain authorized transactional operations.
11. **No production SMS/email/push provider is claimed.** Notification UX does not prove message delivery.
12. **Tax policy is not hardcoded.** Ghana tax treatment remains owner/configuration work.

## 3. Frontend/UAT boundaries

13. **Mock transport remains available by design.** The service/HTTP adapter is the cutover boundary; mock behavior is useful for demos/regressions but must never silently become production authority.
14. **Complete storefront/account cutover is not finished.** The UAT portal is increasingly live-API backed, but production should be enabled journey-by-journey only where every required operation has an authoritative server contract.
15. **Demo selectors/login conveniences must stay out of production UX.** Production staff/rider access must use real identity/session flows.
16. **Fulfilment and Dispatch/Rider screens must render backend truth.** `allowedActions`, custody, reservation/lot provenance, shortages and handover blockers come from the server; UI-local state cannot override them.
17. **Returns screens remain non-authoritative until Physical Returns lands.** Prototype saleable/quarantine/damaged flows are acceptance material, not production restock evidence.
18. **POS/cashier screens remain non-authoritative until POS Authority lands.** Mock flows are not a production cash ledger.
19. **Product Media UAT is not identical to production media hosting.** Public approved-media checks, private denial, worker behavior and release-stable filesystem storage are UAT evidence; production object-storage promotion still needs explicit verification.
20. **Reports and AI are derivative.** Neither may become a hidden writer of stock, payment, refund, return, media review or dispatch truth.

## 4. Smaller UX / operational follow-ups

21. Remaining dense admin tables should continue receiving responsive/mobile-card QA where staff workflows are frequent.
22. Rider status badge contrast should receive direct-sunlight/accessibility QA when the final rider theme is promoted.
23. Cross-session realtime refresh is not universal. Add push/realtime only where the underlying live authority and conflict semantics are already defined.
24. Catalogue/cart convenience state may persist in the browser, but checkout/POS must always revalidate authoritative price/availability.
25. Provider credentials, raw webhook evidence, storage secrets and model keys must stay server-only.

## 5. Current verified checkpoint

Fresh integrated verification on 17 October 2026 used an isolated PostgreSQL 18 database, separate from production/staging: **9/9 migrations applied**, complete API suite **399/399 pass**, focused Dispatch/Rider/manual-provider suite **68/68 pass**, deterministic OpenAPI **69 paths**, root lint/typecheck/production build **PASS** with **49 pages**, Bun regressions **97/97**, shared contracts **32/32**, acceptance **24/24**, and production-server route sweep **68/68**. `git diff --check` also passed.

A fresh GitHub pull-request run on PostgreSQL 17 remains required before merge readiness is claimed. No production database migration or live-provider activation was performed by this verification.

See `docs/HANDOFF.md`, `docs/VERIFICATION.md`, and `docs/PRODUCT_MEDIA_RUNBOOK.md` for the current boundaries and operational evidence.
