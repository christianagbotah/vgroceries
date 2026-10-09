# Variety Groceries Handoff Review

Prepared for Christian Agbotah on 9 October 2026.

The frontend is a useful foundation for the Variety Groceries project. The handoff needs corrections before its mock business rules can serve as the production specification. Independent checks found a production build failure, application type errors, a broken staff returns endpoint, seven reproducible stock and refund defects, and direct storefront dependencies on the mock store.

Keep the existing interface and source structure. Correct these defects, then connect durable storage and server-enforced permissions. This review covers the supplied handoff and source; it does not certify live payments, couriers, customer accounts, or production operation.

## Source and review scope

Repository: [christianagbotah/vgroceries](https://github.com/christianagbotah/vgroceries).

Reviewed commit: `0ceb0ce3e9734c4aadaa6ffc376340ba3bc6c9b9` on `main`. The checkout was clean after verification; no tracked source was changed or pushed.

The comparison used the supplied Delivery and Integration Report, ZAI Build Brief, and ZAI Master Prompt. The report was rendered and inspected, and the implementation was read locally from GitHub. The repository contains 56 page files and 91 top-level mock operations. Those are source counts, not proof that every screen works. The report's 48-route figure is older than the repository's verification record.

## Independent verification

| Check | Result | What this establishes |
| --- | --- | --- |
| Locked dependency installation | Completed | Bun 1.3.4 installed the existing lockfile with install scripts disabled; application dependencies were not upgraded |
| `npm run lint` | Passed | ESLint completed with exit code 0 |
| `tsc --noEmit --incremental false` | Failed | 40 diagnostics: 37 in application source excluding the ungenerated Prisma client, 2 in unused WebSocket examples, and 1 for the ungenerated Prisma client |
| Production build | Failed | After resolving this environment's font TLS trust issue, compilation succeeded but prerendering failed at `/account/returns` because `useSearchParams()` lacks a Suspense boundary |
| Original acceptance script | 21 passed, 0 failed | Assertions passed through a temporary HTTP adapter invoking the repository's actual `handleApi`; only the script's API base URL was changed |
| Additional domain reproductions | 7 defects reproduced | Each scenario used a fresh seeded store and the supplied engine functions; results were consistent across repeated execution |
| Staff returns operation | HTTP 500 | `admin.returns` returns `INTERNAL` with the message `preview is not defined` |

The acceptance run above verifies mock operation behaviour. It does not establish that all Next.js routes or hydrated screens work. The direct Next.js HTTP suite could not reach its separately launched localhost server in this execution environment, so its initial connection failures were excluded from application findings. No fresh end-to-end browser or responsive-layout pass is claimed.

The first build attempt failed while fetching Google Fonts. A second attempt using `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` passed that stage and exposed the application prerender failure. The source was unchanged between attempts.

## Required corrections

### 1 Prevent duplicate stock from repeated inspections

In `src/services/mock/engine/returns.ts`, `inspectReturn()` accepts both received and already inspected returns. Every saleable inspection creates another lot and stock movement.

Reproduction: approve and receive `ret_2002`, then inspect it as saleable twice. The affected product's sellable quantity goes from 60 to 63 to 66. One three-unit return adds six units.

Make the stock disposition a once-only event. A retry must return the recorded result. A later disposition change must explicitly reconcile the prior stock effect rather than add another copy. Preserve eligible lot and expiry information for returned groceries.

### 2 Keep refund status tied to actual completed refunds

In `src/services/mock/engine/orders.ts`, `resolveReviewOrder()` sets `paymentStatus` to `refunded` when staff selects cancellation with refund. It only writes a note saying the refund still needs processing.

Reproduction: cancel reviewed order `ord_1013`. The order becomes refunded while it has zero successful refund records.

Record the cancellation and a linked refund request separately. Only a confirmed refund outcome may mark the payment refunded. Cancelled paid orders also need an executable refund path without requiring a fictitious physical return.

### 3 Enforce the return quantity limit across duplicate request lines

`createReturn()` checks each input line against the same precomputed eligibility. It does not aggregate repeated order-line identifiers within one request.

Reproduction: `ord_1014` has three units eligible on its first line. Submit that same line twice with three units each. The request accepts six units and subsequent eligibility becomes negative three.

Aggregate requested quantities by original order line before validation, or reject duplicate identifiers. Validate the whole request before mutating returns or stock.

### 4 Prevent a second refund for the same completed return

`requestRefund()` only rejects an existing requested, awaiting-approval, or processing refund. A successful refund is excluded from that duplicate check.

Reproduction: complete the seeded refund on `ret_2002`, then request another refund for that return. A second request for 2,700 pesewas is accepted.

Enforce the approved refundable amount per return as well as the order-wide paid balance. Track amounts already refunded and committed to unresolved attempts. Retry the original attempt; revalidate the remaining balance before execution.

### 5 Revalidate stock and reservations at handover

`consumeOrderStock()` excludes released reservations but does not require remaining reservations to cover the order. It sets `stockConsumedAt` even when no physical stock was consumed. Separately, `consumeLots()` records a shortfall adjustment instead of rejecting incomplete consumption.

Reproduction: release the two reservations on `ord_1011`, then consume its stock. The operation succeeds and records a consumption timestamp while physical stock remains unchanged.

Require complete, valid allocations at handover. Recheck lot eligibility and physical quantities inside the consumption transaction. Reject shortages before any partial mutation. A timestamp alone must not be sufficient evidence of stock depletion.

### 6 Reject invalid counter sale quantities

`completeSale()` does not enforce positive quantities. The shared availability check compares aggregated demand with available stock but accepts negative demand.

Reproduction: sell negative three units of `var_tof_1` with zero cash received. The operation accepts a completed sale with a zero total and unchanged physical stock.

Validate positive quantity, permitted precision and increments, supported payment methods, and money bounds before reservation or completion. Apply the same rules to online orders and receiving inputs.

### 7 Make online checkout creation idempotent

`createOnlineOrder()` accepts an idempotency key but does not find and replay the original order. It only copies that key into an electronic payment attempt.

Reproduction: submit the same one-unit collection checkout twice with the same key. Two different orders are created, and reserved quantity rises from zero to one to two.

Persist a scoped idempotency record for order creation. An identical retry must return the original order and hold. A reused key with different input must fail with a clear conflict.

### 8 Repair the staff returns endpoint and page loading errors

The `admin.returns` branch in `src/services/mock/router.ts` references `preview` outside the callback where it is declared. This operation currently returns an internal error instead of the list.

Type checking also identifies missing `apiOps` imports in the providers, suppliers, and team pages; mismatched cashier-session, inventory, POS, and return response fields; an undefined account-address type; and duplicate `categories` keys in the client adapter.

Repair the endpoint and those contracts. Verify each affected page after its data request and client hydration. A route returning HTTP 200 does not verify these interactions.

## Correct the integration boundary and build checks

Five storefront pages import the mock store directly: the homepage, shop, category, product, and delivery-information pages. They do not obtain their data through `src/services/client.ts`. The client and reports screen also import the mock report type.

The handoff's single-adapter replacement claim therefore needs correction. Introduce a shared catalogue and delivery data interface that both server-rendered pages and client requests can use. Move shared response models outside `src/services/mock`. Delete the mock only after production imports have been removed and verified.

`next.config.ts` currently contains `typescript.ignoreBuildErrors: true`. Remove that bypass after resolving the application errors. Add explicit type checking and a production build to CI, plus regressions for the seven cases above and the returns-list endpoint. Strengthen the shell acceptance suite to stop on transport, HTTP, or JSON failures; some assertions can currently report success on empty responses.

The required production build command for this review environment was:

```bash
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 NEXT_TELEMETRY_DISABLED=1 npm run build
```

## Backend takeover order

1. Correct the verified domain defects, missing contracts, production render failure, and mock coupling. Keep the working interface and original fixture scenarios.
2. Establish PostgreSQL migrations, trusted server sessions, and an actor and permission context for every protected operation. The existing Prisma schema is an unused SQLite User/Post starter, not a grocery schema.
3. Implement catalogue, units, locations, eligible lots, immutable stock movements, reservations, and stock consumption with database transactions. Test concurrent online and counter attempts to buy the final unit.
4. Connect order creation, fulfilment, counter sales, cashier sessions, receipts, and availability refresh to those same authoritative services. Preserve separate payment, fulfilment, delivery, return, and refund states.
5. Implement payment attempts and the returns/refunds ledger before attaching an external provider. Define rounding, discounts, delivery-fee policy, and configured tax treatment; do not copy floating-point line-total multiplication into authoritative money calculations.
6. Integrate the selected payment provider through server-side verification and reconciliation. Hubtel remains a candidate; the supplied source contains no connected merchant integration. Keep testing separate from live payment execution.
7. Connect dispatch and rider operations, proof of delivery, failed deliveries, and COD collection/remittance. Keep in-house and manual delivery available while courier API access is established.
8. Derive reports from durable records and add grounded AI assistance with evidence and human review. Complete browser, mobile, recovery, concurrency, and financial-reconciliation checks before launch.

The planned absence of real accounts, durable storage, payment providers, couriers, GPS, and AI is an expected prototype boundary. It is separate from the defects above. Delivery coverage, fees, slots, tax treatment, returns policy, provider access, and real product content still need owner configuration.

## Review decision

Accept the source for continued engineering work with the corrections above. Do not accept its current mock engines as a rules-complete backend reference. The next implementation milestone is a corrected, building application with durable stock and orders behind trusted server permissions.

No deployment, payment, customer communication, account registration, or repository write was performed during this review.

## Reproduction evidence

The diagnostic output below comes from the supplied engine functions on fresh seeded stores. `defectReproduced: true` indicates the expected protection failed; it is not a passing business-rule test.

```json
{
  "auditedCommit": "0ceb0ce3e9734c4aadaa6ffc376340ba3bc6c9b9",
  "results": [
    {
      "name": "Cancellation review must not claim an unexecuted refund",
      "actualPaymentStatus": "refunded",
      "completedRefundCount": 0,
      "defectReproduced": true
    },
    {
      "name": "Repeating inspection must not increase restocked quantity twice",
      "before": "60",
      "afterFirst": "63",
      "afterRepeat": "66",
      "defectReproduced": true
    },
    {
      "name": "Duplicate lines in one return must respect the cumulative quantity limit",
      "eligibleBefore": "3",
      "requestedTotal": "6",
      "accepted": true,
      "eligibleAfter": "-3",
      "defectReproduced": true
    },
    {
      "name": "One return must not be refunded twice",
      "firstRefundMinor": 2700,
      "cumulativeSucceededMinor": 2700,
      "secondAccepted": true,
      "secondAmount": 2700,
      "defectReproduced": true
    },
    {
      "name": "Stock handover must fail when its reservation was already released",
      "orderId": "ord_1011",
      "releasedHolds": 2,
      "accepted": true,
      "stockChanged": false,
      "stockConsumedAtRecorded": true,
      "defectReproduced": true
    },
    {
      "name": "Quantity validation must reject negative counter sales",
      "accepted": true,
      "totalMinor": 0,
      "before": "200",
      "after": "200",
      "defectReproduced": true
    },
    {
      "name": "Repeated online checkout must return the original order without a second hold",
      "sameOrder": false,
      "before": "0",
      "afterFirst": "1",
      "afterRepeat": "2",
      "defectReproduced": true
    }
  ]
}
```

The runnable diagnostic can be saved as `scripts/handoff-regressions.ts` in the reviewed repository, then executed with Bun. It reports observed behaviour rather than modifying the source.

```typescript
import { getStore, resetStore } from "../src/services/mock/store";
import { resolveReviewOrder, consumeOrderStock, createOnlineOrder } from "../src/services/mock/engine/orders";
import { availability, sellablePhysical } from "../src/services/mock/engine/availability";
import { createReturn, decideReturn, receiveReturn, inspectReturn, eligibleReturnLines, requestRefund, approveRefund, executeRefund, retryRefund, refundedSoFar } from "../src/services/mock/engine/returns";
import { completeSale } from "../src/services/mock/engine/pos";
import { addQty } from "../src/lib/quantity";

function fresh() { resetStore(); return getStore(); }
const results: Record<string, unknown>[] = [];
function scenario(name: string, run: () => Record<string, unknown>) {
  try { results.push({ name, ...run() }); }
  catch (error) { results.push({ name, diagnosticError: String(error) }); }
}

scenario("Cancellation review must not claim an unexecuted refund", () => {
  const s = fresh();
  const o = resolveReviewOrder(s, "ord_1013", "stf_ama", "cancel_refund", "Audit reproduction");
  const successes = s.refunds.filter(r => r.orderId === o.id && r.status === "succeeded");
  return { actualPaymentStatus: o.paymentStatus, completedRefundCount: successes.length, defectReproduced: o.paymentStatus === "refunded" && successes.length === 0 };
});

scenario("Repeating inspection must not increase restocked quantity twice", () => {
  const s = fresh();
  decideReturn(s, "ret_2002", "approve", "stf_ama", "Audit reproduction");
  receiveReturn(s, "ret_2002", "stf_ama");
  const ret = s.returnRequests.find(r => r.id === "ret_2002")!;
  const rl = s.returnLines.find(l => l.id === ret.lines[0])!;
  const line = s.orderLines.find(l => l.id === rl.orderLineId)!;
  const before = sellablePhysical(s, line.variantId);
  inspectReturn(s, ret.id, "restock_saleable", "stf_ama", "Audit reproduction");
  const afterFirst = sellablePhysical(s, line.variantId);
  inspectReturn(s, ret.id, "restock_saleable", "stf_ama", "Audit reproduction");
  const afterRepeat = sellablePhysical(s, line.variantId);
  return { before, afterFirst, afterRepeat, defectReproduced: afterRepeat !== afterFirst };
});

scenario("Duplicate lines in one return must respect the cumulative quantity limit", () => {
  const s = fresh();
  const order = s.orders.find(o => o.id === "ord_1014")!;
  const eligible = eligibleReturnLines(s, order)[0];
  let accepted = false;
  try {
    createReturn(s, { orderId: order.id, requestedBy: "staff", lines: [1,2].map(() => ({ orderLineId: eligible.line.id, quantity: eligible.eligible, reason: "Audit reproduction" })) });
    accepted = true;
  } catch { }
  return { eligibleBefore: eligible.eligible, requestedTotal: addQty(eligible.eligible, eligible.eligible), accepted, eligibleAfter: eligibleReturnLines(s, order)[0].eligible, defectReproduced: accepted };
});

scenario("One return must not be refunded twice", () => {
  const s = fresh();
  const ret = decideReturn(s, "ret_2002", "approve", "stf_ama", "Audit reproduction");
  const first = s.refunds.find(r => r.returnId === ret.id)!;
  approveRefund(s, first.id, "stf_serwaa");
  executeRefund(s, first.id, "stf_serwaa");
  retryRefund(s, first.id, "stf_serwaa");
  executeRefund(s, first.id, "stf_serwaa");
  let secondAccepted = false;
  let secondAmount = 0;
  try {
    const second = requestRefund(s, ret.id, "stf_serwaa", "mobile_money");
    secondAccepted = true; secondAmount = second.amountMinor;
  } catch { }
  return { firstRefundMinor: first.amountMinor, cumulativeSucceededMinor: refundedSoFar(s, ret.orderId), secondAccepted, secondAmount, defectReproduced: secondAccepted };
});

scenario("Stock handover must fail when its reservation was already released", () => {
  const s = fresh();
  const o = s.orders.find(o => o.id === "ord_1011") ?? s.orders.find(o => !o.stockConsumedAt && s.reservations.some(r => r.orderId === o.id))!;
  const holds = s.reservations.filter(r => r.orderId === o.id);
  for (const r of holds) { r.releasedAt = new Date().toISOString(); r.releasedReason = "expired"; }
  const before = s.lots.map(l => l.quantity).join("|");
  let accepted = false;
  try { accepted = consumeOrderStock(s, o, "stf_ama").consumed; } catch { }
  const after = s.lots.map(l => l.quantity).join("|");
  return { orderId: o.id, releasedHolds: holds.length, accepted, stockChanged: before !== after, stockConsumedAtRecorded: Boolean(o.stockConsumedAt), defectReproduced: accepted && before === after };
});

scenario("Quantity validation must reject negative counter sales", () => {
  const s = fresh();
  const before = sellablePhysical(s, "var_tof_1");
  let accepted = false; let totalMinor: number | undefined;
  try {
    const sale = completeSale(s, { sessionId: "cash_02", cashierId: "stf_adjoa", lines: [{ variantId: "var_tof_1", quantity: "-3" }], method: "cash_counter", cashReceivedMinor: 0, idempotencyKey: "audit-negative-quantity" });
    accepted = true; totalMinor = sale.order.totalMinor;
  } catch { }
  return { accepted, totalMinor, before, after: sellablePhysical(s, "var_tof_1"), defectReproduced: accepted };
});

scenario("Repeated online checkout must return the original order without a second hold", () => {
  const s = fresh();
  const input = { lines: [{ variantId: "var_tof_1", quantity: "1" }], customerName: "Audit demo", customerPhone: "+233200000001", fulfilment: "collection" as const, paymentMethod: "cash_counter" as const, idempotencyKey: "audit-checkout-replay" };
  const before = availability(s, "var_tof_1").reserved;
  const first = createOnlineOrder(s, input);
  const afterFirst = availability(s, "var_tof_1").reserved;
  const second = createOnlineOrder(s, input);
  const afterRepeat = availability(s, "var_tof_1").reserved;
  return { sameOrder: first.order.id === second.order.id, before, afterFirst, afterRepeat, defectReproduced: first.order.id !== second.order.id && afterFirst !== afterRepeat };
});

console.log(JSON.stringify({ auditedCommit: "0ceb0ce3e9734c4aadaa6ffc376340ba3bc6c9b9", results }, null, 2));
if (results.some(r => r.diagnosticError)) process.exitCode = 2;
```
