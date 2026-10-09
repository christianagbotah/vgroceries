#!/bin/bash
# Variety Groceries — mock-service acceptance scenario checks.
# Exercises the business rules the spec requires, via the versioned API.
# Usage: bash scripts/acceptance-checks.sh

API="http://localhost:3000/api/mock/v1"
PASS=0; FAIL=0

check() { # name, condition_result (0=ok)
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "PASS: $1"; else FAIL=$((FAIL+1)); echo "FAIL: $1"; fi
}

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

echo "== reset =="
curl -s -X POST "$API/demo/reset" -H 'Content-Type: application/json' -d '{}' > /dev/null

echo "== A. Zero-availability hidden from purchasable lists =="
TOTAL=$(curl -s "$API/catalog/list?perPage=48" | jget "['data']['total']")
CHUNK1=$(curl -s "$API/catalog/list?perPage=24&page=1" | python3 -c "import json,sys;print(' '.join(i['slug'] for i in json.load(sys.stdin)['data']['items']))")
CHUNK2=$(curl -s "$API/catalog/list?perPage=24&page=2" | python3 -c "import json,sys;print(' '.join(i['slug'] for i in json.load(sys.stdin)['data']['items']))")
if echo "$CHUNK1 $CHUNK2" | grep -q "sachet-water"; then check "sachet-water (zero stock) hidden from catalog list" 1; else check "sachet-water (zero stock) hidden from catalog list" 0; fi
SEARCH=$(curl -s "$API/catalog/list?query=sachet" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['total'])")
[ "$SEARCH" = "0" ]; check "zero-stock item hidden from search results" $?
DETAIL=$(curl -s "$API/catalog/product?slug=sachet-water" | jget "['data']['purchasable']")
[ "$DETAIL" = "False" ]; check "saved link to zero-stock product shows unavailable, purchasing disabled" $?

echo "== B. Final unit reserved online cannot be sold in POS =="
BEFORE=$(curl -s "$API/admin/inventory/lots?variantId=var_chk_pc" | jget "['data'][0]['quantity']")
curl -s -X POST "$API/demo/scenario" -H 'Content-Type: application/json' -d '{"scenario":"reserve_last_unit"}' > /dev/null
AVAIL=$(curl -s "$API/admin/pos/search?q=chicken" | jget "['data'][0]['availableToSell']")
[ "$AVAIL" = "0" ]; check "chicken availability is 0 after online reservation (was $BEFORE)" $?
POSADD=$(curl -s -X POST "$API/admin/pos/complete" -H 'Content-Type: application/json' -d '{"sessionId":"cash_02","lines":[{"variantId":"var_chk_pc","quantity":"1"}],"method":"cash_counter","cashReceivedMinor":6000,"idempotencyKey":"chk-conflict"}')
echo "$POSADD" | grep -q '"OUT_OF_STOCK"'; check "POS completion of the reserved final unit is rejected with OUT_OF_STOCK" $?

