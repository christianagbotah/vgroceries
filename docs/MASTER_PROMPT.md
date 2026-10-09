
Variety Groceries
Master prompt for z.ai: storefront and retail operations frontend

Business: Variety Groceries
Domain: varietygrocery.com
Market: Ghana
Prepared: 9 October 2026
Assignment: Build a complete, polished frontend prototype and hand over the source for backend integration.

Copy this entire document into z.ai. It is the build instruction, not a request for a short proposal.
1. Your role and required outcome

Act as the lead product designer and frontend engineer for Variety Groceries. Build an original, professional grocery commerce application with four connected interfaces:

    A customer storefront and account area.
    A staff back office, including counter sales/POS and inventory management.
    A dispatch dashboard for in-house riders and external delivery providers.
    A mobile-first rider workspace.

The business must process online and walk-in orders through one inventory and order model. Customers must only be offered goods that are actually available to sell. Staff must manage fulfilment, delivery, returns, and full or partial refunds.

Your assignment is a working frontend with coherent, stateful demo workflows and a documented API boundary. Our engineering team will take over the backend, real integrations, authentication, database, and production validation after your handoff. Do not claim the prototype has production-safe inventory, real payments, live AI, or live courier connections.

Deliver actual modular source code. A landing page, disconnected screens, a screenshot collection, and a written proposal are insufficient.
2. Owner requirements and planning assumptions

The following owner requirements are mandatory:

    Use the business name Variety Groceries and domain varietygrocery.com.
    Support online shopping and orders entered by staff for walk-in customers.
    Provide stock management shared by every selling channel.
    Hide unavailable goods from storefront lists, search results, recommendations, and offers.
    Provide order processing, picking, packing, dispatch, and customer tracking.
    Support in-house riders, contracted riders, and future third-party dispatch integrations in Ghana.
    Include returns, refunds, and useful AI-assisted features.
    Make the full experience professional, responsive, and easy to operate.

Use these explicit planning assumptions so you can proceed without inventing business commitments:

    Start with one business and one stock location; keep location identifiers in the data model.
    Guest checkout is supported; an account is optional.
    Home delivery and collection are configurable.
    Actual delivery areas, fees, hours, refund policy, tax treatment, and payment providers require owner configuration before launch.
    Proposed visual identity: forest green, warm ivory, and restrained amber accents. Treat this as editable direction, not an existing approved brand guide.
    PostgreSQL is a proposed backend datastore. The final backend framework is for our integration team to select.
    Subscription deliveries, a multi-seller marketplace, native mobile apps, and a full accounting system are outside this frontend assignment.

3. Design quality

Create a distinctive grocery brand experience. Use attractive product photography, clear categories, readable prices, and a compact, useful homepage. Do not use an oversized hero that pushes shopping below the first screen.

Use a restrained palette, consistent spacing tokens, readable type, and obvious primary actions. Default to a light theme. Put visual emphasis on shopping, order progress, inventory exceptions, and dispatch work.

Required interaction and layout standards:

    Use a readable base font around 16 px, with clear labels and comfortable buttons.
    Target touch controls of at least 44 px; give mobile primary actions generous spacing.
    Give enabled buttons, links, and interactive triggers pointer cursors; disabled controls must look disabled.
    Keep filters and actions aligned on one desktop row where space permits. Wrap them naturally on mobile.
    Use two product columns on small phones where readability allows, then expand the grid on larger screens.
    Keep admin cards responsive and prevent page-wide horizontal overflow.
    Match table headings and values exactly. Confine any horizontal table scrolling to the table container.
    Use sensible sticky navigation and table headers; never cover content with fixed footers.
    Provide keyboard navigation, visible focus states, semantic labels, adequate contrast, and accessible dialogs.
    Use inline validation, confirmation dialogs, and useful notifications instead of browser alerts.
    Every screen must have meaningful loading, empty, success, and error states.
    Make date fields and their calendar triggers easy to click across the whole input area.
    Avoid excessive gradients, tiny text, slim buttons, decorative chart clutter, and inconsistent icon styles.

Use a text wordmark until an owner-supplied logo is available. Do not invent endorsements, customer testimonials, certifications, guaranteed delivery times, or a business address.
4. Technical architecture

