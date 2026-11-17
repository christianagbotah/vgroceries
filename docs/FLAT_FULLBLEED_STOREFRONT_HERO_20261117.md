# Variety Groceries — compact full-bleed storefront hero

Requested: flatten the too-tall two-column hero; an entire slide must fit
without scrolling on a typical laptop screen. Show the image across the full
banner, leave the right photo clear, deepen the gradient behind readable left
copy, keep product titles and smaller "From" prices inline where space allows,
and continue autoplay on mouse hover. Only a deliberate pause click stops
playback.

## Implementation
- One image fills the complete slider (`fill`, `object-cover`, `sizes=100vw`)
  with fading photo transitions. No separate photo column or large photo card.
- Desktop overlay: dark green 97%-91% over the left 23%, fading to 8%
  at the right edge; phone overlay is darkest at the bottom and lightens
  toward the visible image at the top.
- Laptop: banner height `clamp(350px,43vh,430px)` INCLUDING controls; 370 px
  at small tablet size, 410 px at 360px+ phone width, 440 px on 320px.
  Previous desktop hero exceeded 620px plus the site header.
- Text sizes reduced, especially product titles (`max 2.75rem`) and their
  "From" price labels (78% of the title size). Product title and price are
  inline, so e.g. “Perfumed Local Rice From ₵…” can share the same line
  on a laptop where the labels fit. They can wrap on narrow phones.
- Description capped at two lines and CTAs remain a two-column mobile row.
- Controls float *over* the bottom of the image and don't increase height.
- Autoplay continues during pointer hover and keyboard focus, still respecting
  browser-tab visibility and OS reduced-motion preferences. The pause/play
  icon exclusively controls voluntary playback.
- Existing official VG branding, cart, search, chat dock, backend, inventory
  and payment settings unchanged.

## Release gate
Run focused Bun tests, targeted ESLint, full TypeScript and production Next
build, and browser QA at 320/360/390px and 1280x720 laptop. Check full banner
visibility, gradient/image dimensions, inline product label and smaller price,
slide advancement while pointer is over banner, and deliberate pause/play.
Deploy only to POS-integrated portal 3052 with immutable rollback to the
previous mobile-hero-assistant-051a37e release, preserving the public
Coming Soon page and POS API 3049.

## Verified deployment — 17 November 2026

**Deployed source commit:** `d0bbaa14cc5d5f5dd102e5f940cec89f52560e22`.

**Immutable portal release:** `/home/lightworld/releases/varietygroceries-portal-flat-hero-d0bbaa1-20261117`.
Unit: `varietygroceries-portal-canonical.service` (port 3052).
Systemd override: `zzz-flat-hero-20261117.conf`; it changes only
`WorkingDirectory`, not server/API configuration.

- Bun focused regressions: **18 passed**, 89 assertions, zero failures.
- Targeted ESLint and independent TypeScript check passed.
- Next.js 16.1.3 production build passed; 63 static pages generated. Existing
  shop, cart, checkout, POS, dispatch, staff and products routes retained.
- Isolated canary: HTTP 200 for `/`, `/shop`, `/cart`, `/checkout`,
  `/staff/login`, `/admin/pos`, `/admin/dispatch`, `/admin/products`.
- Isolated and **public HTTPS** Chromium tests each passed. At 1280×720,
  the entire full-bleed slider was **350px high**, from y=162 to y=512,
  including controls. The photo filled the complete banner width. The
  “Perfumed Local Rice” name and **From ₵120.00** price appeared inline;
  price font was 29.95px vs 38.4px for the name.
- During pointer hover, autoplay advanced **Perfumed Local Rice → Plantain
  Chips**. Explicit Pause held the current slide throughout the subsequent
  interval. OS reduced-motion preference remains respected.
- Chromium at 320px width: banner 440px; at 360 and 390px: banner 410px.
  Both pantry CTAs remained in the same row, above the overlay controls,
  with no horizontal overflow. The full image and gradient were present.
- Live portal routes returned HTTP 200, the public `varietygroceries.com`
  Coming Soon page remained unchanged, and the POS-integrated API 3049 still
  rejected unauthenticated till access (HTTP 401).

**Rollback:** remove
`/etc/systemd/system/varietygroceries-portal-canonical.service.d/zzz-flat-hero-20261117.conf`,
run `systemctl daemon-reload`, then restart **only**
`varietygroceries-portal-canonical.service`. The preceding
`zz-mobile-hero-assistant-20261117.conf` selects the verified
`/home/lightworld/releases/varietygroceries-portal-mobile-hero-assistant-051a37e-20261117`.
No backend, stock, payment, schema, or public-domain cutover was performed.
