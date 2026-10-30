# Variety Groceries Wave L2 Shipment Route Execution — Implementation Plan

> **For implementation:** Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming completion.

**Goal:** Add production-safe Shipment Route Execution so delivery orders can snapshot an L1 route, activate logistics custody atomically at Fulfilment handover, move through real persisted legs/stops, and become Dispatch-eligible only at the configured final-mile node, while preserving direct-route behavior and existing authority boundaries.

**Architecture:** L1 (`LogisticsNode`, `LogisticsLane`, workflows and route rules) remains configuration authority. L2 adds immutable per-order shipment route snapshots plus append-only movement evidence. `LogisticsModule` remains the lower-level authority and exports planning/execution/final-mile services; Orders, Fulfilment and Dispatch may import Logistics, but Logistics must not import those modules. A server rollout flag defaults L2 execution off so schema/code can deploy without changing live delivery behavior. When enabled, new delivery checkout must resolve and snapshot a valid route; Fulfilment activates it inside the same PostgreSQL transaction as stock depletion; Dispatch permits legacy no-shipment orders but requires any present shipment to be final-mile-ready.

**Tech Stack:** NestJS/TypeScript, Prisma 7/PostgreSQL, Zod shared contracts, Node test runner, Next.js/Bun regression suite, deterministic OpenAPI.

**Spec:** `docs/superpowers/specs/2026-10-17-configurable-logistics-tracking-notifications-authority-design.md` — Wave L2 sections 8–10, 19–29.

## Global Constraints

- No shipment event may mutate payment/refund/COD truth.
- Inventory is depleted exactly once at Fulfilment handover; transit never creates sellable stock.
- `DeliveryJob` remains final-mile only; linehaul/inter-node movement belongs to Logistics.
- Existing handed-over orders with no Shipment remain Dispatch-compatible as legacy orders.
- New delivery orders only require Shipment planning when `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true`.
- Direct one-stop route remains immediately Dispatch-eligible after Fulfilment handover.
- Multi-hop route is not Dispatch-eligible until arrival at `final_mile_dispatch`.
- Customer pickup terminal routes may become `ready_for_pickup`; this wave does not invent a customer-collection authority or public pickup-selection UI.
- Reroute preserves completed history and only supersedes unstarted future route legs.
- `ShipmentEvent` is append-only; custom checkpoints never establish delivery/payment/stock/custody truth.
- All movement/reroute mutations require admin auth, trusted-origin/CSRF policy, durable idempotency, audit and outbox evidence.
- No external courier API/provider capability is claimed in L2.

## Review Focus

1. Transaction/lock ordering across Order → Shipment → DeliveryJob so arrival/assignment races cannot create double authority.
2. Snapshot immutability: later L1 node/lane/rule edits cannot rewrite ShipmentStop/ShipmentLeg history.
3. Backward compatibility when the rollout flag is off and for old no-shipment handed-over orders.
4. No inventory mutation on depart/arrive/reroute/final-mile delivery synchronization.
5. OpenAPI surface says shipment movement is live only when execution is enabled; notifications/tracking L3/L4 remain closed.

---

## Task 1 — Add L2 configuration gate and shared shipment contracts

**Files**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/.env.example`
- Modify: `packages/contracts/src/logistics.ts`
- Modify: `packages/contracts/src/index.ts` only if exports are not wildcarded
- Test: `apps/api/test/logistics-contracts.spec.ts`
- Test: new `apps/api/test/logistics-execution-config.spec.ts`

**RED**
1. Add tests proving the rollout flag defaults `false`, accepts exact `true|false`, and rejects malformed values.
2. Add contract tests for literal shipment status/custody/leg-state vocabularies and strict request/response schemas for plan, depart, arrive, reroute and custom checkpoint.
3. Run the focused tests and confirm failure because config/contracts do not yet exist.

**GREEN**
4. Add `shipmentExecutionEnabled: boolean` to `ApiConfig`, sourced from `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` with default `false` and strict boolean parsing.
5. Add schemas/types for:
   - shipment status: `planned | at_node | in_transit | final_mile_ready | final_mile | ready_for_pickup | completed | exception`;
   - leg status: `planned | ready | in_transit | arrived | exception | superseded`;
   - custody: `source_staff | node_staff | linehaul_internal | provider | rider | customer | return_transit`;
   - admin plan/depart/arrive/reroute/checkpoint requests;
   - shipment list/detail/event/stop/leg views and action responses.
6. Keep reroute input server-authoritative: reason + optional service level only; browser does not supply a hidden route graph.
7. Run focused tests green.
8. Commit: `feat(logistics): define shipment execution contracts and gate`

---

## Task 2 — Persist normalized Shipment route execution authority

**Files**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202610300019_shipment_route_execution/migration.sql`
- Test: new `apps/api/test/shipment-schema.spec.ts`