Prefer Next.js App Router, React, TypeScript, and Tailwind CSS. Use the existing compatible project setup if z.ai supplies one, and document any necessary difference. Reuse an accessible component system such as shadcn/ui if available.

Pin compatible dependency versions with a lockfile. Do not upgrade dependencies simply to chase a version number.

Keep the application modular:
Area	Responsibility
src/app	Storefront, staff, and rider routes and their layouts
src/components/ui	Shared buttons, fields, dialogs, tables, and other primitives
src/components/layout	Storefront header, staff sidebar, rider shell, and navigation
src/features/catalog	Products, categories, variants, search, and availability
src/features/checkout	Cart, reservation, checkout, and payment status
src/features/orders	Order details, fulfilment, tracking, and notifications
src/features/inventory	Stock, lots, receiving, adjustments, and stocktakes
src/features/pos	Counter sales, receipts, and cashier sessions
src/features/delivery	Dispatch, providers, riders, and delivery evidence
src/features/returns	Return inspection, decisions, approvals, and refunds
src/features/ai	Grounded assistance and reviewable recommendations
src/services	Replaceable API clients and development-only mock adapters
src/types and src/schemas	Shared domain types and input validation
docs and tests	Handoff documentation and meaningful verification

Keep view components separate from business operations. Do not scatter fixture arrays or fake API responses across pages. Use one shared, stateful mock service and explicit service interfaces.

Storefront product metadata and public content should be suitable for server rendering and SEO. Add client-side interactivity where needed, rather than making the whole application a single client component.

Browser storage may preserve a cart and non-sensitive demo state. It is not authoritative stock, payment truth, or an authentication system. If you use development-only server handlers for shared demo state, document their reset behaviour and single-process limitations.
5. Routes and navigation

Implement the following route groups. Supporting detail forms may be dialogs or nested routes, but every listed screen must exist and serve its stated purpose.
Customer storefront
Route	Purpose
/	Shop-focused homepage, categories, available goods, and useful offers
/shop	Product grid, search, categories, filters, sorting, and pagination
/categories/[slug]	Category-specific shopping
/products/[slug]	Variant selection, price, quantity, and current availability
/cart	Cart editing, availability warnings, and estimated totals
/checkout	Contact, delivery or collection, slot, totals, and payment choice
/checkout/status/[id]	Pending, successful, failed, expired, and review-needed outcomes
/track	Secure tracking entry using an order reference and verification
/account	Profile and a concise account overview
/account/orders and /account/orders/[id]	Order history and detail
/account/addresses	Saved delivery addresses
/account/lists	Wishlist and repeat-shopping lists
/account/returns and /account/returns/[id]	Return requests and progress
/help, /delivery, /returns-policy, /privacy, /terms	Owner-editable support and policy content
Staff back office
Route	Purpose
/staff/login	Demo access and the future authentication boundary
/admin	Actionable operational dashboard
/admin/orders and /admin/orders/[id]	Orders, filters, detail, notes, and permitted actions
/admin/fulfilment	Picking and packing queues
/admin/pos	Fast counter sales
/admin/cashier-sessions	Opening float, cash sales, collections, and closing reconciliation
/admin/products and /admin/products/[id]	Products, variants, prices, images, and publication
/admin/categories	Category management
/admin/inventory	Stock overview by item and location
/admin/inventory/receiving	Goods receiving and purchase-order matching
/admin/inventory/adjustments	Reasoned stock adjustments and approval
/admin/inventory/stocktakes	Count entry and variance review
/admin/inventory/expiry	Expiring, expired, quarantined, and damaged lots
/admin/suppliers and /admin/purchases	Suppliers and purchase-order drafts
/admin/dispatch	Delivery assignment and exception handling
/admin/riders and /admin/providers	Rider availability and provider configuration
/admin/returns and /admin/returns/[id]	Requests, inspections, and dispositions
/admin/refunds	Refund approval and payment outcome tracking
/admin/customers	Customer history, support notes, and permitted contact actions
/admin/payments	Attempts, settlement state, reconciliation, and exceptions
/admin/reports	Sales, stock, fulfilment, delivery, returns, and cash reports
/admin/ai	AI suggestions, supporting evidence, and review history
/admin/team, /admin/audit, /admin/settings	Roles, activity, and business configuration
Rider workspace
Route	Purpose
/rider/login	Rider demo access and future authentication
/rider	Assigned jobs and today's work
/rider/jobs/[id]	Pickup, delivery instructions, customer contact, and status actions
/rider/history	Completed jobs and collection history

