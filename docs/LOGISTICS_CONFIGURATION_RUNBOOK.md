# Logistics L1 Configuration + L2 Shipment Execution Runbook

Wave L1 configures the logistics network, immutable delivery-workflow versions, and deterministic route rules. Wave L2 adds server-owned Shipment route snapshots and movement execution behind `LOGISTICS_SHIPMENT_EXECUTION_ENABLED`, which defaults to `false`. L2 does **not** dispatch notifications, connect a live courier provider, settle COD, restock returns, publish customer route-aware tracking, or change payment authority.

## 1. Prerequisites

Before configuring logistics, confirm that the API database is migrated, the commerce configuration bundle is complete, `COMMERCE_LOCATION_ID` points to an active inventory `Location`, and delivery zones are reviewed. The direct bootstrap creates a route only for delivery zones that are active at the moment the command runs.

Use an active administrator user ID as the audit actor. Do not use a rider, customer, disabled account, or fabricated identifier.

## 2. Inspect before changing anything

In the owner-admin portal open **Logistics & Delivery** and review:

- **Locations & hubs** — existing source facilities, hubs, outlets and pickup points.
- **Network lanes** — configured links between facilities. A provider configuration key is not proof that a courier integration is live.
- **Workflows** — published versions are immutable. A new change must be made in a draft and published as a new version.
- **Route rules** — active rules are read-only until explicitly deactivated. Use **Route simulation** to verify matching and ambiguity.

If `VG_DIRECT_SOURCE`, `VG Direct doorstep default`, or any `VG Direct doorstep · <zone-id>` rule already exists with different operator-owned configuration, the guarded bootstrap fails. It never overwrites those resources.

## 3. Optional guarded direct-route bootstrap

This command exists only to preserve today's single-source direct-delivery behavior while L1 is introduced. It is **never** called by API startup, migrations, deployment, or normal request handling.

From `apps/api`, after building the API, run:

```bash
LOGISTICS_BOOTSTRAP_CONFIRM=DIRECT_DEFAULTS \
LOGISTICS_BOOTSTRAP_ACTOR_ID=<active-admin-user-id> \
npm run logistics:bootstrap-direct
```

The command is transactionally idempotent. It ensures:

- one active `VG_DIRECT_SOURCE` logistics node linked to `COMMERCE_LOCATION_ID`;
- one published `VG Direct doorstep default` workflow;
- one active direct-doorstep rule per currently active delivery zone;
- one `final_mile_dispatch` stop and zero logistics lanes for each direct rule.

A second run with compatible defaults reuses the same records and creates nothing new. Any incompatible stable default causes the transaction to fail rather than modifying operator configuration.

## 4. Configure a multi-hop delivery network

For a route such as Head Office → Regional Hub → District Hub → Pickup Point:

1. Create every real facility under **Locations & hubs**. Link a node to an Inventory `Location` only when that relationship is real; transit facilities do not automatically become sellable-stock locations.
2. Create each real directed connection under **Network lanes**. Each adjacent route stop must have an active lane with matching origin and destination.
3. Create or clone a workflow draft. Keep system events separate from customer-facing display labels. `custom_checkpoint` is informational only and cannot create payment, inventory, custody, COD, refund, or delivery truth.
4. Publish the workflow version. Published content becomes immutable.
5. Create an inactive route rule. Set origin, delivery zone, optional locality/service-level selectors, destination kind, workflow version, priority, effective window, ordered stops, and exact adjacent lanes.
6. Use **Route simulation** for representative order contexts.
7. Activate with server preflight. If another matching active rule has the same highest priority, activation fails as ambiguous. Fix the rules instead of relying on a browser-side tie-breaker.

## 5. Pickup and direct-doorstep semantics

- **Collection at source**: one origin stop, terminal role `customer_pickup`, no delivery zone and no lanes.
- **Remote pickup point**: delivery route that ends at the configured pickup node with terminal role `customer_pickup`.
- **Direct doorstep**: if the source is already the final-mile dispatch point, the route may contain one `final_mile_dispatch` stop and zero lanes.
- **Multi-hop doorstep**: intermediate stops are `transit`; the final stop is `final_mile_dispatch`; every adjacent pair requires exactly one configured lane.

## 6. Safe deactivation order

Dependencies fail closed. To remove a network element safely:

1. Deactivate route rules that use it.
2. Deactivate lanes that are no longer referenced by active rules.
3. Deactivate nodes only after active incoming/outgoing lanes and active route-rule dependencies are removed.

