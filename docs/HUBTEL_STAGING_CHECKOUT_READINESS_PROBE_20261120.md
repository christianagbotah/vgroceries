# Hubtel staging: read-only checkout readiness parity audit — 20 November 2026

## Current measured result

On the authorized VPS, the currently served HTTPS staging portal at `https://portal.varietygroceries.com` returned **HTTP 404** for `GET /api/v1/checkout/payment-availability` on 20 November 2026. The endpoint is present in GitHub `main` source at `086dbfcd`, but **source presence is not deployed-route parity**. This is a **NO-GO** for activating electronic checkout on that portal.

No charge, refund, callback, inventory mutation, merchant balance query, configuration change, service restart or deployment was performed. The public Coming Soon domain was not modified.

## One-command operator probe

From a checked-out Variety Groceries source tree on the authorized VPS:

```bash
python3 scripts/audit-staging-checkout-readiness.py
# Optional alternate HTTPS staging origin:
python3 scripts/audit-staging-checkout-readiness.py --origin https://portal.varietygroceries.com
python3 -m unittest scripts/test_audit_staging_checkout_readiness.py -v
```

The script makes **one unauthenticated, read-only GET** to the nominated HTTPS origin. It rejects redirects, missing/forbidden routes, non-JSON responses, responses without `Cache-Control: no-store`, demo-mode data, unexpected response keys, and invalid availability types. It never records merchant credentials or prints the response body.

Exit codes:
- **0**: endpoint and strict public schema match and electronic availability reports true. **This is NOT authorization to activate money flows or go live.**
- **3**: endpoint/schema are valid, but electronic availability explicitly reports false. **NO-GO**.
- **4**: route, transport or safe schema could not be verified. **NO-GO**.

The API must return only `{"ok":true,"data":{"electronicAvailable":boolean,"mode":"production"}}` with JSON content type and no-store. A customer screen may use this as a *display hint* only: the backend is still responsible for authorizing each payment/order, verifying provider status, idempotency and stock.

## Remaining independent launch gates

1. Confirm the proposed portal/API immutable release pair exactly preserves active POS-integrated **3052/3049** behaviour. Do not swap in older **3037/3027** as a routine release.
2. Build, test, deploy and safely roll back an isolated release pair with this GET route; prove both anonymous browser and backend route can respond with the intended schema. Re-run the probe against the actual mapped HTTPS portal after controlled deployment.
3. Establish Hubtel hosted **MoMo/card/wallet refund rail coverage** or an explicitly reviewed alternate product/refund policy that does not silently disable existing consumer rights. **Do not bypass server-side `PaymentPolicyService` refund parity.**
4. Validate protected callback delivery, independently verified paid status/reference/transaction/amount/currency, duplicate callbacks, pending/late payments, refund settlement reconciliation and customer notices. Confirm the already-tested status API evidence without initiating a payment.
5. Complete clean CI, isolated PostgreSQL migration/restore, real POS and customer role UAT, rollback drill and operator sign-off before any controlled low-value payment pilot. Public `varietygroceries.com` remains Coming Soon until those gates are satisfied.

This probe is intentionally not an all-purpose release acceptance or a substitute for a controlled production deployment. It closes one **observable deployment-contract gap** and gives release operators a deterministic fail-closed result instead of inferring readiness from source code or a browser redirect.
