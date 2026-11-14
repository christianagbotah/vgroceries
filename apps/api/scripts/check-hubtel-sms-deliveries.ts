import { createApplication } from "../src/bootstrap";
import { HubtelSmsDispatchService } from "../src/notifications/hubtel-sms-dispatch.service";

/**
 * MANUAL, READ-ONLY provider receipt lookup for already-submitted SMS.
 * Does not submit, resend or retry any message.
 *
 * Needs the protected server configuration, an isolated database migration,
 * HUBTEL_SMS_DISPATCH_ENABLED=true and an explicit allowlist of test numbers.
 *
 * Example after an approved staging deployment:
 * node --env-file=/home/lightworld/config/varietygroceries/api.env \\
 *   dist/scripts/check-hubtel-sms-deliveries.js
 *
 * Never add a timer or run this automatically on app startup.
 */
async function main() {
  const app = await createApplication();
  try {
    await app.init();
    const service = app.get(HubtelSmsDispatchService);
    const outcome = await service.checkSubmittedDeliveryBatch(10);
    // No phone numbers, messages, credentials or message IDs in output.
    console.log(JSON.stringify(outcome));
  } finally {
    await app.close();
  }
}

main().catch(() => {
  console.error("Hubtel SMS receipt check failed; no SMS submission was performed.");
  process.exitCode = 1;
});
