import { randomUUID } from "node:crypto";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { PaymentReconciliationService } from "../src/payments/payment-reconciliation.service";
import { claimHostedRecovery, hostedRecoveryIntervalMs, selectHostedRecoveryBatch } from "../src/payments/hosted-recovery-queue";

async function main() {
  // Explicit activation only; default-off in every environment.
  if (process.env.HUBTEL_HOSTED_RECONCILIATION_WORKER_ENABLED !== "true") {
    console.log("Hosted payment recovery disabled.");
    return;
  }
  const config = readConfig();
  if (config.payments?.providerId !== "hubtel" ||
      !config.payments.enabledMethods.includes("hosted_checkout") ||
      !config.hubtelPayment?.onlineCheckout)
    throw new Error("Hosted recovery requires configured Hubtel Online Checkout.");
  const intervalMs = hostedRecoveryIntervalMs(config.payments.reconcileAfterSeconds, config.payments.requestTimeoutMs);
  const cutoff = new Date(Date.now() - intervalMs);
  const app = await createApplication(config);
  try {
    await app.init();
    const db = app.get(Database);
    const service = app.get(PaymentReconciliationService);
    const rows = await selectHostedRecoveryBatch(db, cutoff);
    let matched = 0, deferred = 0, exceptions = 0, errors = 0, skipped = 0;
    for (const row of rows) {
      try {
        const requestId = "hosted-recovery-" + randomUUID();
        if (!await claimHostedRecovery(db, row, intervalMs, requestId)) { skipped++; continue; }
        const outcome = await service.reconcile(row.id, "worker", "payment-reconciliation-worker", requestId);
        if (outcome.result === "matched") matched++;
        else if (outcome.result === "deferred") deferred++;
        else exceptions++;
      } catch { errors++; }
    }
    console.log(JSON.stringify({ scanned: rows.length, matched, deferred, exceptions, errors, skipped }));
    if (errors || exceptions) process.exitCode = 1;
  } finally { await app.close(); }
}
main().catch(() => { console.error("Hosted payment recovery failed; consult restricted operational logs."); process.exitCode = 1; });
