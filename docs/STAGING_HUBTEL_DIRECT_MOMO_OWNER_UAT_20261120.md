# Staging-only Variety Groceries — Hubtel Direct Mobile Money UAT
20 November 2026

## Purpose and boundary

This document describes a proposed, tightly restricted owner-only payment acceptance test on **portal.varietygroceries.com** through Hubtel Direct Receive Money. **No refund API may be called by Variety Groceries.** Authorized merchant staff handle any required refund in the Hubtel Merchant Portal, with a separately recorded merchant reference and independently reviewed reconciliation evidence. This branch implements Direct MoMo, not hosted checkout. Card and wallet payment support require separate verified provider acceptance. The production Coming Soon website must remain unchanged.

**Default: OFF.** An API release containing this code does not initiate a charge or grant public payment permission. Merchant credentials are server-only.

## Verified starting conditions

- The existing staging API reports `GET /api/v1/checkout/payment-availability` as `electronicAvailable:false`.
- An earlier owner-authorized ₵1.00 **hosted** test was independently verified Paid and reconciled to 100 pesewas. It is NOT proof the **Direct Receive Money** merchant scope works.
- Staging has a published product/variant priced as low as ₵3.00; do not silently alter real grocery catalogue prices or invent a ₵1 grocery line.
- There is currently **no active customer account linked to the owner test email** in the staging database. An authenticated owner customer account and a confirmed personal MoMo number/network are prerequisites.

## Hubtel API contracts

Direct Receive Money:
- POST `https://rmp.hubtel.com/merchantaccount/merchants/{merchantAccountNumber}/receive/mobilemoney`
- Body is PascalCase: `CustomerMsisdn` (233...), `Channel` (`mtn-gh`, `vodafone-gh`, `tigo-gh`), `Amount`, `Description`, `ClientReference`, `PrimaryCallbackUrl`.
- `ResponseCode: 0001` with an independently echoed `TransactionId`, merchant reference and amount means **pending approval**, NOT paid. An HTTP 200/0000 is also not settlement proof.
- Hubtel's documented callback origin is `18.202.122.131`; callbacks are evidence requiring independent authorized transaction-status lookup.
- Exact status GET: `https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}`.
- Never retry an uncertain initiation with a new merchant reference until independent reconciliation.
- Official documentation: https://code.hubtel.com/docs/guides/receive-money

Refund operations (manual, outside this application):
- Authorized staff use the Hubtel Merchant Portal. No automated refund endpoint, callback, or refund API entitlement is required for payment acceptance. Record the merchant refund reference, operator, timestamp, and independently verified final status in an auditable process. A portal submission alone is not evidence that funds were returned.

## Activation prerequisites — all mandatory

1. Confirm Hubtel merchant Direct Receive Money entitlement, collection-status read access and allowlisting for VPS IPv4. The owner reported the prior HTTP 403 status-lookup blocker resolved on 21 November; collect fresh sanitized exact-merchant status evidence before treating this as technically verified. Online Checkout authorization alone does not establish Direct Receive Money permission.
2. Add the legitimate **Direct Receive callback IP** at the exact existing Hubtel ingress while retaining the existing Online Checkout IP and strict POST/body limits; test forged-source HTTP 403 and Nginx validation. Neither client redirects nor callbacks may mark an order Paid without independent transaction status.
3. Register the actual owner as a **customer**, confirm the authenticated customer's mobile number by OTP or other verified account control, and bind the customer **UUID**, phone and exact network on the server. Anonymous guest payments and phones different from the configured test phone must remain blocked.
4. Start from the currently **inactive** Hubtel merchant bundle, but select **only** `PAYMENT_ENABLED_METHODS=mobile_money` and official Direct Receive API URLs. Do not use the hosted endpoint or old paylink-shaped Request Money URL. Do not configure or invoke an automated refund adapter. **Current implementation may still require refund-capability configuration**: remove that obsolete prerequisite in a separate tested source change before any payment activation. Keep existing provider credentials private.
5. Set the temporary pilot environment **only** on staging:
   - `STAGING_MOMO_PILOT_ENABLED=true`
   - `STAGING_MOMO_PILOT_CUSTOMER_ID=<verified customer UUID>`
   - `STAGING_MOMO_PILOT_PHONE=<verified owner +233XXXXXXXXX>`
   - `STAGING_MOMO_PILOT_CHANNEL=<mtn-gh|vodafone-gh|tigo-gh>`
   - `STAGING_MOMO_PILOT_MAX_MINOR=1000` (maximum ₵10; aim for a ~₵3 collection product)
   - `STAGING_MOMO_PILOT_EXPIRES_AT=<UTC timestamp within 24 hours>`
6. Deploy only reviewed/green builds with reversible copies. Verify the collection provider configuration, independently authorized status lookup, authenticated owner-only readiness and one-time attempt guard. Do not enable payment while the old automated-refund capability gate remains in code.

## Mandatory test matrix

- **No credentials, guest and unrelated customer**: `electronicAvailable:false`, electronic checkout rejected. Cash options unchanged.
- **Authorized owner**: `electronicAvailable:true`, method `mobile_money`; grocery collection order under cap with real catalogue price.
- **Wrong/expired account, wrong mobile number or network, over ₵10, second attempt**: reject before any Hubtel prompt.
- **Valid owner request**: one merchant reference; Provider `0001` recorded as **Pending**; show "approve on your phone" rather than Paid.
- **Provider callback and status GET**: independently verify exact reference, transaction ID, amount in integer pesewas and GHS currency, including fees; only then mark Paid and update receipt/stock/fulfilment.
- **Manual refund handling (only if later separately authorized):** staff perform the refund exclusively in the Hubtel Merchant Portal. Record merchant reference and operator; verify final outcome independently before updating internal refund status. Do not trigger a refund API, assume a portal request succeeded, or change paid-order settlement without evidence.
- **Post-test**: remove temporary pilot configuration, reload/restart the API, recheck anonymous availability false, stop all further prompts and preserve immutable audit evidence.

The owner has explicitly authorized a staging test, **not** exposure to unrelated customers. This branch does not enable payment in its default configuration; no test wallet is charged until the owner approves the actual MoMo prompt.

**Emergency kill switch:** Set `STAGING_MOMO_PILOT_ENABLED=false` and restart the staging API. Existing server-side policy must deny electronic checkout even if other protected pilot fields remain. Do not delete historic order, provider attempt or payment evidence.

## 21 November 2026 scope correction and release blockers

- Owner explicitly removed automated refunds from scope and reported Hubtel status HTTP 403 resolved. Neither is a reason to bypass independent status verification.
- The current PR source was originally written with a **matching refund-capability gate**. This documentation change does **not** remove that gate from code, certify payment readiness, or authorize deployment. Remove or adapt the obsolete gate and its tests in a subsequent reviewed source commit while retaining fail-closed payment validation.
- Before release, test status lookup with sanitized provider evidence; verify merchant reference, transaction ID, amount, currency, duplicate callbacks, pending/rejected/expired states, and order/stock consistency. Test frontend and POS-integrated API parity on an isolated environment.
- Do not enable live or shared-UAT payment/COD flags, initiate a payment, alter merchant credentials, migrate shared databases, or deploy without separate explicit owner authorization and completed security/finance acceptance.
