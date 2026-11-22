import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { createProductDraftRequestSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CatalogAdminService } from "./catalog-admin.service";
import { z } from "zod";

@Controller("admin/catalog/products")
@UseGuards(AccessGuard)
export class CatalogAdminController {
  constructor(private readonly catalogAdmin: CatalogAdminService) {}

  @Post()
  @Permission("catalog.product.create")
  async createDraft(@Req() req: AuthRequest, @Body() body: unknown) {
    const parsed = createProductDraftRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid product draft.");
    return {
      ok: true,
      data: await this.catalogAdmin.createDraft(req.actor.id, req.requestId, parsed.data),
    };
  }
}

const updatePriceSchema = z.object({
  variantId: z.string().uuid(),
  priceMinor: z.number().int().positive().max(1000000000),
  reason: z.string().trim().min(3).max(500),
}).strict();

@Controller("admin/variants")
@UseGuards(AccessGuard)
export class CatalogVariantPriceController {
  constructor(private readonly catalogAdmin: CatalogAdminService) {}

  @Post("update")
  async update(@Req() req: AuthRequest, @Body() body: unknown) {
    if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Only administrators may change prices.");
    const parsed = updatePriceSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "A valid variant, positive price and change reason are required.");
    await this.catalogAdmin.updateVariantPrice(req.actor.id, req.requestId, parsed.data);
    return { ok: true, data: { success: true } };
  }
}
