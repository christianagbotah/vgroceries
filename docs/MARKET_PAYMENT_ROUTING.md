# Country-specific payment providers

Owner requirement: branch/country-market selection controls currency and supported online payment providers. Preserve the current Ghana checkout. No forced cross-currency charging.

## Initial documented coverage (reviewed 2026-11-28)
- Ghana GHS: Hubtel, Paystack, Flutterwave. Hubtel developer conventions specify GHS amounts. Existing production Hubtel stays unchanged.
- Nigeria NGN: Paystack and Flutterwave. Existing Paystack adapter is GHS-bound and needs verified country/currency support before Nigerian use.
- Togo XOF: PayGate Global advertises Togo mobile money (Flooz and T-Money). Flutterwave documents XOF support, but specific Togo merchant onboarding, collection channels and settlement must be confirmed. Paystack documents XOF for Cote d'Ivoire, not Togo. Do not enable Paystack for Togo on currency alone.
- Cote d'Ivoire XOF: Paystack, Flutterwave and PayGate Global documented as candidates, not verified live accounts.

Sources:
- https://developers.hubtel.com/docs/conventions
- https://paystack.com/docs/v2/api/supported-currencies
- https://paystack.com/docs/payments/payment-channels/
- https://developer.flutterwave.com/docs/coverage
- https://developer.flutterwave.com/docs/payment-methods
- https://www.paygateglobal.com/

## Implementation gates
1. Owner chooses explicit branch country and currency. Server resolves authoritative market, never trusts client currency or provider selection. Filter the admin catalog by country/currency; mark conditional coverage unverified.
2. Separate encrypted merchant configuration per market/provider (or explicitly authorized shared merchant profile for same market); credentials stored server-side only. Verify merchant registration, collection currency and enabled channels, settlement destination/currency, refund capability and callback authentication. Test mode and live approval separated.
3. Reuse existing Hubtel and Paystack adapters, preserve current Ghana behavior; audit existing eTranzact adapter; implement Flutterwave hosted checkout and local gateways only after documented capability and approved credentials. No Flutterwave adapter exists in current source audit.
4. Immutable order and attempt snapshots: market, branch, currency, amount in currency-appropriate units, provider, merchant configuration version and reference. Verify callback/status with matching provider, merchant account, reference, currency and amount before marking paid. Refund through original merchant/provider. Never reinterpret GHS amounts as NGN or XOF. Handle XOF zero-decimal amounts and provider-specific amount encoding.
5. Owner selects primary provider per market and permitted fallback(s), optional same-market branch override. If no verified provider, online payment unavailable; allow authorized cash collection/delivery or keep market closed. No automatic fallback after an ambiguous charge; resolve previous attempt before retrying another gateway. Customer sees only supported payment options.
6. Country-specific onboarding UI, provider connection/test, activation and pause controls. Health and audit trail; settlement and reconciliation by market/currency/provider. Implement cross-market authorization, idempotency, provider isolation, callbacks, refunds, UI, integration, CI and deployment checks before opening market.

## Current scope
Planning-only typed eligibility module and tests. Not connected to actual checkout; no live provider, currency or merchant setting changed. Unknown markets and providers fail closed. Payment adapter interface currently restricts currency to GHS and provider registry selects one globally configured adapter. The full data model, routing and gateway integrations remain open.
