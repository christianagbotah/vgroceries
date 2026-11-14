# Hubtel API Integration — Developer Reference Handoff (14 November 2026)

## Status and scope

Source: owner-supplied Hubtel Developer Portal pages, all marked **last updated 12 October 2026**. These are implementation contracts, **not** proof that each merchant service is enabled.

**Current release status:** No live Hubtel operations are activated by this change. The existing `HubtelPaymentProvider` remains the Request Money/paylink adapter; `HubtelRefundProvider` and its callback authority remain unchanged. The new `HubtelOnlineCheckoutProvider` and `HubtelSmsClient` are **staged but deliberately unregistered/unwired**. No new user-facing checkout or automatic SMS is claimed.

The public `varietygroceries.com` site remains Coming Soon; `portal.varietygroceries.com` is the staging application. Do not deploy live payments or switch the public site as part of this documentation handoff.

## API contracts supplied by the owner

| Use | Method and endpoint | Notes |
| --- | --- | --- |
| Hosted Online Checkout | `POST https://payproxyapi.hubtel.com/items/initiate` | Basic Sales API ID/Key; required `totalAmount`, `description`, `callbackUrl`, `returnUrl`, `cancellationUrl`, `merchantAccountNumber`, `clientReference`. Returns `checkoutUrl`, `checkoutId`, `checkoutDirectUrl`. |
| Payment status | `GET https://api-txnstatus.hubtel.com/transactions/{Collection_Account_Number}/status?clientReference=...` | Basic Sales auth; mandatory reconciliation after five minutes without final callback. Status `Paid`, `Unpaid`, `Refunded`; `currencyCode` may be null. |
| Direct Mobile Money receipt | `POST https://rmp.hubtel.com/merchantaccount/merchants/{Collection_Account_Number}/receive/mobilemoney` | Channel `mtn-gh`, `vodafone-gh`, `tigo-gh`; customer approval required. Owner-provided docs require registration/OTP protection against unsolicited prompts. |
| Full Mobile Money refund | `POST https://refund-api.hubtel.com/refund/{Collection_Account_Number}/order/{orderId}` | JSON `{ "callbackUrl": "https://..." }`. Original Hubtel **orderId**, not an arbitrary checkout ID. |
| Refund callback | Merchant-hosted HTTPS POST | `responseCode=0001` means **pending**, final `0000` with amount and external transaction ID indicates success. |
| Disbursement to MoMo | `POST https://smp.hubtel.com/api/merchants/{Disbursement_Account_Number}/send/mobilemoney` | Requires funded disbursement account, unique `ClientReference`, callback and status reconciliation. |
| Disbursement status | `GET https://smrsc.hubtel.com/api/merchants/{Disbursement_Account_Number}/transactions/status?clientReference=...` | Poll after five minutes only when callback missing. |
| Send to bank | `POST https://smp.hubtel.com/api/merchants/{Disbursement_Account_Number}/send/bank/gh/{BankCode}` | Optional later; requires verified recipient and bank code. |
| Merchant balances/transfers | `GET/POST https://trnf.hubtel.com/api/inter-transfers/{Collection_Account_Number}` | Separate collection vs. disbursement balances; transfer is asynchronous, needs callback/status. |
| Simple SMS | `POST https://sms.hubtel.com/v1/messages/send` | Basic SMS ClientID/ClientSecret; JSON `From`, `To`, `Content`. Submission is **not** delivery. |
| SMS status | `GET https://sms.hubtel.com/v1/messages/{messageId}` | Track delivery receipt statuses; optional batch endpoints also documented. |
| Wallet verification | `GET https://rnv.hubtel.com/v2/merchantaccount/merchants/{Collection_Account_Number}/mobilemoney/verify` | Optional, purpose-limited account checks before payouts. Do not request national identity documents for routine grocery checkout. |

Hubtel also provided Direct Debit preapproval, Recurring Invoice, Programmable Services/USSD and mobile SDK references. Those are **not** necessary to ship single-purchase grocery checkout; avoid activating customer preapprovals or recurring debits without a new product requirement.

## Security and money-state invariants

1. The supplied documentation states most financial endpoints are **live-only** and require merchant server public IP whitelisting through Hubtel. There is no confirmed sandbox in these references. Never run live API smoke tests with a real payer, refund, transfer or SMS recipient without explicit owner approval and controls.
2. Sales Basic Auth uses `API ID:API Key`; SMS Basic Auth uses **different** `ClientID:ClientSecret`. Base64 is encoding, not encryption. Keep keys in server secrets, never public `NEXT_PUBLIC_*`, browser JavaScript, screenshots, GitHub, access logs, or query strings.
3. Use the **POST** SMS route; the supplied GET route places secrets and message body in URL parameters.
4. Treat callback body as an **untrusted event hint** unless cryptographic verification is independently established. For checkout, look up transaction status over the authenticated server connection and match merchant reference, GHS amount, and provider identity before applying capture truth. Verify callback ingress with Hubtel before any production go-live; source-IP allowlisting alone is not a signature.
5. A checkout initiation `responseCode=0000` means the checkout URL was created; it is **not** evidence that the customer paid. A Direct Receive Money `0001` means pending. SMS `status=0` means submitted; delivery is determined separately.
6. Preserve the repository's existing idempotent `PaymentAttempt`, `PaymentOutcomeService`, `RefundObligation`, `RefundExecution`, staff approvals and reconcile-on-uncertain-result rules. Never re-send an uncertain debit or payout blindly.
7. **Hubtel hosted checkout clientReference must be at most 32 characters.** The existing `merchantReference()` generator emits 39 chars (`VG-PAY-` + 32 hex). Do not wire the new adapter until a backwards-compatible 32-character generator and regression tests are completed.
8. The hosted checkout returns `checkoutId` at initiation; refund requires the **original paid Hubtel orderId**. The status response exposes `transactionId`, but equivalence to refundable `orderId` has not been established by the supplied documents. Confirm this mapping with Hubtel and record the right immutable capture reference before enabling refund execution.
9. The supplied refund endpoint has no `amount` parameter. Restrict to **full eligible Mobile Money refunds**, completed within **45 days**, with a minimum original transaction amount of **₵1.00**. It cannot be used as a general partial-refund/payout endpoint. After 45 days the documentation directs the merchant to `business@hubtel.com`. A `4515` in-progress response must not trigger a second refund.
10. Hosted checkout may allow cards or other methods that the current Hubtel refund adapter does not support. The `PaymentPolicyService` requires method-compatible refund authority. Avoid misrepresenting `hosted_checkout` as `mobile_money`; do not register the hosted adapter until the non-MoMo refund policy and provider capabilities are approved.
11. New cash movement needs role-based approval, immutable audit, recipient verification, limits, and a funded disbursement account. No automatic customer payouts or Collection → Disbursement transfers from an AI recommendation.

