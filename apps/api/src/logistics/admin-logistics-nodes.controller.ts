import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { createLogisticsNodeRequestSchema, logisticsNodeKindSchema, replayKeySchema, updateLogisticsNodeRequestSchema } from "@variety/contracts";
import { z } from "zod";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { LogisticsNodeService } from "./logistics-node.service";

const listSchema = z.object({ q: z.string().trim().max(120).optional(), kind: logisticsNodeKindSchema.optional(), active: z.enum(["true", "false"]).transform((v) => v === "true").optional() }).strict();

@ApiExcludeController()
@Controller("admin/logistics/nodes")
@UseGuards(AccessGuard)
export class AdminLogisticsNodesController {
  constructor(private readonly nodes: LogisticsNodeService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: unknown) { this.requireAdmin(req); return { ok: true, data: await this.nodes.list(this.parse<any>(listSchema, query, "Logistics node query is invalid.")) }; }
  @Get(":nodeId")
  async detail(@Req() req: AuthRequest, @Param("nodeId") nodeId: string) { this.requireAdmin(req); return { ok: true, data: await this.nodes.get(nodeId) }; }
  @Post()
  @HttpCode(200)
  async create(@Req() req: AuthRequest, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(createLogisticsNodeRequestSchema, body, "Logistics node body is invalid."); return { ok: true, data: await this.nodes.create(req.actor.id, this.key(req), input, req.requestId) }; }
  @Post(":nodeId")
  @HttpCode(200)
  async update(@Req() req: AuthRequest, @Param("nodeId") nodeId: string, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(updateLogisticsNodeRequestSchema, body, "Logistics node update is invalid."); return { ok: true, data: await this.nodes.update(req.actor.id, nodeId, this.key(req), input, req.requestId) }; }
}
