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
