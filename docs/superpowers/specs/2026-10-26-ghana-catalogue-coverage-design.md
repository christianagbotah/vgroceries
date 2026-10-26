# Ghana Catalogue Coverage / Sourcing Design

## Purpose
Give Variety Groceries staff a truthful, reviewable view of how the live catalogue supports the Ghana meal assistant, so missing ingredients can be sourced without the AI inventing products, prices, units, stock or demand.

## Source of truth
- Ghana meal requirements come only from `GHANA_MEAL_TEMPLATES` required ingredients.
- Product identity/form matching reuses the Ghana food lexicon and catalogue semantic matcher.
- Product publication, variants and stock availability remain server-authoritative catalogue/database data.
- The workflow never creates, publishes, prices, receives or replenishes a product automatically.

## Coverage states
Each required Ghana ingredient concept is projected into exactly one state:

1. `available`: at least one correctly matched published product has sellable stock now.
2. `out_of_stock`: a correctly matched published product exists, but none of its active variants has sellable stock now.
3. `wrong_form_only`: no correctly matched published product exists, but one or more published products mention the concept while failing its culinary-form rules (for example Plantain Chips for raw plantain).
4. `missing`: no correctly matched or wrong-form published product candidate exists.

Unpublished drafts do not establish assistant coverage. They remain non-public work in progress.

## Row contents
Each row exposes:
- concept id and human label;
- affected Ghana meal ids/labels;
- meal count (used only as a sourcing-priority signal, never as demand forecasting);
- coverage state;
- correctly matched published products, including whether each is sellable now;
- wrong-form candidate products, when applicable;
- a suggested product name for staff prefill only.

Rows sort by operational attention: missing, wrong-form-only, out-of-stock, available; then meal count descending; then ingredient label.

## API
Add administrator-only `GET /api/v1/admin/ai/ghana-catalogue-coverage`.

The endpoint is read-only and protected by the existing admin `AccessGuard`. OpenAPI documents the response and explicitly states that the output is evidence/sourcing guidance, not purchase or publication authority.

## Admin UI
Add a `Catalogue coverage` tab to `/admin/ai` with summary counts and responsive cards/table-style rows. Each row shows status, affected meals, live correct matches, wrong-form candidates and impact count.

For `missing`, `wrong_form_only`, and `out_of_stock` rows, staff with `catalog.edit` may open the product catalogue workflow. The link is `/admin/products?newProduct=1&name=<ingredient label>&source=ghana-ai`.

The product page reads these query parameters, opens the existing Add Product dialog and pre-fills only the product name/slug. Category, unit, price, variants and stock remain blank and require staff verification. It never auto-creates a draft.

## Non-goals
- No supplier selection or purchase-order creation.
- No inferred price, pack size, unit conversion, stock level or demand forecast.
- No automatic product publication.
- No use of wrong-form products to satisfy recipe coverage.
