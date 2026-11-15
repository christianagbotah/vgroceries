#!/usr/bin/env bash
# Read-only parity guard: compare the migrated database with Prisma's model.
# Never execute the generated SQL.
set -euo pipefail
scratch="$(mktemp)"
trap 'rm -f "$scratch"' EXIT

./node_modules/.bin/prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > "$scratch"

if grep -Eiq '(^|[[:space:]])DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX)([[:space:];]|$)' "$scratch"; then
  echo 'ERROR: Prisma model would drop tables, columns, constraints or indexes.'
  echo 'Review schema and migrations; DO NOT apply the diff.'
  grep -Ei '(^|[[:space:]])DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX)([[:space:];]|$)' "$scratch" | head -25
  exit 1
fi
echo 'PASS: No destructive table/column/constraint/index drift.'
echo 'Other default/index-name differences still need review before new migrations.'
