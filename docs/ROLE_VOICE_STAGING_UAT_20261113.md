# Variety Groceries — private staging role and voice UAT (13 Nov 2026)

## Purpose
Make the entire role-based experience discoverable for testing **without granting users permissions they do not hold**. The private site uses an extra HTTP Basic perimeter; its NestJS API and PostgreSQL database are isolated from the public production environment.

## Stage-only changes
- `/uat` is a private scenario launchpad enabled only with both `UAT_DEMO_LOGIN=1` and `NEXT_PUBLIC_POS_COUNTER_UAT=1`.
- The staff-login fictional-role selector can preview owner/admin, operations manager, inventory officer, cashier, picker/packer, dispatcher and finance reviewer; these use the mock adapter and are **not valid real API credentials**.
- The POS page distinguishes demo simulation from real authenticated sample cash sales. Real staged cashier flow: `/staff/pos`; administrator verified sample checkout: `/admin/pos/verified-uat`; staged till operations: `/admin/pos/till-operations`.
- The public storefront presents a typed/optional browser-microphone question panel with optional spoken responses. The staged REST environment answers using current public catalogue search, is **not generative AI**, and never retrieves private order details without verification.
- The standalone `/assistant` page also works against a staged REST catalogue even before the server-side AI module exists. Budget suggestions are estimated from available, listed items and are revalidated at checkout.

## Role acceptance matrix
| User | Available staged verification | Production gap |
|---|---|---|
| Customer/guest | Shop, cart, checkout surfaces, private tracking entry, support, catalogue-grounded voice | Real delivery tracking, provider settlement and natural language agent integration require UAT |
| Owner/admin | Real staging cash checkout/till administration, admin dashboard plus mock preview | Full accounting authority, refund postings and cross-module permissions |
| Cashier | Authenticated assigned-location cash-only synthetic sale/receipt/reconciliation | Real cash drawer validation, real goods handover, card/MoMo settlement |
| Inventory manager | Existing real API grants plus demo screens | Complete live stocktake/lot integration verification |
| Finance/refund reviewer | Fictional-role reports/refund views | Actual server role, approval workflow and ledger posting |
| Operations manager | Fictional role orders, fulfilment and dispatch | Actual server role, reliable transitions |
| Picker/packer | Fictional role picking screens | Real server role and scanning evidence |
| Dispatcher/rider | Fictional dispatcher and rider screens | Authorised live tracking, courier integration, proof-of-delivery audit |

## Important constraints
- Test all workflows with synthetic data and never collect live payments, make live calls, or expose production customers.
- The demo mode is **never** proof of backend security: individual API roles/grants must be provisioned and tested for allowed and forbidden operations.
- Browser speech recognition may use a browser-provider service. It is activated only by a direct microphone action; typed fallback always remains.
- Checkout, stock decrement, refunds, and ledger calculations must remain server-authoritative.
- The second-level requested hostname `staging.portal.varietygroceries.com` currently fails TLS. The working private entry remains `https://pos-uat.varietygroceries.com/` until appropriate edge certificate and routing are configured.
- The precise voice-agent backend (LLM retrieval, support handoff, Twi/Ewe, secure order tool calling, real-time dispatch) is not yet connected. Do not label the browser concierge as a live AI phone call.

## Required release gates
1. Feature build + lint + type tests on exact SHA; browser checks at 360/768/1440px.
2. Real staged identity for each operational role, server-side RBAC and negative tests.
3. Shared inventory reservation concurrency and once-only stock depletion under online and POS activity.
4. Payment provider sandbox verification including duplicate/late callback and refunds; no real credentials in browser.
5. Rider assignment, user-consented location, ETA from real events, failed delivery/reassignment, customer privacy and audit.
6. Order communications: contact centre and verified rider dial/message actions, with correct consent and contact-masking.
7. Financial reporting, discounts/tax configuration, till cash, supplier reconciliations, returns and COGS reversals.
8. Owner sign-off on staging only, verified backup+rollback and explicit manual production approval.
