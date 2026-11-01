# Known issues, incomplete work & integration limits

This document separates implemented authority from deliberately unconnected production capabilities. At the Wave L2 API checkpoint `6c8cc66`, the generated production OpenAPI contains **111 paths**. Shipment execution code is implemented but the rollout flag defaults off.

## 1. Production/backend authorities already implemented

The repository currently has durable authority for identity/sessions/RBAC, catalogue/inventory, checkout/orders, electronic payments, refunds, Fulfilment/stock handover, Dispatch/Rider operations, Product Media, **Logistics L1 Network & Workflow Configuration**, and **L2 Shipment Route Execution + Dispatch Integration**.

L1 remains configuration authority. L2 adds server-owned route snapshots, Shipment/Stop/Leg persistence, append-only movement evidence, activation at Fulfilment handover, depart/arrive/checkpoint/reroute, and final-mile Dispatch synchronization. Neither L1 nor L2 becomes a second inventory, payment, refund or COD authority.

Operationally, `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` remains `false` by default. Code availability is not a claim that production shipment movement is active.

## 2. Backend/integration authorities still deliberately closed

1. **Advanced route-aware customer tracking (L3) is not implemented.** Current secure order tracking remains the existing order/event projection; the new admin Shipment detail must not be exposed as a customer tracking feed without a dedicated customer-safe projection.
2. **Notification Authority (L4) is not implemented.** No production Email/SMS/WhatsApp/in-app delivery ledger/provider delivery is claimed.
3. **COD cash collection and rider remittance are not implemented.** Delivery remains independent from customer cash, rider liability and remittance/reconciliation.
4. **Physical Returns Authority is not implemented.** Return-to-store does not restore inventory; goods must later be received, inspected and dispositioned. Do not rewrite Shipment history to simulate Returns.
5. **POS cashier sales are not yet a production API authority.** POS must reuse exactly-once depletion and add cashier/session/payment controls.
6. **External courier APIs are not connected.** Manual-provider evidence exists, but booking/status/webhooks are not API-live.
7. **Live GPS/ETA authority does not exist.** Route configuration and Shipment movement events must never fabricate GPS or ETA.
8. **Delivery-proof binary storage is separate and not implemented.** Current dispatch proof is metadata only.
9. **Hubtel/live payment provider activation remains closed.** Provider-neutral logic exists; production credentials/webhooks/real-money activation are not claimed.
10. **Product Media external-provider/storage cutover is incomplete.** Real external AI generation and S3-compatible production storage require explicit credentials and promotion checks.
11. **Typed grocery specifications remain incomplete.** Do not fabricate ingredients, allergens, nutrition, expiry or health claims.
12. **No live AI operations authority.** AI may recommend; transactional writes remain authorized server operations.
13. **Tax policy is not hardcoded.** Ghana tax treatment remains explicit owner/configuration work.

## 3. Frontend/UAT boundaries

- Mock transport remains available by design and is not production authority.
- Complete storefront/account cutover is not finished.
- Demo selectors/login conveniences must stay out of production UX.
- Fulfilment and Dispatch/Rider screens must render backend truth.
- `/admin/logistics` has production L1 configuration authority and a published L2 Shipment API, but a complete operator Shipment-execution UI is not implied by the API alone.
- No public/customer route-aware Shipment timeline is published in L2.
- Returns and POS screens remain non-authoritative until their backend authorities land.
- Product Media UAT is not identical to final production object-storage/provider hosting.
- Storefront CMS has PostgreSQL/NestJS draft/publish authority and public published reads; live portal use still requires migration/API/web deployment parity.
- Reports and AI are derivative and may not become hidden writers of stock/payment/refund/return/media/dispatch/logistics truth.

## 4. Operational follow-ups

Before enabling `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true`:

- apply the current database migration set;
- confirm a real direct bootstrap or reviewed route coverage for each intended active delivery zone;
- run route simulation for representative destination/locality/service-level inputs and resolve all no-match or equal-priority ambiguity;
- UAT one direct route from checkout → handover → final-mile Dispatch → delivery;
- UAT one multi-hop route through depart/arrive sequencing → final-mile Dispatch → delivery;
- verify reroute only at a physical node with no active leg and verify old route revisions remain immutable;
- verify COD remains unpaid on delivery and no post-handover action decrements or restores stock.

If rollback is required, set the flag back to `false` for new planning/execution and preserve every existing Shipment/Stop/Leg/Event record. Do not delete or rewrite execution history. Mid-route shipments require an operational drain/re-enable plan; direct database completion is not supported.

Continue responsive/mobile QA for dense admin workflows. Add realtime/push only after the corresponding authority/conflict semantics exist. Keep provider credentials, raw webhook evidence, storage secrets and model keys server-only.

## 5. Current verified checkpoint

Wave L2 local API verification uses an isolated PostgreSQL test database separate from production/staging. It applied **20/20 migrations**, passed **540/540 API tests with 0 failures**, passed the focused Shipment authority/HTTP tests **5/5**, root ESLint passed, and deterministic production OpenAPI is **111 paths** with SHA-256 `56020fd2254980f1aa4e140ffa60cc8b67d553c16ec604c60e0e9ccd934f6732`.

Whole-branch frontend/build/acceptance verification and a fresh GitHub pull-request run on PostgreSQL 17 remain required before merge readiness is claimed. No production database migration or L2 production enablement was performed by this local verification.
