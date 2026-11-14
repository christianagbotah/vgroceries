"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync,writeFileSync,rmSync,utimesSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { providerAssessment,latestSafeStagingBackup,evaluateGates,markdown } = require("./web-launch-preflight.cjs");

const requiredPayment = [
  "PAYMENT_PROVIDER_ID", "PAYMENT_ENABLED_METHODS",
  "PAYMENT_CONFIRMED_HOLD_MINUTES", "PAYMENT_PROVIDER_TIMEOUT_MS",
  "PAYMENT_RECONCILE_AFTER_SECONDS", "PAYMENT_HOSTED_DOMAINS",
];
const hubtel = [
  "HUBTEL_CLIENT_ID", "HUBTEL_CLIENT_SECRET", "HUBTEL_REQUEST_MONEY_URL",
  "HUBTEL_STATUS_URL", "HUBTEL_CALLBACK_URL", "HUBTEL_RETURN_URL",
  "HUBTEL_CANCELLATION_URL",
];
const refund = [
  "HUBTEL_REFUND_BASE_URL", "HUBTEL_REFUND_BASIC_USERNAME",
  "HUBTEL_REFUND_BASIC_PASSWORD", "HUBTEL_REFUND_COLLECTION_ACCOUNT",
  "HUBTEL_REFUND_CALLBACK_ORIGIN", "HUBTEL_REFUND_CALLBACK_SECRET",
];
const publicSafe = () => ({
  apiReady:200,shop:200,posCustomersAnon:401,inventoryAnon:401,productionComingSoon:true,
});
const fullEnv = () => ({
  ...Object.fromEntries([...requiredPayment,...hubtel,...refund].map(key=>[key,"PRIVATE_CANARY_PASSWORD_XYZ"])),
  PAYMENT_PROVIDER_ID:"hubtel",PASSWORD_RESET_FROM:"test@example.test",
  PASSWORD_RESET_PUBLIC_ORIGIN:"https://portal.varietygroceries.com",
});
const byId=(report,id)=>report.checks.find(x=>x.id===id);

test("Missing provider details fail closed rather than claiming payment readiness",()=>{
  const report=evaluateGates({env:{},http:publicSafe(),backup:null});
  assert.equal(report.readiness,"NO_GO");
  assert.equal(byId(report,"PAY-01").result,"BLOCKER");
  assert.equal(byId(report,"PAY-02").result,"BLOCKER");
  assert.equal(byId(report,"SMS-01").result,"BLOCKER");
  assert.equal(byId(report,"EML-01").result,"PENDING UAT");
  assert.equal(byId(report,"MOB-01").result,"DEFERRED");
});

test("Partially supplied Hubtel bundle never passes the gate",()=>{
  assert.equal(providerAssessment({HUBTEL_CLIENT_ID:"a"}).hubtelCollection,"partial");
  assert.equal(providerAssessment({PAYMENT_PROVIDER_ID:"hubtel"}).paymentBundle,"partial");
  const report=evaluateGates({
    env:{HUBTEL_CLIENT_ID:"PRIVATE_CANARY_PASSWORD_XYZ", PAYMENT_PROVIDER_ID:"hubtel"},
    http:publicSafe(),backup:null,
  });
  assert.equal(byId(report,"PAY-01").result,"BLOCKER");
});

test("Complete-looking configs only move payment to pending UAT, never ready",()=>{
  const env=fullEnv();
  assert.deepEqual(providerAssessment(env),{
    paymentBundle:"complete",hubtelCollection:"complete",
    hubtelRefund:"complete",selectedHubtel:true,
  });
  const report=evaluateGates({env,http:publicSafe(),backup:{ageHours:2,size:130000}});
  assert.equal(byId(report,"PAY-01").result,"PENDING UAT");
  assert.equal(byId(report,"PAY-02").result,"PENDING UAT");
  assert.equal(byId(report,"SMS-01").result,"BLOCKER");
  assert.equal(report.readiness,"NO_GO");
  assert.equal(byId(report,"OPS-01").result,"PASS");
  const rendered=markdown({checkedAt:"2026-11-14T00:00:00.000Z",...report});
  assert.ok(!rendered.includes("PRIVATE_CANARY_PASSWORD_XYZ"));
  assert.match(rendered,/NO_GO/);
});

test("Open customer directory, leaked inventory or published production each hard-block launch",()=>{
  for(const change of [
    {posCustomersAnon:200},{inventoryAnon:200},{productionComingSoon:false},
    {apiReady:503},{shop:302},
  ]){
    const report=evaluateGates({env:fullEnv(),http:{...publicSafe(),...change},backup:null,smsImplemented:true});
    assert.equal(report.readiness,"NO_GO");
    assert.ok(report.checks.some(row=>row.result==="BLOCKER" &&
      ["SEC-01","SEC-02","REL-01","STG-01","STG-02"].includes(row.id)));
  }
});

test("SMS transport presence does not equate to verified actual delivery",()=>{
  const report=evaluateGates({env:fullEnv(),http:publicSafe(),backup:null,smsImplemented:true});
  assert.equal(byId(report,"SMS-01").result,"PENDING UAT");
});

test("Only a recent, nonempty restricted staging backup passes the backup freshness check",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"variety-preflight-"));
  try{
    const file=path.join(dir,"portal-staging-safe.dump");
    writeFileSync(file,Buffer.alloc(120000));
    const current=latestSafeStagingBackup(dir);
    assert.ok(current?.size>=120000);
    assert.ok(current?.ageHours<=1);
    const old=Date.now()-26*3600000;
    utimesSync(file,new Date(old),new Date(old));
    assert.ok(latestSafeStagingBackup(dir).ageHours>=25);
    const report=evaluateGates({env:fullEnv(),http:publicSafe(),
      backup:latestSafeStagingBackup(dir)});
    assert.equal(byId(report,"OPS-01").result,"PENDING UAT");
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test("Display statuses never include private email, phone or provider config values",()=>{
  const env=fullEnv();
  env.PASSWORD_RESET_FROM="PRIVATE_CANARY_PASSWORD_XYZ@example.test";
  const report=evaluateGates({env,http:publicSafe(),backup:null});
  const text=JSON.stringify(report);
  assert.ok(!text.includes("PRIVATE_CANARY_PASSWORD_XYZ"));
  assert.ok(!text.includes("HUBTEL_CLIENT_SECRET="));
});
