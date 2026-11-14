# Variety Groceries — Hubtel SMS order updates (draft integration)

**Status:** development branch only, PR #88. **Not deployed to staging or production. No real SMS is authorised or sent.** Public production remains Coming Soon. This implementation supports optional **essential order updates**; it is NOT a Hubtel OTP/password-recovery integration or a marketing broadcast system.

## Implemented on the draft branch

- Separate Hubtel business/personal SMS API credentials, strict HTTPS host allowlist, approved sender ID (up to 11 alphanumeric characters) and Ghana mobile-number normalisation.
- Provider send uses HTTP POST with Basic auth and interprets `status: 0` as **accepted for delivery**, not delivered. `messageId` is retained to query the correct Hubtel account later.
- Provider status lookup distinguishes `Delivered`, `Sent/Pending`, failed/blacklisted and unknown states. Unexpected provider IDs, malformed JSON, unknown statuses and transport errors can never prove delivery.
- Checkout captures **explicit opt-in** in `smsUpdatesOptIn`; absent or false means no SMS. Existing saved orders default to false. The checkbox is hidden until `NEXT_PUBLIC_SMS_UPDATES_AVAILABLE=1` is deliberately set after UAT.
- Transactional dispatch ledger `SmsDispatch` has **one record per source event**, a safe phone/consent lookup from the persisted order (never untrusted event payload), and statuses `suppressed`, `pending`, `in_flight`, `accepted`, `delivered`, `failed`, `rejected`, `unknown`.
- The worker is **not installed as a systemd service, scheduled or started by the web API**. It must have `HUBTEL_SMS_ENABLED=true`, `SMS_DISPATCH_WORKER_ENABLED=true` and an explicit UTC `SMS_DISPATCH_ACTIVATED_AT`. Only committed order events at or after that timestamp qualify; old customer orders are never mass-texted on cutover.
- The sender marks messages `in_flight` before performing HTTP. If the process fails, it stays `in_flight` or `unknown`, **not automatically retried**. Delivery reconciliation checks `accepted` IDs using the provider status API, never sends another message, and marks delivery only if Hubtel reports `Delivered`.

## Safe verification

The draft GitHub Actions job uses PostgreSQL 17, Node 24, Prisma migrations and **fake provider responses**, then checks storefront TypeScript and production bundle compilation with the SMS UI hidden.

There are no real Hubtel calls or phone charges in the CI job. All source changes are in the separate draft PR until operational acceptance. The live stage remains unchanged.

## Required private configuration

Settings must reside only in a protected server environment file, never in GitHub, screenshots or browser environment variables:

- `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`, `HUBTEL_SMS_SENDER_ID`
- Optional `HUBTEL_SMS_BASE_URL`: `https://sms.hubtel.com` for approved business accounts or `https://smsc.hubtel.com` for eligible personal accounts
- Optional `HUBTEL_SMS_TIMEOUT_MS`, default 7000
- `HUBTEL_SMS_ENABLED=false` and `SMS_DISPATCH_WORKER_ENABLED=false` until approved
- `SMS_DISPATCH_ACTIVATED_AT=YYYY-MM-DDTHH:MM:SSZ` when authorising a controlled future cutover
- `NEXT_PUBLIC_SMS_UPDATES_AVAILABLE` must remain unset on the storefront until actual delivery is verified

Manual worker after authorised cutover: `npm --prefix apps/api run worker:sms`. That **can send real SMS** when enabled; do not run with live credentials before an approved UAT. It is intentionally one-shot; no automated schedule has been authorised.

## Remaining mandatory launch gates (NOT yet complete)

1. Approve business SMS credentials and sender ID, verify exactly which account host and quotas apply, and confirm balance.
2. Implement an accessible **stop/opt-out and suppression** path after checkout (including phone ownership/identity where relevant), plus consent preferences and a retention policy for phone/message data.
3. Run controlled send to an authorised test Ghana handset; check actual delivery via Hubtel lookup and mobile inbox.
4. Test insufficient credit, blacklisted recipient, 429, ambiguous provider timeout, message content, network outage, crash in `in_flight`, duplicate jobs and cancellation handling.
5. Set up an authorised worker scheduler, monitoring/alerts, bounded retries **only after provider confirmation** and a manual investigation workflow for `unknown` messages.
6. Perform a staging DB backup and migration rehearsal, rerun complete checkout/inventory/payment/POS regression suites, check mobile/browser accessibility, and sign off release with the business.
7. Hubtel OTP for phone verification/password resets, promotional marketing consent and other payment integrations remain separate workstreams.

**Operational rule:** An SMS accepted by Hubtel must never appear as delivered in the UI until there is provider delivery evidence. SMS may not be used as proof of payment, goods handover or refund completion.

Current references: https://code.hubtel.com/docs/guides/sms and https://code.hubtel.com/docs/guides/sms-delivery.
