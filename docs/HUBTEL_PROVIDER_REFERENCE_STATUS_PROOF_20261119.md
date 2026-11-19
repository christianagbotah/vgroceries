# Hubtel Direct status: provider identifier cannot be inferred
19 November 2026 — **source only, not deployed or enabled**

## Evidence boundary
The existing Direct Request Money adapter correctly requires the merchant reference echoed in a successful response (mainline PR #155). However, when `PaymentAttempt.providerRef` already held a provider-issued `paylinkId` or transaction identifier, status lookups could still substitute that input as the observed provider reference if the response omitted its own value. An HTTP 200 `Paid` body with a correct merchant reference, amount and no independently echoed provider reference could therefore appear to meet downstream provider-ID matching despite the missing provider proof.

This change requires the response to independently echo the **exact** provider reference when the initiating attempt already carries one. Missing, blank, whitespace-only or different values cause a non-authoritative lookup error, not a state transition. If the attempt has no prior provider reference, a matching independently echoed merchant reference is still accepted for a **pending** observation without manufacturing a provider ID; existing success and money-identity checks remain unchanged.

A mismatch or inaccessible status API is **not proof of failure** and must not be interpreted as permission to charge again. Existing reconciliation treats lookup exceptions as unknown/requires-review. Real payment status needs independent provider reconciliation, particularly following a pending authorization.

### Tests
- Unit tests in the actual Node 24 API provider suite: absent/empty/whitespace/mismatched provider ID, Pending response without provider ID, matching valid provider ID.
- Standalone mock-only Bun regression: five tests (including existing merchant echo and 403 protections), no network use, credentials or merchant funds.
- Full API + frontend CI still required for this branch before merge.

### Release constraints
No live Hubtel transaction, authorization, callback receipt, refund, settlement, API key, merchant configuration, deployment or database migration. All real payment flags remain off. Hubtel transaction-status HTTP 403/merchant allowlisting remains an external issue; this change cannot bypass it. Hosted Online Checkout draft PR stack #140/#141/#143 requires independent review and rebase to incorporate mainline security rules.
