# Remote pickup centre closure dates

A closure is a **one-off Ghana-local calendar date** on which customers cannot
book a collection appointment. It is not a delivery transport-slot cancellation,
an order cancellation, a refund, or proof that the centre is physically closed
to incoming shipments.

## Rules

- Only an authenticated administrator can list, close or reopen a pickup
  centre's calendar. The node must exist with kind `pickup_point`.
- Date is `YYYY-MM-DD` in Africa/Accra, from today through 365 days ahead.
  Closing requires a meaningful reason, 3–160 characters; reopening requires
  `reason: null`. History is retained via an audited inactive row.
- A requested closure **conflicts with any existing booked appointment on that
  date**. Administrators must contact customers and resolve or cancel the
  affected appointment explicitly before closing; the system must never
  silently reschedule, cancel, refund or displace a paying customer.
- The closure writer serializes with booking on the centre policy lock;
  booking rejects closed dates, including a direct SQL attempt to bypass the
  API. A closure trigger refuses to close a date with booked customers.
- No money, physical stock, customer shipment status or transport window is
  changed by a closure. A closure does not alter the existing centre weekly
  hours for other dates.
- Existing release switches `LOGISTICS_SHIPMENT_EXECUTION_ENABLED` and
  `LOGISTICS_CUSTOMER_PICKUP_ENABLED` remain OFF in UAT unless separately
  activated after route, staffing and payment acceptance.
- Development mock returns an empty closure calendar and refuses writes.

## User experience

At **Logistics → Locations → pickup point → Appointment hours**, the
administrator can select a closure date, enter a reason, save, and reopen an
existing closed date. A conflict is actionable: arrange affected customers'
booking changes before retrying. The centre's historical closure state
remains visible to administrators. Customer appointment options hide any
actively closed date; they do not expose private closure reasons.

## Verification

The release must pass real PostgreSQL tests for date bounds, node and role
checks, strict replay, closure/opening, active booking conflict, direct SQL
forgery, simultaneous booking versus closing, unaltered stock/payment,
and a clean regenerated OpenAPI. Run a restored-UAT migration rehearsal
before any live schema change; launch remains behind current feature flags.

The calendar does not automatically mark no-shows or notify customers.
Those remain separate, reviewed workstreams in
`docs/RELEASE_COMPLETION_ROADMAP.md`.
