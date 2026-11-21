/**
 * Explicitly invoked, fail-closed external-message staging job.
 * No provider sends here. Run after applying migrations and provisioning the
 * encryption key. WhatsApp must await a persisted per-customer consent model.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { customerDestinationFingerprint, encryptCustomerDestination } from "../src/notifications/customer-message-crypto";
import { customerMessage, type CustomerMessageEvent } from "../src/notifications/customer-channel-policy";

const supported = new Set<CustomerMessageEvent>([
  "order.created", "payment.succeeded", "fulfilment.confirmed", "fulfilment.packed",
  "delivery.out_for_delivery", "delivery.delivered", "order.cancelled", "refund.succeeded",
]);
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const key = process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY;
  if (!databaseUrl || !key || !/^[a-f0-9]{64}$/i.test(key))
    throw new Error("DATABASE_URL and a 32-byte CUSTOMER_MESSAGE_ENCRYPTION_KEY are required.");
  if (process.env.CUSTOMER_MESSAGE_STAGING_ENABLED !== "true") {
    console.log("External messaging staging disabled; no customer data processed.");
    return;
  }
  const smsEnabled = process.env.CUSTOMER_SMS_ENABLED === "true";
  const emailEnabled = process.env.CUSTOMER_EMAIL_ENABLED === "true";
  if (!smsEnabled && !emailEnabled) {
    console.log("No consent-authorized delivery channels enabled.");
    return;
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const events = await db.outboxEvent.findMany({
      where: { type: { in: [...supported] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
      select: { id: true, type: true, aggregateId: true, payload: true },
    });
    let queued = 0;
    for (const event of events) {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown> : {};
      // Payment events are attempt-owned. Only confirmed coverage is eligible.
      if (event.type === "payment.succeeded" && payload.coverage !== "confirmed") continue;
      const orderId = event.type === "payment.succeeded" ? payload.orderId : event.aggregateId;
      if (typeof orderId !== "string") continue;
      const order = await db.order.findUnique({ where: { id: orderId }, select: {
        reference: true, customerPhone: true, customerEmail: true, totalMinor: true, paymentStatus: true,
      } });
      if (!order || (event.type === "payment.succeeded" && order.paymentStatus !== "succeeded")) continue;
      // Validate copy before persisting a delivery. Do not put the body or PII in the queue.
      customerMessage(event.type as CustomerMessageEvent, order.reference,
        event.type === "payment.succeeded" ? order.totalMinor : undefined);
      const destinations = [
        ...(smsEnabled && order.customerPhone ? [{ channel: "sms", destination: order.customerPhone }] : []),
        ...(emailEnabled && order.customerEmail ? [{ channel: "email", destination: order.customerEmail }] : []),
      ];
      for (const { channel, destination } of destinations) {
        const fingerprint = customerDestinationFingerprint(destination);
        const created = await db.customerMessageDelivery.createMany({
          data: [{ sourceEventId: event.id, channel, recipientFingerprint: fingerprint,
            recipientEncrypted: encryptCustomerDestination(destination, key), templateKey: event.type }],
          skipDuplicates: true,
        });
        queued += created.count;
      }
    }
    console.log(JSON.stringify({ scanned: events.length, queued }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Messaging staging failed"); process.exitCode = 1; });
