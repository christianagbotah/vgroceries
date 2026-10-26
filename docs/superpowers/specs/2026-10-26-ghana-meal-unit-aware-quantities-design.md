# Ghana Meal Unit-Aware Quantities Design

## Goal
Stop recipe counts or approximate recipe amounts from being misread as catalogue sellable quantities (for example, four tomatoes becoming four kilograms) while preserving live catalogue authority.

## Decisions
- Add optional recipe quantity intent to each ingredient: `sellable`, `count`, `g`, `kg`, `ml`, or `l`.
- Keep `baseQuantity` as the numeric amount and scale it by servings.
- Convert explicit recipe intent using the selected live variant's `unit` and `unitSize`.
- Fractional weight/liquid units sold directly (`kg`, `g`, `litre/liter/l`, `ml`) may return fractional quantities; kg/litre are rounded upward to 0.25 steps to preserve the existing commerce convention.
- Packaged variants (`piece`, `pack`, `bag`, `bottle`, `tin`, etc.) with parseable `unitSize` use whole package counts via `ceil(required / package capacity)`.
- Count intent uses explicit contained counts such as `30 eggs` and otherwise falls back only to clearly count-like direct units.
- Unknown or legacy ingredients without explicit intent retain the existing sellable-unit behavior.
- No product, price, availability, or inventory state is inferred or created.

## Recipe estimates
These are shopping estimates, not culinary guarantees, and remain editable before cart:
- Fresh tomatoes/onions/pepper/ginger/garlic use weight intent rather than treating counts as kilograms.
- Rice/beans use kg intent in jollof/waakye/red-red.
- Tomato paste uses grams.
- Cooking oils use litres.
- Eggs use count.
- Ingredients whose current market unit is intentionally recipe-specific or not safely convertible stay on `sellable` fallback.

## Non-goals
- No catalogue mutations.
- No schema migration.
- No cart contract change.
- No attempt to infer exact household recipes or nutritional serving sizes.
