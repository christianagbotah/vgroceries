# Variety Groceries — cinematic storefront and receipt experience, Phase 1

Date: 16 November 2026
Release status: SOURCE-ONLY; public Coming Soon is unchanged.
Reference inspiration: MotionSites animated sections and product galleries.
The implementation is original, not a copied paid prompt or template.

## Visual language

"Market Atelier": deep tropical green (#073b2c), maize-gold (#f8cd78),
warm cream, soft produce greens, large editorial serif typography and
photographic grocery mosaics. Storefront editorial hero uses a layered
image composition and staggered entrance motion, while retaining all
published CMS copy and CTA destinations. Homepage category/shop/offer
sections and the actual inventory-backed catalogue remain intact.

Home hero, item gallery and cart motion use existing frontend Framer Motion
or browser-native Web Animations, with reduced-motion support. No autoplay
background videos, GPU-heavy shaders, external 3D engine or timer-driven
continuous rerendering were added.

## Shopping interactions delivered

- Cards still display the approved Product Media Studio featured photo
  before legacy fallback. Variant selection always checks exact selected
  stock/price; it never substitutes another SKU.
- Add-to-cart mutates the existing Zustand cart immediately, then starts
  a cosmetic 650ms flying product thumbnail to the visible cart target.
  Both desktop header and mobile bottom nav have a bouncing, updating
  cart indicator. Failure/no Web Animations or reduced-motion preference
  skips the flight without losing the cart action.
- Product detail image gallery de-duplicates approved media, transitions
  between images, offers swipe, keyboard left/right, previous/next buttons,
  horizontal snap thumbnails, image index and accessible enlarged modal.
  Single-image SKU stays single-image; synthetic product angles are
  never fabricated.
- Detail purchase panel puts the approved featured image (not a different
  legacy source) in the cart snapshot, retaining exact variant quantity.

## Receipt and QR experience delivered

The customer order detail page and the checkout-status page now open a
receipt preview. The paper unfurls from a green print-roll header, with
a reduced-motion fallback and a perforated-look bottom edge.

Buttons provide:
1. **Print / Save as PDF:** prints a script-free, sanitized standalone
   80mm receipt document via a same-origin iframe. The browser's own
   print destination can save as PDF.
2. **Download full receipt:** offline sanitized HTML with real order lines,
   totals, state and details, no phone or verification code.
3. **Download text:** accessible plain-text record.
4. **Download QR image:** local qrcode library generates a PNG for
   /account/orders/<id> on the same site. The scanned route requires
   the ordinary customer account authentication and is **not**
   a pickup/collection authorization or payment verification token.

Payment wording is based only on the server-provided verified order state.
Pending/failed/review orders offer an **order summary** labelled NOT PROOF
OF PAYMENT; succeeded orders offer a purchase receipt; partial refunds
are displayed explicitly; fully refunded orders are marked refunded.
Printed/exported records say **Not a tax invoice**. This frontend cannot
verify payments, debit wallets, issue Ghana Revenue Authority invoices,
settle refunds, complete stock handovers or fabricate an online order.

The QR generation library is pinned to qrcode 1.5.4, with matching
@types/qrcode 1.5.6 as a development dependency. It is used on-demand only
while the preview opens; no third-party QR API receives order data.

## Acceptance checks

- Offline security/UI source regressions: image approval priority and
  de-duplication, fallbacks, masked/real data behavior, cart-before-motion,
  reduced motion and accessibility affordances, receipt HTML escaping,
  pending/refunded status accuracy and private QR link validation.
- Full local Bun frontend suite: 295 passed, 0 failed.
- Targeted lint and git whitespace checks: passed.
- TypeScript compile and clean GitHub CI plus API Foundation still required
  on final PR SHA before merge or release.
- Real browser UAT still required: desktop/mobile touch gestures, animation
  stability, custom CMS copy, screen readers, Safari/Android print flow,
  real QR scan after authenticated sign-in and slow/offline network states.

## Go-live safeguards / images

Do not switch current POS integrated 3049/3052 services or the public
varietygroceries.com Coming Soon page. Canonical main and active POS UI
still differ; tracked in issue #108. Hubtel status authorization remains
unverified (last observed HTTP 403, issue #90).

Existing seed/example product photos may be representative catalogue images.
Before public launch, use the Product Media Studio approval workflow to
upload actual high-resolution photos of each physical SKU/pack, including
front, back/ingredients, size and multiple real angles. Do not imply that
an Unsplash placeholder proves a particular packaged product. Prefer
separate AVIF/WebP images, true alt descriptions and correct pack details.

Future distinct PRs can add a mobile mini-cart with line-item transitions,
customer reorder experiences, POS-print receipt motion, progressive
image loading and controlled storefront preview infrastructure. None
is claimed implemented by this phase.
