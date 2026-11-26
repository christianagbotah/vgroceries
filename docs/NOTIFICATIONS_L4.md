# L4 notification authority — customer in-app inbox

This branch adds a durable, customer-owned in-app notification inbox projected from *committed* OutboxEvent rows. It does **not** send email, SMS, WhatsApp or push notifications. It does not mark payments paid, claim a live ETA, or fabricate rider locations.

## Data and access boundaries
- A notification is linked to one source outbox ID, order and authenticated customer ID; the order owner comes **from the database**, never from an event payload or browser input. Database guards enforce that relationship at insertion and keep message snapshots and source receipts immutable.
- Only the account owner can list or mark read. Guest orders have no in-app recipient and are recorded as skipped in NotificationOutboxReceipt, not sent to a guessed phone or email.
- Only explicitly whitelisted transitions generate short, customer-safe copy. Payment, refunds, customer contact details, internal facility IDs, riders, proof, cash collection and remittance are not copied into the inbox.
- Every eligible source outbox ID gets one receipt inside the same transaction as its optional inbox item. A PostgreSQL advisory lock prevents simultaneous projector workers. An incomplete transaction rolls back together.
- Reading an item again is idempotent; only the first read writes an audit event. Mark-all-read changes only the current customer's unread items and audits only an actual change. Normal session CSRF/origin rules apply.

## API
- `GET /api/v1/account/notifications?limit=20&cursor=...` (1–50): customer-authenticated list, account-wide unread count, `hasMore` and nullable `nextCursor`. Omit the cursor for the latest page. Messages sort by source creation time and ID descending; tied timestamps cannot duplicate items between pages. Counts and page rows share a database snapshot.
- `POST /api/v1/account/notifications/:notificationId/read`: customer-authenticated idempotent read, 404 on another customer's or an unknown ID.
- `POST /api/v1/account/notifications/read-all`: idempotent account-wide action returning `updatedCount` and `readAt`.
- Strict shared schemas and the three `account.notifications*` adapter operations serve both REST and the demo transport. Successful reads invalidate the notifications cache family.

## Customer experience

`/account/notifications` is available from the protected account navigation. It shows unread count, dated message snapshots, per-item and mark-all-read controls, refresh, and cursor-based load-more. Each message links to its authenticated account order detail. Loading, empty and retryable error states remain within the account page. Raw outbox payloads, staff notes and arbitrary URLs are never rendered.

## Background projection and deployment

Outbox projection runs separately from requests, startup and migrations: `cd apps/api && npm run notifications:project`. Each invocation processes at most 2,000 eligible committed source events. Receipts make retries safe; the database advisory lock serializes workers. Manual-provider delivery transitions use the same customer-safe message templates.

1. Verify migration lineage and back up the UAT database. Rehearse migrations 021 and 022 against a separate restored schema before the coordinated API/web deployment.
2. Deploy matching verified API and web artifacts. The API includes the projector CLI; the web adds the account inbox.
3. Install `deploy/systemd/varietygroceries-notifications.service` and `.timer` as root-owned units. They reuse the protected API environment and current-release symlink. The service runs as `lightworld` with a read-only filesystem, private temporary directory and a five-minute bound.
4. After migration and API readiness checks pass, run the service once, inspect its result, then enable the timer with `systemctl enable --now varietygroceries-notifications.timer`. It runs one minute after boot and one minute after each completed invocation, without overlapping its own service.
5. Check `systemctl status varietygroceries-notifications.timer` and `journalctl -u varietygroceries-notifications.service`. Successful summaries report projected source events and created inbox messages. A failure is retried on the next timer invocation without a partial receipt.

Rollback stops/disables the notification timer before switching API/web symlinks to the previous matching release. The additive tables and guards can remain; do not delete receipts or rewrite historical migrations. Preserve the existing protected environment files, L2 execution flag and public Coming Soon page.

## Remaining L4 work

- Provider-neutral delivery-attempt ledger, verified adapters, opt-in/preferences/suppression, retries, receipts, channel settings, template management and delivery observability remain subsequent slices. No external provider or WhatsApp integration is connected now.
- No schema changes to orders, stock, shipment, payment or refund authorities.

## Pickup appointment in-app confirmation extension (9 November 2026)

