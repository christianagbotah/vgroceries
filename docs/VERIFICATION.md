# Verification record

**Date**: 9 October 2026 (updated after handoff-review corrections) · **Environment**: Next.js 16.1
(App Router, Turbopack dev), TypeScript 5, Tailwind 4, shadcn/ui, Bun. Checks were actually run —
nothing below is claimed without a result.

## Automated checks

| Check | Command | Result |
|---|---|---|
| ESLint | `bun run lint` | **PASS — 0 errors, 0 warnings** (after fixing 3 `set-state-in-effect` errors and 2 stale directives) |
| Type check | `bunx tsc --noEmit --incremental false` | **PASS — 0 diagnostics** (was 40: engine/contract mismatches, missing `apiOps` imports, undefined types, duplicate client-adapter key, unused scaffold) |
| Production build | `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 NEXT_TELEMETRY_DISABLED=1 bun run build` | **PASS — compiled with strict TypeScript (no `ignoreBuildErrors` bypass), 47/47 pages prerendered** (was: prerender failure where `useSearchParams()` lacked a Suspense boundary — `/account/returns`, `/track` and `/admin/returns` all fixed) |
| Route sweep | `node scripts/route-sweep.mjs` | **PASS — 56/56 routes HTTP 200** (storefront, admin, rider + staff login; dynamic detail routes curled with seeded instances) |
| API smoke | curl operations across catalogue/checkout/orders/POS/inventory/dispatch/returns/refunds/AI/demo | **PASS** — envelopes `{ok,data|error}`, correct error codes |
| Business-rule acceptance suite | `bash scripts/acceptance-checks.sh` | **PASS — 24/24** (original 21 + catalogue non-empty + admin.returns contract; the suite now aborts on any transport, HTTP-status, or JSON-envelope failure so no assertion can pass on an empty response) |
| Handoff regression suite | `bun scripts/handoff-regressions.ts` | **PASS — 24/24** assertions covering the review's seven defect classes (unexecuted-refund claim, double restock, duplicate return lines, double refund, released-reservation handover, negative quantities, checkout idempotency) plus the staff returns-list endpoint |
| Return stock regression tests | `bun test scripts/return-stock-regressions.test.ts` | **PASS — 8/8** covering multi-item reversal, retained history, expiry, moved/reserved stock and incomplete legacy metadata |
| CI | `.github/workflows/ci.yml` | Lint + type check + production build + all four suites on every push/PR |

The independent follow-up check of the actual production server and return
corrections is recorded in [the backend handoff checkpoint](BACKEND_HANDOFF_CHECKPOINT.md).

### Acceptance suite results (scripts/acceptance-checks.sh, last run)

```
A. catalog list returns a non-empty total (50) ................................ PASS
A. sachet-water (zero stock) hidden from catalog list .......................... PASS
A. zero-stock item hidden from search results .................................. PASS
A. saved link shows unavailable, purchasing disabled ........................... PASS
B. chicken availability 0 after online reservation ............................. PASS
B. POS completion of the reserved final unit rejected (OUT_OF_STOCK) .......... PASS
C. eggs availability restored after expiry sweep ............................... PASS
D. replayed completion returns the same receipt (R-00004) ...................... PASS
D. toffee physical stock consumed exactly once (200−3=197) ..................... PASS
E. pending payments remain pending (no duplicate charge) ....................... PASS
E. late paid order routed to requires_review ................................... PASS
F. ord_1014 partial return preserves the remaining 3 eligible (of 6) .......... PASS
F. returning beyond eligible rejected (REFUND_LIMIT_EXCEEDED) ................. PASS
F. duplicate refund request on the same return rejected ....................... PASS
G. first refund execution records retryable failure ............................ PASS
G. refund state failed (retryable), not lost ................................... PASS
G. retry executes the refund successfully ...................................... PASS
G. order payment status becomes partially_refunded ............................ PASS
H. yoghurt saleable stock unchanged by damaged/quarantined lots ................ PASS
I. second payment callback after resolution is a no-op ....................... PASS
J. COD job carries a separate cash-to-collect amount ........................... PASS
J. cash not yet collected while delivery in progress ........................... PASS
K. admin.returns returns the full list without INTERNAL errors (3 rows) ....... PASS
K. each returns row links to its order (orderId present) ...................... PASS
RESULT: 24 passed, 0 failed
```

## Z.ai's recorded manual browser checks (agent-browser, Chromium)

These browser results were recorded by Z.ai for its handoff. The independent
follow-up checkpoint does not claim a new browser hydration or responsive pass.

| Area | Checks | Result |
|---|---|---|
| Storefront | Home renders (categories/offers/popular, 14 product tiles), shop search+sort+pagination, product variant+add-to-cart (cart persisted), cart quantity edit, checkout validation & minimum-order gating | PASS |
| Golden path | Shop → cart → checkout (MoMo, zone+slot+saved address) → **order VG-ZZ9P3T placed (₵153.00)** → payment prompt approved → “Thank you — payment confirmed!” → staff confirm/pick/pack → dispatch assign (rider Kofi) → rider login → accept → pickup (stock consumed) → out for delivery → **delivered with PIN proof** → customer track shows Delivered + timeline | PASS (walked end-to-end in-browser) |
| POS | Session opened (float ₵100), Milo search+tile add, cash ₵60 → change ₵8, complete → **receipt R-00004** printed dialog; storefront/inventory availability dropped 40 → 39 | PASS |
| Rider workspace | Login as rider, job detail with checklist, address + tel: link, proof dialog (PIN), fail dialog | PASS |
| Layout widths | 360px (home, shop, cart, admin, rider, track — 2-column grid, wrapped filters, no page-wide overflow), 768px (admin orders), 1440px (admin) — `scrollWidth === clientWidth` on all; tables scroll in their containers | PASS |
| Honest failures | Offline mode ON → admin data region shows “Something went wrong — demo offline mode is ON…” with retry; recovery after OFF | PASS |
| Console/runtime errors | None during the final walks (dev.log clean) | PASS |
| Handoff-review pages | After the review fixes, re-verified data + hydration on /admin/providers, /admin/suppliers, /admin/team (previously broken `apiOps` imports → error state), /admin/returns (endpoint 500 fixed, rows render with orderId links), /admin/cashier-sessions, /admin/reports, /admin/pos, storefront home/shop/category/product/delivery (now served through `src/services/server-data.ts`), /track, /account/returns and /admin/returns/ret_2001 | PASS |

**Bug found and fixed by browser verification**: `rider.action` responses passed the job **ID string** into `riderJobView()` (which expects the job object), returning HTTP 500 with “Cannot read properties of undefined (reading 'map')” *after* the mutation had succeeded — mutations applied but rider screens went stale. Fixed in `src/services/mock/router.ts` (pass `mustJob(store, jobId)`); re-verified: rider job page now re-renders after every action, and the full 21-check acceptance suite plus lint pass again after the fix.

Screenshots: `docs/screenshots/verify-home-final.png`, `docs/screenshots/verify-shop-360px.png`, `docs/screenshots/verify-dashboard.png`, `docs/screenshots/verify-admin-1440px.png`, `docs/screenshots/verify-rider-360px.png`.

## Not run / not possible in this environment

- Real payments, courier APIs, SMS, email: intentionally not connected (prototype boundary).
- Real PostgreSQL concurrency, trusted authentication and production AI: the current
  application remains a mock prototype; the written backend design defines those boundaries.

## Reset behaviour

`POST /api/mock/v1/demo/reset` or the Demo controls page reseeds everything (verified — acceptance
suite resets first and passes repeatedly). Dev-server restart also resets state (single process);
browser cart persists in localStorage.