The portal keeps the editor open and shows the dependency conflict if the server rejects deactivation.

## 7. Rollback / disable L1 configuration

Wave L1 has no shipment-runtime cutover, so rollback is configuration-only:

1. Deactivate the affected route rules.
2. Leave published workflow history intact; never rewrite a published version.
3. Deactivate unused lanes/nodes in dependency order if required.
4. Do not delete or rewrite audit/outbox evidence.

Do **not** attempt to rollback L1 by changing Orders, Fulfilment runs, Delivery jobs, Payment attempts, Refunds, Stock lots, Reservations, or Stock depletion records. L1 owns none of those runtime authorities.

## 8. Enable Wave L2 only after route coverage is ready

Wave L2 is implemented but defaults **off**. With `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false`, checkout creates no Shipment plan, the admin legacy-planning command is closed, and legacy handed-over orders without Shipment rows keep the pre-L2 Dispatch behavior.

Before setting the flag to `true`:

1. Apply the current migration set, including `202610300019_shipment_route_execution`.
2. Confirm `COMMERCE_LOCATION_ID` and the intended source Logistics Node are correct.
3. For every delivery zone to be activated, either run the guarded direct bootstrap or review a real multi-hop route.
4. Simulate representative zone/locality/service-level inputs. Resolve every no-match and equal-highest-priority ambiguity before cutover.
5. Confirm every selected workflow is published and every adjacent multi-hop stop has the intended active lane.
6. Run the direct and multi-hop UAT sequences below against the same API/web build intended for deployment.
7. Keep L3 customer route-aware tracking and L4 notifications disabled; L2 admin evidence is not a customer tracking feed.

The flag is the single operational cutover for **new** Shipment planning/execution. Do not create Shipment rows by direct database scripts.

## 9. Required L2 UAT

### Direct doorstep

1. Enable L2 in the UAT API process.
2. Complete a delivery checkout whose server-resolved route is one `final_mile_dispatch` stop.
3. Verify exactly one `planned` Shipment exists and no movement event claims departure/arrival before handover.
4. Complete Fulfilment handover. Verify stock depletes once and the Shipment becomes `final_mile_ready` at source custody in the same transaction.
5. Verify the order is eligible for Dispatch assignment.
6. Rider or manual-provider pickup must move Shipment custody to `rider` or `provider` and status to `final_mile` exactly once.
7. Delivery must complete Shipment custody to `customer` without a second stock mutation and without marking COD paid.

### Multi-hop doorstep

1. Complete checkout against a route with at least one real lane and verify the frozen stop/lane display snapshot.
2. Fulfilment handover activates the Shipment at the source and marks only the first leg ready.
3. `depart` must move only that ready leg to `in_transit`; `arrive` must complete only the active leg and make the next leg ready.
4. Repeat in order until the terminal `final_mile_dispatch` stop is reached and Shipment becomes `final_mile_ready`.
5. Confirm Dispatch was unavailable before final-mile readiness and becomes available only after terminal arrival.
6. Complete final-mile pickup/delivery and reconfirm COD/payment and inventory authorities remain separate.

### Pickup terminal

A route ending in `customer_pickup` must become `ready_for_pickup`, never `final_mile_ready`. Do not route it through rider Dispatch merely because the parcel has arrived at a terminal.

## 10. Reroute and checkpoint rules

Reroute is allowed only while the Shipment is physically at a node, has no active leg, is incomplete and L2 is enabled. The client supplies intent/reason/service level only; the server resolves the replacement route. Prior stop/leg revisions remain immutable and only unstarted future legs of the old revision may be superseded.

A custom checkpoint is informational append-only evidence. It must not change Shipment location/custody, inventory, payment, refund, COD or delivery status.

## 11. Disable / rollback L2 safely

To stop new L2 execution, set `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` and redeploy the API configuration. Then:

1. Preserve every Shipment, Stop, Leg and Event row; never delete or rewrite route history.
2. Do not directly mark active shipments completed, arrived or delivered in PostgreSQL.
3. Do not use rollback to restore stock; physical stock authority remains the existing handover/Returns boundary.
4. Legacy no-Shipment handed-over orders may continue under the pre-L2 Dispatch compatibility rule.
5. Mid-route Shipments will remain pending while movement commands are disabled. Operationally drain them before disabling where possible, or re-enable the same verified L2 authority to finish them. Do not fabricate movement to clear a queue.

L3 customer route-aware tracking, L4 notifications, COD remittance, Physical Returns/restocking, POS, live courier integrations and GPS/ETA remain separate future authorities.
