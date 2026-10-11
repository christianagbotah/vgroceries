# Refunds Authority

Variety Groceries now has a production **provider-neutral Refunds Authority** in
`apps/api`. It records durable refund obligations against verified successful
payment captures, requires administrator approval before electronic execution,
reconciles ambiguous provider outcomes without blind resends, and exposes safe
staff/customer refund projections. It does **not** activate Hubtel, implement
physical merchandise Returns, or switch the public Next.js storefront away from
demo transport.

All production paths below use the `/api/v1` prefix.

| Method and path | Authority |
| --- | --- |
| `GET /refunds` | Administrator-only bounded refund ledger and safe execution/reconciliation state. |
| `POST /refunds/{refundId}/actions` | Administrator-only `approve`, `execute`, `retry`, or `reconcile`. Requires `Idempotency-Key`; cookie mutations retain trusted-Origin + CSRF checks. |
| `POST /admin/orders/{orderId}/actions` | Administrator-only `cancel_refund` or `refund_excess_capture`. Requires `Idempotency-Key`; all money/provider/capture identity is server-derived. |
| `POST /account/orders/{orderId}/cancel` | Existing customer route now atomically creates every missing successful-capture refund obligation before cancelling/releasing a paid pre-handover order. |

There is deliberately no production manual/cash refund-completion route and no
refund webhook endpoint in this milestone.

## Authority boundaries

`RefundsModule` is the only post-checkout writer of Refund, RefundExecution and
RefundReconciliation state. Payments remains the authority for capture truth and
for the denormalized `Order.paymentStatus` refund projection. Orders orchestrates
cancellation but cannot create/update/delete Refund persistence directly. Inventory
remains the only stock reservation writer.

The global financial lock order is **Order → PaymentAttempts → Refunds →
RefundExecution**. Provider network I/O never occurs while those PostgreSQL row
locks are held.

Every electronic Refund targets one successful `PaymentAttempt`. Capacity is
therefore per capture rather than merely capped at `Order.totalMinor`:

`remaining refundable = captured amount - every durable Refund obligation`

That rule prevents concurrent over-refunds and also permits safe correction of a
verified duplicate/over-capture without cancelling a legitimate fulfilled sale.

## Durable refund obligations

A cancellation creates one Refund for each positive remaining balance on every
successful capture. Existing obligations consume capacity, replay creates no
duplicates, and failed/expired/unpaid attempts cannot fund a Refund.

Refund financial identity is immutable: order, payment attempt, provider, method,
GHS currency, amount, source and future return link cannot be rewritten. Refund
rows cannot be deleted. PostgreSQL also constrains positive amounts, supported
vocabulary and versioning.

Sources currently used by production are:

- `customer_cancellation` — owning customer cancels an eligible paid order;
- `payment_review_cancellation` — administrator resolves a paid review case by
  cancelling and refunding;
- `overcharge_correction` — administrator returns only verified money above the
  legitimate order total, newest successful capture first.

`return` is reserved in the shared/persistence contract for the later physical
Returns Authority; this milestone does not expose a command that fabricates it.

## Paid cancellation

An eligible paid pre-handover cancellation is one atomic database transaction:

1. lock the Order;
2. Payments locks/classifies attempts;
3. Refunds locks existing Refunds and creates every missing full-cancellation
   obligation;
4. Payments derives the order projection (`refund_pending` while money remains
   unresolved);
5. Inventory reservations and any active delivery-slot booking release exactly
   once;
6. cancellation/audit/outbox records commit with the same transaction.

A Refund audit/outbox fault rolls back the cancellation, Refund obligations,
stock release and slot release together. A same-reason replay is idempotent and
can add only a newly missing Refund if a stale payment attempt later becomes a
verified success. A changed cancellation reason remains a conflict.

Live/uncertain payment attempts still block cancellation until reconciliation.
`stockConsumedAt`, dispatched, delivered or collected fulfilment blocks ordinary
cancellation. A provider refund failure never resurrects a cancelled order.

