# Administrator customer return requests — full-ledger pagination
19 November 2026. Source only; no live cutover, no active customer return process.

## Corrected operational gap
The staff administrator return-claims page previously requested only the first 50 records and displayed them without pagination controls. The production API already supports page/perPage/total/items. Approved, pending or disputed older claims could become invisible once the first page fills.

## Safe implementation
- Use 20 server-returned requests per page via the existing administrator-only GET /admin/return-claims endpoint. Display server-provided total and the visible page/range, plus Previous and Next controls.
- Changing pages clears unfinished review drafts, status notices and stale request errors. A monotonic request version discards late responses from prior pages or role transitions, so a slow request cannot overwrite more recent records.
- Review decisions remain server-owned, role-gated, reasoned, idempotent and irreversible. No browser refund, stock, physical intake or payment success authority is added. An admin-only read-only Refresh button reloads the current page.
- The page does not render staff claim details or decision controls after the authenticated role loses administrator permissions.
- Empty page is distinct from globally empty: the message distinguishes a server-reported total of zero from an exhausted page.

## Regression and release boundaries
Bun regression tests cover bounded query contracts, authoritative pagination totals, visible ranges, stale-response avoidance, role protection, and no financial actions. The previous customer return-claim client regressions must remain green. GitHub frontend build and API isolated PostgreSQL/security CI must both pass before merging.

Source-only. Return/claim/payment flags remain OFF, no migrations, changes to production customer requests, refunds, stock, services, or provider credentials.