**RED**
1. Write direct-DB tests for impossible states: duplicate `(orderId, sequence)`, invalid sequence/revision/positions, non-adjacent leg endpoints, arrival-before-departure, ShipmentEvent update/delete, and mutation of stop/leg snapshot identity.
2. Verify tests fail because models/tables are absent.

**GREEN**
3. Add `Shipment` relation from Order and fields: `sequence`, `workflowVersionId`, current `routeRuleId`, `routeRevision`, `status`, `originNodeId`, destination kind/final pickup/address snapshot, `currentNodeId`, `currentLegId`, nullable custody, activation/completion timestamps, version/timestamps.
4. Add `ShipmentStop` with route revision, position, live node relation plus immutable node code/public-name/kind/kindLabel snapshot, terminal role and optional planned timestamps.
5. Add `ShipmentLeg` with route revision, position, adjacent stop FKs, live lane FK plus immutable mode/provider/typical-minutes snapshot, status/depart/arrive/SLA/version.
6. Add append-only `ShipmentEvent` with optional leg/node, canonical event kind, actor, prior/new custody, safe title/detail/metadata, request ID and server timestamps.
7. Add SQL checks/indexes/triggers for adjacency, immutable snapshot identity, append-only event history and timestamp ordering.
8. Generate Prisma client and apply migration to fresh isolated PostgreSQL.
9. Run schema tests green.
10. Commit: `feat(logistics): add shipment execution persistence`

---

## Task 3 — Snapshot server-selected routes at checkout and via explicit admin planning

**Files**
- Modify: `apps/api/src/logistics/logistics-route-rule.service.ts`
- Create: `apps/api/src/logistics/shipment-planning.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Modify: `apps/api/src/orders/checkout-command.service.ts`
- Create: new controller route in `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Test: new `apps/api/test/shipment-planning.spec.ts`
- Test: modify `apps/api/test/checkout-command.spec.ts`

**RED**
1. Test flag-off checkout produces no Shipment and preserves current behavior.
2. Test flag-on delivery checkout with direct defaults creates exactly sequence-1 planned Shipment and immutable stop/leg snapshots in the same checkout transaction.
3. Test multi-hop snapshot copies node/lane display/config values so later L1 edits do not alter snapshot rows.
4. Test no-match/ambiguous route fails checkout atomically with no Order/Reservation/Shipment/Idempotency rows.
5. Test collection checkout remains shipment-free.
6. Test admin legacy planning is admin-only/idempotent and refuses a second shipment or an already handed-over order.
7. Verify RED.

**GREEN**
8. Refactor route resolution to support a transaction client without changing L1 behavior.
9. Add `ShipmentPlanningService` that:
   - resolves active source LogisticsNode from Inventory location;
   - resolves the route using server-known zone/locality/doorstep context;
   - loads one consistent rule graph and snapshots stops/legs/workflow into Shipment sequence 1;
   - creates no physical movement event while status is `planned`.
10. When L2 flag is enabled, call planning from delivery checkout after Order/address creation but before transaction commit. Keep direct source collection unchanged.
11. Add explicit admin `POST /admin/logistics/orders/{orderId}/plan` for legacy/admin-created pre-handover delivery orders. It may choose `doorstep` or a validated configured pickup terminal, but the server resolves the concrete rule.
12. Run focused tests green.
13. Commit: `feat(logistics): snapshot delivery routes before execution`

---

## Task 4 — Activate Shipment atomically at Fulfilment handover

**Files**
- Create: `apps/api/src/logistics/shipment-execution.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/fulfilment/fulfilment.module.ts`
- Modify: `apps/api/src/fulfilment/fulfilment-command.service.ts`
- Test: new `apps/api/test/shipment-activation.spec.ts`
- Test: modify `apps/api/test/fulfilment-handover.spec.ts`

**RED**
1. Test direct one-stop Shipment becomes `final_mile_ready`, at source node, custody `source_staff`, with one `fulfilment_handed_over` ShipmentEvent.
2. Test multi-hop Shipment becomes `at_node`, first leg `ready`, current node source.
3. Test pickup-terminal one-stop Shipment becomes `ready_for_pickup` and never Dispatch-ready.
4. Test flag-on handover without a planned Shipment fails and rolls back stock depletion, reservation consumption, FulfilmentRun, Order, audit/outbox/idempotency.
5. Test flag-off legacy handover remains byte-for-byte behaviorally compatible.
6. Verify RED.

