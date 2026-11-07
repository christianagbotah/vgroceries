# Remote pickup-centre checkout — safely gated foundation

This is an **API foundation, not a customer pickup launch**. Remote pickup is still a delivery shipment while stock is transferred through the logistics network. Existing source-store collection remains unchanged.

## Feature gates

- `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` (default) preserves legacy dispatch and checkout.
- `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false` (new, independent default) keeps remote customer pickup hidden and its checkout command closed even if ordinary L2 shipment execution is enabled.
- The pickup gate can only be enabled with L2 enabled. **Do not turn it on until verified customer-collection authority, staffing, customer notices and end-to-end UAT have passed.** No UAT deployment/flag activation is part of this branch.

## Safe operations provided by this branch

- Public `GET /api/v1/checkout/zones/{zoneId}/pickup-points` returns `{enabled:false,points:[]}` when pickup is off. With the independent gate enabled, it lists only active, customer-visible pickup nodes with an active, unambiguous route for the selected active delivery zone. Only public directions/name/contact/address information is exposed. No internal lanes, rules, custody, rider location, GPS tracking or ETA appears.
- Existing `POST /api/v1/checkout/complete` accepts optional `destinationKind:"pickup_point"` + `finalPickupNodeId` for delivery orders, only while both flags are enabled. Otherwise missing values are interpreted as conventional doorstep delivery. Pickup orders do not require or accept a doorstep shipping address.
- Checkout resolves the pickup ID through server-owned active rules and snapshots the selected destination/route in the same transaction as the order, reservation and idempotency record. Invalid, deactivated, missing or ambiguous routes fail atomically. The client never submits a route graph.
- The selected destination and node ID affect checkout's canonical request hash so replay cannot silently switch centres.
- Existing delivery zone fees and slot rules remain authoritative and unchanged; **no cheaper pickup price, collection window or collection completion is promised** by this slice.
- The responsive checkout UI offers the pickup-centre option **only** when the server returns enabled configured centres, keeps the existing default delivery experience otherwise, and shows public directions without suggesting live ETA or an appointment. Prototype/mock mode reports disabled and no fabricated available centres.

## Before full release

1. Verified terminal collection implementation exists in the separately gated collection authority branch (see `docs/PICKUP_COLLECTION.md`), but operator UAT, security review and release activation are still mandatory.
2. Verify the implemented checkout pickup-centre selector at phone/tablet/desktop widths. Complete pickup-specific payment/slot pricing policy and the customer account/confirmation display before launch.
3. Verify multi-hop custody, correct stock depletion, terminal handoff, pickup evidence, refunds and exceptions in a separate database.
4. Verify customer-facing text, accessibility, mobile workflows and failure recovery.
5. Enable the dedicated flag in approved staging only, with rollback runbook and final release approval. Do not enable on live UAT merely because backend tests pass.

No live messages, payments, courier provider API or stock mutations are added by this change.
