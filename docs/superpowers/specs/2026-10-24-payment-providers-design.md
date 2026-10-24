# Payment Providers Design

## Intent
Variety Groceries must replace the current demo payment roleplay with real, server-controlled provider integrations while preserving the existing Payments Authority: durable attempts, idempotency, amount/currency verification, raw provider evidence, reconciliation, and refund safety.

## Provider choices
Supported configured providers are `hubtel`, `paystack`, and `etranzact`. Exactly one provider is active for electronic checkout at a time through `PAYMENT_PROVIDER_ID`; customer browsers never receive provider secrets or choose credentials.

## Architecture
Keep the NestJS `PaymentProviderAdapter` boundary. Provider-specific credentials/endpoints are parsed from protected API environment configuration. Production startup constructs only fully configured adapters and injects them into the existing registry. Paystack gets payment + automated refund adapters. Hubtel and eTranzact get collection adapters; automated refunds stay unavailable until merchant onboarding supplies verified refund/reversal contracts, so readiness remains fail-closed when those providers are selected for production electronic checkout.

Paystack uses server-side transaction initialization, hosted redirect, HMAC-SHA512 webhook verification, and server-side transaction verification before money is trusted. Hubtel uses Basic-auth request-money/paylink initiation and a configured official status lookup endpoint supplied during merchant onboarding; callbacks are treated as lookup-required evidence rather than trusted money. eTranzact WebConnect uses a server-generated checksum and a secure form POST action to the configured WebConnect URL, callback checksum validation, and configured query endpoint for reconciliation.

## Customer flow
After an electronic order is created, `/checkout/status/[id]` automatically starts one idempotent payment attempt through the real API. It renders the provider action: redirect for Paystack/Hubtel, form POST for eTranzact, prompt/instructions where applicable. The browser can never mark an order paid; only verified provider evidence or reconciliation can do so. The old demo success/failure buttons are removed from production flow.

## Constraints
- Currency is GHS and amount comes only from the server-owned Order.
- Provider credentials never appear in frontend bundles, API responses, logs, audits, or Git.
- Hosted URLs remain HTTPS and hostname-allowlisted.
- Callbacks/webhooks are duplicate-safe and preserve raw-body verification.
- Hubtel/eTranzact refund automation must not be fabricated from undocumented endpoints.
- Existing cash counter/COD behavior is unchanged.
