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

## Production/demo isolation and administrator authority

The live report calls `resolveProductionClientAdapter()` rather than the general demo-aware adapter. This intentionally fails closed without `NEXT_PUBLIC_API_BASE_URL` and cannot switch to mock data because a stale `vg-staff-demo-session-v1` browser flag is present. The demo cash-session UI is still available only through the mock-only page routing.

The production screen does **not** rely on demo `useStaff().can()` permissions to decide whether to request data. The NestJS `AccessGuard` and controller's administrator-role check decide access: an unauthenticated session gets 401 and an unauthorised account gets 403. Both are handled as errors without displaying imagined balances.

## Authenticated UAT acceptance checklist

1. With real REST API configured, visit `/admin/cashier-sessions` without a session: confirm no reports and an authentication-required message.
2. Log in as a non-administrator: confirm the server denies the list and CSV (403), regardless of any demo role menu.
3. Log in as an administrator while `POS_TILL_FOUNDATION_ENABLED=false`: verify the list explicitly shows operations disabled, and the screen does not offer any mutation actions.
4. Set the old demo-session flag in a *test browser only* while the production API URL remains configured. Verify network traffic stays on `/api/v1/admin/pos/tills`, never `/api/mock/v1`.
5. In an isolated UAT database with POS foundation allowed, verify opening float, cash-in/out/drops, actual cash-sale totals, counted cash, closing difference, and any integrity warning against the server ledger. Compare the generated CSV values in **pesewas** to the UI values in **₵**.
6. Confirm the list and reconciliation requests are GET-only with credentials; no sale, till, stock, refund or payment POST is triggered by this screen.

Do **not** enable production cash-sale, stock-hold, checkout, or payment feature flags as part of this read-only reporting UAT.
