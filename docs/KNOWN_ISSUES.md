# Known issues, incomplete work & integration limits

This document separates implemented authority from deliberately unconnected production capabilities. At Wave L1 code checkpoint `3752722`, the generated production OpenAPI contains **82 paths**.

## 1. Production/backend authorities already implemented

The repository currently has durable authority for identity/sessions/RBAC, catalogue/inventory, checkout/orders, electronic payments, refunds, Fulfilment/stock handover, Dispatch/Rider operations, Product Media, and **Wave L1 Logistics Network & Workflow Configuration** (nodes, lanes, immutable workflow versions, deterministic route rules, route simulation and guarded direct-route bootstrap).

L1 is configuration authority only. It cannot establish that a parcel departed, arrived, was picked up or was delivered. It also cannot mutate runtime Order/Reservation/stock/Fulfilment/Dispatch/Payment/Refund truth.

## 2. Backend/integration authorities still deliberately closed

1. **Shipment Route Execution (L2) is not implemented.** There is no production Shipment/Stop/Leg movement ledger, depart/arrive/reroute authority or multi-hop custody execution yet.
2. **Advanced route-aware customer tracking (L3) is not implemented.** Current secure order tracking remains the existing order/event projection; configured routes do not become customer movement history by themselves.
3. **Notification Authority (L4) is not implemented.** No production Email/SMS/WhatsApp/in-app delivery ledger/provider delivery is claimed.
4. **COD cash collection and rider remittance are not implemented.** Delivery remains independent from customer cash, rider liability and remittance/reconciliation.
5. **Physical Returns Authority is not implemented.** Return-to-store does not restore inventory; goods must later be received, inspected and dispositioned.
6. **POS cashier sales are not yet a production API authority.** POS must reuse exactly-once depletion and add cashier/session/payment controls.
7. **External courier APIs are not connected.** Manual-provider evidence exists, but booking/status/webhooks are not API-live.
8. **Live GPS/ETA authority does not exist.** UI/configuration must never fabricate movement or ETA.
9. **Delivery-proof binary storage is separate and not implemented.** Current dispatch proof is metadata only.
10. **Hubtel/live payment provider activation remains closed.** Provider-neutral logic exists; production credentials/webhooks/real-money activation are not claimed.
11. **Product Media external-provider/storage cutover is incomplete.** Real external AI generation and S3-compatible production storage require explicit credentials and promotion checks.
12. **Typed grocery specifications remain incomplete.** Do not fabricate ingredients, allergens, nutrition, expiry or health claims.
13. **No live AI operations authority.** AI may recommend; transactional writes remain authorized server operations.
14. **Tax policy is not hardcoded.** Ghana tax treatment remains explicit owner/configuration work.

## 3. Frontend/UAT boundaries

- Mock transport remains available by design and is not production authority.
- Complete storefront/account cutover is not finished.
- Demo selectors/login conveniences must stay out of production UX.
- Fulfilment and Dispatch/Rider screens must render backend truth.
- `/admin/logistics` is production configuration UX, but its simulated/planned routes do not prove parcel movement.
- Returns and POS screens remain non-authoritative until their backend authorities land.
- Product Media UAT is not identical to final production object-storage/provider hosting.
- Storefront CMS now has PostgreSQL/NestJS draft/publish authority and public published reads. The remaining boundary is deployment/UAT cutover: the migration and API/web builds must be deployed together before the live portal can rely on persistent CMS edits.
- Reports and AI are derivative and may not become hidden writers of stock/payment/refund/return/media/dispatch/logistics truth.

## 4. Operational follow-ups

- Continue responsive/mobile QA for dense admin workflows.
- Add realtime/push only after the corresponding authority/conflict semantics exist.
- Keep provider credentials, raw webhook evidence, storage secrets and model keys server-only.
- Before enabling L2, configure/simulate at least one intended production route per active delivery zone and resolve all no-match/ambiguous results.

## 5. Current verified checkpoint

Wave L1 local verification uses an isolated PostgreSQL test database separate from production/staging. It has applied **10/10 migrations**, verified deterministic **82-path** OpenAPI, root lint/typecheck/build, **50/50 static-page generation**, **27/27** handoff regressions, **114/114** Bun tests (**1009 expectations**), **38/38** contract checks, **24/24** acceptance checks and **60/60** production route sweep. Exact-head API evidence is recorded in `docs/WAVE_L1_LOGISTICS_CONFIGURATION_HANDOFF.md` after the final process reports.

A fresh GitHub pull-request run on PostgreSQL 17 remains required before merge readiness is claimed. No production database migration or live-provider activation was performed by this local verification.
