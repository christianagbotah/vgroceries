# Variety Groceries — repeatable web launch safety preflight

This preflight assesses the canonical staging portal, public production boundary and the availability of external-provider credentials **without initiating a payment, sending an SMS/email or writing to the database**. It is designed for the controlled launch target of **20–21 November 2026**, not an automatic authority to go live.

## Run on the approved Variety VPS

From the repository directory:

```bash
npm run test:launch-preflight
node --env-file=/home/lightworld/config/varietygroceries/consolidated-staging-api.env scripts/web-launch-preflight.cjs
```

The preflight intentionally exits with code **2** for NO_GO; this is a *correct* safety result while payment, SMS or release acceptance remains unverified. Exit 1 indicates a script failure. The checker prints a Markdown status table, with statuses PASS / BLOCKER / PENDING UAT / DEFERRED, without displaying provider secrets or customer data. It only makes unauthenticated GET requests to the two public Variety domains and reads backup metadata; it makes **no calls** to actual provider APIs and creates no orders.

The following checks are automated:
- API health and public anonymous catalogue access.
- Real customer lookup and private inventory both reject anonymous requests.
- Production storefront still returns **Coming Soon**.
- Hubtel merchant and refund *configuration bundle presence* in the **effective** staging environment.
- Backup recency in the private staging backup directory.

Other gates cannot be automatically attested: real-money payment initiation, callbacks and reconciliation, actual refund settlement, SMS delivery, account recovery email inbox receipt and SPF/DKIM, full operational fulfilment, production restore/rollback rehearsal, cashier and inventory sign-off and explicit business approval. **These remain pending even if a credential bundle is configured.**

### Verified on 14 November 2026

- Live staging preflight result: **NO_GO**: 6 PASS, 3 BLOCKER, 5 PENDING UAT, 1 DEFERRED (native apps).
- Blocking gaps: Hubtel collection and refund configuration missing on staging, and no verified external SMS/OTP dispatch transport. No live payment was attempted.
- Hubtel adapter-focused tests against stubbed provider responses: **13 PASS / 0 FAIL** for collection and refund provider modules. Those tests confirm code behavior for the documented mock responses; they do **not** establish a merchant account, provider delivery or production settlement.
- Launch preflight regression tests: **7 PASS / 0 FAIL**. Includes missing/partial config, security leaks, stale backup, non-disclosure of secret values and avoiding automatic approval even with complete-looking credentials.
- Verified still: stage API and storefront pass, private inventory/customer directory reject anonymous sessions, production Coming Soon.
- Native apps are **not a blocker for a web-first launch**, but no APK, TestFlight, or iOS build is available.

### Required merchant handoff

Business should provide Hubtel credentials, merchant account/reference and documented callback/return URLs **privately to the deployment environment**. Never paste secrets into GitHub issues, pull requests, screenshots, ChatGPT conversations or client-side environment variables. Engineering must confirm allowed payment methods and whether the approved merchant supports full/partial refunds and safe status lookup before enabling those methods. For SMS, supply provider authorization, approved sender identity, templates and a controlled recipient for delivery tests through an appropriately protected channel.

All critical findings must be corrected, actual end-to-end provider and operational evidence collected, and release rollback/owner approval documented before switching the public site. This preflight is only one component of that sign-off.
