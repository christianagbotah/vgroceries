# Canonical POS-integrated portal UI corrections — 15 November 2026

This branch starts from the POS-integrated UAT baseline
`feat/role-voice-staging-20261113` (`dc198b0`), **not** the older
`main`-based portal that listens on 3037. The canonical external host
`https://portal.varietygroceries.com` is proxied by Nginx to portal port
**3051** and API port **3049**. The original manually managed port-3051
service must be retained for rollback while the candidate is tested.

## Nonfinancial UI changes

- Show an advisory alert when a server-owned booked collection window ends.
  Only an explicit server-confirmed action can cancel/rebook the appointment.
  A missed window never implies physical handover, refund, stock release,
  payment failure or a staff-confirmed no-show.
- Remove invented five-star demo endorsements on public product cards.
- Increase the SKU selector, its menu options and cart action to 44px or
  more for touch accessibility.
- Preserve the POS-integrated live SKU/stock checks. A selected unavailable
  variant must never silently switch to a different pack or price. An
  authoritative `byVariants` server fetch remains required before add to cart.

## Test gates

`bun test scripts/pickup-elapsed-window-regressions.test.ts scripts/canonical-pos-portal-ux-regressions.test.ts`

CI and isolated production build must pass before deployment. Candidate must
pass /, /shop, /categories and /help on a *free* loopback port, and external
/shop must render no invented star previews once routed. The existing
Nginx /api/v1 proxy to port **3049** is never changed by this frontend
release. Public `varietygroceries.com` remains Coming Soon. Hubtel payment
status authorization, customer SMS automation and all money/stock flags remain
unchanged and gated.

This branch does **not** merge unrelated dirty/untracked files currently
present in the POS-integrated live workspace; those are preserved separately.


## Verified canonical UAT release — 15 November 2026

**Deploy completed** to `https://portal.varietygroceries.com`, without
changing the public Coming Soon domain or the API backend. A clean branch
snapshot `c2e340a` was built with Bun/Next.js 16 and validated with
nine targeted regression tests. Next.js production compilation and TypeScript
checks passed.

- Canonical UAT portal release:
  `/home/lightworld/releases/varietygroceries-portal-c2e340a-pos-canonical-20261115`
- New durable systemd service:
  `varietygroceries-portal-canonical.service` bound to **127.0.0.1:3052**
- Private protected runtime env:
  `/home/lightworld/config/varietygroceries/portal-canonical-3052.env`
  (mode 600, owned by lightworld). This preserves the existing server-side
  API target at 3049 and `UAT_PORTAL_LOGIN_REQUIRED=1`. Never include its
  contents in commits or log output.
- Canonical Nginx file:
  `/usr/local/apps/nginx/etc/conf.d/zzz-varietygroceries-portal.conf`
- Canonical `location /` proxy now uses **3052**, with unchanged
  `location /api/v1/` proxy **3049**.
- Original port-3051 portal process remains running as the immediate
  rollback option. Legacy port 3037 is a different portal and must not be
  confused with the external site.

External checks returned HTTP 200 for `/`, `/shop`, `/categories`,
`/help`, `/staff/login`, `/api/v1/health/live`, and the public Coming
Soon home. The external shop and home returned **zero** synthetic
`Popular product preview` star blocks; the shop rendered 18 product
quick-add controls. Unauthenticated `/staff/pos` returned HTTP **307**
to the staff sign-in route.

Nginx on this Webuzo server is a SysV-generated systemd unit, **without
`systemctl reload nginx` support**. After `nginx -t` succeeds, reload the
correct process with:
`/usr/local/apps/nginx/sbin/nginx -c /usr/local/apps/nginx/etc/nginx.conf -s reload`.
Do not reload the unrelated `/usr/local/emps` Nginx.

Rollback procedure (requires root / service operator):

1. Restore Nginx's portal `location /` proxy from **3052** to **3051**,
   leaving `/api/v1/` at **3049**.
2. Run `/usr/local/apps/nginx/sbin/nginx -t -c /usr/local/apps/nginx/etc/nginx.conf`.
3. Reload via `/usr/local/apps/nginx/sbin/nginx -c /usr/local/apps/nginx/etc/nginx.conf -s reload`.
4. Verify external `/shop`, `/staff/login`, API health and the public
   Coming Soon domain. Retain old server/release until acceptance.

A configuration backup was preserved securely in
`/root/varietygroceries-proxy-backups/`. Neither payment activation nor
SMS dispatch was modified in this release. The separate Hubtel
Transaction Status HTTP 403 / IP allowlisting issue remains open.
