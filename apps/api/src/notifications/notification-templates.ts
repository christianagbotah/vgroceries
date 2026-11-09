/** Customer copy for committed, explicitly supported order transitions. */
export const customerNotificationTypes = [
  "order.created", "order.cancelled", "order.cancelled_with_refund",
  "fulfilment.confirmed", "fulfilment.packed", "fulfilment.handed_over",
  "delivery.out_for_delivery", "delivery.delivered", "delivery.failed",
  "delivery.rescheduled", "delivery.return_to_store", "delivery.returned_goods_received",
  "delivery.provider_out_for_delivery", "delivery.provider_delivered", "delivery.provider_failed",
  // Strictly order-bound booking/cancellation evidence. Never a transport ETA.
  "pickup.appointment_booked", "pickup.appointment_cancelled",
  // R3a customer-return claim status only: no goods, refund or settlement authority.
  "customer_return_claim.requested", "customer_return_claim.accepted",
  "customer_return_claim.rejected", "customer_return_claim.cancelled",
] as const;
export type CustomerNotificationType = typeof customerNotificationTypes[number];

export function customerNotificationCopy(type: CustomerNotificationType, reference: string, fulfilment: string) {
  const prefix = "Order " + reference + ". ";
  switch (type) {
    case "order.created":
      return { kind: "order", title: "Order received", body: prefix + "We have received your order." };
    case "order.cancelled":
      return { kind: "order", title: "Order cancelled", body: prefix + "Your order was cancelled. View order details for its payment status." };
    case "order.cancelled_with_refund":
      return { kind: "order", title: "Order cancelled", body: prefix + "Your order was cancelled. View order details for refund updates." };
    case "fulfilment.confirmed":
      return { kind: "fulfilment", title: "Order confirmed", body: prefix + "Your order is confirmed for preparation." };
    case "fulfilment.packed":
      return { kind: "fulfilment", title: "Order packed", body: prefix + "Your items have been packed." };
    case "fulfilment.handed_over":
      return fulfilment === "collection"
        ? { kind: "fulfilment", title: "Order collected", body: prefix + "Your order has been collected." }
        : { kind: "fulfilment", title: "Order handed over", body: prefix + "Your order is with our delivery team." };
    case "delivery.provider_out_for_delivery":
    case "delivery.out_for_delivery":
      return { kind: "delivery", title: "Out for delivery", body: prefix + "Your order is out for delivery." };
    case "delivery.provider_delivered":
    case "delivery.delivered":
      return { kind: "delivery", title: "Delivery recorded", body: prefix + "Your order has been delivered." };
    case "delivery.provider_failed":
    case "delivery.failed":
      return { kind: "delivery", title: "Delivery issue", body: prefix + "There was a problem delivering your order. View order details for updates." };
    case "delivery.rescheduled":
      return { kind: "delivery", title: "Delivery rescheduled", body: prefix + "Your delivery was rescheduled. View order details for updates." };
    case "delivery.return_to_store":
      return { kind: "delivery", title: "Returning to store", body: prefix + "Your delivery parcel is returning to the store." };
    case "delivery.returned_goods_received":
      return { kind: "delivery", title: "Parcel returned", body: prefix + "Your parcel has returned to our delivery team. View order details for the next steps." };
    case "pickup.appointment_booked":
      return { kind: "delivery", title: "Collection appointment booked",
        body: prefix + "Your collection appointment has been reserved. View order details for the confirmed time and pickup centre. This is not a transport ETA." };
    case "pickup.appointment_cancelled":
      return { kind: "delivery", title: "Collection appointment cancelled",
        body: prefix + "Your collection appointment was cancelled. Your order is not cancelled; view order details for available collection arrangements." };
    case "customer_return_claim.requested":
      return { kind: "order", title: "Return request received",
        body: prefix + "Your return request has been recorded. This does not mean goods have been received or a refund approved. See Returns in your account." };
    case "customer_return_claim.accepted":
      return { kind: "order", title: "Return request accepted for inspection",
        body: prefix + "Staff accepted your request for further physical inspection. No physical receipt or refund is confirmed. See Returns in your account." };
    case "customer_return_claim.rejected":
      return { kind: "order", title: "Return request declined",
        body: prefix + "Staff declined your return request. See Returns in your account for the review explanation." };
    case "customer_return_claim.cancelled":
      return { kind: "order", title: "Return request cancelled",
        body: prefix + "Your pending return request was cancelled. The order and any payment remain separate. See Returns in your account." };
  }
}
