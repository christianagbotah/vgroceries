# POS staging: explicit shared UAT data warning (18 November 2026)

**Source-only correction on the POS/Hubtel staged branch. No live deployment, data write, sale or backend flag change.**

## Risk

The cashier POS simulation previously said its cash sale would deduct stock in a
"separate UAT database". The repository's documented November staging
architecture reports that the POS API (3049) and canonical UAT API (3027)
have historically shared the same UAT database. The POS page cannot inspect
that deployment topology authoritatively, so claiming an isolated database
was unsafe and could encourage a tester to alter shared UAT orders, stock
positions or cash records under a false assumption.

## Change

- Replace "isolated/separate UAT" with accurate **staging UAT** terminology.
- Warn that a synthetic sale updates persistent stock, till and transaction
  rows in whichever UAT database the **connected** API uses; that database
  **may be shared** with other staging services.
- Require an explicit test-operator checkbox acknowledging the shared data
  effect before the **first** cash-sale simulation. The existing cash-count,
  sample goods-handover, CSRF, valid till, hold, confirmation and idempotency
  safeguards remain in force. Keep locked retry behaviour unchanged to avoid
  making an uncertain completed sale impossible to reconcile.
- Strengthen the actual confirmation dialog to name UAT stock and ledger risk.
- Add source-level regression assertions and test-only documentation.

## Release acceptance

Before any POS real-data/UAT cutover, confirm the **actual** POS service database
connection, read-only stock baseline, backup and restore, and explicit
operator consent. Testing must use approved synthetic records only. Cash and
payment modes remain guarded by backend authority. This is not production POS
activation and does not close issue #108 or #62.
