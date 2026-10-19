import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { publishedDoorstepWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";
let app: INestApplication; let db: Database; let routes: LogisticsRouteRuleService; let services: ReturnType<typeof routeServices>;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });
before(async () => { if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required"); app = await createApplication(config()); db = app.get(Database); await seedCommerceFixtures(db); services = routeServices(db); routes = new LogisticsRouteRuleService(db); });
after(async () => { await app?.close(); });

test("route simulation is deterministic for direct no-match and ambiguity", async () => {
  const wf = await publishedDoorstepWorkflow(services.workflows, "simulation");
  const source = await routeNode(services.nodes, "SIM_SOURCE", "head_office");
  const base = { name: "Primary direct", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery" as const, destinationKind: "doorstep" as const, workflowVersionId: wf.id, priority: 50, stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" as const }], legs: [] };
  const primary = await routes.create("admin-commerce", "sim-primary-create", base, "req-sim-primary");
  const active = await routes.activate("admin-commerce", primary.id, "sim-primary-activate", { expectedVersion: primary.version }, "req-sim-primary-act");
  assert.equal(active.active, true);

  const matched = await routes.simulate({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep" });
  assert.equal(matched.status, "matched");
  if (matched.status === "matched") assert.equal(matched.selectedRule.ruleId, primary.id);
  const none = await routes.simulate({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-optional", destinationKind: "doorstep" });
  assert.deepEqual(none, { status: "no_match", candidates: [] });
  await assert.rejects(() => routes.resolve({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-optional", destinationKind: "doorstep" }, new Date()), (error: any) => error?.getResponse?.()?.code === "LOGISTICS_ROUTE_NOT_CONFIGURED");

  const lower = await routes.create("admin-commerce", "sim-lower-create", { ...base, name: "Lower priority", priority: 10 }, "req-sim-lower");
  await routes.activate("admin-commerce", lower.id, "sim-lower-activate", { expectedVersion: lower.version }, "req-sim-lower-act");
  const stillPrimary = await routes.simulate({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep" });
  assert.equal(stillPrimary.status, "matched"); if (stillPrimary.status === "matched") assert.equal(stillPrimary.selectedRule.ruleId, primary.id);

  const conflict = await routes.create("admin-commerce", "sim-conflict-create", { ...base, name: "Conflicting route" }, "req-sim-conflict");
  await assert.rejects(() => routes.activate("admin-commerce", conflict.id, "sim-conflict-activate", { expectedVersion: conflict.version }, "req-sim-conflict-act"));
  await db.deliveryRouteRule.update({ where: { id: conflict.id }, data: { active: true } });
  const ambiguous = await routes.simulate({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep" });
  assert.equal(ambiguous.status, "ambiguous");
  if (ambiguous.status === "ambiguous") assert.deepEqual(new Set(ambiguous.candidates.map((row) => row.ruleId)), new Set([primary.id, conflict.id]));
  await assert.rejects(() => routes.resolve({ originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep" }, new Date()), (error: any) => error?.getResponse?.()?.code === "LOGISTICS_ROUTE_AMBIGUOUS");
});
