/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { requestSchemas } from "../packages/contracts/src/validation";
import { invalidatesTags, readTags } from "../src/services/operation-registry";
import { roleCan } from "../src/lib/perms";
import { MockServiceAdapter } from "../src/services/adapters/mock";

const endpoints = {
  "admin.logistics.nodes": ["GET", "/admin/logistics/nodes"],
  "admin.logistics.node": ["GET", "/admin/logistics/nodes/{nodeId}"],
  "admin.logistics.node.create": ["POST", "/admin/logistics/nodes"],
  "admin.logistics.node.update": ["POST", "/admin/logistics/nodes/{nodeId}"],
  "admin.logistics.lanes": ["GET", "/admin/logistics/lanes"],
  "admin.logistics.lane": ["GET", "/admin/logistics/lanes/{laneId}"],
  "admin.logistics.lane.create": ["POST", "/admin/logistics/lanes"],
  "admin.logistics.lane.update": ["POST", "/admin/logistics/lanes/{laneId}"],
  "admin.logistics.workflows": ["GET", "/admin/logistics/workflows"],
  "admin.logistics.workflow": ["GET", "/admin/logistics/workflows/{templateId}"],
  "admin.logistics.workflow.create": ["POST", "/admin/logistics/workflows"],
  "admin.logistics.workflow.draft": ["POST", "/admin/logistics/workflows/{templateId}/drafts"],
  "admin.logistics.workflow.save": ["POST", "/admin/logistics/workflows/{templateId}/versions/{versionId}"],
  "admin.logistics.workflow.publish": ["POST", "/admin/logistics/workflows/{templateId}/publish"],
  "admin.logistics.route-rules": ["GET", "/admin/logistics/route-rules"],
  "admin.logistics.route-rule": ["GET", "/admin/logistics/route-rules/{ruleId}"],
  "admin.logistics.route-rule.create": ["POST", "/admin/logistics/route-rules"],
  "admin.logistics.route-rule.update": ["POST", "/admin/logistics/route-rules/{ruleId}"],
  "admin.logistics.route-rule.activate": ["POST", "/admin/logistics/route-rules/{ruleId}/activate"],
  "admin.logistics.route-rule.simulate": ["POST", "/admin/logistics/route-rules/simulate"],
} as const;

const mutations = Object.keys(endpoints).filter((key) => endpoints[key as keyof typeof endpoints][0] === "POST" && key !== "admin.logistics.route-rule.simulate");
const reads = Object.keys(endpoints).filter((key) => endpoints[key as keyof typeof endpoints][0] === "GET");

describe("Logistics L1 browser contract", () => {
  test("all method-level operations map one-for-one to the 13 production path keys", () => {
    for (const [op, [method, path]] of Object.entries(endpoints)) expect(restEndpoints[op]).toMatchObject({ method, path });
    expect(new Set(Object.values(endpoints).map(([, path]) => path)).size).toBe(13);
  });

  test("all Logistics mutation and simulation bodies have shared validation schemas", () => {
    for (const op of [...mutations, "admin.logistics.route-rule.simulate"]) expect(requestSchemas[op]).toBeDefined();
  });

  test("configuration cache invalidation remains isolated from runtime authorities", () => {
    for (const op of reads) expect(readTags(op)).toContain("logistics" as any);
    for (const op of mutations) {
      expect(invalidatesTags(op)).toEqual(expect.arrayContaining(["logistics", "config"] as any));
      for (const forbidden of ["stock", "orders", "payments", "returns", "delivery"]) expect(invalidatesTags(op)).not.toContain(forbidden as any);
    }
  });

  test("typed client exposes the complete Logistics configuration surface", () => {
    const source = readFileSync("src/services/client.ts", "utf8");
    for (const name of [
      "logisticsNodes", "logisticsNode", "logisticsNodeCreate", "logisticsNodeUpdate",
      "logisticsLanes", "logisticsLane", "logisticsLaneCreate", "logisticsLaneUpdate",
      "logisticsWorkflows", "logisticsWorkflow", "logisticsWorkflowCreate", "logisticsWorkflowDraft",
      "logisticsWorkflowSave", "logisticsWorkflowPublish", "logisticsRouteRules", "logisticsRouteRule",
      "logisticsRouteRuleCreate", "logisticsRouteRuleUpdate", "logisticsRouteRuleActivate", "logisticsRouteRuleSimulate",
    ]) expect(source).toContain(`${name}:`);
    for (const typeName of ["CreateLogisticsNodeRequest", "UpdateLogisticsNodeRequest", "CreateLogisticsLaneRequest", "UpdateLogisticsLaneRequest", "CreateDeliveryRouteRuleRequest", "UpdateDeliveryRouteRuleRequest"])
      expect(source).toContain(typeName);
  });

  test("logistics.manage is an owner-admin-only UX permission", () => {
    expect(roleCan("owner_admin", "logistics.manage" as any)).toBe(true);
    for (const role of ["operations_manager", "inventory_officer", "dispatcher", "finance_reviewer", "cashier", "picker_packer"] as const)
      expect(roleCan(role, "logistics.manage" as any)).toBe(false);
  });

  test("development mock seeds explicit demo logistics configuration and supports basic mutation parity", async () => {
    const mock = new MockServiceAdapter();
    const nodes = await mock.request<any[]>({ op: "admin.logistics.nodes" });
    expect(nodes.some((node) => node.kind === "head_office" && /demo/i.test(`${node.name} ${node.publicName}`))).toBe(true);
    const workflows = await mock.request<any[]>({ op: "admin.logistics.workflows" });
    expect(workflows.some((workflow) => /demo/i.test(workflow.name) && workflow.currentPublishedVersionId)).toBe(true);
    const rules = await mock.request<any[]>({ op: "admin.logistics.route-rules" });
    expect(rules.some((rule) => /demo/i.test(rule.name) && rule.active && rule.stops?.length === 1 && rule.legs?.length === 0)).toBe(true);

    const created = await mock.request<any>({ op: "admin.logistics.node.create", body: {
      code: "DEMO_KUMASI", name: "Kumasi Hub (demo)", publicName: "Kumasi Hub (demo)", kind: "hub", customerVisible: true, active: true,
    }, idempotencyKey: "demo-node-create-001" });
    expect(created.code).toBe("DEMO_KUMASI");
    const updated = await mock.request<any>({ op: "admin.logistics.node.update", query: { nodeId: created.id }, body: { publicName: "Kumasi Central Hub (demo)" }, idempotencyKey: "demo-node-update-001" });
    expect(updated.publicName).toBe("Kumasi Central Hub (demo)");
  });
});
