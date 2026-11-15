# P0 pickup collection reminders — gated in-app worker

Status: **code review / test branch only; inactive**. This implements the
in-app reminder portion of issue #64 without turning on customer pickup,
email, SMS, WhatsApp or automated outbound delivery.

## Eligibility and exact-once rules

A manually invoked backend worker selects appointments that begin **in more
than zero and at most 90 minutes**. It stages one outbox event for each
specific booking version. An immutable, deterministic event ID is derived
from order ID, centre ID, scheduled start and original booking timestamp.
Re-running the worker or concurrent invocation cannot duplicate that event.

Before staging, the worker locks the Order row, then rechecks the committed
appointment, registered active customer, succeeded payment, no refund
conflict, dispatched fulfilment, frozen pickup centre and physical shipment
status `ready_for_pickup` at that exact centre. It never accepts recipient
IDs, status, amounts or times supplied by an SMS request or caller.

When the normal in-app notification projector consumes the staged event, it
**rechecks the current booking and authoritative order** under the same
order lock. Cancellation, a changed start time, newly completed collection,
refund conflict or other ineligible state suppresses the reminder and
records a no-recipient projection receipt. Stale reminders cannot become
new inbox messages merely because an event was already staged.

Only a real customer account can receive an inbox reminder. Guest orders
without an authenticated customer account do not receive a fabricated
notification. The content tells customers to open the order for the
current centre and time, and explicitly avoids implying physical handover
or an externally delivered SMS.

## Activation controls

```dotenv
LOGISTICS_SHIPMENT_EXECUTION_ENABLED=false
LOGISTICS_CUSTOMER_PICKUP_ENABLED=false
PICKUP_INAPP_REMINDERS_ENABLED=false
```

All three must be `true` for staging or projection; invalid values and
partially enabled combinations fail config validation. **Do not enable**
these gates just to demonstrate reminders: physical pickup still needs
real centre staffing, payment verification, stock reconciliation, hours,
late-arrival policy and owner-authorized UAT.

After a reviewed, isolated release with the legitimate flags approved,
an operator may manually run the compiled CLI:

```bash
node --env-file=/path/to/protected/api.env dist/scripts/project-pickup-reminders.js
```

The command logs counts only, has no timer, no new HTTP route and uses the
existing in-app notification ledger. It does **not** send SMS or emails and
does not create a refund, payment, order status, appointment or stock change.

## Verification and remaining scope

Run the API integration suite against **a dedicated test PostgreSQL DB**,
never the production database. Tests cover stage-once behaviour,
rescheduling and cancellation before projection, completed pickup,
unpaid orders, inactive customers and zero provider side effects.

This does **not** implement staff-attested late arrival or a no-show
decision, attendance evidence, automatic cancellation, booked-slot release,
customer reschedule approval, or outbound communication tariffs/consent.
Those remain separate issue #64 work. The public Coming Soon site stays
unchanged and no VPS deployment is authorized by this document alone.
