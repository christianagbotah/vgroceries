# Pickup attendance — mobile administrator workspace (15 November 2026)

This change connects the **already merged, default-disabled** pickup
attendance API to the authenticated **Shipments & customer collection**
administrator screen, without enabling pickup or payment.

## Staff workflow and mobile UX

1. Admin opens Logistics > Shipments & customer collection, selects a
   recorded shipment whose destination is a pickup centre, then expands
   its shipment detail.
2. A responsive **Appointment attendance** panel displays authoritative
   booking times in **Africa/Accra**, current booked/cancelled/completed
   status, and recent immutable internal attendance observations.
3. Only when the server-side eligibility context authorizes it may an
   administrator select a **late arrival** (after the appointment starts)
   or **missed window** (after its end), choose the reason, and optionally
   write a short factual note (3–350 characters).
4. A separate **Confirm permanent staff evidence** step clarifies
   that a recorded observation is irreversible and is **not** collection,
   order cancellation, refund or stock release.
5. The client sends one persisted idempotency key per unchanged submission.
   Network ambiguity keeps that key for retry; changing form inputs resets it.
   Successful writes update the local audit history and refresh
   authoritative server data; a failed refresh never reverses a committed
   observation or tells operators to repeat a confirmed write.

The screen uses a single-column layout on narrow mobile viewports and
two columns when space allows. Action buttons and selectors have at least
44-pixel touch targets. It is embedded in the shipment-details dialog,
rather than placing forms in a second nested modal.

## API and protection

- GET `/admin/logistics/orders/:orderId/pickup-attendance`:
  existing admin-only historical evidence list.
- GET `/admin/logistics/orders/:orderId/pickup-attendance/context`:
  **new read-only** context with the current server-owned appointment,
  enabled flag, and server-calculated advisory action availability. Only
  authenticated administrators may access it. It does not authorize
  mutation independently or produce a fabricated no-show.
- POST `/admin/logistics/orders/:orderId/pickup-attendance`:
  existing admin-only immutable evidence mutation with required
  Idempotency-Key; the backend revalidates appointment, shipment
  custody, payment, centre and refund conditions under an order lock.

The shared contracts, REST endpoints, client operation registry and mock
router are kept consistent. The mock expressly refuses attendance APIs;
demo users never see invented evidence.

## Safe activation boundary

`PICKUP_ATTENDANCE_ENABLED=false`,
`LOGISTICS_CUSTOMER_PICKUP_ENABLED=false`, and
`LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false` remain the operational
defaults. The new admin interface is **read-only/disabled** in UAT until
approval. No Hubtel SMS, payment, email, shipping, stock, refund, or
customer-facing live launch occurs as a result of this change.

## Verification

- Bun tests for validation rules, operation routes, mobile confirmation
  semantics, and mock isolation.
- PostgreSQL API integration test for admin-only context and
  suppression of actions for unpaid orders.
- Full GitHub frontend/build and API security/integration workflows.
- Isolated UAT build and rollback-protected portal/API deployment;
  keep the public Coming Soon website untouched.

**Remaining issue #64:** implement verified centre-assigned staff roles,
supervisor dispute/correction policies, actual opening/shift operations,
and owner-approved staffed-centre collection UAT before enabling attendance.
**Issue #99:** Prisma model parity for unrelated already-applied POS/support
migrations remains separate and is not resolved by this interface.
