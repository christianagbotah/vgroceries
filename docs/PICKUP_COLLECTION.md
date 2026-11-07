# Verified customer collection at remote pickup centres — rollout remains closed

This is **staff collection authority**, not a claim that the remote pickup
service is launched, staffed, verified in production, or financially settled
outside Payments Authority.

## Hard prerequisites

- `LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true` **and**
  `LOGISTICS_CUSTOMER_PICKUP_ENABLED=true` on an explicitly approved
  environment. Both remain **false** in the live UAT configuration.
- Configured active doorstep/pickup routes must be tested by zone. The new
  `POST /api/v1/admin/logistics/shipments/{shipmentId}/collect` is
  administrator-only. A customer, rider or unscoped inventory user may never
  complete collection. Signed-in web admins require trusted Origin/CSRF;
  native clients require the signed session token and replay key.
- Shipment must be sequence 1, destination `pickup_point`, status
  `ready_for_pickup`, current node exactly the frozen final pickup node,
  no current transport leg, and staff custody. Latest route terminal role
  must be `customer_pickup`.
- Original fulfilment handover must have **already depleted the reservation**
  and recorded `stockConsumedAt`. Collection never decrements, reserves or
  restocks stock.
- The order must have a verified `succeeded` electronic payment status
  owned by Payments. Cash-on-delivery, unverified/expired/refunded payment,
  and cashier collection are not payment shortcuts here.

## Collection evidence

An authenticated admin physically checks the receiver's photo ID (or an
authorized representative's photo ID), enters the **10-character order
verification code**, records the receiver's name and selects the explicit
identity-check attestation. The code is HMAC-verified against the order's
stored versioned digest using a constant-time comparison.

The code is **not saved** to the receipt, customer tracking, audit event or
outbox. The replay request is stored only as a cryptographic request hash.
The staff's receipt contains the receiver name privately, staff ID, pickup
node, ID-attestation type, code key version, completion timestamp and linked
shipment event. SQL trigger plus unique keys protect against duplicate
and forged receipt inserts; receipts cannot be updated or deleted.

In one database transaction the service updates:
1. Shipment to `completed`, custody `customer`, no current facility,
   completed timestamp.
2. Order fulfilment to `collected` (delivery execution remains unassigned;
   no fictitious rider/driver completion).
3. Append-only `customer_collected` ShipmentEvent, private receipt,
   customer-safe OrderEvent, staff audit, outbox event and replay outcome.

The transaction locks the order and shipment, enforces exact terminal state,
and is replay-safe across retried requests or concurrent staff commands.
The response contains the immutable receipt ID, order reference, node,
completion timestamp, shipment/order IDs and status — never the receiver
name or verification code. Authenticated customer tracking projects the
recorded `collected` state, not an estimated pickup timestamp.

A second database trigger rejects forged `ready_for_pickup` or `customer_collected` events unless the committed Shipment/Order state agrees.

Physical readiness also produces a `ready_for_pickup` ShipmentEvent and
outbox event **only after** the shipment reaches the terminal stop through
authoritative fulfilment activation, recorded route arrival or validated
reroute. It is not fabricated at checkout.

## Still required before opening remote pickup to customers

- Real staff operational walkthrough using pickup dispatchers at intended
  nodes, training and fraud/dispute handling.
- Pickup-specific schedule/slot semantics, fee policy and checkout order
  confirmation/customer account detail. Existing delivery slot labels are
  transport windows, not guaranteed customer appointments.
- Security review for using the same capability code in tracking and pickup;
  consider a **separate short-lived one-time collection token** before live
  rollout if threat modelling warrants it. Staff ID checking is an attestation,
  not an automated biometric or government ID verification service.
- Real provider payment-success evidence, end-to-end multihop UAT,
  order cancellation/refund after collection, notifications/content, mobile
  accessibility review and structured release/rollback approval.
- No independent courier integrations, cash collection, POS, payout, GPS/ETA,
  SMS/WhatsApp provider delivery or customer-ID document capture is claimed.

## Rollback

Keep `LOGISTICS_CUSTOMER_PICKUP_ENABLED=false` by default. Disabling it
closes **new pickup bookings and collections** but never deletes previously
recorded receipts, events or history. If mid-route remote pickups already
exist, operational teams must preserve and manage them under an approved
drain/re-enable plan. Do not modify immutable proof or bypass it with raw SQL.
The new migration should be applied only through a coordinated API/database
rollout, never against live UAT during isolated development.

## Isolated developer verification — 7 November 2026

- PostgreSQL 18 test database created solely for this branch;
  **25/25** migrations applied including the two collection integrity migrations.
- API TypeScript build passed. Focused PostgreSQL authority/collection,
  handover, movement and OpenAPI tests: **18 passed, 0 failed**.
- Production OpenAPI generated twice, byte-identical **116 paths**;
  SHA-256 `2454638da829da53f2a04b772073a1e04be633ec6e2bd3a2b00bc1a31e643fe2`.
- Full repository CI, security reviews and rollout approval are **not**
  implied by the focused verification; GitHub checks are required before merge.
