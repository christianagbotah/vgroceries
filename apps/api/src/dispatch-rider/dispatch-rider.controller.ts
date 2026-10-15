import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { replayKeySchema } from "@variety/contracts";
import { z } from "zod";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import {
  DispatchRiderService,
  type AssignRiderInput,
  type DispatchCommandContext,
  type RiderActionInput,
} from "./dispatch-rider.service";

type ParseIssue = { path: PropertyKey[]; message: string };
type Parser<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ParseIssue[] } };
};

const assignRiderSchema = z.object({
  orderId: z.string().trim().min(1).max(160),
  riderId: z.string().trim().min(1).max(160),
}).strict();

const riderActionSchema = z.object({
  action: z.enum(["accept", "pickup", "out", "deliver", "fail", "note"]),
  proofMethod: z.enum(["pin", "signature", "photo_note"]).optional(),
  proofDetail: z.string().trim().min(1).max(500).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "deliver" && (!value.proofMethod || !value.proofDetail)) {
    ctx.addIssue({ code: "custom", message: "Delivery proof is required." });
  }
  if (value.action === "fail" && !value.reason) {
    ctx.addIssue({ code: "custom", message: "A failure reason is required." });
  }
  if (value.action === "note" && !value.note) {
    ctx.addIssue({ code: "custom", message: "A note is required." });
  }
});

abstract class AuthorityController {
  protected parse<T>(schema: Parser<T>, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        message,
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      );
    }
    return parsed.data;
  }

  protected context(req: AuthRequest): DispatchCommandContext {
    const key = this.parse(
      replayKeySchema,
      req.get("idempotency-key"),
      "A valid Idempotency-Key header is required.",
    );
    return { actorId: req.actor.id, requestId: req.requestId, idempotencyKey: key };
  }
}

@ApiExcludeController()
@Controller("dispatch")
@UseGuards(AccessGuard)
export class DispatchController extends AuthorityController {
  constructor(private readonly authority: DispatchRiderService) { super(); }

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get("queue")
  async queue(@Req() req: AuthRequest) {
    this.requireAdmin(req);
    return { ok: true, data: await this.authority.queue() };
  }

  @Post("assign")
  @HttpCode(200)
  async assign(@Req() req: AuthRequest, @Body() body: unknown) {
    this.requireAdmin(req);
    const input = this.parse<AssignRiderInput>(
      assignRiderSchema,
      body,
      "Dispatch assignment body is invalid.",
    );
    return { ok: true, data: await this.authority.assign(input, this.context(req)) };
  }
}

@ApiExcludeController()
@Controller("rider")
@UseGuards(AccessGuard)
export class RiderController extends AuthorityController {
  constructor(private readonly authority: DispatchRiderService) { super(); }

  private requireRider(req: AuthRequest) {
    if (req.actor.role !== "rider")
      throw new ApiProblem(403, "FORBIDDEN", "Rider access required.");
  }

  @Get("jobs")
  async jobs(@Req() req: AuthRequest) {
    this.requireRider(req);
    return { ok: true, data: await this.authority.riderJobs(req.actor.id) };
  }

  @Get("jobs/:jobId")
  async job(@Req() req: AuthRequest, @Param("jobId") jobId: string) {
    this.requireRider(req);
    return { ok: true, data: await this.authority.riderJob(req.actor.id, jobId) };
  }

  @Post("jobs/:jobId/actions")
  @HttpCode(200)
  async action(
    @Req() req: AuthRequest,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ) {
    this.requireRider(req);
    const input = this.parse<RiderActionInput>(
      riderActionSchema,
      body,
      "Rider action body is invalid.",
    );
    return {
      ok: true,
      data: await this.authority.riderAction(req.actor.id, jobId, input, this.context(req)),
    };
  }
}
