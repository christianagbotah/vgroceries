import type {
  ElectronicPaymentMethod,
  PaymentProviderAction,
} from "@variety/contracts";

export type PaymentTrustMode = "verified_event" | "lookup_required";

export interface PaymentProviderCapabilities {
  methods: ElectronicPaymentMethod[];
  trustMode: PaymentTrustMode;
  safeInitiationRetry: boolean;
}

export interface PaymentProviderInitiationInput {
  attemptId: string;
  merchantReference: string;
  orderReference: string;
  method: ElectronicPaymentMethod;
  amountMinor: number;
  currency: "GHS";
  payerPhone?: string;
  signal: AbortSignal;
}

export type PaymentProviderInitiationResult =
  | {
      kind: "accepted";
      providerReference?: string;
      action: PaymentProviderAction;
      expiresAt?: Date;
    }
  | {
      kind: "rejected";
      failureCode?: string;
      customerSafeMessage?: string;
    };

export interface PaymentProviderLookupInput {
  merchantReference: string;
  providerReference?: string;
  signal: AbortSignal;
}

export interface PaymentProviderObservation {
  providerId: string;
  merchantReference: string;
  providerReference?: string;
  state: "pending" | "succeeded" | "failed" | "expired" | "unknown";
  amountMinor?: number;
  currency?: "GHS";
  providerEventId?: string;
  failureCode?: string;
  customerSafeMessage?: string;
  providerTimestamp?: Date;
}

export interface PaymentProviderEventInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export type PaymentProviderEventVerification =
  | { verification: "invalid"; providerEventId?: string }
  | {
      verification: "lookup_required";
      providerEventId?: string;
      merchantReference?: string;
      providerReference?: string;
    }
  | {
      verification: "verified";
      providerEventId?: string;
      observation: PaymentProviderObservation;
    };

export interface PaymentProviderAdapter {
  readonly id: string;
  capabilities(): PaymentProviderCapabilities;
  initiate(
    input: PaymentProviderInitiationInput,
  ): Promise<PaymentProviderInitiationResult>;
  verifyEvent(
    input: PaymentProviderEventInput,
  ): Promise<PaymentProviderEventVerification>;
  lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation>;
}
