# R4 — Independent count observations in the COD exception inbox
19 November 2026 — source only, not deployed or enabled.

The existing authenticated administrator-only read-only `GET /api/v1/admin/dispatch/cod-exceptions` report now includes **minimal immutable observation evidence** when a real rider cash declaration has one or two `CodSupervisorCount` rows. No new URL, mutation endpoint, permission, or provider connector is created. The query retrieves these counts inside the report's existing repeatable-read PostgreSQL transaction.

Response `supervisorCountReview` is optional and is absent when there is no independently recorded count. When present, its strict shared contract permits at most two sequence-ordered observations with exact integer amounts (pesewas) and recorded UTC timestamps, plus exactly one of the following evidence-only statuses:
- `first_count_recorded_unverified` — one independent count, another reviewer still needed.
- `dual_count_agreed_unverified` — two distinct reviewers counted exactly the same amount as the rider declaration. **Not business cash acceptance.**
- `count_disagreement_requires_review` — at least one count disagrees with another count or the rider statement.

Every review response includes `cashAccepted:false`; the global inbox keeps `evidenceStatus: verified_collection_and_remittance_not_yet_implemented` and each row `remittanceEvidence: not_recorded_in_variety`. There are no bank/till balances, cashier receipts, payment-posting indicators, approval buttons, liability deductions or refunds. The private report NEVER exposes reviewer IDs, attestation notes, counted-person identity, contact information, request IDs or confidential authentication values.

The administrator screen displays separate labels and itemized physical count observations. Equal observations are shown as **still unaccepted cash**; disagreements demand manual investigation. The UI cannot convert counts into a payment, custody receipt, settled revenue, stock adjustment, rider liability or remittance.

## Verification and release boundary
- API integration tests cover one and two real observations, differing counts, status/sequence cross-checks, immutable database timestamps, PII exclusion and no order/payment changes.
- Frontend static regression tests protect real administrator auth, privacy wording and absence of financial mutation controls.
- Shared contracts require consistency between an actual rider statement and count state; fake or contradictory count evidence is rejected.
- Keep `COD_CASH_DECLARATIONS_ENABLED` and `COD_SUPERVISOR_COUNT_ENABLED` **OFF** in active environments. PR #153 D2 backend and its migration must complete CI and merge before this UI/report source can be safely merged.
- Further D3 cash handover/custody and D4 finance controls remain separate, not approved or implemented. In-person financial-policy and security UAT must precede any live COD activation.
