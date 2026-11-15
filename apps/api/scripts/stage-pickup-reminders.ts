import { createApplication } from "../src/bootstrap";
import { NotificationService } from "../src/notifications/notification.service";

/**
 * Deliberately manual, guarded UAT operation. Never creates a payment,
 * shipment transition, SMS, WhatsApp message, or email.
 * Use the existing notifications:project CLI afterwards to populate inboxes.
 */
async function main() {
  const app = await createApplication();
  try {
    await app.init();
    const service = app.get(NotificationService);
    const result = await service.stagePickupAppointmentReminders(100);
    console.log(JSON.stringify({
      ...result,
      channel: "in_app_only",
      externalDelivery: "not_connected",
      nextStep: result.disabled ? "feature_disabled" : "run_notifications_project",
    }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("In-app pickup reminder staging failed; do not assume reminders were sent.");
  process.exitCode = 1;
});
