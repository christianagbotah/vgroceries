# Hubtel Online Checkout — inactive configuration preparation while awaiting status whitelisting
19 November 2026. The active VPS portal and APIs currently do **not** have electronic payment methods enabled. The Hubtel hosted provider adapter has merged to GitHub, but source code does not equal a deployed and authorized payment gateway.

## Existing protected source (verified read-only)
The VPS already stores Hubtel Sales API identity and credential and numeric collection account in `/home/lightworld/config/varietygroceries/api.env` under the names `HUBTEL_SALES_API_ID`, `HUBTEL_SALES_API_KEY`, `HUBTEL_COLLECTION_ACCOUNT_NUMBER`. Values must never be committed, printed in logs, screenshots, pasted into frontend settings, or sent through chat.

## Safe staged preparation (not a payment launch)
Run on the authorized VPS from a checked-out, verified repository revision:

```bash
python3 scripts/prepare-hubtel-hosted-staging-env.py
# Only after dry-run validation; explicitly prepare an INACTIVE root/private bundle:
python3 scripts/prepare-hubtel-hosted-staging-env.py --write
```

The default action is **read-only**, validates protected credential identity and merchant account format, and does not write a file. `--write` creates exactly one new protected `0600`, exclusive-create, no-symlink file: `/home/lightworld/config/varietygroceries/hubtel-hosted-INACTIVE.pending`. It copies required credentials only inside the authorized VPS; stdout never prints credential or merchant-account values. **It does not add the file to a systemd EnvironmentFile, start a service, initiate checkout, verify money or change a payment flag.** Re-running refuses to overwrite.

The prepared file contains the hosted-only payment policy and vetted production URLs, a hosted callback routed at `https://portal.varietygroceries.com/api/v1/payments/providers/hubtel/events`, and return/cancel pages under `https://portal.varietygroceries.com/checkout/payment-return`. These host paths were checked to serve HTTPS, but the *actual callback permissions and lifecycle remain unproven* until safe provider UAT.

## Required gates before any activation
1. Hubtel must allowlist outbound VPS IPv4 for Transaction Status and authorize the **collection** account for the Sales API ID/key; read-only synthetic checks have returned HTTP 403 (issue #90).
2. Hubtel hosted checkout may present MoMo and cards. The current Hubtel refund provider supports only **mobile_money**, so `PaymentPolicyService.assertReadyIfConfigured()` must keep hosted checkout **disabled** until verified refund rail parity or a separate approved product policy provides compatible refunds. Never bypass this rule merely to display the hosted page.
3. Build and test the latest API and checkout frontend as an **isolated release**, run PostgreSQL schema/integration/security tests, and validate credentials on a staging-only process. Do not restart or replace the current POS-integrated portal until isolated UAT passes and rollback is verified.
4. Run explicitly approved, low-value real-money transaction initiation, provider reference/amount/currency/status verification, callback, order fulfilment and refund flow **only after** provider scope is authorized. A hosted URL, HTTP 200 or browser return does not mean paid.
5. Operator approves and executes a controlled cutover with verified backups, rollback commands and health checks; the public Coming Soon site is not part of this activity.

## Verification
Run `bun test scripts/hubtel-hosted-staging-preparation-regressions.test.ts` using exclusively synthetic fixtures. Tests check default no-write, `0600`, credential redaction, no overwrite and missing-account fail-closed behavior. **The file in this PR is an operator preparation tool, not a claim that staging has already been configured.**
