import type { PublicOrder } from "@/services/contracts";

type PaymentOrder = Pick<PublicOrder,
  "paymentMethod" | "paymentStatus" | "fulfilmentStatus" | "paymentAttempts">;

/**
 * An order is already `pending` immediately after checkout, BEFORE any
 * gateway request. Do not infer "payment started" from paymentStatus.
 *
 * The server-owned attempt ledger identifies whether an attempt exists.
 * A mock checkout can create a *provisional* attempt marked
 * gatewayInitiated=false; legacy API attempts without that marker are treated
 * as started, never as permission to charge again.
 */
export function electronicPaymentPhase(
  order: PaymentOrder,
): "not_electronic" | "cancelled" | "finished" | "start" | "verifying" {
  const electronic = ["electronic", "mobile_money", "card_hosted", "bank_transfer"]
    .includes(order.paymentMethod);
  if (!electronic) return "not_electronic";
  if (order.fulfilmentStatus === "cancelled") return "cancelled";
  if (!["pending", "unpaid"].includes(order.paymentStatus)) return "finished";

  const started = order.paymentAttempts.some(attempt => attempt.gatewayInitiated !== false);
  return started ? "verifying" : "start";
}

export function shouldPollPaymentStatus(order: PaymentOrder): boolean {
  const terminal = ["succeeded", "failed", "expired", "refunded", "partially_refunded"]
    .includes(order.paymentStatus);
  // Staff review, refund pending and electronic unpaid must remain refreshable
  // as server-authoritative provider or staff updates can still arrive.
  return !terminal && !(order.paymentStatus === "unpaid" &&
    electronicPaymentPhase(order) === "not_electronic");
}
