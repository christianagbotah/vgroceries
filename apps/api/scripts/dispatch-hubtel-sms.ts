import { createApplication } from "../src/bootstrap";
import { HubtelSmsDispatchService } from "../src/notifications/hubtel-sms-dispatch.service";

/**
 * Run manually only after an owner-approved test number is allowlisted:
 *   node --env-file=/home/lightworld/config/varietygroceries/api.env
 *     dist/scripts/dispatch-hubtel-sms.js
 *
 * There is deliberately NO systemd timer, HTTP route, or automatic start.
 * Without HUBTEL_SMS_DISPATCH_ENABLED=true plus a UTC cutoff and explicit
 * allowlist, this prints "disabled" and never calls the SMS provider.
 */
async function main() {
  const app = await createApplication();
  try {
    await app.init();
    const service = app.get(HubtelSmsDispatchService);
    const projection = await service.stageBatch(25);
    const delivery = await service.sendApprovedBatch(10);
    // Count-only logs: no numbers, names, messages, credentials or IDs.
    console.log(JSON.stringify({ projection, delivery }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("Hubtel SMS dispatch did not complete. Review ledger state before any retry.");
  process.exitCode = 1;
});
