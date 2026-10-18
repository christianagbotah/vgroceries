# Logistics L1 Configuration Runbook

Wave L1 configures the logistics network, immutable delivery-workflow versions, and deterministic route rules. It does **not** execute shipments, record parcel movement, dispatch notifications, connect a courier provider, settle COD, restock returns, or change payment authority.

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

## 8. Before enabling Wave L2

Wave L2 may begin only after L1 migrations, API tests, deterministic 82-path OpenAPI, UI regressions, production build, and CI are green. L2 will introduce shipment execution and final-mile dispatch gating; customer tracking and notification delivery remain later waves.
