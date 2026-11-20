#!/usr/bin/env python3
"""Read-only public checkout readiness probe. No payment, refund, or stock mutation."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

PATH = "/api/v1/checkout/payment-availability"
MAX_BODY = 32768


@dataclass(frozen=True)
class Result:
    code: int
    message: str


def inspect_response(status: int, headers: dict[str, str], body: bytes) -> Result:
    """Strictly verify the public, secret-free response contract."""
    if status != 200:
        return Result(4, f"FAIL: checkout availability route returned HTTP {status}; deployment parity is unverified.")
    normalized = {str(k).lower(): str(v).lower() for k, v in headers.items()}
    if "no-store" not in normalized.get("cache-control", ""):
        return Result(4, "FAIL: checkout availability response is not marked no-store.")
    if "application/json" not in normalized.get("content-type", ""):
        return Result(4, "FAIL: checkout availability response is not JSON.")
    if len(body) > MAX_BODY:
        return Result(4, "FAIL: checkout availability response exceeds safe size limit.")
    try:
        payload = json.loads(body)
    except (UnicodeError, ValueError):
        return Result(4, "FAIL: checkout availability returned invalid JSON.")
    if (
        not isinstance(payload, dict)
        or set(payload) != {"ok", "data"}
        or payload["ok"] is not True
        or not isinstance(payload["data"], dict)
        or set(payload["data"]) != {"electronicAvailable", "mode"}
        or type(payload["data"]["electronicAvailable"]) is not bool
        or payload["data"]["mode"] != "production"
    ):
        return Result(4, "FAIL: unexpected checkout availability schema or demo response.")
    if not payload["data"]["electronicAvailable"]:
        return Result(3, "NO-GO: checkout readiness route is deployed, but electronic checkout is disabled.")
    return Result(0, "PASS: read-only checkout readiness contract reports enabled. NOT a payment, refund, or launch approval.")


def endpoint_from_origin(origin: str) -> str:
    url = urlsplit(origin)
    if (
        url.scheme != "https"
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or url.query
        or url.fragment
        or url.path not in ("", "/")
    ):
        raise ValueError("A plain HTTPS origin with no path, credentials, query, or fragment is required.")
    return urlunsplit(("https", url.netloc, PATH, "", ""))


def probe(origin: str, timeout: float) -> Result:
    try:
        endpoint = endpoint_from_origin(origin)
    except ValueError:
        return Result(4, "FAIL: invalid HTTPS staging origin.")
    request = Request(
        endpoint,
        method="GET",
        headers={"Accept": "application/json", "Cache-Control": "no-store", "User-Agent": "vg-checkout-readiness-audit/1"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.geturl() != endpoint:
                return Result(4, "FAIL: checkout availability unexpectedly redirected.")
            body = response.read(MAX_BODY + 1)
            return inspect_response(response.status, dict(response.headers.items()), body)
    except HTTPError as error:
        return Result(4, f"FAIL: checkout availability route returned HTTP {error.code}; no activation permitted.")
    except (URLError, TimeoutError, OSError):
        return Result(4, "FAIL: checkout availability could not be verified over HTTPS.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://portal.varietygroceries.com", help="Staging HTTPS origin only")
    parser.add_argument("--timeout", type=float, default=8.0)
    options = parser.parse_args(argv)
    if not 1 <= options.timeout <= 20:
        parser.error("--timeout must be between 1 and 20 seconds")
    outcome = probe(options.origin, options.timeout)
    print(outcome.message)
    print("Guard: never initiates charges, verifies private merchant balances, or enables gateway flags.")
    return outcome.code


if __name__ == "__main__":
    sys.exit(main())
