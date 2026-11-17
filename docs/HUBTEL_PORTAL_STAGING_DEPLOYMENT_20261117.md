# Variety Groceries Hubtel Online Checkout — staging deployment
Date: 17 November 2026
Owner-approved destination: https://portal.varietygroceries.com/

## Deployment outcome

**Hubtel integration code is deployed to the existing portal staging site, but
payment initiation is NOT activated.** No Hubtel sandbox or live merchant
credentials were present in the staging API environment at deployment; no
provider network calls or real payments were made.

- Exact GitHub code source: `5491557e6c308f3ef16dc06aec7f8cbd9915a06b`
  (the code SHA, prior to this documentation-only commit).
- Portal release:
  `/home/lightworld/releases/varietygroceries-portal-hubtel-stage-5491557-20261117`
- Portal service: `varietygroceries-portal-canonical.service`, local port 3052.
- Portal systemd drop-in:
  `/etc/systemd/system/varietygroceries-portal-canonical.service.d/zzzzz-hubtel-online-checkout-staging-20261117.conf`
- API service: `vg-pos-staging-api.service`, local port 3049, isolated staging
  PostgreSQL database and existing environment files preserved.
- API release:
  `/home/lightworld/releases/varietygroceries-pos-staging-api-hubtel-5491557-20261117/apps/api`
- API systemd drop-in:
  `/etc/systemd/system/vg-pos-staging-api.service.d/90-hubtel-online-checkout-staging-20261117.conf`
- **Preservation of POS work:** The API release is a surgical runtime overlay,
  retaining the exact previous POS staging compiled API and generated Prisma
  dependencies. Only THREE JS modules come from the tested Hubtel source SHA:
  `dist/src/config.js`, `dist/src/payments/hubtel-payment-provider.js`,
  `dist/src/payments/payment-initiation.service.js`.
  `DEPLOYMENT_MANIFEST` and `PAYMENT_MODULE_HASHES` are stored in that
  immutable release. Nothing in the dirty POS source worktree was reset,
  committed, deleted or overwritten.

## Build and acceptance checks

- Isolated source worktree built on VPS: frozen Bun frontend dependencies,
  compiled contracts, API npm install/Prisma generation, full API TypeScript
  build, mock Hubtel tests, frontend TypeScript and production Next build.
- The staged API release code load test verified hosted-only capability
  with `trustMode=lookup_required` and made no provider network request.
- Source module-diff audit verified ONLY the three payment JS modules differ
  from the prior staged API compiled release.
- Post-rollout API `GET /api/v1/catalog/products`: HTTP 200.
- Unauthenticated `GET /api/v1/admin/pos/tills`: HTTP 401.
- Public staging portal `https://portal.varietygroceries.com/`: HTTP 200.
- Checkout, cart, catalogue, staff, dispatch, admin products and POS routes
  independently checked as HTTP 200.
- Public `https://varietygroceries.com/` remains **Coming Soon** with HTTP
  200. No customer stock/payment/order writes or test charge attempted.

## Test mode and remaining prerequisites

`PAYMENT_PROVIDER_ID` and all Hubtel keys/account numbers are **unset**
in the staging API. Therefore the gateway is safely **inactive** despite
deployed source.

To make a REAL Hubtel SANDBOX checkout available, require:
1. Legitimate merchant-issued sandbox client ID/secret and collection account,
   stored ONLY in the isolated VPS staging secret env files. Never post keys
   into GitHub, chat, screenshots or browser JavaScript.
2. Hubtel-approved sandbox hosted initiation and transaction status URLs,
   callback/return URLs, allowed hosted payment domain and independent
   transaction status checks.
3. A safe sandbox refund/evidence test arrangement; the production
   `PaymentPolicyService` intentionally blocks enabling hosted card
   acceptance using a MoMo-only refund adapter. Do NOT disable this guard
   for a live merchant or substitute an unimplemented card refund.
4. Verified sample callbacks, duplicate/uncertain outcomes, card and simulated
   MoMo approval, matching reference/amount/currency and final order status.

**Sandbox tests are not equivalent to a paid live transaction**; require
owner approval and verified financial/refund controls before using real money.

## Rollback

Rollback BOTH services if needed:

```bash
sudo rm /etc/systemd/system/vg-pos-staging-api.service.d/90-hubtel-online-checkout-staging-20261117.conf
sudo rm /etc/systemd/system/varietygroceries-portal-canonical.service.d/zzzzz-hubtel-online-checkout-staging-20261117.conf
sudo systemctl daemon-reload
sudo systemctl restart vg-pos-staging-api.service
sudo systemctl restart varietygroceries-portal-canonical.service
```

This restores the prior API working directory
`/home/lightworld/workspaces/vgroceries-pos-integrated-20261110/apps/api`
and prior portal
`/home/lightworld/releases/varietygroceries-portal-mobile-footer-glow-33416ee-20261117`.
The pre-existing immutable releases and original environment files remain
unchanged.

Current source is still a **draft** PR; deployment to staging is not merge,
production merchant sign-off, refund approval or public launch.
