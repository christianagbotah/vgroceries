# Wave L2 Shipment Route Execution & Dispatch Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative shipment route execution for configured logistics routes, activate shipments atomically at Fulfilment handover, move parcels through configured nodes with append-only custody evidence, and make Dispatch eligible only at the final-mile node while preserving current direct-route behavior.

**Architecture:** Extend the L1 Logistics configuration authority with normalized `Shipment`, `ShipmentStop`, `ShipmentLeg` and `ShipmentEvent` persistence plus focused planner/query/command/Dispatch-bridge services. Delivery orders receive an immutable route snapshot inside the same checkout transaction when shipment execution is enabled; Fulfilment activates that snapshot inside the same PostgreSQL transaction as stock depletion; admin movement commands advance only the next persisted leg; Dispatch/Rider remains the sole final-mile authority and projects its events into Logistics without becoming linehaul. A default-off rollout switch preserves current production behavior until staging/UAT is configured and explicitly enabled.

**Tech Stack:** NestJS, Prisma/PostgreSQL 17+, Zod/shared TypeScript contracts, Next.js 16/React 19, existing `Idempotency`/`AuditEvent`/`OutboxEvent` patterns, existing Fulfilment/Dispatch/Rider authorities, Node test runner, Bun regression suite.

**Spec:** `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md` — Wave L2 only.

## Global Constraints

- L2 implements **shipment execution and final-mile Dispatch integration only**. It does not cut over public/customer tracking, notification delivery, COD collection/remittance, Physical Returns, live courier APIs, GPS or ETA.
- Existing production `main` baseline is merge commit `e119cf68f10e4d0ab1a3ffd3c7847e095dadc67a` with **82 OpenAPI paths** and 10 migrations.
- `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` defaults to `false`; when false, checkout/Fulfilment/Dispatch retain current direct behavior and no new shipment mutation is required.
- When execution is enabled, every **new delivery order** must receive exactly shipment sequence `1` and an immutable route snapshot inside checkout before the order transaction commits.
- Existing `fulfilment=collection` remains direct source collection and does not create a routed shipment. A remote pickup point remains `fulfilment=delivery` with destination kind `pickup_point`.
- Browser/client input may select a supported destination kind/pickup point, but it never selects hidden route rules, lane state, custody, movement status or workflow authority.
- Zero matching route rules fail closed with `LOGISTICS_ROUTE_NOT_CONFIGURED`; equal highest-priority matches fail closed with `LOGISTICS_ROUTE_AMBIGUOUS`.
- Route snapshots freeze workflow version, public node identity, lane mode/provider identity and route order. Later L1 configuration edits never rewrite an order's shipment history.
- Fulfilment handover remains the **only stock-depletion boundary**. Shipment activation happens in that same PostgreSQL transaction; if activation fails, stock depletion and handover both roll back.
- Arrival at an Inventory-backed logistics node never creates sellable stock, StockLot, Reservation, StockMovement or return/restock truth.
- `DeliveryJob` remains final-mile only. No linehaul leg creates a DeliveryJob.
- Direct route orders remain Dispatch-eligible immediately after authoritative source handover. Multi-hop orders remain ineligible until the shipment reaches its configured `final_mile_dispatch` terminal stop.
- Legacy already-handed-over delivery orders with no shipment remain Dispatch-compatible; L2 must not strand historical work by retroactively requiring fabricated route history.
- Admin-created/pre-existing **pre-handover** delivery orders without a snapshot require the explicit validated plan command before handover when shipment execution is enabled.
- Movement/reroute/checkpoint mutations are administrator-only, CSRF/trusted-Origin protected for cookie sessions, require `Idempotency-Key`, and lock/recheck shipment state before mutation.
- Shipment events are append-only. Custom checkpoints are informational and cannot establish stock, payment, COD, proof, custody transfer or successful delivery.
- Rider and manual-provider final-mile lifecycle remains owned by Dispatch/Rider. Logistics only receives an atomic projection event/custody update from those already-authoritative commands.
- COD payment state remains independent. A delivered COD shipment must not be marked paid/remitted by Logistics.
- Failed/returned goods may gain reverse-logistics events/custody, but no saleable restock occurs in L2.
- L2 adds exactly **7 distinct production path keys**, taking OpenAPI from 82 to **89 paths**.
- No L3 account/admin tracking routes or L4 notification routes may appear in production OpenAPI in this wave.

## Review Focus

- **Legacy compatibility:** an already-handed-over legacy delivery with no `Shipment` must remain assignable in Dispatch, while a new enabled pre-handover order without a required snapshot must fail closed; Tasks 4, 5 and 9 pin this distinction.
- **Multi-hop early dispatch:** a routed shipment cannot enter Dispatch while at source, in transit, or at an intermediate hub; only arrival at the configured `final_mile_dispatch` terminal enables assignment; Tasks 7 and 9 pin this.
- **Transit inventory isolation:** arrival at a node linked to Inventory `Location` must leave every stock/reservation/depletion table unchanged; Task 7 pins a before/after inventory snapshot.
- **Race safety:** concurrent depart/arrive/replay and final-node-arrival-vs-Dispatch-assignment races must serialize to one valid state without duplicate events or deadlocks; Tasks 7 and 9 pin this.
- **Reroute history:** rerouting after completed legs must preserve completed stops/legs/events, supersede only unstarted future legs, increment route revision, and never mutate the frozen original route history; Task 8 pins this.

