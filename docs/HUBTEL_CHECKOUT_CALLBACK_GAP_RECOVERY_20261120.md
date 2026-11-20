# Hubtel Online Checkout — callback-gap reconciliation recovery (20 November 2026)

## What is already in the application

GitHub `main` has a server-owned hosted checkout adapter and the customer Electronic payment option. Hubtel creates a checkout URL, the customer selects a payment option on Hubtel, and Variety waits for independently verified provider status before marking an order paid. The payment redirect/return URL does not confirm settlement.

This change adds a missing **bounded, opt-in, provider-status recovery runner** for hosted attempts that remain unresolved after a callback is missing or delayed. It does **not** initiate a second checkout, issue a refund, reactivate an expired hold, or enable any production money feature.

## Safe default and exact effect

`npm run payments:hubtel:reconcile` in `apps/api` requires an existing compiled API and the usual private server environment. With no arguments it **previews** up to 10 eligible attempts and does not call Hubtel or change payment data.

Eligibility is deliberately narrow: method **hosted_checkout**, provider **hubtel**, payment attempt `initiated` or `pending`, linked order `paymentStatus=pending/unpaid`, and created at least **5 minutes** ago (or later when `PAYMENT_RECONCILE_AFTER_SECONDS` is longer). Include unsettled attempts and earlier erroneously tagged `reconciled` pending attempts; exclude final/exception states. A recent reconciliation within the same minimum interval causes a backoff before the next sweep. The oldest 10 are scanned first. An independently verified provider **Unpaid/Pending** lookup is evidence of an unresolved attempt, *not* final settlement: it leaves or restores `settlementState=unsettled` so later verified `Paid` evidence may still be applied. Repeated checks do not initiate new payment requests.

An operator-reviewed one-shot execution is:

```bash
# From apps/api, after compiling the exact, approved source:
npm run payments:hubtel:reconcile
# ONLY after UAT, provider authorization, protected environment and operator approval:
HUBTEL_RECOVERY_EXECUTION_ENABLED=true npm run payments:hubtel:reconcile -- --execute
```

For protected deployments where settings are outside the application, invoke Node using `--env-file=/absolute/path/to/private/api.env`. Do **not** copy that file into a Git repository.

`--execute` without the server-only environment opt-in fails before opening the database. Execution requires a configured Hubtel hosted provider. A dedicated PostgreSQL **session advisory lock** prevents two overlapping workers from running across hosts. The worker makes no new payment-initiation requests; for each eligible attempt it calls the existing server-side `PaymentReconciliationService.reconcile(..., "worker", ...)`, which verifies the independently reported merchant reference, provider transaction identity, exact amount and currency, and applies idempotent financial outcomes. Unknown or contradictory outcomes remain unresolved/reviewable rather than paid. Per-run output contains **counts only**, not references, personal data, credentials, or raw provider payloads.

## Important launch gates

- **Not automatically scheduled or activated.** This change is a source-only recovery capability, not an instruction to enable it in production.
- The public staging portal at `https://portal.varietygroceries.com/api/v1/checkout/payment-availability` returned HTTP 404 on 20 Nov 2026; the latest source exists but is not in the deployed canonical **3052/3049** pair. Do not replace with the older **3037/3027** pair.
- Hubtel Online Checkout hosts MoMo, card and Hubtel wallet. The published standard refund API supports **only a full eligible Mobile Money transaction within 45 days**, not verified parity for card/wallet. Do not bypass the existing `PaymentPolicyService` refund-capability gate merely to turn on checkout.
- Confirm merchant allowlisting and read-only status API authorization; confirm protected HTTPS webhook ingress, status responses, callbacks, duplicates, late payments, refunds, order/stock/POS parity, backups, rollback and controlled finance UAT.
- For live scheduling, decide cadence only after callback UAT and finance approval. The current application **does not install a cron or systemd timer**.

## Verification

```bash
cd apps/api
npm run build
node --test dist/test/hubtel-checkout-recovery.spec.js
```

The unit tests confirm the five-minute minimum, bounded and sorted selection, dry-run no-provider behavior, strict hosted-only filtering, safe exception accounting, and worker-only reconciliation. In isolated database integration tests, separately confirm that a replayed callback and a worker lookup never create two `payment.succeeded` events.

External references (Hubtel, reviewed 20 November 2026):
- https://code.hubtel.com/docs/guides/online-checkout
- https://code.hubtel.com/docs/guides/reconciliation
- https://code.hubtel.com/docs/guides/refunds
