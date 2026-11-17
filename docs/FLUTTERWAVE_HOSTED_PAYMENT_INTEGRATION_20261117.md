# Variety Groceries — Cash/Electronic payment model (17 November 2026)

## User-approved customer-facing choices

- POS at the shop: **Cash** or **Electronic**.
- Online delivery: **Cash on Delivery** where the delivery zone permits COD,
  or **Electronic**. No COD at a collection point.
- Online collection: **Electronic**, or **Cash at Collection** where enabled.
- MoMo networks (MTN, Telecel, AirtelTigo), Visa/MasterCard or a supported bank
  transfer are **not** separate top-level payment options. The secure provider
  checkout presents the available methods after selecting Electronic.
- Provider intent: Flutterwave preferred; Paystack as an alternate and the
  previously documented Hubtel integration retained. One provider is
  configured per attempt, never retry an uncertain payment with another
  gateway without confirmed settlement and explicit resolution.

## Source implementation

The existing API has provider adapter contracts, idempotent payment attempt
creation, webhook intake, and independent provider transaction verification.
This branch adds a Flutterwave v3 hosted-checkout adapter:
- Backend initiation POST /v3/payments and HTTPS redirect to an approved
  checkout.flutterwave.com link. Money is converted from pesewas to cedis.
- No direct card entry, CVV, PIN, OTP, wallet secret, or payment network
  selector is created in Variety Groceries UI.
- Flutterwave webhook verif-hash or authenticated HMAC header can trigger
  a fresh, server-side lookup by the immutable original tx_ref.
- The lookup validates status, exact transaction reference, currency GHS,
  parses amount back into pesewas, and stores only the actual payment_type
  or verified card brand. Network is not guessed if Flutterwave does not
  supply a verified network identifier.
- Provider API secret and webhook secret remain server-only. Hosted payment
  activation is off until a complete, approved configuration is provided.
- The POS demo now shows Cash and Electronic only, and blocks electronic
  completion because its simulated checkout has no provider-backed counter
  order intent. **Do not issue a paid POS receipt from a mere selection**.
- Online status polling remains active for an unpaid Electronic order so a
  later independently verified provider result can update the screen.

## Server config checklist (no credentials committed)

PAYMENT_PROVIDER_ID=flutterwave
PAYMENT_ENABLED_METHODS=hosted_checkout
PAYMENT_HOSTED_DOMAINS=checkout.flutterwave.com
PAYMENT_CONFIRMED_HOLD_MINUTES / PAYMENT_PROVIDER_TIMEOUT_MS /
PAYMENT_RECONCILE_AFTER_SECONDS remain mandatory and merchant-approved.
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_WEBHOOK_SECRET
FLUTTERWAVE_RETURN_URL=https://portal.varietygroceries.com/checkout/payment-return
FLUTTERWAVE_TECHNICAL_EMAIL_DOMAIN=payments.varietygroceries.com
FLUTTERWAVE_IDENTITY_HMAC_KEY (32-byte hexadecimal secret)

Only enable provider methods supported for this Ghanaian merchant. Flutterwave
Ghana hosted checkout documentation lists card and mobile money as common
methods; direct GHS bank-transfer support is a distinct option and must be
verified with the merchant rather than assumed to appear in hosted checkout.

## Before any live activation

Obtain merchant-account/API approval, live provider URLs and webhook secret,
sandbox checks for an MTN/Telecel/AirtelTigo prompt and card approval, signed
and replay-safe webhook delivery, server-side status lookup, correct amounts
and reference matching, late payments, duplicate callbacks, missing responses,
refund service and payout reconciliation, and an approved counter-sale
backend flow. No production payment provider switch, sample charge,
stock write, payment callback simulation, or provider credential change
is authorized by this source work.

Other providers remain available via their existing adapters. Existing
Hubtel status/authorization limitations must be resolved independently.
