# Known issues, incomplete work & integration limits

This document separates implemented authority from deliberately unconnected
production capabilities. **As of 9 November 2026**, the source API has
**124 paths** in this source branch (R1 deployed in UAT; R2a not yet
released), including customer pickup appointments, physical-return receipt
and inspection, and one new administrator-only quarantine custody action.
The former Wave L3/L4 tracking/in-app-notification code, appointment
interface and R1 physical receipt/inspection are deployed to UAT. **Shipment execution and remote customer pickup still remain OFF in
UAT**; available code does not imply an activated logistics service.
See `docs/RELEASE_COMPLETION_ROADMAP.md` for a current, dependency-ordered
backlog. Historical verification figures below refer to their old checkpoints.

## 1. Production/backend authorities already implemented

The repository currently has durable authority for identity/sessions/RBAC, catalogue/inventory, checkout/orders, electronic payments, refunds, Fulfilment/stock handover, Dispatch/Rider operations, Product Media, **Logistics L1 Network & Workflow Configuration**, **L2 Shipment Route Execution + Dispatch Integration**, and the read-only **L3 Advanced Customer Tracking** projection.

L1 remains configuration authority. L2 adds server-owned route snapshots, Shipment/Stop/Leg persistence, append-only movement evidence, activation at Fulfilment handover, depart/arrive/checkpoint/reroute, and final-mile Dispatch synchronization. Neither L1 nor L2 becomes a second inventory, payment, refund or COD authority.

Operationally, `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` remains `false` by default. Code availability is not a claim that production shipment movement is active.

## 2. Backend/integration authorities still deliberately closed

1. **Advanced customer tracking (L3) is deployed to the UAT portal as release `f635f3f`.** The dedicated customer-safe projection enriches PublicOrder and shares presentation across track, checkout status and account order detail. Operational Shipment detail remains administrator-only. L3 adds no separate tracking endpoints; the L4 account inbox links to the existing secure account-order detail.
2. **L4 in-app inbox is deployed to UAT.** Customer-owned message snapshots,
cursor pagination, read-one/read-all, the account inbox screen and a bounded
projection timer are implemented. Rows are projected from committed events.
No live Email/SMS/WhatsApp, external provider receipts/preferences/retries or
push delivery are claimed.
3. **COD cash collection and rider remittance are not implemented.** Delivery remains independent from customer cash, rider liability and remittance/reconciliation.
4. **Physical Returns R1 is deployed but disabled in UAT**, providing actual
completed-order, quantity-bounded staff physical receipts and terminal
quarantine/destroy inspections. **R2a quarantine custody is implemented in a
separate default-off branch**: only inspected quarantined goods with one
verified source lot receive an immutable, non-saleable stock lot and receipt.
**Not yet implemented:** safe-to-sell restock release, full customer request
authorization, provider-money refunds tied to returned line quantities and
cross-location/multi-lot evidence. Shipment returns still do not restore
inventory. Neither an R1 inspection nor R2a custody is permission to resell
food or create a refund.
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
- Remote customer pickup-centre checkout is implemented behind `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false` (and the existing L2 flag) but intentionally **closed** until verified terminal customer-collection authority, pickup-specific payment/slot policy and UAT are ready. Do not enable either flag merely because the checkout API and selector exist.
- Demo selectors/login conveniences must stay out of production UX.
- Fulfilment and Dispatch/Rider screens must render backend truth.
- `/admin/logistics` has production L1 configuration authority and a published L2 Shipment API, but a complete operator Shipment-execution UI is not implied by the API alone.
- L3 provides a customer-safe route-aware timeline through the existing secure order responses. It does not expose the admin Shipment API; legacy no-shipment orders show only recorded order history.
- The original mock Returns and POS workflows remain non-authoritative.
  The separate Physical Returns R1 administration workspace uses PostgreSQL
  authority behind its own OFF flag; R2a adds an independently OFF-gated
  quarantine-custody step, with no resale or money operations.
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

Wave L2 local verification uses an isolated PostgreSQL test database separate from production/staging. It applied **21/21 migrations**, passed **541/541 API tests with 0 failures**, passed the focused physical-return/Shipment contract + migration-lineage review set **11/11**, root ESLint and TypeScript no-emit passed, built **54/54** Next.js pages, passed handoff regressions **27/27**, Bun tests **176/176** (1,346 expectations), contracts **38/38**, acceptance **24/24**, and the production-server route sweep **66/66 HTTP 200**. Deterministic production OpenAPI is **111 paths** with SHA-256 `d763a7b8011c4ca6cdfa9d719073755b2171e73e42093dc9c225f988b2b2e6e`.

Local whole-branch frontend/build/acceptance verification is complete; fresh GitHub pull-request `CI` and `API foundation` runs on PostgreSQL 17 remain required before merge readiness is claimed. No production database migration or L2 production enablement was performed by this local verification.


- Remote pickup collection is not active in UAT: even after the private
  receipt and staff-only command are merged, full terminal operations, ID
  verification training, pickup fee/slot semantics and refund/exception
  workflows need end-to-end approval. Never activate the pickup flag on
  code completion alone.

- Remote pickup staff controls require real UAT with trained operators and
  verified payment-provider outcomes. The interface is ready for tests,
  but `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` and
  `LOGISTICS_CUSTOMER_PICKUP_ENABLED` must remain disabled pending signoff.
- Customer tracking displays confirmed pickup readiness. Separate
  appointment slots now exist, but they require enabled logistics flags,
  a centre policy and a genuinely ready paid shipment. A richer
  directions/navigation handoff still needs on-site validation.


- Dedicated **customer collection appointments** have been implemented with
  separate centre hours, per-slot capacity, booking/rescheduling/cancellation
  and verified staff collection. They are **not yet activated** in UAT.
  Missed-appointment, late-arrival and reminder handling remains incomplete.
  Do not advertise the transport slot as a customer collection appointment.

- Remote pickup appointments are not enabled in UAT; the new policy and
  booking UI require operational verification of real centre staffing.
  Explicit one-off holiday/closure dates are built, with existing-booking
  conflict checks; they do not auto-notify/reschedule or affect transport.
  Late arrivals, no-show state, SMS reminder, third-party calendar
  integration, and delivery ETA remain unimplemented. Do not activate
  either logistics flag on code completion alone.
