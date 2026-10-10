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
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import { AuthRequest } from "../identity/identity.service";
import { InventoryService } from "./inventory.service";
import { AllocationService } from "./allocation.service";

@ApiTags("inventory")
@ApiCookieAuth()
@Controller("inventory")
@UseGuards(AccessGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
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
  providers: [InventoryService, AllocationService],
  exports: [AllocationService],
})
export class InventoryModule {}
