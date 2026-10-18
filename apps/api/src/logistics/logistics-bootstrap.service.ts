import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const SOURCE_CODE = "VG_DIRECT_SOURCE";
const SOURCE_NAME = "Variety Groceries fulfilment source";
const WORKFLOW_NAME = "VG Direct doorstep default";
const ROUTE_PREFIX = "VG Direct doorstep · ";
const BOOTSTRAP_LOCK = "variety:logistics:bootstrap:direct:v1";

const DEFAULT_STAGES = [
  {
    stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed",
    adminLabel: "Order placed", customerVisible: true, showPlannedWhenPending: false,
    sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false,
  },
  {
    stageKey: "packed", eventKind: "packed", customerTitleTemplate: "Packed",
    customerDetailTemplate: "Your order has been packed and is awaiting its next delivery step.",
    adminLabel: "Packed", customerVisible: true, showPlannedWhenPending: true,
    sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: true,
  },
  {
    stageKey: "delivered", eventKind: "delivered", customerTitleTemplate: "Delivered",
    adminLabel: "Delivered", customerVisible: true, showPlannedWhenPending: true,
    sortOrder: 3, exceptionSeverity: "info", notificationsAllowed: true,
  },
] as const;

type Tx = Prisma.TransactionClient;
export type DirectLogisticsBootstrapResult = {
  sourceNodeId: string;
  sourceNodeCode: string;
  workflowTemplateId: string;
  workflowVersionId: string;
  activeZoneCount: number;
  routeRuleCount: number;
  routeRuleIds: string[];
};

function conflict(message: string): never {
  throw new ApiProblem(409, "CONFLICT", message);
}

