import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../src/database/database";
import type { ApiConfig } from "../src/config";
import type { PaymentReconciliationService } from "../src/payments/payment-reconciliation.service";
import { CustomerPaymentRefreshService } from "../src/payments/customer-payment-refresh.service";
import type { CheckoutPrincipal } from "../src/commerce-identity/checkout-principal.service";

const principal: CheckoutPrincipal = { kind:"guest", guestSessionId:"fixture-guest", actorId:"fixture-guest", actorScope:"guest:fixture-guest" };

test("customer payment refresh authorizes exact owner and throttles repeated provider lookup", async () => {
  const old = process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED;
  process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED = "true";
  try {
    let claims=0, lookups=0, pending=true, owner=true, locked=true;
    const attempt={ id:"fixture-attempt",provider:"hubtel",method:"hosted_checkout",status:"pending",
      initiationState:"accepted",settlementState:"unsettled" };
    const order={findFirst:async (args:any)=>{
      assert.equal(args.where.guestSessionId,principal.guestSessionId);
      return owner ? {id:"fixture-order",paymentStatus:pending?"pending":"succeeded",fulfilmentStatus:"awaiting_confirmation"} : null;
    }};
    const tx={
      $queryRaw:async()=>[{locked}], order, paymentAttempt:{findFirst:async()=>attempt},
      auditEvent:{findFirst:async(args:any)=>{assert.deepEqual(args.where.action.in,["payment.customer_lookup_started","payment.worker_lookup_started"]);return claims?{id:"previous"}:null;},create:async()=>{claims++;}},
    };
    const db={order,$transaction:async(fn:(t:typeof tx)=>Promise<unknown>)=>fn(tx)};
    const service=new CustomerPaymentRefreshService(db as unknown as Database,
      {payments:{providerId:"hubtel",requestTimeoutMs:5000}} as ApiConfig,
      {reconcile:async(id:string,trigger:string,actor:string)=>{
        assert.equal(id,attempt.id);assert.equal(trigger,"customer_retry");assert.equal(actor,principal.actorId);lookups++;
      }} as unknown as PaymentReconciliationService);
    owner=false;
    await assert.rejects(()=>service.refresh(principal,"fixture-order","foreign"),/Order not found/);
    owner=true;locked=false;
    await service.refresh(principal,"fixture-order","busy");
    assert.equal(lookups,0);
    locked=true;
    await service.refresh(principal,"fixture-order","first");
    await service.refresh(principal,"fixture-order","throttled");
    assert.equal(claims,1);assert.equal(lookups,1);
    pending=false;
    await service.refresh(principal,"fixture-order","already-paid");
    assert.equal(lookups,1);
    pending=true;claims=0;
    process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED="false";
    await service.refresh(principal,"fixture-order","disabled");
    assert.equal(lookups,1);
  } finally {
    if(old===undefined) delete process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED;
    else process.env.HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED=old;
  }
});
