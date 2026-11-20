# Variety Groceries — Hubtel merchant acceptance and release decision
**Evidence date:** 20 November 2026 (UTC)
**Scope:** Verified payment status from the owner-controlled Variety VPS, independent source-level tests, isolated PostgreSQL UAT and the release blockers. **No production go-live authorization is given by this document.**

## Real merchant read-only verification — PASS

On the Variety Groceries VPS with outbound IPv4 `163.245.212.15`, protected Hubtel merchant Sales API credentials and collection account, the official `GET https://api-txnstatus.hubtel.com/transactions/{accountNumber}/status?clientReference=...` was exercised **without printing or recording the credentials, full merchant reference, provider transaction ID, raw provider body or customer identity**.

| Time/lookup | Result | Interpretation |
|---|---|---|
| 20 Nov 2026 14:45:15 UTC, fixed nonexistent synthetic merchant reference | HTTP 404 | Not a conclusive permission test by itself |
| 20 Nov 2026 14:45 UTC, pre-existing 17 Nov merchant-owned test payment | HTTP 200 | Specific legitimate reference was accessible |
| Same existing test payment, read-only inspected JSON | `responseCode=0000`, `Paid`, exact echoed merchant reference, nonblank provider transactionId, paymentMethod `mobilemoney`, amount **₵1.01** | All five independent payment-identity/amount checkpoints matched the original merchant receipt |

