# Hubtel Transaction Status access diagnostic — 16 November 2026

## Purpose

Run a **single authenticated, read-only GET** from the actual merchant VPS to
the documented Hubtel Transaction Status service. It checks the current
provider-facing HTTP status without initiating checkout, refund, SMS, payout,
settlement, or any other financial change.

Official documented endpoint:
`GET https://api-txnstatus.hubtel.com/transactions/{Collection_Account_Number}/status?clientReference=...`.

The tool uses a **fixed synthetic, non-order reference**, so it cannot confirm
that a real transaction was paid. A 200 response indicates that this *specific
endpoint* was reachable, not that any transaction, refund eligibility or
merchant payment permission has been verified.

## Command

Run from a trusted shell on `vps.lightworldtech.com`, with rights to read the
protected merchant file:

```bash
python3 scripts/probe-hubtel-transaction-status.py \
  --env-file /home/lightworld/config/varietygroceries/api.env
```

The configuration file must be private (regular file; no world read/write
bits), containing `HUBTEL_SALES_API_ID`, `HUBTEL_SALES_API_KEY`, and
`HUBTEL_COLLECTION_ACCOUNT_NUMBER`. Never pass credentials in terminal
arguments, write them into the repository, or publish the environment file.

The command prints only timestamp, endpoint host, HTTP code, diagnostic
classification and explicit disclaimers. It never prints raw provider
responses, full URLs, account identifiers, credentials, or personal/payment
details. No polling or retries.

## Meaning of output

| HTTP | Meaning | Exit code |
| --- | --- | --- |
| 403 | Status API **denied** the request; IP allowlisting or merchant scope still unresolved | 3 |
| 401 | Auth credentials/scope not accepted | 4 |
| 404 | Unknown synthetic reference or unavailable route; authorization not proven | 5 |
| 2xx | Endpoint accepted this test request; actual transaction and refund capabilities still unverified | 0 |
| Other response | Status access not proven | 5 |
| Network error | No definitive authorization answer | 6 |
| Invalid protected merchant configuration | Check file privately | 7 |

**Current actual observation:** at **2026-11-16 12:59:57 UTC**, a read-only
authenticated GET from outbound IPv4 **163.245.212.15** returned **HTTP 403**
with content type `text/html`. The reusable probe independently repeated
this result at **2026-11-16 13:07:31 UTC** (HTTP 403; exit code 3).
This is consistent with missing allowlisting but could also mean a lack of
merchant Transaction Status API permissions. No financial or SMS operations
were performed. GitHub issue #90 tracks the external authorization dependency.

## Non-negotiable safety gates

- A vendor confirmation alone does not prove actual access. Retest this
  exact endpoint from the deployed server after Hubtel's confirmation.
- A synthetic-reference status response cannot establish payment; controlled
  merchant-owned real-reference reconciliation must still verify exact
  transaction ID, amount, currency, merchant and payment status.
- This script does **not** test refund whitelisting: the refund API uses
  a POST and must never be probed with a fabricated transaction.
- Keep electronic checkout and automated customer notifications disabled
  until provider authentication, callbacks, legitimate reconciliation,
  refunds and production go-live acceptance are completed.

Offline unit tests (no provider calls and no real credentials):

```bash
python3 -m unittest discover -s scripts -p 'test_hubtel_transaction_status_probe.py' -v
```