## Administrator financial resolution

`cancel_refund` covers paid `requires_review`/late-success cases that cannot
continue fulfilment. It reuses the same cancellation obligation authority and
never accepts a client amount, provider or payment-attempt selector.

`refund_excess_capture` is a financial correction, not a fulfilment reversal. It
calculates the verified excess from locked successful captures and existing Refund
obligations, allocates only that excess, and does not cancel the order or mutate
stock/slot state. It may therefore correct an over-capture after physical handover.

## Approval and provider execution

Refund request/approval is not proof that money reached the customer. New Refunds
start `awaiting_approval`. `approve` records approver/time but performs no provider
I/O.

First `execute` creates one durable RefundExecution and stable merchant refund
reference, commits that intent, then invokes the configured refund adapter. The
adapter receives immutable server-derived provider/method/GHS amount plus the
original successful payment references required for provider correlation.

If a provider times out after it may have accepted the transfer, the execution is
`uncertain` and the Refund becomes `requires_review`. Retry/replay does not blindly
send another transfer: it first calls `lookupRefund` using the same durable merchant
refund reference. A resend is possible only when the adapter explicitly declares
the observed failure/no-record/unknown state safe for retry. The same execution
identity/reference is reused.

`RefundOutcomeService` is the central verified outcome state machine. It validates
provider, merchant refund reference, known provider refund reference, amount and
GHS currency before changing money-return state. Pending remains processing;
matching success applies once; definitive failure does not resurrect fulfilment;
mismatch or conflicting terminal evidence becomes an explicit reconciliation
exception rather than rewriting verified truth.

Refund reconciliation history is append-only. Successful provider evidence and
execution financial identity cannot be rewritten or deleted.

## Payment projection

Payments derives the order-level refund state from captured money and durable
Refunds while financial locks are held:

- cancelled order with complete but unresolved obligations → `refund_pending`;
- all captured money successfully returned → `refunded`;
- a legitimate partial business refund → `partially_refunded`;
- unresolved/mismatched financial evidence → `requires_review`;
- fulfilled order whose only refund is a successful excess-capture correction and
  whose net captured money equals `Order.totalMinor` → `succeeded`.

This preserves capture truth instead of using a cosmetic order status to hide an
exception.

## Staff ledger and customer projection

`GET /refunds` is administrator-only in this milestone. It supports bounded
pagination plus status, provider, method, source type, order-reference and date
filters. Rows distinguish `alreadyRefundedMinor` (succeeded Refunds) from
`remainingRefundableMinor` (capture amount minus every durable obligation), and
show safe execution/reconciliation state, attempt count, safe failure reason and
an optional provider refund reference useful for support.

The staff response does not expose merchant refund references, original payment
provider references, raw evidence, signatures/authentication headers, credentials
or reconciliation internals.

Owner order status and public reference+verification-code tracking expose the same
minimal customer-safe Refund summaries: id, source, amount/label, status, safe
message and timestamps. No provider/execution identifiers are included.

## Provider and Hubtel status

Refund execution is provider-neutral. Production readiness fails closed when an
enabled electronic payment method lacks compatible refund capability for the same
configured provider. `FakeRefundProvider` exists only in tests.

Hubtel is **not enabled**. No Hubtel refund URL, signature algorithm, merchant
secret, idempotency rule or refund capability has been guessed into source. A live
adapter requires the exact verified merchant contract and credentials before it
can be implemented or enabled.

## Deferred authority

Still outside this milestone:

- live Hubtel/provider-specific refund activation;
- physical return intake, inspection and restock/quarantine/disposal;
- manual cash/POS refund completion;
- physical stock depletion/handover;
- staff picking/packing/dispatch, rider operations and COD/remittance;
- outbox publisher/worker scheduling;
- public storefront production-backend cutover.

The generated production specification is `docs/openapi-foundation.json`. It now
contains exactly **28 paths**: the prior 25 foundation/commerce/Payments paths plus
the three Refunds Authority routes above.
