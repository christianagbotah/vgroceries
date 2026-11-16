# POS-integrated portal — guest checkout CSRF hotfix release gate

Date: 16 November 2026
Base: dc198b0, POS-integrated branch, NOT canonical main.
Canonical reviewed fix: PR #128 (merged).
Active portal: portal.varietygroceries.com port 3052, API port 3049.
Status: SOURCE-ONLY, NOT DEPLOYED.

## Implementation

The helper, exact-token cookie fallback and one-time pre-commit 403 retry
have been surgically forward-ported from canonical PR #128 to the isolated
POS-integrated source branch. Only browser adapter, typed client and the
new helper/test are modified. Live POS source has 24 pre-existing WIP paths
that are not touched or reset.

## Local verification

- Guest CSRF and checkout auth-choice tests: 11 PASS, 0 FAIL.
- Targeted ESLint and git diff check: PASS.
- Legacy integrated full suite: 266 PASS / 4 FAIL out of 270. Two
  failures are stale staff-demo selector wording/tests; two are cache
  tests under suite concurrency. The six cache tests pass when run alone.
  This branch does not claim a green full suite or production build.
- Existing deployed route manifest: 87 total, including two generated
  Next.js error routes; isolated source has all matching 85 application
  routes and no additional unexpected page/route.
- A read-only live API checkout quote request returned NOT_FOUND for a
  test variant, and Set-Cookie names vg_guest plus vg_guest_csrf
  (values redacted). No payment, order or stock mutation performed.
- VPS 4-CPU load exceeded 18 (later >20), swap was 3GB/3GB.
  Attempts at clean isolated production compilation were stopped
  after large compile stalls/tooling symlink errors. No runnable
  release artifact was created. Temporary copied dependencies and
  compile outputs were safely removed.

## No-go gate / safe release path

Do not claim portal checkout is fixed until a clean compiled release
exists and passes isolated port smoke, route parity, actual browser
cookie/CSRF handshake test, and operator-controlled rollback drill.
Build when VPS resources permit (or on another authorized machine),
then deploy only this tested POS-integrated release; never switch
portal to canonical old 3037/3027 track or publish Coming Soon.

Current running portal service and 3049 API remained ACTIVE throughout.
Original release folder is intact. No changes to systemd, Nginx,
Cloudflare, DB, payment gateway or stock. No full-suite or UAT
authorization is implied by this narrow hotfix branch.
