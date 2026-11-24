# GitHub-first releases and one private runtime directory

All Variety Groceries changes belong in GitHub branches and pull requests.
Never build repeatedly on the VPS or retain historical versioned source clones
or timestamped application releases there. The VPS is a runtime host only.

## Versioning

1. Obtain successful exact-head CI and API checks, merge reviewed changes to
   main, and confirm both workflows succeed for that exact main SHA.
2. Dispatch **Versioned release (GitHub only)** from main with a new semantic
   version and the exact SHA. GitHub builds both storefront and API,
   packages them with checksums, and creates a draft Release. Historical
   tags/assets must not be overwritten. PR artifacts are not releases.
3. Validate the extracted pair on an isolated environment: API/database schema,
   browser and API origins, enabled capabilities/feature flags (particularly
   existing UAT POS/OTP flows), checkout, staff access, and rollback. Draft
   assets are not authorization to switch live services. The current package
   uses the canonical portal HTTP origin; production build flags still need
   parity acceptance. Publish only after all release gates pass.
4. Retain published release archives on GitHub for rollback. Reuse the exact
   previous verified version and checksum, not an arbitrary old branch.

## Read-only runtime package preflight

Download exactly the five assets from the trusted GitHub Release. Use the
release's independently recorded source SHA, version and SHA-256 digest of
the runtime archive (GitHub asset digest, not a value inferred from an
untrusted downloaded archive). Run:

```sh
python3 scripts/ops/verify-github-runtime.py /path/to/downloaded-assets \
  --sha "$EXPECTED_SHA" --version "$VERSION" --archive-sha256 "$TRUSTED_DIGEST"
```

The verifier checks identity, checksums, archive size, expected component
layout, archive path traversal, privileged modes, special files, duplicate
entries, credential-like paths and symlink containment. It never extracts,
installs, restarts or changes live services. Review runtime compatibility,
database schema and recovery independently before deployment.

## VPS topology

Use one **private** application root, /home/lightworld/apps/varietygroceries,
containing storefront/, api/, and a VERSION/source SHA manifest. The existing
/home/lightworld/webapps/varietygroceries is a public static document root;
never place API files, private data, or secrets beneath that document root.
Persistent DB files, uploads, protected environment configuration and backups
remain outside replaceable code, under their existing protected locations.

Use stable systemd WorkingDirectory, ExecStart and writable cache paths that
point to the private root. Preserve service user, ports, API origins, hardening,
and environment settings. First capture verified current runtime/rollback
provenance. Stage only one candidate transiently on the same filesystem,
validate checksum and archive safety before extraction, smoke-test, then switch
during a controlled maintenance window. On any health failure restore the
previous exact runtime and settings. Do not run migrations automatically or
change payment flags. Remove staging files and redundant rollback directories
after verification; historical releases live in GitHub, not the VPS.

## Cleanup guardrails

Inventory actual service cwd, descendant processes, open files, effective unit
configuration, timers, Nginx roots, and external symlink dependencies. Do not
delete active dependencies, persistent data, backups, uncommitted source, or
unique runtime artifacts until provenance and verified recovery are established.
Use scripts/ops/audit-variety-releases.sh as read-only evidence, not deletion
authorization. Clean ignored build caches in inactive development trees first;
for fully recoverable clean worktrees, verify their commit exists on GitHub
and remove through git worktree remove. No wildcard deletion.

Current migration remains gated: existing live portal/API use separate
release paths and an older API release supplies active node_modules. Retain
these until the new exact GitHub-built pair and rollback are verified.
