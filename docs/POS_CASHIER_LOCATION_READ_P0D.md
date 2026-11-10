# POS P0d — cashier identity and location-scoped cash report reads

This is a **read-only access foundation**, not authorisation to perform counter sales or
cash-drawer mutations. `POS_TILL_FOUNDATION_ENABLED`, `POS_QUOTE_ENABLED`,
`POS_STOCK_HOLDS_ENABLED`, and `POS_CASH_SALES_ENABLED` stay **OFF** by default.

## Authority model

- The PostgreSQL and Prisma `Role` enum includes `cashier`; its only backend
  capability is `pos.cash-report.read`.
- A cashier must have an active, authenticated staff session and a current
  `UserLocation` assignment. Only till records for assigned **active**
  `Location` rows are readable.
- `GET /api/v1/admin/pos/tills` returns the 50 most recent till sessions
  **within the cashier's authorised locations**. The `includesSales` flag
  is scoped to the same locations and never reports sales elsewhere.
- `GET /api/v1/admin/pos/tills/{sessionId}`, reconciliation previews and
  cash-only CSV exports return **404** for an unassigned, inactive or missing
  location to avoid exposing whether another branch's till exists.
- Active administrators retain existing organisation-wide report access.
  Inventory managers and customers are not cashier-report readers.
- Assignments are loaded anew by authentication on every API request.
  Removing a `UserLocation` grant immediately removes cashier access on the
  next request, even if an earlier staff session is still valid.
- Cashiers **cannot** open/close tills, move cash, generate stock holds or
  complete counter sales. Existing controller checks and PostgreSQL
  immutable-money/stock triggers remain administrator-only.
- Creating an actual cashier user requires a separate, reviewed authorised
  staffing/admin workflow. No shared or default cashier credentials are
  added here.

## Security and acceptance

The PostgreSQL integration test `pos-cashier-read-access.spec.ts` exercises:
authenticated cashier logins, no-grant sessions, assigned/unassigned
locations, direct URL/CSV guessing, grant revocation, inactive stock
locations and rejected mutating requests. Database mutation tests must remain
green and old administrator flows must not regress.

Review the related reporting UI PR #84 separately. Its frontend route
currently uses an administrator-oriented staff gate. Cashier navigation
and role-appropriate UI should be connected only after both PRs pass their
checks and authorised staging acceptance. Do not deploy directly from this
feature branch or turn on production POS feature flags.