---

## File / Module Map

### Shared contracts and rollout configuration

- Modify `packages/contracts/src/logistics.ts` — L2 shipment/custody/leg/event vocabularies, views and command schemas.
- Modify `packages/contracts/src/checkout.ts` — optional delivery destination selector for remote pickup, defaulting to doorstep behavior.
- Modify `packages/contracts/src/validation.ts` — request validation for checkout and seven L2 operations.
- Modify `packages/contracts/src/endpoints.ts` — seven L2 operation mappings.
- Modify `src/services/contracts/index.ts`, `src/services/contracts/endpoints.ts` as required by the web compatibility layer.
- Modify `apps/api/src/config.ts` — `logisticsShipmentExecutionEnabled` from `LOGISTICS_SHIPMENT_EXECUTION_ENABLED`, default `false`.

### Persistence and Logistics authority

- Modify `apps/api/prisma/schema.prisma` — add `Shipment`, `ShipmentStop`, `ShipmentLeg`, `ShipmentEvent` and relations.
- Create `apps/api/prisma/migrations/202610190010_logistics_shipment_execution/migration.sql` — normalized shipment persistence and DB-bypass constraints/triggers.
- Create `apps/api/src/logistics/logistics-shipment.types.ts` — internal route-snapshot and bridge inputs shared by focused services.
- Modify `apps/api/src/logistics/logistics-route-rule.service.ts` — transaction-aware route resolution/snapshot locking without duplicating L1 matching rules.
- Create `apps/api/src/logistics/logistics-shipment-planner.service.ts` — immutable sequence-1 route snapshot creation.
- Create `apps/api/src/logistics/logistics-shipment-query.service.ts` — admin list/detail plus final-mile readiness reads.
- Create `apps/api/src/logistics/logistics-shipment-command.service.ts` — handover activation, depart, arrive, reroute and checkpoint authority.
- Create `apps/api/src/logistics/logistics-dispatch-bridge.service.ts` — atomic final-mile event/custody projection from Dispatch/Rider.
- Create `apps/api/src/logistics/admin-logistics-shipments.controller.ts` — seven L2 admin routes.
- Modify `apps/api/src/logistics/logistics.module.ts` — provide/export the four L2 services and controller.

### Existing authority integration

- Modify `apps/api/src/orders/checkout-command.service.ts` — atomic route planning for new delivery orders when rollout is enabled.
- Modify the Orders module that provides `CheckoutCommandService` — import `LogisticsModule` without creating a reverse dependency.
- Modify `apps/api/src/fulfilment/fulfilment-command.service.ts` — call shipment activation inside the existing handover transaction after depletion succeeds and before commit.
- Modify `apps/api/src/fulfilment/fulfilment.module.ts` — import `LogisticsModule`.
- Modify `apps/api/src/dispatch/dispatch-policy.service.ts` only for pure decision helpers needed by the query layer; do not move Logistics state mutation here.
- Modify `apps/api/src/dispatch/dispatch-command.service.ts` — lock/recheck final-mile readiness and project assignment/return events.
- Modify `apps/api/src/dispatch/dispatch-query.service.ts` — hide multi-hop shipments from the dispatch-ready queue until terminal readiness.
- Modify `apps/api/src/dispatch/rider-command.service.ts` — atomically project rider accepted/pickup/out/fail/deliver events and custody into Shipment.
- Modify `apps/api/src/dispatch/dispatch.module.ts` — import `LogisticsModule`.

### Admin web experience

- Create `src/features/logistics/shipments-panel.tsx` — shipment queue/detail and server-allowed movement actions.
- Modify `src/features/logistics/logistics-workspace.tsx` — add `Shipments` tab.
- Modify `src/services/client.ts`, `src/services/operation-registry.ts` and adapters where required for seven operations.
- Modify `src/services/mock/router.ts` and focused mock state only enough to exercise the admin UI state machine; never fabricate GPS/ETA/provider-network evidence.

### OpenAPI, tests and handoff

- Modify `apps/api/src/http/production-openapi.ts` and regenerate `docs/openapi-foundation.json` — exactly 89 paths.
- Add focused API tests named in Tasks 1–10.
- Add/update `scripts/logistics-ui-regressions.test.ts`, `scripts/contracts-check.ts`, `scripts/handoff-regressions.ts`.
- Create `docs/SHIPMENT_EXECUTION_RUNBOOK.md`.
- Update `docs/HANDOFF.md`, `docs/KNOWN_ISSUES.md`, `docs/VERIFICATION.md` only after exact-head verification.

## Production L2 Route Surface

These are the only new path keys in Wave L2:

1. `GET /api/v1/admin/logistics/shipments`
2. `GET /api/v1/admin/logistics/shipments/{shipmentId}`
3. `POST /api/v1/admin/logistics/orders/{orderId}/plan-shipment`
4. `POST /api/v1/admin/logistics/shipments/{shipmentId}/depart`
5. `POST /api/v1/admin/logistics/shipments/{shipmentId}/arrive`
6. `POST /api/v1/admin/logistics/shipments/{shipmentId}/reroute`
7. `POST /api/v1/admin/logistics/shipments/{shipmentId}/checkpoint`

