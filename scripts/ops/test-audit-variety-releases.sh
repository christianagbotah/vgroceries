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
grep -Eq 'varietygroceries-test.*ref=ACTIVE-REFERENCE' <<< "$output"
grep -q 'ref=not-observed is NOT evidence of non-use' <<< "$output"
grep -q 'varietygroceries-api/current ->' <<< "$output"
grep -q 'varietygroceries-portal-current ->' <<< "$output"
test "$(cat "$tmp/releases/varietygroceries-test/keep.txt")" = 'fixture data must survive'
test -L "$tmp/webapps/varietygroceries-api/current"
test -L "$tmp/webapps/varietygroceries-portal-current"
# A stopped service may still reference an old release in WorkingDirectory.
# Mock systemctl locally; no host unit is modified.
mkdir -p "$tmp/bin" "$tmp/releases/varietygroceries-stopped-unit"
printf 'stopped unit fixture survives\n' > "$tmp/releases/varietygroceries-stopped-unit/keep.txt"
cat > "$tmp/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *"WorkingDirectory"* && "$*" == *"varietygroceries-api"* ]]; then
  printf '%s\n' "$VG_TEST_STOPPED_CWD"
elif [[ "$*" == *"MainPID"* ]]; then
  printf '0\n'
fi
MOCK
chmod +x "$tmp/bin/systemctl"
output="$(VG_TEST_STOPPED_CWD="$tmp/releases/varietygroceries-stopped-unit" PATH="$tmp/bin:$PATH" VG_RELEASE_ROOT="$tmp/releases" VG_WEBAPPS_ROOT="$tmp/webapps" bash "$here/audit-variety-releases.sh")"
grep -Eq 'varietygroceries-stopped-unit.*ref=ACTIVE-REFERENCE' <<< "$output"
test "$(cat "$tmp/releases/varietygroceries-stopped-unit/keep.txt")" = 'stopped unit fixture survives'
printf 'PASS: inventory preserves symlinked and stopped-unit references, never deletes\n'