Use role-appropriate menus. Maintain correct parent and child active states without marking unrelated links active. Keep search and filter state during normal navigation. No visible link may lead to a blank page or an unfinished placeholder.
6. Inventory: the central business invariant

Model availability per SKU, variant, stock location, and eligible lot.

Define:

Available to sell = sellable physical quantity - active reservations - configured safety stock.

Sellable physical quantity excludes expired, damaged, quarantined, and otherwise unsaleable stock. Do not subtract the same held quantity twice.

Mandatory behaviour:

    When availability is zero, remove that SKU from all purchasable storefront lists and recommendations.
    When every variant is unavailable, hide the product from normal storefront discovery.
    A previously saved link may show a clear unavailable state, with purchasing disabled.
    Revalidate availability and price at checkout and before completing a counter sale.
    Browsing and adding to a cart do not permanently reserve stock.
    Creating a checkout order reserves stock for a configurable period.
    Reserve a whole multi-item order atomically, or return clear line-level conflicts without leaving stray holds.
    Both online orders and POS use the same reservation and inventory service.
    Use a single documented stock-depletion event. For delivery, dispatch can consume both physical stock and its reservation; for counter sales, completed handover consumes them together.
    Picking and packing must not deduct physical stock again.
    Cancellation releases unconsumed reservations. Cancellation after stock has left the store requires an actual return process before restocking.
    Returned goods enter inspection or quarantine; only an approved saleable disposition makes them available again.
    Selecting collection versus delivery must use an appropriate stock source. Do not invent an inter-location transfer.
    Demonstrate a last-unit conflict in the mock service. Document that real multi-user concurrency requires a backend transaction or equivalent atomic constraint.
    When authoritative stock cannot be verified, allow draft work but do not present a completed sale.

Support configurable purchasing and selling units, such as carton, pack, piece, kilogram, and litre. Record explicit conversion factors. Track fractional quantities with decimal strings or scaled integers; do not use imprecise floating-point values as stock authority.

Support lot numbers, expiry dates, goods receiving, supplier references, damage, wastage, and reasoned adjustments. Suggest first-expiring eligible lots for picking.
7. Checkout, order fulfilment, and payment

Create a guided checkout with guest contact details, saved-address support, delivery or collection, delivery eligibility, slot selection, and a fully itemised total.

For Ghana addresses, support locality, street or descriptive address, landmark, an optional GhanaPostGPS digital address, optional map coordinates, recipient name, and a +233-compatible phone number. A digital address field must not pretend to be an integrated geocoding API.

Keep these state dimensions separate:
Dimension	Example states
Payment	unpaid, pending, succeeded, failed, expired, partially_refunded, refunded, requires_review
Fulfilment	awaiting_confirmation, confirmed, picking, packed, dispatched, delivered, ready_for_collection, collected, cancelled
Delivery	unassigned, assigned, accepted, picked_up, out_for_delivery, delivered, failed, rescheduled, return_to_store
Return	requested, approved, rejected, received, inspected, resolved
Refund	requested, awaiting_approval, processing, succeeded, failed, requires_review

Display human-readable labels and a timestamped history. Enforce permitted transitions in the mock service; document backend enforcement requirements.

Offer configurable Mobile Money, hosted card checkout, verified bank transfer, cash at counter, and cash on delivery. Hubtel is a candidate adapter for later integration, not an already connected merchant account.

Payment safeguards:

    A browser redirect or customer screenshot cannot mark an order paid.
    The future backend must confirm provider outcomes using its supported verification mechanisms.
    Include payment attempt identifiers and idempotency keys.
    An unknown outcome stays pending or requires review; do not encourage a duplicate payment blindly.
    Demonstrate a successful payment, failure, pending outcome, abandoned checkout, and duplicate callback.
    A reservation expiry with an unresolved payment requires reconciliation.
    If payment succeeds after the reservation has expired, recheck stock. Route an unsatisfied paid order to staff review and the supported cancellation/refund process.
    Cash-on-delivery orders may be confirmed while payment remains unpaid.
    Delivery completion, cash collection, and rider remittance are different events.
    Keep provider secrets and card details out of the frontend.