The five POST mutation commands require administrator authentication, trusted Origin/CSRF policy and `Idempotency-Key`. `GET` list/detail are administrator-authenticated reads. No public/account tracking endpoint changes in L2.

---

### Task 1: Freeze L2 shared contracts and rollout switch

**Files:**
- Modify: `packages/contracts/src/logistics.ts`
- Modify: `packages/contracts/src/checkout.ts`
- Modify: `packages/contracts/src/validation.ts`
- Modify: `packages/contracts/src/endpoints.ts`
- Modify: `src/services/contracts/index.ts`
- Modify: `src/services/contracts/endpoints.ts`
- Modify: `apps/api/src/config.ts`
- Test: `apps/api/test/logistics-shipment-contracts.spec.ts`
- Test: existing API config tests

**Interfaces:**
- Produce `shipmentStatusSchema` with exact values: `planned | at_node | in_transit | final_mile_ready | ready_for_pickup | final_mile_in_progress | delivered | customer_collected | exception | return_transit`.
- Produce `shipmentLegStatusSchema`: `planned | ready | in_transit | arrived | exception | superseded`.
- Produce `shipmentCustodySchema`: `source_staff | node_staff | linehaul_internal | provider | rider | customer | return_transit`.
- Produce `shipmentEventActorKindSchema`: `staff | rider | system` for L2; manual-provider milestones remain staff-recorded evidence.
- Produce `ShipmentStopView`, `ShipmentLegView`, `ShipmentEventView`, `ShipmentView`, `ShipmentListResponse`.
- Produce request schemas: `planShipmentRequestSchema`, `departShipmentRequestSchema`, `arriveShipmentRequestSchema`, `rerouteShipmentRequestSchema`, `checkpointShipmentRequestSchema`.
- `departShipmentRequestSchema` accepts only `expectedVersion`, optional bounded `handoverReference`, optional bounded `note`; custody is server-derived from the frozen lane snapshot.
- `arriveShipmentRequestSchema` accepts only `expectedVersion` and optional bounded `note`; destination node is server-derived from the active leg.
- `rerouteShipmentRequestSchema` accepts `expectedVersion`, `replacementRuleId`, required bounded `reason`; no arbitrary stops/lanes/custody.
- `checkpointShipmentRequestSchema` accepts `expectedVersion`, bounded customer-safe `title`, optional `detail`, optional internal `note`; it cannot accept status/custody/payment/stock/proof fields.
- Extend `CompleteOrderRequest` with optional `destinationKind: "doorstep" | "pickup_point"` and optional `finalPickupNodeId`; absence means `doorstep`. Collection checkout must reject both; pickup delivery requires `finalPickupNodeId`; doorstep rejects it.
- Add exactly seven endpoint mappings matching the route surface above.
- Add `ApiConfig.logisticsShipmentExecutionEnabled: boolean`; only exact `true` enables it, omitted/`false` means disabled.

- [ ] **Step 1: Write failing contract/config tests** for every exact enum, strict command body, checkout destination cross-field rules, seven endpoint mappings and default-off config.
- [ ] **Step 2: Run contracts build + focused tests and confirm RED** because shipment contracts/config do not exist.
- [ ] **Step 3: Implement the shared schemas/types and checkout cross-field validation** without exposing server-derived status/custody/route-rule identity as writable fields.
- [ ] **Step 4: Add the seven endpoint mappings and config parser**; reject any `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` value other than omitted, `true` or `false`.
- [ ] **Step 5: Re-run the focused contract/config tests and require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): define shipment execution contracts`.

---

### Task 2: Add normalized Shipment persistence and DB integrity

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610190010_logistics_shipment_execution/migration.sql`
- Test: `apps/api/test/logistics-shipment-schema.spec.ts`

**Interfaces:**
- Add `Shipment` with UUID id, `orderId`, positive `sequence`, pinned `workflowVersionId`, optional source `routeRuleId`, operational `status`, `originNodeId`, `destinationKind`, optional `finalPickupNodeId`, bounded `destinationAddressSnapshot Json?`, positive `currentRouteRevision`, optional `currentNodeId`, optional `currentLegId`, `custodyState`, `activatedAt`, `finalMileReadyAt`, `completedAt`, optimistic `version`, timestamps.
- Add `ShipmentStop` with `shipmentId`, positive `routeRevision`, positive `position`, live `nodeId`, immutable snapshot `nodeCode`, `nodePublicName`, `nodeKind`, optional `kindLabel`, `terminalRole`, nullable planned/SLA timestamps.
- Add `ShipmentLeg` with `shipmentId`, positive `routeRevision`, positive `position`, origin/destination stop FKs, live `laneId`, immutable snapshots `laneMode`, optional `providerKey`, positive `typicalMinutes`, status, depart/arrival timestamps, optional SLA deadline, optimistic version.
- Add append-only `ShipmentEvent` with shipment, optional leg/node, route revision, canonical event kind, actor kind/id, prior/new custody, optional customer-safe title/detail snapshot, bounded safe metadata JSON, request id, optional correction link, occurred/created timestamps.
- Add reverse `Order.shipments`, node/route/workflow/lane relations needed by Prisma.

