# Handoff — current authorities and next integration wave

This handoff includes the Wave L4 customer in-app inbox checkpoint on top of the Wave L3 tracking release. L3 enriches the existing secure PublicOrder response without new tracking endpoints or tables. L4 adds three authenticated customer-inbox endpoints plus the account screen and bounded projection timer, bringing generated production OpenAPI to **114 paths** on this branch. L2 shipment execution remains **disabled by default** until its separate rollout prerequisites are completed. Verification for this branch is recorded in docs/VERIFICATION.md.

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
11. **Advanced Customer Tracking (L3)** — a read-only, customer-safe trackingJourney on the existing PublicOrder projection, composed from pinned workflow presentation and committed order/fulfilment/shipment/dispatch evidence. Verified guests and authenticated order owners use the same projection; historical no-shipment orders receive a bounded legacy journey.
12. **Notification inbox (L4 in-app channel)** — committed outbox-event projection into immutable, customer-owned messages; duplicate-safe receipts, cursor pagination, audited mark-one/mark-all-read, shared contracts, customer account UI and a bounded projection timer. Coordinated deployment is required; this channel does not send email, SMS, WhatsApp or push.

## 2. Logistics configuration and execution boundary

Business owners can model head office, warehouses, fulfilment centres, hubs, outlets, pickup points and other business-defined facilities without hard-coded regional/district/zonal levels. Direct routes may have one stop and zero lanes; multi-hop routes require explicit active lanes for every adjacent stop. Highest numeric route priority wins; an equal-highest match fails as ambiguous rather than using a hidden browser/server tiebreaker.

Published delivery workflows are immutable. Route rules pin exact published versions. Doorstep routes require a workflow ending in `delivered`; pickup/collection routes require `customer_collected`.

When `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true`, delivery checkout resolves the route **on the server** and stores an immutable revision-1 Shipment snapshot. Clients never submit stop/lane graphs. Fulfilment handover activates that Shipment in the same transaction as the existing exactly-once stock depletion boundary. Multi-hop movements then advance only through explicit server-authorized depart/arrive commands. Reroute is permitted only while physically at a node with no active leg; the server resolves the replacement route and preserves every prior revision. Informational checkpoints append evidence but cannot create custody, inventory, payment or delivery truth.

Final-mile Dispatch remains the delivery authority. A routed Shipment is not assignable until it reaches `final_mile_ready`; legacy handed-over orders with no Shipment remain backward-compatible. Rider or manual-provider pickup changes Shipment custody only after Dispatch pickup truth, and delivery completion moves Shipment custody to the customer. Delivery does **not** settle COD and never performs another stock decrement.

See `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md` for configuration, enablement, UAT and rollback rules.

## 3. Inventory, handover and custody invariants

`availableToSell = sellable physical stock - active reservations - safety stock`

Picking and packing do **not** decrement physical stock. Delivery stock is consumed once at Fulfilment handover to dispatch; collection stock is consumed once at customer handover. Shipment movement and Dispatch/Rider operations never become a second stock-depletion authority. A parcel visiting a logistics node does not create saleable inventory. Any goods physically returned require future Physical Returns inspection/disposition before inventory can increase.

Return-to-store exception truth remains in Dispatch. A confirmed physical return receipt now synchronizes the Shipment back to its immutable final-mile dispatch node as `final_mile_ready` with append-only `returned_toward_store` / `returned_to_dispatch` evidence so it can be reassigned. This is **not** a restock: until Physical Returns exists, inventory must not increase merely because a parcel returned to dispatch.

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

1. **Wave L3 release follow-up complete** — matched API/web release `f635f3f` deployed to the UAT portal on 4 November 2026. Tracking remains a projection and L2 shipment execution stays off.
2. **Wave L4 — Notification Authority & Inbox** — the in-app channel now includes the customer screen, pagination, read actions, integrity guards and timer. Complete the coordinated API/database/web rollout using `docs/NOTIFICATIONS_L4.md`. Provider-backed Email/SMS/WhatsApp delivery ledger, retries, suppression/preferences, provider receipts, channel settings and template management remain subsequent work.
3. **COD cash collection + rider remittance** — customer cash fact, rider liability, remittance/allocation/reconciliation, separate from delivery.
4. **Physical Returns Authority** — physical receipt, inspection/disposition and controlled restock/quarantine/damage outcomes.
5. **POS Authority** — counter sales/cashier sessions reusing exactly-once stock depletion.
6. **External courier adapters, L5 SLA/AI route assistance, product-content/provider cutovers and remaining storefront production cutover** — each behind explicit authority and verification.

