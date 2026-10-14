import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { createProductDraftRequestSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CatalogAdminService } from "./catalog-admin.service";

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