- [ ] **Step 1: Write direct-DB RED tests** proving sequence > 0 and `(orderId, sequence)` uniqueness; stop/leg revision-position uniqueness/positivity; leg stops belong to same shipment/revision and are adjacent; arrival cannot predate departure; immutable stop snapshots cannot update/delete; leg route identity cannot be repointed after creation; event rows cannot update/delete; `currentLegId` must belong to the same shipment/current revision; rider custody requires an authoritative DeliveryJob for that order.
- [ ] **Step 2: Run the new schema test and confirm RED** on the missing tables/invariants.
- [ ] **Step 3: Add Prisma models/relations** with `UNIQUE(orderId, sequence)` rather than `UNIQUE(orderId)` so later split shipments remain additive while L2 service policy still permits only sequence `1`.
- [ ] **Step 4: Add SQL checks/triggers** for cross-row adjacency, immutable snapshots/history, timestamp ordering, current-leg membership and rider-custody correspondence. Keep legal status transitions in services rather than encoding the whole state machine in triggers.
- [ ] **Step 5: Apply all migrations to a brand-new PostgreSQL 17 database, regenerate Prisma and run the schema test.** Require 11 migrations applied and focused PASS.
- [ ] **Step 6: Commit** with `feat(logistics): add shipment execution persistence`.

---

### Task 3: Implement transaction-aware route resolution and immutable planning

**Files:**
- Create: `apps/api/src/logistics/logistics-shipment.types.ts`
- Modify: `apps/api/src/logistics/logistics-route-rule.service.ts`
- Create: `apps/api/src/logistics/logistics-shipment-planner.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-shipment-planning.spec.ts`
- Test: `apps/api/test/logistics-route-simulation.spec.ts`

**Interfaces:**
- Add `LogisticsRouteRuleService.resolveForPlanning(tx: Prisma.TransactionClient, context: Omit<RouteSimulationRequest, "at">, at: Date): Promise<ResolvedRoutePlan>`.
- `resolveForPlanning` must reuse the exact L1 matching/priority/effective-date rules, lock/recheck the winning rule and dependencies inside the caller transaction, and return frozen stop/lane snapshot material. Do not maintain a second routing algorithm.
- Define `ResolvedRoutePlan` with rule/workflow IDs, destination kind/final pickup, ordered stop snapshots and ordered lane snapshots including lane mode/provider/typical minutes.
- Add `LogisticsShipmentPlannerService.planDeliveryOrder(tx, input): Promise<ShipmentView>` where input includes order id, source Inventory location id, zone id, persisted locality, destination kind/final pickup selector, optional service level, normalized destination address snapshot, actor/request IDs and server `at` timestamp.
- Planner derives the active origin `LogisticsNode` from `inventoryLocationId`, resolves a route, enforces one shipment sequence `1`, and writes shipment + route revision 1 stops/legs in one transaction.
- Planner does not activate movement, emit departure/arrival facts or change inventory/fulfilment/dispatch/payment.

- [ ] **Step 1: Write RED planner tests** for direct one-stop/zero-leg snapshot, multi-hop snapshot, remote pickup snapshot, no-match, ambiguity, missing source-node mapping, same-order second-plan rejection and configuration rename after planning leaving the snapshot unchanged.
- [ ] **Step 2: Run planning + existing route simulation tests and confirm RED** on the missing planner/transaction resolver.
- [ ] **Step 3: Refactor route resolution internally** so simulation and transactional planning share one matching implementation; preserve all existing L1 behavior/tests.
- [ ] **Step 4: Implement planner persistence** from locked `ResolvedRoutePlan`; snapshot node/lane display/identity fields and only bounded normalized delivery address data.
- [ ] **Step 5: Re-run planner + all L1 route-rule/simulation/concurrency tests and require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): snapshot shipment routes transactionally`.

---

### Task 4: Plan new checkout shipments atomically and expose legacy pre-handover planning

**Files:**
- Modify: `apps/api/src/orders/checkout-command.service.ts`
- Modify: Orders module providing `CheckoutCommandService`
- Create/Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Create/Modify: `apps/api/src/logistics/logistics-shipment-command.service.ts` for the explicit plan wrapper only in this task
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/checkout-logistics-planning.spec.ts`
- Test: `apps/api/test/logistics-shipment-plan-command.spec.ts`

**Interfaces:**
- When `logisticsShipmentExecutionEnabled === false`, checkout behavior and existing checkout tests remain unchanged and create no Shipment.
- When enabled and `fulfilment === "delivery"`, `CheckoutCommandService.complete()` calls `planDeliveryOrder()` **inside its existing transaction** after server-owned order/address facts exist and before idempotency outcome commit.
- The source Inventory location is `commerce.locationId`; locality/address comes from persisted/validated checkout address; destination defaults to `doorstep`; pickup requires an active customer-visible `finalPickupNodeId`.
- Any route-planning failure rolls back Order, delivery address, allocation, slot booking, audit/outbox and idempotency outcome together.
- Collection checkout still creates no Shipment.
- Add admin `POST /admin/logistics/orders/{orderId}/plan-shipment` for delivery orders with no shipment that are still pre-handover. It derives source from FulfilmentRun location when present, otherwise configured commerce location; derives zone/locality/address from persisted Order data; request may provide only destination kind/final pickup/service level plus expected order version if needed. It never accepts route rule/stops/lanes.
- Already-handed-over legacy orders cannot be backfilled by this command; no historical movement may be fabricated.

