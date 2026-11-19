# COD D1 — Rider's physical-cash declaration (19 November 2026)

**Source-only, NOT deployed or enabled.** Implements one small, audited step of issue #63. It is not a complete COD collection/remittance, payout, bank settlement or merchant finance ledger. Feature flag `COD_CASH_DECLARATIONS_ENABLED` is **OFF by default** and validated strictly.

## Workflow

After completing an assigned COD delivery **with server-recorded delivery proof**, the authenticated rider can submit once to:

`POST /api/v1/rider/jobs/{jobId}/cod-cash-declaration`

`Idempotency-Key` is required. Body: exact integer `amountMinor` in pesewas matching the immutable order total, `cashCountConfirmed: true`, `riderPossessionConfirmed: true`, bounded 10–400-character note. No client identity, price, currency, customer or provider payment status can be supplied. No partial, combined or electronic tender is accepted in this stage.

The operation checks rider assignment and account activity, order/delivery/stock-handover status, proof, zero cancellations, COD method and unpaid status. It locks order/job state, records one append-only declaration, audit event and outbox event within one PostgreSQL transaction, and uses actor-scoped idempotency to replay exactly the same result. Different payload on a reused key and duplicate job on a second key fail safely. Independent SQL constraints and triggers prevent fabricated owner, amount, job, incomplete delivery, missing proof, and any UPDATE/DELETE of the evidence.

Response says **`rider_declared_unverified`** with `supervisorVerified=false`, `remitted=false`, `paymentStatusChanged=false`. It does **not** update `Order.paymentStatus`, call providers, change stock, create a refund, release rider liability, credit a till or confirm merchant collection. Administrator COD exceptions show *rider declared · supervisor unverified* distinctly from *not recorded*; remittance always says *not recorded*.

## Next authority phases before live launch

- D2: separate supervisor verification of counted cash with dual control, explicit witnessed count, review/reject/dispute and conflicting declaration resolution.
- D3: branch-specific rider custody reconciliation, shortages and overages, sealed handover receipt, bank/till acceptance, partial collection and reversal rules; prevent double deposit or rider payout.
- D4: policy-approved financial postings, independent money settlement reconciliation, tax/accounting reports and controlled live feature activation.

Keep `COD_CASH_DECLARATIONS_ENABLED=false` for all active environments until on-site cash handling policies and complete remittance authority are approved. Run full API and web CI plus destructive-free migration/diff checks on a disposable PostgreSQL database, protected backup/rollback rehearsal and real rider authentication UAT first. Do not push migrations to shared UAT blindly.

## Administrator review organization (19 November)

Read-only COD exceptions can be filtered by rider-declared versus no declaration recorded; both still require independent physical verification and reconciliation before any money movement is authorized.
