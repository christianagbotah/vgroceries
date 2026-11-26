import type { PaymentProviderObservation } from "./payment-provider";

export interface HostedRecoveryAttempt {
  provider: string;
  method: string;
  status: string;
  initiationState: string;
  settlementState: string;
  merchantReference: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
}

/** Narrow initial rollout: only existing, accepted Hubtel hosted attempts. */
export function isHostedRecoveryCandidate(attempt: HostedRecoveryAttempt): boolean {
  return attempt.provider === "hubtel" && attempt.method === "hosted_checkout" &&
    attempt.status === "pending" && attempt.initiationState === "accepted" &&
    attempt.settlementState === "unsettled";
}

/** No callback, redirect, client claim, unknown or incomplete result can settle an order. */
export function isVerifiedHostedRecovery(attempt: HostedRecoveryAttempt, observation: PaymentProviderObservation): boolean {
  return isHostedRecoveryCandidate(attempt) && observation.state === "succeeded" &&
    observation.providerId === attempt.provider &&
    observation.merchantReference === attempt.merchantReference &&
    typeof observation.providerReference === "string" && observation.providerReference.trim().length > 0 &&
    (!attempt.providerRef || observation.providerReference === attempt.providerRef) &&
    Number.isSafeInteger(attempt.amountMinor) && attempt.amountMinor > 0 &&
    observation.amountMinor === attempt.amountMinor && attempt.currency === "GHS" &&
    observation.currency === attempt.currency;
}