## 7. Deliberately closed scope

This checkpoint implements route-aware customer tracking code but does **not** claim live API/web cutover, Email/SMS/WhatsApp/in-app Notification Authority, COD collection/remittance, Physical Returns/restocking, POS cashier authority, external courier network integration, live GPS/ETA, delivery-proof binary storage, Hubtel production credentials/money movement, external AI image generation, S3-compatible Product Media production storage, complete typed grocery specifications, or complete public-storefront cutover.

L2 code availability also does not imply that production shipment execution is enabled. Operational activation requires the runbook prerequisites and explicit server configuration.

## L3 customer tracking integration

The optional `PublicOrder.trackingJourney` is consumed by one shared journey component on `/track`, `/checkout/status/[id]` and `/account/orders/[id]`. Guest tracking still requires its reference and verification code; account reads still enforce ownership. Non-terminal tracking can refresh using the same verified lookup, with a manual refresh control. Planned milestones are clearly labelled and have no arrival timestamp. Terminal delivery/collection and cancellation stop automatic refresh.

Facility names require the node to be customer-visible; in-transit orders do not claim a current facility. Operational routing/custody identifiers, actors, request IDs, raw metadata and internal notes stay private. Canonical payment/refund/COD outcomes remain outside shipment checkpoint copy. Legacy orders remain usable when L2 is disabled. Notifications, live GPS/ETA, COD remittance and physical restocking remain separate work.

## 8. Verification checkpoint

The L3 code checkpoint `9170207` passed the complete GitHub API integration/security suite **567/567**, with **21/21 migrations** applied to an empty PostgreSQL database; focused tracking tests passed **26/26**. The final local frontend checks passed ESLint, TypeScript no-emit, the production build (**54/54 pages**), Bun regressions **184/184** (1,389 expectations), handoff checks **27/27**, HTTP contracts **42/42**, acceptance **24/24** and route sweep **66/66 HTTP 200**. Browser QA passed three viewport widths plus a planned-stage scenario with no overflow; screenshots and results are retained under `docs/qa/evidence/customer-tracking-l3-20261104/`.

Production OpenAPI remains at **111 paths** and regenerated twice byte-identically, SHA-256 `c7d78f05178e878e71e72c90ab0e51f6a89bd93abbe953cdd01bc613282570c2`. Both repository workflows passed on the code checkpoint (CI `41745990386`, API foundation `41745990319`). Documentation/evidence changes are pushed on the same PR and must also have green checks before merge. No production deployment, database migration, L2 enablement or provider activation is implied.


## Remote pickup-centre checkout foundation (default off)

A separate remote pickup opt-in has been added: `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false`. It requires L2 shipment execution but does **not** follow the L2 flag automatically. The public pickup options endpoint lists only customer-visible, active, route-backed centres and otherwise returns no options. Checkout snapshots the selected terminal pickup route atomically, and cannot accept a browser-authored graph. The browser selector is suppressed without server-advertised options; the demo adapter invents none. See `docs/PICKUP_CHECKOUT.md` for the remaining collection authority and rollout gates. The flag stays off in UAT until terminal collection and payment/slot rules have end-to-end evidence.


## Remote pickup collection authority (not yet UAT activated)

The collection command, private immutable receipt table and pickup-readiness
events have been developed on a separate integration branch. This code is
**not** live until the release steps and both feature flags are approved.
It requires a previously handed-over, paid shipment at the exact frozen
terminal pickup node; staff validates the order code and records a physical
ID-check attestation. It does not own payment or stock actions. See
`docs/PICKUP_COLLECTION.md` for complete rollout and rollback boundaries.
