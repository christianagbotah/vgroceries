# Owner-only Hubtel ₵1 checkout receipt — 17 November 2026

## Evidence received (separate from grocery orders)

The owner completed a standalone **real** Hubtel-hosted checkout using the existing
Variety Groceries merchant configuration. This is the separately created
`VG-TEST-` owner-checkout reference, **not** the earlier `VG-LIVE-` pilot
reference, and not an order in the application database.

The owner supplied two Hubtel screenshots directly in the project conversation.
They show a **successful payment** page and a matching provider receipt:

| Receipt field | Observed |
| --- | --- |
| Merchant display | Lightworld Technologies |
| Reference | `VG-TEST-` owner test (full reference kept out of this repository) |
| Test item | Variety Groceries, owner-only ₵1 checkout, no groceries |
| Item/subtotal | ₵1.00 |
| Invoice additions | ₵0.00 |
| Total charged | ₵1.01 |
| Checkout/receipt timestamp | 17 Nov 2026, 17:48 (receipt display) |

The unexplained extra **₵0.01** must be clarified from Hubtel's merchant
settlement/fee breakdown. Do **not** infer a tax or fee schedule from this one
receipt, and do not silently book ₵1.01 as the amount payable for groceries.

The owner-only test receipt evidence and its matching checkout reference were
recorded in a mode-0600 file on the VPS (separate from app order data);
no wallet/customer number, personal name, merchant credential or screenshots
are copied into GitHub.

## Independent verification remains blocked

After the owner submitted the payment evidence, an authenticated read-only
transaction status lookup was repeated from the VPS, using Hubtel's documented
Transaction Status endpoint and this exact checkout reference.
The provider gateway returned **HTTP 403** (no transaction record or paid
status body). The VPS public outbound IPv4 observed during testing was
`163.245.212.15`.

Result: **customer-facing paid receipt observed; server-authoritative paid
state NOT established**. This is not evidence that the customer's payment
failed. It is an unresolved status API access issue that Hubtel must fix.

The own-test tool must never write into the grocery order/payment/stock ledger,
and a receipt screenshot or hosted-page redirect must never authorize order
fulfilment or money movement.

## Required follow-up

1. Submit the VPS egress IP `163.245.212.15` to Hubtel for the Transaction
   Status API, and confirm the merchant Sales API ID/account is entitled to
   that endpoint. HTTP 403 alone does not establish the precise cause.
2. Use Hubtel's merchant dashboard to confirm the **matching transaction
   reference, date and amount** and provide the provider transaction ID to the
   authorised finance reviewer, without publishing personal payment data.
3. Once access is approved, perform a **read-only** status lookup for this
   existing paid test; compare reference, merchant account, currency and
   amount before marking the operator evidence verified. Do not make another
   test charge unless separately approved.
4. Resolve hosted-card and mobile-money **refund/dispute** readiness. Existing
   MoMo-only refund support must **not** be assumed to cover hosted card
   checkout.
5. Keep production order payment activation OFF until genuine verification,
   callback idempotency, late payments and refund handling pass isolated UAT.

The duplicate-charge prevention frontend checks in
`docs/SAFE_ELECTRONIC_CHECKOUT_STATUS_20261117.md` are an independent
safety improvement: after provider initiation the customer sees **Waiting for
payment verification**, not another charge button, even when API lookup is
unavailable.
