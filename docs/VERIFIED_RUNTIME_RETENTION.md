# Verified runtime retention

Run the host-installed, reviewed copy of `scripts/ops/retire-verified-runtime.py` after deployment verification, using the same shared deployment lock. The default mode is audit-only. Only `--apply` permits deletion. A lock conflict returns 75; do not bypass the lock.

The trusted host configuration must provide `VG_RUNTIME_ROOT`, `VG_SHARED_LOCK`, `VG_CAPACITY_CHECK`, `VG_RELEASE_REPO`, `VG_HEALTH_URLS` (JSON array), `VG_READY_URL` (one of those URLs), `VG_REFERENCE_ROOTS` and `VG_SYMLINK_ROOTS` (JSON arrays of existing directories). Include effective service configuration, scheduled-task configuration and runtime symlink roots. Keep this host configuration and GitHub credentials outside the repository. The trusted recovery verifier must be installed alongside the script.

The gate requires matching component markers, the immediately preceding compatible rollback, successful health checks, an independently recovered and byte-matched rollback, exact older archive identity and contents, no unknown local-only content or active references, and post-removal health. It excludes other directory patterns, persistent data and backups. A mismatch is a HOLD, not authority to force removal. Preserve audit output in protected host logs; no customer data or secrets in public CI.

Use a bounded post-deployment call or a serialized host timer, with no VPS builds. A successful script run does not certify authenticated transactions or offsite restore. Review held candidates separately.
