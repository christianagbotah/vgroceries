# Ghana Commerce + Multilingual Shopping AI Implementation Plan

**Goal:** Make Variety Groceries effortless for Ghanaian shoppers: phone-first identity, simple electronic/offline payment choices, location-first delivery addresses, and a catalogue-grounded Twi/Ga/Ewe meal-planning assistant that produces editable baskets with real stock and prices.

**Branch:** `feat/ghana-commerce-ai-20261024`

## Non-negotiable product rules

1. Customers never choose Paystack vs Hubtel vs eTranzact and never choose MoMo/card/bank inside Variety Groceries. The storefront offers a simple electronic-payment choice and applicable offline payment choice; the configured provider presents payment rails on its hosted UI.
2. A Ghana phone number is sufficient for customer registration/login. Email is optional everywhere customer identity permits it.
3. Delivery can be anchored by device GPS coordinates/current location. Typed directions and GhanaPostGPS remain useful optional helpers rather than the only location mechanism.
4. AI never invents catalogue items, stock, price, variant, payment outcome, or delivery promise. Language/meal understanding may be probabilistic; commerce resolution is deterministic and server-authoritative.
5. Start language support with Twi, Ga and Ewe, backed by a curated Ghana ingredient/dish alias lexicon that is versioned and reviewable. Speech and text feed the same planner.

## Task 1 — Integrate payment-provider base safely

- Bring committed Paystack, Hubtel and eTranzact adapters onto current `main` without disturbing logistics PR #38.
- Preserve the latest Hubtel production/refund implementation from `main`.
- Wire configured provider adapters at production API startup.
- Keep provider callbacks/webhooks authoritative for payment truth.
- Verify provider/refund authority tests and storefront payment regressions.

## Task 2 — Simplify storefront payment choice

- Customer UI choices: `Electronic payment`, `Pay on delivery` for eligible delivery zones, and `Pay at pickup` for collection.
- Internally resolve `Electronic payment` to the hosted-gateway method (`card_hosted`) so all three configured gateways can initiate one hosted experience.
- Remove customer-facing MoMo/card/bank selection and provider names from checkout/status copy.
- Paystack: omit the `channels` restriction so Paystack checkout can present its enabled rails itself.
- Paystack phone-only shoppers: generate a stable provider-only surrogate email from the customer phone/merchant callback host; never require the customer to type an email and never present the surrogate as their contact email.
- Keep admin/reconciliation attempt metadata precise and provider-specific.

## Task 3 — Phone-first customer identity

- Database migration: make `User.email` nullable + unique and `User.phone` nullable + unique after normalizing existing blank values to NULL.
- Registration requires name + Ghana phone + password; email optional.
- Login accepts one `identifier` (phone or email) + password.
- Normalize Ghana formats such as `024...`, `23324...`, `+23324...` to canonical `+233...` before uniqueness/login.
- Public registration still creates only `customer`; privileged-role rules remain unchanged.
- Update signup/login/account-profile UX and shared contracts/OpenAPI.
- Add migration and tests for phone-only registration, phone login, optional email login and duplicate normalized-phone rejection.

## Task 4 — Location-first delivery address

- Add optional latitude/longitude/location-source to saved and order-snapshot delivery addresses.
- Validation requires either meaningful textual location data/GhanaPostGPS or valid coordinates.
- Add `Use my current location` in checkout using the browser geolocation API with explicit consent and clear success/failure states.
- Persist coordinates into the order snapshot so dispatch/rider tooling can use the exact checkout location.
- Keep landmark/directions fields available for practical last-mile delivery.
- Keep a map-picker boundary so a visual map provider can be added without changing checkout contracts.

## Task 5 — Ghana multilingual meal-planning domain

- Add structured request/response contracts for text/transcript, detected language, servings, dish intent, resolved catalogue lines, unresolved concepts, totals, confidence and warnings.
- Add a versioned Ghana lexicon module for Twi/Ga/Ewe food aliases and dish concepts. Seed it with owner-provided examples and common canonical concepts; aliases are data, not UI conditionals.
- Add deterministic catalogue resolution against product names/tags/aliases and only published, available variants with server prices.
- Add initial meal templates for ampesi/kontomire-style meals and fufu + light/groundnut soup so useful planning works even without an LLM.
- Add an optional LLM interpretation layer for free-form language. Its output is only intent/ingredient concepts and must pass deterministic catalogue resolution.
- Expose a real Nest API customer-assistant endpoint rather than mock-only behavior.

## Task 6 — Conversational editable basket UI

- Replace deterministic-demo copy on `/assistant` with the Ghana shopping-assistant experience.
- Support text first plus Web Speech API capture where the browser supports it; preserve typed fallback.
- Let users change servings, quantities, remove lines and ask follow-up changes.
- Re-price/re-check availability after every change through authoritative catalogue/quote services.
- `Add all available items to cart` uses the existing cart store; checkout remains unchanged from the basket onward.
- Make language selector/auto-detection visible but non-blocking (Twi / Ga / Ewe / English).

## Task 7 — Verification and release

- Run contracts build, Prisma generation, API build/tests, storefront regressions, lint/build.
- Add focused regressions ensuring customer UI never exposes payment rails/provider selection and phone-only signup remains supported.
- Review migration safety on a copy/test database before staging deploy.
- Deploy only after the integrated branch is green; do not merge or alter logistics PR #38 as part of this feature.
