# Variety Groceries — 79 canonical + 8 staging-only + 2 draft POS guide acceptance

**Purpose:** Turn the 79-screen canonical guide, eight additional pages observed in the running POS staging portal and two unmerged POS draft chapters into an evidence-backed, screenshot-accurate edition *without claiming any financial operation is already approved*. This is a human-reviewed staging procedure, **not** a permission to deploy, seed live data or initiate money movement.

## Source of truth and scope

1. Check the exact proposed **portal and API release SHAs**. Capture them from build metadata and compare them with the deployed immutable release pair. Do not infer a SHA from an unrelated branch.
2. Use only the separately reviewed POS-integrated staging release (current upstreams **3052** portal / **3049** API). Do **not** replace it with older **3037 / 3027** scripts. Follow `docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`.
3. Open `/manual` **only when that release contains the manual**. A current 404 means the guide is not deployed, not that UAT has passed.
4. Sign in with an approved *test* account of each **real backend role** (administrator, inventory manager, cashier, rider, customer). Do not treat demo selector roles as production grants.
5. Under the verified **administrator** manual, download the 89-chapter checklist: 74 routes shared by source/staging start `NOT_TESTED`; five canonical-only pages start `BLOCKED_NOT_IN_STAGING`; eight staging-only pages start `BLOCKED_STAGING_PARITY`; and two unmerged PR #175 POS pages start `BLOCKED_PENDING_RELEASE`. Reviewer, release SHA and screenshot proof remain blank until independently verified.

## Source parity warning: manual screens versus POS staging

Read-only comparison on **20 Nov 2026** used the running Next.js POS staging build at `/home/lightworld/releases/varietygroceries-portal-hubtel-safe-107fc4f-20261117/.next/server/app`. It found **82 deployed pages** versus **79 canonical-source pages**: **74 common**, **8 staging-only**, **5 canonical-only**. The eight staging-only artifacts are `/admin/inventory/lots`, `/admin/pos/till-operations`, `/admin/support`, `/staff/cashier`, `/staff/demo/[role]`, `/staff/pos`, `/support`, and `/uat`. The five canonical-only pages missing from that build are `/admin/dispatch/cod-exceptions`, `/admin/team/verified`, `/staff/cashier/workspace`, `/staff/rider/cod`, and `/staff/rider/login`. Separately, unmerged **PR #175** adds draft `/admin/pos/verified-uat/history` and `/admin/pos/verified-uat/reconciliation` pages, **not in that deployed staging build**. A built artifact establishes route presence, not feature flag enablement, permission, database parity or operational acceptance. Every unmatched route remains blocked until a reviewed immutable portal/API release pair resolves the mismatch. Do **not** replace the POS portal with the older 3037/3027 services or assume any blocked item was tested.

## Repeatable, read-only staging route drift audit

Before any UAT screenshot is accepted, run the source comparison against the exact reviewed immutable portal artifact directory. This tool reads local filenames only; it does **not** connect to public services, inspect secrets, alter database records, deploy or restart applications.

```bash
bun scripts/audit-manual-staging-parity.ts \
  /home/lightworld/releases/varietygroceries-portal-hubtel-safe-107fc4f-20261117/.next/server/app
```

For the inspected 20 Nov 2026 release, the reviewed report gives **79 canonical**, **82 built staging**, **74 shared**, **8 staging-only**, **5 canonical-only**, and `matchesReviewedSnapshot: true`. This means the *route-difference list* matches the documented exceptions, **not** that any route or finance flow passed UAT.

**Fail closed on drift:** a newly added, removed or renamed build route triggers a nonzero exit with explicit `undocumentedStaging`, `obsoleteStagingOverlays`, `unreviewedSourceOnly` or `obsoleteSourceOnlyOverlays` arrays. Compare the new release SHA, inspect actual page source and update the manual and CSV. Never silently mark a new route as tested or substitute the older 3037/3027 deployment.

## Per-screen evidence procedure

For the 74 shared-route rows, use the evidence procedure below after verifying both deployed release SHAs. Keep five missing-source-build, eight staging-only and two unmerged draft routes **blocked** until a signed-off parity change explicitly resolves their status, then apply the same procedure:

