# Ghana Meal Catalogue Matching Hardening

## Intent
The Ghana meal assistant must prefer truthful incompleteness over semantically wrong grocery substitutions. A raw recipe ingredient may resolve only to a catalogue product that preserves the ingredient's culinary form; transformed foods such as plantain chips, tomato paste, roasted groundnuts, or ordinary frozen fish must not silently stand in for raw plantain, fresh tomato, groundnut paste, or salted fish.

## Goals
- Reject catalogue candidates whose product form conflicts with the requested Ghana food concept.
- Keep valid raw equivalents such as Ripe Plantain and Fresh Tomatoes resolvable.
- Keep broader search terms for discovery, but require concept-specific form evidence where a broad term could be unsafe.
- Correct obvious count-pack inflation when a variant's unitSize explicitly contains the same ingredient count (for example, 30 eggs should satisfy a 4-egg estimate with one pack).
- Preserve server-authoritative product IDs, prices, stock, and checkout revalidation.

## Non-goals
- Do not invent missing products, prices, stock, or supplier data.
- Do not add fake production catalogue rows just to make recipes look complete.
- Do not claim external LLM intelligence is enabled.
- Do not attempt a full nutrition or recipe-measurement engine in this change.

## Approach
Use reviewable matching constraints in `ghana-food-lexicon.ts`, plus a small pure matching/quantity helper consumed by `GhanaMealAssistantService`. Product discovery still uses the existing catalogue query, then the helper rejects incompatible food forms before price/availability ranking. This keeps commerce authority unchanged while making semantic matching conservative.

## Safety rule
If no compatible product remains, return `not_in_catalogue` rather than choosing a cheaper but wrong transformed product.
