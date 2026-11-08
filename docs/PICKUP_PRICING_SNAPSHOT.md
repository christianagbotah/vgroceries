# Remote pickup price acceptance and immutable collection-centre details

This increment completes **centre-specific transport-price configuration** and
order-time customer-safe location details. It does **not** create customer
collection appointments, activate pickup operations, alter payment settlement
or remove any logistics/collection release gate.

## Pickup pricing policy (pesewas in DB, ₵ in UI)

An authenticated owner admin can configure `pickupFeeMinor` on an active
`pickup_point` logistics node. This optional property has three states:

- `null` (default) — customer transport to the selected pickup centre is
  charged at the normal **delivery zone fee**.
- `0` — explicitly free transport to this centre.
- Any whole pesewa amount from `1` through `1,000,000` (₵0.01–₵10,000.00)
  — configured centre-specific fee.

All other node kinds must have `pickupFeeMinor=null`. The backend and a SQL
constraint reject invalid node kinds/amounts. Staff cannot silently infer a
discount merely because a parcel ends at a customer pickup centre.

When the two rollout flags are enabled, verified public pickup-centre discovery
includes `feeMinor` and `feeBasis` alongside previously public details.
`POST /checkout/quote` may optionally take both `destinationKind=pickup_point`
and a `finalPickupNodeId`, resolving the same active, unambiguous route
authority as centre discovery. It returns the authoritative fee and total.

For a remote pickup checkout, `expectedDeliveryFeeMinor` is required; it is
part of the checkout idempotency hash. The server locks the configured node
and recomputes the price. A mismatch yields **409 PICKUP_FEE_CHANGED**, with
the currently configured fee and **no** order, reservation, slot booking,
payment, shipment or snapshot. Customers must review the new amount and
retry. Legacy doorstep and source-store collection requests are unchanged;
attempts to pass a pickup fee acceptance to those flows are rejected.

The existing delivery-zone minimum merchandise order and transport slot rules
continue to apply to remote pickup. A zone transport slot is **not a customer
collection appointment**. A customer must wait for a committed
`ready_for_pickup` shipment event before travelling. No pickup-time promise,
custom appointment capacity, opening-hour guarantee or ETA is invented.

## Immutable customer display

A successful pickup checkout atomically creates a private
`OrderPickupSnapshot` with the selected public centre name, address,
locality, region, GhanaPost GPS text, public directions and contact, fee amount
and basis, and the frozen transport window if one was booked. It references
the actual planned shipment and costs recorded on the order, not a customer
editable or inferred route. The database trigger independently verifies the
active node, matching fee and zone policy, public fields and transport slot;
it refuses subsequent UPDATE/DELETE and second insertion.

The customer order details and payment/status view show **only the public
snapshot** through `PublicOrder.pickupPoint`; they never serialize route IDs,
custody, staff IDs, receipt private receiver name, verification code,
payment-provider details or internal logistics node names. Customer tracking
at the final pickup node also uses the frozen customer-facing centre name
instead of a later admin rename. The current shipment timeline is still the
only authority for arrival, collection and completion times. A disabled or
renamed centre does not retroactively change what an existing order promised.

## UAT rollout and rollback

- Both `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` and
  `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false` remain default and **must not be
  enabled automatically by migration or application deployment**.
- A new, additive migration adds nullable node fees and order snapshots.
  Backfill is intentionally not invented for historical shipments. Older
  orders without the snapshot display the existing legacy order view.
- Apply only after a protected database backup and rehearsal against a copy
  of UAT. Rebuild and smoke-test both API and portal together; never deploy
  code assuming the new schema before applying its migration.
- The remote pickup flag can be turned **off** to stop new pickup quotes and
  checkouts. Existing order snapshots and shipment history must remain
  readable and are not deleted. Never roll back by dropping the new table
  if pickup orders exist.
- Full on-site operations review, real payment-provider outcomes, pickup
  readiness, no duplicate stock depletion, disputes/refunds, customer contact,
  mobile UI/accessibility and appointment policy remain release signoff gates.

## What is still out of scope

Customer appointment booking and centre-specific opening hours/capacity;
transport slot changes after paid checkout; exception handling for a closed
centre; delivery provider ETA, pickup reminders via SMS/WhatsApp and cashier
pay-at-centre settlement. None is simulated or claimed.
