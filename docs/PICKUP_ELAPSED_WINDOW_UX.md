# Pickup appointment elapsed-window guidance — frontend-only slice

This incremental UI fix handles a booked collection time that has already
ended, without claiming a **no-show**, cancelled order, completed pickup,
stock release, payment failure, delivery completion or automatic refund.

## Behaviour
- Both the authenticated order detail and the verified guest checkout status
  embed the shared `PickupAppointmentManager`, so both display identical
  guidance when the server returns `appointment.status=booked` and the
  local clock is at or past its `endsAt` instant.
- Date/time is formatted in `Africa/Accra`; the elapsed comparison uses
  UTC epoch time, independent of the viewer's device timezone.
- The clock starts only after the client mounts, refreshing once a minute to
  avoid server-render/hydration inconsistencies.
- The customer sees a clear scheduling alert with an invitation to rebook
  using **real currently available slots**. If the booking service is
  disabled, the page tells them to contact the centre instead.
- Cancellation remains a separate **explicit** user action and is confirmed
  through the existing owned API and idempotency key. The UI does not change
  appointment, stock, payment, shipment or order state automatically.
- Do not infer that a late customer was a no-show or that the centre refused
  physical handover; staff attendance evidence is still a separate P0
  workstream.

## Verification
`bun test scripts/pickup-elapsed-window-regressions.test.ts` covers:
- Before/start/during/end exact window boundaries;
- Invalid server times and initial client clock;
- Retention of server `completed` and `cancelled` status;
- Customer text and rebooking action remain authoritative.

## Rollout
This is a storefront/portal-only UI amendment. No new endpoints, database
migrations, payment provider changes, dispatch writes, email or SMS.
Both existing remote pickup feature switches remain **off** pending the
business's centre, staff, status and payment acceptance process.
The public Coming Soon site must not be cut over by this change.

Remaining P0: staff-recorded missed appointments, late arrival evidence,
customer support/rebook and no-show audit trails with server-side authority
and on-site testing (issue #64).
