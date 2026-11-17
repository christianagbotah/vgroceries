# Variety Groceries mobile polish — same-row hero CTAs + collapsible assistant

Date: 17 November 2026

Reported on Android: the pantry hero's primary and secondary action links were
stacking. The floating “Ask or speak” pill covered too much of the product
photography.

## Implemented

- On screen widths below the tablet breakpoint, the two hero CTA links share
  the same two-column grid row, with limited internal padding, responsive text
  sizes, a retained 48px tap-height, and wrapping **inside** each button for
  longer dynamic CMS labels. On larger screens, the existing flexible pill
  design remains.
- Mobile assistant starts as a **44 × 44 px** corner tab carrying a chat icon
  and inward caret. Tapping the tab unfolds a small **Ask or speak** pill and a
  separate collapse caret; tapping the pill opens the existing catalogue chat.
  Closing the full assistant returns to the small corner tab.
- Desktop continues to show its original full “Ask or speak” floating pill.
- Mobile chat panel is capped at 68dvh and bounded to the viewport width. It
  sits above the existing sticky mobile navigation bar without hiding it.
- Voice/chat logic and its privacy disclaimer, catalogue grounding and
  order-checkout safeguards remain unchanged.

## Release and safety

Only two React frontend components are changed. No product, customer,
stock, payment, server API, or production database mutations are required.
Run focused regression tests, lint, TypeScript check, production build,
mobile browser QA at 320/360/390 px, then a portal-only immutable deployment
with a rollback to release storefront-polish-67936ce.

## Verified release evidence — 17 November 2026

- Deployed source SHA: `051a37e67d9270076cce09115d9ab59f6c05b428`.
- Immutable artifact: `/home/lightworld/releases/varietygroceries-portal-mobile-hero-assistant-051a37e-20261117`.
- Portal service: `varietygroceries-portal-canonical.service` (port 3052).
- Drop-in: `zz-mobile-hero-assistant-20261117.conf` changes only
  `WorkingDirectory`. The prior `99-storefront-polish-20261117.conf`
  selects `/home/lightworld/releases/varietygroceries-portal-storefront-polish-67936ce-20261117`
  after this drop-in is removed.
- Frozen Bun installation, TypeScript check and production Next.js build
  passed, with 63 static pages generated.
- Twelve focused and existing storefront regression tests passed (54 assertions).
- The isolated canary returned HTTP 200 for homepage, shop, cart,
  checkout, staff login, admin POS, dispatch, products and demo dispatcher.
- Chromium test measured both pantry CTA buttons sharing one row:
  at 320px they occupied x32–156 and x164–288, at 360px x32–176 and
  x184–328, and at 390px x32–191 and x199–358. Their vertical positions
  matched and heights were at least 48px. No horizontal page overflow.
- Mobile assistant compact width and height measured **44 × 44px** at
  320, 360 and 390px. Its expand, collapse, open chat and close chat
  operations passed. The expanded UI and panel remained inside viewport and
  above sticky navigation. Desktop retained its original full floating pill.
- Live portal smoke verified HTTP 200 for shop, cart, checkout, staff
  login, admin POS, dispatch, products. HTTPS homepage preserved hero and
  basket quick view. Public Coming Soon was unchanged. POS API on 3049
  retained its unauthenticated 401 response.
- No payment-provider activation, product/stock/cash mutation, API restart,
  schema change or public site cutover was performed.

Rollback, if required: delete only
`/etc/systemd/system/varietygroceries-portal-canonical.service.d/zz-mobile-hero-assistant-20261117.conf`,
run `systemctl daemon-reload` and
`systemctl restart varietygroceries-portal-canonical.service`. Confirm
the working directory resolves to the earlier 67936ce release and rerun
the same read-only route checks.
