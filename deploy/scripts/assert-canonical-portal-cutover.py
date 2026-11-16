#!/usr/bin/env python3
"""Fail-closed approval gate for the legacy 3027/3037 staging portal cutover.

This is NOT a source-parity verifier. A person must first audit the POS-integrated
3049/3052 services and approve a specific immutable portal/API release pair.
No network calls, database changes, or service actions occur here.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import stat
import sys

ACTION = "REPLACE_CANONICAL_POS_STAGING_WITH_LEGACY_3027_3037"
SHA_PATTERN = re.compile(r"[0-9a-f]{40}\Z")


def reject(reason: str) -> None:
    print(f"BLOCKED legacy portal cutover: {reason}", file=sys.stderr)
    raise SystemExit(78)


def source_sha(root: Path, label: str) -> str:
    marker = root / "BUILD_SOURCE_GIT_SHA"
    try:
        value = marker.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        reject(f"{label} release lacks BUILD_SOURCE_GIT_SHA")
    if not SHA_PATTERN.fullmatch(value):
        reject(f"{label} release has invalid source SHA")
    return value


def main() -> None:
    if len(sys.argv) != 4:
        reject("usage: assert-canonical-portal-cutover.py APPROVAL_FILE PORTAL_RELEASE API_RELEASE")
    approval_arg, portal_arg, api_arg = sys.argv[1:]
    if not approval_arg:
        reject("a one-time operator-signed approval file is required; preserve the POS staging stack")

    approval = Path(approval_arg)
    try:
        info = approval.lstat()
    except OSError:
        reject("approval file is missing")
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
        reject("approval must be a regular file owned by the executing account")
    if stat.S_IMODE(info.st_mode) != 0o600:
        reject("approval file must have mode 0600")
    try:
        data = json.loads(approval.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        reject("approval JSON is unreadable or malformed")
    if not isinstance(data, dict):
        reject("approval must be a JSON object")
    expected_keys = {
        "schema_version", "action", "approved_by", "approved_at_utc",
        "portal_source_sha", "api_source_sha", "portal_port", "api_port",
    }
    if set(data) != expected_keys:
        reject("approval fields do not match the documented schema")
    if data["schema_version"] != 1 or data["action"] != ACTION:
        reject("approval does not authorize this exact legacy cutover")
    if data["portal_port"] != 3037 or data["api_port"] != 3027:
        reject("approval does not match this script's legacy upstream ports")
    if not isinstance(data["approved_by"], str) or len(data["approved_by"].strip()) < 3:
        reject("approval must identify the actual reviewer")
    try:
        approved = datetime.fromisoformat(data["approved_at_utc"].replace("Z", "+00:00"))
    except (TypeError, AttributeError, ValueError):
        reject("approved_at_utc must be an ISO 8601 UTC timestamp")
    if approved.tzinfo is None or approved.utcoffset() != timedelta(0):
        reject("approved_at_utc must be UTC")
    age = datetime.now(timezone.utc) - approved
    if age < timedelta(minutes=-5) or age > timedelta(hours=24):
        reject("approval has expired or is dated in the future")
    portal_sha = source_sha(Path(portal_arg), "portal")
    api_sha = source_sha(Path(api_arg), "API")
    if data["portal_source_sha"] != portal_sha or data["api_source_sha"] != api_sha:
        reject("approved commit SHAs do not match the packaged portal and API releases")
    print("Release-pair approval validated; proceed only with the separately reviewed parity and rollback plan.")


if __name__ == "__main__":
    main()
