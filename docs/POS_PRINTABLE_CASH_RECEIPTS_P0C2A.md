# P0c2a — immutable product snapshots and printable cash receipts

**Development-only, default OFF.** This release extends the cash-only sale
authority introduced in PR #79. The existing `POS_CASH_SALES_ENABLED=false`
gate remains mandatory, along with the till, quote and stock-hold prerequisites.
This PR neither activates live POS nor creates MoMo/card/tax/refund authority.

## Why a sale receipt needs a separate snapshot

A product or variant can be renamed after the original counter sale.
Looking up current product names when reprinting an old receipt would be
misleading. `PosCashReceiptLine` therefore saves immutable **product name,
variant name, selling unit, quantity, original unit price, and line total**
inside the *same* transaction that consumes stock and creates `PosCashSale`.

PostgreSQL independently checks that every receipt item belongs to the sale's
original stock hold, matches the held quantity and money, and captures the
catalog names at the time of the transaction. A deferred commit constraint
requires **exactly one snapshot per original hold line** and an exact subtotal.
Neither individual receipt lines nor completed cash-sale records can be
rewritten or deleted to fabricate a changed transaction.

## Administrator-only print endpoint

`GET /api/v1/admin/pos/cash-sales/{saleId}/print`

The existing authenticated administrator session is required. The response
is a print-friendly, 80 mm, self-contained HTML receipt suitable for
browser printing with a compatible thermal printer. It includes the
Variety Groceries label, unique reference, Ghana-local date/time, till code,
sale-time item names/units/quantities/prices, total, cash counted and change
given.

The output escapes all dynamic text, includes **no JavaScript, external
assets or web fonts**, and is delivered with `Cache-Control: private,
no-store`, a restrictive CSP and content-type protection. It does not
send or require any customer personally identifying information.

**The document is an internal cash-sale confirmation, NOT A TAX INVOICE.**
No statutory tax calculations, fiscal equipment integration or tax
certification are claimed by this milestone.

If any historical sale predates immutable name snapshots, printing is
refused with a visible conflict rather than producing an inaccurately
reconstructed receipt. Production cash-sale flags have remained off, so
no live backfill is assumed or attempted.

## Acceptance and further work

GitHub's frontend CI, deterministic OpenAPI contract and isolated
PostgreSQL integration/security suite are required before merge.
Tests cover original-name persistence after a product rename, HTML escaping
of hostile product names, authorization, no-store headers, exact cash
amounts, SQL immutability and exact item-line completeness.

After passing CI, production remains disabled until restored-UAT,
real printer widths, correct store/contact branding, operator controls,
tax handling, reconciled returns/refunds and cash drawer sign-off.
The existing browser POS demo must not be silently treated as live.
