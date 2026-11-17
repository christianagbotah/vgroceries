# Variety Groceries — mobile footer grid and discreet animated assistant

Date: 17 November 2026.

## Feedback and implementation

On mobile the existing footer stacks five full-width sections, which makes
its link layout long and visually uneven. The user also wants the minimized
Ask or speak button to attract attention via a glow/bubble/pulse.

- On narrow phones, footer brand/description spans both grid columns.
- **2×2 equal-width mobile navigation**: Shop, Customer service, About, Your
  shopping. The fourth account group is shown only below the desktop
  breakpoint and fills the otherwise empty grid cell.
- A full-width, softly outlined Stay connected card follows the grid with two
  equal call-to-action buttons (My account, Shop now).
- On laptop/desktop the original five-column layout is preserved, including
  the original brand, Shop, Customer service, About, and Stay connected order.
- Link text wraps inside columns without growing page width. On mobile the
  footer's legal/payment text is centered in two rows.
- The collapsed assistant button is still **44×44px**, parked at the lower
  right above the bottom navigation; it now has a soft gold static glow and
  a decorative halo expanding every 4.2 seconds. The halo has
  `pointer-events:none`, does not enlarge the click target, and is omitted
  when the user prefers reduced motion. It disappears while the launcher is
  expanded or the chat is open, preserving the existing close/collapse flow.
- The footer no longer implies that MoMo/card/bank gateway integrations are
  already connected. It says payment options depend on approved providers.

## Boundaries

Frontend only. No changes to live customer accounts, payment settings, API,
inventory, POS, schema, or publicly gated Coming Soon site. Full typecheck,
production build, mobile browser measurements at 320/360/390px, desktop
layout check, and live route checks are required before a portal-only rollout.
The previous release `d0bbaa1` remains the rollback target.

## Verified portal deployment — 17 November 2026

Source `33416ee4ed1c3ba1f8c6f35eb73aa0223dcaf3b8` is active in
`/home/lightworld/releases/varietygroceries-portal-mobile-footer-glow-33416ee-20261117`
for `varietygroceries-portal-canonical.service`. A single systemd drop-in
`zzzz-mobile-footer-glow-20261117.conf` changes only the portal
WorkingDirectory. The previous full-bleed hero release
`/home/lightworld/releases/varietygroceries-portal-flat-hero-d0bbaa1-20261117`
is retained for rollback.

- 17 focused tests / 92 assertions passed; targeted ESLint and full
  TypeScript passed. Next.js 16.1.3 production build passed, with all 63
  static pages generated.
- Isolated and **public HTTPS** Chromium both passed at 320, 360, and 390px
  width, plus 1280px desktop. Footer grids measured as 136/136px, 152/152px
  and 167/167px respectively. Brand and action card span both columns;
  Shop/Customer service and About/Your shopping are aligned 2×2 without
  horizontal overflow.
- Collapsed assistant button measured 44×44px at every mobile width, with
  active `vg-assistant-halo` keyframe and `pointer-events:none` on the
  decorative ring. With prefers-reduced-motion:reduce, animation computed
  to `none`. The original desktop button remained visible, and the
  mobile-only footer account link group was hidden on desktop.
- Live routes `/shop`, `/cart`, `/checkout`, `/staff/login`,
  `/admin/pos`, `/admin/dispatch`, `/admin/products` returned HTTP 200.
  The `varietygroceries.com` public Coming Soon site remained unchanged;
  unauthenticated till API access on port 3049 remained HTTP 401.
- No production database, stock, checkout payment configuration, migrations
  or backend API service were changed. Only the portal service restarted.

**Rollback:** remove the systemd
`zzzz-mobile-footer-glow-20261117.conf` override, reload systemd and
restart **only** `varietygroceries-portal-canonical.service`, restoring
the preceding `zzz-flat-hero-20261117.conf` WorkingDirectory.
