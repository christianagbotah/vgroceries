# Variety Groceries POS vs canonical main: source parity audit

Date: 17 November 2026, read-only Git comparison on authorised VPS.
Repository: christianagbotah/vgroceries

## Compared revisions

- Canonical main: 5751f4e (17 Nov 2026, narrow/collapsible admin sidebar)
- POS-integrated branch: fd4a845 is the **actually deployed portal code**
- POS branch documentation head at audit time: 5a3bae9
- Active portal service: varietygroceries-portal-canonical.service on port 3052
- Active paired POS API: port 3049, not modified by this audit
- Public varietygroceries.com remains Coming Soon

### Exact git comparisons

The commands below are read-only and do **not** merge anything:

    git fetch origin refs/heads/main:refs/remotes/origin/main
    git rev-list --left-right --count origin/main...HEAD
    git diff --name-status origin/main HEAD

Result with documentation branch HEAD 5a3bae9:

| Measure | Count |
| --- | ---: |
| Commits only on main | 458 |
| Commits only on POS-integrated branch | 171 |
| Files whose tips differ (git diff main HEAD) | 289 |
| API files under apps/api | 85 |
| Frontend under src | 80 |
| Scripts under scripts | 37 |
| Documentation under docs | 63 |
| Other files and project configuration | 24 |

These are **source differences**, not confirmed defects. A file changed on
both branches may not be an actual runtime conflict; a file deleted on one
branch may be deliberate. Conversely, a clean textual merge does not prove
database, role, inventory or POS compatibility.

### Critical examples requiring review

- apps/api/src/cashier-tills: cashier access, till reconciliation, stock
  reservations, cash sales and controllers differ on the two branch tips.
- src/features/staff/verified-pos-uat.tsx and the associated transport/retry
  utility are POS-only frontend components at this comparison.
- src/components/layout/admin-shell.tsx differs and contains the currently
  deployed compact/searchable navigation and POS support route.
- Stock/checkout, shared contracts, migrations, login and payment flows are
  not to be assumed equivalent because the checkout/API branch tips differ.

## Required reconciliation sequence

1. Preserve the immutable last-good portal release and API 3049 environment.
   Keep the public Coming Soon site unchanged.
2. Create a separate integration worktree from canonical main; do not
   fast-forward or force-push main to the POS branch. Review *both* histories.
3. Inventory API schema, migrations, contracts, role grants and POS cashier
   routes first. Explicitly reconcile intended POS code with newer main
   functionality; do not replace these modules by wholesale copying.
4. Resolve frontend storefront, official VG branding, support inbox, cash
   receipts, quick basket and narrow searchable sidebar on top of the vetted
   API contracts.
5. Test compile/lint, API foundation and PostgreSQL integration tests on an
   **isolated test database**. Test equal stock/price authority for web/POS,
   one-and-only-one stock depletion after handover, replayed cash sale
   receipt identity, till cash reconciliation, location-scoped RBAC and
   denied payment/provider writes.
6. Check backup/restore, migrations and rollback against a restored **staging**
   database. Use real role accounts only in authorised staging; do not
   manufacture a positive UAT report or live money event.
7. Roll out a separately versioned portal/API candidate only after exact-SHA
   CI evidence, review, owner-approved UAT and rollback readiness.

## Status

**Audit and plan only.** No merge, migration, inventory mutation,
production POS flag activation or public-site cutover was executed.
The existing deployed branch remains the safe operating source.
