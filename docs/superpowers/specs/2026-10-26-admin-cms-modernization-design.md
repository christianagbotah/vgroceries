# Variety Groceries Admin + CMS Modernization — Design

Date: 2026-10-26  
Target: `christianagbotah/vgroceries`  
Branch: `feat/admin-cms-modernization-20261026`

## Purpose

Make the existing staff back office easier to operate and introduce the missing CMS information architecture so authorized staff can manage storefront homepage copy and owner-editable support/policy content from the same role-aware admin workspace.

## Findings

- The admin back office already has meaningful operational routes, permissions and a responsive shell.
- Catalogue/product media editing exists, but it is not presented as part of a coherent CMS workflow.
- `/help`, `/returns-policy`, `/privacy`, `/terms` and the storefront homepage hero are hard-coded even though the project brief calls this owner-editable content.
- There is no `/admin/content` CMS landing page or content-specific navigation.

## Decisions

1. **One staff workspace, not a second auth silo.** CMS lives under `/admin/content` so it inherits staff identity, RBAC, audit and navigation.
2. **Structured content, not arbitrary HTML.** Homepage hero and policy/help pages use typed text fields and section arrays. This avoids unsafe HTML and keeps public rendering accessible.
3. **Draft + publish semantics.** Editing creates a draft. Publishing explicitly promotes the draft to the public version. The demo mock keeps state in the existing shared Node-process store; a production backend remains authoritative later.
4. **Role boundary.** `settings.manage` controls content publishing/editing for this wave. Owner/admin can edit. Other roles may see only the operational surfaces already permitted.
5. **Public pages read through the service boundary.** Server-rendered storefront pages request published content through the same adapter pattern as catalogue data; they do not import the mock store.
6. **Audit every content mutation.** Save-draft and publish operations create mock audit events with actor and entity identifiers.
7. **No product/media authority changes.** Existing product media studio remains the catalogue media authority. CMS navigation links to Products/Categories as related content-management surfaces.

## CMS surfaces

### `/admin/content`
- CMS overview and status cards.
- Homepage hero status and direct edit link.
- Owner-editable pages list with draft/published status and last update.
- Quick links to product catalogue, categories and storefront preview.

### `/admin/content/homepage`
- Editable badge/eyebrow, headline, emphasized text, body copy, primary CTA label/href and secondary CTA label/href.
- Save draft and Publish actions.
- Side-by-side compact preview on wide screens; stacked on mobile.
- Publication status and last-updated metadata.

### `/admin/content/pages/[slug]`
- Support `help`, `returns-policy`, `privacy`, `terms`.
- Edit page title, introduction, and structured sections (`heading`, `body`).
- Add/remove/reorder is intentionally limited in this wave to add/remove; existing section order is preserved.
- Save draft and Publish actions.

## Public integration

- Homepage hero reads the published homepage CMS record.
- Help, returns policy, privacy and terms render from published structured CMS records.
- If content loading fails, server pages fall back to safe seeded copy rather than blanking the storefront.
- Delivery remains operational/config-driven in this wave because its zones/fees/slots are live configuration rather than purely editorial text.

## Admin shell improvements

- Add a distinct **Storefront CMS** group with Content overview and Homepage.
- Rename catalogue grouping so Products/Categories are visually related to content management without obscuring inventory operations.
- Add a desktop/mobile `View storefront` action.
- Preserve longest-match active-route logic and role filtering.
- Keep minimum 44px primary touch targets and no page-level horizontal overflow.

## Out of scope

- WYSIWYG/MDX editing remains out of scope. PostgreSQL/NestJS CMS authority was pulled into this wave after integration review showed the UAT web app uses the live API and a mock-only CMS would fail there.
- Image asset library outside the existing Product Media AI Studio.
- Navigation/menu builder.
- SEO metadata editor beyond existing page metadata.
- Production deployment/merge.

## Production hardening ruling

During PR integration review, the current UAT topology was confirmed to use the live NestJS API. A mock-only CMS would therefore render the new admin editors unusable in UAT. This wave was extended to add a `CmsContent` PostgreSQL authority, seeded migration, authenticated administrator CRUD/publish endpoints, public published-only reads, strict shared schemas, OpenAPI mappings and API integration tests. Browser-supplied actor identifiers are rejected; audit actors come from the authenticated session.

## Acceptance

1. Owner/admin sees CMS navigation and can open every CMS route.
2. A saved draft does not change public content until Publish.
3. Publishing changes the public content returned by the mock service immediately.
4. Invalid page slug is rejected by the service and admin route shows a not-found/error state rather than mutating another page.
5. Empty titles/headlines cannot be published.
6. Every mutation records an audit event.
7. Admin/CMS layouts are usable at ~360px, 768px and 1440px without page-wide horizontal overflow by construction.
8. Bun regression tests, ESLint and Next production build pass.
