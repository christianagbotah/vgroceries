/** Provider-independent customer messaging policy. No network calls are made here. */
export type CustomerChannel = "sms" | "email" | "whatsapp";
export type CustomerMessageEvent = "order.created" | "payment.succeeded" | "payment.pending" | "payment.failed" | "payment.expired" | "payment.requires_review" |
  "fulfilment.confirmed" | "fulfilment.picking_started" | "fulfilment.packed" | "fulfilment.handed_over" | "delivery.out_for_delivery" |
  "delivery.delivered" | "delivery.failed" | "order.cancelled" | "refund.succeeded";

export interface CustomerChannelPreferences {
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappOptedIn: boolean;
}

export function channelsForCustomer(
  contact: { phone?: string | null; email?: string | null },
  preferences: CustomerChannelPreferences,
): CustomerChannel[] {
  const channels: CustomerChannel[] = [];
  if (contact.phone?.trim() && preferences.smsEnabled) channels.push("sms");
  if (contact.email?.trim() && preferences.emailEnabled) channels.push("email");
  // WhatsApp requires explicit, recorded customer opt-in; a phone number is not consent.
  if (contact.phone?.trim() && preferences.whatsappOptedIn) channels.push("whatsapp");
  return channels;
}

/** Stable deduplication identifier for an event/channel/recipient delivery. */
export function customerDeliveryKey(eventId: string, channel: CustomerChannel, recipientId: string): string {
  // Colon-separated keys must reject delimiter injection to remain collision-free.
  // Preserve the existing key format for valid persisted delivery identities.
  if (![eventId, recipientId].every(value => typeof value === "string" && value.trim() === value && value.length > 0 && !value.includes(":") && !/[\u0000-\u001f\u007f]/.test(value))) {
    throw new Error("Invalid delivery identity.");
  }
  return `${eventId}:${channel}:${recipientId}`;
}

/** Keep the SMS body GSM-friendly; the cedi symbol can break some gateways. */
export function customerMessage(
  event: CustomerMessageEvent,
  reference: string,
  amountMinor?: number,
  fulfilmentStatus?: string,
): { subject: string; body: string } {
  if (!/^VG-[A-Z0-9]{8,32}$/.test(reference)) throw new Error("Invalid order reference.");
  const amount = amountMinor === undefined ? "" :
    (Number.isSafeInteger(amountMinor) && amountMinor >= 0
      ? ` GHS ${(amountMinor / 100).toFixed(2)}.`
      : (() => { throw new Error("Invalid amount."); })());
  const tracking = ` Track: https://portal.varietygroceries.com/track?reference=${reference}`;
  switch (event) {
    case "order.created": return { subject: "Variety Groceries - Order received", body: `Variety Groceries: We received order ${reference}.${tracking}` };
    case "payment.succeeded": return { subject: "Variety Groceries - Payment confirmed", body: `Variety Groceries: Payment confirmed for ${reference}.${amount}${tracking}` };
    case "payment.pending": return { subject: "Variety Groceries - Payment pending", body: `Variety Groceries: Payment for ${reference} is awaiting confirmation. If already debited, do not pay again.${tracking}` };
    case "payment.failed": return { subject: "Variety Groceries - Payment unsuccessful", body: `Variety Groceries: Payment for ${reference} was unsuccessful. Check your existing order. If debited, contact support before retrying.${tracking}` };
    case "payment.expired": return { subject: "Variety Groceries - Payment expired", body: `Variety Groceries: Payment request for ${reference} expired. Check your existing order before retrying. If debited, contact support.${tracking}` };
    case "payment.requires_review": return { subject: "Variety Groceries - Payment under review", body: `Variety Groceries: Payment for ${reference} is under review. Do not pay again until the issue is resolved.${tracking}` };
    case "fulfilment.confirmed": return { subject: "Variety Groceries - Order confirmed", body: `Variety Groceries: Order ${reference} is confirmed for preparation.${tracking}` };
    case "fulfilment.picking_started": return { subject: "Variety Groceries - Preparing your order", body: `Variety Groceries: We are preparing order ${reference}.${tracking}` };
    case "fulfilment.packed": return fulfilmentStatus === "ready_for_collection"
      ? { subject: "Variety Groceries - Ready for collection", body: `Variety Groceries: Order ${reference} is ready for collection.${tracking}` }
      : { subject: "Variety Groceries - Order packed", body: `Variety Groceries: Order ${reference} is packed.${tracking}` };
    case "fulfilment.handed_over": return { subject: "Variety Groceries - Order collected", body: `Variety Groceries: Order ${reference} has been collected. Thank you for shopping with us.${tracking}` };
    case "delivery.out_for_delivery": return { subject: "Variety Groceries - Out for delivery", body: `Variety Groceries: Order ${reference} is out for delivery.${tracking}` };
    case "delivery.delivered": return { subject: "Variety Groceries - Delivered", body: `Variety Groceries: Order ${reference} has been delivered.${tracking}` };
    case "delivery.failed": return { subject: "Variety Groceries - Delivery update", body: `Variety Groceries: We could not complete delivery for ${reference}. Check your order for updates or contact support.${tracking}` };
    case "order.cancelled": return { subject: "Variety Groceries - Order cancelled", body: `Variety Groceries: Order ${reference} was cancelled. Check tracking for updates.${tracking}` };
    case "refund.succeeded": return { subject: "Variety Groceries - Refund confirmed", body: `Variety Groceries: Refund confirmed for order ${reference}.${amount}${tracking}` };
  }
}
