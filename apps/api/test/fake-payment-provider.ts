import type {
  PaymentProviderAdapter,
  PaymentProviderCapabilities,
  PaymentProviderEventInput,
  PaymentProviderEventVerification,
  PaymentProviderInitiationInput,
  PaymentProviderInitiationResult,
  PaymentProviderLookupInput,
  PaymentProviderObservation,
} from "../src/payments/payment-provider";

export class FakePaymentProvider implements PaymentProviderAdapter {
  readonly id = "fake";
  readonly initiateCalls: PaymentProviderInitiationInput[] = [];
  readonly lookupCalls: PaymentProviderLookupInput[] = [];
  readonly verifyCalls: PaymentProviderEventInput[] = [];
  capabilitiesValue: PaymentProviderCapabilities = {
    methods: ["mobile_money", "card_hosted", "bank_transfer"], trustMode: "verified_event", safeInitiationRetry: true,
  };
  initiationResult: PaymentProviderInitiationResult = { kind: "accepted", providerReference: "fake-ref", action: { kind: "prompt", message: "Approve the payment" } };
  lookupResult: PaymentProviderObservation = { providerId: "fake", merchantReference: "unset", state: "pending", amountMinor: 1, currency: "GHS" };
  verificationResult: PaymentProviderEventVerification = { verification: "invalid" };
  initiateHandler?: (input: PaymentProviderInitiationInput) => Promise<PaymentProviderInitiationResult | void>;
  lookupHandler?: (input: PaymentProviderLookupInput) => Promise<PaymentProviderObservation>;
  verifyHandler?: (input: PaymentProviderEventInput) => Promise<PaymentProviderEventVerification>;

  capabilities() { return this.capabilitiesValue; }
  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    this.initiateCalls.push(input);
    if (!this.initiateHandler) return this.initiationResult;
    const result = await this.initiateHandler(input);
    if (!result) throw new Error("Fake initiation handler completed without a result");
    return result;
  }
  async verifyEvent(input: PaymentProviderEventInput) {
    this.verifyCalls.push(input);
    return this.verifyHandler ? this.verifyHandler(input) : this.verificationResult;
  }
  async lookup(input: PaymentProviderLookupInput) {
    this.lookupCalls.push(input);
    if (this.lookupHandler) return this.lookupHandler(input);
    return { ...this.lookupResult, merchantReference: this.lookupResult.merchantReference === "unset" ? input.merchantReference : this.lookupResult.merchantReference };
  }
}
