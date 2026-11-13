# Variety Groceries POS — isolated cashier staging evidence

**Date:** 10 November 2026  
**Application source SHA tested:** `71057db4765004a760558846099a5f199a868ad5`  
**Scope:** authenticated **read-only** cashier and administrator reporting; no production activation.

## Isolated environment

- VPS: `vps.lightworldtech.com`; new candidate checkout
  `/home/lightworld/workspaces/vgroceries-pos-integrated-20261110`.
- Candidate API: `127.0.0.1:3049`; candidate Next.js portal:
  `127.0.0.1:3051`. Neither is publicly exposed through the existing
  storefront configuration.
- **Separate PostgreSQL 18 instance** on `127.0.0.1:55436`, database
  `variety_pos_staging`; synthetic records only. This was created **empty**:
  it is not a rehearsal of restoring a recent production/UAT backup.
- All **40 migrations** applied successfully on this separate database,
  including `202611100039_pos_cashier_read_role`.
- The shared contracts, TypeScript API and Next.js production portal compiled.
  The candidate reports `GET /api/v1/health/live` and `/health/ready`
  **HTTP 200**, with database up.
- Staging `POS_TILL_FOUNDATION_ENABLED=true` is used **only** to read synthetic
  test tills. Staging `POS_QUOTE_ENABLED`, `POS_STOCK_HOLDS_ENABLED`, and
  `POS_CASH_SALES_ENABLED` remain false. The **running older deployment's**
  POS flags remain disabled/unset.

## Test fixtures

Created exactly two synthetic test locations (Accra assigned, Kumasi
unassigned), one synthetic administrator, one individual synthetic cashier,
and two open till sessions. Passwords and session tokens were not committed,
printed in test outputs, or reused from real business accounts. Private test
fixtures remain in a mode-0600 staging-only file on the VPS.

## Acceptance checks completed

| Check | Observed result |
|---|---|
| Unauthenticated till list | HTTP 401 |
| Native-token cashier sign-in and assigned location | Pass |
| Cashier list/detail/reconciliation/cash-only CSV | Pass |
| Guessed unassigned till ID/reconciliation/CSV | HTTP 404 |
| Browser cookie login, session lookup and CSRF token | Pass |
| Cashier attempt to open till | HTTP 403; no successful mutation |
| Browser logout and old-cookie validation | HTTP 401 after logout |
| Administrator access to both test locations | Pass |
| Next.js cashier/admin/login/storefront routes | HTTP 200 on localhost |
| Actual Chromium cashier login, shift preview and logout at 375px | Pass |
| Actual Chromium administrator report and logout at 375px | Pass |
| Same full Chromium journey at 768px and 1440px | Pass |
| Horizontal layout overflow at tested widths | None detected |
| Current deployment API and portal health probes | HTTP 200 |

The Chromium sessions used a fresh local browser profile and verified
authenticated UI navigation and report content, not merely HTML route status.
Private screenshots are retained **on the VPS staging workspace** and are not
part of the public repository.

### Post-test database non-mutation evidence

The isolated database contained **two synthetic till sessions**, while each
of these tables had zero rows at the end of testing:

- `CashierTillMovement`
- `PosCashSale`
- `PaymentAttempt`
- `StockDepletion`
- `StockMovement`

No production stock, POS tender, payment, refund, sale or cash drawer balance
was changed by these acceptance runs.

## Important release limitations

This evidence covers **technical acceptance of the read-only reporting slice**,
not a complete production POS or operational cutover.

1. The candidate services are **localhost-only, manually started testing
   processes**. A real HTTPS staging hostname, approved DNS, browser-origin,
   certificate and reverse-proxy rehearsal still need to be verified.
2. The isolated database was created empty and migrated; a **backup/restore
   rehearsal** on a restored representative UAT copy is outstanding.
3. No real cashier, commercial transactions, provider MoMo/card settlement,
   returns/refunds, tax accounting, live receipts, concurrent stock race,
   real till count or supervisor cash handover has been accepted.
4. Full operational review, accessibility review beyond the tested flows,
   cashier provisioning workflow, monitoring, backup and rollback exercises,
   and release approval remain pending.
5. The implementation is still a **draft PR #86**, with prior review branches
   #84 and #85; integrate carefully and avoid duplicate independent merges.
   Do not change the public Coming Soon website or flip production POS flags
   as a result of these staging tests.

## Next controlled step

Review the combined draft and this evidence; provision a separate HTTPS
staging hostname and restore-tested database; complete cross-role and
operator acceptance; then plan a protected merge/deploy with rollback.
**Keep POS sale/stock/payment authority OFF in production** until its own
full workflow and accounting controls pass.
