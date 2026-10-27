import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CatalogAdminService } from "./catalog-admin.service";

@ApiTags("admin-catalogue")
@ApiCookieAuth()
@Controller("admin")
@UseGuards(AccessGuard)
export class CatalogAdminReadController {
  constructor(private readonly catalog: CatalogAdminService) {}
  private requireReader(req: AuthRequest) {
    if (!new Set(["admin", "inventory_manager"]).has(req.actor.role))
      throw new ApiProblem(403, "FORBIDDEN", "Catalogue access required.");
  }

  @Get("products")
  @ApiOperation({ summary: "List administrator catalogue products" })
  async products(@Req() req: AuthRequest, @Query("q") q = "") {
    this.requireReader(req);
    return { ok: true, data: await this.catalog.listProducts(q) };
  }

  @Get("products/:productId")
  @ApiOperation({ summary: "Read administrator catalogue product" })
  async product(@Req() req: AuthRequest, @Param("productId") productId: string) {
    this.requireReader(req);
    return { ok: true, data: await this.catalog.productDetail(productId) };
  }

  @Get("categories")
  @ApiOperation({ summary: "List administrator catalogue categories" })
  async categories(@Req() req: AuthRequest) {
    this.requireReader(req);
    return { ok: true, data: await this.catalog.categories() };
  }
}
