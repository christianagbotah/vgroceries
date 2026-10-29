# Category Creation Design

## Goal
Allow authorized catalogue staff to create a category from the existing Manage Categories modal and from the Categories page without leaving the current workflow.

## Behavior
- Add an **Add category** action where category management is exposed.
- Creation form fields: Name, Slug, Description, Storefront visibility.
- Name is required.
- Slug is generated from the name by default, remains editable before save, and must be unique.
- New categories are active by default and receive the next sort order after existing categories.
- Successful creation reloads the category list immediately and keeps the manager modal open.
- Duplicate/empty/invalid slugs return an actionable validation error.
- Existing category edit behavior remains unchanged.

## Scope
The write path is implemented in the UAT/mock authority used by the current portal demo. No unsupported production REST endpoint is invented in this change.
