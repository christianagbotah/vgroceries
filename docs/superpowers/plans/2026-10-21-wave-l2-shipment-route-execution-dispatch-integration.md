# Wave L2 Shipment Route Execution + Dispatch Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the L1 logistics configuration authority into truthful per-order shipment execution: freeze a route for each new delivery order, activate it atomically at Fulfilment handover, move the parcel through configured nodes with append-only evidence, and expose final-mile Dispatch only when the configured terminal node has actually been reached.

**Architecture:** L2 adds a `Shipment` aggregate with immutable route snapshots (`ShipmentStop`, `ShipmentLeg`) and append-only `ShipmentEvent` evidence. Checkout creates sequence-1 shipment planning atomically with a new delivery order; Fulfilment activates that shipment inside the same PostgreSQL transaction as stock depletion; Logistics commands own inter-node depart/arrive/reroute/exception/customer-pickup execution; Dispatch remains the only final-mile rider/provider authority and becomes shipment-aware rather than treating every source handover as immediately assignable.

**Tech Stack:** TypeScript, NestJS, Prisma, PostgreSQL, Zod shared contracts, Next.js 16, Bun/Node test runners, existing audit/outbox/idempotency/session/CSRF infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md`

## Global Constraints

- Base on `main` at `7b65584c9075a91e2b48086cab1378b52571034e` or a later clean descendant; never drop the customer-account/wishlist fix that followed L1.
- Inventory is depleted exactly once by existing Fulfilment handover; no Shipment command may mutate inventory.
- For a shipment-required order, Fulfilment handover + stock depletion + shipment activation must commit or roll back in the same PostgreSQL transaction.
- Service policy permits exactly one Shipment with `sequence = 1`; persistence uses `UNIQUE(orderId, sequence)` for future split shipments.
- `DeliveryJob` remains final-mile only; linehaul/hub movement never becomes a DeliveryJob.
- Arrival at an inventory-backed node never creates sellable stock.
- Logistics movement never mutates electronic payment success, refunds, COD collection/remittance or proof-of-delivery authority.
- Remote pickup remains `fulfilment = delivery`; source `collection` stays direct source collection.
- Published workflow versions remain immutable; Shipment pins the exact published version and route snapshot.
- Historical orders receive no invented movement. Legacy unhanded delivery orders require explicit validated planning.
- Pre-L2 handed-over deliveries remain dispatch-compatible; new shipment-required orders fail closed if Shipment root/readiness is missing.
- L2 inter-node mutation is admin-only using existing session/CSRF/idempotency boundaries; no implicit inventory-manager/rider mutation power.
- Do not claim notification delivery, live GPS/ETA, external courier APIs, COD remittance, Physical Returns or L3 customer tracking.
- Storefront may choose a customer-visible pickup node, never a hidden route rule; server resolution stays deterministic/fail-closed.

## Review Focus

1. **No-match/ambiguous checkout route:** entire order/allocation/slot transaction rolls back.
2. **Activation failure at handover:** stock, reservation consumption, FulfilmentRun, Order and Shipment all roll back.
3. **Duplicate/racing movement commands:** one authoritative transition; idempotent replay never duplicates ShipmentEvent.
4. **Legacy vs bypass:** legacy handed-over orders work, but `logisticsExecutionRequired=true` cannot enter Dispatch before final-mile readiness, including direct DB writes.
5. **Terminal semantics:** doorstep ends `final_mile_dispatch`; remote pickup ends `customer_pickup`; pickup + COD fails closed until COD Collection Authority.

---

## File Structure

**Persistence/domain:** create `apps/api/prisma/migrations/202610210011_shipment_route_execution/migration.sql`, update `apps/api/prisma/schema.prisma`, and create `apps/api/src/logistics/shipment.values.ts`, `shipment-planning.service.ts`, `shipment-activation.service.ts`, `shipment-execution.service.ts`, `shipment-query.service.ts`, `admin-logistics-shipments.controller.ts`. Modify `logistics-route-rule.service.ts` and `logistics.module.ts`.

**Cross-authority integration:** modify `apps/api/src/orders/checkout-command.service.ts`, `checkout.controller.ts`, `orders.module.ts`; `apps/api/src/fulfilment/fulfilment-command.service.ts`, `fulfilment.module.ts`; `apps/api/src/dispatch/dispatch-policy.service.ts`, `dispatch-query.service.ts`, `dispatch-command.service.ts`.

**Contracts/browser:** modify `packages/contracts/src/logistics.ts`, `checkout.ts`, `endpoints.ts`, `index.ts`; `apps/api/src/http/openapi.ts`, `docs/openapi-foundation.json`; `src/services/client.ts`, `operation-registry.ts`, `mock/router.ts` and `mock/store.ts` only if required.

**UI:** create `src/features/logistics/shipments-panel.tsx`, `shipment-detail.tsx`; modify `logistics-workspace.tsx` and `src/app/(storefront)/checkout/page.tsx`.

**Tests:** create focused Shipment contract/schema/planning/activation/execution/concurrency/reroute/pickup/Dispatch/authority tests plus `scripts/logistics-shipment-ui-regressions.test.ts`; update contract/handoff/evidence docs only after verification.

---

### Task 1: Shared Shipment Runtime Contracts

**Files:** `packages/contracts/src/logistics.ts`, `checkout.ts`, `endpoints.ts`, `index.ts`; test `apps/api/test/logistics-shipment-contracts.spec.ts`.

**Interfaces:** produce strict Shipment list/detail/command contracts and customer-safe pickup-option contracts. All commands use `expectedVersion` plus server-derived actor/request context.

- [ ] Write RED tests for exact Shipment/leg/custody vocabularies, strict bodies, positive versions, bounded notes/reasons, and pickup-vs-doorstep cross-field rules.
- [ ] Run contracts/API build + focused test; expect RED on missing Shipment exports.
- [ ] Add Shipment statuses `planned | active_at_node | in_transit | exception | ready_for_pickup | customer_collected | final_mile_ready`; leg statuses `planned | ready | in_transit | arrived | exception | superseded`; custody `source_staff | node_staff | linehaul_internal | provider | customer`.
- [ ] Extend checkout input with optional `deliveryDestination`: omitted/`doorstep` or `pickup_point + finalPickupNodeId`; pickup projection exposes public name/directions/contact only.
- [ ] Add only implemented L2 endpoint mappings; no L3/L4/COD/Returns routes.
- [ ] Re-run focused tests/build; expect GREEN.
- [ ] Commit `feat(logistics): define shipment execution contracts`.

### Task 2: Shipment Persistence and Direct-DB Integrity

**Files:** `apps/api/prisma/schema.prisma`, migration `202610210011_shipment_route_execution`, test `logistics-shipment-schema.spec.ts`.

- [ ] RED direct-DB tests: duplicate sequence/positions, invalid leg timestamps/current-location state, ShipmentEvent UPDATE/DELETE, premature DeliveryJob root.
- [ ] Add `Shipment`, `ShipmentStop`, `ShipmentLeg`, `ShipmentEvent` with positive revisions/positions, immutable node/lane snapshots, versions/timestamps, and `UNIQUE(orderId, sequence)`.
- [ ] Add `Order.logisticsExecutionRequired BOOLEAN NOT NULL DEFAULT false`; do not backfill historical Shipment facts.
- [ ] Add append-only event trigger and leg/current-location consistency checks.
- [ ] Harden DeliveryJob root trigger: when compatibility bit is true require sequence-1 `final_mile_ready` at final-mile terminal; when false preserve legacy handover rule.
- [ ] Clean DB migration/schema test; expect GREEN.
- [ ] Commit `feat(logistics): add shipment execution persistence`.

### Task 3: Transaction-Aware Route Resolution and Immutable Planning

**Files:** `logistics-route-rule.service.ts`, new `shipment-planning.service.ts`, `shipment.values.ts`, `logistics.module.ts`; test `logistics-shipment-planning.spec.ts`.

**Interfaces:** `ShipmentPlanningService.planDeliveryShipment(tx,input)`, `planExistingDelivery(tx,input)`, and `LogisticsRouteRuleService.resolveInTransaction(tx,context,at)` returning full selected graph.

- [ ] RED direct/multi-hop/priority/no-match/ambiguity/snapshot-immutability/sequence-2 tests.
- [ ] Share one matching predicate across simulate/resolve/transaction resolver; lock selected rule/workflow/stops/lanes/nodes for consistent snapshot.
- [ ] Create sequence-1 revision-1 Shipment with frozen stop/leg snapshots; direct one-stop has zero legs, multi-hop legs start `planned`.
- [ ] Reject unpublished/inactive/terminal-mismatch routes and remote-pickup COD.
- [ ] Prove planning writes no stock/payment/refund/DeliveryJob truth.
- [ ] Re-run; expect GREEN.
- [ ] Commit `feat(logistics): plan immutable shipment routes`.

### Task 4: Checkout Route Snapshot and Customer Pickup Choice

**Files:** `checkout-command.service.ts`, `checkout.controller.ts`, `orders.module.ts`, storefront checkout page, `src/services/client.ts`; planning/UI tests.

- [ ] RED: order/allocation/slot/Shipment are one transaction; no-match/ambiguity leaves zero orphan rows.
- [ ] RED: pickup options expose only customer-visible active pickup nodes backed by valid routes and no hidden rule IDs/internal names.
- [ ] Import LogisticsModule and inject Shipment planning.
- [ ] Every new delivery order sets `logisticsExecutionRequired=true` and plans sequence 1 before checkout idempotency commits; source collection stays unchanged.
- [ ] Default omitted destination to doorstep. Remote pickup requires valid pickup node, disallows COD, and does not require a doorstep street-address snapshot.
- [ ] Add safe pickup-choice API from active route configuration + commerce origin; browser chooses node, server chooses route.
- [ ] Checkout UI shows Doorstep plus configured pickup centres; absence preserves current UI.
- [ ] Run focused tests; expect GREEN.
- [ ] Commit `feat(checkout): snapshot logistics route at order creation`.

### Task 5: Guarded Planning for Legacy Unhanded Deliveries

**Files:** shipment planning service/controller + planning tests.

- [ ] RED: pre-L2 delivery can be planned only before handover/stock consumption, derives source from FulfilmentRun/reservation coverage, sets compatibility bit true and replays idempotently.
- [ ] Refuse handed-over/cancelled/collection/existing-Shipment/no-match/ambiguity/stale-version cases.
- [ ] Implement admin-only command using same planning primitive; never invent historical movement.
- [ ] Re-run; expect GREEN.
- [ ] Commit `feat(logistics): add guarded legacy shipment planning`.

### Task 6: Atomic Fulfilment Handover + Shipment Activation

**Files:** new `shipment-activation.service.ts`; modify Fulfilment command/module and Logistics module; test `logistics-shipment-activation.spec.ts`.

**Interface:** `activateAtHandover(tx,{orderId,fulfilmentRunId,locationId,actorId,requestId,at})`.

- [ ] RED: direct becomes `final_mile_ready`; multi-hop becomes `active_at_node` with first leg `ready`; source node maps to Fulfilment location.
- [ ] Inject activation failure and assert stock/reservations/StockDepletion/FulfilmentRun/Order/Shipment all roll back.
- [ ] Call activation inside existing Fulfilment handover transaction, never nested transaction.
- [ ] Shipment-required orders require sequence-1 `planned`; legacy false preserves current handover behavior.
- [ ] Append `fulfilment_handed_over` ShipmentEvent/audit/outbox only—no external call.
- [ ] Run handover/stock/activation suites; expect GREEN.
- [ ] Commit `feat(fulfilment): activate shipment atomically at handover`.

### Task 7: Depart and Arrive Movement Authority

**Files:** new `shipment-execution.service.ts`; execution/concurrency tests.

- [ ] RED multi-hop lifecycle through all stops.
- [ ] Depart requires active Shipment, expected version, current node = next ready leg origin, no active conflicting leg, bounded evidence, admin identity/idempotency.
- [ ] Arrive requires current `in_transit`, matching current leg/destination, existing departure.
- [ ] Depart appends event, marks leg in transit, clears node, sets current leg/custody, audit/outbox.
- [ ] Arrive appends event, marks leg arrived, sets node/custody, then next leg ready or terminal `ready_for_pickup`/`final_mile_ready`.
- [ ] Race tests for duplicate depart/arrive, depart-vs-reroute, stale versions; one winner/no duplicate events.
- [ ] Inventory-backed node arrival creates zero inventory/reservation writes.
- [ ] Re-run; expect GREEN.
- [ ] Commit `feat(logistics): execute shipment depart and arrival`.

### Task 8: Checkpoints, Exceptions and Reroute Revisions

**Files:** shipment execution service + reroute/concurrency tests.

- [ ] RED checkpoint: `custom_checkpoint` informational only; no protected truth changes.
- [ ] RED exception: active leg may enter `exception`, blocks normal progression until explicit resolution; internal detail stays internal.
- [ ] RED reroute: only while physically at node/no active leg; completed revision untouched; unstarted remainder superseded; new remainder = revision + 1 from current node.
- [ ] Resolve reroute server-side from stored zone/locality/destination/service context; client never chooses hidden rule ID.
- [ ] Never delete old route rows/events; append `shipment_rerouted`.
- [ ] Re-run; expect GREEN.
- [ ] Commit `feat(logistics): add shipment exceptions and rerouting`.

### Task 9: Remote Pickup Completion Without Financial Leakage

**Files:** shipment execution service + `logistics-shipment-pickup.spec.ts`.

- [ ] RED: customer-pickup terminal reaches `ready_for_pickup`, not `delivered`, creates no DeliveryJob and changes no payment state.
- [ ] Require admin evidence, expected version, terminal node and electronically settled/non-COD state; COD pickup fails closed.
- [ ] Complete Shipment as `customer_collected`, custody `customer`, event/audit/outbox; no stock/refund/COD/proof mutation.
- [ ] Re-run pickup/authority tests; expect GREEN.
- [ ] Commit `feat(logistics): complete remote customer pickup safely`.

### Task 10: Shipment-Aware Final-Mile Dispatch Eligibility

**Files:** Dispatch policy/query/command, DB trigger, `logistics-dispatch-eligibility.spec.ts`, affected Dispatch/Rider tests.

- [ ] RED: direct route assignable after activation; multi-hop hidden/rejected until terminal arrival; terminal arrival becomes assignable; customer pickup never enters Dispatch.
- [ ] Legacy `logisticsExecutionRequired=false` handed-over order remains compatible.
- [ ] Require `final_mile_ready` when compatibility bit true while preserving existing stock/Fulfilment evidence checks.
- [ ] Queue hides routed orders until ready; never create linehaul DeliveryJobs.
- [ ] Lock order: Order first, then Shipment/DeliveryJob, consistently, to avoid arrival/handover assignment deadlocks.
- [ ] DB trigger enforces same root for direct writes.
- [ ] Arrival-vs-assignment and reroute-vs-assignment races: no deadlock/premature job.
- [ ] Full Dispatch/Rider focused suite; COD remains unpaid after delivery.
- [ ] Commit `feat(dispatch): gate final mile on shipment arrival`.

### Task 11: Admin Shipment API + OpenAPI Surface

**Files:** new shipment query/controller, Logistics module, OpenAPI source/generated file, Logistics authority test.

- [ ] RED HTTP/OpenAPI tests for auth/admin-only, CSRF/idempotency, strict schemas and responses.
- [ ] Admin list/detail includes order reference, Shipment status/custody/version/revision, frozen stops/legs, current node/leg, safe events, `allowedActions`/blockers.
- [ ] Wire list/detail, legacy plan, depart, arrive, checkpoint, exception, resolve-exception, reroute, customer-collected.
- [ ] No provider secrets, stock lots, fake GPS/ETA, L3 tracking, notifications, COD-remittance, Returns or courier webhook routes.
- [ ] Generate OpenAPI twice; byte identical/drift-free.
- [ ] Commit `feat(api): expose shipment execution authority`.

### Task 12: Browser Client, UAT Mock and Staff Shipment Workspace

**Files:** client/operation registry/mock router (+ mock store if needed), new Shipments panel/detail, Logistics workspace, UI regression.

- [ ] RED: Shipments tab exists; operations map to production registry; UI state cannot fabricate movement/readiness.
- [ ] Add typed client/cache invalidation.
- [ ] Add explicit mock-mode parity for UAT only; never call mock events production evidence.
- [ ] Queue: reference/status/current node/custody/exception/last event.
- [ ] Detail: frozen route revision, completed/current/pending legs, buttons strictly from server `allowedActions`; conflicts surfaced.
- [ ] No live-location/GPS/ETA/provider-network wording without future authority.
- [ ] UI regressions + lint + typecheck + production build; expect GREEN.
- [ ] Commit `feat(logistics): add shipment operations workspace`.

### Task 13: Authority Boundary, Clean-Room Verification and Handoff

**Files:** authority-boundary test, contract/handoff scripts, `docs/VERIFICATION.md`, `HANDOFF.md`, `KNOWN_ISSUES.md`.

- [ ] Snapshot tests prove Shipment commands do not mutate StockLot/StockPosition/Reservation/StockDepletion/PaymentAttempt/Refund/DeliveryProof/COD state.
- [ ] Handoff regressions: direct compatibility, multi-hop gating, inventory-backed hub no-restock, remote pickup no-payment mutation, legacy compatibility.
- [ ] Clean isolated PostgreSQL; apply every migration through `202610210011_shipment_route_execution`.
- [ ] Complete API integration/security/concurrency suite under CI environment; record exact summary only.
- [ ] Focused L2 contracts/schema/planning/activation/execution/concurrency/reroute/pickup/Dispatch/authority/OpenAPI suite.
- [ ] Generate OpenAPI twice; record exact path count/SHA and prove L3/L4/COD/Returns/provider-network routes absent.
- [ ] Root gates: lint, strict TypeScript, Next build, Bun, handoff, contracts, acceptance, production route sweep; record exact counts.
- [ ] Static-scan Logistics source for forbidden stock/payment/refund/COD/proof/network/GPS authority.
- [ ] Whole-branch review; Critical/Important findings require RED→GREEN fixes before integration.
- [ ] Update docs only from observed evidence; explicitly keep L3 tracking, L4 notifications, COD remittance, Physical Returns, external courier APIs and live GPS/ETA closed.
- [ ] Commit `docs(logistics): record Wave L2 shipment verification`.
- [ ] Push PR to `main`; require fresh GitHub CI + API-foundation PostgreSQL 17 success before merge.

---

## Self-Review

**Spec coverage:** immutable snapshot Tasks 2–5; one-shipment/split-ready Task 2; atomic activation Task 6; multi-hop movement Task 7; no-restock Tasks 7/13; append-only/reroute Tasks 2/8; pickup vs doorstep Tasks 3/4/9; Dispatch separation Task 10; legacy integrity Tasks 2/5/10; security/replay Tasks 1/5/7/8/9/11; operator UI Task 12; future-authority boundaries Tasks 11/13.

**Type consistency:** all commands use `expectedVersion`; route revision lives on Shipment/Stop/Leg/Event and changes only on reroute; Dispatch only consumes `final_mile_ready`; remote pickup ends `customer_collected` without counterfeiting delivery/COD/payment.

**Review Focus coverage:** checkout rollback Task 4; handover rollback Task 6; races Tasks 7/8/10; legacy bypass Tasks 2/5/10; terminal/COD Tasks 3/4/9.

**Proportion:** L2 only. L3 unified tracking, L4 notification providers/inbox, L5 SLA/AI analytics, COD remittance, Physical Returns and external courier adapters remain separate later work.
