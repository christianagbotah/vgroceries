# Variety Groceries — private POS staging walkthrough

**Purpose:** Let the business owner test the actual API-backed POS workflow using
synthetic groceries, test cash, and a separate PostgreSQL database. This is
not a production activation, live payment collection, or merchant settlement.

## Access

- Private HTTPS site: **https://pos-uat.varietygroceries.com/**
- Staff login: **https://pos-uat.varietygroceries.com/staff/login**
- Verified sample cash checkout (administrator only):
  **https://pos-uat.varietygroceries.com/admin/pos/verified-uat**
- Cash-drawer reports (administrator):
  **https://pos-uat.varietygroceries.com/admin/cashier-sessions**
- Assigned-location cashier reports (cashier account):
  **https://pos-uat.varietygroceries.com/staff/cashier**
- Sample storefront: **https://pos-uat.varietygroceries.com/shop**

The HTTPS perimeter requests a **separate Basic authentication password**
before the staff-login screen opens. The perimeter and real staff accounts
have different passwords. **Never commit or publish any of them.** The
individual synthetic stage admin/cashier passwords and perimeter password are
stored in protected files on the authorised VPS. Do not use live business
accounts or real customer details.

## Test a cash-only transaction

1. Pass the private site access prompt, then sign in with the **individual
   UAT administrator** account. Cashiers intentionally remain read-only.
2. Open **Verified sample cash checkout**, not the older `/admin/pos` demo.
3. Choose the open **UATACCRA01** till, which belongs to the configured
   UAT stock location. The Kumasi test location is deliberately unassigned
   to the cashier and has no sample stock.
4. Add **UAT Sample Rice** (e.g. quantity 2) and **UAT Sample Salt**
   (e.g. quantity 1). Check the quoted total and availability.
5. Click **Reserve sample stock**. The test reservation must report a real
   staging hold and is time-limited; release/recreate it if expired.
6. Enter **40.00** as simulated cash tender for the example ₵31.00 basket.
   Complete the explicit simulated-count and simulated-handover acknowledgements
   with a descriptive UAT note, then confirm the sale.
7. Check the ₵9.00 simulated change, **Open printable test receipt**, and
   the updated cash-drawer reconciliation. Refresh the sample product list to
   confirm stock availability declined only in this staging database.
8. Repeat the flow with another basket, cancel a reservation to test releasing
   stock, and check the report export. These are synthetic test amounts, not
   deposits, payment confirmations or tax invoices.
9. Sign out, then sign in with the **UAT cashier** account. Its own workspace
   should show only the Accra shift and prevent counter-sale writes.

## What is enabled

In the isolated staging API only: POS till foundation, quote preview, shared
stock reservations, counted-cash sale simulation, printable cash receipt and
cash drawer reconciliation. Synthetic stock depletion is intentionally real
**within that isolated UAT database**. The test route is additionally guarded
by `NEXT_PUBLIC_POS_COUNTER_UAT=1`; its UI is disabled in the ordinary
production build.

In production: quote, holds, cash-sale and till POS flags remain **OFF**. No
real payment gateway, MoMo, card or bank settlement, refunds, tax invoice,
customer checkout or physical goods handover is activated by this UAT page.

## Safety and validation

- HTTPS uses a certificate issued specifically for the staging hostname.
- An additional HTTP Basic authentication perimeter protects the staging
  web application and its API. Both are bound locally on the VPS behind Nginx.
- Real administrator login and CSRF-protected POST requests are required for
  any sample stock or cash change. Mock/demo sessions do **not** authorize
  this route. A cashier role cannot record a sale.
- The API body excludes `idempotencyKey`; replay protection uses only the
  request header. A consumed reservation cannot be charged twice.
- Database session connections explicitly request UTC. This closes a
  discovered five-hour expiry skew when PostgreSQL's default timezone is
  non-UTC. The same synthetic checkout passed with the PostgreSQL database
  deliberately set to a non-UTC timezone, then the database default was
  restored to UTC.
- The older public Coming Soon website, production portal and existing
  production API are not modified. Staging and production secrets, databases,
  service ports and hostname routes remain separate.

## Limits before production

The current transaction flow is **administrator-operated**, not a complete
cashier role workflow. Cashier till open/close/movement and real counter-sale
permissions need dedicated assigned-location authorization, review and tests.
The production checkout, provider payments, full returns/refunds, real handover,
tax/accounting, branch reconciliation and data migration rehearsal are separate
release gates. The private stage must never be used as a live store.
