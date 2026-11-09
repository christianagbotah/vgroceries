# P0c1: physical CASH sale & stock handover

**Default OFF:** `POS_CASH_SALES_ENABLED=false`. Requires
`POS_STOCK_HOLDS_ENABLED=true`, `POS_QUOTE_ENABLED=true` and
`POS_TILL_FOUNDATION_ENABLED=true`. No live cashier transition, cashier role
grant or POS checkout activation is authorized until cash-safety UAT and
supervisor approval. Existing customer-facing ecommerce remains unaffected.

## Staff flow and source of truth

1. Administrator opens a till and creates a server-priced P0b2 stock hold.
2. Staff physically counts the customer's cash. The strictly validated
   `POST /api/v1/admin/pos/cash-sales` request carries the existing hold ID,
   amount received in integer pesewa, explicit cash-count + actual goods-handover
   attestations, and a descriptive handover note.
3. Server locks the till and hold; checks status, expiry, store, product
   publication and current prices. A changed price forces release/requote;
   an expired, released or sold hold cannot be completed.
4. Within **one PostgreSQL transaction**, consume the original
   `Reservation(claimType='pos_draft')` using
   `StockDepletionService.consumeClaim(kind='pos_handover')`; append an
   immutable `PosCashSale`; transition hold to `consumed`; record audit,
   outbox and an idempotent operation result.
5. Counter receipt **data**, not a Ghana tax invoice, is available at
   `GET /api/v1/admin/pos/cash-sales/{saleId}`. The bounded history is
   `GET /api/v1/admin/pos/cash-sales`. Only administrators are permitted.

The sale has an immutable server-generated reference, original item-price
snapshot from the hold, cash received, **change actually handed back**, exact
stock depletion and till linkage. No browser-submitted prices or discount,
invoice, credit or external electronic payment status can be submitted.

## Reconciliation

The same till records cash sales separately from opening float and manual
cash in/out/drop movements. Its expected drawer count is:

  **opening float + manual cash in − manual cash out − drops + cash sales**

A cashier cannot silently close a till with a closing expected amount that
omits recorded sales: PostgreSQL independently enforces this arithmetic.
A sale cannot be linked to a closed or different-location till. Cash-drop
limits now also account for recorded cash sales.

A transaction receipt reports `electronicPaymentVerified:false` and
`taxInvoiceIssued:false`. This is **physical cash attestation**, not a
processor-verified MoMo/card payment or a statutory tax invoice.
The current ledger excludes returns/refunds, which require separate
reconciliation authority before production launch.

## Limits and launch blockers

- The sale flow is CASH ONLY. No card, MoMo, bank transfer, split tender,
  customer credit, deferred cash, discounts, electronic provider callbacks,
  refunds, tax invoices, VAT/levy breakdowns or offline committed payments.
- Only an administrator can attest physical counting and handover. Real
  cashier roles, tills/devices/grants, dual-controls for exceptional
  transactions and supervisor oversight are still to be implemented.
- P0b2's short-lived hold means sale completion must occur before expiry.
- An item whose server price changes between hold and completion is refused,
  not silently repriced or charged at a stale price.
- These counter cash receipts are a separate append-only sales ledger,
  linked to common stock depletion; general ledger, taxes and return
  accounting must be integrated before full merchant financial reporting.
- Database constraints independently enforce sale/hold/depletion identity,
  source till and location, the counted amount/change, administrator role,
  once-only sale, terminal state and till cash arithmetic.

## Tests and release

A clean PostgreSQL migration and `verify-api` plus frontend `CI`
must both be green. Tests cover counted cash sale, exact stock decrement,
refund/payment attempts untouched, price changes, insufficient tender,
expiry, duplicate/concurrent completion, replay, immutable receipt,
fabricated sale/provenance and till balance reconciliation.

After the test gates pass, rehearse on a **restored UAT** database and
run physical till, printer, actual cash-count and policy review. Keep
`POS_CASH_SALES_ENABLED=false` in production until those gates and tax
handling are approved. POS P0c2 remains electronic provider verification,
tax-aware invoices, refunds and full shift settlement.
