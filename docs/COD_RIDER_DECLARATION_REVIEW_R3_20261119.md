# COD R3 — administrator sees immutable rider declaration evidence (19 November 2026)

**Source-only. Not deployed. No payment, collection verification, remittance, or accounting authority activated.**

The existing administrator-only, read-only `GET /api/v1/admin/dispatch/cod-exceptions` endpoint now returns a minimal `riderDeclaration` snapshot **only** when an immutable `CodCashDeclaration` record exists for the delivery job: `{ amountMinor, declaredAt }`. The amount is an exact integer in pesewas; the timestamp is server-recorded UTC. Both are read from PostgreSQL in the same repeatable-read snapshot as the filtered exception count and gross face-value total. A missing declaration omits this object. The response exposes no rider statement notes, attestation booleans, declaring user identity, customer contact details or private payment data.

The strict shared contract rejects a row that advertises `rider_declared_unverified` without a declaration snapshot, or supplies a declaration while claiming `not_recorded_in_variety`. The private administrator page displays the rider's self-reported count, recorded time and a visible mismatch warning if the count differs from the order face value. It continues to say **supervisor unverified** and **remittance not recorded**. A declaration is not cash received by the business, proof of bank deposit, accepted rider debt, or successful payment. No verify/approve/refund/settle controls have been introduced.

This prepares a future supervised physical-count review; it does **not** implement D2 supervisor dual control, cashier custody accounting, shortages/overages, sealed bag receipt, dispute resolution, reversals, or live collection. `COD_CASH_DECLARATIONS_ENABLED` and `NEXT_PUBLIC_VERIFIED_RIDER_COD_D1` remain OFF in active environments. No schema migration, API deploy, live rider session, payment/provider call or stock mutation is part of this patch.

## Release checks

Run shared contract compilation, API TypeScript build, fresh disposable PostgreSQL migrations and role/data-leak tests, deterministic OpenAPI regeneration, frontend lint/typecheck/build and administrator browser check. Preserve the current immutable deployed releases, and do not activate COD or merge into a production deployment without finance and security review.
