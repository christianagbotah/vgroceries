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
