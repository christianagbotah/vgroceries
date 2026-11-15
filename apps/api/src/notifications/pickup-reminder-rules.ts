import { createHash } from "node:crypto";

/** This is in-app-only copy, never a promise of external SMS delivery. */
export const PICKUP_REMINDER_TYPE = "pickup.appointment_reminder" as const;

/** An appointment must begin strictly in the future, but within 90 minutes. */
export function pickupReminderWindow(startsAt: Date, now: Date): boolean {
  const diff = startsAt.getTime() - now.getTime();
  return Number.isFinite(diff) && diff > 0 && diff <= 90 * 60_000;
}

/**
 * Stable per-booking event identity. A rebooked appointment gets a new
 * bookedAt and may receive one fresh reminder; re-runs never duplicate.
 */
export function pickupReminderEventId(input: {
  orderId: string;
  nodeId: string;
  startsAt: Date;
  bookedAt: Date;
}): string {
  return "pickup-reminder-" + createHash("sha256").update(JSON.stringify([
    input.orderId, input.nodeId, input.startsAt.toISOString(),
    input.bookedAt.toISOString(),
  ])).digest("hex");
}

export function pickupReminderPayloadMatches(
  payload: unknown,
  appointment: {
    status: string;
    nodeId: string;
    startsAt: Date;
    bookedAt: Date;
  } | null,
): boolean {
  if (!appointment || appointment.status !== "booked") return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const source = payload as Record<string, unknown>;
  return source.nodeId === appointment.nodeId &&
    source.startsAt === appointment.startsAt.toISOString() &&
    source.bookedAt === appointment.bookedAt.toISOString();
}

/** The original payment/order and physical shipment authority stay independent. */
export function pickupReminderOrderEligible(order: {
  paymentStatus: string;
  fulfilmentStatus: string;
  cancelledAt: Date | null;
  pickupSnapshot: { nodeId: string } | null;
  refunds: readonly { status: string }[];
  shipments: readonly {
    status: string;
    destinationKind: string;
    finalPickupNodeId: string | null;
    currentNodeId: string | null;
    completedAt: Date | null;
    currentLegId: string | null;
  }[];
}, nodeId: string): boolean {
  const shipment = order.shipments[0];
  return order.paymentStatus === "succeeded" &&
    order.fulfilmentStatus === "dispatched" &&
    order.cancelledAt === null &&
    order.pickupSnapshot?.nodeId === nodeId &&
    !order.refunds.some(r => ["awaiting_approval", "approved", "processing",
      "requires_review", "succeeded"].includes(r.status)) &&
    !!shipment &&
    shipment.status === "ready_for_pickup" &&
    shipment.destinationKind === "pickup_point" &&
    shipment.finalPickupNodeId === nodeId &&
    shipment.currentNodeId === nodeId &&
    shipment.completedAt === null &&
    shipment.currentLegId === null;
}
