# Staff sidebar discovery — 17 November 2026

## Scope

The staff/admin shell remains the source of truth for its role-aware navigation.
Following the desktop width reduction from 256 px to 224 px (with a 64 px compact
option), the expanded desktop menu and mobile drawer now provide an inline
**Find a page** filter.

- Match page names, group headings and route fragments, ignoring case and
  extra whitespace; multi-word queries require all words to match.
- Filter against the currently selected staff role **before** search; an
  unauthorized page does not become visible just because its group matches.
- No-results text explicitly says no *accessible* pages matched.
- Clicking a destination clears the search and closes the mobile drawer.
- Escape and a dedicated clear control reset the filter. The compact icon-only
  sidebar clears search on collapse, keeping all authorized icon destinations
  available.
- The existing main-content/sidebar independent scrolling, narrow mobile
  drawer, and locally remembered desktop collapse preference are retained.

This is UX-only; neither navigation filtering nor demo role selection grants
API permissions. The backend must enforce RBAC on all routes and mutations.

## Tests and release boundary

`scripts/admin-nav-search.test.ts` covers default authorized menus,
permissions-first filtering, query/route matching, multi-term search,
whitespace and source-data immutability. The repository CI also runs
ESLint, TypeScript, production Next build, regression/contract checks and
route sweep. Check the pull-request workflow results rather than assuming
that a source change is deployed.

**Source-only.** No production or POS-integrated staging processes, ports,
feature flags, payments or rollout approvals are modified. The separate
POS/canonical parity and backup/restore gates remain mandatory before
shipping a new portal release.
