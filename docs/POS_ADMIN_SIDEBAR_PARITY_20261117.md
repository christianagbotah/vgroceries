# POS-integrated admin sidebar: narrow, collapsible and searchable

Date: 17 November 2026.

This change ports the tested accessible search and compact navigation UX from
the canonical admin sidebar onto the deployed **POS-integrated** source
`2323916` / documentation revision `7bdb965`.

## Preserved POS-specific features

- Staff-only **Support inbox** `/admin/support`, retaining the existing
  `team.manage` sidebar visibility gate. This is a UI filter only:
  backend/API authorization remains authoritative.
- The official metallic gold VG mark in collapsed navigation and the full
  white-backed VG lockup when expanded.
- Existing staff session, demo-mode controls, sign out, full staff routes,
  POS cashier and inventory functionality.
- Product hero, quick-basket and voice-concierge storefront enhancements
  deployed immediately before this sidebar work.

## Layout and behavior

- Desktop width **224 px** expanded, **64 px** collapsed. Last chosen
  collapse preference persists in localStorage when available.
- One compact/expand control stays pinned beneath the independently
  scrollable navigation column.
- Expanded desktop and mobile drawer have case/whitespace-insensitive page
  search (page label, category, route), filtering by the permitted role
  before matching. Search clears on navigation, on Escape or via button.
- Compact icon links remain available with accessible names, tooltip titles
  and correct active page indicator. Search is intentionally hidden while
  compact. Mobile drawer stays within the viewport.

## Safety and rollout

Source change only until verified release: portal `3052` continues to use
POS-integrated API `3049`. Do not use the legacy rollout into `3037/3027`,
rewrite inventory/payment/return records, change provider credentials, update
schema/migrations or replace the public Coming Soon site.

Run `bun test scripts/admin-nav-search.test.ts
scripts/pos-admin-sidebar-parity.test.ts`, ESLint, full TypeScript and
Next.js production build; verify desktop/sidebar toggle and mobile navigation
in a browser, and have an immutable, reversible portal-only release. Do not
infer a live deployment from a GitHub commit.
