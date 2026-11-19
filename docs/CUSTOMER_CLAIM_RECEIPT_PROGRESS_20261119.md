# R3b customer return progress — read-only physical receipt and inspection totals
19 November 2026 — **source-only**; customer claims, physical-return intake and claim linking stay OFF by default.

## Verified foundation
Existing source already records accepted customer return requests, links each physical receipt to an accepted request under `PHYSICAL_RETURN_CLAIM_LINK_ENABLED`, validates exact order/line and per-claim quantity limits, locks the original order and maintains durable audit and idempotency. The roadmap previously listed this R3b link as missing, but the linked receipt API and PostgreSQL tests are already implemented.

## Added safe customer-visible progress
The owner-scoped `GET /api/v1/account/return-claims` and detail response, and the staff's existing administrator list, now include **two optional additive values per claim line**:
- `receivedQuantity` — sum of line quantities in physical receipts actually **recorded by staff** against this exact accepted request, whether awaiting inspection or inspected. It starts at `0`, and updates after partial receipts.
- `inspectedQuantity` — sum of the same linked line quantities whose receipt has the completed, independently recorded `inspected` status. It is not a product safety approval or refund approval.

The backend uses precise `Prisma.Decimal` arithmetic and selects only `PhysicalReturnReceipt.status` and `PhysicalReturnItem.orderLineId/quantity` for this read. Staff identity, receipt evidence, storage lot numbers, private inspection notes and payment information are not exposed in the customer contract.

The storefront account Returns history displays “Staff-recorded physical receipt: X of Y” and “Inspected: Z”, with an explicit statement that **neither indicates a refund, replacement, payment transfer or return to saleable stock**. A refresh button reloads the current server response without mutating it. Admin return requests show the same per-line counts as an assistance aid. All operations remain the existing authenticated, owner-scoped read routes; no new API route or grants.

For compatibility with existing deployments and demo fixtures, the new response quantities are optional, never sent by the browser as refund requests or evidence. Older APIs omit them, and the UI does not fabricate a zero or a confirmation. New production API responses include both fields even if zero. Input remains strict: quantities must be nonnegative, at most three decimal places, and cannot contain formulas or arbitrary strings.

## Regression and release checks
- Client contract tests cover zero, partial decimals, invalid/negative/overspecified/formula strings, safe customer and admin copy, strict no-refund claim schema, prior contracts and demo unavailable behavior.
- Existing PostgreSQL R3b test expanded: starts at 0/0, partial intake raises received but not inspected, multiple intake sums exactly, inspecting only the first receipt raises inspected but not received, owner HTTP can read while other customer gets 404, receipt link cannot overrun the accepted quantity, and no refund, stock receipt or stock movement occurs.
- Full GitHub frontend and API isolated PostgreSQL/security CI must pass on exact SHA before merge. Source merge is not a live deployment. Operational approval, inspect/custody policy, return windows and refund-provider evidence are separate and cannot be bypassed here.

No real customer return, refund, stock balance, active deployment, database migration, provider access, credential or service restart was performed.
