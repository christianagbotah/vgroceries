import { describe, expect, test } from "bun:test";
import { marketProviderCoverage, marketProviderEligible } from "../packages/contracts/src/market-payment-eligibility";
describe("market provider planning policy",()=>{
  test("country and currency are jointly authoritative",()=>{
    expect(marketProviderCoverage("GH","GHS","hubtel")).toBe("documented");
    expect(marketProviderCoverage("NG","NGN","hubtel")).toBe("unsupported");
    expect(marketProviderCoverage("TG","XOF","hubtel")).toBe("unsupported");
    expect(marketProviderCoverage("NG","NGN","paystack")).toBe("documented");
    expect(marketProviderCoverage("GH","NGN","paystack")).toBe("unsupported");
    expect(marketProviderCoverage("CI","XOF","paystack")).toBe("documented");
    expect(marketProviderCoverage("TG","XOF","paystack")).toBe("unsupported");
    expect(marketProviderCoverage("TG","XOF","flutterwave")).toBe("requires_country_confirmation");
    expect(marketProviderCoverage("TG","XOF","paygate_global")).toBe("documented");
    expect(marketProviderCoverage("unknown","GHS","hubtel")).toBe("unsupported");
    expect(marketProviderCoverage("__proto__","GHS","hubtel")).toBe("unsupported");
  });
  test("documented coverage never automatically enables payments",()=>{
    const ready={country:"GH",currency:"GHS",provider:"hubtel",adapterReady:true,merchantCountryConfirmed:true,collectionCurrencyConfirmed:true,settlementConfirmed:true,credentialsVerified:true,callbackVerificationReady:true,liveApproved:true};
    expect(marketProviderEligible(ready)).toBe(true);
    for(const key of ["adapterReady","merchantCountryConfirmed","collectionCurrencyConfirmed","settlementConfirmed","credentialsVerified","callbackVerificationReady","liveApproved"] as const)
      expect(marketProviderEligible({...ready,[key]:false})).toBe(false);
    expect(marketProviderEligible({...ready,country:"TG",currency:"XOF"})).toBe(false);
    expect(marketProviderEligible({...ready,country:"TG",currency:"XOF",provider:"flutterwave",merchantCountryConfirmed:false})).toBe(false);
  });
});
