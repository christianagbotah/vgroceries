# Verified POS cash drawer reconciliation — source-only UAT (19 Nov 2026)

## Purpose

Provide a separately routed, **read-only, administrator-only** real-POS
cash-drawer report at `/admin/pos/verified-uat/reconciliation`. The existing
`NEXT_PUBLIC_VERIFIED_POS_CASH_HISTORY_UAT=1` build flag gates both this screen
and the independently existing cash-sale history screen. The flag is OFF by
default. The API also requires its separately OFF-by-default
`POS_TILL_FOUNDATION_ENABLED` backend authority.

The UI requires a real administrator session, rejects demo/browser-selected
roles, and only accepts trusted HTTPS `/api/v1` (localhost HTTP in isolated
development). The API’s `CashierTillsController` rechecks admin access on
**each** list, reconciliation or CSV request. Page navigation alone conveys
no authority.

## Operations

- `GET /api/v1/admin/pos/tills`: list known tills. Parse the shared strict
  contract, reject disabled reports, duplicate/bad UUIDs and more than 100 rows.
- `GET /api/v1/admin/pos/tills/{sessionId}/reconciliation`: read the
  server-generated **repeatable-read** snapshot for a selected, validated till
  UUID. The backend includes opening float, manual cash in/out/drop, counted
  physical cash sales, expected drawer amount, closing count (only for closed
  tills), recent sale references, active stock holds, and material integrity
  flags. Validate the returned till identity and independent integer-pesewa
  arithmetic. Reject malformed, contradictory or incorrectly scoped data.
- `GET /api/v1/admin/pos/tills/{sessionId}/reconciliation.csv`: server-side,
  authenticated CSV with no-store response. The frontend only builds the URL
  from the validated configured API and a valid UUID. A separate CSV request
  captures a separate point-in-time snapshot; it may differ from the displayed
  preview when a real till changes between requests.

`Expected cash = opening float + cash in - cash out - cash drops + cash sales`.
Numbers are **₵** in the UI and integer minor units on wire. Reconciliation
screen exposes a factual three-way interpretation of closed tills: drawer
count matches expected; count has a variance; or recorded closing fields
conflict with independently computed ledger arithmetic. An open till has no
reported physical cash count.

Recent cash-sales details show at most 20 records; total sales use all
underlying records. The screen must not sum only the last 20 to invent a
shift total.

## Explicitly excluded

This is **not** a fiscal invoice, bank settlement, Hubtel/MoMo/Card settlement,
income or general ledger report, sales tax calculation, refund ledger, POS
closing workflow, cash adjustment, COD remittance, or a guarantee that the
physical drawer was actually counted. Provider, refund and tax reconciliation
flags remain false. The new UI has no POST operations, price/stock mutations,
refund approvals or payment functionality.

No production flags, databases, payments, till records, customer information,
refunds, messages or VPS deployments are changed by this source work.

## Test and release gate

```sh
bun test scripts/verified-pos-till-reconciliation-frontend.test.ts \
  scripts/verified-pos-cash-history-frontend.test.ts \
  scripts/verified-pos-quote-frontend.test.ts \
  scripts/verified-pos-customer-picker.test.ts
./node_modules/.bin/eslint src/features/staff/verified-pos-till-reconciliation-*.ts* \
  src/app/admin/pos/verified-uat/reconciliation/page.tsx \
  scripts/verified-pos-till-reconciliation-frontend.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
```

Before staging: exact-head green GitHub frontend CI and API foundation;
approved POS-integrated staging release parity review; restored test database;
administrator vs cashier/other-role access checks; receipt and CSV with active
and closed tills, zero-sales cases, negative drawer variance, stale sessions,
expiry, and narrow Android layouts. The staging frontend/API currently serve
different release lines from canonical main; do not replace that pair without
`docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`.

The reconciled cash drawer does not authorize financial go-live. Hubtel
Transaction Status still has an external authorization blocker and POS
refund/cash policy must be tested independently.
