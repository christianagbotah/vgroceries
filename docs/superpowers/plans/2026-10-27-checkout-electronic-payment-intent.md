# Checkout electronic-payment intent

## Goal
Make storefront checkout ask only whether the shopper wants electronic payment or the legitimate offline payment for the fulfilment type. The payment provider, not the shopper, chooses the supported electronic rail.

## Compatibility
- Add `electronic` as a storefront/order-level payment intent.
- Keep legacy `mobile_money`, `card_hosted`, and `bank_transfer` values readable and initiable for existing orders and POS.
- Keep `cash_counter` for collection and `cash_on_delivery` for eligible delivery zones.
- Payment attempts continue to store the concrete provider rail, never the abstract `electronic` intent.

## Server authority
- Checkout treats `electronic` as payment-required and fails closed unless at least one configured provider method has refund parity.
- Payment policy resolves the first configured method supported by the active provider, preserving configured preference order.
- Payment initiation converts `electronic` order intent to that concrete method before creating the attempt.

## Storefront
- Checkout shows `Electronic payment` plus only the valid offline option for the chosen fulfilment.
- Provider-specific Mobile Money/Card/Bank choices disappear from checkout.
- Status copy for new electronic orders is provider-neutral.
- Remove stale `demo account` and `demo location` wording from production-backed checkout.

## Verification
- Red/green storefront contract regression.
- Checkout command integration proves `electronic` is stored while payment is required.
- Payment initiation integration proves the attempt stores the concrete provider method selected server-side.
- Legacy rail-specific initiation remains green.
- Full contracts, API, frontend regressions, lint, build and OpenAPI gates.
