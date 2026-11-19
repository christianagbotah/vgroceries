# Staff payment exceptions — distinguish unverified from failed
19 November 2026 — source only; not deployed, enabled or connected to live provider requests.

## Problem
The administrator Payments page rendered `settlementState=exception` as a **red `failed` badge**. But an exception may follow an inaccessible provider status API, initiation timeout, out-of-policy callback or amount mismatch. This is NOT authoritative evidence that a customer was declined, charged or refunded.

## Read-only correction
- The UI now displays actual payment-attempt status using the payment-specific badge palette and labels exceptions **Verification exception** with the non-failure review tone. Staff see “Outcome uncertain: check the provider independently. Do not infer success, failure or refund.”
- The API's existing `initiationState` is preserved through the front-end ledger normalization. When `uncertain`, both mobile and desktop listings warn **Initiation uncertain — verify with provider**. No new API field, endpoint or sensitive credential was exposed.
- A **Review exceptions** button selects the existing server-side settlement filter, resets pagination and shows the authoritative matching count from the backend.
- `reconciled` and `settled` remain separate labels with explicit statements that they do not independently establish a merchant bank deposit.
- No button or route performs a new charge, refund, cancellation, success override or reconciliation mutation. Any actual financial action remains under server-owned authorities and existing permissions.

## UAT and release gates
Regression tests cover provider ambiguity, strict status distinctions, payout semantics, production initiation-state projection and staff read-only copy; existing ledger pagination/Paystack tests must remain green. GitHub frontend + API integration/security workflows must both pass before merge. Separate POS-integrated portal UAT and rollback are required before deployment.

Hubtel synthetic Transaction Status access was still **HTTP 403** from Variety VPS on 19 Nov 2026 09:35:19 UTC; this UI does not bypass merchant scope/IP allowlisting. Keep payment flags OFF. See GitHub issue #90.
