# Admin + CMS Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coherent CMS inside the existing Variety Groceries admin portal, wire published CMS content into the server-rendered storefront, and improve admin navigation around content work.

**Architecture:** Add typed CMS records to the existing shared mock service, expose public/admin operations through the existing adapter boundary, and build role-gated client admin editors under `/admin/content`. Storefront RSC pages read only published content via `server-data.ts` and preserve seeded fallback content for resilience.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Bun tests, existing mock/router adapter architecture.

**Spec:** `docs/superpowers/specs/2026-10-26-admin-cms-modernization-design.md`

## Global Constraints

- Keep the current role/permission boundary; do not create a second CMS authentication system.
- Use structured text fields only; no arbitrary HTML injection.
- Draft saves must not affect public content before an explicit publish action.
- All CMS mutations must be audited.
- Public pages must access CMS data through service adapters, not direct mock-store imports.
- Preserve existing product media/catalogue authority and current storefront behavior outside the content being made editable.
- Keep responsive controls touch-friendly and prevent page-wide horizontal overflow.

## Review Focus

- Draft/published separation: public reads must never leak unsaved/unpublished draft copy.
- Invalid slug handling: unknown page slugs must not mutate a valid record.
- Empty required copy: publish must reject blank homepage headline or blank content-page title.
- Role gating: CMS navigation/actions must remain owner/admin-only through `settings.manage`.
- Storefront resilience: content read failure must not produce a blank homepage/policy page.

---

### Task 1: CMS contracts and mock authority

**Files:**
- Modify: `packages/contracts/src/staff.ts`
- Modify: `src/services/mock/store.ts`
- Modify: `src/services/mock/router.ts`
- Modify: `src/services/operation-registry.ts`
- Modify: `src/services/client.ts`
- Modify: `src/services/server-data.ts`
- Test: `scripts/admin-cms-regressions.test.ts`

**Interfaces:**
- Produces: `CmsHomepageView`, `CmsContentPageView`, `CmsOverviewView`; ops `content.homepage`, `content.page`, `admin.content.overview`, `admin.content.homepage`, `admin.content.homepage.update`, `admin.content.homepage.publish`, `admin.content.page`, `admin.content.page.update`, `admin.content.page.publish`.
- Consumes: existing `apiOps`, mock `VgStore`, adapter `call<T>()`, `settings.manage` at UI layer.

- [ ] Write failing Bun tests for seeded published content, draft isolation, publish promotion, invalid slug, blank required content and audit mutations.
- [ ] Run `bun test scripts/admin-cms-regressions.test.ts`; expect feature-missing failures.
- [ ] Implement typed CMS records and mock operations with validation/audit.
- [ ] Add client/server adapter methods and operation cache metadata.
- [ ] Re-run focused test and existing script suite; expect green.
- [ ] Commit `feat(cms): add typed content authority`.

### Task 2: CMS portal and admin shell

**Files:**
- Modify: `src/components/layout/admin-shell.tsx`
- Create: `src/app/admin/content/page.tsx`
- Create: `src/app/admin/content/homepage/page.tsx`
- Create: `src/app/admin/content/pages/[slug]/page.tsx`
- Create: `src/features/cms/homepage-editor.tsx`
- Create: `src/features/cms/content-page-editor.tsx`
- Test: `scripts/admin-cms-regressions.test.ts`

**Interfaces:**
- Consumes: Task 1 `apiOps` CMS methods and view types.
- Produces: owner/admin CMS routes with draft/save/publish UI and storefront preview links.

- [ ] Extend the failing regression test with route/nav/permission/editor acceptance markers.
- [ ] Run focused test; expect missing-route/navigation failures.
- [ ] Build CMS overview and responsive editors using existing shared UI/state components.
- [ ] Add Storefront CMS navigation and `View storefront` action without changing longest-match active logic.
- [ ] Run focused test; expect green.
- [ ] Commit `feat(admin): add storefront CMS workspace`.

### Task 3: Published storefront content

**Files:**
- Modify: `src/app/(storefront)/page.tsx`
- Modify: `src/app/(storefront)/help/page.tsx`
- Modify: `src/app/(storefront)/returns-policy/page.tsx`
- Modify: `src/app/(storefront)/privacy/page.tsx`
- Modify: `src/app/(storefront)/terms/page.tsx`
- Create: `src/components/shared/cms-info-page.tsx`
- Test: `scripts/admin-cms-regressions.test.ts`

**Interfaces:**
- Consumes: Task 1 public CMS reads.
- Produces: server-rendered homepage hero and support/policy pages sourced from published CMS content with seeded fallback.

- [ ] Add failing tests proving storefront pages call the public CMS read boundary and render structured content.
- [ ] Run focused test; expect failure.
- [ ] Wire homepage hero and four editorial pages to public CMS data; keep accessible structured rendering and safe fallback copy.
- [ ] Run focused test and storefront regression suite; expect green.
- [ ] Commit `feat(storefront): render published CMS content`.

### Task 4: Documentation and full verification

**Files:**
- Modify: `docs/ROUTES.md`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/PERMISSIONS.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/VERIFICATION.md`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: handoff documentation accurately separating mock CMS authority from future production persistence.

- [ ] Update routes/API/permissions/known-issues docs.
- [ ] Run `bun test scripts/admin-cms-regressions.test.ts scripts/storefront-home-category-ads-regressions.test.ts`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run build`.
- [ ] Record exact verification results; do not claim unrun checks.
- [ ] Commit `docs: document admin cms handoff`.
