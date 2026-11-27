# Variety Groceries — product Quick Look, storefront phase 3

Date: 16 November 2026
Status: SOURCE-ONLY. Not deployed to varietygroceries.com.
Parent work: cinematic storefront PR #123; basket peek PR #125.

## Purpose

Give catalogue shoppers a beautiful, immediate "Quick look" path that does
not interrupt comparison of grocery items. On both mobile and desktop,
each genuine catalogue tile has a keyboard/touch-accessible Quick Look
button separate from the usual full product link and Add to Cart button.
The original tile purchase and product-detail routes stay available.

The dialog displays a large photo, thumbnail navigator, approved media
order, category, short description, the identical pack/stock/quantity
purchase panel as full product details, safety text and a link to the
complete product page. The gallery supports swipe, arrow keys, previous/
next controls, animation and reduced-motion preference. On narrow screens,
its content scrolls independently of a fixed bottom action bar; the
"View pack sizes" action moves the viewer to the existing purchase panel
instead of secretly adding an item. It respects reduced motion.

## Data provenance and correctness

The popup receives the *exact existing catalog product object* from the
real storefront data adapter (no independent fetch or mock override).
It calls assembleProductMedia to prefer the approved featured image,
deduplicate the approved ordered gallery, and fall back to the existing
catalogue image only if there is no approved media. It never invents
additional product angles. The fallback explicitly says "Catalogue
image" and tells users to check actual package appearance.

Variant and quantity selection is delegated to the original
ProductPurchasePanel; out-of-stock variants remain unavailable,
switching variants resets the quantity, and the **chosen variant ID**
is the one added to Zustand cart. The panel chooses its animation
thumbnail from the nearest open quick-look modal rather than a different
product hero on the same page. Successful cart addition completes
before the overlay closes and starts the existing cosmetic cart flight.

The Quick Look code is dynamically split from product-card initial
bundles and instantiated only after a shopper requests it; the modal
remains mounted after its first activation for stable Radix focus
restoration. No additional ecommerce backend API, customer data read,
cash/stock/payment mutation, receipt or order creation is introduced.

## Verification and release boundaries

- Eight new offline regressions verify real image provenance,
  no substitution of unavailable variants, lazy loading,
  accessibility hooks, cart authority and no financial mutation.
- Full frontend test suite, targeted lint and typecheck,
  and GitHub CI/API Foundation on the exact PR head are mandatory.
- Browser UAT is still needed on a controlled preview: keyboard
  focus return, Escape, narrow Android portrait, swipe with gallery,
  selected-size panel, item-to-cart flight, reduced motion and
  catalogue performance with many cards.
- The API still owns actual price, stock, discount, fee and payment
  verification. The cart is not an inventory hold.
- Public Coming Soon, active POS integrated ports 3049/3052,
  DNS/proxy, payments and stock data must **not** change with this PR.
  Canonical/live POS parity remains issue #108. Hubtel payment
  status authorization remains issue #90.

The product media team must approve real SKU front/back/pack images
before the public launch; placeholders cannot be marketed as exact
packaging. No external AI-generated products or visual claims.


## Completed local verification — source branch

- Bun frontend: **318 passed, 0 failed** across 53 files; targeted
  quick-look and existing checkout/cart regressions pass.
- Targeted ESLint/whitespace checks: pass; TypeScript noEmit passed
  before the final mobile scroll-footer layout change. GitHub CI
  typecheck is the required final compiler gate for that change.
- Local isolated Next.js mock server returned HTTP 200; headless
  Chromium desktop at 1280x900 opened the Quick Look for
  "Perfumed Local Rice", displayed the exact available 5 kg bag
  at ₵120.00, and successfully added one item to the existing cart.
  The overlay closed and the basket confirmation appeared.
- Mobile Chrome emulation at 390x844: Quick Look modal width 374,
  document width 390 (no horizontal page overflow), close button
  visible. After the mobile footer update, "View pack sizes" was
  visibly pinned at the bottom and moved the modal scroll to 574px,
  revealing the existing Add to Cart purchase controls.
- The isolated HTTP adapter timeout test had one flaky failure under
  concurrent dev-server/Chromium contention; after stopping *only*
  this branch's preview processes, its 24 tests passed, and the
  full 318-test suite passed again. The existing HTTP code and
  timeout thresholds were not altered.
- The temporary preview was bound to 127.0.0.1:4194 and the Chrome
  debug port 9235 only. Both are stopped; production POS services
  remained active.

These checks do not substitute for physical-device touch/a11y
acceptance or exact-SHA GitHub CI on the final amended branch.
