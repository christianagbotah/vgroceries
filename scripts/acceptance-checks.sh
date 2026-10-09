#!/bin/bash
# Variety Groceries — mock-service acceptance scenario checks.
# Exercises the business rules the spec requires, via the versioned API.
# Usage: bash scripts/acceptance-checks.sh [base_url]
#
# Hardened: every request must complete transport, return the expected HTTP
# status, and parse as a JSON {ok,...} envelope — otherwise the suite aborts
# immediately. An assertion can no longer "pass" on an empty response.

API="${1:-http://localhost:3000/api/mock/v1}"
PASS=0; FAIL=0
LAST_BODY=""

check() { # name, condition_result (0=ok)
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "PASS: $1"; else FAIL=$((FAIL+1)); echo "FAIL: $1"; fi
}

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
# extract a JSON array field from the last response body (valid JSON output)
jarray() { echo "$LAST_BODY" | python3 -c "import json,sys;print(json.dumps(json.load(sys.stdin)$1))" 2>/dev/null; }

# req <method> <url-suffix> [json-body] [expected-status (default 200)]
# Stores the response body in $LAST_BODY; aborts the suite on transport,
# HTTP-status, or JSON-envelope failure.
req() {
  local method="$1" suffix="$2" body="$3" want="${4:-200}"
  local out status curl_rc
  if [ -n "$body" ]; then
    out=$(curl -s -m 30 -w $'\n%{http_code}' -X "$method" "$API/$suffix" -H 'Content-Type: application/json' -d "$body" 2>/dev/null)
  else
    out=$(curl -s -m 30 -w $'\n%{http_code}' -X "$method" "$API/$suffix" 2>/dev/null)
  fi
  curl_rc=$?
  if [ "$curl_rc" != "0" ]; then echo "FATAL: transport failure ($curl_rc) on $method $suffix"; exit 2; fi
  status="${out##*$'\n'}"
  LAST_BODY="${out%$'\n'*}"
  if [ -z "$LAST_BODY" ]; then echo "FATAL: empty response body on $method $suffix"; exit 2; fi
  if ! echo "$LAST_BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if isinstance(d,dict) and 'ok' in d else 1)" 2>/dev/null; then
    echo "FATAL: response is not a JSON {ok,...} envelope on $method $suffix:"; echo "$LAST_BODY" | head -c 300; echo; exit 2
  fi
  if [ "$status" != "$want" ]; then echo "FATAL: HTTP $status (expected $want) on $method $suffix:"; echo "$LAST_BODY" | head -c 300; echo; exit 2; fi
}

ok_req() { req POST "$1" "$2"; }              # expects 200 {ok:true}
j() { echo "$LAST_BODY" | jget "$1"; }        # jget against the last body

echo "== reset =="
req POST demo/reset '{}'

