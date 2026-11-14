# Variety Groceries — canonical staging native login (14 November 2026)

> **Historical deployment checkpoint, superseded later on 14 November 2026.**
> The earlier whole-site staging login restriction described below is no longer active.
> Customers now browse the homepage, products, cart and checkout without signing in.
> The branded login offers one-click, password-free **sample role previews** while real
> operations still require their own password and backend permission.
> Current behavior and verification: [Public shopping & one-click demos](PUBLIC_SHOPPING_AND_ONE_CLICK_DEMO_ROLES_20261114.md).

## Owner requirement

The staging portal must no longer display a browser-managed HTTP Basic username/password challenge. Visiting `https://portal.varietygroceries.com` should instead open the genuine branded Variety Groceries account login. Each UAT account must supply its own application password and be restricted by the actual backend permissions.

## Root cause

The original staging consolidation had explicitly configured Nginx `auth_basic` and an `.htpasswd` file on the entire canonical portal. This caused a browser modal *before* Next.js loaded, creating two separate password layers.

## Verified solution

- Removed the Nginx Basic gate **only on the canonical staging host** `portal.varietygroceries.com`. The old protected config remains in `zzz-varietygroceries-portal.conf.before-native-uat-login-20261114` for rollback. Production `https://varietygroceries.com` remains a separate Coming Soon site.
- Retained HTTPS, `noindex,nofollow,noarchive`, `Cache-Control: no-store`, and the existing reverse proxy to the same original staging database/API. Old `staging-portal` and `pos-uat` aliases still 302-redirect to the one canonical hostname.
- Added a private-staging-only Next.js 16 `src/proxy.ts` entrance that checks a real, non-expired `vg_session` through the trusted local API `GET /api/v1/auth/me`. It redirects anonymous HTML navigation to `/staff/login` and fails closed on broken/invalid sessions. This is a site-access filter, **not** a replacement for server-side identity, resource and role authorization.
- The staging Nginx API location rewrites the existing `HttpOnly` session cookie `Path=/api/v1` to `Path=/`, so the server-side Next proxy receives that cookie on page navigation. Login/logout and CSRF continue using the real backend. Existing `Secure`, `SameSite=Lax`, session expiry and revocation remain in force.
- Public entry pages `/staff/login`, `/staff/activate`, `/account/login`, `/account/signup` and `/rider/login` remain accessible without a session; static page assets remain accessible so the branded login renders. Backend public commerce endpoints are **not** changed by this page filter and retain their own established public/role boundaries.
- The login UI offers a selectable **Staging Administrator** synthetic test profile, pre-filling only the synthetic UAT email, never the password. The `Another authorised account` option permits other real staff members to type their account's email. Do **not** expose the private real user/customer directory to unauthenticated visitors. To add synthetic UAT test cards, update the server-only `UAT_ACCOUNT_CHOOSER_JSON` configuration with approved `@example.invalid` or `@example.test` identities.
- Turned off live staging's old `UAT_DEMO_LOGIN` passwordless fictional-role shortcut; remaining role demos cannot bypass real login. The login API already enforces throttling per identity and IP.
- Authorised actors continue to be directed to actual administrator, inventory officer, cashier, rider or customer app areas as appropriate; the API remains authoritative for role and branch restrictions.

## Validation

- Optimized Next.js build and TypeScript passed, with `Proxy (Middleware)` included in the route inventory. Frontend targeted lint passed.
- Pre-cutover direct staging upstream smoke passed: `/`, `/admin`, `/shop` returned 307 to the application login, while `/staff/login`, `/staff/activate`, `/account/login`, `/rider/login` returned HTTP 200.
- Nginx syntax validation passed and reload succeeded; canonical portal Basic directives are absent. The final `GET /` is HTTP 307 to `/staff/login`, `GET /staff/login` is HTTP 200, and `WWW-Authenticate` is absent.
- Branded synthetic account chooser rendered on the live canonical login page. Live HTTPS 375px browser UAT completed real administrator password login, protected `/admin/team`, `/admin/inventory/adjustments` and `/shop` navigation, followed by sign-out and verified redirect to the login page. No Basic credential header was sent.
- Canonical staging API health remained 200; production root still had title `Variety Groceries — Coming Soon`.
- Original staging database, user passwords, orders, stock quantities, and external merchant/provider configuration were not modified.

## Operational notes and limitations

- A user must enter the real *application* password for their account; the retired browser perimeter password is not the same credential.
- Only the designated synthetic test profile is shown before authentication. The full staff roster belongs in the authenticated administrator Team & Access page; it must not be exposed in the public login chooser.
- Customer/guest flow testing and public commerce API spam/rate protections are separate hardening tasks; pre-launch private staging navigation requires a session but existing backend intentionally public API endpoints retain their own policies.
- When a real customer-facing production launch is approved, **do not** copy this private staging navigation gate onto the public production storefront.
- Rollback: restore the saved Nginx vhost config, run `nginx -t`, reload; restore the private frontend env backup `.env.production.local.before-uat-branded-login-20261114` and rebuild/restart staging web. No production Nginx config was changed.
