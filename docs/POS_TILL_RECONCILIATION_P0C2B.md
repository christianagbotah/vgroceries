# P0c2b — read-only cashier shift reconciliation preview

**Development-only; production POS flags remain OFF.** This milestone adds
no sale completion, cash movement, stock mutation, customer payment truth,
refund authority, invoice or automatic journal entry.

## Endpoint

`GET /api/v1/admin/pos/tills/{sessionId}/reconciliation`

An authenticated **administrator** can inspect one cashier till using a
PostgreSQL **REPEATABLE READ** transaction. The API reads the original opening
float, every recorded `CashierTillMovement`, aggregate immutable
`PosCashSale` amounts, the persisted closing count and difference, and the
current count of valid outstanding inventory holds. It also returns the
20 latest cash-sale references, but explicitly marks the preview truncated
when the shift contains more than 20; **all cash sales** contribute to the
aggregate totals, not merely the latest 20.

The formula is:

```text
Expected cash in till =
  opening float
  + manual cash in
  - manual cash out
  - physical cash drops
  + cash-only completed POS sales
```

For a closed shift, the response displays cash physically counted,
the saved closing expected and difference, an independently recomputed
difference and `closingMatchesLedger` so a supervisor can distinguish a
legitimate cash shortfall/overage from an inconsistent persisted close.
`closingMatchesLedger=true` **does not mean** cash actually equals expected:
a nonzero documented difference is still visible.

The output explicitly marks:

- `source=server_cash_ledger`
- `scope=cash_drawer_only`
- `electronicPaymentsReconciled=false`
- `refundsReconciled=false`
- `taxOrGeneralLedgerReconciled=false`

No merchant statements or external bank/provider balances are treated as
verified by this report. Refunded transactions, tax obligations, settlement
fees and electronic tender sources still require their own audited models.

## Security, integrity and verification

- **Administrator-only:** public users, customers and other roles cannot
  request any shift preview. There is no user-supplied monetary value.
- **Read only:** GET performs no database writes, no audit mutation and
  no idempotency state change. Existing database guards remain authoritative.
- **Consistent snapshot:** one repeatable-read transaction prevents partial
  differences between movement and sales totals in concurrent view requests.
- **Bounded recent activity:** 20 recent sale references, all sales included
  in aggregate totals. No personally identifying customer fields returned.
- **Integrity alert:** unknown cash-movement kinds or impossible computed
  drawer balances reject the preview instead of silently misreporting sums.
- **Tests:** isolated PostgreSQL test coverage for staff access, cash
  in/out/drop and closing differences, no stock/money mutation, and an
  actual completed sale with cash drop and exact closing reconciliation.

Both GitHub workflows (`CI`, `API foundation`) must pass before merge.
No production activation; actual cashier roles/grants, tax reporting, refunds,
verified MoMo/card settlements, banking and full end-of-day accounting remain
separate acceptance gates.
