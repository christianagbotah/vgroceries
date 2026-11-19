# Hubtel Direct status: independently echoed reference requirement
19 November 2026 — **source-only guard; not deployed or enabled**

## Security correction
The pre-existing `HubtelPaymentProvider.lookup` used the caller's **requested** `merchantReference` as a fallback when the provider's status JSON omitted its own reference. A forged or wrong-customer HTTP 200 body claiming `Paid` and an amount could therefore appear to match the original payment request without independent provider correlation.

The Direct Request Money status adapter now **rejects any missing, blank or nonmatching independently echoed merchant reference**, before returning a normalizable payment observation to the authoritative payment-reconciliation service. It does not rewrite the request, trust an unverified callback, mark a payment paid, or infer settlement from an HTTP success status. An HTTP 403 still throws a provider lookup error, not a payment failure or success. The exact provider reference and amount checks that already exist downstream remain in effect.

This is a narrow independent backport of the same logic discussed in the stacked **draft PR #143**. Keeping the mainline correction isolated avoids merging the unrelated, still-draft Hosted Online Checkout stack. Do not merge draft PR #143 without reconciling this duplication.

## Offline tests
- Fake HTTP 200 Paid/amount with absent/empty/whitespace/other-client reference: all must throw without an observation.
- Fake HTTP 403 with Paid body: throws, not authoritative.
- Fake HTTP 200 with genuinely echoed exact clientReference: normalized amount/state preserved.
- Standalone mock Bun test is `scripts/hubtel-direct-echo-guard.test.js`; the JavaScript extension keeps this adapter-only test outside the frontend's explicit `**/*.ts` source list while Bun runs the real backend adapter. It performs no provider I/O.
- Real NestJS API test runner has additional corresponding tests; full fresh PostgreSQL and CI checks remain required.

## Live boundary
No provider requests, charge, payment status updates, DB changes, credentials or UAT deployment in this change. Hubtel's real Transaction Status endpoint previously returned **HTTP 403** from the VPS. Reference validation cannot bypass merchant service access or IP allowlisting. Do not enable live Hubtel payment features until independent reconciliation works, callbacks and refunds are verified, and owner/finance launch gates are satisfied.
