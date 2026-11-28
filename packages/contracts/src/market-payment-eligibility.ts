/**
 * Planning-only market/provider policy. Not wired to production payment routing.
 * Currency coverage is not merchant onboarding or settlement authorization.
 * Never infer availability from currency alone; unsupported pairs fail closed.
 */
export type MarketCountry = "GH" | "NG" | "TG" | "CI";
export type MarketCurrency = "GHS" | "NGN" | "XOF";
export type MarketProvider = "hubtel" | "paystack" | "flutterwave" | "paygate_global";
export type ProviderCoverage = "documented" | "requires_country_confirmation" | "unsupported";

const marketCurrencies: Readonly<Record<MarketCountry, MarketCurrency>> = {
  GH: "GHS", NG: "NGN", TG: "XOF", CI: "XOF",
};
const coverage: Readonly<Record<MarketCountry, Readonly<Record<MarketProvider, ProviderCoverage>>>> = {
  GH: { hubtel:"documented", paystack:"documented", flutterwave:"documented", paygate_global:"unsupported" },
  NG: { hubtel:"unsupported", paystack:"documented", flutterwave:"documented", paygate_global:"unsupported" },
  TG: { hubtel:"unsupported", paystack:"unsupported", flutterwave:"requires_country_confirmation", paygate_global:"documented" },
  CI: { hubtel:"unsupported", paystack:"documented", flutterwave:"documented", paygate_global:"documented" },
};
export function marketProviderCoverage(country: string, currency: string, provider: string): ProviderCoverage {
  if (!Object.prototype.hasOwnProperty.call(marketCurrencies,country)) return "unsupported";
  const market = country as MarketCountry;
  if (marketCurrencies[market] !== currency || !Object.prototype.hasOwnProperty.call(coverage[market],provider)) return "unsupported";
  return coverage[market][provider as MarketProvider];
}
export interface MarketProviderReadiness {
  country: string;
  currency: string;
  provider: string;
  adapterReady: boolean;
  merchantCountryConfirmed: boolean;
  collectionCurrencyConfirmed: boolean;
  settlementConfirmed: boolean;
  credentialsVerified: boolean;
  callbackVerificationReady: boolean;
  liveApproved: boolean;
}
/** Eligibility is an additional gate, never a replacement for runtime verification. */
export function marketProviderEligible(input: MarketProviderReadiness): boolean {
  const status = marketProviderCoverage(input.country,input.currency,input.provider);
  return status !== "unsupported" &&
    input.adapterReady === true && input.merchantCountryConfirmed === true &&
    input.collectionCurrencyConfirmed === true && input.settlementConfirmed === true &&
    input.credentialsVerified === true && input.callbackVerificationReady === true &&
    input.liveApproved === true;
}
