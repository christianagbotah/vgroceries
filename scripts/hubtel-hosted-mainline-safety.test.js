import { describe, expect, test } from "bun:test";
import { HubtelPaymentProvider } from "../apps/api/src/payments/hubtel-payment-provider";

const reference="VG-PAY-AABBCCDDEEFF001122334455";
const cfg={
  clientId:"test-hubtel-id",clientSecret:"test-hubtel-key",
  callbackUrl:"https://example.test/api/v1/payments/providers/hubtel/events",
  returnUrl:"https://example.test/checkout/payment-return",
  cancellationUrl:"https://example.test/checkout/payment-return?cancelled=1",
  onlineCheckout:{
    merchantAccountNumber:"11684",
    initiateUrl:"https://payproxyapi.hubtel.com/items/initiate",
    statusUrl:"https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}",
  },
};
const input={
  attemptId:"attempt-1",merchantReference:reference,orderReference:"VG-ORDER-1",
  method:"hosted_checkout",amountMinor:12345,currency:"GHS",
  signal:new AbortController().signal,
};
function mock(status,body){
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url:String(url),method:init?.method,body:init?.body});
    return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
  };
  return {calls,fetcher};
}
function checkout(data={}){
  return {responseCode:"0000",status:"Success",data:{
    checkoutId:"checkout-1",checkoutUrl:"https://pay.hubtel.com/checkout-1",
    clientReference:reference,...data,
  }};
}
function paid(data={}){
  return {responseCode:"0000",data:{
    status:"Paid",amount:123.45,clientReference:reference,
    transactionId:"txn-1",currencyCode:null,paymentMethod:"mobilemoney",...data,
  }};
}
describe("Hubtel hosted checkout mainline safety, no real provider requests",()=>{
  test("secure checkout creation is only a hosted redirect, never a paid state",async()=>{
    const http=mock(200,checkout());
    const provider=new HubtelPaymentProvider(cfg,http.fetcher);
    expect(provider.capabilities()).toMatchObject({methods:["hosted_checkout"],trustMode:"lookup_required",safeInitiationRetry:false});
    const result=await provider.initiate(input);
    expect(result).toEqual({kind:"accepted",action:{kind:"redirect",url:"https://pay.hubtel.com/checkout-1"}});
    expect(http.calls).toHaveLength(1);
    const body=JSON.parse(http.calls[0].body);
    expect(body.clientReference).toBe(reference);
    expect(body.merchantAccountNumber).toBe("11684");
    expect(body.totalAmount).toBe(123.45);
    expect(body.cardNumber).toBeUndefined();
  });
  test("no Direct money prompt or overlong reference, even if provider URL is valid",async()=>{
    const http=mock(200,checkout());
    const provider=new HubtelPaymentProvider(cfg,http.fetcher);
    expect((await provider.initiate({...input,method:"mobile_money",payerPhone:"+233241111111"})).kind).toBe("rejected");
    expect((await provider.initiate({...input,merchantReference:"VG-PAY-"+"A".repeat(32)})).kind).toBe("rejected");
    expect(http.calls).toHaveLength(0);
  });
  test("wrong merchant reference and malicious checkout URL cannot redirect",async()=>{
    for(const data of [
      {clientReference:"VG-PAY-OTHER"},
      {checkoutUrl:"https://pay.hubtel.com.evil.example/checkout"},
      {checkoutUrl:"http://pay.hubtel.com/checkout"},
      {checkoutId:""},
    ]){
      const http=mock(200,checkout(data));
      await expect(new HubtelPaymentProvider(cfg,http.fetcher).initiate(input)).rejects.toThrow();
      expect(http.calls).toHaveLength(1);
    }
  });
  test("HTTP 200 without provider success code does not authorize repeat charge",async()=>{
    for(const body of [
      {responseCode:"0005",status:"Failed",data:null},
      {responseCode:"0000",status:"Success",data:null},
      {responseCode:"4000",status:"Failed",data:null},
    ]){
      const http=mock(200,body);
      await expect(new HubtelPaymentProvider(cfg,http.fetcher).initiate(input)).rejects.toThrow();
    }
  });
  test("paid status requires independent echoed reference, cedi amount, transaction ID",async()=>{
    const http=mock(200,paid());
    const observed=await new HubtelPaymentProvider(cfg,http.fetcher).lookup({
      merchantReference:reference,signal:new AbortController().signal,
    });
    expect(observed).toMatchObject({
      merchantReference:reference,providerReference:"txn-1",
      state:"succeeded",amountMinor:12345,currency:"GHS",
      settledChannel:"mobilemoney",providerEventId:"hubtel-txn:txn-1",
    });
    expect(http.calls[0].url).toBe(
      "https://api-txnstatus.hubtel.com/transactions/11684/status?clientReference="+reference);
    expect(http.calls[0].method).toBe("GET");
  });
  test("provider status 403, foreign currency, mismatched IDs and missing proof fail closed",async()=>{
    for(const {status,data} of [
      {status:403,data:{}},
      {status:200,data:{clientReference:"VG-UNRELATED"}},
      {status:200,data:{currencyCode:"USD"}},
      {status:200,data:{currencyCode:"GHS",currency:"EUR"}},
      {status:200,data:{transactionId:""}},
      {status:200,data:{amount:123.456}},
    ]){
      const http=mock(status,paid(data));
      await expect(new HubtelPaymentProvider(cfg,http.fetcher).lookup({
        merchantReference:reference,signal:new AbortController().signal,
      })).rejects.toThrow();
    }
    const http=mock(200,paid());
    await expect(new HubtelPaymentProvider(cfg,http.fetcher).lookup({
      merchantReference:reference,providerReference:"other-txn",
      signal:new AbortController().signal,
    })).rejects.toThrow("transaction reference could not be verified");
  });
  test("callback remains lookup-required, not an authoritative paid receipt",async()=>{
    const provider=new HubtelPaymentProvider(cfg,async()=>{throw Error("No HTTP expected")});
    const result=await provider.verifyEvent({
      rawBody:Buffer.from(JSON.stringify({data:{clientReference:reference,status:"Paid"}})),
      headers:{},
    });
    expect(result.verification).toBe("lookup_required");
    expect(result.merchantReference).toBe(reference);
    expect(result.observation).toBeUndefined();
  });
});
