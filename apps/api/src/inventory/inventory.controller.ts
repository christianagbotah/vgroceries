import {
  Body,
  Controller,
  Get,
  Headers,
  Module,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  catalogQuerySchema,
  stockReceiveRequestSchema,
  requestAdjustmentSchema, decideAdjustmentSchema,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { z } from "zod";
import { AccessGuard, Permission } from "../identity/access.guard";
import { AuthRequest } from "../identity/identity.service";
import { AllocationService } from "./allocation.service";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import { ClaimCoverageService } from "./claim-coverage.service";
import { InventoryService } from "./inventory.service";
import { StockDepletionService } from "./stock-depletion.service";

@ApiTags("inventory")
@ApiCookieAuth()
@Controller("inventory")
@UseGuards(AccessGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly adjustments: InventoryAdjustmentService,
  ) {}
  @Get("overview")
  @Permission("inventory.read")
  async overview(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = catalogQuerySchema.safeParse(query);
    const location = query.locationId;
    if (
      !parsed.success ||
      (location !== undefined &&
        (typeof location !== "string" || location.length > 128))
    )
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        "Invalid inventory query.",
      );
    return {
      ok: true,
      data: await this.inventory.overview(
        req,
        location as string | undefined,
        parsed.data.page,
        parsed.data.perPage,
      ),
    };
  }
  // Real stock corrections require separate inventory manager request and
  // administrator decision. Disabled until independent physical-count UAT.
  @Get("adjustments/lots")
  @Permission("inventory.read")
  async adjustmentLots(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const parsed = z.strictObject({
      locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
      q: z.string().trim().max(120).optional(),
    }).safeParse(query);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid stock lot lookup filters.");
    return {ok: true, data: await this.adjustments.lotOptions(req, parsed.data)};
  }

  @Get("adjustments")
  @Permission("inventory.read")
  async adjustmentList(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const parsed = z.strictObject({
      locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
    }).safeParse(query);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid adjustment location.");
    return { ok: true, data: await this.adjustments.list(req, parsed.data.locationId) };
  }

  @Post("adjustments/create")
  @Permission("inventory.adjust.request")
  @ApiHeader({ name: "Idempotency-Key", required: true,
    description: "Unique, retry-safe stock adjustment request key" })
  async adjustmentCreate(@Req() req: AuthRequest, @Body() raw: unknown,
    @Headers("idempotency-key") key?: string) {
    const parsed = requestAdjustmentSchema.safeParse(raw);
    if (!parsed.success || !key || !/^[A-Za-z0-9:_-]{8,128}$/.test(key))
      throw new ApiProblem(400, "VALIDATION_FAILED",
        "Valid lot, signed quantity, reason and Idempotency-Key required.");
    return { ok: true, data: await this.adjustments.request(req, parsed.data, key) };
  }

  @Post("adjustments/decide")
  @Permission("inventory.adjust.approve")
  async adjustmentDecide(@Req() req: AuthRequest, @Body() raw: unknown) {
    const parsed = decideAdjustmentSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid adjustment decision.");
    return { ok: true, data: await this.adjustments.decide(req, parsed.data) };
  }

  @Post("receive")
  @Permission("inventory.receive")
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "8–128 letters, digits, underscores, colons or hyphens",
  })
  @ApiHeader({
    name: "X-CSRF-Token",
    required: false,
    description: "Required for cookie authentication",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["lines"],
      properties: {
        lines: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            required: ["variantId", "quantity"],
            properties: {
              variantId: { type: "string" },
              quantity: { type: "string", pattern: "^\\d+(\\.\\d{1,3})?$" },
              location: { type: "string" },
              lotNumber: { type: "string" },
              expiryDate: { type: "string", format: "date" },
              unitCostMinor: { type: "integer", minimum: 0 },
            },
          },
        },
        note: { type: "string" },
        poRef: { type: "string" },
      },
    },
  })
  async receive(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
  ) {
    const parsed = stockReceiveRequestSchema.safeParse(body);
    if (!parsed.success || !key || !/^[A-Za-z0-9:_-]{8,128}$/.test(key))
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        "Valid receipt lines and Idempotency-Key are required.",
      );
    return {
      ok: true,
      data: await this.inventory.receive(req, parsed.data, key),
    };
  }
}
@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryAdjustmentService,
    AllocationService,
    ClaimCoverageService,
    StockDepletionService,
  ],
  exports: [AllocationService, ClaimCoverageService, StockDepletionService],
})
export class InventoryModule {}
