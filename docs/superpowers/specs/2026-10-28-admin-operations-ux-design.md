# Admin Operations UX Design

## Intent
Improve the admin inventory and purchasing workflow so common maintenance actions happen in-context, dense forms fit without awkward wrapping, and operational lists can be filtered quickly.

## Goals
- Open category management from Products in a modal instead of navigating away.
- Keep receiving line fields, including expiry date, on one desktop row while remaining responsive on small screens.
- Widen the stocktake counting dialog enough for its four-column table and actions.
- Add supplier card Edit actions, active/inactive toggles, and list filters.
- Add purchase-order filters and Edit actions while preserving sensible status rules.
- Add meaningful report filters, including a real date range that changes the aggregated dataset rather than only hiding rows client-side.

## Non-goals
- Redesign the purchasing domain or introduce supplier payment/accounting.
- Make completed/received purchase-order quantities freely mutable.
- Change the production Nest purchasing authority in this pass; UAT demo operations remain isolated through the existing demo adapter.

## Constraints
- Reuse the existing Next.js/Tailwind/shadcn-style UI components and typed `apiOps` boundary.
- Keep demo mutations inside the UAT mock store and audit them.
- Preserve mobile responsiveness and existing role permissions.

## Approach
Use in-page Dialogs and a small set of reusable filter/date helpers. Add explicit mock operations for supplier updates and purchase-order draft updates. Extend `admin.reports` with optional from/to query parameters so the mock report engine recomputes time-bound aggregates. This keeps the controls functional and avoids decorative filters.