- [ ] **Step 1: Write RED checkout tests** proving enabled direct/multi-hop planning, pickup selection validation, route failure full rollback, collection no-shipment, and disabled compatibility.
- [ ] **Step 2: Write RED admin plan-command tests** for pre-handover success, replay, second-shipment refusal, handed-over refusal and browser inability to choose a route rule.
- [ ] **Step 3: Implement checkout injection/module wiring** without introducing a reverse Logistics -> Orders dependency.
- [ ] **Step 4: Implement the explicit plan command** using existing idempotency/audit/outbox patterns and the same planner.
- [ ] **Step 5: Re-run all checkout/guest-checkout/order cancellation tests plus the two new L2 suites; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): plan delivery shipments at checkout`.

---

### Task 5: Activate Shipment inside Fulfilment handover transaction

**Files:**
- Modify: `apps/api/src/logistics/logistics-shipment-command.service.ts`
- Modify: `apps/api/src/fulfilment/fulfilment-command.service.ts`
- Modify: `apps/api/src/fulfilment/fulfilment.module.ts`
- Test: `apps/api/test/logistics-shipment-activation.spec.ts`
- Test: `apps/api/test/fulfilment-handover.spec.ts`
- Test: existing Fulfilment rollback suite

**Interfaces:**
- Add `LogisticsShipmentCommandService.activateAtHandover(tx, { orderId, actorId, requestId, occurredAt }): Promise<ShipmentView | null>`.
- Disabled rollout returns `null` and preserves current Fulfilment behavior.
- Collection fulfilment returns `null`; routed Shipment is only for delivery orders.
- Enabled delivery with a planned shipment locks Shipment/current route and validates the frozen snapshot structurally. It does **not** re-resolve against newer L1 configuration or rewrite retired/renamed nodes/lanes.
- Enabled pre-handover delivery with no shipment fails `LOGISTICS_SHIPMENT_REQUIRED`.
- Multi-hop activation: shipment -> `at_node`, `currentNodeId=origin`, `custodyState=source_staff`, first current-revision leg -> `ready`, append `fulfilment_handed_over` event.
- Direct one-stop `final_mile_dispatch`: shipment -> `final_mile_ready`, set `finalMileReadyAt`, no leg.
- Direct one-stop `customer_pickup`: shipment -> `ready_for_pickup`; L2 does not add a `customer_collected` mutation yet.
- Call activation in the **same transaction** as `StockDepletionService.consumeClaim` and FulfilmentRun/Order handover writes. Any activation/audit/outbox failure must roll the stock depletion back.

- [ ] **Step 1: Write RED tests** for direct activation, multi-hop first-leg readiness, remote pickup readiness, missing-plan failure, disabled compatibility and activation fault rollback restoring stock/reservation/Fulfilment state.
- [ ] **Step 2: Confirm RED** with focused activation + handover tests.
- [ ] **Step 3: Implement activation and module injection** with the established Order-first transaction/lock order.
- [ ] **Step 4: Add shipment activation audit/outbox rows in the same transaction**; provider calls/network I/O remain absent.
- [ ] **Step 5: Run focused activation + complete Fulfilment handover/concurrency suites and require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): activate shipments at fulfilment handover`.

---

### Task 6: Implement administrator Shipment read authority

**Files:**
- Create: `apps/api/src/logistics/logistics-shipment-query.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Test: `apps/api/test/logistics-shipments-query.spec.ts`

**Interfaces:**
- Add `list(query): Promise<ShipmentListResponse>` with bounded pagination/filtering by operational status, node and order reference.
- Add `get(shipmentId): Promise<ShipmentView>` returning route revisions, ordered stops/legs, bounded event history, current node/leg, custody and `allowedActions` derived from server state.
- `allowedActions` may expose only `depart | arrive | reroute | checkpoint` in L2. `depart` only at a current node with next leg ready; `arrive` only while in transit; `reroute` only while at a node before final completion; `checkpoint` only for non-completed shipment.
- Do not expose internal staff identity beyond stable admin-safe IDs already allowed, provider credentials, raw webhooks, customer verification code/hash, exact private GPS telemetry or stock lots.

- [ ] **Step 1: Write RED query/controller tests** for admin-only access, pagination, direct/multi-hop views, route-revision ordering, event bounds and state-derived `allowedActions`.
- [ ] **Step 2: Confirm RED** on missing query/controller behavior.
- [ ] **Step 3: Implement query projection** with one focused Prisma graph loader and shared view mapper; no mutation.
- [ ] **Step 4: Wire GET list/detail controller routes** under existing admin session/role guard.
- [ ] **Step 5: Run focused query tests and existing Logistics authorization tests; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): add shipment operations read model`.

---

### Task 7: Implement authoritative depart/arrive movement

