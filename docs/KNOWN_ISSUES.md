# Known issues, incomplete work & integration limits

Honest inventory of what is not finished, simplified, or impossible in this prototype. Nothing
here is hidden; each item states the impact and the follow-up.

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
14. **Engine tests run via Bun scripts and Bun's test runner**: business rules are covered by the
    executed acceptance script (`scripts/acceptance-checks.sh`, hardened — 24 checks) and the
    handoff regression suite (`scripts/handoff-regressions.ts`, 24 assertions covering the
    review's seven defect classes and the returns-list endpoint). Eight Bun tests cover
    multi-item return reclassification, preserved lot history, conservative expiry and
    protection of moved/reserved returned stock and rejection of incomplete legacy
    credit history. All suites run in CI.
15. **Production build verified**: `next build` (Turbopack) completes with strict TypeScript
    (no `ignoreBuildErrors` bypass) and 47/47 pages prerender. CI (`.github/workflows/ci.yml`)
    runs lint + `tsc --noEmit` + build + the regression, acceptance and route suites. The earlier
    `useSearchParams()` prerender failures on `/account/returns`, `/track` and
    `/admin/returns` are fixed with Suspense boundaries.
16. **CSV exports** cover the current filtered dataset for the sales/top-products tables; other
    tables export on request (pattern is established).
17. **`src/schemas/` reserved but empty**: input validation is enforced in the service engine and
    forms (inline) rather than shared zod schemas; extracting them is cleanup work.
18. **GhanaPostGPS** is stored and validated as text only (no geocoding claim), as required.
19. **Cart persistence** is localStorage convenience; stale cart lines surface as “currently
    unavailable” rows with removal, per the non-authoritative-cart rule.
20. **Held POS drafts** reserve stock for 20 minutes (shorter than order holds) — configurable in
    the backend contract.
21. **Return expiry provenance**: known original allocation dates are preserved conservatively
    using the earliest date. Demo sales with no recorded batch allocation cannot establish
    a verified return expiry; production inspection must capture provenance and quarantine
    perishables with unknown dates. The backend design requires that workflow.
22. **Return disposition changes**: every credited lot is tracked. Reclassification keeps
    historical lots with zero quantity and compensating movements. Changed quantities or
    active reservations on an affected variant block reclassification for reconciliation;
    the mock cannot safely resolve per-lot reservation ownership. Legacy inspected returns
    without complete `stockLots` metadata also require reconciliation. Demo reset removes
    those older records; current inspections always record the complete credit history.

## Execution note

All planned routes and the full vertical workflow were completed within this session; no work was
abandoned mid-build. The stopping point is exactly the prototype boundary described above — the
backend integration team takes over from docs/HANDOFF.md.
