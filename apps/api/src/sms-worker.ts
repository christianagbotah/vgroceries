import { createApplication } from "./bootstrap";
import { readConfig } from "./config";
import { SmsDispatchService } from "./notifications/sms-dispatch.service";

/**
 * Manual, intentionally guarded one-shot SMS worker.
 * No web API startup hook, daemon, cron or automatic rerun.
 * Never emits customer numbers, message body or provider credentials to logs.
 */
async function main() {
  const cfg = readConfig();
  if (!cfg.hubtelSms || !cfg.smsDispatchWorkerEnabled || !cfg.smsDispatchActivatedAt)
    throw new Error("SMS sending is disabled or missing the explicit activation cutoff");

  const app = await createApplication(cfg);
  try {
    await app.init();
    const service = app.get(SmsDispatchService);
    const projected = await service.projectBatch(60);
    const sent = await service.sendBatch(undefined, 10);
    const reconciled = await service.reconcileBatch(undefined, 10);
    console.log(JSON.stringify({ projected, sent, reconciled }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("SMS worker stopped. Inspect private configuration and dispatch ledger.");
  process.exitCode = 1;
});
