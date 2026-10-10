# Known issues, incomplete work & integration limits

Honest inventory of what is not finished, simplified, or impossible in this prototype. Nothing
here is hidden; each item states the impact and the follow-up.

## Private backend foundation

A separate NestJS/PostgreSQL foundation now implements durable identity,
permission-scoped catalogue/inventory reads and atomic receiving; see
[BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md). It is not connected to the public
frontend. The limitations below describe the currently running prototype.
Commerce, payments/delivery, publishing workers, frontend authentication UX,
registration/recovery/MFA, native apps and live AI remain subsequent milestones.

## Prototype boundaries (by design)

1. **No authentication.** `/staff/login` and `/rider/login` are demo role pickers persisted in
   localStorage. Production needs real auth; role menus/permissions are UX only and the backend
   must enforce every protected operation.
2. **No persistence.** Mock state is an in-memory, single-process `globalThis` singleton. A dev
   server restart or `/admin/demo → Reset` reseeds it. Multi-user concurrency cannot be safe in
   this model — real multi-user needs backend transactions / atomic constraints (the atomic
   reservation and single-depletion logic is implemented and demonstrable in the mock, but its
   authority is the future backend).
3. **No real payments.** Hubtel is a candidate adapter (developer portal consulted for planning
   only). “Approve the payment prompt” is a customer-side roleplay that calls the mock provider
   callback. The mock enforces duplicate-callback safety, pending states and the late-payment
   review path; the real provider verification is backend work.
4. **No live AI.** All suggestions are deterministic rules over fixture/live demo state, labelled
   “deterministic demo”. Provider-neutral backend interfaces are outlined in API_CONTRACTS.md.
5. **No courier integrations.** External providers are listed as “Not connected” with capability
   claims only; manual booking is the fallback. No courier is named as integrated and no API is
   invented.
6. **No tax calculation.** No Ghana tax rate is assumed or hardcoded; tax treatment is owner
   configuration for the backend.
7. **Rider location is demo-labelled.** Optional, permission-based “share location” records a
   label + timestamp only. No live GPS, no invented rider movement or ETAs.

## Simplifications & smaller gaps

8. **Account area is single-customer demo**: one fictional customer is “signed in”; address
   editing is read-only with a note (backend accounts service boundary); support notes can be
   typed but not saved (write API pending).
9. **Customer return creation is API-verified but the staff-created return** (from an order) routes
   through the same returns screen rather than a dedicated dialog.
10. **Adjustment approval UI** allows any role with `inventory.receive` to approve pending
    adjustments (documented in PERMISSIONS.md); production should scope approval strictly.
11. **Substitution suggestions** on the order detail are other variants of the same product only
    (no cross-product suggestions yet).
12. **Stock value “cost basis”** in reports approximates with variant purchase prices; no landed
    cost ledger (backend owns cost of goods).
13. **Recharts not used**: report charts are lightweight CSS bars — functional and clean, but a
    richer charting pass is possible.
14. **Engine tests run via Bun scripts and the Bun test runner**: business rules are covered by the
    executed acceptance script (`scripts/acceptance-checks.sh`, hardened — 24 checks), the
    handoff regression suite (`scripts/handoff-regressions.ts`, 24 assertions covering the
    review's seven defect classes and the returns-list endpoint) and the shared-contracts suite
    (`scripts/contracts-check.ts`, 32 assertions); all run in CI, alongside 35 Bun tests for return stock, REST transport, cache races and backend mode.
15. **Production build verified**: `next build` (Turbopack) completes with strict TypeScript
    (no `ignoreBuildErrors` bypass) and 47/47 pages prerender. CI (`.github/workflows/ci.yml`)
    runs lint + `tsc --noEmit` + build + all five suites on every push. The earlier
    `useSearchParams()` prerender failures on `/account/returns`, `/track` and
    `/admin/returns` are fixed with Suspense boundaries.
16. **CSV exports** cover the current filtered dataset for the sales/top-products tables; other
    tables export on request (pattern is established).
17. **Input validation is now layered**: shared zod request schemas live in
    `src/services/contracts/validation.ts` and run at the adapter boundary (client-side, fast
    feedback) and in the contracts suite; the service engines re-validate authoritatively
    (defense in depth). The NestJS backend must re-validate again — the shared schemas are the
    reference. The old `src/schemas/` reservation is gone.
18. **GhanaPostGPS** is stored and validated as text only (no geocoding claim), as required.
19. **Cart persistence** is localStorage convenience; stale cart lines surface as “currently
    unavailable” rows with removal, per the non-authoritative-cart rule.
20. **Held POS drafts** reserve stock for 20 minutes (shorter than order holds) — configurable in
    the backend contract.
21. **Production-without-backend fallback**: a production bundle with no `API_BASE_URL` /
    `NEXT_PUBLIC_API_BASE_URL` falls back to the in-process mock adapter with a one-time console
    warning so the demo remains demonstrable — a demo affordance, not a production
    configuration (documented in docs/API_CONTRACTS.md §1).
Both backend URLs are required together; mock routes return 404 when either selects backend mode.

22. **Client cache default TTL is 0 (no-store)**: the tag-invalidation machinery is complete and
    exercised, but reads are intentionally not cached in the prototype because stock changes
    live; raising `NEXT_PUBLIC_CACHE_TTL_MS` enables short-TTL caching for the real API.

23. **Validation coverage**: request schemas cover 16 high-impact operations and selected response shapes. The backend must authoritatively validate every operation. Wire tests establish mapping, not the existence of 92 live endpoints.
24. **Return provenance/reconciliation**: all credited lots are tracked and reversals preserve history. Moved/reserved stock or incomplete legacy metadata blocks reclassification. Unknown perishable provenance must remain quarantined in production.
25. **Browser refresh**: the shared hook listens for mutation invalidation and ignores older completions. Custom loaders still require their own refresh handling; cross-session realtime updates are not implemented.

## Execution note

All planned routes and the full vertical workflow were completed within this session; no work was
abandoned mid-build. The stopping point is exactly the prototype boundary described above — the
backend integration team takes over from docs/HANDOFF.md.
