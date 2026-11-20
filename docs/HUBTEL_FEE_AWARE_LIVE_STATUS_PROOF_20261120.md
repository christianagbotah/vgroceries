# Hubtel Online Checkout — Verified ₵1.00 fee-aware status reconciliation
20 November 2026 — Variety Groceries, staging source only

## Owner-merchant observation (real money, read-only retrieval)

An owner-authorized Hubtel hosted checkout from 17 November 2026 was rechecked by the merchant's VPS using an authenticated **GET** to Hubtel Transaction Status. It returned HTTP **200**, response code `0000`, status `Paid`, exact echoed merchant reference and an independently issued transaction ID. Monetary values were:

| Source | ₵ |
|---|---:|
| Original checkout request | 1.00 |
| Transaction Status `amount` | 1.01 |
| Transaction Status `charges` | 0.01 |
| Transaction Status `amountAfterCharges` | 1.00 |

No new checkout was initiated and no money was transferred during this read-only check. Neither merchant credentials nor transaction IDs or callbacks are recorded in this document.

## Incorrect prior behavior

The Hubtel hosted adapter previously mapped the status response `amount` field directly to `PaymentProviderObservation.amountMinor`. An otherwise valid ₵1.00 Paid transaction would therefore be read as ₵1.01 and (correctly for that supplied value) sent to the financial mismatch review queue. It could never be quietly credited without matching the authoritative server-owned order amount.

## Corrected rule

Every status lookup from the three server-owned paths — callback reconciliation, staff/worker reconciliation and uncertain initiation replay — now supplies the **immutable payment attempt amountMinor** to the provider adapter. No amount from callback, browser or URL can select the expected amount.

For a Paid status, the Hubtel provider:
- Accepts the status `amount` (gross) when it exactly matches the stored amount.
- Otherwise, accepts `amountAfterCharges` (net) **only** if the net exactly matches the stored amount, the provider's positive `charges` are given to cent precision, and `gross = net + charges` exactly in integer pesewas.
- Rejects unsupported currencies, missing money, malformed fractional pesewas, inconsistent fee breakdowns and unproven fee-adjusted matches as non-authoritative (`unknown`) — never Paid.
- Leaves a real underpayment as a mismatch so downstream payment settlement cannot mark it Paid.
- Preserves previous behavior for adapters that have no server-owned expected amount, without inventing a match. Merchant checkout mutations always pass a server-owned expected amount.

This rule handles either customer-paid extra fees (₵1.01 gross, ₵1.00 merchant net) or merchant-borne fees (₵1.00 gross, ₵0.99 net) without relaxing order money identity.

Hubtel's official transaction status API documents `amount`, `charges`, `amountAfterCharges` in its example:
https://code.hubtel.com/docs/api/v1/transaction-status/get-transaction-status

## Safety and release

Tests mock the actual status response shape and verify both legitimate fee allocations, underpayment, incorrect fee arithmetic, non-cent fees, missing fee proof and foreign currency. They never charge cards or wallets.

**Not a live checkout activation.** The active staging POS API was safely upgraded to serve `GET /api/v1/checkout/payment-availability` (200 and `electronicAvailable:false`) before this change. Payment flags remain disabled, and the existing POS, stock and SMS runtime is preserved.

The corrected provider logic must pass Node 24, broad PostgreSQL security/integration, genuine callback and refund operational checks before replacing a running provider adapter. Hosted card and wallet refund parity are not established: Hubtel's standard automated refund endpoint is currently documented for eligible full Mobile Money refunds, not every hosted rail. The source code MUST NOT bypass the configured refund-capability gate.

Operator verified statuses and source provenance must be noted before any owner-controlled real-money test on an actual grocery order.
