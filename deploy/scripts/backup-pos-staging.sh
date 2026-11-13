#!/bin/bash
set -euo pipefail
umask 077
root=/home/lightworld/workspaces/vgroceries-pos-staging-pg-20261110
out="$root/backups"
pg=/usr/local/apps/pgsql18/bin
mkdir -p "$out"
chmod 700 "$out"
name="variety_pos_staging_$(date -u +%Y%m%dT%H%M%SZ).dump"
test ! -e "$out/$name" || exit 3
tempfile=$(mktemp "$out/.vg-pos-backup.XXXXXXXX.tmp")
trap 'rm -f "$tempfile"' EXIT
"$pg/pg_isready" -h "$root/sock" -p 55436 -q
"$pg/pg_dump" -h "$root/sock" -p 55436 -U lightworld \
  -d variety_pos_staging -Fc -Z6 --no-owner --no-privileges -f "$tempfile"
"$pg/pg_restore" --list "$tempfile" >/dev/null
chmod 600 "$tempfile"
mv -n "$tempfile" "$out/$name"
trap - EXIT
sha256sum "$out/$name" >"$out/$name.sha256"
chmod 600 "$out/$name.sha256"
echo "POS staging backup verified: $name"
