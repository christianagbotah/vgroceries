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
