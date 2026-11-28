import { Client } from "pg";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { HubtelPaymentRecoveryService } from "../src/payments/hubtel-payment-recovery.service";

/**
 * One-shot Hubtel hosted-checkout status reconciliation.
 * DEFAULT: DRY RUN, with zero provider requests or state changes.
 *
 * Usage:
 *   node --env-file=/path/to/protected/api.env dist/scripts/reconcile-hubtel-checkout.js
 *   HUBTEL_RECOVERY_EXECUTION_ENABLED=true node --env-file=... dist/scripts/reconcile-hubtel-checkout.js --execute
 *
 * The runner never initiates a charge/refund and is not an automatic daemon.
 * Schedule only after reviewed staging CI, signed-off merchant verification,
 * a role/checkout UAT and an operator-approved rollback plan.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--execute"))
    throw new Error("Usage: reconcile-hubtel-checkout [--execute]");
  const execute = args[0] === "--execute";
  if (execute && process.env.HUBTEL_RECOVERY_EXECUTION_ENABLED !== "true")
    throw new Error("Hubtel recovery execution requires explicit server-only opt-in.");

  const config = readConfig();
  if (execute && (config.payments?.providerId !== "hubtel" ||
      !config.payments.enabledMethods.includes("hosted_checkout") ||
      !config.hubtelPayment?.onlineCheckout))
    throw new Error("Hubtel hosted checkout must be configured before recovery execution.");

  const app = await createApplication(config);
  let lock: Client | null = null;
  let acquired = false;
  try {
    await app.init();

    if (execute) {
      // A dedicated PostgreSQL connection holds the session lock for the
      // entire sweep. It prevents overlapping runners across VPS instances.
      lock = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
      await lock.connect();
      const result = await lock.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        ["variety:hubtel:hosted-payment-recovery:v1"],
      );
      acquired = result.rows[0]?.acquired === true;
      if (!acquired) throw new Error("Another Hubtel recovery run is active.");
    }

    const report = await app.get(HubtelPaymentRecoveryService).run(execute);
    // Output intentionally contains counts only: never print payment
    // references, customer names, provider payloads or API credentials.
    console.log(JSON.stringify({
      ...report,
      provider: "hubtel",
      mode: "hosted_checkout",
      noNewPaymentRequests: true,
      refundExecution: false,
    }));
  } finally {
    if (lock) {
      if (acquired) {
        try {
          await lock.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
            "variety:hubtel:hosted-payment-recovery:v1",
          ]);
        } catch { /* a disconnected PostgreSQL session drops its own lock */ }
      }
      await lock.end().catch(() => undefined);
    }
    await app.close();
  }
}

main().catch(() => {
  console.error("Hubtel recovery failed closed; review the protected server logs and payment exception queue.");
  process.exitCode = 1;
});
