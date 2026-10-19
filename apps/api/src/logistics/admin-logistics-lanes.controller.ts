import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { createLogisticsLaneRequestSchema, logisticsLaneModeSchema, replayKeySchema, updateLogisticsLaneRequestSchema } from "@variety/contracts";
import { z } from "zod";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { LogisticsLaneService } from "./logistics-lane.service";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  mode: logisticsLaneModeSchema.optional(),
  originNodeId: z.string().trim().min(1).max(128).optional(),
  destinationNodeId: z.string().trim().min(1).max(128).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
}).strict();

@ApiExcludeController()
@Controller("admin/logistics/lanes")
@UseGuards(AccessGuard)
export class AdminLogisticsLanesController {
  constructor(private readonly lanes: LogisticsLaneService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: unknown) { this.requireAdmin(req); return { ok: true, data: await this.lanes.list(this.parse<any>(listSchema, query, "Logistics lane query is invalid.")) }; }
  @Get(":laneId")
  async detail(@Req() req: AuthRequest, @Param("laneId") laneId: string) { this.requireAdmin(req); return { ok: true, data: await this.lanes.get(laneId) }; }
  @Post()
  @HttpCode(200)
  async create(@Req() req: AuthRequest, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(createLogisticsLaneRequestSchema, body, "Logistics lane body is invalid."); return { ok: true, data: await this.lanes.create(req.actor.id, this.key(req), input, req.requestId) }; }
  @Post(":laneId")
  @HttpCode(200)
  async update(@Req() req: AuthRequest, @Param("laneId") laneId: string, @Body() body: unknown) { this.requireAdmin(req); const input = this.parse<any>(updateLogisticsLaneRequestSchema, body, "Logistics lane update is invalid."); return { ok: true, data: await this.lanes.update(req.actor.id, laneId, this.key(req), input, req.requestId) }; }
}
