# Source-light CI artifact candidate — 2026-11-21

Issue: #187. Branch: `ops/ci-source-light-artifact-20261121`.

## Scope
The existing storefront CI continues to lint, type-check, build and exercise regression tests on GitHub-hosted Ubuntu runners. Only after those steps succeed does CI package the traced Next.js standalone server, static build assets and optional public assets into an explicit-path tarball. The evidence directory contains the exact `GITHUB_SHA`, format marker and `SHA256SUMS`; CI checks the checksum and extracts the archive to a temporary verification directory to assert the server and static assets exist. The artifact is retained for seven days.

This is a **candidate-only artifact**, not a deployable approved release. It is not downloaded or extracted on the VPS, and no symlink, service, runtime configuration, database or payment state is changed. A credential-like file scan fails the packaging step closed. It does not constitute a complete secret scanner.

## Verification and acceptance
- Previous PR #186 head `e5ca1e5`: CI #936 and API foundation #938 successful.
- New workflow commit `a993156`: GitHub Actions latest-head execution **pending**; no successful artifact upload or extracted-run smoke test claimed.
- On-host read-only baseline before this change: `df -h /` showed 313G capacity, 277G used, 34G available, 90% used; capacity-check inspect reported 33.3 GiB available, zero active builds.
- No VPS build, install, pruning, service restart, deployment or release cutover was attempted. Disk delta from this source-only change is expected to be negligible, but should be remeasured.
- Rollback proof **pending**: identify active and previous release SHA and verify extraction/headroom, process references, health/security smoke tests, financial reconciliation and rollback in a protected environment before any authorized deployment.
- Before any future artifact extraction, run `/usr/local/sbin/lightworld-vps-capacity-check artifact <compressed-MiB>` and verify the SHA-256 against trusted GitHub Actions provenance. Treat source SHA text alone as insufficient authentication.
- Do not enable payment/COD flags, refund, modify Hubtel credentials, or bypass HTTP 403 reconciliation. Keep official gold VG logo and live storefront/POS untouched.

## Follow-up
Confirm artifact completeness for the actual Next.js standalone runtime, add signed provenance/attestation and isolated smoke testing, establish immutable release extraction plus verified rollback with separate owner authorization, and keep issue #187 open until acceptance is complete.
