# Hubtel Online Checkout — safe mainline integration (staged, no live payments)
Date: 19 November 2026. This is source-only; neither production nor POS staging is changed by this branch.

## Purpose and storefront behavior
Shoppers select **Electronic payment** at checkout. If and only if the server operator has configured Hubtel `hosted_checkout` and its matching refund authority, Hubtel presents its supported Mobile Money and card options on the trusted hosted page. The browser never collects PIN, OTP, PAN or CVV. Hosted creation is **NOT** a completed payment: staff, fulfilment and stock remain blocked until independent payment evidence is reconciled by the existing Payments Authority.

## Integration
- Parse a mutually exclusive Hubtel mode: either `mobile_money` Direct Request Money or `hosted_checkout` Online Checkout. Mixed modes are rejected because the existing lookup adapter input lacks a payment-method selector and an incorrect selection can confuse paylink ID with transaction ID.
- Hosted-only configuration uses the common Hubtel Basic Authentication credentials, numeric merchant collection account, `https://payproxyapi.hubtel.com/items/initiate`, and `https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}`. Exact official host/path templates are required. The optional pair of `code.hubtel.com/sandbox/v1/...` URLs is allowed **only** outside production.
- Callback/return/cancellation URLs are merchant configuration; an untrusted browser return or callback is never authoritative for settlement. Initiation accepts only provider-returned `responseCode=0000`, `status=Success`, independently matching `clientReference`, `checkoutId` and HTTPS approved hosted URL. Unknown/failed/timeout outcomes are uncertain, not definitive proof of failed charge.
- A hosted **checkoutId** is not stored as a transaction reference; the collection status API returns a separate **transactionId**. The immutable merchant-generated `VG-PAY-...` reference correlates the attempt. A successful Paid observation requires exact independent echoed merchant reference, integer-pesewa amount, valid GHS (missing or null `currencyCode` is documented for the Ghana collection account), and a nonblank transactionId. If a transactionId has already been recorded, later responses must match it. Foreign/contradictory currencies or mismatched IDs fail closed.
- Keep existing Hubtel Direct provider reference/currency checks from mainline PRs #155, #156, #161 and provider-safe 31-character reference creation from PR #162. No historical reference migration or modification.
- Provider feature capabilities remain `lookup_required`, `safeInitiationRetry=false`. Reconciliation remains server-owned and cannot infer payment from HTTP 200 or callback.
- Existing Hubtel refund implementation supports **mobile_money only**. The `PaymentPolicyService.assertReadyIfConfigured()` gate must deny card-capable hosted checkout until independently validated hosted/card-capable refund support exists. Tests explicitly require this; do not bypass by modifying registry checks.

## Environment / rollout
See comments in `apps/api/.env.example`. No actual credentials belong in Git, test fixtures or screenshots. For protected VPS runtime credentials, map the already-configured Hubtel Sales API ID/key only when using the authorized merchant account and store them as `HUBTEL_CLIENT_ID` and `HUBTEL_CLIENT_SECRET`; never copy their values to any public configuration.

**External blocks**:
1. Authenticated read-only Hubtel Transaction Status from Variety VPS still returned **HTTP 403** at 2026-11-19 10:36:34 UTC; issue #90. Hubtel must confirm outbound IPv4 **163.245.212.15** allowlisting **and** exact merchant Transaction Status scope.
2. The provider's refund options must safely cover all hosted checkout payment rails before enabling; the older MoMo-only refund adapter is insufficient. No automatic refund/credit workaround.
3. Canonical `varietygrocery.com` vs active `varietygroceries.com` domain decision and valid TLS/URL routing (issue #157), plus accurate callback permissions and UAT.
4. Reconcile old draft stack #140/#141/#143 rather than merging it wholesale (it predates independent merchant/provider/currency guards and unrelated current modules).
5. Protected, rollback-ready staging build, owner-authorized low-value test, verified matching provider transaction IDs/amount/currency, refund and returns parity, then deliberate go-live approval.

## Tests
New/ported isolated Node 24 adapter tests for hosted config, direct/hosted separation, official URL pairs, basic auth and provider JSON, IDs and receipt truth, amount/currency, misdirected paylinks, HTTP 403, callback authority and refund readiness. Lightweight Bun mock regressions additionally exercise safe hosted handling without network. Full GitHub frontend and API PostgreSQL/security CI required before merge; a green CI is not real merchant payment verification.

**No** live payments, callback deliveries, refunds, changes to active credential files, provider permissions, database migrations, service restarts, storefront release, or POS-integrated staging deployment on this branch.
