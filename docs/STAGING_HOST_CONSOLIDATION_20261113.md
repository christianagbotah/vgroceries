# Variety Groceries — single staging hostname (13 November 2026)

## Canonical URLs

- **Canonical single staging portal:** https://staging-portal.varietygroceries.com/
- **All-role private test centre:** https://staging-portal.varietygroceries.com/uat
- **Customer storefront:** https://staging-portal.varietygroceries.com/
- **Staff sign-in:** https://staging-portal.varietygroceries.com/staff/login
- **Authenticated POS:** https://staging-portal.varietygroceries.com/staff/pos
- **Back office:** https://staging-portal.varietygroceries.com/admin
- **Human support form:** https://staging-portal.varietygroceries.com/support
- **Shopping assistant:** https://staging-portal.varietygroceries.com/assistant
- **Same-origin API:** https://staging-portal.varietygroceries.com/api/v1/

There is **one staging application and one isolated staging PostgreSQL database**, not one staging per role or module. Screens are paths within this same hostname. The HTTP Basic perimeter is the same as the existing private POS-UAT environment, and real staff auth remains independent.

## Other hostnames

- `portal.varietygroceries.com`: the existing portal on separate live web and API services; untouched during staging consolidation.
- `pos-uat.varietygroceries.com`: older private UAT hostname; after verified cutover, redirect to the canonical staging hostname to prevent duplicate entry points.
- `staging.portal.varietygroceries.com`: **not** the canonical URL; nested-name TLS is unresolved and the hostname is unnecessary.

## Infrastructure

- Canonical staging TLS certificate: `/etc/letsencrypt/live/vg-staging-portal/fullchain.pem`; Let's Encrypt HTTP-01 webroot `/var/www/varietygroceries-staging-portal-acme`.
- Staging Nginx proxy: `/usr/local/apps/nginx/etc/conf.d/zzzz-varietygroceries-staging-portal.conf`; HTTP redirects to HTTPS, HTTPS uses a dedicated certificate and HTTP Basic, `/api/v1/` proxies to 127.0.0.1:3049, all other paths to 127.0.0.1:3051.
- Staging API `WEB_ORIGINS` includes the canonical staging origin. The staging frontend `NEXT_PUBLIC_API_BASE_URL` is compiled as the canonical same-origin `https://staging-portal.varietygroceries.com/api/v1`.
- Existing separate POS staging API/PostgreSQL service retained. No production database migration.
- Nginx and environment backups with suffix `single-staging-backup-20261113` or `backup-20261113-single-staging` are available on VPS for rollback.

## Acceptance criteria

1. Valid public TLS and private access challenge at `https://staging-portal.varietygroceries.com/`.
2. All critical staging routes render under the new hostname, with no old-host API references in the new frontend JS.
3. Browser requests use same-origin `/api/v1/`; API and web both work after login and maintain CSRF/session protections.
4. Public unauthenticated visitors see an HTTP Basic challenge; the staging API does not accept the Basic secret as an app authorization credential.
5. `portal.varietygroceries.com` retains its previous deployment.
6. The old `pos-uat` hostname redirects (after cutover verified) rather than acting as a separate portal.
7. No public production rollout without acceptance and user approval.

## Deployment verification (completed 13 November 2026)

- Public HTTPS valid for the canonical hostname; certificate expires 11 February 2027 with Certbot automatic renewal configured.
- HTTP Basic perimeter responds 401 until authorised; the old POS-UAT hostname returns 302 to the canonical staging hostname, preserving the requested path.
- Staging API CORS verified for the canonical hostname. Frontend rebuilt with new same-origin API URL, then only `vg-pos-staging-web` was restarted.
- Source optimized Next.js build passed, including TypeScript and 60 generated routes. Internal staging URL checks returned 200 for the storefront, UAT launchpad, shop, assistant, support, admin support, staff login, staff POS and admin POS.
- Real authenticated Chromium test on the canonical HTTPS hostname passed at 375px: administrator staff listing, synthetic cashier view, and cashier denial of administrative staff access.
- All four Variety Groceries web/API services remain active; previous `portal.varietygroceries.com` root returned HTTP 200 after migration. Its deployment and production database were not modified.
- The legacy POS-UAT Nginx configuration is backed up at `zzz-varietygroceries-pos-uat.conf.backup-single-stage-20261113`. The canonical staging Nginx HTTP config backup and both staging environment file backups are retained separately.
- This is a staging domain consolidation only, **not** final owner-led acceptance or authorization to launch the main storefront.
