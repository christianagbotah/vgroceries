import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createDeliveryWorkflowRequestSchema,
  deliveryWorkflowVersionViewSchema,
  deliveryWorkflowViewSchema,
  publishDeliveryWorkflowRequestSchema,
  saveDeliveryWorkflowDraftRequestSchema,
  type DeliveryWorkflowVersionView,
  type DeliveryWorkflowView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash } from "./logistics.values";

type Tx = Prisma.TransactionClient;
type VersionWithStages = Prisma.DeliveryWorkflowVersionGetPayload<{ include: { stages: true } }>;
type TemplateWithVersions = Prisma.DeliveryWorkflowTemplateGetPayload<{ include: { versions: { include: { stages: true } } } }>;
type CreateInput = { name: string; description?: string | null; active?: boolean };
type StageInput = {
  stageKey: string; eventKind: string; customerTitleTemplate: string; customerDetailTemplate?: string | null;
  adminLabel: string; adminHelpText?: string | null; customerVisible?: boolean; showPlannedWhenPending?: boolean;
  slaMinutes?: number | null; sortOrder: number; displayGroup?: string | null; exceptionSeverity?: "info"|"warning"|"critical";
  notificationsAllowed?: boolean;
};
type SaveInput = { expectedRevision: number; defaultSlaMinutes?: number | null; stages: StageInput[] };
type PublishInput = { versionId: string; expectedRevision: number };

function conflict(message: string): never { throw new ApiProblem(409, "CONFLICT", message); }
function invalid(message: string, details?: unknown): never { throw new ApiProblem(400, "VALIDATION_FAILED", message, details); }

@Injectable()
export class LogisticsWorkflowService {
  constructor(private readonly db: Database) {}

  private async advisory(tx: Tx, actorId: string, operation: string, key: string) {
    const lockKey = JSON.stringify([actorId, operation, key]);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private parse<T>(schema: { safeParse(value: unknown): any }, value: unknown, message: string): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) invalid(message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }

  private stageView(stage: VersionWithStages["stages"][number]) {
    return {
      id: stage.id,
      stageKey: stage.stageKey,
      eventKind: stage.eventKind,
      customerTitleTemplate: stage.customerTitleTemplate,
      customerDetailTemplate: stage.customerDetailTemplate,
      adminLabel: stage.adminLabel,
      adminHelpText: stage.adminHelpText,
      customerVisible: stage.customerVisible,
      showPlannedWhenPending: stage.showPlannedWhenPending,
      slaMinutes: stage.slaMinutes,
      sortOrder: stage.sortOrder,
      displayGroup: stage.displayGroup,
      exceptionSeverity: stage.exceptionSeverity,
      notificationsAllowed: stage.notificationsAllowed,
    };
  }

  private versionView(version: VersionWithStages): DeliveryWorkflowVersionView {
    return deliveryWorkflowVersionViewSchema.parse({
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      status: version.status,
      defaultSlaMinutes: version.defaultSlaMinutes,
      revision: version.revision,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
      publishedBy: version.publishedBy,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      stages: [...version.stages].sort((a,b) => a.sortOrder - b.sortOrder).map((stage) => this.stageView(stage)),
    });
  }

  private templateView(template: TemplateWithVersions): DeliveryWorkflowView {
    return deliveryWorkflowViewSchema.parse({
      id: template.id,
      name: template.name,
      description: template.description,
      active: template.active,
      currentPublishedVersionId: template.currentPublishedVersionId,
      versions: [...template.versions].sort((a,b) => a.versionNumber - b.versionNumber).map((version) => this.versionView(version)),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    });
  }

  private parseTemplateReplay(outcome: Prisma.JsonValue): DeliveryWorkflowView {
    const parsed = deliveryWorkflowViewSchema.safeParse(outcome);
    if (!parsed.success) conflict("Workflow replay state is incomplete.");
    return parsed.data;
  }
  private parseVersionReplay(outcome: Prisma.JsonValue): DeliveryWorkflowVersionView {
    const parsed = deliveryWorkflowVersionViewSchema.safeParse(outcome);
    if (!parsed.success) conflict("Workflow version replay state is incomplete.");
    return parsed.data;
  }

