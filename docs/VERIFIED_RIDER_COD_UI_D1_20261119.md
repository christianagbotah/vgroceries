# Verified Rider COD D1 — portal UAT surface (19 November 2026)

**Source-only change. Not deployed. No live cash, payment, remittance or ledger action.**

The existing `/rider` screens are **demo/mock**. They select a fictional rider using localStorage and cannot be a source of real payment status. This change removes their misleading combined cash/"delivered" checkbox and replaces remittance copy with an explicit demo-only label. Demo remains useful for navigation and workflows but is NEVER authoritative cash evidence.

The separately gated real rider entrypoint is `/staff/rider/login`. Riders sign in with their own email/password and server-provided HttpOnly web session/CSRF, **not** a browser-selected rider identifier. After the NestJS session reports a genuine `rider` actor they may visit `/staff/rider/cod` (also protected by the Next staging page proxy when `UAT_PORTAL_LOGIN_REQUIRED=1`). A demo staff session, wrong role, untrusted API URL, absent session, and response shape mismatch all fail closed.

`NEXT_PUBLIC_VERIFIED_RIDER_COD_D1` defaults OFF. The API must be a genuine trusted HTTPS `/api/v1` source, not the prototype `/api/mock/v1`. Browser code fetches the same-origin real rider history, filters only server-owned delivered unpaid COD jobs, and shows the original server amount formatted as ₵ with two decimals. It requires two separate physical cash attestations and a written note before submitting the exact request under an actor-scoped idempotency key. The same key is retained for retries with the same job, amount and note; duplicate/different-key submissions are rejected by the backend. A checked response must report `rider_declared_unverified`, `supervisorVerified=false`, `remitted=false`, `paymentStatusChanged=false` and matching job/amount, otherwise the UI refuses to claim success.

## Explicit limits

No supervisor verified collection, bag acceptance, shortages/overages, till deposits, payment capture, reconciliation, customer receipt, or remittance is implemented by this page. Do not enable `NEXT_PUBLIC_VERIFIED_RIDER_COD_D1` or backend `COD_CASH_DECLARATIONS_ENABLED` on active environments until cash policy, independent verification and operational UAT are complete. Both toggles remain OFF in production and staging. Rejected or uncertain writes must never be reported as successful.

## Release checks

Run regression tests for staging role gates, no mock rider ID, server-value-only amounts, strict CSRF/replay handling, and demo false cash claims; clean Next/ESLint/TypeScript build; API security and PostgreSQL integration CI; on-host backup/restore and real rider session test before any staging flag activation. This source change does **not** authorize the complete COD accounting workflow or live rollout.