**Files:**
- Modify: `apps/api/src/logistics/logistics-shipment-command.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Test: `apps/api/test/logistics-shipment-movement.spec.ts`
- Test: `apps/api/test/logistics-shipment-concurrency.spec.ts`
- Test: `apps/api/test/logistics-shipment-inventory-boundary.spec.ts`

**Interfaces:**
- Add `depart(actorId, shipmentId, idempotencyKey, input, requestId): Promise<ShipmentView>`.
- Add `arrive(actorId, shipmentId, idempotencyKey, input, requestId): Promise<ShipmentView>`.
- Both commands use the existing idempotency table/advisory-lock pattern, then lock Shipment and current route leg before revalidating state/version.
- Depart requires active nonterminal shipment at the exact origin of the next current-revision leg with leg `ready`; no client-supplied node/leg/custody. It derives custody as `provider` when the frozen leg has `providerKey`, otherwise `linehaul_internal`; marks leg `in_transit`, clears current node, sets current leg, appends `shipment_departed`, audit and outbox.
- Arrive requires shipment `in_transit`, current leg matching the persisted active leg and leg status `in_transit`; it marks leg `arrived`, clears current leg, sets current node/custody `node_staff`, appends `shipment_arrived`, then intermediate -> `at_node` + next leg ready, terminal `final_mile_dispatch` -> `final_mile_ready`, terminal `customer_pickup` -> `ready_for_pickup`.
- Neither command mutates Order payment/fulfilment/delivery state, FulfilmentRun, DeliveryJob, StockLot, Reservation, StockPosition or StockMovement.

- [ ] **Step 1: Write RED movement tests** for exact next leg, skipped-stop rejection, duplicate replay, stale version, depart-twice, arrive-before-depart and final-node terminal behavior.
- [ ] **Step 2: Write RED concurrency tests** where two departures or two arrivals race and only one transition/event wins.
- [ ] **Step 3: Write the inventory-boundary regression** capturing inventory/reservation/depletion rows before and after arrival at an Inventory-backed hub; assert semantic equality.
- [ ] **Step 4: Implement depart/arrive** with one consistent lock order and append-only event/audit/outbox evidence.
- [ ] **Step 5: Run movement/concurrency/inventory tests plus direct DB schema bypass tests; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): execute shipment departures and arrivals`.

---

### Task 8: Implement reroute and informational checkpoint authority

**Files:**
- Modify: `apps/api/src/logistics/logistics-shipment-command.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Reuse/Modify: `apps/api/src/logistics/logistics.values.ts` safe-presentation validation as needed
- Test: `apps/api/test/logistics-shipment-reroute.spec.ts`
- Test: `apps/api/test/logistics-shipment-checkpoint.spec.ts`

**Interfaces:**
- Add `reroute(actorId, shipmentId, idempotencyKey, input, requestId): Promise<ShipmentView>`.
- Reroute is legal only while physically at a node and before final completion; it locks Shipment/current revision, validates the referenced replacement `DeliveryRouteRule` is active, starts at `currentNodeId`, has the same frozen workflow version and destination kind/final pickup identity, and cannot require rewriting completed movement.
- On success: preserve every prior stop/leg/event, mark only unstarted current-revision future legs `superseded`, increment `currentRouteRevision`, append a new remaining-route snapshot beginning at current node, set first new leg ready or terminal readiness, append `shipment_rerouted` with bounded reason metadata.
- Add `checkpoint(actorId, shipmentId, idempotencyKey, input, requestId): Promise<ShipmentView>` that appends `custom_checkpoint` only and never changes shipment/leg/custody/payment/inventory/delivery truth.
- Reuse L1 customer-visible wording protection so checkpoint title/detail cannot claim paid/refunded/COD-remitted/delivered truth.

- [ ] **Step 1: Write RED reroute tests** for after-one-leg history preservation, wrong-origin replacement rule, changed workflow rejection, changed destination rejection, replay, stale version and all-old-row snapshot immutability.
- [ ] **Step 2: Write RED checkpoint tests** proving append-only information, unsafe wording rejection and unchanged operational/financial/stock state.
- [ ] **Step 3: Implement reroute** as append/new-revision rather than destructive route edits.
- [ ] **Step 4: Implement checkpoint** through the same idempotency/audit/outbox boundary with no protected state transition.
- [ ] **Step 5: Run reroute/checkpoint plus movement/schema tests; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): add shipment reroute and checkpoints`.

---

### Task 9: Gate Dispatch by final-mile Shipment readiness

**Files:**
- Modify: `apps/api/src/logistics/logistics-shipment-query.service.ts` or add a focused readiness method
- Modify: `apps/api/src/dispatch/dispatch-command.service.ts`
- Modify: `apps/api/src/dispatch/dispatch-query.service.ts`
- Modify: `apps/api/src/dispatch/dispatch.module.ts`
- Test: `apps/api/test/logistics-dispatch-eligibility.spec.ts`
- Test: `apps/api/test/logistics-dispatch-race.spec.ts`
- Re-run: existing Dispatch assignment/query/concurrency suites

**Interfaces:**
- Add `assertFinalMileReady(tx, orderId): Promise<Shipment | null>` with this compatibility rule: if sequence-1 Shipment exists, it must be `final_mile_ready`, at the terminal `final_mile_dispatch` node, with no active leg/blocking exception; if no Shipment exists, return `null` and let existing authoritative Fulfilment handover rules govern the legacy order.
- `DispatchCommandService.assign()` keeps current Order/Fulfilment stock/handover checks, then locks/rechecks Shipment readiness before creating/updating DeliveryJob.
- `DispatchQueryService.listDispatch()` includes legacy no-shipment handed-over orders and shipment-backed orders only when final-mile ready or already in an existing final-mile DeliveryJob lifecycle; it excludes planned/at-node/in-transit/ready-for-pickup multi-hop shipments.
- `DeliveryJob` remains absent during linehaul; no Logistics leg is represented as a job.

