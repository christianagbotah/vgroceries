import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AdminOrderFilters } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { AdminOrderQueryService } from "./admin-order-query.service";

@ApiTags("admin-orders")
@ApiCookieAuth()
@Controller("admin/orders")
@UseGuards(AccessGuard)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrderQueryService) {}

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get()
  @ApiOperation({ summary: "List administrator order rows" })
  async list(@Req() req: AuthRequest, @Query() query: AdminOrderFilters) {
    this.requireAdmin(req);
    return { ok: true, data: await this.orders.list(query) };
  }

  @Get(":orderId")
  @ApiOperation({ summary: "Read administrator order detail" })
  async detail(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    this.requireAdmin(req);
    return { ok: true, data: await this.orders.detail(orderId) };
  }
}
