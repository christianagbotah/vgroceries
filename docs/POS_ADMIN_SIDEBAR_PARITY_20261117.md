# POS-integrated admin sidebar: narrow, collapsible and searchable

Date: 17 November 2026.

This change ports the tested accessible search and compact navigation UX from
the canonical admin sidebar onto the deployed **POS-integrated** source
`2323916` / documentation revision `7bdb965`.

## Preserved POS-specific features

- Staff-only **Support inbox** `/admin/support`, retaining the existing
  `team.manage` sidebar visibility gate. This is a UI filter only:
  backend/API authorization remains authoritative.
- The official metallic gold VG mark in collapsed navigation and the full
  white-backed VG lockup when expanded.
- Existing staff session, demo-mode controls, sign out, full staff routes,
  POS cashier and inventory functionality.
- Product hero, quick-basket and voice-concierge storefront enhancements
  deployed immediately before this sidebar work.

## Layout and behavior

- Desktop width **224 px** expanded, **64 px** collapsed. Last chosen
  collapse preference persists in localStorage when available.
- One compact/expand control stays pinned beneath the independently
  scrollable navigation column.
- Expanded desktop and mobile drawer have case/whitespace-insensitive page
  search (page label, category, route), filtering by the permitted role
  before matching. Search clears on navigation, on Escape or via button.
- Compact icon links remain available with accessible names, tooltip titles
  and correct active page indicator. Search is intentionally hidden while
  compact. Mobile drawer stays within the viewport.

## Safety and rollout

Source change only until verified release: portal `3052` continues to use
POS-integrated API `3049`. Do not use the legacy rollout into `3037/3027`,
rewrite inventory/payment/return records, change provider credentials, update
schema/migrations or replace the public Coming Soon site.

Run `bun test scripts/admin-nav-search.test.ts
scripts/pos-admin-sidebar-parity.test.ts`, ESLint, full TypeScript and
Next.js production build; verify desktop/sidebar toggle and mobile navigation
in a browser, and have an immutable, reversible portal-only release. Do not
infer a live deployment from a GitHub commit.

## Compatibility lint correction

The integrated POS baseline includes maintained `.cjs` operations and
test fixtures that intentionally use CommonJS `require()`. Full ESLint was
failing on those unchanged scripts. The flat ESLint configuration now
disables only `@typescript-eslint/no-require-imports` for `**/*.cjs`,
without changing the rule for TypeScript or ECMAScript modules. This is a
configuration compatibility correction, not an authorization or runtime
behavior change.

## Actual portal deployment and verification — 17 November 2026

**Immutable deployed source commit:** `0a6502050b37939a3b096464ba8dacb5562c7192`.
**Release:** `/home/lightworld/releases/varietygroceries-portal-admin-sidebar-0a65020-20261117`.
**Portal unit:** `varietygroceries-portal-canonical.service` (port `3052`).
**New systemd override:** `90-admin-sidebar-20261117.conf` changes only
`WorkingDirectory`. Existing API port `3049` and configuration remain
unchanged. No schema migrations, payment operations, stock changes or new
providers were activated.

**Completed checks:**
- Frozen Bun dependencies installed; 10 focused tests passed (30 expectations).
- Repository-wide ESLint: **0 errors** (one pre-existing password-recovery
  warning); TypeScript check passed.
- Next.js 16.1.3 production build passed, **63 static pages** generated;
  customer, admin, cashier, POS, support, inventory and stock routes retained.
- Pre-release canary: HTTP 200 on `/`, `/shop`, `/cart`, `/checkout`,
  `/staff/login`, `/staff/demo/owner_admin`, `/admin/pos`.
- Isolated Chromium demo-role UI test: expanded desktop measured **224 px**,
  search `support` showed only permitted `/admin/support`, collapsed
  width **64 px** with accessible icon label and official mark, preference
  persisted across reload; mobile drawer at 390 px viewport measured **256 px**
  and retained search/support visibility.
- After the portal-only restart: HTTP 200 on the shop, cart, checkout, staff
  login and POS routes; public `portal.varietygroceries.com` returned HTTPS
  HTTP 200; previous storefront quick view remained present; the public
  `varietygroceries.com` Coming Soon page remained in place.

**Rollback, if a defect is found:** remove only
`/etc/systemd/system/varietygroceries-portal-canonical.service.d/90-admin-sidebar-20261117.conf`,
then `systemctl daemon-reload` and
`systemctl restart varietygroceries-portal-canonical.service`.
The previous `80-storefront-editorial-basket-20261117.conf` override will
select `/home/lightworld/releases/varietygroceries-portal-editorial-basket-2323916-20261117`.
Do not roll back to the legacy 3037/3027 canonical portal.

**Remaining limitations:** Real-user browser/assistive-tech UAT and staff-role
operations still need owner acceptance. These demo-role checks do not prove
server-side permission enforcement or live payment/cashier/stock acceptance.
