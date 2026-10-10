import type {
  RefundProviderAdapter,
  RefundProviderCapabilities,
  RefundProviderInitiationInput,
  RefundProviderInitiationResult,
  RefundProviderLookupInput,
  RefundProviderObservation,
} from "../src/payments/refund-provider";

export class FakeRefundProvider implements RefundProviderAdapter {
  readonly id = "fake";
  readonly initiateCalls: RefundProviderInitiationInput[] = [];
  readonly lookupCalls: RefundProviderLookupInput[] = [];
  capabilitiesValue: RefundProviderCapabilities = {
    methods: ["mobile_money", "card_hosted", "bank_transfer"],
    lookupSupported: true,
    safeRetryAfterDefinitiveFailure: false,
    safeRetryAfterNoRecord: false,
    safeRetryAfterUnknown: false,
  };
  initiationResult: RefundProviderInitiationResult = { kind: "accepted", state: "pending" };
  lookupResult: RefundProviderObservation = {
    providerId: "fake",
    merchantRefundReference: "unset",
    state: "pending",
  };
  initiateHandler?: (input: RefundProviderInitiationInput) => Promise<RefundProviderInitiationResult>;
  lookupHandler?: (input: RefundProviderLookupInput) => Promise<RefundProviderObservation>;

  capabilities() { return this.capabilitiesValue; }
  async initiateRefund(input: RefundProviderInitiationInput) {
    this.initiateCalls.push(input);
    return this.initiateHandler ? this.initiateHandler(input) : this.initiationResult;
  }
  async lookupRefund(input: RefundProviderLookupInput) {
    this.lookupCalls.push(input);
    if (this.lookupHandler) return this.lookupHandler(input);
    return {
      ...this.lookupResult,
      merchantRefundReference:
        this.lookupResult.merchantRefundReference === "unset"
          ? input.merchantRefundReference
          : this.lookupResult.merchantRefundReference,
    };
  }
}
