#!/usr/bin/env bash
# Isolated, no-root regression test for audit-variety-releases.sh.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/releases/varietygroceries-test" "$tmp/webapps/varietygroceries-api" "$tmp/webapps"
printf 'fixture data must survive\n' > "$tmp/releases/varietygroceries-test/keep.txt"
ln -s "$tmp/releases/varietygroceries-test" "$tmp/webapps/varietygroceries-api/current"
ln -s "$tmp/releases/varietygroceries-test" "$tmp/webapps/varietygroceries-portal-current"
output="$(VG_RELEASE_ROOT="$tmp/releases" VG_WEBAPPS_ROOT="$tmp/webapps" bash "$here/audit-variety-releases.sh")"
grep -q 'varietygroceries-test' <<< "$output"
grep -q 'NO automatic deletion recommendations' <<< "$output"
grep -q 'varietygroceries-api/current ->' <<< "$output"
grep -q 'varietygroceries-portal-current ->' <<< "$output"
test "$(cat "$tmp/releases/varietygroceries-test/keep.txt")" = 'fixture data must survive'
test -L "$tmp/webapps/varietygroceries-api/current"
test -L "$tmp/webapps/varietygroceries-portal-current"
printf 'PASS: inventory includes fixture, preserves files and symlinks, never deletes\n'
