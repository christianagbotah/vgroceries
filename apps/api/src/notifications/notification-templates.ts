/** Templates only describe committed transitions, never settlement or live GPS. */
export const customerNotificationTypes = [
  "order.created", "order.cancelled", "order.cancelled_with_refund",
  "fulfilment.confirmed", "fulfilment.packed", "fulfilment.handed_over",
  "delivery.out_for_delivery", "delivery.delivered", "delivery.failed",
  "delivery.rescheduled", "delivery.return_to_store",
] as const;
export type CustomerNotificationType = typeof customerNotificationTypes[number];
export function customerNotificationCopy(type: CustomerNotificationType, reference: string, fulfilment: string) {
  const prefix = "Order " + reference + ": ";
  switch (type) {
    case "order.created": return { kind: "order", title: "Order received", body: prefix + "We received your order. Check payment and fulfilment details separately." };
    case "order.cancelled": return { kind: "order", title: "Order cancelled", body: prefix + "The order was cancelled. Check its payment status in your account." };
    case "order.cancelled_with_refund": return { kind: "order", title: "Order cancelled", body: prefix + "The order was cancelled. Check refund progress in order details; a request is not a completed transfer." };
    case "fulfilment.confirmed": return { kind: "fulfilment", title: "Order confirmed", body: prefix + "Your order was confirmed for fulfilment." };
    case "fulfilment.packed": return { kind: "fulfilment", title: "Order packed", body: prefix + "Your items were packed." };
    case "fulfilment.handed_over": return { kind: "fulfilment", title: "Handover recorded", body: prefix + (fulfilment === "collection" ? "Collection handover was recorded." : "Dispatch handover was recorded; delivery is not yet confirmed.") };
    case "delivery.out_for_delivery": return { kind: "delivery", title: "Out for delivery", body: prefix + "The delivery was marked out for delivery. No live ETA is available." };
    case "delivery.delivered": return { kind: "delivery", title: "Delivery recorded", body: prefix + "Delivery completion was recorded. Cash collection and rider remittance remain separate." };
    case "delivery.failed": return { kind: "delivery", title: "Delivery issue", body: prefix + "A delivery attempt failed. Check order status for updates." };
    case "delivery.rescheduled": return { kind: "delivery", title: "Delivery rescheduled", body: prefix + "A delivery reschedule was recorded. Review the current status in order details." };
    case "delivery.return_to_store": return { kind: "delivery", title: "Return to store", body: prefix + "Return-to-store processing was recorded; this is not a refund or restock." };
  }
}
