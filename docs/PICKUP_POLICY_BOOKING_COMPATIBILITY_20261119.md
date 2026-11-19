# Pickup centre operating-policy edits must preserve booked appointments
19 November 2026 — source-only guard, not deployed. Existing closure calendar, appointment booking, staff late/missed-window evidence, and notifications are already implemented; older roadmap checklist entries were stale.

## Defect
The administrator pickup appointment policy endpoint accepted changes to service weekdays, opening/closing times, slot duration or capacity without checking already-booked future customer appointments. This could show a previously confirmed visit as booked while making its underlying window unavailable or over-capacity.

## Correction
- In the existing **administrator-only, idempotent** `savePolicy` transaction, lock the centre's policy row **FOR UPDATE** before selecting existing future or still in-progress bookings and editing the schedule.
- The customer booking/rescheduling transaction already locks the same policy row **FOR SHARE**. PostgreSQL serializes a booking and policy update; whichever commits first is seen by the other. No silent conflict and no new confirmation text or payments.
- Validate that each future booked window still belongs to an allowed weekday, remains within opening hours, begins on the new slot grid and retains the expected slot duration. Aggregate per-slot reserved counts and disallow lowering capacity below booked count. If any conflict exists, reject with **HTTP 409 / PICKUP_POLICY_CONFLICTS_WITH_BOOKINGS** and advise staff to arrange customer-approved rescheduling before editing.
- A temporary policy `active:false` with otherwise unchanged hours is still permitted and keeps existing appointments intact. New booking is already blocked while policy disabled; customer cancellation remains allowed. Booking horizon/lead-time affect new availability, not previously booked visits.
- Rejecting a change creates no new audit/outbox/idempotency rows and does not change order payment, stock, shipping or appointment state.
- No new schema migration, feature flag, provider integration, external SMS, charge or refund.

## Verification
- Pure unit tests: weekday, opening/closing limits, slot alignment/duration, capacity reductions, operator shutdown, booking-horizon semantics, SQL row-lock boundary.
- PostgreSQL integration tests: refuse incompatible weekday edit, preserve audit/stock/payment and original booking; allow temporary shutdown and later customer cancellation; reject capacity shrink with two booked orders; allow shrinking only after voluntary cancellation; concurrent policy edit vs booking cannot both produce a conflicting state.
- Full GitHub frontend CI and API isolated PostgreSQL integration/security suite required before merge. Production pickup remains default OFF until real-centre staffing and customer acceptance are demonstrated. Protected live portal is not touched.
