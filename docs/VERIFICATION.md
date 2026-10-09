# Verification record

**Date**: 9 October 2026 · **Environment**: Next.js 16.1 (App Router, Turbopack dev), TypeScript 5,
Tailwind 4, shadcn/ui, Bun. Checks were actually run — nothing below is claimed without a result.

## Automated checks

| Check | Command | Result |
|---|---|---|
| ESLint | `bun run lint` | **PASS — 0 errors, 0 warnings** (after fixing 3 `set-state-in-effect` errors and 2 stale directives) |
| Route sweep | curl every implemented route | **PASS — 48/48 routes HTTP 200** (storefront 17, admin 27, rider 4 + staff login; incl. dynamic detail routes) |
| API smoke | curl operations across catalogue/checkout/orders/POS/inventory/dispatch/returns/refunds/AI/demo | **PASS** — envelopes `{ok,data|error}`, correct error codes |
| Business-rule acceptance suite | `bash scripts/acceptance-checks.sh` | **PASS — 21/21** (details below) |

### Acceptance suite results (scripts/acceptance-checks.sh, last run)

```
A. sachet-water (zero stock) hidden from catalog list .................. PASS
A. zero-stock item hidden from search results .......................... PASS
A. saved link shows unavailable, purchasing disabled ................... PASS
B. chicken availability 0 after online reservation ..................... PASS
B. POS completion of the reserved final unit rejected (OUT_OF_STOCK) .. PASS
C. eggs availability restored after expiry sweep ....................... PASS
D. replayed POS completion returns the same receipt .................... PASS
D. toffee physical stock consumed exactly once (200−3=197) ............. PASS
E. pending payments remain pending (no duplicate charge) ............... PASS
E. late paid order routed to requires_review ........................... PASS
F. partial return preserves the remaining eligible (3 of 6) ............ PASS
F. returning beyond eligible rejected (REFUND_LIMIT_EXCEEDED) .......... PASS
F. duplicate refund request on the same return rejected ................ PASS
G. first refund execution records retryable failure .................... PASS
G. refund state failed (retryable), not lost ........................... PASS
G. retry executes the refund successfully .............................. PASS
G. order payment status becomes partially_refunded ..................... PASS
H. yoghurt saleable stock unchanged by damaged/quarantined lots ........ PASS
I. second payment callback after resolution is a no-op ................. PASS
J. COD job carries a separate cash-to-collect amount ................... PASS
J. cash not yet collected while delivery in progress ................... PASS
RESULT: 21 passed, 0 failed
```

## Manual browser checks (agent-browser, Chromium)

| Area | Checks | Result |
|---|---|---|
| Storefront | Home renders (categories/offers/popular, 14 product tiles), shop search+sort+pagination, product variant+add-to-cart (cart persisted), cart quantity edit, checkout validation & minimum-order gating | PASS |
| Golden path | Shop → cart → checkout (MoMo, zone+slot+saved address) → **order VG-ZZ9P3T placed (₵153.00)** → payment prompt approved → “Thank you — payment confirmed!” → staff confirm/pick/pack → dispatch assign (rider Kofi) → rider login → accept → pickup (stock consumed) → out for delivery → **delivered with PIN proof** → customer track shows Delivered + timeline | PASS (walked end-to-end in-browser) |
| POS | Session opened (float ₵100), Milo search+tile add, cash ₵60 → change ₵8, complete → **receipt R-00004** printed dialog; storefront/inventory availability dropped 40 → 39 | PASS |
| Rider workspace | Login as rider, job detail with checklist, address + tel: link, proof dialog (PIN), fail dialog | PASS |
| Layout widths | 360px (home, shop, cart, admin, rider, track — 2-column grid, wrapped filters, no page-wide overflow), 768px (admin orders), 1440px (admin) — `scrollWidth === clientWidth` on all; tables scroll in their containers | PASS |
| Honest failures | Offline mode ON → admin data region shows “Something went wrong — demo offline mode is ON…” with retry; recovery after OFF | PASS |
| Console/runtime errors | None during the final walks (dev.log clean) | PASS |

**Bug found and fixed by browser verification**: `rider.action` responses passed the job **ID string** into `riderJobView()` (which expects the job object), returning HTTP 500 with “Cannot read properties of undefined (reading 'map')” *after* the mutation had succeeded — mutations applied but rider screens went stale. Fixed in `src/services/mock/router.ts` (pass `mustJob(store, jobId)`); re-verified: rider job page now re-renders after every action, and the full 21-check acceptance suite plus lint pass again after the fix.

Screenshots: `docs/screenshots/verify-home-final.png`, `docs/screenshots/verify-shop-360px.png`, `docs/screenshots/verify-dashboard.png`, `docs/screenshots/verify-admin-1440px.png`, `docs/screenshots/verify-rider-360px.png`.

## Not run / not possible in this environment

- `bun run build` — production build is not part of the sandbox dev workflow (dev-server only per
  environment instructions). Source compiles per-route during dev with zero errors; a production
  build remains an integration-team step.
- Automated unit tests (Jest/Vitest) were not added — the acceptance suite above covers the
  inventory/duplicate-action/refund-limit/primary-workflow requirements via executed API checks.
  Adding a formal test runner is listed in docs/KNOWN_ISSUES.md as follow-up.
- Real payments, courier APIs, SMS, email: intentionally not connected (prototype boundary).

## Reset behaviour

`POST /api/mock/v1/demo/reset` or the Demo controls page reseeds everything (verified — acceptance
suite resets first and passes repeatedly). Dev-server restart also resets state (single process);
browser cart persists in localStorage.
