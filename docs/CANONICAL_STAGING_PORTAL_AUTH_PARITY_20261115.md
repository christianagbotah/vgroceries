# Canonical staging page protection and release parity — 15 November 2026

## Findings

The GitHub main source at ddb79c3 passed both GitHub workflows and has
the cashier onboarding authority. The original UAT API now runs that
release on localhost port 3027. The original UAT PostgreSQL database has
47 applied migrations and zero proposed SQL drift. Staff onboarding is
OFF in the original API service.

Crucially, the publicly accessible portal.varietygroceries.com host is
a DIFFERENT deployment track. Nginx sends /api/v1 requests to the POS
API on port 3049 and HTML to the canonical portal on port 3052.
The POS API runs an independent worktree, with some staff and POS
flags ON, against the same original UAT database. The portal includes
its own server-side login gate.

The POS worktree also has uncommitted files and features missing from
GitHub main, including support pages, password recovery, inventory
lots, SMS foundations and verified till/POS UAT views. Replacing ports
3049 or 3052 with main unconditionally could remove working
functionality or break account/session behavior.

**Do not cut over the public canonical portal in this slice.**

## Added to GitHub source

The Next 16 server-side proxy provides extra protection when
UAT_PORTAL_LOGIN_REQUIRED=1:

- /staff/cashier and descendants, and /staff/pos and descendants,
  require a real authenticated cashier role.
- /admin/team/verified and descendants require a real administrator.
- Storefront, customer accounts, sign-in and cashier invitation
  acceptance remain public at the HTML level. API permissions
  continue to enforce their own session/branch and CSRF rules.
- A valid HttpOnly session cookie is forwarded only to the trusted
  loopback API_BASE_URL endpoint /api/v1/auth/me. A positive response
  must include an actor ID and exact role.
- Missing/malformed cookies, incorrect roles, timeouts and malformed
  API responses fail closed. Unauthorized safe page navigation
  redirects to an internal staff login; unsafe requests return 401.
- No-cache headers protect authenticated responses. Sample/demo
  identities cannot pass this real server-side role gate.

## Rollout gates

Before changing canonical portal routing: reconcile both codebases
and the POS-specific pages, compare schema and flags, confirm media
and notification compatibility, rehearse a backup/rollback and test
physical cashier operations. All changes must preserve the public
Coming Soon site until the owner approves its launch.

A loopback-only standalone Next preview can exercise the new gate
without exposing its pages publicly. The new onboarding and POS
flags must remain OFF by default outside the existing explicitly
configured POS UAT service.
