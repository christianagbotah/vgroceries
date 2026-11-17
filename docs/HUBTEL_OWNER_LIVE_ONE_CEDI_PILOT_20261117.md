# Owner-authorized ₵1 Hubtel live checkout pilot — 17 November 2026

This is **NOT** activation of online payments for grocery orders. It is a single
owner-approved, low-value, **real merchant** Hubtel checkout. The owner completes
any payment personally on Hubtel. A successfully created checkout URL is not
proof of settlement. Never credit the application ledger or fulfil stock based
on this pilot.

## Verified VPS facts

- Live merchant keys were already provided in the protected file:
  `/home/lightworld/config/varietygroceries/api.env` (mode 0600,
  lightworld user). Names: `HUBTEL_SALES_API_ID`,
  `HUBTEL_SALES_API_KEY`, `HUBTEL_COLLECTION_ACCOUNT_NUMBER`. The code
  reads them in memory **only during one-time checkout creation**.
  No values are copied to browser, code, GitHub, logs, or new environment files.
- Previous owner checkout probes from 14 Nov 2026 successfully created
  accepted `0000` checkouts with these same merchant credentials; no charge.
- An actual authenticated *read-only* status lookup using an earlier unpaid
  checkout reference returned **HTTP 403** from the merchant's VPS. The
  outward-facing IPv4 is `163.245.212.15`. Request Hubtel to allowlist that
  source address for `api-txnstatus.hubtel.com` and verify
  `GET /transactions/{accountNumber}/status?clientReference=...`
  before using automatic paid-order settlement.
- Official Online Checkout initiation
  `POST https://payproxyapi.hubtel.com/items/initiate` explicitly does
  **not** require IP allowlisting. This does not remove the status-check
  allowlist requirement.

## Pilot isolation

- Callback/pilot code: `ops/hubtel-owner-pilot/server.mjs` and installed
  `/home/lightworld/webapps/vg-hubtel-pilot/server.mjs`.
- Local listener: 127.0.0.1:3097 (Node 24, systemd
  `vg-hubtel-owner-pilot.service`, restricted user lightworld).
- HTTPS route: `https://portal.varietygroceries.com/hubtel-owner-pilot/`
  with an Nginx proxy location added to
  `/usr/local/apps/nginx/etc/conf.d/zzz-varietygroceries-portal.conf`.
  Backup: the adjacent file ending in
  `.before-hubtel-owner-pilot-20261117.bak`.
- Pilot capability URL contains a cryptographically random 48-character token.
  **Never commit or paste that token into GitHub/issue comments.**
  It was shared directly with the owner only.
- State written to mode-0600 files beneath
  `/home/lightworld/data/varietygroceries/hubtel-owner-pilot`, filename
  derived from SHA-256 of the token. Data includes only amount/reference,
  checkout link, timestamp, and minimal callback result. No keys, phone
  numbers, card information, wallet PINs, or full callback bodies.
- Owner test amount: **₵1.00**; reference prefix `VG-LIVE-`.
  Unique client references are limited to 32 characters, and hosted redirect
  URL must match HTTPS `pay.hubtel.com`.
- Checkout initiation returned HTTP 200, response code `0000`, and a
  validated Hubtel-hosted URL. **No payment was made by the initiator**.
  The owner may visit the pilot link and authorize a MoMo/card payment.
- Pilot page expires access to the Hubtel link after about 24 hours.
  It is a test-only page, NOT a storefront order and has no stock effect.
- Callback receiver is deliberately **NON-AUTHORITATIVE**: even `Success`
  is presented as unverified. Callback only writes a minimal test record.
  It never marks a grocery order paid, never sends stock or fulfilment events,
  and never triggers refunds, disbursements or new charges.
- A simulated HTTPS POST callback returned 200 with
  `paymentVerified:false` and produced a local `UNVERIFIED_CALLBACK`
  record; that dummy record was deleted afterwards.
- The public owner test page responded HTTP 200 and displayed the ₵1 Hubtel
  link. The original staging API, storefront and public Coming Soon site
  remained operational.

## Next requirements

After the owner pays (optional), review its reference in the Hubtel merchant
dashboard for independent confirmation, and compare with the pilot callback.
A callback saying `Success` is not sufficient. Do not disclose keys or card
information; merchant transaction reference is sufficient for a follow-up.

Before enabling `PAYMENT_PROVIDER_ID=hubtel` and
`PAYMENT_ENABLED_METHODS=hosted_checkout` on the staging API:
1. Confirm successful source-IP allowlisting and a genuine status lookup;
2. Integrate proper real provider reconciliation against a durable grocery
   order reference/amount, with duplicate and replay protections;
3. Resolve hosted card/mobile-money refund and dispute process rather than
   bypass the existing refund-readiness gate;
4. Complete owner-accepted checkout, order and refund UAT in staging.

The staging API payment provider remains disabled; merely creating a pilot
checkout does not alter that configuration.

## Shutdown / rollback

To disable the isolated owner test without affecting the rest of the portal:

```bash
sudo systemctl stop vg-hubtel-owner-pilot.service
sudo systemctl disable vg-hubtel-owner-pilot.service
# Restore the saved Nginx configuration only after checking for later
# legitimate edits made since the pilot. Do not overwrite new changes blindly.
sudo /usr/local/apps/nginx/sbin/nginx -t
sudo /usr/local/apps/nginx/sbin/nginx -s reload
```

The HTTPS Nginx pilot location can be removed independently from the
staging API and web service. The privileged merchant key file remains
untouched.
