# Administrator Payments ledger — truthful pagination and full-ledger filters
19 November 2026 — source-only, not deployed.

## Problem
The production admin-only `GET /api/v1/payments` service is server-paginated (default 25 attempts, maximum 100) and returns `{page, perPage, total, items}`. The existing browser adapter discarded pagination metadata, and the Payments screen treated the first 25 attempts as the complete ledger, including inaccurate exception and status counts. Typing a search could only match these first rows.

## Implementation
- Add `apiOps.paymentLedger({ page, perPage, status, settlementState, orderReference })` using the existing admin-only REST operation. No new endpoint, permission, DB schema, mutation, payment action, or provider connector.
- Preserve original `apiOps.payments()` legacy array view for other callers. New `normalizePaymentLedgerPage` rejects invalid production pagination metadata and preserves server-returned total; it never extrapolates a global breakdown from one page.
- Allow previous/next navigation in groups of 25. Status and settlement filters apply across the full server-ledger. Order-reference search uses **exact** reference, matching existing API behavior, not unsupported partial/provider-reference matching.
- In demo/mock mode, apply filters **before** slicing the fixture array, and show the accurate fixture total and page number.
- Counters distinguish `Matching attempts (all pages)` from reconciled, unsettled and exception counts for **this page only**. The display expressly warns that an attempt status and reconciliation alone do not prove a bank deposit or collected cash.
- Preserve currency formatting `₵`, read-only staff order links, and mobile cards.

## Verification
- New focused Bun regression coverage for production/fixture paging, filters, exact reference search, no whole-ledger projection, invalid/mismatched pages and GET-only REST transport.
- Existing Paystack payment-ledger UI compatibility test retained.
- The independent read-only Hubtel Transaction Status diagnostic at 2026-11-19 09:35:19 UTC still returned HTTP **403**; this change is **not** a workaround.
- Full GitHub frontend and API integration/security CI required before merge. Current POS-integrated staging requires separate rollout/rollback testing; do **not** deploy the mainline code onto a running divergent workspace.