Money must use integer minor units or a documented decimal representation, with GHS as the currency code and a consistent visible ₵ format. The backend will calculate authoritative prices, discounts, fees, tax, and totals. Do not hardcode assumed Ghana tax rates.
8. Staff order operations and counter sales

Order detail must show customer contact, channel, lines and variants, quantities, allocation, payment state, fulfilment state, delivery or collection, totals, notes, history, and available actions.

Implement staff workflows for order search, confirmation, picking, packing, shortages, substitutions, cancellation, and dispatch. Substitutions require customer permission or a clearly recorded preference. Recalculate price differences through the service; never silently replace a product or charge more.

The POS interface must support:

    Barcode input and fast product search.
    Large, clear item selection and quantity controls.
    Walk-in customer or optional selected customer.
    Unit and variant selection.
    A cart, controlled discounts, and itemised totals.
    Cash, Mobile Money, and card payment states appropriate to the selected method.
    Change calculation for cash.
    Held draft sales that do not bypass reservation expiry.
    Completed-sale receipt printing and transaction lookup.
    Returns initiated from the original transaction.
    Opening float, cash movements, expected cash, counted cash, and closing differences.

Keep the POS efficient for keyboard and touch use. Avoid sending cashiers through a long ecommerce checkout for each counter sale.
9. Dispatch and delivery in Ghana

Provide delivery-zone configuration with eligibility, fees, minimum order rules, service hours, cutoffs, and slot capacity. These are owner-configured values, not invented nationwide coverage promises.

The dispatch dashboard must support:

    Ready-to-dispatch orders, assignment, rider availability, and workloads.
    In-house riders, contracted riders, and manual third-party bookings.
    Delivery instructions, contact actions, and pickup checks.
    Failed deliveries, rescheduling, cancellation requests, and return-to-store.
    Cash-to-collect amounts and remittance reconciliation.
    Proof of delivery using an approved PIN, signature, or evidence option.
    A timestamped delivery history visible to appropriate staff.

The rider interface must be usable on an ordinary Android phone: large actions, clear addresses, optional map navigation, contact buttons, and a simple job checklist. Show assigned customers only.

Location tracking must be optional, permission-based, and show its last update time. Any simulated map or location must be labelled Demo. Do not display invented live rider movement or fabricated ETAs.

Define a provider adapter with capabilities such as quote, book, cancel, status, webhook updates, and proof of delivery. Keep manual booking available when an external provider lacks an integration.

Do not name a courier as integrated or invent its API. The owner will select providers after their current coverage, commercial terms, technical access, and capabilities are checked.

For interrupted connectivity, keep unsent rider notes or evidence as clearly pending. Avoid duplicate uploads and status changes on retry. Do not claim an unsubmitted delivery action succeeded.
10. Returns, refunds, and exchanges

Make returns and refunds first-class workflows for online and counter orders.

Customers or staff select original order lines, eligible quantities, reasons, and evidence. Support full and partial returns, approval or rejection, receipt at the store, condition inspection, and a disposition.
Disposition	Stock effect
Saleable and approved for restock	Return to an eligible saleable lot or a properly recorded new lot
Damaged, expired, or unsafe for resale	Remain unsaleable; record loss or approved disposal
Needs inspection or supplier review	Keep quarantined
Never physically returned	Do not increase physical stock

Provide refund previews based on original paid amounts, allocated discounts, applicable tax, and the configured delivery-fee policy. Track cumulative returned quantities and cumulative refunds so neither can exceed the eligible original balance.

Support refund approvals, reasons, provider references, retryable failures, and reconciliation. A refund request or approval is not a completed money transfer.

Distinguish a payment-provider refund from an unrelated payout. Keep manual refund recording clearly identified and permission-controlled.

Reflect authorised reversals in sales, stock, cost of goods where applicable, tax, cash/payment balances, and reporting. Document the authoritative backend ledger requirements.

Model an exchange as a traceable return plus a new sale, with a linked price difference. Do not overwrite the original sale history.
11. Useful AI-assisted features

