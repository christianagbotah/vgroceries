import { describe, expect, test } from "bun:test";
import { HubtelPaymentProvider } from "../apps/api/src/payments/hubtel-payment-provider";

const cfg = {
  clientId:"test-only-id", clientSecret:"test-only-secret",
  requestMoneyUrl:"https://hubtel.example/request/{mobileNumber}",
  statusUrl:"https://hubtel.example/status/{reference}",
  callbackUrl:"https://example.test/api/v1/payments/providers/hubtel/events",
  returnUrl:"https://example.test/return", cancellationUrl:"https://example.test/cancel",
};
const merchantReference="VG-PAY-ABC123";
const lookupInput={merchantReference,providerReference:"paylink-001",signal:new AbortController().signal};
function providerResponse(status,data) {
  const calls=[];
  const fetcher=async (_url,init)=>{
    calls.push({method:init?.method});
    return new Response(JSON.stringify({responseCode:"0000",data}),{
      status,headers:{"content-type":"application/json"},
    });
  };
  return {fetcher,calls};
}
describe("Hubtel Direct transaction status demands provider-echoed identity",()=>{
  test("a Paid claim with omitted, blank, wrong or mismatched reference cannot settle an attempt",async()=>{
    for(const val of [undefined,"","   ","VG-OTHER-CUSTOMER"]) {
      const data={status:"Paid",amount:123.45,paylinkId:"paylink-001"};
      if(val!==undefined)data.clientReference=val;
      const mock=providerResponse(200,data);
      await expect(new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput))
        .rejects.toThrow("status reference could not be verified");
      expect(mock.calls).toEqual([{method:"GET"}]);
    }
  });
  test("HTTP 403 is non-authoritative regardless of response body",async()=>{
    const mock=providerResponse(403,{status:"Paid",amount:123.45,clientReference:merchantReference});
    await expect(new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput))
      .rejects.toThrow("lookup failed");
  });
  test("an exact echoed reference can become a normalized provider observation",async()=>{
    const mock=providerResponse(200,{status:"Paid",amount:123.45,clientReference:merchantReference,
      paylinkId:"paylink-001"});
    const observed=await new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput);
    expect(observed.merchantReference).toBe(merchantReference);
    expect(observed.state).toBe("succeeded");
    expect(observed.amountMinor).toBe(12345);
    expect(observed.currency).toBe("GHS");
  });
  test("an existing provider reference cannot be silently copied from the request",async()=>{
    for(const paylinkId of [undefined,"","   ","other-paylink"]) {
      const data={status:"Paid",amount:123.45,clientReference:merchantReference};
      if(paylinkId!==undefined)data.paylinkId=paylinkId;
      const mock=providerResponse(200,data);
      await expect(new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput))
        .rejects.toThrow("provider reference could not be verified");
      expect(mock.calls).toEqual([{method:"GET"}]);
    }
  });
  test("explicit foreign or contradictory currency cannot masquerade as a GHS payment",async()=>{
    for(const fields of [
      {currencyCode:"USD"}, {CurrencyCode:"EUR"}, {currency:"GBP"},
      {currencyCode:"GHS",currency:"USD"}, {currencyCode:123},
    ]) {
      const mock=providerResponse(200,{
        status:"Paid",amount:123.45,
        clientReference:merchantReference,paylinkId:"paylink-001",...fields,
      });
      await expect(new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput))
        .rejects.toThrow("status currency could not be verified");
    }
  });
  test("null currencyCode remains compatible with the GHS-only collection account",async()=>{
    for(const currencyCode of [null,"GHS"," ghs "]) {
      const mock=providerResponse(200,{
        status:"Paid",amount:123.45,currencyCode,
        clientReference:merchantReference,paylinkId:"paylink-001",
      });
      const observed=await new HubtelPaymentProvider(cfg,mock.fetcher).lookup(lookupInput);
      expect(observed.currency).toBe("GHS");
      expect(observed.state).toBe("succeeded");
    }
  });
  test("overlong merchant reference fails before any new Hubtel request",async()=>{
    const calls=[];
    const fetcher=async()=>{calls.push(1);throw Error("No provider request allowed");};
    for(const invalid of [
      "VG-PAY-"+"A".repeat(32),
      "VG-PAY-"+"F".repeat(26),
      "VG-PAY-HELLO-WORLD",
      "",
    ]) {
      const result=await new HubtelPaymentProvider(cfg,fetcher).initiate({
        attemptId:"attempt-1",orderReference:"VG-ORDER-1001",
        merchantReference:invalid,method:"mobile_money",
        amountMinor:100,currency:"GHS",payerPhone:"+233241111111",
        signal:new AbortController().signal,
      });
      expect(result.kind).toBe("rejected");
      expect(result.failureCode).toBe("HUBTEL_REFERENCE_TOO_LONG_OR_INVALID");
    }
    expect(calls).toHaveLength(0);
  });
  test("a verified pending merchant lookup may have no prior provider reference",async()=>{
    const mock=providerResponse(200,{status:"Pending",clientReference:merchantReference,amount:123.45});
    const observed=await new HubtelPaymentProvider(cfg,mock.fetcher).lookup({
      merchantReference,signal:new AbortController().signal,
    });
    expect(observed.merchantReference).toBe(merchantReference);
    expect(observed.providerReference).toBeUndefined();
    expect(observed.state).toBe("pending");
  });
});