The existing durable, idempotent in-app projector now recognizes
`pickup.appointment_booked` and `pickup.appointment_cancelled`, emitted only
after committed order-owned appointment mutations. It resolves the recipient
from the stored order/customer identity, **not** the event payload, and never
copies the order verification code, receiver name or any financial claim.
The customer can open the existing order detail for date, time and centre;
the inbox does not duplicate private scheduling or generate transport ETA.
Guests without customer accounts are recorded as `no_recipient` (not an invented
account). Replays remain exact-once by source-event receipts.

This slice does **not** send an email, WhatsApp message or SMS, and it is **not**
a scheduled appointment reminder. Time-based reminders, consent, delivery
provider receipts, no-show/late handling and opt-out controls remain tracked
in GitHub issues #64 and #66.


## Order-scoped SMS preference foundation (24 November 2026)

The checkout request optionally carries an explicit boolean smsUpdatesOptIn.
Only true creates an order-specific consent record, bound to the checkout
phone fingerprint and a server-recorded policy version and timestamp.
Creation is atomic with the order. Missing or false preserves the original
checkout replay hash, while changing a committed opt-in conflicts with the
original request. Existing orders are not backfilled.

This foundation is not an enabled delivery service. Customer-facing opt-in,
revocation, consent-aware staging and provider dispatch/receipt handling are
separate acceptance gates. Do not activate transactional messages based only
on a global flag or possession of a phone number. OTP remains independent.

### Order-scoped staging policy

The pure order SMS planning function validates the event/order identity,
recorded policy version, exact recipient fingerprint, event time and current
revocation state. Initial candidates are order-created, fulfilment-confirmed,
packed and cancelled. Financial and courier events remain excluded pending
independent durable outcome checks. No destination or body is returned in
the metadata plan. This policy does not enable the staging job or provider
dispatch. The existing worker remains fail-closed; integration with durable
queue processing, authenticated opt-out and dispatch-time revalidation is
still required.

### Durable order SMS queue preparation

The bounded staging batch function uses a separate durable outbox receipt,
a transaction-scoped advisory lock, order locks, encrypted destinations and
existing delivery uniqueness constraints. Missing consent, invalid
destinations and unsupported event types cannot stage messages. Ineligible
events receive a receipt; events older than 24 hours are expired rather than
queued for stale notifications. The batch has no provider transport and is
not connected to the runtime staging command. Opt-out, dispatch-time
validation, safe provider attempts and delivery evidence remain release gates.

### Hubtel dispatch candidate (not activated)

The single-message dispatch function claims a pending queue item durably
before calling the existing Hubtel SMS adapter. It revalidates the source
event, order consent, matching encrypted recipient, template revision,
verified active customer phone and current fulfilment state. Guest orders
remain excluded until a separate phone ownership proof is available.
Provider acceptance remains `sending / accepted_awaiting_delivery`;
uncertain outcomes remain `sending / provider_outcome_unknown`. Neither
is delivered, and neither is automatically retried. A crashed attempt
remains `sending / attempt_started` for investigation. The worker is not
scheduled or activated. The remaining race between a committed claim and
the outbound request needs a coordinated revocation design, and real
delivery receipts and authorized activation remain prerequisites.

Out-for-delivery copy resolves the current assigned rider profile and work
phone, or the manual delivery partner snapshot and directory contact phone.
Missing contact details are omitted rather than invented. The exact-change
reminder applies only to unpaid cash-on-delivery orders and uses the stored
order total in minor units. Fully paid orders explicitly require no payment
at handover; uncertain payment statuses make neither claim. SMS currency
uses GSM-compatible GHS; tracking remains included. Individual external
courier driver details are not stored by the current manual booking model.


### Integrated order SMS worker candidate

`npm run notifications:order-sms` is a bounded worker, independently gated by `CUSTOMER_ORDER_SMS_STAGING_ENABLED` and `CUSTOMER_ORDER_SMS_DISPATCH_ENABLED`. Both default off; dispatch requires configured encryption and Hubtel transport. Provider acceptance is not handset delivery. Ambiguous attempts are never resent automatically. A separate `CUSTOMER_GUEST_ORDER_SMS_ENABLED` gate allows a guest with previously recorded order-specific consent to verify the exact phone through the existing order OTP endpoints. A matching consumed OTP after consent is required, and an unverified guest's queued messages defer until proof or expiry. Checkout provides an optional verification step and does not block payment. Order creation and verified payment have distinct messages; creation never requests a second charge. No email dispatch, production activation, or delivery receipt handling is claimed here. Before activation, verify migrations, generated client parity, CI, serialized scheduling, revocation controls, bounded cost, monitoring, guest/registered UAT, and delivery receipt reconciliation.
