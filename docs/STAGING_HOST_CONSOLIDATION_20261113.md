# Variety Groceries — canonical original staging portal (corrected 13 November 2026)

## Domain ownership — only one staging portal

| Hostname | Correct purpose |
| --- | --- |
| **https://portal.varietygroceries.com** | **The ONE canonical staging/UAT portal** for customer storefront, administration, inventory, POS, logistics, customer AI and all role testing |
| **https://varietygroceries.com** | **Production domain**; must retain the Coming Soon landing page pending formal launch approval |
| https://staging-portal.varietygroceries.com | Unneeded extra hostname, now HTTP 302 redirected to the canonical portal |
| https://pos-uat.varietygroceries.com | Unneeded earlier POS-UAT hostname, now HTTP 302 redirected to the canonical portal |
| staging.portal.varietygroceries.com | Disused nested hostname; not used or relied on; HTTPS was unsupported by the previous Cloudflare certificate |

All staging screens are **paths under the original portal**, not independently deployed domains: `/` storefront, `/uat` private testing hub, `/shop`, `/staff/login`, `/staff/pos`, `/admin`, `/admin/support`, `/assistant`, `/support` and `/api/v1`.

## Single authoritative staging data

- The original staging database is **lightworld_variety_uat** on the VPS's PostgreSQL port 5432, **not** the separate synthetic `variety_pos_staging` database.
- Before consolidation: 32 products, 32 variants, 1 existing customer, 1 branch and 0 orders in the original UAT database.
- A custom-format snapshot was saved (restricted mode 600) at `/home/lightworld/backups/varietygroceries-stage-consolidation/portal-uat-before-consolidation-20261113.dump`.
- A full database **clone** was restored at a temporary local port and all ten pending migrations were successfully run and verified against the restored copy first.
- The same ten additive migrations were then applied to the **original UAT** database; Prisma confirmed that all 43 migrations are up to date, and its original data counts remained unchanged.
- The updated staging API is the new code on 127.0.0.1:3049 using `/home/lightworld/config/varietygroceries/consolidated-staging-api.env` with the **original** database and `loc_accra` stock branch.
- The updated staging frontend is on 127.0.0.1:3051 with `NEXT_PUBLIC_API_BASE_URL=https://portal.varietygroceries.com/api/v1`; server-side base remains 127.0.0.1:3049.
- The obsolete separate POS dataset is not connected to the canonical portal and may be retired once no longer needed for rollback.

## Routing, privacy and rollback

- Nginx entry point: `/usr/local/apps/nginx/etc/conf.d/zzz-varietygroceries-portal.conf` with HTTPS and a private HTTP Basic perimeter (the same credential file already used for earlier private POS-UAT).
- The application still requires its **own real authenticated staff sessions and CSRF protection** for protected operations; the Basic perimeter is a separate extra boundary.
- Approved media URLs under `/media/products/` retain the original staging media alias; private media paths remain non-public.
- Current web and API systemd services are `vg-pos-staging-web` and `vg-pos-staging-api`; the previous portal/API services at local ports 3037/3027 remain available only as rollback references, no longer routed through the canonical hostname.
- Portal Nginx backup: `zzz-varietygroceries-portal.conf.before-canonical-20261113` alongside the active Nginx configuration. Both extra-host configurations were backed up before changing their redirects.
- Original portal/API environment files were preserved. Updated staging configuration remains private and outside Git.
- The **production** landing page `varietygroceries.com` was never reconfigured and was verified to still show Coming Soon after cutover.

## Validation evidence

- Updated Next.js production-mode build passed TypeScript and generated all 60 routes.
- Staging API live and ready endpoints returned HTTP 200 using the original UAT database; public catalogue returned 31 currently sellable goods from the original 32 products.
- Internal staging frontend `/`, `/shop`, `/uat`, `/assistant`, `/support`, `/staff/login`, `/staff/pos` and `/admin/support` all returned HTTP 200.
- Canonical public HTTPS has a valid Cloudflare edge certificate and returns HTTP 401 until the separate private UAT access gate is satisfied; staging is not anonymously accessible.
- Real authenticated browser check at 375px passed administrator login, verified real staff listing, and mobile-width layout without overflow.
- The original UAT database had no admin before merge; a synthetic staging administrator was added securely with the previously established private UAT credentials and granted its existing branch. The preexisting customer was retained.
- Full synthetic invitation UAT passed on canonical portal: issue hashed invitation, accept/activate, cashier login, branch-scoped access, reject cashier on admin-only page, suspend synthetic test cashier, and verify no active synthetic invitation accounts remain.
- `staging-portal` and `pos-uat` resolve by 302 to `https://portal.varietygroceries.com`; production website confirmed Coming Soon.

## Remaining separate work

Full production-grade roles (finance reviewer/operations manager/picker/dispatcher), live rider tracking/contact, shipping providers, payments and accounting parity, larger-volume browser UAT, non-demo production readiness, data privacy and launch approval are **not** implied by this staging consolidation. Keep staging private, and never deploy the customer storefront to the production root without explicit launch approval.
