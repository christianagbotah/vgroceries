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

test("stale route updates and activation cannot overwrite the winner", async () => {
  const wf = await publishedDoorstepWorkflow(services.workflows, "route-concurrency");
  const source = await routeNode(services.nodes, "CONCURRENT_SOURCE", "head_office");
  const created = await routes.create("admin-commerce", "concurrent-route-create", { name: "Concurrent route", originNodeId: source.id, deliveryZoneId: "zone-optional", fulfilment: "delivery", destinationKind: "doorstep", workflowVersionId: wf.id, priority: 7, stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" }], legs: [] } as any, "req-concurrent-route");
  const attempts = await Promise.allSettled([
    routes.update("admin-commerce", created.id, "concurrent-update-a", { expectedVersion: created.version, name: "Winner A" }, "req-update-a"),
    routes.update("admin-commerce", created.id, "concurrent-update-b", { expectedVersion: created.version, name: "Winner B" }, "req-update-b"),
  ]);
  assert.equal(attempts.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((row) => row.status === "rejected").length, 1);
  const winner = await routes.get(created.id);
  assert.equal(winner.version, 2);
  await assert.rejects(() => routes.activate("admin-commerce", created.id, "concurrent-stale-activate", { expectedVersion: 1 }, "req-stale-activate"), (error: any) => error?.status === 409 || error?.statusCode === 409);
  const activated = await routes.activate("admin-commerce", created.id, "concurrent-activate", { expectedVersion: winner.version }, "req-activate");
  assert.equal(activated.active, true);
  assert.equal(activated.version, 3);
  await assert.rejects(() => routes.update("admin-commerce", created.id, "active-content-edit", { expectedVersion: 3, name: "Illegal active edit" }, "req-active-edit"));
  const deactivated = await routes.update("admin-commerce", created.id, "active-deactivate", { expectedVersion: 3, active: false }, "req-deactivate");
  assert.equal(deactivated.active, false);
});

test("two same-priority overlapping rules cannot both activate concurrently", async () => {
  const wf = await publishedDoorstepWorkflow(services.workflows, "route-activation-race");
  const source = await routeNode(services.nodes, "ACTIVATION_RACE_SOURCE", "head_office");
  const common = {
    originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: wf.id, priority: 11,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" }], legs: [],
  } as any;
  const first = await routes.create("admin-commerce", "activation-race-create-a", { ...common, name: "Activation race A" }, "req-activation-race-a");
  const second = await routes.create("admin-commerce", "activation-race-create-b", { ...common, name: "Activation race B" }, "req-activation-race-b");
  const outcomes = await Promise.allSettled([
    routes.activate("admin-commerce", first.id, "activation-race-a", { expectedVersion: first.version }, "req-activate-race-a"),
    routes.activate("admin-commerce", second.id, "activation-race-b", { expectedVersion: second.version }, "req-activate-race-b"),
  ]);
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((row) => row.status === "rejected").length, 1);
  const rows = await db.deliveryRouteRule.findMany({ where: { id: { in: [first.id, second.id] } }, select: { active: true } });
  assert.equal(rows.filter((row) => row.active).length, 1);
  const rejected = outcomes.find((row) => row.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason?.getResponse?.()?.code, "LOGISTICS_ROUTE_AMBIGUOUS");
});
