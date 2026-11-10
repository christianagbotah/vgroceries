# Variety Groceries — private POS staging walkthrough

**Purpose:** Let the business owner test the actual API-backed POS workflow using
synthetic groceries, test cash, and a separate PostgreSQL database. This is
not a production activation, live payment collection, or merchant settlement.

## Access

- Private HTTPS site: **https://pos-uat.varietygroceries.com/** (separate perimeter password, then an individual test staff login).
- Staff login: **https://pos-uat.varietygroceries.com/staff/login**
- Real cashier sample cash checkout:
  **https://pos-uat.varietygroceries.com/staff/pos**
- Administrator sample cash checkout:
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
   UAT cashier** account. Only active, assigned-location cashiers or
   administrators can complete these stage-only sample cash transactions.
2. Open **Counter checkout** from the cashier workspace (`/staff/pos`).
   The older `/admin/pos` is a separate demo; `/admin/pos/verified-uat`
   remains available for administrators.
3. **Explicitly select the open UATACCRA01 till** before adding items.
   The screen does not silently select the newest till: a Kumasi shift belongs
   to the other location and would correctly fail the stock-location check.
   The Kumasi test location is deliberately unassigned to the cashier
   and has no sample stock.
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
9. Sign out, then log in as the **UAT administrator** to compare branch-wide
   reports. A cashier can sell only using an assigned, active location and
   its own held cart; another cashier’s cart and another location remain denied.

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
- Real cashier or administrator login and CSRF-protected POST requests are
  required for sample stock or cash changes. Mock/demo sessions do **not**
  authorize this route. A cashier can record **cash-only sales** for an
  active, currently assigned location and a hold they created, not another
  cashier’s cart or a different branch.
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

The cash-only transaction flow is now available to assigned cashier accounts
in the isolated stage. Cashier till opening, closing and drawer movements
remain administrator-only, pending their own workflow and approval tests.
The production checkout, provider payments, full returns/refunds, real handover,
tax/accounting, branch reconciliation and data migration rehearsal are separate
release gates. The private stage must never be used as a live store.

## Real-browser acceptance on protected HTTPS

On 10 November 2026, the isolated UAT API completed the real quote, stock
reservation, simulated cash sale, receipt and reconciliation sequence using
sample products. It also passed a regression with the PostgreSQL database
configured in a non-UTC timezone and the application pool explicitly using UTC.
The exact public HTTPS `/staff/login`, `/staff/cashier`, administrator cash
report and **`/admin/pos/verified-uat`** flows were exercised in real headless
Chromium at **375, 768 and 1440 pixel** viewports. Across all three sizes,
the UAT-only basket → quote → reserve → complete simulated sale → printable
receipt journey passed, including login, branch isolation and logout.

These automated acceptance results do not represent real-money transactions,
merchant settlement or full operational approval. The private staging
application is provided for interactive owner UAT, not live retail use.

## Cashier transaction authorization upgrade — 10 November 2026

- The single existing `GET /admin/products` endpoint supplies active,
  published products to a cashier with a current, active grant at the
  configured stock location. Cashiers are not permitted to inspect unpublished
  drafts or modify products; the historical API route inventory is preserved.
- A real assigned cashier can quote the branch's open till, reserve only
  their own cart, complete a synthetic counted-cash sale and print their own
  receipt. Server checks are repeated against the live database on each
  action; revoking a location grant takes effect without waiting for logout.
- PostgreSQL also verifies the active branch grant and cashier-owned hold
  before allowing cash-sale and stock-hold inserts. Real tax invoices,
  refunds, card/MoMo and till open/close are not included.
- Focused NestJS API cash-sale suite: **8/8 passed** against a second isolated
  test database. Regressions cover branch isolation, another cashier's cart,
  replay, inactive/revoked permissions, receipt and drawer reconciliation.
- The source remains a **draft release candidate PR**. Do not operate the
  private stage as a live shop or enable production POS flags.
