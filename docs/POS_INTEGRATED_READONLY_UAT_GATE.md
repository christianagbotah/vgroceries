# POS cashier + administrator reporting — integrated staging acceptance gate

**Status:** source and CI coverage only. Neither a completed live cashier
test nor permission to deploy production. Integrated candidate lives on the
draft integration branch for PR #86, combining PRs #84 and #85.

## Production preflight recorded 10 November 2026

Read-only VPS observation on `vps.lightworldtech.com`:
- UAT API health endpoint returned HTTP 200.
- Existing API answered HTTP 401 on `GET /api/v1/auth/me` without credentials.
- Existing API answered HTTP 404 on `GET /api/v1/admin/pos/tills`
  and `GET /api/v1/admin/pos/cash-sales`: it is **an older build**, so these
  cannot be treated as cashier UAT successes.
- `POS_TILL_FOUNDATION_ENABLED`, `POS_QUOTE_ENABLED`,
  `POS_STOCK_HOLDS_ENABLED` and `POS_CASH_SALES_ENABLED` were all
  **disabled or unset** on the running API process.
- No public website, service, database or production feature flag was changed.

## Isolated staging release sequence

1. Obtain a recent tested database backup and rehearse restore **into a
   separate UAT database**. Never run migrations on production as a shortcut.
2. Deploy the candidate API and portal to **separate** staging services/ports
   and staging-only hostnames, without switching the current UAT symlink or
   replacing the Coming Soon site. Check database and service identifiers.
3. Apply the full Prisma migration history on the **isolated** UAT database.
   The cashier enum migration is `202611100039_pos_cashier_read_role`.
4. Verify both GitHub check suites are green on the **exact candidate SHA**.
   Check `GET /api/v1/admin/pos/tills` is **401** without login; 404 means the
   wrong API version was deployed.
5. Create two active test stock locations and two real, traceable test till
   records with an **authorised administrator** in the isolated database.
   Provision one individual cashier with only the first location assigned,
   using approved administration tools; no shared/stored sample passwords.
   Do not use real production customer transactions or payment credentials.
6. Only in the isolated UAT environment, enable the till foundation needed
   for test reports. **Keep `POS_QUOTE_ENABLED`, `POS_STOCK_HOLDS_ENABLED`
   and `POS_CASH_SALES_ENABLED` disabled**. No electronic provider cutover.
7. Run the script below with the test cashier account, one permitted location
   and one known unassigned test till session. It checks no unauthenticated
   access, authorised list/detail/cash reconciliation/CSV, no cross-location
   leakage, and automatic test-session logout. It issues **no POS writes**.
8. In an actual browser, independently test cookie-backed cashier login
   (`/staff/login`), redirect to `/staff/cashier`, restricted shifts,
   keyboard/mobile layout, preview/CSV, sign-out, CSRF, revoked grant, disabled
   location and stale demo mode. Test the administrator page at
   `/admin/cashier-sessions` with a real administrator.
9. Record signed-off UAT evidence, restore drills, and rollback. Merge the
   integrated read-only code only after acceptance. Leave live POS flags
   disabled until sales/stock/payment/reconciliation controls separately pass.

## Automated *native-token* staging probe

`scripts/pos-cashier-staging-smoke.mjs` is deliberately fail-closed:
it requires a hostname marked `uat`, `staging` or `test` (or loopback),
HTTPS for non-loopback, an explicit `/api/v1` base URL, and distinct
permitted/denied till IDs. The script must never be pointed at production.
It reads required credentials from environment variables rather than command
arguments and does not print tokens.

```sh
export POS_UAT_API_BASE_URL='https://YOUR-UAT-HOST/api/v1'
export POS_UAT_CASHIER_EMAIL='your-provisioned-test-cashier@example.test'
export POS_UAT_ALLOWED_LOCATION_ID='your-allowed-test-location'
export POS_UAT_DENIED_SESSION_ID='known-till-session-in-another-test-location'
# Supply the test password securely from an approved credential manager:
# export POS_UAT_CASHIER_PASSWORD=...
node scripts/pos-cashier-staging-smoke.mjs
```

**Acceptance requires a positive result, not just a script invocation.**
The smoke probe uses a short-lived native bearer session; it does *not* replace
manual cookie/CSRF/browser acceptance. A disabled till foundation, missing
test records, missing valid credentials or a previously deployed API version
must be reported as incomplete UAT, never as a pass.