**GREEN**
7. Add `activateForHandover(tx, ...)` using the existing Fulfilment transaction. It validates planned sequence-1 snapshot, activates physical custody, updates first leg/readiness and appends audit/outbox/ShipmentEvent.
8. Call it after `StockDepletionService.consumeClaim()` but before transaction commit; any failure rolls back depletion automatically.
9. Do not create Shipment for collection orders.
10. Run focused + existing fulfilment handover tests green.
11. Commit: `feat(logistics): activate shipment at stock handover`

---

## Task 5 — Implement depart, arrive and informational checkpoint commands

**Files**
- Modify: `apps/api/src/logistics/shipment-execution.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Create: `apps/api/test/shipment-movement.spec.ts`
- Create: `apps/api/test/shipment-concurrency.spec.ts`

**RED**
1. Depart requires active `at_node`, exact next `ready` leg and current node equal leg origin.
2. Depart replay returns the same result; changed body under the same key conflicts.
3. Depart sets leg `in_transit`, Shipment `in_transit`, clears current node, sets current leg, derives custody from lane mode, appends exactly one event/audit/outbox, and does not mutate stock/reservations/payments.
4. Arrive requires exact active current leg/destination, sets leg `arrived`, clears current leg, sets current node and either marks next leg `ready`, `final_mile_ready`, or `ready_for_pickup`.
5. Concurrent depart/depart and arrive/arrive produce one winner with no double event.
6. Skipping a stop or arriving the wrong leg is rejected.
7. Custom checkpoint appends informational evidence only; no Shipment state/custody, Order, stock or payment field changes.
8. Verify RED.

**GREEN**
9. Implement movement commands with actor-scoped idempotency, `Shipment` + active-leg row locks, server timestamps and atomic audit/outbox/event writes.
10. Add admin routes:
    - `POST /admin/logistics/shipments/{shipmentId}/depart`
    - `POST /admin/logistics/shipments/{shipmentId}/arrive`
    - `POST /admin/logistics/shipments/{shipmentId}/checkpoints`
11. Run focused tests green.
12. Commit: `feat(logistics): execute shipment departures and arrivals`

---

## Task 6 — Implement safe reroute with route revisions

**Files**
- Modify: `apps/api/src/logistics/shipment-planning.service.ts`
- Modify: `apps/api/src/logistics/shipment-execution.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Create: `apps/api/test/shipment-reroute.spec.ts`

**RED**
1. Reroute allowed only while physically at a node with no active leg and before final completion.
2. Server resolves a new active rule from current node to the same destination authority; browser cannot submit stops/lanes.
3. Completed/arrived prior legs remain unchanged; only unstarted future legs are superseded.
4. New revision starts at `routeRevision + 1`, creates immutable new stop/leg snapshots, and preserves old revision rows/events.
5. Replay is stable; changed reason/service level conflicts.
6. No-match/ambiguous reroute leaves old route/state untouched.
7. Verify RED.

**GREEN**
8. Implement revision-safe reroute and `shipment_rerouted` event with old/new rule/revision in safe metadata.
9. Add `POST /admin/logistics/shipments/{shipmentId}/reroute`.
10. Run focused tests green.
11. Commit: `feat(logistics): preserve history across shipment reroutes`

---

## Task 7 — Gate Dispatch on final-mile readiness and synchronize final-mile shipment custody

**Files**
- Create: `apps/api/src/logistics/shipment-final-mile.service.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/dispatch/dispatch.module.ts`
- Modify: `apps/api/src/dispatch/dispatch-command.service.ts`
- Modify: `apps/api/src/dispatch/dispatch-query.service.ts`
- Modify: `apps/api/src/dispatch/dispatch-event.service.ts`
- Modify: `apps/api/src/dispatch/rider-command.service.ts` only if event-hook integration cannot cover all required transitions cleanly
- Test: modify `apps/api/test/dispatch-assignment.spec.ts`
- Test: modify `apps/api/test/dispatch-query.spec.ts`
- Test: new `apps/api/test/shipment-dispatch-integration.spec.ts`

