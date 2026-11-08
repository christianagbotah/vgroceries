# Pickup centre staff workspace — staged, no live collection activation

## Staff entry

The owner administrator opens **Logistics & Delivery → Shipment operations**
(`/admin/logistics/shipments`). Other demo staff roles see an access-denied
message. The API's `AccessGuard` and admin-role checks remain authoritative.

The queue uses the already-implemented shipment admin read endpoints. It has
server-side status pagination, current-page reference search, a compact mobile
layout, and current route revision/detail/event history. It renders only
committed movement evidence and never guesses courier ETA or custodian payment
amounts. A failed request is shown as an error, never silently replaced with
mock values.

The collection action appears **only** when the latest shipment response
contains the `collect` capability and shows all these facts:

- destination is `pickup_point`;
- shipment is `ready_for_pickup`;
- it is physically at its **frozen final pickup node**;
- there is no active transit leg.

All deeper checks are repeated by the server at action time:
authenticated admin, active feature flags, settled order payment,
no pending/approved/in-progress/review/succeeded refund, fulfilment handover,
verified 10-character order code and photo-ID attestation.

## Staff handover interaction

1. Open the latest shipment details, inspect the current route/custody and
   choose **Verify customer collection** (when available).
2. Physically inspect the receiver's photo ID (or an authorised
   representative's photo ID) and enter their name.
3. Ask the receiver for the order's 10-character verification code. It is a
   masked input with browser autocomplete disabled, never saved to local
   storage or exposed in the collection response.
4. Explicitly tick the **physical handover attestation** after inspection.
5. Submit once. Retries with unchanged evidence reuse the same idempotency
   key; changed evidence generates a new key. Server row locks and unique
   receipt constraints prevent a second physical collection.
6. A successful server response displays only receipt ID, order reference,
   and completion time; it immediately clears the code and receiver name.
   Refreshing the queue cannot undo a committed receipt.

The development mock supports a **zero-item, non-authoritative queue** and
deliberately rejects detail and collect calls. It never invents physical
movement or a collection receipt. The UI can only record live collections
through the release-approved backend.

## Customer order detail

When an authenticated customer's order has a real Shipment-based tracking
journey at `ready_for_pickup`, show collection instructions and the
`currentLocationLabel` **only if** already present in the server's
customer-safe projection. Do not expose internal node IDs, contact details,
GPS coordinates, staff identities or customer codes. At `collected`,
display an appropriately terminal confirmation and keep the timeline.

No new customer order fields or API endpoints are required. The existing
trusted PublicOrder/Shipment tracking is the only status authority.

## Release boundary

The page and API can be deployed with both execution flags **off** to
facilitate read-only inspection, but staff cannot complete handover until
the controlled rollout. Before enabling remote pickup, validate real
gateway success, refund/cancellation disputes, pickup-centre staffing
and identity checks, route and fee/slot semantics, mobile and accessibility
acceptance, privacy retention for private receipts, and the rollback runbook.
Never enable this capability merely to make a demo look active.