## Work staged in this branch

- `apps/api/src/payments/hubtel-online-checkout-provider.ts`: documented checkout creation, lookup-required callback hints, authoritative transaction status, Ghana money normalization, failed-closed reference validation.
- `apps/api/src/notifications/hubtel-sms-client.ts`: server-only simple SMS POST and delivery-status client. Neither an outbox worker nor customer notification dispatch is switched on.
- `apps/api/test/hubtel-online-checkout-provider.spec.ts`: unit fixtures for correct checkout payload, callback trust boundary, status reconciliation and malformed references.

## Owner-configured secrets: staging configuration

The merchant has confirmed that the Sales API ID/Key, Collection Account Number,
SMS ClientID/Secret, and approved Sender ID were placed in
`/home/lightworld/config/varietygroceries/api.env`. ChatGPT has **not**
opened that VPS file or verified its values/permissions: no Remote Desktop
Commander device is connected.

The backend `readConfig()` now parses the following independent, all-or-nothing
server-side groups:

- Sales: `HUBTEL_SALES_API_ID`, `HUBTEL_SALES_API_KEY`,
  `HUBTEL_COLLECTION_ACCOUNT_NUMBER`
- SMS: `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`,
  `HUBTEL_SMS_SENDER_ID`

An incomplete group or invalid format fails configuration validation; when valid,
both remain **staged/inactive**. No callbacks, payment adapter, SMS worker or
refund execution are automatically enabled by their presence. Existing legacy
`HUBTEL_CLIENT_ID` / `HUBTEL_REQUEST_MONEY_URL` is a *different* adapter
configuration. Do not set it using Sales keys without verifying that contract.

After the branch is approved, deployed and the API package is compiled, this
**offline, no-network** preflight checks only presence/format and never prints
secrets (use the service-account rights required to read the protected env file):

```bash
/home/lightworld/runtime/node24/bin/node \
  --env-file=/home/lightworld/config/varietygroceries/api.env \
  /home/lightworld/webapps/varietygroceries-api/current/apps/api/dist/scripts/check-hubtel-merchant-config.js
```

The preflight cannot verify merchant scope, account ownership, whitelisting,
real payment results or current VPS deployment status. It does not replace
end-to-end staging acceptance. **Do not send the full `api.env` file in chat.**

## Next gates before activation

1. Obtain merchant Collection/Disbursement account numbers and dedicated Sales/SMS API credentials **through protected deployment configuration**, not chat or PR. Verify merchant scopes and allowlist the VPS outbound public IP with Hubtel.
2. Confirm merchant-approved callback paths, signed callback guarantees (if any), trusted callback IP list and inbound firewall rules. Confirm exact paid orderId vs transactionId vs checkoutId refund identity.
3. Shorten new merchant references to <= 32 characters, then test old reference reconciliation. Determine precise method capability of hosted checkout and implement supported refund handling for card vs. MoMo **without** loosening existing refund-gate checks.
4. Wire the provider through `ApiConfig`, registry and `PaymentPolicyService` behind disabled-by-default configuration; do not overwrite existing payment credentials or provider selections. Reconcile incomplete payment outcomes after five minutes.
5. Introduce SMS outbox receipts/retries, sender ID configuration, consent checks, delivery receipts, no duplicate customer notifications, and no raw PII or credential logging.
6. Run `npm run build` and `npm test` in `apps/api` on Node 24 with the connected PostgreSQL test setup, complete end-to-end negative cases and load/staging UAT. No tests or API calls in this branch are evidence of live provider connectivity.

## Acceptance scenarios

- Two callback deliveries for the same captured payment produce only one order/payment/stock effect.
- Browser redirect without an authenticated status lookup cannot mark paid.
- Last-unit reservation conflict after late payment routes to staff `requires_review`, never fictional stock.
- A failed/unknown charge remains pending/review and does not prompt an automatic repeat payment.
- Partial or older-than-45-days Hubtel refund is declined or routed to controlled alternative; never pretends to succeed.
- A sent-but-undelivered SMS remains distinct from Delivered.
- Refunds, payouts and transfers are not possible from customer-controlled amounts or without staff authority.

All integration credentials and account numbers in these docs are placeholders, **not** live merchant values.
