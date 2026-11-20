import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";
import { PaymentPolicyService } from "../src/payments/payment-policy.service";

const id="11111111-2222-4333-8444-555555555555";
function env() {
  return {
    DATABASE_URL:"postgresql://test:test@localhost:5432/vg",
    WEB_ORIGINS:"https://portal.varietygroceries.com",
    API_STOCK_LOCATION_ID:"stock",
    NODE_ENV:"production",
    PAYMENT_PROVIDER_ID:"hubtel",
    PAYMENT_ENABLED_METHODS:"mobile_money",
    PAYMENT_CONFIRMED_HOLD_MINUTES:"1440",
    PAYMENT_PROVIDER_TIMEOUT_MS:"5000",
    PAYMENT_RECONCILE_AFTER_SECONDS:"120",
    PAYMENT_HOSTED_DOMAINS:"pay.hubtel.com",
    HUBTEL_CLIENT_ID:"synthetic-id",
    HUBTEL_CLIENT_SECRET:"synthetic-secret",
    HUBTEL_CALLBACK_URL:"https://portal.varietygroceries.com/api/v1/payments/providers/hubtel/events",
    HUBTEL_RETURN_URL:"https://portal.varietygroceries.com/checkout/payment-return",
    HUBTEL_CANCELLATION_URL:"https://portal.varietygroceries.com/checkout/payment-return?cancelled=1",
    HUBTEL_DIRECT_COLLECTION_ACCOUNT:"11684",
    HUBTEL_DIRECT_RECEIVE_URL:"https://rmp.hubtel.com/merchantaccount/merchants/{merchantAccountNumber}/receive/mobilemoney",
    HUBTEL_DIRECT_STATUS_URL:"https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
    HUBTEL_REFUND_BASE_URL:"https://refund-api.hubtel.com",
    HUBTEL_REFUND_BASIC_USERNAME:"synthetic-id",
    HUBTEL_REFUND_BASIC_PASSWORD:"synthetic-secret",
    HUBTEL_REFUND_COLLECTION_ACCOUNT:"11684",
    HUBTEL_REFUND_CALLBACK_ORIGIN:"https://portal.varietygroceries.com",
    HUBTEL_REFUND_CALLBACK_SECRET:"A".repeat(48),
    STAGING_MOMO_PILOT_ENABLED:"true",
    STAGING_MOMO_PILOT_CUSTOMER_ID:id,
    STAGING_MOMO_PILOT_PHONE:"+233241111111",
    STAGING_MOMO_PILOT_CHANNEL:"mtn-gh",
    STAGING_MOMO_PILOT_MAX_MINOR:"300",
    STAGING_MOMO_PILOT_EXPIRES_AT:new Date(Date.now()+60*60*1000).toISOString().replace(/\.\d{3}Z$/,".000Z"),
  };
}
function policy() {
  const config=readConfig(env());
  assert.ok(config.stagingMomoPilot);
  return new PaymentPolicyService(config, {} as never, {} as never, {} as never);
}

test("staging pilot is off unless all restricted owner payment settings are expressly enabled",()=>{
  const off=env();
  delete (off as Record<string,string>).STAGING_MOMO_PILOT_ENABLED;
  for(const k of Object.keys(off))
    if(k.startsWith("STAGING_MOMO_PILOT_"))delete (off as Record<string,string>)[k];
  const unrestricted = readConfig(off);
  assert.equal(unrestricted.stagingMomoPilot,undefined);
  const lockedPolicy = new PaymentPolicyService(unrestricted, {} as never, {} as never, {} as never);
  assert.throws(()=>lockedPolicy.assertElectronicMethodAvailable("mobile_money"),/restricted pilot/);
  assert.ok(readConfig(env()).stagingMomoPilot);
  for(const change of [
    {STAGING_MOMO_PILOT_CUSTOMER_ID:"INVALID"},
    {STAGING_MOMO_PILOT_PHONE:"0241111111"},
    {STAGING_MOMO_PILOT_CHANNEL:"visa"},
    {STAGING_MOMO_PILOT_MAX_MINOR:"999999"},
    {STAGING_MOMO_PILOT_EXPIRES_AT:"2020-01-01T00:00:00.000Z"},
    {STAGING_MOMO_PILOT_EXPIRES_AT:new Date(Date.now()+26*3600000).toISOString()},
    {HUBTEL_REFUND_BASE_URL:"https://example.test"},
    {HUBTEL_REFUND_BASIC_PASSWORD:"different"},
    {PAYMENT_ENABLED_METHODS:"hosted_checkout"},
    {WEB_ORIGINS:"https://varietygroceries.com"},
    {STAGING_MOMO_PILOT_ENABLED:"false"},
  ]) {
    assert.throws(()=>readConfig({...env(),...change}),/Staging|staging|pilot|Hubtel|Refund|payment/);
  }
});

test("staging pilot denies guest/other users, changed phone/network, > cap and permits only exact owner",()=>{
  const s=policy();
  const owner={kind:"customer" as const,userId:id,actorId:id,actorScope:"customer:"+id};
  s.assertStagingPilotCustomer(owner);
  s.assertStagingPilotAmount(100);
  s.assertStagingPilotAmount(300);
  s.assertStagingPilotPayer("+233241111111","mtn-gh");
  assert.throws(()=>s.assertStagingPilotCustomer({
    kind:"guest",guestSessionId:"g",actorId:"guest:g",actorScope:"guest:g",
  }), /restricted/);
  assert.throws(()=>s.assertStagingPilotCustomer({
    ...owner,userId:"00000000-0000-4000-8000-000000000000",
  }), /restricted/);
  for(const amount of [0,50,301,10000,NaN])assert.throws(()=>s.assertStagingPilotAmount(amount),/limit/);
  for(const [phone,network] of [
    ["+233241111112","mtn-gh"],
    ["+233241111111","tigo-gh"],
    ["+233241111111",undefined],
  ] as const) assert.throws(()=>s.assertStagingPilotPayer(phone,network),/pre-authorized/);
});
