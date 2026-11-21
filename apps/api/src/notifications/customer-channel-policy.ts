/** Provider-independent customer messaging policy. No network calls are made here. */
export type CustomerChannel = "sms" | "email" | "whatsapp";
export type CustomerMessageEvent = "order.created" | "payment.succeeded" |
  "fulfilment.confirmed" | "fulfilment.packed" | "delivery.out_for_delivery" |
  "delivery.delivered" | "order.cancelled" | "refund.succeeded";

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
    case "fulfilment.confirmed": return { subject: "Variety Groceries - Order confirmed", body: `Variety Groceries: Order ${reference} is confirmed for preparation.${tracking}` };
    case "fulfilment.packed": return { subject: "Variety Groceries - Order packed", body: `Variety Groceries: Order ${reference} is packed.${tracking}` };
    case "delivery.out_for_delivery": return { subject: "Variety Groceries - Out for delivery", body: `Variety Groceries: Order ${reference} is out for delivery.${tracking}` };
    case "delivery.delivered": return { subject: "Variety Groceries - Delivered", body: `Variety Groceries: Order ${reference} has been delivered.${tracking}` };
    case "order.cancelled": return { subject: "Variety Groceries - Order cancelled", body: `Variety Groceries: Order ${reference} was cancelled. Check tracking for updates.${tracking}` };
    case "refund.succeeded": return { subject: "Variety Groceries - Refund confirmed", body: `Variety Groceries: Refund confirmed for order ${reference}.${amount}${tracking}` };
  }
}
