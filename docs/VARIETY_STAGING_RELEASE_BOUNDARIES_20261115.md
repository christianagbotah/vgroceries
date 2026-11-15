# Variety Groceries — separate staging release boundaries

**Verified 15 November 2026 (UTC).** This is a deployment-safety note, not a production go-live approval. Reverse proxy and systemd configuration may change; always re-check before publishing.

## Two active backend streams

| Endpoint/service | Runtime | Code lineage / status |
| --- | --- | --- |
| varietygroceries.com | Separate public Coming Soon site | **Preserve**; no storefront cutover |
| portal.varietygroceries.com, site routes | Nginx to localhost:3052 | Canonical POS-integrated portal, not GitHub-main portal service |
| portal.varietygroceries.com, /api/v1 routes | Nginx to localhost:3049 | vg-pos-staging-api.service, POS-integrated development workspace and original UAT DB |
| varietygroceries-api.service | localhost:3027 | Independently released canonical christianagbotah/vgroceries main API |
| varietygroceries-portal.service | localhost:3051 | Independent portal release; **not** the public staging upstream |

staging-portal.varietygroceries.com and pos-uat.varietygroceries.com were redirects to the canonical portal at verification time. Do not assume those domains address ports 3027/3051.

The integrated API on port 3049 had additional POS, support, stock-adjustment, password recovery, SMS and other work not fully present in canonical GitHub main. Its working tree also had uncommitted changes. Its configuration had POS till, quote, stock-hold, cash-sale and staff-management UAT toggles **on**. Those toggles alone are not go-live authorizations. Do not overwrite the integrated runtime, point public staging at port 3027, reset flags or merge the dirty worktree without an explicit parity audit and rollback plan.

## Why a 200 OK does not prove deployment parity

On 15 November the main API at port 3027 returned HTTP 200 for the ready health route and 401 for anonymous cashier workspace access. The public portal instead returned 404 for that cashier route because its API upstream was the **different** service on 3049. Comparing a portal response to the wrong backend incorrectly diagnoses the new backend as missing.

A main API release also had a **stale generated Prisma client**. Its schema declared StaffInvitation, StockAdjustment, PasswordResetToken and CustomerSupportCase, but the generated client lacked those models. A newer isolated release contained all 81 declared models and passed authentication checks. The new apps/api/scripts/assert-generated-prisma-models.cjs and CI step reject this problem. Execute the guard **inside the packaged apps/api directory after Prisma generation**; a build in another directory is not proof of the deployed archive.

## Predeployment gate

1. Verify destination: systemd unit, actual process cwd, Nginx proxy_pass, Git commit, database name and feature flag booleans only. Never print credentials or database URLs.
2. Confirm feature parity, including the unmerged POS-integrated branch. Do not substitute GitHub main for port 3049 just because main CI is green.
3. Create and verify a fresh restorable UAT database archive. Prisma URLs can contain a schema query parameter that pg_dump cannot parse; remove **only** that parameter for libpq, without logging the URL.
4. Verify all 47 migrations read-only and zero Prisma SQL drift. Do **not** run db push or apply an automatically suggested diff on UAT.
5. Run npm run generate inside the copied API release, followed by npm run prisma:client:check in the exact release directory. Confirm the contracts package link also resolves within that release.
6. Canary smoke on a spare loopback port, retaining flag defaults. Check HTTP 200 readiness, anonymous 401 on protected cashier and inventory routes and generated client parity.
7. Record the old symlink target. Switch and restart only the intended unit, test its direct port, and restore the old symlink/service on failure. Recheck public portal and Coming Soon.
8. Before any portal cutover rebuild Next.js with the **correct build-time NEXT_PUBLIC_API_BASE_URL** and explicit UAT flags. A build without this setting may use mock mode even if its runtime unit has correct environment variables.
9. Require role-based operational UAT and written acceptance before enabling cashier invites, POS, physical stock or electronic payment authority. Provider settlement and physical till closeout are separate gates.

**Do not put production credentials, activation codes or real customer data in UAT tests.** Use synthetic accounts and isolated databases. A green API health endpoint does not establish staff, cash or stock readiness.
