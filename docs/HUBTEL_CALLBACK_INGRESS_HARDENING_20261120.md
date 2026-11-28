# Hubtel Online Checkout — exact callback ingress rollout (20 November 2026)

## Source and purpose

Hubtel's [callback reference](https://code.hubtel.com/docs/callbacks) documents `108.129.40.25` as the source IP for Online Checkout callbacks. The callback body is not trusted as settlement authority: the Variety Groceries backend independently asks Hubtel for the authoritative transaction status using a server-owned reference. The hosted customer return URL never confirms a payment.

The canonical staging portal uses the POS-integrated frontend at **3052** and matching API at **3049**, not the older 3037/3027 pair. A general `location /api/v1/` formerly exposed `POST /api/v1/payments/providers/hubtel/events` to all source IPs. This change adds a more specific, narrowly scoped Nginx **exact-path** handler.

The new handler rejects requests not originating from the published Hubtel IP, allows POST only, limits the raw body to 64 KiB, forwards to the **existing** 3049 API service and replaces forwarded-client headers with `$remote_addr` instead of appending potentially spoofed browser values.

## Controlled rollout

The application and payment flags are **not** changed. The default script action is read-only:

```bash
python3 deploy/scripts/apply-hubtel-callback-ingress.py
python3 -m unittest scripts/test_hubtel_callback_ingress.py -v
```

To apply a separately reviewed Nginx-only change on the authorized VPS:

```bash
python3 deploy/scripts/apply-hubtel-callback-ingress.py --apply
```

It validates exact canonical port/hostname markers; rejects unexpected or symlinked files and unknown Nginx routes; checks current Nginx; writes a root-owned `0600` backup into `/root/varietygroceries-proxy-backups`; adds a dedicated include under `/usr/local/apps/nginx/etc/conf.d/includes/`; checks Nginx syntax again; and reloads with `nginx -s reload` (the VPS's SysV-compatible nginx.service does not support systemctl reload). A syntax/reload error rolls the files back to their original content.

After deployment, a public client not originating from Hubtel must see **HTTP 403** at the exact callback path. Even `X-Forwarded-For: 108.129.40.25` supplied by that client must be ignored. This expected 403 demonstrates an access boundary, **not** functional provider callback delivery. Further approved provider UAT must verify legitimate callback ingress from Hubtel's source, real settlement verification and retries.

## Boundaries

- **No** online checkout is activated; no money is charged, refunded or settled; no inventory, order, login or API service is modified.
- The active customer portal, public Coming Soon website and POS source/runtime pair stay unchanged.
- If Hubtel expands or changes its outbound callback source IPs, the allowlist must be reviewed and updated using current **provider-authenticated** evidence, not an untrusted request header.
- The new route alone is **not** approval to open electronic checkout. Hosted refund support remains unproven for card/Hubtel wallet, while the documented standard Refund API covers eligible Mobile Money only. The payment readiness endpoint must be deployed to the correct POS staging source and pass the end-to-end finance test.
