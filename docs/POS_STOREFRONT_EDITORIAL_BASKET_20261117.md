# POS-integrated storefront editorial homepage & quick basket

Date: 17 November 2026
Branch: feat/pos-integrated-editorial-basket-20261117
Source: current active POS-integrated portal commit b7b7962; selective visual port
from canonical storefront 24084b9, not a replacement of the portal or API.

## Implemented source changes

- Replaces only the existing hero in the POS portal home with the accessible
  editorial grocery hero from canonical source. Existing categories, product
  cards, customer flows, cashier and administrator pages are preserved.
- Adds a separate quick-basket button without changing the /cart link.
- Shows one dock in the existing storefront layout after the role/demo notice,
  cart and the voice concierge. Uses local cart snapshots only, not stock/payment
  authority. Always shows an estimate, not a confirmed payable quote.
- Uses the existing accepted cart-flight event and suppresses duplicate success
  toasts in POS product and product-detail cards. Stock/verification failure
  feedback remains visible.
- Keeps the active official metallic-gold VG logo and its existing appearances.

## Release boundary

Do not replace the public coming-soon landing page. Portal 3052 uses its own
POS-integrated API 3049. The legacy 3037/3027 rollout is explicitly forbidden
without prior source/data/role parity sign-off. Build, tests, mobile browser UAT
and immutable release/rollback evidence are required before changing 3052.
Do not update payment credentials, operate payment callbacks, apply migrations
or activate operational feature flags for this visual change.

## Verified portal UAT rollout — 17 November 2026

**Actual portal build deployed:** `2323916` (immutable source code commit).
**Release directory:**
`/home/lightworld/releases/varietygroceries-portal-editorial-basket-2323916-20261117`.
**Systemd unit:** `varietygroceries-portal-canonical.service`.
**Override:** `80-storefront-editorial-basket-20261117.conf`, changing only the
working directory to the reviewed immutable portal artifact. Runtime 3052 and
the existing POS-integrated API 3049 remain paired. No backend service, schema,
checkout authority, payment secret or feature flag was changed.

**Checks run and passed:**

- Frozen-lockfile installation, independent TypeScript typecheck and targeted
  ESLint, with no diagnostics.
- Next.js 16.1.3 production build: success; 63 static pages generated; all
  expected POS, admin, shop and customer routes retained.
- Focused quick-basket Bun regressions: 9 passed, 0 failed, 63 expectations.
- Pre-cutover isolated Node canary returned HTTP 200 on `/`, `/shop`,
  `/cart`, `/checkout`, `/staff/login`, `/admin/pos`. New editorial
  hero, quick-view trigger and official VG brand were present.
- Post-cutover portal 3052 passed the same route checks; public HTTPS
  `portal.varietygroceries.com` returned HTTP 200 with the new hero/quick
  view. Public `varietygroceries.com` retained Coming Soon.
- Chromium 156 desktop browser: empty-basket drawer opened; a disposable,
  client-local two-unit simulated basket displayed the exact ₵20.00 subtotal,
  the `INDICATIVE SUBTOTAL` warning and the correct line. This did **not**
  initiate checkout, payment, stock reservation or a real customer sale.
- Chromium 390 px mobile viewport: editorial hero and cart link present,
  document scroll width 390 px (no horizontal overflow).
- The previous portal release remains intact and can be restored with
  the existing 70-customer-receipt override; no canary process remains.

**Rollback:** remove only
`/etc/systemd/system/varietygroceries-portal-canonical.service.d/80-storefront-editorial-basket-20261117.conf`,
run `systemctl daemon-reload`, then restart only
`varietygroceries-portal-canonical.service`. Its preceding override restores
`/home/lightworld/releases/varietygroceries-portal-order-receipt-b7b7962-20261117`.
This preserves the current POS API and public site.

**Remaining QA:** owner/device-level Android and iOS checks, keyboard/screen
reader review, long baskets, real catalogued items, cashier role sessions and
checkout flow. These browser checks do not constitute real payment/provider UAT
or permission to replace the public Coming Soon site.
