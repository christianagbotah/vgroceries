/** Pure regression: server 429 retry details drive the customer countdown. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { retryAfterSeconds, formatRetryCountdown } from "../src/features/orders/tracking-rate-limit.ts";

assert.equal(retryAfterSeconds({retryAfterSeconds:782}),782);
assert.equal(retryAfterSeconds({retryAfterSeconds:3600}),3600);
assert.equal(retryAfterSeconds({retryAfterSeconds:"900"}),null);
assert.equal(retryAfterSeconds({retryAfterSeconds:Infinity}),null);
assert.equal(retryAfterSeconds({}),null);
assert.equal(retryAfterSeconds(null),null);
assert.equal(formatRetryCountdown(782),"13m 02s");
assert.equal(formatRetryCountdown(20),"20s");
assert.equal(formatRetryCountdown(3605),"1h 0m 5s");
assert.equal(formatRetryCountdown(0),"0s");

const code=readFileSync(new URL("../src/app/(storefront)/track/page.tsx", import.meta.url),"utf8");
for(const keyword of ["recordServerRetry(err)","trackingWait>0","OTP_RATE_LIMITED","formatRetryCountdown(trackingWait)","formatRetryCountdown(resendWait)"]) {
  assert.ok(code.includes(keyword),"Expected customer UI logic: "+keyword);
}
console.log("Tracking retry countdown and independent SMS resend controls — PASS");
