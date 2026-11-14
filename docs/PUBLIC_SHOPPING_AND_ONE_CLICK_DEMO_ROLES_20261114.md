# Variety Groceries — guest browsing and one-click role previews

**Canonical staging portal:** https://portal.varietygroceries.com
**Public production:** https://varietygroceries.com — still Coming Soon, untouched.

## Owner's UX correction

A shopper should **not** have to log in to browse the homepage, category pages, product details, the cart or the checkout entry screen. Checkout is where the shopper chooses **Continue as guest**, **Sign in**, or **Create account**. Guest checkout collects the customer's contact name, Ghana phone number and necessary delivery/collection details; a registered account is optional. Money and order operations remain subject to the existing real payment/stock/order policies.

Role preview access is different: the project owner needs to click a named demo profile (System Administrator, Accountant, Cashier, Customer and operational staff) and explore the sample user experience **without a password**. These role demos must not grant access to real UAT inventory, payments, customers, or identities.

## Implementation

- Updated Next.js `src/proxy.ts` to allow anonymous navigation to `/`, `/shop`, category/product pages, `/cart`, `/checkout`, customer sign-in/up and related public shopping screens. It retains a real-session check on the **live cashier terminal** HTML routes `/staff/cashier` and `/staff/pos`.
- The browser's HTTP Basic gate remains removed at the canonical staging Nginx host. Old duplicate UAT hostnames redirect to the one canonical portal.
- The `/admin` HTML shell remains guarded by the frontend's actual `AdminAuthGate` for unauthenticated real users. Real backend `AccessGuard`, role and branch checks still protect every privileged API resource. No demo marker is accepted as a real NestJS session.
- Enabled `UAT_DEMO_LOGIN=1` **only in the private staging frontend environment**, activating the isolated sample API at `/api/mock/v1`. Mock operations are served by a separate in-memory engine, not the original PostgreSQL stock/checkout/payment services.
- Added native browser-link entry cards to `/staff/login` for **System Administrator, Cashier, Accountant / Finance, Customer, Operations Manager, Inventory Officer, Picker / Packer, Dispatcher**. Each card navigates to `/staff/demo/{role}`, a staging-only server-allowlisted route. The client activation then establishes a sample session in that browser tab and navigates to the corresponding demo screen. No real credentials or backend sessions are created.
- Active demo staff roles use the existing role-aware admin shell and mock data adapter. Tested sample destinations: `/admin`, `/admin/pos`, `/admin/payments`, `/admin/fulfilment`, `/admin/inventory`, and `/admin/dispatch`.
- Sample Customer uses an explicit demo-only client flag, mock `auth.me`, and mock customer account data, with a permanent sample-data warning. The customer demo flag is cleared and the page refreshed when navigating outside the sample account to real shopping, ensuring original live product IDs and simulated catalog IDs are never mixed.
- The mock API browser adapter uses `credentials: "omit"`, so it never forwards a genuine HttpOnly session cookie to the demo engine. The mock account response is not a real authentication token and cannot authorize any `/api/v1` resource.
- Real staff and customer login remain password-protected; real staff can access backend workflows only through their own granted role. Existing login throttling and CSRF/session protections are unchanged.
- The existing checkout choice screen already offers guest, sign-in and create-account paths when a cart contains items. No order is submitted without sufficient contact/delivery details.

## Verification and boundaries

- Anonymous canonical HTTPS `/`, `/shop`, `/categories`, `/cart`, `/checkout`, `/account/login` and `/account/signup` return HTTP 200 without a Basic browser challenge or login redirect.
- The real cashier terminal page remains gated, redirecting unauthenticated requests to the branded staff login.
- Anonymous `GET /api/v1/inventory/overview` returns HTTP 401 even though the HTML back-office shell can render pending client-side authorization.
- The role chooser renders all eight sample destinations and declines invalid `/staff/demo/{role}` values with 404.
- A mobile Chromium browser completed anonymous homepage/shop/cart/checkout navigation and one-click preview entries for all seven staff roles plus Customer, verifying real inventory API denial in each staff demo.
- The ordinary staging login form still accepts real staff credentials, while the demo entry cards require no passwords. The full real staff/customer directory is not publicly exposed.
- The role demos are **UI/flow previews**, not proof that unfinished live operational roles have full backend RBAC. Live payment provider, procurement and dispatch readiness remain separate acceptance gates.
- Production `varietygroceries.com` continues showing Coming Soon.

## Remaining UX and testing work

- **Verified in real 375px Chromium:** anonymous homepage/shop, adding an actually available grocery product to local cart, navigating to checkout and seeing all three options; selecting **Continue as guest** rendered **Full name**, **Phone (Ghana)** and **Email (optional)** without requiring a registered account. No live order was placed during this test.
- **Verified in real 375px Chromium:** one-click Customer opened a sample account with recent orders; navigating to the shop automatically cleared the sample role, reloaded the real catalogue, and left no customer/staff demo session flag active.
- **Verified in real 375px Chromium:** all seven staff previews navigated to their intended mock dashboard/workflow; anonymous inventory API remained HTTP 401 in every staff preview.
- **Verified backend separation:** unauthenticated demo `/api/mock/v1/auth/me` returns HTTP 404, while an explicitly tagged preview returns only a sample Customer actor without a live session or CSRF token. The real API rejects that preview as unauthenticated.
- **Verified build:** final optimized Next.js build and TypeScript passed (including `/staff/demo/[role]`), with targeted ESLint passing for all modified files.
- Continue real backend operational permissions, supplier PO matching, audited stocktakes, Hubtel provider verification, refunds, delivery and accounting. Do not disguise mock previews as real transactions.

## Rollback

The code is committed to the existing draft PR. Runtime staging frontend-only flags are in the private `.env.production.local`, backed up before the role demo switch at `.env.production.local.before-public-shop-role-demos-20261114`. Do not expose or commit environment files or actual account credentials. No production Nginx or database migration is part of this change.
