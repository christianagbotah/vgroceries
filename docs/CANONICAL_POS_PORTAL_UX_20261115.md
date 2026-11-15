# Canonical POS-integrated portal UI corrections — 15 November 2026

This branch starts from the POS-integrated UAT baseline
`feat/role-voice-staging-20261113` (`dc198b0`), **not** the older
`main`-based portal that listens on 3037. The canonical external host
`https://portal.varietygroceries.com` is proxied by Nginx to portal port
**3051** and API port **3049**. The original manually managed port-3051
service must be retained for rollback while the candidate is tested.

## Nonfinancial UI changes

- Show an advisory alert when a server-owned booked collection window ends.
  Only an explicit server-confirmed action can cancel/rebook the appointment.
  A missed window never implies physical handover, refund, stock release,
  payment failure or a staff-confirmed no-show.
- Remove invented five-star demo endorsements on public product cards.
- Increase the SKU selector, its menu options and cart action to 44px or
  more for touch accessibility.
- Preserve the POS-integrated live SKU/stock checks. A selected unavailable
  variant must never silently switch to a different pack or price. An
  authoritative `byVariants` server fetch remains required before add to cart.

## Test gates

`bun test scripts/pickup-elapsed-window-regressions.test.ts scripts/canonical-pos-portal-ux-regressions.test.ts`

CI and isolated production build must pass before deployment. Candidate must
pass /, /shop, /categories and /help on a *free* loopback port, and external
/shop must render no invented star previews once routed. The existing
Nginx /api/v1 proxy to port **3049** is never changed by this frontend
release. Public `varietygroceries.com` remains Coming Soon. Hubtel payment
status authorization, customer SMS automation and all money/stock flags remain
unchanged and gated.

This branch does **not** merge unrelated dirty/untracked files currently
present in the POS-integrated live workspace; those are preserved separately.
