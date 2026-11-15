#!/usr/bin/env bash
# Read-only, local-only smoke for the canonical-main UAT API.
# Do not run against the integrated public staging API on port 3049.
set -euo pipefail

if [[ $# -gt 0 ]]; then base="$1"; else base="http://127.0.0.1:3027"; fi
if [[ ! "$base" =~ ^http://127\.0\.0\.1:[0-9]{2,5}$ ]]; then
  echo "ERROR: target must be an explicit localhost HTTP host:port" >&2
  exit 2
fi

check() {
  local route="$1" expected="$2" actual
  actual="$(curl --silent --show-error --max-time 8 --output /dev/null \
    --write-out '%{http_code}' "$base$route")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL %s returned HTTP %s (expected %s)\n' "$route" "$actual" "$expected" >&2
    return 1
  fi
  printf 'PASS %s HTTP %s\n' "$route" "$actual"
}

check /api/v1/health/ready 200
check /api/v1/auth/me 401
check /api/v1/cashier/pos/workspace 401
check /api/v1/admin/staff 401
check /api/v1/inventory/overview 401
echo "Private API read-only checks passed. No payment, inventory or admin mutation attempted."
