# Variety Groceries — real shopping AI backend and customer support UAT

**Scope:** Isolated UAT service and database, not a production launch.

## Server-backed shopping assistant
- POST `/api/v1/ai/assistant` accepts `{ "question": "rice" }` (1–400 characters).
- POST `/api/v1/ai/budget-basket` accepts `{ "budgetMinor": 10000 }` (integer pesewas).
- Results use the authoritative published, eligible, positive-availability catalogue service. Hidden, unsaleable, damaged, expired or zero-available variants are not suggested.
- Budget baskets are reviewable suggestions, not accepted orders or promises of available quantities.
- Sensitive order, tracking, payment, rider and refund-status questions require separate authenticated/verified tracking and are never answered from unverified guest chat.
- `VG_AI_CHAT_PROVIDER=openai`, `VG_AI_CHAT_API_KEY` and `VG_AI_CHAT_MODEL` are optional **server-only** settings. Without all required configuration, the assistant uses transparent deterministic catalogue guidance. No keys in browser, Git or logs.
- Even with a configured model, the API supplies only verified catalogue facts, returns its own evidence/suggestion list, and gives the model no mutation tools or customer personal data.
- Request limit: 20 queries/minute/IP per API process. Add shared edge/Redis throttling before scale-out.

## Human contact request, no pretend phone call
- POST `/api/v1/support/requests` creates an audited guest case with name, Ghana phone, optional email, subject, optional order *reference*, message and explicit contact consent.
- Visitor receives only random case reference, status and disclaimer, not private case contents.
- Request creation requires a trusted website Origin and a shared, database-backed rate limit (four per 15 minutes/IP); personal fields are excluded from audit log details.
- GET `/api/v1/admin/support` and POST `/api/v1/admin/support/{caseId}/actions` require genuine authenticated admin sessions (with CSRF for state changes).
- The admin inbox shows the phone number and a click-to-dial link for manual follow-up, plus audit notes and status transitions. Creating or closing a case does not automatically send an SMS, email or call.
- Public UI `/support` and administrator UI `/admin/support` are linked from the private UAT centre and Help page.

## Isolated database migration
`202611130001_customer_support_cases` creates `CustomerSupportCase` and append-only `CustomerSupportActivity`.
Make an isolated staging backup before `prisma migrate deploy`. The migration does not touch Orders, Payments, stock, POS or production data.

## Required UAT
1. GET AI routes must not exist (POST only); reject oversized/malformed JSON and budget values.
2. Query an in-stock staged rice item; confirm exact current staged price and sellable quantity from catalogue. Re-test after simulated depletion.
3. Query an unavailable item; verify no purchasable recommendation.
4. Ask about a private order/payment; verify no private customer data is revealed.
5. Submit one synthetic case through `/support`; verify reference only, then confirm admin inbox contains it.
6. Guest/admin unauthenticated and non-admin `/admin/support` requests must return 401/403. CSRF must protect admin writes.
7. Admin changes case to acknowledged/in_progress/resolved with note; check activity and audit events.
8. Repeat requests beyond rate limit; verify no uncontrolled spam.
9. At 360/768/1440 pixels, verify form, chat, keyboard and optional microphone fallback.
10. Restore backup, rollback and customer-data retention review before production acceptance.

## Still not connected
- Actual telephone call/SIP provider, WhatsApp, SMS, e-mail outbound delivery, real time rider voice calling.
- Verified LLM provider without owner-configured server credentials.
- Full authenticated staff roles beyond current backend roles.
- Live customer contact-office details and SLA; these must be configured from owner-approved business information.

## Observed staging evidence — 13 November 2026
- Confirmed the UAT API database is `variety_pos_staging` on 127.0.0.1:55436, separate from the existing public portal's database.
- Verified a fresh isolated database backup before migration.
- Migration status showed **only** `202611130001_customer_support_cases` pending; this exact migration deployed successfully.
- API TypeScript compile passed; seven focused AI/support source tests passed.
- `POST /ai/assistant` returned verified rice suggestion evidence; `POST /ai/budget-basket` returned an under-budget collection.
- Private order question did not return product or order details.
- Created one fictional UAT support case; public response had a reference, status, and disclaimer only.
- Unauthenticated admin support GET/POST returned HTTP 401; support submission without trusted website Origin returned HTTP 403.
- Next.js staging build with `/support`, `/admin/support`, and `/uat` completed and the isolated staging web service returned HTTP 200 on all three routes.
- Updated frontend staff-role context to fetch genuine admin/inventory/cashier identity from the authenticated API; this does **not** create the missing production roles.
- Browser tests for the final role-context build and owner-led UAT remain separate acceptance steps.
