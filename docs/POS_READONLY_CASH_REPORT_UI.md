# Production cashier shift reports — read-only web rollout

This change makes `/admin/cashier-sessions` safe to open on the real REST-connected portal. The production route no longer calls `apiOps.sessions`, `sessionOpen`, `sessionMovement` or `sessionClose`, which belong to the older mock protocol.

Instead, the browser's existing cookie-authenticated `HttpServiceAdapter` calls two **GET-only** routes:

- `/api/v1/admin/pos/tills` — authenticated administrator-only list.
- `/api/v1/admin/pos/tills/{sessionId}/reconciliation` — one read-only, PostgreSQL-backed cash-drawer snapshot.

The web validates both server responses against the shared strict Zod schemas before displaying figures. It shows opening float, manual cash movements, actual cash-only sales, expected drawer cash, closing difference, active holds, recent cash-sale references, and ledger integrity warning. The existing server-authorised CSV link is available only when a verified report is displayed. Dates are shown in Ghana local time and currency as ₵.

## Boundaries

- No cashier sale, payment, hold, refund, stock depletion, till opening/closing, or money movement is performed.
- The old sessions demo remains usable **only** when `NEXT_PUBLIC_API_BASE_URL` is unset. Real API connections never enter it.
- Cash drawer is **not** bank/MoMo/card settlement, refund reconciliation, statutory tax invoice, or general ledger accounting.
- Server administrator authentication remains authoritative, independent of the frontend role menu.
- POS feature flags stay **OFF** by default. An unactivated environment shows its disabled state, not invented transactions.
- Real POS cutover still requires cashier grants, stock location verification, UAT, compliance, operator training and a rollback plan.

## Validation / deployment

Run lint, frontend TypeScript compile and UI build plus the API foundation's PostgreSQL tests before merging. Do not activate production POS flags or deploy from this branch without release acceptance.
