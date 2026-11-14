# Variety Groceries — POS customer selection and sale identity

Canonical staging: https://portal.varietygroceries.com. Production remains Coming Soon.

## Cashier customer chooser

- **Walk-in Customer** (default): no account or name required.
- **Existing Customer:** search active registered customer accounts by name, phone or email and link the sale by a verified account ID. Real search is accessible only to authenticated cashiers/administrators, requires at least two characters and returns at most 15 choices. At sale completion the server revalidates that the user is an active registered customer.
- **New Customer Name:** enter a name 2–120 characters long for the receipt. It is not a registration and never creates a User account.

Demo POS is strictly isolated: its chooser searches demo customer data only. It cannot search the real customer directory.

## Persistence and scope

An additive Prisma migration 202611140003_pos_customer_identity adds customerMode, customerUserId, customerName and customerPhone to PosCashSale. Old sales default to walk-in. New cashier sales record a trusted sale-time name snapshot, optional validated user link, stock depletion, cash totals and audit in the same transaction. The printable 80mm receipt displays a safely escaped name, not phone or email. Staging remains simulated cash-only, not verified live electronic payment authority.

## Verification

- New POS customer selection contract/security tests cover three modes, guest isolation, denied roles, query bounds and active-customer searches.
- Existing full POS cash-sale test suite checks stock, reconciliation, immutable receipts, idempotency, branch grants and new named/registered sales against an isolated PostgreSQL database.
- Before original staging migration, a restricted backup was prepared. Production and real customers are not changed by the isolated tests.
- Real cashier browser UAT and receipts must be reviewed before accepting physical cash or enabling any production POS tender.

## 14 November completion and deployment evidence

- Full API TypeScript build and frontend optimized Next.js build: passed. Targeted frontend ESLint passed.
- Dedicated role/contract tests plus full original cash sale suite on disposable isolated PostgreSQL: **16 tests, 16 passed, 0 failed**. The first test run caught an omitted customer response projection; fixed before deployment and all tests rerun.
- All 46 Prisma migrations applied in the isolated database successfully. Original staging database has already recorded the additive customer identity migration; migration deploy confirms **no pending migrations**. A restricted original staging backup is stored privately outside Git.
- Canonical HTTPS staging after API/web restart: readiness HTTP 200, guest catalogue HTTP 200, customer lookup without staff authentication HTTP 401, real staff checkout route redirects anonymous users HTTP 307, mock POS demo route HTTP 200, new customer-search operation present in OpenAPI.
- Headless Chromium successfully loaded the one-click cashier demo and rendered **Walk-in Customer, Existing Customer and New Customer Name** customer choices without accessing the actual customer directory or recording a transaction.
- Original production homepage remains **Variety Groceries — Coming Soon**.
- Next UAT: a genuinely authenticated cashier should search a known test customer, complete a fully simulated sale at an assigned open till, reprint and verify its name, compare the cash drawer reconciliation, then repeat a named guest and anonymous walk-in sale. These are not claimed as real merchant transactions.