**RED**
1. Direct route is assignable immediately after handover.
2. Multi-hop Shipment is absent from Dispatch queue and assignment is rejected until final-mile node arrival.
3. Legacy handed-over orders with no Shipment remain assignable for backward compatibility.
4. Arrival racing assignment has one truthful outcome: assignment cannot commit before final-mile readiness.
5. Assignment records a Shipment event but does not change physical custody.
6. Rider/manual-provider pickup moves Shipment to `final_mile` and custody `rider|provider` exactly once.
7. Delivery completion moves Shipment to `completed`, custody `customer`, without payment/COD settlement or inventory mutation.
8. Verify RED.

**GREEN**
9. Add a Shipment eligibility check that locks/rechecks sequence-1 shipment when present.
10. Update Dispatch list query to include legacy no-shipment orders OR final-mile-ready shipments, excluding in-transit routed orders.
11. Hook Dispatch event recording to shipment final-mile synchronization in the same transaction for assignment/pickup/out-for-delivery/failure/reschedule/delivery events as appropriate.
12. Preserve existing DeliveryJob authority/proof rules.
13. Run focused dispatch/rider tests green.
14. Commit: `feat(dispatch): respect shipment final-mile readiness`

---

## Task 8 — Add admin shipment reads, strict API authority and deterministic OpenAPI

**Files**
- Create: `apps/api/src/logistics/shipment-query.service.ts`
- Modify: `apps/api/src/logistics/admin-logistics-shipments.controller.ts`
- Modify: `apps/api/src/logistics/logistics.module.ts`
- Modify: `apps/api/src/http/production-openapi.ts`
- Modify: affected fixed path-count tests under `apps/api/test/*authority*.spec.ts`
- Create: `apps/api/test/shipment-http.spec.ts`
- Create: `apps/api/test/shipment-authority.spec.ts`
- Regenerate: `docs/openapi-foundation.json`

**RED**
1. Admin list/detail require admin role and return bounded shipment projection with snapshots/events/allowed actions.
2. Non-admin cannot read or mutate shipment authority.
3. OpenAPI documents exactly the new shipment route family with auth, replay and CSRF boundaries; no public/customer route-aware tracking is claimed in L2.
4. OpenAPI still excludes notification/SLA/provider routes.
5. Verify RED.

**GREEN**
6. Add:
   - `GET /admin/logistics/shipments`
   - `GET /admin/logistics/shipments/{shipmentId}`
   - `POST /admin/logistics/orders/{orderId}/plan`
   - `POST /admin/logistics/shipments/{shipmentId}/depart`
   - `POST /admin/logistics/shipments/{shipmentId}/arrive`
   - `POST /admin/logistics/shipments/{shipmentId}/reroute`
   - `POST /admin/logistics/shipments/{shipmentId}/checkpoints`
7. Add strict shared schemas/envelopes to OpenAPI and update exact path-count assertions to the new count without weakening authority assertions.
8. Regenerate OpenAPI twice and prove byte identity.
9. Run focused authority/OpenAPI tests green.
10. Commit: `feat(api): publish shipment execution authority`

---

## Task 9 — Update operator docs and rollout/runbook boundary

**Files**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`
- Modify: `docs/LOGISTICS_CONFIGURATION_RUNBOOK.md`
- Modify: `apps/api/.env.example`

1. Document that L2 code is implemented but execution defaults off.
2. Document enablement prerequisites: direct bootstrap or verified route coverage for intended zones, route simulation, fresh migration, UAT direct + multi-hop evidence.
3. State L3 tracking, L4 notifications, COD remittance, Physical Returns, POS, live courier adapters and GPS/ETA remain closed.
4. Add rollback: disable L2 execution for new checkout; never delete Shipment history or rewrite completed route events.
5. Commit: `docs(logistics): add shipment execution rollout runbook`

---

## Task 10 — Whole-branch verification and merge-quality review

1. Recreate isolated `variety_foundation_test` PostgreSQL database from empty state.
2. Apply every migration; record count and output.
3. Run complete API suite: `npm test --prefix apps/api`.
4. Run root `npm run lint`, root typecheck if configured, and exact-head `npm run build`.
5. Run Bun regression/acceptance/route-sweep suites used by CI.
6. Run `git diff --check` and credential-like literal scan.
7. Generate production OpenAPI twice and compare SHA-256.
8. Request code review using `superpowers:requesting-code-review`; fix findings with TDD.
9. Run `superpowers:verification-before-completion` exact-head checks.
10. Push branch, open PR, wait for both repository workflows (`CI`, `API foundation`) to pass, then merge only against the verified head SHA.
11. Synchronize canonical `/home/lightworld/dev/vgroceries-base` main worktree after merge.
