/**
 * Presentation only: provider observation, reconciliation and actual merchant
 * bank payout are separate facts. A reconciliation exception is NEVER a
 * declined transaction and must not be colored or titled "failed".
 */
export function settlementEvidence(state: string): {
  badgeStatus: "pending" | "requires_review";
  label: string;
  explanation: string;
} {
  switch (state) {
    case "exception":
      return {
        badgeStatus: "requires_review",
        label: "Verification exception",
        explanation: "Outcome uncertain: check the provider independently. Do not infer success, failure or refund.",
      };
    case "reconciled":
      return {
        badgeStatus: "requires_review",
        label: "Reconciled record",
        explanation: "The recorded provider outcome was reconciled; merchant bank payout is a separate check.",
      };
    case "settled":
      return {
        badgeStatus: "pending",
        label: "Recorded settled",
        explanation: "Settlement is recorded in the payment ledger, not independently proven as a bank deposit.",
      };
    case "unsettled":
      return {
        badgeStatus: "pending",
        label: "Unsettled",
        explanation: "Provider settlement is not recorded yet.",
      };
    default:
      return {
        badgeStatus: "requires_review",
        label: "Unknown reconciliation state",
        explanation: "Unrecognized state. Investigate; do not change financial records based on this badge.",
      };
  }
}
