# Customer collection appointments — gated L2 extension

This increment adds customer pickup-centre opening hours and **collection appointments**.
It does **not** schedule shipment transport, change payment, deduct stock,
activate logistics, or represent a visit as physical proof of delivery.

## Operational model

An owner administrator can configure one policy per `pickup_point` logistics
node, through **Logistics → Locations → Appointment hours**:

- Active is **false** by default.
- Day-of-week uses ISO weekdays (Monday 1 through Sunday 7).
- Centre hours are in **Africa/Accra**, GMT / UTC, in 30-minute increments.
  A centre must be open for 30 minutes to 12 hours in a single day;
  overnight shifts are not supported in this release.
- Appointments are 30 or 60 minutes with per-slot capacity 1–50 people.
- Minimum advance notice is 30 minutes to 24 hours, with a booking
  horizon of 1–14 days.
- Changing a policy **does not cancel existing bookings**. Disable the
  policy to stop new bookings; customer cancellations remain possible while
  the global service is enabled.

The configuration is auditable, validated server-side and at the database
boundary. It does **not** activate remote pickup: the independent
`LOGISTICS_SHIPMENT_EXECUTION_ENABLED` and
`LOGISTICS_CUSTOMER_PICKUP_ENABLED` flags remain required and **off in UAT**.

## Customer booking authority

The customer sees **Collection appointment** on an owned remote-pickup order,
separate from the earlier *transport window*. Appointment availability is
exposed only when both global flags are enabled, the configured centre is
active/customer-visible, the policy is active, the order is paid and not in
a refund conflict, the order is not cancelled, and the actual Shipment has
reached status `ready_for_pickup` with its **current node equal to the frozen
final pickup centre**, with no transit leg or completion.

An authenticated customer or valid guest session can read slots only on
an order that belongs to that exact account/session. Other customers must
receive an indistinguishable not-found response. No anonymous enumeration
or public destination appointments are permitted.

The server derives time slots from policy, using UTC/GMT to avoid confusing
the delivery transport window with a collection promise. Availability is
limited by existing committed `booked` reservations. A transaction
locks the order and the centre policy and serializes reservations for each
centre+time through an advisory lock. A second concurrent customer cannot
reserve the last available space. A customer may book, reschedule, cancel,
and book again. Idempotency keys are actor-scoped; identical replays
return the prior result, different request contents conflict.

Customer booking/cancellation writes an order event, audit and outbox
record, but **does not** change the order payment status, delivery fee,
inventory reservation, transport slot, or courier state. Physical staff
handover remains authoritative: when staff verifies the order code and ID
and records `customer_collected`, a booked appointment automatically becomes
`completed` in the same transaction. A collection without a prior booking
is not barred by the appointment scheduler.

A centre shutdown can stop new bookings without deleting prior history.
Already-booked customers can cancel their appointment even when the
centre's appointment policy has been disabled; refund and physical
collection remain separate workflows. SQL guards prevent fabricated
completed appointments, wrong-node reservations and off-hours bookings.

## Customer and admin URLs

- Admin: `/admin/logistics` → Locations → selected pickup point →
  Appointment hours (admin role required, audited save)
- Customer: `/account/orders/:orderId` → Your selected pickup centre →
  Collection appointment (only records returned by the authenticated API)
- API: `GET /api/v1/orders/:orderId/pickup-appointments`;
  `POST /api/v1/orders/:orderId/pickup-appointments`;
  `POST /api/v1/orders/:orderId/pickup-appointments/cancel`;
  `GET/POST /api/v1/admin/logistics/nodes/:nodeId/pickup-appointment-policy`

Transport slots remain delivery operations; the appointment window is not an
ETA or a guaranteed delivery date. Customer identity proof, refunds, cash
handling and staff collection authority are unchanged.

## Verification and rollout gates

Before rollout, test that: a paid shipment can be moved to ready; the
customer can make an appointment; a second user cannot oversell the final
slot; a disabled policy cannot produce new reservations; customer ownership
is enforced; a customer can cancel; the verified staff collection completes
the booking and receipt exactly once; refund/payment disputes block new
bookings; and unavailable routes or inactive centres do not advertise slots.

The operator must also validate **actual operating hours**, staffing,
capacity, holidays, late arrivals, missed appointments, mobile layout,
assistance for customers without web access, payment provider evidence,
and the privacy and retention policy for receipts. There is no automatic
expiry, no-show cancellation, rescheduling reminders, holiday calendar,
calendar invitations or SMS/WhatsApp promise in this slice.

Deploy the additive schema only after protected UAT backup and migration
rehearsal. Both feature flags stay off until a separate activation approval.
Application deployments must not silently flip them. Disabled appointments
must continue to show earlier stored history without generating fake slots.