echo "== A. Zero-availability hidden from purchasable lists =="
req GET "catalog/list?perPage=48"
TOTAL=$(j "['data']['total']")
[ -n "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; check "catalog list returns a non-empty total ($TOTAL)" $?
req GET "catalog/list?perPage=24&page=1"; C1=$(jarray "['data']['items']")
req GET "catalog/list?perPage=24&page=2"; C2=$(jarray "['data']['items']")
if echo "$C1 $C2" | grep -q "sachet-water"; then check "sachet-water (zero stock) hidden from catalog list" 1; else check "sachet-water (zero stock) hidden from catalog list" 0; fi
req GET "catalog/list?query=sachet"
SEARCH=$(j "['data']['total']")
[ "$SEARCH" = "0" ]; check "zero-stock item hidden from search results" $?
req GET "catalog/product?slug=sachet-water"
DETAIL=$(j "['data']['purchasable']")
[ "$DETAIL" = "False" ]; check "saved link to zero-stock product shows unavailable, purchasing disabled" $?

echo "== B. Final unit reserved online cannot be sold in POS =="
req GET "admin/inventory/lots?variantId=var_chk_pc"
BEFORE=$(j "['data'][0]['quantity']")
ok_req demo/scenario '{"scenario":"reserve_last_unit"}'
req GET "admin/pos/search?q=chicken"
AVAIL=$(j "['data'][0]['availableToSell']")
[ "$AVAIL" = "0" ]; check "chicken availability is 0 after online reservation (was $BEFORE)" $?
req POST admin/pos/complete '{"sessionId":"cash_02","lines":[{"variantId":"var_chk_pc","quantity":"1"}],"method":"cash_counter","cashReceivedMinor":6000,"idempotencyKey":"chk-conflict"}' 409
POSADD="$LAST_BODY"
echo "$POSADD" | grep -q '"OUT_OF_STOCK"'; check "POS completion of the reserved final unit is rejected with OUT_OF_STOCK" $?

echo "== C. Expired reservation releases its hold =="
req GET "admin/inventory/lots?variantId=var_egg_30"
HELD=$(j "['data'][0]['quantity']")
ok_req demo/scenario '{"scenario":"expire_reservations"}'
req GET "admin/inventory/overview"
EAV=$(echo "$LAST_BODY" | python3 -c "
import json,sys
rows=json.load(sys.stdin)['data']['rows']
print([r for r in rows if r['variantId']=='var_egg_30'][0]['availableToSell'])")
[ -n "$EAV" ] && [ "$EAV" -ge 16 ]; check "eggs availability restored after expiry sweep (physical $HELD, safety 2, abandoned hold released)" $?

echo "== D. POS completion is idempotent (stock consumed once even when retried) =="
ok_req admin/pos/complete '{"sessionId":"cash_02","lines":[{"variantId":"var_tof_1","quantity":"3"}],"method":"cash_counter","cashReceivedMinor":1000,"idempotencyKey":"idem-test-1"}'
REF1=$(j "['data']['receiptNo']")
ok_req admin/pos/complete '{"sessionId":"cash_02","lines":[{"variantId":"var_tof_1","quantity":"3"}],"method":"cash_counter","cashReceivedMinor":1000,"idempotencyKey":"idem-test-1"}'
REF2=$(j "['data']['receiptNo']")
[ -n "$REF1" ] && [ "$REF1" = "$REF2" ]; check "replayed completion with same idempotency key returns the same receipt ($REF1)" $?
req GET "admin/inventory/overview"
TOFFEE=$(echo "$LAST_BODY" | python3 -c "
import json,sys
rows=json.load(sys.stdin)['data']['rows']
print([r for r in rows if r['variantId']=='var_tof_1'][0]['sellablePhysical'])")
[ "$TOFFEE" = "197" ]; check "toffee physical stock consumed exactly once (200-3=197)" $?

echo "== E. Unresolved payment stays pending; late payment with unavailable stock -> staff review =="
req GET "admin/orders?payment=pending"
PENDING=$(jarray "['data']" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
[ -n "$PENDING" ] && [ "$PENDING" -ge 1 ]; check "pending payments remain pending (no blind duplicate charge)" $?
req GET "checkout/status?orderId=ord_1013"
REVIEW=$(j "['data']['paymentStatus']")
[ "$REVIEW" = "requires_review" ]; check "late paid order with expired reservation is routed to requires_review" $?

echo "== F. Partial return preserves remaining qty; refund preview is consistent =="
ok_req account/return-lines '{"orderId":"ord_1014"}'
ELIG=$(j "['data'][0]['eligible']")
[ "$ELIG" = "3" ]; check "ord_1014 sardines: partial return preserves the remaining 3 eligible (of 6)" $?
req POST account/create-return '{"orderId":"ord_1014","lines":[{"orderLineId":"ord_1014_l1","quantity":"4","reason":"too many"}]}' 400
OVER="$LAST_BODY"
echo "$OVER" | grep -q "REFUND_LIMIT_EXCEEDED"; check "returning more than the eligible balance is rejected (REFUND_LIMIT_EXCEEDED)" $?
ok_req admin/return/action '{"action":"approve","returnId":"ret_2002","note":"Dented tins verified (demo)","actor":"stf_kojo"}'
req POST admin/return/action '{"action":"request_refund","returnId":"ret_2002","method":"mobile_money","actor":"stf_kojo"}' 400
DUPE="$LAST_BODY"
echo "$DUPE" | grep -q "already in progress"; check "duplicate refund request on the same return is rejected" $?

echo "== G. Refund execution failure is retryable and then succeeds =="
ok_req admin/refund/action '{"refundId":"ref_3002","action":"approve","actor":"stf_serwaa"}'
ok_req admin/refund/action '{"refundId":"ref_3002","action":"execute","actor":"stf_serwaa"}'
EX1="$LAST_BODY"
echo "$EX1" | grep -q '"ok":true'; check "first execution attempt records a retryable provider failure (demo)" $?
req GET "admin/refunds"
ST=$(echo "$LAST_BODY" | python3 -c "
import json,sys
print([r for r in json.load(sys.stdin)['data'] if r['id']=='ref_3002'][0]['status'])")
[ "$ST" = "failed" ]; check "refund state is failed (retryable), not lost" $?
ok_req admin/refund/action '{"refundId":"ref_3002","action":"retry","actor":"stf_serwaa"}'
ok_req admin/refund/action '{"refundId":"ref_3002","action":"execute","actor":"stf_serwaa"}'
EX2="$LAST_BODY"
echo "$EX2" | grep -q '"ok":true'; check "retry executes the refund successfully" $?
req GET "checkout/status?orderId=ord_1014"
PAY=$(j "['data']['paymentStatus']")
[ "$PAY" = "partially_refunded" ]; check "order payment status becomes partially_refunded" $?

echo "== H. Damaged return disposition never becomes purchasable =="
req GET "admin/inventory/lots?variantId=var_yog_500"
YOG=$(echo "$LAST_BODY" | python3 -c "
import json,sys
lots=json.load(sys.stdin)['data']
print(sum(int(l['quantity']) for l in lots if not l['isQuarantined'] and l['kind']=='regular' and not l.get('expired'))) ")
[ "$YOG" = "24" ]; check "yoghurt saleable stock unchanged by damaged/quarantined return lots (still 24)" $?

echo "== I. Duplicate payment callback does not double-mark =="
ok_req checkout/payment-outcome '{"orderId":"ord_1002","outcome":"succeeded"}'
ok_req checkout/payment-outcome '{"orderId":"ord_1002","outcome":"failed"}'
DUP2="$LAST_BODY"
echo "$DUP2" | grep -q '"duplicate":true'; check "second callback after resolution is a no-op (duplicate)" $?

echo "== J. Rider COD: delivery, cash collection and remittance are separate =="
req GET "rider/job?jobId=job_5001"
J="$LAST_BODY"
echo "$J" | grep -q '"cashToCollectLabel"'; check "COD job carries a separate cash-to-collect amount" $?
if echo "$J" | grep -q '"cashCollectedAt"'; then check "cash not yet collected while delivery is in progress" 1; else check "cash not yet collected while delivery is in progress" 0; fi

echo "== K. Staff returns list endpoint serves its contract =="
req GET "admin/returns"
RET_COUNT=$(jarray "['data']" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
[ -n "$RET_COUNT" ] && [ "$RET_COUNT" -ge 1 ]; check "admin.returns returns the full list without INTERNAL errors ($RET_COUNT rows)" $?
RET_ORDER=$(j "['data'][0]['orderId']")
[ -n "$RET_ORDER" ]; check "each returns row links to its order (orderId present)" $?

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && exit 0 || exit 1
