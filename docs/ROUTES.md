# Implemented routes

Every route below loads, is meaningful, and carries correct active navigation. All storefront
catalogue pages are server-rendered (SEO-friendly) with client islands; admin and rider screens
are client components over the same mock API.

## Customer storefront

| Route | Purpose | Notes |
|---|---|---|
| `/` | Shop-focused homepage: compact intro, shopping-assistant entry, categories, offers, popular picks | No oversized hero; shopping starts on the first screen |
| `/shop` | Product grid with search, category filter, sorting, pagination | Only available goods; sticky filter row; state preserved in URL |
| `/categories` | Browse-all categories index with live availability counts | Fixes the previous 404; each card links into the aisle |
| `/categories/[slug]` | Category-specific shopping | Cross-links to sibling categories |
| `/assistant` | Customer shopping assistant: catalogue-grounded Q&A (evidence + suggestions), budget basket | Deterministic demo matching, honestly labelled; suggestions checked against live availability before add-to-cart |
| `/products/[slug]` | Variant selection, price, quantity, current availability | Saved link to sold-out item shows clear unavailable state, purchasing disabled |
| `/cart` | Cart editing, availability warnings, estimated totals | Client-side cart is convenience only; availability revalidated at checkout |
| `/checkout` | Guided checkout: contact, delivery/collection, zone+slot, Ghana address (locality, street, landmark, optional GhanaPostGPS, recipient, +233 phone), payment choice, review | Inline validation; minimum-order and slot-capacity rules |
| `/checkout/status/[id]` | Pending / successful / failed / expired / review-needed outcomes with provider-prompt roleplay | Duplicate callbacks are no-ops; auto-updates |
| `/track` | Secure tracking entry with reference + verification code | Both are required together; code never revealed by reference alone |
| `/account` | Profile and concise overview | Demo customer signed in |
| `/account/orders` | Order history | Links to detail |
| `/account/orders/[id]` | Order detail: lines, totals, notes, history, cancel (pre-dispatch), return entry | Post-dispatch orders route to returns |
| `/account/addresses` | Saved delivery addresses | Display + note on editing boundary |
| `/account/lists` | Wishlist, repeat-shopping (repeat last order), AI budget basket | Wishlist is local; repeat revalidates availability |
| `/account/returns` | Return requests + creation form (lines, quantities, reasons, evidence) | Eligible balances enforced |
| `/account/returns/[id]` | Return progress and refund status | Disposition shown in plain language |
| `/help` | Owner-editable help centre | |
| `/delivery` | Delivery zones, fees, minimums, hours, COD/collection | Read from zone configuration |
| `/returns-policy`, `/privacy`, `/terms` | Owner-editable policy drafts | |
| `/delivery-report` | Download page for the Delivery & Integration Report (architect handover pack) | `.docx` served from `/reports/`; no login needed; staff card lives under Reports |

## Staff back office

| Route | Purpose |
|---|---|
| `/staff/login` | Demo access and the future authentication boundary (workspace picker) |
| `/admin` | Actionable operational dashboard (queues, today's sales, reconciliation, recent orders) |
| `/admin/orders` | Orders with channel/status/payment filters and search |
| `/admin/orders/[id]` | Full order detail: customer, lines, allocations (FEFO), payment attempts, holds, history, notes; actions: confirm, pick, pack, ready/collect, dispatch, substitute (with permission + recalculation), cancel (guarded), review resolution |
| `/admin/fulfilment` | First-class fulfilment workspace: awaiting-confirmation / ready-to-pick / picking / exceptions / packed-handover / collection queues, picker + progress + allocated-vs-ordered + shortage + substitution on lines, packing checklist, handover boundary notice, event trails, backend-driven `allowedActions` | Picking and packing never deduct stock; the single depletion event happens at handover/collection |
| `/admin/pos` | Counter sales: barcode/search, tiles, cart, discounts (permission-gated), cash/MoMo/card, change, held drafts (with expiry), receipt print, transaction lookup, return entry |
| `/admin/cashier-sessions` | Opening float, movements, expected vs counted, close & reconcile |
| `/admin/products` | Products, variants, prices, availability, publication |
| `/admin/products/[id]` | Product detail: variants + price change (audited), publication, lots, movements |
| `/admin/categories` | Category management (name, description, state) |
| `/admin/inventory` | Stock overview with the availability formula visible (physical − reserved − safety) |
| `/admin/inventory/receiving` | Goods receiving with lot numbers, expiry, supplier, PO matching |
| `/admin/inventory/adjustments` | Reasoned adjustments with request → approval flow |
| `/admin/inventory/stocktakes` | Open count, variance review, close with/without corrections |
| `/admin/inventory/expiry` | Expired / expiring / quarantined / damaged lots with quarantine & disposal actions |
| `/admin/suppliers` | Supplier records (demo) |
| `/admin/purchases` | Purchase orders (drafts incl. AI-suggested, sent, received) |
| `/admin/dispatch` | Dispatch control centre: awaiting-assignment queue (handed-over orders with blockers/allowedActions), active deliveries, exceptions (failed/rescheduled), completed; assignment modal (eligible riders + reasons, manual provider booking), unassign/reassign/reschedule/return-to-store; honest COD context |
| `/admin/riders` | Rider roster: busy vs available vs off duty, active-job reference, zones, completed counts, consent-based demo location, confirm-before-off-duty availability control; mobile card view |
| `/admin/providers` | Provider adapters: in-house (configured) + external candidates (not connected) |
| `/admin/returns` | Requests, decisions, receipt, inspection, dispositions, refund requests |
| `/admin/returns/[id]` | Return detail with lines, disposition, refunds |
| `/admin/refunds` | Approval, execution (retryable), outcome tracking |
| `/admin/customers` | Customer history, support notes, permitted contact actions |
| `/admin/payments` | Attempts, callbacks, settlement state, exceptions |
| `/admin/reports` | Sales by day, top products, stock value, fulfilment/delivery, returns, cash, reconciliation; CSV export of the current dataset; Project documents card (architect report download) |
| `/admin/ai` | AI suggestions with evidence/data period, review history, business questions |
| `/admin/team` | Demo staff + permission matrix |
| `/admin/audit` | Audit events with actor/reason/before/after |
| `/admin/settings` | Business configuration (fulfilment toggles, reservation window, approval controls) |
| `/admin/demo` | Demo controls: reset, latency, offline, failures, scenarios |

## Rider workspace (mobile-first)

| Route | Purpose |
|---|---|
| `/rider/login` | Rider demo access and future authentication |
| `/rider` | Today's assigned jobs (auto-refresh), next-action hints, read-only COD context (collection authority pending) |
| `/rider/jobs/[id]` | Pickup checklist, address/contact with external Maps link, sticky lifecycle actions (accept → pickup → out → deliver-with-proof or structured fail), rescheduled/return-to-store states, notes with offline pending state |
| `/rider/history` | Completed jobs with POD and honest COD-due context (no collection state) |

## API (development-only)

| Route | Purpose |
|---|---|
| `/api/mock/v1/[operation]` | Catch-all dispatching to the mock service operations (see docs/API_CONTRACTS.md) |

## Navigation guarantees

- Role-appropriate menus; parent/child active states without marking unrelated links active.
- Search/filter state survives navigation via URL parameters.
- No visible link leads to a blank page or unfinished placeholder.