- [ ] **Step 1: Write RED eligibility tests** for direct route ready-after-handover, multi-hop blocked at source/in-transit/intermediate node, allowed after terminal arrival, remote customer-pickup never entering Dispatch, and legacy no-shipment compatibility.
- [ ] **Step 2: Write RED race test** for final-node arrival vs admin assignment. It may reject the early assignment or allow the post-arrival assignment, but must never assign before persisted readiness, deadlock or create duplicate jobs.
- [ ] **Step 3: Implement readiness integration** with consistent Order -> DeliveryJob/Shipment lock ordering and no Logistics mutation in the pure queue read.
- [ ] **Step 4: Update Dispatch queue query projection** without changing existing job privacy/payment/COD semantics.
- [ ] **Step 5: Run focused tests plus complete Dispatch assignment/query/concurrency suite; require PASS.**
- [ ] **Step 6: Commit** with `feat(dispatch): require logistics final-mile readiness`.

---

### Task 10: Project Dispatch/Rider final-mile lifecycle into Shipment atomically

**Files:**
- Create: `apps/api/src/logistics/logistics-dispatch-bridge.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/dispatch/dispatch-command.service.ts`
- Modify: `apps/api/src/dispatch/rider-command.service.ts`
- Modify: `apps/api/src/dispatch/dispatch.module.ts`
- Test: `apps/api/test/logistics-final-mile-bridge.spec.ts`
- Re-run: rider lifecycle/ownership, Dispatch exceptions and manual-provider suites

**Interfaces:**
- Add `recordFinalMileEvent(tx, input): Promise<void>`; if no Shipment exists, return without mutation for legacy compatibility.
- For shipment-backed orders, verify the Shipment belongs to the same order and bridge only canonical Dispatch/Rider evidence already persisted in the same transaction.
- Map final-mile events: assign/reassign -> `rider_assigned` event while shipment stays `final_mile_ready`; rider accept -> `rider_accepted`; rider/manual-provider pickup -> `rider_picked_up`, shipment `final_mile_in_progress`, custody `rider` or `provider`; out-for-delivery -> `out_for_delivery`; failed -> `delivery_failed` + shipment `exception`; rescheduled -> `delivery_rescheduled`; delivered -> `delivered`, custody `customer`, `completedAt`; return instruction -> `returned_toward_store`, shipment `return_transit`, custody `return_transit`; physical returned-goods receipt -> `shipment_handover` with safe `returnReceived` metadata, custody `node_staff`, status `exception`, **no restock**.
- The bridge never writes PaymentAttempt, paymentStatus, COD liability/remittance, Reservation, StockLot or StockMovement.
- Existing Dispatch/Rider idempotency owns replay; bridge events must not duplicate on replay.

