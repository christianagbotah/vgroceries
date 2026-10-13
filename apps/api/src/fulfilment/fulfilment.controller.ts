import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  fulfilmentConfirmRequestSchema,
  fulfilmentHandoverRequestSchema,
  fulfilmentListQuerySchema,
  fulfilmentPackRequestSchema,
  fulfilmentPickRequestSchema,
  fulfilmentStartPickingRequestSchema,
  replayKeySchema,
  type FulfilmentHandoverRequest,
  type FulfilmentListQuery,
  type FulfilmentPackRequest,
  type FulfilmentPickRequest,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { FulfilmentCommandService } from "./fulfilment-command.service";
import { FulfilmentQueryService } from "./fulfilment-query.service";
import type { FulfilmentCommandContext } from "./fulfilment.values";

type ParseIssue = { path: PropertyKey[]; message: string };
type Parser<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ParseIssue[] } };
};

@Controller("admin/fulfilment")
@UseGuards(AccessGuard)
export class FulfilmentController {
  constructor(
    private readonly commands: FulfilmentCommandService,
    private readonly queries: FulfilmentQueryService,
  ) {}

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  private parse<T>(schema: Parser<T>, input: unknown, message: string): T {
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

  private context(req: AuthRequest): FulfilmentCommandContext {
    const idempotencyKey = this.parse(
      replayKeySchema,
      req.get("idempotency-key"),
      "A valid Idempotency-Key header is required.",
    );
    return {
      actorId: req.actor.id,
      requestId: req.requestId,
      idempotencyKey,
    };
  }

  @Get()
  async list(@Req() req: AuthRequest, @Query() query: unknown) {
    this.requireAdmin(req);
    const input = this.parse<FulfilmentListQuery>(
      fulfilmentListQuerySchema,
      query,
      "Fulfilment query is invalid.",
    );
    return { ok: true, data: await this.queries.list(input) };
  }

  @Get("orders/:orderId")
  async detail(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    this.requireAdmin(req);
    return { ok: true, data: await this.queries.detail(orderId) };
  }

  @Post("orders/:orderId/confirm")
  @HttpCode(200)
  async confirm(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    this.requireAdmin(req);
    this.parse(fulfilmentConfirmRequestSchema, body, "Fulfilment confirmation body is invalid.");
    return { ok: true, data: await this.commands.confirm(orderId, this.context(req)) };
  }

  @Post("orders/:orderId/start-picking")
  @HttpCode(200)
  async startPicking(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    this.requireAdmin(req);
    this.parse(fulfilmentStartPickingRequestSchema, body, "Start-picking body is invalid.");
    return { ok: true, data: await this.commands.startPicking(orderId, this.context(req)) };
  }

  @Put("orders/:orderId/picks/:reservationId")
  @HttpCode(200)
  async recordPick(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Param("reservationId") reservationId: string,
    @Body() body: unknown,
  ) {
    this.requireAdmin(req);
    const input = this.parse<FulfilmentPickRequest>(
      fulfilmentPickRequestSchema,
      body,
      "Pick body is invalid.",
    );
    return {
      ok: true,
      data: await this.commands.recordPick(orderId, reservationId, input, this.context(req)),
    };
  }

  @Post("orders/:orderId/pack")
  @HttpCode(200)
  async pack(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    this.requireAdmin(req);
    const input = this.parse<FulfilmentPackRequest>(
      fulfilmentPackRequestSchema,
      body,
      "Pack body is invalid.",
    );
    return { ok: true, data: await this.commands.pack(orderId, input, this.context(req)) };
  }

  @Post("orders/:orderId/handover")
  @HttpCode(200)
  async handover(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    this.requireAdmin(req);
    const input = this.parse<FulfilmentHandoverRequest>(
      fulfilmentHandoverRequestSchema,
      body,
      "Handover body is invalid.",
    );
    return { ok: true, data: await this.commands.handover(orderId, input, this.context(req)) };
  }
}
