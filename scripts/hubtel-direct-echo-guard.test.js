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
