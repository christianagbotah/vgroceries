# Paystack hosted checkout design and implementation plan

## Goal
Add Paystack as a second production payment/refund adapter behind Variety Groceries' server-owned `electronic` checkout intent. Shoppers never choose Paystack or a rail in Variety UI; Paystack hosted checkout exposes the merchant-enabled channels.

## Financial truth model
- Add concrete provider-flow method `hosted_checkout` to ElectronicPaymentMethod, PaymentAttempt and Refund/RefundExecution constraints.
- New Paystack attempts use method `hosted_checkout`; they are not mislabeled card/mobile-money before the shopper chooses a channel.
- Add optional `settledChannel` to PaymentAttempt. Populate it only from authoritative Paystack verification after payment; never from browser input.
- Keep existing Hubtel `mobile_money` attempts unchanged.

## Provider adapter
- Provider id: `paystack`.
- Initialize server-side with merchant reference, GHS subunit amount, callback URL and provider email identity.
- Do not pass a Variety-selected rail list; hosted checkout decides among channels enabled for the merchant.
- Validate returned authorization URL as HTTPS and against PAYMENT_HOSTED_DOMAINS.
- `safeInitiationRetry=false`; on uncertainty, lookup by the stable reference before any resend.
- Verify `x-paystack-signature` with HMAC-SHA512 over the raw body, then return `lookup_required`; final money/status comes from Verify Transaction.
- Verify reference, amount, GHS currency and transaction status before success. Capture verified `channel` as `settledChannel`.

## Phone-first customer compatibility
- Extend provider initiation input with optional payerEmail.
- Real customer email, when present, is used only as provider input.
- A phone-only customer remains valid. Generate a deterministic provider-only pseudonymous email alias from an HMAC of canonical phone plus a configured technical email domain/key.
- Never write that technical alias back to User.email or Order customer identity.
- Guest checkout remains phone-first and can use the same provider-only alias strategy.

## Configuration
- Add a complete Paystack config bundle: secret key, initialize URL, verify URL template, callback URL, technical email domain and identity HMAC key.
- Require PAYMENT_PROVIDER_ID=paystack when Paystack config is supplied.
- Production URLs must be HTTPS; secrets are bounded and never logged.
- Update deploy/env examples without committing credentials.

## Refund parity
- Implement Paystack RefundProviderAdapter for `hosted_checkout` using Create Refund and Fetch Refund.
- Full and partial amounts remain server-derived in existing Refund Authority.
- Map provider refund states conservatively; unknown/needs-attention never becomes succeeded.
- Paystack payment readiness must remain closed unless matching Paystack refund capability is configured.

## Tests / delivery order
1. RED config + adapter contracts for hosted_checkout, signed webhook, verification, phone-only provider identity and refund parity.
2. Migrations for hosted_checkout constraints and PaymentAttempt.settledChannel.
3. Provider-only email identity helper with deterministic/non-reversible tests.
4. Paystack payment adapter tests: initialize, URL validation, signature rejection, lookup success/pending/failure/mismatch.
5. Propagate settledChannel through central payment outcome without changing order financial authority.
6. Paystack refund adapter tests: create, lookup, amount/reference mismatch, pending/needs-attention/failure.
7. Registry/bootstrap wiring and readiness tests.
8. Full clean-room API Foundation, OpenAPI determinism, frontend regressions, lint and production build.
9. Keep provider disabled in UAT/production until merchant test credentials and hosted domains are configured.

## eTranzact boundary
Do not infer eTranzact endpoints or callback/authentication semantics from marketing pages. Its Ghana public material confirms web payments support card/mobile-wallet options, but implementation waits for the merchant technical integration specification and credentials.
