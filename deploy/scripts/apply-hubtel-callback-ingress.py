#!/usr/bin/env python3
"""Fail-closed, narrowly scoped Nginx hardening for the Hubtel Online Checkout webhook.

Default is dry-run; --apply edits only the canonical staging Nginx server
include and adds an immutable, exact-path callback rule. It never alters API
service code, payment flags, environment files, or routes for customers.
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "deploy/nginx/varietygroceries-hubtel-callback-ingress.conf"
CANONICAL = Path("/usr/local/apps/nginx/etc/conf.d/zzz-varietygroceries-portal.conf")
DEST = Path("/usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-hubtel-callback-ingress.conf")
BACKUPS = Path("/root/varietygroceries-proxy-backups")
ANCHOR = "    include /usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-product-media.conf;\n"
INCLUDE = "    include /usr/local/apps/nginx/etc/conf.d/includes/varietygroceries-hubtel-callback-ingress.conf;\n"

def validate(canonical: str, snippet: str) -> str:
    """Only accept the known canonical POS-integrated upstream pair."""
    if canonical.count(ANCHOR) != 1:
        raise ValueError("Canonical media include marker missing or repeated.")
    if "server_name portal.varietygroceries.com;" not in canonical:
        raise ValueError("Wrong HTTPS server hostname.")
    if "proxy_pass http://127.0.0.1:3049;" not in canonical or "proxy_pass http://127.0.0.1:3052;" not in canonical:
        raise ValueError("Refusing release change to an unknown POS staging upstream pair.")
    if canonical.count(INCLUDE) > 1:
        raise ValueError("Duplicate Hubtel callback include.")
    required = (
        "location = /api/v1/payments/providers/hubtel/events {",
        "allow 108.129.40.25;",
        "deny all;",
        "limit_except POST { deny all; }",
        "client_max_body_size 64k;",
        "proxy_pass http://127.0.0.1:3049;",
        "proxy_set_header X-Real-IP $remote_addr;",
        "proxy_set_header X-Forwarded-For $remote_addr;",
        'proxy_set_header Authorization "";',
    )
    if any(item not in snippet for item in required) or snippet.count(required[0]) != 1:
        raise ValueError("Callback rule is missing an exact-path, IP, method, body, or upstream protection.")
    if re.findall(r"(?m)^\s*allow\s+([^;]+);", snippet) != ["108.129.40.25"] or re.findall(r"(?m)^\s*deny\s+([^;]+);", snippet) != ["all"]:
        raise ValueError("Only the documented Hubtel callback source IP may access this location.")
    if "$http_x_forwarded_for" in snippet or "$proxy_add_x_forwarded_for" in snippet:
        raise ValueError("Webhook callback ingress must not trust caller-supplied forwarding headers.")
    return canonical if INCLUDE in canonical else canonical.replace(ANCHOR, ANCHOR + INCLUDE, 1)

def atomic_write(path: Path, data: bytes, mode: int) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".vg-hubtel-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), mode)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def command(*argv: str) -> None:
    completed = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"{argv[0]} check/reload failed; inspect local Nginx logs.")

def apply(*, canonical: Path = CANONICAL, dest: Path = DEST, backups: Path = BACKUPS, source: Path = SOURCE) -> str:
    if canonical.is_symlink() or not canonical.is_file() or not source.is_file() or source.is_symlink():
        raise ValueError("Missing or symlinked canonical config or source.")
    before = canonical.read_bytes()
    snippet = source.read_bytes()
    planned = validate(before.decode("utf8"), snippet.decode("utf8"))
    if dest.exists() or dest.is_symlink():
        if dest.is_symlink() or dest.read_bytes() != snippet:
            raise ValueError("Existing ingress snippet conflicts with reviewed source; refusing overwrite.")
        if INCLUDE in before.decode("utf8"):
            return "ALREADY INSTALLED: no changes or reload required."
        raise ValueError("Found orphan ingress snippet; refusing automatic repair.")

    if INCLUDE in before.decode("utf8"):
        raise ValueError("Canonical already includes missing ingress snippet; refusing repair.")

    if not backups.is_dir() or backups.is_symlink():
        raise ValueError("Protected backup directory does not exist.")
    command("nginx", "-t")
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backups / f"portal-before-hubtel-callback-{timestamp}-{os.getpid()}.conf"
    if backup.exists():
        raise ValueError("Refusing existing backup name.")
    fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(before)
        handle.flush()
        os.fsync(handle.fileno())

    try:
        atomic_write(dest, snippet, 0o644)
        atomic_write(canonical, planned.encode("utf8"), 0o644)
        command("nginx", "-t")
        command("nginx", "-s", "reload")
    except Exception:
        # Restore the exact prior bytes. If a reload failed, active Nginx
        # generally still runs the old config; trigger an additional safe reload.
        atomic_write(canonical, before, 0o644)
        dest.unlink(missing_ok=True)
        try:
            command("nginx", "-t")
            command("nginx", "-s", "reload")
        except Exception:
            pass
        raise
    return f"INSTALLED: exact-path Hubtel callback restriction. Backup: {backup.name}"

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Make the narrow Nginx staging change after a successful check.")
    args = parser.parse_args()
    try:
        if not args.apply:
            before = CANONICAL.read_text(encoding="utf8")
            source = SOURCE.read_text(encoding="utf8")
            validate(before, source)
            print("CHECK OK: canonical 3049/3052 pair and restricted Hubtel callback rule verified; no files changed.")
            return 0
        print(apply())
        return 0
    except (OSError, UnicodeError, ValueError, RuntimeError) as error:
        # No credentials or callback payloads appear in this guard output.
        print(f"FAILED CLOSED: {type(error).__name__}: {error}", file=sys.stderr)
        return 78

if __name__ == "__main__":
    sys.exit(main())
