import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";

let app: INestApplication;
let base = "";
let document: any;

before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  document = await (await fetch(base + "/api/v1/openapi.json")).json();
});
after(async () => { await app.close(); });

const security = [{ cookieAuth: [] }, { bearerAuth: [] }];
const paths = {
  nodes: "/api/v1/admin/logistics/nodes",
  node: "/api/v1/admin/logistics/nodes/{nodeId}",
  lanes: "/api/v1/admin/logistics/lanes",
  lane: "/api/v1/admin/logistics/lanes/{laneId}",
  workflows: "/api/v1/admin/logistics/workflows",
  workflow: "/api/v1/admin/logistics/workflows/{templateId}",
  workflowDraft: "/api/v1/admin/logistics/workflows/{templateId}/drafts",
  workflowVersion: "/api/v1/admin/logistics/workflows/{templateId}/versions/{versionId}",
  workflowPublish: "/api/v1/admin/logistics/workflows/{templateId}/publish",
  rules: "/api/v1/admin/logistics/route-rules",
  rule: "/api/v1/admin/logistics/route-rules/{ruleId}",
  ruleActivate: "/api/v1/admin/logistics/route-rules/{ruleId}/activate",
  ruleSimulate: "/api/v1/admin/logistics/route-rules/simulate",
} as const;

function parameter(op: any, name: string) {
  return (op.parameters ?? []).find((entry: any) => entry.name === name);
}
function requestRef(op: any) {
  return op.requestBody?.content?.["application/json"]?.schema?.$ref;
}
function assertAdmin(op: any) {
  assert.deepEqual(op.security, security);
  assert.match(String(op.description).toLowerCase(), /admin/);
}
function assertMutation(op: any) {
  assertAdmin(op);
  assert.equal(parameter(op, "Idempotency-Key")?.required, true);
  assert.ok(parameter(op, "X-CSRF-Token"), "cookie mutation must document CSRF");
}

test("production OpenAPI exposes the 13-path Logistics L1 authority on a 104-path surface", () => {
  assert.equal(Object.keys(document.paths).length, 104);
  for (const path of Object.values(paths)) assert.ok(document.paths[path], `missing ${path}`);

  for (const absent of [
    "/api/v1/admin/logistics/shipments",
    "/api/v1/admin/logistics/notifications",
    "/api/v1/admin/logistics/courier-webhooks",
    "/api/v1/cod/remittances",
    "/api/v1/returns",
    "/api/v1/pos",
  ]) assert.equal(document.paths[absent], undefined, `unexpected later-wave authority ${absent}`);
});

test("logistics reads and mutations are administrator-authenticated with explicit replay boundaries", () => {
  for (const [path, method] of [
    [paths.nodes, "get"], [paths.node, "get"], [paths.lanes, "get"], [paths.lane, "get"],
    [paths.workflows, "get"], [paths.workflow, "get"], [paths.rules, "get"], [paths.rule, "get"],
  ] as const) assertAdmin(document.paths[path][method]);

  for (const [path, method] of [
    [paths.nodes, "post"], [paths.node, "post"], [paths.lanes, "post"], [paths.lane, "post"],
    [paths.workflows, "post"], [paths.workflowDraft, "post"], [paths.workflowVersion, "post"],
    [paths.workflowPublish, "post"], [paths.rules, "post"], [paths.rule, "post"], [paths.ruleActivate, "post"],
  ] as const) assertMutation(document.paths[path][method]);

  const simulate = document.paths[paths.ruleSimulate].post;
  assertAdmin(simulate);
  assert.equal(parameter(simulate, "Idempotency-Key"), undefined);
  assert.ok(parameter(simulate, "X-CSRF-Token"), "simulation is cookie-authenticated POST and must document CSRF");
});

test("logistics OpenAPI uses strict shared contracts and describes configuration as non-runtime authority", () => {
  assert.equal(requestRef(document.paths[paths.nodes].post), "#/components/schemas/CreateLogisticsNodeRequest");
  assert.equal(requestRef(document.paths[paths.node].post), "#/components/schemas/UpdateLogisticsNodeRequest");
  assert.equal(requestRef(document.paths[paths.lanes].post), "#/components/schemas/CreateLogisticsLaneRequest");
  assert.equal(requestRef(document.paths[paths.lane].post), "#/components/schemas/UpdateLogisticsLaneRequest");
  assert.equal(requestRef(document.paths[paths.workflows].post), "#/components/schemas/CreateDeliveryWorkflowRequest");
  assert.equal(requestRef(document.paths[paths.workflowVersion].post), "#/components/schemas/SaveDeliveryWorkflowDraftRequest");
  assert.equal(requestRef(document.paths[paths.workflowPublish].post), "#/components/schemas/PublishDeliveryWorkflowRequest");
  assert.equal(requestRef(document.paths[paths.rules].post), "#/components/schemas/CreateDeliveryRouteRuleRequest");
  assert.equal(requestRef(document.paths[paths.rule].post), "#/components/schemas/UpdateDeliveryRouteRuleRequest");
  assert.equal(requestRef(document.paths[paths.ruleActivate].post), "#/components/schemas/ActivateDeliveryRouteRuleRequest");
  assert.equal(requestRef(document.paths[paths.ruleSimulate].post), "#/components/schemas/RouteSimulationRequest");

  const logisticsText = JSON.stringify(Object.fromEntries(Object.entries(document.paths).filter(([path]) => path.includes("/admin/logistics")))).toLowerCase();
  assert.match(logisticsText, /configuration/);
  assert.match(logisticsText, /does not prove|does not record|does not move/);
  for (const forbidden of ["cashcollectedat", "remittedat", "stockdepletion", "providerwebhook", "gpslatitude"])
    assert.equal(logisticsText.includes(forbidden), false, `forbidden L1 runtime authority ${forbidden}`);
});
