import type { Database } from "../src/database/database";
import { LogisticsNodeService } from "../src/logistics/logistics-node.service";
import { LogisticsLaneService } from "../src/logistics/logistics-lane.service";
import { LogisticsWorkflowService } from "../src/logistics/logistics-workflow.service";

export function routeServices(db: Database) {
  return { nodes: new LogisticsNodeService(db), lanes: new LogisticsLaneService(db), workflows: new LogisticsWorkflowService(db) };
}

export async function routeNode(nodes: LogisticsNodeService, code: string, kind: any = "hub", active = true) {
  return nodes.create("admin-commerce", `node-${code}`, { code, name: code.replaceAll("_", " "), publicName: code.replaceAll("_", " "), kind, customerVisible: true, active }, `req-${code}`);
}

export async function publishedDoorstepWorkflow(workflows: LogisticsWorkflowService, key: string) {
  const template = await workflows.createTemplate("admin-commerce", `wf-create-${key}`, { name: `Workflow ${key}`, active: true }, `req-create-${key}`);
  const draft = template.versions[0]!;
  const saved = await workflows.saveDraft(template.id, draft.id, "admin-commerce", `wf-save-${key}`, { expectedRevision: 1, stages: [
    { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
    { stageKey: "delivered", eventKind: "delivered", customerTitleTemplate: "Delivered", adminLabel: "Delivered", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
  ] as any }, `req-save-${key}`);
  const published = await workflows.publish(template.id, "admin-commerce", `wf-publish-${key}`, { versionId: draft.id, expectedRevision: saved.revision }, `req-publish-${key}`);
  return published.versions.find((version) => version.id === draft.id)!;
}
export async function publishedPickupWorkflow(workflows: LogisticsWorkflowService, key: string) {
  const template = await workflows.createTemplate("admin-commerce", `wf-pickup-create-${key}`, { name: `Pickup Workflow ${key}`, active: true }, `req-pickup-create-${key}`);
  const draft = template.versions[0]!;
  const saved = await workflows.saveDraft(template.id, draft.id, "admin-commerce", `wf-pickup-save-${key}`, { expectedRevision: 1, stages: [
    { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
    { stageKey: "collected", eventKind: "customer_collected", customerTitleTemplate: "Collected", adminLabel: "Collected", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
  ] as any }, `req-pickup-save-${key}`);
  const published = await workflows.publish(template.id, "admin-commerce", `wf-pickup-publish-${key}`, { versionId: draft.id, expectedRevision: saved.revision }, `req-pickup-publish-${key}`);
  return published.versions.find((version) => version.id === draft.id)!;
}
