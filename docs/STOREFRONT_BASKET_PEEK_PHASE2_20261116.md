# Variety Groceries — shopping basket peek (storefront phase 2)

Date: 16 November 2026
Status: source-only. No public release, no POS runtime change.

## Experience

The original "Market Atelier" homepage, genuine-media gallery and
add-to-cart product flight are now joined by a noninterruptive,
accessible **quick basket**.

- The normal cart icon still links directly to the full /cart page.
- Desktop header offers a separate "Quick view" button for a fast
  basket inspection. Mobile retains its existing bottom navigation.
- When a product finishes its cosmetic cart flight, a small deep-green
  "Added to your basket" confirmation appears above the mobile nav or
  at the desktop corner. It auto-dismisses after 4.5s and can be
  dismissed manually. Clicking the confirmation opens the drawer.
- A responsive right-side drawer shows the real local cart selections,
  actual saved item thumbnails, names, quantity and line estimates.
  New/remove line changes animate without disrupting scroll or focus;
  reduced-motion preferences disable the decorative movement.
- The drawer offers remove-one-item, full basket review, keep shopping
  and the existing checkout route. Removing an item changes only the
  same Zustand local cart data used by /cart.
- Empty state and long-basket state are supported. The basket list
  scrolls independently while the heading and estimate/footer remain
  visible. Touch targets are at least 36–48px.
- A single dock is mounted once in the storefront layout, not separately
  per product tile. It responds to existing cart-impact events and a
  separate user-triggered open-preview event.

## Data and authority

**No API call or backend mutation is introduced.** The preview is
explicitly labelled an estimate, based on local/browser saved line
snapshots. The service is still authoritative for price, discounts,
fees, stock/lot availability and actual checkout.

Prices are integer minor Ghana cedi amounts with visible ₵, comma
grouping and two decimal places. A strict snapshot-check utility
validates decimal quantities (max 3 decimal places), nonnegative
integer prices, safe numeric totals and corrupted local cart state;
when invalid it fails closed to "Review cart" rather than invent
a payable amount.

Any external image thumbnails come from the same saved cart snapshot
as existing product cards; unsafe/malformed URLs fall back to the
Variety mark. The drawer never exposes verification codes or
customer contact information. It does not claim stock is reserved,
charge money, create a receipt, bypass payment, run AI or log a
financial event.

## QA and release

Offline regression tests cover quantity math, fractional groceries,
overflow/invalid persisted prices, no server actions, one drawer in
storefront layout, original cart link preserved, appropriate labels,
motion/reduced-motion, accessibility hooks and event order.
The final local Bun frontend suite passed **310 tests, 0 failures**, and
targeted ESLint/whitespace checks passed. This suite includes an
additional first-paint regression: the CMS hero's headline and featured
photography must not begin at zero opacity awaiting JavaScript hydration.
An isolated loopback-only Next.js mock page returned HTTP 200, and a
1280×900 headless Chromium capture with JavaScript disabled confirmed
that the headline, grocery imagery and CTAs remain visible on first paint.
An isolated Chrome DevTools browser smoke also verified opening the drawer,
adding an exact selected Perfumed Local Rice 5 kg SKU, the normal cart
count incrementing from 1 to 2, the single line quantity becoming 2,
and the indicative subtotal updating from ₵120.00 to ₵240.00. It found
an overlapping legacy generic add-toast: the duplicate was removed
from product cards and the product detail add action, leaving one
accessible animated cart confirmation and correct singular/plural labels.
The clean GitHub CI/API
Foundation checks and production TypeScript are required before merge.

Before preview or live rollout, conduct real Android/iOS and desktop
browser QA for long lists, screen-reader focus, touch/swipe gestures,
reduced motion, zoom/large fonts and cart persistence. Do not silently
replace the public Coming Soon or the active POS integrated runtime.
The canonical/active POS source parity is still tracked in #108.
Hubtel status access remains tracked in #90.
