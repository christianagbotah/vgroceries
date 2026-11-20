# Variety Groceries — 79-screen screenshot and role UAT acceptance runbook

**Purpose:** Turn the source-level 79-screen role manual into an evidence-backed, screenshot-accurate edition *without claiming any financial operation is already approved*. This is a human-reviewed staging procedure, **not** a permission to deploy, seed live data or initiate money movement.

## Source of truth and scope

1. Check the exact proposed **portal and API release SHAs**. Capture them from build metadata and compare them with the deployed immutable release pair. Do not infer a SHA from an unrelated branch.
2. Use only the separately reviewed POS-integrated staging release (current upstreams **3052** portal / **3049** API). Do **not** replace it with older **3037 / 3027** scripts. Follow `docs/CANONICAL_POS_PORTAL_RELEASE_PARITY_GATE_20261116.md`.
3. Open `/manual` **only when that release contains the manual**. A current 404 means the guide is not deployed, not that UAT has passed.
4. Sign in with an approved *test* account of each **real backend role** (administrator, inventory manager, cashier, rider, customer). Do not treat demo selector roles as production grants.
5. Under the verified **administrator** manual, click **Screenshot UAT checklist** to download a CSV containing a separate row for every documented screen. Every verification column starts as `NOT_TESTED`; there is no fabricated reviewer, release SHA or screenshot.

## Source parity warning: manual screens versus POS staging

The 79 checklist rows match **the currently reviewed main-derived documentation branch**. They are not proof of complete coverage of the independent POS-integrated staging worktree. In particular, draft **PR #175** includes separate read-only cash-sale history and till-reconciliation screens (for example `/admin/pos/verified-uat/history` and `/admin/pos/verified-uat/reconciliation`) that are not yet part of this main-derived catalogue. Before a release, reconcile **every** staging-only route and feature flag against the selected immutable source SHA; extend the guide and checklist, then rerun route-coverage tests. Do **not** silently treat absent screens as approved, and do **not** merge or deploy the documentation by replacing the running POS portal.

## Per-screen evidence procedure

For every row of the CSV:

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

The CSV deliberately begins with **all outcomes NOT_TESTED** and blank reviewer/timestamp/SHA columns. Do not transform `NOT_TESTED` to `PASS` without actual screenshots, authenticated tests and the reviewer’s approval. Do not claim a production launch is safe from a count of green page screenshots alone.

**Release gate:** only the designated owner/release operators may approve a merged, parity-verified portal/API release pair. Payment verification, Hubtel provider permissions, real refund reconciliation, stock invariants, COD authority, backups and rollout checks must independently pass before a limited financial pilot or public production launch.

**Manual coverage:** Current source catalogue contains 79 existing application screens plus separate manual entry routes. The regression test checks that each existing `src/app/**/page.tsx` screen has a guide; if new routes are added, regenerate the manual, update the checklist and re-run the route coverage test.
