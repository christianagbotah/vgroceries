import { createApplication } from "../src/bootstrap";
import { NotificationService } from "../src/notifications/notification.service";

/**
 * In-app-only UAT worker: manually invoked, no timer, no HTTP endpoint,
 * no SMS, no email, no external payment operation.
 *
 * Requires all three environment flags = true:
 *   LOGISTICS_SHIPMENT_EXECUTION_ENABLED
 *   LOGISTICS_CUSTOMER_PICKUP_ENABLED
 *   PICKUP_INAPP_REMINDERS_ENABLED
 *
 * Default OFF. Never enable remote pickup just for this worker.
 */
async function main() {
  const app = await createApplication();
  try {
    await app.init();
    const inbox = app.get(NotificationService);
    const result = await inbox.stagePickupAppointmentReminders(100);
    if (result.disabled) {
      console.log(JSON.stringify({ disabled: true, externalDelivery: "not_connected" }));
      return;
    }
    const projected = await inbox.projectBatch(200);
    if (projected.busy)
      throw new Error("Another in-app projection worker owns the lock.");
    console.log(JSON.stringify({
      stagedCandidates: result.scanned,
      stagedReminders: result.queued,
      inboxEventsProjected: projected.scanned,
      inboxNotificationsCreated: projected.created,
      externalDelivery: "not_connected",
    }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("Pickup in-app reminder run failed; inspect server health before manual retry.");
  process.exitCode = 1;
});
