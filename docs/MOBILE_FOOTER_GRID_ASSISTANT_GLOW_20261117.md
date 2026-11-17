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
