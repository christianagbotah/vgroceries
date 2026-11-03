import { customerTrackingJourneySchema, type CustomerTrackingJourney, type CustomerTrackingState } from "@variety/contracts";

type SafeOrderEvent = { createdAt: Date; action: string; note: string | null };
type LegacyOrder = {
  createdAt: Date;
  fulfilment: string;
  fulfilmentStatus: string;
  deliveryStatus: string;
  events: SafeOrderEvent[];
};

const TITLES: Record<string, string> = {
  "order.created": "Order placed",
  "payment.succeeded": "Payment confirmed",
  "order.confirmed": "Order confirmed",
  "fulfilment.confirmed": "Order confirmed",
  "fulfilment.picking_started": "Our team started preparing your order",
  "fulfilment.packed": "Your order was packed",
  "fulfilment.handed_over": "Your order was handed over for delivery",
  "delivery.delivered": "Order delivered",
  "delivery.rescheduled": "Delivery rescheduled",
  "order.cancelled": "Order cancelled",
};

function legacyState(order: LegacyOrder): CustomerTrackingState {
  if (order.fulfilmentStatus === "delivered") return "delivered";
  if (order.fulfilmentStatus === "collected") return "collected";
  if (["failed", "rescheduled"].includes(order.deliveryStatus)) return "delivery_exception";
  if (["out_for_delivery", "in_progress"].includes(order.deliveryStatus)) return "out_for_delivery";
  return "preparing";
}

export function legacyOrderTrackingJourney(order: LegacyOrder): CustomerTrackingJourney {
  const state = legacyState(order);
  const sorted = order.events.slice(-120).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const milestones = sorted.map((event, index) => ({
    id: "order-" + (index + 1),
    at: event.createdAt.toISOString(),
    title: TITLES[event.action] ?? "Order progress updated",
    kind: (event.action.startsWith("fulfilment.") ? "fulfilment"
      : event.action.startsWith("delivery.") ? "delivery" : "order") as "order" | "fulfilment" | "delivery",
    status: "complete" as "complete" | "current",
  }));
  if (!milestones.length) {
    milestones.push({ id: "order-1", at: order.createdAt.toISOString(), title: "Order placed", kind: "order", status: "current" });
  } else if (!["delivered", "collected"].includes(state)) {
    milestones[milestones.length - 1]!.status = "current";
  }
  const lastAt = sorted[sorted.length - 1]?.createdAt;
  const updatedAt = lastAt && lastAt > order.createdAt ? lastAt : order.createdAt;
  const headline = state === "delivered" ? "Your order has been delivered"
    : state === "collected" ? "Your order has been collected"
    : state === "out_for_delivery" ? "Your order is out for delivery"
    : state === "delivery_exception" ? "Your delivery is being reviewed"
    : order.fulfilment === "collection" ? "Your order is being prepared for collection" : "Your order is being prepared";
  return customerTrackingJourneySchema.parse({
    source: "legacy", state, headline, updatedAt: updatedAt.toISOString(), milestones,
  });
}
