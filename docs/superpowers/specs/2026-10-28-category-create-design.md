# Category Creation Design

## Goal
Allow authorized catalogue staff to create a category from the existing Manage Categories modal and from the Categories page without leaving the current workflow, with the same behavior in UAT demo mode and against the production API.

## Behavior
- Add an **Add category** action where category management is exposed.
- Creation form fields: Name, Slug, Description, Storefront visibility.
- Name is required.
- Slug is generated from the name by default, remains editable before save, and must be unique.
- New categories are active by default and receive the next sort order after existing categories.
- Successful creation reloads the category list immediately and keeps the manager modal open.
- Duplicate/empty/invalid slugs return an actionable validation error.
- Existing category edit behavior remains unchanged.

## Production authority
- Real staff sessions send `POST /api/v1/admin/categories`.
- The endpoint requires the `catalog.category.create` permission; current production role mapping grants it to administrators only.
- The server re-validates the shared category contract even when the browser already validated it.
- Category creation and its audit event are written transactionally.
- Duplicate slugs return `409 CATEGORY_SLUG_CONFLICT`.
- Successful creation writes `catalog.category.created` to the audit log with the authenticated actor and request id.

## UAT parity
The demo/mock authority implements the same name/slug/description/visibility behavior, duplicate-slug validation and next-sort-order rule so UAT exercises the same workflow without mutating the production backend.