**What passed:** Access to **Transaction Status for this merchant-owned transaction** and verified original payment evidence. The earlier IP/merchant-scope 403 blocker recorded in [issue #90](https://github.com/christianagbotah/vgroceries/issues/90) is no longer reproduced on that known reference. The 404 on the synthetic reference is not counted as proof.

**What was not done:** No new hosted checkout or direct MoMo charge, refund POST, payment callback injection, provider fulfilment acknowledgement, SMS, operational data mutation, running service restart, environment change, or production promotion. The paid test reference predates the current source-level UAT and is **not** proof that a Variety order, inventory reservation or application PaymentAttempt was settled.

## Mandatory Hubtel refund compatibility decision — BLOCKED

As of 20 Nov 2026 Hubtel's official API reference and refunds guide document `POST https://refund-api.hubtel.com/refund/{accountNumber}/order/{transactionId}` **for full Mobile Money refunds within 45 days**, with a **202/pending** acceptance and a separate final callback. A second in-process request may produce HTTP 423/4515; a charge below ₵1 produces code 4000. The refund API uses an IP allowlist, **separate from the now-verified read-only Transaction Status route**.

Official documentation:
- https://code.hubtel.com/docs/api/v1/refunds
- https://code.hubtel.com/docs/guides/refunds
- https://code.hubtel.com/docs/api/v1/online-checkout
- https://code.hubtel.com/docs/api/v1/transaction-status

**Hubtel Online Checkout offers Mobile Money, cards and Hubtel wallet; the documented refunds endpoint does NOT establish card/wallet refund support.** Existing `HubtelRefundProvider.capabilities().methods` is `["mobile_money"]`. **Keep hosted checkout disabled through the existing PaymentPolicyService refund-parity gate.** The only acceptable resolution is explicit provider refund coverage and implementation/UAT for every enabled rail, or a separate reviewed and enforceable merchant policy using a method that is supported by both checkout and refunds. Do not fake refund adapter capabilities or use unrelated bank transfers as a silent workaround.

**Refund API access test:** No arbitrary GET method or safe refund-permissions endpoint is documented. The only production operation is a mutating POST that can return real funds. No production refund request should be sent solely to test credentials. A controlled full refund of the owner's existing test payment would require independent confirmation that the payment is still refundable, the recipient/amount and callback are correct, and an explicitly authorized transaction-level pilot. Do not claim this is complete on a successful payment-status GET.

## Checkout, callbacks, retries and stock consistency — ISOLATED TESTS

Automated tests added under `apps/api/test/hubtel-merchant-reconciliation-uat.spec.ts` use actual Hubtel provider adapter methods, synthetic merchant/client references, a strict in-memory HTTP interceptor **that never contacts Hubtel**, a test-only synthetic refund capability shim and a separate PostgreSQL `variety_foundation_test` database. These intentionally test application behaviour **without enabling the real hosted refund rail**.

| Scenario | Acceptance criterion | Release state |
|---|---|---|
| Hosted initiation and original order | One idempotent durable PaymentAttempt, truthful pending order and trusted hosted redirect; no paid state from checkout initiation | Test in isolated CI |
| Callback body claims `Failed`, Hubtel status says `Paid` | Source-side `lookup_required` applies the independently verified paid amount/reference/provider transaction ID once | Test in isolated CI |
| Repeated identical provider callback | One `payment.succeeded` outbox event and one durable provider event; callback replay recorded safely | Test in isolated CI |
| Callback claims `Paid`, status says `Unpaid` | Pending payment remains pending; no stock/fulfilment paid assertion | Test in isolated CI |
| Status service responds HTTP 403/timeout | Uncertain result, no paid confirmation and no second charge on same payment key | Test in isolated CI |
| Provider status amount differs by ₵0.01 | Fail-closed reconciliation, not a successful payment | Test in isolated CI |
| Duplicate initiation keys / late callback / stock lost / cancellation | Existing Payments Authority DB integration suites enforce one active attempt, serialized stock reservation and manual review exceptions | Verify full API CI |
| Hosted refund rail mismatch | Actual MoMo-only refund provider must not unlock hosted checkout | Verify `hubtel-hosted-launch-gates.spec.ts` and full API CI |

**Warning:** A synthetic test-only refund adapter may be injected *only by the isolated API test constructor* to exercise other code paths. This does not modify the runtime provider registry or prove any refund has been made.

## Isolated staging vs deployed portal — NOT CLEARED

The running POS-integrated pair remains **portal port 3052** and **API port 3049**. The older **3037/3027** pair must not be accidentally promoted in its place. The 20 November read-only manual parity comparison found **79 canonical source routes**, **82 built POS staging routes**, **74 shared**, **8 staging-only** and **5 canonical-only**; draft POS PR #175 adds 2 more not-deployed routes. Source and built staging need an immutable, reconciled release pair. See:
- `docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`
- `docs/MANUAL_SCREENSHOT_UAT_RUNBOOK_20261120.md` (manual PR #176)

Do not call route presence, a public HTTP 200 or one paid merchant receipt a completed order-to-delivery UAT. Protected database restore, real role and tenant tests, stock/receipt/COD proof, callback ingress and a rehearsed rollback are mandatory.

## Go/no-go matrix (no fabricated approvals)

| Gate | Evidence | Result |
|---|---|---|
| Status API reachability for existing merchant payment | 20 Nov VPS authenticated GET HTTP 200 | **PASS** |
| Merchant reference + transaction ID + amount + Paid | Genuine earlier ₵1.01 merchant receipt matched | **PASS** |
| Hubtel POST creation and callback signed ingress in exact deployed build | Unverified against live Hubtel callback | **NOT TESTED** |
| Duplicate callback / payment race / stock authority | Disposable DB/CI suites | **PENDING CI** |
| Hosted MoMo/card/wallet refund parity | Official documented refund limited to full MoMo refunds | **BLOCKED** |
| Live refund endpoint whitelist and final callback | No authorized non-mutating verification method | **NOT TESTED** |
| Protected staging portal/API source parity | 79 vs 82 route split | **BLOCKED** |
| End-to-end low-value merchant checkout and payout reconciliation | Requires owned, approved pilot and release gates | **NOT TESTED** |
| Production deployment / public money activation | Multiple mandatory blockers | **NO-GO** |

### Operator readiness sequence
1. Run latest exact-head frontend and full disposable Postgres API CI, and review each scenario's evidence.
2. Obtain written refund-rail clarification from Hubtel; implement and isolate-test each supported refund path, including callbacks and 45-day cutoff.
3. Reconcile portal/API exact release SHAs and private staging migrations, credentials/callback domains, test data and rollback.
4. Run a low-value **authorized** payment through the actual application (not the older one-off test checkout), verify callback and status independently, check order/stock exactly once, and perform a separately authorized eligible refund with the provider's completed callback.
5. Review support and finance manual screens, UAT roles, error recovery and reconciliation, then obtain formal release approval. **No automatic deployment.**
