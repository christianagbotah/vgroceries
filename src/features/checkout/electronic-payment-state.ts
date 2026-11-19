import type { PublicOrder } from "@/services/client";

type PaymentOrder = Pick<PublicOrder,
  "paymentMethod" | "paymentStatus" | "fulfilmentStatus" | "paymentAttempts">;

/**
 * Pending order status does not prove that a gateway request was initiated.
 * The authoritative attempt ledger distinguishes a fresh order from a
 * provider request already in progress. Legacy server attempts fail closed.
 *
 * Only the demo adapter marks pre-created but NOT yet submitted attempts
 * as gatewayInitiated=false; a real API attempt without the marker is active.
 */
export function electronicPaymentPhase(
  order: PaymentOrder,
): "not_electronic" | "cancelled" | "finished" | "start" | "verifying" {
  if (!["electronic", "mobile_money", "card_hosted", "bank_transfer"]
    .includes(order.paymentMethod)) return "not_electronic";
  if (order.fulfilmentStatus === "cancelled") return "cancelled";
  if (!["pending", "unpaid"].includes(order.paymentStatus)) return "finished";
  return order.paymentAttempts.some(a => a.gatewayInitiated !== false)
    ? "verifying" : "start";
}

/** Keep checking unsettled electronic payments and staff-review outcomes. */
export function shouldPollPaymentStatus(order: PaymentOrder) {
  if (order.fulfilmentStatus === "cancelled") return false;
  if (["succeeded", "failed", "expired", "refunded", "partially_refunded"]
    .includes(order.paymentStatus)) return false;
  return !(order.paymentStatus === "unpaid" &&
    electronicPaymentPhase(order) === "not_electronic");
}