Build clear frontend workflows for these capabilities. Use deterministic, clearly labelled demo suggestions until a real model is connected.
Capability	Useful behaviour
Shopping assistant	Answer questions using the available catalogue, actual demo prices, and stock
Budget shopping list	Suggest a reviewable basket within a stated budget
Alternatives and repeat buying	Suggest available variants or related goods; explain the suggestion
Replenishment assistant	Flag projected shortages and suggest purchase-order drafts
Expiry assistant	Identify near-expiry eligible lots and propose reviewable promotions
Dispatch assistant	Suggest delivery grouping using zones, capacity, and stated constraints
Operations assistant	Explain delays, stock conflicts, and payment exceptions from recorded events
Business questions	Answer fixture-based sales, stock, and delivery questions with supporting records
Exception flags	Highlight unusual returns or transactions for human review using stated evidence

AI must not invent stock, prices, product ingredients, delivery coverage, or payment outcomes. Do not claim allergy suitability from incomplete information.

AI must not automatically pay suppliers, issue refunds, change prices, publish promotions, substitute order items, or modify stock. Present suggestions for an authorised person to review.

Show the data period and evidence behind a recommendation. If there is insufficient history for forecasting, say so. Do not display fabricated accuracy scores.

Expose provider-neutral backend interfaces. Keep model keys private. An unconnected integration must say Not connected rather than Live AI.
12. Roles, audit, and boundaries

Provide customer, owner/admin, operations manager, inventory officer, cashier, picker/packer, dispatcher, rider, and finance/refund reviewer views.

Use an explicit permission matrix for actions including price changes, discounts, adjustments, cancellation, refund approval, cash reconciliation, customer information, and settings.

Role-aware menus are UX only. Document that the backend must enforce access on every protected operation and resource.

Use fictional demo identities. A demo-account dropdown or role selector must be enabled only in demo mode and excluded or disabled in production. Do not create real shared credentials.

Record actor, timestamp, entity, reason, and relevant before/after values in mock audit events. Production logs must avoid exposing secrets or unnecessary personal information.

Include loading and expired-session states. Customer order tracking must not expose private data through a guessable reference alone.
13. Domain contracts and integration readiness

Define typed models for:

Product, Variant, Category, UnitConversion, Location, StockLot, StockMovement, Reservation, Customer, Address, Order, OrderLine, PaymentAttempt, CashierSession, DeliveryJob, Rider, Provider, ReturnRequest, ReturnLine, Refund, Supplier, PurchaseOrder, AuditEvent, and AISuggestion.

Use stable IDs, UTC timestamps, currency codes, and clear quantity representations. Keep payment, fulfilment, delivery, return, and refund status fields separate.

Document proposed versioned API operations, including:

    Catalogue search, detail, pricing, and availability.
    Checkout reservation creation, release, and expiry.
    Order creation, detail, cancellation, and permitted transitions.
    POS completion and receipt retrieval.
    Goods receiving, adjustments, stocktakes, and lot eligibility.
    Payment initiation, status verification, callbacks, and reconciliation.
    Delivery quotes, assignment, booking, tracking, and evidence.
    Return creation, approval, receipt, inspection, and disposition.
    Refund preview, approval, execution, status, and reconciliation.
    Reports, role permissions, audit events, and AI suggestions.

These are proposed application contracts, not claims about third-party endpoints.

Document request/response schemas, pagination, validation, access requirements, idempotency, and expected errors. Include OUT_OF_STOCK, RESERVATION_EXPIRED, VERSION_CONFLICT, PAYMENT_PENDING, PAYMENT_REQUIRES_REVIEW, REFUND_LIMIT_EXCEEDED, DELIVERY_ZONE_UNSUPPORTED, FORBIDDEN, and VALIDATION_FAILED.

Explain how a real API adapter replaces the mock adapter without rewriting page components. Plan cache invalidation or live updates so a completed counter sale refreshes affected storefront stock and staff reports.
14. Demo data and realistic operation

Seed at least 36 fictional products across useful grocery categories, with images or reliable fallbacks, variants, units, clear sample prices, and coherent stock.

Include low-stock, zero-stock, expired, quarantined, and damaged examples. Some stock must be reserved so physical stock and available stock can be distinguished.

Add linked fixture customers, suppliers, riders, orders, payment attempts, cash sessions, returns, and delivery jobs. Use fictional Ghana contact details and addresses clearly identified as demo data.

Include online delivery, collection, counter sale, pending payment, failed payment, cash on delivery, partial return, approved refund, failed delivery, and near-expiry examples.

