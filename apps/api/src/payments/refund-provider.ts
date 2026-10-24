import type { ElectronicPaymentMethod } from "@variety/contracts";

export interface RefundProviderCapabilities {
  methods: ElectronicPaymentMethod[];
  lookupSupported: boolean;
  safeRetryAfterDefinitiveFailure: boolean;
  safeRetryAfterNoRecord: boolean;
  safeRetryAfterUnknown: boolean;
}

export interface RefundProviderInitiationInput {
  refundId: string;
  executionId: string;
  merchantRefundReference: string;
  originalPaymentMerchantReference: string;
  originalPaymentProviderReference?: string;
  originalPaymentAmountMinor: number;
  originalPaymentResolvedAt?: Date;
  orderReference: string;
  method: ElectronicPaymentMethod;
  amountMinor: number;
  currency: "GHS";
  signal: AbortSignal;
}

export type RefundProviderInitiationResult =
  | { kind: "accepted"; state: "pending"; providerRefundReference?: string }
  | {
      kind: "accepted";
      state: "succeeded";
      providerRefundReference?: string;
      amountMinor: number;
      currency: "GHS";
    }
  | { kind: "rejected"; failureCode?: string; customerSafeMessage?: string };

export interface RefundProviderLookupInput {
  merchantRefundReference: string;
  providerRefundReference?: string;
  signal: AbortSignal;
}

export interface RefundProviderObservation {
  providerId: string;
  merchantRefundReference: string;
  providerRefundReference?: string;
  state: "pending" | "succeeded" | "failed" | "not_found" | "unknown";
  amountMinor?: number;
  currency?: "GHS";
  failureCode?: string;
  customerSafeMessage?: string;
  providerTimestamp?: Date;
}

export interface RefundProviderAdapter {
  readonly id: string;
  capabilities(): RefundProviderCapabilities;
  initiateRefund(input: RefundProviderInitiationInput): Promise<RefundProviderInitiationResult>;
  lookupRefund(input: RefundProviderLookupInput): Promise<RefundProviderObservation>;
}
