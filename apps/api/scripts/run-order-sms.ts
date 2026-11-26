import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { stageOrderSmsBatch } from "../src/notifications/order-sms-stage-batch";
import { dispatchOneOrderSms } from "../src/notifications/order-sms-dispatch";
import { validateHubtelSmsConfig } from "../src/notifications/hubtel-sms-provider";

async function main() {
  const staging = process.env.CUSTOMER_ORDER_SMS_STAGING_ENABLED === "true";
  const dispatch = process.env.CUSTOMER_ORDER_SMS_DISPATCH_ENABLED === "true";
  if (!staging && !dispatch) {
    console.log("Order SMS worker disabled.");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  const keyHex = process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY ?? "";
  if (!databaseUrl || !/^[a-f0-9]{64}$/i.test(keyHex))
    throw new Error("Order SMS worker configuration incomplete.");
  const config = {
    endpoint: process.env.HUBTEL_SMS_ENDPOINT ?? "https://sms.hubtel.com/v1/messages/send",
    clientId: process.env.HUBTEL_SMS_CLIENT_ID ?? "",
    clientSecret: process.env.HUBTEL_SMS_CLIENT_SECRET ?? "",
    senderId: process.env.HUBTEL_SMS_SENDER_ID ?? "",
  };
  if (dispatch) validateHubtelSmsConfig(config);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const batch = await stageOrderSmsBatch(db, { enabled: staging, keyHex, take: 50 });
    const counts: Record<string, number> = {};
    if (dispatch) {
      // Hard cap on chargeable provider requests per invocation; never retry
      // an ambiguous outbound request. Scheduler must serialize invocations.
      for (let i = 0; i < 10; i++) {
        const result = await dispatchOneOrderSms(db, { enabled: true, keyHex, config });
        counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
        if (["busy", "empty", "unknown"].includes(result.outcome)) break;
      }
    }
    console.log(JSON.stringify({ scanned: batch.scanned, queued: batch.queued, outcomes: counts }));
    if (counts.unknown) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(() => {
  console.error("Order SMS worker failed; consult restricted operational logs.");
  process.exitCode = 1;
});
