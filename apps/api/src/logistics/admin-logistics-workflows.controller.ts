import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { createDeliveryWorkflowRequestSchema, publishDeliveryWorkflowRequestSchema, replayKeySchema, saveDeliveryWorkflowDraftRequestSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { LogisticsWorkflowService } from "./logistics-workflow.service";

@ApiExcludeController()
@Controller("admin/logistics/workflows")
@UseGuards(AccessGuard)
export class AdminLogisticsWorkflowsController {
  constructor(private readonly workflows: LogisticsWorkflowService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T { const parsed = schema.safeParse(input); if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message }))); return parsed.data as T; }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }

  @Get()
  async list(@Req() req: AuthRequest) { this.requireAdmin(req); return { ok: true, data: await this.workflows.listTemplates() }; }
  @Get(":templateId")
  async detail(@Req() req: AuthRequest, @Param("templateId") templateId: string) { this.requireAdmin(req); return { ok: true, data: await this.workflows.getTemplate(templateId) }; }
  @Post()
  @HttpCode(200)
  async create(@Req() req: AuthRequest, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(createDeliveryWorkflowRequestSchema, body, "Workflow template body is invalid."); return { ok: true, data: await this.workflows.createTemplate(req.actor.id, this.key(req), input, req.requestId) }; }
  @Post(":templateId/drafts")
  @HttpCode(200)
  async draft(@Req() req: AuthRequest, @Param("templateId") templateId: string) { this.requireAdmin(req); return { ok: true, data: await this.workflows.createDraft(templateId, req.actor.id, this.key(req), req.requestId) }; }
  @Post(":templateId/versions/:versionId")
  @HttpCode(200)
  async save(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Param("versionId") versionId: string, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(saveDeliveryWorkflowDraftRequestSchema, body, "Workflow draft body is invalid."); return { ok: true, data: await this.workflows.saveDraft(templateId, versionId, req.actor.id, this.key(req), input, req.requestId) }; }
  @Post(":templateId/publish")
  @HttpCode(200)
  async publish(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(publishDeliveryWorkflowRequestSchema, body, "Workflow publication body is invalid."); return { ok: true, data: await this.workflows.publish(templateId, req.actor.id, this.key(req), input, req.requestId) }; }
}
