# POS P0b1 — shared-price and shared-availability preview

**Status:** source implementation for test and UAT only. Default-OFF
`POS_QUOTE_ENABLED=false`, requiring `POS_TILL_FOUNDATION_ENABLED=true`.
Do not enable real walk-in selling or printed commercial receipts.

## Purpose

Prevent a dangerous divergence between the counter and online storefront.
The authenticated administrator's `POST /api/v1/admin/pos/quote` request
contains only an open `sessionId`, variant IDs and quantities. The server:

1. Authenticates a real administrator, validates a strict request body and
   verifies the referenced till is still open.
2. Rejects a till at another location, because the existing online quote
   authority is currently bound to the configured commerce stock location.
3. Calls **CheckoutQuoteService.quote** (not the frontend mock) to read the
   same active variants, product publication, live `variant_availability`
   view, safety stock, saleable/expiry/quarantine rules, and stored prices.
4. Returns a no-handover snapshot with `quoteOnly=true`,
   `stockReserved=false`, `orderCreated=false`,
   `paymentVerified=false` and `quotedAt`. A conflict is a price/stock
   warning, not a valid sale or an inventory hold.

The response deliberately excludes client-provided unit prices, discounts,
captured payments and cash collection proof. Currency remains integer pesewa
under the application's standard Ghana-cedi display policy (₵).

## Critical limitations

- **No stock reservation.** Another online customer can reserve or purchase
  the remaining stock immediately after the quote. A subsequent POS sale must
  recheck availability and reserve/consume within one transaction.
- **No payment.** A preview does not authorise cash/MoMo/card settlement.
- **No POS orders.** Neither the database Order nor any accounting/cost records,
  StockDepletion, Reservation, PaymentAttempt or drawer movement are created.
- **No till posting.** Preliminary till cash records continue to exclude sales;
  they must never be presented as reconciled sales until POS P0c links them.
- **One commerce location.** Multi-location quote authority remains future
  work and must not borrow stock from the online location.
- **Not activated:** no live feature toggle, customer portal change, cashier
  role delegation or mock POS cutover is included in this milestone.

## Verification

Run `verify` and `verify-api` in GitHub. New PostgreSQL-backed checks cover
the same price/availability output as online checkout, unavailable/duplicate
item lines, fractional packaged units, customer role rejection, closed tills,
wrong-store till rejection, default-off configuration and no stock/payment/
order/cash mutations.

P0b2 is atomic walk-in order + shared stock reservation, with idempotency,
online-vs-POS last-item race tests, server-owned receipt identity and explicit
physical handover. P0c will then add verified tender/cash records, change,
refund integration, daily till reconciliation, separate supervisor controls,
and printer UAT. Neither milestone is implied by this preview.
