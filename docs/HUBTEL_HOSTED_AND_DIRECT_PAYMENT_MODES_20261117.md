# Variety Groceries — Hubtel Online Checkout and Direct MoMo modes
Date: 17 November 2026 · Source-only development branch.

## Business decision

At the storefront checkout, shoppers choose **Cash on Delivery** when permitted,
or **Electronic**. The default Hubtel electronic mode is **Online Checkout**:
Hubtel displays the hosted selection between supported MoMo, card and Hubtel
wallet options. Variety Groceries does **not** ask for or store card information,
wallet PINs or OTPs.

The optional **Direct Request Money** mode lets an authenticated cashier
initiate a MoMo approval prompt for a *verified/consenting phone number*. It
requires the customer's number and network and separate authorization/anti-
abuse and IP allowlisting. No cashier electronic-sale API or live Prompt
activation is included in this change.

## Implementation

- Extend the existing `HubtelPaymentProvider` (provider ID remains `hubtel`)
  with a `hosted_checkout` initiation mode and retain existing `mobile_money`.
- The hosted mode sends a single **server-side** POST to the official
  `https://payproxyapi.hubtel.com/items/initiate` with credentials in
  HTTP Basic Authentication and totalAmount, description, merchantAccountNumber,
  clientReference, callbackUrl, returnUrl, cancellationUrl.
- Only a validated `https://pay.hubtel.com/...` link is returned to the
  browser (sandbox links may use the Hubtel sandbox host, never production).
  A successful checkout creation does **not** mark any order paid.
- Lookup follows the Hubtel **collection transaction status** endpoint:
  `https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}`.
  This is the same authoritative reconciliation API for hosted and direct
  payments. It checks the exact original merchant reference and parses amount
  into pesewas. The provider sometimes returns `currencyCode: null` for a
  Ghanaian collection, so the merchant account is explicitly treated as
  GHS-only; non-GHS responses cannot be marked paid.
- Persist the *actual* `paymentMethod` supplied by Hubtel as
  `settledChannel`, without guessing an MoMo network/card type.
- The checkout ID is **not** substituted for the transaction ID. Once a
  payment settles, provider status may return a distinct `transactionId`;
  the durable merchant reference is used to correlate the payment.
- Existing PaymentOutcomeService checks original reference, amount, currency,
  idempotency, stock holds and exception handling before marking an order paid.
  Callbacks are lookup-required evidence, not trusted settlement instructions.
- Generated payment references are shortened from 39 characters to 31
  characters (96 random bits), within Hubtel's documented **32-character**
  Online Checkout limit and the **36-character** Direct Receive Money limit.
- Both Hubtel modes can be configured, but the order of
  `PAYMENT_ENABLED_METHODS` must put `hosted_checkout` **first** so generic
  customer-facing Electronic defaults to Hubtel-hosted checkout.
- Hosted-only configuration does not need Direct Request Money URLs.

## Server-only configuration

Required generic payment settings:
`PAYMENT_PROVIDER_ID=hubtel`,
`PAYMENT_ENABLED_METHODS=hosted_checkout` (or
`hosted_checkout,mobile_money` if direct collection is **also** approved),
`PAYMENT_HOSTED_DOMAINS=pay.hubtel.com`, and the existing timeout,
hold-minute and reconciliation settings.

Hubtel shared secrets/URLs:
`HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`,
`HUBTEL_CALLBACK_URL`, `HUBTEL_RETURN_URL`,
`HUBTEL_CANCELLATION_URL`.

Hubtel hosted-only:
`HUBTEL_COLLECTION_ACCOUNT_NUMBER` (numeric collection account),
`HUBTEL_ONLINE_CHECKOUT_URL=https://payproxyapi.hubtel.com/items/initiate`,
`HUBTEL_COLLECTION_STATUS_URL=https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}`.

Hubtel optional direct-only fields:
`HUBTEL_REQUEST_MONEY_URL` and `HUBTEL_STATUS_URL`; both are mandatory
only when `mobile_money` is enabled. Separate rollout gate for direct
phone prompts and IP allowlisting.

The sandbox, not live merchant production, may use:
`https://code.hubtel.com/sandbox/v1/payproxyapi/items/initiate` and
`https://code.hubtel.com/sandbox/v1/api-txnstatus/transactions/{merchantAccountNumber}/status?clientReference={reference}`.

**No provider keys or merchant account numbers have been entered or changed
on the live VPS as part of this branch.** Only staff with appropriate
authorization should add secrets. Do not expose masked Base64 Basic Auth
values to the browser or put API keys in browser-accessible settings.

## Tests and deployment boundaries

Added `apps/api/test/hubtel-online-checkout.spec.ts` using mocked
provider responses: complete/partial config, hosted request payload,
Basic Auth, redirection host validation, reference length guard, callback
lookup-required behavior, authoritative transaction reconciliation,
currency/amount mismatch and direct-mode isolation. Existing direct
provider tests remain unchanged.

**Pending**: runner compilation, mocked test execution, sandbox API test
credentials, provider account verification, callback delivery/duplicate/late
events, paid/unpaid/refunded reconciliation, merchant-account-specific MoMo
and card acceptance, IP-allowlisting, and refund/settlement sign-off.

No live payments, simulated order updates, product stock adjustments,
payment-service activation, database migrations or production deployments
are authorized by this source change. The current live storefront remains
on its previously verified release.

Official Hubtel documentation (updated Nov 2, 2026):
- https://code.hubtel.com/docs/guides/online-checkout
- https://code.hubtel.com/docs/guides/receive-money
- https://code.hubtel.com/docs/guides/reconciliation
- https://code.hubtel.com/docs/testing
