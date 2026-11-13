# Variety Groceries — isolated POS staging operations and recovery

**Verified:** 11 November 2026 (Accra/UTC).  
**Environment:** *private synthetic staging only*. Public storefront and existing production/UAT API are **not** controlled by the units in this document.

## Architecture and ownership

| Process | systemd unit | Local-only address | Owner |
|---|---|---|---|
| Isolated PostgreSQL 18 | `vg-pos-staging-postgres.service` | `127.0.0.1:55436` | `lightworld` |
| POS staging NestJS API | `vg-pos-staging-api.service` | `127.0.0.1:3049` | `lightworld` |
| POS staging Next.js web portal | `vg-pos-staging-web.service` | `127.0.0.1:3051` | `lightworld` |
| Daily staging database backup | `vg-pos-staging-backup.service` | On-host archive only | `lightworld` |
| Backup scheduler | `vg-pos-staging-backup.timer` | 03:20 UTC daily, randomized up to 5 min | systemd |

**HTTPS:** `https://pos-uat.varietygroceries.com`; Nginx authenticates the perimeter and proxies to the **localhost** staging services. Normal staff login and CSRF are additionally required. Never remove staging's HTTPS perimeter while synthetic credentials and data are present.

**Application checkout:** `/home/lightworld/workspaces/vgroceries-pos-integrated-20261110`.  
**Staging database directory:** `/home/lightworld/workspaces/vgroceries-pos-staging-pg-20261110/data`.  
**Backups:** `/home/lightworld/workspaces/vgroceries-pos-staging-pg-20261110/backups`.  
**Database:** `variety_pos_staging`; **do not** confuse it with public API databases.

The API and web units read separate **mode-restricted, host-local environment files**, which are excluded from Git. Do not paste tokens, customer information, certificates or test account passwords into source control, systemd unit command lines or test logs.

## What is committed

- `deploy/systemd/vg-pos-staging-postgres.service`
- `deploy/systemd/vg-pos-staging-api.service`
- `deploy/systemd/vg-pos-staging-web.service`
- `deploy/systemd/vg-pos-staging-backup.service`
- `deploy/systemd/vg-pos-staging-backup.timer`
- `deploy/scripts/backup-pos-staging.sh`

These source-controlled units describe the **isolated** staging instance. Keep the public Variety services and their upstream database dependencies unchanged. Updating application code does not itself rebuild or restart the production site.

## Verified results

1. A restricted PostgreSQL custom-format dump was created and its `pg_restore --list` integrity structure checked. Initial archive: **431,788 bytes**, permissions **0600**, with SHA-256 recorded alongside its local backup evidence.
2. The dump was restored to a new **separate** database named `variety_pos_restore_drill_20261111`. The source and restore matched across nine table counts:

   | Data | Source | Restored |
   |---|---:|---:|
   | Prisma migrations | 41 | 41 |
   | Products | 2 | 2 |
   | Stock positions | 2 | 2 |
   | Till sessions | 3 | 3 |
   | Stock holds | 12 | 12 |
   | POS cash sales | 12 | 12 |
   | Stock depletions | 12 | 12 |
   | Users | 2 | 2 |
   | User-location assignments | 1 | 1 |

   A valid archive and matching counts demonstrate a practical restore drill, **not** yet a production disaster-recovery certification.
3. The old manually launched staging processes were cleanly stopped and handed over to **three enabled, active systemd services**. Both API readiness checks and both portal checks returned **HTTP 200** after migration.
4. A deliberate `SIGKILL` to **only the systemd-managed staging web process** caused systemd to restart it. The replacement process returned **HTTP 200** on `/staff/pos`, while the public portal remained HTTP 200. A separate deliberate `SIGKILL` against **only the systemd-managed staging API** also triggered a new process with `/api/v1/health/ready` **HTTP 200**. The existing public API remained HTTP 200. No VPS reboot or public service restart was performed.
5. The new backup timer is **enabled and active**; `systemctl start vg-pos-staging-backup.service` returned `Result=success`, `ExecMainStatus=0` and produced a second verified archive.

## Safe health checks

```bash
systemctl --no-pager is-active vg-pos-staging-postgres.service
systemctl --no-pager is-active vg-pos-staging-api.service
systemctl --no-pager is-active vg-pos-staging-web.service
systemctl list-timers --no-pager vg-pos-staging-backup.timer
curl --fail --silent http://127.0.0.1:3049/api/v1/health/ready
curl --fail --silent --output /dev/null http://127.0.0.1:3051/staff/pos
```

Restart **only** an affected staging service after checking its journal:

```bash
journalctl -u vg-pos-staging-api.service -n 100 --no-pager
systemctl restart vg-pos-staging-api.service
systemctl --no-pager status vg-pos-staging-api.service
```

Do not restart the entire VPS to apply these changes. The public site has distinct services and must remain unaffected. Use `systemctl daemon-reload` after updating the unit files.

## Backup, recovery and limitations

The daily job runs `pg_dump` on the **isolated Unix socket** with the `lightworld` OS account, writes a private temporary file, validates it using `pg_restore --list`, atomically renames it as a custom-format `.dump` and generates a `.sha256` manifest.

It writes only into the isolated staging backup directory. The timer uses **UTC** and `Persistent=true`, so an eligible missed run is scheduled after startup. A backup failure remains visible in `journalctl -u vg-pos-staging-backup.service`; avoid claiming a successful backup without checking both systemd status and the actual archive.

To rehearse another restore, create a *new, explicitly named and empty* staging-only database on port `55436` and restore the chosen archive with `pg_restore --exit-on-error --single-transaction`. Verify schema, migration history, sample products, stock, tills and sale counts. **Never restore over `variety_pos_staging` or any business database without an approved recovery procedure and current backup.**

**Operator provisioning is still a separate release requirement:** the existing `/admin/team` page currently lists fictional demo identities and is not a real cashier onboarding, branch-assignment or deactivation console. Do not substitute manual synthetic user seeding for an approved production staff onboarding workflow.

These copies live on the **same VPS**. If the whole host or disk is lost, on-host backups can be lost too. Before any production launch, configure encrypted off-host backup storage, tested restoration to another server, retention, key management, recovery objectives, monitoring and incident alerts. This runbook covers the synthetic staging database only.

## Release boundary

POS sales in this environment use simulated cash and sample stock. The production API's POS transaction flags remain disabled. Completing this service hardening does **not** approve production checkout, MoMo/card payment settlement, live inventory deductions, refunds, tax invoices or real-money drawer closing.

A separate shared Lightworld PostgreSQL backup service was observed in a failed state during checks; it was **not modified** here and should be reviewed under a distinct host-wide backup maintenance task.
