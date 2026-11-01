# Handoff — current authorities and next integration wave

This is the current engineering handoff for Variety Groceries at the Wave L2 Shipment Route Execution checkpoint. The verified L2 API checkpoint is `6c8cc66`, and the generated production OpenAPI contains **111 paths**. L2 execution code is implemented but remains **disabled by default** until the rollout prerequisites below are completed.

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
9. **Logistics Network & Workflow Configuration (L1)** — configurable nodes/hubs, directed lanes, immutable workflow versions, deterministic route rules, activation preflight, route simulation and guarded direct-route bootstrap.
10. **Shipment Route Execution + Dispatch Integration (L2)** — durable Shipment/Stop/Leg identities, immutable route snapshots, append-only movement events, Fulfilment handover activation, depart/arrive/checkpoint/reroute commands, final-mile readiness gating and Dispatch/Rider/manual-provider custody synchronization.

## 2. Logistics configuration and execution boundary

Business owners can model head office, warehouses, fulfilment centres, hubs, outlets, pickup points and other business-defined facilities without hard-coded regional/district/zonal levels. Direct routes may have one stop and zero lanes; multi-hop routes require explicit active lanes for every adjacent stop. Highest numeric route priority wins; an equal-highest match fails as ambiguous rather than using a hidden browser/server tiebreaker.

Published delivery workflows are immutable. Route rules pin exact published versions. Doorstep routes require a workflow ending in `delivered`; pickup/collection routes require `customer_collected`.

When `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true`, delivery checkout resolves the route **on the server** and stores an immutable revision-1 Shipment snapshot. Clients never submit stop/lane graphs. Fulfilment handover activates that Shipment in the same transaction as the existing exactly-once stock depletion boundary. Multi-hop movements then advance only through explicit server-authorized depart/arrive commands. Reroute is permitted only while physically at a node with no active leg; the server resolves the replacement route and preserves every prior revision. Informational checkpoints append evidence but cannot create custody, inventory, payment or delivery truth.

Final-mile Dispatch remains the delivery authority. A routed Shipment is not assignable until it reaches `final_mile_ready`; legacy handed-over orders with no Shipment remain backward-compatible. Rider or manual-provider pickup changes Shipment custody only after Dispatch pickup truth, and delivery completion moves Shipment custody to the customer. Delivery does **not** settle COD and never performs another stock decrement.

See `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md` for configuration, enablement, UAT and rollback rules.

## 3. Inventory, handover and custody invariants

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing do **not** decrement physical stock. Delivery stock is consumed once at Fulfilment handover to dispatch; collection stock is consumed once at customer handover. Shipment movement and Dispatch/Rider operations never become a second stock-depletion authority. A parcel visiting a logistics node does not create saleable inventory. Any goods physically returned require future Physical Returns inspection/disposition before inventory can increase.

Return-to-store exception truth remains in Dispatch. Until Physical Returns exists, do not invent a logistics-node restock or rewrite Shipment history merely because a DeliveryJob records physical return receipt.

## 4. Delivery, COD and provider boundaries

Delivery completion, COD cash collection and rider remittance remain separate dimensions. A delivered COD job is not settled payment. Supported delivery-proof metadata remains `signature` or `photo_note`; `pin` stays closed until an order-bound verifier exists. Manual-provider assignment records staff evidence only and does not fabricate courier booking, GPS or ETA.

Product Media backend/UAT authority is implemented, but external image generation and S3-compatible production storage are not claimed active without explicit credentialed verification.

## 5. L2 rollout gate

`LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` is the default. With the flag off:

- new checkout does **not** create Shipment planning/execution rows;
- the admin legacy-planning endpoint remains closed by the same gate;
- legacy handed-over delivery orders with no Shipment retain the pre-L2 Dispatch behavior.

Enable L2 only after all intended active delivery zones have a verified direct or multi-hop route, route simulation has no unresolved no-match/equal-priority ambiguity, the current migration set is applied, and UAT proves both a direct and a multi-hop journey. The flag is the single operational cutover for **new** Shipment planning/execution; it is not permission to rewrite existing orders or route history.

If L2 must be disabled after activation, disable the flag for new planning/movement commands and preserve all Shipment/Stop/Leg/Event history. Never delete Shipment rows, rewrite old route revisions, or fabricate completion. Active mid-route shipments must be operationally drained/re-enabled to finish under the same authority rather than repaired with direct database edits.

## 6. Next implementation sequence

1. **Wave L3 — Advanced Customer Tracking** — truthful route-aware customer timeline derived only from committed Shipment/Dispatch events.
2. **Wave L4 — Notification Authority & Inbox** — durable in-app notifications plus provider-backed Email/SMS/WhatsApp delivery ledger, retries, suppression/preferences and receipts.
3. **COD cash collection + rider remittance** — customer cash fact, rider liability, remittance/allocation/reconciliation, separate from delivery.
4. **Physical Returns Authority** — physical receipt, inspection/disposition and controlled restock/quarantine/damage outcomes.
5. **POS Authority** — counter sales/cashier sessions reusing exactly-once stock depletion.
6. **External courier adapters, L5 SLA/AI route assistance, product-content/provider cutovers and remaining storefront production cutover** — each behind explicit authority and verification.

## 7. Deliberately closed scope

This checkpoint does **not** claim route-aware customer tracking cutover, Email/SMS/WhatsApp/in-app Notification Authority, COD collection/remittance, Physical Returns/restocking, POS cashier authority, external courier network integration, live GPS/ETA, delivery-proof binary storage, Hubtel production credentials/money movement, external AI image generation, S3-compatible Product Media production storage, complete typed grocery specifications, or complete public-storefront cutover.

L2 code availability also does not imply that production shipment execution is enabled. Operational activation requires the runbook prerequisites and explicit server configuration.

## 8. Verification checkpoint

The L2 API checkpoint applied **20/20 migrations** to a fresh isolated PostgreSQL database, passed the complete API suite **540/540 with 0 failures**, passed the focused Shipment authority/HTTP set **5/5**, root ESLint passed, and production OpenAPI regenerated twice byte-identically at exactly **111 paths** with SHA-256 `56020fd2254980f1aa4e140ffa60cc8b67d553c16ec604c60e0e9ccd934f6732`.

Whole-branch frontend/build/acceptance verification and fresh GitHub pull-request runs remain required before merge readiness is claimed. No production database migration, production L2 flag enablement or live-provider activation is implied by this local verification.
