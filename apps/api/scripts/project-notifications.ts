import { createApplication } from "../src/bootstrap";
import { NotificationService } from "../src/notifications/notification.service";

async function main() {
  const app = await createApplication();
  try {
    await app.init();
    const service = app.get(NotificationService);
    let created = 0;
    let scanned = 0;
    for (let i = 0; i < 20; i++) {
      const result = await service.projectBatch();
      if (result.busy) throw new Error("Another notification projection worker owns the lock.");
      created += result.created;
      scanned += result.scanned;
      if (result.scanned < 100) break;
    }
    console.log(JSON.stringify({ projectedOutboxEvents: scanned, inAppNotifications: created, externalDelivery: "not_connected" }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("Notification projection failed. Check backend logs and retry; inbox receipts are idempotent.");
  process.exitCode = 1;
});
