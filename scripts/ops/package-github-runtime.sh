#!/usr/bin/env bash
# Hosted CI only. Never builds, deploys or reads production secrets on the VPS.
set -euo pipefail
: "${GITHUB_SHA:?GitHub source SHA is required}"
: "${VERSION:?Release version is required}"
[[ "${GITHUB_ACTIONS:-}" == true ]]
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test ! -e release-output
payload=$(mktemp -d)
trap 'rm -rf -- "$payload"' EXIT
mkdir -p "$payload/storefront" "$payload/api/apps/api" "$payload/api/packages/contracts" release-output
cp -a .next/standalone/. "$payload/storefront/"
cp -a apps/api/dist apps/api/node_modules apps/api/package.json apps/api/package-lock.json apps/api/prisma apps/api/prisma.config.ts "$payload/api/apps/api/"
cp -a packages/contracts/dist packages/contracts/node_modules packages/contracts/package.json packages/contracts/package-lock.json "$payload/api/packages/contracts/"
rm -rf -- "$payload/api/apps/api/dist/test"
# Preserve the relative file: dependency layout; do not copy environment files or source worktrees.
python3 - "$payload" <<'PY'
import os, stat, sys
from pathlib import Path
root=Path(sys.argv[1]).resolve()
for path in root.rglob("*"):
    name=path.name
    if name in {".git", ".env"} or name.startswith(".env.") or name.endswith((".pem", ".key", ".p12", ".pfx")):
        raise SystemExit(f"Prohibited file in runtime: {path.relative_to(root)}")
    mode=path.lstat().st_mode
    if path.is_symlink():
        target=path.resolve(strict=True)
        if not target.is_relative_to(root):
            raise SystemExit(f"External symlink: {path.relative_to(root)}")
    elif not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
        raise SystemExit(f"Unexpected special file: {path.relative_to(root)}")
    if mode & (stat.S_ISUID|stat.S_ISGID):
        raise SystemExit(f"Privileged mode: {path.relative_to(root)}")
PY
test -f "$payload/storefront/server.js"
test -f "$payload/api/apps/api/dist/src/main.js"
node --check "$payload/storefront/server.js"
node --check "$payload/api/apps/api/dist/src/main.js"
(cd "$payload/api/apps/api" && node -e 'require("@variety/contracts"); require("@prisma/client"); require("@nestjs/core")')
printf '%s\n' "$GITHUB_SHA" > release-output/source-sha.txt
printf '%s\n' "$VERSION" > release-output/version.txt
printf '%s\n' 'vgroceries-runtime-v1' > release-output/format.txt
tar --hard-dereference -C "$payload" -czf release-output/runtime.tar.gz storefront api
(cd release-output && sha256sum runtime.tar.gz source-sha.txt version.txt format.txt > SHA256SUMS && sha256sum --check --strict SHA256SUMS)
