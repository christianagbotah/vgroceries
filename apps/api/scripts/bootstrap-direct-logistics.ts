import { randomUUID } from "node:crypto";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsBootstrapService } from "../src/logistics/logistics-bootstrap.service";

async function main() {
  if (process.env.LOGISTICS_BOOTSTRAP_CONFIRM !== "DIRECT_DEFAULTS") {
    throw new Error("Set LOGISTICS_BOOTSTRAP_CONFIRM=DIRECT_DEFAULTS to run this explicit configuration command.");
  }
  const actorId = process.env.LOGISTICS_BOOTSTRAP_ACTOR_ID?.trim();
  if (!actorId) throw new Error("LOGISTICS_BOOTSTRAP_ACTOR_ID is required.");

  const config = readConfig();
  if (!config.commerce) throw new Error("Complete commerce configuration is required.");
  const db = new Database(config);
  try {
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, active: true } });
    if (!actor || actor.role !== "admin" || !actor.active) {
      throw new Error("LOGISTICS_BOOTSTRAP_ACTOR_ID must identify an active administrator.");
    }
    const service = new LogisticsBootstrapService(db, config);
    const result = await service.ensureDirectDefaults(actor.id, `logistics-bootstrap-${randomUUID()}`);
    console.log(JSON.stringify({ ok: true, data: result }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Logistics direct bootstrap failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
