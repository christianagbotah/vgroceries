#!/usr/bin/env bash
# Rehearse a GitHub artifact recovery without restarting services or opening a database.
set -euo pipefail
[[ $# = 4 ]] || { echo "Usage: version sha archive-sha256 api|storefront"; exit 2; }
version=$1 sha=$2 digest=$3 component=$4
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$digest" =~ ^[0-9a-f]{64}$ ]]
[[ "$component" = api || "$component" = storefront ]]
repo=christianagbotah/vgroceries
exec 9>/run/lock/lightworld-deploy/heavy-deploy.lock
flock -n 9 || { echo 'HOLD: shared maintenance lock busy'; exit 10; }
bytes=$(gh release view "$version" --repo "$repo" --json assets,targetCommitish --jq 'select(.targetCommitish=="'"$sha"'") | .assets[] | select(.name=="runtime.tar.gz" and .digest=="sha256:'"$digest"'") | .size')
[[ "$bytes" =~ ^[0-9]+$ && "$bytes" -gt 0 ]]
/usr/local/sbin/lightworld-vps-capacity-check artifact "$(( (bytes+1048575)/1048576 ))"
tmp=$(mktemp -d /tmp/vg-recovery-drill.XXXXXX)
trap 'rm -rf -- "$tmp"' EXIT
gh release download "$version" --repo "$repo" --dir "$tmp"
python3 "$(dirname "$(realpath "$0")")/verify-github-runtime.py" "$tmp" --sha "$sha" --version "$version" --archive-sha256 "$digest"
tar --no-same-owner --no-same-permissions -xzf "$tmp/runtime.tar.gz" -C "$tmp" "$component"
node=/home/lightworld/runtime/node24/bin/node
if [[ "$component" = api ]]; then
 (cd "$tmp/api/apps/api"; "$node" --check dist/src/main.js; "$node" -e 'require("@variety/contracts");require("@prisma/client");require("@nestjs/core");console.log("API_RUNTIME_IMPORTS_OK")')
else
 (cd "$tmp/storefront"; "$node" --check server.js)
 echo STOREFRONT_ENTRYPOINT_OK
fi
echo "RECOVERY_ARTIFACT_VERIFIED $version $component $sha"
