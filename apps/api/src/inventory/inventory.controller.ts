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
import { z } from "zod";
import {
  stockReceiveRequestSchema,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import { AuthRequest } from "../identity/identity.service";
import { AllocationService } from "./allocation.service";
import { ClaimCoverageService } from "./claim-coverage.service";
import { InventoryService } from "./inventory.service";
import { StockDepletionService } from "./stock-depletion.service";

const overviewQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  filter: z.enum(["all", "low", "zero", "reserved"]).default("all"),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(48),
}).strict();

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
    const parsed = overviewQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid inventory query.", parsed.error.issues);
    }
    return {
      ok: true,
      data: await this.inventory.overview(req, parsed.data),
    };
  }
  @Get("receipts")
  @Permission("inventory.read")
  async receipts(@Req() req: AuthRequest, @Query("locationId") locationId?: string) {
    if (locationId !== undefined && (typeof locationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(locationId))) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid receipt location.");
    }
    return { ok: true, data: await this.inventory.receipts(req, locationId) };
  }

  @Get("lots")
  @Permission("inventory.read")
  async lots(@Req() req: AuthRequest, @Query() raw: Record<string, unknown>) {
    const query = z.object({
      locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
      variantId: z.string().min(1).max(128).optional(),
    }).strict().safeParse(raw);
    if (!query.success) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid lot query.", query.error.issues);
    }
    return { ok: true, data: await this.inventory.lots(req, query.data.locationId, query.data.variantId) };
  }

  @Get("expiry")
  @Permission("inventory.read")
  async expiry(@Req() req: AuthRequest, @Query("locationId") locationId?: string) {
    if (locationId !== undefined && (typeof locationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(locationId))) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid stock location.");
    }
    return { ok: true, data: await this.inventory.expiry(req, locationId) };
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
    AllocationService,
    ClaimCoverageService,
    StockDepletionService,
  ],
  exports: [AllocationService, ClaimCoverageService, StockDepletionService],
})
export class InventoryModule {}