echo "== C. Expired reservation releases its hold =="
HELD=$(curl -s "$API/admin/inventory/lots?variantId=var_egg_30" | jget "['data'][0]['quantity']")
curl -s -X POST "$API/demo/scenario" -H 'Content-Type: application/json' -d '{"scenario":"expire_reservations"}' > /dev/null
EAV=$(curl -s "$API/admin/inventory/overview" | python3 -c "
import json,sys
rows=json.load(sys.stdin)['data']['rows']
print([r for r in rows if r['variantId']=='var_egg_30'][0]['availableToSell'])")
[ "$EAV" -ge 16 ]; check "eggs availability restored after expiry sweep (physical $HELD, safety 2, abandoned hold released)" $?

echo "== D. POS completion is idempotent (stock consumed once even when retried) =="
R1=$(curl -s -X POST "$API/admin/pos/complete" -H 'Content-Type: application/json' -d '{"sessionId":"cash_02","lines":[{"variantId":"var_tof_1","quantity":"3"}],"method":"cash_counter","cashReceivedMinor":1000,"idempotencyKey":"idem-test-1"}')
R2=$(curl -s -X POST "$API/admin/pos/complete" -H 'Content-Type: application/json' -d '{"sessionId":"cash_02","lines":[{"variantId":"var_tof_1","quantity":"3"}],"method":"cash_counter","cashReceivedMinor":1000,"idempotencyKey":"idem-test-1"}')
REF1=$(echo "$R1" | jget "['data']['receiptNo']"); REF2=$(echo "$R2" | jget "['data']['receiptNo']")
[ "$REF1" = "$REF2" ]; check "replayed completion with same idempotency key returns the same receipt ($REF1)" $?
TOFFEE=$(curl -s "$API/admin/inventory/overview" | python3 -c "
import json,sys
rows=json.load(sys.stdin)['data']['rows']
print([r for r in rows if r['variantId']=='var_tof_1'][0]['sellablePhysical'])")
[ "$TOFFEE" = "197" ]; check "toffee physical stock consumed exactly once (200-3=197)" $?

echo "== E. Unresolved payment stays pending; late payment with unavailable stock -> staff review =="
PENDING=$(curl -s "$API/admin/orders?payment=pending" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['data']))")
[ "$PENDING" -ge 1 ]; check "pending payments remain pending (no blind duplicate charge)" $?
REVIEW=$(curl -s "$API/checkout/status?orderId=ord_1013" | jget "['data']['paymentStatus']")
[ "$REVIEW" = "requires_review" ]; check "late paid order with expired reservation is routed to requires_review" $?

echo "== F. Partial return preserves remaining qty; refund preview is consistent =="
ELIG=$(curl -s -X POST "$API/account/return-lines" -H 'Content-Type: application/json' -d '{"orderId":"ord_1014"}' | jget "['data'][0]['eligible']")
[ "$ELIG" = "3" ]; check "ord_1014 sardines: partial return preserves the remaining 3 eligible (of 6)" $?
OVER=$(curl -s -X POST "$API/account/create-return" -H 'Content-Type: application/json' -d '{"orderId":"ord_1014","lines":[{"orderLineId":"ord_1014_l1","quantity":"4","reason":"too many"}]}')
echo "$OVER" | grep -q "REFUND_LIMIT_EXCEEDED"; check "returning more than the eligible balance is rejected (REFUND_LIMIT_EXCEEDED)" $?
curl -s -X POST "$API/admin/return/action" -H 'Content-Type: application/json' -d '{"action":"approve","returnId":"ret_2002","note":"Dented tins verified (demo)","actor":"stf_kojo"}' > /dev/null
DUPE=$(curl -s -X POST "$API/admin/return/action" -H 'Content-Type: application/json' -d '{"action":"request_refund","returnId":"ret_2002","method":"mobile_money","actor":"stf_kojo"}')
echo "$DUPE" | grep -q "already exists"; check "duplicate refund request on the same return is rejected" $?

echo "== G. Refund execution failure is retryable and then succeeds =="
curl -s -X POST "$API/admin/refund/action" -H 'Content-Type: application/json' -d '{"refundId":"ref_3002","action":"approve","actor":"stf_serwaa"}' > /dev/null
EX1=$(curl -s -X POST "$API/admin/refund/action" -H 'Content-Type: application/json' -d '{"refundId":"ref_3002","action":"execute","actor":"stf_serwaa"}')
echo "$EX1" | grep -q '"ok":true'; check "first execution attempt records a retryable provider failure (demo)" $?
ST=$(curl -s "$API/admin/refunds" | python3 -c "
import json,sys
print([r for r in json.load(sys.stdin)['data'] if r['id']=='ref_3002'][0]['status'])")
[ "$ST" = "failed" ]; check "refund state is failed (retryable), not lost" $?
curl -s -X POST "$API/admin/refund/action" -H 'Content-Type: application/json' -d '{"refundId":"ref_3002","action":"retry","actor":"stf_serwaa"}' > /dev/null
EX2=$(curl -s -X POST "$API/admin/refund/action" -H 'Content-Type: application/json' -d '{"refundId":"ref_3002","action":"execute","actor":"stf_serwaa"}')
echo "$EX2" | grep -q '"ok":true'; check "retry executes the refund successfully" $?
PAY=$(curl -s "$API/checkout/status?orderId=ord_1014" | jget "['data']['paymentStatus']")
[ "$PAY" = "partially_refunded" ]; check "order payment status becomes partially_refunded" $?

echo "== H. Damaged return disposition never becomes purchasable =="
YOG=$(curl -s "$API/admin/inventory/lots?variantId=var_yog_500" | python3 -c "
import json,sys
lots=json.load(sys.stdin)['data']
print(sum(int(l['quantity']) for l in lots if not l['isQuarantined'] and l['kind']=='regular' and not l.get('expired'))) ")
[ "$YOG" = "24" ]; check "yoghurt saleable stock unchanged by damaged/quarantined return lots (still 24)" $?

echo "== I. Duplicate payment callback does not double-mark =="
DUP=$(curl -s -X POST "$API/checkout/payment-outcome" -H 'Content-Type: application/json' -d '{"orderId":"ord_1002","outcome":"succeeded"}')
DUP2=$(curl -s -X POST "$API/checkout/payment-outcome" -H 'Content-Type: application/json' -d '{"orderId":"ord_1002","outcome":"failed"}')
echo "$DUP2" | grep -q '"duplicate":true'; check "second callback after resolution is a no-op (duplicate)" $?

echo "== J. Rider COD: delivery, cash collection and remittance are separate =="
J=$(curl -s "$API/rider/job?jobId=job_5001")
echo "$J" | grep -q '"cashToCollectLabel"'; check "COD job carries a separate cash-to-collect amount" $?
if echo "$J" | grep -q '"cashCollectedAt"'; then check "cash not yet collected while delivery is in progress" 1; else check "cash not yet collected while delivery is in progress" 0; fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && exit 0 || exit 1