- [ ] **Step 1: Write RED rider bridge lifecycle test** from assignment -> accept -> pickup -> out -> deliver and assert exact Shipment custody/status/event sequence while COD remains unpaid.
- [ ] **Step 2: Write RED manual-provider/failure/reschedule/return tests** proving staff-recorded provider evidence maps without network calls and returned goods do not restock.
- [ ] **Step 3: Implement bridge service and inject it into Dispatch/Rider commands** after authoritative DeliveryJob updates but before transaction commit.
- [ ] **Step 4: Add bridge fault-rollback test**: injected ShipmentEvent/outbox failure must roll back the corresponding DeliveryJob/Order transition too.
- [ ] **Step 5: Run focused bridge + complete Rider/Dispatch lifecycle/ownership/privacy tests; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): project final-mile custody events`.

---

### Task 11: Add the administrator Shipments execution workspace

**Files:**
- Create: `src/features/logistics/shipments-panel.tsx`
- Modify: `src/features/logistics/logistics-workspace.tsx`
- Modify: `src/services/client.ts`
- Modify: `src/services/operation-registry.ts`
- Modify adapters/mock router/state only where required
- Test: `scripts/logistics-ui-regressions.test.ts`
- Test: client/operation-registry regression files used by L1

**Interfaces:**
- Add a `Shipments` tab beside L1 network/workflow configuration.
- Queue cards/table show order reference, shipment status, current public node/leg, route revision, custody, terminal type and server-derived `allowedActions`.
- Detail view shows ordered current-route stops/legs plus prior revision history and append-only events.
- Action forms call only the seven production operations; depart/arrive do not let the operator pick arbitrary node/leg; reroute chooses an existing replacement route rule; checkpoint copy is visibly informational.
- When rollout is disabled/unavailable, UI shows configuration status instead of simulating successful movement.
- Mock adapter may exercise the UI state machine deterministically for demos/tests but must not claim provider API, GPS, ETA, payment, COD, stock or delivery proof authority.

- [ ] **Step 1: Write RED UI/client regressions** for the new tab, list/detail operation mappings, server-driven allowed actions, no arbitrary leg/node movement fields, and no protected-truth wording on checkpoint.
- [ ] **Step 2: Implement typed client/registry mappings** for the seven operations.
- [ ] **Step 3: Implement `shipments-panel.tsx`** using existing Logistics workspace visual patterns and responsive admin layout.
- [ ] **Step 4: Extend mock state/router minimally** with deterministic route movement that leaves mock commerce stock/payment truth unchanged.
- [ ] **Step 5: Run UI/client/Bun regressions and root TypeScript; require PASS.**
- [ ] **Step 6: Commit** with `feat(logistics): add shipment execution workspace`.

---

### Task 12: Publish the 89-path contract, harden boundaries and complete verification

**Files:**
- Modify: `apps/api/src/http/production-openapi.ts`
- Regenerate: `docs/openapi-foundation.json`
- Test: `apps/api/test/logistics-shipment-authority.spec.ts`
- Test: `apps/api/test/logistics-shipment-authority-boundary.spec.ts`
- Modify: `scripts/contracts-check.ts`
- Modify: `scripts/handoff-regressions.ts`
- Create: `docs/SHIPMENT_EXECUTION_RUNBOOK.md`
- Update: `docs/HANDOFF.md`
- Update: `docs/KNOWN_ISSUES.md`
- Update: `docs/VERIFICATION.md`

**Interfaces / hard gates:**
- Production OpenAPI has exactly **89 paths**: existing 82 + the seven L2 paths, no L3 tracking/account/admin-order-tracking additions, no notification/COD/Returns/live-provider routes.
- Mutation routes document admin auth, Origin/CSRF, `Idempotency-Key`, strict request schemas and replay/error responses.
- Static authority scan proves Logistics shipment source has no stock depletion, Reservation/StockLot mutation, PaymentAttempt/Refund/COD mutation or provider-network/GPS/ETA primitive.
- `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` remains the deployment default in runbook examples; UAT enablement requires L1 bootstrap/config + route simulations first.

- [ ] **Step 1: Write RED OpenAPI/security/boundary tests** for the seven paths, exact 89-path count, admin auth/replay requirements, future-route absence and authority-source scan.
- [ ] **Step 2: Implement OpenAPI definitions and regenerate twice**; require byte-identical JSON and record SHA-256.
- [ ] **Step 3: Run a fresh empty PostgreSQL 17 migration gate** and require all **11 migrations** to apply.
- [ ] **Step 4: Run the complete API integration/security/concurrency suite** and record exact test/pass/fail count.
- [ ] **Step 5: Run focused L2 tests serially** across contracts/schema/planning/checkout/activation/query/movement/concurrency/reroute/checkpoint/Dispatch bridge and record exact count.
- [ ] **Step 6: Run root verification**: frozen install where CI requires it, ESLint, `tsc --noEmit --incremental false`, Next production build, Bun regressions, handoff regressions, shared contracts, acceptance and production-server route sweep.
- [ ] **Step 7: Run customer-facing/demo copy scan, `git diff --check`, whole-branch authority review and compare branch against current `origin/main`.** Reconcile any main movement before PR.
- [ ] **Step 8: Write `docs/SHIPMENT_EXECUTION_RUNBOOK.md`** covering disabled-by-default rollout, L1 preflight, direct-route smoke test, multi-hop smoke test, rollback by disabling execution, no historical backfill, and explicit non-live L3/L4/COD/Returns/provider capabilities.
- [ ] **Step 9: Update handoff/known-issues/verification only from fresh observed evidence** with exact head SHA/test counts/OpenAPI hash.
- [ ] **Step 10: Commit verification docs/scripts** with `docs(logistics): record Wave L2 shipment verification`.

---

## Self-Review Checklist

### Spec coverage

- Route snapshot / sequence-1 persistence: Tasks 2–4.
- Checkout atomic planning / zero-or-ambiguous fail closed: Tasks 3–4.
- Fulfilment activation in same stock-depletion transaction: Task 5.
- Direct route immediate final-mile readiness: Task 5.
- Multi-hop depart/arrive/custody: Task 7.
- Remote pickup terminal readiness: Tasks 4, 5 and 7.
- Reroute preserving completed history: Task 8.
- Informational custom checkpoint only: Task 8.
- Final-mile Dispatch eligibility generalization: Task 9.
- Rider/provider lifecycle projected into shipment without double authority: Task 10.
- DB-bypass integrity: Task 2.
- Admin shipment operations/API/UI: Tasks 6, 7, 8 and 11.
- Rollout compatibility/default-off switch: Tasks 1, 4, 5, 9 and 12.
- No L3/L4/COD/Returns/provider overclaim: Task 12.

### Deliberately deferred after L2

- Unified guest/customer/admin `OrderTrackingQueryService` and route-aware public/account tracking UI — L3.
- `customer_collected` mutation at a remote pickup point — requires a dedicated authenticated collection-proof authority; L2 stops safely at `ready_for_pickup` rather than inventing this protected completion.
- Email/SMS/WhatsApp/in-app notification rules/templates/delivery ledger — L4.
- SLA delay worker/analytics and AI routing/ETA recommendations — L5.
- COD collection/remittance and Physical Returns/restock — separate approved authorities.
- Live external courier booking/webhooks/GPS/ETA — separate provider authority.

## Execution Handoff

The previous implementation wave was explicitly executed **Native**, and this L2 plan preserves that execution method unless the human partner changes it. Before implementation, the written plan itself must still be reviewed/approved. After approval, use `superpowers:executing-plans`, create a fresh L2 implementation worktree from the then-current `main`, and execute task-by-task with TDD and frequent commits.