@Injectable()
export class LogisticsBootstrapService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async ensureDirectDefaults(actorId: string, requestId: string): Promise<DirectLogisticsBootstrapResult> {
    if (!this.config.commerce)
      throw new ApiProblem(422, "RULE_VIOLATION", "Commerce configuration is required before logistics defaults can be bootstrapped.");
    const commerceLocationId = this.config.commerce.locationId;

    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${BOOTSTRAP_LOCK}, 0))`;
      const location = await tx.location.findUnique({ where: { id: commerceLocationId } });
      if (!location || !location.active)
        throw new ApiProblem(422, "RULE_VIOLATION", "Configured commerce location must exist and be active before logistics bootstrap.");

      const zones = await tx.deliveryZone.findMany({ where: { active: true }, orderBy: { id: "asc" } });
      const source = await this.ensureSource(tx, commerceLocationId, actorId, requestId);
      const workflow = await this.ensureWorkflow(tx, actorId, requestId);
      const routeRuleIds: string[] = [];
      for (const zone of zones) {
        routeRuleIds.push(await this.ensureRoute(tx, {
          zoneId: zone.id,
          zoneName: zone.name,
          sourceNodeId: source.id,
          workflowVersionId: workflow.versionId,
          actorId,
          requestId,
        }));
      }
      return {
        sourceNodeId: source.id,
        sourceNodeCode: source.code,
        workflowTemplateId: workflow.templateId,
        workflowVersionId: workflow.versionId,
        activeZoneCount: zones.length,
        routeRuleCount: routeRuleIds.length,
        routeRuleIds,
      };
    }, { timeout: 15_000 });
  }

  private async ensureSource(tx: Tx, inventoryLocationId: string, actorId: string, requestId: string) {
    const existing = await tx.logisticsNode.findUnique({ where: { code: SOURCE_CODE } });
    if (existing) {
      if (
        existing.name !== SOURCE_NAME || existing.publicName !== SOURCE_NAME || existing.kind !== "fulfilment_center" ||
        existing.inventoryLocationId !== inventoryLocationId || !existing.customerVisible || !existing.active || existing.parentNodeId !== null
      ) conflict(`${SOURCE_CODE} already exists with incompatible operator configuration; bootstrap will not overwrite it.`);
      return existing;
    }
    const node = await tx.logisticsNode.create({ data: {
      code: SOURCE_CODE, name: SOURCE_NAME, publicName: SOURCE_NAME, kind: "fulfilment_center",
      inventoryLocationId, customerVisible: true, active: true,
    } });
    await this.evidence(tx, actorId, requestId, "logistics.bootstrap.source_created", node.id, { code: SOURCE_CODE, inventoryLocationId });
    return node;
  }

  private async ensureWorkflow(tx: Tx, actorId: string, requestId: string): Promise<{ templateId: string; versionId: string }> {
    const existing = await tx.deliveryWorkflowTemplate.findMany({
      where: { name: WORKFLOW_NAME }, include: { versions: { include: { stages: true } } },
    });
    if (existing.length > 1) conflict(`${WORKFLOW_NAME} exists more than once; resolve operator configuration before bootstrap.`);
    if (existing.length === 1) {
      const template = existing[0]!;
      if (!template.active || !template.currentPublishedVersionId)
        conflict(`${WORKFLOW_NAME} exists but is not an active published default; bootstrap will not rewrite it.`);
      const version = template.versions.find((row) => row.id === template.currentPublishedVersionId);
      if (!version || version.status !== "published" || version.defaultSlaMinutes !== 240 || !this.defaultStagesMatch(version.stages))
        conflict(`${WORKFLOW_NAME} published content differs from the guarded default; bootstrap will not overwrite it.`);
      return { templateId: template.id, versionId: version.id };
    }

    const template = await tx.deliveryWorkflowTemplate.create({ data: {
      name: WORKFLOW_NAME,
      description: "Guarded direct-doorstep default for existing single-source delivery zones.",
      active: true,
    } });
    const version = await tx.deliveryWorkflowVersion.create({ data: {
      templateId: template.id, versionNumber: 1, status: "draft", defaultSlaMinutes: 240,
      revision: 1, createdBy: actorId,
      stages: { create: DEFAULT_STAGES.map((stage) => ({ ...stage })) },
    } });
    const now = new Date();
    await tx.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published", publishedBy: actorId, publishedAt: now } });
    await tx.deliveryWorkflowTemplate.update({ where: { id: template.id }, data: { currentPublishedVersionId: version.id } });
    await this.evidence(tx, actorId, requestId, "logistics.bootstrap.workflow_created", template.id, { workflowVersionId: version.id });
    return { templateId: template.id, versionId: version.id };
  }

  private defaultStagesMatch(stages: Array<{ stageKey: string; eventKind: string; customerTitleTemplate: string; customerDetailTemplate: string | null; adminLabel: string; customerVisible: boolean; showPlannedWhenPending: boolean; sortOrder: number; exceptionSeverity: string; notificationsAllowed: boolean }>) {
    if (stages.length !== DEFAULT_STAGES.length) return false;
    const ordered = [...stages].sort((a,b) => a.sortOrder - b.sortOrder);
    return DEFAULT_STAGES.every((expected, index) => {
      const actual = ordered[index];
      if (!actual) return false;
      return Object.entries(expected).every(([key, value]) => (actual as Record<string, unknown>)[key] === value);
    });
  }

  private async ensureRoute(tx: Tx, input: { zoneId: string; zoneName: string; sourceNodeId: string; workflowVersionId: string; actorId: string; requestId: string }) {
    const name = `${ROUTE_PREFIX}${input.zoneId}`;
    const existing = await tx.deliveryRouteRule.findMany({
      where: { name }, include: { stops: true, legs: true },
    });
    if (existing.length > 1) conflict(`${name} exists more than once; resolve operator configuration before bootstrap.`);
    if (existing.length === 1) {
      const rule = existing[0]!;
      if (
        !rule.active || rule.originNodeId !== input.sourceNodeId || rule.deliveryZoneId !== input.zoneId || rule.fulfilment !== "delivery" ||
        rule.destinationKind !== "doorstep" || rule.finalPickupNodeId !== null || rule.workflowVersionId !== input.workflowVersionId ||
        rule.priority !== 0 || rule.locality !== null || rule.serviceLevel !== null || rule.effectiveFrom !== null || rule.effectiveTo !== null ||
        rule.stops.length !== 1 || rule.stops[0]?.nodeId !== input.sourceNodeId || rule.stops[0]?.position !== 1 ||
        rule.stops[0]?.terminalRole !== "final_mile_dispatch" || rule.legs.length !== 0
      ) conflict(`${name} exists with incompatible operator configuration; bootstrap will not overwrite it.`);
      return rule.id;
    }
    const rule = await tx.deliveryRouteRule.create({ data: {
      name, originNodeId: input.sourceNodeId, deliveryZoneId: input.zoneId, fulfilment: "delivery",
      destinationKind: "doorstep", workflowVersionId: input.workflowVersionId, priority: 0,
      active: true, version: 1, createdBy: input.actorId,
      stops: { create: { position: 1, nodeId: input.sourceNodeId, terminalRole: "final_mile_dispatch" } },
    } });
    await this.evidence(tx, input.actorId, input.requestId, "logistics.bootstrap.route_created", rule.id, {
      zoneId: input.zoneId, zoneName: input.zoneName, workflowVersionId: input.workflowVersionId,
    });
    return rule.id;
  }

  private async evidence(tx: Tx, actorId: string, requestId: string, action: string, entityId: string, details: Prisma.InputJsonObject) {
    await tx.auditEvent.create({ data: { actorId, action, entityId, requestId, details } });
    await tx.outboxEvent.create({ data: { type: action, aggregateId: entityId, payload: details } });
  }
}
