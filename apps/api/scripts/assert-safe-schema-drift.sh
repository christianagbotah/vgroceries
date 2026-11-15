#!/usr/bin/env bash
# Read-only parity gate: never execute the generated Prisma migration SQL.
# Must run after all checked-in migrations have been applied to a test DB.
set -euo pipefail
scratch="$(mktemp)"
trap 'rm -f "$scratch"' EXIT

status=0
./node_modules/.bin/prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script --exit-code > "$scratch" || status=$?

if [ "$status" -eq 2 ]; then
  echo 'ERROR: Prisma model differs from the migrated PostgreSQL schema.'
  echo 'DO NOT apply an automatically generated migration without review.'
  sed -n '1,70p' "$scratch"
  exit 1
elif [ "$status" -ne 0 ]; then
  echo 'ERROR: Unable to compare Prisma schema with the migrated PostgreSQL database.'
  exit "$status"
fi

echo 'PASS: Prisma model and applied migration schema are identical (zero SQL drift).'
