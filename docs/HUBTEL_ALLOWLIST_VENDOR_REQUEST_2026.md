# Hubtel merchant IP allowlisting — Variety Groceries

**State: vendor action required.** This document is an operator-ready request,
not a proof of provider authorization. **Never attach secret keys or `api.env`.**

## Request to Hubtel Retail Systems Engineer

**Subject:** Variety Groceries — approve server IPv4 for merchant payment-status and eligible refund APIs

Hello Hubtel Retail Systems Team,

We are integrating Hubtel with Variety Groceries, hosted on our server
`vps.lightworldtech.com`.

Please allowlist our static outbound IPv4 **163.245.212.15** for our merchant's
Transaction Status service and (where eligible) Full Mobile Money Refund service:

- `GET https://api-txnstatus.hubtel.com/transactions/{CollectionAccount}/status`
- `POST https://refund-api.hubtel.com/refund/{CollectionAccount}/order/{TransactionId}`

An authenticated **read-only** transaction-status request from this VPS
currently returns **HTTP 403 Forbidden** (observed 14 November 2026).
No charge, refund, payout, or SMS was sent as part of the check.

Please confirm:

1. Whether this IPv4 is allowlisted for **Transaction Status** and
   **Refunds**, and whether the merchant account has the correct API scope.
2. Whether any additional outbound IP / production-network authorization
   needs to be set up for Online Checkout.
3. The available method-specific refund handling for **card, GhQR and wallet**
   payments accepted by Online Checkout. We currently support the documented
   full eligible mobile-money refund workflow only.
4. Any required callback registration, verification method, or test checklist
   before production collections are activated.

Our Collection Account Number and relevant public callback URLs can be
provided in your secure merchant support channel; please let us know the
preferred channel. We will not send API keys or SMS secrets by email.

Kind regards,

Variety Groceries technical team
Lightworld Technologies Ltd.

## Verification and constraints

- Source: https://code.hubtel.com/docs/networking
- Reconciliation: https://code.hubtel.com/docs/guides/reconciliation
- Refunds: https://code.hubtel.com/docs/guides/refunds
- Official November 2026 docs say non-allowlisted status lookups may return
  403/time out. A 403 may also indicate service or channel authorization;
  this request asks Hubtel to verify both.
- **Do not** enable `PAYMENT_PROVIDER_ID`, switch the Coming Soon public
  site, or run an actual customer transaction until authenticated status
  verification works and the full checkout/refund UAT is complete.
- Merchant private credential values are deliberately excluded from this file.
