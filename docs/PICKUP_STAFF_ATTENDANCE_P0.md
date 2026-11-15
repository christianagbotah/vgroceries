# Staff-recorded collection exceptions — controlled P0 pilot

This change implements **staff observations** for booked pickup appointments. It does
**not** implement an automatic no-show determination, automatic cancellation,
auto-release of a slot, refund, cash collection or stock movement. These
records do not satisfy the separate verified physical collection authority.

## Staff actions and evidence

At an already-booked, paid parcel recorded as waiting at a real, active and
customer-visible pickup centre, an authorized operator may record either:

- `late_arrival`: only after the booked start time; reason is
  `customer_arrived_after_start`, `centre_delay` or `other`
- `missed_window`: only after the booked end time; reason is
  `customer_not_present`, `customer_unreachable` or `other`

An optional note is limited to 3–350 characters. The actual observation
time is taken from the **server clock**. The immutable record snapshots
the order, pickup centre, original booking timestamp, start/end, category,
reason, observation time, recording actor and request ID. Historical
records survive later rescheduling or collection.

The same booking permits **one observation per category**. Exact
idempotency-key retries replay the same result; changed submissions with
the same key or a duplicate category with a different key fail with 409.
A late arrival after a previously recorded missed window may legitimately
be recorded as another category, but **neither record** closes the parcel.
An explicit, separately authorized handover still requires a valid
verification code, approved identity check and a physical collection receipt.

## API, scope and rollout boundaries

Initial pilot access is **admin only** because a centre-assigned pickup
staff role has **not yet** been defined and verified. Never claim every
employee can record a no-show or read attendance. Routes:

`GET /api/v1/admin/logistics/orders/:orderId/pickup-attendance` — last
50 evidence records (admin only)

`POST /api/v1/admin/logistics/orders/:orderId/pickup-attendance` — admin
only, with required `Idempotency-Key` header and body:
```json
{"kind":"missed_window","reason":"customer_not_present","note":"No customer arrived during the reserved window."}
```

The order ID comes only from the URL; neither a phone, email, user ID nor
customer-provided proof can redirect the authority. Both routes require an
authenticated admin session. Internally, the code takes the **order row lock
first**, then verifies the current booked appointment, centre, prepaid
dispatched status, active waiting-at-centre shipment and no refund conflict.
The database adds strict category/observation-time checks, order/centre/staff
foreign keys, an immutable trigger and unique booking/category index.
A customer-visible order event is **not** created; only a private order
event and staff audit event are recorded.

The separate flag is `PICKUP_ATTENDANCE_ENABLED=false` by default. To
enable future controlled operation, both
`LOGISTICS_SHIPMENT_EXECUTION_ENABLED=true` and
`LOGISTICS_CUSTOMER_PICKUP_ENABLED=true` must already be authorized.
**These flags remain OFF on the Variety Groceries VPS**. Do not activate
solely to demonstrate late/no-show reporting. No SMS/email/WhatsApp,
payment, stock, automatic slot release or customer notification is emitted.

## Verification and remaining scope

- Tests cover too-early no-show, late/missed boundary times, admin-only
  access, invalid category/reason pair, idempotent replay, immutability,
  cancellation and unpaid-order blockers, unchanged stock/payment/receipt.
- Apply the new migration first to a dedicated PostgreSQL test database and
  verify the complete API integration suite in CI. A compilation pass is not
  production authorization.
- A real pickup-centre UAT must verify staff identity/assignment, shift
  handover, arrival dispute resolution, correction/supervisor overrides,
  actual walk-in rescheduling and physical parcel collection independently.
- The customer Coming Soon site and Hubtel payment flags remain unchanged.

Issue #64 remains open until centre-assigned roles, exception resolution,
customer reschedule contact workflow and on-site evidence are accepted.
