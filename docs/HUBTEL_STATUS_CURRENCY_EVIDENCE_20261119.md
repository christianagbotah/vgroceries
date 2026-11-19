# Hubtel Direct status currency must be independently supported
19 November 2026 — source-only, no live financial operations.

## Security invariant
The production `HubtelPaymentProvider.lookup` already requires the independently echoed exact merchant reference (PR #155) and any existing provider ID (PR #156). Its status normalization nevertheless used to assign `currency:"GHS"` to any parseable provider amount, without examining explicit currency evidence. A foreign-currency `Paid` response with the same numeric amount could therefore be presented as a cedi payment observation.

This change checks every recognized explicit currency field (`currencyCode`, `CurrencyCode`, `currency`, `Currency`). If any present field is non-string, empty, not GHS (case-insensitive) or contradicts another field, it fails closed with a provider lookup error. A missing field or documented `currencyCode:null` is accepted for this Ghana-only configured collection account; the merchant reference, provider reference and server-owned amount checks are still independently mandatory. An HTTP 403 remains an authorization failure and cannot be interpreted as a payment result.

## Verification
- Standalone Bun mock-only suite: 7 tests, 35 assertions, all pass. Covers missing/rejected merchant identities, provider reference matching, HTTP 403, Paid with USD/EUR/GBP or contradictory currencies, valid GHS and null currencyCode.
- Actual API Node 24 provider suite now contains 2 additional tests against fake HTTP responses (8 rejection cases, 4 accepted GHS cases).
- Full fresh PostgreSQL API integration/security and frontend CI still required for merge.
- No new provider or bank API route, schema migration, keys, real network request, payment initiation, refund, callback delivery, payment-status change, go-live flag or deployment.

## Blocker
Hubtel Transaction Status API still returned authenticated **HTTP 403** from the VPS on 19 Nov 2026 at 09:35:19 UTC; see GitHub issue #90. This source validation does not solve allowlisting, merchant permissions or support for real-money reconciliation. Hosted Online Checkout draft stack #140/#141/#143 needs to preserve these currency/reference rules when safely reconciled with mainline.