  private async loadTemplate(tx: Tx | Database, templateId: string): Promise<TemplateWithVersions> {
    const template = await tx.deliveryWorkflowTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { include: { stages: true }, orderBy: { versionNumber: "asc" } } },
    });
    if (!template) throw new ApiProblem(404, "NOT_FOUND", "Delivery workflow not found.");
    return template;
  }

  async listTemplates(): Promise<DeliveryWorkflowView[]> {
    const templates = await this.db.deliveryWorkflowTemplate.findMany({
      include: { versions: { include: { stages: true }, orderBy: { versionNumber: "asc" } } },
      orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      take: 100,
    });
    return templates.map((template) => this.templateView(template));
  }

  async getTemplate(templateId: string): Promise<DeliveryWorkflowView> {
    return this.templateView(await this.loadTemplate(this.db, templateId));
  }

  private validatePresentation(stages: StageInput[]) {
    const keys = new Set<string>();
    const orders = new Set<number>();
    for (const stage of stages) {
      if (keys.has(stage.stageKey)) invalid("Workflow stage keys must be unique.");
      if (orders.has(stage.sortOrder)) invalid("Workflow stage sort order must be unique.");
      keys.add(stage.stageKey); orders.add(stage.sortOrder);
      const visibleText = `${stage.customerTitleTemplate} ${stage.customerDetailTemplate ?? ""}`.trim().toLowerCase();
      if (/\bpaid\b|payment\s+received|cash\s+remitted|\brefunded\b|refund\s+(?:paid|complete)|cash\s+collected/.test(visibleText))
        invalid("Workflow presentation cannot claim payment, refund, COD collection or remittance truth.");
      if (stage.eventKind !== "delivered" && (/\bdelivered\b|delivery\s+complete/.test(visibleText)))
        invalid("Only the canonical delivered event may use delivery-complete wording.");
      if (stage.eventKind === "custom_checkpoint" && /\bpayment\b|\bcash\b|\brefund\b|\bdelivered\b|delivery\s+complete/.test(visibleText))
        invalid("Custom checkpoints are informational and cannot claim financial or delivery authority.");
    }
  }

  private validatePublication(version: VersionWithStages) {
    const stages = [...version.stages].sort((a,b) => a.sortOrder - b.sortOrder);
    if (!stages.length) throw new ApiProblem(422, "RULE_VIOLATION", "A workflow needs at least one stage before publication.");
    if (stages[0]?.eventKind !== "order_placed") throw new ApiProblem(422, "RULE_VIOLATION", "Published workflows must start with order_placed.");
    const completion = stages.filter((stage) => ["delivered", "customer_collected"].includes(stage.eventKind));
    if (completion.length !== 1) throw new ApiProblem(422, "RULE_VIOLATION", "Published workflows require exactly one protected completion stage.");
    if (stages.at(-1)?.id !== completion[0]?.id) throw new ApiProblem(422, "RULE_VIOLATION", "The protected completion stage must be last.");
  }

  async createTemplate(actorId: string, idempotencyKey: string, input: CreateInput, requestId: string): Promise<DeliveryWorkflowView> {
    const parsed = this.parse<any>(createDeliveryWorkflowRequestSchema, input, "Workflow template body is invalid.");
    const normalized = { name: parsed.name.trim().replace(/\s+/g, " "), description: parsed.description?.trim().replace(/\s+/g, " ") ?? "", active: parsed.active };
    const operation = "logistics.workflow.create";
    const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another workflow command."); return this.parseTemplateReplay(replay.outcome); }
      const template = await tx.deliveryWorkflowTemplate.create({ data: { ...normalized, versions: { create: { versionNumber: 1, status: "draft", revision: 1, createdBy: actorId } } } });
      const outcome = this.templateView(await this.loadTemplate(tx, template.id));
      await tx.auditEvent.create({ data: { actorId, action: "logistics.workflow.created", entityId: template.id, requestId, details: { name: template.name } } });
      await tx.outboxEvent.create({ data: { type: "logistics.workflow.created", aggregateId: template.id, payload: { templateId: template.id, versionNumber: 1 } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async createDraft(templateId: string, actorId: string, idempotencyKey: string, requestId: string): Promise<DeliveryWorkflowVersionView> {
    const operation = `logistics.workflow.draft:${templateId}`;
    const requestHash = logisticsCommandHash({ templateId });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another workflow command."); return this.parseVersionReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowTemplate" WHERE id=${templateId} FOR UPDATE`;
      const template = await tx.deliveryWorkflowTemplate.findUnique({ where: { id: templateId } });
      if (!template) throw new ApiProblem(404, "NOT_FOUND", "Delivery workflow not found.");
      if (await tx.deliveryWorkflowVersion.findFirst({ where: { templateId, status: "draft" } })) conflict("This workflow already has an editable draft.");
      if (!template.currentPublishedVersionId) conflict("Publish the initial workflow draft before cloning another version.");
      const published = await tx.deliveryWorkflowVersion.findUnique({ where: { id: template.currentPublishedVersionId }, include: { stages: true } });
      if (!published || published.templateId !== templateId || published.status !== "published") conflict("Current published workflow version is inconsistent.");
      const latest = await tx.deliveryWorkflowVersion.findFirst({ where: { templateId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      const created = await tx.deliveryWorkflowVersion.create({
        data: {
          templateId, versionNumber: (latest?.versionNumber ?? 0) + 1, status: "draft", revision: 1,
          defaultSlaMinutes: published.defaultSlaMinutes, createdBy: actorId,
          stages: { create: published.stages.map((stage) => ({
            stageKey: stage.stageKey, eventKind: stage.eventKind, customerTitleTemplate: stage.customerTitleTemplate,
            customerDetailTemplate: stage.customerDetailTemplate, adminLabel: stage.adminLabel, adminHelpText: stage.adminHelpText,
            customerVisible: stage.customerVisible, showPlannedWhenPending: stage.showPlannedWhenPending,
            slaMinutes: stage.slaMinutes, sortOrder: stage.sortOrder, displayGroup: stage.displayGroup,
            exceptionSeverity: stage.exceptionSeverity, notificationsAllowed: stage.notificationsAllowed,
          })) },
        }, include: { stages: true },
      });
      const outcome = this.versionView(created);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.workflow.draft_created", entityId: created.id, requestId, details: { templateId, versionNumber: created.versionNumber } } });
      await tx.outboxEvent.create({ data: { type: "logistics.workflow.draft_created", aggregateId: templateId, payload: { templateId, versionId: created.id, versionNumber: created.versionNumber } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async saveDraft(templateId: string, versionId: string, actorId: string, idempotencyKey: string, input: SaveInput, requestId: string): Promise<DeliveryWorkflowVersionView> {
    const parsed = this.parse<any>(saveDeliveryWorkflowDraftRequestSchema, input, "Workflow draft body is invalid.");
    this.validatePresentation(parsed.stages);
    const operation = `logistics.workflow.save:${versionId}`;
    const requestHash = logisticsCommandHash(parsed);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another workflow command."); return this.parseVersionReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowVersion" WHERE id=${versionId} FOR UPDATE`;
      const current = await tx.deliveryWorkflowVersion.findUnique({ where: { id: versionId } });
      if (!current || current.templateId !== templateId) throw new ApiProblem(404, "NOT_FOUND", "Workflow draft not found.");
      if (current.status !== "draft") conflict("Published or retired workflow versions cannot be edited.");
      if (current.revision !== parsed.expectedRevision) conflict("This workflow changed elsewhere. Reload before saving again.");
      await tx.workflowStageDefinition.deleteMany({ where: { workflowVersionId: versionId } });
      if (parsed.stages.length) await tx.workflowStageDefinition.createMany({ data: parsed.stages.map((stage: any) => ({ ...stage, id: undefined, workflowVersionId: versionId })) });
      await tx.deliveryWorkflowVersion.update({ where: { id: versionId }, data: { defaultSlaMinutes: parsed.defaultSlaMinutes ?? null, revision: { increment: 1 } } });
      const saved = await tx.deliveryWorkflowVersion.findUniqueOrThrow({ where: { id: versionId }, include: { stages: true } });
      const outcome = this.versionView(saved);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.workflow.draft_saved", entityId: versionId, requestId, details: { templateId, versionNumber: saved.versionNumber, revision: saved.revision } } });
      await tx.outboxEvent.create({ data: { type: "logistics.workflow.draft_saved", aggregateId: templateId, payload: { templateId, versionId, versionNumber: saved.versionNumber, revision: saved.revision } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async publish(templateId: string, actorId: string, idempotencyKey: string, input: PublishInput, requestId: string): Promise<DeliveryWorkflowView> {
    const parsed = this.parse<any>(publishDeliveryWorkflowRequestSchema, input, "Workflow publication body is invalid.");
    const operation = `logistics.workflow.publish:${templateId}`;
    const requestHash = logisticsCommandHash(parsed);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another workflow command."); return this.parseTemplateReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowTemplate" WHERE id=${templateId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowVersion" WHERE id=${parsed.versionId} FOR UPDATE`;
      const version = await tx.deliveryWorkflowVersion.findUnique({ where: { id: parsed.versionId }, include: { stages: true } });
      if (!version || version.templateId !== templateId) throw new ApiProblem(404, "NOT_FOUND", "Workflow draft not found.");
      if (version.status !== "draft") conflict("Only a draft workflow version can be published.");
      if (version.revision !== parsed.expectedRevision) conflict("This workflow changed elsewhere. Reload before publishing.");
      this.validatePublication(version);
      const now = new Date();
      await tx.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published", publishedBy: actorId, publishedAt: now } });
      await tx.deliveryWorkflowTemplate.update({ where: { id: templateId }, data: { currentPublishedVersionId: version.id } });
      const outcome = this.templateView(await this.loadTemplate(tx, templateId));
      await tx.auditEvent.create({ data: { actorId, action: "logistics.workflow.published", entityId: version.id, requestId, details: { templateId, versionNumber: version.versionNumber } } });
      await tx.outboxEvent.create({ data: { type: "logistics.workflow.published", aggregateId: templateId, payload: { templateId, versionId: version.id, versionNumber: version.versionNumber } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async retire(templateId: string, versionId: string, actorId: string, idempotencyKey: string, requestId: string): Promise<DeliveryWorkflowVersionView> {
    const operation = `logistics.workflow.retire:${versionId}`;
    const requestHash = logisticsCommandHash({ templateId, versionId });
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key already belongs to another workflow command."); return this.parseVersionReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowTemplate" WHERE id=${templateId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowVersion" WHERE id=${versionId} FOR UPDATE`;
      const template = await tx.deliveryWorkflowTemplate.findUnique({ where: { id: templateId } });
      const version = await tx.deliveryWorkflowVersion.findUnique({ where: { id: versionId } });
      if (!template || !version || version.templateId !== templateId) throw new ApiProblem(404, "NOT_FOUND", "Workflow version not found.");
      if (version.status !== "published") conflict("Only a published workflow version can be retired.");
      if (template.currentPublishedVersionId === versionId) conflict("Publish a replacement before retiring the current workflow version.");
      await tx.deliveryWorkflowVersion.update({ where: { id: versionId }, data: { status: "retired" } });
      const retired = await tx.deliveryWorkflowVersion.findUniqueOrThrow({ where: { id: versionId }, include: { stages: true } });
      const outcome = this.versionView(retired);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.workflow.retired", entityId: versionId, requestId, details: { templateId, versionNumber: version.versionNumber } } });
      await tx.outboxEvent.create({ data: { type: "logistics.workflow.retired", aggregateId: templateId, payload: { templateId, versionId, versionNumber: version.versionNumber } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }
}
