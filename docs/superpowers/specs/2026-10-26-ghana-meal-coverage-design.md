# Ghana Meal Coverage and Catalogue Gap Design

## Intent
Extend the catalogue-grounded Ghana shopping assistant so customers can ask for jollof rice, waakye, and red-red, while admins see when required Ghana meal ingredients have no currently purchasable catalogue match.

## Goals
- Recognize Ghana jollof rice, waakye, and red-red using deterministic templates.
- Resolve only to live published catalogue products with available stock and preserve existing culinary-form safety rules.
- Keep quantities conservative at the sellable-unit level; do not infer hidden package conversions beyond existing explicit rules.
- Surface required recipe ingredients that have no currently purchasable catalogue match as human-reviewable Admin AI suggestions.
- Keep all operational actions human-approved; suggestions must never create products, alter stock, set prices, or place supplier orders.

## Non-goals
- No automatic supplier ordering or stock creation.
- No claim that a single template is the canonical household recipe.
- No LLM dependency and no fabricated product, price, stock, payment, or delivery facts.
- No database migration.

## Approach
Use the existing deterministic lexicon/templates and the existing Admin AI suggestion feed. Add food concepts needed by the three meals, add the templates, and extend the shared catalogue matcher with a pure coverage function. Admin intelligence will page through the live purchasable catalogue and create stable `operations_explanation` suggestions for missing required concepts. This avoids a new suggestion contract while making the gaps visible immediately in the existing Admin AI page.

## Constraints
- Node 24 / NestJS API / Next.js frontend.
- Catalogue, availability, price and checkout remain server-authoritative.
- Wrong culinary forms remain unresolved rather than silently substituted.
- Existing review/dismiss audit behavior must apply to catalogue-gap suggestions.
