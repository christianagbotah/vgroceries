# COD D1 Rider History: verified declaration visibility (19 November 2026)

This follow-up to PRs #147 and #148 corrects a repeat-visit limitation: after a rider self-declared counted cash, the real `/api/v1/rider/jobs?scope=history` endpoint previously returned only the order delivery status and COD due amount. On a refresh, the rider UI could offer the cash-declaration action again, though the database would reject it. That is confusing when the previous request was interrupted after server commit.

The authentic rider job projection now includes one optional, **minimal** `codCashDeclaration` snapshot, sourced from the immutable PostgreSQL declaration row. It contains only `status: rider_declared_unverified`, exact `amountMinor`, and server `declaredAt`. It never exposes the original rider note, attesting user ID, payment credentials, cash settlement, supervisor approval, or remittance evidence.

The rider page continues to filter only server-owned delivered, proof-backed unpaid COD orders. If a declaration exists, it displays the dated unverified statement and disables the Submit action, even after logout/login, restart, page refresh or a network retry. An undeclared eligible order remains selectable. The backend still enforces ownership, concurrency, exact amount, append-only evidence and duplicate protection independently of the UI.

No migration, financial write, payment-state update, inventory change, deployment or activation flag change. `NEXT_PUBLIC_VERIFIED_RIDER_COD_D1` and `COD_CASH_DECLARATIONS_ENABLED` remain **OFF** on active environments. Supervisor verification, remittance, custody and finance reconciliation remain separate required phases.

Validation includes a real rider-session API integration assertion, strict shared Zod contract checks (unknown private fields and false settlement statuses rejected), and regenerated 159-path production OpenAPI. Full API PostgreSQL CI and frontend production build are required before merge.
