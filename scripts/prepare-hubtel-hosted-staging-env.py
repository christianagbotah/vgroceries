#!/usr/bin/env python3
"""Prepare (but NEVER activate) the protected Hubtel hosted checkout config.

Default action validates the existing root-only credential source, prints no
secrets and makes no file. --write creates a new 0600 .pending file only.
This script intentionally never changes service units, restarts services,
performs checkout, calls Hubtel, or marks any payment verified.
"""
from __future__ import annotations

import argparse
import os
import re
import shlex
from pathlib import Path

DEFAULT_SOURCE = Path("/home/lightworld/config/varietygroceries/api.env")
DEFAULT_TARGET = Path("/home/lightworld/config/varietygroceries/hubtel-hosted-INACTIVE.pending")
SOURCE_KEYS = ("HUBTEL_SALES_API_ID", "HUBTEL_SALES_API_KEY", "HUBTEL_COLLECTION_ACCOUNT_NUMBER")


def read_credentials(path: Path) -> dict[str, str]:
    if not path.is_file() or path.is_symlink():
        raise ValueError("Protected Hubtel credential source does not exist or is a symlink.")
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$", line)
        if not match:
            continue
        name, raw = match.groups()
        if name not in SOURCE_KEYS:
            continue
        try:
            parts = shlex.split(raw, comments=False)
        except ValueError as exc:
            raise ValueError(f"Invalid quoting in protected value for {name}.") from exc
        if len(parts) != 1:
            raise ValueError(f"Expected exactly one protected value for {name}.")
        env[name] = parts[0]
    for name in SOURCE_KEYS:
        if not env.get(name):
            raise ValueError(f"Protected Hubtel credential source lacks {name}.")
    if not re.fullmatch(r"\d{3,32}", env["HUBTEL_COLLECTION_ACCOUNT_NUMBER"]):
        raise ValueError("Hubtel collection account must consist of 3 to 32 digits.")
    if any(len(env[name]) > 256 or any(ord(ch) < 32 for ch in env[name]) for name in SOURCE_KEYS):
        raise ValueError("Protected Hubtel credential has invalid length or control characters.")
    return env


def env_literal(value: str) -> str:
    if any(ch in value for ch in "\x00\n\r"):
        raise ValueError("Environment value contains a forbidden control character.")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def generate_inactive_bundle(source: dict[str, str]) -> str:
    values = {
        "PAYMENT_PROVIDER_ID": "hubtel",
        "PAYMENT_ENABLED_METHODS": "hosted_checkout",
        "PAYMENT_CONFIRMED_HOLD_MINUTES": "15",
        "PAYMENT_PROVIDER_TIMEOUT_MS": "10000",
        "PAYMENT_RECONCILE_AFTER_SECONDS": "120",
        "PAYMENT_HOSTED_DOMAINS": "pay.hubtel.com",
        "HUBTEL_CLIENT_ID": source["HUBTEL_SALES_API_ID"],
        "HUBTEL_CLIENT_SECRET": source["HUBTEL_SALES_API_KEY"],
        "HUBTEL_COLLECTION_ACCOUNT_NUMBER": source["HUBTEL_COLLECTION_ACCOUNT_NUMBER"],
        "HUBTEL_ONLINE_CHECKOUT_URL": "https://payproxyapi.hubtel.com/items/initiate",
        "HUBTEL_COLLECTION_STATUS_URL":
            "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
        "HUBTEL_CALLBACK_URL":
            "https://portal.varietygroceries.com/api/v1/payments/providers/hubtel/events",
        "HUBTEL_RETURN_URL": "https://portal.varietygroceries.com/checkout/payment-return",
        "HUBTEL_CANCELLATION_URL":
            "https://portal.varietygroceries.com/checkout/payment-return?cancelled=1",
    }
    header = (
        "# INACTIVE CONFIGURATION ONLY. Never source into a running service.\n"
        "# Hubtel Transaction Status allowlisting, matching hosted/card refund\n"
        "# support, deployed release validation and explicit release approval\n"
        "# are required before enabling any electronic charging.\n"
    )
    return header + "".join(f"{name}={env_literal(value)}\n" for name, value in values.items())


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate/prepare Hubtel hosted configuration without activating charges.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--write", action="store_true", help="Explicitly create a protected inactive bundle; never activate it.")
    args = parser.parse_args()
    try:
        values = read_credentials(args.source)
        content = generate_inactive_bundle(values)
        if not args.write:
            print("Validated required protected Hubtel credential names and hosted configuration format; no file written or payment made.")
            return 0
        if args.destination.resolve().parent != args.source.resolve().parent:
            raise ValueError("The inactive bundle must remain beside the protected credential file.")
        if args.destination.is_symlink():
            raise ValueError("Refusing to overwrite a symlink.")
        fd = os.open(str(args.destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
        except Exception:
            args.destination.unlink(missing_ok=True)
            raise
        print("Protected INACTIVE staging configuration created. Not loaded into a service; no checkout or payment was initiated.")
        return 0
    except (OSError, ValueError) as exc:
        # Never print the original environment file content or credential values.
        print(f"Safe preparation stopped: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
