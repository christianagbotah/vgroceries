# COD D2 — Two independent supervisor cash-count attestations
19 November 2026 — **Source only; not deployed; both COD flags OFF**

## What is implemented
A strictly gated administrator-only API:
`POST /api/v1/admin/dispatch/cod-declarations/{declarationId}/supervisor-counts`

Requires a genuine active administrator web/native session and an `Idempotency-Key`; browser cookie requests require CSRF/Origin checks. The body contains an integer physical count (pesewas), two literal `true` attestations that cash was physically present and counted independently, and a bounded 10–400-character note. It derives all other facts from the original immutable rider declaration, delivery job and order. The original declaration must be linked to completed proof-backed delivery, unpaid COD, unchanged order custody, and an eligible actor. The feature refuses to operate unless `COD_CASH_DECLARATIONS_ENABLED=true` **and** `COD_SUPERVISOR_COUNT_ENABLED=true`. Both default **false**.

`CodSupervisorCount` is append-only, with an immutable actor, sequential count (1 or 2), exact amount, timestamps and reason. A PostgreSQL trigger independently checks active administrator role, original rider identity separation, delivered/unpaid provenance, the next sequence and two different reviewers. SQL constraints restrict each declaration to two unique reviewers and one observation at each sequence, and reject UPDATE/DELETE. Database locking serializes submissions. Application idempotency stores the original verified response and rejects an altered replay payload or extra count.

### Result statuses
- `first_count_recorded_unverified`: one independent observation; second review not yet made
- `dual_count_agreed_unverified`: two independent counts equal each other **and** the original rider-declared amount
- `count_disagreement_requires_review`: two independent observations disagree, or both differ from rider declaration

ALL results include `cashAccepted:false`, `paymentStatusChanged:false`, `remitted:false`. Agreement does **not** constitute a merchant receipt, bank reconciliation, legal rider liability, order paid event, till/cashbook entry, refund or delivery adjustment. Nothing changes payment, inventory, order, cash register or provider settlement tables. Review events are recorded for future investigation without admitting merchant receipt.

### Still not built — launch blocks
D2 is an evidence **intake**, not final supervisor verified receipt or cash custody transfer. Business must adopt an on-site sealed cash handover procedure and dispute/overage/shortage policies, secure dual-control review UI, signed receipt/bag evidence, branch location authorization, role separation (dedicated finance supervisors rather than generic administrators), reconciliation and reversal rules, finance-ledger authority, risk controls and external audit. Later D3 and D4 must be designed and verified separately before live COD.

### Environment and verification
- Never enable flags on shared UAT/production without finance/security approval and physical-process UAT.
- Apply new migration only to disposable PostgreSQL under CI first; no shared-UAT schema writes in this change.
- Test: two independent actors, idempotency under concurrent retries, role rejection, schema strictness, mismatch, direct SQL trigger constraints, immutable UPDATE/DELETE, no financial side-effects, authoritative OpenAPI count.
- Confirm full API CI (PostgreSQL 17, Node 24), frontend tests/build, drift checks and staging rollback before any deployment.

## Handoff
The storefront and existing COD reporting are deliberately unaffected. A future private supervisor UI may consume this API **only after** the preceding business policy and role separation are accepted; it must never infer payment collection or acceptance from two matching count attestations.
