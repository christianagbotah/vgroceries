# Refund action acknowledgement: operator messaging guard
19 November 2026 — source-only, not a live refund integration or verified financial transfer.

## Defect
The legacy staff Refunds page toasted **"Refund executed via provider"** immediately after `POST /refunds/{refundId}/actions` returned successfully. But the shared `LegacyRefundActionResponse` contract is only `{done: boolean}`, not a signed provider receipt, settled bank transfer, verified payout or independently reconciled refund. A network timeout could also lead staff to retry a transfer without checking whether the original was accepted. An unconditional “demo behaviour” footer appeared even in the production staff screen.

## Correction
- Only `done === true` means the *command* was handled. Approval copy becomes “Refund approval recorded”; execution and retry copy becomes “Refund command received.” Neither claims a completed provider transfer.
- `done !== true` and exceptions display an explicit outcome-verification warning and require provider transfer/ledger review **before retry**, especially after uncertain transport results.
- Refresh the existing server ledger after any action attempt. The ledger and independently verified provider reconciliation—not the client toast—remain the source of authoritative refund status.
- Retain role-gated buttons, double-submit protection, manual recording distinctions, current server refund authority and backend amount/idempotency rules. No new paid-state mutation, payment/refund bypass or forced network retry.
- Replace obsolete deterministic demo timeout claim with honest guidance on payout verification and manual recording.
- No changes to provider integration, protected credentials, live payment flags, database migrations or deployment.

## Verification
Focused Bun source regressions cover legacy contract limitation, acknowledgement vs payout wording, negative/uncertain responses, safe retry policy, permission gating, ledger refresh and manual refund distinction. Full GitHub frontend CI and API integration/security CI required before merge. This change is **not** proof of live Hubtel settlement; separate Hubtel issue #90 still blocks authorized Transaction Status lookup.
