# Customer return request history — paginated owner-safe view
19 November 2026. Source only, default-off customer returns.

## Defect
The customer account Returns page requested a maximum of 50 return claim records, without pagination, even though the owner-scoped production GET /account/return-claims already returns page/perPage/total/items. Older accepted requests and staff-linked receipt progress therefore disappeared from the browsing UI.

## Safe correction
- Use 20 records per request with server-owned total, explicit page count/range and Previous/Next controls. New customer requests return the history view to page 1.
- Preserve the existing account order eligibility, user-entered claim draft and in-progress customer-owned return-request decisions while switching the history page. The page does not generate refunds or physical receipts.
- A monotonically increasing request version prevents an older response or slow failed request from overwriting a newer history page. While changing pages, hide stale cards. On a failed page load, show an error and explicit retry/back to first page instead of claiming the user has no return history.
- The return-progress rows introduced in merged PR #167 remain visible with staff-recorded received/inspected totals and explicit no refund/cash/stock inference. Browser does not invent unavailable counts or status.
- No server endpoint, database migration, account permission, paid-state writer, refund, product restocking, provider adapter or live feature activation is involved.

## Verification
Focused Bun client regression and existing R3a return claims tests, targeted ESLint, frontend production build/typecheck plus full GitHub API PostgreSQL/security CI on the exact commit. Source merge is not a production release. Preserve existing canonical POS portal and flags.
