# Hubtel electronic checkout status safety — staging release

Date: 17 November 2026
Source commit (application): `107fc4ff74595506e3679094e10c3c8ee9e52b4f`
Source branch: `feat/hubtel-payment-safe-status-20261117`
Source PR: #141 (draft, based on draft Hubtel checkout PR #140)

## Outcome

**Staging frontend deployed. Payment provider remains inactive.**
The browser-facing status UI now distinguishes first gateway initiation from
verification of an existing attempt. Previously initiated payment requests
must not offer a second Pay button merely because paymentStatus is pending.

- Portal URL: `https://portal.varietygroceries.com`
- Service: `varietygroceries-portal-canonical.service` (port 3052)
- Release: `/home/lightworld/releases/varietygroceries-portal-hubtel-safe-107fc4f-20261117`
- Deployment drop-in:
  `/etc/systemd/system/varietygroceries-portal-canonical.service.d/zzzzzz-hubtel-payment-safe-status-20261117.conf`
- Previous release:
  `/home/lightworld/releases/varietygroceries-portal-hubtel-stage-5491557-20261117`
- The staging payment API `vg-pos-staging-api.service` (port 3049) was not
  rebuilt, restarted or reconfigured during this release.
- Staging API `PAYMENT_PROVIDER_ID` and `PAYMENT_ENABLED_METHODS` remain
  unset/OFF. No real customer order checkout was enabled.
- Public `https://varietygroceries.com/` remains Coming Soon.

## Checks actually run

- Frozen Bun dependencies installed.
- Two targeted test files: **12 passed / 0 failed / 58 assertions**.
- Full frontend `bunx tsc --noEmit --pretty false`: **passed**.
- Targeted ESLint across payment UI, mock service, and contracts: **passed**.
- Production `bun run build` with the existing canonical portal env:
  **passed**, Next.js generated the `/checkout/status/[id]` route.
- Post-restart portal local HTTP checks:
  `/`, `/shop`, `/cart`, `/checkout`,
  `/checkout/status/readonly-uat`, `/admin/payments`,
  `/admin/pos`, and `/rider`: **all HTTP 200**.
- Staging API catalogue endpoint: **HTTP 200**.
- Public Coming Soon and staging URL: **HTTP 200**.
- No live payments, refunds, callbacks, inventory writes, or account updates
  were made during deployment. This is not a claim of successful end-to-end
  real-money grocery order acceptance.

## Known financial activation blockers

- The real owner-only ₵1 receipt matches the originally requested test,
  but Hubtel's authenticated transaction-status lookup still returns **403**.
- Receipt charged total is ₵1.01 for a ₵1.00 item; the ₵0.01 difference has
  not been established as a specific fee or tax.
- Hubtel status API IP/merchant permission and hosted-card refund/dispute
  handling remain open. Do not flip the payment config on until they are
  independently verified, with callback/replay/late-payment UAT passed.

## Rollback — portal only

To restore the previous working staging portal without touching the API:

```bash
sudo rm /etc/systemd/system/varietygroceries-portal-canonical.service.d/zzzzzz-hubtel-payment-safe-status-20261117.conf
sudo systemctl daemon-reload
sudo systemctl restart varietygroceries-portal-canonical.service
sudo systemctl is-active varietygroceries-portal-canonical.service
```

Before rollback, check whether any newer legitimate drop-in now overrides
the deployment. Do not delete later unrelated changes.