Derived dashboard totals and reports must reconcile with the underlying fixture data. Filters must affect the records and charts they describe. Exports must export the current filtered dataset.

A demo control panel may reset fixtures and simulate shortages, slow responses, expired reservations, duplicate callbacks, and payment failures. Keep technical controls out of normal customer flows.
15. Build sequence and completion criteria

Work in this order:

    Establish the project structure, visual tokens, shared components, routes, and navigation.
    Build a complete vertical workflow: customer selects stock, checks out, staff fulfils the order, a rider delivers it, and the customer sees progress.
    Connect counter sales to the same mock stock and order services.
    Complete inventory receiving, adjustments, expiry handling, and stocktakes.
    Complete delivery exceptions, returns, refund review, and reconciliation views.
    Complete AI suggestion interfaces, reports, role views, and settings.
    Verify responsiveness, accessibility, core behaviour, and source handoff.

Every listed page must be navigable and meaningful. Prioritise the coherent core workflow before decorating secondary screens.

Acceptance scenarios:

    A zero-availability variant disappears from purchasable lists and cannot be added through a saved link.
    A final unit reserved online cannot also be completed in POS in the mock scenario.
    An expired or cancelled unpaid reservation releases its unconsumed hold.
    A dispatch or POS completion consumes stock once, even when an action is retried.
    An unresolved payment remains pending; a late payment with unavailable stock reaches staff review.
    A completed counter sale updates the relevant catalogue and dashboard views.
    A picker sees the correct variants, units, quantities, and eligible lots.
    A dispatcher assigns a packed order and the assigned rider sees the correct job.
    A cash-on-delivery order tracks delivery, collection, and remittance separately.
    A failed delivery can be rescheduled or returned to store without a phantom stock increase.
    A partial return preserves the remaining quantities and calculates a consistent refund preview.
    Repeated return or refund actions cannot exceed the original eligible amounts.
    Damaged or expired returns do not become purchasable.
    AI only suggests available goods and does not execute sensitive changes.
    Staff and rider menus reflect their permissions.
    Search, sorting, filters, pagination, dialogs, forms, receipts, and exports function.
    Every visible route loads, with correct active navigation.
    Layouts work at approximately 360 px, 768 px, and 1440 px without page overflow.
    Slow, failed, and offline operations communicate what actually happened.
    The project builds and passes the checks available in the environment.

Use meaningful tests for inventory transitions, duplicate actions, refund limits, and primary workflows. Record manual checks for visual and interaction quality. Do not report a check as passed unless you ran it.
16. Source and report handoff

Provide the complete source export or repository location, not only screenshots and a summary.

Include these files:
Deliverable	Required content
README.md	Setup, commands, architecture, demo access, reset instructions, and limitations
docs/ROUTES.md	Implemented routes and their purpose
docs/API_CONTRACTS.md	Models, services, errors, and proposed backend boundaries
docs/PERMISSIONS.md	Roles and action permissions
docs/DEMO_SCENARIOS.md	Fixture scenarios and how to exercise them
docs/VERIFICATION.md	Actual build, lint, type, test, and manual-check results
docs/KNOWN_ISSUES.md	Exact incomplete work, defects, and integration limits
docs/HANDOFF.md	What the next team should connect and verify first
.env.example	Variable names and safe placeholder values only
Dependency lockfile	Reproducible package versions

The final report must separate implemented frontend behaviour, simulated services, proposed backend work, and external integrations that are not connected.

If execution limits prevent completion, preserve runnable source, explain the precise stopping point, and record the next action. Do not restart the application or replace finished work with another prototype.

Do not deploy to the purchased domain, initiate real payments, message customers, or register external accounts during this assignment. Prepare the source and handoff for our team.

Begin by inspecting the available starter environment, briefly confirming your implementation approach, and then building the working application.
17. Official reference notes

These references were checked on 9 October 2026. They inform integration planning; they do not establish a merchant account or an active connection.

    Hubtel's developer portal describes Mobile Money and card payment collection: https://developers.hubtel.com/
    GhanaPostGPS explains Ghana digital addresses: https://nas.ghanapostgps.com/get-help/
    Next.js documents App Router project organisation: https://nextjs.org/docs/app/getting-started/project-structure

Confirm commercial access and current provider-specific payment verification, refund, and courier capabilities during backend integration.