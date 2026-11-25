# GitHub-first hosting and bounded retention

The VPS serves verified runtime packages, not full development environments.
The existing versioned-release workflow requires successful exact-SHA main
frontend and API CI, uses pinned Node/Bun and locked dependencies, generates
the Prisma client, packages standalone frontend and API/contract runtime, and
stores SHA256SUMS, source SHA, version and format in GitHub Releases.
Only CI builds and tests application source. Do not create new full VPS
development worktrees or run dependency installations or application builds
there. GitHub release artifacts remain the version history.

## Recovery and deployment gates

Use the shared heavy-deploy lock and capacity-check artifact gate before every
download/extraction. Independently obtain the release version, commit and
archive digest. The recovery helper downloads exactly that version and verifies
all five assets before extracting one component into a temporary directory.
It checks its Node entry point and API dependencies without connecting to the
database or restarting services. This is an artifact recovery rehearsal, not
full database compatibility or production rollback certification.

Keep one active runtime and one known-good rollback. Only retire the local
rollback after a complete approved recovery and compatibility rehearsal.
Retain all production configuration, media, credentials and databases outside
release packages; never upload these to GitHub. Require an independently
encrypted offsite backup and verified restore, not merely a local checksum.

Use a single canonical application entry under /home/lightworld/webapps/
that is not inside a publicly served document root. Preserve old service
paths with tested compatibility links or explicit service drop-ins during
a controlled cutover. Do not move a live WorkingDirectory or Nginx document
root without checking transactions, worker dependencies and rollback.

## Retention

The cache-only helper defaults to audit. A root-owned, non-group-writable
manifest explicitly pins reviewed old source roots and exact GitHub commit
SHAs. Apply mode requires the shared lock, confirmed remote ref, clean
unchanged source, old cache and commit, ignored/untracked generated path,
no observed process/config/foreign-link references, and no possible private
data. It never deletes source trees, releases, data or backup directories.
Each run is capped at 20 generated directories and 6 GiB. Unknown, dirty,
recent, linked, unverified or sensitive trees are retained. Do not add a
root to the manifest just because its name resembles the project. New roots
need an individual review; the project agent must not create new local
development/build copies. Full release decommission is a separate audited
operation, never a timed wildcard deletion.

Run the reviewed manifest on a low-priority weekly timer, coordinated with
other projects via the shared lock. The manifest, server audit and logs are
local private operational evidence and must not be committed. Periodically
review remaining historical worktrees and confirm remote source preservation
before approving additional cleanup. Check site/API/database health after
any apply operation. Never touch another project's paths.
