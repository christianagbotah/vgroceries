# Administrator physical receipts — server-paginated inspection queue
19 November 2026 — Source-only; physical return intake and associated custody/review permissions stay OFF pending acceptance.

## Operational gap
The back-office physical receipts screen queried the newest 50 receipts only and displayed the result without navigation. Staff could not locate older partial/inspected/quarantine receipts through this queue even though the production API already supports an administrator-authenticated, server-paginated `GET /admin/physical-returns?page=N&perPage=20` operation with `total` and `items`.

## Source correction
- Existing, administrator-only physical-return list API is requested in pages of 20, with server-reported total, current page, visible range, Previous and Next controls. Staff may also filter **by exact original order ID** using the existing backend `orderId` query; a linked-claim navigation automatically pre-filters its source order. Filtering is read-only and separate from the physical receiving form. Totals are labelled **matching receipts** when filtered; the screen never pretends that a filtered result is the entire ledger. This is staff receipt evidence, not proof of a refund.
- A monotonic request version prevents a slow prior-page or prior-filter response from replacing the current page. Page and order-filter changes clear unfinished inspection, quarantine or resale-review forms and cannot occur during a pending mutation.
- Failed reads display an explicit error and retry actions rather than claiming that no physical returns exist. A new receipt from a later page or filtered queue returns to the newest, unfiltered page 1 after server confirmation.
- Staff data and action controls are not rendered to non-administrators. Physical receiving, inspection, non-food resale and quarantine controls remain guarded by server flags and now stay disabled while page state is unavailable or refreshing.
- No new endpoint, schema migration, payment authority, refund action, stock movement, feature-flag activation or provider request is introduced.

## Verification and release gate
The focused Bun regressions cover server-backed paging, exact route and validation bounds, global totals, stale-response suppression, unsaved draft clearing, safe error state, role protection and recent-intake positioning. Existing physical-return client tests must stay green. Require full GitHub frontend CI and isolated PostgreSQL API security/integration CI on the exact commit before merge. Live POS-integrated deployment requires a separate protected rollout with tested rollback. No changes to real return records or inventory are part of this PR.