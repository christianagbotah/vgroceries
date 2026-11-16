#!/usr/bin/env python3
"""Read-only Hubtel merchant Transaction Status access diagnostic.

Performs exactly one authenticated GET using a synthetic reference that never
represents a real order. Exposes only HTTP status, not merchant identifiers,
credentials, full URLs, bodies, headers or payment/customer information.
A successful access check is NOT proof of a completed payment or full allowlist.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

STATUS_HOST = "https://api-txnstatus.hubtel.com"
TEST_REFERENCE = "VG-IP-ACCESS-DIAGNOSTIC"
FIELDS = (
    "HUBTEL_SALES_API_ID",
    "HUBTEL_SALES_API_KEY",
    "HUBTEL_COLLECTION_ACCOUNT_NUMBER",
)


class ProbeInputError(ValueError):
    pass


def load_protected_credentials(path: Path) -> dict[str, str]:
    try:
        details = path.stat()
    except OSError as exc:
        raise ProbeInputError("protected merchant environment file is missing") from exc
    if not stat.S_ISREG(details.st_mode) or (stat.S_IMODE(details.st_mode) & 0o007):
        raise ProbeInputError("environment must be a regular file, not world-accessible")
    try:
        data = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ProbeInputError("merchant environment file is unreadable") from exc
    values: dict[str, str] = {}
    for line in data.splitlines():
        match = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$", line)
        if not match:
            continue
        key, value = match.groups()
        if key not in FIELDS:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key] = value
    if any(not values.get(name) for name in FIELDS):
        raise ProbeInputError("Sales API credential bundle is incomplete")
    if len(values["HUBTEL_SALES_API_ID"]) > 256 or len(values["HUBTEL_SALES_API_KEY"]) > 256:
        raise ProbeInputError("merchant credential length is invalid")
    if not re.fullmatch(r"[0-9]{3,32}", values["HUBTEL_COLLECTION_ACCOUNT_NUMBER"]):
        raise ProbeInputError("collection account format is invalid")
    return values


def classification(status: int) -> tuple[str, int]:
    if status == 403:
        return "ACCESS_DENIED_IP_OR_MERCHANT_SCOPE", 3
    if status == 401:
        return "UNAUTHORIZED_CREDENTIALS_OR_SCOPE", 4
    if status == 404:
        return "NOT_FOUND_ACCESS_NOT_PROVEN", 5
    if 200 <= status < 300:
        return "ENDPOINT_REACHABLE_PAYMENT_NOT_VERIFIED", 0
    return "HTTP_ERROR_ACCESS_NOT_PROVEN", 5


def check(
    credentials: dict[str, str],
    *,
    timeout: int = 15,
    opener=urllib.request.urlopen,
) -> tuple[int | None, str, int]:
    if not 1 <= timeout <= 30:
        raise ProbeInputError("timeout must be between 1 and 30 seconds")
    account = urllib.parse.quote(credentials["HUBTEL_COLLECTION_ACCOUNT_NUMBER"], safe="")
    query = urllib.parse.urlencode({"clientReference": TEST_REFERENCE})
    url = f"{STATUS_HOST}/transactions/{account}/status?{query}"
    auth = base64.b64encode(
        (credentials["HUBTEL_SALES_API_ID"] + ":" + credentials["HUBTEL_SALES_API_KEY"]).encode("utf-8")
    ).decode("ascii")
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": "Basic " + auth,
            "Accept": "application/json",
            "User-Agent": "Variety-Groceries-Status-Access-Check/1.0",
        },
    )
    try:
        # Never read or log response bodies: they may contain financial data.
        with opener(request, timeout=timeout) as response:
            status = int(response.status)
    except urllib.error.HTTPError as error:
        status = int(error.code)
        error.close()
    except (OSError, TimeoutError, ValueError):
        return None, "TRANSPORT_ERROR_ACCESS_NOT_PROVEN", 6
    label, exit_code = classification(status)
    return status, label, exit_code


def main(argv: list[str] | None = None, *, opener=urllib.request.urlopen) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path("/home/lightworld/config/varietygroceries/api.env"),
        help="protected server-side merchant environment; never commit",
    )
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args(argv)
    try:
        credentials = load_protected_credentials(args.env_file)
        status, state, code = check(credentials, timeout=args.timeout, opener=opener)
    except ProbeInputError:
        # Intentionally do not print the path, exception or any source content.
        status, state, code = None, "INVALID_PRIVATE_CONFIG", 7
    print(json.dumps({
        "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "host": "api-txnstatus.hubtel.com",
        "request_method": "GET",
        "synthetic_non_order_reference": True,
        "http_status": status,
        "result": state,
        "payment_verified": False,
        "refund_service_checked": False,
        "merchant_scope_confirmed": False,
    }, separators=(",", ":")))
    return code


if __name__ == "__main__":
    sys.exit(main())
