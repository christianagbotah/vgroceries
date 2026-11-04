# L4 notification authority — phase 1 (in-app inbox only)

This branch adds a durable, customer-owned in-app notification inbox projected from *committed* OutboxEvent rows. It does **not** send email, SMS, WhatsApp or push notifications. It does not mark payments paid, claim a live ETA, or fabricate rider locations.

## Data and access boundaries
- A notification is linked to one source outbox ID, order and authenticated customer ID; the order owner comes **from the database**, never from an event payload or browser input.
- Only the account owner can list or mark read. Guest orders have no in-app recipient and are recorded as skipped in NotificationOutboxReceipt, not sent to a guessed phone or email.
- Only explicitly whitelisted transitions generate short, customer-safe copy. Payment, refunds, customer contact details, internal facility IDs, riders, proof, cash collection and remittance are not copied into the inbox.
- Every eligible source outbox ID gets one receipt inside the same transaction as its optional inbox item. A PostgreSQL advisory lock prevents simultaneous projector workers. An incomplete transaction rolls back together.
- Reading an item again is idempotent; only the first read writes an audit event. Normal session CSRF/origin rules apply.

## API
- `GET /api/v1/account/notifications?limit=20` (1–50): customer-authenticated list + unread count.
- `POST /api/v1/account/notifications/:notificationId/read`: customer-authenticated idempotent read, 404 on another customer's or an unknown ID.
- Outbox projection is *explicit*: `cd apps/api && npm run notifications:project`. It must be scheduled by operations after applying migration 021. Do not run it automatically during web requests, startup or migration. The worker is bounded to 2,000 source events per invocation and may be re-run safely.

## Rollout/remaining work
- Run the migration on a *staging clone*, then API tests, owner/guest security checks and notification regression tests before any live rollout. Never deploy or turn on a worker without coordinated API/database release.
- L4 phase 2: provider-neutral delivery-attempt ledger, verified provider adapters, opt-in/preferences/suppression, retries and receipts; L4 phase 3: frontend inbox, channel settings, templates and delivery observability. No external provider or WhatsApp integration is connected now.
- No schema changes to orders, stock, shipment, payment or refund authorities.