1. Identify the correct role and log in to the designated *isolated* UAT account. Verify the live `/auth/me` role and branch/location scope, not merely the menu label. Log the exact portal/API release SHAs.
2. Navigate to the actual screen; for dynamic `/[id]` or `/[slug]` paths open the legitimate parent list, select a **sanitized UAT record** and follow its own link.
3. Use a desktop viewport around **1440 × 900** and mobile around **390 × 844**. Check no horizontal overflow, label clipping, overlapping controls, missing keyboard focus or modal cut-off; include a narrow **360 px** check when possible.
4. Take the desktop and mobile screenshots under the CSV's proposed filenames. Do not upload screenshots containing real customer names, phone numbers, addresses, private receipts, payment references, access tokens, cookies, credit card details or service credentials. **Redact first**, and use synthetic seed records rather than production data.
5. For the screen's documented action, verify the **read-only** parts on staging. Any action that could charge a provider, send SMS, move inventory, collect/close cash, dispatch a rider, issue a refund, or modify real customer records needs its separate sandbox/explicit feature gate, permissions and recovery procedure.
6. Verify denial of that screen's protected API **as an unauthorized role** (for example guest/cashier on admin endpoints), session expiry, logout, and branch revocation when applicable. A client-side hidden menu alone does not prove access control.
7. Record actual outcome (pass, fail, blocked), the source SHA, reviewer identity, timestamp in UTC and sanitized evidence reference. A successful screenshot is **not** a successful end-to-end payment or stock transaction.
8. Only after the screenshot and functional checks pass, link the approved redacted desktop/mobile evidence to the appropriate manual chapter and label it **Captured staging screenshot — release SHA**. Retain the conceptual diagram for explanation.

## Mandatory high-risk UAT walkthroughs

| Area | Scenarios that must have independent sign-off |
|---|---|
| Customer payments | Hosted checkout initiation, merchant IP/provider scope, callback signature/authenticity, transaction-status query, pending/failed/success reconciliation, retry and idempotency, no paid claim on browser return |
| POS cash and drawers | Real administrator vs cashier visibility, original quote and hold, handover evidence, single stock depletion, cash receipt, opening float, close count, shortage/overage vs ledger inconsistency, guarded CSV |
| Inventory and purchasing | SKU/variant conversion, multi-location lots, expiry/quarantine, receiving, adjustments, stocktakes, concurrent checkout and POS stock use, supplier PO not equal physical receipt |
| Returns and refunds | Customer-owned claim, physical inspection, quarantine/resale decision, independent refund eligibility, original payment proof, confirmed provider refund, duplicate-event defense |
| Delivery and COD | Eligible dispatch only, real delivery evidence, COD declaration, independent second count/reconciliation, remittance/shortage authority, no synthetic GPS or claimed bank deposit |
| Roles and privacy | Owner/admin all-guide view, customer isolation, inventory/cashier/rider least privilege, branch revocation, direct URL denial, session changes, role switching, no raw private data in screenshots or exports |
| Operations | Published content and prices, site search and mobile layouts, backups with isolated restore, rollback of both portal/API, monitoring and alerting, audit provenance |

## Manual download acceptance

- Test **Search**, chapter navigation, previous/next, the nine illustration types, mobile chapter sheet, keyboard operation and `Return to workspace`.
- Verify the administrator can see all chapters. Verify customer, cashier, inventory manager, rider and guest exports omit unrelated admin chapters.
- Download offline HTML and open with network disconnected; verify the role-specific table of contents, screen diagrams, and workflow safety notes remain readable.
- Use **Print / Save PDF** in Chrome, Edge or mobile browser; verify the entire edition prints, rather than only the selected chapter. The browser produces the PDF through its print/save interface; this is not a server-generated PDF.
- After logout and signing in as a different role, re-open the manual, refocus the tab and check that old privileged chapters are no longer visible. Never use a private browsing export as proof of backend permission isolation.

## Evidence and sign-off rules

The CSV initially has **74 NOT_TESTED shared routes**, **5 BLOCKED_NOT_IN_STAGING canonical-only routes**, **8 BLOCKED_STAGING_PARITY staging-only routes**, and **2 BLOCKED_PENDING_RELEASE unmerged POS drafts**. Reviewer, timestamp and release SHA fields are blank. Do not change a blocked or untested status to PASS without approved route/API parity, real screenshots, authenticated role tests and a named reviewer. Do not claim a production launch is safe from a count of green page screenshots alone.

**Release gate:** only the designated owner/release operators may approve a merged, parity-verified portal/API release pair. Payment verification, Hubtel provider permissions, real refund reconciliation, stock invariants, COD authority, backups and rollout checks must independently pass before a limited financial pilot or public production launch.

**Manual coverage:** 79 main-derived source pages, 8 separately sourced staging-only page artifacts and 2 unmerged draft POS guides, plus separate manual entry routes. The regression suite checks all 79 local `src/app/**/page.tsx` pages and the ten additional route overlays independently. Staging artifact comparison is a dated observation, **not** a perpetual synchronization mechanism; repeat it and regenerate the guide/checklist whenever a staging or source release changes.
