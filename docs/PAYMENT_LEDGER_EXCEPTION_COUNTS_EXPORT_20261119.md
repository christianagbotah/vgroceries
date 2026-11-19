# Staff Payments — global exception count and scoped audit export
19 November 2026. Source-only. No provider request, payment, refund, migration, flag activation or deployment.

## Problem
The existing staff payment ledger showed only **exceptions on the current page** in its top summary. With a paginated API, administrators could misinterpret a zero-page count as zero unresolved payment verification exceptions globally. The server `GET /payments` already supports `settlementState=exception`, `page`, `perPage` and returns authoritative `total`.

## Solution
- A separate administrator-authenticated, read-only `GET /payments?page=1&perPage=1&settlementState=exception` obtains the server's **all-attempts exception count**. It is not limited by the ledger's current status filters, page or order reference; it fetches only one record plus metadata.
- The dashboard distinguishes **Verification exceptions (all attempts)** from **Exceptions (this page)**. A failed count fetch displays `Unavailable` (never fabricates zero). **Review exceptions** selects the existing server-wide exception filter and resets page to one. Staff can explicitly refresh both summary and rows.
- **Export visible page CSV** uses only rows already returned to the authorized staff browser, max 25 visible records. The CSV includes an explicit **visible page only** scope notice, the server's total matching attempts across pages, page number, selected filters, initiation status, reconciliation state, callback count and order/provider references. It is **not** called a bank settlement, accounting payment proof or complete filtered ledger export.
- Neutralize spreadsheet formula injection in every metadata/row cell (quotes, formulas starting =,+,-,@ including whitespace, and control characters). UTF-8 BOM preserves ₵ characters for spreadsheet readers.
- No bulk order queries, no new endpoint, authorization model or financial mutations; the server continues to own pagination, payment state and reconciliation.

## Tests
Focused Bun regressions verify global count independence, production metadata with 87 total and one item, full-demo fixture filtering, visible-page CSV scope, formula injection, malformed metadata rejection and no financial action in UI. Existing pagination, Paystack and exception-badge suites must remain green; full frontend GitHub CI and API integration/security are merge gates. Live POS-integrated portal requires a separate controlled cutover.
